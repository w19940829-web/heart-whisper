// =====================================================================
// metaphor.js — 獨立的比喻庫與萃取提煉系統 (長文煉金)
// =====================================================================

const METAPHOR_DB_KEY = 'metaphor_db_v1';

const MetaphorStore = {
  getAll() {
    return JSON.parse(localStorage.getItem(METAPHOR_DB_KEY) || '[]');
  },

  save(data) {
    const all = this.getAll();
    all.unshift({
      id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      quote: data.quote,
      tags: data.tags || [],
      note: data.note || '',
      created_at: new Date().toISOString()
    });
    localStorage.setItem(METAPHOR_DB_KEY, JSON.stringify(all));
  },

  delete(id) {
    const filtered = this.getAll().filter(m => m.id !== id);
    localStorage.setItem(METAPHOR_DB_KEY, JSON.stringify(filtered));
  },

  getAllTags() {
    const counts = {};
    this.getAll().forEach(m => {
      (m.tags || []).forEach(t => {
        counts[t] = (counts[t] || 0) + 1;
      });
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }
};

const MetaphorApp = {
  activeLibraryTag: null,
  currentDrafts: {}, // { draftId: draftObj }

  init() {
    if (typeof showToast !== 'function') {
      window.showToast = (msg) => { alert(msg); }; // fallback fallback
    }
    this.switchTab('extract');
    this.renderLibrary();
  },

  switchTab(tab) {
    document.querySelectorAll('.metaphor-tab').forEach(el => el.classList.remove('active'));
    document.getElementById(`mtab-${tab}`).classList.add('active');

    document.getElementById('mview-extract').style.display = tab === 'extract' ? 'block' : 'none';
    document.getElementById('mview-library').style.display = tab === 'library' ? 'block' : 'none';

    if (tab === 'library') {
      this.renderLibrary();
    }
  },

  escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  // === 引擎：雙軌薈萃 ===
  async processExtraction() {
    const inputEl = document.getElementById('metaphor-input');
    const text = inputEl.value.trim();
    if (!text) {
      if (typeof showToast === 'function') showToast("貼上一點文章再來煉金吧 ✨");
      return;
    }

    const btn = document.getElementById('btn-extract-metaphor');
    const spinner = document.getElementById('m-spinner');
    const textSpan = btn.querySelector('.btn-text');
    
    btn.disabled = true;
    spinner.style.display = 'inline-block';
    textSpan.textContent = " 煉金中...";

    let results = [];
    try {
      // 嘗試方案 C: 呼叫 Gemini AI
      if (typeof aiService !== 'undefined' && aiService.hasKey()) {
        console.log("Using Gemini AI for metaphor extraction.");
        results = await aiService.processMetaphorExtraction(text);
      } else {
        throw new Error("No API Key");
      }
    } catch (e) {
      console.log("AI Failed or unavailable, falling back to Regex based extraction. Error:", e);
      // 方案 B: Regex 備用引擎降級
      results = this.regexFallback(text);
      if (typeof showToast === 'function') showToast("目前使用離線關鍵字萃取模式");
    }

    btn.disabled = false;
    spinner.style.display = 'none';
    textSpan.innerHTML = '<i class="ph-fill ph-sparkle"></i> 開始自動提煉';

    if (results.length === 0) {
      if (typeof showToast === 'function') showToast("在這段文字中沒有找到明顯的比喻句 😔");
      return;
    }

    this.showDrafts(results);
    // Auto clear input
    inputEl.value = '';
    
    // Scroll to draft zone
    document.getElementById('mview-extract').scrollIntoView({ behavior: 'smooth' });
  },

  regexFallback(text) {
    // 透過標點符號分句
    const sentences = text.split(/[。！？\n；]/).map(s => s.trim()).filter(s => s.length > 5);
    const keywords = ['像', '如同', '彷彿', '宛如', '猶如', '好比', '似', '宛若'];
    
    const matches = [];
    for (const sent of sentences) {
      if (keywords.some(kw => sent.includes(kw))) {
        // Simple heuristic to filter out overly short/trivial ones if possible, but regex is dumb so we keep it simple
        matches.push({
          quote: sent + "。",
          tags: ["未分類"]
        });
      }
    }
    return matches;
  },


  // === 審核區 (Human in the loop) ===
  showDrafts(results) {
    const zone = document.getElementById('metaphor-draft-zone');
    const container = document.getElementById('metaphor-drafts-container');
    zone.style.display = 'block';
    container.innerHTML = '';
    this.currentDrafts = {};

    results.forEach((item, index) => {
      const draftId = `draft_${index}`;
      this.currentDrafts[draftId] = {
        quote: item.quote,
        tags: item.tags || []
      };

      const card = document.createElement('div');
      card.className = 'm-draft-card';
      card.id = draftId;
      
      card.innerHTML = `
        <div class="m-draft-quote">${this.escapeHtml(item.quote)}</div>
        <div class="m-draft-tags" id="${draftId}-tags">
          ${this.renderDraftTagsHtml(draftId, this.currentDrafts[draftId].tags)}
        </div>
        <textarea class="m-draft-note" id="${draftId}-note" rows="2" placeholder="📝 寫下這句話帶給你的靈感或觸動... (可選)"></textarea>
        <div class="m-draft-actions">
          <button class="primary-btn" style="background:transparent; color:var(--text-secondary); border:1px solid rgba(0,0,0,0.1); padding: 8px 16px;" onclick="MetaphorApp.discardDraft('${draftId}')">
             <i class="ph-bold ph-trash"></i> 捨棄
          </button>
          <button class="primary-btn" style="padding: 8px 16px;" onclick="MetaphorApp.approveDraft('${draftId}')">
             <i class="ph-bold ph-check"></i> 收入靈感庫
          </button>
        </div>
      `;
      container.appendChild(card);
    });
  },

  renderDraftTagsHtml(draftId, tags) {
    let html = tags.map((t, idx) => `
      <span class="m-draft-tag" onclick="MetaphorApp.removeDraftTag('${draftId}', ${idx})">
        #${this.escapeHtml(t)} <i class="ph-bold ph-x" style="opacity:0.5; font-size:0.75rem;"></i>
      </span>
    `).join('');
    
    html += `
      <span class="m-draft-tag add-tag-btn" onclick="MetaphorApp.addDraftTag('${draftId}')">
        <i class="ph-bold ph-plus"></i> 新增標籤
      </span>
    `;
    return html;
  },

  removeDraftTag(draftId, tagIndex) {
    const draft = this.currentDrafts[draftId];
    if (draft) {
      draft.tags.splice(tagIndex, 1);
      document.getElementById(`${draftId}-tags`).innerHTML = this.renderDraftTagsHtml(draftId, draft.tags);
    }
  },

  addDraftTag(draftId) {
    const draft = this.currentDrafts[draftId];
    if (!draft) return;
    const newTag = prompt("請輸入自訂標籤名稱：", "寫作素材");
    if (newTag && newTag.trim() !== '') {
      if (!draft.tags.includes(newTag.trim())) {
        draft.tags.push(newTag.trim());
        document.getElementById(`${draftId}-tags`).innerHTML = this.renderDraftTagsHtml(draftId, draft.tags);
      }
    }
  },

  discardDraft(draftId) {
    delete this.currentDrafts[draftId];
    const el = document.getElementById(draftId);
    if (el) {
      el.style.opacity = '0';
      el.style.transform = 'scale(0.95)';
      setTimeout(() => el.remove(), 200);
    }
    this.checkDraftsEmpty();
  },

  approveDraft(draftId) {
    const draft = this.currentDrafts[draftId];
    if (!draft) return;
    
    // Read note
    const noteEl = document.getElementById(`${draftId}-note`);
    const noteValue = noteEl ? noteEl.value.trim() : '';

    MetaphorStore.save({
      quote: draft.quote,
      tags: draft.tags,
      note: noteValue
    });

    if (typeof showToast === 'function') showToast("已將靈感收進專屬庫中 💎");
    
    this.discardDraft(draftId); // remove from draft UI
    this.renderLibrary(); // update background
  },

  checkDraftsEmpty() {
    const container = document.getElementById('metaphor-drafts-container');
    if (Object.keys(this.currentDrafts).length === 0) {
      document.getElementById('metaphor-draft-zone').style.display = 'none';
      if (typeof showToast === 'function') showToast("草稿區已清空！");
    }
  },


  // === 比喻庫 (Library View) ===
  renderLibrary() {
    const items = MetaphorStore.getAll();
    const gridEl = document.getElementById('metaphor-library-grid');
    const cloudEl = document.getElementById('metaphor-tag-cloud');
    
    if (!gridEl || !cloudEl) return;

    // 渲染標籤雲
    const tagData = MetaphorStore.getAllTags(); // [{tag, count}]
    
    let cloudHtml = `<span class="lib-chip ${this.activeLibraryTag === null ? 'active' : ''}" onclick="MetaphorApp.filterLibrary(null)">🔍 所有靈感 (${items.length})</span>`;
    
    tagData.forEach(([tag, count]) => {
      const activeClass = this.activeLibraryTag === tag ? 'active' : '';
      cloudHtml += `<span class="lib-chip ${activeClass}" onclick="MetaphorApp.filterLibrary('${this.escapeHtml(tag)}')">#${this.escapeHtml(tag)} <small style="opacity:0.7">(${count})</small></span>`;
    });
    cloudEl.innerHTML = cloudHtml;

    // 渲染卡片
    let displayItems = items;
    if (this.activeLibraryTag) {
      displayItems = items.filter(m => (m.tags || []).includes(this.activeLibraryTag));
    }

    if (displayItems.length === 0) {
      gridEl.innerHTML = `<div class="empty-state">
        <i class="ph-fill ph-plant"></i>
        <p>目前靈感庫空空如也，<br>切換到「煉金區」去萃取第一句話吧！</p>
      </div>`;
      return;
    }

    gridEl.innerHTML = displayItems.map(item => `
      <div class="lib-card">
        <div class="lib-card-quote" style="border-left: 3px solid var(--accent-calm); padding-left: 12px;">${this.escapeHtml(item.quote)}</div>
        <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:12px;">
          ${(item.tags||[]).map(t => `<span class="m-draft-tag" style="background:var(--bg-secondary); border:none; padding: 2px 8px; font-size:0.75rem;">#${this.escapeHtml(t)}</span>`).join('')}
        </div>
        ${item.note ? `<div class="sys-prompt-preview" style="margin-top:0; margin-bottom:12px; font-size:0.85rem;"><i class="ph-fill ph-quotes"></i> ${this.escapeHtml(item.note)}</div>` : ''}
        
        <div class="lib-card-meta">
          <span>${new Date(item.created_at).toLocaleDateString()}</span>
          <div style="display:flex; gap: 8px;">
            <button class="icon-btn" onclick="MetaphorApp.copyToClipboard('${item.id}')" title="複製 Markdown"><i class="ph-bold ph-copy"></i></button>
            <button class="icon-btn" onclick="MetaphorApp.deleteLibraryItem('${item.id}')"><i class="ph-bold ph-trash"></i></button>
          </div>
        </div>
      </div>
    `).join('');
  },

  filterLibrary(tag) {
    this.activeLibraryTag = tag;
    this.renderLibrary();
  },

  deleteLibraryItem(id) {
    if (confirm("確定要刪除這個極美的靈魂結晶嗎？")) {
      MetaphorStore.delete(id);
      this.renderLibrary();
      if (typeof showToast === 'function') showToast("已刪除");
    }
  },

  copyToClipboard(id) {
    const items = MetaphorStore.getAll();
    const item = items.find(m => m.id === id);
    if (!item) return;

    let md = `> 「${item.quote}」\n`;
    if (item.note) md += `${item.note}\n`;
    if (item.tags && item.tags.length > 0) {
      md += `\n${item.tags.map(t => `#${t}`).join(' ')}`;
    }

    navigator.clipboard.writeText(md).then(() => {
      if (typeof showToast === 'function') showToast("📋 已複製為 Markdown 格式！");
    }).catch(err => {
      console.error('Copy failed', err);
    });
  }
};
