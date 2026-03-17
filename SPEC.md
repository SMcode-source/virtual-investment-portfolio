# Virtual Investment Portfolio — Application Specification v2.1

> **Purpose:** This document is a complete rebuild spec. An LLM or developer can recreate the entire application from this file alone.

---

## 1. Overview

A single-page web application for tracking a virtual investment portfolio with live Yahoo Finance data, Firebase cloud sync, and a public-facing read-only view. No build tools, no bundler, no framework — just vanilla HTML/CSS/JS served as static files.

**Tech stack:** HTML5, CSS3, vanilla JavaScript (ES2017+), Chart.js 4.4.1, Firebase 10.12.0 (compat SDK), Yahoo Finance v8 API via CORS proxy.

**Hosting:** Any static file server, GitHub Pages, or `python -m http.server`. No server-side code required.

---

## 2. Architecture

### 2.1 File Structure

```
index.html                  — Single HTML entry point, sidebar nav, loading overlay
css/styles.css              — All styles (1565 lines, CSS variables, responsive)
js/firebaseConfig.js        — Firebase project config + init
js/storage.js               — localStorage wrapper, data models, holdings computation
js/firebaseSync.js          — Bidirectional Firebase Realtime DB sync
js/marketData.js            — Yahoo Finance API client (CORS proxy, rate limiter, caching)
js/utils.js                 — Formatting, Sharpe ratio math, date helpers
js/auth.js                  — SHA-256 hash-based credential auth + session management
js/yahooRefresh.js          — Background data refresh orchestrator
js/app.js                   — SPA router, init sequence, page rendering
js/pages/dashboard.js       — Main dashboard with time machine
js/pages/publicView.js      — Public-facing portfolio view
js/pages/logTrade.js        — Trade entry form
js/pages/tradeHistory.js    — Sortable trade history + CSV export
js/pages/journal.js         — Investment journal CRUD
js/pages/thinkPieces.js     — Long-form article editor
js/pages/analytics.js       — Sharpe calculator + performance KPIs
js/pages/globalIndexes.js   — 110+ ETF directory by category
js/pages/watchlist.js       — Stock watchlist with price alerts
js/pages/snapshots.js       — Point-in-time portfolio records
js/pages/settings.js        — Config, public page toggles, cloud sync, diagnostics
js/pages/login.js           — Login page
firebase-rules.json         — Firebase Realtime DB security rules
```

### 2.2 Script Load Order (Critical)

Scripts are loaded via `<script>` tags in `index.html` in this exact order (dependencies flow downward):

1. Firebase SDK (CDN): `firebase-app-compat.js`, `firebase-auth-compat.js`, `firebase-database-compat.js`
2. `firebaseConfig.js` — defines `FirebaseApp` global
3. `storage.js` — defines `Storage` global (depends on nothing)
4. `firebaseSync.js` — defines `FirebaseSync` global (depends on `FirebaseApp`, `Storage`)
5. `marketData.js` — defines `MarketData` global (depends on `Storage`, `Utils`)
6. `utils.js` — defines `Utils` global (pure functions, no dependencies)
7. `auth.js` — defines `Auth` global (depends on `FirebaseSync`, `FirebaseApp`)
8. `yahooRefresh.js` — defines `YahooRefresh` global (depends on `Storage`, `MarketData`, `FirebaseSync`)
9. All page modules (each defines a global: `Dashboard`, `LogTrade`, `Journal`, etc.)
10. `app.js` — defines `App` global, calls `App.init()` on DOMContentLoaded

All modules attach to `window` as globals. No ES modules, no imports.

### 2.3 SPA Routing

Hash-based routing (`window.location.hash`). The `App.route()` method reads the hash, checks auth for protected pages, and calls `page.render(container)`.

**Page registry in `App.pages`:**

