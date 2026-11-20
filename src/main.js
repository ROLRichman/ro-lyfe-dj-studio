import { ROLyfeAudioEngine } from './audio-engine.js';

const engine = new ROLyfeAudioEngine();
const deckState = {
  A: { audio: document.getElementById('audioA'), objectUrl: null, file: null, cue: 0, cueSet: false, hotCues: [null, null, null, null, null, null, null, null], tapTimes: [], isStream: false, isRemote: false, streamUrl: null, lastPauseAt: 0, loop: null, waveform: null, bpm: 120, jogPointer: null, jogLastAngle: 0, jogRotation: 0, jogLastTime: 0, jogLastMoveAt: 0, jogLastDelta: 0 },
  B: { audio: document.getElementById('audioB'), objectUrl: null, file: null, cue: 0, cueSet: false, hotCues: [null, null, null, null, null, null, null, null], tapTimes: [], isStream: false, isRemote: false, streamUrl: null, lastPauseAt: 0, loop: null, waveform: null, bpm: 120, jogPointer: null, jogLastAngle: 0, jogRotation: 0, jogLastTime: 0, jogLastMoveAt: 0, jogLastDelta: 0 }
};
const library = [];
const CRATE_DB_NAME = 'rolyfe-local-crate';
const CRATE_DB_VERSION = 1;
let crateDbPromise = null;
const storedFiles = new Map();
let lastDeckAssignments = [];
let toastTimer = null;

function openCrateDb() {
  if (!('indexedDB' in window)) return Promise.reject(new Error('This browser does not support a saved local music crate.'));
  if (!crateDbPromise) {
    crateDbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(CRATE_DB_NAME, CRATE_DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('tracks')) db.createObjectStore('tracks', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('decks')) db.createObjectStore('decks', { keyPath: 'deck' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Could not open the local music crate.'));
      request.onblocked = () => reject(new Error('The local music crate is busy in another tab. Close the other RO’Lyfe tab and retry.'));
    });
  }
  return crateDbPromise;
}

function storedTrackId(file) {
  return [file.name, file.size, file.lastModified || 0].join('::');
}

async function storeTrack(file, deckId = null) {
  if (!(file instanceof Blob) || !file.name) return null;
  const db = await openCrateDb();
  const id = storedTrackId(file);
  await new Promise((resolve, reject) => {
    const tx = db.transaction(['tracks', 'decks'], 'readwrite');
    tx.objectStore('tracks').put({ id, name: file.name, size: file.size, type: file.type || 'audio/*', lastModified: file.lastModified || Date.now(), blob: file });
    if (deckId) tx.objectStore('decks').put({ deck: deckId, trackId: id });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error || new Error('Could not save the track.'));
    tx.onabort = () => reject(tx.error || new Error('The local crate save was interrupted.'));
  });
  storedFiles.set(id, file);
  if (deckId) {
    lastDeckAssignments = [...lastDeckAssignments.filter(item => item.deck !== deckId), { deck: deckId, trackId: id }];
    updateRestoreButton();
  }
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => false);
  return id;
}

async function removeSavedDeck(deckId) {
  try {
    const db = await openCrateDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('decks', 'readwrite');
      tx.objectStore('decks').delete(deckId);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('Could not update the saved deck list.'));
      tx.onabort = () => reject(tx.error || new Error('The saved deck list was not updated.'));
    });
    lastDeckAssignments = lastDeckAssignments.filter(item => item.deck !== deckId);
    updateRestoreButton();
  } catch (error) {
    console.warn('Could not remove saved deck assignment:', error);
  }
}

async function readAllFromStore(storeName) {
  const db = await openCrateDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const request = tx.objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error || new Error('Could not read the local music crate.'));
  });
}

function updateCrateStatus(message) {
  const status = $('crateStorageStatus');
  if (status && message) status.textContent = message;
}

function updateRestoreButton() {
  const button = $('restoreSessionButton');
  if (!button) return;
  button.disabled = lastDeckAssignments.length === 0;
  button.textContent = lastDeckAssignments.length
    ? 'RESTORE LAST SET (' + lastDeckAssignments.length + ')'
    : 'RESTORE LAST SET';
}

async function restoreSavedCrate() {
  // Walk the saved audio store one record at a time. getAll() previously pulled
  // every multi-megabyte Blob into one array during entry, delaying the studio.
  try {
    const db = await openCrateDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('tracks', 'readonly');
      const request = tx.objectStore('tracks').openCursor();
      request.onerror = () => reject(request.error || new Error('Could not scan the saved crate.'));
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) { resolve(); return; }
        const record = cursor.value;
        if (!storedFiles.has(record.id)) {
          try {
            const file = new File([record.blob], record.name, { type: record.type, lastModified: record.lastModified || Date.now() });
            storedFiles.set(record.id, file);
            if (!library.some(item => item.file.name === file.name && item.file.size === file.size)) library.push({ file });
          } catch (error) { console.warn('A saved file could not be restored:', record.name, error); }
        }
        cursor.continue();
      };
    });
    lastDeckAssignments = await readAllFromStore('decks');
    renderLibrary();
    updateRestoreButton();
    updateCrateStatus(library.length + ' TRACK(S) SAVED ON THIS DEVICE · ' + lastDeckAssignments.length + ' DECK(S) READY TO RESTORE');
  } catch (error) {
    console.warn('Saved crate unavailable:', error);
    updateCrateStatus(error.message || 'LOCAL SAVED CRATE IS NOT AVAILABLE IN THIS BROWSER');
  }
}

async function restoreLastSet() {
  if (!lastDeckAssignments.length) {
    toast('No saved decks to restore yet. Load a local track first.');
    return;
  }
  const assignments = [...lastDeckAssignments];
  let restored = 0;
  for (const assignment of assignments) {
    try {
      const db = await openCrateDb();
      const record = await new Promise((resolve, reject) => {
        const tx = db.transaction('tracks', 'readonly');
        const request = tx.objectStore('tracks').get(assignment.trackId);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error || new Error('Could not retrieve the saved track.'));
      });
      if (!record) continue;
      const file = storedFiles.get(record.id) || new File([record.blob], record.name, { type: record.type, lastModified: record.lastModified || Date.now() });
      storedFiles.set(record.id, file);
      await loadFileIntoDeck(assignment.deck, file);
      restored++;
    } catch (error) {
      console.error('Deck restore failed:', assignment.deck, error);
      toast('Could not restore Deck ' + assignment.deck + ': ' + (error.message || 'storage error'));
    }
  }
  toast(restored ? 'Restored ' + restored + ' saved deck(s). Press PLAY to start.' : 'No saved tracks could be restored.');
}


let sessionStartedAt = performance.now();
let recorder = null;
let recordingChunks = [];
let recordingStartedAt = 0;
let lastClockSecond = -1;

