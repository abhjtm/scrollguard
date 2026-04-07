'use strict';

const DEFAULT_CONFIG = {
  dailyLimit: 10, // minutes, configurable 1–120
  enabled: true,
  presetSites: [
    'twitter.com', 'x.com', 'instagram.com', 'tiktok.com',
    'reddit.com', 'youtube.com', 'facebook.com', 'linkedin.com'
  ],
  customSites: []
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function storageGet(keys) {
  return new Promise(resolve => chrome.storage.local.get(keys, resolve));
}

function storageSet(items) {
  return new Promise(resolve => chrome.storage.local.set(items, resolve));
}

function todayStr() {
  return new Date().toDateString();
}

async function getConfig() {
  const data = await storageGet('config');
  // Deep-copy defaults so mutations don't affect DEFAULT_CONFIG
  return data.config ?? JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}

async function getSession() {
  const data = await storageGet('session');
  let session = data.session;
  // Auto-reset at midnight
  if (!session || session.date !== todayStr()) {
    session = { date: todayStr(), totalSeconds: 0, siteSeconds: {}, blocked: false };
    await storageSet({ session });
  }
  // Backwards compat: add siteSeconds if missing from an older session
  if (!session.siteSeconds) session.siteSeconds = {};
  return session;
}

// ─── Install ─────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get('config', data => {
    if (!data.config) {
      chrome.storage.local.set({ config: DEFAULT_CONFIG });
    }
  });
});

// ─── Message Handler ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  handle(request)
    .then(sendResponse)
    .catch(() => sendResponse(null));
  return true; // keep channel open for async response
});

async function handle(req) {
  const config = await getConfig();
  const session = await getSession();

  switch (req.type) {

    case 'CHECK_STATUS': {
      return {
        enabled: config.enabled,
        blocked: session.blocked,
        totalSeconds: session.totalSeconds,
        limitSeconds: config.dailyLimit * 60,
        dailyLimit: config.dailyLimit,
        presetSites: config.presetSites,
        customSites: config.customSites
      };
    }

    case 'TICK': {
      // Do nothing if disabled or already blocked
      if (!config.enabled || session.blocked) {
        return { blocked: session.blocked, enabled: config.enabled };
      }
      const secs = req.seconds || 5;
      const domain = req.domain || 'unknown';
      session.totalSeconds += secs;
      session.siteSeconds[domain] = (session.siteSeconds[domain] || 0) + secs;
      if (session.totalSeconds >= config.dailyLimit * 60) {
        session.blocked = true;
      }
      await storageSet({ session });
      return { blocked: session.blocked, enabled: true };
    }

    case 'SET_LIMIT': {
      const limit = Math.max(1, Math.min(120, parseInt(req.limit) || 10));
      config.dailyLimit = limit;
      await storageSet({ config });
      return { success: true, dailyLimit: limit };
    }

    case 'TOGGLE': {
      config.enabled = !config.enabled;
      await storageSet({ config });
      return { enabled: config.enabled };
    }

    case 'ADD_SITE': {
      const site = (req.site || '')
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .split('/')[0]
        .split('?')[0];
      if (
        site &&
        site.includes('.') &&
        !config.presetSites.includes(site) &&
        !config.customSites.includes(site)
      ) {
        config.customSites.push(site);
        await storageSet({ config });
      }
      return { success: true };
    }

    case 'REMOVE_SITE': {
      const target = req.site;
      config.presetSites = config.presetSites.filter(s => s !== target);
      config.customSites = config.customSites.filter(s => s !== target);
      await storageSet({ config });
      return { success: true };
    }

    case 'GET_DASHBOARD': {
      const entries = Object.entries(session.siteSeconds || {})
        .sort((a, b) => b[1] - a[1]);
      const top9 = entries.slice(0, 9).map(([site, seconds]) => ({ site, seconds }));
      const othersSeconds = entries.slice(9).reduce((sum, [, s]) => sum + s, 0);
      return {
        date: session.date,
        totalSeconds: session.totalSeconds,
        limitSeconds: config.dailyLimit * 60,
        dailyLimit: config.dailyLimit,
        top9,
        othersSeconds,
        blocked: session.blocked
      };
    }

    case 'RESET_DAY': {
      const fresh = { date: todayStr(), totalSeconds: 0, siteSeconds: {}, blocked: false };
      await storageSet({ session: fresh });
      return { success: true };
    }

    default:
      return null;
  }
}
