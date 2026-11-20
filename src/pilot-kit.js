// RO’Lyfe DJ Studio — lightweight pilot toolkit.
// Creates original local practice loops in the browser; no API or account is required.
const studio = window.ROLyfeStudio;
const $p = (id) => document.getElementById(id);
function pilotToast(message) {
  if (studio && studio.toast) studio.toast(message);
  else console.info(message);
}
function wavBlob(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const tag = (offset, value) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
  tag(0, 'RIFF'); view.setUint32(4, 36 + samples.length * 2, true); tag(8, 'WAVE');
  tag(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true);
  view.setUint16(34, 16, true); tag(36, 'data'); view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const value = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, value < 0 ? value * 32768 : value * 32767, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}
function buildDemo(info) {
  const sampleRate = 22050;
  const secondsPerBeat = 60 / info.bpm;
  const totalBeats = 128; // 32 bars: roughly 77–80 seconds at the starter tempos.
  const samples = new Float32Array(Math.ceil(secondsPerBeat * totalBeats * sampleRate));
  let seed = info.variant * 7919 + info.bpm * 37;
  const noise = () => { seed = (seed * 16807) % 2147483647; return (seed / 2147483647) * 2 - 1; };
  const add = (at, duration, fn) => {
    const start = Math.floor(at * sampleRate);
    const end = Math.min(samples.length, start + Math.floor(duration * sampleRate));
    for (let i = start; i < end; i++) samples[i] += fn((i - start) / sampleRate);
  };
  for (let beat = 0; beat < totalBeats; beat++) {
    const at = beat * secondsPerBeat;
    const position = beat % 4;
    add(at, 0.30, (t) => Math.sin(2 * Math.PI * (48 * t + 6 * (1 - Math.exp(-18 * t)))) * Math.exp(-10 * t) * 0.70);
    if (position === 1 || position === 3) add(at, 0.17, (t) => (noise() * 0.62 + Math.sin(2 * Math.PI * 185 * t) * 0.20) * Math.exp(-22 * t));
    for (let half = 0; half < 2; half++) {
      add(at + half * secondsPerBeat / 2, 0.04, (t) => noise() * (half ? 0.15 : 0.10) * Math.exp(-82 * t));
    }
    if (position === 0 || position === 2) {
      const notes = info.variant === 1 ? [55, 65.41, 49, 58.27] : [49, 58.27, 43.65, 51.91];
      const note = notes[Math.floor(beat / 4) % notes.length];
      add(at, 0.26, (t) => Math.sin(2 * Math.PI * note * t) * Math.exp(-5.5 * t) * 0.16);
    }
  }
  const marker = info.variant === 1 ? 440 : 523.25;
  add(0, 0.45, (t) => Math.sin(2 * Math.PI * marker * t) * Math.exp(-12 * t) * 0.10);
  return new File([wavBlob(samples, sampleRate)], info.name, { type: 'audio/wav', lastModified: Date.now() });
}
async function loadDemo(deck) {
  if (!studio || !studio.loadFileIntoDeck || !studio.deckState || !studio.deckState[deck]) {
    pilotToast('The audio engine is not ready. Refresh and try again.');
    return;
  }
  const info = deck === 'A'
    ? { name: 'RO’Lyfe Demo A - Warm Up.wav', bpm: 96, variant: 1 }
    : { name: 'RO’Lyfe Demo B - Club Pulse.wav', bpm: 100, variant: 2 };
  try {
    await studio.loadFileIntoDeck(deck, buildDemo(info));
    studio.deckState[deck].bpm = info.bpm;
    const chip = $p('bpm' + deck);
    if (chip) chip.textContent = info.bpm.toFixed(1) + ' BPM • DEMO';
    pilotToast('Original ' + info.bpm + ' BPM practice loop loaded on Deck ' + deck + '.');
  } catch (error) {
    console.error('Demo loop error:', error);
    pilotToast(error && error.message ? error.message : 'Could not create the demo loop in this browser.');
  }
}
const checkLabels = {
  loadA: 'Loaded a track on Deck A', loadB: 'Loaded a track on Deck B',
  play: 'Play / pause worked on both decks', crossfade: 'Crossfader blended between decks',
  eq: 'EQ knobs changed the sound', cues: 'Cue / hot cues worked', loop: 'Beat loop started and exited',
  fx: 'FX pads made sound', record: 'Recorded and downloaded a mix',
  touch: 'Touchscreen controls responded', radio: 'Authorized radio stream loaded (optional)',
  video: 'Local video mixer worked (optional)'
};
function makeReport() {
  const passed = Array.from(document.querySelectorAll('[data-pilot-check]:checked')).map((el) => checkLabels[el.value]);
  const pending = Array.from(document.querySelectorAll('[data-pilot-check]:not(:checked)')).map((el) => checkLabels[el.value]);
  const notes = ($p('pilotNotes') && $p('pilotNotes').value.trim()) || 'No additional notes.';
  return [
    'RO’LYFE DJ STUDIO — PILOT TEST REPORT',
    'Date: ' + new Date().toLocaleString(),
    'Device / browser: ' + (navigator.platform || 'Unknown platform') + ' | ' + navigator.userAgent,
    '', 'PASSED:', ...(passed.length ? passed.map((x) => '- ' + x) : ['- None marked']),
    '', 'NOT TESTED / NEEDS ATTENTION:', ...(pending.length ? pending.map((x) => '- ' + x) : ['- All listed checks marked']),
    '', 'NOTES / BUGS:', notes,
    '', 'Reminder: early pilot preview; not approved for paid gigs or mission-critical live performance.'
  ].join('\n');
}
function openPilot() {
  const layer = $p('pilotKit');
  if (!layer) return;
  layer.classList.add('open');
  layer.setAttribute('aria-hidden', 'false');
  document.body.classList.add('pilot-open');
  $p('closePilotKit')?.focus();
}
function closePilot() {
  const layer = $p('pilotKit');
  if (!layer) return;
  layer.classList.remove('open');
  layer.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('pilot-open');
  $p('pilotKitButton')?.focus();
}
function initPilotKit() {
  if (!$p('pilotKit')) return;
  $p('pilotKitButton')?.addEventListener('click', openPilot);
  $p('closePilotKit')?.addEventListener('click', closePilot);
  $p('pilotKit')?.addEventListener('click', (event) => { if (event.target === $p('pilotKit')) closePilot(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && $p('pilotKit')?.classList.contains('open')) closePilot(); });
  $p('loadDemoA')?.addEventListener('click', () => loadDemo('A'));
  $p('loadDemoB')?.addEventListener('click', () => loadDemo('B'));
  $p('loadDemoPair')?.addEventListener('click', async () => {
    await loadDemo('A'); await loadDemo('B');
    pilotToast('Demo pair ready. Press PLAY on both decks and move the crossfader.');
  });
  $p('copyPilotReport')?.addEventListener('click', async () => {
    const report = makeReport();
    try {
      await navigator.clipboard.writeText(report);
      pilotToast('Test report copied. Paste it into your reply email.');
    } catch {
      const output = $p('pilotReportOutput');
      if (output) { output.value = report; output.focus(); output.select(); pilotToast('Select and copy the report text below.'); }
    }
  });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initPilotKit, { once: true });
else initPilotKit();
