/* ====================================== */
/* js/heatmap.js - 讀經熱力圖 (365 days)  */
/* ====================================== */

function renderBibleHeatmap(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const log = JSON.parse(localStorage.getItem('hw_bible_read_log') || '{}');
  const today = new Date();
  const totalDays = 365;

  // Build 365-day grid
  let html = '<div class="heatmap-wrapper">';
  html += '<div class="heatmap-title">📖 年度讀經軌跡</div>';
  html += '<div class="heatmap-grid">';

  for (let i = totalDays - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const hasRead = log[dateStr] ? true : false;
    const isToday = i === 0;
    const month = d.getMonth();
    // Color intensity based on chapters read
    let level = 0;
    if (hasRead) {
      const chapters = Array.isArray(log[dateStr]) ? log[dateStr].length : 1;
      if (chapters >= 5) level = 4;
      else if (chapters >= 3) level = 3;
      else if (chapters >= 2) level = 2;
      else level = 1;
    }

    const tooltip = hasRead 
      ? `${dateStr}：已讀經` 
      : `${dateStr}：未讀經`;

    html += `<div class="heatmap-cell level-${level}${isToday ? ' today' : ''}" title="${tooltip}" data-date="${dateStr}"></div>`;
  }

  html += '</div>';

  // Month labels
  html += '<div class="heatmap-months">';
  const monthNames = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];
  // Show roughly every other month
  for (let m = 0; m < 12; m++) {
    html += `<span>${monthNames[m]}</span>`;
  }
  html += '</div>';

  // Stats
  const totalRead = Object.keys(log).length;
  const streakCount = typeof getBibleStreakCount === 'function' ? getBibleStreakCount() : 0;
  html += `<div class="heatmap-stats">
    <span>📅 今年已讀 <strong>${totalRead}</strong> 天</span>
    <span>🔥 連續 <strong>${streakCount}</strong> 天</span>
  </div>`;

  html += '</div>';
  container.innerHTML = html;
}
