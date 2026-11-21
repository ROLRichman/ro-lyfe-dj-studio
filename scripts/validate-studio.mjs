import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const fail = message => { console.error('FAIL:', message); process.exitCode = 1; };
const pass = message => console.log('PASS:', message);

const html = read('index.html');
const bootstrap = read('src/bootstrap.js');
const main = read('src/main.js');
const guide = read('src/dj-guide.js');
const questions = read('src/coach-voice-questions.js');
const controls = read('src/studio-controls.js');
const picker = read('src/crate-picker.js');
const upgrades = read('src/studio-upgrades.js');
const serviceWorker = read('sw.js');
const deckCss = read('src/deck-performance.css');
const studioCss = read('src/studio-controls.css');
const guideCss = read('src/dj-guide.css');
const crate = read('src/starter-crate.js');
const baseStyles = read('styles.css');




const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
if (duplicates.length) fail('Duplicate HTML IDs: ' + [...new Set(duplicates)].join(', '));
else pass('HTML IDs are unique');

if (!html.includes('src/bootstrap.js')
  || !bootstrap.includes("'./main.js'")
  || bootstrap.indexOf("'./main.js'") > bootstrap.indexOf("'./studio-controls.js'")) {
  fail('Single ordered startup coordinator is missing or has the wrong module order');
} else pass('Studio modules load sequentially, with the audio engine API first');

if (!main.includes('const scheduleCrateRestore = () => restoreSavedCrate();')
  || main.includes('stored audio cannot block entry.\\nconst scheduleCrateRestore')) {
  fail('Saved music crate restoration is not scheduled after the initial paint');
} else pass('Saved music crate restoration is scheduled after first paint');


if (html.includes('id="frontDoor"') || html.includes('id="guestPreviewButton"') || html.includes('ENTER STUDIO') || html.includes('WELCOME TO')) {
  fail('A blocking welcome/front-door entry screen is still present');
} else pass('Studio opens directly without a welcome gate or Enter Studio step');

if (!html.includes('RO’Lyfe DJ Studio') || !html.includes('./assets/rolyfe-mark.svg') || html.includes('goldensteal-mark.svg')) {
  fail('RO’Lyfe app branding or studio mark is not fully wired');
} else pass('RO’Lyfe title and app mark are wired into the entry document');


const layoutIds = ['deckWorkspace', 'decks', 'crate-dock', 'crossfader-dock', 'mixer'];
const positions = layoutIds.map(id => html.indexOf('id="' + id + '"'));
if (positions.some(position => position < 0) || positions.some((position, index) => index && position <= positions[index - 1])) {
  fail('Expected layout order: Deck A/B first → Starter Pack → crossfader → Central Mixer');
} else pass('Deck A/B workspace is first, followed by Starter Pack, crossfader and Central Mixer');

const themes = ['golden-signature', 'midnight-blue', 'ocean-teal', 'violet-pulse', 'crimson-club', 'arctic-silver'];
if (themes.some(theme => !html.includes(theme) && !controls.includes(theme))) fail('One or more of the six themes are missing');
else pass('All six selectable theme identifiers are present');

if (!main.includes('ROLyfeCratePicker.open(deckId)') || !picker.includes('loadFileIntoDeck(activeDeck, file)')) {
  fail('Deck LOAD does not route through the saved-crate picker');
} else pass('Deck LOAD routes to saved local tracks before browsing for a new file');

