// publicView.js — Public portfolio view preview (read-only)
const PublicView = {
  selectedPeriod: '1Y',
  sharpeWindow: 365,
  visibleSeries: { portfolio: true, sp500: true, nasdaq: true, ftse: true, msci: true },
  perfChart: null,
  customDateStart: '',
  customDateEnd: '',

  async render(container) {
    const settings = Storage.getSettings();
    const pub = settings.public || {};
    const { holdings, cash } = Storage.computeHoldings();
    const trades = Storage.getTrades().sort((a, b) => new Date(b.date) - new Date(a.date));
    const journalEntries = Storage.getJournalEntries().filter(e => {
      return trades.some(t => t.journalLink === e.id || (e.linkedTrades && e.linkedTrades.includes(t.id)));
    });
    const thinkPieces = Storage.getThinkPieces();
    const publishedPieces = thinkPieces.filter(p => p.status === 'published');
    const draftPieces = thinkPieces.filter(p => p.status === 'draft');

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Public View</h1>
          <p class="page-desc">This is the public-facing view of your portfolio</p>
        </div>
        <a href="#settings" class="btn btn-sm">⚙ Configure Visibility</a>
      </div>

      <div style="border:2px dashed var(--border);border-radius:var(--radius);padding:4px">

        <!-- Profile Header -->
        <div class="public-header">
          <h1>${Utils.escHtml(settings.portfolioName)}</h1>
          <div class="desc">Medium to Long Term Systematic and Conviction-Based Investing · Updated live</div>
          <div style="display:flex;gap:12px;margin-top:16px;position:relative;z-index:1">
            <button class="btn btn-sm" style="background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.25);color:white">Follow</button>
            <button class="btn btn-sm" style="background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.25);color:white">Share</button>
          </div>
          <div class="kpi-grid" style="margin-top:20px;position:relative;z-index:1" id="pub-kpis">
            ${pub.showExactValue ? `
              <div class="kpi-card" style="background:rgba(255,255,255,0.08);border-color:rgba(255,255,255,0.15)">
                <div class="kpi-label" style="color:#c4b5fd">Portfolio Value</div>
                <div class="kpi-value" id="pub-total-value">--</div>
              </div>` : ''}
            <div class="kpi-card" style="background:rgba(255,255,255,0.08);border-color:rgba(255,255,255,0.15)">
              <div class="kpi-label" style="color:#c4b5fd">Total Return</div>
              <div class="kpi-value" id="pub-return">--</div>
            </div>
            <div class="kpi-card" style="background:rgba(255,255,255,0.08);border-color:rgba(255,255,255,0.15)">
              <div class="kpi-label" style="color:#c4b5fd">vs S&P 500</div>
              <div class="kpi-value" id="pub-vs-sp500">--</div>
            </div>
            <div class="kpi-card" style="background:rgba(255,255,255,0.08);border-color:rgba(255,255,255,0.15)">
              <div class="kpi-label" style="color:#c4b5fd">vs MSCI World</div>
              <div class="kpi-value" id="pub-vs-msci">--</div>
            </div>
            ${pub.showSharpe ? `
              <div class="kpi-card" style="background:rgba(255,255,255,0.08);border-color:rgba(255,255,255,0.15)">
                <div class="kpi-label" style="color:#c4b5fd">1Y Sharpe Ratio</div>
                <div class="kpi-value" id="pub-sharpe">--</div>
              </div>` : ''}
          </div>
        </div>

        ${pub.showBenchmarks ? `
        <!-- Performance Chart -->
        <div class="card" style="margin:24px;margin-top:-1px">
          <div class="card-header">
            <div class="card-title">Performance vs Benchmarks</div>
          </div>

          <!-- Period Selectors -->
          <div class="chart-controls">
            <span class="label">Period:</span>
            <div class="btn-group" id="pub-period-btns">
              ${['1M','3M','6M','YTD','1Y','3Y','5Y','All'].map(p =>
                `<button class="btn btn-sm ${p === this.selectedPeriod ? 'active' : ''}" onclick="PublicView.setPeriod('${p}')">${p}</button>`
              ).join('')}
              <button class="btn btn-sm ${this.selectedPeriod === 'Custom' ? 'active' : ''}" onclick="PublicView.setPeriod('Custom')">Custom</button>
            </div>
          </div>

          <!-- Custom Date Range (shown only when Custom is selected) -->
          <div id="pub-custom-range" style="display:${this.selectedPeriod === 'Custom' ? 'flex' : 'none'};gap:12px;align-items:end;margin-bottom:12px;flex-wrap:wrap">
            <div class="form-group" style="margin-bottom:0">
              <label class="form-label">From</label>
              <input type="date" class="form-control" id="pub-custom-start" value="${this.customDateStart}" style="width:160px">
            </div>
            <div class="form-group" style="margin-bottom:0">
              <label class="form-label">To</label>
              <input type="date" class="form-control" id="pub-custom-end" value="${this.customDateEnd || new Date().toISOString().split('T')[0]}" style="width:160px">
            </div>
            <button class="btn btn-sm btn-primary" onclick="PublicView.applyCustomRange()">Apply</button>
          </div>

          <!-- Sharpe Window -->
          <div class="chart-controls">
            <span class="label">Rolling Sharpe Window:</span>
            <div class="btn-group" id="pub-sharpe-btns">
              ${[{l:'90d',v:90},{l:'180d',v:180},{l:'365d',v:365},{l:'730d',v:730}].map(w =>
                `<button class="btn btn-sm ${w.v === this.sharpeWindow ? 'active' : ''}" onclick="PublicView.setSharpeWindow(${w.v})">${w.l}</button>`
              ).join('')}
            </div>
          </div>

          <!-- Series Toggles -->
          <div class="chart-controls">
            <span class="label">Series:</span>
            ${Object.entries({portfolio:'Portfolio',sp500:'S&P 500',nasdaq:'NASDAQ 100',ftse:'FTSE 100',msci:'MSCI World'}).map(([k,v]) => {
              const colors = {portfolio:'#4f46e5',sp500:'#2563eb',nasdaq:'#d97706',ftse:'#16a34a',msci:'#7c3aed'};
              const isOn = this.visibleSeries[k];
              return `<button class="btn btn-sm ${isOn ? 'active' : ''}" onclick="PublicView.toggleSeries('${k}')"
                style="${isOn ? 'border-color:'+colors[k]+';box-shadow:inset 0 0 0 1px '+colors[k] : ''}">
                <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${colors[k]};opacity:${isOn?1:0.35};margin-right:4px"></span>${v}
              </button>`;
            }).join('')}
          </div>

          <div class="chart-container" style="position:relative;min-height:320px">
            <canvas id="pub-perf-chart" height="320"></canvas>
          </div>
        </div>
        ` : ''}

        ${pub.showHoldings ? `
        <!-- Holdings Table -->
        <div class="card" style="margin:0 24px 24px">
          <div class="card-title" style="margin-bottom:12px">Holdings</div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ticker</th><th>Company</th><th>Sector</th><th>Country</th>
                  <th class="text-right">Shares</th><th class="text-right">Avg Cost</th>
                  <th class="text-right">Price</th><th class="text-right">Market Value</th>
                  <th class="text-right">P&L</th><th>Weight</th>
                </tr>
              </thead>
              <tbody id="pub-holdings-body">
                ${holdings.length === 0 ? '<tr><td colspan="10" class="text-center" style="padding:20px;color:var(--text-dim)">No holdings</td></tr>' : ''}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Sector & Country -->
        <div class="grid-2" style="margin:0 24px 24px">
          <div class="card">
            <div class="card-title" style="margin-bottom:12px">Sector Allocation</div>
            <div class="hbar-chart" id="pub-sector-bars"></div>
          </div>
          <div class="card">
            <div class="card-title" style="margin-bottom:12px">Country Allocation</div>
            <div class="hbar-chart" id="pub-country-bars"></div>
          </div>
        </div>
        ` : ''}

        ${pub.showSharpe ? `
        <!-- Sharpe Table -->
        <div class="card" style="margin:0 24px 24px">
          <div class="card-title" style="margin-bottom:12px">Sharpe Ratios (6M & 1Y)</div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr><th>Series</th><th class="text-right">6M Return</th><th class="text-right">6M Vol</th><th class="text-center">6M Sharpe</th><th class="text-right">1Y Return</th><th class="text-right">1Y Vol</th><th class="text-center">1Y Sharpe</th></tr>
              </thead>
              <tbody id="pub-sharpe-body">
                <tr><td colspan="7" class="text-center" style="padding:16px;color:var(--text-dim)">Loading...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
        ` : ''}

        ${pub.showTradeHistory ? `
        <!-- Trade Log with Full Detail -->
        <div class="card" style="margin:0 24px 24px">
          <div class="card-header">
            <div class="card-title">Complete Trade History</div>
            <span style="font-size:0.78rem;color:var(--text-dim)">${trades.length} trade${trades.length !== 1 ? 's' : ''}</span>
          </div>

          <!-- Summary Table -->
          <div class="table-wrap" style="margin-bottom:20px">
            <table>
              <thead>
                <tr>
                  <th>Date</th><th>Ticker</th><th>Type</th>
                  <th class="text-right">Shares</th><th class="text-right">Price</th>
                  <th class="text-right">Commission</th><th class="text-right">Total Value</th>
                  <th class="text-right">Cash After</th>
                  <th class="text-right">Current Price</th><th class="text-right">Trade P&L</th>
                  <th class="text-center">Sentiment</th><th class="text-center">Conviction</th>
                </tr>
              </thead>
              <tbody id="pub-trade-table-body">
                ${trades.length === 0 ? '<tr><td colspan="12" class="text-center" style="padding:20px;color:var(--text-dim)">No trades yet</td></tr>' :
                  '<tr><td colspan="12" class="text-center" style="padding:16px;color:var(--text-dim)">Loading live prices...</td></tr>'}
              </tbody>
            </table>
          </div>

          <!-- Detailed Trade Cards with Reasoning -->
          <div class="card-title" style="margin-bottom:12px;font-size:0.9rem">Trade Reasoning & Thesis</div>
          ${trades.map(t => {
            const totalVal = t.shares * t.price;
            return `
            <div class="pub-trade-card" style="padding:16px;margin-bottom:12px;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--radius-sm)">
              <!-- Trade header row -->
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px">
                <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
                  <span style="font-size:0.78rem;color:var(--text-dim)">${Utils.formatDateTime(t.date)}</span>
                  <strong style="font-size:1.05rem;color:var(--primary-light)">${Utils.escHtml(t.ticker)}</strong>
                  <span class="badge ${t.type === 'BUY' ? 'badge-buy' : 'badge-sell'}" style="font-size:0.78rem">${t.type}</span>
                  ${t.name ? '<span style="color:var(--text-muted);font-size:0.82rem">' + Utils.escHtml(t.name) + '</span>' : ''}
                  ${t.currency && t.currency !== 'USD' ? '<span class="badge" style="background:var(--blue-bg);color:var(--blue);border:1px solid #3b82f640;font-size:0.7rem">' + t.currency + '</span>' : ''}
                </div>
                <div style="font-family:var(--font-mono);font-size:0.9rem;font-weight:600">
                  ${t.shares} × ${Utils.formatCurrency(t.price)} = ${Utils.formatCurrency(totalVal)}
                  ${t.commission ? '<span style="color:var(--text-dim);font-size:0.78rem;font-weight:400"> + ' + Utils.formatCurrency(t.commission) + ' comm.</span>' : ''}
                </div>
              </div>

              <!-- Sentiment, Conviction, Tags row -->
              <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:${t.thesis ? '10' : '0'}px">
                ${t.sentiment ? Utils.sentimentBadge(t.sentiment) : ''}
                ${t.conviction ? '<span style="font-size:0.9rem">' + Utils.stars(t.conviction) + '</span>' : ''}
                ${(t.tags && t.tags.length) ? t.tags.map(tag => '<span class="tag">' + Utils.escHtml(tag) + '</span>').join('') : ''}
                ${t.targetPrice ? '<span style="font-size:0.75rem;color:var(--green);background:var(--green-bg);border:1px solid #22c55e30;padding:2px 8px;border-radius:10px">Target: ' + Utils.formatCurrency(t.targetPrice) + '</span>' : ''}
                ${t.stopLoss ? '<span style="font-size:0.75rem;color:var(--red);background:var(--red-bg);border:1px solid #ef444430;padding:2px 8px;border-radius:10px">Stop: ' + Utils.formatCurrency(t.stopLoss) + '</span>' : ''}
              </div>

              <!-- Thesis -->
              ${t.thesis ? '<div style="font-size:0.88rem;color:var(--text-muted);line-height:1.7;padding:10px 14px;background:var(--bg-card);border-radius:var(--radius-xs);border-left:3px solid var(--primary)">' + Utils.escHtml(t.thesis) + '</div>' : ''}
            </div>`;
          }).join('')}
          ${trades.length === 0 ? '<div class="empty-state"><div class="icon">📋</div><h3>No trades yet</h3></div>' : ''}
        </div>
        ` : ''}

        <!-- Journal Entries -->
        ${journalEntries.length ? `
        <div class="card" style="margin:0 24px 24px">
          <div class="card-title" style="margin-bottom:16px">Investment Journal</div>
          ${journalEntries.map(e => `
            <div class="journal-card" style="margin-bottom:12px">
              <div class="journal-card-header">
                <div>
                  <span class="journal-ticker">${Utils.escHtml(e.ticker)}</span>
                  <span style="color:var(--text-muted);margin-left:8px">${Utils.escHtml(e.title || '')}</span>
                </div>
                <div style="display:flex;gap:8px;align-items:center">
                  ${e.sentiment ? Utils.sentimentBadge(e.sentiment) : ''}
                  ${Utils.stars(e.conviction || 0)}
                </div>
              </div>
              <div class="journal-body">${Utils.escHtml(e.body || '')}</div>
              <div class="journal-tags">${(e.tags || []).map(t => `<span class="tag">${Utils.escHtml(t)}</span>`).join('')}</div>
            </div>
          `).join('')}
        </div>
        ` : ''}

        ${pub.showThinkPieces ? `
        <!-- Think Pieces -->
        <div class="card" style="margin:0 24px 24px">
          <div class="card-title" style="margin-bottom:16px">Think Pieces</div>
          <div class="grid-3">
            ${publishedPieces.map(p => `
              <div class="tp-card">
                <div class="tp-card-header" style="background:linear-gradient(135deg, #6366f1, #8b5cf6)">${p.emoji || '📈'}</div>
                <div class="tp-card-body">
                  <div class="tp-card-title">${Utils.escHtml(p.title)}</div>
                  <div class="tp-card-meta">${Utils.formatDate(p.updatedAt || p.createdAt)} · <span class="badge badge-published">Published</span></div>
                </div>
              </div>
            `).join('')}
            ${draftPieces.map(p => `
              <div style="position:relative">
                <div class="tp-card blurred-draft">
                  <div class="tp-card-header" style="background:linear-gradient(135deg, #374151, #4b5563)">${p.emoji || '📝'}</div>
                  <div class="tp-card-body">
                    <div class="tp-card-title">${Utils.escHtml(p.title)}</div>
                    <div class="tp-card-meta">${Utils.formatDate(p.updatedAt || p.createdAt)}</div>
                  </div>
                </div>
                <div class="draft-overlay">🔒 Draft — not yet published</div>
              </div>
            `).join('')}
          </div>
          ${!publishedPieces.length && !draftPieces.length ? '<p style="color:var(--text-dim)">No articles yet</p>' : ''}
        </div>
        ` : ''}

      </div>
    `;

    // Load live prices for holdings
    if (pub.showHoldings && holdings.length) {
      this.loadHoldings(holdings, cash, settings);
    }
    // Load performance chart
    if (pub.showBenchmarks) {
      this.loadPerformanceChart();
    }
    // Load Sharpe table
    if (pub.showSharpe) {
      this.loadSharpeTable();
    }
    // Load trade table with live prices
    if (pub.showTradeHistory && trades.length) {
      this.loadTradeTable(trades, settings);
    }
  },

  // --- Chart Control Handlers ---

  setPeriod(p) {
    this.selectedPeriod = p;
    if (p !== 'Custom') {
      this.loadPerformanceChart();
      // Update button states without full re-render
      document.querySelectorAll('#pub-period-btns .btn').forEach(btn => {
        btn.classList.toggle('active', btn.textContent.trim() === p);
      });
      const customRange = document.getElementById('pub-custom-range');
      if (customRange) customRange.style.display = 'none';
    } else {
      document.querySelectorAll('#pub-period-btns .btn').forEach(btn => {
        btn.classList.toggle('active', btn.textContent.trim() === 'Custom');
      });
      const customRange = document.getElementById('pub-custom-range');
      if (customRange) customRange.style.display = 'flex';
    }
  },

  applyCustomRange() {
    this.customDateStart = document.getElementById('pub-custom-start')?.value || '';
    this.customDateEnd = document.getElementById('pub-custom-end')?.value || new Date().toISOString().split('T')[0];
    if (!this.customDateStart) { alert('Select a start date'); return; }
    this.loadPerformanceChart();
  },

  setSharpeWindow(w) {
    this.sharpeWindow = w;
    document.querySelectorAll('#pub-sharpe-btns .btn').forEach(btn => {
      btn.classList.toggle('active', btn.textContent.trim() === w + 'd');
    });
    // Re-render chart with new Sharpe overlay
    this.loadPerformanceChart();
  },

  toggleSeries(key) {
    this.visibleSeries[key] = !this.visibleSeries[key];
    // Full re-render needed for button states + chart
    this.render(document.getElementById('page-content'));
  },

  // --- Performance Chart ---

  async loadPerformanceChart() {
    const canvas = document.getElementById('pub-perf-chart');
    if (!canvas) return;

    const period = this.selectedPeriod === 'Custom' ? '5Y' : Utils.periodToRange(this.selectedPeriod);

    const seriesConfig = {
      sp500:  { name: 'S&P 500',    bmKey: 'S&P 500',    color: '#3b82f6' },
      nasdaq: { name: 'NASDAQ 100', bmKey: 'NASDAQ 100', color: '#f59e0b' },
      ftse:   { name: 'FTSE 100',   bmKey: 'FTSE 100',   color: '#22c55e' },
      msci:   { name: 'MSCI World',  bmKey: 'MSCI World',  color: '#8b5cf6' }
    };

    const benchmarkData = {};

    // Fetch all visible benchmark series in parallel
    const fetches = Object.entries(seriesConfig).map(async ([key, cfg]) => {
      if (!this.visibleSeries[key]) return;
      try {
        const history = await MarketData.getBenchmarkHistory(cfg.bmKey, period);
        let filtered = history;
        if (this.selectedPeriod === 'Custom' && this.customDateStart) {
          filtered = history.filter(d => d.date >= this.customDateStart && d.date <= (this.customDateEnd || '9999'));
        }
        benchmarkData[key] = {
          ...cfg,
          dates: filtered.map(d => d.date),
          prices: filtered.map(d => d.close)
        };
      } catch {}
    });
    await Promise.all(fetches);

    // Find the longest date series for x-axis labels
    let labels = [];
    Object.values(benchmarkData).forEach(bm => {
      if (bm.dates && bm.dates.length > labels.length) labels = bm.dates;
    });

    if (!labels.length) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#8b90a0';
      ctx.font = '14px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Waiting for Yahoo Finance data...', canvas.width / 2, canvas.height / 2);
      return;
    }

    // Build datasets
    const datasets = [];
    const rollingSharpeData = {}; // stored per-series for tooltip

    // Portfolio series (computed from daily trade-replay)
    if (this.visibleSeries.portfolio) {
      const portReturns = this.computePortfolioReturnSeries(labels);
      const portSharpe = this.computeRollingSharpe(portReturns, this.sharpeWindow);
      rollingSharpeData['Portfolio'] = portSharpe;
      datasets.push({
        label: 'Portfolio',
        data: Utils.cumulativeReturns(portReturns.length ? portReturns : labels.map(() => 1)),
        borderColor: '#4f46e5',
        backgroundColor: '#4f46e510',
        borderWidth: 2.5,
        pointRadius: 0,
        tension: 0.3,
        borderDash: portReturns.length ? [] : [5, 5] // dashed if placeholder
      });
    }

    // Benchmark series
    Object.entries(benchmarkData).forEach(([key, bm]) => {
      const cumReturns = Utils.cumulativeReturns(bm.prices);
      const dailyRet = bm.prices.map((p, i) => i === 0 ? 1 : p / bm.prices[0]);
      const sharpeArr = this.computeRollingSharpe(bm.prices, this.sharpeWindow);
      rollingSharpeData[bm.name] = sharpeArr;

      datasets.push({
        label: bm.name,
        data: cumReturns,
        borderColor: bm.color,
        backgroundColor: bm.color + '10',
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.3
      });
    });

    // Store sharpe data so tooltip can access it
    this._rollingSharpeData = rollingSharpeData;
    this._chartLabels = labels;

    // Destroy old chart
    if (this.perfChart) this.perfChart.destroy();

    // Create chart
    this.perfChart = new Chart(canvas, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          tooltip: {
            backgroundColor: '#ffffffee',
            borderColor: '#e2e4eb',
            borderWidth: 1,
            titleColor: '#1e2028',
            bodyColor: '#5f6578',
            padding: 14,
            titleFont: { size: 12, weight: '600' },
            bodyFont: { size: 11, family: 'JetBrains Mono, monospace' },
            displayColors: true,
            boxWidth: 10,
            boxHeight: 10,
            boxPadding: 4,
            callbacks: {
              title: (items) => {
                if (!items.length) return '';
                return items[0].label;
              },
              label: (ctx) => {
                const seriesName = ctx.dataset.label;
                const returnPct = ctx.parsed.y.toFixed(2);
                // Fetch rolling Sharpe for this point
                const sharpeArr = PublicView._rollingSharpeData[seriesName];
                const idx = ctx.dataIndex;
                let sharpeTxt = '—';
                if (sharpeArr && idx < sharpeArr.length && sharpeArr[idx] !== null) {
                  sharpeTxt = sharpeArr[idx].toFixed(2);
                }
                return ` ${seriesName}: ${returnPct}%  (Sharpe: ${sharpeTxt})`;
              }
            }
          },
          legend: {
            display: false
          },
          // Crosshair line plugin
          crosshairLine: {}
        },
        scales: {
          x: {
            grid: { color: '#e2e4eb' },
            ticks: {
              color: '#8b90a0',
              maxTicksLimit: 12,
              font: { size: 11 }
            }
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
      },
      plugins: [this.crosshairPlugin()]
    });
  },

  // Custom crosshair plugin for vertical line on hover
  crosshairPlugin() {
    return {
      id: 'pubCrosshair',
      afterDraw(chart) {
        if (chart.tooltip?._active?.length) {
          const ctx = chart.ctx;
          const x = chart.tooltip._active[0].element.x;
          const topY = chart.scales.y.top;
          const bottomY = chart.scales.y.bottom;

          ctx.save();
          ctx.beginPath();
          ctx.moveTo(x, topY);
          ctx.lineTo(x, bottomY);
          ctx.lineWidth = 1;
          ctx.strokeStyle = '#6366f150';
          ctx.setLineDash([4, 4]);
          ctx.stroke();
          ctx.restore();
        }
      }
    };
  },

  // Compute rolling Sharpe for a price series
  computeRollingSharpe(prices, windowDays) {
    if (!prices.length) return [];
    const rfDaily = ((Storage.getSettings().riskFreeRate ?? 4.0) / 100) / 252;
    const result = new Array(prices.length).fill(null);

    for (let i = windowDays; i < prices.length; i++) {
      const windowPrices = prices.slice(i - windowDays, i + 1);
      const returns = [];
      for (let j = 1; j < windowPrices.length; j++) {
        if (windowPrices[j - 1] > 0) {
          returns.push(windowPrices[j] / windowPrices[j - 1] - 1);
        }
      }
      if (returns.length < 2) continue;

      const excessReturns = returns.map(r => r - rfDaily);
      const mean = excessReturns.reduce((a, b) => a + b, 0) / excessReturns.length;
      const variance = excessReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / (excessReturns.length - 1);
      const std = Math.sqrt(variance);
      result[i] = std > 0 ? (mean * Math.sqrt(252)) / (std * Math.sqrt(252)) * Math.sqrt(252) / Math.sqrt(252) : 0;
      // Simplified: Sharpe = (mean excess return * 252) / (std * sqrt(252))
      result[i] = std > 0 ? (mean * 252) / (std * Math.sqrt(252)) : 0;
    }
    return result;
  },

  // Build a daily portfolio value series from trades (replayed chronologically)
  computePortfolioReturnSeries(dates) {
    const trades = [...Storage.getTrades()].sort((a, b) => new Date(a.date) - new Date(b.date));
    const settings = Storage.getSettings();
    if (!trades.length) return [];

    // Build daily portfolio values by replaying trades
    const valueSeries = [];
    let holdingsMap = {};
    let cash = settings.startingCash;

    for (const dateStr of dates) {
      // Apply any trades on or before this date that haven't been applied yet
      while (trades.length && new Date(trades[0].date).toISOString().split('T')[0] <= dateStr) {
        const t = trades.shift();
        if (!holdingsMap[t.ticker]) holdingsMap[t.ticker] = { shares: 0, avgCost: 0, totalCost: 0 };
        const h = holdingsMap[t.ticker];
        if (t.type === 'BUY') {
          h.totalCost += t.shares * t.price;
          h.shares += t.shares;
          h.avgCost = h.shares > 0 ? h.totalCost / h.shares : 0;
          cash -= t.shares * t.price + (t.commission || 0);
        } else {
          const costBasis = h.avgCost * t.shares;
          h.totalCost -= costBasis;
          h.shares -= t.shares;
          cash += t.shares * t.price - (t.commission || 0);
          if (h.shares <= 0) delete holdingsMap[t.ticker];
        }
      }

      // Approximate value: use avgCost for positions (without live intra-day prices)
      let totalValue = cash;
      for (const h of Object.values(holdingsMap)) {
        totalValue += h.shares * h.avgCost;
      }
      valueSeries.push(totalValue);
    }

    return valueSeries;
  },

  // --- Trade Table with Live Prices ---

  async loadTradeTable(trades, settings) {
    const tbody = document.getElementById('pub-trade-table-body');
    if (!tbody) return;

    // Build running cash balance
    const allTradesSorted = [...trades].sort((a, b) => new Date(a.date) - new Date(b.date));
    const cashMap = {};
    let runCash = settings.startingCash;
    allTradesSorted.forEach(t => {
      const val = t.shares * t.price + (t.commission || 0);
      if (t.type === 'BUY') runCash -= val;
      else runCash += t.shares * t.price - (t.commission || 0);
      cashMap[t.id] = runCash;
    });

    // Collect unique tickers for batch quote
    const tickers = [...new Set(trades.map(t => t.ticker).filter(Boolean))];
    const liveQuotes = {};

    // Fetch live prices for each unique ticker
    for (const key of tickers) {
      try {
        const quote = await MarketData.getQuote(key);
        if (quote && quote.last) liveQuotes[key] = quote;
      } catch {}
    }

    // Render rows in reverse chronological order
    const sorted = [...trades].sort((a, b) => new Date(b.date) - new Date(a.date));
    tbody.innerHTML = sorted.map(t => {
      const totalVal = t.shares * t.price;
      const cashAfter = cashMap[t.id] || 0;
      const quoteKey = t.ticker;
      const liveQuote = liveQuotes[quoteKey];
      const currentPrice = liveQuote ? liveQuote.last : null;
      let tradePL = null;
      let tradePLPct = null;
      if (currentPrice !== null && t.type === 'BUY') {
        tradePL = (currentPrice - t.price) * t.shares;
        tradePLPct = ((currentPrice - t.price) / t.price * 100);
      }

      return `<tr>
        <td>${Utils.formatDate(t.date)}</td>
        <td><strong>${Utils.escHtml(t.ticker)}</strong></td>
        <td><span class="badge ${t.type === 'BUY' ? 'badge-buy' : 'badge-sell'}">${t.type}</span></td>
        <td class="text-right">${Utils.formatNumber(t.shares)}</td>
        <td class="text-right">${Utils.formatCurrency(t.price)}</td>
        <td class="text-right" style="color:var(--text-dim)">${t.commission ? Utils.formatCurrency(t.commission) : '—'}</td>
        <td class="text-right">${Utils.formatCurrency(totalVal)}</td>
        <td class="text-right">${Utils.formatCurrency(cashAfter)}</td>
        <td class="text-right">${currentPrice !== null ? Utils.formatCurrency(currentPrice) : '<span style="color:var(--text-dim)">—</span>'}</td>
        <td class="text-right">${tradePL !== null
          ? '<span class="' + Utils.plClass(tradePL) + '">' + Utils.formatCurrency(tradePL) + ' (' + Utils.formatPercent(tradePLPct) + ')</span>'
          : '<span style="color:var(--text-dim)">' + (t.type === 'SELL' ? 'Closed' : '—') + '</span>'}</td>
        <td class="text-center">${t.sentiment ? Utils.sentimentBadge(t.sentiment) : '—'}</td>
        <td class="text-center">${t.conviction ? Utils.stars(t.conviction) : '—'}</td>
      </tr>`;
    }).join('');
  },

  // --- Sharpe Table ---

  async loadSharpeTable() {
    const tbody = document.getElementById('pub-sharpe-body');
    if (!tbody) return;

    const benchmarks = ['S&P 500', 'NASDAQ 100', 'FTSE 100', 'MSCI World'];
    const rows = [{ name: 'Portfolio', r6m: { sharpe: 0, annReturn: 0, annVol: 0 }, r1y: { sharpe: 0, annReturn: 0, annVol: 0 } }];

    for (const bm of benchmarks) {
      try {
        const history = await MarketData.getBenchmarkHistory(bm, '1Y');
        const prices = history.map(d => d.close);
        const p6m = prices.slice(-126);
        const rf = (Storage.getSettings().riskFreeRate ?? 4.0) / 100;
        const r6m = Utils.calcSharpeRatio(Utils.dailyReturns(p6m), rf);
        const r1y = Utils.calcSharpeRatio(Utils.dailyReturns(prices), rf);
        rows.push({ name: bm, r6m, r1y });
      } catch {
        rows.push({ name: bm, r6m: { sharpe: 0, annReturn: 0, annVol: 0 }, r1y: { sharpe: 0, annReturn: 0, annVol: 0 } });
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

  // --- Holdings ---

  async loadHoldings(holdings, cash, settings) {
    const tbody = document.getElementById('pub-holdings-body');
    if (!tbody) return;

    let totalMarketValue = cash;
    const rows = [];

    for (const h of holdings) {
      let currentPrice = h.avgCost;
      try {
        const quote = await MarketData.getQuote(h.ticker);
        if (quote?.last) currentPrice = quote.last;
      } catch {}
      const mv = h.shares * currentPrice;
      totalMarketValue += mv;
      rows.push({ ...h, currentPrice, marketValue: mv, pl: (currentPrice - h.avgCost) * h.shares, plPct: h.avgCost > 0 ? ((currentPrice - h.avgCost) / h.avgCost * 100) : 0 });
    }

    const totalReturn = ((totalMarketValue - settings.startingCash) / settings.startingCash * 100);

    // Update KPIs
    const pubReturn = document.getElementById('pub-return');
    if (pubReturn) { pubReturn.textContent = Utils.formatPercent(totalReturn); pubReturn.className = `kpi-value ${Utils.plClass(totalReturn)}`; }
    const pubVal = document.getElementById('pub-total-value');
    if (pubVal) pubVal.textContent = Utils.formatCurrency(totalMarketValue);

    tbody.innerHTML = rows.map(r => {
      const w = r.marketValue / totalMarketValue * 100;
      return `<tr>
        <td><strong>${Utils.escHtml(r.ticker)}</strong></td>
        <td>${Utils.escHtml(r.name)}</td>
        <td>${Utils.escHtml(r.sector)}</td>
        <td>${Utils.getFlag(r.country)} ${Utils.escHtml(r.country)}</td>
        <td class="text-right">${r.shares}</td>
        <td class="text-right">${Utils.formatCurrency(r.avgCost)}</td>
        <td class="text-right">${Utils.formatCurrency(r.currentPrice)}</td>
        <td class="text-right">${Utils.formatCurrency(r.marketValue)}</td>
        <td class="text-right ${Utils.plClass(r.pl)}">${Utils.formatCurrency(r.pl)} (${Utils.formatPercent(r.plPct)})</td>
        <td><div class="weight-bar"><div class="weight-bar-track"><div class="weight-bar-fill" style="width:${Math.min(w*2,100)}%"></div></div><span class="weight-bar-label">${w.toFixed(1)}%</span></div></td>
      </tr>`;
    }).join('');

    // Allocation bars
    const sectorColors = ['#6366f1','#8b5cf6','#06b6d4','#22c55e','#f59e0b','#ef4444','#ec4899','#14b8a6'];
    const sectorMap = {};
    rows.forEach(r => { const s = r.sector || 'Other'; sectorMap[s] = (sectorMap[s]||0) + r.marketValue; });
    const sectorEl = document.getElementById('pub-sector-bars');
    if (sectorEl) {
      sectorEl.innerHTML = Object.entries(sectorMap).sort((a,b)=>b[1]-a[1]).map(([name,val],i) => {
        const pct = val/totalMarketValue*100;
        return `<div class="hbar-row"><span class="hbar-label">${Utils.escHtml(name)}</span><div class="hbar-track"><div class="hbar-fill" style="width:${pct}%;background:${sectorColors[i%sectorColors.length]}">${pct>8?pct.toFixed(1)+'%':''}</div></div><span class="hbar-value">${pct.toFixed(1)}%</span></div>`;
      }).join('');
    }
    const countryMap = {};
    rows.forEach(r => { const c = r.country || 'Unknown'; countryMap[c] = (countryMap[c]||0) + r.marketValue; });
    const countryEl = document.getElementById('pub-country-bars');
    if (countryEl) {
      countryEl.innerHTML = Object.entries(countryMap).sort((a,b)=>b[1]-a[1]).map(([name,val],i) => {
        const pct = val/totalMarketValue*100;
        return `<div class="hbar-row"><span class="hbar-label">${Utils.getFlag(name)} ${Utils.escHtml(name)}</span><div class="hbar-track"><div class="hbar-fill" style="width:${pct}%;background:${sectorColors[(i+3)%sectorColors.length]}">${pct>8?pct.toFixed(1)+'%':''}</div></div><span class="hbar-value">${pct.toFixed(1)}%</span></div>`;
      }).join('');
    }
  }
};

window.PublicView = PublicView;
