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

/* --- Data Backup & Restore --- */
function exportData() {
  if (quotesDb.length === 0) {
    showToast('目前沒有金句可以匯出喔！');
    return;
  }
  
  const data = { 
    quotes: quotesDb, 
    streak: localStorage.getItem('hw_streak') || 0, 
    mailbox: mailboxDb,
    preferences: hwPreferences
  };
  const dataStr = JSON.stringify(data, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const a = document.createElement('a');
  a.href = url;
  a.download = `heart-whisper-backup-${dateStr}.json`;
  a.click();
  
  URL.revokeObjectURL(url);
  showToast('💾 備份檔案已成功下載！');
}

function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  if (!confirm('⚠️ 警告：匯入新的備份檔將會「完全覆蓋」目前所有的金句與紀錄，確定要繼續嗎？')) {
    event.target.value = '';
    return;
  }
  
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const importedData = JSON.parse(e.target.result);
      
      // Support raw array (old formats maybe) or object {quotes: [], streak: 0}
      if (Array.isArray(importedData)) {
        quotesDb = importedData;
      } else if (importedData.quotes && Array.isArray(importedData.quotes)) {
        quotesDb = importedData.quotes;
        if(importedData.streak) localStorage.setItem('hw_streak', importedData.streak);
        if(importedData.mailbox) mailboxDb = importedData.mailbox;
        if(importedData.preferences) {
          hwPreferences = importedData.preferences;
          localStorage.setItem('hw_preferences', JSON.stringify(hwPreferences));
          EMOTION_VOCAB = hwPreferences.emotions;
          CATEGORY_MAP = hwPreferences.categories;
        }
      } else {
        throw new Error('不支援的檔案格式，請確認是否為心語漫遊備份檔。');
      }
      
      localStorage.setItem('hw_quotes', JSON.stringify(quotesDb));
      localStorage.setItem('hw_mailboxDb', JSON.stringify(mailboxDb));
      
      showToast('📥 備份資料已成功還原！');
      updateDashboard();
      closeSettings();
      switchView('view-home');
      
    } catch (err) {
      console.error(err);
      showToast('❌ 匯入失敗與檔案錯誤：' + err.message);
    }
    event.target.value = '';
  };
  reader.readAsText(file);
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
  if(typeof addSoulPoints === 'function') addSoulPoints(3);
  
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

/* --- NEW FEATURES: EMOTIONAL ANCHOR SYSTEM --- */


// 2. Library
function openLibrary() {
  if (quotesDb.length === 0) {
    showToast('金句庫還是空的喔！先去採集一句吧 ✨');
    return;
  }
  switchView('view-library');
  renderLibrary('全部');
}

