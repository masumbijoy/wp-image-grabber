'use strict';

/* Click on the toolbar icon (or Alt+Shift+G): open the panel on the current tab. */
async function inject(tab) {
  try {
    chrome.action.setBadgeText({ tabId: tab.id, text: '' });
    /* trust this tab first, so the panel's very first message is already accepted */
    const { armed = [] } = await chrome.storage.session.get('armed');
    if (!armed.includes(tab.id)) await chrome.storage.session.set({ armed: [...armed, tab.id] });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['bridge.js'] });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', func: v => { window.__wpigVersion = v; }, args: [chrome.runtime.getManifest().version] });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['grabber.js'], world: 'MAIN' });
    chrome.action.setBadgeText({ tabId: tab.id, text: '' });
  } catch (e) {
    const { armed = [] } = await chrome.storage.session.get('armed');
    await chrome.storage.session.set({ armed: armed.filter(x => x !== tab.id) });
    console.warn('WP Image Grabber inject failed', e);
    chrome.action.setBadgeBackgroundColor({ color: '#c5221f' });
    chrome.action.setBadgeText({ tabId: tab.id, text: '!' });
    chrome.action.setTitle({ tabId: tab.id, title: 'WP Image Grabber v' + chrome.runtime.getManifest().version + ' could not start on this page: ' + String((e && e.message) || e) });
  }
}
chrome.action.onClicked.addListener(inject);

chrome.tabs.onUpdated.addListener((id, info) => {
  if (info.status === 'loading') { chrome.action.setBadgeText({ tabId: id, text: '' }); chrome.action.setTitle({ tabId: id, title: 'WP Image Grabber v' + chrome.runtime.getManifest().version + ' – click on a page to open the panel' }); }
});

chrome.tabs.onRemoved.addListener(async id => {
  const { armed = [] } = await chrome.storage.session.get('armed');
  if (armed.includes(id)) await chrome.storage.session.set({ armed: armed.filter(x => x !== id) });
});

chrome.runtime.onInstalled.addListener(d => {
  if (d.reason === 'install') chrome.runtime.openOptionsPage();
});

/* Never let a page use the extension to reach local or private network addresses. */
function isPrivateHost(h) {
  h = h.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.lan')) return true;
  if (h.includes(':')) return true;
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const a = +m[1], b = +m[2];
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  return false;
}

/* Fetch an image from another domain (CDN) on behalf of the page – only when the user allowed it. */
async function fetchBytes(url) {
  let u;
  try { u = new URL(url); } catch (e) { return { ok: false, reason: 'bad url' }; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, reason: 'bad url' };
  if (isPrivateHost(u.hostname)) return { ok: false, reason: 'private address' };
  const has = await chrome.permissions.contains({ origins: [`${u.protocol}//${u.hostname}/*`] });
  if (!has) return { ok: false, reason: 'permission', origin: u.origin };
  const r = await fetch(u.href, { credentials: 'omit' });
  if (!r.ok) return { ok: false, reason: 'http ' + r.status };
  const type = (r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!type.startsWith('image/')) return { ok: false, reason: 'not an image' };
  const buf = new Uint8Array(await r.arrayBuffer());
  if (buf.length > 25e6) return { ok: false, reason: 'too large' };
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return { ok: true, type, b64: btoa(s) };
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  (async () => {
    if (!sender.tab || sender.id !== chrome.runtime.id || !msg) return reply(null);
    const { armed = [] } = await chrome.storage.session.get('armed');
    if (!armed.includes(sender.tab.id)) return reply(null);
    try {
      if (msg.type === 'ping') return reply({ ok: true });
      if (msg.type === 'getSettings') { const { settings } = await chrome.storage.local.get('settings'); return reply({ settings: settings || null }); }
      if (msg.type === 'setSettings' && msg.settings && typeof msg.settings === 'object') { await chrome.storage.local.set({ settings: msg.settings }); return reply({ ok: true }); }
      if (msg.type === 'openOptions') { chrome.runtime.openOptionsPage(); return reply({ ok: true }); }
      if (msg.type === 'fetchBytes' && typeof msg.url === 'string') return reply(await fetchBytes(msg.url));
    } catch (e) { return reply({ ok: false, reason: String(e && e.message || e) }); }
    reply(null);
  })();
  return true;
});
