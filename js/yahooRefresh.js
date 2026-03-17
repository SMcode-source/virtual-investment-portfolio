// yahooRefresh.js — Background Yahoo Finance data refresh
// Runs independently of page navigation. Makes ONE "All" API call per ticker
// which returns full price history + current quote from response metadata.
// Shorter periods (1M, 3M, 6M, YTD) are sliced from the full dataset.

const YahooRefresh = {
  _running: false,
  _listeners: [],
  _progress: { current: 0, total: 0, ticker: '', phase: '' },
  _aborted: false,

  // Subscribe to progress updates
  onProgress(fn) { this._listeners.push(fn); },
  _notify() { this._listeners.forEach(fn => fn({ ...this._progress, running: this._running })); },

  isRunning() { return this._running; },
  getProgress() { return { ...this._progress, running: this._running }; },

  /**
   * Run a full Yahoo Finance refresh in background.
   * Single pass: fetch full "All" history for every ticker (benchmarks + holdings).
   * The history response also contains the current quote in its metadata,
   * so no separate quote API calls are needed.
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

    // Default benchmark tickers
    const benchmarkTickers = ['SPY', 'QQQ', 'ISF.L', 'URTH'];

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

  abort() {
    this._aborted = true;
  },

  _setProgress(current, total, ticker, phase) {
    this._progress = { current, total, ticker, phase };
    this._notify();
  }
};

window.YahooRefresh = YahooRefresh;
