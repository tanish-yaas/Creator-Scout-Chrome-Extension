// ==========================================
// Creator Scout — background
// 1. After an update restarts the extension, opens the Creator Scout tabs that were open before.
// 2. Uploads moodboard saves from the popup in the background.
// 3. Checks GitHub for a new version every 30 minutes and marks the toolbar icon when one is ready.
// ==========================================

importScripts('config.js', 'updater.js', 'db.js');

// Saves from the popup upload here, so closing the popup doesn't stop them
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg || msg.type !== 'scout-flush') return;
  flushOutbox().then(() => reply({ ok: true }), e => reply({ ok: false, error: e.message }));
  return true;
});

chrome.storage.local.get(['scoutReopen'], ({ scoutReopen }) => {
  if (!scoutReopen) return;
  chrome.storage.local.remove('scoutReopen');
  if (Date.now() - (scoutReopen.at || 0) > 2 * 60 * 1000) return;
  (scoutReopen.urls || []).forEach((url, i) => chrome.tabs.create({ url, active: i === 0 }));
});

async function markIcon() {
  const u = await checkForUpdate();
  await chrome.action.setBadgeText({ text: u.available ? 'NEW' : '' });
  if (u.available) {
    await chrome.action.setBadgeBackgroundColor({ color: '#A6FF3D' });
    if (chrome.action.setBadgeTextColor) await chrome.action.setBadgeTextColor({ color: '#000000' });
    await chrome.action.setTitle({ title: `Creator Scout · update ${u.latest} ready` });
  } else {
    await chrome.action.setTitle({ title: 'Creator Scout' });
  }
}

chrome.alarms.create('scout-update-check', { periodInMinutes: 30, delayInMinutes: 1 });
chrome.alarms.onAlarm.addListener(a => { if (a.name === 'scout-update-check') { markIcon(); flushOutbox(); } });
chrome.runtime.onStartup.addListener(markIcon);
chrome.runtime.onInstalled.addListener(markIcon);
