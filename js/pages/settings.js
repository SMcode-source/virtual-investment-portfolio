/**
 * ============================================================================
 * SETTINGS.JS — App Settings & Public Page Configuration
 * ============================================================================
 *
 * PURPOSE:
 *   Configure application preferences: currency, risk-free rate, benchmark
 *   tickers, and which sections are visible on the public portfolio page.
 *   Also provides data import/export and account management.
 *
 * FEATURES:
 *   - Currency and locale settings
 *   - Risk-free rate for Sharpe calculations
 *   - Public page toggles (show/hide holdings, allocations, chart, etc.)
 *   - Export all data as JSON backup
 *   - Import data from JSON backup
 *   - Change password (when logged in)
 *
 * REQUIRES LOGIN: Yes
 *
 * ============================================================================
 */
const Settings = {
  render(container) {
    const s = Storage.getSettings();
    const pub = s.public || {};

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Settings</h1>
          <p class="page-desc">Configure portfolio and public page visibility</p>
        </div>
      </div>

      <div class="settings-grid">
        <!-- Left: Portfolio Settings -->
        <div class="card">
          <div class="card-title" style="margin-bottom:20px">Portfolio Settings</div>

          <div class="form-group">
            <label class="form-label">Portfolio Name</label>
            <input type="text" class="form-control" id="s-name" value="${Utils.escHtml(s.portfolioName)}">
          </div>

          <div class="form-group">
            <label class="form-label">Starting Cash</label>
            <input type="number" class="form-control" id="s-cash" value="${s.startingCash}" min="0" step="1000">
          </div>

          <div class="form-group">
            <label class="form-label">Base Currency</label>
            <select class="form-control" id="s-currency">
              ${['USD','GBP','EUR','JPY','CAD','CHF','AUD'].map(c =>
                `<option value="${c}" ${s.baseCurrency === c ? 'selected' : ''}>${c}</option>`
              ).join('')}
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Risk-Free Rate (%)</label>
            <input type="number" class="form-control" id="s-risk-free" value="${s.riskFreeRate ?? 4.0}" step="0.1" min="0" max="20">
            <p style="font-size:0.72rem;color:var(--text-dim);margin-top:4px">Used for Sharpe ratio calculations across all pages. Default: 4%</p>
          </div>

          <button class="btn btn-primary" style="width:100%;justify-content:center" onclick="Settings.savePortfolio()">Save Portfolio Settings</button>

          <div style="margin-top:24px;padding-top:16px;border-top:1px solid var(--border)">
            <div class="card-title" style="margin-bottom:12px;color:var(--red)">Danger Zone</div>
            <button class="btn" style="color:var(--red);border-color:var(--red);width:100%;justify-content:center;margin-bottom:8px" onclick="Settings.resetAll()">
              Reset All Data
            </button>
            <p style="font-size:0.75rem;color:var(--text-dim);margin-top:6px">This will delete all trades, journal entries, watchlist, think pieces, and snapshots.</p>
          </div>
        </div>

        <!-- Right: Public Page Toggles -->
        <div class="card">
          <div class="card-title" style="margin-bottom:20px">Public Page Visibility</div>
          <p style="font-size:0.82rem;color:var(--text-muted);margin-bottom:16px">Choose what visitors can see on your public portfolio page.</p>

          <div class="toggle-row">
            <div>
              <div style="font-weight:500">Live Holdings & Weights</div>
              <div style="font-size:0.78rem;color:var(--text-dim)">Show current positions and portfolio allocation</div>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" id="pub-holdings" ${pub.showHoldings ? 'checked' : ''}>
              <span class="slider"></span>
            </label>
          </div>

          <div class="toggle-row">
            <div>
              <div style="font-weight:500">Trade History with Reasoning</div>
              <div style="font-size:0.78rem;color:var(--text-dim)">Show all trades and investment theses</div>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" id="pub-trades" ${pub.showTradeHistory ? 'checked' : ''}>
              <span class="slider"></span>
            </label>
          </div>

          <div class="toggle-row">
            <div>
              <div style="font-weight:500">Benchmark Comparison</div>
              <div style="font-size:0.78rem;color:var(--text-dim)">Include MSCI World and other benchmarks</div>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" id="pub-benchmarks" ${pub.showBenchmarks ? 'checked' : ''}>
              <span class="slider"></span>
            </label>
          </div>

          <div class="toggle-row">
            <div>
              <div style="font-weight:500">Exact Portfolio Value</div>
              <div style="font-size:0.78rem;color:var(--text-dim)">Show dollar amounts (off = percentages only)</div>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" id="pub-value" ${pub.showExactValue ? 'checked' : ''}>
              <span class="slider"></span>
            </label>
          </div>

          <div class="toggle-row">
            <div>
              <div style="font-weight:500">Think Pieces</div>
              <div style="font-size:0.78rem;color:var(--text-dim)">Show published articles (drafts are blurred)</div>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" id="pub-tp" ${pub.showThinkPieces ? 'checked' : ''}>
              <span class="slider"></span>
            </label>
          </div>

          <div class="toggle-row">
            <div>
              <div style="font-weight:500">Sharpe Ratio & Risk Metrics</div>
              <div style="font-size:0.78rem;color:var(--text-dim)">Show Sharpe ratios vs benchmarks</div>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" id="pub-sharpe" ${pub.showSharpe ? 'checked' : ''}>
              <span class="slider"></span>
            </label>
          </div>

          <button class="btn btn-primary" style="width:100%;justify-content:center;margin-top:16px" onclick="Settings.savePublic()">Save Public Settings</button>
        </div>
      </div>

      <!-- Cloud Sync -->
      <div class="card" style="margin-top:24px">
        <div class="card-header">
          <div>
            <div class="card-title">Cloud Sync (Cloudflare KV)</div>
            <div class="card-subtitle">Sync your portfolio data across all devices</div>
          </div>
          <div id="settings-sync-status">${CloudSync.getStatusBadge()}</div>
        </div>

        <div style="margin-bottom:16px">
          <div style="margin-bottom:12px;font-size:0.82rem;color:var(--text-muted)">
            ${CloudSync.isAuthenticated()
              ? 'Cloud sync is <strong style="color:var(--green)">active</strong> — your data syncs automatically.'
              : 'Log in to the site to enable cloud sync writes. Public reads work without login.'}
          </div>
        </div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px">
          <button class="btn btn-primary" onclick="Settings.forceSyncPush()">Push Local → Cloud</button>
          <button class="btn" onclick="Settings.forceSyncPull()">Pull Cloud → Local</button>
        </div>
        <p style="font-size:0.78rem;color:var(--text-dim)">Push uploads your local data to the cloud. Pull downloads the latest cloud data to this device. You must be logged in for push to work.</p>
      </div>

      <!-- Market Data Diagnostics -->
      <div class="card" style="margin-top:24px">
        <div class="card-header">
          <div>
            <div class="card-title">Market Data Diagnostics</div>
            <div class="card-subtitle">Test Yahoo Finance data feed</div>
          </div>
          <div id="diag-status">${MarketData.getStatusBadge()}</div>
        </div>

        <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px">
          <button class="btn btn-primary" onclick="Settings.runDiagnostics()">Run Full Diagnostics</button>
          <button class="btn" onclick="Settings.testConnection()">Test Connection</button>
          <button class="btn" onclick="Settings.testQuote()">Test Quote (SPY)</button>
          <button class="btn" onclick="Settings.testHistory()">Test History (SPY 1M)</button>
          <button class="btn" onclick="Settings.testSearch()">Test Search (AAPL)</button>
        </div>

        <div id="diag-log" style="background:var(--bg-input);border:1px solid var(--border);border-radius:var(--radius-sm);padding:14px;font-family:var(--font-mono);font-size:0.78rem;min-height:120px;max-height:400px;overflow-y:auto;line-height:1.8;white-space:pre-wrap;color:var(--text-muted)">Click "Run Full Diagnostics" to test Yahoo Finance connectivity...</div>
      </div>

      <!-- Change Credentials -->
      <div class="card" style="margin-top:24px">
        <div class="card-title" style="margin-bottom:12px">Change Login Credentials</div>
        <p style="font-size:0.82rem;color:var(--text-muted);margin-bottom:16px">
          Update your username and/or password. You must be logged in. After changing your password, you'll also need to update the <code>SYNC_SECRET</code> environment variable in Cloudflare to match the new password hash for cloud sync to work.
        </p>

        <div class="form-group" style="margin-bottom:12px">
          <label class="form-label">New Username</label>
          <input type="text" class="form-control" id="cred-new-user" placeholder="Enter new username">
        </div>

        <div class="form-group" style="margin-bottom:12px">
          <label class="form-label">New Password</label>
          <div style="position:relative">
            <input type="password" class="form-control" id="cred-new-pass" placeholder="Enter new password">
          </div>
        </div>

        <div class="form-group" style="margin-bottom:16px">
          <label class="form-label">Confirm Password</label>
          <input type="password" class="form-control" id="cred-confirm-pass" placeholder="Confirm new password">
        </div>

        <div id="cred-result" style="display:none;padding:10px;border-radius:var(--radius-sm);font-size:0.82rem;margin-bottom:12px"></div>

        <button class="btn btn-primary" style="width:100%;justify-content:center" onclick="Settings.changeCredentials()">Update Credentials</button>
      </div>

      <!-- Data Export/Import -->
      <div class="card" style="margin-top:24px">
        <div class="card-title" style="margin-bottom:16px">Data Management</div>
        <div style="display:flex;gap:12px;flex-wrap:wrap">
          <button class="btn" onclick="Settings.exportData()">📥 Export All Data (JSON)</button>
          <button class="btn" onclick="document.getElementById('import-file').click()">📤 Import Data (JSON)</button>
          <input type="file" id="import-file" accept=".json" style="display:none" onchange="Settings.importData(event)">
        </div>
      </div>
    `;
  },

  savePortfolio() {
    const s = Storage.getSettings();
    s.portfolioName = document.getElementById('s-name')?.value || 'My Portfolio';
    s.startingCash = parseFloat(document.getElementById('s-cash')?.value) || 100000;
    s.baseCurrency = document.getElementById('s-currency')?.value || 'USD';
    s.riskFreeRate = parseFloat(document.getElementById('s-risk-free')?.value) ?? 4.0;
    Storage.saveSettings(s);
    alert('Portfolio settings saved!');
  },

  savePublic() {
    const s = Storage.getSettings();
    s.public = {
      showHoldings: document.getElementById('pub-holdings')?.checked ?? true,
      showTradeHistory: document.getElementById('pub-trades')?.checked ?? true,
      showBenchmarks: document.getElementById('pub-benchmarks')?.checked ?? true,
      showExactValue: document.getElementById('pub-value')?.checked ?? false,
      showThinkPieces: document.getElementById('pub-tp')?.checked ?? true,
      showSharpe: document.getElementById('pub-sharpe')?.checked ?? true
    };
    Storage.saveSettings(s);
    alert('Public page settings saved!');
  },

  resetAll() {
    if (!confirm('Are you sure? This will delete ALL portfolio data permanently.')) return;
    if (!confirm('This cannot be undone. Type YES in the next prompt to confirm.')) return;
    const answer = prompt('Type YES to confirm data reset:');
    if (answer !== 'YES') return;

    ['settings','trades','journal','thinkPieces','watchlist','snapshots','priceCache','priceStore'].forEach(k => {
      Storage.remove(k);
    });
    // Clear per-ticker history caches (vip_hc_*, vip_hs_*) and legacy monolithic keys
    Storage._clearHistoryCaches();
    alert('All data has been reset.');
    window.location.reload();
  },

  exportData() {
    const data = {
      exportDate: new Date().toISOString(),
      version: '1.0',
      settings: Storage.getSettings(),
      trades: Storage.getTrades(),
      journal: Storage.getJournalEntries(),
      thinkPieces: Storage.getThinkPieces(),
      watchlist: Storage.getWatchlist(),
      snapshots: Storage.getSnapshots()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `portfolio_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  // --- Cloud Sync ---
  async forceSyncPush() {
    const ok = await CloudSync.forcePush();
    if (ok) {
      alert('All local data pushed to cloud successfully!');
    } else {
      alert('Push failed. Make sure you are logged in.');
    }
    const el = document.getElementById('settings-sync-status');
    if (el) el.innerHTML = CloudSync.getStatusBadge();
  },

  async forceSyncPull() {
    const ok = await CloudSync.forcePull();
    if (ok) {
      alert('Cloud data pulled to this device. Reloading...');
      window.location.reload();
    } else {
      alert('Pull failed. Check your internet connection.');
    }
  },

  // --- Diagnostics ---

  _log(msg, type = 'info') {
    const el = document.getElementById('diag-log');
    if (!el) return;
    const colors = { info: '#5f6578', ok: '#16a34a', err: '#dc2626', warn: '#d97706', data: '#4f46e5' };
    const prefix = { info: '  ', ok: '✓ ', err: '✗ ', warn: '⚠ ', data: '  ' };
    const ts = new Date().toLocaleTimeString();
    el.innerHTML += `<span style="color:${colors[type]}">${prefix[type]}[${ts}] ${msg}</span>\n`;
    el.scrollTop = el.scrollHeight;
  },

  _clearLog() {
    const el = document.getElementById('diag-log');
    if (el) el.innerHTML = '';
  },

  _updateDiagStatus() {
    const el = document.getElementById('diag-status');
    if (el) el.innerHTML = MarketData.getStatusBadge();
  },

  async testConnection() {
    this._clearLog();
    this._log('Testing Yahoo Finance connectivity...');
    this._log(`CORS proxy: ${MarketData.corsProxy}`);

    try {
      const start = performance.now();
      const result = await MarketData.checkConnection();
      const elapsed = (performance.now() - start).toFixed(0);

      if (result) {
        this._log(`Yahoo Finance reachable (${elapsed}ms)`, 'ok');
      } else {
        this._log(`Connection failed (${elapsed}ms)`, 'err');
        this._log('Yahoo Finance or CORS proxy may be down. Try again in a moment.', 'warn');
      }
    } catch (e) {
      this._log(`Exception: ${e.message}`, 'err');
    }
    this._updateDiagStatus();
  },

  async testQuote() {
    this._clearLog();
    this._log('Testing live quote: SPY...');

    try {
      Storage.remove('priceCache');
      const start = performance.now();
      const quote = await MarketData.getQuote('SPY');
      const elapsed = (performance.now() - start).toFixed(0);

      if (quote && quote.last) {
        this._log(`Quote received (${elapsed}ms)`, 'ok');
        this._log(`  Last:   $${quote.last.toFixed(2)}`, 'data');
        this._log(`  Open:   $${quote.open.toFixed(2)}`, 'data');
        this._log(`  High:   $${quote.high.toFixed(2)}`, 'data');
        this._log(`  Low:    $${quote.low.toFixed(2)}`, 'data');
        this._log(`  Close:  $${quote.close.toFixed(2)}`, 'data');
        this._log(`  Change: ${quote.change >= 0 ? '+' : ''}${quote.change.toFixed(2)}%`, 'data');
        this._log(`  Volume: ${quote.volume?.toLocaleString() || 'N/A'}`, 'data');
        this._log('Quote working correctly', 'ok');
      } else {
        this._log(`No quote data returned (${elapsed}ms)`, 'err');
        this._log('Yahoo Finance may be temporarily unavailable.', 'warn');
      }
    } catch (e) {
      this._log(`Quote failed: ${e.message}`, 'err');
    }
  },

  async testHistory() {
    this._clearLog();
    this._log('Testing historical data: SPY (1M daily bars)...');

    try {
      // Clear SPY history cache for fresh test
      try { localStorage.removeItem(Storage._hcKey('SPY')); } catch {}
      const start = performance.now();
      const history = await MarketData.getHistory('SPY', '1M');
      const elapsed = (performance.now() - start).toFixed(0);

      if (history && history.length > 0) {
        this._log(`History received: ${history.length} bars (${elapsed}ms)`, 'ok');
        this._log(`  Date range: ${history[0].date} → ${history[history.length - 1].date}`, 'data');
        this._log(`  First bar:  O:${history[0].open} H:${history[0].high} L:${history[0].low} C:${history[0].close}`, 'data');
        this._log(`  Last bar:   O:${history[history.length-1].open} H:${history[history.length-1].high} L:${history[history.length-1].low} C:${history[history.length-1].close}`, 'data');

        let valid = true;
        for (const bar of history) {
          if (!bar.date || bar.close === undefined || bar.close <= 0) { valid = false; break; }
        }
        this._log(`Data integrity: ${valid ? 'all bars valid' : 'some bars invalid'}`, valid ? 'ok' : 'warn');

        const ret = ((history[history.length-1].close - history[0].close) / history[0].close * 100);
        this._log(`  Period return: ${ret >= 0 ? '+' : ''}${ret.toFixed(2)}%`, 'data');
        this._log('Historical data working correctly', 'ok');
      } else {
        this._log(`No historical data returned (${elapsed}ms)`, 'err');
      }
    } catch (e) {
      this._log(`History failed: ${e.message}`, 'err');
    }
  },

  async testSearch() {
    this._clearLog();
    this._log('Testing symbol search: "AAPL"...');

    try {
      Storage.remove('priceCache');
      const start = performance.now();
      const results = await MarketData.searchSymbol('AAPL');
      const elapsed = (performance.now() - start).toFixed(0);

      if (results && results.length > 0) {
        this._log(`Search returned ${results.length} results (${elapsed}ms)`, 'ok');
        results.slice(0, 5).forEach((r, i) => {
          this._log(`  [${i + 1}] ${r.ticker} — ${r.name} (${r.exchange || 'N/A'})`, 'data');
        });
        this._log('Symbol search working correctly', 'ok');
      } else {
        this._log(`No search results returned (${elapsed}ms)`, 'err');
      }
    } catch (e) {
      this._log(`Search failed: ${e.message}`, 'err');
    }
  },

  async runDiagnostics() {
    this._clearLog();
    this._log('═══════════════════════════════════════════');
    this._log('  Yahoo Finance — Full Diagnostics');
    this._log('═══════════════════════════════════════════');
    this._log('');

    // Step 1: Connection
    this._log('STEP 1: Yahoo Finance Connectivity');
    this._log(`  CORS proxy: ${MarketData.corsProxy}`);
    let connected = false;
    try {
      const start = performance.now();
      connected = await MarketData.checkConnection();
      const elapsed = (performance.now() - start).toFixed(0);
      if (connected) {
        this._log(`  Status: CONNECTED (${elapsed}ms)`, 'ok');
      } else {
        this._log(`  Status: FAILED (${elapsed}ms)`, 'err');
        this._log('  Yahoo Finance or CORS proxy unreachable.', 'warn');
        this._log('');
        this._log('Diagnostics stopped — connection required', 'err');
        this._updateDiagStatus();
        return;
      }
    } catch (e) {
      this._log(`  Exception: ${e.message}`, 'err');
      this._updateDiagStatus();
      return;
    }
    this._updateDiagStatus();
    this._log('');

    // Step 2: Live Quote
    this._log('STEP 2: Live Quote (SPY)');
    try {
      Storage.remove('priceCache');
      const q = await MarketData.getQuote('SPY');
      if (q && q.last > 0) {
        this._log(`  SPY Last: $${q.last.toFixed(2)}  Change: ${q.change >= 0 ? '+' : ''}${q.change.toFixed(2)}%`, 'ok');
      } else {
        this._log('  No quote data returned for SPY.', 'warn');
      }
    } catch (e) {
      this._log(`  Quote error: ${e.message}`, 'err');
    }
    this._log('');

    // Step 3: Historical Data
    this._log('STEP 3: Historical Data (SPY 1M daily)');
    try {
      try { localStorage.removeItem(Storage._hcKey('SPY')); } catch {}
      const hist = await MarketData.getHistory('SPY', '1M');
      if (hist.length > 0) {
        this._log(`  Received ${hist.length} bars: ${hist[0].date} → ${hist[hist.length - 1].date}`, 'ok');
        const ret = ((hist[hist.length-1].close - hist[0].close) / hist[0].close * 100);
        this._log(`  SPY 1M return: ${ret >= 0 ? '+' : ''}${ret.toFixed(2)}%`, 'data');
      } else {
        this._log('  No historical bars returned', 'err');
      }
    } catch (e) {
      this._log(`  History error: ${e.message}`, 'err');
    }
    this._log('');

    // Step 4: Symbol Search
    this._log('STEP 4: Symbol Search ("NVDA")');
    try {
      Storage.remove('priceCache');
      const res = await MarketData.searchSymbol('NVDA');
      if (res.length > 0) {
        this._log(`  Found ${res.length} results`, 'ok');
        this._log(`  Top: ${res[0].ticker} — ${res[0].name}`, 'data');
      } else {
        this._log('  No results returned', 'err');
      }
    } catch (e) {
      this._log(`  Search error: ${e.message}`, 'err');
    }
    this._log('');

    // Step 5: Benchmark ETFs
    this._log('STEP 5: Benchmark ETF Data');
    const benchmarks = [
      { name: 'S&P 500', key: 'S&P 500' },
      { name: 'NASDAQ 100', key: 'NASDAQ 100' },
      { name: 'FTSE 100', key: 'FTSE 100' },
      { name: 'MSCI World', key: 'MSCI World' }
    ];
    for (const bm of benchmarks) {
      try {
        // Clear ticker-specific cache for fresh benchmark test
        const bmTicker = MarketData.benchmarkETFs[bm.key]?.ticker;
        if (bmTicker) try { localStorage.removeItem(Storage._hcKey(bmTicker)); } catch {}
        const hist = await MarketData.getBenchmarkHistory(bm.key, '1M');
        if (hist.length > 0) {
          const ret = ((hist[hist.length-1].close - hist[0].close) / hist[0].close * 100);
          this._log(`  ${bm.name}: ${hist.length} bars, 1M return: ${ret >= 0 ? '+' : ''}${ret.toFixed(2)}%`, 'ok');
        } else {
          this._log(`  ${bm.name}: no data`, 'warn');
        }
      } catch (e) {
        this._log(`  ${bm.name}: ${e.message}`, 'err');
      }
    }
    this._log('');

    // Step 6: Cache test
    this._log('STEP 6: Cache Verification');
    const cachedQuote = Storage.getCachedPrice('SPY');
    this._log(`  Price cache (SPY): ${cachedQuote ? 'HIT — $' + cachedQuote.last?.toFixed(2) : 'MISS'}`, cachedQuote ? 'ok' : 'warn');
    const cachedHist = Storage.getCachedHistory('SPY');
    this._log(`  History cache (SPY full): ${cachedHist ? 'HIT — ' + cachedHist.length + ' bars' : 'MISS'}`, cachedHist ? 'ok' : 'warn');
    this._log('');

    this._log('═══════════════════════════════════════════');
    this._log('  Diagnostics complete');
    this._log('═══════════════════════════════════════════');
  },

  async changeCredentials() {
    const newUser = document.getElementById('cred-new-user')?.value?.trim();
    const newPass = document.getElementById('cred-new-pass')?.value;
    const confirmPass = document.getElementById('cred-confirm-pass')?.value;
    const resultEl = document.getElementById('cred-result');

    const showResult = (msg, isError) => {
      if (!resultEl) return;
      resultEl.textContent = msg;
      resultEl.style.display = 'block';
      resultEl.style.background = isError ? 'rgba(220,38,38,0.1)' : 'rgba(22,163,74,0.1)';
      resultEl.style.color = isError ? 'var(--red)' : 'var(--green)';
    };

    if (!newUser || !newPass) {
      showResult('Please enter both a new username and password.', true);
      return;
    }
    if (newPass !== confirmPass) {
      showResult('Passwords do not match.', true);
      return;
    }
    if (newPass.length < 4) {
      showResult('Password must be at least 4 characters.', true);
      return;
    }
    if (!Auth.isAuthenticated() || !CloudSync.isAuthenticated()) {
      showResult('You must be logged in to change credentials.', true);
      return;
    }

    try {
      const result = await Auth.changeCredentials(newUser, newPass);
      showResult(
        `Credentials updated successfully! New password hash: ${result.newPassHash.slice(0, 12)}... — Update SYNC_SECRET in Cloudflare to this value for cloud sync.`,
        false
      );
      // Clear the form
      document.getElementById('cred-new-user').value = '';
      document.getElementById('cred-new-pass').value = '';
      document.getElementById('cred-confirm-pass').value = '';
    } catch (e) {
      showResult(`Failed to update credentials: ${e.message}`, true);
    }
  },

  importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!confirm(`Import portfolio data from ${Utils.formatDate(data.exportDate)}? This will merge with existing data.`)) return;

        if (data.settings) Storage.saveSettings(data.settings);
        if (data.trades) Storage.saveTrades([...Storage.getTrades(), ...data.trades]);
        if (data.journal) Storage.saveJournalEntries([...Storage.getJournalEntries(), ...data.journal]);
        if (data.thinkPieces) Storage.saveThinkPieces([...Storage.getThinkPieces(), ...data.thinkPieces]);
        if (data.watchlist) Storage.saveWatchlist([...Storage.getWatchlist(), ...data.watchlist]);
        if (data.snapshots) Storage.saveSnapshots([...Storage.getSnapshots(), ...data.snapshots]);

        alert('Data imported successfully!');
        this.render(document.getElementById('page-content'));
      } catch (err) {
        alert('Invalid file format: ' + err.message);
      }
    };
    reader.readAsText(file);
  }
};

window.Settings = Settings;
