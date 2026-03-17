// yahooRefresh.js — Background Yahoo Finance data refresh
// Runs independently of page navigation. Fetches all quotes and history
// in a single pass after initial Firebase data is loaded.

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
   * 1. Check Yahoo connection
   * 2. Fetch live quotes for all holdings
   * 3. Fetch full history for all benchmark tickers + holding tickers
   * Does NOT block page rendering. Updates localStorage as data arrives.
   */
  async run() {
    if (this._running) return;
    this._running = true;
    this._aborted = false;

    console.log('[YahooRefresh] Starting background refresh...');

    // Phase 1: Check Yahoo connection
    this._setProgress(0, 1, '', 'Connecting to Yahoo Finance...');
    const connected = await MarketData.checkConnection();
    if (!connected) {
      console.warn('[YahooRefresh] Yahoo Finance not reachable — skipping refresh');
      this._running = false;
      this._setProgress(0, 0, '', 'Yahoo Finance offline');
      return;
    }

    // Gather all tickers we need to refresh
    const { holdings } = Storage.computeHoldings();
    const holdingTickers = holdings.map(h => h.ticker);
    const settings = Storage.getSettings();
    const customTickers = (settings.customIndexes || []).map(c => c.ticker);

    // Default benchmark tickers
    const benchmarkTickers = ['SPY', 'QQQ', 'ISF.L', 'URTH'];

    // Build unique list of all tickers for history refresh
    const allHistoryTickers = [...new Set([
      ...benchmarkTickers,
      ...customTickers,
      ...holdingTickers
    ])];

    // Total work: quotes for holdings + history for all tickers
    const totalWork = holdingTickers.length + allHistoryTickers.length;
    let done = 0;

    // Phase 2: Fetch live quotes for all holdings
    this._setProgress(done, totalWork, '', 'Fetching live quotes...');
    for (const ticker of holdingTickers) {
      if (this._aborted) break;
      this._setProgress(done, totalWork, ticker, 'Fetching quote');
      try {
        // Clear the 15min cache so we get a fresh quote
        const cache = Storage.get('priceCache', {});
        delete cache[ticker];
        Storage.set('priceCache', cache);
        await MarketData.getQuote(ticker);
      } catch (e) {
        console.warn(`[YahooRefresh] Quote failed for ${ticker}:`, e.message);
      }
      done++;
      this._setProgress(done, totalWork, ticker, 'Fetching quote');
    }

    // Phase 3: Fetch full history for benchmarks + holdings
    this._setProgress(done, totalWork, '', 'Fetching price history...');
    for (const ticker of allHistoryTickers) {
      if (this._aborted) break;
      this._setProgress(done, totalWork, ticker, 'Fetching history');
      try {
        // Clear the 1hr history cache so we get fresh data
        try { localStorage.removeItem(Storage._hcKey(ticker)); } catch {}
        await MarketData._fetchFullHistory(ticker);
      } catch (e) {
        console.warn(`[YahooRefresh] History failed for ${ticker}:`, e.message);
      }
      done++;
      this._setProgress(done, totalWork, ticker, 'Fetching history');
    }

    // Done — push updated caches to Firebase if authenticated
    if (!this._aborted && FirebaseSync.isFirebaseAuthenticated()) {
      this._setProgress(done, totalWork, '', 'Syncing to cloud...');
      try {
        await FirebaseSync.forcePush();
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
