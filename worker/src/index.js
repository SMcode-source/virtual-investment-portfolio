/**
 * ════════════════════════════════════════════════════════════════════════════════
 * VIP YAHOO FINANCE CRON WORKER — Cloudflare Worker
 * ════════════════════════════════════════════════════════════════════════════════
 *
 * PURPOSE
 * ───────
 * Runs on a schedule to fetch live Yahoo Finance data and update the PORTFOLIO_DATA
 * KV namespace. Keeps quotes and price history fresh so the dashboard always has
 * recent data, even when no browser is open.
 *
 * ARCHITECTURE & BATCH ROTATION
 * ──────────────────────────────
 * Because Cloudflare Workers free plan limits to 50 subrequests per invocation,
 * the 110+ global index ETFs are split into NUM_BATCHES equal-sized batches.
 * Each cron run processes one batch on rotation, so all ETFs are refreshed within
 * NUM_BATCHES consecutive runs (~90 minutes during market hours).
 *
 * Priority tickers (held stocks + DEFAULT_BENCHMARKS + custom indexes) are
 * ALWAYS refreshed every run regardless of batch rotation, up to MAX_FETCHES_PER_RUN.
 *
 * HTTP ENDPOINTS
 * ──────────────
 * GET /run         → runs current batch (same as cron trigger)
 * GET /run?all=1   → runs ALL batches sequentially (full refresh, may take minutes)
 * GET /run?batch=N → runs specific batch N (0 to NUM_BATCHES-1)
 *
 * SCHEDULE
 * ────────
 * Cron: every 4 hours during market hours (minute 0, every 4th hour)
 * This ensures all batches rotate through within a business day.
 * ════════════════════════════════════════════════════════════════════════════════
 */

// ─── CONFIGURATION & CONSTANTS ───────────────────────────────────────────────────

/** Worker version for tracking behavior changes and debugging */
const WORKER_VERSION = '2.0.0';

/** Minimum milliseconds to wait between Yahoo API calls (rate limiting) */
const MIN_DELAY_MS = 800;

/**
 * Max subrequests to stay safely under Cloudflare free-tier limit (50).
 * Reserve ~6 for KV reads/writes, leaving ~44 for Yahoo fetches.
 */
const MAX_FETCHES_PER_RUN = 42;

/** Number of batches to split global ETFs into for rotation */
const NUM_BATCHES = 3;

/** Default benchmark tickers that always get quotes refreshed and full history on batch 0 */
const DEFAULT_BENCHMARKS = ['SPY', 'QQQ', 'ISF.L', 'URTH'];

/**
 * ALL_GLOBAL_TICKERS — Single source of truth for all monitored global index ETFs
 *
 * Categories:
 *   MSCI World & Global + United States + United Kingdom (27 tickers)
 *   Europe (12 tickers)
 *   Japan & Asia Pacific + China + Emerging Markets (31 tickers)
 *   US Sector ETFs + Thematic & Alternative (15 tickers)
 *   Fixed Income + Money Market (16 tickers)
 * ─────────────────────────────────────────────────────────────────────────────
 * Total: 101 tickers split dynamically into NUM_BATCHES batches
 */
