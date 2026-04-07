'use strict';

// 10-color palette — indices 0–8 for top sites, index 9 for "Others"
const PALETTE = [
  '#4f46e5', '#06b6d4', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#d1d5db'
];

let resetPending = false;
let resetTimer   = null;

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  render();
  setInterval(render, 5000);

  document.getElementById('resetBtn').addEventListener('click', onReset);
});

// ─── Data & render ────────────────────────────────────────────────────────────

async function render() {
  const data = await msg({ type: 'GET_DASHBOARD' });
  if (!data) return;

  // Header
  document.getElementById('dateLabel').textContent = data.date || '';
  document.getElementById('blockedPill').classList.toggle('hidden', !data.blocked);

  // Cards
  const used      = Math.floor(data.totalSeconds || 0);
  const limit     = Math.floor(data.limitSeconds  || 600);
  const remaining = Math.max(0, limit - used);
  const pct       = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;

  document.getElementById('usedTime').textContent = fmtTime(used);

  const leftEl = document.getElementById('leftTime');
  leftEl.textContent = fmtTime(remaining);
  leftEl.className   = 'card-value ' + (data.blocked ? 'danger' : 'accent');

  document.getElementById('limitVal').textContent  = `${data.dailyLimit} min`;
  document.getElementById('siteCount').textContent =
    (data.top9 || []).filter(e => e.seconds > 0).length +
    (data.othersSeconds > 0 ? '+' : '');

  // Progress
  const fill = document.getElementById('progressFill');
  fill.style.width      = pct + '%';
  fill.style.background = pct >= 100 ? '#ef4444' : pct >= 80 ? '#f59e0b' : '#4f46e5';
  document.getElementById('progressPct').textContent = Math.round(pct) + '%';

  // Build unified entries array for chart + table
  const entries = buildEntries(data);
  const total   = entries.reduce((s, e) => s + e.seconds, 0);

  if (entries.length === 0 || total === 0) {
    document.getElementById('emptyState').classList.remove('hidden');
    document.getElementById('tableBody').innerHTML = '';
    document.getElementById('legend').innerHTML    = '';
    drawDonut([], 0);
    document.getElementById('donutTotal').textContent = '0m';
    return;
  }

  document.getElementById('emptyState').classList.add('hidden');
  document.getElementById('donutTotal').textContent = fmtShort(total);
  drawDonut(entries, total);
  renderLegend(entries, total);
  renderTable(entries, total);
}

function buildEntries(data) {
  const top9 = (data.top9 || []).filter(e => e.seconds > 0);
  const entries = top9.map((e, i) => ({ ...e, color: PALETTE[i] }));
  if (data.othersSeconds > 0) {
    entries.push({ site: 'Others', seconds: data.othersSeconds, color: PALETTE[9] });
  }
  return entries;
}

// ─── Donut chart ──────────────────────────────────────────────────────────────

function drawDonut(entries, total) {
  const canvas = document.getElementById('donutChart');
  const ctx    = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const cx = W / 2, cy = H / 2;
  const outerR = 95, innerR = 60;

  ctx.clearRect(0, 0, W, H);

  if (entries.length === 0 || total === 0) {
    // Empty ring
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
    ctx.arc(cx, cy, innerR, Math.PI * 2, 0, true);
    ctx.fillStyle = '#f3f4f6';
    ctx.fill();
    return;
  }

  let startAngle = -Math.PI / 2; // start at top

  entries.forEach(entry => {
    const slice = (entry.seconds / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, outerR, startAngle, startAngle + slice);
    ctx.closePath();
    ctx.fillStyle = entry.color;
    ctx.fill();
    startAngle += slice;
  });

  // Punch out inner circle to create donut
  ctx.beginPath();
  ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();

  // Thin gap between slices
  ctx.beginPath();
  ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
  ctx.arc(cx, cy, innerR, Math.PI * 2, 0, true);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth   = 2;
  ctx.stroke();
}

// ─── Legend ───────────────────────────────────────────────────────────────────

function renderLegend(entries, total) {
  const ul = document.getElementById('legend');
  ul.innerHTML = '';
  entries.forEach(entry => {
    const pct = total > 0 ? Math.round((entry.seconds / total) * 100) : 0;
    const li  = document.createElement('li');
    li.className = 'legend-item';
    li.innerHTML = `
      <span class="legend-dot" style="background:${entry.color}"></span>
      <span class="legend-name">${escHtml(entry.site)}</span>
      <span class="legend-pct">${pct}%</span>
    `;
    ul.appendChild(li);
  });
}

// ─── Table ─────────────────────────────────────────────────────────────────────

function renderTable(entries, total) {
  const tbody = document.getElementById('tableBody');
  tbody.innerHTML = '';

  entries.forEach((entry, i) => {
    const pct    = total > 0 ? (entry.seconds / total) * 100 : 0;
    const isOther = entry.site === 'Others';
    const tr     = document.createElement('tr');
    tr.innerHTML = `
      <td class="rank">${isOther ? '…' : i + 1}</td>
      <td>
        <div style="display:flex;align-items:center;gap:7px">
          <span class="color-dot" style="background:${entry.color}"></span>
          <span class="site-name${isOther ? ' others' : ''}">${escHtml(entry.site)}</span>
        </div>
      </td>
      <td class="time-val">${fmtTime(entry.seconds)}</td>
      <td class="share-cell">
        <div class="share-bar-wrap">
          <div class="share-bar-track">
            <div class="share-bar-fill" style="width:${pct.toFixed(1)}%;background:${entry.color}"></div>
          </div>
          <span class="share-pct">${Math.round(pct)}%</span>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// ─── Reset ────────────────────────────────────────────────────────────────────

function onReset() {
  const btn = document.getElementById('resetBtn');
  if (!resetPending) {
    resetPending = true;
    btn.textContent = 'Tap again to confirm';
    btn.classList.add('pending');
    resetTimer = setTimeout(() => {
      resetPending = false;
      btn.textContent = 'Reset Today';
      btn.classList.remove('pending');
    }, 3000);
  } else {
    clearTimeout(resetTimer);
    resetPending = false;
    btn.textContent = 'Reset Today';
    btn.classList.remove('pending');
    msg({ type: 'RESET_DAY' }).then(() => render());
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(seconds) {
  const s = Math.floor(seconds);
  const m = Math.floor(s / 60);
  return `${m}m ${String(s % 60).padStart(2, '0')}s`;
}

function fmtShort(seconds) {
  const m = Math.floor(seconds / 60);
  return m >= 60
    ? `${Math.floor(m / 60)}h ${m % 60}m`
    : `${m}m`;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function msg(payload) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage(payload, res => {
      if (chrome.runtime.lastError) { resolve(null); return; }
      resolve(res);
    });
  });
}
