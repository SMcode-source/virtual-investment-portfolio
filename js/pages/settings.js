// settings.js — Portfolio settings and public page toggles
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
            <div class="card-title">Cloud Sync (Firebase)</div>
            <div class="card-subtitle">Sync your portfolio data across all devices</div>
          </div>
          <div id="settings-sync-status">${typeof FirebaseSync !== 'undefined' ? FirebaseSync.getStatusBadge() : '<span style="color:#8b90a0;font-size:0.75rem">Not configured</span>'}</div>
        </div>

        ${FirebaseApp.ready ? `
          <div style="margin-bottom:16px">
            <div id="settings-firebase-user" style="margin-bottom:12px;font-size:0.82rem;color:var(--text-muted)">
              ${FirebaseApp.auth?.currentUser ?
                `Signed in as <strong style="color:var(--text)">${FirebaseApp.auth.currentUser.email}</strong>` :
                'Not signed into Google — cloud sync writes are disabled'}
            </div>
            ${!FirebaseApp.auth?.currentUser ? `
              <button class="btn" style="gap:8px;margin-bottom:12px" onclick="Settings.googleSignIn()">
                <svg width="16" height="16" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
                Sign in with Google
              </button>
            ` : `
              <button class="btn" style="margin-bottom:12px;color:var(--red);border-color:var(--red)" onclick="Settings.firebaseSignOut()">
                Disconnect Google
              </button>
            `}
          </div>
          <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px">
            <button class="btn btn-primary" onclick="Settings.forceSyncPush()">Push Local → Cloud</button>
            <button class="btn" onclick="Settings.forceSyncPull()">Pull Cloud → Local</button>
          </div>
          <p style="font-size:0.78rem;color:var(--text-dim)">Push uploads your local data to the cloud. Pull downloads the latest cloud data to this device. You must be signed into Google for push to work.</p>
        ` : `
          <p style="font-size:0.82rem;color:var(--text-muted);margin-bottom:12px">Firebase is not configured yet. To enable cloud sync:</p>
          <ol style="font-size:0.82rem;color:var(--text-muted);padding-left:20px;line-height:1.8">
            <li>Go to <a href="https://console.firebase.google.com" target="_blank" style="color:var(--accent)">Firebase Console</a></li>
            <li>Create a new project (or use an existing one)</li>
            <li>Enable <strong>Realtime Database</strong> (Build → Realtime Database)</li>
            <li>Enable <strong>Google sign-in</strong> in Authentication (Build → Authentication → Sign-in method)</li>
            <li>Copy your project config into <code>js/firebaseConfig.js</code></li>
          </ol>
        `}
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

    ['settings','trades','journal','thinkPieces','watchlist','snapshots','priceCache','historyCache'].forEach(k => {
      Storage.remove(k);
    });
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
  async googleSignIn() {
    const result = await Auth.signInWithGoogle();
    if (result.ok) {
      // Re-render settings page to show signed-in state
      this.render(document.getElementById('page-content'));
      if (typeof App !== 'undefined') App.updateSyncStatus();
    } else {
      alert('Google sign-in failed: ' + (result.error || 'Unknown error'));
    }
  },

  firebaseSignOut() {
    if (typeof FirebaseSync !== 'undefined') {
      FirebaseSync.signOut();
    }
    this.render(document.getElementById('page-content'));
    if (typeof App !== 'undefined') App.updateSyncStatus();
  },

  async forceSyncPush() {
    if (typeof FirebaseSync === 'undefined') return;
    const ok = await FirebaseSync.forcePush();
    if (ok) {
      alert('All local data pushed to cloud successfully!');
    } else {
      alert('Push failed. Make sure you are logged in.');
    }
    const el = document.getElementById('settings-sync-status');
    if (el) el.innerHTML = FirebaseSync.getStatusBadge();
  },

  async forceSyncPull() {
    if (typeof FirebaseSync === 'undefined') return;
    const ok = await FirebaseSync.forcePull();
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
      Storage.remove('historyCache');
      const start = performance.now();
      const history = await MarketData.getHistory('SPY', '1M', '1d');
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
      Storage.remove('historyCache');
      const hist = await MarketData.getHistory('SPY', '1M', '1d');
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
        Storage.remove('historyCache');
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
    const cachedHist = Storage.getCachedHistory('SPY', '1M');
    this._log(`  History cache (SPY 1M): ${cachedHist ? 'HIT — ' + cachedHist.length + ' bars' : 'MISS'}`, cachedHist ? 'ok' : 'warn');
    this._log('');

    this._log('═══════════════════════════════════════════');
    this._log('  Diagnostics complete');
    this._log('═══════════════════════════════════════════');
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
