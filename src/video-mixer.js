// RO’Lyfe DJ Studio — local video mixer and combined program recorder.
const studio = window.ROLyfeStudio;
const $v = (id) => document.getElementById(id);
const videoDecks = {
  A: { el: $v('videoA'), objectUrl: null, file: null, opacity: 1, bound: false },
  B: { el: $v('videoB'), objectUrl: null, file: null, opacity: 1, bound: false }
};
const canvas = $v('videoProgram');
const ctx = canvas.getContext('2d', { alpha: false });
let renderFrame = 0;
let fadeFrame = 0;
let videoRecorder = null;
let videoRecordingChunks = [];
let videoStream = null;

function videoToast(message) {
  if (studio?.toast) studio.toast(message);
  else console.info(message);
}
function clampVideo(value, min, max) { return Math.max(min, Math.min(max, value)); }
function syncFader(value) {
  const fader = $v('crossfader');
  fader.value = String(clampVideo(value, 0, 100));
  fader.dispatchEvent(new Event('input', { bubbles: true }));
}
function setVideoStatus() {
  const count = ['A','B'].filter(id => videoDecks[id].file).length;
  $v('videoStatus').textContent = count === 2 ? 'TWO VIDEO DECKS READY' : count === 1 ? 'ONE VIDEO DECK READY' : 'NO VIDEO DECKS LOADED';
  $v('programPlaceholder').classList.toggle('hidden', count > 0);
}
function drawContain(video, alpha) {
  if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight || alpha <= 0) return;
  const cw = canvas.width, ch = canvas.height;
  const scale = Math.min(cw / video.videoWidth, ch / video.videoHeight);
  const w = video.videoWidth * scale, h = video.videoHeight * scale;
  const x = (cw - w) / 2, y = (ch - h) / 2;
  ctx.globalAlpha = alpha;
  ctx.drawImage(video, x, y, w, h);
}
function renderProgram() {
  const A = videoDecks.A, B = videoDecks.B;
  const hasA = !!A.file, hasB = !!B.file;
  const fader = Number($v('crossfader').value) / 100;
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#030404';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (hasA && hasB) {
    ctx.globalCompositeOperation = 'lighter';
    drawContain(A.el, (1 - fader) * A.opacity);
    drawContain(B.el, fader * B.opacity);
    ctx.globalCompositeOperation = 'source-over';
  } else if (hasA) {
    drawContain(A.el, A.opacity);
  } else if (hasB) {
    drawContain(B.el, B.opacity);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  // Avoid a permanent full-size canvas animation while the video mixer is idle.
  if (hasA || hasB || (videoRecorder && videoRecorder.state !== 'inactive')) {
    renderFrame = requestAnimationFrame(renderProgram);
  } else {
    renderFrame = 0;
  }
}
function syncVideoToAudio(deckId) {
  const video = videoDecks[deckId].el;
  const audio = studio.deckState[deckId].audio;
  if (!videoDecks[deckId].file || !video) return;
  if (!audio.paused && !audio.ended) {
    if (video.paused) video.play().catch(() => {});
    if (Number.isFinite(audio.currentTime) && Number.isFinite(video.currentTime) && Math.abs(video.currentTime - audio.currentTime) > 0.35) {
      try { video.currentTime = audio.currentTime; } catch {}
    }
  } else if (!video.paused) {
    video.pause();
  }
}
function bindAudioVideoSync(deckId) {
  if (videoDecks[deckId].bound) return;
  videoDecks[deckId].bound = true;
  const audio = studio.deckState[deckId].audio;
  audio.addEventListener('play', () => {
    const video = videoDecks[deckId].el;
    if (videoDecks[deckId].file) video.play().catch(() => {});
  });
  audio.addEventListener('pause', () => {
    const video = videoDecks[deckId].el;
    if (videoDecks[deckId].file) video.pause();
  });
  audio.addEventListener('timeupdate', () => syncVideoToAudio(deckId));
  audio.addEventListener('ratechange', () => {
    const video = videoDecks[deckId].el;
    if (videoDecks[deckId].file) video.playbackRate = audio.playbackRate;
  });
  audio.addEventListener('ended', () => {
    const video = videoDecks[deckId].el;
    if (videoDecks[deckId].file) video.pause();
  });
}
async function loadVideoDeck(deckId, file) {
  if (!file) return;
  if (!file.type.startsWith('video/') && !/\.(mp4|mov|webm|m4v|ogv)$/i.test(file.name)) {
    videoToast('Choose a video file such as MP4 or WebM.');
    return;
  }
  const deck = videoDecks[deckId];
  if (deck.objectUrl) URL.revokeObjectURL(deck.objectUrl);
  deck.file = file;
  deck.objectUrl = URL.createObjectURL(file);
  deck.el.pause();
  deck.el.muted = true;
  deck.el.src = deck.objectUrl;
  deck.el.load();
  $v('videoName' + deckId).textContent = file.name;
  $v('videoEmpty' + deckId).classList.add('hidden');
  deck.opacity = Number($v('videoOpacity' + deckId).value);
  bindAudioVideoSync(deckId);
  // The same local media file is also assigned to the matching audio deck.
  // If the browser cannot decode audio from this video container, the visual deck remains usable.
  await studio.loadFileIntoDeck(deckId, file);
  deck.el.addEventListener('loadedmetadata', () => {
    const audio = studio.deckState[deckId].audio;
    if (Number.isFinite(audio.duration) && Number.isFinite(deck.el.duration) && Math.abs(audio.duration - deck.el.duration) > 0.75) {
      $v('videoStatus').textContent = 'VIDEO READY • AUDIO / VIDEO DURATIONS DIFFER';
    }
  }, { once: true });
  setVideoStatus();
  if (!renderFrame) renderProgram();
  videoToast('Video Deck ' + deckId + ' loaded. Use the matching deck PLAY button to start picture and audio together.');
}
async function toggleVideoDeck(deckId) {
  const video = videoDecks[deckId].el;
  if (!videoDecks[deckId].file) {
    videoToast('Load a video file on Deck ' + deckId + ' first.');
    return;
  }
  const audio = studio.deckState[deckId].audio;
  if (!audio.paused && !audio.ended) {
    audio.pause();
    video.pause();
    studio.setDeckPlayingUI(deckId, false);
    return;
  }
  try {
    await studio.ensureAudio();
    if (studio.deckState[deckId].file) {
      try {
        await audio.play();
        studio.setDeckPlayingUI(deckId, true);
      } catch {
        // A silent or unsupported audio track must not prevent a muted visual preview.
        await video.play();
        videoToast('Video preview playing. The audio stream in this video could not be routed through the DJ deck.');
      }
    } else {
      await video.play();
      videoToast('Video preview playing without a deck audio track.');
    }
  } catch (error) {
    videoToast(error.message || 'Could not start video playback.');
  }
}
function setCut(deckId) {
  syncFader(deckId === 'A' ? 0 : 100);
}
function autoFadeVideo() {
  if (fadeFrame) {
    cancelAnimationFrame(fadeFrame);
    fadeFrame = 0;
    $v('videoAutoFade').textContent = 'AUTO FADE';
    videoToast('Video fade cancelled. Manual crossfader control restored.');
    return;
  }
  const A = videoDecks.A.file, B = videoDecks.B.file;
  if (!A || !B) {
    videoToast('Load a video on both decks to use Auto Fade.');
    return;
  }
  const start = Number($v('crossfader').value);
  const end = start <= 50 ? 100 : 0;
  const duration = Number($v('videoFadeDuration').value) * 1000;
  const began = performance.now();
  $v('videoAutoFade').textContent = 'CANCEL FADE';
  const tick = now => {
    const t = clampVideo((now - began) / duration, 0, 1);
    const eased = t * t * (3 - 2 * t);
    syncFader(start + (end - start) * eased);
    if (t < 1) fadeFrame = requestAnimationFrame(tick);
    else {
      fadeFrame = 0;
      $v('videoAutoFade').textContent = 'AUTO FADE';
      videoToast('Video fade complete. The audio crossfader followed the picture transition.');
    }
  };
  fadeFrame = requestAnimationFrame(tick);
}
async function startVideoRecording() {
  if (!videoDecks.A.file && !videoDecks.B.file) {
    videoToast('Load at least one video before recording the program mix.');
    return;
  }
  if (!canvas.captureStream || !window.MediaRecorder) {
    videoToast('This browser does not support combined video recording. Try current desktop Chrome or Edge.');
    return;
  }
  try {
    await studio.ensureAudio();
    const pictureStream = canvas.captureStream(30);
    const soundStream = studio.engine.getRecordingStream();
    const tracks = [...pictureStream.getVideoTracks(), ...(soundStream?.getAudioTracks() || [])];
    if (!tracks.some(track => track.kind === 'audio')) {
      pictureStream.getTracks().forEach(track => track.stop());
      videoToast('The master audio path is not ready. Load or start an audio deck first.');
      return;
    }
    videoStream = new MediaStream(tracks);
    const mimeTypes = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
    const mimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type));
    videoRecordingChunks = [];
    videoRecorder = new MediaRecorder(videoStream, mimeType ? { mimeType } : undefined);
    videoRecorder.addEventListener('dataavailable', event => {
      if (event.data && event.data.size) videoRecordingChunks.push(event.data);
    });
    videoRecorder.addEventListener('stop', () => {
      const blob = new Blob(videoRecordingChunks, { type: videoRecorder?.mimeType || 'video/webm' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'RO’Lyfe-Video-Mix-' + new Date().toISOString().replace(/[:.]/g, '-') + '.webm';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      videoStream?.getTracks().forEach(track => track.stop());
      videoStream = null;
      videoRecorder = null;
      $v('videoRecordButton').classList.remove('recording');
      $v('videoRecordLabel').textContent = 'REC VIDEO + DECK MIX';
      videoToast('Combined video and master audio mix downloaded as WebM.');
    });
    videoRecorder.start(1000);
    $v('videoRecordButton').classList.add('recording');
    $v('videoRecordLabel').textContent = 'STOP VIDEO REC';
    videoToast('Recording the blended video program and master audio.');
  } catch (error) {
    console.error(error);
    videoToast(error.message || 'Could not start combined video recording.');
  }
}
function stopVideoRecording() {
  if (videoRecorder && videoRecorder.state !== 'inactive') videoRecorder.stop();
}
function bindVideoEvents() {
  for (const id of ['A','B']) {
    $v('videoLoad' + id).addEventListener('click', () => $v('videoFile' + id).click());
    $v('videoFile' + id).addEventListener('change', event => {
      const file = event.target.files?.[0];
      if (file) loadVideoDeck(id, file);
      event.target.value = '';
    });
    $v('videoPlay' + id).addEventListener('click', () => toggleVideoDeck(id));
    $v('videoOpacity' + id).addEventListener('input', event => {
      videoDecks[id].opacity = Number(event.target.value);
    });
  }
  $v('videoCutA').addEventListener('click', () => setCut('A'));
  $v('videoCutB').addEventListener('click', () => setCut('B'));
  $v('videoAutoFade').addEventListener('click', autoFadeVideo);
  $v('videoFullscreen').addEventListener('click', async () => {
    const target = $v('programMonitorWrap');
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await target.requestFullscreen();
    } catch { videoToast('Fullscreen is not available in this browser.'); }
  });
  $v('videoRecordButton').addEventListener('click', () => videoRecorder ? stopVideoRecording() : startVideoRecording());
  $v('crossfader').addEventListener('input', () => {});
  window.addEventListener('beforeunload', () => {
    Object.values(videoDecks).forEach(deck => {
      deck.el.pause();
      if (deck.objectUrl) URL.revokeObjectURL(deck.objectUrl);
    });
    if (videoRecorder && videoRecorder.state !== 'inactive') videoRecorder.stop();
    if (renderFrame) cancelAnimationFrame(renderFrame);
    if (fadeFrame) cancelAnimationFrame(fadeFrame);
  });
  renderProgram();
  setVideoStatus();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindVideoEvents, { once: true });
else bindVideoEvents();
