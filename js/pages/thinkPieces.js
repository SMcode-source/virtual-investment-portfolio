/**
 * ============================================================================
 * THINKPIECES.JS — Long-Form Investment Articles & Research
 * ============================================================================
 *
 * PURPOSE:
 *   Write and store long-form investment research articles. Supports
 *   categorized tabs, rich text editing, and a reading-friendly layout.
 *
 * FEATURES:
 *   - Create, edit, and delete long-form articles
 *   - Categorize by tab (e.g., Macro, Sector, Stock-specific)
 *   - Full-text search across all articles
 *
 * REQUIRES LOGIN: Yes
 *
 * ============================================================================
 */
const ThinkPieces = {
  activeTab: 'all',

  render(container) {
    let pieces = Storage.getThinkPieces();
    if (this.activeTab === 'published') pieces = pieces.filter(p => p.status === 'published');
    if (this.activeTab === 'drafts') pieces = pieces.filter(p => p.status === 'draft');
    pieces.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));

    const gradients = [
      'linear-gradient(135deg, #6366f1, #8b5cf6)',
      'linear-gradient(135deg, #06b6d4, #3b82f6)',
      'linear-gradient(135deg, #f59e0b, #ef4444)',
      'linear-gradient(135deg, #22c55e, #06b6d4)',
      'linear-gradient(135deg, #ec4899, #8b5cf6)',
      'linear-gradient(135deg, #14b8a6, #22c55e)',
    ];
    const emojis = ['📈', '🏦', '🤖', '⚡', '🌍', '💡', '🔬', '🏭', '🛡️', '📊'];

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Think Pieces</h1>
          <p class="page-desc">Long-form investment articles and analysis</p>
        </div>
        <button class="btn btn-primary" onclick="ThinkPieces.showEditor()">+ New Article</button>
      </div>

      <div style="margin-bottom:24px">
        <div class="pill-toggle">
          <button class="pill ${this.activeTab === 'all' ? 'active' : ''}" onclick="ThinkPieces.activeTab='all';ThinkPieces.render(document.getElementById('page-content'))">All</button>
          <button class="pill ${this.activeTab === 'published' ? 'active' : ''}" onclick="ThinkPieces.activeTab='published';ThinkPieces.render(document.getElementById('page-content'))">Published</button>
          <button class="pill ${this.activeTab === 'drafts' ? 'active' : ''}" onclick="ThinkPieces.activeTab='drafts';ThinkPieces.render(document.getElementById('page-content'))">Drafts</button>
        </div>
      </div>

      <div class="grid-3" id="tp-grid">
        ${pieces.map((p, i) => `
          <div class="tp-card">
            <div class="tp-card-header" style="background:${gradients[i % gradients.length]}">
              ${emojis[i % emojis.length]}
            </div>
            <div class="tp-card-body">
              <div class="tp-card-title">${Utils.escHtml(p.title || 'Untitled')}</div>
              <div class="tp-card-meta">
                ${Utils.formatDate(p.updatedAt || p.createdAt)}
                &nbsp;·&nbsp;
                <span class="badge ${p.status === 'published' ? 'badge-published' : 'badge-draft'}">${p.status === 'published' ? 'Published' : 'Draft'}</span>
              </div>
              <div style="margin-top:12px;display:flex;gap:6px">
                <button class="btn btn-sm" onclick="ThinkPieces.showEditor('${p.id}')">Edit</button>
                <button class="btn btn-sm" onclick="ThinkPieces.preview('${p.id}')">Preview</button>
              </div>
            </div>
          </div>
        `).join('')}

        <!-- New Article Card -->
        <div class="tp-new-card" onclick="ThinkPieces.showEditor()">
          <div style="font-size:2rem;margin-bottom:8px">+</div>
          <div>New Article</div>
        </div>
      </div>

      <div id="tp-modal"></div>
    `;
  },

  showEditor(id = null) {
    const piece = id ? Storage.getThinkPieces().find(p => p.id === id) : null;
    const modal = document.getElementById('tp-modal');
    if (!modal) return;

    modal.innerHTML = `
      <div class="modal-overlay" onclick="if(event.target===this)ThinkPieces.closeEditor()">
        <div class="modal" style="max-width:800px">
          <div class="modal-header">
            <h3>${piece ? 'Edit Article' : 'New Article'}</h3>
            <button class="modal-close" onclick="ThinkPieces.closeEditor()">&times;</button>
          </div>
          <div class="form-group">
            <label class="form-label">Title</label>
            <input type="text" class="form-control" id="tp-title" value="${piece ? Utils.escHtml(piece.title || '') : ''}" placeholder="Article title">
          </div>
          <div class="form-group">
            <label class="form-label">Content (Markdown supported)</label>
            <textarea class="form-control" id="tp-content" rows="15" style="font-family:var(--font-mono);font-size:0.85rem" placeholder="Write your analysis...">${piece ? Utils.escHtml(piece.content || '') : ''}</textarea>
          </div>
          <div class="grid-2" style="gap:12px">
            <div class="form-group">
              <label class="form-label">Status</label>
              <select class="form-control" id="tp-status">
                <option value="draft" ${piece?.status === 'draft' ? 'selected' : ''}>Draft</option>
                <option value="published" ${piece?.status === 'published' ? 'selected' : ''}>Published</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Emoji</label>
              <input type="text" class="form-control" id="tp-emoji" value="${piece?.emoji || '📈'}" placeholder="📈" maxlength="4">
            </div>
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-primary" style="flex:1;justify-content:center" onclick="ThinkPieces.save('${id || ''}')">
              ${piece ? 'Update' : 'Create'}
            </button>
            ${piece ? `<button class="btn btn-red" onclick="ThinkPieces.deletePiece('${id}')">Delete</button>` : ''}
          </div>
        </div>
      </div>
    `;
  },

  closeEditor() {
    const modal = document.getElementById('tp-modal');
    if (modal) modal.innerHTML = '';
  },

  save(id) {
    const data = {
      title: document.getElementById('tp-title')?.value || 'Untitled',
      content: document.getElementById('tp-content')?.value || '',
      status: document.getElementById('tp-status')?.value || 'draft',
      emoji: document.getElementById('tp-emoji')?.value || '📈',
      updatedAt: new Date().toISOString()
    };

    if (id) {
      Storage.updateThinkPiece(id, data);
    } else {
      data.createdAt = new Date().toISOString();
      Storage.addThinkPiece(data);
    }

    this.closeEditor();
    this.render(document.getElementById('page-content'));
  },

  deletePiece(id) {
    if (!confirm('Delete this article?')) return;
    const pieces = Storage.getThinkPieces().filter(p => p.id !== id);
    Storage.saveThinkPieces(pieces);
    this.closeEditor();
    this.render(document.getElementById('page-content'));
  },

  preview(id) {
    const piece = Storage.getThinkPieces().find(p => p.id === id);
    if (!piece) return;

    const modal = document.getElementById('tp-modal');
    modal.innerHTML = `
      <div class="modal-overlay" onclick="if(event.target===this)ThinkPieces.closeEditor()">
        <div class="modal" style="max-width:800px">
          <div class="modal-header">
            <h3>${Utils.escHtml(piece.title)}</h3>
            <button class="modal-close" onclick="ThinkPieces.closeEditor()">&times;</button>
          </div>
          <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:16px">
            ${Utils.formatDate(piece.updatedAt || piece.createdAt)}
            &nbsp;·&nbsp;
            <span class="badge ${piece.status === 'published' ? 'badge-published' : 'badge-draft'}">${piece.status}</span>
          </div>
          <div class="article-content" style="white-space:pre-wrap">${Utils.escHtml(piece.content || '')}</div>
        </div>
      </div>
    `;
  }
};

window.ThinkPieces = ThinkPieces;