function setupMobileMixer() {
  const panel = $('mobileMixPanel');
  const scrim = $('mobileMixScrim');
  const floatingToggle = $('mobileMixToggle');
  const topToggle = $('topQuickMixButton');
  const closeButton = $('mobileMixClose');

  const pairs = [
    ['mobileChannelA', 'channelA', 'mobileChannelAValue', value => Math.round(Number(value) * 100) + '%'],
    ['mobileCrossfader', 'crossfader', 'mobileCrossfaderValue', value =>
      Number(value) === 0 ? 'A ONLY' : Number(value) === 100 ? 'B ONLY' :
      Number(value) === 50 ? 'CENTER' : 'A ' + (100 - Number(value)) + ' / B ' + Number(value)],
    ['mobileChannelB', 'channelB', 'mobileChannelBValue', value => Math.round(Number(value) * 100) + '%'],
    ['mobileMasterVolume', 'masterVolume', 'mobileMasterVolumeValue', value => Math.round(Number(value) * 100) + '%']
  ];

  const syncReadouts = () => {
    pairs.forEach(([proxyId, baseId, outputId, format]) => {
      const proxy = $(proxyId);
      const base = $(baseId);
      const output = $(outputId);
      if (proxy && base) proxy.value = base.value;
      if (output && base) output.textContent = format(base.value);
    });
    if ($('mobileBpmA')) $('mobileBpmA').textContent = $('bpmA')?.textContent || '—';
    if ($('mobileBpmB')) $('mobileBpmB').textContent = $('bpmB')?.textContent || '—';
  };

  const setOpen = open => {
    if (!panel) {
      toast('Quick Mixer panel is missing. Refresh RO’Lyfe and try again.');
      return;
    }
    panel.classList.toggle('open', open);
    scrim?.classList.toggle('open', open);
    panel.setAttribute('aria-hidden', String(!open));
    panel.inert = !open;
    document.body.classList.toggle('quick-mix-open', open);
    if (floatingToggle) {
      floatingToggle.setAttribute('aria-expanded', String(open));
      floatingToggle.setAttribute('aria-label', open ? 'Close Quick Mixer' : 'Open Quick Mixer');
      floatingToggle.textContent = open ? '× CLOSE' : '☷ MIX';
      floatingToggle.classList.toggle('is-open', open);
    }
    if (topToggle) {
      topToggle.setAttribute('aria-expanded', String(open));
      topToggle.textContent = open ? '× CLOSE MIX' : '☷ QUICK MIX';
      topToggle.classList.toggle('is-open', open);
    }
    if (open) syncReadouts();
  };

  const toggle = () => setOpen(!panel?.classList.contains('open'));
  window.ROLyfeQuickMixer = { open: () => setOpen(true), close: () => setOpen(false), toggle };

  // Direct click bindings avoid reliance on a document-level delegated click
  // handler, which can be intercepted by other app controls or overlays.
  floatingToggle?.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    toggle();
  });
  topToggle?.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    toggle();
  });
  closeButton?.addEventListener('click', () => setOpen(false));
  scrim?.addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && panel?.classList.contains('open')) setOpen(false);
  });

  pairs.forEach(([proxyId, baseId, outputId, format]) => {
    const proxy = $(proxyId);
    const base = $(baseId);
    const output = $(outputId);
    if (!proxy || !base) return;
    proxy.addEventListener('input', () => {
      base.value = proxy.value;
      base.dispatchEvent(new Event('input', { bubbles: true }));
      if (output) output.textContent = format(proxy.value);
    });
    base.addEventListener('input', () => {
      proxy.value = base.value;
      if (output) output.textContent = format(base.value);
    });
  });

  $('mobileCenterCrossfader')?.addEventListener('click', () => {
    const base = $('crossfader');
    if (!base) return;
    base.value = '50';
    base.dispatchEvent(new Event('input', { bubbles: true }));
  });

  setOpen(false);
}

function setupFocusMode() {
  const button=$('focusModeButton');
  if(!button)return;
  const apply = () => {
    const active=document.body.classList.contains('focus-mode');
    button.textContent=active?'EXIT FOCUS MODE':'FOCUS / FULL SCREEN';
    button.setAttribute('aria-pressed',String(active));
  };
  button.addEventListener('click',async()=>{
    const active=document.body.classList.toggle('focus-mode');
    if(active && document.documentElement.requestFullscreen) {
      try { await document.documentElement.requestFullscreen(); } catch { /* CSS focus mode remains available. */ }
    } else if(!active && document.fullscreenElement && document.exitFullscreen) {
      try { await document.exitFullscreen(); } catch {}
    }
    apply();
  });
  document.addEventListener('fullscreenchange',()=>{
    if(!document.fullscreenElement && document.body.classList.contains('focus-mode')) document.body.classList.remove('focus-mode');
    apply();
  });
}



const $ = (id) => document.getElementById(id);
const formatTime = (seconds) => {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--';
  const total = Math.floor(seconds);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};
const formatSize = (bytes) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
const extensionOf = (name) => name.includes('.') ? name.split('.').pop().toUpperCase() : 'AUDIO';
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function toast(message) {
  const node = $('toast');
  node.textContent = message;
  node.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('show'), 2800);
}

function setAudioStatus(ready, message = '') {
  $('audioStatusLed').classList.toggle('on', ready);
  $('audioStatusText').textContent = message || (ready ? 'AUDIO ENGINE READY' : 'AUDIO STANDBY');
}

async function ensureAudio() {
  await engine.ensure();
  setAudioStatus(true, 'AUDIO ENGINE READY');
}

async function loadFileIntoDeck(deckId, file) {
  if (!file) return;
  const state = deckState[deckId];
  if (file instanceof Blob && file.name) {
    if (!library.some(item => item.file.name === file.name && item.file.size === file.size)) {
      library.push({ file });
      renderLibrary();
    }
    try {
      await storeTrack(file, deckId);
    } catch (error) {
      console.warn('Track could not be saved for the next session:', error);
      await removeSavedDeck(deckId);
      updateCrateStatus('TRACK LOADED · THIS FILE COULD NOT BE SAVED FOR NEXT TIME');
    }
  }
  const audio = state.audio;
  try {
    await ensureAudio();
    audio.pause();
    if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
    state.file = file;
    state.streamUrl = null;
    state.lastPauseAt = 0;
    state.objectUrl = URL.createObjectURL(file);
    state.cue = 0; state.cueSet = false; state.jogRotation = 0;
    $('platter' + deckId).style.setProperty('--jog-angle', '0deg');
    state.hotCues = Array(8).fill(null); state.tapTimes = []; state.isStream = false; state.isRemote = false;
    state.loop = null;
    state.waveform = null;
    state.bpm = 120;
    state.isStream = false; state.isRemote = false;
    $(`deck${deckId}`).querySelectorAll('[data-action="hotcue"], [data-action="loop"], [data-action="loop-off"], [data-action="cue"], [data-action="set-cue"]').forEach(control => control.disabled = false);
    $('seek' + deckId).disabled = false;
    audio.crossOrigin = 'anonymous';
    audio.src = state.objectUrl;
    audio.load();
    engine.attachDeck(deckId, audio);
    engine.setTrim(deckId, Number($('trim' + deckId).value));
    $('deckVolume' + deckId).value = $('channel' + deckId).value;
    $('deckVolumeValue' + deckId).textContent = Math.round(Number($('channel' + deckId).value) * 100) + '%';
    for (const band of ['low', 'mid', 'high']) {
      const eqKnob = document.querySelector(`.rotary-knob[data-knob="${band}"][data-deck="${deckId}"]`);
      engine.setEQ(deckId, band, Number(eqKnob?.dataset.value ?? 0));
    }
    engine.setFilter(deckId, Number($(`filter${deckId}`).value));
    engine.setChannelVolume(deckId, Number($(`channel${deckId}`).value));
    engine.setEcho(deckId, Number($('echoAmount').value));
    $('tempo' + deckId).value = '0';
    setTempo(deckId, 0);
    $('title' + deckId).textContent = file.name.replace(/\.[^.]+$/, '');
    $('filename' + deckId).textContent = file.name;
    $('format' + deckId).textContent = extensionOf(file.name);
    $('duration' + deckId).textContent = 'LOADING';
    $('loadStatus' + deckId).textContent = 'DECODING TRACK…';
    $('state' + deckId).innerHTML = '<span class="state-dot"></span> LOADING';
    $('state' + deckId).classList.remove('playing');
    $('scopeStatus' + deckId).textContent = 'LOADING TRACK…';
    $('playText' + deckId).textContent = 'PLAY';
    $('playGlyph' + deckId).textContent = '▶';
    $('platter' + deckId).classList.remove('spinning');
    $('seek' + deckId).disabled = false;
    $('seek' + deckId).value = '0';
    drawWaveform(deckId, null);
    toast(`Deck ${deckId}: ${file.name} loaded from your device`);
  } catch (error) {
    console.error(error);
    toast(error.message || 'Unable to start the audio engine in this browser.');
    setAudioStatus(false, 'AUDIO ERROR');
  }
}

