// analytics.js — Performance KPIs, Sharpe tables, Sharpe calculator
const Analytics = {
  calcStartDate: '',
  calcEndDate: '',
  calcRiskFree: null, // initialized from settings on render
  calcResults: null,

  render(container) {
    const trades = Storage.getTrades();
    const settings = Storage.getSettings();
    if (this.calcRiskFree === null) this.calcRiskFree = settings.riskFreeRate ?? 4.0;

    // Compute win/loss stats from closed trades
    const closedStats = this.computeClosedTradeStats(trades);

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Analytics</h1>
          <p class="page-desc">Portfolio performance analysis and risk metrics</p>
        </div>
      </div>

      <!-- Performance KPIs -->
      <div class="kpi-grid" style="margin-bottom:24px">
        <div class="kpi-card">
          <div class="kpi-label">Win Rate</div>
          <div class="kpi-value">${closedStats.winRate.toFixed(0)}%</div>
          <div class="kpi-sub">${closedStats.wins} of ${closedStats.total} closed</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Avg Gain (Winners)</div>
          <div class="kpi-value positive">${Utils.formatPercent(closedStats.avgGain)}</div>
          <div class="kpi-sub">${closedStats.wins} winning trades</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Avg Loss (Losers)</div>
          <div class="kpi-value negative">${Utils.formatPercent(closedStats.avgLoss)}</div>
          <div class="kpi-sub">${closedStats.losses} losing trades</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Max Drawdown</div>
          <div class="kpi-value negative">−${closedStats.maxDrawdown.toFixed(1)}%</div>
          <div class="kpi-sub">Peak to trough</div>
        </div>
      </div>

      <!-- 6M & 1Y Sharpe Table -->
      <div class="card" style="margin-bottom:24px">
        <div class="card-header">
          <div>
            <div class="card-title">Sharpe Ratio Comparison (6M & 1Y)</div>
            <div class="card-subtitle">Uses your saved risk-free rate. Override below to recalculate.</div>
          </div>
        </div>
        <div style="display:flex;gap:12px;align-items:end;flex-wrap:wrap;margin-bottom:16px">
          <div class="form-group" style="margin-bottom:0">
            <label class="form-label">Risk-Free Rate (%)</label>
            <input type="number" class="form-control" id="sharpe-table-rf" value="${settings.riskFreeRate ?? 4.0}" step="0.1" min="0" max="20" style="width:120px">
          </div>
          <button class="btn btn-primary btn-sm" onclick="Analytics.recalcSharpeTable()">Recalculate</button>
          <button class="btn btn-sm" onclick="Analytics.saveRfAndRecalc()" title="Save this rate to settings and recalculate everything">Save as Default & Recalculate</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th></th>
                <th class="text-center" colspan="3" style="border-bottom:2px solid var(--border)">6-Month</th>
                <th class="text-center" colspan="3" style="border-bottom:2px solid var(--border)">1-Year</th>
              </tr>
              <tr>
                <th>Series</th>
                <th class="text-right">Return</th><th class="text-right">Volatility</th><th class="text-center">Sharpe</th>
                <th class="text-right">Return</th><th class="text-right">Volatility</th><th class="text-center">Sharpe</th>
              </tr>
            </thead>
            <tbody id="analytics-sharpe-body">
              <tr><td colspan="7" class="text-center" style="padding:20px;color:var(--text-dim)">Loading benchmark data...</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Sharpe Calculator -->
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">Sharpe Ratio Calculator</div>
            <div class="card-subtitle">Custom period analysis with configurable risk-free rate</div>
          </div>
        </div>

        <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:end;margin-bottom:16px">
          <div class="form-group" style="margin-bottom:0">
            <label class="form-label">Start Date</label>
            <input type="date" class="form-control" id="calc-start" value="${this.calcStartDate}">
          </div>
          <div class="form-group" style="margin-bottom:0">
            <label class="form-label">End Date</label>
            <input type="date" class="form-control" id="calc-end" value="${this.calcEndDate || new Date().toISOString().split('T')[0]}">
          </div>
          <div class="form-group" style="margin-bottom:0">
            <label class="form-label">Risk-Free Rate (%)</label>
            <input type="number" class="form-control" id="calc-rf" value="${this.calcRiskFree}" step="0.1" min="0" max="20" style="width:100px">
          </div>
          <button class="btn btn-primary" onclick="Analytics.calculate()">Calculate</button>
        </div>

        <div class="chart-controls" style="margin-bottom:16px">
          <span class="label">Quick Presets:</span>
          ${['1M','3M','6M','YTD','1Y'].map(p =>
            `<button class="btn btn-sm" onclick="Analytics.setPreset('${p}')">${p}</button>`
          ).join('')}
        </div>

        <div id="calc-results">
          ${this.calcResults ? this.renderCalcResults() : '<div class="empty-state"><div class="icon">📊</div><h3>Select a date range and calculate</h3></div>'}
        </div>
      </div>
    `;

    // Load Sharpe data
    this.loadSharpeData();
  },

  computeClosedTradeStats(trades) {
    // Match BUY/SELL pairs per ticker
    const byTicker = {};
    const sorted = [...trades].sort((a, b) => new Date(a.date) - new Date(b.date));

    sorted.forEach(t => {
      if (!byTicker[t.ticker]) byTicker[t.ticker] = { buys: [], sells: [] };
      if (t.type === 'BUY') byTicker[t.ticker].buys.push(t);
      else byTicker[t.ticker].sells.push(t);
    });

    let wins = 0, losses = 0, totalGain = 0, totalLoss = 0;
    const pnlSeries = [];

    Object.entries(byTicker).forEach(([ticker, { buys, sells }]) => {
      sells.forEach(sell => {
        // Find matching buy (FIFO)
        const totalBuyCost = buys.reduce((s, b) => s + b.price * b.shares, 0);
        const totalBuyShares = buys.reduce((s, b) => s + b.shares, 0);
        const avgBuyPrice = totalBuyShares > 0 ? totalBuyCost / totalBuyShares : 0;
        const pnlPct = avgBuyPrice > 0 ? ((sell.price - avgBuyPrice) / avgBuyPrice * 100) : 0;

        if (pnlPct >= 0) { wins++; totalGain += pnlPct; }
        else { losses++; totalLoss += pnlPct; }
        pnlSeries.push(pnlPct);
      });
    });

    const total = wins + losses;
    return {
      total,
      wins,
      losses,
      winRate: total > 0 ? (wins / total * 100) : 0,
      avgGain: wins > 0 ? totalGain / wins : 0,
      avgLoss: losses > 0 ? totalLoss / losses : 0,
      maxDrawdown: this.computePortfolioDrawdown()
    };
  },

  computePortfolioDrawdown() {
    const settings = Storage.getSettings();
    const trades = [...Storage.getTrades()].sort((a, b) => new Date(a.date) - new Date(b.date));
    let cash = settings.startingCash;
    let peak = cash;
    let maxDd = 0;

    trades.forEach(t => {
      const val = t.shares * t.price + (t.commission || 0);
      if (t.type === 'BUY') cash -= val;
      else cash += t.shares * t.price - (t.commission || 0);
      // Approximate portfolio value as cash (simplified without live prices)
      if (cash > peak) peak = cash;
      const dd = peak > 0 ? ((peak - cash) / peak * 100) : 0;
      if (dd > maxDd) maxDd = dd;
    });

    return maxDd;
  },

  setPreset(period) {
    const end = new Date().toISOString().split('T')[0];
    const start = Utils.periodToStartDate(period);
    document.getElementById('calc-start').value = start;
    document.getElementById('calc-end').value = end;
    this.calcStartDate = start;
    this.calcEndDate = end;
  },

  async calculate() {
    this.calcStartDate = document.getElementById('calc-start')?.value;
    this.calcEndDate = document.getElementById('calc-end')?.value;
    this.calcRiskFree = parseFloat(document.getElementById('calc-rf')?.value) || 4.0;

    if (!this.calcStartDate || !this.calcEndDate) {
      alert('Please select both start and end dates');
      return;
    }

    const resultsEl = document.getElementById('calc-results');
    if (resultsEl) resultsEl.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';

    // Fetch benchmark data for the period
    const benchmarks = ['S&P 500', 'NASDAQ 100', 'FTSE 100', 'MSCI World'];
    const results = [];

    for (const bm of benchmarks) {
      try {
        const history = await MarketData.getBenchmarkHistoryByDate(bm, this.calcStartDate, this.calcEndDate);
        const prices = history.map(d => d.close);
        const returns = Utils.dailyReturns(prices);
        const sharpe = Utils.calcSharpeRatio(returns, this.calcRiskFree / 100);
        results.push({ name: bm, ...sharpe, dataPoints: history.length });
      } catch {
        results.push({ name: bm, sharpe: 0, annReturn: 0, annVol: 0, riskFreeRate: this.calcRiskFree / 100, dataPoints: 0 });
      }
    }

    // Portfolio Sharpe (placeholder — needs daily portfolio values)
    results.unshift({ name: 'Portfolio', sharpe: 0, annReturn: 0, annVol: 0, riskFreeRate: this.calcRiskFree / 100, dataPoints: 0 });

    this.calcResults = results;

    if (resultsEl) resultsEl.innerHTML = this.renderCalcResults();
  },

  renderCalcResults() {
    if (!this.calcResults) return '';

    // Find best benchmark Sharpe
    const benchSharpes = this.calcResults.filter(r => r.name !== 'Portfolio').map(r => r.sharpe);
    const bestBench = Math.max(...benchSharpes);
    const portfolioSharpe = this.calcResults[0]?.sharpe || 0;
    const sharpeAlpha = portfolioSharpe - bestBench;

    return `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Series</th>
              <th class="text-right">Ann. Return</th>
              <th class="text-right">Ann. Volatility</th>
              <th class="text-center">Sharpe Ratio</th>
              <th class="text-center">Rating</th>
            </tr>
          </thead>
          <tbody>
            ${this.calcResults.map(r => {
              const rating = Utils.sharpeRating(r.sharpe);
              return `<tr>
                <td><strong>${r.name}</strong></td>
                <td class="text-right ${Utils.plClass(r.annReturn)}">${Utils.formatPercent(r.annReturn)}</td>
                <td class="text-right">${r.annVol.toFixed(1)}%</td>
                <td class="text-center">${Utils.sharpeValue(r)}</td>
                <td class="text-center"><span class="rating-pill" style="background:${rating.bg};color:${rating.color}">${rating.label}</span></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      <div style="margin-top:12px;padding:10px 14px;background:var(--bg-input);border-radius:var(--radius-xs);font-size:0.85rem">
        <strong>Sharpe Alpha:</strong> <span class="${Utils.plClass(sharpeAlpha)}" style="font-family:var(--font-mono)">${sharpeAlpha.toFixed(2)}</span>
        <span style="color:var(--text-dim);margin-left:8px">(Portfolio Sharpe minus best benchmark)</span>
      </div>
    `;
  },

  async loadSharpeData(overrideRf) {
    const tbody = document.getElementById('analytics-sharpe-body');
    if (!tbody) return;

    const rf = overrideRf !== undefined ? overrideRf / 100 : (Storage.getSettings().riskFreeRate ?? 4.0) / 100;
    const benchmarks = ['S&P 500', 'NASDAQ 100', 'FTSE 100', 'MSCI World'];
    const zeroResult = { sharpe: 0, annReturn: 0, annVol: 0, riskFreeRate: rf, dataPoints: 0 };
    const rows = [{ name: 'Portfolio', r6m: { ...zeroResult }, r1y: { ...zeroResult } }];

    for (const bm of benchmarks) {
      try {
        const history = await MarketData.getBenchmarkHistory(bm, '1Y');
        const prices = history.map(d => d.close);
        const r6m = Utils.calcSharpeRatio(Utils.dailyReturns(prices.slice(-126)), rf);
        const r1y = Utils.calcSharpeRatio(Utils.dailyReturns(prices), rf);
        rows.push({ name: bm, r6m, r1y });
      } catch {
        rows.push({ name: bm, r6m: { ...zeroResult }, r1y: { ...zeroResult } });
      }
    }

    tbody.innerHTML = rows.map(r => {
      return `<tr>
        <td><strong>${r.name}</strong></td>
        <td class="text-right">${Utils.formatPercent(r.r6m.annReturn)}</td>
        <td class="text-right">${r.r6m.annVol.toFixed(1)}%</td>
        <td class="text-center">${Utils.sharpePill(r.r6m)}</td>
        <td class="text-right">${Utils.formatPercent(r.r1y.annReturn)}</td>
        <td class="text-right">${r.r1y.annVol.toFixed(1)}%</td>
        <td class="text-center">${Utils.sharpePill(r.r1y)}</td>
      </tr>`;
    }).join('');
  },

  // Recalculate the 6M/1Y Sharpe table using the override input
  recalcSharpeTable() {
    const rfInput = document.getElementById('sharpe-table-rf');
    const rf = parseFloat(rfInput?.value) || 4.0;
    // Also update the calculator's risk-free rate to stay in sync
    this.calcRiskFree = rf;
    const calcRfInput = document.getElementById('calc-rf');
    if (calcRfInput) calcRfInput.value = rf;
    this.loadSharpeData(rf);
  },

  // Save the risk-free rate to settings and recalculate everything
  saveRfAndRecalc() {
    const rfInput = document.getElementById('sharpe-table-rf');
    const rf = parseFloat(rfInput?.value) || 4.0;
    const s = Storage.getSettings();
    s.riskFreeRate = rf;
    Storage.saveSettings(s);
    this.calcRiskFree = rf;
    const calcRfInput = document.getElementById('calc-rf');
    if (calcRfInput) calcRfInput.value = rf;
    this.loadSharpeData(rf);
    // Also recalculate the custom calculator if results exist
    if (this.calcResults) this.calculate();
  }
};

window.Analytics = Analytics;