| Hash | Module | Protected | Description |
|------|--------|-----------|-------------|
| `#dashboard` | Dashboard | No | Main dashboard (default) |
| `#publicView` | PublicView | No | Public portfolio view |
| `#logTrade` | LogTrade | Yes | Log a trade |
| `#tradeHistory` | TradeHistory | No | Trade history table |
| `#journal` | Journal | Yes | Investment journal |
| `#thinkPieces` | ThinkPieces | Yes | Long-form articles |
| `#analytics` | Analytics | No | Performance analytics |
| `#globalIndexes` | GlobalIndexes | No | ETF directory |
| `#watchlist` | Watchlist | Yes | Stock watchlist |
| `#snapshots` | Snapshots | Yes | Portfolio snapshots |
| `#settings` | Settings | Yes | App settings |
| `#login` | Login | No | Login page |

Protected pages redirect to `#login` if `Auth.isAuthenticated()` is false. After login, user is redirected to the originally requested page via `Auth.getRedirect()`.

---

## 3. Data Layer

### 3.1 Storage (`storage.js`)

All data lives in `localStorage` with prefix `vip_`. Every `Storage.set()` call also triggers `FirebaseSync.syncKey()` for real-time cloud push.

**Data keys and shapes:**

#### `vip_settings`
```json
{
  "portfolioName": "Investment Portfolio",
  "startingCash": 100000,
  "baseCurrency": "USD",
  "riskFreeRate": 4.0,
  "public": {
    "showHoldings": true,
    "showTradeHistory": true,
    "showBenchmarks": true,
    "showExactValue": false,
    "showThinkPieces": true,
    "showSharpe": true
  },
  "customIndexes": [
    { "ticker": "VTI", "name": "Vanguard Total Stock Market", "color": "#f97316" }
  ]
}
```
- `customIndexes`: max 3 user-chosen benchmark series. Colors assigned from palette: `['#f97316', '#06b6d4', '#ec4899']`.

#### `vip_trades` — Array of trade objects
```json
{
  "id": "lxyz12abc",
  "type": "BUY",
  "ticker": "NVDA",
  "name": "NVIDIA Corporation",
  "sector": "Technology",
  "country": "USA",
  "shares": 10,
  "price": 450.00,
  "commission": 0,
  "currency": "USD",
  "date": "2024-03-15T14:30:00.000Z",
  "thesis": "AI infrastructure leader...",
  "sentiment": "Bullish",
  "conviction": 5,
  "tags": ["AI", "growth"],
  "targetPrice": 600.00,
  "stopLoss": 380.00,
  "journalLink": "lxyz_journal_id"
}
```

#### `vip_journal` — Array of journal entries
```json
{
  "id": "...",
  "ticker": "NVDA",
  "title": "NVDA — Bullish Thesis",
  "body": "Full thesis text...",
  "sentiment": "Bullish",
  "conviction": 5,
  "tags": ["AI", "growth"],
  "linkedTrades": ["trade_id_1"],
  "date": "2024-03-15T14:30:00.000Z"
}
```

#### `vip_thinkPieces` — Array of articles
```json
{
  "id": "...",
  "title": "The AI Revolution",
  "content": "Markdown content...",
  "status": "published",
  "emoji": "🤖",
  "createdAt": "...",
  "updatedAt": "..."
}
```
- `status`: `"draft"` or `"published"`. Drafts appear blurred in public view.

#### `vip_watchlist` — Array of watched tickers
```json
{
  "ticker": "AAPL",
  "name": "Apple Inc.",
  "alertPrice": 200.00,
  "alertTriggered": false,
  "addedDate": "..."
}
```

#### `vip_snapshots` — Array of point-in-time records
```json
{
  "id": "...",
  "date": "...",
  "totalValue": 105000,
  "totalReturn": 5.0,
  "cash": 50000,
  "positionCount": 5,
  "sectorCount": 3,
  "isMonthly": false,
  "holdings": [{ "ticker": "NVDA", "shares": 10, "currentPrice": 500, "marketValue": 5000 }],
  "sectors": ["Technology", "Healthcare"]
}
```

#### Price Caching

- `vip_priceCache` — Object `{ ticker: { data, ts } }`, 15-minute TTL
- `vip_priceStore` — Persistent fallback (same structure, never expires)
- `vip_hc_{TICKER}` — Per-ticker historical price cache, 1-hour TTL
- `vip_hs_{TICKER}` — Per-ticker persistent historical fallback

