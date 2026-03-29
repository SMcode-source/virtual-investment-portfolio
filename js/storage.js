/**
 * ============================================================================
 * STORAGE.JS — Persistent Data Layer with Dual-Tier Caching Strategy
 * ============================================================================
 *
 * PURPOSE:
 *   Manages all application data that persists across page reloads. This module
 *   uses localStorage to store portfolio data (trades, journal, snapshots, etc.)
 *   and implements a smart two-tier cache for price data:
 *     - Fresh Tier: Fast cache with TTL (15 min for quotes, 1 hr for history)
 *     - Persistent Tier: Fallback cache with no expiry (always available as fallback)
 *
 * HOW IT WORKS:
 *   1. User data (trades, journal, settings) → Synced to cloud immediately via CloudSync
 *   2. Price data → Stored in two places:
 *        - Fresh: vip_priceCache (15 min) and per-ticker vip_hc_* (1 hr)
 *        - Persistent: vip_priceStore (never expires) and per-ticker vip_hs_*
 *      When fresh cache expires, the persistent fallback ensures old data is
 *      still available for charts while the app fetches fresh data from Yahoo.
 *   3. Large history caches stored per-ticker to avoid localStorage quota overflow
 *
 * KEY METHODS:
 *   - get(name, fallback) — Read value from localStorage, parse JSON
 *   - set(name, value) — Write value to localStorage, trigger cloud sync
 *   - getCachedPrice() / setCachedPrice() — Fresh price cache (15 min TTL)
 *   - getLastKnownPrice() — Fallback if cache expired
 *   - getCachedHistory() / setCachedHistory() — Fresh history (1 hr TTL)
 *   - getLastKnownHistory() — Fallback if cache expired
 *
 * ============================================================================
 */