const ALL_GLOBAL_TICKERS = [
  // MSCI World & Global + United States + United Kingdom
  'ACWI', 'URTH', 'VT', 'VEA', 'VXUS', 'CWI',
  'SPY', 'QQQ', 'DIA', 'IWM', 'VTI', 'VOO', 'MDY', 'RSP', 'MTUM', 'QUAL',
  'EWU', 'ISF.L', 'VMID.L', 'VUKE.L', 'IGLT.L', 'FKU',
  // Europe
  'EZU', 'VGK', 'EWG', 'EWQ', 'EWI', 'EWP', 'EWN', 'EWD', 'EWK', 'EWL', 'NORW', 'EDEN',
  // Japan & Asia Pacific + China + Emerging Markets
  'EWJ', 'DXJ', 'JPXN', 'EWA', 'EWS', 'EWH', 'EWT', 'EWY',
  'FXI', 'MCHI', 'KWEB', 'ASHR', 'CQQQ', 'GXC', 'CHIQ', 'CNYA',
  'EEM', 'VWO', 'INDA', 'EWZ', 'TUR', 'EWW', 'EIDO', 'THD', 'VNM', 'EZA', 'ECH', 'EPOL', 'QAT', 'UAE', 'KSA',
  // US Sector ETFs + Thematic & Alternative + Fixed Income + Money Market
  'XLK', 'XLF', 'XLV', 'XLE', 'XLY', 'XLP', 'XLI', 'XLU', 'XLB', 'XLRE', 'XLC',
  'ARKK', 'SOXX', 'BOTZ', 'ICLN', 'TAN', 'LIT', 'HACK', 'SKYY', 'GLD', 'SLV', 'VNQ', 'BITQ', 'DRIV', 'ARKW', 'ARKG',
  'AGG', 'TLT', 'TIP', 'EMB', 'HYG', 'LQD', 'IEF', 'SHY', 'BNDX', 'MUB',
  'SGOV', 'BIL', 'SHV', 'JPST', 'CSH2.L', 'XEON.DE',
];

// ─── BATCH SPLITTING ────────────────────────────────────────────────────────────

/**
 * Split an array into N approximately equal-sized batches.
 * Useful for distributing work across multiple cron runs while respecting API limits.
 *
 * @param {Array} array - The array to split (e.g., list of tickers)
 * @param {number} numBatches - Number of batches to create
 * @returns {Array<Array>} Array of batches, each containing ceil(array.length / numBatches) items
 *
 * @example
 * const batches = splitIntoBatches(['A', 'B', 'C', 'D', 'E'], 2);
 * // Returns [['A', 'B', 'C'], ['D', 'E']]
 */
function splitIntoBatches(array, numBatches) {
  if (numBatches <= 0) return [];
  if (numBatches >= array.length) return array.map(item => [item]);

  const batchSize = Math.ceil(array.length / numBatches);
  const batches = [];

  for (let i = 0; i < numBatches; i++) {
    const start = i * batchSize;
    const end = Math.min(start + batchSize, array.length);
    batches.push(array.slice(start, end));
  }

  return batches;
}

/**
 * Compute batches dynamically from ALL_GLOBAL_TICKERS.
 * Returns an array of NUM_BATCHES arrays, each containing approximately equal-sized subsets.
 */
const ALL_BATCHES = splitIntoBatches(ALL_GLOBAL_TICKERS, NUM_BATCHES);

// ─── ENTRY POINTS ───────────────────────────────────────────────────────────────

export default {
  /**
   * SCHEDULED HANDLER — Triggered by cron job
   *
   * Runs one batch per invocation on a rotating schedule.
   * With NUM_BATCHES batches, all global ETFs are refreshed within NUM_BATCHES runs.
   */
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runRefresh(env, { rotate: true }));
  },

  /**
   * HTTP HANDLER — Manual refresh trigger for testing and debugging
   *
   * GET /run         → runs current batch (same rotation as cron)
   * GET /run?all=1   → runs ALL batches sequentially (full refresh, may take minutes)
   * GET /run?batch=N → runs specific batch N (0 to NUM_BATCHES-1)
   *
   * Returns JSON with detailed metadata about the refresh run.
   */
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/run') {
      const batchParam = url.searchParams.get('batch');
      const runAll = url.searchParams.get('all') === '1';

      if (runAll) {
        // Run all batches sequentially for a complete data refresh
        const results = [];
        for (let i = 0; i < ALL_BATCHES.length; i++) {
          const result = await runRefresh(env, { forceBatch: i });
          results.push(result);
        }
        return new Response(JSON.stringify(results, null, 2), {
          headers: { 'Content-Type': 'application/json' }
        });
      } else if (batchParam !== null) {
        // Force a specific batch for testing
        const result = await runRefresh(env, { forceBatch: parseInt(batchParam) });
        return new Response(JSON.stringify(result, null, 2), {
          headers: { 'Content-Type': 'application/json' }
        });
      } else {
        // Default: run current batch (same as cron trigger)
        const result = await runRefresh(env, { rotate: true });
        return new Response(JSON.stringify(result, null, 2), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
    // Default info response
    return new Response(
      `VIP Yahoo Cron Worker v${WORKER_VERSION}\n\n` +
      `  GET /run         → run current batch (cron rotation)\n` +
      `  GET /run?all=1   → run all ${NUM_BATCHES} batches (full refresh)\n` +
      `  GET /run?batch=N → run batch N (0-${NUM_BATCHES - 1})\n`,
      { status: 200 }
    );
  }
};

