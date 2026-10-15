document.getElementById('ver').textContent = 'version ' + chrome.runtime.getManifest().version;
const ORIGINS = ['http://*/*', 'https://*/*'];
const state = document.getElementById('state');
async function refresh() {
  const on = await chrome.permissions.contains({ origins: ORIGINS });
  state.textContent = on ? 'Status: other domains are allowed.' : 'Status: only the site you are on is used (default).';
  document.getElementById('allow').disabled = on;
  document.getElementById('revoke').disabled = !on;
}
document.getElementById('allow').addEventListener('click', async () => {
  try { await chrome.permissions.request({ origins: ORIGINS }); } catch (e) { state.textContent = 'Could not request permission: ' + e.message; return; }
  refresh();
});
document.getElementById('revoke').addEventListener('click', async () => {
  await chrome.permissions.remove({ origins: ORIGINS });
  refresh();
});
refresh();