Quota overflow handling: on `QuotaExceededError`, calls `_clearHistoryCaches()` which removes all `vip_hc_*` and `vip_hs_*` keys, then retries once.

### 3.2 Holdings Computation (`Storage.computeHoldings`)

Replays all trades chronologically to compute current holdings:

1. Start with `settings.startingCash`
2. Sort trades by date ascending
3. For each trade:
   - **BUY:** Add shares, add to `totalCost`, subtract `(shares * price + commission)` from cash
   - **SELL:** Remove shares using average cost basis, add `(shares * price - commission)` to cash
4. Delete holdings with `shares <= 0`
5. Calculate `avgCost = totalCost / shares` per holding
6. Accepts optional `asOfDate` parameter for time-machine feature (ignores trades after that date)

Returns: `{ holdings: [{ ticker, name, sector, country, shares, totalCost, avgCost }], cash }`

---

## 4. External Services

### 4.1 Yahoo Finance API (`marketData.js`)

All market data comes from Yahoo Finance v8 API, accessed through CORS proxies since the browser can't call Yahoo directly.

**CORS Proxies (failover rotation):**
1. `https://corsproxy.io/?url=`
2. `https://api.allorigins.win/raw?url=`

**Rate limiting:** Serialized request queue with 750ms minimum delay between calls. Max 2 retries with exponential backoff (1s, 2s). 15-second timeout per request.

**Reconnection:** When Yahoo goes offline, polls every 30 seconds with a test request (`SPY 1d`) until reconnected.

**API endpoints used:**

| Purpose | URL Pattern |
|---------|------------|
| Live quote | `query1.finance.yahoo.com/v8/finance/chart/{ticker}?range=1d&interval=1d` |
| Full history | `query1.finance.yahoo.com/v8/finance/chart/{ticker}?period1=0&period2={now}&interval=1d` |
| Symbol search | `query2.finance.yahoo.com/v1/finance/search?q={query}&quotesCount=10&newsCount=0` |

**Key design decision:** History is fetched ALL-TIME (period1=0) once per ticker and cached for 1 hour. Shorter periods (1M, 3M, 6M, YTD, 1Y, 2Y, 5Y) are sliced from this full dataset client-side. The history response also contains the current quote in its metadata, so no separate quote call is needed per ticker.

**Quote data shape:**
```json
{ "ticker": "SPY", "last": 450.12, "open": 448.50, "high": 451.20, "low": 447.80, "close": 449.00, "volume": 50000000, "change": 0.25, "timestamp": 1710000000000 }
```

**History data shape (per bar):**
```json
{ "date": "2024-03-15", "open": 448.5, "high": 451.2, "low": 447.8, "close": 450.1, "volume": 50000000 }
```

**Series alignment (`MarketData.alignSeries`):** Takes multiple price series with different date ranges and forward-fills missing dates to create a common x-axis for charting.

**Default benchmark ETFs:**
| Display Name | Ticker |
|-------------|--------|
| S&P 500 | SPY |
| NASDAQ 100 | QQQ |
| FTSE 100 | ISF.L |
| MSCI World | URTH |

### 4.2 Firebase (`firebaseConfig.js`, `firebaseSync.js`)

**Firebase services used:** Realtime Database, Authentication (Google sign-in).

**Database structure:**
```
portfolio/
  trades: [...]
  journal: [...]
  thinkPieces: [...]
  watchlist: [...]
  snapshots: [...]
  settings: {...}
  priceStore: {...}
  priceCache: {...}
  history/
    SPY: { data: [...], ts: ... }
    QQQ: { data: [...], ts: ... }
    ISF%2EL: { data: [...], ts: ... }
    URTH: { data: [...], ts: ... }
```

**Security rules:** Public read, authenticated write:
```json
{ "rules": { "portfolio": { ".read": true, ".write": "auth != null" } } }
```

**Key encoding:** Firebase disallows `.#$/[]` in keys. These are percent-encoded (`%2E`, `%23`, etc.) on write and decoded on read. Ticker `ISF.L` becomes `ISF%2EL`.