// ─── MAIN REFRESH LOGIC ─────────────────────────────────────────────────────────

/**
 * Main refresh orchestration function.
 *
 * Steps:
 *   1. Determine which batch to run (rotate or force)
 *   2. Load portfolio trades, settings to identify priority tickers
 *   3. Compute priority set (held + benchmarks + custom indexes)
 *   4. Load batch tickers (excluding those already in priority)
 *   5. Fetch quotes for all tickers (prioritized first, then batch, up to cap)
 *   6. Write updated price caches to KV
 *   7. Fetch and store full history for benchmarks (only on batch 0)
 *   8. Store metadata including batch counter for next rotation
 *   9. Return detailed metadata with success/failure breakdown
 *
 * @param {object} env - Cloudflare Worker environment (includes KV namespace)
 * @param {object} options - Control options
 * @param {boolean} options.rotate - If true, rotate to next batch using KV counter
 * @param {number} options.forceBatch - If set, force a specific batch (0 to NUM_BATCHES-1)
 * @returns {object} Result metadata with ok flag, batch index, detailed logs, and error breakdown
 */
async function runRefresh(env, options = {}) {
  const kv = env.PORTFOLIO_DATA;
  if (!kv) return { error: 'KV not bound' };

  const startTime = Date.now();
  const log = [];
  const failedTickers = []; // Track which tickers failed for better error reporting

  try {
    // 1. Determine which batch to run
    let batchIndex;
    if (options.forceBatch !== undefined) {
      // Clamp forced batch to valid range
      batchIndex = Math.max(0, Math.min(NUM_BATCHES - 1, options.forceBatch));
    } else {
      // Rotate through batches using counter stored in KV
      const meta = await kv.get('_cronMeta', 'json') || {};
      batchIndex = ((meta.lastBatch ?? -1) + 1) % ALL_BATCHES.length;
    }
    const currentBatch = ALL_BATCHES[batchIndex];
    log.push(`Running batch ${batchIndex} of ${NUM_BATCHES} (${currentBatch.length} global ETFs)`);

    // 2. Discover priority tickers (always refreshed every run regardless of batch)
    const trades = await kv.get('trades', 'json') || [];
    const heldTickers = getHeldTickers(trades);
    log.push(`Portfolio tickers: ${heldTickers.join(', ') || '(none)'}`);

    const settings = await kv.get('settings', 'json') || {};
    const customIndexTickers = (settings.customIndexes || []).map(c => c.ticker);
    log.push(`Custom indexes: ${customIndexTickers.join(', ') || '(none)'}`);

    // 3. Priority tickers = held + benchmarks + custom (always refreshed)
    const priorityTickers = [...new Set([
      ...heldTickers,
      ...DEFAULT_BENCHMARKS,
      ...customIndexTickers
    ])];

    // 4. This run's global tickers (exclude any already in priority to avoid duplicate fetches)
    const prioritySet = new Set(priorityTickers);
    const batchTickers = currentBatch.filter(t => !prioritySet.has(t));

    // 5. Combined list for this run, capped at MAX_FETCHES_PER_RUN to stay under API limits
    const allTickers = [...priorityTickers, ...batchTickers].slice(0, MAX_FETCHES_PER_RUN);
    log.push(`This run: ${priorityTickers.length} priority + ${batchTickers.length} batch = ${allTickers.length} tickers (cap: ${MAX_FETCHES_PER_RUN})`);

    // Tickers that get full historical data (benchmarks + custom indexes only, not held stocks)
    const historyTickers = [...new Set([
      ...DEFAULT_BENCHMARKS,
      ...customIndexTickers
    ])];

    // 6. Fetch quotes for all tickers in this run
    const priceCache = await kv.get('priceCache', 'json') || {};
    const priceStore = await kv.get('priceStore', 'json') || {};
    let quotesUpdated = 0;
    let quotesFailed = 0;

    for (const ticker of allTickers) {
      try {
        const quote = await fetchQuote(ticker);
        if (quote) {
          priceCache[ticker] = { ...quote, ts: Date.now() };
          priceStore[ticker] = { ...quote, ts: Date.now() };
          quotesUpdated++;
        }
      } catch (e) {
        quotesFailed++;
        failedTickers.push(ticker);
        log.push(`Quote failed: ${ticker} — ${e.message}`);
      }
      // Rate limit to avoid overwhelming Yahoo API
      await sleep(MIN_DELAY_MS);
    }
    log.push(`Quotes updated: ${quotesUpdated}, failed: ${quotesFailed}`);

    // 7. Write updated price caches to KV
    await kv.put('priceCache', JSON.stringify(priceCache));
    await kv.put('priceStore', JSON.stringify(priceStore));

    // 8. Fetch and store full history for benchmark tickers
    //    Only on batch 0 to conserve subrequests. These run every 3 hours with rotation.
    let historyUpdated = 0;
    let historyFailed = 0;
    const failedHistoryTickers = [];

    if (batchIndex === 0) {
      for (const ticker of historyTickers) {
        try {
          const history = await fetchFullHistory(ticker);
          if (history && history.length > 0) {
            await kv.put(`history_${ticker}`, JSON.stringify({
              data: history,
              ts: Date.now()
            }));
            historyUpdated++;
            log.push(`History: ${ticker} → ${history.length} bars`);
          }
        } catch (e) {
          historyFailed++;
          failedHistoryTickers.push(ticker);
          log.push(`History failed: ${ticker} — ${e.message}`);
        }
        // Rate limit
        await sleep(MIN_DELAY_MS);
      }
      log.push(`History updated: ${historyUpdated}, failed: ${historyFailed}`);
    } else {
      log.push(`History: skipped (only runs on batch 0)`);
    }

    // 9. Store run metadata (including batch counter for rotation and error breakdown)
    const elapsed = Date.now() - startTime;
    const runMeta = {
      workerVersion: WORKER_VERSION,
      lastRun: new Date().toISOString(),
      lastBatch: batchIndex,
      elapsedMs: elapsed,
      tickersRefreshed: quotesUpdated,
      tickersFailed: quotesFailed,
      failedTickers: failedTickers.length > 0 ? failedTickers : undefined,
      historyRefreshed: historyUpdated,
      historyFailed: historyFailed,
      failedHistoryTickers: failedHistoryTickers.length > 0 ? failedHistoryTickers : undefined,
      totalErrors: quotesFailed + historyFailed,
      totalGlobalETFs: ALL_GLOBAL_TICKERS.length
    };
    await kv.put('_cronMeta', JSON.stringify(runMeta));

    log.push(`Done in ${elapsed}ms`);
    return { ok: true, batch: batchIndex, log, meta: runMeta };

  } catch (e) {
    log.push(`Fatal error: ${e.message}`);
    return { ok: false, error: e.message, log };
  }
}

