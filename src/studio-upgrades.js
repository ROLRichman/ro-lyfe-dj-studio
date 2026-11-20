// RO’Lyfe DJ Studio — Foundation 02 enhancements
// No private API keys are stored in this browser application.
const $x = (id) => document.getElementById(id);
const studio = window.ROLyfeStudio;

function clampX(value, min, max) { return Math.max(min, Math.min(max, value)); }
function showMessage(message) { if (studio?.toast) studio.toast(message); else console.info(message); }

function renderKnob(el, value) {
  const min = Number(el.getAttribute('aria-valuemin') || -24);
  const max = Number(el.getAttribute('aria-valuemax') || 6);
  const val = clampX(Number(value), min, max);
  const ratio = (val - min) / (max - min);
  el.dataset.value = String(val);
  el.style.setProperty('--knob-angle', `${-135 + ratio * 270}deg`);
  el.setAttribute('aria-valuenow', String(val));
  const band = el.dataset.knob;
  const deck = el.dataset.deck;
  const output = $x(`${band}${deck}`);
  if (output) output.textContent = `${val > 0 ? '+' : ''}${val.toFixed(1)} dB`;
  if (band === 'low') {
    const quickBass = $x(`bass${deck}`);
    const quickBassValue = $x(`bassValue${deck}`);
    if (quickBass) quickBass.value = String(val);
    if (quickBassValue) quickBassValue.textContent = val === 0 ? '0 dB' : `${val > 0 ? '+' : ''}${val.toFixed(1)} dB`;
  }
  if (studio?.engine) studio.engine.setEQ(deck, band, val);
}

function setupRotaryKnobs() {
  document.querySelectorAll('.rotary-knob[data-knob]').forEach(el => {
    renderKnob(el, Number(el.dataset.value || 0));
    let pointerId = null;
    let startY = 0;
    let startValue = 0;
    el.addEventListener('pointerdown', event => {
      pointerId = event.pointerId; startY = event.clientY; startValue = Number(el.dataset.value || 0);
      try { el.setPointerCapture(pointerId); } catch {}
      el.classList.add('turning'); event.preventDefault();
    });
    el.addEventListener('pointermove', event => {
      if (pointerId !== event.pointerId) return;
      const min = Number(el.getAttribute('aria-valuemin') || -24);
      const max = Number(el.getAttribute('aria-valuemax') || 6);
      renderKnob(el, startValue + (startY - event.clientY) * ((max - min) / 112));
    });
    const finish = event => { if (pointerId !== null && event.pointerId === pointerId) { pointerId = null; el.classList.remove('turning'); } };
    el.addEventListener('pointerup', finish); el.addEventListener('pointercancel', finish);
    el.addEventListener('keydown', event => {
      if (!['ArrowUp','ArrowRight','ArrowDown','ArrowLeft','Home','End'].includes(event.key)) return;
      event.preventDefault();
      const min = Number(el.getAttribute('aria-valuemin') || -24);
      const max = Number(el.getAttribute('aria-valuemax') || 6);
      const now = Number(el.dataset.value || 0);
      renderKnob(el, event.key === 'Home' ? min : event.key === 'End' ? max : now + (['ArrowUp','ArrowRight'].includes(event.key) ? 1 : -1));
    });
    el.addEventListener('wheel', event => {
      event.preventDefault();
      renderKnob(el, Number(el.dataset.value || 0) + (event.deltaY < 0 ? 1 : -1));
    }, {passive:false});
  });
}