function renderLibrary(activeCategory) {
  const gridContainer = document.getElementById('library-grid');
  const select = document.getElementById('library-category-select');
  const searchInput = document.getElementById('library-search');
  if (select) {
    select.value = activeCategory || '全部';
  }
  
  // Render Cards
  gridContainer.innerHTML = '';
  // Phase 3-B: Bible filter
  let filteredQuotes;
  if (activeCategory === '📖 聖經') {
    filteredQuotes = [...quotesDb].filter(q => q.category === 'cat_faith' && q.original.includes('（') && q.original.includes('）')).reverse();
  } else if (!activeCategory || activeCategory === '全部') {
    filteredQuotes = [...quotesDb].reverse();
  } else {
    filteredQuotes = quotesDb.filter(q => (q.category || '').includes(activeCategory)).reverse();
  }
    
  if (searchInput && searchInput.value.trim() !== '') {
    const term = searchInput.value.trim().toLowerCase();
    filteredQuotes = filteredQuotes.filter(q => {
      const text = (q.original || '').toLowerCase();
      const anchor = (getQuoteAnchor(q) || '').toLowerCase();
      const cat = (q.category || '').toLowerCase();
      return text.includes(term) || anchor.includes(term) || cat.includes(term);
    });
  }
    
  if (filteredQuotes.length === 0) {
    gridContainer.innerHTML = `
      <div class="empty-state">
        <i class="ph-fill ph-wind"></i>
        <p>這個分類還沒有金句喔！<br>先去採集一些，或是感受一下這份留白。</p>
      </div>
    `;
    return;
  }
    
  filteredQuotes.forEach(q => {
    const cat = q.category || '無分類';
    const catDisplayData = CATEGORY_MAP[cat];
    const catDisplayName = catDisplayData ? catDisplayData.name : cat;
    const energy = q.energy_level || 'low';
    let emoji = '💡';
    if (q.reflection_anchor && q.reflection_anchor.action_emoji) {
      emoji = q.reflection_anchor.action_emoji;
    }

    let energySymbol = '🟢';
    let energyText = '陪伴';
    if (energy.includes('medium')) { energySymbol = '🟡'; energyText = '引導'; }
    if (energy.includes('high')) { energySymbol = '🔴'; energyText = '激勵'; }

    // New 6-category + old 4-category fallback
    let catClass = '';
    if (catDisplayData) {
      catClass = catDisplayData.class;
    } else if (cat.includes('安慰') || cat.includes('共感')) catClass = 'cat-empathy';
    else if (cat.includes('轉念') || cat.includes('重塑')) catClass = 'cat-reframe';
    else if (cat.includes('推動') || cat.includes('激勵') || cat.includes('行動')) catClass = 'cat-action';
    else if (cat.includes('疼惜') || cat.includes('接納')) catClass = 'cat-compassion';
    else if (cat.includes('信仰') || cat.includes('靈修') || cat.includes('微光')) catClass = 'cat-faith';
    else if (cat.includes('成長')) catClass = 'cat-growth';
    else if (cat.includes('療癒')) catClass = 'cat-empathy';
    else if (cat.includes('生活') || cat.includes('體悟')) catClass = 'cat-reframe';

    // Display anchor (backward compatible)
    const anchorDisplay = getQuoteAnchor(q);
    const emotionKey = getQuoteEmotion(q);
    const emotionEmoji = EMOTION_VOCAB[emotionKey]?.emoji || '💫';

    const card = document.createElement('div');
    card.className = `lib-card ${catClass}`;
    card.innerHTML = `
      <div class="lib-card-header">
        <div class="lib-card-badges">
          <span class="lib-badge energy-badge" title="${energyText}">${energySymbol}</span>
          <span class="lib-badge cat-badge">${catDisplayName}</span>
          <button class="btn-edit-category" onclick="openEditPanel('${q.id}', event)" title="重新分類">✏️</button>
        </div>
        <div class="lib-emoji">${emoji}</div>
      </div>
      <div class="lib-card-quote">${q.original}</div>
      <div class="lib-card-meta">
        <span style="display:flex; align-items:center; gap:6px;">${emotionEmoji} ${anchorDisplay}</span>
        <div style="display:flex; align-items:center; gap:4px;">
          <button class="icon-btn" onclick="playTTS('${q.original.replace(/'/g, "\\'")}')">🔊</button>
          <button class="btn-delete-quote" title="刪除金句" onclick="deleteQuote('${q.id}')">🗑️</button>
        </div>
      </div>
      <div class="lib-card-note-area" id="note-area-${q.id}">
        ${q.personal_note 
          ? `<div class="lib-note-display" ondblclick="editNote('${q.id}')">${q.personal_note}</div>`
          : `<button class="btn-add-note" onclick="showNoteInput('${q.id}')"><i class="ph-bold ph-note-pencil"></i> 貼便利貼</button>`
        }
      </div>
    `;
    gridContainer.appendChild(card);
  });
}

