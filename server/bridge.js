// bridge.js — Yahoo Finance WebSocket Bridge
// Fetches market data from Yahoo Finance and exposes WebSocket for browser
//
// Usage:  node bridge.js [--port 8099] [--verbose]

const { WebSocketServer } = require('ws');
const https = require('https');

// --- Parse CLI args ---
const args = process.argv.slice(2);
const getArg = (flag, def) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : def; };
const VERBOSE = args.includes('--verbose');
const WS_PORT = parseInt(getArg('--port', '8099'));

// --- Logging ---
const log = (...a) => console.log(`[${new Date().toISOString()}]`, ...a);
const verbose = (...a) => { if (VERBOSE) log('[VERBOSE]', ...a); };

// --- Rate limiting: wait between Yahoo API calls ---
let lastCallTime = 0;
const MIN_DELAY_MS = 2500; // 2.5 seconds between calls

async function rateLimitWait() {
  const now = Date.now();
  const elapsed = now - lastCallTime;
  if (elapsed < MIN_DELAY_MS) {
    const wait = MIN_DELAY_MS - elapsed;
    verbose(`Rate limit: waiting ${wait}ms`);
    await new Promise(r => setTimeout(r, wait));
  }
  lastCallTime = Date.now();
}

// --- HTTP fetch helper ---
function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('HTTP timeout')); });
  });
}

// --- Yahoo Finance API functions ---

// Quote: get current/last price data for a ticker
async function getQuote(ticker) {
  await rateLimitWait();
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1d&interval=1d`;
  log(`📊 Quote: ${ticker}`);

  const raw = await httpGet(url);
  const json = JSON.parse(raw);
  const result = json.chart?.result?.[0];
  if (!result) throw new Error(`No data for ${ticker}`);

  const meta = result.meta;
  const quote = result.indicators?.quote?.[0] || {};

  return {
    ticker: meta.symbol,
    last: meta.regularMarketPrice || 0,
    open: quote.open?.[0] || meta.regularMarketOpen || 0,
    high: quote.high?.[0] || meta.regularMarketDayHigh || 0,
    low: quote.low?.[0] || meta.regularMarketDayLow || 0,
    close: meta.previousClose || meta.chartPreviousClose || 0,
    volume: quote.volume?.[0] || meta.regularMarketVolume || 0,
    change: meta.previousClose ? ((meta.regularMarketPrice - meta.previousClose) / meta.previousClose * 100) : 0,
    currency: meta.currency,
    exchangeName: meta.exchangeName,
    timestamp: Date.now()
  };
}

// Historical data: daily close prices
async function getHistory(ticker, duration, barSize) {
  await rateLimitWait();

  // Map duration string to Yahoo range/period parameters
  // Yahoo Finance v8 chart API uses range or period1/period2
  const rangeMap = {
    '1 M': '1mo',   '1 m': '1mo',
    '3 M': '3mo',   '3 m': '3mo',
    '6 M': '6mo',   '6 m': '6mo',
    '1 Y': '1y',    '1 y': '1y',
    '2 Y': '2y',    '2 y': '2y',
    '5 Y': '5y',    '5 y': '5y',
    '10 Y': '10y',  '10 y': '10y',
    'max': 'max'
  };

  // Map bar size to Yahoo interval
  const intervalMap = {
    '1 day': '1d',   '1d': '1d',
    '1 week': '1wk', '1w': '1wk',
    '1 month': '1mo','1m': '1mo',
    '1 hour': '1h',  '1h': '1h',
    '5 mins': '5m',  '5m': '5m',
    '15 mins': '15m', '15m': '15m'
  };

  const range = rangeMap[duration] || '1y';
  const interval = intervalMap[barSize] || '1d';

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${range}&interval=${interval}`;
  log(`📈 History: ${ticker} range=${range} interval=${interval}`);

  const raw = await httpGet(url);
  const json = JSON.parse(raw);
  const result = json.chart?.result?.[0];
  if (!result) throw new Error(`No history for ${ticker}`);

  const timestamps = result.timestamp || [];
  const quote = result.indicators?.quote?.[0] || {};
  const opens = quote.open || [];
  const highs = quote.high || [];
  const lows = quote.low || [];
  const closes = quote.close || [];
  const volumes = quote.volume || [];

  const bars = [];
  for (let i = 0; i < timestamps.length; i++) {
    // Skip bars with null close
    if (closes[i] == null) continue;

    const d = new Date(timestamps[i] * 1000);
    const dateStr = d.toISOString().split('T')[0]; // YYYY-MM-DD

    bars.push({
      date: dateStr,
      open: opens[i] || 0,
      high: highs[i] || 0,
      low: lows[i] || 0,
      close: closes[i],
      volume: volumes[i] || 0
    });
  }

  log(`  → ${bars.length} bars for ${ticker}`);
  return bars;
}

