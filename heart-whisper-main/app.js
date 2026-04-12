// Core App State & Logic
let quotesDb = JSON.parse(localStorage.getItem('hw_quotes')) || [];
let currentProcessingQuote = null;
let currentReviewSession = [];
let reviewIndex = 0;

/* --- Standardized Emotion Vocabulary (Two-Tier) & Categories --- */
const DEFAULT_PREFS = {
  categories: {
    'cat_faith': { name: '🙏 信仰連結', color: '#b8b3c9', class: 'cat-faith' },
    'cat_empathy': { name: '🫂 安慰共感', color: '#a3b1a6', class: 'cat-empathy' },
    'cat_reframe': { name: '🔄 轉念重塑', color: '#8ea4bf', class: 'cat-reframe' },
    'cat_action': { name: '💪 推動行動', color: '#d4a574', class: 'cat-action' },
    'cat_compassion': { name: '🤗 自我疼惜', color: '#c4a3b1', class: 'cat-compassion' },
    'cat_growth': { name: '🌱 成長提醒', color: '#9db89d', class: 'cat-growth' },
  },
  emotions: {
    'emo_anxiety': { name: '焦慮', emoji: '😰', triggers: ['趕死線時', '社交場合前', '對未來不安', '完美主義發作'] },
    'emo_anger': { name: '憤怒', emoji: '😤', triggers: ['被否定時', '對自己生氣', '人際摩擦', '感到不公平'] },
    'emo_sadness': { name: '悲傷', emoji: '😢', triggers: ['失去重要的事物', '被拒絕後', '感到失望', '想起過去'] },
    'emo_fear': { name: '恐懼', emoji: '😨', triggers: ['害怕失敗', '害怕被評價', '面對未知', '承擔責任時'] },
    'emo_fatigue': { name: '疲憊', emoji: '😮‍💨', triggers: ['身心俱疲', '燃盡感', '找不到動力', '睡不好的日子'] },
    'emo_loneliness': { name: '孤獨', emoji: '🌙', triggers: ['覺得沒人懂', '被忽略時', '想念某人', '深夜獨處'] },
    'emo_inferiority': { name: '自卑', emoji: '😞', triggers: ['比較心態', '覺得不夠好', '冒名頂替感', '被批評後'] },
    'emo_confusion': { name: '迷茫', emoji: '🌫️', triggers: ['不知道方向', '選擇困難', '意義感消失', '信心動搖'] }
  }
};

let hwPreferences = JSON.parse(localStorage.getItem('hw_preferences'));
if (!hwPreferences || !localStorage.getItem('hw_v3_migrated')) {
  hwPreferences = DEFAULT_PREFS;
  localStorage.setItem('hw_preferences', JSON.stringify(hwPreferences));
  localStorage.setItem('hw_v3_migrated', 'true');
}

let EMOTION_VOCAB = hwPreferences.emotions;
let CATEGORY_MAP = hwPreferences.categories;

// --- V3 UUID Migration Map (Revert to V1) ---
const V3_CATEGORY_MAP = {
  'cat_grounding': 'cat_faith',
  'cat_self_compassion': 'cat_empathy',
  'cat_anti_splitting': 'cat_reframe',
  'cat_micro_action': 'cat_action',
  'cat_anti_catastrophize': 'cat_growth'
};

const V3_EMOTION_MAP = {
  'emo_overdrive': 'emo_anxiety',
  'emo_dysregulation': 'emo_anger',
  'emo_burnout': 'emo_sadness',
  'emo_rsd': 'emo_fear',
  'emo_paralysis': 'emo_fatigue',
  'emo_fog': 'emo_confusion'
};

