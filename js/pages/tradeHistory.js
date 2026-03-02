// tradeHistory.js — Sortable trade history table with filters and CSV export
const TradeHistory = {
  sortCol: 'date',
  sortDir: 'desc',
  filterType: '',
  filterTicker: '',

  render(container) {
    let trades = Storage.getTrades();
    const settings = Storage.getSettings();

    // Filter
    if (this.filterType) trades = trades.filter(t => t.type === this.filterType);
    if (this.filterTicker) trades = trades.filter(t => t.ticker.includes(this.filterTicker.toUpperCase()));

    // Sort
    trades = [...trades].sort((a, b) => {
      let va = a[this.sortCol], vb = b[this.sortCol];
      if (this.sortCol === 'date') { va = new Date(va); vb = new Date(vb); }
      if (this.sortCol === 'total') { va = a.shares * a.price; vb = b.shares * b.price; }
      if (typeof va === 'string') { va = va.toLowerCase(); vb = vb.toLowerCase(); }
      if (va < vb) return this.sortDir === 'asc' ? -1 : 1;
      if (va > vb) return this.sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    // Compute running cash
    const allTradesSorted = [...Storage.getTrades()].sort((a, b) => new Date(a.date) - new Date(b.date));
    const cashMap = {};
    let runCash = settings.startingCash;
    allTradesSorted.forEach(t => {
      const val = t.shares * t.price + (t.commission || 0);
      if (t.type === 'BUY') runCash -= val; else runCash += t.shares * t.price - (t.commission || 0);
      cashMap[t.id] = runCash;
    });

    const thClass = (col) => {
      if (this.sortCol !== col) return '';
      return this.sortDir === 'asc' ? 'sorted-asc' : 'sorted-desc';
    };

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Trade History</h1>
          <p class="page-desc">${trades.length} trade${trades.length !== 1 ? 's' : ''} recorded</p>
        </div>
        <button class="btn btn-sm" onclick="TradeHistory.exportCSV()">📥 Export CSV</button>
      </div>

      <div class="filter-bar">
        <div class="search-input">
          <input type="text" placeholder="Search ticker..." value="${this.filterTicker}" oninput="TradeHistory.filterTicker=this.value;TradeHistory.render(document.getElementById('page-content'))">
        </div>
        <select class="form-control" style="width:auto" onchange="TradeHistory.filterType=this.value;TradeHistory.render(document.getElementById('page-content'))">
          <option value="">All Types</option>
          <option value="BUY" ${this.filterType === 'BUY' ? 'selected' : ''}>Buy</option>
          <option value="SELL" ${this.filterType === 'SELL' ? 'selected' : ''}>Sell</option>
        </select>
      </div>

      <div class="card">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th class="${thClass('date')}" onclick="TradeHistory.sort('date')">Date</th>
                <th class="${thClass('ticker')}" onclick="TradeHistory.sort('ticker')">Ticker</th>
                <th class="${thClass('type')}" onclick="TradeHistory.sort('type')">Type</th>
                <th class="text-right ${thClass('shares')}" onclick="TradeHistory.sort('shares')">Shares</th>
                <th class="text-right ${thClass('price')}" onclick="TradeHistory.sort('price')">Price</th>
                <th class="text-right ${thClass('total')}" onclick="TradeHistory.sort('total')">Total Value</th>
                <th class="text-right">Cash After</th>
                <th class="text-center">Journal</th>
              </tr>
            </thead>
            <tbody>
              ${trades.length === 0 ? '<tr><td colspan="8" class="text-center" style="padding:32px;color:var(--text-dim)">No trades yet</td></tr>' :
                trades.map(t => `
                  <tr>
                    <td>${Utils.formatDateTime(t.date)}</td>
                    <td><strong>${Utils.escHtml(t.ticker)}</strong></td>
                    <td><span class="badge ${t.type === 'BUY' ? 'badge-buy' : 'badge-sell'}">${t.type}</span></td>
                    <td class="text-right">${Utils.formatNumber(t.shares)}</td>
                    <td class="text-right">${Utils.formatCurrency(t.price)}</td>
                    <td class="text-right">${Utils.formatCurrency(t.shares * t.price)}</td>
                    <td class="text-right">${Utils.formatCurrency(cashMap[t.id] || 0)}</td>
                    <td class="text-center">${t.journalLink || t.thesis ? '<span class="badge badge-linked">Linked</span>' : '<span style="color:var(--text-dim)">—</span>'}</td>
                  </tr>
                `).join('')
              }
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  sort(col) {
    if (this.sortCol === col) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortCol = col;
      this.sortDir = col === 'date' ? 'desc' : 'asc';
    }
    this.render(document.getElementById('page-content'));
  },

  exportCSV() {
    const trades = Storage.getTrades();
    if (!trades.length) { alert('No trades to export'); return; }

    const headers = ['Date','Ticker','Type','Shares','Price','Commission','Currency','Total Value','Thesis','Sentiment','Conviction','Tags'];
    const rows = trades.map(t => [
      new Date(t.date).toISOString(),
      t.ticker,
      t.type,
      t.shares,
      t.price,
      t.commission || 0,
      t.currency || 'USD',
      (t.shares * t.price).toFixed(2),
      `"${(t.thesis || '').replace(/"/g, '""')}"`,
      t.sentiment || '',
      t.conviction || '',
      (t.tags || []).join(';')
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trade_history_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
};

window.TradeHistory = TradeHistory;
