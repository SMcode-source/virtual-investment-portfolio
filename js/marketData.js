/**
 * ============================================================================
 * MARKETDATA.JS — Real-time Stock & Index Data via Yahoo Finance
 * ============================================================================
 *
 * PURPOSE:
 *   Fetches live quotes and historical price data from Yahoo Finance through
 *   a CORS proxy. Handles rate limiting, retries, and fallback to cached data
 *   when Yahoo is offline. Caches price data locally (15 min) and historically
 *   (1 hour) for instant page loads.
 *
 * ARCHITECTURE:
 *   1. CORS Proxy: Rotates between primary (Cloudflare) and fallback (allorigins)
 *   2. Rate limiter: Serialized queue, min 750ms between calls (per config)
 *   3. Retry logic: Up to 2 retries with exponential backoff (1s, 2s)
 *   4. Connection check: Polls every 30s when offline to detect reconnection
 *   5. Caching: Fresh (15 min) + Persistent (never expires) via Storage module
 *
 * KEY ENDPOINTS:
 *   /v8/finance/chart/{ticker}?period1={start}&period2={end}&interval=1d
 *     - Returns OHLCV bars and current quote metadata
 *   /v1/finance/search?q={query}&quotesCount=10
 *     - Search for tickers by symbol or company name
 *
 * ============================================================================
 */