// --- DB Migration ---
if (quotesDb && quotesDb.length > 0) {
  let dbChanged = false;
  quotesDb.forEach(q => {
    // V2 to V1(V3) UUID migration
    if (q.category && V3_CATEGORY_MAP[q.category]) {
      q.category = V3_CATEGORY_MAP[q.category];
      dbChanged = true;
    }
    
    if (q.emotional_anchors && q.emotional_anchors.primary_emotion && V3_EMOTION_MAP[q.emotional_anchors.primary_emotion]) {
      q.emotional_anchors.primary_emotion = V3_EMOTION_MAP[q.emotional_anchors.primary_emotion];
      dbChanged = true;
    }

    // Migrate Category legacy strings
    if (q.category && !q.category.startsWith('cat_') && q.category !== '無分類' && q.category !== '未分類' && q.category !== 'cat_uncategorized') {
      const matchKey = Object.keys(CATEGORY_MAP).find(k => CATEGORY_MAP[k].name === q.category || CATEGORY_MAP[k].name.includes(q.category));
      if (matchKey) {
        q.category = matchKey;
      } else {
        q.category = 'cat_uncategorized';
      }
      dbChanged = true;
    }
    
    // Migrate Emotion Anchor (only if primary_emotion is a string name instead of emo_uuid)
    if (q.emotional_anchors && q.emotional_anchors.primary_emotion && !q.emotional_anchors.primary_emotion.startsWith('emo_')) {
      const eName = q.emotional_anchors.primary_emotion;
      const matchKey = Object.keys(EMOTION_VOCAB).find(k => EMOTION_VOCAB[k].name === eName || EMOTION_VOCAB[k].name.includes(eName));
      if (matchKey) {
        q.emotional_anchors.primary_emotion = matchKey;
        dbChanged = true;
      }
    }
  });
  if (dbChanged) {
    localStorage.setItem('hw_quotes', JSON.stringify(quotesDb));
  }
}

// Helper: find emotion for a trigger
function findEmotionForTrigger(trigger) {
  for (const [emotionUuid, data] of Object.entries(EMOTION_VOCAB)) {
    if (data.triggers.includes(trigger)) return emotionUuid;
  }
  return null;
}

// Helper: get display anchor (backward compatible)
function getQuoteAnchor(q) {
  if (q.emotional_anchors && q.emotional_anchors.primary) {
    return q.emotional_anchors.primary;
  }
  return q.user_anchor || q.anchors?.[0] || '未分類';
}

function getQuoteEmotion(q) {
  if (q.emotional_anchors && q.emotional_anchors.primary_emotion) {
    return q.emotional_anchors.primary_emotion;
  }
  // Fallback: guess from old user_anchor
  const anchor = q.user_anchor || '';
  for (const [emotionUuid, data] of Object.entries(EMOTION_VOCAB)) {
    if (anchor.includes(data.name)) return emotionUuid;
    for (const t of data.triggers) {
      if (anchor.includes(t)) return emotionUuid;
    }
  }
  return 'emo_confusion'; // default fallback
}

/* --- UI Logic & Routing --- */
function switchView(viewId) {
  // Haptic feedback
  if (window.navigator && window.navigator.vibrate) window.navigator.vibrate(15);
  
  // Stop speaking when switching views
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  
  document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
  document.getElementById(viewId).classList.add('active');
  
  if (viewId === 'view-home') {
    updateDashboard();
  } else if (viewId === 'view-add') {
    renderManualCategorySelect();
    renderEmotionVocabGrid();
  }
}

function updateDashboard() {
  document.getElementById('stat-total').textContent = quotesDb.length;
  
  // Calculate due for today
  const now = new Date().getTime();
  const dueQuotes = quotesDb.filter(q => q.nextReviewDate <= now);
  const dueEl = document.getElementById('due-count');
  if (dueEl) dueEl.textContent = dueQuotes.length;
  
  // Update Soul Garden
  updateSoulGarden();

  // 2-B: Reading streak
  const streakEl = document.getElementById('bible-streak-display');
  if (streakEl) {
    const count = typeof getBibleStreakCount === 'function' ? getBibleStreakCount() : 0;
    streakEl.textContent = count > 0 ? `🔥 連續 ${count} 天` : '';
    streakEl.style.display = count > 0 ? 'inline' : 'none';
  }

  // 2-A: Daily verse
  const dvEl = document.getElementById('daily-verse-preview');
  if (dvEl && typeof getDailyVerseForHome === 'function') {
    const dv = getDailyVerseForHome();
    if (dv) {
      dvEl.style.display = 'block';
      const preview = dv.text.length > 30 ? dv.text.substring(0, 30) + '...' : dv.text;
      dvEl.querySelector('.dv-text').textContent = `「${preview}」`;
    }
  }
}

let toastQueue = [];
let isToastShowing = false;

function showToast(message) {
  toastQueue.push(message);
  processToastQueue();
}