function deleteQuote(id) {
  if (confirm("確定要讓這句金句隨風而去嗎？")) {
    quotesDb = quotesDb.filter(q => String(q.id) !== String(id));
    localStorage.setItem('hw_quotes', JSON.stringify(quotesDb));
    showToast("金句已移除 🍃");
    renderLibrary(document.getElementById('library-category-select')?.value || '全部');
    updateDashboard();
  }
}

// --- Mailbox ---
function openSlideshow(anchor) {
  if (window.navigator && window.navigator.vibrate) window.navigator.vibrate(15);
  currentSlides = quotesDb.filter(q => q.user_anchor === anchor);
  if(currentSlides.length === 0) return;
  slideIndex = 0;
  
  // Display modal
  document.getElementById('view-slideshow').classList.add('active');
  renderSlide();
}

function closeSlideshow() {
  document.getElementById('view-slideshow').classList.remove('active');
  window.speechSynthesis.cancel();
}

function renderSlide() {
  const q = currentSlides[slideIndex];
  document.getElementById('slide-anchor-label').textContent = `—— 當你感到 ${q.user_anchor} ——`;
  
  const quoteDisplay = document.getElementById('slide-quote-display');
  // re-trigger animation 
  quoteDisplay.style.animation = 'none';
  quoteDisplay.offsetHeight; /* trigger reflow */
  quoteDisplay.style.animation = null; 
  
  quoteDisplay.textContent = q.original;
  
  document.getElementById('slide-counter').textContent = `${slideIndex + 1} / ${currentSlides.length}`;
  
  document.getElementById('slide-tts-btn').onclick = () => playTTS(q.original);
}

function nextSlide() {
  window.speechSynthesis.cancel();
  if (slideIndex < currentSlides.length - 1) {
    slideIndex++;
    renderSlide();
  } else {
    showToast('這已經是最後一句囉');
  }
}

function prevSlide() {
  window.speechSynthesis.cancel();
  if (slideIndex > 0) {
    slideIndex--;
    renderSlide();
  }
}

// 4. Gacha (Companion Card) — Enhanced
let currentGachaQuote = null;
let currentGachaAnchor = null;
let currentGachaIsScripture = false;

// Emoji map for common anchors
const anchorEmojiMap = {
  '焦慮': '😰', '不安': '😰', '緊張': '😬',
  '難過': '😢', '傷心': '😢', '憂鬱': '💧',
  '憤怒': '😤', '生氣': '🔥', '煩躁': '😣',
  '孤單': '🌙', '寂寞': '🌙', '空虛': '🕳️',
  '疲憊': '😮‍💨', '累': '😮‍💨', '疲倦': '🫠',
  '恐懼': '😨', '害怕': '😨',
  '迷茫': '🌫️', '困惑': '❓',
  '壓力': '🏋️', '壓力大': '🏋️',
  '自責': '💔', '愧疚': '💔',
  '感恩': '🙏', '喜樂': '✨', '平安': '🕊️',
  '盼望': '🌅', '勇敢': '💪', '信心': '🌟',
};

function getAnchorEmoji(anchor) {
  if (!anchor) return '💫';
  // Use EMOTION_VOCAB
  for (const [emotion, data] of Object.entries(EMOTION_VOCAB)) {
    if (anchor.includes(emotion)) return data.emoji;
    for (const t of data.triggers) {
      if (anchor === t || anchor.includes(t)) return data.emoji;
    }
  }
  // Fallback to old anchorEmojiMap
  for (const [key, emoji] of Object.entries(anchorEmojiMap)) {
    if (anchor.includes(key)) return emoji;
  }
  return '💫';
}

