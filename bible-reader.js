/* ============================================================ */
/* === BIBLE READER MODULE — Full Edition                     === */
/* === 新標點和合本・神版・完全離線                               === */
/* 功能：逐節筆記、自動書籤、底部面板、字體調整、滑動翻頁、       */
/*       進度追蹤、全文搜尋、筆記總覽                             === */
/* ============================================================ */

let bibleData = null;
let bibleCurrentBook = -1;
let bibleCurrentChapter = -1;
const BIBLE_OT_COUNT = 39;
let _bibleBottomSheetOpen = false;
let _bibleBottomActiveTab = 'chapter'; // 'chapter' | 'recent'
let _bibleNotesOverviewActive = false;

/* ─── Storage Helpers ─────────────────────────────────────── */
function getBibleNotes() { return JSON.parse(localStorage.getItem('hw_bible_notes') || '{}'); }
function saveBibleNotes(n) { localStorage.setItem('hw_bible_notes', JSON.stringify(n)); }
function getBibleBookmark() { return JSON.parse(localStorage.getItem('hw_bible_bookmark') || 'null'); }
function saveBibleBookmark(b) { localStorage.setItem('hw_bible_bookmark', JSON.stringify(b)); }
function getBibleReadLog() { return JSON.parse(localStorage.getItem('hw_bible_read_log') || '{}'); }
function saveBibleReadLog(l) { localStorage.setItem('hw_bible_read_log', JSON.stringify(l)); }
function getBibleFontSize() { return parseInt(localStorage.getItem('hw_bible_font_size') || '17'); }
function saveBibleFontSize(s) { localStorage.setItem('hw_bible_font_size', String(s)); }
function getBibleStreak() { return JSON.parse(localStorage.getItem('hw_bible_streak') || '{"lastDate":null,"count":0}'); }
function saveBibleStreak(s) { localStorage.setItem('hw_bible_streak', JSON.stringify(s)); }

function _bibleKey(b, c, v) { return `${bibleData[b].name}_${c}_${v}`; }

/* ─── Main Entry ──────────────────────────────────────────── */
async function openBible() {
  switchView('view-bible');
  _closeBibleBottomSheet();
  if (!bibleData) {
    document.getElementById('bible-loading').style.display = 'block';
    document.getElementById('bible-book-picker').style.display = 'none';
    try {
      const res = await fetch('./bible.json');
      if (!res.ok) throw new Error('fetch failed');
      bibleData = await res.json();
      document.getElementById('bible-loading').style.display = 'none';
      _bibleRenderBookPicker();
    } catch (e) {
      document.getElementById('bible-loading').style.display = 'none';
      document.getElementById('bible-book-picker').style.display = 'block';
      showToast('聖經資料載入失敗，請確認網路連線後重試');
      switchView('view-home');
    }
  } else {
    bibleCurrentBook = -1;
    bibleCurrentChapter = -1;
    _bibleNotesOverviewActive = false;
    _bibleShowPickerState('books');
  }
}

/* ─── Navigation ──────────────────────────────────────────── */
function bibileNavBack() {
  if (_bibleBottomSheetOpen) { _closeBibleBottomSheet(); return; }
  if (document.getElementById('bible-reader').style.display !== 'none') {
    bibleCurrentChapter = -1;
    _bibleShowPickerState('chapters');
  } else if (document.getElementById('bible-chapter-picker').style.display !== 'none') {
    bibleCurrentBook = -1;
    _bibleShowPickerState('books');
  } else {
    switchView('view-home');
  }
}

