// marketData.js — Yahoo Finance direct integration (browser-side via CORS proxy)
const MarketData = {
  // Yahoo Finance proxy — same-origin Cloudflare Pages Function (primary),
  // public CORS proxy (fallback for local development)
  corsProxies: [
    '/api/yahoo?url=',                      // Same-origin Pages Function (no CORS needed)
    'https://api.allorigins.win/raw?url='   // Public fallback (local dev / GitHub Pages)
  ],
  corsProxy: '/api/yahoo?url=',  // current active proxy
  _proxyIndex: 0,
  status: 'disconnected', // disconnected | connecting | connected
  listeners: [],
  _lastCallTime: 0,
  _minDelay: 750, // 0.75s between Yahoo API calls
  _queue: Promise.resolve(), // serialization queue for rate limiting
  _reconnectInterval: null,
  _RECONNECT_CHECK_MS: 30 * 1000, // check every 30s for reconnection
  _MAX_RETRIES: 2, // retry failed requests up to 2 times

  onStatusChange(fn) { this.listeners.push(fn); },
  _notify() { this.listeners.forEach(fn => fn(this.status)); },

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

  // Periodically try to reconnect to Yahoo when disconnected
  _startReconnectPolling() {
    this._stopReconnectPolling();
    this._reconnectInterval = setInterval(async () => {
      if (this.status === 'connected') {
        this._stopReconnectPolling();
        return;
      }
      console.log('[MarketData] Attempting Yahoo Finance reconnection...');
      try {
        const url = 'https://query1.finance.yahoo.com/v8/finance/chart/SPY?range=1d&interval=1d';
        await this._yf(url);
        this.setStatus('connected');
        console.log('[MarketData] Yahoo Finance reconnected — resuming live data');
      } catch {
        // Still disconnected, will try again
      }
    }, this._RECONNECT_CHECK_MS);
  },

  _stopReconnectPolling() {
    if (this._reconnectInterval) {
      clearInterval(this._reconnectInterval);
      this._reconnectInterval = null;
    }
  },

  // Switch to next CORS proxy
  _rotateProxy() {
    this._proxyIndex = (this._proxyIndex + 1) % this.corsProxies.length;
    this.corsProxy = this.corsProxies[this._proxyIndex];
    console.log('[MarketData] Switched to CORS proxy:', this.corsProxy);
  },

  // --- Rate limiter: serialized queue to prevent concurrent CORS proxy hammering ---
  async _rateWait() {
    // Chain onto the queue so only one call runs at a time
    const ticket = this._queue.then(async () => {
      const now = Date.now();
      const elapsed = now - this._lastCallTime;
      if (elapsed < this._minDelay) {
        await new Promise(r => setTimeout(r, this._minDelay - elapsed));
      }
      this._lastCallTime = Date.now();
    });
    this._queue = ticket.catch(() => {}); // keep queue alive even on errors
    return ticket;
  },

  // --- Fetch via CORS proxy (single attempt) ---
  async _yfOnce(url) {
    await this._rateWait();
    const proxyUrl = this.corsProxy + encodeURIComponent(url);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout
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

  // --- Fetch via CORS proxy with retries and proxy rotation ---
  async _yf(url) {
    let lastError;
    for (let attempt = 0; attempt <= this._MAX_RETRIES; attempt++) {
      try {
        return await this._yfOnce(url);
      } catch (e) {
        lastError = e;
        const isLast = attempt === this._MAX_RETRIES;
        console.warn(`[MarketData] Fetch attempt ${attempt + 1}/${this._MAX_RETRIES + 1} failed: ${e.message}${isLast ? '' : ' — retrying...'}`);
        if (!isLast) {
          // On retry, try rotating to a different CORS proxy
          if (attempt > 0) this._rotateProxy();
          // Exponential backoff: 1s, 2s
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        }
      }
    }
    throw new Error(`Yahoo Finance failed after ${this._MAX_RETRIES + 1} attempts: ${lastError?.message}`);
  },

  // --- Connection check (just test that Yahoo Finance is reachable) ---
  async checkConnection() {
    this.setStatus('connecting');
    try {
      const url = 'https://query1.finance.yahoo.com/v8/finance/chart/SPY?range=1d&interval=1d';
      await this._yf(url);
      this.setStatus('connected');
      return true;
    } catch (e) {
      console.error('[MarketData] Connection check failed:', e.message);
      this.setStatus('disconnected');
      return false;
    }
  },

  // --- Symbol Search ---
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

  // Extract quote data from a Yahoo chart response's meta + indicators
  _parseQuote(ticker, res) {
    const meta = res.meta;
    const q = res.indicators?.quote?.[0] || {};
    const last = meta.regularMarketPrice || 0;
    const prevClose = meta.previousClose || meta.chartPreviousClose || 0;
    return {
      ticker: meta.symbol || ticker,
      last,
      open: q.open?.[0] || meta.regularMarketOpen || 0,
      high: q.high?.[0] || meta.regularMarketDayHigh || 0,
      low: q.low?.[0] || meta.regularMarketDayLow || 0,
      close: prevClose,
      volume: q.volume?.[0] || meta.regularMarketVolume || 0,
      change: prevClose ? ((last - prevClose) / prevClose * 100) : 0,
      timestamp: Date.now()
    };
  },

  // --- Live Quote ---
  async getQuote(ticker) {
    const cached = Storage.getCachedPrice(ticker);
    if (cached) return cached;

    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1d&interval=1d`;
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

  // --- Historical Data (fetch ALL-TIME once per ticker, slice by period) ---
  // This is the ONLY Yahoo API call per ticker. It returns the complete price
  // history from the ticker's IPO date AND current quote data (from the response
  // meta), so no separate quote fetch is needed.
  // All shorter periods (1M, 3M, 6M, YTD, 1Y, 2Y, 5Y) are sliced from this.

  // Fetch all-time history for a ticker (cached for 1hr). Also caches current quote.
  // Pass skipCache=true to force a fresh fetch WITHOUT deleting existing data first.
  // If the fresh fetch fails, the old cached data remains available.
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

      // Extract current quote from response meta (avoids separate quote API call)
      if (res.meta) {
        Storage.setCachedPrice(ticker, this._parseQuote(ticker, res));
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

  // Slice full history by a UI period (1M, 3M, 6M, YTD, 1Y, 2Y, 5Y, All)
  _sliceByPeriod(fullHistory, period) {
    if (!fullHistory.length || period === 'All') return fullHistory;
    const cutoff = Utils.periodToStartDate(period);
    return fullHistory.filter(d => d.date >= cutoff);
  },

  // Slice full history by explicit start/end date strings
  _sliceByDateRange(fullHistory, startDate, endDate) {
    if (!fullHistory.length) return fullHistory;
    return fullHistory.filter(d => d.date >= startDate && d.date <= (endDate || '9999'));
  },

  // Public API: get history for a ticker and period (fetches full 15yr, slices internally)
  async getHistory(ticker, period = '1Y') {
    const full = await this._fetchFullHistory(ticker);
    return this._sliceByPeriod(full, period);
  },

  // Public API: get history for a ticker between two dates
  async getHistoryByDate(ticker, startDate, endDate) {
    const full = await this._fetchFullHistory(ticker);
    return this._sliceByDateRange(full, startDate, endDate);
  },

  // Align multiple history arrays to a common date axis.
  // Input: object like { sp500: [{date,close,...}], ftse: [{date,close,...}] }
  // Returns: { labels: [dates], aligned: { sp500: [closes], ftse: [closes] } }
  // Missing dates for a series get the previous known close (forward-fill).
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

  // --- Benchmark ETFs ---
  benchmarkETFs: {
    'S&P 500': { ticker: 'SPY' },
    'NASDAQ 100': { ticker: 'QQQ' },
    'FTSE 100': { ticker: 'ISF.L' },
    'MSCI World': { ticker: 'URTH' }
  },

  async getBenchmarkHistory(benchmarkName, period = '1Y') {
    const bm = this.benchmarkETFs[benchmarkName];
    if (!bm) return [];
    return this.getHistory(bm.ticker, period);
  },

  // Aliases — all history fetches go through the same path
  getIndexHistory(ticker, period = '1Y') { return this.getHistory(ticker, period); },
  getIndexHistoryByDate(ticker, startDate, endDate) { return this.getHistoryByDate(ticker, startDate, endDate); },

  async getBenchmarkHistoryByDate(benchmarkName, startDate, endDate) {
    const bm = this.benchmarkETFs[benchmarkName];
    if (!bm) return [];
    return this.getHistoryByDate(bm.ticker, startDate, endDate);
  },

  // --- Batch Quotes ---
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

  // Status badge HTML
  getStatusBadge() {
    return Utils.statusBadge(this.status,
      { disconnected: '#ef4444', connecting: '#f59e0b', connected: '#22c55e' },
      { disconnected: 'Offline', connecting: 'Connecting...', connected: 'Yahoo Finance' },
      'market-status');
  }
};

window.MarketData = MarketData;
