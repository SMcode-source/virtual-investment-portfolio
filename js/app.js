// app.js — SPA Router & Main Application Controller
// Loading strategy:
//   1. Firebase init + public pull (no auth needed) → gets all portfolio data
//   2. Dismiss overlay, render page with cloud data, show "Cloud data loaded" toast
//   3. Background Yahoo refresh fetches live quotes & history (non-blocking)
//   4. When Yahoo finishes, show "Yahoo data updated" toast and re-render

const App = {
  currentPage: 'dashboard',
  pages: {},
  _renderedPages: new Set(),

  // Pages that require authentication (site login, not Firebase)
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

    // Run the sequential init
    this._initSequence();
  },

  async _initSequence() {
    const stepFirebase = document.getElementById('step-firebase');
    const stepSync = document.getElementById('step-sync');
    const bar = document.getElementById('loading-bar');
    const fill = document.getElementById('loading-bar-fill');
    const loadMsg = document.getElementById('loading-message');

    if (bar) bar.classList.add('active');

    // ---- Step 1: Firebase init ----
    if (stepFirebase) stepFirebase.classList.add('active');
    if (loadMsg) loadMsg.textContent = 'Connecting to cloud database...';
    let firebaseOk = false;
    if (typeof FirebaseApp !== 'undefined') {
      firebaseOk = FirebaseApp.init();
    }
    this._markStep(stepFirebase, firebaseOk);
    if (fill) fill.style.width = '50%';

    // ---- Step 2: Pull data from cloud (PUBLIC read, no auth) ----
    // Timeout after 10s so the page renders even if Firebase is slow
    if (stepSync) stepSync.classList.add('active');
    if (loadMsg) loadMsg.textContent = 'Loading portfolio data from cloud...';
    let syncOk = false;
    if (firebaseOk) {
      try {
        const syncPromise = FirebaseSync.init();
        const timeout = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Cloud sync timed out')), 10000)
        );
        await Promise.race([syncPromise, timeout]);
        syncOk = true;
      } catch (e) {
        console.error('[App] Firebase sync failed:', e.message);
      }
    }
    this._markStep(stepSync, syncOk);
    if (fill) fill.style.width = '100%';

    // ---- Step 3: Dismiss overlay, render page ----
    if (loadMsg) loadMsg.textContent = syncOk ? 'Portfolio loaded!' : 'Using local data';

    setTimeout(() => {
      this._dismissOverlay();
      if (bar) bar.classList.remove('active');
    }, 400);

    // Set up Firebase auth listener (for push capability)
    if (firebaseOk) {
      FirebaseSync.onStatusChange(() => this.updateSyncStatus());
      FirebaseSync.onAuthReady((user) => this.updateSyncStatus());
    }

    // Render the first page with cloud data
    this.route();
    this.updateSyncStatus();
    this.updateMarketStatus();

    // Show toast: cloud data loaded
    if (syncOk) {
      this._showToast('Cloud data loaded', 'synced');
    }

    // ---- Step 4: Background Yahoo Finance refresh ----
    this._setupYahooRefreshUI();
    MarketData.onStatusChange(() => this.updateMarketStatus());

    // Start background refresh (does NOT block page rendering)
    YahooRefresh.run();
  },

  // --- Persistent toast notifications (top-right, outside page content) ---
  _showToast(message, type = 'info') {
    let container = document.getElementById('app-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'app-toast-container';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => toast.classList.add('show'));

    // Auto-remove after 4s
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  },

  // --- Yahoo refresh progress UI (persistent banner above page content) ---
  _setupYahooRefreshUI() {
    // Banner element lives in index.html, outside #page-content,
    // so it survives page re-renders.
    const banner = document.getElementById('yahoo-refresh-banner');
    if (!banner) return;

    YahooRefresh.onProgress((p) => {
      if (!p.running && p.phase === 'Complete') {
        // Yahoo refresh done — hide banner, show toast, re-render
        banner.classList.remove('active');
        setTimeout(() => { banner.innerHTML = ''; }, 300);
        this.updateMarketStatus();
        this._showToast('Yahoo Finance data updated', 'yahoo');
        // Re-render current page with fresh data
        this.renderPage(this.currentPage);
        return;
      }

      if (!p.running && p.phase === 'Yahoo Finance offline') {
        banner.innerHTML = `<span class="yahoo-refresh-icon">⚠</span> Yahoo Finance offline — showing cached data`;
        banner.classList.add('active');
        banner.classList.add('offline');
        this._showToast('Yahoo Finance offline — using cached data', 'warning');
        setTimeout(() => { banner.classList.remove('active', 'offline'); }, 5000);
        this.updateMarketStatus();
        return;
      }

      if (p.running) {
        banner.classList.add('active');
        banner.classList.remove('offline');
        const pct = p.total > 0 ? Math.round((p.current / p.total) * 100) : 0;
        const tickerStr = p.ticker ? ` · <strong>${p.ticker}</strong>` : '';
        banner.innerHTML = `
          <span class="yahoo-refresh-icon">↻</span>
          <span class="yahoo-refresh-text">Refreshing from Yahoo Finance${tickerStr}</span>
          <span class="yahoo-refresh-pct">${pct}%</span>
          <div class="yahoo-refresh-bar"><div class="yahoo-refresh-bar-fill" style="width:${pct}%"></div></div>
        `;
      }
    });
  },

  route() {
    const hash = window.location.hash.slice(1) || 'dashboard';
    const [page, ...params] = hash.split('/');

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
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) logoutBtn.style.display = loggedIn ? 'flex' : 'none';

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

  _markStep(el, success) {
    if (!el) return;
    el.classList.remove('active');
    el.classList.add('done');
    el.querySelector('.loading-step-icon').textContent = success ? '✓' : '–';
  },

  _dismissOverlay() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.classList.add('hidden');
  },

  renderPage(page, params = []) {
    const content = document.getElementById('page-content');
    if (!content) return;

    const sidebar = document.querySelector('.sidebar');
    if (sidebar) sidebar.style.display = page === 'login' ? 'none' : '';
    const hamburger = document.getElementById('hamburger-btn');
    if (hamburger) hamburger.style.display = page === 'login' ? 'none' : '';
    const main = document.querySelector('.main-content');
    if (main) main.style.marginLeft = page === 'login' ? '0' : '';
    const banner = document.getElementById('yahoo-refresh-banner');
    if (banner) banner.style.display = page === 'login' ? 'none' : '';

    if (!this._renderedPages.size) {
      content.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
    }

    try {
      if (this.pages[page] && this.pages[page].render) {
        this.pages[page].render(content, params);
        this._renderedPages.add(page);
      }
    } catch (e) {
      content.innerHTML = `<div class="error-state"><h3>Error loading page</h3><p>${e.message}</p></div>`;
      console.error(e);
    }
  },

  logout() {
    Auth.logout();
    this._renderedPages.clear();
    window.location.hash = 'login';
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
