// app.js — SPA Router & Main Application Controller
// New loading strategy:
//   1. Firebase init + public pull (no auth needed) → fast, gets all data
//   2. Render the current page immediately with cloud data
//   3. Background Yahoo refresh fetches live quotes & history (non-blocking)
//   4. Yahoo progress shown in persistent bar, unaffected by navigation

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

    // --- New loading sequence ---
    this._initSequence();
  },

  async _initSequence() {
    const overlay = document.getElementById('loading-overlay');
    const stepFirebase = document.getElementById('step-firebase');
    const stepSync = document.getElementById('step-sync');
    const stepMarket = document.getElementById('step-market');

    // Show loading bar
    const bar = document.getElementById('loading-bar');
    if (bar) bar.classList.add('active');
    const fill = document.getElementById('loading-bar-fill');

    // ---- Step 1: Firebase init ----
    if (stepFirebase) stepFirebase.classList.add('active');
    let firebaseOk = false;
    if (typeof FirebaseApp !== 'undefined') {
      firebaseOk = FirebaseApp.init();
    }
    this._markStep(stepFirebase, firebaseOk);
    if (fill) fill.style.width = '33%';

    // ---- Step 2: Pull data from cloud (PUBLIC read — no auth) ----
    if (stepSync) stepSync.classList.add('active');
    let syncOk = false;
    if (firebaseOk) {
      try {
        await FirebaseSync.init();
        syncOk = true;
      } catch (e) {
        console.error('[App] Firebase sync failed:', e.message);
      }
    }
    this._markStep(stepSync, syncOk);
    if (fill) fill.style.width = '66%';

    // ---- Step 3: Dismiss overlay and render page with cloud data ----
    // We now have all portfolio data from Firebase. Render immediately.
    if (fill) fill.style.width = '100%';

    // Update step-market to show Yahoo will refresh in background
    if (stepMarket) {
      stepMarket.classList.add('active');
      stepMarket.querySelector('.loading-step-icon').textContent = '→';
      stepMarket.classList.add('done');
    }

    // Dismiss overlay quickly now that we have data
    setTimeout(() => {
      this._dismissOverlay();
      if (bar) bar.classList.remove('active');
    }, 300);

    // Set up Firebase auth listener (for push capability)
    if (firebaseOk) {
      FirebaseSync.onStatusChange(() => this.updateSyncStatus());
      FirebaseSync.onAuthReady((user) => this.updateSyncStatus());
    }

    // Initial route — renders the first page
    this.route();

    // Update status badges
    this.updateSyncStatus();
    this.updateMarketStatus();

    // ---- Step 4: Background Yahoo Finance refresh ----
    // Set up the persistent Yahoo refresh indicator
    this._setupYahooRefreshUI();

    // Listen for market status changes
    MarketData.onStatusChange(() => this.updateMarketStatus());

    // Start the background refresh (non-blocking, doesn't affect page rendering)
    YahooRefresh.run();
  },

  // --- Yahoo refresh progress UI (persistent, outside page-content) ---
  _setupYahooRefreshUI() {
    // Create the persistent Yahoo refresh banner (sits above page content)
    let banner = document.getElementById('yahoo-refresh-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'yahoo-refresh-banner';
      banner.className = 'yahoo-refresh-banner';
      // Insert before page-content inside main
      const main = document.querySelector('.main-content');
      if (main) main.insertBefore(banner, main.firstChild);
    }

    // Subscribe to progress updates
    YahooRefresh.onProgress((p) => {
      if (!p.running && p.phase === 'Complete') {
        // Refresh done — hide banner and re-render current page with fresh data
        banner.classList.remove('active');
        setTimeout(() => { banner.innerHTML = ''; }, 300);
        this.updateMarketStatus();
        // Re-render the current page to reflect fresh Yahoo data
        this.renderPage(this.currentPage);
        return;
      }

      if (!p.running && p.phase === 'Yahoo Finance offline') {
        banner.innerHTML = `<span class="yahoo-refresh-icon">⚠</span> Yahoo Finance offline — showing cached data`;
        banner.classList.add('active');
        banner.classList.add('offline');
        setTimeout(() => { banner.classList.remove('active'); banner.classList.remove('offline'); }, 5000);
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

    // Hide sidebar and hamburger on login page
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) sidebar.style.display = page === 'login' ? 'none' : '';
    const hamburger = document.getElementById('hamburger-btn');
    if (hamburger) hamburger.style.display = page === 'login' ? 'none' : '';
    const main = document.querySelector('.main-content');
    if (main) main.style.marginLeft = page === 'login' ? '0' : '';

    // Only show spinner on the very first render
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