**Sync strategy:**
1. **On app load:** Single public read (pull all keys + per-ticker history). No auth needed.
2. **On every `Storage.set()` call:** If authenticated, immediately push that key to Firebase (except cache keys).
3. **Every 5 minutes:** Auto-push all data to Firebase (push only, no pull).
4. **Manual controls in Settings:** Force Push (local → cloud), Force Pull (cloud → local).
5. **After Yahoo refresh completes:** If authenticated, push updated caches to cloud.

**There is NO real-time listener.** The only Firebase read happens once during init. This is intentional to avoid conflicts and keep the sync model simple.

**Google Authentication:** Popup-based (`signInWithPopup`), with automatic redirect fallback (`signInWithRedirect`) if popup is blocked.

---

## 5. Authentication (`auth.js`)

**Two separate auth systems:**

1. **Site Auth (Auth module):** Username/password hashed with SHA-256 (Web Crypto API) and compared against hardcoded hashes. Creates a sessionStorage session with 12-hour expiry. Protects editing pages (logTrade, journal, thinkPieces, settings, snapshots, watchlist).

2. **Firebase Auth (via FirebaseSync):** Google OAuth sign-in. Enables cloud sync write capability. Independent of site auth — a user can be logged into the site without Google, or signed into Google without site login.

**Credential verification:** Input is hashed with SHA-256 and compared to stored hashes:
- `VALID_USER_HASH`: `12f80649f4412ed383a6334390dc4b3798924f9326e150503247c7419f2e37a0`
- `VALID_PASS_HASH`: `b8735a1c3beccd9301ce4f688c94cdcb64658b1a00805ad7329011051fe579fd`

**Session:** Stored in `sessionStorage` as `vip_auth_session` with `{ expiry: timestamp }`. Checked on every protected page navigation.

---

## 6. App Init Sequence (`app.js`)

The startup flow is sequential with a loading overlay:

1. **Firebase init** → `FirebaseApp.init()` — initialize Firebase SDK
2. **Cloud pull** → `FirebaseSync.init()` — pull all data from Firebase (20s timeout if failed display error)
3. **Dismiss overlay** → show page content, render first page
4. **Set up auth listener** → `FirebaseSync.onAuthReady()` for push capability
5. **Route** → render the initial page based on URL hash
6. **Background Yahoo refresh** → `YahooRefresh.run()` — non-blocking, shows progress banner and runs after the firebase sync is complete or failed

The loading overlay shows two steps with checkmarks: "Connecting to cloud database" and "Loading portfolio data from cloud".

### 6.1 Yahoo Refresh Flow (`yahooRefresh.js`)

Runs in background after page renders:

1. Gather all unique tickers: default benchmarks + custom indexes + current holdings
2. For each ticker, call `MarketData._fetchFullHistory(ticker, skipCache=true)` which fetches ALL-TIME history and also caches the current quote from the response metadata
3. Show progress banner with ticker name and percentage
4. If authenticated, push updated caches to Firebase
5. On completion, show toast "Yahoo Finance data updated" and re-render current page
6. If all tickers fail, mark Yahoo as disconnected and show offline banner

---

## 7. Pages — Detailed Specs

### 7.1 Dashboard (`dashboard.js`)

The main page with portfolio overview.

**Components:**
- **Time Machine:** Date picker that replays trades up to a selected date, showing historical portfolio state. "Back to Current" button restores live view.
- **KPI Cards (4):** Portfolio Value (including cash), Total Return (% vs starting cash), Cash Balance (amount + % of portfolio), Open Positions (count + sector count).
- **Performance Chart:** Chart.js line chart showing cumulative % returns for Portfolio + benchmarks + up to 3 custom indexes. Period selector (1M/3M/6M/YTD/1Y/2Y/5Y/All). Series toggle buttons. Sharpe window selector (90d/180d/365d/730d).
- **Custom Index Search:** "+ Add Index" button opens inline search. Max 3 custom indexes. Yahoo Finance symbol search with debounce.
- **Holdings Table:** Ticker, Company, Sector, Country (with flag emoji), Shares, Avg Cost, Live Price, Market Value, P&L ($ and %), Weight (visual bar).
- **Sector & Country Allocation:** Horizontal bar charts showing allocation by sector and country.
- **Sharpe Ratios at a Glance:** Table showing 6-month and 1-year Sharpe ratios for Portfolio + all benchmarks + custom indexes. Each cell shows annualized return, volatility, and a color-coded Sharpe pill with hover tooltip showing full calculation breakdown.