// ─── PORTFOLIO ANALYSIS ─────────────────────────────────────────────────────────

/**
 * Compute currently held tickers from trade log.
 *
 * Iterates through all trades, accumulating net shares per ticker:
 *   - 'buy' trades add to position
 *   - 'sell' trades subtract from position
 * Returns only tickers with positive net shares (> 0.0001).
 *
 * @param {Array} trades - Array of trade objects, each with ticker, shares, type/side
 * @returns {Array<string>} Sorted array of held ticker symbols
 *
 * @example
 * const trades = [
 *   { ticker: 'AAPL', shares: 10, type: 'buy' },
 *   { ticker: 'AAPL', shares: 5, type: 'sell' },
 *   { ticker: 'MSFT', shares: 3, type: 'buy' }
 * ];
 * getHeldTickers(trades); // ['AAPL', 'MSFT']
 */
function getHeldTickers(trades) {
  const positions = {};

  for (const trade of trades) {
    const ticker = trade.ticker;
    if (!ticker) continue;

    const shares = parseFloat(trade.shares) || 0;
    const side = (trade.type || trade.side || '').toLowerCase();

    // Accumulate net shares: buys add, sells subtract
    if (side === 'buy') {
      positions[ticker] = (positions[ticker] || 0) + shares;
    } else if (side === 'sell') {
      positions[ticker] = (positions[ticker] || 0) - shares;
    }
  }

  // Filter to positive positions only, return ticker list
  return Object.entries(positions)
    .filter(([, shares]) => shares > 0.0001)
    .map(([ticker]) => ticker);
}