function processToastQueue() {
  if (isToastShowing || toastQueue.length === 0) return;
  
  isToastShowing = true;
  const message = toastQueue.shift();
  const toast = document.getElementById('toast');
  
  toast.textContent = message;
  toast.classList.add('show');
  
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      isToastShowing = false;
      processToastQueue();
    }, 400); // wait for CSS transition
  }, 3000);
}

/* --- Settings Modal --- */
function openSettings() {
  document.getElementById('settings-modal').classList.add('active');
}

function closeSettings() {
  document.getElementById('settings-modal').classList.remove('active');
}

function saveSettings() {
  showToast('✅ 設定儲存成功');
  closeSettings();
}

/* --- ADD NEW QUOTE (PHASE 1 - MANUAL) --- */

function generateLocalQuoteMetadata(text) {
  // Simple chunking based on standard Chinese/English punctuation
  let chunks = text.split(/[,.，。!?:；\n]/).map(s => s.trim()).filter(s => s.length > 0);
  if (chunks.length === 0) chunks = [text];
  
  // Simple cloze logic: try to hide a word. We can just pick the longest chunk, and hide 2-4 chars in the middle.
  let clozeStr = text;
  let wordToHide = "";
  if (text.length > 4) {
    const matches = text.match(/[\u4e00-\u9fa5A-Za-z]{2,4}/g);
    if(matches && matches.length > 0) {
      wordToHide = matches[Math.floor(Math.random() * matches.length)];
    } else {
      wordToHide = text.substring(Math.floor(text.length / 2), Math.floor(text.length / 2) + 2);
    }
  } else if (text.length > 0) {
    wordToHide = text.substring(0, 1);
  }
  
  if (wordToHide) {
    // Escape for regex and replace the first occurrence
    clozeStr = text.replace(wordToHide, `[${wordToHide}]`);
  }

  return {
    focus_mode: {
      chunked_quote: chunks,
      micro_task: "請專注在心裡默唸這段話"
    },
    cloze_versions: {
      low_pressure: clozeStr,
      standard: clozeStr
    }
  };
}

function renderManualCategorySelect() {
  const select = document.getElementById('manual-category-select');
  if (!select) return;
  select.innerHTML = '<option value="">請選擇一個最適合的分類</option>';
  for (const [catId, catData] of Object.entries(CATEGORY_MAP)) {
    const opt = document.createElement('option');
    opt.value = catId;
    opt.textContent = catData.name;
    select.appendChild(opt);
  }
}

function selectAnchorChip(chip) {
  document.querySelectorAll('#emotion-vocab-grid .scenario-chip').forEach(el => el.classList.remove('selected'));
  chip.classList.add('selected');
}

function renderEmotionVocabGrid() {
  const grid = document.getElementById('emotion-vocab-grid');
  if (!grid) return;
  grid.innerHTML = '';
  
  for (const [emotion, data] of Object.entries(EMOTION_VOCAB)) {
    const group = document.createElement('div');
    group.className = 'emotion-group';
    
    const header = document.createElement('div');
    header.className = 'emotion-group-header';
    header.innerHTML = `${data.emoji} ${data.name || emotion}`;
    group.appendChild(header);
    
    const chips = document.createElement('div');
    chips.className = 'emotion-group-chips';
    
    data.triggers.forEach(trigger => {
      const chip = document.createElement('div');
      chip.className = 'scenario-chip small';
      chip.textContent = trigger;
      chip.dataset.trigger = trigger;
      chip.dataset.emotion = emotion;
      chip.onclick = () => selectAnchorChip(chip);
      chips.appendChild(chip);
    });
    
    group.appendChild(chips);
    grid.appendChild(group);
  }
}

