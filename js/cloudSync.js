// cloudSync.js — Sync between localStorage and Cloudflare KV via Pages Functions
// Public visitors get read-only access (no auth needed to read).
// Authenticated users can write (push) data to cloud using their password hash as a bearer token.
// Replaces firebaseSync.js — no Firebase SDK needed.

const CloudSync = {
  _syncing: false,
  _listeners: [],
  _syncStatus: 'offline', // offline | syncing | synced | error
  _autoSyncInterval: null,
  _syncToken: null, // password hash, set on login
  AUTO_SYNC_MS: 5 * 60 * 1000, // 5 minutes

  // User data: synced immediately on every write
  SYNC_KEYS: [
    'trades', 'journal', 'thinkPieces', 'watchlist',
    'snapshots', 'settings'
  ],

  // Large cache data: synced only during periodic auto-sync and manual push/pull
  CACHE_KEYS: [
    'priceStore', 'priceCache'
  ],

  // Benchmark tickers whose history is synced per-ticker
  _DEFAULT_HISTORY_TICKERS: ['SPY', 'QQQ', 'ISF.L', 'URTH'],
  get HISTORY_TICKERS() {
    const custom = (Storage.getSettings().customIndexes || []).map(c => c.ticker);
    return [...this._DEFAULT_HISTORY_TICKERS, ...custom];
  },

  get ALL_KEYS() { return [...this.SYNC_KEYS, ...this.CACHE_KEYS]; },

  onStatusChange(fn) { this._listeners.push(fn); },
  _notify() { this._listeners.forEach(fn => fn(this._syncStatus)); },

  setStatus(s) {
    if (this._syncStatus !== s) {
      this._syncStatus = s;
      this._notify();
    }
  },

  // --- Auth token management ---
  // The sync token is the SHA-256 hash of the user's password.
  // It's set during login and cleared on logout.
  // Must match the SYNC_SECRET env var in Cloudflare Pages.
  setSyncToken(passwordHash) {
    this._syncToken = passwordHash;
    sessionStorage.setItem('vip_sync_token', passwordHash);
  },

  clearSyncToken() {
    this._syncToken = null;
    sessionStorage.removeItem('vip_sync_token');
  },

  getSyncToken() {
    if (!this._syncToken) {
      this._syncToken = sessionStorage.getItem('vip_sync_token') || null;
    }
    return this._syncToken;
  },

  isAuthenticated() {
    return !!this.getSyncToken();
  },

  // --- API helpers ---
  async _get(path) {
    const resp = await fetch(path);
    if (!resp.ok) throw new Error(`GET ${path} failed: HTTP ${resp.status}`);
    return resp.json();
  },

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

  // --- Initialize: pull cloud data ONCE (publicly readable, no auth needed) ---
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

  // --- Pull all keys from Cloudflare KV into localStorage ---
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

          localStorage.setItem(`vip_${key}`, JSON.stringify(val));
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

  // --- Push all local data to Cloudflare KV ---
  async _pushAll() {
    if (!this.isAuthenticated()) {
      console.warn('[CloudSync] Must be logged in to push data');
      return;
    }

    const data = {};
    for (const key of this.ALL_KEYS) {
      const raw = localStorage.getItem(`vip_${key}`);
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
            localStorage.setItem(Storage._hsKey(ticker), json);
            localStorage.setItem(Storage._hcKey(ticker), json);
          } catch (e) {
            if (e.name === 'QuotaExceededError') {
              Storage._clearHistoryCaches();
              try {
                localStorage.setItem(Storage._hsKey(ticker), json);
                localStorage.setItem(Storage._hcKey(ticker), json);
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
      const raw = localStorage.getItem(Storage._hsKey(ticker));
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

  // --- Write a single key to cloud (called by Storage.set) ---
  async syncKey(key) {
    if (this.CACHE_KEYS.includes(key)) return;
    if (!this.isAuthenticated()) return;

    const raw = localStorage.getItem(`vip_${key}`);
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

  // --- Force push/pull ---
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

  // --- Auto-push every 5 minutes ---
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
    }, this.AUTO_SYNC_MS);
  },

  _stopAutoPush() {
    if (this._autoSyncInterval) {
      clearInterval(this._autoSyncInterval);
      this._autoSyncInterval = null;
    }
  },

  signOut() {
    this._stopAutoPush();
    this.clearSyncToken();
    this.setStatus('offline');
  },

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
