// RO’Lyfe DJ Studio — shared Batch 1 starter crate
// Hosted starter files are fetched on demand, then handed to the existing
// deck loader so IndexedDB persistence, waveforms and real audio routing remain shared.
(() => {
  'use strict';

  const MANIFEST_URL = './assets/starter-crate/manifest.json';
  const FALLBACK_TRACKS = [
    { id:'project-1', title:'R..O.L- PROJECT. 1.wav', format:'WAV', asset:'01-r-o-l-project-1.wav' },
    { id:'production-2', title:'R.O.L- PRODUCTION 2.wav', format:'WAV', asset:'02-r-o-l-production-2.wav' },
    { id:'project-one-staff', title:'R.O.L- PROJECT ONE STAFF.wav', format:'WAV', asset:'03-r-o-l-project-one-staff.wav' },
    { id:'rol-fest-1', title:'ROL FEST 1...%.wav', format:'WAV', asset:'04-rol-fest-1.wav' },
    { id:'rol-swfolder-1', title:'ROL-SWFOLDER 1.mp3', format:'MP3', asset:'05-rol-swfolder-1.mp3' },
    { id:'traffic-4', title:'TRAFFIC 4.mp3', format:'MP3', asset:'06-traffic-4.mp3' }
  ];

  const $ = (id) => document.getElementById(id);
  const formatBytes = (bytes) => {
    if (!Number.isFinite(bytes) || bytes <= 0) return '—';
    return bytes >= 1048576 ? (bytes / 1048576).toFixed(1) + ' MB' : Math.ceil(bytes / 1024) + ' KB';
  };

  let tracks = [];
  let readyCount = 0;

  function setStatus(message, tone = 'neutral') {
    const status = $('starterCrateStatus');
    if (!status) return;
    status.textContent = message;
    status.dataset.tone = tone;
  }

  function attachTouchDragHandle(handle, track) {
    let pointerId = null;
    let startX = 0;
    let startY = 0;
    let dragging = false;
    let ghost = null;
    let activePlatter = null;

    const clearDrag = () => {
      if (activePlatter) activePlatter.classList.remove('drag-over');
      activePlatter = null;
      ghost?.remove();
      ghost = null;
      dragging = false;
      pointerId = null;
    };

    handle.addEventListener('pointerdown', (event) => {
      // Mouse uses the native HTML drag path; touch and pen use this direct path.
      if (event.pointerType === 'mouse' || track.status !== 'ready') return;
      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      try { handle.setPointerCapture(pointerId); } catch (_) {}
      event.preventDefault();
    });

    handle.addEventListener('pointermove', (event) => {
      if (pointerId !== event.pointerId) return;
      const distance = Math.hypot(event.clientX - startX, event.clientY - startY);
      if (!dragging && distance >= 8) {
        dragging = true;
        ghost = document.createElement('div');
        ghost.className = 'starter-drag-ghost';
        ghost.textContent = '♫ ' + track.title;
        document.body.appendChild(ghost);
      }
      if (!dragging) return;
      event.preventDefault();
      if (ghost) {
        ghost.style.left = (event.clientX + 14) + 'px';
        ghost.style.top = (event.clientY + 14) + 'px';
      }
      const hit = document.elementFromPoint(event.clientX, event.clientY);
      const nextPlatter = hit?.closest?.('.platter[data-deck]') || null;
      if (activePlatter !== nextPlatter) {
        activePlatter?.classList.remove('drag-over');
        activePlatter = nextPlatter;
        activePlatter?.classList.add('drag-over');
      }
    });

    const finish = (event) => {
      if (pointerId !== event.pointerId) return;
      const hit = dragging ? document.elementFromPoint(event.clientX, event.clientY) : null;
      const platter = hit?.closest?.('.platter[data-deck]') || null;
      const deckId = platter?.dataset.deck;
      clearDrag();
      if (deckId === 'A' || deckId === 'B') loadToDeck(track, deckId);
    };
    handle.addEventListener('pointerup', finish);
    handle.addEventListener('pointercancel', clearDrag);
    handle.addEventListener('lostpointercapture', clearDrag);
  }

  function render() {
    const host = $('starterCrateRows');
    const count = $('starterCrateCount');
    if (!host) return;
    host.replaceChildren();
    if (count) count.textContent = readyCount + ' / ' + tracks.length + ' AUDIO FILES HOSTED';

    tracks.forEach((track) => {
      const row = document.createElement('article');
      row.className = 'starter-track';
      row.dataset.trackId = track.id;
      row.draggable = track.status === 'ready';
      row.title = row.draggable
        ? 'Drag this starter track onto Deck A or Deck B, or use a LOAD button.'
        : 'This starter track becomes draggable when its original audio file is hosted.';
      if (row.draggable) {
        row.addEventListener('dragstart', (event) => {
          event.dataTransfer?.setData('application/x-rolyfe-starter-track', track.id);
          event.dataTransfer?.setData('text/plain', track.title);
          if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
          row.classList.add('starter-dragging');
        });
        row.addEventListener('dragend', () => row.classList.remove('starter-dragging'));
      }

      const art = document.createElement('div');
      art.className = 'starter-track-art';
      art.textContent = '♫';
      if (track.status === 'ready') {
        art.classList.add('starter-track-drag-handle');
        art.setAttribute('role', 'button');
        art.setAttribute('tabindex', '0');
        art.setAttribute('aria-label', 'Drag ' + track.title + ' to Deck A or Deck B');
        attachTouchDragHandle(art, track);
      }

      const info = document.createElement('div');
      info.className = 'starter-track-info';
      const title = document.createElement('strong');
      title.textContent = track.title;
      const meta = document.createElement('span');
      meta.textContent = [track.format || 'AUDIO', track.size ? formatBytes(track.size) : 'BATCH 1'].join(' · ');
      if (track.status === 'ready') {
        const hint = document.createElement('small');
        hint.className = 'starter-drag-hint';
        hint.textContent = 'DRAG ICON TO A WHEEL · OR TAP LOAD';
        info.append(title, meta, hint);
      } else {
        info.append(title, meta);
      }
      const state = document.createElement('small');
      state.className = 'starter-track-state';
      state.textContent = track.statusText || 'CHECKING AUDIO FILE…';
      info.append(state);

      const actions = document.createElement('div');
      actions.className = 'starter-track-actions';
      for (const deckId of ['A', 'B']) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'starter-load-button';
        button.textContent = track.status === 'ready' ? 'LOAD TO ' + deckId : 'CHOOSE FILE · ' + deckId;
        button.disabled = track.status === 'checking';
        button.title = track.status === 'ready' ? 'Load the shared audio into Deck ' + deckId : 'Choose the original track file from this device to load into Deck ' + deckId;
        button.addEventListener('click', () => {
          if (track.status === 'ready') {
            loadToDeck(track, deckId, button);
            return;
          }
          // Shared hosting is not available yet; let DJs load their local copy.
          const picker = document.createElement('input');
          picker.type = 'file';
          picker.accept = 'audio/*,.mp3,.wav,.m4a,.aac,.flac,.ogg,.opus,.aiff';
          picker.addEventListener('change', async () => {
            const file = picker.files?.[0];
            if (!file) return;
            const studio = window.ROLyfeStudio;
            if (!studio?.loadFileIntoDeck) {
              setStatus('THE DECK AUDIO LOADER IS NOT READY. REFRESH THE STUDIO AND TRY AGAIN.', 'error');
              return;
            }
            try {
              setStatus('LOADING YOUR FILE TO DECK ' + deckId + '…');
              await studio.loadFileIntoDeck(deckId, file);
              setStatus(file.name + ' LOADED TO DECK ' + deckId + '. PRESS PLAY WHEN READY.', 'success');
            } catch (error) {
              setStatus('COULD NOT LOAD YOUR FILE: ' + error.message, 'error');
            }
          }, { once:true });
          picker.click();
        });
        actions.appendChild(button);
      }
      row.append(art, info, actions);
      host.appendChild(row);
    });
  }

  async function checkTrack(track) {
    try {
      const url = new URL(track.url, document.baseURI);
      if (url.origin !== location.origin) {
        track.status = 'blocked';
        track.statusText = 'STARTER FILE MUST USE THE APPROVED SAME-ORIGIN HOST';
        return;
      }
      const response = await fetch(url.href, { method: 'HEAD', cache: 'no-store' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const type = response.headers.get('content-type') || '';
      if (!type.startsWith('audio/') && !/\.(mp3|wav|m4a|ogg|flac|aiff)(\?|$)/i.test(url.pathname)) {
        throw new Error('The hosted file is not identified as audio');
      }
      track.size = Number(response.headers.get('content-length')) || 0;
      track.status = 'ready';
      track.statusText = 'READY · SHARED AUDIO AVAILABLE';
      readyCount++;
    } catch (error) {
      track.status = 'pending';
      track.statusText = 'AUDIO NOT PUBLISHED YET';
      track.error = error.message;
    }
  }

  async function loadToDeck(track, deckId, button = null) {
    const studio = window.ROLyfeStudio;
    if (!studio?.loadFileIntoDeck) {
      setStatus('THE DECK AUDIO LOADER IS NOT READY. REFRESH THE STUDIO AND TRY AGAIN.', 'error');
      return;
    }
    const originalText = button?.textContent || '';
    if (button) {
      button.disabled = true;
      button.textContent = 'FETCHING…';
    }
    setStatus('DOWNLOADING ' + track.title + ' FOR DECK ' + deckId + '…');
    try {
      const response = await fetch(track.url, { cache: 'no-store' });
      if (!response.ok) throw new Error('Audio download failed (HTTP ' + response.status + ').');
      const blob = await response.blob();
      if (!blob.size) throw new Error('The hosted audio file is empty.');
      const file = new File([blob], track.title, { type: blob.type || (track.format === 'MP3' ? 'audio/mpeg' : 'audio/wav'), lastModified: Date.now() });
      await studio.loadFileIntoDeck(deckId, file);
      setStatus(track.title + ' SENT TO DECK ' + deckId + '. PRESS PLAY WHEN READY.', 'success');
      track.statusText = 'READY · LAST SENT TO DECK ' + deckId;
      render();
    } catch (error) {
      console.error('Starter crate load failed:', error);
      setStatus('COULD NOT LOAD ' + track.title + ': ' + error.message, 'error');
      if (button) {
        button.disabled = false;
        button.textContent = originalText;
      }
    }
  }

  async function init() {
    if (!$('starterCrateRows')) return;
    try {
      const response = await fetch(MANIFEST_URL, { cache: 'no-store' });
      if (!response.ok) throw new Error('Starter crate manifest unavailable (HTTP ' + response.status + ').');
      const manifest = await response.json();
      if (!Array.isArray(manifest.tracks) || manifest.tracks.length !== 6) {
        throw new Error('Batch 1 manifest must contain exactly six track records.');
      }
      tracks = manifest.tracks.map((item) => ({
        ...item,
        url: new URL(item.asset, new URL('./assets/starter-crate/', document.baseURI)).href,
        format: item.format || (item.title.split('.').pop() || 'AUDIO').toUpperCase(),
        status: 'checking',
        statusText: 'CHECKING AUDIO FILE…'
      }));
      render();
      setStatus('CHECKING THE SIX SHARED BATCH 1 AUDIO FILES…');
      const checks = await Promise.all(tracks.map(checkTrack));
      render();
      if (readyCount === tracks.length) {
        setStatus('ALL SIX STARTER TRACKS ARE HOSTED AND READY ON THIS DEVICE.', 'success');
      } else if (readyCount > 0) {
        setStatus(readyCount + ' OF 6 STARTER TRACKS ARE HOSTED. THE REST ARE STILL WAITING FOR THEIR AUDIO FILES.', 'warning');
      } else {
        setStatus('THE SIX TRACKS ARE LISTED, BUT THEIR AUDIO FILES HAVE NOT BEEN DEPLOYED TO SHARED HOSTING YET.', 'warning');
      }
    } catch (error) {
      console.error('Starter crate could not initialize:', error);
      tracks = FALLBACK_TRACKS.map((item) => ({
        ...item,
        url: new URL(item.asset, new URL('./assets/starter-crate/', document.baseURI)).href,
        status: 'pending',
        statusText: 'AUDIO NOT PUBLISHED YET'
      }));
      render();
      setStatus('STARTER CRATE SETUP FOUND, BUT THE SHARED AUDIO MANIFEST COULD NOT BE READ: ' + error.message, 'error');
    }
  }

  // The platter drop handler calls this public bridge with the exact starter-track ID.
  window.ROLyfeStarterCrate = {
    loadToDeck(trackId, deckId) {
      const track = tracks.find((item) => item.id === trackId);
      if (!track || track.status !== 'ready') {
        setStatus('THAT STARTER TRACK IS NOT HOSTED YET. ADD ITS ORIGINAL AUDIO FILE FIRST.', 'warning');
        return;
      }
      if (deckId !== 'A' && deckId !== 'B') return;
      return loadToDeck(track, deckId);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
