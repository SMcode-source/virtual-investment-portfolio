// journal.js — Investment journal with timeline, filters, CRUD
const Journal = {
  filterSentiment: '',
  filterConviction: 0,

  render(container) {
    const entries = Storage.getJournalEntries();
    let filtered = [...entries].sort((a, b) => new Date(b.date) - new Date(a.date));

    if (this.filterSentiment) filtered = filtered.filter(e => e.sentiment === this.filterSentiment);
    if (this.filterConviction > 0) filtered = filtered.filter(e => e.conviction >= this.filterConviction);

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Investment Journal</h1>
          <p class="page-desc">Track your investment theses and reasoning</p>
        </div>
        <button class="btn btn-primary" onclick="Journal.showEditor()">+ New Entry</button>
      </div>

      <div class="filter-bar">
        <select class="form-control" style="width:auto" onchange="Journal.filterSentiment=this.value;Journal.render(document.getElementById('page-content'))">
          <option value="">All Sentiments</option>
          <option value="Bullish" ${this.filterSentiment === 'Bullish' ? 'selected' : ''}>Bullish</option>
          <option value="Neutral" ${this.filterSentiment === 'Neutral' ? 'selected' : ''}>Neutral</option>
          <option value="Bearish" ${this.filterSentiment === 'Bearish' ? 'selected' : ''}>Bearish</option>
        </select>
        <select class="form-control" style="width:auto" onchange="Journal.filterConviction=parseInt(this.value);Journal.render(document.getElementById('page-content'))">
          <option value="0">All Conviction</option>
          <option value="2" ${this.filterConviction === 2 ? 'selected' : ''}>★★+</option>
          <option value="3" ${this.filterConviction === 3 ? 'selected' : ''}>★★★+</option>
          <option value="4" ${this.filterConviction === 4 ? 'selected' : ''}>★★★★+</option>
          <option value="5" ${this.filterConviction === 5 ? 'selected' : ''}>★★★★★</option>
        </select>
      </div>

      <div id="journal-entries">
        ${filtered.length === 0 ? `
          <div class="empty-state">
            <div class="icon">📓</div>
            <h3>No journal entries yet</h3>
            <p>Create your first investment thesis entry</p>
          </div>
        ` : filtered.map(e => this.renderCard(e)).join('')}
      </div>

      <!-- Editor Modal -->
      <div id="journal-modal"></div>
    `;
  },

  renderCard(entry) {
    const trades = Storage.getTrades().filter(t => t.journalLink === entry.id || (entry.linkedTrades && entry.linkedTrades.includes(t.id)));
    return `
      <div class="journal-card">
        <div class="journal-card-header">
          <div>
            <span class="journal-ticker">${Utils.escHtml(entry.ticker || 'General')}</span>
            <span style="color:var(--text-muted);margin-left:8px">${Utils.escHtml(entry.title || '')}</span>
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            ${entry.sentiment ? Utils.sentimentBadge(entry.sentiment) : ''}
            <span>${Utils.stars(entry.conviction || 0)}</span>
            <button class="btn btn-sm" onclick="Journal.showEditor('${entry.id}')">Edit</button>
          </div>
        </div>
        <div class="journal-body">${Utils.escHtml(entry.body || '')}</div>
        <div class="journal-meta">
          <span style="color:var(--text-dim);font-size:0.78rem">${Utils.formatDate(entry.date)}</span>
          ${trades.length ? `<span class="badge badge-linked">${trades.length} linked trade${trades.length > 1 ? 's' : ''}</span>` : ''}
          <div class="journal-tags">
            ${(entry.tags || []).map(t => `<span class="tag">${Utils.escHtml(t)}</span>`).join('')}
          </div>
        </div>
        ${trades.length ? `
          <div style="margin-top:12px;display:flex;gap:6px;flex-wrap:wrap">
            ${trades.map(t => `<span class="badge ${t.type === 'BUY' ? 'badge-buy' : 'badge-sell'}">${t.type} ${t.shares} @ ${Utils.formatCurrency(t.price)}</span>`).join('')}
          </div>
        ` : ''}
      </div>
    `;
  },

  showEditor(id = null) {
    const entry = id ? Storage.getJournalEntries().find(e => e.id === id) : null;
    const modal = document.getElementById('journal-modal');
    if (!modal) return;

    modal.innerHTML = `
      <div class="modal-overlay" onclick="if(event.target===this)Journal.closeEditor()">
        <div class="modal">
          <div class="modal-header">
            <h3>${entry ? 'Edit Entry' : 'New Journal Entry'}</h3>
            <button class="modal-close" onclick="Journal.closeEditor()">&times;</button>
          </div>
          <div class="form-group">
            <label class="form-label">Ticker</label>
            <input type="text" class="form-control" id="je-ticker" value="${entry ? Utils.escHtml(entry.ticker || '') : ''}" placeholder="e.g. NVDA">
          </div>
          <div class="form-group">
            <label class="form-label">Title</label>
            <input type="text" class="form-control" id="je-title" value="${entry ? Utils.escHtml(entry.title || '') : ''}" placeholder="Thesis title">
          </div>
          <div class="form-group">
            <label class="form-label">Thesis</label>
            <textarea class="form-control" id="je-body" rows="6" placeholder="Your investment thesis...">${entry ? Utils.escHtml(entry.body || '') : ''}</textarea>
          </div>
          <div class="grid-2" style="gap:12px">
            <div class="form-group">
              <label class="form-label">Sentiment</label>
              <select class="form-control" id="je-sentiment">
                <option value="">Select...</option>
                <option value="Bullish" ${entry?.sentiment === 'Bullish' ? 'selected' : ''}>Bullish</option>
                <option value="Neutral" ${entry?.sentiment === 'Neutral' ? 'selected' : ''}>Neutral</option>
                <option value="Bearish" ${entry?.sentiment === 'Bearish' ? 'selected' : ''}>Bearish</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Conviction (1-5)</label>
              <input type="number" class="form-control" id="je-conviction" min="1" max="5" value="${entry?.conviction || 3}">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Tags (comma-separated)</label>
            <input type="text" class="form-control" id="je-tags" value="${entry ? (entry.tags || []).join(', ') : ''}" placeholder="AI, growth, momentum">
          </div>
          <button class="btn btn-primary" style="width:100%;justify-content:center" onclick="Journal.saveEntry('${id || ''}')">
            ${entry ? 'Update Entry' : 'Create Entry'}
          </button>
        </div>
      </div>
    `;
  },

  closeEditor() {
    const modal = document.getElementById('journal-modal');
    if (modal) modal.innerHTML = '';
  },

  saveEntry(id) {
    const data = {
      ticker: document.getElementById('je-ticker')?.value?.toUpperCase() || '',
      title: document.getElementById('je-title')?.value || '',
      body: document.getElementById('je-body')?.value || '',
      sentiment: document.getElementById('je-sentiment')?.value || '',
      conviction: parseInt(document.getElementById('je-conviction')?.value) || 3,
      tags: (document.getElementById('je-tags')?.value || '').split(',').map(t => t.trim()).filter(Boolean),
      date: new Date().toISOString()
    };

    if (id) {
      Storage.updateJournalEntry(id, data);
    } else {
      Storage.addJournalEntry(data);
    }

    this.closeEditor();
    this.render(document.getElementById('page-content'));
  }
};

window.Journal = Journal;
