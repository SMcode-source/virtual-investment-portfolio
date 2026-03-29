/**
 * ============================================================================
 * CLOUDSYNC.JS — Bidirectional Cloud Data Synchronization
 * ============================================================================
 *
 * PURPOSE:
 *   Keeps portfolio data in sync between the browser (localStorage) and the
 *   cloud (Cloudflare KV). Users don't need an account to READ data (public
 *   portfolio view), but need to authenticate (password hash) to WRITE.
 *   Replaces firebaseSync.js — uses Cloudflare Pages Functions instead.
 *
 * HOW IT WORKS:
 *   - PUBLIC reads (init, pull): No auth needed. Anyone can view a portfolio.
 *   - AUTHENTICATED writes (push): Bearer token = SHA-256(password)
 *   - Two-tier sync strategy:
 *       1. User data (trades, settings): Synced immediately on every change
 *       2. Price cache: Synced periodically (every 5 minutes) to avoid overhead
 *   - Per-ticker history: Each ticker's OHLCV bars synced separately
 *
 * API ENDPOINTS:
 *   GET  /api/data                    — Fetch all user/cache data (public)
 *   POST /api/data                    — Push all data (authenticated)
 *   POST /api/data/{key}              — Push single key (authenticated)
 *   GET  /api/history/{ticker}        — Get history for ticker (public)
 *   POST /api/history/{ticker}        — Push history for ticker (authenticated)
 *   GET  /api/credentials             — Check if custom creds are set (public)
 *   POST /api/credentials             — Update creds (authenticated)
 *   POST /api/credentials/verify      — Verify creds (public)
 *
 * ============================================================================
 */

