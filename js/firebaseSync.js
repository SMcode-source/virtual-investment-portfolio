// firebaseSync.js — Bidirectional sync between localStorage and Firebase Realtime Database
// Public visitors get read-only access (no auth needed to read).
// Authenticated users can write (push) data to cloud.

const FirebaseSync = {
  _syncing: false,
  _listeners: [],
  _syncStatus: 'offline', // offline | syncing | synced | error
  _autoSyncInterval: null,
  AUTO_SYNC_MS: 5 * 60 * 1000, // 5 minutes

  // User data: synced immediately on every write
  SYNC_KEYS: [
    'trades', 'journal', 'thinkPieces', 'watchlist',
    'snapshots', 'settings'
  ],

  // Large cache data: synced only during periodic auto-sync and manual push/pull.
  CACHE_KEYS: [
    'priceStore', 'priceCache'
  ],

  // Benchmark tickers whose history is synced to Firebase per-ticker
  _DEFAULT_HISTORY_TICKERS: ['SPY', 'QQQ', 'ISF.L', 'URTH'],
  get HISTORY_TICKERS() {
    const custom = (Storage.getSettings().customIndexes || []).map(c => c.ticker);
    return [...this._DEFAULT_HISTORY_TICKERS, ...custom];
  },

  // All standard keys (used for full push/pull operations)
  get ALL_KEYS() { return [...this.SYNC_KEYS, ...this.CACHE_KEYS]; },

  // Firebase disallows . # $ / [ ] in keys — encode/decode for storage
  _UNSAFE_CHARS: [[/\./g, '%2E'], [/#/g, '%23'], [/\$/g, '%24'], [/\//g, '%2F'], [/\[/g, '%5B'], [/\]/g, '%5D']],
  _SAFE_CHARS:   [[/%2E/g, '.'], [/%23/g, '#'], [/%24/g, '$'], [/%2F/g, '/'], [/%5B/g, '['], [/%5D/g, ']']],

  _encodeKey(str) { return this._UNSAFE_CHARS.reduce((s, [re, rep]) => s.replace(re, rep), str); },
  _decodeKey(str) { return this._SAFE_CHARS.reduce((s, [re, rep]) => s.replace(re, rep), str); },

  _sanitizeKeys(obj) {
    if (obj === null || obj === undefined || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(v => this._sanitizeKeys(v));
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      out[this._encodeKey(k)] = this._sanitizeKeys(v);
    }
    return out;
  },

  _restoreKeys(obj) {
    if (obj === null || obj === undefined || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(v => this._restoreKeys(v));
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      out[this._decodeKey(k)] = this._restoreKeys(v);
    }
    return out;
  },

  onStatusChange(fn) { this._listeners.push(fn); },
  _notify() { this._listeners.forEach(fn => fn(this._syncStatus)); },

  setStatus(s) {
    if (this._syncStatus !== s) {
      this._syncStatus = s;
      this._notify();
    }
  },

  // --- Initialize: pull cloud data ONCE (publicly readable, no auth needed) ---
  // This is the only read from Firebase. No repeated pulls, no real-time listeners.
  // Yahoo refresh will fill in any missing recent data later.
  async init() {
    if (!FirebaseApp.ready) {
      console.log('[Sync] Firebase not ready — local-only mode');
      return;
    }

    this.setStatus('syncing');

    try {
      // Check if returning from a redirect sign-in (with 5s timeout)
      try {
        const redirectPromise = FirebaseApp.auth.getRedirectResult();
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 5000)
        );
        const redirectResult = await Promise.race([redirectPromise, timeoutPromise]);
        if (redirectResult?.user) {
          console.log('[Sync] Redirect sign-in completed:', redirectResult.user.email);
          await this._pushAll();
        }
      } catch (redirectErr) {
        if (redirectErr.message !== 'timeout') {
          console.warn('[Sync] Redirect result check:', redirectErr.code || '', redirectErr.message);
        }
      }

      // Pull all cloud data — this is a PUBLIC read, no auth needed
      // This is the ONLY Firebase read. No auto-sync pulls, no tab-focus pulls.
      await this._pullAll();

      // Start auto-push for authenticated users (push only, no pull)
      this._startAutoPush();

      this.setStatus('synced');
      console.log('[Sync] Initial pull complete');
    } catch (e) {
      console.error('[Sync] Init failed:', e.message);
      this.setStatus('error');
    }
  },

  // --- Pull all keys from Firebase into localStorage (PUBLIC — no auth needed) ---
  // Downloads each key individually to avoid downloading the massive history
  // subtree as part of a single giant read. History is fetched separately.
  async _pullAll() {
    const db = FirebaseApp.db;
    if (!db) return;

    const now = Date.now();
    let anyData = false;

    // Pull each key individually (small reads, fast)
    for (const key of this.ALL_KEYS) {
      try {
        const snapshot = await db.ref(`portfolio/${key}`).once('value');
        const val = snapshot.val();
        if (val !== null && val !== undefined) {
          anyData = true;
          let restored = this._restoreKeys(val);
          // Refresh timestamps on price caches so stale cloud data is still usable
          // until Yahoo refresh updates it with fresh prices
          if ((key === 'priceCache' || key === 'priceStore') && restored && typeof restored === 'object') {
            for (const ticker of Object.keys(restored)) {
              if (restored[ticker] && restored[ticker].ts) restored[ticker].ts = now;
            }
          }
          localStorage.setItem(`vip_${key}`, JSON.stringify(restored));
          console.log(`[Sync] Pulled ${key} from cloud`);
        }
      } catch (e) {
        console.warn(`[Sync] Failed to pull ${key}:`, e.message);
      }
    }

    if (!anyData) {
      // Cloud is empty — if user is signed in, push local data up (first-time setup)
      const user = FirebaseApp.auth?.currentUser;
      if (user) {
        console.log('[Sync] Cloud empty & signed in — pushing local data up');
        await this._pushAll();
      } else {
        console.log('[Sync] Cloud empty — waiting for sign-in to push');
      }
      return;
    }

    // Pull per-ticker history data from Firebase (each ticker is a separate read)
    await this._pullHistory();
  },

  // --- Push all local data to Firebase (REQUIRES AUTH) ---
  async _pushAll() {
    const db = FirebaseApp.db;
    if (!db) return;

    // Only push if user is authenticated
    const user = FirebaseApp.auth?.currentUser;
    if (!user) {
      console.warn('[Sync] Must be signed in to push data');
      return;
    }

    const data = {};
    for (const key of this.ALL_KEYS) {
      const raw = localStorage.getItem(`vip_${key}`);
      if (raw) {
        try { data[key] = this._sanitizeKeys(JSON.parse(raw)); } catch { /* skip corrupt data */ }
      }
    }

    // Use update (not set) to avoid wiping the history subtree
    await db.ref('portfolio').update(data);

    // Push per-ticker history data separately
    await this._pushHistory();

    console.log('[Sync] Pushed all local data to cloud');
  },

  // Push per-ticker history from localStorage to Firebase (REQUIRES AUTH)
  async _pushHistory() {
    const db = FirebaseApp.db;
    if (!db) return;

    const user = FirebaseApp.auth?.currentUser;
    if (!user) return;

    for (const ticker of this.HISTORY_TICKERS) {
      const safeTicker = this._sanitizeTicker(ticker);
      const raw = localStorage.getItem(Storage._hsKey(ticker));
      if (raw) {
        try {
          const entry = JSON.parse(raw);
          await db.ref(`portfolio/history/${safeTicker}`).set(entry);
        } catch (e) {
          console.warn(`[Sync] Failed to push history for ${ticker}:`, e.message);
        }
      }
    }
    console.log('[Sync] Pushed per-ticker history to cloud');
  },

  // Pull per-ticker history from Firebase into localStorage (PUBLIC)
  // Each ticker is a separate small read to avoid downloading all history at once.
  // Refreshes the timestamp to Date.now() so cloud data is treated as valid cache.
  // If the data is stale (missing recent dates), it still displays — Yahoo fills gaps later.
  _saveHistoryToLocal(ticker, entry) {
    const json = JSON.stringify({ data: entry.data, ts: Date.now() });
    localStorage.setItem(Storage._hsKey(ticker), json);
    localStorage.setItem(Storage._hcKey(ticker), json);
  },

  async _pullHistory() {
    const db = FirebaseApp.db;
    if (!db) return;

    for (const ticker of this.HISTORY_TICKERS) {
      const safeTicker = this._sanitizeTicker(ticker);
      try {
        const snapshot = await db.ref(`portfolio/history/${safeTicker}`).once('value');
        const entry = snapshot.val();
        if (entry && entry.data) {
          try {
            this._saveHistoryToLocal(ticker, entry);
          } catch (e) {
            if (e.name === 'QuotaExceededError') {
              Storage._clearHistoryCaches();
              try { this._saveHistoryToLocal(ticker, entry); } catch {}
            }
          }
          console.log(`[Sync] Restored ${entry.data.length} bars for ${ticker} from cloud`);
        }
      } catch (e) {
        console.warn(`[Sync] Failed to pull history for ${ticker}:`, e.message);
      }
    }
  },

  _sanitizeTicker(ticker) { return this._encodeKey(ticker); },

  // --- Write a single key to Firebase (REQUIRES AUTH) ---
  async syncKey(key) {
    if (!FirebaseApp.ready) return;
    if (this.CACHE_KEYS.includes(key)) return;

    const db = FirebaseApp.db;
    if (!db) return;

    // Only sync if user is authenticated
    const user = FirebaseApp.auth?.currentUser;
    if (!user) return;

    const raw = localStorage.getItem(`vip_${key}`);
    if (!raw) return;

    this._syncing = true;
    this.setStatus('syncing');

    try {
      const data = this._sanitizeKeys(JSON.parse(raw));
      await db.ref(`portfolio/${key}`).set(data);
      this.setStatus('synced');
    } catch (e) {
      console.error(`[Sync] Failed to sync ${key}:`, e.message);
      this.setStatus('error');
    } finally {
      this._syncing = false;
    }
  },

  // --- Force push everything to cloud (REQUIRES AUTH) ---
  async forcePush() {
    if (!FirebaseApp.ready) return false;
    const user = FirebaseApp.auth?.currentUser;
    if (!user) {
      console.warn('[Sync] Must be signed in to push data');
      return false;
    }

    this.setStatus('syncing');
    try {
      await this._pushAll();
      this.setStatus('synced');
      return true;
    } catch (e) {
      console.error('[Sync] Force push failed:', e.message);
      this.setStatus('error');
      return false;
    }
  },

  // --- Force pull from cloud (PUBLIC — no auth needed) ---
  async forcePull() {
    if (!FirebaseApp.ready) return false;
    this.setStatus('syncing');
    try {
      await this._pullAll();
      this.setStatus('synced');
      return true;
    } catch (e) {
      console.error('[Sync] Force pull failed:', e.message);
      this.setStatus('error');
      return false;
    }
  },

  // --- Firebase Auth: sign in with Google popup ---
  async signInWithGoogle() {
    if (!FirebaseApp.ready || !FirebaseApp.auth) return false;
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      let result;
      try {
        result = await FirebaseApp.auth.signInWithPopup(provider);
      } catch (popupErr) {
        if (popupErr.code === 'auth/popup-blocked' || popupErr.code === 'auth/cancelled-popup-request') {
          console.warn('[Sync] Popup blocked — falling back to redirect sign-in');
          await FirebaseApp.auth.signInWithRedirect(provider);
          return true;
        }
        throw popupErr;
      }
      console.log('[Sync] Google sign-in successful:', result.user.email);
      await this._pushAll();
      this.setStatus('synced');
      return true;
    } catch (e) {
      console.error('[Sync] Google sign-in failed:', e.code, e.message);
      throw new Error(`${e.code || 'unknown'}: ${e.message}`);
    }
  },

  isFirebaseAuthenticated() {
    return !!(FirebaseApp.auth?.currentUser);
  },

  onAuthReady(callback) {
    if (!FirebaseApp.ready || !FirebaseApp.auth) return;
    FirebaseApp.auth.onAuthStateChanged((user) => {
      if (user) {
        console.log('[Sync] Firebase user restored:', user.email);
        this._pushAll().catch(() => {});
      }
      if (callback) callback(user);
    });
  },

  // Auto-push local data to cloud every 5 minutes (PUSH ONLY, no pull).
  // The only Firebase read happens once in init(). All subsequent syncs are writes.
  _startAutoPush() {
    this._stopAutoPush();
    this._autoSyncInterval = setInterval(async () => {
      const user = FirebaseApp.auth?.currentUser;
      if (user) {
        console.log('[Sync] Auto-push triggered (5min interval)');
        try {
          await this._pushAll();
          this.setStatus('synced');
        } catch (e) {
          console.error('[Sync] Auto-push failed:', e.message);
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
    if (FirebaseApp.auth) {
      FirebaseApp.auth.signOut();
    }
    this.setStatus('offline');
  },

  getStatusBadge() {
    return Utils.statusBadge(this._syncStatus,
      { offline: '#8b90a0', syncing: '#d97706', synced: '#16a34a', error: '#dc2626' },
      { offline: 'Local Only', syncing: 'Syncing...', synced: 'Cloud Synced', error: 'Sync Error' },
      'sync-status');
  }
};

window.FirebaseSync = FirebaseSync;
