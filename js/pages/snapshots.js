// snapshots.js — Point-in-time portfolio records
const Snapshots = {
  render(container) {
    const snapshots = Storage.getSnapshots().sort((a, b) => new Date(b.date) - new Date(a.date));

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Snapshots</h1>
          <p class="page-desc">Point-in-time portfolio records</p>
        </div>
        <button class="btn btn-primary" onclick="Snapshots.createSnapshot()">📸 Create Snapshot Now</button>
      </div>

      <div class="grid-3" id="snap-grid">
        ${snapshots.length === 0 ? `
          <div class="empty-state" style="grid-column:1/-1">
            <div class="icon">📸</div>
            <h3>No snapshots yet</h3>
            <p>Create your first portfolio snapshot</p>
          </div>
        ` : snapshots.map((s, i) => `
          <div class="snap-card">
            <div style="display:flex;justify-content:space-between;align-items:start">
              <div class="snap-date">${Utils.formatDate(s.date)}</div>
              <div>
                ${i === 0 ? '<span class="badge badge-published">Latest</span>' : ''}
                ${s.isMonthly ? '<span class="badge" style="background:var(--blue-bg);color:var(--blue);border:1px solid #3b82f640">Monthly</span>' : ''}
              </div>
            </div>
            <div class="snap-stats">
              <div class="snap-stat">
                <div class="label">Total Value</div>
                <div class="value">${Utils.formatCurrency(s.totalValue)}</div>
              </div>
              <div class="snap-stat">
                <div class="label">Return</div>
                <div class="value ${Utils.plClass(s.totalReturn)}">${Utils.formatPercent(s.totalReturn)}</div>
              </div>
              <div class="snap-stat">
                <div class="label">Positions</div>
                <div class="value">${s.positionCount || 0}</div>
              </div>
              <div class="snap-stat">
                <div class="label">Sectors</div>
                <div class="value">${s.sectorCount || 0}</div>
              </div>
            </div>
            <div style="margin-top:16px;display:flex;gap:8px">
              <button class="btn btn-sm" onclick="Snapshots.viewSnapshot('${s.id}')">View</button>
              <button class="btn btn-sm" onclick="Snapshots.shareSnapshot('${s.id}')">Share</button>
              <button class="btn btn-sm" style="color:var(--red)" onclick="Snapshots.deleteSnapshot('${s.id}')">Delete</button>
            </div>
          </div>
        `).join('')}
      </div>

      <div id="snap-modal"></div>
    `;
  },

  async createSnapshot() {
    const { holdings, cash } = Storage.computeHoldings();
    const settings = Storage.getSettings();

    // Try to get live prices
    let totalValue = cash;
    const holdingDetails = [];
    for (const h of holdings) {
      let price = h.avgCost;
      try {
        const quote = await IBKR.getQuote(h.ticker || h.conid);
        if (quote?.last) price = quote.last;
      } catch {}
      totalValue += h.shares * price;
      holdingDetails.push({ ...h, currentPrice: price, marketValue: h.shares * price });
    }

    const totalReturn = ((totalValue - settings.startingCash) / settings.startingCash * 100);
    const sectors = [...new Set(holdings.map(h => h.sector).filter(Boolean))];

    const now = new Date();
    const isMonthly = now.getDate() === 1;

    const snapshot = {
      date: now.toISOString(),
      totalValue,
      totalReturn,
      cash,
      positionCount: holdings.length,
      sectorCount: sectors.length,
      isMonthly,
      holdings: holdingDetails,
      sectors
    };

    Storage.addSnapshot(snapshot);
    this.render(document.getElementById('page-content'));
  },

  viewSnapshot(id) {
    const snap = Storage.getSnapshots().find(s => s.id === id);
    if (!snap) return;

    const modal = document.getElementById('snap-modal');
    modal.innerHTML = `
      <div class="modal-overlay" onclick="if(event.target===this)document.getElementById('snap-modal').innerHTML=''">
        <div class="modal" style="max-width:700px">
          <div class="modal-header">
            <h3>Snapshot — ${Utils.formatDate(snap.date)}</h3>
            <button class="modal-close" onclick="document.getElementById('snap-modal').innerHTML=''">&times;</button>
          </div>

          <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:16px">
            <div class="kpi-card">
              <div class="kpi-label">Total Value</div>
              <div class="kpi-value">${Utils.formatCurrency(snap.totalValue)}</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-label">Return</div>
              <div class="kpi-value ${Utils.plClass(snap.totalReturn)}">${Utils.formatPercent(snap.totalReturn)}</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-label">Cash</div>
              <div class="kpi-value">${Utils.formatCurrency(snap.cash)}</div>
            </div>
          </div>

          ${snap.holdings?.length ? `
            <div class="table-wrap">
              <table>
                <thead>
                  <tr><th>Ticker</th><th>Shares</th><th class="text-right">Price</th><th class="text-right">Value</th></tr>
                </thead>
                <tbody>
                  ${snap.holdings.map(h => `
                    <tr>
                      <td><strong>${Utils.escHtml(h.ticker)}</strong></td>
                      <td>${h.shares}</td>
                      <td class="text-right">${Utils.formatCurrency(h.currentPrice)}</td>
                      <td class="text-right">${Utils.formatCurrency(h.marketValue)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          ` : '<p style="color:var(--text-dim)">No holdings in this snapshot</p>'}
        </div>
      </div>
    `;
  },

  shareSnapshot(id) {
    const snap = Storage.getSnapshots().find(s => s.id === id);
    if (!snap) return;
    const text = `Portfolio Snapshot — ${Utils.formatDate(snap.date)}\nTotal Value: ${Utils.formatCurrency(snap.totalValue)}\nReturn: ${Utils.formatPercent(snap.totalReturn)}\nPositions: ${snap.positionCount} | Sectors: ${snap.sectorCount}`;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => alert('Snapshot copied to clipboard!'));
    } else {
      prompt('Copy this snapshot:', text);
    }
  },

  deleteSnapshot(id) {
    if (!confirm('Delete this snapshot?')) return;
    const snaps = Storage.getSnapshots().filter(s => s.id !== id);
    Storage.saveSnapshots(snaps);
    this.render(document.getElementById('page-content'));
  }
};

window.Snapshots = Snapshots;
