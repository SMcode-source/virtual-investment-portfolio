// storage.js — localStorage wrapper for portfolio data
const Storage = {
  _key(name) { return `vip_${name}`; },

  get(name, fallback = null) {
    try {
      const raw = localStorage.getItem(this._key(name));
      return raw ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
  },

  set(name, value) {
    localStorage.setItem(this._key(name), JSON.stringify(value));
  },

  remove(name) {
    localStorage.removeItem(this._key(name));
  },

  // --- Portfolio Settings ---
  getSettings() {
    return this.get('settings', {
      portfolioName: 'My Investment Portfolio',
      startingCash: 100000,
      baseCurrency: 'USD',
      public: {
        showHoldings: true,
        showTradeHistory: true,
        showBenchmarks: true,
        showExactValue: false,
        showThinkPieces: true,
        showSharpe: true
      }
    });
  },
  saveSettings(s) { this.set('settings', s); },

  // --- Trades ---
  getTrades() { return this.get('trades', []); },
  saveTrades(t) { this.set('trades', t); },
  addTrade(trade) {
    const trades = this.getTrades();
    trade.id = trade.id || Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    trades.push(trade);
    this.saveTrades(trades);
    return trade;
  },

  // --- Journal ---
  getJournalEntries() { return this.get('journal', []); },
  saveJournalEntries(j) { this.set('journal', j); },
  addJournalEntry(entry) {
    const entries = this.getJournalEntries();
    entry.id = entry.id || Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    entries.push(entry);
    this.saveJournalEntries(entries);
    return entry;
  },
  updateJournalEntry(id, updates) {
    const entries = this.getJournalEntries();
    const idx = entries.findIndex(e => e.id === id);
    if (idx >= 0) { Object.assign(entries[idx], updates); this.saveJournalEntries(entries); }
  },

  // --- Think Pieces ---
  getThinkPieces() { return this.get('thinkPieces', []); },
  saveThinkPieces(t) { this.set('thinkPieces', t); },
  addThinkPiece(piece) {
    const pieces = this.getThinkPieces();
    piece.id = piece.id || Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    pieces.push(piece);
    this.saveThinkPieces(pieces);
    return piece;
  },
  updateThinkPiece(id, updates) {
    const pieces = this.getThinkPieces();
    const idx = pieces.findIndex(p => p.id === id);
    if (idx >= 0) { Object.assign(pieces[idx], updates); this.saveThinkPieces(pieces); }
  },

  // --- Watchlist ---
  getWatchlist() { return this.get('watchlist', []); },
  saveWatchlist(w) { this.set('watchlist', w); },

  // --- Snapshots ---
  getSnapshots() { return this.get('snapshots', []); },
  saveSnapshots(s) { this.set('snapshots', s); },
  addSnapshot(snap) {
    const snaps = this.getSnapshots();
    snap.id = snap.id || Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    snaps.push(snap);
    this.saveSnapshots(snaps);
    return snap;
  },

  // --- Price Cache ---
  getCachedPrice(ticker) {
    const cache = this.get('priceCache', {});
    const entry = cache[ticker];
    if (!entry) return null;
    if (Date.now() - entry.ts > 5 * 60 * 1000) return null; // 5min TTL
    return entry.data;
  },
  setCachedPrice(ticker, data) {
    const cache = this.get('priceCache', {});
    cache[ticker] = { data, ts: Date.now() };
    this.set('priceCache', cache);
  },

  // --- Historical Price Cache (for charts) ---
  getCachedHistory(ticker, period) {
    const cache = this.get('historyCache', {});
    const key = `${ticker}_${period}`;
    const entry = cache[key];
    if (!entry) return null;
    if (Date.now() - entry.ts > 30 * 60 * 1000) return null; // 30min TTL
    return entry.data;
  },
  setCachedHistory(ticker, period, data) {
    const cache = this.get('historyCache', {});
    cache[`${ticker}_${period}`] = { data, ts: Date.now() };
    this.set('historyCache', cache);
  },

  // --- Computed: Current Holdings ---
  computeHoldings(asOfDate = null) {
    const trades = this.getTrades();
    const settings = this.getSettings();
    const holdings = {};
    let cash = settings.startingCash;

    const sorted = [...trades].sort((a, b) => new Date(a.date) - new Date(b.date));
    for (const t of sorted) {
      if (asOfDate && new Date(t.date) > new Date(asOfDate)) break;
      const ticker = t.ticker;
      if (!holdings[ticker]) {
        holdings[ticker] = { ticker, name: t.name || ticker, sector: t.sector || '', country: t.country || '', shares: 0, totalCost: 0 };
      }
      const value = t.shares * t.price + (t.commission || 0);
      if (t.type === 'BUY') {
        holdings[ticker].totalCost += t.shares * t.price;
        holdings[ticker].shares += t.shares;
        cash -= value;
      } else {
        const avgCost = holdings[ticker].shares > 0 ? holdings[ticker].totalCost / holdings[ticker].shares : 0;
        holdings[ticker].totalCost -= avgCost * t.shares;
        holdings[ticker].shares -= t.shares;
        cash += t.shares * t.price - (t.commission || 0);
      }
      if (holdings[ticker].shares <= 0) {
        delete holdings[ticker];
      }
    }

    // Calculate avg cost basis
    for (const h of Object.values(holdings)) {
      h.avgCost = h.shares > 0 ? h.totalCost / h.shares : 0;
    }

    return { holdings: Object.values(holdings), cash };
  },

  // Compute cash balance after each trade
  computeCashAfterTrade(tradeIndex) {
    const trades = this.getTrades();
    const settings = this.getSettings();
    let cash = settings.startingCash;
    const sorted = [...trades].sort((a, b) => new Date(a.date) - new Date(b.date));
    for (let i = 0; i <= tradeIndex && i < sorted.length; i++) {
      const t = sorted[i];
      const value = t.shares * t.price + (t.commission || 0);
      if (t.type === 'BUY') cash -= value;
      else cash += t.shares * t.price - (t.commission || 0);
    }
    return cash;
  }
};

window.Storage = Storage;
