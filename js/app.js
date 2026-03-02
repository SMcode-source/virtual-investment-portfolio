// app.js — SPA Router & Main Application Controller
const App = {
  currentPage: 'dashboard',
  pages: {},
  _loadingSteps: { firebase: false, sync: false, market: false },

  // Pages that require authentication
  PROTECTED: new Set(['logTrade', 'journal', 'thinkPieces', 'settings', 'snapshots', 'watchlist']),

  init() {
    // Register pages
    this.pages = {
      dashboard: Dashboard,
      logTrade: LogTrade,
      journal: Journal,
      tradeHistory: TradeHistory,
      analytics: Analytics,
      globalIndexes: GlobalIndexes,
      watchlist: Watchlist,
      thinkPieces: ThinkPieces,
      snapshots: Snapshots,
      publicView: PublicView,
      settings: Settings,
      login: Login
    };

    // Handle hash routing
    window.addEventListener('hashchange', () => this.route());

    // Initialize Firebase and cloud sync
    if (typeof FirebaseApp !== 'undefined') {
      const firebaseOk = FirebaseApp.init();
      this._completeLoadingStep('firebase', firebaseOk);

      FirebaseSync.init().then(() => {
        this._completeLoadingStep('sync', true);
      }).catch(() => {
        this._completeLoadingStep('sync', false);
      });

      FirebaseSync.onStatusChange(() => {
        this.updateSyncStatus();
        this._updateLoadingBar();
      });
      // Listen for auth state restoration (Google sign-in persists across sessions)
      FirebaseSync.onAuthReady((user) => {
        this.updateSyncStatus();
      });
    } else {
      this._completeLoadingStep('firebase', false);
      this._completeLoadingStep('sync', false);
    }

    // Market data connection status
    MarketData.onStatusChange(() => {
      this.updateMarketStatus();
      this._updateLoadingBar();
      if (MarketData.status === 'connected') {
        this._completeLoadingStep('market', true);
      }
    });
    MarketData.checkConnection().then(() => {
      this._completeLoadingStep('market', MarketData.status === 'connected');
    });

    // Show loading bar immediately
    const bar = document.getElementById('loading-bar');
    if (bar) bar.classList.add('active');

    // Safety net: dismiss overlay after 12 seconds max
    setTimeout(() => this._dismissOverlay(), 12000);

    // Initial route
    this.route();
  },

  route() {
    const hash = window.location.hash.slice(1) || 'dashboard';
    const [page, ...params] = hash.split('/');

    // Auth guard: redirect to login if trying to access protected page
    if (this.PROTECTED.has(page) && !Auth.isAuthenticated()) {
      Auth.setRedirect(page);
      window.location.hash = 'login';
      return;
    }

    if (this.pages[page]) {
      this.currentPage = page;
      this.updateNav();
      this.updateAuthUI();
      this.renderPage(page, params);
    }
  },

  navigate(page) {
    window.location.hash = page;
  },

  updateNav() {
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.page === this.currentPage);
    });
  },

  updateAuthUI() {
    const loggedIn = Auth.isAuthenticated();

    // Show/hide logout button
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) logoutBtn.style.display = loggedIn ? 'flex' : 'none';

    // Show/hide lock icons on protected nav items
    document.querySelectorAll('.nav-item').forEach(el => {
      const lock = el.querySelector('.nav-lock');
      if (lock) {
        lock.style.display = (loggedIn || !this.PROTECTED.has(el.dataset.page)) ? 'none' : 'inline';
      }
    });
  },

  updateMarketStatus() {
    const el = document.getElementById('market-status');
    if (el) el.innerHTML = MarketData.getStatusBadge();
  },

  updateSyncStatus() {
    const el = document.getElementById('sync-status');
    if (el && typeof FirebaseSync !== 'undefined') {
      el.innerHTML = FirebaseSync.getStatusBadge();
    }
  },

  // --- Loading bar & overlay ---
  _completeLoadingStep(step, success) {
    this._loadingSteps[step] = true;
    const el = document.getElementById(`step-${step}`);
    if (el) {
      el.classList.remove('active');
      el.classList.add('done');
      el.querySelector('.loading-step-icon').textContent = success ? '✓' : '–';
    }

    // Activate next pending step
    const order = ['firebase', 'sync', 'market'];
    for (const s of order) {
      if (!this._loadingSteps[s]) {
        const nextEl = document.getElementById(`step-${s}`);
        if (nextEl) nextEl.classList.add('active');
        break;
      }
    }

    // Update progress bar fill
    const done = Object.values(this._loadingSteps).filter(Boolean).length;
    const fill = document.getElementById('loading-bar-fill');
    if (fill) fill.style.width = `${(done / 3) * 100}%`;

    // All done? Dismiss overlay
    if (done === 3) {
      setTimeout(() => this._dismissOverlay(), 400);
    }
  },

  _dismissOverlay() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.classList.add('hidden');
    // Hide the loading bar after a moment
    setTimeout(() => {
      const bar = document.getElementById('loading-bar');
      if (bar) bar.classList.remove('active');
    }, 500);
  },

  _updateLoadingBar() {
    const bar = document.getElementById('loading-bar');
    if (!bar) return;

    const syncing = typeof FirebaseSync !== 'undefined' && FirebaseSync._syncStatus === 'syncing';
    const connecting = MarketData.status === 'connecting';

    if (syncing || connecting) {
      bar.classList.add('active');
      const fill = document.getElementById('loading-bar-fill');
      if (fill) {
        // Indeterminate animation: bounce between 30-90%
        fill.style.width = '70%';
      }
    } else {
      const fill = document.getElementById('loading-bar-fill');
      if (fill) fill.style.width = '100%';
      setTimeout(() => {
        if (bar) bar.classList.remove('active');
        if (fill) fill.style.width = '0%';
      }, 600);
    }
  },

  renderPage(page, params = []) {
    const content = document.getElementById('page-content');
    if (!content) return;

    // Hide sidebar and hamburger on login page for cleaner look
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) sidebar.style.display = page === 'login' ? 'none' : '';
    const hamburger = document.getElementById('hamburger-btn');
    if (hamburger) hamburger.style.display = page === 'login' ? 'none' : '';
    const main = document.querySelector('.main-content');
    if (main) main.style.marginLeft = page === 'login' ? '0' : '';

    content.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
    try {
      if (this.pages[page] && this.pages[page].render) {
        this.pages[page].render(content, params);
      }
    } catch (e) {
      content.innerHTML = `<div class="error-state"><h3>Error loading page</h3><p>${e.message}</p></div>`;
      console.error(e);
    }
  },

  logout() {
    Auth.logout();
    window.location.hash = 'login';
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
