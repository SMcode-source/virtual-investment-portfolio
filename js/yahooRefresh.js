/**
 * ============================================================================
 * YAHOOREFRESH.JS — Background Price Data Refresh from Yahoo Finance
 * ============================================================================
 *
 * PURPOSE:
 *   Runs independently of page navigation. Refreshes price data for all
 *   tickers (benchmarks, holdings, custom indexes) in the background.
 *   Makes ONE fetch per ticker (all-time history + current quote).
 *   Shorter periods (1M, 3M, etc.) are sliced from the full dataset.
 *
 * HOW IT WORKS:
 *   1. Triggered by App.js during startup (non-blocking)
 *   2. Gathers all tickers: defaults (SPY, QQQ, ISF.L, URTH) + custom + holdings
 *   3. Fetches full history for each, respecting rate limits
 *   4. On success: Updates status to 'connected', pushes to cloud if logged in
 *   5. On failure: Marks as 'disconnected', keeps showing cached data
 *
 * PROGRESS TRACKING:
 *   Emits progress updates for UI banner showing current ticker and % complete.
 *   Can be aborted if user navigates away or logs in.
 *
 * ============================================================================
 */

const YahooRefresh = {
  _running: false,
  _listeners: [],
  _progress: { current: 0, total: 0, ticker: '', phase: '' },
  _aborted: false,

  // ── Progress Notifications ────────────────────────────────────────────────

  /**
   * Subscribe to progress updates during background refresh.
   * Called with {current, total, ticker, phase, running}.
   * @param {Function} fn - Callback(progress) function
   */
  onProgress(fn) { this._listeners.push(fn); },

  /**
   * Notify all listeners of the current progress state.
   * @private
   */
  _notify() { this._listeners.forEach(fn => fn({ ...this._progress, running: this._running })); },

  /**
   * Check if a refresh is currently running.
   * @returns {boolean} True if running
   */
  isRunning() { return this._running; },

  /**
   * Get the current progress state.
   * @returns {Object} {current, total, ticker, phase, running}
   */
  getProgress() { return { ...this._progress, running: this._running }; },

  // ── Main Refresh Logic ────────────────────────────────────────────────────

  /**
   * Run a full Yahoo Finance refresh in background.
   * Single pass: fetch full history for every ticker (benchmarks + holdings + custom).
   * The history response includes the current quote in its metadata,
   * so no separate quote API calls are needed.
   * Emits progress updates for the UI banner.
   * On success, pushes to cloud if authenticated.
   */
  async run() {
    if (this._running) return;
    this._running = true;
    this._aborted = false;

    console.log('[YahooRefresh] Starting background refresh...');

    // Gather all tickers we need to refresh
    const { holdings } = Storage.computeHoldings();
    const holdingTickers = holdings.map(h => h.ticker);
    const settings = Storage.getSettings();
    const customTickers = (settings.customIndexes || []).map(c => c.ticker);

    // Default benchmark tickers (from Config)
    const benchmarkTickers = Config.BENCHMARKS.DEFAULT_TICKERS;

    // Build unique list of all tickers — one API call each
    const allTickers = [...new Set([
      ...benchmarkTickers,
      ...customTickers,
      ...holdingTickers
    ])];

    const totalWork = allTickers.length;
    let done = 0;
    let anySuccess = false;

    // Single pass: fetch full "All" history per ticker (also caches quote from meta)
    this._setProgress(0, totalWork, '', 'Refreshing from Yahoo Finance...');
    for (const ticker of allTickers) {
      if (this._aborted) break;
      this._setProgress(done, totalWork, ticker, 'Fetching');
      try {
        // Fetch fresh data, bypassing cache but NOT deleting existing data.
        // If Yahoo fails, old cloud data remains available for page renders.
        await MarketData._fetchFullHistory(ticker, true);
        anySuccess = true;
      } catch (e) {
        console.warn(`[YahooRefresh] Failed for ${ticker}:`, e.message);
      }
      done++;
      this._setProgress(done, totalWork, ticker, 'Fetching');
    }

    // If no ticker succeeded, mark as offline
    if (!anySuccess && !this._aborted) {
      console.warn('[YahooRefresh] All tickers failed — Yahoo Finance likely offline');
      this._running = false;
      MarketData.setStatus('disconnected');
      this._setProgress(0, 0, '', 'Yahoo Finance offline');
      return;
    }

    // Mark Yahoo as connected if we got data
    if (anySuccess) {
      MarketData.setStatus('connected');
    }

    // Push updated caches to cloud if authenticated
    if (!this._aborted && CloudSync.isAuthenticated()) {
      this._setProgress(done, totalWork, '', 'Syncing to cloud...');
      try {
        await CloudSync.forcePush();
      } catch (e) {
        console.warn('[YahooRefresh] Cloud push failed:', e.message);
      }
    }

    this._running = false;
    this._setProgress(totalWork, totalWork, '', 'Complete');
    console.log('[YahooRefresh] Background refresh complete');
  },

  // ── Cancellation ─────────────────────────────────────────────────────────

  /**
   * Abort the current refresh (if running).
   * Used when user logs in or closes the app during refresh.
   */
  abort() {
    this._aborted = true;
  },

  // ── Progress Helper ───────────────────────────────────────────────────────

  /**
   * Update the progress state and notify listeners.
   * @private
   * @param {number} current - Tickers completed so far
   * @param {number} total - Total tickers to fetch
   * @param {string} ticker - The ticker currently being fetched (empty when syncing to cloud)
   * @param {string} phase - Description: 'Fetching', 'Syncing to cloud...', 'Complete', etc.
   */
  _setProgress(current, total, ticker, phase) {
    this._progress = { current, total, ticker, phase };
    this._notify();
  }
};

window.YahooRefresh = YahooRefresh;