function _bibleShowPickerState(state) {
  document.getElementById('bible-book-picker').style.display = state === 'books' ? 'block' : 'none';
  document.getElementById('bible-chapter-picker').style.display = state === 'chapters' ? 'block' : 'none';
  document.getElementById('bible-reader').style.display = state === 'reader' ? 'block' : 'none';
  document.getElementById('bible-loading').style.display = 'none';

  const bottomBar = document.getElementById('bible-bottom-bar');
  if (bottomBar) bottomBar.style.display = state === 'reader' ? 'flex' : 'none';

  const backLabel = document.getElementById('bible-back-label');
  const navInfo = document.getElementById('bible-nav-info');

  if (state === 'books') {
    backLabel.textContent = '返回';
    navInfo.innerHTML = '';
  } else if (state === 'chapters' && bibleCurrentBook >= 0) {
    backLabel.textContent = '書卷';
    navInfo.textContent = bibleData[bibleCurrentBook].name;
  } else if (state === 'reader' && bibleCurrentBook >= 0 && bibleCurrentChapter >= 0) {
    backLabel.textContent = '章節';
    navInfo.innerHTML = `${bibleData[bibleCurrentBook].name} ${bibleCurrentChapter + 1} &nbsp;
      <button class="bible-font-btn" onclick="bibleFontChange(-1)">A－</button>
      <button class="bible-font-btn" onclick="bibleFontChange(1)">A＋</button>`;
  }
}

/* ─── Book Picker ─────────────────────────────────────────── */
function _bibleRenderBookPicker() {
  if (!bibleData) return;
  _bibleNotesOverviewActive = false;

  // Bookmark banner
  const bm = getBibleBookmark();
  const banner = document.getElementById('bible-bookmark-banner');
  if (bm && banner) {
    banner.style.display = 'flex';
    banner.innerHTML = `<span>📌 上次讀到：<b>${bm.bookName} 第${bm.chapterIdx + 1}章</b></span>
      <button class="bible-continue-btn" onclick="_bibleSelectBook(${bm.bookIdx}); _bibleSelectChapter(${bm.chapterIdx});">繼續閱讀 →</button>`;
  } else if (banner) {
    banner.style.display = 'none';
  }

  // Book tabs header
  document.getElementById('bible-picker-tab-books').classList.add('active');
  document.getElementById('bible-picker-tab-notes').classList.remove('active');
  document.getElementById('bible-notes-overview').style.display = 'none';
  document.getElementById('bible-book-lists').style.display = 'block';

  const readLog = getBibleReadLog();
  const notes = getBibleNotes();
  const otGrid = document.getElementById('bible-ot-grid');
  const ntGrid = document.getElementById('bible-nt-grid');
  otGrid.innerHTML = '';
  ntGrid.innerHTML = '';

  bibleData.forEach((book, idx) => {
    const totalChapters = book.chapters.length;
    const readCount = Object.keys(readLog).filter(k => k.startsWith(idx + '_')).length;
    const noteCount = Object.keys(notes).filter(k => k.startsWith(book.name + '_')).length;

    const btn = document.createElement('button');
    btn.className = 'bible-book-btn';
    if (readCount === totalChapters) btn.classList.add('fully-read');
    let badge = '';
    if (readCount > 0 && readCount < totalChapters) badge = `<span class="bible-book-progress">${readCount}/${totalChapters}</span>`;
    if (readCount === totalChapters) badge = `<span class="bible-book-progress done">✓</span>`;
    let noteDot = noteCount > 0 ? `<span class="bible-book-note-dot"></span>` : '';
    btn.innerHTML = `${noteDot}${book.name}${badge}`;
    btn.onclick = () => _bibleSelectBook(idx);
    (idx < BIBLE_OT_COUNT ? otGrid : ntGrid).appendChild(btn);
  });

  _bibleShowPickerState('books');
}

/* ─── Chapter Picker ──────────────────────────────────────── */
function _bibleSelectBook(bookIdx) {
  bibleCurrentBook = bookIdx;
  bibleCurrentChapter = -1;
  const book = bibleData[bookIdx];
  document.getElementById('bible-chapter-title').textContent = book.name;

  const readLog = getBibleReadLog();
  const grid = document.getElementById('bible-chapter-grid');
  grid.innerHTML = '';

  book.chapters.forEach((_, idx) => {
    const btn = document.createElement('button');
    btn.className = 'bible-chapter-btn';
    if (readLog[`${bookIdx}_${idx}`]) btn.classList.add('read');
    btn.textContent = idx + 1;
    btn.onclick = () => _bibleSelectChapter(idx);
    grid.appendChild(btn);
  });

  _bibleShowPickerState('chapters');
}

