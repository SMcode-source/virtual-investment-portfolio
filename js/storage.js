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
    // Sync to Firebase if available
    if (typeof FirebaseSync !== 'undefined') {
      FirebaseSync.syncKey(name);
    }
  },

  remove(name) {
    localStorage.removeItem(this._key(name));
  },

  // --- Portfolio Settings ---
  getSettings() {
    return this.get('settings', {
      portfolioName: 'Investment Portfolio',
      startingCash: 100000,
      baseCurrency: 'USD',
      riskFreeRate: 4.0,
      public: {
        showHoldings: true,
        showTradeHistory: true,
        showBenchmarks: true,
        showExactValue: false,
        showThinkPieces: true,
        showSharpe: true
      },
      customIndexes: [] // [{ticker, name, color}] — max 3 user-chosen indexes
    });
  },
  saveSettings(s) { this.set('settings', s); },

  // --- Custom Indexes (up to 3 user-chosen series for charts) ---
  CUSTOM_INDEX_COLORS: ['#f97316', '#06b6d4', '#ec4899'],
  getCustomIndexes() {
    return this.getSettings().customIndexes || [];
  },
  addCustomIndex(ticker, name) {
    const settings = this.getSettings();
    const list = settings.customIndexes || [];
    if (list.length >= 3) return false;
    if (list.some(c => c.ticker === ticker)) return false;
    list.push({ ticker, name, color: this.CUSTOM_INDEX_COLORS[list.length] });
    settings.customIndexes = list;
    this.saveSettings(settings);
    return true;
  },
  removeCustomIndex(ticker) {
    const settings = this.getSettings();
    const list = settings.customIndexes || [];
    settings.customIndexes = list.filter(c => c.ticker !== ticker)
      .map((c, i) => ({ ...c, color: this.CUSTOM_INDEX_COLORS[i] })); // re-assign colors
    this.saveSettings(settings);
  },

  // --- Generic list helpers ---
  _uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); },
  _addItem(key, item) {
    const list = this.get(key, []);
    item.id = item.id || this._uid();
    list.push(item);
    this.set(key, list);
    return item;
  },
  _updateItem(key, id, updates) {
    const list = this.get(key, []);
    const idx = list.findIndex(e => e.id === id);
    if (idx >= 0) { Object.assign(list[idx], updates); this.set(key, list); }
  },

  // --- Trades ---
  getTrades() { return this.get('trades', []); },
  saveTrades(t) { this.set('trades', t); },
  addTrade(trade) { return this._addItem('trades', trade); },

  // --- Journal ---
  getJournalEntries() { return this.get('journal', []); },
  saveJournalEntries(j) { this.set('journal', j); },
  addJournalEntry(entry) { return this._addItem('journal', entry); },
  updateJournalEntry(id, updates) { this._updateItem('journal', id, updates); },

  // --- Think Pieces ---
  getThinkPieces() { return this.get('thinkPieces', []); },
  saveThinkPieces(t) { this.set('thinkPieces', t); },
  addThinkPiece(piece) { return this._addItem('thinkPieces', piece); },
  updateThinkPiece(id, updates) { this._updateItem('thinkPieces', id, updates); },

  // --- Watchlist ---
  getWatchlist() { return this.get('watchlist', []); },
  saveWatchlist(w) { this.set('watchlist', w); },

  // --- Snapshots ---
  getSnapshots() { return this.get('snapshots', []); },
  saveSnapshots(s) { this.set('snapshots', s); },
  addSnapshot(snap) { return this._addItem('snapshots', snap); },

  // --- Price Cache (15min fresh TTL, persistent fallback) ---
  getCachedPrice(ticker) {
    const cache = this.get('priceCache', {});
    const entry = cache[ticker];
    if (!entry) return null;
    if (Date.now() - entry.ts > 15 * 60 * 1000) return null; // 15min TTL
    return entry.data;
  },
  setCachedPrice(ticker, data) {
    const cache = this.get('priceCache', {});
    cache[ticker] = { data, ts: Date.now() };
    this.set('priceCache', cache);
    // Also save to persistent store (never expires, used as fallback)
    const persistent = this.get('priceStore', {});
    persistent[ticker] = { data, ts: Date.now() };
    this.set('priceStore', persistent);
  },
  // Fallback: get last known price even if cache expired
  getLastKnownPrice(ticker) {
    // Try fresh cache first
    const fresh = this.getCachedPrice(ticker);
    if (fresh) return fresh;
    // Fall back to persistent store
    const store = this.get('priceStore', {});
    return store[ticker]?.data || null;
  },

  // --- Historical Price Cache (1hr fresh TTL, persistent fallback) ---
  // Each ticker stored in its own localStorage key to avoid quota overflow.
  // Keys: vip_hc_{ticker} (fresh cache), vip_hs_{ticker} (persistent fallback)
  _hcKey(ticker) { return `vip_hc_${ticker}`; },
  _hsKey(ticker) { return `vip_hs_${ticker}`; },

  getCachedHistory(ticker) {
    try {
      const raw = localStorage.getItem(this._hcKey(ticker));
      if (!raw) return null;
      const entry = JSON.parse(raw);
      if (Date.now() - entry.ts > 60 * 60 * 1000) return null; // 1hr TTL
      return entry.data;
    } catch { return null; }
  },
  setCachedHistory(ticker, data) {
    const entry = JSON.stringify({ data, ts: Date.now() });
    try {
      localStorage.setItem(this._hcKey(ticker), entry);
    } catch (e) {
      // Quota exceeded — clear old history caches and retry once
      console.warn('[Storage] Quota exceeded caching', ticker, '— clearing old caches');
      this._clearHistoryCaches();
      try { localStorage.setItem(this._hcKey(ticker), entry); } catch {}
    }
    // Also save to persistent store (same data, separate key)
    try {
      localStorage.setItem(this._hsKey(ticker), entry);
    } catch (e) {
      // Persistent store is best-effort — don't block on quota
      console.warn('[Storage] Quota exceeded on persistent store for', ticker);
    }
  },
  // Fallback: get last known history even if cache expired
  getLastKnownHistory(ticker) {
    const fresh = this.getCachedHistory(ticker);
    if (fresh) return fresh;
    try {
      const raw = localStorage.getItem(this._hsKey(ticker));
      if (!raw) return null;
      return JSON.parse(raw).data;
    } catch { return null; }
  },
  // Clear all history caches to free space (called on quota overflow)
  _clearHistoryCaches() {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('vip_hc_') || key.startsWith('vip_hs_'))) {
        keys.push(key);
      }
    }
    keys.forEach(k => localStorage.removeItem(k));
    // Also clear legacy monolithic keys if they exist
    localStorage.removeItem('vip_historyCache');
    localStorage.removeItem('vip_historyStore');
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

};

window.Storage = Storage;