**Sharpe Ratio calculation (`Utils.calcSharpeRatio`):**
- Input: array of daily returns, risk-free rate (default 4% annual)
- Daily Rf = annual rate / 252
- Excess returns = daily returns - daily Rf
- Annualized return = mean(excess returns) * 252
- Annualized volatility = stddev(excess returns) * sqrt(252)
- Sharpe = annualized return / annualized volatility
- Rating: >= 1.5 Excellent (green), >= 0.5 Good (blue), >= 0 Fair (amber), < 0 Poor (red)

**Chart generation counter:** `_chartGeneration` prevents stale async renders. Each `loadPerformanceChart()` call increments the counter, and after async data fetching, checks if a newer call has started — if so, it bails out.

### 7.2 Public View (`publicView.js`)

A read-only, public-facing version of the portfolio. Wrapped in a dashed border to indicate "preview mode."

**Everything in the Dashboard is here, plus:**
- **Custom Date Range picker** (in addition to standard period buttons)
- **Rolling Sharpe overlay** in chart tooltips — shows rolling Sharpe value at each data point
- **Crosshair plugin** — vertical dashed line on chart hover
- **Complete Trade History** with reasoning — full table showing each trade with date, ticker, type, shares, price, commission, total value, running cash balance, current price, trade P&L, sentiment badge, conviction stars, thesis text, target price, stop loss, and tags
- **Journal Entries** linked to trades
- **Think Pieces** — published pieces shown as cards with gradient headers; drafts shown blurred with "Draft — not yet published" overlay

**Visibility toggles** (controlled in Settings): showHoldings, showTradeHistory, showBenchmarks, showExactValue, showThinkPieces, showSharpe.