// Search: use Yahoo Finance autosuggest
async function searchSymbol(query) {
  await rateLimitWait();
  const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=10&newsCount=0&enableFuzzyQuery=false&quotesQueryId=tss_match_phrase_query`;
  log(`🔍 Search: "${query}"`);

  const raw = await httpGet(url);
  const json = JSON.parse(raw);

  return (json.quotes || []).map(q => ({
    ticker: q.symbol,
    name: q.longname || q.shortname || q.symbol,
    exchange: q.exchange,
    secType: q.quoteType,
    currency: q.currency || 'USD'
  }));
}

// --- WebSocket Server ---
const wss = new WebSocketServer({ port: WS_PORT });

log(`WebSocket bridge starting on ws://localhost:${WS_PORT}`);

wss.on('connection', (ws) => {
  log('🌐 Browser client connected');

  ws.on('message', async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      ws.send(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }

    const { id, action, params } = msg;
    log(`→ [${id}] ${action}`, params ? JSON.stringify(params) : '');

    const reply = (data) => {
      const r = { id, action, ...data };
      const preview = JSON.stringify(r);
      log(`← [${id}] ${action}: ${preview.length > 200 ? preview.slice(0, 200) + '...' : preview}`);
      ws.send(JSON.stringify(r));
    };

    try {
      switch (action) {
        // --- Connection ---
        case 'status':
          reply({ result: { connected: true, source: 'Yahoo Finance' } });
          break;

        case 'connect':
          reply({ result: { connected: true } });
          break;

        case 'disconnect':
          reply({ result: { connected: false } });
          break;

        // --- Symbol Search ---
        case 'search': {
          const results = await searchSymbol(params.query);
          reply({ result: results });
          break;
        }

        // --- Quote ---
        case 'quote': {
          try {
            const quote = await getQuote(params.ticker);
            reply({ result: quote });
          } catch (e) {
            log(`  Quote error for ${params.ticker}: ${e.message}`);
            reply({ result: { ticker: params.ticker, last: 0, close: 0, change: 0, error: e.message } });
          }
          break;
        }

        // --- Batch Quotes ---
        case 'batchQuotes': {
          const tickers = params.tickers || [];
          const results = {};
          for (const t of tickers) {
            try {
              const q = await getQuote(t);
              results[t] = {
                last: q.last,
                close: q.close,
                change: q.change
              };
            } catch (e) {
              log(`  Batch quote error for ${t}: ${e.message}`);
              results[t] = { last: 0, close: 0, change: 0 };
            }
          }
          reply({ result: results });
          break;
        }

        // --- Historical Data ---
        case 'history': {
          try {
            const bars = await getHistory(
              params.ticker,
              params.duration || '1 Y',
              params.barSize || '1 day'
            );
            reply({ result: bars });
          } catch (e) {
            log(`  History error for ${params.ticker}: ${e.message}`);
            reply({ result: [] });
          }
          break;
        }

        default:
          reply({ error: `Unknown action: ${action}` });
      }
    } catch (e) {
      log(`❌ Error handling ${action}: ${e.message}`);
      reply({ error: e.message || 'Request failed' });
    }
  });

  ws.on('close', () => log('🌐 Browser client disconnected'));
  ws.on('error', (e) => log('WebSocket error:', e.message));
});

// --- Graceful shutdown ---
process.on('SIGINT', () => {
  log('Shutting down...');
  wss.close();
  process.exit(0);
});

log(`
╔══════════════════════════════════════════════════════╗
║       Yahoo Finance WebSocket Bridge                 ║
║──────────────────────────────────────────────────────║
║  WebSocket:  ws://localhost:${String(WS_PORT).padEnd(25)}║
║  Data:       Yahoo Finance (delayed)                 ║
║  Rate limit: ${String(MIN_DELAY_MS + 'ms between calls').padEnd(39)}║
╚══════════════════════════════════════════════════════╝
`);