function getCatClass(category) {
  if (!category) return '';
  // New 6 functional categories
  if (CATEGORY_MAP[category]) return 'gc-' + CATEGORY_MAP[category].class.replace('cat-', '');
  // Keyword fallback
  if (category.includes('安慰') || category.includes('共感') || category.includes('療癒')) return 'gc-empathy';
  if (category.includes('轉念') || category.includes('重塑') || category.includes('生活') || category.includes('體悟')) return 'gc-reframe';
  if (category.includes('推動') || category.includes('激勵') || category.includes('行動')) return 'gc-action';
  if (category.includes('疼惜') || category.includes('接納')) return 'gc-compassion';
  if (category.includes('信仰') || category.includes('靈修') || category.includes('微光')) return 'gc-faith';
  if (category.includes('成長')) return 'gc-growth';
  return '';
}

function openGacha() {
  if (quotesDb.length === 0) {
    showToast('籤筒裡還沒有籤喔，先去採集一句金句吧！');
    switchView('view-add');
    return;
  }
  
  switchView('view-gacha');
  
  // Initialize standard gacha structure if missing
  const resultDiv = document.getElementById('gacha-result');
  if (!document.getElementById('gacha-card')) {
    resultDiv.innerHTML = `
      <div class="gacha-card" id="gacha-card">
        <div class="gacha-card-header">
          <div class="gacha-card-badges">
            <span class="lib-badge cat-badge" id="gacha-cat-badge"></span>
          </div>
          <div class="gacha-card-emoji" id="gacha-emoji"></div>
        </div>
        <div class="gacha-card-quote" id="gacha-quote-display"></div>
        <div class="gacha-card-anchor" id="gacha-anchor-display"></div>
        <div class="gacha-card-actions">
          <button class="gacha-action-btn" onclick="playGachaTTS()">🔊 朗讀</button>
          <button class="gacha-action-btn primary" onclick="redrawGacha()">🎲 再來一張</button>
          <button class="gacha-action-btn share-btn" onclick="saveFortuneToday()">💫 珍藏</button>
        </div>
      </div>`;
  }

  // Reset phases
  document.getElementById('gacha-result').classList.remove('reveal');
  document.getElementById('gacha-glow-container').style.display = 'none';
  document.getElementById('gacha-emotion-picker').style.display = 'block';
  document.getElementById('gacha-prompt-text').textContent = '深呼吸... 告訴我現在的心情？';
  
  // Render emotion grid
  const grid = document.getElementById('gacha-emotion-grid');
  if (grid) {
    grid.innerHTML = '';
    const allEmotions = Object.keys(EMOTION_VOCAB).filter(k => !k.startsWith('cat_'));
    const shuffleArray = arr => arr.slice().sort(() => Math.random() - 0.5);
    const selectedEmotions = shuffleArray(allEmotions).slice(0, 6);
    selectedEmotions.forEach(emo => {
      const btn = document.createElement('button');
      btn.className = 'gacha-emo-btn';
      btn.style = 'padding: 12px; background: var(--bg-secondary); border: 1.5px solid var(--border-color); border-radius: 12px; color: var(--text-dark); cursor: pointer; transition: all 0.2s; font-weight: 600; box-shadow: 0 2px 4px rgba(0,0,0,0.02);';
      btn.textContent = EMOTION_VOCAB[emo] ? EMOTION_VOCAB[emo].name : emo;
      btn.onclick = () => drawGacha(emo);
      grid.appendChild(btn);
    });
  }
  
  renderWeeklyFortuneLog();
}