/* ─── Reader ──────────────────────────────────────────────── */
function _bibleSelectChapter(chapterIdx) {
  bibleCurrentChapter = chapterIdx;
  const book = bibleData[bibleCurrentBook];
  const verses = book.chapters[chapterIdx];
  const notes = getBibleNotes();

  document.getElementById('bible-reader-heading').textContent =
    `${book.name} 第${chapterIdx + 1}章`;

  const list = document.getElementById('bible-verse-list');
  list.innerHTML = '';

  const fontSize = getBibleFontSize();
  list.style.fontSize = fontSize + 'px';

  verses.forEach((verse, idx) => {
    const key = _bibleKey(bibleCurrentBook, chapterIdx, idx);
    const hasNote = !!notes[key];

    const row = document.createElement('div');
    row.className = 'bible-verse-row';
    row.id = `verse-row-${idx}`;

    row.innerHTML = `
      <span class="bible-verse-num">${idx + 1}${hasNote ? '<span class="bible-note-dot">●</span>' : ''}</span>
      <div class="bible-verse-body">
        <span class="bible-verse-text">${verse}</span>
        ${hasNote ? `<div class="bible-note-card" id="note-card-${idx}">${notes[key].text}</div>` : ''}
        <div class="bible-note-input-area" id="note-input-${idx}" style="display:none;">
          <textarea class="bible-note-textarea" id="note-textarea-${idx}" maxlength="500" placeholder="在這裡寫下你的靈修筆記...">${hasNote ? notes[key].text : ''}</textarea>
          <div class="bible-note-actions">
            <button class="bible-note-save-btn" onclick="bibleSaveNote(${idx})">儲存</button>
            <button class="bible-note-cancel-btn" onclick="bibleCloseNoteInput(${idx})">取消</button>
            ${hasNote ? `<button class="bible-note-delete-btn" onclick="bibleDeleteNote(${idx})">🗑️ 刪除</button>` : ''}
          </div>
        </div>
      </div>
      <div class="bible-verse-btns">
        <button class="bible-note-trigger" title="寫筆記" onclick="bibleToggleNoteInput(${idx})">📝</button>
        <button class="bible-bookmark-btn" title="收藏至金句庫" onclick="bibleBookmarkVerse(${bibleCurrentBook}, ${chapterIdx}, ${idx})">🔖</button>
      </div>
    `;
    list.appendChild(row);
  });

  // Chapter nav buttons
  const prevBtn = document.getElementById('bible-prev-btn');
  const nextBtn = document.getElementById('bible-next-btn');
  if (prevBtn) prevBtn.style.display = chapterIdx > 0 ? 'flex' : 'none';
  if (nextBtn) nextBtn.style.display = chapterIdx < book.chapters.length - 1 ? 'flex' : 'none';

  _bibleShowPickerState('reader');
  document.getElementById('view-bible').scrollTop = 0;

  // Save bookmark
  saveBibleBookmark({ bookIdx: bibleCurrentBook, chapterIdx, bookName: book.name, savedAt: Date.now() });

  // Mark as read
  const readLog = getBibleReadLog();
  readLog[`${bibleCurrentBook}_${chapterIdx}`] = true;
  saveBibleReadLog(readLog);

  // Update streak
  _updateBibleStreak();

  // Init swipe
  _initBibleSwipe();

  // Update bottom bar
  _updateBottomBar();
}

/* ─── Chapter Navigation (Prev/Next) ─────────────────────── */
function bibleGoPrevChapter() {
  if (bibleCurrentChapter > 0) _bibleSelectChapter(bibleCurrentChapter - 1);
}

function bibleGoNextChapter() {
  if (bibleCurrentBook >= 0 && bibleCurrentChapter < bibleData[bibleCurrentBook].chapters.length - 1) {
    _bibleSelectChapter(bibleCurrentChapter + 1);
  }
}

/* ─── Swipe Gesture ───────────────────────────────────────── */
function _initBibleSwipe() {
  const el = document.getElementById('bible-reader');
  if (!el || el._swipeInited) return;
  el._swipeInited = true;
  let startX = 0;
  el.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, { passive: true });
  el.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - startX;
    if (Math.abs(dx) > 60) {
      if (dx < 0) bibleGoNextChapter();
      else bibleGoPrevChapter();
    }
  }, { passive: true });
}