// ─── YAHOO FINANCE API HELPERS ──────────────────────────────────────────────────

/**
 * Fetch current quote for a ticker from Yahoo Finance API.
 *
 * Requests 5 days of daily data to ensure we have the last 2 trading days available.
 * This is crucial for computing accurate daily change even on weekends/after-hours
 * when the API may not update.
 *
 * @param {string} ticker - Ticker symbol (e.g., 'AAPL', 'SPY', 'ISF.L')
 * @returns {Promise<object|null>} Quote object with ticker, last, open, high, low, close, volume, change, timestamp
 * @throws {Error} If Yahoo API fails after retries or response is malformed
 */
async function fetchQuote(ticker) {
  // range=5d ensures we get at least the last 2 trading days
  // This is important because on weekends/after-hours, regularMarketPrice may equal previousClose,
  // which would incorrectly show 0% change. By having 5d of daily bars, we can compute
  // change from the actual last 2 trading day closes instead.
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=5d&interval=1d`;
  const json = await yahooFetch(url);
  const res = json?.chart?.result?.[0];
  if (!res) return null;

  return parseQuote(ticker, res);
}

/**
 * Fetch full historical daily OHLCV data for a ticker from inception.
 *
 * Requests all available data from 1970-01-01 to now, parsing into standardized
 * daily OHLCV bars. Skips bars with null/missing close prices.
 *
 * @param {string} ticker - Ticker symbol (e.g., 'SPY', 'QQQ')
 * @returns {Promise<Array<object>|null>} Array of daily bars with date, open, high, low, close, volume (ISO date format)
 * @throws {Error} If Yahoo API fails or response is malformed
 *
 * @example
 * const history = await fetchFullHistory('SPY');
 * // Returns: [
 * //   { date: '1993-01-29', open: 43.94, high: 44.06, low: 43.88, close: 43.94, volume: 1000000 },
 * //   ...
 * // ]
 */
async function fetchFullHistory(ticker) {
  // period1=0 (1970-01-01) and period2=now ensures we get all historical data
  const now = Math.floor(Date.now() / 1000);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=0&period2=${now}&interval=1d`;
  const json = await yahooFetch(url);
  const res = json?.chart?.result?.[0];
  if (!res) return null;

  // Extract raw arrays from Yahoo response
  const timestamps = res.timestamp || [];
  const q = res.indicators?.quote?.[0] || {};
  const closes = q.close || [];
  const opens = q.open || [];
  const highs = q.high || [];
  const lows = q.low || [];
  const volumes = q.volume || [];

  // Transform into standardized daily bar objects
  const history = [];
  for (let i = 0; i < timestamps.length; i++) {
    // Skip bars with missing close price
    if (closes[i] == null) continue;

    const d = new Date(timestamps[i] * 1000);
    history.push({
      date: d.toISOString().split('T')[0], // ISO date string (YYYY-MM-DD)
      open: opens[i] || 0,
      high: highs[i] || 0,
      low: lows[i] || 0,
      close: closes[i],
      volume: volumes[i] || 0
    });
  }

  return history;
}