function drawGacha(coreEmotion) {
  currentGachaAnchor = coreEmotion;
  
  // Hide options
  document.getElementById('gacha-result').classList.remove('reveal');
  
  const promptText = document.getElementById('gacha-prompt-text');
  const dispName = coreEmotion ? (EMOTION_VOCAB[coreEmotion]?.name || coreEmotion) : '';
  promptText.textContent = coreEmotion 
    ? `正在為感到「${dispName}」的你尋找力量...` 
    : '命運正在為你挑選那一句話...';
    
  // Hide Emotion Picker
  const picker = document.getElementById('gacha-emotion-picker');
  if (picker) picker.style.display = 'none';
  
  // Show glow animation
  const glowContainer = document.getElementById('gacha-glow-container');
  const glowOrb = document.getElementById('gacha-glow-orb');
  glowContainer.style.display = 'flex';
  glowOrb.className = 'gacha-glow-orb'; // reset animation
  
  // Filter by core emotion or all if null
  // Phase 3-A: 20% chance to draw from Bible faith quotes
  const faithQuotes = quotesDb.filter(q => q.category === 'cat_faith' && q.original.includes('──'));
  const useBible = faithQuotes.length > 0 && Math.random() < 0.2;

  let filtered;
  if (useBible) {
    filtered = faithQuotes;
  } else {
    filtered = coreEmotion
      ? quotesDb.filter(q => getQuoteEmotion(q) === coreEmotion && !(q.category === 'cat_faith' && q.original.includes('──')))
      : quotesDb.filter(q => !(q.category === 'cat_faith' && q.original.includes('──')));
  }

  if (filtered.length === 0) {
    showToast('居然找不到這類金句，幫你隨機抽一張囉！');
    return drawGacha(null);
  }

  const randomMsg = filtered[Math.floor(Math.random() * filtered.length)];
  currentGachaQuote = randomMsg;
  // Mark as scripture draw for card display
  currentGachaIsScripture = useBible;
  
  // Phase 1: Glow (1.8s) → Phase 2: Burst → Phase 3: Reveal card
  setTimeout(() => {
    glowOrb.classList.add('burst');
    promptText.textContent = coreEmotion 
      ? `🪐 送給正感到「${dispName}」的你` 
      : '🪐 命運為你選了這句話';
    
    setTimeout(() => {
      glowContainer.style.display = 'none';
      revealGachaCard(randomMsg);
    }, 600);
  }, 1800);
}

function revealGachaCard(quote) {
  const cat = quote.category || '未分類';
  const emoji = (quote.reflection_anchor && quote.reflection_anchor.action_emoji) || '💡';
  const anchor = quote.user_anchor || '';
  const anchorEmoji = getAnchorEmoji(anchor);
  
  // Set card category class
  const card = document.getElementById('gacha-card');
  card.className = 'gacha-card ' + getCatClass(cat);
  
  // Populate card content
  document.getElementById('gacha-cat-badge').textContent = CATEGORY_MAP[cat]?.name || cat;
  document.getElementById('gacha-emoji').textContent = emoji;
  document.getElementById('gacha-quote-display').textContent = quote.original;
  
  if (anchor) {
    document.getElementById('gacha-anchor-display').innerHTML = `${anchorEmoji} 當你感到「${anchor}」時`;
    document.getElementById('gacha-anchor-display').style.display = 'flex';
  } else {
    document.getElementById('gacha-anchor-display').style.display = 'none';
  }
  
  // Show result with animation
  const resultDiv = document.getElementById('gacha-result');
  resultDiv.classList.add('reveal');
  
  // Auto-play TTS
  playTTS(quote.original);
}

function redrawGacha() {
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  drawGacha(currentGachaAnchor);
}

let fortuneHistory = JSON.parse(localStorage.getItem('hw_fortune')) || [];

function saveFortuneToday() {
  if (!currentGachaQuote) return;
  const today = new Date().toISOString().split('T')[0];
  const existing = fortuneHistory.find(f => f.date === today);
  
  if (existing) {
    if (existing.quoteId === currentGachaQuote.id) {
      showToast('今日已經珍藏過這一籤囉 🙏');
      return;
    }
    existing.quoteId = currentGachaQuote.id;
    existing.quoteText = currentGachaQuote.original;
  } else {
    fortuneHistory.push({
      id: Date.now(),
      date: today,
      quoteId: currentGachaQuote.id,
      quoteText: currentGachaQuote.original
    });
  }
  
  localStorage.setItem('hw_fortune', JSON.stringify(fortuneHistory));
  showToast('💫 已珍藏為今日籤詩');
  renderWeeklyFortuneLog();
}

