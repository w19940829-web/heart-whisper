/* ====================================== */
/* js/library.js - Library & Slideshow    */
/* ====================================== */

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
        <div class="empty-state-icon">📚</div>
        <p class="empty-state-text">這個分類還沒有金句喔！<br>先去採集一些，或是感受一下這份留白。</p>
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
          <button class="icon-btn" onclick="playTTS(decodeURIComponent('${encodeURIComponent(q.original)}'))">🔊</button>
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

// --- Slideshow ---
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
