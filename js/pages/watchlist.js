// watchlist.js — Stock watchlist with alerts
const Watchlist = {
  render(container) {
    const items = Storage.getWatchlist();

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Watchlist</h1>
          <p class="page-desc">Track stocks you're watching but don't yet hold</p>
        </div>
      </div>

      <!-- Add Ticker -->
      <div class="card" style="margin-bottom:24px">
        <div style="display:flex;gap:12px;align-items:end">
          <div class="form-group" style="margin-bottom:0;flex:1;position:relative">
            <label class="form-label">Add Ticker</label>
            <input type="text" class="form-control" id="wl-ticker" placeholder="Search ticker..." oninput="Watchlist.onSearch(this.value)" autocomplete="off">
            <div class="dropdown-results" id="wl-results" style="display:none"></div>
          </div>
          <button class="btn btn-primary" onclick="Watchlist.addTicker()">Add</button>
        </div>
      </div>

      <!-- Watchlist Table -->
      <div class="card">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Ticker</th><th>Name</th>
                <th class="text-right">Price</th><th class="text-right">Daily Change</th>
                <th class="text-right">52W High</th><th class="text-right">52W Low</th>
                <th class="text-center">Alert</th><th class="text-center">Actions</th>
              </tr>
            </thead>
            <tbody id="wl-body">
              ${items.length === 0 ? '<tr><td colspan="8" class="text-center" style="padding:32px;color:var(--text-dim)">No items in watchlist. Add tickers above.</td></tr>' : ''}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Alert Modal -->
      <div id="wl-modal"></div>
    `;

    if (items.length) this.loadPrices(items);
  },

  onSearch: Utils.debounce(async function(val) {
    const results = document.getElementById('wl-results');
    if (!results || val.length < 1) { if (results) results.style.display = 'none'; return; }
    try {
      const matches = await MarketData.searchSymbol(val.toUpperCase());
      if (matches.length) {
        results.style.display = 'block';
        results.innerHTML = matches.slice(0, 6).map(m =>
          `<div class="result-item" onclick="Watchlist.selectFromSearch('${Utils.escHtml(m.ticker)}','${Utils.escHtml(m.name)}')">
            <span class="ticker">${Utils.escHtml(m.ticker)}</span>
            <span class="name">${Utils.escHtml(m.name)}</span>
          </div>`
        ).join('');
      } else results.style.display = 'none';
    } catch { if (results) results.style.display = 'none'; }
  }, 300),

  _selectedName: '',


  selectFromSearch(ticker, name) {
    document.getElementById('wl-ticker').value = ticker;
    document.getElementById('wl-results').style.display = 'none';
    this._selectedName = name;

  },

  addTicker() {
    const input = document.getElementById('wl-ticker');
    const ticker = input?.value?.toUpperCase();
    if (!ticker) return;

    const items = Storage.getWatchlist();
    if (items.find(i => i.ticker === ticker)) { alert('Already in watchlist'); return; }

    items.push({
      ticker,
      name: this._selectedName || ticker,

      alertPrice: null,
      alertTriggered: false,
      addedDate: new Date().toISOString()
    });
    Storage.saveWatchlist(items);
    this._selectedName = '';

    this.render(document.getElementById('page-content'));
  },

  removeTicker(ticker) {
    const items = Storage.getWatchlist().filter(i => i.ticker !== ticker);
    Storage.saveWatchlist(items);
    this.render(document.getElementById('page-content'));
  },

  async loadPrices(items) {
    const tbody = document.getElementById('wl-body');
    if (!tbody) return;

    const rows = [];
    for (const item of items) {
      let price = 0, change = 0, high52 = 0, low52 = 0;
      try {
        const quote = await MarketData.getQuote(item.ticker);
        if (quote) {
          price = quote.last;
          change = quote.change;
          high52 = quote.high;
          low52 = quote.low;
        }
      } catch {}

      // Check alert
      let alertStatus = 'none';
      let alertLabel = 'No Alert';
      if (item.alertPrice) {
        if (price >= item.alertPrice) {
          alertStatus = 'triggered';
          alertLabel = `≥ ${Utils.formatCurrency(item.alertPrice)} ✓`;
          // Mark triggered
          item.alertTriggered = true;
        } else {
          alertStatus = 'pending';
          alertLabel = `@ ${Utils.formatCurrency(item.alertPrice)}`;
        }
      }

      rows.push(`<tr>
        <td><strong>${Utils.escHtml(item.ticker)}</strong></td>
        <td>${Utils.escHtml(item.name)}</td>
        <td class="text-right">${price ? Utils.formatCurrency(price) : '--'}</td>
        <td class="text-right ${Utils.plClass(change)}">${change ? Utils.formatPercent(change) : '--'}</td>
        <td class="text-right">${high52 ? Utils.formatCurrency(high52) : '--'}</td>
        <td class="text-right">${low52 ? Utils.formatCurrency(low52) : '--'}</td>
        <td class="text-center"><span class="alert-badge ${alertStatus}">${alertLabel}</span></td>
        <td class="text-center">
          <button class="btn btn-sm" onclick="Watchlist.configureAlert('${Utils.escHtml(item.ticker)}')">⚙ Alert</button>
          <button class="btn btn-sm" style="color:var(--red)" onclick="Watchlist.removeTicker('${Utils.escHtml(item.ticker)}')">✕</button>
        </td>
      </tr>`);
    }

    tbody.innerHTML = rows.join('');
    Storage.saveWatchlist(items); // persist alert triggered state
  },

  configureAlert(ticker) {
    const items = Storage.getWatchlist();
    const item = items.find(i => i.ticker === ticker);
    if (!item) return;

    const modal = document.getElementById('wl-modal');
    modal.innerHTML = `
      <div class="modal-overlay" onclick="if(event.target===this)document.getElementById('wl-modal').innerHTML=''">
        <div class="modal" style="max-width:400px">
          <div class="modal-header">
            <h3>Configure Alert — ${ticker}</h3>
            <button class="modal-close" onclick="document.getElementById('wl-modal').innerHTML=''">&times;</button>
          </div>
          <div class="form-group">
            <label class="form-label">Alert when price reaches ($)</label>
            <input type="number" class="form-control" id="alert-price" value="${item.alertPrice || ''}" placeholder="0.00" step="0.01" min="0">
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-primary" style="flex:1;justify-content:center" onclick="Watchlist.saveAlert('${ticker}')">Save Alert</button>
            <button class="btn" style="flex:1;justify-content:center" onclick="Watchlist.clearAlert('${ticker}')">Clear Alert</button>
          </div>
        </div>
      </div>
    `;
  },

  saveAlert(ticker) {
    const price = parseFloat(document.getElementById('alert-price')?.value);
    if (!price || price <= 0) { alert('Enter a valid price'); return; }
    const items = Storage.getWatchlist();
    const item = items.find(i => i.ticker === ticker);
    if (item) { item.alertPrice = price; item.alertTriggered = false; }
    Storage.saveWatchlist(items);
    document.getElementById('wl-modal').innerHTML = '';
    this.render(document.getElementById('page-content'));
  },

  clearAlert(ticker) {
    const items = Storage.getWatchlist();
    const item = items.find(i => i.ticker === ticker);
    if (item) { item.alertPrice = null; item.alertTriggered = false; }
    Storage.saveWatchlist(items);
    document.getElementById('wl-modal').innerHTML = '';
    this.render(document.getElementById('page-content'));
  }
};

window.Watchlist = Watchlist;