function renderWeeklyFortuneLog() {
  const dotsContainer = document.getElementById('weekly-dots');
  if (!dotsContainer) return;
  
  dotsContainer.innerHTML = '';
  // Generate last 7 days
  const today = new Date();
  
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    
    const record = fortuneHistory.find(f => f.date === dateStr);
    const dot = document.createElement('div');
    
    if (record) {
      dot.className = 'weekly-dot filled';
      dot.title = record.quoteText;
    } else {
      dot.className = 'weekly-dot empty';
    }
    
    dotsContainer.appendChild(dot);
  }
}


function playGachaTTS() {
  if (currentGachaQuote) {
    playTTS(currentGachaQuote.original);
  }
}


/* --- Omni Quiz Logic (Removed) --- */
/* --- Ambient Soundscapes (YouTube Player) --- */
const ambientTracks = [
  { name: '🕊️ Palm tv', icon: 'ph-hands-praying', type: 'video', id: 'eUm8MeIp1LE' },
  { 
    name: '✨ 明歌中文', 
    icon: 'ph-sparkle', 
    type: 'random_video', 
    videoList: [
      '1LJ2_YqFwEk', '--7f763-9U8', '-xFrC_najcA', '04mjPeU9VRk', '0IKN_IK8WYg', 
      '0Iy-UdRNfuQ', '0rO7__AmWP8', '1SlzARLud18', '29Sz8Qgi_OI', '2JF3H91JeOw', 
      '3r9YLSKJ1NM', '4JEsRlsIEMY', '4hejRjKVq1w', '5lASNO-Z9ns', '5qG1JdRmofQ', 
      '7Fqz5mMS43Q', '8LlbGFbOx0M', '8zE1Zx9pXP0', '9cVZEjXOUQQ'
    ] 
  },
  { name: '🌟 古典空靈', icon: 'ph-star', type: 'video', id: 'UH6d5mMOiM4' },
  { name: '🌙 北歐空靈', icon: 'ph-moon-stars', type: 'video', id: '62HFhFEEvZI' },
  { name: '☕ Lofi Girl (24/7)', icon: 'ph-coffee', type: 'video', id: 'jfKfPfyJRdk' },
  { name: '🛋️ Chillhop 爵士', icon: 'ph-armchair', type: 'video', id: '5yx6BWlEVcY' },
  { name: '📖 早晨 Bossa', icon: 'ph-book-open', type: 'video', id: 'lTRiuFIWV54' },
  { name: '🌧️ 窗外驟雨', icon: 'ph-cloud-rain', type: 'video', id: 'mPZkdNFkNps' },
  { name: '🔥 溫暖柴火', icon: 'ph-fire', type: 'video', id: 'L_LUpnjgPso' },
  { name: '🌲 森林蟲鳴', icon: 'ph-tree', type: 'video', id: 'xNN7iTA57jM' },
  { name: '🌊 規律海浪', icon: 'ph-waves', type: 'video', id: 'Nep1qytq9JM' },
  { name: '🧠 雙腦波專注', icon: 'ph-brain', type: 'video', id: 'WPni755-Krg' }
];

let ytPlayer;
let ytPlayerReady = false;
let currentAmbientTrack = -1;
let ambientFadeInterval;

window.onYouTubeIframeAPIReady = function() {
  ytPlayer = new YT.Player('yt-player-container', {
    height: '0',
    width: '0',
    videoId: '', // empty default
    playerVars: {
      'autoplay': 0, 'controls': 0, 'disablekb': 1,
      'fs': 0, 'modestbranding': 1, 'playsinline': 1, 'rel': 0
    },
    events: {
      'onReady': () => {
        ytPlayerReady = true;
        initAmbientPlayerUI();
      },
      'onStateChange': (e) => {
        if (e.data === YT.PlayerState.ENDED) {
           if (currentAmbientTrack >= 0 && ambientTracks[currentAmbientTrack].type === 'random_video') {
             const track = ambientTracks[currentAmbientTrack];
             const randomId = track.videoList[Math.floor(Math.random() * track.videoList.length)];
             ytPlayer.loadVideoById({'videoId': randomId});
           } else {
             ytPlayer.playVideo(); // Enforce infinite loop for single videos
           }
        }
      }
    }
  });
};