const MarketData = {
  // CORS proxies tried in order, rotated on failure
  corsProxies: Config.YAHOO.PROXIES,
  corsProxy: Config.YAHOO.PROXIES[0],  // current active proxy
  _proxyIndex: 0,

  // Connection state
  status: 'disconnected', // disconnected | connecting | connected
  listeners: [],

  // Rate limiting
  _lastCallTime: 0,
  _queue: Promise.resolve(), // serialization queue for rate limiting
  _reconnectInterval: null,

  // ── Status & Listeners ────────────────────────────────────────────────────

  /**
   * Subscribe to connection status changes.
   * @param {Function} fn - Callback(status) called when status changes
   */
  onStatusChange(fn) { this.listeners.push(fn); },

  /**
   * Notify all listeners of the current status.
   * @private
   */
  _notify() { this.listeners.forEach(fn => fn(this.status)); },

  /**
   * Update the connection status and notify listeners.
   * Auto-starts reconnection polling when disconnected.
   * @param {string} s - New status: 'disconnected' | 'connecting' | 'connected'
   */
  setStatus(s) {
    if (this.status !== s) {
      this.status = s;
      this._notify();

      // When Yahoo disconnects, start reconnect polling
      if (s === 'disconnected') {
        this._startReconnectPolling();
      } else if (s === 'connected') {
        this._stopReconnectPolling();
      }
    }
  },

  // ── Reconnection Polling ──────────────────────────────────────────────────

  /**
   * Periodically try to reconnect to Yahoo when disconnected.
   * Checks every Config.YAHOO.RECONNECT_POLL_MS (30 seconds).
   * @private
   */
  _startReconnectPolling() {
    this._stopReconnectPolling();
    this._reconnectInterval = setInterval(async () => {
      if (this.status === 'connected') {
        this._stopReconnectPolling();
        return;
      }
      console.log('[MarketData] Attempting Yahoo Finance reconnection...');
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/SPY?range=${Config.YAHOO.QUOTE_RANGE}&interval=1d`;
        await this._yf(url);
        this.setStatus('connected');
        console.log('[MarketData] Yahoo Finance reconnected — resuming live data');
      } catch {
        // Still disconnected, will try again
      }
    }, Config.YAHOO.RECONNECT_POLL_MS);
  },

  /**
   * Stop the reconnection polling timer.
   * @private
   */
  _stopReconnectPolling() {
    if (this._reconnectInterval) {
      clearInterval(this._reconnectInterval);
      this._reconnectInterval = null;
    }
  },

  // ── CORS Proxy Management ─────────────────────────────────────────────────

  /**
   * Rotate to the next CORS proxy in the list.
   * Called on retry to try a different proxy if one fails.
   * @private
   */
  _rotateProxy() {
    this._proxyIndex = (this._proxyIndex + 1) % this.corsProxies.length;
    this.corsProxy = this.corsProxies[this._proxyIndex];
    console.log('[MarketData] Switched to CORS proxy:', this.corsProxy);
  },

  // ── Rate Limiting ─────────────────────────────────────────────────────────

  /**
   * Wait in a serialized queue to maintain min delay between API calls.
   * Enforces Config.YAHOO.RATE_LIMIT_MS (750ms) between calls.
   * Only one call executes at a time to prevent hammering proxies.
   * @private
   */
  async _rateWait() {
    // Chain onto the queue so only one call runs at a time
    const ticket = this._queue.then(async () => {
      const now = Date.now();
      const elapsed = now - this._lastCallTime;
      if (elapsed < Config.YAHOO.RATE_LIMIT_MS) {
        await new Promise(r => setTimeout(r, Config.YAHOO.RATE_LIMIT_MS - elapsed));
      }
      this._lastCallTime = Date.now();
    });
    this._queue = ticket.catch(() => {}); // keep queue alive even on errors
    return ticket;
  },

  // ── Single API Call (with timeout, no retries) ────────────────────────────

  /**
   * Make a single attempt to fetch from Yahoo via CORS proxy.
   * Enforces timeout and rate limiting. Does not retry.
   * @private
   * @param {string} url - The Yahoo Finance API URL
   * @returns {Promise<Object>} Parsed JSON response
   * @throws {Error} If request fails or times out
   */
  async _yfOnce(url) {
    await this._rateWait();
    const proxyUrl = this.corsProxy + encodeURIComponent(url);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), Config.YAHOO.REQUEST_TIMEOUT_MS);
    try {
      const resp = await fetch(proxyUrl, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const text = await resp.text();
      // Guard against CORS proxy returning non-JSON error pages
      try {
        const parsed = JSON.parse(text);
        // Handle allorigins /get endpoint which wraps response in {contents: "..."}
        if (parsed.contents && typeof parsed.contents === 'string') {
          try { return JSON.parse(parsed.contents); } catch { throw new Error('Invalid JSON in allorigins wrapper'); }
        }
        return parsed;
      } catch (e) {
        if (e.message.includes('allorigins')) throw e;
        throw new Error('Non-JSON response from proxy');
      }
    } catch (e) {
      clearTimeout(timeoutId);
      throw e;
    }
  },

  // ── Fetch with Retries & Proxy Rotation ───────────────────────────────────

  /**
   * Fetch from Yahoo with retries and proxy rotation.
   * Retries up to Config.YAHOO.MAX_RETRIES times on failure.
   * On retry, rotates to next CORS proxy and uses exponential backoff.
   * @private
   * @param {string} url - The Yahoo Finance API URL
   * @returns {Promise<Object>} Parsed JSON response
   * @throws {Error} If all attempts fail
   */
  async _yf(url) {
    let lastError;
    for (let attempt = 0; attempt <= Config.YAHOO.MAX_RETRIES; attempt++) {
      try {
        return await this._yfOnce(url);
      } catch (e) {
        lastError = e;
        const isLast = attempt === Config.YAHOO.MAX_RETRIES;
        console.warn(`[MarketData] Fetch attempt ${attempt + 1}/${Config.YAHOO.MAX_RETRIES + 1} failed: ${e.message}${isLast ? '' : ' — retrying...'}`);
        if (!isLast) {
          // On retry, try rotating to a different CORS proxy
          if (attempt > 0) this._rotateProxy();
          // Exponential backoff: 1s, 2s
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        }
      }
    }
    throw new Error(`Yahoo Finance failed after ${Config.YAHOO.MAX_RETRIES + 1} attempts: ${lastError?.message}`);
  },

  // ── Connection Check ──────────────────────────────────────────────────────

  /**
   * Test that Yahoo Finance is reachable (used during reconnection polling).
   * Sets status to 'connected' on success, 'disconnected' on failure.
   * @returns {Promise<boolean>} True if connected
   */
  async checkConnection() {
    this.setStatus('connecting');
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/SPY?range=${Config.YAHOO.QUOTE_RANGE}&interval=1d`;
      await this._yf(url);
      this.setStatus('connected');
      return true;
    } catch (e) {
      console.error('[MarketData] Connection check failed:', e.message);
      this.setStatus('disconnected');
      return false;
    }
  },

  // ── Symbol Search ─────────────────────────────────────────────────────────

  /**
   * Search for stock/ETF tickers by symbol or company name.
   * Results cached briefly (using priceCache mechanism).
   * @param {string} query - Ticker symbol or company name (e.g., 'Apple', 'MSFT')
   * @returns {Promise<Array>} List of {ticker, name, exchange, secType, currency}
   */
  async searchSymbol(query) {
    const cached = Storage.getCachedPrice(`search_${query}`);
    if (cached) return cached;

    try {
      const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=10&newsCount=0&enableFuzzyQuery=false`;
      const json = await this._yf(url);
      const results = (json.quotes || []).map(q => ({
        ticker: q.symbol,
        name: q.longname || q.shortname || q.symbol,
        exchange: q.exchange,
        secType: q.quoteType,
        currency: q.currency || 'USD'
      }));
      Storage.setCachedPrice(`search_${query}`, results);
      return results;
    } catch (e) {
      console.warn('[MarketData] Symbol search failed for', query, ':', e.message);
      return [];
    }
  },

  // ── Quote Parsing ────────────────────────────────────────────────────────

  /**
   * Extract quote data from a Yahoo chart API response.
   * Uses the last two actual trading day closes from the bars to compute % change,
   * so it shows a real % even on weekends/after hours when meta prices are equal.
   * @private
   * @param {string} ticker - The ticker symbol
   * @param {Object} res - Yahoo chart response: {meta, indicators}
   * @returns {Object} Quote object: {ticker, last, open, high, low, close, volume, change, timestamp}
   */
  _parseQuote(ticker, res) {
    const meta = res.meta;
    const q = res.indicators?.quote?.[0] || {};
    const closes = q.close || [];
    const last = meta.regularMarketPrice || 0;
    const prevClose = meta.previousClose || meta.chartPreviousClose || 0;

    let change = 0;
    const validCloses = closes.filter(c => c != null && c > 0);
    if (validCloses.length >= 2) {
      const lastClose = validCloses[validCloses.length - 1];
      const prevDayClose = validCloses[validCloses.length - 2];
      change = prevDayClose ? ((lastClose - prevDayClose) / prevDayClose * 100) : 0;
    } else if (prevClose && last) {
      change = ((last - prevClose) / prevClose * 100);
    }

    return {
      ticker: meta.symbol || ticker,
      last,
      open: q.open?.[0] || meta.regularMarketOpen || 0,
      high: q.high?.[0] || meta.regularMarketDayHigh || 0,
      low: q.low?.[0] || meta.regularMarketDayLow || 0,
      close: prevClose,
      volume: q.volume?.[0] || meta.regularMarketVolume || 0,
      change,
      timestamp: Date.now()
    };
  },

  // ── Live Quote Fetching ──────────────────────────────────────────────────

  /**
   * Get the current quote for a ticker (last price, % change, OHLCV).
   * Returns cached quote if fresh (within 15 min), otherwise fetches from Yahoo.
   * Falls back to last known price if Yahoo is offline.
   * @param {string} ticker - The ticker symbol
   * @returns {Promise<Object>} Quote object, or null if ticker not found
   */
  async getQuote(ticker) {
    const cached = Storage.getCachedPrice(ticker);
    if (cached) return cached;

    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${Config.YAHOO.QUOTE_RANGE}&interval=1d`;
      const json = await this._yf(url);
      const res = json.chart?.result?.[0];
      if (!res) {
        console.warn('[MarketData] No quote result for', ticker);
        return Storage.getLastKnownPrice(ticker);
      }

      const result = this._parseQuote(ticker, res);
      Storage.setCachedPrice(ticker, result);
      return result;
    } catch (e) {
      console.warn('[MarketData] Quote failed for', ticker, ':', e.message);
      return Storage.getLastKnownPrice(ticker);
    }
  },

  // ── Historical Data (all-time from IPO) ───────────────────────────────────
  // Single Yahoo API call per ticker returns BOTH full history AND current quote.
  // Shorter periods (1M, 3M, etc.) are sliced from the full dataset locally.

  /**
   * Fetch all-time price history for a ticker (cached for 1 hour).
   * Response includes current quote data in metadata (no separate quote call needed).
   * Caches both fresh and persistent versions.
   * skipCache=true forces fresh fetch without deleting old data first.
   * If fresh fetch fails, old cached data remains available.
   * @private
   * @param {string} ticker - The ticker symbol
   * @param {boolean} skipCache - Skip fresh cache check (but don't delete)
   * @returns {Promise<Array>} OHLCV bars [{date, open, high, low, close, volume}, ...]
   */
  async _fetchFullHistory(ticker, skipCache = false) {
    if (!skipCache) {
      const cached = Storage.getCachedHistory(ticker);
      if (cached) return cached;
    }

    try {
      // Fetch ALL available history (period1=0 = earliest available date)
      const now = Math.floor(Date.now() / 1000);
      const start = 0;
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${start}&period2=${now}&interval=1d`;
      const json = await this._yf(url);
      const res = json.chart?.result?.[0];
      if (!res) {
        console.warn('[MarketData] No history result for', ticker, '— using fallback');
        return Storage.getLastKnownHistory(ticker) || [];
      }

      // Extract current quote from response meta — but ONLY if valid.
      // All-time history responses sometimes have missing/zero regularMarketPrice,
      // which would overwrite good cached quotes (from KV) with broken data.
      if (res.meta) {
        const parsed = this._parseQuote(ticker, res);
        if (parsed.last > 0 && parsed.close > 0) {
          Storage.setCachedPrice(ticker, parsed);
        }
      }

      const timestamps = res.timestamp || [];
      const q = res.indicators?.quote?.[0] || {};
      const opens = q.open || [];
      const highs = q.high || [];
      const lows = q.low || [];
      const closes = q.close || [];
      const volumes = q.volume || [];

      const history = [];
      for (let i = 0; i < timestamps.length; i++) {
        if (closes[i] == null) continue;
        const d = new Date(timestamps[i] * 1000);
        history.push({
          date: d.toISOString().split('T')[0],
          open: opens[i] || 0,
          high: highs[i] || 0,
          low: lows[i] || 0,
          close: closes[i],
          volume: volumes[i] || 0
        });
      }

      if (history.length) {
        Storage.setCachedHistory(ticker, history);
        console.log(`[MarketData] Cached ${history.length} bars + quote for ${ticker} (${history[0].date} → ${history[history.length - 1].date})`);
      } else {
        console.warn('[MarketData] History fetch returned 0 valid bars for', ticker);
      }
      return history;
    } catch (e) {
      console.error('[MarketData] History fetch failed for', ticker, ':', e.message);
      return Storage.getLastKnownHistory(ticker) || [];
    }
  },

  // ── History Slicing ──────────────────────────────────────────────────────

  /**
   * Slice full history to a user-selected period (1M, 3M, 6M, YTD, 1Y, 2Y, 5Y, All).
   * @private
   * @param {Array} fullHistory - OHLCV bars from _fetchFullHistory
   * @param {string} period - The period string
   * @returns {Array} Filtered OHLCV bars for the period
   */
  _sliceByPeriod(fullHistory, period) {
    if (!fullHistory.length || period === 'All') return fullHistory;
    const cutoff = Utils.periodToStartDate(period);
    return fullHistory.filter(d => d.date >= cutoff);
  },

  /**
   * Slice full history by explicit date range (used for snapshots, analytics).
   * @private
   * @param {Array} fullHistory - OHLCV bars from _fetchFullHistory
   * @param {string} startDate - Start date (YYYY-MM-DD)
   * @param {string} endDate - End date (YYYY-MM-DD), or null for today
   * @returns {Array} Filtered OHLCV bars in the date range
   */
  _sliceByDateRange(fullHistory, startDate, endDate) {
    if (!fullHistory.length) return fullHistory;
    return fullHistory.filter(d => d.date >= startDate && d.date <= (endDate || '9999'));
  },

  // ── Public History API ────────────────────────────────────────────────────

  /**
   * Get historical price data for a ticker and period.
   * Fetches full all-time history and slices internally.
   * @param {string} ticker - The ticker symbol
   * @param {string} period - Period: '1M' | '3M' | '6M' | 'YTD' | '1Y' | '2Y' | '5Y' | 'All'
   * @returns {Promise<Array>} OHLCV bars for the period
   */
  async getHistory(ticker, period = '1Y') {
    const full = await this._fetchFullHistory(ticker);
    return this._sliceByPeriod(full, period);
  },

  /**
   * Get historical price data between two dates.
   * Fetches full all-time history and slices internally.
   * @param {string} ticker - The ticker symbol
   * @param {string} startDate - Start date (YYYY-MM-DD)
   * @param {string} endDate - End date (YYYY-MM-DD)
   * @returns {Promise<Array>} OHLCV bars in the date range
   */
  async getHistoryByDate(ticker, startDate, endDate) {
    const full = await this._fetchFullHistory(ticker);
    return this._sliceByDateRange(full, startDate, endDate);
  },

  // ── Series Alignment (for multi-ticker charts) ────────────────────────────

  /**
   * Align multiple price series to a common date axis (for comparing tickers on one chart).
   * Input: {ticker1: [{date, close, ...}], ticker2: [{date, close, ...}]}
   * Output: {labels: [dates], aligned: {ticker1: [closes], ticker2: [closes]}}
   * Missing dates get the previous known close (forward-fill strategy).
   * @param {Object} seriesMap - Keyed by identifier, valued as OHLCV arrays
   * @returns {Object} {labels: date array, aligned: {key: close array, ...}}
   */
  alignSeries(seriesMap) {
    // Build union of all dates, sorted
    const dateSet = new Set();
    for (const arr of Object.values(seriesMap)) {
      for (const d of arr) dateSet.add(d.date);
    }
    const labels = [...dateSet].sort();
    if (!labels.length) return { labels: [], aligned: {} };

    const aligned = {};
    for (const [key, arr] of Object.entries(seriesMap)) {
      // Build date→close lookup
      const lookup = {};
      for (const d of arr) lookup[d.date] = d.close;

      // Forward-fill: for each date in labels, use the close or last known
      const values = [];
      let lastVal = null;
      for (const date of labels) {
        if (lookup[date] != null) lastVal = lookup[date];
        values.push(lastVal);
      }
      aligned[key] = values;
    }

    return { labels, aligned };
  },

  // ── Benchmark Indexes ────────────────────────────────────────────────────

  /**
   * Benchmark ETF metadata from Config.BENCHMARKS.NAMES.
   * Maps display names to ticker symbols and other data.
   * @deprecated Use Config.BENCHMARKS.NAMES instead
   */
  get benchmarkETFs() {
    return Config.BENCHMARKS.NAMES;
  },

  /**
   * Get historical data for a named benchmark (e.g., 'S&P 500', 'NASDAQ 100').
   * @param {string} benchmarkName - Benchmark name (from Config.BENCHMARKS.NAMES)
   * @param {string} period - Period: '1M' | '3M' | ... | 'All'
   * @returns {Promise<Array>} OHLCV bars for the period
   */
  async getBenchmarkHistory(benchmarkName, period = '1Y') {
    const bm = Config.BENCHMARKS.NAMES[benchmarkName];
    if (!bm) return [];
    return this.getHistory(bm.ticker, period);
  },

  /**
   * Alias for getHistory (for backward compatibility).
   * @param {string} ticker - The ticker symbol
   * @param {string} period - Period string
   * @returns {Promise<Array>} OHLCV bars
   */
  getIndexHistory(ticker, period = '1Y') { return this.getHistory(ticker, period); },

  /**
   * Alias for getHistoryByDate (for backward compatibility).
   * @param {string} ticker - The ticker symbol
   * @param {string} startDate - Start date
   * @param {string} endDate - End date
   * @returns {Promise<Array>} OHLCV bars
   */
  getIndexHistoryByDate(ticker, startDate, endDate) { return this.getHistoryByDate(ticker, startDate, endDate); },

  /**
   * Get historical data for a named benchmark between two dates.
   * @param {string} benchmarkName - Benchmark name
   * @param {string} startDate - Start date (YYYY-MM-DD)
   * @param {string} endDate - End date (YYYY-MM-DD)
   * @returns {Promise<Array>} OHLCV bars
   */
  async getBenchmarkHistoryByDate(benchmarkName, startDate, endDate) {
    const bm = Config.BENCHMARKS.NAMES[benchmarkName];
    if (!bm) return [];
    return this.getHistoryByDate(bm.ticker, startDate, endDate);
  },

  // ── Batch Quotes ──────────────────────────────────────────────────────────

  /**
   * Fetch quotes for multiple tickers in parallel (respecting rate limiting).
   * Returns object keyed by ticker with {last, close, change} for each.
   * Falls back to last known prices if any ticker fails.
   * @param {Array<string>} tickers - Array of ticker symbols
   * @returns {Promise<Object>} {ticker: {last, close, change}, ...}
   */
  async getBatchQuotes(tickers) {
    if (!tickers.length) return {};

    const result = {};
    for (const t of tickers) {
      try {
        const q = await this.getQuote(t);
        if (q) {
          result[t] = { last: q.last, close: q.close, change: q.change };
        } else {
          result[t] = { last: 0, close: 0, change: 0 };
        }
      } catch (e) {
        console.warn('[MarketData] Batch quote failed for', t, ':', e.message);
        const fallback = Storage.getLastKnownPrice(t);
        result[t] = fallback ? { last: fallback.last, close: fallback.close, change: fallback.change } : { last: 0, close: 0, change: 0 };
      }
    }
    return result;
  },

  // ── Status Badge (UI helper) ──────────────────────────────────────────────

  /**
   * Generate an HTML status badge showing the current Yahoo Finance connection state.
   * Used in the header to show "Yahoo Finance", "Offline", etc.
   * @returns {string} HTML string with styled badge
   */
  getStatusBadge() {
    return Utils.statusBadge(this.status,
      { disconnected: '#ef4444', connecting: '#f59e0b', connected: '#22c55e' },
      { disconnected: 'Offline', connecting: 'Connecting...', connected: 'Yahoo Finance' },
      'market-status');
  }
};

window.MarketData = MarketData;