function saveQuote() {
  const text = document.getElementById('quote-input').value.trim();
  if (!text) {
    showToast('請先輸入你要記憶的金句');
    return;
  }

  const categorySelect = document.getElementById('manual-category-select');
  const catId = categorySelect ? categorySelect.value : '';
  
  if (!catId) {
    showToast('請選擇這句話的核心分類');
    return;
  }

  const selectedChip = document.querySelector('.scenario-chip.selected');
  const selectedTrigger = selectedChip?.dataset?.trigger;
  const selectedEmotion = selectedChip?.dataset?.emotion || findEmotionForTrigger(selectedTrigger) || 'emo_confusion';
  
  if (!selectedTrigger) {
    showToast('請選擇一個情緒錨點');
    return;
  }
  
  const metadata = generateLocalQuoteMetadata(text);

  const newQuote = {
    id: Date.now().toString(),
    original: text,
    addedAt: Date.now(),
    nextReviewDate: Date.now(),
    history: [],
    category: catId,
    emotional_anchors: {
      primary: selectedTrigger,
      primary_emotion: selectedEmotion
    },
    user_anchor: selectedTrigger,
    ...metadata
  };
  
  quotesDb.push(newQuote);
  localStorage.setItem('hw_quotes', JSON.stringify(quotesDb));
  
  showToast('🌸 金句已收錄為你的專屬工具！');
  
  // Cleanup
  document.getElementById('quote-input').value = '';
  document.querySelectorAll('.scenario-chip.selected').forEach(el => el.classList.remove('selected'));
  if (categorySelect) categorySelect.value = '';
  
  switchView('view-home');
}

/* ============================================ */
/* === CARD BUILDER: 圖卡工作室核心逐輯       === */
/* ============================================ */

const FONT_CDN = {
  'font-chenyu': 'https://cdn.jsdelivr.net/gh/max32002/ChenYuluoyan-Thin-Monospaced@1/WebFont/ChenYuluoyan-Thin.css',
  'font-iansui':  'https://cdn.jsdelivr.net/gh/max32002/iansui@main/WebFont/Iansui-Regular.css',
  'font-seto':    'https://cdn.jsdelivr.net/gh/max32002/seto@main/WebFont/SetoFont.css',
  'font-lxgw':    'https://cdn.jsdelivr.net/npm/lxgw-wenkai-tc-webfont@1.7.0/style.css',
  'font-serif':   'https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@400;500;700&display=swap',
  'font-twkai':   'https://cdn.jsdelivr.net/gh/max32002/naikaifont@main/WebFont/NaikaiFont-Regular.css',
  'font-swei':    'https://cdn.jsdelivr.net/gh/max32002/swei-gothic@main/WebFont/SweiGothicCJKtc-Regular.css',
  'font-default': null // System font, no loading needed
};

const loadedFonts = new Set(['font-default']);
let currentCardQuote = null;
let currentFontClass = 'font-default';
let currentBgClass = 'bg-theme-pearl';
let currentRatioClass = 'ratio-9-16';
let currentLayoutClass = 'layout-vertical';



// Init
document.addEventListener('DOMContentLoaded', () => {
  updateDashboard();
  updateLibraryFilters();
  // Attempt to load voices early
  if (window.speechSynthesis) {
    window.speechSynthesis.getVoices();
  }
});

/* --- Library, Slideshow, Gacha now in js/library.js and js/gacha.js --- */


/* --- Soul Garden removed in V2.1 --- */


// ================================
// 15. Sticky Notes (共鳴便利貼)
// ================================
function showNoteInput(quoteId) {
  const area = document.getElementById(`note-area-${quoteId}`);
  if (!area) return;
  area.innerHTML = `
    <div class="note-input-area">
      <input type="text" id="note-input-${quoteId}" placeholder="寫下這句話讓你想到什麼..." maxlength="100" />
      <button onclick="saveNote('${quoteId}')">貼上</button>
    </div>
  `;
  setTimeout(() => document.getElementById(`note-input-${quoteId}`)?.focus(), 100);
}

function editNote(quoteId) {
  const q = quotesDb.find(q => String(q.id) === String(quoteId));
  if (!q) return;
  const area = document.getElementById(`note-area-${quoteId}`);
  if (!area) return;
  area.innerHTML = `
    <div class="note-input-area">
      <input type="text" id="note-input-${quoteId}" value="${q.personal_note || ''}" maxlength="100" />
      <button onclick="saveNote('${quoteId}')">更新</button>
    </div>
  `;
  setTimeout(() => document.getElementById(`note-input-${quoteId}`)?.focus(), 100);
}