const Storage = {
  /**
   * Builds the full localStorage key with the app prefix.
   * All keys stored by this module start with Config.APP.STORAGE_PREFIX.
   * @private
   * @param {string} name - The logical key name (without prefix)
   * @returns {string} The full key ready for localStorage
   */
  _key(name) { return Config.APP.STORAGE_PREFIX + name; },

  /**
   * Retrieve a value from localStorage and parse it as JSON.
   * @param {string} name - The logical key name
   * @param {*} fallback - Value to return if key doesn't exist or JSON parsing fails
   * @returns {*} The parsed value, or fallback if not found
   */
  get(name, fallback = null) {
    try {
      const raw = localStorage.getItem(this._key(name));
      return raw ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
  },

  /**
   * Store a value in localStorage as JSON, then trigger cloud sync if authenticated.
   * Cloud sync is asynchronous and non-blocking.
   * @param {string} name - The logical key name
   * @param {*} value - The value to store (will be JSON-stringified)
   */
  set(name, value) {
    localStorage.setItem(this._key(name), JSON.stringify(value));
    // Sync to cloud if available and authenticated
    if (typeof CloudSync !== 'undefined') {
      CloudSync.syncKey(name);
    }
  },

  /**
   * Remove a key from localStorage (does not sync to cloud).
   * @param {string} name - The logical key name
   */
  remove(name) {
    localStorage.removeItem(this._key(name));
  },

  // ── Portfolio Settings (synced to cloud) ────────────────────────────────

  /**
   * Retrieve portfolio settings with defaults.
   * Settings include portfolio name, starting cash, custom indexes, and public visibility flags.
   * @returns {Object} The settings object with all metadata
   */
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

  /**
   * Save portfolio settings. Automatically synced to cloud.
   * @param {Object} s - The settings object
   */
  saveSettings(s) { this.set('settings', s); },

  // ── Custom Indexes (up to 3 user-chosen series for charts) ───────────────

  CUSTOM_INDEX_COLORS: ['#f97316', '#06b6d4', '#ec4899'],

  /**
   * Get the list of custom indexes from settings.
   * @returns {Array} Array of {ticker, name, color} objects, max 3 items
   */
  getCustomIndexes() {
    return this.getSettings().customIndexes || [];
  },

  /**
   * Add a new custom index ticker (max 3 per portfolio).
   * @param {string} ticker - The ticker symbol (e.g., 'AAPL', 'BTC')
   * @param {string} name - Human-readable name
   * @returns {boolean} True if added, false if at limit or duplicate
   */
  addCustomIndex(ticker, name) {
    const settings = this.getSettings();
    const list = settings.customIndexes || [];
    if (list.length >= Config.BENCHMARKS.MAX_CUSTOM_INDEXES) return false;
    if (list.some(c => c.ticker === ticker)) return false;
    list.push({ ticker, name, color: this.CUSTOM_INDEX_COLORS[list.length] });
    settings.customIndexes = list;
    this.saveSettings(settings);
    return true;
  },

  /**
   * Remove a custom index and re-assign colors to remaining ones.
   * @param {string} ticker - The ticker to remove
   */
  removeCustomIndex(ticker) {
    const settings = this.getSettings();
    const list = settings.customIndexes || [];
    settings.customIndexes = list.filter(c => c.ticker !== ticker)
      .map((c, i) => ({ ...c, color: this.CUSTOM_INDEX_COLORS[i] })); // re-assign colors
    this.saveSettings(settings);
  },

  // ── Generic list helpers ─────────────────────────────────────────────────

  /**
   * Generate a unique ID using timestamp + random suffix.
   * @private
   * @returns {string} A unique identifier
   */
  _uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); },

  /**
   * Add an item to a list and save it. Automatically assigns a unique ID if needed.
   * @private
   * @param {string} key - The storage key (e.g., 'trades', 'journal')
   * @param {Object} item - The item to add
   * @returns {Object} The item with its ID assigned
   */
  _addItem(key, item) {
    const list = this.get(key, []);
    item.id = item.id || this._uid();
    list.push(item);
    this.set(key, list);
    return item;
  },

  /**
   * Update fields of an item in a list by ID and save the list.
   * @private
   * @param {string} key - The storage key
   * @param {string} id - The item's unique ID
   * @param {Object} updates - Fields to update
   */
  _updateItem(key, id, updates) {
    const list = this.get(key, []);
    const idx = list.findIndex(e => e.id === id);
    if (idx >= 0) { Object.assign(list[idx], updates); this.set(key, list); }
  },

  // ── Trades (buy/sell transactions) ───────────────────────────────────────

  /**
   * Get all trades, or an empty array if none.
   * @returns {Array} List of trade objects
   */
  getTrades() { return this.get('trades', []); },

  /**
   * Replace the entire trades list. Synced to cloud.
   * @param {Array} t - New trades list
   */
  saveTrades(t) { this.set('trades', t); },

  /**
   * Add a new trade. Assigns a unique ID and syncs to cloud.
   * @param {Object} trade - Trade object with {date, ticker, type, shares, price, ...}
   * @returns {Object} The trade with ID assigned
   */
  addTrade(trade) { return this._addItem('trades', trade); },

  // ── Journal entries ──────────────────────────────────────────────────────

  /**
   * Get all journal entries, or an empty array if none.
   * @returns {Array} List of journal entry objects
   */
  getJournalEntries() { return this.get('journal', []); },

  /**
   * Replace the entire journal entries list. Synced to cloud.
   * @param {Array} j - New journal entries list
   */
  saveJournalEntries(j) { this.set('journal', j); },

  /**
   * Add a new journal entry. Assigns a unique ID and syncs to cloud.
   * @param {Object} entry - Entry object with {date, title, content, ...}
   * @returns {Object} The entry with ID assigned
   */
  addJournalEntry(entry) { return this._addItem('journal', entry); },

  /**
   * Update specific fields of a journal entry by ID.
   * @param {string} id - The entry's unique ID
   * @param {Object} updates - Fields to update
   */
  updateJournalEntry(id, updates) { this._updateItem('journal', id, updates); },

  // ── Think Pieces (market observations and insights) ──────────────────────

  /**
   * Get all think pieces, or an empty array if none.
   * @returns {Array} List of think piece objects
   */
  getThinkPieces() { return this.get('thinkPieces', []); },

  /**
   * Replace the entire think pieces list. Synced to cloud.
   * @param {Array} t - New think pieces list
   */
  saveThinkPieces(t) { this.set('thinkPieces', t); },

  /**
   * Add a new think piece. Assigns a unique ID and syncs to cloud.
   * @param {Object} piece - Piece object with {date, title, content, ...}
   * @returns {Object} The piece with ID assigned
   */
  addThinkPiece(piece) { return this._addItem('thinkPieces', piece); },

  /**
   * Update specific fields of a think piece by ID.
   * @param {string} id - The piece's unique ID
   * @param {Object} updates - Fields to update
   */
  updateThinkPiece(id, updates) { this._updateItem('thinkPieces', id, updates); },

  // ── Watchlist ────────────────────────────────────────────────────────────

  /**
   * Get the watchlist of tickers (list of {ticker, name, ...}).
   * @returns {Array} Watchlist items
   */
  getWatchlist() { return this.get('watchlist', []); },

  /**
   * Replace the entire watchlist. Synced to cloud.
   * @param {Array} w - New watchlist
   */
  saveWatchlist(w) { this.set('watchlist', w); },

  // ── Snapshots (portfolio snapshots at a point in time) ────────────────────

  /**
   * Get all snapshots (time-stamped portfolio states).
   * @returns {Array} List of snapshot objects
   */
  getSnapshots() { return this.get('snapshots', []); },

  /**
   * Replace the entire snapshots list. Synced to cloud.
   * @param {Array} s - New snapshots list
   */
  saveSnapshots(s) { this.set('snapshots', s); },

  /**
   * Add a new snapshot. Assigns a unique ID and syncs to cloud.
   * @param {Object} snap - Snapshot object with {date, holdings, cash, ...}
   * @returns {Object} The snapshot with ID assigned
   */
  addSnapshot(snap) { return this._addItem('snapshots', snap); },

  // ── Price Cache (current quotes) ─────────────────────────────────────────
  // Fresh tier: 15-minute TTL. Persistent tier: no expiry.

  /**
   * Get a current quote if it's still fresh (within 15 minutes).
   * Returns null if the cache entry is missing or expired.
   * @param {string} ticker - The ticker symbol
   * @returns {Object|null} The quote object {last, close, change, ...} or null
   */
  getCachedPrice(ticker) {
    const cache = this.get('priceCache', {});
    const entry = cache[ticker];
    if (!entry) return null;
    if (Date.now() - entry.ts > Config.CACHE.PRICE_TTL_MS) return null;
    return entry.data;
  },

  /**
   * Store a quote in both fresh and persistent caches.
   * Fresh cache: TTL_PRICE_MS (15 min), persistent: no expiry.
   * @param {string} ticker - The ticker symbol
   * @param {Object} data - The quote object to cache
   */
  setCachedPrice(ticker, data) {
    const cache = this.get('priceCache', {});
    cache[ticker] = { data, ts: Date.now() };
    this.set('priceCache', cache);
    // Also save to persistent store (never expires, used as fallback)
    const persistent = this.get('priceStore', {});
    persistent[ticker] = { data, ts: Date.now() };
    this.set('priceStore', persistent);
  },

  /**
   * Get the last known price for a ticker, even if cache expired.
   * First tries fresh cache, then falls back to persistent store.
   * Useful for rendering when Yahoo Finance is offline.
   * @param {string} ticker - The ticker symbol
   * @returns {Object|null} The quote object, or null if never cached
   */
  getLastKnownPrice(ticker) {
    // Try fresh cache first
    const fresh = this.getCachedPrice(ticker);
    if (fresh) return fresh;
    // Fall back to persistent store
    const store = this.get('priceStore', {});
    return store[ticker]?.data || null;
  },

  // ── Historical Price Cache (daily OHLCV bars) ────────────────────────────
  // Fresh tier: 1-hour TTL. Persistent tier: no expiry.
  // Each ticker stored in its own localStorage key to avoid quota overflow.
  // Keys: CONFIG_PREFIX + "hc_{ticker}" (fresh), CONFIG_PREFIX + "hs_{ticker}" (persistent)

  /**
   * Build the fresh history cache key for a ticker.
   * @private
   * @param {string} ticker - The ticker symbol
   * @returns {string} The localStorage key for fresh history
   */
  _histCacheKey(ticker) { return Config.APP.STORAGE_PREFIX + `hc_${ticker}`; },

  /**
   * Build the persistent history store key for a ticker.
   * @private
   * @param {string} ticker - The ticker symbol
   * @returns {string} The localStorage key for persistent history
   */
  _histStoreKey(ticker) { return Config.APP.STORAGE_PREFIX + `hs_${ticker}`; },

  /**
   * Get historical price bars for a ticker if the cache is still fresh (within 1 hour).
   * Returns null if cache is missing or expired.
   * @param {string} ticker - The ticker symbol
   * @returns {Array|null} Array of OHLCV bars [{date, open, high, low, close, volume}, ...] or null
   */
  getCachedHistory(ticker) {
    try {
      const raw = localStorage.getItem(this._histCacheKey(ticker));
      if (!raw) return null;
      const entry = JSON.parse(raw);
      if (Date.now() - entry.ts > Config.CACHE.HISTORY_TTL_MS) return null;
      return entry.data;
    } catch { return null; }
  },

  /**
   * Store historical bars in both fresh and persistent caches.
   * If localStorage quota is exceeded, clears old history caches and retries.
   * @param {string} ticker - The ticker symbol
   * @param {Array} data - Array of OHLCV bar objects
   */
  setCachedHistory(ticker, data) {
    const entry = JSON.stringify({ data, ts: Date.now() });
    try {
      localStorage.setItem(this._histCacheKey(ticker), entry);
    } catch (e) {
      // Quota exceeded — clear old history caches and retry once
      console.warn('[Storage] Quota exceeded caching', ticker, '— clearing old caches');
      this._clearHistoryCaches();
      try { localStorage.setItem(this._histCacheKey(ticker), entry); } catch {}
    }
    // Also save to persistent store (same data, separate key)
    try {
      localStorage.setItem(this._histStoreKey(ticker), entry);
    } catch (e) {
      // Persistent store is best-effort — don't block on quota
      console.warn('[Storage] Quota exceeded on persistent store for', ticker);
    }
  },

  /**
   * Get the last known history for a ticker, even if cache expired.
   * First tries fresh cache, then falls back to persistent store.
   * Useful for rendering when Yahoo Finance is offline.
   * @param {string} ticker - The ticker symbol
   * @returns {Array|null} Array of OHLCV bars, or null if never cached
   */
  getLastKnownHistory(ticker) {
    const fresh = this.getCachedHistory(ticker);
    if (fresh) return fresh;
    try {
      const raw = localStorage.getItem(this._histStoreKey(ticker));
      if (!raw) return null;
      return JSON.parse(raw).data;
    } catch { return null; }
  },

  /**
   * Clear all history caches to free localStorage space.
   * Called when quota is exceeded during a cache write.
   * Also clears legacy monolithic keys if they exist.
   * @private
   */
  _clearHistoryCaches() {
    const keys = [];
    const prefix = Config.APP.STORAGE_PREFIX;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith(prefix + 'hc_') || key.startsWith(prefix + 'hs_'))) {
        keys.push(key);
      }
    }
    keys.forEach(k => localStorage.removeItem(k));
    // Also clear legacy monolithic keys if they exist
    localStorage.removeItem(prefix + 'historyCache');
    localStorage.removeItem(prefix + 'historyStore');
  },

  // ── Computed Properties ─────────────────────────────────────────────────

  /**
   * Compute the current (or historical) holdings by replaying all trades.
   * Trades are sorted by date and processed in order to build a true cost basis
   * for each position. Closed positions are removed from the result.
   * @param {string|Date} asOfDate - Optional date to stop replay at (for historical snapshots)
   * @returns {Object} {holdings: [{ticker, shares, totalCost, avgCost, ...}], cash}
   */
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
