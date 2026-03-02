// logTrade.js — Trade logging form with IBKR integration
const LogTrade = {
  tradeType: 'BUY',
  selectedTicker: null,
  selectedConid: null,
  liveQuote: null,
  searchTimeout: null,

  render(container) {
    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Log Trade</h1>
          <p class="page-desc">Record a trade execution with thesis</p>
        </div>
      </div>

      <div class="grid-2">
        <!-- Left: Trade Execution -->
        <div class="card">
          <div class="card-title" style="margin-bottom:16px">Trade Execution</div>

          <!-- BUY/SELL Toggle -->
          <div class="trade-type-toggle" style="margin-bottom:20px">
            <button class="toggle-btn ${this.tradeType === 'BUY' ? 'active-buy' : ''}" onclick="LogTrade.setType('BUY')">BUY</button>
            <button class="toggle-btn ${this.tradeType === 'SELL' ? 'active-sell' : ''}" onclick="LogTrade.setType('SELL')">SELL</button>
          </div>

          <!-- Ticker Search -->
          <div class="form-group">
            <label class="form-label">Ticker Symbol</label>
            <div style="position:relative">
              <input type="text" class="form-control" id="ticker-input" placeholder="Search ticker..." autocomplete="off"
                value="${this.selectedTicker || ''}" oninput="LogTrade.onTickerInput(this.value)">
              <div class="dropdown-results" id="ticker-results" style="display:none"></div>
            </div>
          </div>

          <!-- Live Price Box -->
          <div id="live-price-container"></div>

          <div class="grid-2" style="gap:12px">
            <div class="form-group">
              <label class="form-label">Date & Time</label>
              <input type="datetime-local" class="form-control" id="trade-date" value="${new Date().toISOString().slice(0,16)}">
            </div>
            <div class="form-group">
              <label class="form-label">Currency</label>
              <select class="form-control" id="trade-currency">
                <option value="USD">USD</option>
                <option value="GBP">GBP</option>
                <option value="EUR">EUR</option>
                <option value="JPY">JPY</option>
                <option value="CAD">CAD</option>
              </select>
            </div>
          </div>

          <div class="grid-2" style="gap:12px">
            <div class="form-group">
              <label class="form-label">Shares</label>
              <input type="number" class="form-control" id="trade-shares" placeholder="0" min="0" step="1" oninput="LogTrade.updateCalc()">
            </div>
            <div class="form-group">
              <label class="form-label">Price Per Share</label>
              <input type="number" class="form-control" id="trade-price" placeholder="0.00" min="0" step="0.01" oninput="LogTrade.updateCalc()">
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Commission</label>
            <input type="number" class="form-control" id="trade-commission" placeholder="0.00" min="0" step="0.01" value="0" oninput="LogTrade.updateCalc()">
          </div>

          <!-- Calculation Summary -->
          <div class="calc-summary" id="calc-summary">
            <div class="calc-row"><span class="label">Trade Value</span><span class="value" id="calc-value">$0.00</span></div>
            <div class="calc-row"><span class="label">Commission</span><span class="value" id="calc-comm">$0.00</span></div>
            <div class="calc-row total"><span class="label">Cash After Trade</span><span class="value" id="calc-cash">--</span></div>
          </div>

          <!-- Company Details (auto-filled) -->
          <div class="grid-2" style="gap:12px">
            <div class="form-group">
              <label class="form-label">Company Name</label>
              <input type="text" class="form-control" id="trade-company" placeholder="Auto-filled from search">
            </div>
            <div class="form-group">
              <label class="form-label">Sector</label>
              <input type="text" class="form-control" id="trade-sector" placeholder="e.g. Technology">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Country</label>
            <input type="text" class="form-control" id="trade-country" placeholder="e.g. USA">
          </div>

          <button class="btn ${this.tradeType === 'BUY' ? 'btn-green' : 'btn-red'}" style="width:100%;justify-content:center;margin-top:8px" onclick="LogTrade.confirmTrade()">
            Confirm ${this.tradeType === 'BUY' ? 'Buy' : 'Sell'}
          </button>
        </div>

        <!-- Right: Trade Reasoning -->
        <div class="card">
          <div class="card-title" style="margin-bottom:16px">Trade Reasoning</div>

          <div class="form-group">
            <label class="form-label">Investment Thesis</label>
            <textarea class="form-control" id="trade-thesis" rows="5" placeholder="Why are you making this trade? What's your conviction?"></textarea>
          </div>

          <div class="form-group">
            <label class="form-label">Sentiment</label>
            <select class="form-control" id="trade-sentiment">
              <option value="">Select...</option>
              <option value="Bullish">Bullish</option>
              <option value="Neutral">Neutral</option>
              <option value="Bearish">Bearish</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Conviction Rating</label>
            <div id="conviction-stars" style="font-size:1.5rem;cursor:pointer">
              ${[1,2,3,4,5].map(i => `<span class="star" onclick="LogTrade.setConviction(${i})" data-star="${i}">☆</span>`).join('')}
            </div>
            <input type="hidden" id="trade-conviction" value="0">
          </div>

          <div class="form-group">
            <label class="form-label">Tags</label>
            <input type="text" class="form-control" id="trade-tags" placeholder="Comma-separated: AI, growth, momentum">
          </div>

          <div class="grid-2" style="gap:12px">
            <div class="form-group">
              <label class="form-label">Target Price</label>
              <input type="number" class="form-control" id="trade-target" placeholder="0.00" min="0" step="0.01">
            </div>
            <div class="form-group">
              <label class="form-label">Stop Loss</label>
              <input type="number" class="form-control" id="trade-stoploss" placeholder="0.00" min="0" step="0.01">
            </div>
          </div>

          <div class="form-group" style="margin-top:16px">
            <label class="form-label">Link to Journal Entry</label>
            <select class="form-control" id="trade-journal-link">
              <option value="">None</option>
              ${Storage.getJournalEntries().map(j => `<option value="${j.id}">${j.ticker} — ${j.title || 'Untitled'}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>
    `;
  },

  setType(type) {
    this.tradeType = type;
    this.render(document.getElementById('page-content'));
  },

  onTickerInput: Utils.debounce(async function(val) {
    const results = document.getElementById('ticker-results');
    if (!results || val.length < 1) { if (results) results.style.display = 'none'; return; }

    try {
      const matches = await IBKR.searchSymbol(val.toUpperCase());
      if (matches.length) {
        results.style.display = 'block';
        results.innerHTML = matches.slice(0, 8).map(m =>
          `<div class="result-item" onclick="LogTrade.selectTicker('${Utils.escHtml(m.ticker)}', '${Utils.escHtml(m.name)}', ${m.conid || 0})">
            <span class="ticker">${Utils.escHtml(m.ticker)}</span>
            <span class="name">${Utils.escHtml(m.name)}</span>
          </div>`
        ).join('');
      } else {
        results.style.display = 'none';
      }
    } catch {
      results.style.display = 'none';
    }
  }, 300),

  async selectTicker(ticker, name, conid) {
    this.selectedTicker = ticker;
    this.selectedConid = conid;
    const input = document.getElementById('ticker-input');
    const company = document.getElementById('trade-company');
    const results = document.getElementById('ticker-results');
    if (input) input.value = ticker;
    if (company) company.value = name;
    if (results) results.style.display = 'none';

    // Fetch live quote
    if (conid || this.selectedTicker) {
      const container = document.getElementById('live-price-container');
      if (container) container.innerHTML = '<div class="live-price-box"><div class="price">Loading...</div></div>';

      try {
        const quote = await IBKR.getQuote(this.selectedTicker || conid);
        if (quote && container) {
          this.liveQuote = quote;
          const changeClass = quote.change >= 0 ? 'positive' : 'negative';
          container.innerHTML = `
            <div class="live-price-box">
              <div class="price">${Utils.formatCurrency(quote.last)}</div>
              <div class="meta">
                <span class="${changeClass}">${Utils.formatPercent(quote.change)}</span>
                &nbsp;·&nbsp; H: ${Utils.formatCurrency(quote.high)} &nbsp;·&nbsp; L: ${Utils.formatCurrency(quote.low)}
                &nbsp;·&nbsp; <a href="javascript:void(0)" onclick="LogTrade.usePrice(${quote.last})" style="color:var(--primary-light)">Use this price</a>
              </div>
            </div>
          `;
        }
      } catch {
        if (document.getElementById('live-price-container')) {
          document.getElementById('live-price-container').innerHTML = '<div class="live-price-box"><div class="meta">Could not fetch live price</div></div>';
        }
      }
    }
  },

  usePrice(price) {
    const el = document.getElementById('trade-price');
    if (el) { el.value = price.toFixed(2); this.updateCalc(); }
  },

  setConviction(n) {
    document.getElementById('trade-conviction').value = n;
    document.querySelectorAll('#conviction-stars .star').forEach((star, i) => {
      star.textContent = i < n ? '★' : '☆';
      star.classList.toggle('filled', i < n);
    });
  },

  updateCalc() {
    const shares = parseFloat(document.getElementById('trade-shares')?.value) || 0;
    const price = parseFloat(document.getElementById('trade-price')?.value) || 0;
    const comm = parseFloat(document.getElementById('trade-commission')?.value) || 0;
    const value = shares * price;
    const settings = Storage.getSettings();
    const { cash } = Storage.computeHoldings();
    const cashAfter = this.tradeType === 'BUY' ? cash - value - comm : cash + value - comm;

    const calcVal = document.getElementById('calc-value');
    const calcComm = document.getElementById('calc-comm');
    const calcCash = document.getElementById('calc-cash');
    if (calcVal) calcVal.textContent = Utils.formatCurrency(value);
    if (calcComm) calcComm.textContent = Utils.formatCurrency(comm);
    if (calcCash) {
      calcCash.textContent = Utils.formatCurrency(cashAfter);
      calcCash.style.color = cashAfter < 0 ? 'var(--red)' : 'var(--green)';
    }
  },

  confirmTrade() {
    const ticker = document.getElementById('ticker-input')?.value?.toUpperCase();
    const shares = parseFloat(document.getElementById('trade-shares')?.value);
    const price = parseFloat(document.getElementById('trade-price')?.value);
    const commission = parseFloat(document.getElementById('trade-commission')?.value) || 0;
    const date = document.getElementById('trade-date')?.value;
    const currency = document.getElementById('trade-currency')?.value || 'USD';
    const company = document.getElementById('trade-company')?.value || '';
    const sector = document.getElementById('trade-sector')?.value || '';
    const country = document.getElementById('trade-country')?.value || '';

    if (!ticker || !shares || !price || !date) {
      alert('Please fill in ticker, shares, price, and date.');
      return;
    }

    // Validate sell
    if (this.tradeType === 'SELL') {
      const { holdings } = Storage.computeHoldings();
      const holding = holdings.find(h => h.ticker === ticker);
      if (!holding || holding.shares < shares) {
        alert(`Cannot sell ${shares} shares of ${ticker}. You hold ${holding ? holding.shares : 0}.`);
        return;
      }
    }

    const trade = {
      type: this.tradeType,
      ticker,
      name: company,
      sector,
      country,
      shares,
      price,
      commission,
      currency,
      date: new Date(date).toISOString(),
      conid: this.selectedConid,
      // Reasoning
      thesis: document.getElementById('trade-thesis')?.value || '',
      sentiment: document.getElementById('trade-sentiment')?.value || '',
      conviction: parseInt(document.getElementById('trade-conviction')?.value) || 0,
      tags: (document.getElementById('trade-tags')?.value || '').split(',').map(t => t.trim()).filter(Boolean),
      targetPrice: parseFloat(document.getElementById('trade-target')?.value) || null,
      stopLoss: parseFloat(document.getElementById('trade-stoploss')?.value) || null,
      journalLink: document.getElementById('trade-journal-link')?.value || null
    };

    Storage.addTrade(trade);

    // Auto-create journal entry if thesis provided
    if (trade.thesis && trade.sentiment) {
      const existingEntries = Storage.getJournalEntries();
      const hasEntry = existingEntries.some(e => e.ticker === ticker && e.linkedTrades?.length);

      if (!hasEntry) {
        Storage.addJournalEntry({
          ticker,
          title: `${ticker} — ${trade.sentiment} Thesis`,
          body: trade.thesis,
          sentiment: trade.sentiment,
          conviction: trade.conviction,
          tags: trade.tags,
          linkedTrades: [trade.id],
          date: trade.date
        });
      }
    }

    alert(`${this.tradeType} trade logged: ${shares} shares of ${ticker} @ ${Utils.formatCurrency(price)}`);
    this.selectedTicker = null;
    this.selectedConid = null;
    this.liveQuote = null;
    this.render(document.getElementById('page-content'));
  }
};

window.LogTrade = LogTrade;