**Portfolio value series computation (`computePortfolioReturnSeries`):** Replays trades day by day across the chart date range to produce a daily portfolio value series (uses avgCost as proxy for intraday price since historical per-stock prices aren't available for the portfolio series).

### 7.3 Log Trade (`logTrade.js`)

Two-column layout: Trade Execution (left) and Trade Reasoning (right).

**Trade Execution:**
- BUY/SELL toggle (styled buttons)
- Ticker search with Yahoo Finance autocomplete (debounced 300ms)
- Live price box after ticker selection (shows last, change %, high, low, "Use this price" link)
- Date/time picker (defaults to now), Currency selector (USD/GBP/EUR/JPY/CAD)
- Shares, Price per share, Commission inputs
- Live calculation summary: Trade Value, Commission, Cash After Trade (red if negative)
- Company Name (auto-filled from search), Sector, Country inputs
- SELL validation: checks current holdings to ensure sufficient shares

**Trade Reasoning:**
- Investment Thesis (textarea)
- Sentiment dropdown (Bullish/Neutral/Bearish)
- Conviction rating (1-5 star picker, click to fill)
- Tags (comma-separated text input)
- Target Price, Stop Loss inputs
- Link to Journal Entry dropdown (populated from existing entries)

**On confirm:** If thesis + sentiment provided and no existing journal entry for that ticker, auto-creates a journal entry linked to the trade.

### 7.4 Trade History (`tradeHistory.js`)

Sortable table with columns: Date, Ticker, Type, Shares, Price, Total Value, Cash After, Journal link badge.

**Features:**
- Click column headers to sort (toggles asc/desc)
- Filter by ticker (text search) and type (BUY/SELL dropdown)
- Running cash balance computed by replaying all trades chronologically
- CSV export with headers: Date, Ticker, Type, Shares, Price, Commission, Currency, Total Value, Thesis, Sentiment, Conviction, Tags

### 7.5 Journal (`journal.js`)

Timeline of investment thesis entries with CRUD.

**Features:**
- Filter by sentiment and minimum conviction level
- Cards show: ticker, title, sentiment badge, conviction stars, body text, date, linked trade badges, tags
- Modal editor for create/edit with fields: Ticker, Title, Thesis (textarea), Sentiment, Conviction (1-5), Tags

### 7.6 Think Pieces (`thinkPieces.js`)

Grid of article cards with gradient headers and emoji icons.

**Features:**
- Tabs: All / Published / Drafts
- Card shows: emoji header (rotating gradient backgrounds), title, date, status badge
- Modal editor: Title, Content (textarea, markdown supported), Status (draft/published), Emoji picker
- Preview modal showing formatted content
- Delete with confirmation

### 7.7 Analytics (`analytics.js`)

**Performance KPIs (4 cards):** Win Rate, Avg Gain (winners), Avg Loss (losers), Max Drawdown.

- Win/loss computed by matching BUY/SELL pairs per ticker (FIFO). A "closed" trade is any SELL that has a corresponding BUY.
- Max drawdown computed from running cash balance (simplified, without live prices).

**6M & 1Y Sharpe Table:** Same structure as Dashboard Sharpe table, but with ability to override the risk-free rate inline and recalculate. "Save as Default & Recalculate" saves the rate to settings globally.

**Sharpe Calculator:** Custom date range picker with quick presets (1M/3M/6M/YTD/1Y). Shows table of Sharpe ratios for Portfolio + all benchmarks. Displays "Sharpe Alpha" = Portfolio Sharpe minus best benchmark Sharpe.

### 7.8 Global Indexes (`globalIndexes.js`)

Directory of 110+ ETFs organized into 11 categories:

1. MSCI World & Global (6)
2. United States (10)
3. United Kingdom (6)
4. Europe (12)
5. Japan & Asia Pacific (8)
6. China (8)
7. Emerging Markets (15)
8. US Sector ETFs (11)
9. Thematic & Alternative (15)
10. Fixed Income & Bonds (10)
11. Money Market & Cash ETFs (6)

Each ETF has: ticker, full name, tags for search. Search filters by ticker, name, or tag. YTD returns loaded asynchronously via Yahoo Finance quotes.

### 7.9 Watchlist (`watchlist.js`)

**Features:**
- Add ticker via Yahoo Finance search
- Table shows: Ticker, Name, Price, Daily Change, 52W High, 52W Low, Alert status, Actions
- Price alerts: configurable target price. Badge shows "No Alert", "@ $X" (pending), or ">= $X checkmark" (triggered)
- Remove ticker button, configure alert modal

### 7.10 Snapshots (`snapshots.js`)

Point-in-time portfolio records.

**Create Snapshot:** Captures current portfolio state with live prices — total value, return, cash, position count, sector count, full holdings detail. Marks as "Monthly" if created on the 1st of the month.

**Card display:** Date, Latest badge, Monthly badge, Total Value, Return, Positions, Sectors.

**Actions:** View (modal with full holdings table), Share (copies text summary to clipboard), Delete.

### 7.11 Settings (`settings.js`)

Four sections:

1. **Portfolio Settings:** Name, Starting Cash, Base Currency (USD/GBP/EUR/JPY/CAD/CHF/AUD), Risk-Free Rate (%). Danger Zone: Reset All Data (triple confirmation).

2. **Public Page Visibility:** Toggle switches for each public view component (Holdings, Trade History, Benchmarks, Exact Value, Think Pieces, Sharpe).

3. **Cloud Sync (Firebase):** Google sign-in/disconnect, sync status badge, Force Push/Pull buttons. Shows Firebase setup instructions if not configured.

4. **Market Data Diagnostics:** Test buttons for Connection, Quote (SPY), History (SPY 1M), Search (AAPL). Full diagnostics runs all 6 steps: connectivity, live quote, historical data, symbol search, all 4 benchmark ETFs, cache verification. Log output in monospace console-style div.

5. **Data Management:** Export All Data (JSON), Import Data (JSON — merges with existing data).

### 7.12 Login (`login.js`)

Full-screen login card with:
- Username/password fields with Enter-key navigation
- Password show/hide toggle
- Error/success message display
- Google sign-in button for cloud sync (separate from site auth)
- "Forgot credentials?" mailto link
- Link to public pages (accessible without login)

---

## 8. UI/UX Design System

### 8.1 CSS Architecture (`css/styles.css`)

Single file, 1565 lines. CSS custom properties for theming. No dark mode currently.

**CSS Variables (key):**
```css
--bg: #f5f6fa;
--bg-card: #ffffff;
--text: #1e2028;
--text-muted: #5f6578;
--primary: #4f46e5;        /* Indigo */
--green: #16a34a;
--red: #dc2626;
--yellow: #d97706;
--blue: #2563eb;
--purple: #7c3aed;
--font: 'Inter', sans-serif;
--font-mono: 'JetBrains Mono', monospace;
--sidebar-w: 260px;
--radius: 12px;
```

**Typography:** Inter (300-700) for body, JetBrains Mono (400-600) for code/data. Base font size 14px.

**Layout:** Fixed sidebar (260px) + scrollable main content. Sidebar collapses to hamburger menu at <= 768px.

### 8.2 Component Patterns

| Component | CSS Class | Description |
|-----------|-----------|-------------|
| Page header | `.page-header` | Title + description + action button |
| KPI cards | `.kpi-grid > .kpi-card` | 4-column grid of metric cards |
| Data cards | `.card` | White card with shadow, 12px radius |
| Tables | `.table-wrap > table` | Scrollable table container |
| Forms | `.form-group > .form-label + .form-control` | Standard form layout |
| Buttons | `.btn`, `.btn-primary`, `.btn-sm`, `.btn-green`, `.btn-red` | Button variants |
| Badges | `.badge`, `.badge-buy`, `.badge-sell`, `.badge-published`, `.badge-draft` | Status badges |
| Modals | `.modal-overlay > .modal` | Centered overlay modal |
| Toggle switch | `.toggle-switch > input + .slider` | iOS-style toggle |
| Horizontal bars | `.hbar-chart > .hbar-row` | Allocation bar charts |
| Weight bars | `.weight-bar` | Inline progress bars in tables |
| Status pills | `.rating-pill` | Color-coded Sharpe rating pills |
| Loading | `.loading-overlay`, `.loading-spinner` | Full-screen and inline spinners |
| Toast | `.toast-container > .toast` | Top-right notification toasts |
| Yahoo banner | `.yahoo-refresh-banner` | Top progress banner during refresh |

### 8.3 Responsive Design

- Sidebar collapses at 768px to hamburger menu with slide-out overlay
- KPI grid collapses to 2 columns on tablet, 1 on mobile
- Grid-2 and grid-3 layouts collapse to single column on mobile
- Tables scroll horizontally on small screens
- Chart containers are responsive (`responsive: true, maintainAspectRatio: false`)

### 8.4 Loading States

1. **Initial overlay:** Shows during Firebase init + cloud pull with step indicators
2. **Yahoo refresh banner:** Persistent banner above page content showing progress (ticker name + %)
3. **Toast notifications:** "Cloud data loaded", "Yahoo Finance data updated", "Yahoo Finance offline"
4. **Per-section spinners:** Tables show "Loading..." placeholder rows

---

## 9. Chart.js Configuration

**Version:** 4.4.1 (loaded from CDN)

**Performance chart (Dashboard + Public View):**
- Type: line
- Interaction: index mode, no intersect (crosshair)
- Tooltip: white background, shows all series at that x-value
- No legend (series toggles are custom buttons)
- X-axis: max 12 ticks, date labels
- Y-axis: percentage format
- Datasets: 2px line, no points, tension 0.3, 10% alpha fill

**Public View additions:**
- Custom crosshair plugin (vertical dashed line on hover)
- Rolling Sharpe values in tooltip callbacks
- `spanGaps: true` for series with different start dates

---

## 10. Key Algorithms

### 10.1 Sharpe Ratio

```
dailyRf = annualRate / 252
excessReturns[i] = dailyReturn[i] - dailyRf
mean = avg(excessReturns)
variance = sum((r - mean)^2) / (n - 1)
stdDev = sqrt(variance)
annReturn = mean * 252
annVol = stdDev * sqrt(252)
sharpe = annReturn / annVol
```

### 10.2 Rolling Sharpe (Public View)

For each index `i >= windowDays`:
1. Take price slice `[i - windowDays, i + 1]`
2. Compute daily returns within window
3. Calculate Sharpe ratio for that window
4. Store at index `i` in result array (earlier indices are null)

### 10.3 Cumulative Returns

```
base = prices[0]
cumulativeReturns[i] = ((prices[i] - base) / base) * 100
```

### 10.4 Max Drawdown

```
peak = prices[0]
for each price:
  if price > peak: peak = price
  dd = (peak - price) / peak
  if dd > maxDd: maxDd = dd
return maxDd * 100
```

### 10.5 Series Alignment

Given multiple series with different date ranges:
1. Build union of all dates, sorted
2. For each series, create date→close lookup
3. Forward-fill: walk the sorted dates, use last known close for missing dates
4. Result: common `labels` array + `aligned` object with arrays of same length

---

## 11. Country Flags

Emoji flags mapped by country code or name: USA/US, UK/GB, DE/Germany, FR/France, JP/Japan, CN/China, CA/Canada, AU/Australia, KR/Korea, TW/Taiwan, IN/India, BR/Brazil, HK, SG, NL/Netherlands, CH/Switzerland, SE/Sweden, IE/Ireland, IL/Israel, IT/Italy, ES/Spain, MX/Mexico, TR/Turkey, SA, ZA. Default: globe emoji.

---

## 12. Global Index ETF Database

The `GlobalIndexes` module contains a hardcoded catalog of 110+ ETFs across 11 categories (see section 7.8). Each ETF has ticker, full name, and searchable tags. This data is static — not fetched from any API.

---

## 13. Error Handling Patterns

- **Yahoo Finance failures:** Fall back to `Storage.getLastKnownPrice()` or `Storage.getLastKnownHistory()` (persistent cache that never expires)
- **Firebase timeout:** 10s timeout on init pull; app renders with local data if Firebase is slow
- **CORS proxy failures:** Rotate to next proxy on retry, exponential backoff
- **localStorage quota:** Clear history caches on `QuotaExceededError`, retry once
- **Page render errors:** Caught in `App.renderPage()`, shows error message in page content
- **Popup blocked:** Google sign-in falls back to redirect flow

---

## 14. Sharpe Tooltip System

A global event-delegation system for Sharpe ratio hover tooltips:

1. Elements with class `sharpe-tip` and `data-sharpe-tip` attribute contain tooltip text
2. A fixed-position popup div (`#sharpe-popup`) is positioned near the hovered element
3. Prefers placement above; falls below if not enough room
4. Horizontally clamped to viewport
5. All tooltip logic is in `index.html` inline script

---

## 15. External Dependencies

| Dependency | Version | Source | Purpose |
|-----------|---------|--------|---------|
| Inter font | Variable | Google Fonts | Body text |
| JetBrains Mono | Variable | Google Fonts | Monospace/data |
| Chart.js | 4.4.1 | cdnjs | Performance charts |
| Firebase App | 10.12.0 | gstatic | Firebase core |
| Firebase Auth | 10.12.0 | gstatic | Google authentication |
| Firebase Database | 10.12.0 | gstatic | Realtime Database |

No npm packages. No build step. No bundler.

---

## 16. Deployment Notes

- Serve as static files from any web server
- Firebase config in `firebaseConfig.js` must match your Firebase project
- Firebase Realtime Database rules: use `firebase-rules.json`
- Enable Google sign-in in Firebase Console → Authentication → Sign-in method
- Google sign-in requires HTTPS or localhost (not `file://` protocol)
- The `interactive-brokers-web-api/` subdirectory is a separate project (git submodule) and is excluded via `.gitignore`
