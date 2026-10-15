(() => {
  if (window.__wpigBridge) return;
  window.__wpigBridge = true;
  window.addEventListener('message', async e => {
    const d = e.data;
    if (e.source !== window || !d || d.__wpig !== 'req' || typeof d.id !== 'number') return;
    let result;
    try { result = await chrome.runtime.sendMessage(d.payload); }
    catch (err) { result = { ok: false, reason: String((err && err.message) || err) }; }
    window.postMessage({ __wpig: 'res', id: d.id, result }, '*');
  });
})();
