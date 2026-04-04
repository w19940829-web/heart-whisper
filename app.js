// Core App State & Logic
let quotesDb = JSON.parse(localStorage.getItem('hw_quotes')) || [];
let mailboxDb = JSON.parse(localStorage.getItem('hw_mailboxDb')) || [];
let currentProcessingQuote = null;
let currentReviewSession = [];
let reviewIndex = 0;

/* --- Standardized Emotion Vocabulary (Two-Tier) --- */
const EMOTION_VOCAB = {
  '焦慮': { emoji: '😰', triggers: ['趕死線時', '社交場合前', '對未來不安', '完美主義發作'] },
  '憤怒': { emoji: '😤', triggers: ['被否定時', '對自己生氣', '人際摩擦', '感到不公平'] },
  '悲傷': { emoji: '😢', triggers: ['失去重要的事物', '被拒絕後', '感到失望', '想起過去'] },
  '恐懼': { emoji: '😨', triggers: ['害怕失敗', '害怕被評價', '面對未知', '承擔責任時'] },
  '疲憊': { emoji: '😮‍💨', triggers: ['身心俱疲', '燃盡感', '找不到動力', '睡不好的日子'] },
  '孤獨': { emoji: '🌙', triggers: ['覺得沒人懂', '被忽略時', '想念某人', '深夜獨處'] },
  '自卑': { emoji: '😞', triggers: ['比較心態', '覺得不夠好', '冒名頂替感', '被批評後'] },
  '迷茫': { emoji: '🌫️', triggers: ['不知道方向', '選擇困難', '意義感消失', '信心動搖'] },
};

const CATEGORY_MAP = {
  '🫂 安慰共感': { color: '#a3b1a6', class: 'cat-empathy' },
  '🔄 轉念重塑': { color: '#8ea4bf', class: 'cat-reframe' },
  '💪 推動行動': { color: '#d4a574', class: 'cat-action' },
  '🤗 自我疼惜': { color: '#c4a3b1', class: 'cat-compassion' },
  '🙏 信仰連結': { color: '#b8b3c9', class: 'cat-faith' },
  '🌱 成長提醒': { color: '#9db89d', class: 'cat-growth' },
};

// Helper: find emotion for a trigger
function findEmotionForTrigger(trigger) {
  for (const [emotion, data] of Object.entries(EMOTION_VOCAB)) {
    if (data.triggers.includes(trigger)) return emotion;
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
  for (const [emotion, data] of Object.entries(EMOTION_VOCAB)) {
    if (anchor.includes(emotion)) return emotion;
    for (const t of data.triggers) {
      if (anchor.includes(t)) return emotion;
    }
  }
  return '迷茫'; // default fallback
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
  }
}

function updateDashboard() {
  document.getElementById('stat-total').textContent = quotesDb.length;
  
  // Calculate due for today
  const now = new Date().getTime();
  const dueQuotes = quotesDb.filter(q => q.nextReviewDate <= now);
  document.getElementById('due-count').textContent = dueQuotes.length;
  
  // Update Soul Garden
  updateSoulGarden();
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
  document.getElementById('gemini-key').value = localStorage.getItem('gemini_api_key') || '';
}

function closeSettings() {
  document.getElementById('settings-modal').classList.remove('active');
}

function saveSettings() {
  const key = document.getElementById('gemini-key').value.trim();
  if (key) {
    aiService.setKey(key);
    showToast('🔑 API Key 儲存成功');
  } else {
    showToast('已清除 API Key');
    localStorage.removeItem('gemini_api_key');
  }
  closeSettings();
}