async function buildWaveform(deckId, file) {
  const state = deckState[deckId];
  const maxBytes = 70 * 1024 * 1024;
  if (file.size > maxBytes) {
    state.waveform = null;
    drawWaveform(deckId, null);
    $('loadStatus' + deckId).textContent = 'READY • WAVEFORM SKIPPED (LARGE FILE)';
    return;
  }
  try {
    const buffer = await file.arrayBuffer();
    const decoded = await engine.context.decodeAudioData(buffer.slice(0));
    const channel = decoded.getChannelData(0);
    const bars = 420;
    const blockSize = Math.max(1, Math.floor(channel.length / bars));
    const peaks = new Float32Array(bars);
    for (let i = 0; i < bars; i++) {
      const start = i * blockSize;
      let peak = 0;
      for (let j = 0; j < blockSize && start + j < channel.length; j++) peak = Math.max(peak, Math.abs(channel[start + j]));
      peaks[i] = peak;
    }
    if (state.file !== file) return;
    state.waveform = peaks;
    drawWaveform(deckId, peaks);
    $('loadStatus' + deckId).textContent = 'READY • LOCAL AUDIO';
  } catch (error) {
    console.warn('Waveform analysis unavailable:', error);
    state.waveform = null;
    drawWaveform(deckId, null);
    $('loadStatus' + deckId).textContent = 'READY • WAVEFORM UNAVAILABLE';
  }
}

