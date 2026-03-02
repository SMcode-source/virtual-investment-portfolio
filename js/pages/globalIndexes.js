// globalIndexes.js — 110+ ETFs organized by category with search
const GlobalIndexes = {
  searchQuery: '',

  categories: [
    {
      name: 'MSCI World & Global',
      etfs: [
        { ticker: 'ACWI', name: 'iShares MSCI ACWI ETF', tags: ['global','world','all-country'] },
        { ticker: 'URTH', name: 'iShares MSCI World ETF', tags: ['global','world','developed'] },
        { ticker: 'VT', name: 'Vanguard Total World Stock ETF', tags: ['global','world','total'] },
        { ticker: 'VEA', name: 'Vanguard FTSE Developed Markets ETF', tags: ['developed','international'] },
        { ticker: 'VXUS', name: 'Vanguard Total International Stock ETF', tags: ['international','ex-us'] },
        { ticker: 'CWI', name: 'SPDR MSCI ACWI ex-US ETF', tags: ['global','ex-us'] },
      ]
    },
    {
      name: 'United States',
      etfs: [
        { ticker: 'SPY', name: 'SPDR S&P 500 ETF', tags: ['us','sp500','large-cap'] },
        { ticker: 'QQQ', name: 'Invesco NASDAQ 100 ETF', tags: ['us','nasdaq','tech','growth'] },
        { ticker: 'DIA', name: 'SPDR Dow Jones Industrial ETF', tags: ['us','dow','blue-chip'] },
        { ticker: 'IWM', name: 'iShares Russell 2000 ETF', tags: ['us','small-cap','russell'] },
        { ticker: 'VTI', name: 'Vanguard Total Stock Market ETF', tags: ['us','total-market'] },
        { ticker: 'VOO', name: 'Vanguard S&P 500 ETF', tags: ['us','sp500','large-cap'] },
        { ticker: 'MDY', name: 'SPDR S&P MidCap 400 ETF', tags: ['us','mid-cap'] },
        { ticker: 'RSP', name: 'Invesco S&P 500 Equal Weight ETF', tags: ['us','equal-weight'] },
        { ticker: 'MTUM', name: 'iShares MSCI USA Momentum ETF', tags: ['us','momentum','factor'] },
        { ticker: 'QUAL', name: 'iShares MSCI USA Quality ETF', tags: ['us','quality','factor'] },
      ]
    },
    {
      name: 'United Kingdom',
      etfs: [
        { ticker: 'EWU', name: 'iShares MSCI United Kingdom ETF', tags: ['uk','britain'] },
        { ticker: 'ISF.L', name: 'iShares Core FTSE 100 UCITS ETF', tags: ['uk','ftse100'] },
        { ticker: 'VMID.L', name: 'Vanguard FTSE 250 UCITS ETF', tags: ['uk','ftse250','mid-cap'] },
        { ticker: 'VUKE.L', name: 'Vanguard FTSE 100 UCITS ETF', tags: ['uk','ftse100'] },
        { ticker: 'IGLT.L', name: 'iShares Core UK Gilts UCITS ETF', tags: ['uk','bonds','gilts'] },
        { ticker: 'FKU', name: 'First Trust UK AlphaDEX ETF', tags: ['uk','smart-beta'] },
      ]
    },
    {
      name: 'Europe',
      etfs: [
        { ticker: 'EZU', name: 'iShares MSCI Eurozone ETF', tags: ['europe','eurozone'] },
        { ticker: 'VGK', name: 'Vanguard FTSE Europe ETF', tags: ['europe'] },
        { ticker: 'EWG', name: 'iShares MSCI Germany ETF', tags: ['germany','europe'] },
        { ticker: 'EWQ', name: 'iShares MSCI France ETF', tags: ['france','europe'] },
        { ticker: 'EWI', name: 'iShares MSCI Italy ETF', tags: ['italy','europe'] },
        { ticker: 'EWP', name: 'iShares MSCI Spain ETF', tags: ['spain','europe'] },
        { ticker: 'EWN', name: 'iShares MSCI Netherlands ETF', tags: ['netherlands','europe'] },
        { ticker: 'EWD', name: 'iShares MSCI Sweden ETF', tags: ['sweden','europe','nordic'] },
        { ticker: 'EWK', name: 'iShares MSCI Belgium ETF', tags: ['belgium','europe'] },
        { ticker: 'EWL', name: 'iShares MSCI Switzerland ETF', tags: ['switzerland','europe'] },
        { ticker: 'NORW', name: 'Global X MSCI Norway ETF', tags: ['norway','europe','nordic'] },
        { ticker: 'EDEN', name: 'iShares MSCI Denmark ETF', tags: ['denmark','europe','nordic'] },
      ]
    },
    {
      name: 'Japan & Asia Pacific',
      etfs: [
        { ticker: 'EWJ', name: 'iShares MSCI Japan ETF', tags: ['japan','asia'] },
        { ticker: 'DXJ', name: 'WisdomTree Japan Hedged Equity ETF', tags: ['japan','hedged'] },
        { ticker: 'JPXN', name: 'iShares JPX-Nikkei 400 ETF', tags: ['japan','nikkei','topix'] },
        { ticker: 'EWA', name: 'iShares MSCI Australia ETF', tags: ['australia','asia-pacific'] },
        { ticker: 'EWS', name: 'iShares MSCI Singapore ETF', tags: ['singapore','asia'] },
        { ticker: 'EWH', name: 'iShares MSCI Hong Kong ETF', tags: ['hong-kong','asia'] },
        { ticker: 'EWT', name: 'iShares MSCI Taiwan ETF', tags: ['taiwan','asia','semiconductor'] },
        { ticker: 'EWY', name: 'iShares MSCI South Korea ETF', tags: ['korea','asia'] },
      ]
    },
    {
      name: 'China',
      etfs: [
        { ticker: 'FXI', name: 'iShares China Large-Cap ETF', tags: ['china','large-cap'] },
        { ticker: 'MCHI', name: 'iShares MSCI China ETF', tags: ['china'] },
        { ticker: 'KWEB', name: 'KraneShares CSI China Internet ETF', tags: ['china','internet','tech'] },
        { ticker: 'ASHR', name: 'Xtrackers Harvest CSI 300 China A ETF', tags: ['china','a-shares'] },
        { ticker: 'CQQQ', name: 'Invesco China Technology ETF', tags: ['china','technology'] },
        { ticker: 'GXC', name: 'SPDR S&P China ETF', tags: ['china'] },
        { ticker: 'CHIQ', name: 'Global X MSCI China Consumer Disc ETF', tags: ['china','consumer'] },
        { ticker: 'CNYA', name: 'iShares MSCI China A ETF', tags: ['china','a-shares'] },
      ]
    },
    {
      name: 'Emerging Markets',
      etfs: [
        { ticker: 'EEM', name: 'iShares MSCI Emerging Markets ETF', tags: ['emerging','em'] },
        { ticker: 'VWO', name: 'Vanguard FTSE Emerging Markets ETF', tags: ['emerging','em'] },
        { ticker: 'INDA', name: 'iShares MSCI India ETF', tags: ['india','emerging'] },
        { ticker: 'EWZ', name: 'iShares MSCI Brazil ETF', tags: ['brazil','emerging','latam'] },
        { ticker: 'TUR', name: 'iShares MSCI Turkey ETF', tags: ['turkey','emerging'] },
        { ticker: 'EWW', name: 'iShares MSCI Mexico ETF', tags: ['mexico','emerging','latam'] },
        { ticker: 'EIDO', name: 'iShares MSCI Indonesia ETF', tags: ['indonesia','emerging','asean'] },
        { ticker: 'THD', name: 'iShares MSCI Thailand ETF', tags: ['thailand','emerging','asean'] },
        { ticker: 'VNM', name: 'VanEck Vietnam ETF', tags: ['vietnam','frontier','asean'] },
        { ticker: 'EZA', name: 'iShares MSCI South Africa ETF', tags: ['south-africa','emerging','africa'] },
        { ticker: 'ECH', name: 'iShares MSCI Chile ETF', tags: ['chile','emerging','latam'] },
        { ticker: 'EPOL', name: 'iShares MSCI Poland ETF', tags: ['poland','emerging','europe'] },
        { ticker: 'QAT', name: 'iShares MSCI Qatar ETF', tags: ['qatar','emerging','middle-east'] },
        { ticker: 'UAE', name: 'iShares MSCI UAE ETF', tags: ['uae','emerging','middle-east'] },
        { ticker: 'KSA', name: 'iShares MSCI Saudi Arabia ETF', tags: ['saudi','emerging','middle-east'] },
      ]
    },
    {
      name: 'US Sector ETFs',
      etfs: [
        { ticker: 'XLK', name: 'Technology Select Sector SPDR', tags: ['sector','technology','us'] },
        { ticker: 'XLF', name: 'Financial Select Sector SPDR', tags: ['sector','financials','us','banks'] },
        { ticker: 'XLV', name: 'Health Care Select Sector SPDR', tags: ['sector','healthcare','us'] },
        { ticker: 'XLE', name: 'Energy Select Sector SPDR', tags: ['sector','energy','us','oil'] },
        { ticker: 'XLY', name: 'Consumer Discretionary Select Sector SPDR', tags: ['sector','consumer','us'] },
        { ticker: 'XLP', name: 'Consumer Staples Select Sector SPDR', tags: ['sector','staples','us','defensive'] },
        { ticker: 'XLI', name: 'Industrial Select Sector SPDR', tags: ['sector','industrials','us'] },
        { ticker: 'XLU', name: 'Utilities Select Sector SPDR', tags: ['sector','utilities','us','defensive'] },
        { ticker: 'XLB', name: 'Materials Select Sector SPDR', tags: ['sector','materials','us'] },
        { ticker: 'XLRE', name: 'Real Estate Select Sector SPDR', tags: ['sector','real-estate','us','reit'] },
        { ticker: 'XLC', name: 'Communication Services Select Sector SPDR', tags: ['sector','communication','us','media'] },
      ]
    },
    {
      name: 'Thematic & Alternative',
      etfs: [
        { ticker: 'ARKK', name: 'ARK Innovation ETF', tags: ['innovation','disruptive','growth'] },
        { ticker: 'SOXX', name: 'iShares Semiconductor ETF', tags: ['semiconductor','chips','tech'] },
        { ticker: 'BOTZ', name: 'Global X Robotics & AI ETF', tags: ['robotics','ai','automation'] },
        { ticker: 'ICLN', name: 'iShares Global Clean Energy ETF', tags: ['clean-energy','esg','solar','wind'] },
        { ticker: 'TAN', name: 'Invesco Solar ETF', tags: ['solar','clean-energy','esg'] },
        { ticker: 'LIT', name: 'Global X Lithium & Battery Tech ETF', tags: ['lithium','battery','ev'] },
        { ticker: 'HACK', name: 'ETFMG Prime Cyber Security ETF', tags: ['cybersecurity','tech'] },
        { ticker: 'SKYY', name: 'First Trust Cloud Computing ETF', tags: ['cloud','saas','tech'] },
        { ticker: 'GLD', name: 'SPDR Gold Shares', tags: ['gold','commodity','safe-haven'] },
        { ticker: 'SLV', name: 'iShares Silver Trust', tags: ['silver','commodity'] },
        { ticker: 'VNQ', name: 'Vanguard Real Estate ETF', tags: ['real-estate','reit'] },
        { ticker: 'BITQ', name: 'Bitwise Crypto Industry Innovators ETF', tags: ['crypto','bitcoin','blockchain'] },
        { ticker: 'DRIV', name: 'Global X Autonomous & EV ETF', tags: ['ev','autonomous','vehicles'] },
        { ticker: 'ARKW', name: 'ARK Next Generation Internet ETF', tags: ['internet','innovation','tech'] },
        { ticker: 'ARKG', name: 'ARK Genomic Revolution ETF', tags: ['genomics','biotech','healthcare'] },
      ]
    },
    {
      name: 'Fixed Income & Bonds',
      etfs: [
        { ticker: 'AGG', name: 'iShares Core US Aggregate Bond ETF', tags: ['bonds','aggregate','us','fixed-income'] },
        { ticker: 'TLT', name: 'iShares 20+ Year Treasury Bond ETF', tags: ['bonds','treasury','long-term','us'] },
        { ticker: 'TIP', name: 'iShares TIPS Bond ETF', tags: ['bonds','tips','inflation','us'] },
        { ticker: 'EMB', name: 'iShares J.P. Morgan USD EM Bond ETF', tags: ['bonds','emerging','em'] },
        { ticker: 'HYG', name: 'iShares iBoxx $ High Yield Corporate Bond ETF', tags: ['bonds','high-yield','junk','corporate'] },
        { ticker: 'LQD', name: 'iShares iBoxx $ Investment Grade Corp Bond ETF', tags: ['bonds','investment-grade','corporate'] },
        { ticker: 'IEF', name: 'iShares 7-10 Year Treasury Bond ETF', tags: ['bonds','treasury','intermediate','us'] },
        { ticker: 'SHY', name: 'iShares 1-3 Year Treasury Bond ETF', tags: ['bonds','treasury','short-term','us'] },
        { ticker: 'BNDX', name: 'Vanguard Total International Bond ETF', tags: ['bonds','international'] },
        { ticker: 'MUB', name: 'iShares National Muni Bond ETF', tags: ['bonds','municipal','tax-free'] },
      ]
    },
    {
      name: 'Money Market & Cash ETFs',
      etfs: [
        { ticker: 'SGOV', name: 'iShares 0-3 Month Treasury Bond ETF', tags: ['money-market','treasury','cash','us'] },
        { ticker: 'BIL', name: 'SPDR Bloomberg 1-3 Month T-Bill ETF', tags: ['money-market','t-bill','cash','us'] },
        { ticker: 'SHV', name: 'iShares Short Treasury Bond ETF', tags: ['money-market','treasury','cash','us'] },
        { ticker: 'JPST', name: 'JPMorgan Ultra-Short Income ETF', tags: ['money-market','ultra-short','cash'] },
        { ticker: 'CSH2.L', name: 'iShares GBP Ultrashort Bond UCITS ETF', tags: ['money-market','gbp','cash','uk'] },
        { ticker: 'XEON.DE', name: 'Xtrackers EUR Overnight Rate Swap UCITS ETF', tags: ['money-market','eur','cash','europe'] },
      ]
    }
  ],

  render(container) {
    // Filter
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

    // Load YTD returns (async, best effort)
    this.loadYTDReturns(filteredCats);
  },

  async loadYTDReturns(cats) {
    // Batch load — attempt to get quotes for visible ETFs
    for (const cat of cats) {
      for (const etf of cat.etfs) {
        try {
          const quote = await MarketData.getQuote(etf.ticker);
          if (quote) {
            const el = document.getElementById(`etf-ytd-${etf.ticker.replace('.', '_')}`);
            if (el) {
              const ytd = quote.change || 0;
              el.textContent = Utils.formatPercent(ytd);
              el.className = `etf-ytd ${Utils.plClass(ytd)}`;
            }
          }
        } catch {}
      }
    }
  }
};

window.GlobalIndexes = GlobalIndexes;
