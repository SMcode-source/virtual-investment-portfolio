// marketData.js — Yahoo Finance direct integration (browser-side via CORS proxy)
const MarketData = {
  corsProxy: 'https://corsproxy.io/?url=',
  status: 'disconnected', // disconnected | connecting | connected
  listeners: [],
  _lastCallTime: 0,
  _minDelay: 750, // 0.75s between Yahoo API calls
  _queue: Promise.resolve(), // serialization queue for rate limiting
  _disconnectTimer: null,
  _reconnectInterval: null,
  _DISCONNECT_FALLBACK_MS: 20 * 1000, // 20 seconds
  _RECONNECT_CHECK_MS: 30 * 1000, // check every 30s for reconnection

  onStatusChange(fn) { this.listeners.push(fn); },
  _notify() { this.listeners.forEach(fn => fn(this.status)); },

  setStatus(s) {
    if (this.status !== s) {
      this.status = s;
      this._notify();

      // When Yahoo disconnects, start a 20s timer to pull from Firebase + start reconnect polling
      if (s === 'disconnected') {
        this._startDisconnectFallback();
        this._startReconnectPolling();
      } else if (s === 'connected') {
        this._clearDisconnectFallback();
        this._stopReconnectPolling();
      }
    }
  },

  _startDisconnectFallback() {
    this._clearDisconnectFallback();
    this._disconnectTimer = setTimeout(async () => {
      console.log('[MarketData] Yahoo disconnected for 20s — pulling data from Firebase');
      if (typeof FirebaseSync !== 'undefined' && FirebaseApp.ready) {
        try {
          await FirebaseSync.forcePull();
          console.log('[MarketData] Firebase fallback pull complete');
        } catch (e) {
          console.error('[MarketData] Firebase fallback pull failed:', e.message);
        }
      }
    }, this._DISCONNECT_FALLBACK_MS);
  },

  _clearDisconnectFallback() {
    if (this._disconnectTimer) {
      clearTimeout(this._disconnectTimer);
      this._disconnectTimer = null;
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
        // Reconnected!
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

  // --- Fetch via CORS proxy ---
  async _yf(url) {
    await this._rateWait();
    const proxyUrl = this.corsProxy + encodeURIComponent(url);
    const resp = await fetch(proxyUrl);
    if (!resp.ok) throw new Error(`Yahoo Finance HTTP ${resp.status}`);
    return resp.json();
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

  startKeepAlive() {},
  stopKeepAlive() {},

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
    } catch {
      return [];
    }
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
        // API returned no result — use last known price as fallback
        return Storage.getLastKnownPrice(ticker);
      }

      const meta = res.meta;
      const q = res.indicators?.quote?.[0] || {};

      const last = meta.regularMarketPrice || 0;
      const prevClose = meta.previousClose || meta.chartPreviousClose || 0;

      const result = {
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

      Storage.setCachedPrice(ticker, result);
      return result;
    } catch {
      // API call failed — fall back to last known price
      return Storage.getLastKnownPrice(ticker);
    }
  },

  // --- Historical Data (fetch full 25yr once, slice by period) ---

  // Fetch full history for a ticker (cached for 1hr)
  async _fetchFullHistory(ticker) {
    const cached = Storage.getCachedHistory(ticker);
    if (cached) return cached;

    try {
      // Fetch 15 years of daily data using period1/period2 timestamps
      const now = Math.floor(Date.now() / 1000);
      const start = now - Math.floor(15 * 365.25 * 86400);
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${start}&period2=${now}&interval=1d`;
      const json = await this._yf(url);
      const res = json.chart?.result?.[0];
      if (!res) {
        return Storage.getLastKnownHistory(ticker) || [];
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
      }
      return history;
    } catch {
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

  // Public API: get history for a ticker and period (fetches full 25yr, slices internally)
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
      } catch {
        // Try persistent fallback
        const fallback = Storage.getLastKnownPrice(t);
        result[t] = fallback ? { last: fallback.last, close: fallback.close, change: fallback.change } : { last: 0, close: 0, change: 0 };
      }
    }
    return result;
  },

  // Status badge HTML
  getStatusBadge() {
    const colors = {
      disconnected: '#ef4444',
      connecting: '#f59e0b',
      connected: '#22c55e'
    };
    const labels = {
      disconnected: 'Offline',
      connecting: 'Connecting...',
      connected: 'Yahoo Finance'
    };
    return `<span class="market-status" style="background:${colors[this.status]}20;color:${colors[this.status]};border:1px solid ${colors[this.status]}40">${labels[this.status]}</span>`;
  }
};

window.MarketData = MarketData;