/* --- Data Backup & Restore --- */
function exportData() {
  if (quotesDb.length === 0) {
    showToast('目前沒有金句可以匯出喔！');
    return;
  }
  
  const data = { quotes: quotesDb, streak: localStorage.getItem('hw_streak') || 0, mailbox: mailboxDb };
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

/* --- ADD NEW QUOTE (PHASE 1) --- */
async function processNewQuote() {
  const btn = document.getElementById('btn-analyze');
  const inputEl = document.getElementById('quote-input');
  const text = inputEl.value.trim();
  
  if (!text) {
    showToast('請先輸入你要記憶的金句');
    return;
  }
  
  if (!aiService.hasKey()) {
    showToast('請先點擊右上角設定 API 金鑰');
    openSettings();
    return;
  }

  btn.disabled = true;
  btn.querySelector('.btn-text').innerHTML = '<i class="ph-fill ph-wind"></i> 正在溫柔拆解中...';
  btn.querySelector('.loading-spinner').style.display = 'inline-block';
  
  try {
    const aiResult = await aiService.processNewQuote(text);
    
    currentProcessingQuote = {
      id: Date.now().toString(),
      original: text,
      addedAt: Date.now(),
      nextReviewDate: Date.now(), // 立刻即可複習（方便初次體驗與強化記憶）
      history: [],
      ...aiResult // merges focus_mode, cloze_versions, reflection_anchor
    };
    
    // Render Step 2
    renderAIAnchorStage(currentProcessingQuote);
    
  } catch (err) {
    console.error(err);
    showToast('拆解失敗：' + err.message);
  } finally {
    btn.disabled = false;
    btn.querySelector('.btn-text').innerHTML = '<i class="ph-fill ph-sparkle"></i> 幫我拆解金句';
    btn.querySelector('.loading-spinner').style.display = 'none';
  }
}

function renderAIAnchorStage(quoteObj) {
  document.getElementById('reflection-section').style.display = 'block';
  
  // Render Chunks
  document.getElementById('focus-instruction').textContent = quoteObj.focus_mode.micro_task;
  const chunkContainer = document.getElementById('chunked-quote-display');
  chunkContainer.innerHTML = '';
  quoteObj.focus_mode.chunked_quote.forEach(chunk => {
    const span = document.createElement('span');
    span.className = 'chunk-line';
    span.textContent = chunk;
    chunkContainer.appendChild(span);
  });
  
  // Render category badge
  const catDisplay = document.getElementById('ai-category-display');
  if (catDisplay) {
    catDisplay.textContent = quoteObj.category || '';
    catDisplay.style.display = quoteObj.category ? 'inline-block' : 'none';
  }
  
  // Render trigger scene
  const sceneDisplay = document.getElementById('ai-trigger-scene');
  const triggerScene = quoteObj.emotional_anchors?.trigger_scene || '';
  if (sceneDisplay) {
    sceneDisplay.textContent = triggerScene ? `💡 ${triggerScene}` : '';
    sceneDisplay.style.display = triggerScene ? 'block' : 'none';
  }
  
  // Render AI-recommended anchors
  const optionsContainer = document.getElementById('scenario-options');
  optionsContainer.innerHTML = '';
  
  const anchors = quoteObj.emotional_anchors || {};
  const aiAnchors = [];
  
  if (anchors.primary) {
    aiAnchors.push({ 
      trigger: anchors.primary, 
      emotion: anchors.primary_emotion || findEmotionForTrigger(anchors.primary) || '迷茫'
    });
  }
  if (anchors.secondary && anchors.secondary !== anchors.primary) {
    aiAnchors.push({ 
      trigger: anchors.secondary,
      emotion: anchors.secondary_emotion || findEmotionForTrigger(anchors.secondary) || '迷茫'
    });
  }
  
  // Fallback: old suggested_tags format
  if (aiAnchors.length === 0) {
    const tags = quoteObj.reflection_anchor?.suggested_tags || quoteObj.reflection_anchor?.suggested_scenarios || [];
    tags.forEach(t => aiAnchors.push({ trigger: t, emotion: '迷茫' }));
  }
  
  // Render AI recommended chips
  aiAnchors.forEach((item, i) => {
    const emotionData = EMOTION_VOCAB[item.emotion] || { emoji: '💫' };
    const div = document.createElement('div');
    div.className = 'scenario-chip' + (i === 0 ? ' selected' : '');
    div.innerHTML = `${emotionData.emoji} ${item.trigger}`;
    div.dataset.trigger = item.trigger;
    div.dataset.emotion = item.emotion;
    div.onclick = () => selectAnchorChip(div);
    optionsContainer.appendChild(div);
  });
  
  // Pre-fill with primary anchor
  if (aiAnchors.length > 0) {
    document.getElementById('custom-reflection').value = aiAnchors[0].trigger;
  }
  
  // Render expandable full emotion vocabulary
  renderEmotionVocabGrid();
}

function selectAnchorChip(chip) {
  document.querySelectorAll('#scenario-options .scenario-chip, #emotion-vocab-grid .scenario-chip').forEach(el => el.classList.remove('selected'));
  chip.classList.add('selected');
  document.getElementById('custom-reflection').value = chip.dataset.trigger;
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
    header.innerHTML = `${data.emoji} ${emotion}`;
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

function toggleEmotionVocab() {
  const grid = document.getElementById('emotion-vocab-grid');
  const btn = document.getElementById('toggle-vocab-btn');
  if (grid.style.display === 'none' || !grid.style.display) {
    grid.style.display = 'block';
    btn.textContent = '▲ 收起完整詞庫';
  } else {
    grid.style.display = 'none';
    btn.textContent = '▼ 我想自己選（展開完整詞庫）';
  }
}

function saveQuote() {
  const customRef = document.getElementById('custom-reflection').value.trim();
  
  // Find selected chip for structured data
  const selectedChip = document.querySelector('.scenario-chip.selected');
  const selectedTrigger = selectedChip?.dataset?.trigger || customRef;
  const selectedEmotion = selectedChip?.dataset?.emotion || findEmotionForTrigger(selectedTrigger) || '迷茫';
  
  // Set emotional anchors (new structure)
  if (!currentProcessingQuote.emotional_anchors) {
    currentProcessingQuote.emotional_anchors = {};
  }
  
  // If user manually changed, override AI's recommendation
  if (selectedTrigger && selectedTrigger !== currentProcessingQuote.emotional_anchors.primary) {
    currentProcessingQuote.emotional_anchors.primary = selectedTrigger;
    currentProcessingQuote.emotional_anchors.primary_emotion = selectedEmotion;
  }
  
  // Backward compatibility: set user_anchor
  currentProcessingQuote.user_anchor = selectedTrigger || currentProcessingQuote.emotional_anchors?.primary || '未分類';
  
  quotesDb.push(currentProcessingQuote);
  localStorage.setItem('hw_quotes', JSON.stringify(quotesDb));
  
  showToast('🌸 金句已收錄為你的專屬工具！');
  addSoulPoints(3);
  
  // Cleanup
  document.getElementById('quote-input').value = '';
  document.getElementById('reflection-section').style.display = 'none';
  currentProcessingQuote = null;
  
  switchView('view-home');
}

/* --- DAILY REVIEW (PHASE 2 & 3) --- */
function startDailyReview() {
  const now = new Date().getTime();
  currentReviewSession = quotesDb.filter(q => q.nextReviewDate <= now).sort(() => 0.5 - Math.random());
  
  if(currentReviewSession.length === 0) {
    showToast('現在沒有需要複習的金句喔！先休息一下吧。');
    return;
  }
  
  reviewIndex = 0;
  switchView('view-review');
  renderReviewCard();
}

function renderReviewCard() {
  if (reviewIndex >= currentReviewSession.length) {
    // Review complete
    document.getElementById('review-container').style.display = 'none';
    document.getElementById('review-complete').style.display = 'block';
    
    // Update streak (dummy logic)
    const currentStreak = parseInt(localStorage.getItem('hw_streak') || '0', 10);
    localStorage.setItem('hw_streak', currentStreak + 1);
    
    return;
  }
  
  document.getElementById('review-container').style.display = 'block';
  document.getElementById('review-complete').style.display = 'none';
  document.getElementById('review-current').textContent = reviewIndex + 1;
  document.getElementById('review-total').textContent = currentReviewSession.length;
  
  const q = currentReviewSession[reviewIndex];
  
  // Emotion Wake up
  document.getElementById('review-wakeup').textContent = `記得嗎？這是你打算「${q.user_anchor}」時，對自己說的話。`;
  
  // Render Cloze carefully (replace [] with text inputs)
  const clozeText = q.cloze_versions.standard || q.cloze_versions.low_pressure;
  
  // Replace [text] with interactive inputs with dynamic resizer wrapper
  const html = clozeText.replace(/\[(.*?)\]/g, (match, p1) => {
    const minChars = Math.max(3, p1.length); 
    return `<span class="cloze-resizer" data-value="" style="--min-chars: ${minChars}">
              <input type="text" class="cloze-input" data-answer="${p1}" placeholder="" oninput="this.parentNode.dataset.value = this.value; checkClozeInput(this);">
            </span>`;
  });
  
  document.getElementById('cloze-display').innerHTML = html;
  
  // Reset grade buttons & reveal
  document.getElementById('original-reveal').style.display = 'none';
  document.getElementById('original-reveal').textContent = '';
  document.getElementById('original-reveal').classList.remove('fade-in-up');
  document.getElementById('encouragement-msg').style.display = 'none';
  
  document.getElementById('grade-section').style.opacity = '0.5';
  document.getElementById('grade-section').style.pointerEvents = 'none';
  
  const revealBtn = document.getElementById('reveal-btn');
  if (revealBtn) revealBtn.innerHTML = '<i class="ph-fill ph-eye"></i> 看原句';
  
  // TTS Bind
  document.getElementById('review-tts-btn').onclick = () => playTTS(q.original);
}

function toggleReveal() {
  const oRev = document.getElementById('original-reveal');
  const gradeSec = document.getElementById('grade-section');
  const revealBtn = document.getElementById('reveal-btn');
  const inputs = document.querySelectorAll('.cloze-input');
  
  const isRevealed = oRev.style.display === 'block';

  if (isRevealed) {
    // Hide original sentence
    oRev.style.display = 'none';
    oRev.classList.remove('fade-in-up');
    if (revealBtn) revealBtn.innerHTML = '<i class="ph-fill ph-eye"></i> 看原句';
    
    // Check if the user had already gotten it completely correct naturally
    const allCorrect = Array.from(inputs).every(el => el.classList.contains('correct'));
    
    if (!allCorrect) {
      // Revert inputs that were auto-revealed
      inputs.forEach(el => {
        if (el.classList.contains('revealed')) {
          el.value = '';
          el.parentNode.dataset.value = '';
          el.classList.remove('revealed');
          el.readOnly = false;
        }
      });
      // Hide grade section again
      gradeSec.style.opacity = '0.5';
      gradeSec.style.pointerEvents = 'none';
    }
  } else {
    // Show original sentence
    if (revealBtn) revealBtn.innerHTML = '<i class="ph-fill ph-eye-closed"></i> 收起原句';
    
    // Auto-fill all inputs revealing the answer
    inputs.forEach(el => {
      if (!el.classList.contains('correct')) {
        el.value = el.getAttribute('data-answer');
        el.parentNode.dataset.value = el.value; // Sync resizer
        el.classList.add('revealed');
        el.readOnly = true;
      }
    });
    
    oRev.style.display = 'block';
    oRev.classList.add('fade-in-up');
    
    gradeSec.style.opacity = '1';
    gradeSec.style.pointerEvents = 'auto';
    
    const q = currentReviewSession[reviewIndex];
    oRev.textContent = q.original;
  }
}

function checkClozeInput(el) {
  // Strip punctuation for a more forgiving and low-friction comparison
  const ans = el.getAttribute('data-answer').replace(/[^\w\u4e00-\u9fa5]/gi, '').toLowerCase();
  const val = el.value.replace(/[^\w\u4e00-\u9fa5]/gi, '').toLowerCase();
  
  if (val && val === ans) {
    if (!el.classList.contains('correct')) {
      el.value = el.getAttribute('data-answer'); // Auto-format with correct casing/punctuation
      el.parentNode.dataset.value = el.value; // Sync resizer
      el.classList.add('correct');
      el.readOnly = true; 
      
      // Haptic feedback for mobile devices
      if (window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(40);
      }
      
      checkAllCorrect();
    }
  } else {
    el.classList.remove('correct');
  }
}

function checkAllCorrect() {
  const inputs = document.querySelectorAll('.cloze-input');
  const allCorrect = Array.from(inputs).every(el => el.classList.contains('correct'));
  
  if (allCorrect) {
    // Short delay before showing final UI to let them enjoy the last 'pop' animation
    setTimeout(() => {
      toggleReveal();
      showToast('太強了！完全正確 ✨');
    }, 500);
  }
}

function submitGrade(grade) {
  const q = currentReviewSession[reviewIndex];
  const now = new Date().getTime();
  
  // Calculate next interval based on grade
  let nextIntervalHours = 24; // Default 1 day
  if (grade === 'easy') nextIntervalHours = 72; // 3 days
  if (grade === 'medium') nextIntervalHours = 24; // 1 day
  if (grade === 'forgot') nextIntervalHours = 4; // Soon
  
  // Update DB quote
  const dbIdx = quotesDb.findIndex(dbq => dbq.id === q.id);
  if(dbIdx > -1) {
    quotesDb[dbIdx].nextReviewDate = now + (nextIntervalHours * 60 * 60 * 1000);
    quotesDb[dbIdx].history.push({ date: now, grade: grade });
    localStorage.setItem('hw_quotes', JSON.stringify(quotesDb));
    addSoulPoints(grade === 'easy' ? 2 : 1);
  }
  
  // Show Encouragement
  const encMsg = document.getElementById('encouragement-msg');
  encMsg.textContent = aiService.generateEncouragement(grade);
  encMsg.style.display = 'block';
  encMsg.style.marginTop = '16px';
  encMsg.style.padding = '12px';
  encMsg.style.borderRadius = '12px';
  encMsg.style.background = '#fdfaf6';
  encMsg.style.color = '#76736e';
  
  document.getElementById('grade-section').style.opacity = '0.5';
  document.getElementById('grade-section').style.pointerEvents = 'none';
  
  // Auto next slide after delay
  setTimeout(() => {
    reviewIndex++;
    renderReviewCard();
  }, 3500);
}

/* --- TTS Service (Web Speech API) --- */
function playTTS(text) {
  if (!('speechSynthesis' in window)) {
    showToast('抱歉，你的瀏覽器不支援語音功能。');
    return;
  }
  
  // Stop existing speech
  window.speechSynthesis.cancel();
  
  // 濾除會被朗讀出雜音的干擾標點與括號，保護聆聽心流
  const cleanText = text.replace(/[<>＜＞\[\]【】()（）]/g, '');
  
  const msg = new SpeechSynthesisUtterance();
  msg.text = cleanText;
  msg.lang = 'zh-TW';
  msg.rate = 0.8; // Gentle, slower rate for ADHD/anxiety calming
  msg.pitch = 1.0;
  
  const voices = window.speechSynthesis.getVoices();
  const zhVoice = voices.find(v => v.lang.includes('zh-TW') || v.lang.includes('zh-CN'));
  if (zhVoice) msg.voice = zhVoice;
  
  window.speechSynthesis.speak(msg);
}

/* --- CHUNKING MODE (DEEP PRACTICE ROOM) --- */
let currentPracticeSession = [];
let practiceIndex = 0;
let activeChunkQuote = null;
let currentChunkIndex = 0;

function startPracticeRoom() {
  if (quotesDb.length === 0) {
    showToast('你的金句庫還是空的喔！先去採集一句吧 ✨');
    return;
  }

  const validQuotes = quotesDb.filter(q => q.focus_mode && q.focus_mode.chunked_quote && q.focus_mode.chunked_quote.length > 0);
  
  if (validQuotes.length === 0) {
    showToast('目前沒有可供分段溫習的金句喔！');
    return;
  }
  
  // Randomly pick up to 5 quotes for deep practice
  currentPracticeSession = validQuotes.sort(() => 0.5 - Math.random()).slice(0, 5);
  practiceIndex = 0;
  
  switchView('view-chunking');
  loadPracticeQuote();
}

function loadPracticeQuote() {
  activeChunkQuote = currentPracticeSession[practiceIndex];
  currentChunkIndex = 0;
  renderChunkStage();
}

function exitChunkingMode() {
  activeChunkQuote = null;
  switchView('view-home');
}

function renderChunkStage() {
  const chunks = activeChunkQuote.focus_mode.chunked_quote;
  
  // End of chunks check
  if (currentChunkIndex >= chunks.length) {
    practiceIndex++;
    if (practiceIndex < currentPracticeSession.length) {
      showToast('超棒！緊接著溫習下一句 ✨');
      loadPracticeQuote();
    } else {
      showToast('🎉 今天的溫習已全部完成！心靈充電完畢');
      exitChunkingMode();
    }
    return;
  }
  
  document.getElementById('chunk-current').textContent = currentChunkIndex + 1;
  document.getElementById('chunk-total').textContent = chunks.length;
  
  const chunkText = chunks[currentChunkIndex];
  const displayEl = document.getElementById('chunk-text-display');
  
  displayEl.textContent = chunkText;
  displayEl.classList.remove('text-blur');
  
  document.getElementById('chunk-instruction-text').textContent = '先慢慢讀過一次這段話';
  
  document.getElementById('chunk-state-show').style.display = 'flex';
  document.getElementById('chunk-state-hide').style.display = 'none';
  document.getElementById('chunk-state-reveal').style.display = 'none';
  
  document.getElementById('chunk-tts-btn').onclick = () => playTTS(chunkText);
}

function maskCurrentChunk() {
  const displayEl = document.getElementById('chunk-text-display');
  displayEl.classList.add('text-blur');
  
  document.getElementById('chunk-instruction-text').textContent = '現在，請在心裡試著把剛剛那句話默想出來';
  
  document.getElementById('chunk-state-show').style.display = 'none';
  document.getElementById('chunk-state-hide').style.display = 'flex';
}

function revealCurrentChunk() {
  const displayEl = document.getElementById('chunk-text-display');
  displayEl.classList.remove('text-blur');
  
  document.getElementById('chunk-instruction-text').textContent = '跟你想的一樣嗎？';
  
  document.getElementById('chunk-state-hide').style.display = 'none';
  document.getElementById('chunk-state-reveal').style.display = 'flex';
  
  // Check if this was the last chunk
  const chunks = activeChunkQuote.focus_mode.chunked_quote;
  const nextBtn = document.querySelector('#chunk-state-reveal .primary-btn');
  if (currentChunkIndex >= chunks.length - 1) {
    nextBtn.innerHTML = '太棒了！點此完成拼圖 <i class="ph-fill ph-puzzle-piece"></i>';
  } else {
    nextBtn.innerHTML = '接續：下一段 <i class="ph-bold ph-arrow-right"></i>';
  }
}

function nextChunk() {
  window.speechSynthesis.cancel();
  currentChunkIndex++;
  renderChunkStage();
}

// Init
document.addEventListener('DOMContentLoaded', () => {
  updateDashboard();
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
  let filteredQuotes = (!activeCategory || activeCategory === '全部') 
    ? [...quotesDb].reverse() 
    : quotesDb.filter(q => (q.category || '').includes(activeCategory)).reverse();
    
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
    if (CATEGORY_MAP[cat]) {
      catClass = CATEGORY_MAP[cat].class;
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
          <span class="lib-badge cat-badge">${cat}</span>
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
function openMailbox() {
  switchView('view-mailbox');
  resetMailbox();
}

function resetMailbox() {
  document.getElementById('mailbox-textarea').value = '';
  document.querySelectorAll('.mailbox-phase').forEach(el => el.classList.remove('active'));
  document.getElementById('mailbox-phase-input').classList.add('active');
}

async function submitMailbox() {
  const text = document.getElementById('mailbox-textarea').value.trim();
  if (!text) {
    showToast("請寫點什麼再寄出喔！");
    return;
  }

  // Next Phase Loading
  document.querySelectorAll('.mailbox-phase').forEach(el => el.classList.remove('active'));
  document.getElementById('mailbox-phase-loading').classList.add('active');

  try {
    const result = await aiService.solveWorry(text, quotesDb);
    
    // Quote section (only if library has entries)
    let quoteHtml = '';
    if (quotesDb.length > 0) {
      const assignedQuote = quotesDb.find(q => String(q.id) === String(result.selected_quote_id)) || quotesDb[Math.floor(Math.random() * quotesDb.length)];
      quoteHtml = '<div style="padding:24px 20px;background:linear-gradient(135deg,var(--bg-secondary) 0%,transparent 100%);border-radius:18px;position:relative;z-index:2;"><p style="font-family:Noto Serif TC,serif;font-size:1.3rem;font-weight:600;color:var(--text-primary);line-height:1.7;word-break:break-all;">' + assignedQuote.original + '</p></div>';
    }
    
    // Bible verses section
    let bibleHtml = '';
    if (result.bible_verses && result.bible_verses.length > 0) {
      const versesInner = result.bible_verses.map(function(v) {
        return '<div class="bible-verse-item"><p class="bible-verse-text">' + v.text + '</p><span class="bible-verse-ref">── ' + v.ref + '</span></div>';
      }).join('');
      bibleHtml = '<div class="bible-section"><div class="bible-section-title">📖 來自聖經的回應</div>' + versesInner + '</div>';
    }
    
    // Render Phase 3
    const cardEl = document.getElementById('mailbox-result-card');
    cardEl.innerHTML = '<div style="background:var(--bg-primary);padding:24px;border-radius:24px;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,0.05);position:relative;overflow:hidden;"><div style="font-size:8rem;opacity:0.04;position:absolute;top:-20px;left:10px;font-family:Times New Roman,serif;line-height:1;">“</div><p style="color:var(--text-secondary);font-size:0.98rem;line-height:1.6;margin-bottom:24px;padding:0 12px;position:relative;z-index:2;">' + result.healing_message + '</p>' + quoteHtml + '</div>' + bibleHtml;
    
    document.querySelectorAll('.mailbox-phase').forEach(el => el.classList.remove('active'));
    document.getElementById('mailbox-phase-result').classList.add('active');
    addSoulPoints(2);
      
      // Save to mailboxDb
      const record = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        userWorry: text,
        aiMessage: result.healing_message,
        bibleVerses: result.bible_verses || [],
        quoteId: result.selected_quote_id || null,
        quoteHtml: quoteHtml
      };
      mailboxDb.unshift(record); // Add to beginning
      localStorage.setItem('hw_mailboxDb', JSON.stringify(mailboxDb));
      
    
  } catch (err) {
    console.error(err);
    showToast("翻閱遇到了點小阻礙，請重試一次。");
    resetMailbox();
  }
}


// 3. Slideshow
let currentSlides = [];
let slideIndex = 0;

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
    switchView('view-gacha');
    // Show beautiful empty state
    document.getElementById('gacha-prompt-text').textContent = '';
    document.getElementById('gacha-glow-container').style.display = 'none';
    
    const resultDiv = document.getElementById('gacha-result');
    resultDiv.innerHTML = `
      <div class="gacha-empty">
        <div class="gacha-empty-icon"><i class="ph-fill ph-leaf"></i></div>
        <div class="gacha-empty-text">籤筒裡還沒有籤喔<br>先去採集你的第一句金句吧</div>
        <button class="primary-btn" onclick="switchView('view-add')">
          <i class="ph-fill ph-sparkle"></i> 去採集第一句
        </button>
      </div>`;
    resultDiv.classList.add('reveal');
    return;
  }
  
  switchView('view-gacha');
  
  // Initialize standard gacha structure if overridden by empty state previously
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
          <button class="gacha-action-btn primary" onclick="redrawGacha()">🎲 再抽</button>
          <button class="gacha-action-btn share-btn" onclick="shareGachaCard()">📤 分享</button>
        </div>
      </div>`;
  }
  
  drawGacha(null);
}



function drawGacha(coreEmotion) {
  currentGachaAnchor = coreEmotion;
  
  // Hide options
  document.getElementById('gacha-result').classList.remove('reveal');
  
  const promptText = document.getElementById('gacha-prompt-text');
  promptText.textContent = coreEmotion 
    ? `正在為感到「${coreEmotion}」的你尋找力量...` 
    : '命運正在為你挑選那一句話...';
  
  // Show glow animation
  const glowContainer = document.getElementById('gacha-glow-container');
  const glowOrb = document.getElementById('gacha-glow-orb');
  glowContainer.style.display = 'flex';
  glowOrb.className = 'gacha-glow-orb'; // reset animation
  
  // Filter by core emotion or all if null
  const filtered = coreEmotion 
    ? quotesDb.filter(q => getQuoteEmotion(q) === coreEmotion) 
    : quotesDb;
  
  if (filtered.length === 0) {
    showToast('居然找不到這類金句，幫你隨機抽一張囉！');
    return drawGacha(null);
  }

  const randomMsg = filtered[Math.floor(Math.random() * filtered.length)];
  currentGachaQuote = randomMsg;
  
  // Phase 1: Glow (1.8s) → Phase 2: Burst → Phase 3: Reveal card
  setTimeout(() => {
    glowOrb.classList.add('burst');
    promptText.textContent = coreEmotion 
      ? `🪐 送給正感到「${coreEmotion}」的你` 
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
  document.getElementById('gacha-cat-badge').textContent = cat;
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
  // Re-draw with the same anchor
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  drawGacha(currentGachaAnchor);
}

function playGachaTTS() {
  if (currentGachaQuote) {
    playTTS(currentGachaQuote.original);
  }
}

// Share (Screenshot) feature
async function shareGachaCard() {
  if (!currentGachaQuote) return;
  
  showToast('正在為您生成精美海報... 📸');
  
  // 1. Create a hidden aesthetic poster container
  const poster = document.createElement('div');
  Object.assign(poster.style, {
    position: 'absolute',
    top: '-9999px',
    left: '-9999px',
    width: '1080px',
    height: '1080px',
    background: 'linear-gradient(135deg, #fdfbf7 0%, #ebecde 100%)',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '120px',
    boxSizing: 'border-box',
    fontFamily: '"Noto Serif TC", "Inter", serif',
    color: '#4a453f',
    textAlign: 'center',
    borderRadius: '40px',
    overflow: 'hidden'
  });
  
  poster.innerHTML = `
    <!-- Giant Quote Mark -->
    <div style="
      position: absolute;
      top: 100px;
      left: 120px;
      font-size: 500px;
      line-height: 1;
      color: rgba(142, 164, 155, 0.08);
      font-family: 'Times New Roman', serif;
      pointer-events: none;
    ">“</div>
    
    <!-- The Quote Text -->
    <div style="
      font-size: 56px;
      line-height: 1.6;
      letter-spacing: 2px;
      font-weight: 500;
      z-index: 2;
      word-break: break-all;
      word-wrap: break-word;
      text-shadow: 0 4px 20px rgba(0,0,0,0.03);
    ">${currentGachaQuote.original}</div>
    
    <!-- Footer Logo & Branding -->
    <div style="
      position: absolute;
      bottom: 80px;
      display: flex;
      flex-direction: column;
      align-items: center;
      opacity: 0.6;
    ">
      <span style="font-size: 40px; margin-bottom: 16px;">🪶</span>
      <span style="font-size: 24px; letter-spacing: 4px; font-weight: 400; font-family: 'Inter', sans-serif;">心語漫遊</span>
    </div>
  `;
  
  document.body.appendChild(poster);
  
  try {
    // 2. Take screenshot of the poster
    const canvas = await html2canvas(poster, {
      backgroundColor: null,
      scale: 2,
      useCORS: true,
      logging: false,
    });
    
    // Clean up the DOM
    document.body.removeChild(poster);
    
    // 3. Create share overlay to preview the result
    const overlay = document.createElement('div');
    overlay.className = 'gacha-share-overlay';
    overlay.id = 'gacha-share-overlay';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    
    const preview = document.createElement('div');
    preview.className = 'gacha-share-preview';
    preview.innerHTML = `
      <h3 style="font-size: 1.2rem; color: var(--text-dark); margin-bottom: 16px; text-align: center;">📸 專屬你的陪伴卡海報</h3>
      <div class="gacha-share-canvas-wrap" style="text-align: center; margin-bottom: 24px;"></div>
      <div class="gacha-share-actions" style="display: flex; gap: 12px; justify-content: center;">
        <button style="flex: 1; padding: 12px; border-radius: 12px; font-weight: 600; border: none; cursor: pointer; background: var(--bg-secondary); color: var(--text-primary);" onclick="document.getElementById('gacha-share-overlay').remove()">取消</button>
        <button style="flex: 1; padding: 12px; border-radius: 12px; font-weight: 600; border: none; cursor: pointer; background: var(--accent-calm); color: #fff;" id="gacha-download-btn">💾 儲存</button>
      </div>
    `;
    
    const canvasWrap = preview.querySelector('.gacha-share-canvas-wrap');
    const img = new Image();
    img.src = canvas.toDataURL('image/png');
    // Ensure the preview image scales down nicely in the UI
    img.style.maxWidth = '100%';
    img.style.border = '1px solid rgba(0,0,0,0.05)';
    img.style.borderRadius = '16px';
    canvasWrap.appendChild(img);
    
    overlay.appendChild(preview);
    document.body.appendChild(overlay);
    
    // Download handler
    document.getElementById('gacha-download-btn').onclick = () => {
      const link = document.createElement('a');
      link.download = `陪伴卡_${new Date().toLocaleDateString('zh-TW')}.png`;
      link.href = img.src;
      link.click();
      showToast('海報儲存成功 ✨');
      overlay.remove();
    };
    
    // Try Web Share API for mobile
    if (navigator.share && navigator.canShare) {
      canvas.toBlob(async (blob) => {
        const shareBtn = document.createElement('button');
        shareBtn.style.cssText = 'flex: 1; padding: 12px; border-radius: 12px; font-weight: 600; border: none; cursor: pointer; background:linear-gradient(135deg, var(--accent-warm), #c49c76); color:#fff;';
        shareBtn.textContent = '📤 分享';
        shareBtn.onclick = async () => {
          try {
            const file = new File([blob], '陪伴卡.png', { type: 'image/png' });
            await navigator.share({ files: [file], title: '心語漫遊 · 陪伴卡海報' });
            overlay.remove();
          } catch (err) {
            // User cancelled share
          }
        };
        preview.querySelector('.gacha-share-actions').appendChild(shareBtn);
      }, 'image/png');
    }
    
  } catch (err) {
    if(poster.parentNode) document.body.removeChild(poster);
    console.error('Share failed:', err);
    showToast('海報生成失敗，請再試一次');
  }
}

/* --- Omni Quiz Logic (Lightweight Multiple Choice) --- */
let quizQuestions = [];
let currentQuizIndex = 0;
let isQuizAnimating = false;

function startQuizMode() {
  if (quotesDb.length < 3) {
    showToast('需要至少收集 3 個金句，才能啟動測驗館喔！');
    return;
  }
  
  switchView('view-quiz');
  document.getElementById('quiz-container').style.display = 'flex';
  document.getElementById('quiz-complete').style.display = 'none';
  
  generateQuizSession();
  currentQuizIndex = 0;
  renderQuizQuestion();
}

function exitQuizMode() {
  switchView('view-home');
}

function shuffleArray(arr) {
  return arr.slice().sort(() => Math.random() - 0.5);
}

function getRandomDistractors(sourceArray, correctValue, count = 3) {
  const uniqueItems = [...new Set(sourceArray)].filter(i => i && i !== correctValue && String(i).trim() !== '');
  const shuffled = shuffleArray(uniqueItems);
  
  // Fallbacks if not enough unique data
  const defaults = ['平靜', '愛自己', '無常', '接受', '勇敢開始', '專注當下', '深呼吸', '往前走'];
  let distractors = shuffled.slice(0, count);
  let trys = 0;
  
  while (distractors.length < count && trys < 20) {
    const fallback = defaults[Math.floor(Math.random() * defaults.length)];
    if (!distractors.includes(fallback) && fallback !== correctValue) {
      distractors.push(fallback);
    }
    trys++;
  }
  return distractors;
}

function generateQuizSession() {
  const sessionSize = Math.min(5, quotesDb.length);
  const selectedQuotes = shuffleArray(quotesDb).slice(0, sessionSize);
  
  // Create pools for distractors
  const allAnchors = quotesDb.map(q => q.user_anchor);
  const allWords = quotesDb.flatMap(q => q.focus_mode?.cloze_points?.map(c => c.word) || []);
  const allSeconds = quotesDb.map(q => {
    const parts = q.original.split(/[，。；！]/);
    return parts.length > 1 ? parts.slice(1).join('，') : q.original.substring(Math.floor(q.original.length/2));
  });

  quizQuestions = selectedQuotes.map(q => {
    let type = ['A', 'B', 'C'][Math.floor(Math.random() * 3)];
    let prompt, correct, distractors, hint;
    
    // Fallbacks if data missing
    if (type === 'A' && (!q.focus_mode || !q.focus_mode.cloze_points || q.focus_mode.cloze_points.length === 0)) type = 'B';
    if (type === 'C' && q.original.length < 8) type = 'B';
    
    if (type === 'A') {
      hint = '【文字填空】找回失落的記憶碎片';
      correct = q.focus_mode.cloze_points[0].word;
      prompt = q.original.replace(correct, '<span class="quiz-cloze-blank" id="quiz-blank"></span>');
      distractors = getRandomDistractors(allWords, correct, 3);
    } else if (type === 'B') {
      hint = '【情緒配對】這句話最適合接住哪種情緒？';
      correct = q.user_anchor || '無法定義的心情';
      prompt = q.original;
      distractors = getRandomDistractors(allAnchors, correct, 3);
    } else { // Type C
      hint = '【接龍拼圖】這句話的下半部是？';
      const parts = q.original.split(/[，。；！]/);
      if (parts.length > 1 && parts[1].trim() !== '') {
        prompt = parts[0] + '，...';
        correct = parts.slice(1).join('，').trim() || parts[1].trim();
      } else {
        const mid = Math.floor(q.original.length/2);
        prompt = q.original.substring(0, mid) + '...';
        correct = q.original.substring(mid).trim();
      }
      distractors = getRandomDistractors(allSeconds, correct, 3);
    }
    
    // Fallback if somehow distractors are empty, add dummy
    if(distractors.length===0) distractors = ['選項 X', '選項 Y', '選項 Z'];
    
    const options = shuffleArray([correct, ...distractors]);
    return { type, hint, prompt, correct, options, orgQuote: q };
  });
}

function renderQuizQuestion() {
  isQuizAnimating = false;
  document.getElementById('quiz-current').textContent = currentQuizIndex + 1;
  document.getElementById('quiz-total').textContent = quizQuestions.length;
  
  const qObj = quizQuestions[currentQuizIndex];
  document.getElementById('quiz-hint-display').textContent = qObj.hint;
  document.getElementById('quiz-prompt-display').innerHTML = qObj.prompt;
  
  const optionsGrid = document.getElementById('quiz-options-grid');
  optionsGrid.innerHTML = '';
  
  qObj.options.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'quiz-btn';
    btn.textContent = opt;
    btn.onclick = () => submitQuizAnswer(btn, opt, qObj);
    optionsGrid.appendChild(btn);
  });
}

function submitQuizAnswer(btn, chosenOpt, qObj) {
  if (isQuizAnimating) return;
  isQuizAnimating = true;
  
  if (window.navigator && window.navigator.vibrate) window.navigator.vibrate(10);
  
  const isCorrect = (chosenOpt === qObj.correct);
  
  if (isCorrect) {
    btn.classList.add('correct');
    if (qObj.type === 'A') {
      const blank = document.getElementById('quiz-blank');
      if (blank) {
        blank.textContent = chosenOpt;
        blank.classList.add('filled');
      }
    }
    
    // Soft reward: delay next review smoothly
    qObj.orgQuote.nextReviewDate = new Date().getTime() + (12 * 60 * 60 * 1000);
    localStorage.setItem('hw_quotes', JSON.stringify(quotesDb));
    
    setTimeout(() => {
      moveToNextQuiz();
    }, 1200);
  } else {
    btn.classList.add('wrong');
    setTimeout(() => {
      isQuizAnimating = false;
    }, 500); // Wait for shake anim
  }
}

function moveToNextQuiz() {
  currentQuizIndex++;
  if (currentQuizIndex >= quizQuestions.length) {
    // Show complete
    document.getElementById('quiz-container').style.display = 'none';
    document.getElementById('quiz-complete').style.display = 'block';
    
    // Simulate streak increment if this is their first big action today
    if (localStorage.getItem('hw_streak') === null) {
      localStorage.setItem('hw_streak', '1');
    }
    updateDashboard();
  } else {
    renderQuizQuestion();
  }
}

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
    return '<option value="' + c + '" ' + selected + '>' + c + '</option>';
  }).join('');
  
  // Build emotion chips
  const emotionChips = Object.entries(EMOTION_VOCAB).map(([emotion, data]) => {
    const sel = (emotion === editSelectedEmotion) ? 'selected' : '';
    return '<button class="edit-emotion-chip ' + sel + '" onclick="selectEditEmotion(\'' + emotion + '\', \'' + quoteId + '\')">' + data.emoji + ' ' + emotion + '</button>';
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

function buildTriggerChips(emotion, currentTrigger, quoteId) {
  const triggers = EMOTION_VOCAB[emotion]?.triggers || [];
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
function switchMailboxTab(tabId) {
  document.getElementById('mtab-mailbox-new').classList.remove('active');
  document.getElementById('mtab-mailbox-history').classList.remove('active');
  document.getElementById('mailbox-view-new').style.display = 'none';
  document.getElementById('mailbox-view-history').style.display = 'none';
  
  document.getElementById('mtab-mailbox-' + tabId).classList.add('active');
  document.getElementById('mailbox-view-' + tabId).style.display = 'block';
  
  if (tabId === 'history') {
    renderMailboxHistory();
  }
}

function renderMailboxHistory() {
  const container = document.getElementById('mailbox-history-container');
  if (mailboxDb.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding: 32px 0; color:var(--text-secondary);"><i class="ph-fill ph-envelope-simple" style="font-size:3rem; opacity:0.3; margin-bottom:12px;"></i><p>這裡目前還是空的。<br>有煩惱時，歡迎放進信箱裡。</p></div>';
    return;
  }
  
  let html = '';
  mailboxDb.forEach(record => {
    const dateStr = new Date(record.timestamp).toLocaleDateString('zh-TW', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    let bibleHtml = '';
    if (record.bibleVerses && record.bibleVerses.length > 0) {
      const versesInner = record.bibleVerses.map(v => '<div class="bible-verse-item"><p class="bible-verse-text">' + v.text + '</p><span class="bible-verse-ref">── ' + v.ref + '</span></div>').join('');
      bibleHtml = '<div class="bible-section"><div class="bible-section-title">📖 來自聖經的回應</div>' + versesInner + '</div>';
    }
    
    html += `<div class="mailbox-history-item" onclick="this.classList.toggle('expanded')">
        <div class="mhistory-header">
          <div class="mhistory-date">${dateStr}</div>
          <div class="mhistory-preview">${record.userWorry.substring(0, 30)}${record.userWorry.length > 30 ? '...' : ''}</div>
          <i class="ph-bold ph-caret-down mhistory-expand-icon"></i>
        </div>
        <div class="mhistory-content">
          <div style="background:var(--bg-primary);padding:24px;border-radius:24px;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,0.05);position:relative;margin-bottom:16px;">
            <p style="color:var(--text-secondary);font-size:0.98rem;line-height:1.6;margin-bottom:24px;">${record.aiMessage}</p>
            ${record.quoteHtml || ''}
          </div>
          ${bibleHtml}
        </div>
      </div>`;
  });
  
  container.innerHTML = html;
}

// --- Image Export ---
async function exportAsImage(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  
  const originalBackground = el.style.background;
  el.style.background = 'var(--bg-secondary)'; // Ensure valid background
  
  try {
    const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#fdfaf6' });
    const image = canvas.toDataURL("image/png");
    
    const a = document.createElement('a');
    a.href = image;
    a.download = 'heart-whisper-' + Date.now() + '.png';
    a.click();
    showToast('📷 圖卡已儲存成功！');
  } catch (err) {
    console.error(err);
    showToast('儲存圖卡時發生錯誤');
  } finally {
    el.style.background = originalBackground;
  }
}
