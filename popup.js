'use strict';

let resetPending = false;
let resetTimer   = null;
let limitTimer   = null;

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  refresh();
  setInterval(refresh, 3000);

  document.getElementById('toggleEnabled')
    .addEventListener('change', async () => { await msg({ type: 'TOGGLE' }); refresh(); });

  document.getElementById('limitSlider')
    .addEventListener('input', onLimitChange);

  document.getElementById('addSiteBtn')
    .addEventListener('click', addSite);

  document.getElementById('newSiteInput')
    .addEventListener('keydown', e => { if (e.key === 'Enter') addSite(); });

  document.getElementById('resetBtn')
    .addEventListener('click', onReset);
});

// ─── Refresh ──────────────────────────────────────────────────────────────────

async function refresh() {
  const status = await msg({ type: 'CHECK_STATUS' });
  if (!status) return;

  // Toggle state
  document.getElementById('toggleEnabled').checked = status.enabled;
  document.getElementById('statsSection')
    .classList.toggle('disabled-stats', !status.enabled);

  // Time stats
  const used      = Math.floor(status.totalSeconds || 0);
  const limit     = Math.floor(status.limitSeconds  || 600);
  const remaining = Math.max(0, limit - used);
  const pct       = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;

  document.getElementById('usedTime').textContent  = fmtTime(used);
  document.getElementById('leftTime').textContent  = fmtTime(remaining);

  const fill = document.getElementById('progressFill');
  fill.style.width      = pct + '%';
  fill.style.background = pct >= 100 ? '#ef4444' : pct >= 80 ? '#f59e0b' : '#4f46e5';

  const leftEl = document.getElementById('leftTime');
  leftEl.className = 'time-num accent';
  if (status.blocked) leftEl.className = 'time-num danger';

  document.getElementById('blockedPill').classList.toggle('hidden', !status.blocked);

  // Limit slider (skip if the user is actively dragging)
  if (document.activeElement !== document.getElementById('limitSlider')) {
    document.getElementById('limitSlider').value  = status.dailyLimit || 10;
    document.getElementById('limitVal').textContent = status.dailyLimit || 10;
  }

  // Sites
  renderSites(status.presetSites || [], status.customSites || []);
}

// ─── Format time ─────────────────────────────────────────────────────────────

function fmtTime(seconds) {
  const s = Math.floor(seconds);
  const m = Math.floor(s / 60);
  return `${m}m ${String(s % 60).padStart(2, '0')}s`;
}

// ─── Sites list ───────────────────────────────────────────────────────────────

function renderSites(presets, customs) {
  const list = document.getElementById('siteList');
  list.innerHTML = '';

  const all = [
    ...presets.map(s => ({ name: s, type: 'preset' })),
    ...customs.map(s => ({ name: s, type: 'custom' }))
  ];

  document.getElementById('siteCount').textContent = all.length;

  all.forEach(({ name, type }) => {
    const li     = document.createElement('li');
    li.className = 'site-item';

    const nameSpan    = document.createElement('span');
    nameSpan.className = 'site-name';
    nameSpan.innerHTML =
      `${escHtml(name)}&nbsp;<span class="badge badge-${type}">${type}</span>`;

    const removeBtn      = document.createElement('button');
    removeBtn.className  = 'remove-btn';
    removeBtn.title      = 'Remove';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', async () => {
      await msg({ type: 'REMOVE_SITE', site: name });
      refresh();
    });

    li.appendChild(nameSpan);
    li.appendChild(removeBtn);
    list.appendChild(li);
  });
}

function escHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Limit slider ─────────────────────────────────────────────────────────────

function onLimitChange() {
  const val = document.getElementById('limitSlider').value;
  document.getElementById('limitVal').textContent = val;

  // Debounce saves to avoid hammering storage on every pixel of drag
  clearTimeout(limitTimer);
  limitTimer = setTimeout(async () => {
    await msg({ type: 'SET_LIMIT', limit: parseInt(val, 10) });
  }, 400);
}

// ─── Add site ────────────────────────────────────────────────────────────────

async function addSite() {
  const input = document.getElementById('newSiteInput');
  const errorEl = document.getElementById('siteError');

  const site = input.value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .split('?')[0];

  if (!site || !site.includes('.')) {
    input.classList.add('error');
    errorEl.classList.remove('hidden');
    setTimeout(() => {
      input.classList.remove('error');
      errorEl.classList.add('hidden');
    }, 2000);
    return;
  }

  await msg({ type: 'ADD_SITE', site });
  input.value = '';
  refresh();
}

// ─── Reset ───────────────────────────────────────────────────────────────────

function onReset() {
  const btn = document.getElementById('resetBtn');

  if (!resetPending) {
    // First click — ask for confirmation
    resetPending = true;
    btn.textContent = 'Tap again to confirm reset';
    btn.classList.add('pending');

    resetTimer = setTimeout(() => {
      resetPending = false;
      btn.textContent = "Reset Today's Usage";
      btn.classList.remove('pending');
    }, 3000);
  } else {
    // Second click — execute reset
    clearTimeout(resetTimer);
    resetPending = false;
    btn.textContent = "Reset Today's Usage";
    btn.classList.remove('pending');
    msg({ type: 'RESET_DAY' }).then(() => refresh());
  }
}

// ─── Messaging helper ────────────────────────────────────────────────────────

function msg(payload) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage(payload, res => {
      if (chrome.runtime.lastError) { resolve(null); return; }
      resolve(res);
    });
  });
}
