// ibkr.js — Yahoo Finance direct integration (no bridge needed)
// Uses a CORS proxy to call Yahoo Finance from the browser
const IBKR = {
  corsProxy: 'https://corsproxy.io/?url=',
  status: 'disconnected', // disconnected | connecting | connected
  listeners: [],
  _lastCallTime: 0,
  _minDelay: 2500, // 2.5s between Yahoo API calls

  onStatusChange(fn) { this.listeners.push(fn); },
  _notify() { this.listeners.forEach(fn => fn(this.status)); },

  setStatus(s) {
    if (this.status !== s) {
      this.status = s;
      this._notify();
    }
  },

  // --- Rate limiter: wait between calls ---
  async _rateWait() {
    const now = Date.now();
    const elapsed = now - this._lastCallTime;
    if (elapsed < this._minDelay) {
      await new Promise(r => setTimeout(r, this._minDelay - elapsed));
    }
    this._lastCallTime = Date.now();
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
      console.error('[IBKR] Connection check failed:', e.message);
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
  async getQuote(tickerOrConid) {
    const cached = Storage.getCachedPrice(tickerOrConid);
    if (cached) return cached;

    try {
      // Resolve ticker from conid if needed
      let ticker = tickerOrConid;
      if (typeof tickerOrConid === 'number' || /^\d+$/.test(tickerOrConid)) {
        const bm = Object.values(this.benchmarkETFs).find(b => b.conid == tickerOrConid);
        ticker = bm ? bm.ticker : String(tickerOrConid);
      }

      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1d&interval=1d`;
      const json = await this._yf(url);
      const res = json.chart?.result?.[0];
      if (!res) return null;

      const meta = res.meta;
      const q = res.indicators?.quote?.[0] || {};

      const last = meta.regularMarketPrice || 0;
      const prevClose = meta.previousClose || meta.chartPreviousClose || 0;

      const result = {
        conid: tickerOrConid,
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

      Storage.setCachedPrice(tickerOrConid, result);
      return result;
    } catch {
      return null;
    }
  },

  // --- Historical Data ---
  async getHistory(tickerOrConid, period = '1Y', bar = '1d') {
    const cached = Storage.getCachedHistory(tickerOrConid, period);
    if (cached) return cached;

    try {
      // Resolve ticker
      let ticker = tickerOrConid;
      if (typeof tickerOrConid === 'number' || /^\d+$/.test(tickerOrConid)) {
        const bm = Object.values(this.benchmarkETFs).find(b => b.conid == tickerOrConid);
        ticker = bm ? bm.ticker : String(tickerOrConid);
      }

      // Map period to Yahoo Finance range
      const rangeMap = {
        '1M': '1mo', '3M': '3mo', '6M': '6mo',
        '1Y': '1y',  '2Y': '2y',  '5Y': '5y',
        'All': '10y', 'YTD': 'ytd'
      };
      // Map bar size to Yahoo interval
      const intervalMap = {
        '1d': '1d', '1w': '1wk', '1m': '1mo',
        '1h': '1h', '5m': '5m',  '15m': '15m'
      };

      const range = rangeMap[period] || '1y';
      const interval = intervalMap[bar] || '1d';

      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${range}&interval=${interval}`;
      const json = await this._yf(url);
      const res = json.chart?.result?.[0];
      if (!res) return [];

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
        Storage.setCachedHistory(tickerOrConid, period, history);
      }
      return history;
    } catch {
      return [];
    }
  },

  // --- Benchmark ETFs ---
  benchmarkETFs: {
    'S&P 500': { ticker: 'SPY', conid: 756733 },
    'NASDAQ 100': { ticker: 'QQQ', conid: 320227571 },
    'FTSE 100': { ticker: 'ISF.L', conid: 48231867 },
    'MSCI World': { ticker: 'URTH', conid: 133271094 }
  },

  async getBenchmarkHistory(benchmarkName, period = '1Y') {
    const bm = this.benchmarkETFs[benchmarkName];
    if (!bm) return [];
    return this.getHistory(bm.ticker, period);
  },

  // --- Batch Quotes ---
  async getBatchQuotes(tickersOrConids) {
    if (!tickersOrConids.length) return {};

    const result = {};
    for (const t of tickersOrConids) {
      try {
        const q = await this.getQuote(t);
        if (q) {
          result[t] = { last: q.last, close: q.close, change: q.change };
        } else {
          result[t] = { last: 0, close: 0, change: 0 };
        }
      } catch {
        result[t] = { last: 0, close: 0, change: 0 };
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
    return `<span class="ibkr-status" style="background:${colors[this.status]}20;color:${colors[this.status]};border:1px solid ${colors[this.status]}40">${labels[this.status]}</span>`;
  }
};

window.IBKR = IBKR;
