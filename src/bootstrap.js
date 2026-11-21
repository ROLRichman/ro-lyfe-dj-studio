// RO’Lyfe DJ Studio startup coordinator.
// Load the audio engine and publish its API before dependent studio modules.
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
      'padding:14px 16px','border:2px solid #e46b58','border-radius:10px',
      'background:#210f0c','color:#fff1e8','font:600 13px/1.5 system-ui,sans-serif',
      'box-shadow:0 12px 40px #000b','overflow-wrap:anywhere'
    ].join(';');
    document.body.appendChild(banner);
  }
  banner.textContent = 'RO’Lyfe DJ Studio could not finish starting. ' +
    (error && error.message ? error.message : String(error)) +
    ' Refresh once. If it repeats, send us this message.';
}

window.addEventListener('error', event => {
  if (event.error) showStartupError(event.error);
});
window.addEventListener('unhandledrejection', event => {
  showStartupError(event.reason || new Error('An unhandled studio task failed.'));
});

try {
  for (const path of modules) await import(path);
  document.documentElement.dataset.rolyfeStudioReady = 'true';
  console.info('[RO’Lyfe] All studio modules initialized in order.');
} catch (error) {
  showStartupError(error);
}