function setDeckUiForRemote(deckId, title, sourceLabel, durationLabel) {
  const state = studio.deckState[deckId];
  const audio = state.audio;
  state.cue = 0; state.cueSet = false; state.jogRotation = 0; state.hotCues = Array(8).fill(null); state.loop = null;
  $x('platter' + deckId).style.setProperty('--jog-angle', '0deg');
  $x('title' + deckId).textContent = title;
  $x('filename' + deckId).textContent = sourceLabel;
  $x('format' + deckId).textContent = state.isStream ? 'LIVE RADIO' : 'FREE TO USE';
  $x('duration' + deckId).textContent = durationLabel || 'LIVE';
  $x('loadStatus' + deckId).textContent = state.isStream ? 'LIVE STREAM • NO TRACK SEEK' : 'REMOTE TRACK READY';
  $x('state' + deckId).innerHTML = '<span class="state-dot"></span> READY TO PLAY';
  $x('state' + deckId).classList.remove('playing');
  $x('scopeStatus' + deckId).textContent = state.isStream ? 'LIVE STREAM' : 'REMOTE TRACK READY';
  $x('playText' + deckId).textContent = 'PLAY'; $x('playGlyph' + deckId).textContent = '▶';
  $x('play' + deckId).classList.remove('is-playing');
  $x('seek' + deckId).disabled = state.isStream;
  document.querySelectorAll(`#deck${deckId} [data-action="hotcue"], #deck${deckId} [data-action="loop"], #deck${deckId} [data-action="loop-off"], #deck${deckId} [data-action="cue"], #deck${deckId} [data-action="set-cue"]`).forEach(control => control.disabled = state.isStream);
  $x('seek' + deckId).value = '0';
  document.querySelectorAll(`#deck${deckId} [data-action="hotcue"]`).forEach(btn => btn.classList.remove('set'));
  if (Number.isFinite(audio.duration) && audio.duration > 0) {
    $x('remaining' + deckId).textContent = formatSeconds(audio.duration);
  } else {
    $x('remaining' + deckId).textContent = '--:--';
  }
  $x('elapsed' + deckId).textContent = '00:00';
}