/* ─── Font Size ───────────────────────────────────────────── */
function bibleFontChange(delta) {
  const current = getBibleFontSize();
  const next = Math.min(24, Math.max(14, current + delta));
  saveBibleFontSize(next);
  const list = document.getElementById('bible-verse-list');
  if (list) list.style.fontSize = next + 'px';
  showToast(`字體大小：${next}px`);
}

/* ─── Notes ───────────────────────────────────────────────── */
function bibleToggleNoteInput(verseIdx) {
  const area = document.getElementById(`note-input-${verseIdx}`);
  if (!area) return;
  const isOpen = area.style.display !== 'none';
  area.style.display = isOpen ? 'none' : 'block';
  if (!isOpen) document.getElementById(`note-textarea-${verseIdx}`)?.focus();
}

function bibleCloseNoteInput(verseIdx) {
  const area = document.getElementById(`note-input-${verseIdx}`);
  if (area) area.style.display = 'none';
}

function bibleSaveNote(verseIdx) {
  const textarea = document.getElementById(`note-textarea-${verseIdx}`);
  if (!textarea) return;
  const text = textarea.value.trim();
  if (!text) { showToast('請先輸入筆記內容'); return; }

  const notes = getBibleNotes();
  const key = _bibleKey(bibleCurrentBook, bibleCurrentChapter, verseIdx);
  notes[key] = { text, bookIdx: bibleCurrentBook, chapterIdx: bibleCurrentChapter, verseIdx, updatedAt: Date.now() };
  saveBibleNotes(notes);

  // Update UI
  const numEl = document.querySelector(`#verse-row-${verseIdx} .bible-verse-num`);
  if (numEl && !numEl.querySelector('.bible-note-dot')) {
    numEl.innerHTML += '<span class="bible-note-dot">●</span>';
  }
  let card = document.getElementById(`note-card-${verseIdx}`);
  if (!card) {
    card = document.createElement('div');
    card.className = 'bible-note-card';
    card.id = `note-card-${verseIdx}`;
    const body = document.querySelector(`#verse-row-${verseIdx} .bible-verse-body`);
    body?.insertBefore(card, document.getElementById(`note-input-${verseIdx}`));
  }
  card.textContent = text;
  bibleCloseNoteInput(verseIdx);
  _updateBottomBar();
  showToast('📝 筆記已儲存');
}

function bibleDeleteNote(verseIdx) {
  const notes = getBibleNotes();
  const key = _bibleKey(bibleCurrentBook, bibleCurrentChapter, verseIdx);
  delete notes[key];
  saveBibleNotes(notes);

  document.getElementById(`note-card-${verseIdx}`)?.remove();
  const dot = document.querySelector(`#verse-row-${verseIdx} .bible-note-dot`);
  if (dot) dot.remove();
  bibleCloseNoteInput(verseIdx);
  _updateBottomBar();
  showToast('筆記已刪除');
}

/* ─── Bookmark to Quote Library ──────────────────────────── */
function bibleBookmarkVerse(bookIdx, chapterIdx, verseIdx) {
  const book = bibleData[bookIdx];
  const verse = book.chapters[chapterIdx][verseIdx];
  const ref = `${book.name} ${chapterIdx + 1}:${verseIdx + 1}`;
  const fullText = `${verse}（${ref}）`;

  if (quotesDb.some(q => q.original === fullText)) {
    showToast('此節經文已在金句庫中 📚');
    return;
  }

  quotesDb.unshift({
    id: `q_${Date.now()}`,
    original: fullText,
    category: 'cat_faith',
    emotional_anchors: { primary: '信仰連結', primary_emotion: '' },
    created_at: Date.now(),
    personal_note: ''
  });
  localStorage.setItem('hw_quotes', JSON.stringify(quotesDb));
  updateDashboard();
  showToast(`🔖 已收藏「${ref}」到金句庫！`);
}

