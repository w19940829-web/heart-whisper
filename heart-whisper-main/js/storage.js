/* --- Data Backup & Restore --- */
function exportData() {
  if (typeof quotesDb === 'undefined' || quotesDb.length === 0) {
    showToast('目前沒有金句可以匯出喔！');
    return;
  }
  
  const data = { 
    quotes: quotesDb, 
    streak: localStorage.getItem('hw_streak') || 0, 
    mailbox: typeof mailboxDb !== 'undefined' ? mailboxDb : [],
    preferences: typeof hwPreferences !== 'undefined' ? hwPreferences : null,
    bibleReadLog: localStorage.getItem('hw_bible_read_log'),
    bibleNotes: localStorage.getItem('hw_bible_notes'),
    bibleStreak: localStorage.getItem('hw_bible_streak'),
    bibleBookmark: localStorage.getItem('hw_bible_bookmark')
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
  
  if (!confirm('⚠️ 警告：匯入新的備份檔將會「完全覆蓋」目前所有的金句紀錄與聖經進度，確定要繼續嗎？')) {
    event.target.value = '';
    return;
  }
  
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const importedData = JSON.parse(e.target.result);
      
      // Support raw array (old formats maybe) or object
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
        
        // Restore bible
        if(importedData.bibleReadLog) localStorage.setItem('hw_bible_read_log', importedData.bibleReadLog);
        if(importedData.bibleNotes) localStorage.setItem('hw_bible_notes', importedData.bibleNotes);
        if(importedData.bibleStreak) localStorage.setItem('hw_bible_streak', importedData.bibleStreak);
        if(importedData.bibleBookmark) localStorage.setItem('hw_bible_bookmark', importedData.bibleBookmark);
        
      } else {
        throw new Error('不支援的檔案格式，請確認是否為心語漫遊備份檔。');
      }
      
      localStorage.setItem('hw_quotes', JSON.stringify(quotesDb));
      localStorage.setItem('hw_mailboxDb', JSON.stringify(typeof mailboxDb !== 'undefined'? mailboxDb : []));
      
      showToast('📥 備份資料已成功還原！');
      if (typeof updateDashboard === 'function') updateDashboard();
      if (typeof closeSettings === 'function') closeSettings();
      if (typeof switchView === 'function') switchView('view-home');
      // Reload page to ensure all globals and state are refreshed
      setTimeout(() => location.reload(), 1500);
      
    } catch (err) {
      console.error(err);
      showToast('❌ 匯入失敗與檔案錯誤：' + err.message);
    }
    event.target.value = '';
  };
  reader.readAsText(file);
}