function formatSeconds(seconds) {
  if (!Number.isFinite(seconds)) return '--:--';
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total/60)}:${String(total%60).padStart(2,'0')}`;
}

async function loadRadioToDeck(deckId) {
  const raw = ($x('radioStreamUrl').value || '').trim();
  const name = ($x('radioStationName').value || 'Live Radio').trim();
  let url;
  try { url = new URL(raw); } catch { showMessage('Enter a valid radio stream URL.'); return; }
  if (url.protocol !== 'https:') { showMessage('Use an HTTPS stream on the secure RO’Lyfe website.'); return; }
  const state = studio.deckState[deckId];
  try {
    await studio.clearSavedDeck?.(deckId);
    await studio.ensureAudio();
    state.audio.pause();
    if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
    state.objectUrl = null;
    state.isStream = true; state.isRemote = false;
    state.streamUrl = url.href;
    state.lastPauseAt = 0;
    state.file = { name: name + '.live-stream', size: 0, type: 'audio/mpeg', stream: true };
    state.cue = 0; state.hotCues = Array(8).fill(null); state.tapTimes = []; state.loop = null; state.waveform = null;
    state.audio.crossOrigin = 'anonymous';
    state.audio.src = url.href;
    state.audio.load();
    studio.engine.attachDeck(deckId, state.audio);
    studio.engine.setTrim(deckId, Number($x('trim' + deckId).value));
    $x('deckVolume' + deckId).value = $x('channel' + deckId).value;
    $x('deckVolumeValue' + deckId).textContent = Math.round(Number($x('channel' + deckId).value) * 100) + '%';
    const values = { low:0, mid:0, high:0 };
    for (const [band,value] of Object.entries(values)) { studio.engine.setEQ(deckId,band,value); const knob=$x('knob-'+band+'-'+deckId); if(knob) renderKnob(knob,value); }
    studio.engine.setFilter(deckId, Number($x('filter'+deckId).value));
    studio.engine.setChannelVolume(deckId, Number($x('channel'+deckId).value));
    setDeckUiForRemote(deckId, name, url.hostname + url.pathname, 'LIVE');
    drawEmptyWave(deckId);
    $x('radioStatus').textContent = `STREAM ASSIGNED TO DECK ${deckId}`;
    showMessage(`Radio stream loaded on Deck ${deckId}. Press PLAY to start it.`);
  } catch (error) {
    console.error(error);
    $x('radioStatus').textContent = 'STREAM LOAD FAILED';
    showMessage(error.message || 'Could not load this stream. Confirm it is a direct audio stream URL.');
  }
}

function drawEmptyWave(deckId) {
  studio.drawWaveform(deckId, null);
}

let freeTracks = [];
function trackArtist(track) {
  return (track.artists || []).map(pair => Array.isArray(pair) ? pair[1]?.name : pair?.name).filter(Boolean).join(', ') || 'Independent artist';
}
function renderFreeTracks(tracks) {
  const host = $x('musicResults'); host.innerHTML = '';
  if (!tracks.length) { host.innerHTML = '<div class="music-empty">No tracks returned. Try a different search.</div>'; return; }
  tracks.filter(track => !track.is_premium && track.files?.mp3).forEach(track => {
    const card = document.createElement('article'); card.className='music-result';
    const title = document.createElement('div'); title.className='music-result-title'; title.textContent=track.title || 'Untitled track';
    const artist = document.createElement('div'); artist.className='music-result-artist'; artist.textContent=trackArtist(track);
    const meta = document.createElement('div'); meta.className='music-result-meta'; meta.textContent=[track.genre || 'MUSIC',formatSeconds(track.duration), 'LICENSE TERMS APPLY'].join(' • ');
    const actions = document.createElement('div'); actions.className='music-result-actions';
    for(const deckId of ['A','B']) {
      const button=document.createElement('button'); button.textContent='LOAD '+deckId;
      button.addEventListener('click',()=>loadFreeTrack(deckId,track)); actions.appendChild(button);
    }
    const saveButton=document.createElement('button');
    saveButton.textContent='SAVE TO CRATE';
    saveButton.className='save-to-crate-button';
    saveButton.addEventListener('click',()=>saveFreeTrackToCrate(track,saveButton));
    actions.appendChild(saveButton);
    card.append(title,artist,meta,actions); host.appendChild(card);
  });
  if (!host.children.length) host.innerHTML='<div class="music-empty">No non-premium tracks with a playable MP3 were returned.</div>';
}
async function fetchFreeTracks(query='') {
  const host=$x('musicResults');
  host.innerHTML='<div class="music-empty">Searching the music catalog…</div>';
  try {
    const url = query
      ? 'https://api.freetouse.com/v3/music/tracks/search?query='+encodeURIComponent(query)+'&limit=18&order=staff_order&sort=desc'
      : 'https://api.freetouse.com/v3/music/tracks/all?limit=18&order=staff_order&sort=desc';
    const response=await fetch(url,{headers:{Accept:'application/json'}});
    if(!response.ok) throw new Error('Music catalog returned HTTP '+response.status);
    const payload=await response.json();
    freeTracks=Array.isArray(payload.data)?payload.data:[];
    renderFreeTracks(freeTracks);
  } catch(error) {
    console.error(error);
    host.innerHTML='<div class="music-empty">The Free To Use catalog could not be reached from this browser. You can still load local music. Check the network or try again later.</div>';
    showMessage('Music catalog connection failed.');
  }
}
async function saveFreeTrackToCrate(track, button) {
  const url=track.files?.mp3;
  if(!url) { showMessage('This catalog item has no downloadable MP3 file.'); return; }
  const originalLabel=button?.textContent;
  if(button) { button.disabled=true; button.textContent='SAVING…'; }
  try {
    const response=await fetch(url,{mode:'cors',credentials:'omit'});
    if(!response.ok) throw new Error('The catalog host returned HTTP '+response.status+'.');
    const blob=await response.blob();
    if(!blob.size) throw new Error('The source returned an empty audio file.');
    const safeName=(track.title||'Free To Use track').replace(/[\\/:*?"<>|]+/g,'-').trim();
    const file=new File([blob],safeName+'.mp3',{type:blob.type||'audio/mpeg',lastModified:Date.now()});
    if(!studio?.addImportedTrack) throw new Error('The local crate import service is unavailable.');
    await studio.addImportedTrack(file);
    showMessage('Saved '+file.name+' to this device’s music crate. Load it from the crate when ready.');
  } catch(error) {
    console.warn('Catalog download could not be saved:',error);
    showMessage('Could not save this catalog MP3 directly (the source may block browser downloads). Use the source’s own download option, then choose ADD TRACKS in the crate.');
  } finally {
    if(button) { button.disabled=false; button.textContent=originalLabel||'SAVE TO CRATE'; }
  }
}

async function loadFreeTrack(deckId, track) {
  const state=studio.deckState[deckId];
  try {
    await studio.clearSavedDeck?.(deckId);
    await studio.ensureAudio();
    const url=track.files?.mp3;
    if(!url) throw new Error('This track has no MP3 file.');
    state.audio.pause();
    if(state.objectUrl) URL.revokeObjectURL(state.objectUrl);
    state.objectUrl=null; state.isStream=false; state.isRemote=true;
    state.file={name:(track.title||'Free To Use track')+'.mp3',size:0,type:'audio/mpeg',remote:true};
    state.cue=0; state.hotCues=Array(8).fill(null); state.tapTimes=[]; state.loop=null;
    state.audio.crossOrigin='anonymous';
    state.audio.src=url; state.audio.load();
    studio.engine.attachDeck(deckId,state.audio);
    studio.engine.setTrim(deckId, Number($x('trim' + deckId).value));
    $x('deckVolume' + deckId).value = $x('channel' + deckId).value;
    $x('deckVolumeValue' + deckId).textContent = Math.round(Number($x('channel' + deckId).value) * 100) + '%';
    for(const band of ['low','mid','high']) { studio.engine.setEQ(deckId,band,0); const knob=$x('knob-'+band+'-'+deckId); if(knob) renderKnob(knob,0); }
    studio.engine.setFilter(deckId,Number($x('filter'+deckId).value));
    studio.engine.setChannelVolume(deckId,Number($x('channel'+deckId).value));
    const artist=trackArtist(track);
    setDeckUiForRemote(deckId,track.title||'Free To Use track',artist+' • Free To Use',formatSeconds(track.duration));
    if(Array.isArray(track.waveform)) {
      state.waveform=Float32Array.from(track.waveform,v=>Number(v)/100);
      drawRemoteWave(deckId,state.waveform);
    } else drawEmptyWave(deckId);
    $x('loadStatus'+deckId).textContent='REMOTE TRACK • CORS / STREAM TEST REQUIRED';
    showMessage('Loaded '+(track.title||'track')+' on Deck '+deckId+'. Press PLAY to test audio routing.');
  } catch(error) {
    console.error(error); showMessage(error.message||'Track could not be loaded.');
  }
}
function drawRemoteWave(deckId,peaks) {
  studio.drawWaveform(deckId, peaks);
}

async function playFxPad(kind) {
  try { await studio.ensureAudio(); }
  catch (error) { showMessage(error.message || 'Audio is not available in this browser.'); return; }
  const context=studio.engine.context;
  const master=studio.engine.master;
  if(!context || !master) { showMessage('Audio is not available in this browser.'); return; }
  const now=context.currentTime;
  const out=context.createGain(); out.gain.setValueAtTime(.0001,now); out.connect(master);
  const duration={riser:1.8,siren:1.4,drop:1.1,laser:.48,scratch:.34,vinyl:.9,rewind:.72}[kind]||.55;
  const envelope=out.gain;
  const fxVolume = Math.max(0, Math.min(1, Number(document.getElementById('fxOutputVolume')?.value ?? 0.8)));
  if (fxVolume <= 0) return;
  const peakLevel = (kind==='horn'?.22:kind==='scratch'?.2:.18) * fxVolume;
  envelope.gain.exponentialRampToValueAtTime(peakLevel,now+.03);
  envelope.gain.exponentialRampToValueAtTime(.0001,now+duration);
  const frequencies=kind==='horn'?[440,554.37,659.25]:kind==='siren'?[600,900]:kind==='drop'?[95,48]:kind==='laser'?[1450,980]:kind==='scratch'?[220,440,330]:kind==='vinyl'?[880,440,220]:kind==='rewind'?[700,350,175]:[220,330,440];
  frequencies.forEach((frequency,index)=>{
    const osc=context.createOscillator(); const gain=context.createGain();
    osc.type=kind==='horn'?'sawtooth':kind==='drop'?'triangle':kind==='scratch'?'square':kind==='laser'?'sawtooth':kind==='rewind'?'triangle':'sine';
    osc.frequency.setValueAtTime(frequency,now);
    if(kind==='siren') osc.frequency.linearRampToValueAtTime(index%2?520:1100,now+duration);
    if(kind==='riser') osc.frequency.exponentialRampToValueAtTime(frequency*5,now+duration);
    if(kind==='drop') osc.frequency.exponentialRampToValueAtTime(Math.max(24,frequency*.35),now+duration);
    if(kind==='laser') osc.frequency.exponentialRampToValueAtTime(90,now+duration);
    if(kind==='scratch') { osc.frequency.exponentialRampToValueAtTime(frequency*2.8,now+duration*.45); osc.frequency.exponentialRampToValueAtTime(frequency*.4,now+duration); }
    if(kind==='vinyl') osc.frequency.exponentialRampToValueAtTime(45,now+duration);
    if(kind==='rewind') osc.frequency.exponentialRampToValueAtTime(1800,now+duration);
    gain.gain.value=1/frequencies.length; osc.connect(gain); gain.connect(out);
    osc.start(now); osc.stop(now+duration+.03);
  });
}

const midiMapKey='rolyfe-midi-map-v1';
let midiAccess=null, midiLearnArmed=false;
let midiMappings=JSON.parse(localStorage.getItem(midiMapKey)||'{}');
function midiTargetElement(selector){ try{return document.querySelector(selector);}catch{return null;} }
function applyMidiValue(selector,value,isButton) {
  const element=midiTargetElement(selector); if(!element)return;
  if(element.matches('.rotary-knob')) {
    const min=Number(element.getAttribute('aria-valuemin')||-24),max=Number(element.getAttribute('aria-valuemax')||6);
    renderKnob(element,min+(value/127)*(max-min)); return;
  }
  if(element instanceof HTMLInputElement && element.type==='range') {
    const min=Number(element.min||0),max=Number(element.max||1);
    element.value=String(min+(value/127)*(max-min));
    element.dispatchEvent(new Event('input',{bubbles:true})); return;
  }
  if(isButton && value>0) element.click();
}
function midiMessage(event) {
  const [status,data1,data2]=event.data;
  const command=status&0xf0;
  const key=event.currentTarget.id+':'+command+':'+data1;
  if(midiLearnArmed) {
    const selector=$x('midiTarget').value;
    midiMappings[key]=selector; localStorage.setItem(midiMapKey,JSON.stringify(midiMappings));
    midiLearnArmed=false; $x('midiLearn').textContent='LEARN CONTROL';
    $x('midiStatus').textContent='MAPPED '+selector+' TO MIDI '+data1;
    showMessage('MIDI control mapped.'); return;
  }
  const selector=midiMappings[key]; if(!selector)return;
  const isButton=command===0x90 || command===0x80;
  if(command===0xb0 || command===0x90) applyMidiValue(selector,data2,isButton);
}
function renderMidiDeviceList() {
  const host=$x('midiDeviceList');
  if(!host) return;
  if(!midiAccess) { host.textContent='No MIDI devices listed yet. Connect a controller and choose CONNECT MIDI.'; return; }
  const inputs=Array.from(midiAccess.inputs.values());
  const outputs=Array.from(midiAccess.outputs.values());
  const inputNames=inputs.map(device=>device.name||'Unnamed MIDI input');
  const outputNames=outputs.map(device=>device.name||'Unnamed MIDI output');
  host.textContent='MIDI INPUTS: '+(inputNames.join(' · ')||'NONE DETECTED')+' | MIDI OUTPUTS: '+(outputNames.join(' · ')||'NONE DETECTED');
}
async function connectMidi() {
  if(!navigator.requestMIDIAccess) { $x('midiStatus').textContent='WEB MIDI NOT SUPPORTED IN THIS BROWSER'; renderMidiDeviceList(); showMessage('Try desktop Chrome or Edge for MIDI controllers.'); return; }
  try {
    midiAccess=await navigator.requestMIDIAccess({sysex:false});
    const bind=()=>{
      midiAccess.inputs.forEach(input=>{input.onmidimessage=midiMessage;});
      const count=midiAccess.inputs.size;
      $x('midiStatus').textContent=count?count+' MIDI INPUT(S) READY':'MIDI ENABLED · NO INPUT DETECTED';
      renderMidiDeviceList();
    };
    bind();
    midiAccess.onstatechange=bind;
    const count=midiAccess.inputs.size;
    showMessage(count?'MIDI connected. Select a control and press LEARN.':'MIDI access enabled; connect a controller and retry.');
  } catch(error) { $x('midiStatus').textContent='MIDI ACCESS DENIED'; renderMidiDeviceList(); showMessage(error.message||'MIDI permission was denied.'); }
}
function setupMidi() {
  renderMidiDeviceList();
  $x('midiConnect')?.addEventListener('click',connectMidi);
  $x('midiLearn')?.addEventListener('click',()=>{
    if(!midiAccess) { showMessage('Connect a MIDI controller first.'); return; }
    midiLearnArmed=true; $x('midiLearn').textContent='MOVE A CONTROL…'; $x('midiStatus').textContent='WAITING FOR MIDI MESSAGE';
  });
}

function setupTouchFeedback() {
  const activeTimers=new WeakMap();
  const activePointers=new Map();
  const selector='button,a,input,select,textarea,[role="slider"],.platter,canvas';
  const scheduleRelease=(control,delay=240)=>{
    if(!control)return;
    const old=activeTimers.get(control);
    if(old) clearTimeout(old);
    activeTimers.set(control,setTimeout(()=>{
      control.classList.remove('touch-lit');
      activeTimers.delete(control);
    },delay));
  };
  document.addEventListener('pointerdown',event=>{
    const control=event.target.closest?.(selector);
    if(!control || control.disabled) return;
    const old=activeTimers.get(control);
    if(old) clearTimeout(old);
    activeTimers.delete(control);
    control.classList.add('touch-lit');
    activePointers.set(event.pointerId,control);
  },{passive:true});
  const finishPointer=event=>{
    const control=activePointers.get(event.pointerId);
    activePointers.delete(event.pointerId);
    scheduleRelease(control);
  };
  document.addEventListener('pointerup',finishPointer,{passive:true});
  document.addEventListener('pointercancel',finishPointer,{passive:true});
  document.addEventListener('focusout',event=>{
    const control=event.target;
    if(control?.classList?.contains('touch-lit')) scheduleRelease(control,160);
  });
}

function bindUpgrades() {
  setupTouchFeedback();
  setupRotaryKnobs();
  $x('radioLoadA').addEventListener('click',()=>loadRadioToDeck('A'));
  $x('radioLoadB').addEventListener('click',()=>loadRadioToDeck('B'));
  $x('radioLoadForm').addEventListener('submit',event=>{event.preventDefault();loadRadioToDeck('A');});
  document.querySelectorAll('[data-fx-pad]').forEach(button=>button.addEventListener('click',()=>playFxPad(button.dataset.fxPad)));
  $x('quickPicksButton').addEventListener('click',()=>fetchFreeTracks(''));
  $x('musicSearchForm').addEventListener('submit',event=>{event.preventDefault();fetchFreeTracks($x('musicSearchInput').value.trim());});
  setupMidi();
  fetchFreeTracks('');
  // Make the app's loading and radio controls available in the top navigation on small screens.
  if(location.hash==='#radio-studio') $x('radio-studio').scrollIntoView();
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',bindUpgrades,{once:true});
else bindUpgrades();
window.addEventListener('beforeunload',()=>{if(studio){Object.values(studio.deckState).forEach(state=>{state.isStream=false;});}});