function saveNote(quoteId) {
  const input = document.getElementById(`note-input-${quoteId}`);
  if (!input) return;
  const noteText = input.value.trim();
  
  const idx = quotesDb.findIndex(q => String(q.id) === String(quoteId));
  if (idx === -1) return;
  
  quotesDb[idx].personal_note = noteText;
  localStorage.setItem('hw_quotes', JSON.stringify(quotesDb));
  
  const area = document.getElementById(`note-area-${quoteId}`);
  if (noteText) {
    area.innerHTML = `<div class="lib-note-display" ondblclick="editNote('${quoteId}')">${noteText}</div>`;
    showToast('📌 便利貼已貼上！');
  } else {
    area.innerHTML = `<button class="btn-add-note" onclick="showNoteInput('${quoteId}')"><i class="ph-bold ph-note-pencil"></i> 貼便利貼</button>`;
    showToast('便利貼已移除');
  }
}

// ================================
// 16. Category Edit (分類重新編輯)
// ================================
let editingQuoteId = null;
let editSelectedEmotion = null;
let editSelectedTrigger = null;

function openEditPanel(quoteId, event) {
  event.stopPropagation();
  
  // Close any existing edit panel
  document.querySelectorAll('.edit-panel').forEach(el => el.remove());
  
  const q = quotesDb.find(q => String(q.id) === String(quoteId));
  if (!q) return;
  
  editingQuoteId = quoteId;
  editSelectedEmotion = getQuoteEmotion(q);
  editSelectedTrigger = getQuoteAnchor(q);
  
  const card = event.target.closest('.lib-card');
  if (!card) return;
  
  // Build category options
  const catOptions = Object.keys(CATEGORY_MAP).map(c => {
    const selected = (q.category === c) ? 'selected' : '';
    return '<option value="' + c + '" ' + selected + '>' + CATEGORY_MAP[c].name + '</option>';
  }).join('');
  
  // Build emotion chips
  const emotionChips = Object.entries(EMOTION_VOCAB).map(([emotionUuid, data]) => {
    const sel = (emotionUuid === editSelectedEmotion) ? 'selected' : '';
    return '<button class="edit-emotion-chip ' + sel + '" onclick="selectEditEmotion(\'' + emotionUuid + '\', \'' + quoteId + '\')">' + data.emoji + ' ' + data.name + '</button>';
  }).join('');
  
  // Build trigger chips for current emotion
  const triggerHtml = buildTriggerChips(editSelectedEmotion, editSelectedTrigger, quoteId);
  
  const panel = document.createElement('div');
  panel.className = 'edit-panel';
  panel.id = 'edit-panel-' + quoteId;
  panel.innerHTML = 
    '<div class="edit-panel-label">功能分類</div>' +
    '<select id="edit-cat-' + quoteId + '">' + catOptions + '</select>' +
    '<div class="edit-panel-label">核心情緒</div>' +
    '<div class="edit-emotion-grid">' + emotionChips + '</div>' +
    '<div class="edit-panel-label">觸發情境</div>' +
    '<div class="edit-trigger-grid" id="edit-triggers-' + quoteId + '">' + triggerHtml + '</div>' +
    '<div class="edit-panel-actions">' +
      '<button class="edit-cancel-btn" onclick="closeEditPanel(\'' + quoteId + '\')">取消</button>' +
      '<button class="edit-save-btn" onclick="saveEditPanel(\'' + quoteId + '\')">儲存</button>' +
    '</div>';
  
  card.appendChild(panel);
}

function buildTriggerChips(emotionUuid, currentTrigger, quoteId) {
  const triggers = EMOTION_VOCAB[emotionUuid]?.triggers || [];
  return triggers.map(t => {
    const sel = (t === currentTrigger) ? 'selected' : '';
    return '<button class="edit-trigger-chip ' + sel + '" onclick="selectEditTrigger(\'' + t + '\', \'' + quoteId + '\')">' + t + '</button>';
  }).join('');
}

function selectEditEmotion(emotion, quoteId) {
  editSelectedEmotion = emotion;
  editSelectedTrigger = null;
  
  // Update emotion chip visuals
  const panel = document.getElementById('edit-panel-' + quoteId);
  if (!panel) return;
  panel.querySelectorAll('.edit-emotion-chip').forEach(el => el.classList.remove('selected'));
  event.target.classList.add('selected');
  
  // Rebuild trigger chips
  const triggerContainer = document.getElementById('edit-triggers-' + quoteId);
  if (triggerContainer) {
    triggerContainer.innerHTML = buildTriggerChips(emotion, null, quoteId);
  }
}

