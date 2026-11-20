// RO’Lyfe — appearance, side FX drawer and local sample-bank controls.
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const studio = window.ROLyfeStudio;
  const themes = ['golden-signature','midnight-blue','ocean-teal','violet-pulse','crimson-club','arctic-silver'];

  function applyTheme(theme) {
    const chosen = themes.includes(theme) ? theme : 'golden-signature';
    document.body.dataset.theme = chosen;
    try { localStorage.setItem('goldensteal-studio-theme', chosen); } catch (_) {}
    const meta = document.querySelector('meta[name="theme-color"]');
    const colors = {
      'golden-signature':'#090909','midnight-blue':'#071426','ocean-teal':'#062324',
      'violet-pulse':'#170d27','crimson-club':'#240d13','arctic-silver':'#101820'
    };
    if (meta) meta.content = colors[chosen];
    document.querySelectorAll('[data-theme-choice]').forEach(button => {
      const active = button.dataset.themeChoice === chosen;
      button.classList.toggle('selected', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function setupThemePicker() {
    let saved = 'golden-signature';
    try { saved = localStorage.getItem('goldensteal-studio-theme') || saved; } catch (_) {}
    applyTheme(saved);
    document.querySelectorAll('[data-theme-choice]').forEach(button => {
      button.addEventListener('click', () => {
        applyTheme(button.dataset.themeChoice);
        $('studioThemeMenu')?.removeAttribute('open');
      });
    });
  }

  function setupChannelsMenu() {
    const button = $('moreChannelsButton');
    const panel = $('moreChannelsPanel');
    if (!button || !panel) return;
    button.addEventListener('click', () => {
      const open = panel.hidden;
      panel.hidden = !open;
      button.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', event => {
      if (!event.target.closest('#moreChannelsButton') && !event.target.closest('#moreChannelsPanel')) {
        panel.hidden = true;
        button.setAttribute('aria-expanded', 'false');
      }
    });
  }

  function setupQuickGoMenu() {
    const menu = $('quickGoMenu');
    if (!menu) return;
    menu.querySelectorAll('[data-go-to]').forEach(button => {
      button.addEventListener('click', () => {
        const target = button.dataset.goTo;
        menu.open = false;
        if (target === 'fx') {
          $('fxDrawerToggle')?.click();
          return;
        }
        if (target === 'coach') {
          $('topDjGuideButton')?.click();
          return;
        }
        const element = $(target);
        if (!element) return;
        const deckPanel = $('deckWorkspace');
        const cratePanel = $('crate-dock');
        if (element.closest('#deckWorkspace') && deckPanel) deckPanel.open = true;
        if (element.closest('#crate-dock') && cratePanel) cratePanel.open = true;
        requestAnimationFrame(() => element.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        element.classList.add('quick-go-target');
        window.setTimeout(() => element.classList.remove('quick-go-target'), 1400);
      });
    });
    document.addEventListener('click', event => {
      if (!event.target.closest('#quickGoMenu')) menu.open = false;
    });
  }

  function setupDrawer() {
    const panel = $('fxDrawerPanel');
    const scrim = $('fxDrawerScrim');
    const toggle = $('fxDrawerToggle');
    const close = $('fxDrawerClose');
    const open = () => {
      panel?.classList.add('open');
      scrim?.classList.add('open');
      panel?.setAttribute('aria-hidden', 'false');
      toggle?.setAttribute('aria-expanded', 'true');
    };
    const shut = () => {
      panel?.classList.remove('open');
      scrim?.classList.remove('open');
      panel?.setAttribute('aria-hidden', 'true');
      toggle?.setAttribute('aria-expanded', 'false');
    };
    toggle?.addEventListener('click', open);
    close?.addEventListener('click', shut);
    scrim?.addEventListener('click', shut);
    $('deckJumpButton')?.addEventListener('click', () => {
      shut();
      const deckPanel = $('deckWorkspace');
      if (deckPanel) deckPanel.open = true;
      requestAnimationFrame(() => $('decks')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') shut(); });
  }

  const SAMPLE_DB = 'goldensteal-fx-sample-bank';
  let dbPromise = null;
  const decodedBuffers = new Map();
  let slotRecords = new Map();

  function openSampleDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(SAMPLE_DB, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('samples')) {
          request.result.createObjectStore('samples', { keyPath: 'slot' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Sample storage is unavailable.'));
    });
    return dbPromise;
  }

  async function readSamples() {
    const db = await openSampleDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('samples', 'readonly');
      const request = tx.objectStore('samples').getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error || new Error('Could not read saved samples.'));
    });
  }

  async function storeSample(slot, file) {
    const db = await openSampleDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('samples', 'readwrite');
      tx.objectStore('samples').put({ slot, name: file.name, type: file.type || 'audio/*', blob: file, savedAt: Date.now() });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('Could not save this sample.'));
      tx.onabort = () => reject(tx.error || new Error('Sample save was interrupted.'));
    });
  }

  async function decodeSample(record) {
    if (decodedBuffers.has(record.slot)) return decodedBuffers.get(record.slot);
    await studio.ensureAudio();
    const context = studio.engine.context;
    const bytes = await record.blob.arrayBuffer();
    const buffer = await context.decodeAudioData(bytes.slice(0));
    decodedBuffers.set(record.slot, buffer);
    return buffer;
  }

  async function playSample(slot) {
    const record = slotRecords.get(slot);
    if (!record) return;
    try {
      await studio.ensureAudio();
      const context = studio.engine.context;
      const buffer = await decodeSample(record);
      const source = context.createBufferSource();
      const gain = context.createGain();
      const volume = Number($('fxOutputVolume')?.value ?? 0.8);
      gain.gain.value = Math.max(0, Math.min(1, volume));
      source.buffer = buffer;
      source.connect(gain);
      gain.connect(studio.engine.master);
      source.start();
      $('fxSampleStatus') && ($('fxSampleStatus').textContent = 'PLAYING · ' + record.name);
    } catch (error) {
      studio.toast?.('Sample could not play: ' + (error.message || 'unsupported audio format'));
    }
  }

  function renderSamplePads() {
    const host = $('fxSampleGrid');
    if (!host) return;
    host.replaceChildren();
    for (let slot = 1; slot <= 8; slot++) {
      const record = slotRecords.get(slot);
      const card = document.createElement('article');
      card.className = 'fx-sample-slot' + (record ? ' is-loaded' : '');
      const number = document.createElement('span');
      number.className = 'fx-sample-number';
      number.textContent = 'PAD ' + slot;
      const title = document.createElement('strong');
      title.textContent = record ? record.name : 'EMPTY SAMPLE';
      title.title = title.textContent;
      const play = document.createElement('button');
      play.type = 'button';
      play.textContent = '▶ PLAY';
      play.disabled = !record;
      play.addEventListener('click', () => playSample(slot));
      const load = document.createElement('button');
      load.type = 'button';
      load.textContent = record ? 'REPLACE' : '＋ LOAD';
      load.addEventListener('click', () => chooseSample(slot));
      card.append(number, title, play, load);
      host.appendChild(card);
    }
  }

  function chooseSample(slot) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*,.mp3,.wav,.m4a,.ogg,.flac,.aiff';
    // Keep the input attached while the Android picker is open; some mobile
    // browsers ignore click() on a detached file input.
    input.style.cssText = 'position:fixed;left:-10000px;top:0;width:1px;height:1px;opacity:0;';
    document.body.appendChild(input);
    const cleanup = () => input.remove();
    input.addEventListener('cancel', cleanup, { once: true });
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) { cleanup(); return; }
      try {
        await storeSample(slot, file);
        slotRecords.set(slot, { slot, name: file.name, type: file.type, blob: file });
        decodedBuffers.delete(slot);
        try { await studio.addImportedTrack(file); } catch (error) { console.warn('Sample not added to My Crate:', error); }
        renderSamplePads();
        studio.toast?.('Saved ' + file.name + ' to Sample Pad ' + slot + ' and My Crate.');
      } catch (error) {
        studio.toast?.(error.message || 'Could not save sample.');
      } finally {
        cleanup();
      }
    }, { once: true });
    input.click();
  }

  function setupFxVolume() {
    const slider = $('fxOutputVolume');
    const output = $('fxOutputVolumeValue');
    let saved = '0.8';
    try { saved = localStorage.getItem('goldensteal-fx-volume') || saved; } catch (_) {}
    if (slider) slider.value = saved;
    if (output && slider) output.textContent = Math.round(Number(slider.value) * 100) + '%';
    slider?.addEventListener('input', () => {
      try { localStorage.setItem('goldensteal-fx-volume', slider.value); } catch (_) {}
      if (output) output.textContent = Math.round(Number(slider.value) * 100) + '%';
    });
  }

  async function initSamples() {
    if (!studio) return;
    try {
      const records = await readSamples();
      slotRecords = new Map(records.map(record => [record.slot, record]));
      renderSamplePads();
    } catch (error) {
      const host = $('fxSampleGrid');
      if (host) host.textContent = 'Sample storage is not available in this browser.';
    }
  }

  function bind() {
    setupThemePicker();
    setupChannelsMenu();
    setupQuickGoMenu();
    setupDrawer();
    setupFxVolume();
    $('fxAddSamples')?.addEventListener('click', () => $('fxSampleFiles')?.click());
    $('fxSampleFiles')?.addEventListener('change', async event => {
      const files = Array.from(event.target.files || []);
      for (const file of files) {
        try { await addNextSample(file); }
        catch (error) { studio.toast?.(error.message || 'Could not save sample.'); }
      }
      event.target.value = '';
    });
    initSamples();
  }

  async function chooseNextSamples() {
    const files = Array.from($('fxSampleFiles')?.files || []);
    if (files.length) {
      for (const file of files) await addNextSample(file);
      $('fxSampleFiles').value = '';
      return;
    }
    $('fxSampleFiles')?.click();
  }

  async function addNextSample(file) {
    let slot = 1;
    while (slotRecords.has(slot) && slot <= 8) slot++;
    if (slot > 8) slot = 1;
    await storeSample(slot, file);
    slotRecords.set(slot, { slot, name: file.name, type: file.type, blob: file });
    decodedBuffers.delete(slot);
    try { await studio.addImportedTrack(file); } catch (error) { console.warn('Sample not added to My Crate:', error); }
    renderSamplePads();
    studio.toast?.('Saved ' + file.name + ' to Sample Pad ' + slot + ' and My Crate.');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });
  else bind();
})();