/**
 * ============================================================================
 * CONFIG.JS — Central Configuration for the Virtual Investment Portfolio
 * ============================================================================
 *
 * PURPOSE:
 *   Every "magic number", shared constant, default setting, and hardcoded
 *   value lives here in one place. If you need to change a timeout, a list
 *   of benchmark tickers, a cache duration, or an API endpoint — do it here.
 *
 * WHY THIS MATTERS:
 *   Before this file existed, the same values (like benchmark tickers or
 *   cache durations) were scattered across 10+ files. Changing one meant
 *   hunting through the whole codebase. Now there's one source of truth.
 *
 * HOW TO USE:
 *   Any JS file can read from `Config.SECTION.KEY`, e.g.:
 *     Config.BENCHMARKS.DEFAULT_TICKERS  → ['SPY', 'QQQ', 'ISF.L', 'URTH']
 *     Config.CACHE.PRICE_TTL_MS          → 900000 (15 minutes)
 *     Config.YAHOO.RATE_LIMIT_MS         → 750
 *
 * ============================================================================
 */

const Config = {

  // ── APP IDENTITY ──────────────────────────────────────────────────────────
  APP: {
    NAME: 'Virtual Investment Portfolio',
    VERSION: '3.0',
    STORAGE_PREFIX: 'vip_',              // Prefix for all localStorage keys
    SESSION_KEY: 'vip_auth_session',     // sessionStorage key for login state
    SYNC_TOKEN_KEY: 'vip_sync_token',    // sessionStorage key for cloud write token
  },

  // ── BENCHMARK & INDEX TICKERS ─────────────────────────────────────────────
  // These are the default comparison indexes shown on the dashboard chart.
  // They are also always refreshed by the cron worker on every run.
  BENCHMARKS: {
    DEFAULT_TICKERS: ['SPY', 'QQQ', 'ISF.L', 'URTH'],

    // Human-readable names for the 4 default benchmarks
    NAMES: {
      'S&P 500':    { ticker: 'SPY' },
      'NASDAQ 100': { ticker: 'QQQ' },
      'FTSE 100':   { ticker: 'ISF.L' },
      'MSCI World': { ticker: 'URTH' },
    },

    // Maximum number of custom indexes a user can add to the dashboard
    MAX_CUSTOM_INDEXES: 3,
  },

  // ── GLOBAL INDEX ETFs ─────────────────────────────────────────────────────
  // The full catalog of 110+ ETFs shown on the Global Indexes page.
  // The cron worker also pre-fetches quotes for all of these.
  // Organized by region/category for display.
  GLOBAL_INDEXES: [
    {
      name: 'MSCI World & Global',
      etfs: [
        { ticker: 'ACWI', name: 'iShares MSCI ACWI ETF', tags: ['global', 'world', 'all-country'] },
        { ticker: 'URTH', name: 'iShares MSCI World ETF', tags: ['global', 'world', 'developed'] },
        { ticker: 'VT',   name: 'Vanguard Total World Stock ETF', tags: ['global', 'world', 'total'] },
        { ticker: 'VEA',  name: 'Vanguard FTSE Developed Markets ETF', tags: ['developed', 'international'] },
        { ticker: 'VXUS', name: 'Vanguard Total International Stock ETF', tags: ['international', 'ex-us'] },
        { ticker: 'CWI',  name: 'SPDR MSCI ACWI ex-US ETF', tags: ['global', 'ex-us'] },
      ]
    },
    {
      name: 'United States',
      etfs: [
        { ticker: 'SPY',  name: 'SPDR S&P 500 ETF', tags: ['us', 'sp500', 'large-cap'] },
        { ticker: 'QQQ',  name: 'Invesco NASDAQ 100 ETF', tags: ['us', 'nasdaq', 'tech', 'growth'] },
        { ticker: 'DIA',  name: 'SPDR Dow Jones Industrial ETF', tags: ['us', 'dow', 'blue-chip'] },
        { ticker: 'IWM',  name: 'iShares Russell 2000 ETF', tags: ['us', 'small-cap', 'russell'] },
        { ticker: 'VTI',  name: 'Vanguard Total Stock Market ETF', tags: ['us', 'total-market'] },
        { ticker: 'VOO',  name: 'Vanguard S&P 500 ETF', tags: ['us', 'sp500', 'large-cap'] },
        { ticker: 'MDY',  name: 'SPDR S&P MidCap 400 ETF', tags: ['us', 'mid-cap'] },
        { ticker: 'RSP',  name: 'Invesco S&P 500 Equal Weight ETF', tags: ['us', 'equal-weight'] },
        { ticker: 'MTUM', name: 'iShares MSCI USA Momentum ETF', tags: ['us', 'momentum', 'factor'] },
        { ticker: 'QUAL', name: 'iShares MSCI USA Quality ETF', tags: ['us', 'quality', 'factor'] },
      ]
    },
    {
      name: 'United Kingdom',
      etfs: [
        { ticker: 'EWU',    name: 'iShares MSCI United Kingdom ETF', tags: ['uk', 'britain'] },
        { ticker: 'ISF.L',  name: 'iShares Core FTSE 100 UCITS ETF', tags: ['uk', 'ftse100'] },
        { ticker: 'VMID.L', name: 'Vanguard FTSE 250 UCITS ETF', tags: ['uk', 'ftse250', 'mid-cap'] },
        { ticker: 'VUKE.L', name: 'Vanguard FTSE 100 UCITS ETF', tags: ['uk', 'ftse100'] },
        { ticker: 'IGLT.L', name: 'iShares Core UK Gilts UCITS ETF', tags: ['uk', 'bonds', 'gilts'] },
        { ticker: 'FKU',    name: 'First Trust UK AlphaDEX ETF', tags: ['uk', 'smart-beta'] },
      ]
    },
    {
      name: 'Europe',
      etfs: [
        { ticker: 'EZU',  name: 'iShares MSCI Eurozone ETF', tags: ['europe', 'eurozone'] },
        { ticker: 'VGK',  name: 'Vanguard FTSE Europe ETF', tags: ['europe'] },
        { ticker: 'EWG',  name: 'iShares MSCI Germany ETF', tags: ['germany', 'europe'] },
        { ticker: 'EWQ',  name: 'iShares MSCI France ETF', tags: ['france', 'europe'] },
        { ticker: 'EWI',  name: 'iShares MSCI Italy ETF', tags: ['italy', 'europe'] },
        { ticker: 'EWP',  name: 'iShares MSCI Spain ETF', tags: ['spain', 'europe'] },
        { ticker: 'EWN',  name: 'iShares MSCI Netherlands ETF', tags: ['netherlands', 'europe'] },
        { ticker: 'EWD',  name: 'iShares MSCI Sweden ETF', tags: ['sweden', 'europe', 'nordic'] },
        { ticker: 'EWK',  name: 'iShares MSCI Belgium ETF', tags: ['belgium', 'europe'] },
        { ticker: 'EWL',  name: 'iShares MSCI Switzerland ETF', tags: ['switzerland', 'europe'] },
        { ticker: 'NORW', name: 'Global X MSCI Norway ETF', tags: ['norway', 'europe', 'nordic'] },
        { ticker: 'EDEN', name: 'iShares MSCI Denmark ETF', tags: ['denmark', 'europe', 'nordic'] },
      ]
    },
    {
      name: 'Japan & Asia Pacific',
      etfs: [
        { ticker: 'EWJ',  name: 'iShares MSCI Japan ETF', tags: ['japan', 'asia'] },
        { ticker: 'DXJ',  name: 'WisdomTree Japan Hedged Equity ETF', tags: ['japan', 'hedged'] },
        { ticker: 'JPXN', name: 'iShares JPX-Nikkei 400 ETF', tags: ['japan', 'nikkei', 'topix'] },
        { ticker: 'EWA',  name: 'iShares MSCI Australia ETF', tags: ['australia', 'asia-pacific'] },
        { ticker: 'EWS',  name: 'iShares MSCI Singapore ETF', tags: ['singapore', 'asia'] },
        { ticker: 'EWH',  name: 'iShares MSCI Hong Kong ETF', tags: ['hong-kong', 'asia'] },
        { ticker: 'EWT',  name: 'iShares MSCI Taiwan ETF', tags: ['taiwan', 'asia', 'semiconductor'] },
        { ticker: 'EWY',  name: 'iShares MSCI South Korea ETF', tags: ['korea', 'asia'] },
      ]
    },
    {
      name: 'China',
      etfs: [
        { ticker: 'FXI',  name: 'iShares China Large-Cap ETF', tags: ['china', 'large-cap'] },
        { ticker: 'MCHI', name: 'iShares MSCI China ETF', tags: ['china'] },
        { ticker: 'KWEB', name: 'KraneShares CSI China Internet ETF', tags: ['china', 'internet', 'tech'] },
        { ticker: 'ASHR', name: 'Xtrackers Harvest CSI 300 China A ETF', tags: ['china', 'a-shares'] },
        { ticker: 'CQQQ', name: 'Invesco China Technology ETF', tags: ['china', 'technology'] },
        { ticker: 'GXC',  name: 'SPDR S&P China ETF', tags: ['china'] },
        { ticker: 'CHIQ', name: 'Global X MSCI China Consumer Disc ETF', tags: ['china', 'consumer'] },
        { ticker: 'CNYA', name: 'iShares MSCI China A ETF', tags: ['china', 'a-shares'] },
      ]
    },
    {
      name: 'Emerging Markets',
      etfs: [
        { ticker: 'EEM',  name: 'iShares MSCI Emerging Markets ETF', tags: ['emerging', 'em'] },
        { ticker: 'VWO',  name: 'Vanguard FTSE Emerging Markets ETF', tags: ['emerging', 'em'] },
        { ticker: 'INDA', name: 'iShares MSCI India ETF', tags: ['india', 'emerging'] },
        { ticker: 'EWZ',  name: 'iShares MSCI Brazil ETF', tags: ['brazil', 'emerging', 'latam'] },
        { ticker: 'TUR',  name: 'iShares MSCI Turkey ETF', tags: ['turkey', 'emerging'] },
        { ticker: 'EWW',  name: 'iShares MSCI Mexico ETF', tags: ['mexico', 'emerging', 'latam'] },
        { ticker: 'EIDO', name: 'iShares MSCI Indonesia ETF', tags: ['indonesia', 'emerging', 'asean'] },
        { ticker: 'THD',  name: 'iShares MSCI Thailand ETF', tags: ['thailand', 'emerging', 'asean'] },
        { ticker: 'VNM',  name: 'VanEck Vietnam ETF', tags: ['vietnam', 'frontier', 'asean'] },
        { ticker: 'EZA',  name: 'iShares MSCI South Africa ETF', tags: ['south-africa', 'emerging', 'africa'] },
        { ticker: 'ECH',  name: 'iShares MSCI Chile ETF', tags: ['chile', 'emerging', 'latam'] },
        { ticker: 'EPOL', name: 'iShares MSCI Poland ETF', tags: ['poland', 'emerging', 'europe'] },
        { ticker: 'QAT',  name: 'iShares MSCI Qatar ETF', tags: ['qatar', 'emerging', 'middle-east'] },
        { ticker: 'UAE',  name: 'iShares MSCI UAE ETF', tags: ['uae', 'emerging', 'middle-east'] },
        { ticker: 'KSA',  name: 'iShares MSCI Saudi Arabia ETF', tags: ['saudi', 'emerging', 'middle-east'] },
      ]
    },
    {
      name: 'US Sector ETFs',
      etfs: [
        { ticker: 'XLK',  name: 'Technology Select Sector SPDR', tags: ['sector', 'technology', 'us'] },
        { ticker: 'XLF',  name: 'Financial Select Sector SPDR', tags: ['sector', 'financials', 'us', 'banks'] },
        { ticker: 'XLV',  name: 'Health Care Select Sector SPDR', tags: ['sector', 'healthcare', 'us'] },
        { ticker: 'XLE',  name: 'Energy Select Sector SPDR', tags: ['sector', 'energy', 'us', 'oil'] },
        { ticker: 'XLY',  name: 'Consumer Discretionary Select Sector SPDR', tags: ['sector', 'consumer', 'us'] },
        { ticker: 'XLP',  name: 'Consumer Staples Select Sector SPDR', tags: ['sector', 'staples', 'us', 'defensive'] },
        { ticker: 'XLI',  name: 'Industrial Select Sector SPDR', tags: ['sector', 'industrials', 'us'] },
        { ticker: 'XLU',  name: 'Utilities Select Sector SPDR', tags: ['sector', 'utilities', 'us', 'defensive'] },
        { ticker: 'XLB',  name: 'Materials Select Sector SPDR', tags: ['sector', 'materials', 'us'] },
        { ticker: 'XLRE', name: 'Real Estate Select Sector SPDR', tags: ['sector', 'real-estate', 'us', 'reit'] },
        { ticker: 'XLC',  name: 'Communication Services Select Sector SPDR', tags: ['sector', 'communication', 'us', 'media'] },
      ]
    },
    {
      name: 'Thematic & Alternative',
      etfs: [
        { ticker: 'ARKK', name: 'ARK Innovation ETF', tags: ['innovation', 'disruptive', 'growth'] },
        { ticker: 'SOXX', name: 'iShares Semiconductor ETF', tags: ['semiconductor', 'chips', 'tech'] },
        { ticker: 'BOTZ', name: 'Global X Robotics & AI ETF', tags: ['robotics', 'ai', 'automation'] },
        { ticker: 'ICLN', name: 'iShares Global Clean Energy ETF', tags: ['clean-energy', 'esg', 'solar', 'wind'] },
        { ticker: 'TAN',  name: 'Invesco Solar ETF', tags: ['solar', 'clean-energy', 'esg'] },
        { ticker: 'LIT',  name: 'Global X Lithium & Battery Tech ETF', tags: ['lithium', 'battery', 'ev'] },
        { ticker: 'HACK', name: 'ETFMG Prime Cyber Security ETF', tags: ['cybersecurity', 'tech'] },
        { ticker: 'SKYY', name: 'First Trust Cloud Computing ETF', tags: ['cloud', 'saas', 'tech'] },
        { ticker: 'GLD',  name: 'SPDR Gold Shares', tags: ['gold', 'commodity', 'safe-haven'] },
        { ticker: 'SLV',  name: 'iShares Silver Trust', tags: ['silver', 'commodity'] },
        { ticker: 'VNQ',  name: 'Vanguard Real Estate ETF', tags: ['real-estate', 'reit'] },
        { ticker: 'BITQ', name: 'Bitwise Crypto Industry Innovators ETF', tags: ['crypto', 'bitcoin', 'blockchain'] },
        { ticker: 'DRIV', name: 'Global X Autonomous & EV ETF', tags: ['ev', 'autonomous', 'vehicles'] },
        { ticker: 'ARKW', name: 'ARK Next Generation Internet ETF', tags: ['internet', 'innovation', 'tech'] },
        { ticker: 'ARKG', name: 'ARK Genomic Revolution ETF', tags: ['genomics', 'biotech', 'healthcare'] },
      ]
    },
    {
      name: 'Fixed Income & Bonds',
      etfs: [
        { ticker: 'AGG',  name: 'iShares Core US Aggregate Bond ETF', tags: ['bonds', 'aggregate', 'us', 'fixed-income'] },
        { ticker: 'TLT',  name: 'iShares 20+ Year Treasury Bond ETF', tags: ['bonds', 'treasury', 'long-term', 'us'] },
        { ticker: 'TIP',  name: 'iShares TIPS Bond ETF', tags: ['bonds', 'tips', 'inflation', 'us'] },
        { ticker: 'EMB',  name: 'iShares J.P. Morgan USD EM Bond ETF', tags: ['bonds', 'emerging', 'em'] },
        { ticker: 'HYG',  name: 'iShares iBoxx $ High Yield Corporate Bond ETF', tags: ['bonds', 'high-yield', 'junk', 'corporate'] },
        { ticker: 'LQD',  name: 'iShares iBoxx $ Investment Grade Corp Bond ETF', tags: ['bonds', 'investment-grade', 'corporate'] },
        { ticker: 'IEF',  name: 'iShares 7-10 Year Treasury Bond ETF', tags: ['bonds', 'treasury', 'intermediate', 'us'] },
        { ticker: 'SHY',  name: 'iShares 1-3 Year Treasury Bond ETF', tags: ['bonds', 'treasury', 'short-term', 'us'] },
        { ticker: 'BNDX', name: 'Vanguard Total International Bond ETF', tags: ['bonds', 'international'] },
        { ticker: 'MUB',  name: 'iShares National Muni Bond ETF', tags: ['bonds', 'municipal', 'tax-free'] },
      ]
    },
    {
      name: 'Money Market & Cash ETFs',
      etfs: [
        { ticker: 'SGOV',    name: 'iShares 0-3 Month Treasury Bond ETF', tags: ['money-market', 'treasury', 'cash', 'us'] },
        { ticker: 'BIL',     name: 'SPDR Bloomberg 1-3 Month T-Bill ETF', tags: ['money-market', 't-bill', 'cash', 'us'] },
        { ticker: 'SHV',     name: 'iShares Short Treasury Bond ETF', tags: ['money-market', 'treasury', 'cash', 'us'] },
        { ticker: 'JPST',    name: 'JPMorgan Ultra-Short Income ETF', tags: ['money-market', 'ultra-short', 'cash'] },
        { ticker: 'CSH2.L',  name: 'iShares GBP Ultrashort Bond UCITS ETF', tags: ['money-market', 'gbp', 'cash', 'uk'] },
        { ticker: 'XEON.DE', name: 'Xtrackers EUR Overnight Rate Swap UCITS ETF', tags: ['money-market', 'eur', 'cash', 'europe'] },
      ]
    },
  ],

  // ── CACHE DURATIONS ───────────────────────────────────────────────────────
  // How long data stays "fresh" before we fetch again.
  CACHE: {
    PRICE_TTL_MS:   15 * 60 * 1000,   // 15 minutes — current stock quotes
    HISTORY_TTL_MS: 60 * 60 * 1000,   // 1 hour — daily price history bars
  },

  // ── YAHOO FINANCE API ─────────────────────────────────────────────────────
  YAHOO: {
    RATE_LIMIT_MS: 750,                // Min milliseconds between API calls (browser)
    WORKER_RATE_LIMIT_MS: 800,         // Min milliseconds between API calls (cron worker)
    REQUEST_TIMEOUT_MS: 15000,         // 15 seconds — abort if Yahoo doesn't respond
    MAX_RETRIES: 2,                    // Retry failed requests up to 2 times
    RECONNECT_POLL_MS: 30 * 1000,     // Check every 30s if Yahoo comes back online
    QUOTE_RANGE: '5d',                 // Fetch 5 days to get real change even on weekends
    ALLOWED_HOSTS: [                   // Only these Yahoo domains are proxied
      'query1.finance.yahoo.com',
      'query2.finance.yahoo.com',
    ],
    // CORS proxies — tried in order, rotated on failure
    PROXIES: [
      '/api/yahoo?url=',                       // Same-origin Cloudflare Pages Function
      'https://api.allorigins.win/raw?url=',   // Public fallback for local dev
    ],
  },

  // ── CLOUD SYNC ────────────────────────────────────────────────────────────
  SYNC: {
    AUTO_PUSH_INTERVAL_MS: 5 * 60 * 1000,  // Auto-push local changes every 5 minutes
    INIT_TIMEOUT_MS: 10000,                  // Give up on initial cloud pull after 10s
    // Keys that are synced to cloud (user data = immediate, cache = periodic)
    USER_KEYS: ['trades', 'journal', 'thinkPieces', 'watchlist', 'snapshots', 'settings'],
    CACHE_KEYS: ['priceStore', 'priceCache'],
  },

  // ── AUTHENTICATION ────────────────────────────────────────────────────────
  AUTH: {
    SESSION_DURATION_HOURS: 12,        // Browser session expires after 12 hours
    // Hardcoded fallback credentials (checked if cloud creds unavailable)
    // These are SHA-256 hashes — the actual username/password never appear in code.
    FALLBACK_USER_HASH: '12f80649f4412ed383a6334390dc4b3798924f9326e150503247c7419f2e37a0',
    FALLBACK_PASS_HASH: 'b8735a1c3beccd9301ce4f688c94cdcb64658b1a00805ad7329011051fe579fd',
  },

  // ── UI SETTINGS ───────────────────────────────────────────────────────────
  UI: {
    TOAST_DURATION_MS: 4000,           // Toast notifications auto-dismiss after 4 seconds
    TRADING_DAYS_PER_YEAR: 252,        // Used in Sharpe ratio calculation
    DEFAULT_RISK_FREE_RATE: 0.04,      // 4% annual — used when user hasn't set one
  },

  // ── PAGES THAT REQUIRE LOGIN ──────────────────────────────────────────────
  // Visiting these routes without being logged in redirects to #login.
  PROTECTED_PAGES: ['logTrade', 'journal', 'thinkPieces', 'settings', 'snapshots', 'watchlist'],

  // ── AUTH-STYLE PAGES (no sidebar shown) ───────────────────────────────────
  AUTH_PAGES: ['login', 'forgotPassword', 'resetPassword'],

  // ── HELPER: Get a flat list of all global index tickers ───────────────────
  getAllGlobalTickers() {
    const tickers = [];
    for (const cat of this.GLOBAL_INDEXES) {
      for (const etf of cat.etfs) {
        tickers.push(etf.ticker);
      }
    }
    return tickers;
  },
};

// Make it available globally (browser) or as a module export
if (typeof window !== 'undefined') {
  window.Config = Config;
}
if (typeof module !== 'undefined') {
  module.exports = Config;
}