function selectEditTrigger(trigger, quoteId) {
  editSelectedTrigger = trigger;
  const container = document.getElementById('edit-triggers-' + quoteId);
  if (!container) return;
  container.querySelectorAll('.edit-trigger-chip').forEach(el => el.classList.remove('selected'));
  event.target.classList.add('selected');
}

function closeEditPanel(quoteId) {
  const panel = document.getElementById('edit-panel-' + quoteId);
  if (panel) panel.remove();
  editingQuoteId = null;
}

function saveEditPanel(quoteId) {
  const idx = quotesDb.findIndex(q => String(q.id) === String(quoteId));
  if (idx === -1) return;
  
  const catSelect = document.getElementById('edit-cat-' + quoteId);
  const newCategory = catSelect ? catSelect.value : quotesDb[idx].category;
  
  quotesDb[idx].category = newCategory;
  
  if (editSelectedEmotion) {
    if (!quotesDb[idx].emotional_anchors) quotesDb[idx].emotional_anchors = {};
    quotesDb[idx].emotional_anchors.primary_emotion = editSelectedEmotion;
  }
  
  if (editSelectedTrigger) {
    if (!quotesDb[idx].emotional_anchors) quotesDb[idx].emotional_anchors = {};
    quotesDb[idx].emotional_anchors.primary = editSelectedTrigger;
    quotesDb[idx].user_anchor = editSelectedTrigger;
  }
  
  localStorage.setItem('hw_quotes', JSON.stringify(quotesDb));
  showToast('分類已更新 ✨');
  
  closeEditPanel(quoteId);
  renderLibrary(document.getElementById('library-category-select')?.value || '全部');
}


// --- Mailbox History & UI ---
/* --- TAGS MANAGER --- */
let currentManagerType = null; // 'category' | 'emotion'

function openCategoryManager() {
  currentManagerType = 'category';
  document.getElementById('tags-modal-title').innerText = '功能分類管理 (上限 10)';
  document.getElementById('tags-modal').classList.add('active');
  renderTagsList();
}

function openEmotionManager() {
  currentManagerType = 'emotion';
  document.getElementById('tags-modal-title').innerText = '核心情緒管理 (上限 15)';
  document.getElementById('tags-modal').classList.add('active');
  renderTagsList();
}

function closeTagsManager() {
  document.getElementById('tags-modal').classList.remove('active');
  renderLibrary();
  updateLibraryFilters();
}

function openFruitReference() {
  document.getElementById('fruit-ref-modal').classList.add('active');
}

function closeFruitReference() {
  document.getElementById('fruit-ref-modal').classList.remove('active');
}

function renderTagsList() {
  const container = document.getElementById('tags-list-container');
  container.innerHTML = '';
  
  if (currentManagerType === 'category') {
    const cats = Object.entries(hwPreferences.categories);
    cats.forEach(([id, item]) => {
      container.appendChild(createTagElement(id, item.name, item.color));
    });
    document.getElementById('btn-add-new-tag').style.display = cats.length >= 10 ? 'none' : 'block';
  } else {
    const emos = Object.entries(hwPreferences.emotions);
    emos.forEach(([id, item]) => {
      container.appendChild(createTagElement(id, `${item.emoji} ${item.name}`, null, item.triggers.join('、')));
    });
    document.getElementById('btn-add-new-tag').style.display = emos.length >= 15 ? 'none' : 'block';
  }
}

function createTagElement(id, title, colorInfo, subtitleInfo) {
  const div = document.createElement('div');
  div.style.padding = '12px';
  div.style.background = 'var(--bg-secondary)';
  div.style.borderRadius = '12px';
  div.style.border = '1px solid rgba(0,0,0,0.05)';
  div.style.display = 'flex';
  div.style.justifyContent = 'space-between';
  div.style.alignItems = 'center';

  let leftHtml = `<div style="display:flex; flex-direction:column; gap:4px;">
    <div style="font-weight:600; color:var(--text-primary); display:flex; gap:8px; align-items:center;">
      ${colorInfo ? `<span style="width:12px;height:12px;border-radius:50%;background:${colorInfo};display:inline-block"></span>` : ''}
      ${title}
    </div>
    ${subtitleInfo ? `<small style="color:var(--text-secondary);font-size:0.8rem;line-height:1.2;">觸發：${subtitleInfo}</small>` : ''}
  </div>`;

  div.innerHTML = leftHtml + `
    <div style="display:flex; gap:8px;">
      <button class="icon-btn" onclick="promptEditTag('${id}')" title="編輯"><i class="ph-bold ph-pencil-simple"></i></button>
      <button class="icon-btn" onclick="deleteTag('${id}')" title="刪除"><i class="ph-bold ph-trash"></i></button>
    </div>
  `;
  return div;
}