const CloudSync = {
  _syncing: false,
  _listeners: [],
  _syncStatus: 'offline', // offline | syncing | synced | error
  _autoSyncInterval: null,
  _syncToken: null, // password hash, set on login

  // ── Data to sync ──────────────────────────────────────────────────────────

  /**
   * User data keys: synced immediately on every write (because they're small).
   * Use Config.SYNC.USER_KEYS for the source of truth.
   * @private
   */
  get SYNC_KEYS() {
    return Config.SYNC.USER_KEYS;
  },

  /**
   * Cache data keys: synced only during periodic auto-sync and manual push/pull.
   * Use Config.SYNC.CACHE_KEYS for the source of truth.
   * @private
   */
  get CACHE_KEYS() {
    return Config.SYNC.CACHE_KEYS;
  },

  /**
   * Benchmark tickers whose price history is synced per-ticker.
   * Includes default benchmarks (from Config) plus any custom indexes.
   * @private
   */
  get HISTORY_TICKERS() {
    const custom = (Storage.getSettings().customIndexes || []).map(c => c.ticker);
    return [...Config.BENCHMARKS.DEFAULT_TICKERS, ...custom];
  },

  /**
   * All keys that can be synced (user + cache).
   * @private
   */
  get ALL_KEYS() { return [...this.SYNC_KEYS, ...this.CACHE_KEYS]; },

  // ── Status & Listeners ────────────────────────────────────────────────────

  /**
   * Subscribe to sync status changes (offline/syncing/synced/error).
   * @param {Function} fn - Callback(status) called when status changes
   */
  onStatusChange(fn) { this._listeners.push(fn); },

  /**
   * Notify all listeners of the current sync status.
   * @private
   */
  _notify() { this._listeners.forEach(fn => fn(this._syncStatus)); },

  /**
   * Update the sync status and notify listeners.
   * @private
   * @param {string} s - New status: 'offline' | 'syncing' | 'synced' | 'error'
   */
  setStatus(s) {
    if (this._syncStatus !== s) {
      this._syncStatus = s;
      this._notify();
    }
  },

  // ── Authentication Token Management ───────────────────────────────────────
  // The sync token is the SHA-256 hash of the user's password.
  // It's set during login and cleared on logout.
  // Must match the SYNC_SECRET env var in Cloudflare Pages.

  /**
   * Set the authentication token (password hash) for cloud writes.
   * Stored in sessionStorage so it persists while the browser is open.
   * @param {string} passwordHash - SHA-256 hash of the user's password
   */
  setSyncToken(passwordHash) {
    this._syncToken = passwordHash;
    sessionStorage.setItem(Config.APP.SYNC_TOKEN_KEY, passwordHash);
  },

  /**
   * Clear the authentication token (called on logout).
   */
  clearSyncToken() {
    this._syncToken = null;
    sessionStorage.removeItem(Config.APP.SYNC_TOKEN_KEY);
  },

  /**
   * Get the authentication token if set, or null if logged out.
   * Checks sessionStorage first, then in-memory cache.
   * @returns {string|null} The password hash, or null
   */
  getSyncToken() {
    if (!this._syncToken) {
      this._syncToken = sessionStorage.getItem(Config.APP.SYNC_TOKEN_KEY) || null;
    }
    return this._syncToken;
  },

  /**
   * Check if the user is authenticated (has a valid sync token).
   * @returns {boolean} True if logged in
   */
  isAuthenticated() {
    return !!this.getSyncToken();
  },

  // ── API Helpers ──────────────────────────────────────────────────────────

  /**
   * Make a public GET request to a cloud endpoint (no auth needed).
   * @private
   * @param {string} path - The endpoint path (e.g., '/api/data')
   * @returns {Promise<Object>} The parsed JSON response
   * @throws {Error} If the request fails
   */
  async _get(path) {
    const resp = await fetch(path);
    if (!resp.ok) throw new Error(`GET ${path} failed: HTTP ${resp.status}`);
    return resp.json();
  },

  /**
   * Make an authenticated POST request (sends sync token as bearer token).
   * @private
   * @param {string} path - The endpoint path
   * @param {Object} data - The JSON payload to send
   * @returns {Promise<Object>} The parsed JSON response
   * @throws {Error} If not authenticated or request fails
   */
  async _post(path, data) {
    const token = this.getSyncToken();
    if (!token) throw new Error('Not authenticated for sync');
    const resp = await fetch(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(data)
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || `POST ${path} failed: HTTP ${resp.status}`);
    }
    return resp.json();
  },

  // ── Initialization (run once at app startup) ──────────────────────────────

  /**
   * Initialize cloud sync: pull all data from Cloudflare KV into localStorage.
   * This is PUBLIC — no authentication needed.
   * Called once at app startup before any pages render.
   * Sets up the auto-push timer if successful.
   */
  async init() {
    this.setStatus('syncing');

    try {
      await this._pullAll();
      this._startAutoPush();
      this.setStatus('synced');
      console.log('[CloudSync] Initial pull complete');
    } catch (e) {
      console.error('[CloudSync] Init failed:', e.message);
      this.setStatus('error');
    }
  },

  // ── Bulk sync operations ─────────────────────────────────────────────────

  /**
   * Pull all keys from Cloudflare KV into localStorage.
   * Refreshes timestamps on price caches so cloud data is immediately usable.
   * If cloud is empty but user is authenticated, push local data up instead.
   * @private
   */
  async _pullAll() {
    const now = Date.now();

    try {
      const data = await this._get('/api/data');
      let anyData = false;

      for (const key of this.ALL_KEYS) {
        if (data[key] !== undefined && data[key] !== null) {
          anyData = true;
          let val = data[key];

          // Refresh timestamps on price caches so cloud data is usable
          // until Yahoo refresh updates it
          if ((key === 'priceCache' || key === 'priceStore') && val && typeof val === 'object') {
            for (const ticker of Object.keys(val)) {
              if (val[ticker] && val[ticker].ts) val[ticker].ts = now;
            }
          }

          localStorage.setItem(Config.APP.STORAGE_PREFIX + key, JSON.stringify(val));
          console.log(`[CloudSync] Pulled ${key} from cloud`);
        }
      }

      if (!anyData && this.isAuthenticated()) {
        console.log('[CloudSync] Cloud empty & authenticated — pushing local data up');
        await this._pushAll();
        return;
      }

      // Pull per-ticker history
      await this._pullHistory();

    } catch (e) {
      console.warn('[CloudSync] Pull failed:', e.message);
      throw e;
    }
  },

  /**
   * Push all local data to Cloudflare KV (requires authentication).
   * Sends all user and cache keys in one batch request, then pushes per-ticker history.
   * @private
   */
  async _pushAll() {
    if (!this.isAuthenticated()) {
      console.warn('[CloudSync] Must be logged in to push data');
      return;
    }

    const data = {};
    for (const key of this.ALL_KEYS) {
      const raw = localStorage.getItem(Config.APP.STORAGE_PREFIX + key);
      if (raw) {
        try { data[key] = JSON.parse(raw); } catch { /* skip corrupt data */ }
      }
    }

    await this._post('/api/data', data);
    await this._pushHistory();
    console.log('[CloudSync] Pushed all local data to cloud');
  },

  // --- Per-ticker history sync ---
  async _pullHistory() {
    for (const ticker of this.HISTORY_TICKERS) {
      try {
        const entry = await this._get(`/api/history/${encodeURIComponent(ticker)}`);
        if (entry && entry.data) {
          const json = JSON.stringify({ data: entry.data, ts: Date.now() });
          try {
            localStorage.setItem(Storage._histStoreKey(ticker), json);
            localStorage.setItem(Storage._histCacheKey(ticker), json);
          } catch (e) {
            if (e.name === 'QuotaExceededError') {
              Storage._clearHistoryCaches();
              try {
                localStorage.setItem(Storage._histStoreKey(ticker), json);
                localStorage.setItem(Storage._histCacheKey(ticker), json);
              } catch {}
            }
          }
          console.log(`[CloudSync] Restored ${entry.data.length} bars for ${ticker} from cloud`);
        }
      } catch (e) {
        console.warn(`[CloudSync] Failed to pull history for ${ticker}:`, e.message);
      }
    }
  },

  async _pushHistory() {
    if (!this.isAuthenticated()) return;

    for (const ticker of this.HISTORY_TICKERS) {
      const raw = localStorage.getItem(Storage._histStoreKey(ticker));
      if (raw) {
        try {
          const entry = JSON.parse(raw);
          await this._post(`/api/history/${encodeURIComponent(ticker)}`, entry);
        } catch (e) {
          console.warn(`[CloudSync] Failed to push history for ${ticker}:`, e.message);
        }
      }
    }
    console.log('[CloudSync] Pushed per-ticker history to cloud');
  },

  // ── Single-key sync (called immediately after any user data write) ───────

  /**
   * Sync a single key to cloud (called by Storage.set).
   * Skips cache keys (synced only during periodic auto-sync).
   * Does nothing if not authenticated.
   * @param {string} key - The key to sync (e.g., 'trades', 'settings')
   */
  async syncKey(key) {
    if (this.CACHE_KEYS.includes(key)) return;
    if (!this.isAuthenticated()) return;

    const raw = localStorage.getItem(Config.APP.STORAGE_PREFIX + key);
    if (!raw) return;

    this._syncing = true;
    this.setStatus('syncing');

    try {
      const data = JSON.parse(raw);
      await this._post(`/api/data/${key}`, data);
      this.setStatus('synced');
    } catch (e) {
      console.error(`[CloudSync] Failed to sync ${key}:`, e.message);
      this.setStatus('error');
    } finally {
      this._syncing = false;
    }
  },

  // ── Manual sync operations (user-triggered) ───────────────────────────────

  /**
   * Manually push all local data to cloud (requires authentication).
   * Useful for the "Force Sync" button in settings.
   * @returns {boolean} True if successful, false otherwise
   */
  async forcePush() {
    if (!this.isAuthenticated()) {
      console.warn('[CloudSync] Must be logged in to push');
      return false;
    }
    this.setStatus('syncing');
    try {
      await this._pushAll();
      this.setStatus('synced');
      return true;
    } catch (e) {
      console.error('[CloudSync] Force push failed:', e.message);
      this.setStatus('error');
      return false;
    }
  },

  /**
   * Manually pull all cloud data (overwrites local).
   * Does not require authentication (public data).
   * Useful for the "Sync from Cloud" button.
   * @returns {boolean} True if successful, false otherwise
   */
  async forcePull() {
    this.setStatus('syncing');
    try {
      await this._pullAll();
      this.setStatus('synced');
      return true;
    } catch (e) {
      console.error('[CloudSync] Force pull failed:', e.message);
      this.setStatus('error');
      return false;
    }
  },

  // ── Auto-push timer (runs every 5 minutes for authenticated users) ────────

  /**
   * Start the auto-push timer. Pushes all data every Config.SYNC.AUTO_PUSH_INTERVAL_MS
   * if the user is authenticated.
   * @private
   */
  _startAutoPush() {
    this._stopAutoPush();
    this._autoSyncInterval = setInterval(async () => {
      if (this.isAuthenticated()) {
        console.log('[CloudSync] Auto-push triggered');
        try {
          await this._pushAll();
          this.setStatus('synced');
        } catch (e) {
          console.error('[CloudSync] Auto-push failed:', e.message);
        }
      }
    }, Config.SYNC.AUTO_PUSH_INTERVAL_MS);
  },

  /**
   * Stop the auto-push timer.
   * @private
   */
  _stopAutoPush() {
    if (this._autoSyncInterval) {
      clearInterval(this._autoSyncInterval);
      this._autoSyncInterval = null;
    }
  },

  // ── Logout cleanup ────────────────────────────────────────────────────────

  /**
   * Called when user logs out. Stops auto-push and clears the sync token.
   */
  signOut() {
    this._stopAutoPush();
    this.clearSyncToken();
    this.setStatus('offline');
  },

  // ── Status badge (UI helper) ──────────────────────────────────────────────

  /**
   * Generate an HTML status badge showing the current sync state.
   * Used in the header to show "Cloud Synced", "Syncing...", etc.
   * @returns {string} HTML string with styled badge
   */
  getStatusBadge() {
    return Utils.statusBadge(this._syncStatus,
      { offline: '#8b90a0', syncing: '#d97706', synced: '#16a34a', error: '#dc2626' },
      { offline: 'Local Only', syncing: 'Syncing...', synced: 'Cloud Synced', error: 'Sync Error' },
      'sync-status');
  }
};

// Global alias so existing code referencing FirebaseSync still works
window.CloudSync = CloudSync;
window.FirebaseSync = CloudSync;
