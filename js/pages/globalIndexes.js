/**
 * ============================================================================
 * GLOBALINDEXES.JS — Global ETF Catalog (110+ Indexes)
 * ============================================================================
 *
 * PURPOSE:
 *   Displays a searchable catalog of 110+ global ETFs organized by region/category.
 *   Shows daily change % fetched from cached quotes (pre-loaded by the cron worker)
 *   with a fallback to live Yahoo Finance calls for any missing tickers.
 *
 * DATA SOURCE:
 *   All ETF definitions live in Config.GLOBAL_INDEXES (config.js) — single source of truth.
 *   The cron worker pre-fetches quotes for all these tickers and stores them in KV.
 *   On page load, cached quotes appear instantly; missing ones are fetched live.
 *
 * HOW IT WORKS:
 *   1. Render categorized ETF grid with search filtering by ticker, name, or tag
 *   2. Load daily change % in two passes:
 *      Pass 1: Show cached quotes instantly from priceCache (loaded from KV on startup)
 *      Pass 2: Fetch any missing/stale quotes live from Yahoo Finance
 *
 * ============================================================================
 */

const GlobalIndexes = {
  /** Current search filter text (persists across re-renders) */
  searchQuery: '',

  /**
   * ETF categories — reads from Config.GLOBAL_INDEXES (the single source of truth).
   * Returns an array of { name, etfs: [{ ticker, name, tags }] } objects.
   */
  get categories() {
    return Config.GLOBAL_INDEXES;
  },

  /**
   * Render the Global Indexes page with searchable ETF catalog.
   * Displays categories with ETF tickers, names, and daily change %.
   * Loads change data asynchronously (cached first, then live).
   * @param {Element} container - The page content container
   */
  render(container) {
    // Filter ETFs by search query (matches ticker, name, or tags)
    const q = this.searchQuery.toLowerCase();
    let filteredCats = this.categories.map(cat => ({
      ...cat,
      etfs: cat.etfs.filter(e =>
        !q ||
        e.ticker.toLowerCase().includes(q) ||
        e.name.toLowerCase().includes(q) ||
        e.tags.some(t => t.includes(q))
      )
    })).filter(cat => cat.etfs.length > 0);

    const totalETFs = this.categories.reduce((s, c) => s + c.etfs.length, 0);

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Global Indexes</h1>
          <p class="page-desc">${totalETFs} ETFs across ${this.categories.length} categories</p>
        </div>
      </div>

      <div class="filter-bar">
        <div class="search-input" style="flex:1;max-width:500px">
          <input type="text" placeholder="Search by ticker, name, or tag (e.g. semiconductor, gold, emerging)..."
            value="${this.searchQuery}" oninput="GlobalIndexes.searchQuery=this.value;GlobalIndexes.render(document.getElementById('page-content'))">
        </div>
      </div>

      <div id="etf-categories">
        ${filteredCats.map(cat => `
          <div class="etf-category">
            <div class="etf-category-title">${Utils.escHtml(cat.name)} <span style="color:var(--text-dim);font-weight:400;font-size:0.85rem">(${cat.etfs.length})</span></div>
            <div class="etf-grid">
              ${cat.etfs.map(e => `
                <div class="etf-row">
                  <span class="etf-ticker">${Utils.escHtml(e.ticker)}</span>
                  <span class="etf-name">${Utils.escHtml(e.name)}</span>
                  <span class="etf-ytd" id="etf-ytd-${e.ticker.replace('.', '_')}">--</span>
                </div>
              `).join('')}
            </div>
          </div>
        `).join('')}

        ${filteredCats.length === 0 ? '<div class="empty-state"><div class="icon">🔍</div><h3>No matching ETFs</h3><p>Try a different search term</p></div>' : ''}
      </div>
    `;

    // Load change % asynchronously (best-effort, non-blocking)
    this.loadYTDReturns(filteredCats);
  },

  /**
   * Load daily change % for displayed ETFs in two passes:
   *   Pass 1: Show cached quotes instantly from priceCache (pre-populated by cron worker)
   *   Pass 2: Fetch live quotes for any tickers not in the cache
   *
   * This means the page loads fast (cached data appears immediately) and then
   * fills in any gaps with live data from Yahoo Finance.
   *
   * @param {Array} cats - Filtered categories with ETFs to load
   */
  async loadYTDReturns(cats) {
    // Pass 1: Show cached quotes instantly from KV-synced priceCache
    const cached = Storage.get('priceCache') || {};
    for (const cat of cats) {
      for (const etf of cat.etfs) {
        const q = cached[etf.ticker];
        if (q) {
          const el = document.getElementById(`etf-ytd-${etf.ticker.replace('.', '_')}`);
          if (el) {
            const change = q.change || 0;
            el.textContent = Utils.formatPercent(change);
            el.className = `etf-ytd ${Utils.plClass(change)}`;
          }
        }
      }
    }

    // Pass 2: Fetch live quotes for any that were missing OR broken in the cache.
    // A cached quote is "broken" if it has no valid last price (e.g., last=0/undefined).
    for (const cat of cats) {
      for (const etf of cat.etfs) {
        const cq = cached[etf.ticker];
        if (cq && cq.last > 0) continue; // Valid cached data — skip
        try {
          const quote = await MarketData.getQuote(etf.ticker);
          if (quote) {
            const el = document.getElementById(`etf-ytd-${etf.ticker.replace('.', '_')}`);
            if (el) {
              const change = quote.change || 0;
              el.textContent = Utils.formatPercent(change);
              el.className = `etf-ytd ${Utils.plClass(change)}`;
            }
          }
        } catch {
          // Silently skip — the "--" placeholder stays visible
        }
      }
    }
  }
};

window.GlobalIndexes = GlobalIndexes;
