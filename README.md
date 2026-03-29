# Virtual Investment Portfolio

A single-page web app for tracking a virtual investment portfolio with live Yahoo Finance data, Cloudflare cloud storage, and a shareable public view.

**Live site:** [virtual-investment-portfolio.pages.dev](https://virtual-investment-portfolio.pages.dev)

---

## Tech Stack

- **Frontend:** Vanilla HTML, CSS, JavaScript (no frameworks, no build step)
- **Charts:** Chart.js 4.4.1
- **Hosting:** Cloudflare Pages (auto-deploys from this repo on every push to `main`)
- **Database:** Cloudflare KV (key-value store for portfolio data, prices, credentials)
- **Serverless API:** Cloudflare Pages Functions (in `functions/` directory)
- **Cron Worker:** Separate Cloudflare Worker that refreshes Yahoo Finance data on a schedule

---

## Project Structure

```
virtual-investment-portfolio/
|
|-- index.html                      <- Single HTML entry point (loads all JS/CSS)
|-- css/styles.css                  <- All styles (dark theme, responsive layout)
|-- wrangler.toml                   <- Cloudflare Pages config (KV binding)
|
|-- js/                             <- FRONTEND CODE (runs in the browser)
|   |-- config.js                   <- All settings, constants, and defaults in one place
|   |-- storage.js                  <- Local data layer (localStorage + cache management)
|   |-- cloudSync.js                <- Syncs local data with Cloudflare KV via API
|   |-- marketData.js               <- Yahoo Finance client (quotes, history, search)
|   |-- auth.js                     <- Login/logout, session management, SHA-256 hashing
|   |-- utils.js                    <- Formatting helpers, date math, Sharpe ratio calc
|   |-- yahooRefresh.js             <- Background price refresh orchestrator
|   |-- app.js                      <- Single-page router, page navigation, startup
|   |
|   |-- pages/                      <- ONE FILE PER PAGE (each renders into #page-content)
|       |-- dashboard.js            <- Main page: KPIs, chart, holdings, allocations
|       |-- analytics.js            <- Sharpe ratios, performance deep-dive
|       |-- globalIndexes.js        <- 110+ global ETFs organized by region
|       |-- publicView.js           <- Shareable read-only portfolio view
|       |-- logTrade.js             <- Form to log BUY/SELL/DIVIDEND trades
|       |-- tradeHistory.js         <- Sortable trade history table + CSV export
|       |-- journal.js              <- Investment notes with sentiment tagging
|       |-- thinkPieces.js          <- Long-form research articles
|       |-- watchlist.js            <- Track stocks with price alerts
|       |-- snapshots.js            <- Save & compare portfolio snapshots
|       |-- settings.js             <- App config, public page toggles, data export
|       |-- login.js                <- Login form
|       |-- forgotPassword.js       <- Request password reset email
|       |-- resetPassword.js        <- Complete password reset via emailed token
|
|-- functions/                      <- SERVERLESS API (runs on Cloudflare Pages)
|   |-- api/
|       |-- _helpers.js             <- Shared utilities (auth check, CORS, JSON responses)
|       |-- data.js                 <- GET/POST all portfolio data (KV read/write)
|       |-- data/[key].js           <- GET/POST a single data key (trades, journal, etc.)
|       |-- yahoo.js                <- Yahoo Finance proxy (avoids CORS issues)
|       |-- credentials/
|       |   |-- index.js            <- GET/POST login credential hashes
|       |   |-- verify.js           <- POST verify username + password hash
|       |-- history/
|       |   |-- [ticker].js         <- GET/POST cached price history per ticker
|       |-- reset/
|           |-- request.js          <- POST send password reset email (via Resend API)
|           |-- verify.js           <- POST check if reset token is valid
|           |-- complete.js         <- POST save new credentials after reset
|
|-- worker/                         <- CRON WORKER (separate Cloudflare Worker)
|   |-- src/index.js                <- Scheduled job: fetches Yahoo prices, updates KV
|   |-- wrangler.toml               <- Worker config (cron schedule, KV binding)
|
|-- .gitignore                      <- Files excluded from version control
```

---

## How It Works

1. **User visits the site** -> `index.html` loads, `app.js` routes to the correct page
2. **Data loads** -> `cloudSync.js` pulls portfolio data from Cloudflare KV via `/api/data`
3. **Prices update** -> `marketData.js` fetches live quotes from Yahoo Finance via `/api/yahoo`
4. **Background refresh** -> The cron worker (`worker/`) runs on a schedule to keep KV prices fresh
5. **User makes changes** -> Trades, journal entries, etc. save locally and sync to KV

---

## Deployment

**Frontend + API** (Cloudflare Pages): Automatic. Push to `main` and Cloudflare deploys.

**Cron Worker** (separate): Manual deploy from the `worker/` directory:
```bash
cd worker
npx wrangler deploy
```

---

## Environment Variables (Cloudflare Pages Dashboard)

| Variable | Purpose |
|---|---|
| `RESEND_API_KEY` | API key for sending password reset emails (via Resend) |
| `RESET_EMAIL` | Email address that receives password reset links |

The KV namespace (`PORTFOLIO_DATA`) is bound in `wrangler.toml`.