function initAmbientPlayerUI() {
  const container = document.getElementById('ambient-tracks-container');
  if (!container) return;
  container.innerHTML = '';
  ambientTracks.forEach((track, index) => {
    const btn = document.createElement('button');
    btn.className = 'ambient-track-btn';
    btn.id = `ambient-btn-${index}`;
    btn.innerHTML = `<i class="ph-fill ${track.icon}"></i> ${track.name}`;
    btn.onclick = () => playAmbientTrack(index);
    container.appendChild(btn);
  });
  
  const volSlider = document.getElementById('ambient-volume-slider');
  if (volSlider && ytPlayerReady) {
    ytPlayer.setVolume(parseFloat(volSlider.value) * 100);
  }
}

function toggleAmbientPanel() {
  const widget = document.getElementById('ambient-widget');
  widget.classList.toggle('open');
}

function toggleTracksList() {
  const container = document.getElementById('ambient-tracks-container');
  container.classList.toggle('hidden');
}

function playAmbientTrack(index) {
  if (!ytPlayerReady) { 
    showToast('YouTube 播放器正在載入，請稍候...'); 
    return; 
  }
  
  const toggleBtn = document.getElementById('ambient-toggle-btn');
  const targetVol = parseFloat(document.getElementById('ambient-volume-slider').value) * 100;
  
  document.querySelectorAll('.ambient-track-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`ambient-btn-${index}`).classList.add('active');
  toggleBtn.classList.add('playing');
  
  const track = ambientTracks[index];
  document.getElementById('ambient-dropdown-btn').innerHTML = `<span><i class="ph-fill ${track.icon}"></i> ${track.name}</span><i class="ph-bold ph-caret-down"></i>`;
  document.getElementById('ambient-tracks-container').classList.add('hidden');
  
  if (currentAmbientTrack === index) {
    if (ytPlayer.getPlayerState() !== YT.PlayerState.PLAYING) {
      ytPlayer.playVideo();
      fadeVolumeTo(targetVol);
    }
    return;
  }
  
  currentAmbientTrack = index;
  
  ytPlayer.setVolume(0);
  if (track.type === 'playlist') {
    ytPlayer.loadPlaylist({
      listType: 'playlist',
      list: track.listId,
      index: 0,
      startSeconds: 0
    });
    ytPlayer.setLoop(true); // Loop entire playlist
  } else if (track.type === 'random_video') {
    const randomId = track.videoList[Math.floor(Math.random() * track.videoList.length)];
    ytPlayer.loadVideoById({'videoId': randomId});
  } else {
    ytPlayer.loadVideoById({'videoId': track.id});
  }
  
  fadeVolumeTo(targetVol);
}

function stopAmbient() {
  if (!ytPlayerReady) return;
  document.querySelectorAll('.ambient-track-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('ambient-toggle-btn').classList.remove('playing');
  
  fadeVolumeTo(0, () => {
    ytPlayer.pauseVideo();
  });
}

function fadeVolumeTo(targetVal, onComplete) {
  clearInterval(ambientFadeInterval);
  let vol = ytPlayer.getVolume() || 0;
  const step = (targetVal > vol) ? 5 : -5;
  
  ambientFadeInterval = setInterval(() => {
    vol += step;
    if ((step > 0 && vol >= targetVal) || (step < 0 && vol <= targetVal)) {
      ytPlayer.setVolume(targetVal);
      clearInterval(ambientFadeInterval);
      if (onComplete) onComplete();
    } else {
      ytPlayer.setVolume(vol);
    }
  }, 50);
}

function changeAmbientVolume() {
  if (!ytPlayerReady) return;
  const val = parseFloat(document.getElementById('ambient-volume-slider').value) * 100;
  if (ytPlayer.getPlayerState() === YT.PlayerState.PLAYING) {
    ytPlayer.setVolume(val);
  }
}

// 12. App Utility
function forceAppUpdate() {
  const currentUrl = window.location.href.split('?')[0];
  const cb = new Date().getTime();
  window.location.replace(`${currentUrl}?v=${cb}`);
}

// ================================
// 13. Voice Input (語音傾訴)
// ================================
let currentRecognition = null;

function startVoiceInput(textareaId, btnId) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    showToast('您的瀏覽器不支援語音辨識，請使用 Chrome 或 Safari。');
    return;
  }
  
  const btn = document.getElementById(btnId);
  
  // If already recording, stop it
  if (currentRecognition) {
    currentRecognition.stop();
    currentRecognition = null;
    btn.classList.remove('recording');
    return;
  }
  
  const recognition = new SpeechRecognition();
  recognition.lang = 'zh-TW';
  recognition.continuous = true;
  recognition.interimResults = true;
  currentRecognition = recognition;
  
  btn.classList.add('recording');
  showToast('🎤 正在聆聽，請開始說話...');
  
  let finalTranscript = '';
  const textarea = document.getElementById(textareaId);
  const existingText = textarea.value;
  
  recognition.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += transcript;
      } else {
        interim += transcript;
      }
    }
    textarea.value = existingText + finalTranscript + interim;
  };
  
  recognition.onerror = (event) => {
    console.error('Speech recognition error:', event.error);
    btn.classList.remove('recording');
    currentRecognition = null;
    if (event.error === 'not-allowed') {
      showToast('需要麥克風權限才能使用語音輸入。');
    } else {
      showToast('語音辨識發生錯誤，請重試。');
    }
  };
  
  recognition.onend = () => {
    btn.classList.remove('recording');
    currentRecognition = null;
    if (finalTranscript) {
      textarea.value = existingText + finalTranscript;
      showToast('✅ 語音輸入完成！');
    }
  };
  
  recognition.start();
}

