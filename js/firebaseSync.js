// firebaseSync.js — Bidirectional sync between localStorage and Firebase Realtime Database
// All portfolio data is synced to Firebase so it persists across devices.
// Public visitors get read-only access. Authenticated users can write.

const FirebaseSync = {
  _syncing: false,
  _listeners: [],
  _syncStatus: 'offline', // offline | syncing | synced | error

  // Data keys that should be synced to Firebase
  SYNC_KEYS: [
    'trades', 'journal', 'thinkPieces', 'watchlist',
    'snapshots', 'settings', 'priceStore', 'historyStore',
    'priceCache', 'historyCache'
  ],

  onStatusChange(fn) { this._listeners.push(fn); },
  _notify() { this._listeners.forEach(fn => fn(this._syncStatus)); },

  setStatus(s) {
    if (this._syncStatus !== s) {
      this._syncStatus = s;
      this._notify();
    }
  },

  // --- Initialize: pull cloud data into localStorage, set up live listeners ---
  async init() {
    if (!FirebaseApp.ready) {
      console.log('[Sync] Firebase not ready — local-only mode');
      return;
    }

    this.setStatus('syncing');

    try {
      // Pull all cloud data into localStorage (cloud wins on first load)
      await this._pullAll();

      // Set up real-time listeners so other tabs/devices stay in sync
      this._listenForChanges();

      this.setStatus('synced');
      console.log('[Sync] Initial pull complete, live sync active');
    } catch (e) {
      console.error('[Sync] Init failed:', e.message);
      this.setStatus('error');
    }
  },

  // --- Pull all keys from Firebase into localStorage ---
  async _pullAll() {
    const db = FirebaseApp.db;
    if (!db) return;

    const snapshot = await db.ref('portfolio').once('value');
    const cloudData = snapshot.val();

    if (!cloudData) {
      // Cloud is empty — push local data up (first-time setup)
      console.log('[Sync] Cloud empty — pushing local data up');
      await this._pushAll();
      return;
    }

    // Merge: cloud data wins for each key that exists in cloud
    for (const key of this.SYNC_KEYS) {
      if (cloudData[key] !== undefined) {
        localStorage.setItem(`vip_${key}`, JSON.stringify(cloudData[key]));
      }
    }
  },

  // --- Push all local data to Firebase ---
  async _pushAll() {
    const db = FirebaseApp.db;
    if (!db) return;

    const data = {};
    for (const key of this.SYNC_KEYS) {
      const raw = localStorage.getItem(`vip_${key}`);
      if (raw) {
        try { data[key] = JSON.parse(raw); } catch { /* skip corrupt data */ }
      }
    }

    await db.ref('portfolio').set(data);
    console.log('[Sync] Pushed all local data to cloud');
  },

  // --- Listen for real-time changes from Firebase ---
  _listenForChanges() {
    const db = FirebaseApp.db;
    if (!db) return;

    for (const key of this.SYNC_KEYS) {
      db.ref(`portfolio/${key}`).on('value', (snapshot) => {
        if (this._syncing) return; // Ignore our own writes
        const val = snapshot.val();
        if (val !== null && val !== undefined) {
          localStorage.setItem(`vip_${key}`, JSON.stringify(val));
        }
      });
    }
  },

  // --- Write a single key to Firebase (called after localStorage writes) ---
  async syncKey(key) {
    if (!FirebaseApp.ready) return;
    const db = FirebaseApp.db;
    if (!db) return;

    // Only sync if user is authenticated (Firebase auth)
    const user = FirebaseApp.auth?.currentUser;
    if (!user) return;

    const raw = localStorage.getItem(`vip_${key}`);
    if (!raw) return;

    this._syncing = true;
    this.setStatus('syncing');

    try {
      const data = JSON.parse(raw);
      await db.ref(`portfolio/${key}`).set(data);
      this.setStatus('synced');
    } catch (e) {
      console.error(`[Sync] Failed to sync ${key}:`, e.message);
      this.setStatus('error');
    } finally {
      this._syncing = false;
    }
  },

  // --- Force push everything to cloud (manual sync) ---
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

  // --- Force pull from cloud (manual sync) ---
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

  // --- Firebase Auth: sign in with email/password ---
  async signIn(email, password) {
    if (!FirebaseApp.ready || !FirebaseApp.auth) return false;
    try {
      await FirebaseApp.auth.signInWithEmailAndPassword(email, password);
      console.log('[Sync] Firebase auth successful');
      // After signing in, push local data to cloud
      await this._pushAll();
      return true;
    } catch (e) {
      console.error('[Sync] Firebase auth failed:', e.message);
      return false;
    }
  },

  signOut() {
    if (FirebaseApp.auth) {
      FirebaseApp.auth.signOut();
    }
  },

  // --- Status badge for UI ---
  getStatusBadge() {
    const colors = {
      offline: '#6b7280',
      syncing: '#f59e0b',
      synced: '#22c55e',
      error: '#ef4444'
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
