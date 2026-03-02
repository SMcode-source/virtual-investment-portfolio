// firebaseConfig.js — Firebase initialization
// Replace the placeholder values below with your Firebase project config.
// Get these from: Firebase Console → Project Settings → General → Your apps → Web app

const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  databaseURL: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

// Initialize Firebase (only if config is filled in)
const FirebaseApp = {
  ready: false,
  db: null,
  auth: null,

  init() {
    // Check if Firebase SDK loaded and config is filled in
    if (typeof firebase === 'undefined') {
      console.warn('[Firebase] SDK not loaded');
      return false;
    }
    if (!firebaseConfig.apiKey || !firebaseConfig.databaseURL) {
      console.warn('[Firebase] Config not set — running in local-only mode');
      return false;
    }

    try {
      firebase.initializeApp(firebaseConfig);
      this.db = firebase.database();
      this.auth = firebase.auth();
      this.ready = true;
      console.log('[Firebase] Initialized successfully');
      return true;
    } catch (e) {
      console.error('[Firebase] Init failed:', e.message);
      return false;
    }
  }
};

window.FirebaseApp = FirebaseApp;