/* ─── Bottom Sheet ────────────────────────────────────────── */
function _updateBottomBar() {
  const notes = getBibleNotes();
  const bar = document.getElementById('bible-bottom-bar');
  if (!bar) return;
  const chapterNoteCount = bibleCurrentBook >= 0 && bibleCurrentChapter >= 0
    ? Object.keys(notes).filter(k => k.startsWith(`${bibleData[bibleCurrentBook].name}_${bibleCurrentChapter}_`)).length
    : 0;
  const totalCount = Object.keys(notes).length;
  bar.innerHTML = `<i class="ph-fill ph-note-pencil"></i>&nbsp;
    ${chapterNoteCount > 0 ? `本章 ${chapterNoteCount} 則筆記` : '點擊瀏覽筆記'}
    ${totalCount > 0 ? ` · 共 ${totalCount} 則` : ''}
    &nbsp;<span style="opacity:0.5">▲</span>`;
}

function toggleBibleBottomSheet() {
  const sheet = document.getElementById('bible-bottom-sheet');
  const overlay = document.getElementById('bible-sheet-overlay');
  if (!sheet) return;
  _bibleBottomSheetOpen = !_bibleBottomSheetOpen;
  sheet.classList.toggle('open', _bibleBottomSheetOpen);
  if (overlay) overlay.style.display = _bibleBottomSheetOpen ? 'block' : 'none';
  if (_bibleBottomSheetOpen) renderBottomSheetNotes(_bibleBottomActiveTab);
}

function _closeBibleBottomSheet() {
  const sheet = document.getElementById('bible-bottom-sheet');
  const overlay = document.getElementById('bible-sheet-overlay');
  _bibleBottomSheetOpen = false;
  if (sheet) sheet.classList.remove('open');
  if (overlay) overlay.style.display = 'none';
}

function switchBottomTab(tab) {
  _bibleBottomActiveTab = tab;
  document.querySelectorAll('.bottom-sheet-tab').forEach(b => b.classList.remove('active'));
  document.getElementById(`btab-${tab}`)?.classList.add('active');
  renderBottomSheetNotes(tab);
}

function renderBottomSheetNotes(tab) {
  const container = document.getElementById('bottom-sheet-content');
  if (!container || !bibleData) return;
  const notes = getBibleNotes();
  const noteEntries = Object.entries(notes);

  if (tab === 'chapter') {
    // Current chapter notes
    if (bibleCurrentBook < 0 || bibleCurrentChapter < 0) {
      container.innerHTML = '<p class="bible-empty-state">請先進入某章閱讀</p>';
      return;
    }
    const prefix = `${bibleData[bibleCurrentBook].name}_${bibleCurrentChapter}_`;
    const chapterNotes = noteEntries.filter(([k]) => k.startsWith(prefix));
    if (chapterNotes.length === 0) {
      container.innerHTML = '<p class="bible-empty-state">本章還沒有筆記<br><small>在閱讀時點擊 📝 寫下第一則</small></p>';
      return;
    }
    container.innerHTML = chapterNotes.map(([k, v]) => {
      const verseIdx = parseInt(k.split('_')[2]);
      return `<div class="bottom-note-card">
        <div class="bottom-note-ref">${bibleData[bibleCurrentBook].name} ${bibleCurrentChapter + 1}:${verseIdx + 1}</div>
        <div class="bottom-note-text">${v.text}</div>
        <button class="bottom-note-jump" onclick="bibleJumpToVerse(${bibleCurrentBook},${bibleCurrentChapter},${verseIdx})">↑ 跳到這節</button>
      </div>`;
    }).join('');

  } else {
    // Recent notes (all, sorted by updatedAt)
    if (noteEntries.length === 0) {
      container.innerHTML = '<p class="bible-empty-state">還沒有任何筆記</p>';
      return;
    }
    const sorted = noteEntries.sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0)).slice(0, 15);
    container.innerHTML = sorted.map(([k, v]) => {
      const parts = k.split('_');
      const verseIdx = parseInt(parts[parts.length - 1]);
      return `<div class="bottom-note-card">
        <div class="bottom-note-ref">${v.bookIdx !== undefined ? `${bibleData[v.bookIdx]?.name} ${v.chapterIdx + 1}:${v.verseIdx + 1}` : k}</div>
        <div class="bottom-note-text">${v.text}</div>
        ${v.bookIdx !== undefined ? `<button class="bottom-note-jump" onclick="bibleJumpToVerse(${v.bookIdx},${v.chapterIdx},${v.verseIdx})">↑ 跳到這節</button>` : ''}
      </div>`;
    }).join('');
  }
}

