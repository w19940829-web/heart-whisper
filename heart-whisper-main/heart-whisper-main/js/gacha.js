/* ====================================== */
/* js/gacha.js - Gacha (每日一籤) Logic   */
/* ====================================== */

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
      btn.textContent = EMOTION_VOCAB[emo] ? EMOTION_VOCAB[emo].name : emo;
      btn.onclick = () => drawGacha(emo);
      grid.appendChild(btn);
    });
  }
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

  // Phase 4: Auto-play matching ambient sound based on emotion
  _autoPlayEmotionAmbient(currentGachaAnchor);
}

/* --- Phase 4: Emotion → Ambient Sound Auto-link --- */
const EMOTION_AMBIENT_MAP = {
  'emo_anxiety':    7, // 🌧️ 窗外驟雨 (rain calms anxiety)
  'emo_anger':      8, // 🔥 溫暖柴火 (crackling fire soothes anger)
  'emo_sadness':    3, // 🌙 北歐空靈 (ethereal for sadness)
  'emo_fear':      10, // 🌊 規律海浪 (ocean waves ease fear)
  'emo_fatigue':    4, // ☕ Lofi Girl (gentle background for tiredness)
  'emo_loneliness': 2, // 🌟 古典空靈 (classical for loneliness)
  'emo_inferiority':0, // 🕊️ Palm tv (worship music for self-worth)
  'emo_confusion':  9, // 🌲 森林蟲鳴 (nature for clarity)
};

function _autoPlayEmotionAmbient(emotionKey) {
  if (!emotionKey) return;
  const trackIndex = EMOTION_AMBIENT_MAP[emotionKey];
  if (trackIndex === undefined) return;
  
  // Only auto-play if no track is currently playing
  if (typeof ytPlayerReady !== 'undefined' && ytPlayerReady && typeof ytPlayer !== 'undefined') {
    try {
      if (ytPlayer.getPlayerState() !== YT.PlayerState.PLAYING) {
        playAmbientTrack(trackIndex);
      }
    } catch(e) {
      // YouTube player might not be ready yet, ignore
    }
  }
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
}


function playGachaTTS() {
  if (currentGachaQuote) {
    playTTS(currentGachaQuote.original);
  }
}

/* ============================================ */
/* === TIMELINE JOURNAL (靈魂日記時間軸)     === */
/* ============================================ */
function openTimeline() {
  switchView('view-timeline');
  renderTimeline();
}

function renderTimeline() {
  const container = document.getElementById('timeline-container');
  if (!container) return;

  // Gather all timeline events
  const events = [];

  // 1. Fortune history (gacha draws)
  const fortunes = JSON.parse(localStorage.getItem('hw_fortune') || '[]');
  fortunes.forEach(f => {
    events.push({
      date: f.date,
      type: 'fortune',
      icon: '🎴',
      title: '每日一籤',
      content: f.quoteText || '(已刪除的金句)',
      timestamp: new Date(f.date).getTime(),
      deleteId: idx
    });
  });

  // 2. Personal notes from quotesDb
  if (typeof quotesDb !== 'undefined') {
    quotesDb.forEach(q => {
      if (q.personal_note) {
        const dateStr = q.addedAt ? new Date(q.addedAt).toISOString().split('T')[0] : '未知日期';
        events.push({
          date: dateStr,
          type: 'note',
          icon: '📌',
          title: '便利貼',
          content: `「${q.original.substring(0, 30)}...」\n→ ${q.personal_note}`,
          timestamp: q.addedAt || 0,
          deleteId: q.id
        });
      }
    });
  }

  // 3. Bible reading log
  const readLog = JSON.parse(localStorage.getItem('hw_bible_read_log') || '{}');
  Object.entries(readLog).forEach(([key, val]) => {
    const dateStr = typeof val === 'string' ? val : (val?.date || '');
    if (dateStr) {
      events.push({
        date: dateStr,
        type: 'bible',
        icon: '📖',
        title: '讀經打卡',
        content: key.replace('_', ' 第') + '章',
        timestamp: new Date(dateStr).getTime(),
        deleteId: key
      });
    }
  });

  // 4. Bible streak check-ins
  const streak = JSON.parse(localStorage.getItem('hw_bible_streak') || '{}');
  if (streak.lastDate) {
    events.push({
      date: streak.lastDate,
      type: 'streak',
      icon: '🔥',
      title: '靈修連續打卡',
      content: `已連續 ${streak.count || 0} 天`,
      timestamp: new Date(streak.lastDate).getTime()
    });
  }

  // Sort by date descending
  events.sort((a, b) => b.timestamp - a.timestamp);

  if (events.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📔</div>
        <p class="empty-state-text">你的靈魂日記目前還是空白的。<br>開始讀經、抽籤、或寫下便利貼，<br>你的故事就會在這裡慢慢展開。</p>
      </div>`;
    return;
  }

  // Group by date
  const groupedByDate = {};
  events.forEach(ev => {
    if (!groupedByDate[ev.date]) groupedByDate[ev.date] = [];
    groupedByDate[ev.date].push(ev);
  });

  let html = '';
  Object.entries(groupedByDate)
    .sort(([a], [b]) => b.localeCompare(a))
    .forEach(([date, items]) => {
      const d = new Date(date);
      const weekdays = ['日','一','二','三','四','五','六'];
      const dateLabel = `${d.getMonth()+1}月${d.getDate()}日 (${weekdays[d.getDay()]})`;
      
      html += `<div class="timeline-date-group">`;
      html += `<div class="timeline-date-label">${dateLabel}</div>`;
      
      items.forEach(item => {
        html += `
          <div class="timeline-entry timeline-${item.type}">
            <div class="timeline-dot">${item.icon}</div>
            <div class="timeline-body">
              <div class="timeline-entry-title" style="display:flex; justify-content:space-between; align-items:center;">
                <span>${item.title}</span>
                ${item.type !== 'streak' ? `<button onclick="deleteTimelineEntry('${item.type}', '${item.deleteId}')" style="background:none;border:none;color:var(--text-secondary);opacity:0.6;font-size:1.05rem;cursor:pointer;padding:0;" title="刪除"><i class="ph-bold ph-trash"></i></button>` : ''}
              </div>
              <div class="timeline-entry-content">${item.content}</div>
            </div>
          </div>`;
      });

      html += `</div>`;
    });

  container.innerHTML = html;
}

function deleteTimelineEntry(type, id) {
  if (!confirm('確定要刪除這筆日記紀錄嗎？這無法復原。')) return;

  if (type === 'fortune') {
    const fortunes = JSON.parse(localStorage.getItem('hw_fortune') || '[]');
    fortunes.splice(parseInt(id), 1);
    localStorage.setItem('hw_fortune', JSON.stringify(fortunes));
  } else if (type === 'note') {
    const idx = quotesDb.findIndex(q => String(q.id) === String(id));
    if (idx !== -1) {
      quotesDb[idx].personal_note = '';
      localStorage.setItem('hw_quotes', JSON.stringify(quotesDb));
    }
  } else if (type === 'bible') {
    const readLog = JSON.parse(localStorage.getItem('hw_bible_read_log') || '{}');
    delete readLog[id];
    localStorage.setItem('hw_bible_read_log', JSON.stringify(readLog));
  }

  // Refresh views
  renderTimeline();
  if (typeof updateDashboard === 'function') updateDashboard();
  if (typeof _bibleRenderBookPicker === 'function' && document.getElementById('bible-book-picker')?.style.display !== 'none') {
    _bibleRenderBookPicker();
  }
  if (typeof showToast === 'function') showToast('🗑️ 已刪除該筆紀錄');
}