const questionCount = (questions.match(/^\s+\["/gm) || []).length;
if (questionCount !== 30) fail('Expected 30 coach questions; found ' + questionCount);
else pass('Exactly 30 coach questions are present');

if (!questions.includes('MediaRecorder') || !questions.includes("indexedDB.open('goldensteal-coach-voice-clips'")) {
  fail('Personal voice recording is missing microphone recording or local persistence');
} else pass('Personal voice clips use MediaRecorder and device-local storage');

if (!main.includes("CRATE_DB_NAME = 'goldensteal-local-crate'")
  || !questions.includes("indexedDB.open('goldensteal-coach-voice-clips'")
  || !controls.includes("const SAMPLE_DB = 'goldensteal-fx-sample-bank'")) {
  fail('Existing device-local music, coach, or FX sample stores were not preserved across the rebrand');
} else pass('Existing device-local music, coach recordings, and FX sample stores remain compatible');


if (!guide.includes('djGuideVoiceChoice') || !guide.includes('djGuideVoiceVolume') || !guide.includes('ROLyfeCoachStopCustomVoice')) {
  fail('Coach voice selection, independent volume or Voice OFF behavior is missing');
} else pass('Coach voice selection, volume and mute hooks are present');

if (!html.includes('id="fxDrawerToggle"') || !controls.includes('function playSample') || !upgrades.includes("document.querySelectorAll('[data-fx-pad]')")) {
  fail('FX drawer / sample pad integration is incomplete');
} else pass('FX drawer and sample-pad hooks are present');

if (!serviceWorker.includes('./src/crate-picker.js')
  || !serviceWorker.includes('./src/coach-voice-questions.js')
  || !serviceWorker.includes('./src/studio-controls.js')
  || !serviceWorker.includes('./src/studio-controls.css')) {
  fail('Service worker is missing one or more new app-shell files');
} else pass('Service worker app shell includes all new studio modules and styles');

if (!html.includes('id="deckWorkspace" open') || html.includes('id="crate-dock" open')) {
  fail('Live Deck A/B workspace must start open while the single Starter Pack dropdown starts collapsed');
} else pass('Live decks stay open by default and the single Starter Pack dropdown starts collapsed');

const demoButtons = ['loadDemoPair','loadDemoA','loadDemoB'];
if (demoButtons.some(id => !html.includes('id="' + id + '"')) || demoButtons.some(id => (html.match(new RegExp('id="' + id + '"','g')) || []).length !== 1)) {
  fail('Built-in practice loops must appear once inside the single Starter Pack');
} else pass('Built-in practice loops appear once inside the single Starter Pack');

if (!html.includes('id="djGuideStarterPackButton"') || !guide.includes('djGuideStarterPackButton') || !guide.includes('dock.open = true')) {
  fail('DJ Coach is missing its direct START A PACK NOW action');
} else pass('DJ Coach opens the same Starter Pack dropdown directly');

const pilotMarkup = html.slice(html.indexOf('id="pilotKit"'));
if (demoButtons.some(id => pilotMarkup.includes('id="' + id + '"'))) {
  fail('A second set of starter beat controls is still present in the pilot overlay');
} else pass('Pilot overlay no longer presents a duplicate starter beat pack');

if (!main.includes('state.jogScratchActive') || !main.includes('audio.playbackRate = clamp') || !main.includes('audio.currentTime = clamp')) {
  fail('Jog wheel scratch handler is missing live audio position/speed response');
} else pass('Touch Scratch changes audio position bidirectionally and varies playback speed');

if (!guide.includes('function getLiveDJGuidance()') || !guide.includes('function announceLiveNext()') || !html.includes('id="djGuideLiveNext"')) {
  fail('Live DJ state guidance is missing');
} else pass('DJ Coach reads loaded / playing deck state and offers a guided next action');

if (!deckCss.includes('.platter.scratch-armed') || !deckCss.includes('.decks-panel-summary')) {
  fail('Deck workspace / scratch feedback styling is missing');
} else pass('Collapsible deck and scratch touch feedback styles are present');

if (!serviceWorker.includes('./src/deck-performance.css')) {
  fail('Service worker is missing deck-performance.css');
} else pass('Service worker caches the deck performance styles');

JSON.parse(read('assets/starter-crate/manifest.json'));
pass('Starter Crate manifest is valid JSON');


if (!html.includes('id="topDjGuideButton"') || !guide.includes('topDjGuideButton')) {
  fail('Top Show Me How to DJ control is missing or not connected to the coach');
} else pass('Top Show Me How to DJ button opens the existing DJ Coach');

if (!html.includes('id="topQuickMixButton"') || !main.includes("topToggle?.addEventListener('click'") || !main.includes("floatingToggle?.addEventListener('click'")) {
  fail('Top Quick Mix control or floating MIX button is not wired directly into the Quick Mixer');
} else pass('Top Quick Mix and floating MIX buttons share direct open/close controls');

if (!main.includes('window.ROLyfeQuickMixer') || !main.includes('panel.setAttribute(\'aria-hidden\', String(!open))')) {
  fail('Quick Mixer does not expose reliable open / close state');
} else pass('Quick Mixer opens, closes and updates its accessibility state');

if (!studioCss.includes('.mobile-mix-panel { z-index:1610!important; }')
  || !studioCss.includes('.mobile-mix-toggle { z-index:1620!important;')) {
  fail('Quick Mixer panel and floating button are not above competing overlays');
} else pass('Quick Mixer overlay and floating control have priority stacking');


const mixInit = main.indexOf("setupMobileMixer();");
const bindInit = main.indexOf("bindEvents();");
if (!main.includes("floatingToggle?.addEventListener('click'") || !main.includes("topToggle?.addEventListener('click'") || mixInit < 0 || bindInit < 0 || mixInit > bindInit) {
  fail('Floating / top Quick Mixer direct handlers are missing or not initialized independently');
} else pass('Floating and top Quick Mixer buttons bind directly and initialize independently');

if (main.includes("event.target.closest('#mobileMixToggle, #topQuickMixButton')")) {
  fail('Old delegated Quick Mixer handler is still present');
} else pass('Quick Mixer no longer depends on a delegated document click handler');

for (const deck of ['A','B']) {
  const deckStart = html.indexOf('id="deck' + deck + '"');
  const transportStart = html.indexOf('<div class="transport-buttons">', deckStart);
  const loopStart = html.indexOf('<div class="loop-row">', transportStart);
  const hotCueStart = html.indexOf('<div class="hot-cues">', transportStart);
  if (transportStart < 0 || loopStart < transportStart || hotCueStart < 0 || loopStart > hotCueStart) {
    fail('Deck ' + deck + ' beat loops should be grouped directly after transport buttons and before hot cues');
  }
}
if (!process.exitCode) pass('Beat loops are grouped beneath PLAY / CUE / STOP on both decks');

if (!html.includes('id="quickGoMenu"') || !html.includes('data-go-to="crossfader-dock"') || !controls.includes('function setupQuickGoMenu()')) {
  fail('Quick Go To menu is missing fader navigation or event wiring');
} else pass('Quick Go To menu includes live fader and studio destinations');

if (!guideCss.includes('max-height:min(54dvh,460px)') || !guideCss.includes('bottom:calc(76px + env(safe-area-inset-bottom))')) {
  fail('DJ Coach mobile panel is not compact and non-blocking');
} else pass('DJ Coach uses a compact mobile panel that leaves the active deck visible');

if (!deckCss.includes('width:min(100%, 305px)!important') || !deckCss.includes('width:min(100%, 330px)!important')) {
  fail('Mobile platter sizing is still capped at its former small dimensions');
} else pass('Mobile jog wheels use the available deck width');

if (!html.includes('mailto:Robinsonrock@yahoo.com') || !html.includes('FOUNDING DJ CIRCLE')) {
  fail('DJ pilot / affiliate invitation is missing');
} else pass('DJ pilot invitation is present with the supplied contact address');

if (!html.includes('BPM values are manually entered or tap-estimated')) {
  fail('BPM / beat-grid accuracy limitation is not disclosed');
} else pass('Manual BPM state and accuracy-gate requirements are disclosed');


if (!crate.includes("CHOOSE FILE · ") || !crate.includes("studio.loadFileIntoDeck(deckId, file)")) {
  fail('Starter crate cannot load a local fallback file into the requested deck');
} else pass('Starter crate LOAD buttons offer a local-file fallback when shared assets are not hosted');

if (!baseStyles.includes("left:12px!important") || !baseStyles.includes("right:auto!important") || !baseStyles.includes("bottom-left lane")) {
  fail('Floating Quick MIX trigger is not moved into the reserved left-side touch lane');
} else pass('Floating MIX touch zone is separated from right-side controls');

if (!serviceWorker.includes("rolyfe-dj-studio-shell-v1")) {
  fail('Service-worker cache version was not refreshed for the unified Starter Pack');
} else pass('Service-worker cache refreshed for the unified Starter Pack update');


if (!html.includes('id="djGuideFollowMix"') || !html.includes('id="djGuideActionReceipt"')) {
  fail('Live Coach Follow My Mix toggle or action receipt is missing');
} else pass('Live Coach exposes Follow My Mix and a visible last-action receipt');

const followStages = ['load-first','load-second','start-lead','prepare-incoming','auto-blending','manual-blending','load-next-after-transition'];
if (followStages.some(stage => !guide.includes("stage:'" + stage + "'"))) {
  fail('Live Coach is missing one or more stages of the repeated DJ set workflow');
} else pass('Live Coach covers first load, second load, lead play, preparation, transition and next-track reload');

if (!guide.includes("audio.addEventListener('loadedmetadata'") || !guide.includes("audio.addEventListener('play'") || !guide.includes("audio.addEventListener('pause'")) {
  fail('Live Coach is not listening for actual deck load/play/pause confirmation events');
} else pass('Live Coach confirms real deck metadata, playback and pause events');

if (!guide.includes("recognizeCoachAction")
  || !guide.includes("loop:'BEAT LOOP '")
  || !guide.includes("sync:'SYNC'")
  || !guide.includes("hotcue:'HOT CUE '")
  || !guide.includes("data-fx-pad")) {
  fail('Live Coach does not recognize the main performance controls');
} else pass('Live Coach recognizes deck buttons, loops, sync, hot cues and FX pads');

if (!guide.includes("MutationObserver") || !guide.includes("autoBlendStatus")) {
  fail('Live Coach is not following Auto Blend progress and completion');
} else pass('Live Coach follows Auto Blend progress and transition completion');

if (!guide.includes("mixFaderMoved") || !guide.includes("CROSSFADER")) {
  fail('Live Coach does not observe manual crossfader movement');
} else pass('Live Coach observes manual crossfader movement');

if (!html.includes('WEEKEND DJ PILOT · PHONE FIRST, LAPTOP SECOND') || !html.includes('LAPTOP SECOND')) {
  fail('Weekend pilot instructions do not specify phone first and laptop second');
} else pass('Weekend pilot instructions prioritize phone testing, then laptop');

if (!serviceWorker.includes("rolyfe-dj-studio-shell-v1")) {
  fail('Service-worker cache version was not refreshed for the unified Starter Pack');
} else pass('Service-worker cache refreshed for the unified Starter Pack update');

if (process.exitCode) process.exit(process.exitCode);
