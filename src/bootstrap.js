// RO’Lyfe DJ Studio startup coordinator.
// Load the core engine first, then each dependent module in a deterministic order.
const modules = [
  './main.js',
  './starter-crate.js',
  './pilot-kit.js',
  './studio-upgrades.js',
  './video-mixer.js',
  './dj-guide.js',
  './crate-picker.js',
  './coach-voice-questions.js',
  './studio-controls.js'
];

let startupComplete = false;

function showStartupError(error) {
  console.error('[RO’Lyfe startup]', error);
  let banner = document.getElementById('studioStartupError');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'studioStartupError';
    banner.setAttribute('role', 'alert');
    banner.setAttribute('aria-live', 'assertive');
    banner.style.cssText = [
      'position:fixed','left:12px','right:12px','top:12px','z-index:99999',
      'display:flex','align-items:center','justify-content:space-between','gap:12px',
      'padding:14px 16px','border:2px solid #e46b58','border-radius:10px',
      'background:#210f0c','color:#fff1e8','font:600 13px/1.5 system-ui,sans-serif',
      'box-shadow:0 12px 40px #000b','overflow-wrap:anywhere'
    ].join(';');
    const message = document.createElement('span');
    message.id = 'studioStartupErrorMessage';
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = 'RELOAD STUDIO';
    retry.style.cssText = 'flex:0 0 auto;border:1px solid #f1bd76;border-radius:8px;padding:9px 12px;background:#3b2416;color:#fff;font-weight:800;cursor:pointer';
    retry.addEventListener('click', () => window.location.reload());
    banner.append(message, retry);
    document.body.appendChild(banner);
  }
  const message = document.getElementById('studioStartupErrorMessage');
  if (message) {
    message.textContent = 'RO’Lyfe DJ Studio could not finish starting. ' +
      (error && error.message ? error.message : String(error)) +
      ' Reload once. If it repeats, send us this message.';
  }
  document.documentElement.dataset.rolyfeStartup = 'error';
}

window.addEventListener('error', event => {
  if (!startupComplete && event.error) showStartupError(event.error);
});
window.addEventListener('unhandledrejection', event => {
  if (!startupComplete) showStartupError(event.reason || new Error('An unhandled startup task failed.'));
});

async function startStudio() {
  document.documentElement.dataset.rolyfeStartup = 'loading';
  const requiredElements = ['audioA', 'audioB', 'platterA', 'platterB', 'fileA', 'fileB'];
  const missingElements = requiredElements.filter(id => !document.getElementById(id));
  if (missingElements.length) {
    throw new Error('Studio markup is incomplete. Missing: ' + missingElements.join(', '));
  }

  for (const path of modules) {
    await import(path);
    if (path === './main.js') {
      const studio = window.ROLyfeStudio;
      if (!studio || !studio.engine || !studio.deckState?.A?.audio || !studio.deckState?.B?.audio ||
          typeof studio.loadFileIntoDeck !== 'function' || typeof studio.togglePlay !== 'function') {
        throw new Error('The dual-deck audio core did not initialize correctly.');
      }
    }
  }

  startupComplete = true;
  window.__rolyfeStudioReady = true;
  document.documentElement.dataset.rolyfeStartup = 'ready';
  console.info('[RO’Lyfe] All studio modules initialized in order.');
}

startStudio().catch(showStartupError);