/**
 * Parse Yahoo Finance chart response into a quote object.
 *
 * KEY LOGIC: Computes daily change from the last 2 trading day CLOSES in the 5d data,
 * NOT from regularMarketPrice vs previousClose. Why?
 *
 * On weekends, after-hours, or holidays, Yahoo returns:
 *   - regularMarketPrice = last actual trading day close
 *   - previousClose = same value (since market hasn't traded)
 *   - Naive (last - prevClose) / prevClose = 0% (incorrect!)
 *
 * Solution: Fetch 5d of daily bars and compute change from the actual last 2 trading
 * day closes. This always gives the correct 1-day % change, even outside market hours.
 *
 * @param {string} ticker - Ticker symbol for fallback if meta.symbol is missing
 * @param {object} res - Yahoo chart response containing meta and indicators
 * @returns {object} Quote object with ticker, last, open, high, low, close, volume, change, timestamp
 */
function parseQuote(ticker, res) {
  const meta = res.meta;
  const q = res.indicators?.quote?.[0] || {};
  const closes = q.close || [];
  const last = meta.regularMarketPrice || 0;
  const prevClose = meta.previousClose || meta.chartPreviousClose || 0;

  // CORE LOGIC: Compute change from last 2 trading day closes
  // This is resilient to weekends/after-hours when regularMarketPrice == previousClose
  let change = 0;
  const validCloses = closes.filter(c => c != null && c > 0);

  if (validCloses.length >= 2) {
    // Primary method: use actual 5d bar closes
    const lastClose = validCloses[validCloses.length - 1];
    const prevDayClose = validCloses[validCloses.length - 2];
    change = prevDayClose ? ((lastClose - prevDayClose) / prevDayClose * 100) : 0;
  } else if (prevClose && last) {
    // Fallback: use meta fields if we don't have 2+ bars (rare)
    change = ((last - prevClose) / prevClose * 100);
  }

  return {
    ticker: meta.symbol || ticker,
    last,                                                    // Current market price
    open: q.open?.[0] || meta.regularMarketOpen || 0,      // Today's open (from 5d bar if available)
    high: q.high?.[0] || meta.regularMarketDayHigh || 0,   // Day high
    low: q.low?.[0] || meta.regularMarketDayLow || 0,      // Day low
    close: prevClose,                                        // Previous close (used by charts as reference)
    volume: q.volume?.[0] || meta.regularMarketVolume || 0, // Trading volume
    change,                                                  // % change from yesterday's close
    timestamp: Date.now()                                    // When we fetched this quote
  };
}

/**
 * Fetch and parse JSON from Yahoo Finance API with exponential backoff retry.
 *
 * Implements simple exponential backoff: after 1st failure waits 1s, after 2nd waits 2s, etc.
 * This helps handle temporary network issues and rate limiting gracefully.
 *
 * @param {string} url - Full URL to fetch (should include query parameters)
 * @param {number} retries - Number of retries (default 1, so 2 total attempts)
 * @returns {Promise<object>} Parsed JSON response
 * @throws {Error} After all retries exhausted with details of last error
 *
 * @example
 * const data = await yahooFetch('https://query1.finance.yahoo.com/v8/finance/chart/SPY?range=5d&interval=1d');
 */
async function yahooFetch(url, retries = 1) {
  let lastError;

  for (let i = 0; i <= retries; i++) {
    try {
      const resp = await fetch(url, {
        headers: {
          // Mimic a browser to reduce rate limiting
          'User-Agent': 'Mozilla/5.0 (compatible; VIPCronWorker/' + WORKER_VERSION + ')'
        }
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return await resp.json();

    } catch (e) {
      lastError = e;

      // Exponential backoff: wait 1s, 2s, 3s, etc. between retries
      if (i < retries) {
        await sleep(1000 * (i + 1));
      }
    }
  }

  throw new Error(`Yahoo fetch failed after ${retries + 1} attempts: ${lastError?.message}`);
}

// ─── UTILITIES ──────────────────────────────────────────────────────────────────

/**
 * Sleep for a given duration.
 *
 * Used for rate limiting API calls and exponential backoff between retries.
 *
 * @param {number} ms - Duration in milliseconds
 * @returns {Promise<void>} Resolves after the delay
 *
 * @example
 * await sleep(1000); // Wait 1 second
 */
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
