/**
 * ============================================================================
 * APP.JS — Single-Page Router & Main Application Controller
 * ============================================================================
 *
 * PURPOSE:
 *   SPA router and app initialization. Orchestrates the startup sequence:
 *   cloud sync, page routing, status updates, and background data refresh.
 *
 * STARTUP SEQUENCE:
 *   1. Cloud pull (public, no auth) → Load portfolio from Cloudflare KV
 *   2. Dismiss loading overlay, render initial page
 *   3. Show "Cloud data loaded" toast
 *   4. Background Yahoo refresh (non-blocking) → Fetch live data
 *   5. When Yahoo completes, show "Updated" toast and re-render
 *
 * ROUTING:
 *   Hash-based: #dashboard, #settings, #logTrade?params=value
 *   Protected pages require authentication (Config.PROTECTED_PAGES)
 *   Auth pages hide sidebar (login, forgotPassword, resetPassword)
 *
 * TIMEOUT:
 *   Cloud sync waits max Config.SYNC.INIT_TIMEOUT_MS (10 seconds) at startup.
 *
 * ============================================================================
 */

const App = {
  currentPage: 'dashboard',
  pages: {},
  _renderedPages: new Set(),

  // Pages that require authentication (site login)
  PROTECTED: new Set(Config.PROTECTED_PAGES),

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
      login: Login,
      forgotPassword: ForgotPassword,
      resetPassword: ResetPassword
    };

    // Handle hash routing
    window.addEventListener('hashchange', () => this.route());

    // Run the sequential init
    this._initSequence();
  },

  async _initSequence() {
    const stepCloud = document.getElementById('step-cloud');
    const stepSync = document.getElementById('step-sync');
    const bar = document.getElementById('loading-bar');
    const fill = document.getElementById('loading-bar-fill');
    const loadMsg = document.getElementById('loading-message');

    if (bar) bar.classList.add('active');

    // ---- Step 1: Connect to cloud ----
    if (stepCloud) stepCloud.classList.add('active');
    if (loadMsg) loadMsg.textContent = 'Connecting to cloud database...';
    this._markStep(stepCloud, true);
    if (fill) fill.style.width = '50%';

    // ---- Step 2: Pull data from cloud (PUBLIC read, no auth) ----
    if (stepSync) stepSync.classList.add('active');
    if (loadMsg) loadMsg.textContent = 'Loading portfolio data from cloud...';
    let syncOk = false;
    try {
      const syncPromise = CloudSync.init();
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Cloud sync timed out')), Config.SYNC.INIT_TIMEOUT_MS)
      );
      await Promise.race([syncPromise, timeout]);
      syncOk = true;
    } catch (e) {
      console.error('[App] Cloud sync failed:', e.message);
    }
    this._markStep(stepSync, syncOk);
    if (fill) fill.style.width = '100%';

    // ---- Step 3: Dismiss overlay, render page ----
    if (loadMsg) loadMsg.textContent = syncOk ? 'Portfolio loaded!' : 'Using local data';

    setTimeout(() => {
      this._dismissOverlay();
      if (bar) bar.classList.remove('active');
    }, 400);

    // Listen for sync status changes
    CloudSync.onStatusChange(() => this.updateSyncStatus());

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

    // Start background refresh only if live Yahoo updates are enabled
    const appSettings = Storage.getSettings();
    if (appSettings.liveYahooRefresh !== false) {
      // Default is ON — only skip if explicitly disabled
      YahooRefresh.run();
    } else {
      console.log('[App] Live Yahoo refresh disabled in settings — using cached/cloud data only');
      MarketData.setStatus('disconnected');
      this.updateMarketStatus();
    }
  },

  // ── Toast Notifications (persistent, top-right) ───────────────────────────

  /**
   * Show a toast notification message.
   * Auto-dismisses after Config.UI.TOAST_DURATION_MS (4 seconds).
   * @private
   * @param {string} message - Text to show
   * @param {string} type - Type for styling: 'info' | 'synced' | 'yahoo' | 'warning'
   */
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

    // Auto-remove after toast duration
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, Config.UI.TOAST_DURATION_MS);
  },

  // ── Yahoo Refresh Progress UI (persistent banner above content) ─────────────

  /**
   * Set up the Yahoo Finance refresh progress banner.
   * Shows current ticker and % progress during background refresh.
   * Hides on completion or failure.
   * @private
   */
  _setupYahooRefreshUI() {
    const banner = document.getElementById('yahoo-refresh-banner');
    if (!banner) return;

    YahooRefresh.onProgress((p) => {
      if (!p.running && p.phase === 'Complete') {
        banner.classList.remove('active');
        setTimeout(() => { banner.innerHTML = ''; }, 300);
        this.updateMarketStatus();
        this._showToast('Yahoo Finance data updated', 'yahoo');
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

  // ── Routing & Navigation ─────────────────────────────────────────────────

  /**
   * Route to a page based on the current hash.
   * Protects pages in Config.PROTECTED_PAGES (require login).
   * Handles hash params like #resetPassword?token=abc.
   */
  route() {
    const rawHash = window.location.hash.slice(1) || 'dashboard';
    // Handle hash params like #resetPassword?token=abc
    const [hashBase] = rawHash.split('?');
    const [page, ...params] = hashBase.split('/');

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

  /**
   * Navigate to a page by updating the hash.
   * @param {string} page - The page name (e.g., 'dashboard', 'settings')
   */
  navigate(page) {
    window.location.hash = page;
  },

  /**
   * Update the sidebar nav to highlight the active page.
   * @private
   */
  updateNav() {
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.page === this.currentPage);
    });
  },

  /**
   * Update auth UI: show logout button if logged in, lock icons for protected pages.
   * @private
   */
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

  /**
   * Update the market status badge (Yahoo Finance connection state).
   * @private
   */
  updateMarketStatus() {
    const el = document.getElementById('market-status');
    if (el) el.innerHTML = MarketData.getStatusBadge();
  },

  /**
   * Update the sync status badge (cloud sync state).
   * @private
   */
  updateSyncStatus() {
    const el = document.getElementById('sync-status');
    if (el) el.innerHTML = CloudSync.getStatusBadge();
  },

  /**
   * Mark a loading step as done (show checkmark).
   * @private
   * @param {Element} el - The loading step element
   * @param {boolean} success - True for checkmark, false for dash
   */
  _markStep(el, success) {
    if (!el) return;
    el.classList.remove('active');
    el.classList.add('done');
    el.querySelector('.loading-step-icon').textContent = success ? '✓' : '–';
  },

  /**
   * Dismiss the loading overlay after startup.
   * @private
   */
  _dismissOverlay() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.classList.add('hidden');
  },

  // ── Page Rendering ───────────────────────────────────────────────────────

  /**
   * Render a page to the content container.
   * Hides sidebar for auth pages (login, forgotPassword, resetPassword).
   * Shows loading spinner if first page render.
   * @private
   * @param {string} page - The page name
   * @param {Array} params - URL params from hash (e.g., ['abc'] from #page/abc)
   */
  renderPage(page, params = []) {
    const content = document.getElementById('page-content');
    if (!content) return;

    const sidebar = document.querySelector('.sidebar');
    const isAuthPage = Config.AUTH_PAGES.includes(page);
    if (sidebar) sidebar.style.display = isAuthPage ? 'none' : '';
    const hamburger = document.getElementById('hamburger-btn');
    if (hamburger) hamburger.style.display = isAuthPage ? 'none' : '';
    const main = document.querySelector('.main-content');
    if (main) main.style.marginLeft = isAuthPage ? '0' : '';
    const banner = document.getElementById('yahoo-refresh-banner');
    if (banner) banner.style.display = isAuthPage ? 'none' : '';

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

  /**
   * Log out the user and redirect to login page.
   */
  logout() {
    Auth.logout();
    this._renderedPages.clear();
    window.location.hash = 'login';
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