function drawWaveform(deckId, peaks) {
  const canvas = $('wave' + deckId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  const state = deckState[deckId];
  const audio = state.audio;
  const duration = audio.duration;
  // A and B each get a layered colour spectrum instead of one flat deck colour.
  const palette = deckId === 'A'
    ? { grid: 'rgba(231,177,80,.16)', stops: [[0,'#ffe0a0'],[.22,'#f5b65e'],[.48,'#ed8554'],[.72,'#e477a0'],[1,'#b9a0ed']] }
    : { grid: 'rgba(66,191,210,.17)', stops: [[0,'#8cebdc'],[.25,'#58d4e8'],[.5,'#4d9ef0'],[.75,'#8a82ef'],[1,'#8fd6a9']] };

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#050908';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = palette.grid;
  ctx.lineWidth = 1;
  for (let x = 0; x < width; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,255,255,.14)';
  ctx.beginPath(); ctx.moveTo(0, height / 2); ctx.lineTo(width, height / 2); ctx.stroke();

  const gradient = ctx.createLinearGradient(0, 0, width, 0);
  palette.stops.forEach(([stop, color]) => gradient.addColorStop(stop, color));

  const now = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
  const visibleSeconds = 18;
  const startTime = now - visibleSeconds / 2;
  const bars = 300;
  const barWidth = width / bars;

  if (peaks && peaks.length && Number.isFinite(duration) && duration > 0) {
    for (let i = 0; i < bars; i++) {
      const time = startTime + ((i + .5) / bars) * visibleSeconds;
      if (time < 0 || time > duration) continue;
      const sampleIndex = clamp(Math.floor((time / duration) * peaks.length), 0, peaks.length - 1);
      const peak = Number(peaks[sampleIndex]) || 0;
      const amp = Math.max(2, Math.min(height * .88, peak * height * 1.12));
      ctx.fillStyle = gradient;
      ctx.globalAlpha = .58 + Math.min(.38, peak * .36);
      ctx.fillRect(i * barWidth + .7, (height - amp) / 2, Math.max(1.2, barWidth * .72), amp);
    }
    ctx.globalAlpha = 1;
  }

  if (Number.isFinite(duration) && duration > 0) {
    // Tick spacing follows the entered BPM; this is a guide, not an automatically detected beatgrid.
    const beatSeconds = 60 / clamp(Number(state.bpm) || 120, 50, 220);
    const firstBeat = Math.ceil(startTime / beatSeconds);
    const lastBeat = Math.floor((startTime + visibleSeconds) / beatSeconds);
    for (let beat = firstBeat; beat <= lastBeat; beat++) {
      const x = ((beat * beatSeconds - startTime) / visibleSeconds) * width;
      const isBar = ((beat % 4) + 4) % 4 === 0;
      ctx.strokeStyle = isBar ? 'rgba(255,255,255,.23)' : 'rgba(255,255,255,.075)';
      ctx.lineWidth = isBar ? 1.5 : 1;
      ctx.beginPath(); ctx.moveTo(x, height * .12); ctx.lineTo(x, height * .88); ctx.stroke();
    }
  }

  drawWaveformMarkers(deckId, ctx, width, height, startTime, visibleSeconds);
}

function drawWaveformMarkers(deckId, ctx, width, height, startTime, visibleSeconds) {
  const state = deckState[deckId];
  const duration = state.audio.duration;
  const drawMarker = (time, color, label, dashed = false) => {
    if (!Number.isFinite(time) || time < startTime || time > startTime + visibleSeconds) return;
    const x = clamp((time - startTime) / visibleSeconds, 0, 1) * width;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.lineWidth = 2;
    ctx.setLineDash(dashed ? [5, 4] : []);
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = color;
    ctx.font = 'bold 12px monospace';
    ctx.fillText(label, clamp(x + 5, 4, width - 30), 15);
    ctx.restore();
  };

  if (Number.isFinite(duration) && duration > 0) {
    if (state.cueSet) drawMarker(state.cue, '#ffe17e', 'CUE', true);
    const cueColors = ['#ff8d82', '#ffb86b', '#f7e477', '#81e4a7', '#73d9ed', '#86aaff', '#c9a0ff', '#f28fd4'];
    state.hotCues.forEach((time, index) => {
      if (time !== null) drawMarker(time, cueColors[index], String(index + 1));
    });
  }

  // Fixed center playhead; the track waveform moves behind it.
  const centerX = width / 2;
  ctx.save();
  ctx.strokeStyle = '#fff0c8';
  ctx.shadowColor = '#f5d18b';
  ctx.shadowBlur = 10;
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(centerX, 0); ctx.lineTo(centerX, height); ctx.stroke();
  ctx.fillStyle = '#fff0c8';
  ctx.beginPath(); ctx.moveTo(centerX - 6, 2); ctx.lineTo(centerX + 6, 2); ctx.lineTo(centerX, 11); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function setDeckPlayingUI(deckId, playing) {
  $('state' + deckId).classList.toggle('playing', playing);
  $('state' + deckId).innerHTML = playing ? '<span class="state-dot"></span> PLAYING' : '<span class="state-dot"></span> LOADED / PAUSED';
  $('playText' + deckId).textContent = playing ? 'PAUSE' : 'PLAY';
  $('playGlyph' + deckId).textContent = playing ? 'Ⅱ' : '▶';
  $('playGlyph' + deckId).parentElement.classList.toggle('is-playing', playing);
  $('platter' + deckId).classList.toggle('spinning', playing);
  $('platter' + deckId).classList.add('idle-spinning');
  const scopeStatus = $('scopeStatus' + deckId);
  if (scopeStatus) scopeStatus.textContent = playing ? 'PLAYING' : (deckState[deckId].file ? 'LOADED / PAUSED' : 'WAITING FOR TRACK');
}

async function togglePlay(deckId) {
  const state = deckState[deckId];
  if (!state.file) { toast(`Load a track on Deck ${deckId} first.`); return; }
  try {
    await ensureAudio();
    if (state.audio.paused) {
      const pausedTooLong = state.isStream && state.streamUrl && state.lastPauseAt && (Date.now() - state.lastPauseAt >= 30000);
      if (pausedTooLong) {
        // Reopen the live source after a long pause instead of replaying an old buffered segment.
        state.audio.src = state.streamUrl;
        state.audio.load();
        state.lastPauseAt = 0;
        const status = $('radioStatus');
        if (status) status.textContent = 'RETURNING TO LIVE BROADCAST…';
      }
      await state.audio.play();
      setDeckPlayingUI(deckId, true);
      if (pausedTooLong) {
        const status = $('radioStatus');
        if (status) status.textContent = 'LIVE STREAM RECONNECTED ON DECK ' + deckId;
        toast('Returned to the current live broadcast.');
      }
    } else {
      state.audio.pause();
      setDeckPlayingUI(deckId, false);
    }
  } catch (error) {
    console.error(error);
    toast(error.name === 'NotAllowedError' ? 'Tap PLAY again to allow audio playback.' : 'Playback could not start. Check the audio format.');
  }
}

function setCue(deckId) {
  const state = deckState[deckId];
  if (!state.file) { toast(`Load a track on Deck ${deckId} first.`); return; }
  if (state.isStream) { toast('Live radio cannot save a seek cue. Load a track file for cue points.'); return; }
  state.cue = state.audio.currentTime || 0;
  state.cueSet = true;
  drawWaveform(deckId, state.waveform);
  toast(`Deck ${deckId} cue saved at ${formatTime(state.cue)}.`);
}

function goCue(deckId) {
  const state = deckState[deckId];
  if (!state.file) { toast(`Load a track on Deck ${deckId} first.`); return; }
  if (state.isStream) { toast('Live radio does not support track cue seeking.'); return; }
  state.audio.currentTime = state.cue || 0;
  state.audio.pause();
  setDeckPlayingUI(deckId, false);
}

function useHotCue(deckId, pad, event) {
  const state = deckState[deckId];
  if (!state.file) { toast(`Load a track on Deck ${deckId} first.`); return; }
  if (state.isStream) { toast('Live radio does not support hot cues.'); return; }
  const padButton = document.querySelector(`#deck${deckId} [data-action="hotcue"][data-pad="${pad}"]`);
  if (event?.altKey && state.hotCues[pad] !== null) {
    state.hotCues[pad] = null; padButton?.classList.remove('set');
    drawWaveform(deckId, state.waveform);
    toast(`Deck ${deckId} hot cue ${pad + 1} cleared.`); return;
  }
  if (state.hotCues[pad] === null) {
    state.hotCues[pad] = state.audio.currentTime || 0;
    padButton?.classList.add('set');
    drawWaveform(deckId, state.waveform);
    toast(`Deck ${deckId} hot cue ${pad + 1} saved.`);
  } else {
    state.audio.currentTime = state.hotCues[pad];
    drawWaveform(deckId, state.waveform);
    if (state.audio.paused) togglePlay(deckId);
  }
}

function toggleLoop(deckId, beats) {
  const state = deckState[deckId];
  if (!state.file || !Number.isFinite(state.audio.duration)) { toast(`Load a track on Deck ${deckId} first.`); return; }
  const seconds = (60 / state.bpm) * beats;
  const start = state.audio.currentTime;
  const end = Math.min(state.audio.duration, start + seconds);
  if (end - start < 0.08) { toast('Not enough track remaining to set this loop.'); return; }
  state.loop = { start, end };
  $(`deck${deckId}`).querySelector(`[data-action="loop"][data-beats="${beats}"]`).classList.add('active');
  toast(`${beats}-beat loop active on Deck ${deckId}.`);
}

function exitLoop(deckId) {
  deckState[deckId].loop = null;
  $(`deck${deckId}`).querySelectorAll('[data-action="loop"]').forEach(button => button.classList.remove('active'));
}

function setTempo(deckId, value) {
  const state = deckState[deckId];
  const percent = Number(value);
  const factor = 1 + percent / 100;
  state.audio.playbackRate = factor;
  $('tempoValue' + deckId).textContent = `${percent >= 0 ? '+' : ''}${percent.toFixed(1)}%`;
}

function ejectDeck(deckId) {
  const state = deckState[deckId];
  state.audio.pause();
  void removeSavedDeck(deckId);
  state.streamUrl = null;
  state.lastPauseAt = 0;
  state.audio.removeAttribute('src');
  state.audio.load();
  if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
  state.objectUrl = null;
  state.file = null;
  state.isStream = false; state.isRemote = false;
  state.cue = 0; state.cueSet = false; state.jogRotation = 0;
  $('platter' + deckId).style.setProperty('--jog-angle', '0deg');
  state.hotCues = Array(8).fill(null); state.tapTimes = [];
  state.loop = null;
  state.waveform = null;
  $('title' + deckId).textContent = 'No track loaded';
  $('filename' + deckId).textContent = 'Choose a music file from your device';
  $('duration' + deckId).textContent = '--:--';
  $('format' + deckId).textContent = 'LOCAL FILE';
  $('elapsed' + deckId).textContent = '00:00';
  $('remaining' + deckId).textContent = '--:--';
  $('seek' + deckId).disabled = false;
  $(`deck${deckId}`).querySelectorAll('[data-action="hotcue"], [data-action="loop"], [data-action="loop-off"], [data-action="cue"], [data-action="set-cue"]').forEach(control => control.disabled = false);
  $('seek' + deckId).value = '0';
  $('bpm' + deckId).textContent = '120 BPM*';
  $('loadStatus' + deckId).textContent = 'READY TO LOAD';
  $('state' + deckId).classList.remove('playing');
  $('state' + deckId).innerHTML = '<span class="state-dot"></span> EMPTY DECK';
  $('scopeStatus' + deckId).textContent = 'WAITING FOR TRACK';
  $('playText' + deckId).textContent = 'PLAY';
  $('playGlyph' + deckId).textContent = '▶';
  $('playGlyph' + deckId).parentElement.classList.remove('is-playing');
  $('platter' + deckId).classList.remove('spinning');
  $(`deck${deckId}`).querySelectorAll('[data-action="hotcue"]').forEach(button => button.classList.remove('set'));
  exitLoop(deckId);
  drawWaveform(deckId, null);
  toast(`Deck ${deckId} ejected.`);
}

function updateDeckUI(deckId) {
  const state = deckState[deckId];
  const audio = state.audio;
  const duration = audio.duration;
  if (!state.file) return;
  $('elapsed' + deckId).textContent = formatTime(audio.currentTime);
  $('remaining' + deckId).textContent = Number.isFinite(duration) ? formatTime(Math.max(0, duration - audio.currentTime)) : '--:--';
  if (Number.isFinite(duration) && duration > 0) {
    $('seek' + deckId).value = String(Math.round((audio.currentTime / duration) * 1000));
    $('platter' + deckId).setAttribute('aria-valuenow', $('seek' + deckId).value);
  }
  drawWaveform(deckId, state.waveform);
  if (state.loop && audio.currentTime >= state.loop.end - 0.025) audio.currentTime = state.loop.start;
}

async function addImportedTrack(file) {
  if (!(file instanceof Blob) || !file.name) throw new Error('Choose a valid audio file to add to the crate.');
  if (!file.type.startsWith('audio/') && !/\.(mp3|wav|m4a|aac|flac|ogg|opus|aiff?)$/i.test(file.name)) {
    throw new Error('This file type is not a supported audio track or sample.');
  }
  const existing = library.find(item => item.file.name === file.name && item.file.size === file.size);
  if (!existing) library.push({ file });
  renderLibrary();
  await storeTrack(file);
  updateCrateStatus(library.length + ' TRACK(S) SAVED ON THIS DEVICE');
  return true;
}

function addToLibrary(files) {
  let added = 0;
  for (const file of files) {
    if (!file.type.startsWith('audio/') && !/\.(mp3|wav|m4a|aac|flac|ogg|opus|aiff?)$/i.test(file.name)) continue;
    if (library.some(item => item.file.name === file.name && item.file.size === file.size)) continue;
    library.push({ file });
    added++;
    storeTrack(file).then(() => {
      updateCrateStatus(library.length + ' TRACK(S) SAVED ON THIS DEVICE');
    }).catch(error => {
      console.warn('Could not save this crate item:', file.name, error);
      updateCrateStatus('CRATE IMPORTED FOR THIS SESSION · DEVICE STORAGE COULD NOT SAVE ALL TRACKS');
    });
  }
  renderLibrary();
  if (added) toast(added + ' track(s) added. Saving this device crate…');
}

function renderLibrary() {
  const body = $('libraryRows');
  body.innerHTML = '';
  if (!library.length) {
    body.innerHTML = '<tr class="empty-row"><td colspan="4"><span class="empty-library-icon">♫</span><strong>Your crate is waiting.</strong><span>Add tracks here, then drag one onto either platter.</span></td></tr>';
    return;
  }
  library.forEach((item, index) => {
    const row = document.createElement('tr');
    row.draggable = true;
    row.dataset.trackIndex = String(index);
    row.title = 'Drag this track onto the Deck A or Deck B platter';
    row.addEventListener('dragstart', event => {
      event.dataTransfer?.setData('application/x-rolyfe-track', String(index));
      event.dataTransfer?.setData('text/plain', item.file.name);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
      row.classList.add('crate-dragging');
    });
    row.addEventListener('dragend', () => row.classList.remove('crate-dragging'));
    const name = document.createElement('td'); name.className = 'library-track-name'; name.textContent = item.file.name;
    const format = document.createElement('td'); format.className = 'library-track-format'; format.textContent = extensionOf(item.file.name);
    const size = document.createElement('td'); size.className = 'library-track-size'; size.textContent = formatSize(item.file.size);
    const actions = document.createElement('td');
    for (const deckId of ['A', 'B']) {
      const button = document.createElement('button');
      button.className = 'table-load';
      button.textContent = 'DECK ' + deckId;
      button.setAttribute('aria-label', 'Load ' + item.file.name + ' on Deck ' + deckId);
      button.addEventListener('click', () => loadFileIntoDeck(deckId, item.file));
      actions.appendChild(button);
    }
    row.append(name, format, size, actions);
    body.appendChild(row);
  });
}

function getPlatterAngle(platter, event) {
  const rect = platter.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  return Math.atan2(event.clientY - centerY, event.clientX - centerX);
}

function pointerDownJog(deckId, event) {
  const state = deckState[deckId];
  // The platter remains tactile and animated even with an empty deck.
  event.preventDefault();
  const platter = event.currentTarget;
  try { platter.setPointerCapture(event.pointerId); } catch (error) { /* Browser may already own capture. */ }
  const grooves = platter.querySelector('.platter-grooves');
  const renderedTransform = grooves ? getComputedStyle(grooves).transform : 'none';
  const matrixMatch = renderedTransform.startsWith('matrix(') ? renderedTransform.slice(7, -1) : '';
  if (matrixMatch) {
    const matrixValues = matrixMatch.split(',').map(Number);
    state.jogRotation = Math.atan2(matrixValues[1], matrixValues[0]) * (180 / Math.PI);
  }
  state.jogPointer = event.pointerId;
  state.jogLastAngle = getPlatterAngle(platter, event);
  state.jogLastTime = performance.now();
  state.jogLastEventAt = state.jogLastTime;
  state.jogLastMoveAt = state.jogLastTime;
  state.jogLastDelta = 0;
  state.jogScratchActive = platter.classList.contains('scratch-armed') && !!state.file && !state.isStream;
  state.jogBasePlaybackRate = state.audio.playbackRate || 1;
  state.jogBasePreservesPitch = state.audio.preservesPitch !== false;
  platter.classList.add('touching');
  if (state.jogScratchActive) platter.classList.add('scratch-touching');
  platter.style.setProperty('--jog-angle', state.jogRotation + 'deg');
}

function pointerMoveJog(deckId, event) {
  const state = deckState[deckId];
  if (state.jogPointer !== event.pointerId) return;
  const platter = event.currentTarget;
  const nextAngle = getPlatterAngle(platter, event);
  let deltaAngle = nextAngle - state.jogLastAngle;
  if (deltaAngle > Math.PI) deltaAngle -= Math.PI * 2;
  if (deltaAngle < -Math.PI) deltaAngle += Math.PI * 2;
  const now = performance.now();
  const elapsedMs = Math.max(8, now - (state.jogLastEventAt || now - 16));
  state.jogLastAngle = nextAngle;
  state.jogLastMoveAt = now;
  state.jogLastEventAt = now;
  // Filter small pointer jitter while keeping direction changes quick enough to feel tactile.
  const smoothDelta = state.jogLastDelta * 0.22 + deltaAngle * 0.78;
  state.jogLastDelta = smoothDelta;
  const audio = state.audio;
  const scratchActive = platter.classList.contains('scratch-armed') && !!state.file && !state.isStream;
  const secondsPerTurn = scratchActive ? 3.2 : 1.35;
  const trackDelta = smoothDelta * (secondsPerTurn / (Math.PI * 2));

  if (state.file && !state.isStream && Number.isFinite(audio.duration) && audio.duration > 0) {
    // With Scratch armed, the platter sends the playhead in either direction while
    // audio remains audible. Backward hand motion repositions the media playhead;
    // speed and pitch respond to the DJ's hand velocity for a tactile scratch/stutter.
    audio.currentTime = clamp(audio.currentTime + trackDelta, 0, Math.max(0, audio.duration - 0.02));
    if (scratchActive && !audio.paused) {
      const angularVelocity = Math.abs(smoothDelta) / elapsedMs;
      const handSpeed = clamp(0.42 + angularVelocity * 36, 0.35, 2.4);
      audio.preservesPitch = false;
      audio.playbackRate = clamp((state.jogBasePlaybackRate || 1) * handSpeed, 0.15, 3);
    }
  }
  state.jogRotation += smoothDelta * (180 / Math.PI);
  platter.style.setProperty('--jog-angle', state.jogRotation + 'deg');
  if (audio.paused && Number.isFinite(audio.duration)) updateDeckUI(deckId);
}

function pointerUpJog(deckId, event) {
  const state = deckState[deckId];
  if (state.jogPointer !== event.pointerId) return;
  state.jogPointer = null;
  event.currentTarget.classList.remove('touching', 'scratch-touching');
  if (state.jogScratchActive) {
    try { state.audio.preservesPitch = state.jogBasePreservesPitch; } catch (_) {}
    setTempo(deckId, $('tempo' + deckId).value);
  }
  state.jogScratchActive = false;
  state.jogLastDelta = 0;
  if (!state.audio.paused && state.audio.playbackRate !== state.jogBasePlaybackRate) {
    setTempo(deckId, $('tempo' + deckId).value);
  }
}
 
function bindCrateDragDrop() {
  document.querySelectorAll('.platter[data-deck]').forEach(platter => {
    const deckId = platter.dataset.deck;
    platter.addEventListener('dragenter', event => {
      event.preventDefault();
      platter.classList.add('drag-over');
    });
    platter.addEventListener('dragover', event => {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
      platter.classList.add('drag-over');
    });
    platter.addEventListener('dragleave', event => {
      if (!platter.contains(event.relatedTarget)) platter.classList.remove('drag-over');
    });
    platter.addEventListener('drop', event => {
      event.preventDefault();
      platter.classList.remove('drag-over');
      const starterTrackId = event.dataTransfer?.getData('application/x-rolyfe-starter-track');
      if (starterTrackId) {
        const starterCrate = window.ROLyfeStarterCrate;
        if (starterCrate?.loadToDeck) {
          starterCrate.loadToDeck(starterTrackId, deckId);
        } else {
          toast('Starter Crate is still starting. Try the drop again in a moment.');
        }
        return;
      }
      const trackIndex = Number(event.dataTransfer?.getData('application/x-rolyfe-track'));
      if (Number.isInteger(trackIndex) && trackIndex >= 0 && library[trackIndex]) {
        loadFileIntoDeck(deckId, library[trackIndex].file);
        return;
      }
      const droppedFile = event.dataTransfer?.files?.[0];
      if (droppedFile) {
        addToLibrary([droppedFile]);
        loadFileIntoDeck(deckId, droppedFile);
      }
    });
  });
}

function startRecording() {
  if (!deckState.A.file && !deckState.B.file) { toast('Load at least one track before recording the mix.'); return; }
  if (!engine.getRecordingStream() || !window.MediaRecorder) {
    toast('Mix recording is not supported by this browser. Try current Chrome or Edge.');
    return;
  }
  try {
    recordingChunks = [];
    const options = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? { mimeType: 'audio/webm;codecs=opus' } : undefined;
    recorder = new MediaRecorder(engine.getRecordingStream(), options);
    recorder.addEventListener('dataavailable', event => { if (event.data && event.data.size) recordingChunks.push(event.data); });
    recorder.addEventListener('stop', () => {
      const blob = new Blob(recordingChunks, { type: recorder.mimeType || 'audio/webm' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `RO’Lyfe-Mix-${new Date().toISOString().replace(/[:.]/g, '-')}.webm`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      $('recordButton').classList.remove('recording');
      $('recordLabel').textContent = 'REC BOTH DECKS';
      $('recordNote').textContent = 'BOTH DECKS SAVED TO DEVICE';
      toast('Mix recording saved as a WebM audio file.');
      recorder = null;
    });
    recorder.start(1000);
    recordingStartedAt = Date.now();
    $('recordButton').classList.add('recording');
    $('recordLabel').textContent = 'STOP RECORDING';
    $('recordNote').textContent = 'CAPTURING BOTH ACTIVE DECKS…';
    toast('Recording both active deck channels through the master mix.');
  } catch (error) {
    console.error(error);
    toast('Unable to start recording in this browser.');
  }
}

function stopRecording() {
  if (recorder && recorder.state !== 'inactive') recorder.stop();
}

function setupWheelSpinControls() {
  for (const deckId of ['A', 'B']) {
    const platter = $('platter' + deckId);
    const button = document.querySelector(`[data-action="wheel-spin"][data-deck="${deckId}"]`);
    let paused = false;
    try { paused = localStorage.getItem('rolyfe-wheel-spin-' + deckId) === 'paused'; } catch (_) {}
    platter.classList.toggle('spin-paused', paused);
    if (button) {
      button.setAttribute('aria-pressed', String(!paused));
      button.textContent = paused ? 'RESUME SPIN' : 'PAUSE SPIN';
      button.title = paused ? 'Resume decorative wheel rotation' : 'Pause decorative wheel rotation';
    }
  }
}

function bindEvents() {
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    const deckId = button.dataset.deck;
    if (action === 'load') { if (window.ROLyfeCratePicker) window.ROLyfeCratePicker.open(deckId); else $('file' + deckId).click(); }
    if (action === 'play') togglePlay(deckId);
    if (action === 'cue') goCue(deckId);
    if (action === 'set-cue') setCue(deckId);
    if (action === 'hotcue') useHotCue(deckId, Number(button.dataset.pad), event);
    if (action === 'loop') toggleLoop(deckId, Number(button.dataset.beats));
    if (action === 'loop-off') exitLoop(deckId);
    if (action === 'tempo-reset') { $('tempo' + deckId).value = '0'; setTempo(deckId, 0); }
    if (action === 'eject') ejectDeck(deckId);
    if (action === 'stop') { const s=deckState[deckId]; s.audio.pause(); try{s.audio.currentTime=0;}catch{} setDeckPlayingUI(deckId,false); }
    if (action === 'skip') { const s=deckState[deckId]; if(Number.isFinite(s.audio.duration)) s.audio.currentTime=Math.min(s.audio.duration, s.audio.currentTime+15); }
    if (action === 'sync') { const other=deckState[deckId==='A'?'B':'A']; if(!other.file||!deckState[deckId].file){toast('Load both decks before BPM Sync.');return;} if(other.isStream||deckState[deckId].isStream){toast('BPM Sync needs two track files, not a live radio stream.');return;} const targetRate=(other.bpm*other.audio.playbackRate)/Math.max(1,deckState[deckId].bpm); const percent=(targetRate-1)*100; if(targetRate>=0.84&&targetRate<=1.16){$('tempo'+deckId).value=String(percent);setTempo(deckId,percent);toast('Deck '+deckId+' tempo matched using the manual BPM values.');}else{toast('BPM gap is outside the ±16% tempo range.');} }
    if (action === 'bpm-edit') { const state=deckState[deckId]; const raw=window.prompt('Enter the track BPM (50–220):',String(state.bpm)); if(raw!==null){const value=Number(raw);if(Number.isFinite(value)&&value>=50&&value<=220){state.bpm=value;$('bpm'+deckId).textContent=value.toFixed(1)+' BPM';toast('Deck '+deckId+' BPM set to '+value.toFixed(1)+'.');}else toast('Enter a BPM between 50 and 220.');} }
    if (action === 'tap-bpm') { const state=deckState[deckId]; const now=performance.now(); state.tapTimes=(state.tapTimes||[]).filter(time=>now-time<2500); state.tapTimes.push(now); if(state.tapTimes.length>=3){const gaps=state.tapTimes.slice(1).map((time,i)=>time-state.tapTimes[i]);const average=gaps.reduce((a,b)=>a+b,0)/gaps.length;const bpm=60000/average;if(bpm>=50&&bpm<=220){state.bpm=bpm;$('bpm'+deckId).textContent=bpm.toFixed(1)+' BPM';toast('Tapped BPM: '+bpm.toFixed(1));}}else toast('Tap '+(3-state.tapTimes.length)+' more time(s) to measure BPM.'); }
    if (action === 'nudge-up' || action === 'nudge-down') { const input=$('tempo'+deckId); const next=clamp(Number(input.value)+(action==='nudge-up'?0.2:-0.2),-16,16); input.value=String(next); setTempo(deckId,next); }
    if (action === 'scratch-toggle') {
      const platter = $('platter' + deckId);
      const on = platter.classList.toggle('scratch-armed');
      button.classList.toggle('active', on);
      button.setAttribute('aria-pressed', String(on));
      button.textContent = on ? 'SCRATCH ON' : 'SCRATCH OFF';
      button.title = on ? 'Touch and move the platter both directions to scratch' : 'Touch and move the platter to jog and seek';
      if (!on && !deckState[deckId].audio.paused) setTempo(deckId, $('tempo' + deckId).value);
      toast(on
        ? (deckState[deckId].isStream ? 'Live radio cannot scratch. Load a local track on Deck ' + deckId + ' first.' : 'Deck ' + deckId + ' touch scratch is armed. Move the wheel forward and backward while the track plays.')
        : 'Deck ' + deckId + ' scratch mode is off. Jog and seek remain available.');
    }
    if (action === 'wheel-spin') {
      const platter = $('platter' + deckId);
      const paused = platter.classList.toggle('spin-paused');
      button.setAttribute('aria-pressed', String(!paused));
      button.textContent = paused ? 'RESUME SPIN' : 'PAUSE SPIN';
      button.title = paused ? 'Resume decorative wheel rotation' : 'Pause decorative wheel rotation';
      try { localStorage.setItem('rolyfe-wheel-spin-' + deckId, paused ? 'paused' : 'on'); } catch (_) {}
      toast(paused ? 'Deck ' + deckId + ' wheel animation paused. Audio and jog controls are unchanged.' : 'Deck ' + deckId + ' wheel animation resumed.');
    }
    if (action === 'radio') { document.getElementById('radio-studio').scrollIntoView({behavior:'smooth'}); document.getElementById('radioStreamUrl').focus({preventScroll:true}); }
  });

  for (const deckId of ['A', 'B']) {
    const state = deckState[deckId];
    const audio = state.audio;
    $('file' + deckId).addEventListener('change', event => {
      const file = event.target.files?.[0];
      if (file) loadFileIntoDeck(deckId, file);
      event.target.value = '';
    });
    audio.addEventListener('loadedmetadata', () => {
      if (state.isStream) {
        $('duration' + deckId).textContent = 'LIVE';
        $('remaining' + deckId).textContent = '--:--';
        $('format' + deckId).textContent = 'LIVE RADIO';
        $('loadStatus' + deckId).textContent = 'LIVE STREAM • SEEK / LOOP UNAVAILABLE';
        return;
      }
      $('duration' + deckId).textContent = formatTime(audio.duration);
      $('remaining' + deckId).textContent = formatTime(audio.duration);
      if (state.isRemote) {
        $('loadStatus' + deckId).textContent = 'REMOTE TRACK READY';
        return;
      }
      $('loadStatus' + deckId).textContent = 'ANALYZING WAVEFORM…';
      buildWaveform(deckId, state.file);
    });
    audio.addEventListener('timeupdate', () => updateDeckUI(deckId));
    audio.addEventListener('play', () => setDeckPlayingUI(deckId, true));
    audio.addEventListener('pause', () => {
      if (state.isStream) state.lastPauseAt = Date.now();
      setDeckPlayingUI(deckId, false);
    });
    audio.addEventListener('ended', () => { setDeckPlayingUI(deckId, false); if (state.loop) audio.currentTime = state.loop.start; });
    audio.addEventListener('error', () => {
      if (!state.file) return;
      if (state.isStream) {
        const status = $('radioStatus');
        if (status) status.textContent = 'STREAM INTERRUPTED · PRESS PLAY TO RECONNECT';
        toast('Live stream interrupted. Press PLAY to reconnect.');
      } else {
        toast(`Deck ${deckId}: this audio format could not be decoded by the browser.`);
      }
    });
    $('seek' + deckId).addEventListener('input', event => {
      if (Number.isFinite(audio.duration) && !state.isStream) audio.currentTime = (Number(event.target.value) / 1000) * audio.duration;
    });
    const wave = $('wave' + deckId);
    let wavePointerId = null;
    let waveStartTime = 0;
    let waveStartX = 0;
    let waveWidth = 1;
    const seekWave = event => {
      if (state.isStream || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
      const deltaX = (event.clientX - waveStartX) / waveWidth;
      audio.currentTime = clamp(waveStartTime + deltaX * 18, 0, audio.duration);
      updateDeckUI(deckId);
    };
    wave.addEventListener('pointerdown', event => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      if (state.isStream || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
      const rect = wave.getBoundingClientRect();
      wavePointerId = event.pointerId;
      waveStartX = event.clientX;
      waveWidth = Math.max(1, rect.width);
      const position = clamp((event.clientX - rect.left) / waveWidth, 0, 1);
      // Select the time under the initial touch point, then keep subsequent movement anchored there.
      waveStartTime = clamp(audio.currentTime + (position - 0.5) * 18, 0, audio.duration);
      try { wave.setPointerCapture(event.pointerId); } catch {}
      seekWave(event);
    });
    wave.addEventListener('pointermove', event => {
      if (wavePointerId === event.pointerId) seekWave(event);
    });
    const finishWaveSeek = event => {
      if (wavePointerId === event.pointerId) wavePointerId = null;
    };
    wave.addEventListener('pointerup', finishWaveSeek);
    wave.addEventListener('pointercancel', finishWaveSeek);
    $('tempo' + deckId).addEventListener('input', event => setTempo(deckId, event.target.value));
    $('platter' + deckId).addEventListener('pointerdown', event => pointerDownJog(deckId, event));
    $('platter' + deckId).addEventListener('pointermove', event => pointerMoveJog(deckId, event));
    $('platter' + deckId).addEventListener('pointerup', event => pointerUpJog(deckId, event));
    $('platter' + deckId).addEventListener('pointercancel', event => pointerUpJog(deckId, event));
    $('platter' + deckId).addEventListener('keydown', event => {
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        if (Number.isFinite(audio.duration)) audio.currentTime = clamp(audio.currentTime + (event.key === 'ArrowRight' ? 0.15 : -0.15), 0, audio.duration);
      }
    });
  }

  // EQ is now controlled by touch rotary dials in studio-upgrades.js.

  for (const deckId of ['A', 'B']) {
    $('filter' + deckId).addEventListener('input', event => {
      const value = Number(event.target.value);
      engine.setFilter(deckId, value);
      $('filterValue' + deckId).textContent = value === 50 ? 'NEUTRAL' : value < 50 ? 'LOW-PASS' : 'HIGH-PASS';
    });
    $('channel' + deckId).addEventListener('input', event => {
      const value = Number(event.target.value);
      engine.setChannelVolume(deckId, value);
      $('channelValue' + deckId).textContent = `${Math.round(value * 100)}%`;
      $('deckVolume' + deckId).value = String(value);
      $('deckVolumeValue' + deckId).textContent = `${Math.round(value * 100)}%`;
    });
    $('deckVolume' + deckId).addEventListener('input', event => {
      const value = Number(event.target.value);
      $('channel' + deckId).value = String(value);
      $('channel' + deckId).dispatchEvent(new Event('input', { bubbles:true }));
    });
    $('bass' + deckId).addEventListener('input', event => {
      const value = Number(event.target.value);
      engine.setEQ(deckId, 'low', value);
      const knob = $('knob-low-' + deckId);
      const min = -24, max = 6;
      const ratio = (value - min) / (max - min);
      if (knob) {
        knob.dataset.value = String(value);
        knob.style.setProperty('--knob-angle', (-135 + ratio * 270) + 'deg');
        knob.setAttribute('aria-valuenow', String(value));
      }
      $('low' + deckId).textContent = (value > 0 ? '+' : '') + value.toFixed(1) + ' dB';
      $('bassValue' + deckId).textContent = value === 0 ? '0 dB' : (value > 0 ? '+' : '') + value.toFixed(1) + ' dB';
    });
    $('trim' + deckId).addEventListener('input', event => {
      const value = Number(event.target.value);
      engine.setTrim(deckId, value);
      $('trimValue' + deckId).textContent = value === 0 ? '0 dB' : `${value > 0 ? '+' : ''}${value.toFixed(1)} dB`;
    });
  }

  $('crossfader').addEventListener('input', event => engine.setCrossfader(Number(event.target.value) / 100));
  $('centerCrossfader').addEventListener('click', () => { $('crossfader').value = '50'; engine.setCrossfader(0.5); });
  $('masterVolume').addEventListener('input', event => {
    const value = Number(event.target.value);
    engine.setMasterVolume(value);
    $('masterVolumeValue').textContent = `${Math.round(value * 100)}%`;
  });
  $('muteMaster').addEventListener('click', () => {
    const muted = engine.toggleMasterMute();
    $('muteMaster').textContent = muted ? 'UNMUTE MASTER' : 'MASTER MUTE';
    $('muteMaster').classList.toggle('muted', muted);
    toast(muted ? 'Master output muted.' : 'Master output restored.');
  });
  $('echoAmount').addEventListener('input', event => {
    const value = Number(event.target.value);
    engine.setEcho('A', value);
    engine.setEcho('B', value);
    $('echoValue').textContent = value === 0 ? 'OFF' : `${Math.round(value * 100)}%`;
  });
  $('recordButton').addEventListener('click', () => recorder ? stopRecording() : startRecording());
  $('restoreSessionButton')?.addEventListener('click', restoreLastSet);
  setupFocusMode();
  $('addLibraryButton').addEventListener('click', () => $('libraryFiles').click());
  $('libraryFiles').addEventListener('change', event => {
    addToLibrary(Array.from(event.target.files || []));
    event.target.value = '';
  });
  $('loadFirstButton').addEventListener('click', () => { if (window.ROLyfeCratePicker) window.ROLyfeCratePicker.open('A'); else $('fileA').click(); });
  bindCrateDragDrop();
}

function animateMeters() {
  const meter = engine.getMeter();
  $('masterMeter').style.width = `${Math.round(meter * 100)}%`;
  $('masterDb').textContent = meter > 0.001 ? `${(20 * Math.log10(meter / 2.6)).toFixed(1)} dBFS` : '— dB';
  const elapsed = Math.floor((performance.now() - sessionStartedAt) / 1000);
  $('sessionTimer').textContent = `${String(Math.floor(elapsed / 3600)).padStart(2, '0')}:${String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;
  const clock = $('studioDateTime');
  if (clock && Math.floor(performance.now() / 1000) !== lastClockSecond) {
    lastClockSecond = Math.floor(performance.now() / 1000);
    const now = new Date();
    const calendarDate = now.toLocaleDateString(undefined, { weekday:'long', month:'long', day:'numeric', year:'numeric' });
    const localTime = now.toLocaleTimeString(undefined, { hour:'numeric', minute:'2-digit' });
    clock.textContent = calendarDate + ' · ' + localTime;
  }
  requestAnimationFrame(animateMeters);
}

function initPWA() {
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(error => console.warn('Service worker not registered:', error));
    });
  }
}

window.ROLyfeStudio = { engine, deckState, library, loadFileIntoDeck, addImportedTrack, ejectDeck, togglePlay, setDeckPlayingUI, ensureAudio, toast, setTempo, drawWaveform, clearSavedDeck: removeSavedDeck };
setupMobileMixer();
bindEvents();
setupWheelSpinControls();
renderLibrary();
setAudioStatus(false);
// Restore the personal crate after first paint so stored audio cannot block entry.\nconst scheduleCrateRestore = () => restoreSavedCrate();\nif ('requestIdleCallback' in window) requestIdleCallback(scheduleCrateRestore, { timeout: 2500 });\nelse setTimeout(scheduleCrateRestore, 1200);
requestAnimationFrame(animateMeters);
// Service worker temporarily disabled while resolving startup hang.
window.addEventListener('beforeunload', () => {
  for (const state of Object.values(deckState)) if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
  if (recorder && recorder.state !== 'inactive') recorder.stop();
});