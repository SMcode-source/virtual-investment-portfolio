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

  // Firebase disallows . # $ / [ ] in keys — encode them for storage, decode on read
  _sanitizeKeys(obj) {
    if (obj === null || obj === undefined || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(v => this._sanitizeKeys(v));
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      const safeKey = k.replace(/\./g, '%2E').replace(/#/g, '%23').replace(/\$/g, '%24').replace(/\//g, '%2F').replace(/\[/g, '%5B').replace(/\]/g, '%5D');
      out[safeKey] = this._sanitizeKeys(v);
    }
    return out;
  },

  _restoreKeys(obj) {
    if (obj === null || obj === undefined || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(v => this._restoreKeys(v));
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      const origKey = k.replace(/%2E/g, '.').replace(/%23/g, '#').replace(/%24/g, '$').replace(/%2F/g, '/').replace(/%5B/g, '[').replace(/%5D/g, ']');
      out[origKey] = this._restoreKeys(v);
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

  // --- Initialize: pull cloud data (publicly readable, no auth needed) ---
  async init() {
    if (!FirebaseApp.ready) {
      console.log('[Sync] Firebase not ready — local-only mode');
      return;
    }

    this.setStatus('syncing');

    try {
      // Check if returning from a redirect sign-in
      try {
        const redirectResult = await FirebaseApp.auth.getRedirectResult();
        if (redirectResult?.user) {
          console.log('[Sync] Redirect sign-in completed:', redirectResult.user.email);
          await this._pushAll();
        }
      } catch (redirectErr) {
        console.warn('[Sync] Redirect result check:', redirectErr.code, redirectErr.message);
      }

      // Pull all cloud data — this is a PUBLIC read, no auth needed
      await this._pullAll();

      // Set up real-time listeners (also public reads)
      this._listenForChanges();

      // Start auto-sync every 5 minutes
      this._startAutoSync();

      // Pull fresh data when user switches back to this browser tab
      this._listenForTabFocus();

      this.setStatus('synced');
      console.log('[Sync] Initial pull complete, live sync active');
    } catch (e) {
      console.error('[Sync] Init failed:', e.message);
      this.setStatus('error');
    }
  },

  // --- Pull all keys from Firebase into localStorage (PUBLIC — no auth needed) ---
  async _pullAll() {
    const db = FirebaseApp.db;
    if (!db) return;

    const snapshot = await db.ref('portfolio').once('value');
    const cloudData = snapshot.val();

    if (!cloudData) {
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

    // Merge: cloud data wins for each key that exists in cloud
    for (const key of this.ALL_KEYS) {
      if (cloudData[key] !== undefined) {
        localStorage.setItem(`vip_${key}`, JSON.stringify(this._restoreKeys(cloudData[key])));
      }
    }

    // Pull per-ticker history data from Firebase into localStorage
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
  async _pullHistory() {
    const db = FirebaseApp.db;
    if (!db) return;

    const snapshot = await db.ref('portfolio/history').once('value');
    const historyData = snapshot.val();
    if (!historyData) return;

    for (const ticker of this.HISTORY_TICKERS) {
      const safeTicker = this._sanitizeTicker(ticker);
      const entry = historyData[safeTicker];
      if (entry && entry.data) {
        try {
          const json = JSON.stringify(entry);
          localStorage.setItem(Storage._hsKey(ticker), json);
          localStorage.setItem(Storage._hcKey(ticker), json);
          console.log(`[Sync] Restored ${entry.data.length} bars for ${ticker} from cloud`);
        } catch (e) {
          console.warn(`[Sync] Quota exceeded restoring ${ticker} history — clearing caches`);
          Storage._clearHistoryCaches();
          try {
            const json = JSON.stringify(entry);
            localStorage.setItem(Storage._hsKey(ticker), json);
            localStorage.setItem(Storage._hcKey(ticker), json);
          } catch {}
        }
      }
    }
  },

  _sanitizeTicker(ticker) {
    return ticker.replace(/\./g, '%2E').replace(/#/g, '%23').replace(/\$/g, '%24').replace(/\//g, '%2F').replace(/\[/g, '%5B').replace(/\]/g, '%5D');
  },

  // --- Listen for real-time changes from Firebase (PUBLIC reads) ---
  _listenForChanges() {
    const db = FirebaseApp.db;
    if (!db) return;

    for (const key of this.ALL_KEYS) {
      db.ref(`portfolio/${key}`).on('value', (snapshot) => {
        if (this._syncing) return;
        const val = snapshot.val();
        if (val !== null && val !== undefined) {
          localStorage.setItem(`vip_${key}`, JSON.stringify(this._restoreKeys(val)));
        }
      });
    }

    for (const ticker of this.HISTORY_TICKERS) {
      const safeTicker = this._sanitizeTicker(ticker);
      db.ref(`portfolio/history/${safeTicker}`).on('value', (snapshot) => {
        if (this._syncing) return;
        const entry = snapshot.val();
        if (entry && entry.data) {
          try {
            const json = JSON.stringify(entry);
            localStorage.setItem(Storage._hsKey(ticker), json);
            localStorage.setItem(Storage._hcKey(ticker), json);
          } catch {}
        }
      });
    }
  },

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

  _listenForTabFocus() {
    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState === 'visible' && FirebaseApp.ready) {
        console.log('[Sync] Tab became visible — pulling latest from cloud');
        try {
          await this._pullAll();
          this.setStatus('synced');
        } catch (e) {
          console.error('[Sync] Tab focus pull failed:', e.message);
        }
      }
    });
  },

  _startAutoSync() {
    this._stopAutoSync();
    this._autoSyncInterval = setInterval(async () => {
      const user = FirebaseApp.auth?.currentUser;
      if (user) {
        console.log('[Sync] Auto-sync triggered (5min interval)');
        try {
          await this._pushAll();
          this.setStatus('synced');
        } catch (e) {
          console.error('[Sync] Auto-sync push failed:', e.message);
        }
      }
      // Always pull latest (public read)
      try {
        await this._pullAll();
      } catch (e) {
        console.error('[Sync] Auto-sync pull failed:', e.message);
      }
    }, this.AUTO_SYNC_MS);
  },

  _stopAutoSync() {
    if (this._autoSyncInterval) {
      clearInterval(this._autoSyncInterval);
      this._autoSyncInterval = null;
    }
  },

  signOut() {
    this._stopAutoSync();
    if (FirebaseApp.auth) {
      FirebaseApp.auth.signOut();
    }
    this.setStatus('offline');
  },

  getStatusBadge() {
    const colors = {
      offline: '#8b90a0',
      syncing: '#d97706',
      synced: '#16a34a',
      error: '#dc2626'
    };
    const labels = {
      offline: 'Local Only',
      syncing: 'Syncing...',
      synced: 'Cloud Synced',
      error: 'Sync Error'
    };
    const color = colors[this._syncStatus];
    return `<span class="sync-status" style="background:${color}20;color:${color};border:1px solid ${color}40;padding:2px 8px;border-radius:12px;font-size:0.75rem">${labels[this._syncStatus]}</span>`;
  }
};

window.FirebaseSync = FirebaseSync;
