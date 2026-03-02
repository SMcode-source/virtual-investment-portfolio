// firebaseConfig.js — Firebase initialization
// Replace the placeholder values below with your Firebase project config.
// Get these from: Firebase Console → Project Settings → General → Your apps → Web app

const firebaseConfig = {
  apiKey: "AIzaSyAQrhbTdhbulyS9QMd7KMdo3kIDiIeumys",
  authDomain: "virtual-portfolio-9334a.firebaseapp.com",
  databaseURL: "https://virtual-portfolio-9334a-default-rtdb.firebaseio.com",
  projectId: "virtual-portfolio-9334a",
  storageBucket: "virtual-portfolio-9334a.firebasestorage.app",
  messagingSenderId: "487818560659",
  appId: "1:487818560659:web:e7dfbe5462b2e81ec13966",
  measurementId: "G-Z4KPB2KH8M"
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