// ================================
// 14. Soul Garden (心靈花園)
// ================================
function getSoulPoints() {
  return parseInt(localStorage.getItem('hw_soul_points') || '0');
}

function addSoulPoints(amount) {
  const current = getSoulPoints();
  const newTotal = current + amount;
  localStorage.setItem('hw_soul_points', newTotal.toString());
  updateSoulGarden();
  spawnSparkles(amount);
}

function updateSoulGarden() {
  const points = getSoulPoints();
  const el = document.getElementById('soul-points-count');
  if (el) el.textContent = points;
  
  // Tree growth levels: 0-4, 5-14, 15-29, 30-49, 50-99, 100+
  const crown = document.getElementById('tree-crown');
  if (!crown) return;
  
  crown.className = 'tree-crown';
  if (points < 5) crown.classList.add('level-0');
  else if (points < 15) crown.classList.add('level-1');
  else if (points < 30) crown.classList.add('level-2');
  else if (points < 50) crown.classList.add('level-3');
  else if (points < 100) crown.classList.add('level-4');
  else crown.classList.add('level-5');
}

function spawnSparkles(count) {
  const container = document.getElementById('soul-sparkles');
  if (!container) return;
  
  for (let i = 0; i < Math.min(count, 8); i++) {
    setTimeout(() => {
      const dot = document.createElement('div');
      dot.className = 'sparkle-dot';
      dot.style.left = (20 + Math.random() * 40) + 'px';
      dot.style.top = (10 + Math.random() * 40) + 'px';
      container.appendChild(dot);
      setTimeout(() => dot.remove(), 2200);
    }, i * 150);
  }
}

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

