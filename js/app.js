// app.js — SPA Router & Main Application Controller
const App = {
  currentPage: 'dashboard',
  pages: {},

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
      FirebaseApp.init();
      FirebaseSync.init();
      FirebaseSync.onStatusChange(() => this.updateSyncStatus());
    }

    // Market data connection status
    MarketData.onStatusChange(() => this.updateMarketStatus());
    MarketData.checkConnection();

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

  renderPage(page, params = []) {
    const content = document.getElementById('page-content');
    if (!content) return;

    // Hide sidebar on login page for cleaner look
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) sidebar.style.display = page === 'login' ? 'none' : '';
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