function bibleJumpToVerse(bookIdx, chapterIdx, verseIdx) {
  _closeBibleBottomSheet();
  // Navigate if needed
  const needNav = bookIdx !== bibleCurrentBook || chapterIdx !== bibleCurrentChapter;
  const doJump = () => {
    const el = document.getElementById(`verse-row-${verseIdx}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('bible-verse-highlight');
      setTimeout(() => el.classList.remove('bible-verse-highlight'), 1800);
    }
  };
  if (needNav) {
    _bibleSelectBook(bookIdx);
    setTimeout(() => { _bibleSelectChapter(chapterIdx); setTimeout(doJump, 300); }, 100);
  } else {
    doJump();
  }
}

/* ─── Notes Overview ──────────────────────────────────────── */
function bibleShowNotesOverview() {
  _bibleNotesOverviewActive = true;
  document.getElementById('bible-picker-tab-books').classList.remove('active');
  document.getElementById('bible-picker-tab-notes').classList.add('active');
  document.getElementById('bible-book-lists').style.display = 'none';
  document.getElementById('bible-notes-overview').style.display = 'block';
  _renderNotesOverview('');
}

function bibleShowBookPicker() {
  _bibleNotesOverviewActive = false;
  _bibleRenderBookPicker();
}

function bibleFilterNotes() {
  const q = document.getElementById('bible-notes-search')?.value || '';
  _renderNotesOverview(q);
}

function _renderNotesOverview(query) {
  const container = document.getElementById('bible-notes-overview-list');
  if (!container || !bibleData) return;
  const notes = getBibleNotes();
  const allEntries = Object.entries(notes);

  const filtered = query
    ? allEntries.filter(([, v]) => v.text.includes(query))
    : allEntries;

  if (filtered.length === 0) {
    container.innerHTML = `<div class="bible-empty-state" style="text-align:center; padding:40px 0;">
      <p style="font-size:2rem;">📝</p>
      <p>${query ? '找不到符合的筆記' : '還沒有任何靈修筆記'}</p>
      <small style="color:var(--text-secondary);">在閱讀時點擊 📝 寫下第一則</small>
    </div>`;
    return;
  }

  // Group by book
  const byBook = {};
  filtered.forEach(([k, v]) => {
    const bookName = k.split('_')[0];
    if (!byBook[bookName]) byBook[bookName] = [];
    byBook[bookName].push([k, v]);
  });

  container.innerHTML = Object.entries(byBook).map(([bookName, entries]) => {
    const items = entries.sort((a, b) => {
      const [, av] = a; const [, bv] = b;
      return (av.chapterIdx || 0) - (bv.chapterIdx || 0) || (av.verseIdx || 0) - (bv.verseIdx || 0);
    }).map(([k, v]) => {
      const parts = k.split('_');
      const verseIdx = parseInt(parts[parts.length - 1]);
      const date = v.updatedAt ? new Date(v.updatedAt).toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' }) : '';
      return `<div class="notes-overview-item">
        <div class="notes-overview-ref">${v.bookIdx !== undefined ? `${bookName} ${v.chapterIdx + 1}:${v.verseIdx + 1}` : k} <small>${date}</small></div>
        <div class="notes-overview-text">${v.text}</div>
        ${v.bookIdx !== undefined ? `<button class="bottom-note-jump" onclick="bibleJumpToVerse(${v.bookIdx},${v.chapterIdx},${v.verseIdx})">去這節 →</button>` : ''}
      </div>`;
    }).join('');

    return `<div class="notes-overview-book-card">
      <div class="notes-overview-book-title" onclick="this.nextElementSibling.classList.toggle('open')">
        📖 ${bookName} <span class="notes-count">${entries.length}則筆記</span>
        <i class="ph-bold ph-caret-down" style="margin-left:auto;"></i>
      </div>
      <div class="notes-overview-book-body open">${items}</div>
    </div>`;
  }).join('');
}

/* ─── Full-text Search ────────────────────────────────────── */
function bibleSearch() {
  const query = document.getElementById('bible-search-input')?.value?.trim();
  if (!query || !bibleData) return;
  const resultsEl = document.getElementById('bible-search-results');
  if (!resultsEl) return;
  resultsEl.innerHTML = '<p style="color:var(--text-secondary); font-size:0.9rem;">搜尋中...</p>';

  setTimeout(() => {
    const results = [];
    bibleData.forEach((book, bIdx) => {
      book.chapters.forEach((chapter, cIdx) => {
        chapter.forEach((verse, vIdx) => {
          if (verse.includes(query)) {
            results.push({ bookIdx: bIdx, chapterIdx: cIdx, verseIdx: vIdx, bookName: book.name, verse });
          }
        });
      });
    });

    if (results.length === 0) {
      resultsEl.innerHTML = `<p class="bible-empty-state">找不到「${query}」的相關經文</p>`;
      return;
    }

    const limited = results.slice(0, 50);
    resultsEl.innerHTML = `<p class="bible-search-count">共找到 ${results.length} 處${results.length > 50 ? '（顯示前50筆）' : ''}</p>` +
      limited.map(r => {
        const highlighted = r.verse.replace(new RegExp(query, 'g'), `<mark>${query}</mark>`);
        return `<div class="bible-search-result-item" onclick="bibleJumpToVerse(${r.bookIdx},${r.chapterIdx},${r.verseIdx})">
          <div class="bible-search-ref">${r.bookName} ${r.chapterIdx + 1}:${r.verseIdx + 1}</div>
          <div class="bible-search-verse">${highlighted}</div>
        </div>`;
      }).join('');
  }, 50);
}

/* ─── Streak Tracker ──────────────────────────────────────── */
function _updateBibleStreak() {
  const today = new Date().toDateString();
  const streak = getBibleStreak();
  if (streak.lastDate === today) return;

  const yesterday = new Date(Date.now() - 86400000).toDateString();
  if (streak.lastDate === yesterday) {
    streak.count = (streak.count || 0) + 1;
  } else {
    streak.count = 1;
  }
  streak.lastDate = today;
  saveBibleStreak(streak);
  updateDashboard();
}

function getBibleStreakCount() {
  return getBibleStreak().count || 0;
}

/* ─── Daily Verse (for home screen) ──────────────────────── */
function getDailyVerseForHome() {
  const today = new Date().toDateString();
  const cached = JSON.parse(localStorage.getItem('hw_daily_verse') || 'null');
  if (cached && cached.date === today) return cached;

  // Try from saved faith quotes first
  const faithQuotes = quotesDb.filter(q => q.category === 'cat_faith' && q.original.includes('──'));
  if (faithQuotes.length > 0) {
    const pick = faithQuotes[Math.floor(Math.random() * faithQuotes.length)];
    const result = { date: today, text: pick.original, source: 'library' };
    localStorage.setItem('hw_daily_verse', JSON.stringify(result));
    return result;
  }

  // Fallback: curated verses
  const curated = [
    { text: '起初，神創造天地。（創世記 1:1）', bookIdx: 0, chapterIdx: 0 },
    { text: '耶和華是我的牧者，我必不至缺乏。（詩篇 23:1）', bookIdx: 18, chapterIdx: 22 },
    { text: '我靠著那加給我力量的，凡事都能做。（腓立比書 4:13）', bookIdx: 49, chapterIdx: 3 },
    { text: '你要全心倚賴耶和華，不可倚靠自己的聰明。（箴言 3:5）', bookIdx: 19, chapterIdx: 2 },
    { text: '愛是恆久忍耐，又有恩慈。（哥林多前書 13:4）', bookIdx: 45, chapterIdx: 12 },
    { text: '神愛世人，甚至將他的獨生子賜給他們。（約翰福音 3:16）', bookIdx: 42, chapterIdx: 2 },
    { text: '你趁著年幼、衰敗的日子尚未來到，應當記念造你的主。（傳道書 12:1）', bookIdx: 20, chapterIdx: 11 },
  ];
  const pick = curated[new Date().getDate() % curated.length];
  const result = { date: today, text: pick.text, bookIdx: pick.bookIdx, chapterIdx: pick.chapterIdx, source: 'curated' };
  localStorage.setItem('hw_daily_verse', JSON.stringify(result));
  return result;
}
