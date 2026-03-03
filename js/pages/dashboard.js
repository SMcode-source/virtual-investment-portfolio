// dashboard.js — Dashboard page with time machine, KPIs, charts, holdings, allocations, Sharpe
const Dashboard = {
  timeMachineDate: null,
  performanceChart: null,
  selectedPeriod: '1Y',
  sharpeWindow: 365,
  visibleSeries: { portfolio: true, sp500: true, nasdaq: true, ftse: true, msci: true },

  async render(container) {
    const settings = Storage.getSettings();
    const asOf = this.timeMachineDate;
    const { holdings, cash } = Storage.computeHoldings(asOf);

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Dashboard</h1>
          <p class="page-desc">${settings.portfolioName}</p>
        </div>
        <div id="market-badge">${MarketData.getStatusBadge()}</div>
      </div>

      <!-- Time Machine -->
      <div class="time-machine">
        <span class="time-machine-label">⏰ Time Machine</span>
        <input type="date" id="tm-date" value="${asOf || ''}" max="${new Date().toISOString().split('T')[0]}">
        <button class="btn-sm" onclick="Dashboard.goToDate()">View Date</button>
        ${asOf ? `<span class="time-badge">Viewing: ${Utils.formatDate(asOf)}</span><button class="btn-sm" onclick="Dashboard.backToCurrent()">Back to Current</button>` : ''}
      </div>

      <!-- KPI Cards -->
      <div class="kpi-grid" id="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-label">Portfolio Value</div>
          <div class="kpi-value" id="kpi-total-value">--</div>
          <div class="kpi-sub">Including cash</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Total Return</div>
          <div class="kpi-value" id="kpi-total-return">--</div>
          <div class="kpi-sub" id="kpi-sp500-compare">vs S&P 500: --</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Cash Balance</div>
          <div class="kpi-value" id="kpi-cash">${Utils.formatCurrency(cash)}</div>
          <div class="kpi-sub" id="kpi-cash-pct">--</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Open Positions</div>
          <div class="kpi-value">${holdings.length}</div>
          <div class="kpi-sub">${[...new Set(holdings.map(h => h.sector).filter(Boolean))].length} sectors</div>
        </div>
      </div>

      <!-- Performance Chart -->
      <div class="card" style="margin-bottom:24px">
        <div class="card-header">
          <div class="card-title">Performance vs Benchmarks</div>
        </div>
        <div class="chart-controls">
          <span class="label">Period:</span>
          <div class="btn-group" id="period-btns">
            ${['1M','3M','6M','YTD','1Y','2Y','5Y','All'].map(p =>
              `<button class="btn btn-sm ${p === this.selectedPeriod ? 'active' : ''}" onclick="Dashboard.setPeriod('${p}')">${p}</button>`
            ).join('')}
          </div>
          <span class="label" style="margin-left:12px">Sharpe Window:</span>
          <div class="btn-group" id="sharpe-window-btns">
            ${[{l:'90d',v:90},{l:'180d',v:180},{l:'365d',v:365},{l:'730d',v:730}].map(w =>
              `<button class="btn btn-sm ${w.v === this.sharpeWindow ? 'active' : ''}" onclick="Dashboard.setSharpeWindow(${w.v})">${w.l}</button>`
            ).join('')}
          </div>
        </div>
        <div class="chart-controls">
          <span class="label">Series:</span>
          ${Object.entries({portfolio:'Portfolio',sp500:'S&P 500',nasdaq:'NASDAQ 100',ftse:'FTSE 100',msci:'MSCI World'}).map(([k,v]) =>
            `<button class="btn btn-sm ${this.visibleSeries[k] ? 'active' : ''}" onclick="Dashboard.toggleSeries('${k}')">${v}</button>`
          ).join('')}
        </div>
        <div class="chart-container">
          <canvas id="performance-chart" height="300"></canvas>
        </div>
      </div>

      <!-- Holdings Table -->
      <div class="card" style="margin-bottom:24px">
        <div class="card-header">
          <div class="card-title">Holdings</div>
          <button class="btn btn-sm btn-primary" onclick="App.navigate('logTrade')">+ Log Trade</button>
        </div>
        <div class="table-wrap">
          <table id="holdings-table">
            <thead>
              <tr>
                <th>Ticker</th><th>Company</th><th>Sector</th><th>Country</th>
                <th class="text-right">Shares</th><th class="text-right">Avg Cost</th>
                <th class="text-right">Price</th><th class="text-right">Market Value</th>
                <th class="text-right">P&L</th><th>Weight</th>
              </tr>
            </thead>
            <tbody id="holdings-body">
              ${holdings.length === 0 ? '<tr><td colspan="10" class="text-center" style="padding:32px;color:var(--text-dim)">No holdings yet. <a href="#logTrade">Log your first trade</a></td></tr>' : ''}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Sector & Country Allocation -->
      <div class="grid-2" style="margin-bottom:24px">
        <div class="card">
          <div class="card-title" style="margin-bottom:16px">Sector Allocation</div>
          <div class="hbar-chart" id="sector-bars"></div>
        </div>
        <div class="card">
          <div class="card-title" style="margin-bottom:16px">Country Allocation</div>
          <div class="hbar-chart" id="country-bars"></div>
        </div>
      </div>

      <!-- Sharpe Ratios at a Glance -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">Sharpe Ratios at a Glance</div>
          <a href="#analytics" class="btn btn-sm">Full Calculator →</a>
        </div>
        <div class="table-wrap">
          <table id="sharpe-table">
            <thead>
              <tr>
                <th></th>
                <th colspan="3" class="text-center">6-Month</th>
                <th colspan="3" class="text-center">1-Year</th>
              </tr>
              <tr>
                <th>Series</th>
                <th class="text-right">Ann. Return</th><th class="text-right">Ann. Vol</th><th class="text-center">Sharpe</th>
                <th class="text-right">Ann. Return</th><th class="text-right">Ann. Vol</th><th class="text-center">Sharpe</th>
              </tr>
            </thead>
            <tbody id="sharpe-body">
              <tr><td colspan="7" class="text-center" style="padding:20px;color:var(--text-dim)">Loading Sharpe data...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    `;

    // Load live data
    this.loadHoldingsWithPrices(holdings, cash);
    this.loadPerformanceChart();
  },

  goToDate() {
    const input = document.getElementById('tm-date');
    if (input && input.value) {
      this.timeMachineDate = input.value;
      this.render(document.getElementById('page-content'));
    }
  },

  backToCurrent() {
    this.timeMachineDate = null;
    this.render(document.getElementById('page-content'));
  },

  setPeriod(p) {
    this.selectedPeriod = p;
    this.render(document.getElementById('page-content'));
  },

  setSharpeWindow(w) {
    this.sharpeWindow = w;
    this.render(document.getElementById('page-content'));
  },

  toggleSeries(key) {
    this.visibleSeries[key] = !this.visibleSeries[key];
    this.render(document.getElementById('page-content'));
  },

  async loadHoldingsWithPrices(holdings, cash) {
    const tbody = document.getElementById('holdings-body');
    if (!holdings.length) return;

    // Try getting live prices from MarketData
    let totalMarketValue = cash;
    const rows = [];

    for (const h of holdings) {
      let currentPrice = h.avgCost; // fallback
      try {
        const quote = await MarketData.getQuote(h.ticker);
        if (quote && quote.last) currentPrice = quote.last;
      } catch {}

      const marketValue = h.shares * currentPrice;
      const pl = (currentPrice - h.avgCost) * h.shares;
      const plPct = h.avgCost > 0 ? ((currentPrice - h.avgCost) / h.avgCost * 100) : 0;
      totalMarketValue += marketValue;

      rows.push({ ...h, currentPrice, marketValue, pl, plPct });
    }

    // Update KPIs
    const totalValue = totalMarketValue;
    const settings = Storage.getSettings();
    const totalReturn = ((totalValue - settings.startingCash) / settings.startingCash * 100);

    const kpiVal = document.getElementById('kpi-total-value');
    const kpiReturn = document.getElementById('kpi-total-return');
    const kpiCash = document.getElementById('kpi-cash');
    const kpiCashPct = document.getElementById('kpi-cash-pct');

    if (kpiVal) kpiVal.textContent = Utils.formatCurrency(totalValue);
    if (kpiReturn) {
      kpiReturn.textContent = Utils.formatPercent(totalReturn);
      kpiReturn.className = `kpi-value ${Utils.plClass(totalReturn)}`;
    }
    if (kpiCash) kpiCash.textContent = Utils.formatCurrency(cash);
    if (kpiCashPct) kpiCashPct.textContent = `${(cash / totalValue * 100).toFixed(1)}% of portfolio`;

    // Render holdings table
    if (tbody) {
      tbody.innerHTML = rows.map(r => {
        const weight = (r.marketValue / totalValue * 100);
        return `<tr>
          <td><strong>${Utils.escHtml(r.ticker)}</strong></td>
          <td>${Utils.escHtml(r.name)}</td>
          <td>${Utils.escHtml(r.sector)}</td>
          <td>${Utils.getFlag(r.country)} ${Utils.escHtml(r.country)}</td>
          <td class="text-right">${Utils.formatNumber(r.shares)}</td>
          <td class="text-right">${Utils.formatCurrency(r.avgCost)}</td>
          <td class="text-right">${Utils.formatCurrency(r.currentPrice)}</td>
          <td class="text-right">${Utils.formatCurrency(r.marketValue)}</td>
          <td class="text-right ${Utils.plClass(r.pl)}">
            ${Utils.formatCurrency(r.pl)} (${Utils.formatPercent(r.plPct)})
          </td>
          <td>
            <div class="weight-bar">
              <div class="weight-bar-track"><div class="weight-bar-fill" style="width:${Math.min(weight * 2, 100)}%"></div></div>
              <span class="weight-bar-label">${weight.toFixed(1)}%</span>
            </div>
          </td>
        </tr>`;
      }).join('');
    }

    // Render allocation bars
    this.renderAllocationBars(rows, totalValue);
  },

  renderAllocationBars(rows, totalValue) {
    // Sector allocation
    const sectorMap = {};
    rows.forEach(r => {
      const s = r.sector || 'Other';
      sectorMap[s] = (sectorMap[s] || 0) + r.marketValue;
    });
    const sectors = Object.entries(sectorMap).sort((a, b) => b[1] - a[1]);
    const sectorColors = ['#6366f1','#8b5cf6','#06b6d4','#22c55e','#f59e0b','#ef4444','#ec4899','#14b8a6','#f97316','#64748b'];
    const sectorEl = document.getElementById('sector-bars');
    if (sectorEl) {
      sectorEl.innerHTML = sectors.map(([name, val], i) => {
        const pct = (val / totalValue * 100);
        return `<div class="hbar-row">
          <span class="hbar-label">${Utils.escHtml(name)}</span>
          <div class="hbar-track"><div class="hbar-fill" style="width:${pct}%;background:${sectorColors[i % sectorColors.length]}">${pct > 8 ? pct.toFixed(1) + '%' : ''}</div></div>
          <span class="hbar-value">${pct.toFixed(1)}%</span>
        </div>`;
      }).join('');
    }

    // Country allocation
    const countryMap = {};
    rows.forEach(r => {
      const c = r.country || 'Unknown';
      countryMap[c] = (countryMap[c] || 0) + r.marketValue;
    });
    const countries = Object.entries(countryMap).sort((a, b) => b[1] - a[1]);
    const countryEl = document.getElementById('country-bars');
    if (countryEl) {
      countryEl.innerHTML = countries.map(([name, val], i) => {
        const pct = (val / totalValue * 100);
        return `<div class="hbar-row">
          <span class="hbar-label">${Utils.getFlag(name)} ${Utils.escHtml(name)}</span>
          <div class="hbar-track"><div class="hbar-fill" style="width:${pct}%;background:${sectorColors[(i + 3) % sectorColors.length]}">${pct > 8 ? pct.toFixed(1) + '%' : ''}</div></div>
          <span class="hbar-value">${pct.toFixed(1)}%</span>
        </div>`;
      }).join('');
    }
  },

  async loadPerformanceChart() {
    const canvas = document.getElementById('performance-chart');
    if (!canvas) return;

    const benchmarks = {
      sp500: { name: 'S&P 500', color: '#3b82f6', data: [] },
      nasdaq: { name: 'NASDAQ 100', color: '#f59e0b', data: [] },
      ftse: { name: 'FTSE 100', color: '#22c55e', data: [] },
      msci: { name: 'MSCI World', color: '#8b5cf6', data: [] }
    };

    // Fetch benchmark data (full 15yr cached internally, sliced by period)
    const bmNames = { sp500: 'S&P 500', nasdaq: 'NASDAQ 100', ftse: 'FTSE 100', msci: 'MSCI World' };
    const rawSeries = {};
    const fetches = Object.entries(bmNames).map(async ([key, name]) => {
      if (!this.visibleSeries[key]) return;
      try {
        rawSeries[key] = await MarketData.getBenchmarkHistory(name, this.selectedPeriod);
      } catch {}
    });
    await Promise.all(fetches);

    // Align all series to a common date axis (forward-fill missing dates)
    const { labels, aligned } = MarketData.alignSeries(rawSeries);

    if (!labels.length) {
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#8b90a0';
      ctx.font = '14px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Waiting for Yahoo Finance data...', canvas.width / 2, canvas.height / 2);
      return;
    }

    // Store aligned data back into benchmarks for Sharpe table
    Object.keys(aligned).forEach(key => {
      benchmarks[key].data = aligned[key];
      benchmarks[key].dates = labels;
    });

    const datasets = [];

    // Portfolio series (computed from trades)
    if (this.visibleSeries.portfolio) {
      datasets.push({
        label: 'Portfolio',
        data: labels.map(() => 0),
        borderColor: '#4f46e5',
        backgroundColor: '#4f46e510',
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.3
      });
    }

    // Benchmark series — use aligned prices for cumulative returns
    Object.entries(benchmarks).forEach(([key, bm]) => {
      if (this.visibleSeries[key] && bm.data && bm.data.length) {
        // Filter out leading nulls (series that started later)
        const firstIdx = bm.data.findIndex(v => v !== null);
        const prices = firstIdx >= 0 ? bm.data.slice(firstIdx) : [];
        const chartLabels = firstIdx >= 0 ? labels.slice(firstIdx) : [];
        const cumReturns = Utils.cumulativeReturns(prices);
        // Pad with nulls at the start so Chart.js aligns to the shared x-axis
        const padded = new Array(firstIdx).fill(null).concat(cumReturns);
        datasets.push({
          label: bm.name,
          data: padded,
          borderColor: bm.color,
          backgroundColor: bm.color + '10',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.3,
          spanGaps: true
        });
      }
    });

    if (this.performanceChart) this.performanceChart.destroy();

    this.performanceChart = new Chart(canvas, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          tooltip: {
            backgroundColor: '#ffffff',
            borderColor: '#e2e4eb',
            borderWidth: 1,
            titleColor: '#1e2028',
            bodyColor: '#5f6578',
            padding: 12,
            callbacks: {
              label(ctx) {
                return `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(2)}%`;
              }
            }
          },
          legend: {
            display: false
          }
        },
        scales: {
          x: {
            grid: { color: '#e2e4eb' },
            ticks: { color: '#8b90a0', maxTicksLimit: 12, font: { size: 11 } }
          },
          y: {
            grid: { color: '#e2e4eb80' },
            ticks: {
              color: '#8b90a0',
              callback: v => v.toFixed(0) + '%',
              font: { size: 11 }
            }
          }
        }
      }
    });

    // Load Sharpe table
    this.loadSharpeTable(benchmarks);
  },

  loadSharpeTable(benchmarks) {
    const tbody = document.getElementById('sharpe-body');
    if (!tbody) return;

    const riskFree = (Storage.getSettings().riskFreeRate ?? 4.0) / 100;
    const series = [
      { name: 'Portfolio', data: [] }, // placeholder
      ...Object.values(benchmarks).filter(b => b.data.length)
    ];

    const rows = series.map(s => {
      // Filter out null values (from date alignment forward-fill padding)
      const clean = s.data.filter(v => v !== null);
      const prices6m = clean.slice(-126);
      const prices1y = clean.slice(-252);
      const r6m = Utils.calcSharpeRatio(Utils.dailyReturns(prices6m), riskFree);
      const r1y = Utils.calcSharpeRatio(Utils.dailyReturns(prices1y), riskFree);
      const rating6m = Utils.sharpeRating(r6m.sharpe);
      const rating1y = Utils.sharpeRating(r1y.sharpe);

      return `<tr>
        <td><strong>${Utils.escHtml(s.name)}</strong></td>
        <td class="text-right">${Utils.formatPercent(r6m.annReturn)}</td>
        <td class="text-right">${r6m.annVol.toFixed(1)}%</td>
        <td class="text-center">${Utils.sharpePill(r6m, rating6m)}</td>
        <td class="text-right">${Utils.formatPercent(r1y.annReturn)}</td>
        <td class="text-right">${r1y.annVol.toFixed(1)}%</td>
        <td class="text-center">${Utils.sharpePill(r1y, rating1y)}</td>
      </tr>`;
    });

    tbody.innerHTML = rows.join('') || '<tr><td colspan="7" class="text-center" style="padding:20px;color:var(--text-dim)">No data available</td></tr>';
  }
};

window.Dashboard = Dashboard;
