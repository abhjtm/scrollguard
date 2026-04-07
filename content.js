(function () {
  'use strict';

  const TICK_MS = 5000; // heartbeat interval in ms
  let ticker = null;

  // ─── Utilities ─────────────────────────────────────────────────────────────

  function currentHost() {
    return location.hostname.replace(/^www\./, '').toLowerCase();
  }

  function isTracked(host, presets, customs) {
    return [...presets, ...customs].some(
      site => host === site || host.endsWith('.' + site)
    );
  }

  // ─── Block overlay ─────────────────────────────────────────────────────────

  function showBlock() {
    if (document.getElementById('_sg_block')) return;

    const wrap = document.createElement('div');
    wrap.id = '_sg_block';

    // Use setAttribute so the styles survive any page CSS resets
    wrap.setAttribute('style', [
      'position:fixed', 'top:0', 'left:0', 'right:0', 'bottom:0',
      'z-index:2147483647', 'background:#0a0a0a',
      'display:flex', 'align-items:center', 'justify-content:center',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
      'pointer-events:all'
    ].map(s => s + ' !important').join(';') + ';');

    wrap.innerHTML = `
      <div style="text-align:center;max-width:380px;padding:48px 28px;color:#fff">
        <div style="font-size:52px;margin-bottom:20px">&#9201;</div>
        <h1 style="font-size:22px;font-weight:700;margin:0 0 12px;color:#fff;letter-spacing:-0.3px">
          Daily limit reached
        </h1>
        <p style="font-size:14px;color:#888;margin:0 0 6px;line-height:1.5">
          Your ScrollGuard budget is used up for today.
        </p>
        <p style="font-size:13px;color:#555;margin:0">Resets at midnight.</p>
      </div>
    `;

    // Block scrolling on the page
    try {
      document.documentElement.style.setProperty('overflow', 'hidden', 'important');
    } catch (_) {}

    // Attach to documentElement so it works even before <body> exists
    (document.body || document.documentElement).appendChild(wrap);
  }

  // ─── Ticker ────────────────────────────────────────────────────────────────

  function startTicker() {
    if (ticker) return;
    ticker = setInterval(() => {
      chrome.runtime.sendMessage({ type: 'TICK', seconds: 5, domain: currentHost() }, res => {
        if (chrome.runtime.lastError || !res) return;
        if (res.blocked) {
          stopTicker();
          showBlock();
        }
        // Stop ticker if extension was disabled while page was open
        if (res.enabled === false) stopTicker();
      });
    }, TICK_MS);
  }

  function stopTicker() {
    clearInterval(ticker);
    ticker = null;
  }

  // ─── Init ──────────────────────────────────────────────────────────────────

  chrome.runtime.sendMessage({ type: 'CHECK_STATUS' }, res => {
    if (chrome.runtime.lastError || !res) return;
    if (!res.enabled) return;

    const host = currentHost();
    if (!isTracked(host, res.presetSites || [], res.customSites || [])) return;

    if (res.blocked) {
      // Show immediately, or wait for body if document hasn't loaded yet
      if (document.body) {
        showBlock();
      } else {
        document.addEventListener('DOMContentLoaded', showBlock, { once: true });
      }
      return;
    }

    // Track only while this tab is the active, visible tab
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') startTicker();
      else stopTicker();
    });

    if (document.visibilityState === 'visible') startTicker();
  });
}());