function addNewTag() {
  if (currentManagerType === 'category') {
    const name = prompt("請輸入新分類名稱 (建議包含 Emoji，例如：🌟 新分類)：");
    if (!name || name.trim() === '') return;
    const newId = 'cat_' + Date.now();
    hwPreferences.categories[newId] = {
      id: newId,
      name: name.trim(),
      color: '#d1d8e0',
      class: 'cat-reframe'
    };
  } else {
    const name = prompt("請輸入新情緒名稱：");
    if (!name || name.trim() === '') return;
    const emoji = prompt("請輸入代表此情緒的 Emoji：", "💫") || "💫";
    const triggersRaw = prompt("請輸入觸發場景（用逗號分隔）：");
    const triggers = triggersRaw ? triggersRaw.split(/[,，、]/).map(t => t.trim()).filter(Boolean) : [];
    
    const newId = 'emo_' + Date.now();
    hwPreferences.emotions[newId] = {
      id: newId,
      name: name.trim(),
      emoji: emoji.trim(),
      triggers: triggers
    };
  }
  savePreferences();
  renderTagsList();
}

function promptEditTag(id) {
  if (currentManagerType === 'category') {
    const cat = hwPreferences.categories[id];
    const newName = prompt("修改分類名稱：", cat.name);
    if (newName && newName.trim() !== '') {
      cat.name = newName.trim();
      savePreferences();
      renderTagsList();
    }
  } else {
    const emo = hwPreferences.emotions[id];
    const newName = prompt("修改情緒名稱：", emo.name);
    if (!newName) return;
    const newEmoji = prompt("修改 Emoji：", emo.emoji) || emo.emoji;
    const newTriggersRaw = prompt("修改觸發場景（逗號分隔）：", emo.triggers.join('，'));
    const newTriggers = newTriggersRaw ? newTriggersRaw.split(/[,，、]/).map(t => t.trim()).filter(Boolean) : emo.triggers;
    
    emo.name = newName.trim();
    emo.emoji = newEmoji.trim();
    emo.triggers = newTriggers;
    savePreferences();
    renderTagsList();
  }
}

function deleteTag(id) {
  if (!confirm("確定要刪除嗎？刪除後，原本屬於此標籤的金句將歸為「未分類/迷茫」。")) return;
  
  if (currentManagerType === 'category') {
    delete hwPreferences.categories[id];
    quotesDb.forEach(q => { if(q.category === id) q.category = 'cat_uncategorized'; });
  } else {
    delete hwPreferences.emotions[id];
    quotesDb.forEach(q => {
      if(q.emotional_anchors && q.emotional_anchors.primary_emotion === id) {
        q.emotional_anchors.primary_emotion = 'emo_confusion'; 
      }
    });
  }
  
  localStorage.setItem('hw_quotes', JSON.stringify(quotesDb));
  savePreferences();
  renderTagsList();
}

function savePreferences() {
  localStorage.setItem('hw_preferences', JSON.stringify(hwPreferences));
  EMOTION_VOCAB = hwPreferences.emotions;
  CATEGORY_MAP = hwPreferences.categories;
  showToast("標籤設定已儲存 ✅");
}

function updateLibraryFilters() {
  const select = document.getElementById('library-category-select');
  if(!select) return;
  
  const currentVal = select.value;
  let optionsHtml = '<option value="全部">🌈 全部金句</option>';
  optionsHtml += '<option value="📖 聖經">📖 聖經收藏</option>';
  Object.values(CATEGORY_MAP).forEach(c => {
    optionsHtml += `<option value="${c.id}">${c.name}</option>`;
  });
  optionsHtml += '<option value="cat_uncategorized">📁 未分類</option>';
  
  select.innerHTML = optionsHtml;
  if(select.querySelector(`option[value="${currentVal}"]`)) {
    select.value = currentVal;
  }
}
