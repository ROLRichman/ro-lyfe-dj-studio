export class ROLyfeAudioEngine {
  constructor() {
    this.context = null;
    this.master = null;
    this.masterAnalyser = null;
    this.recordDestination = null;
    this.decks = new Map();
    this.crossfader = 0.5;
    this.masterVolume = 0.82;
    this.masterMuted = false;
  }

  async ensure() {
    if (!this.context) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) throw new Error('This browser does not support the Web Audio API. Try current Chrome or Edge.');
      this.context = new AudioContextClass({ latencyHint: 'interactive' });
      this.master = this.context.createGain();
      this.masterAnalyser = this.context.createAnalyser();
      this.masterAnalyser.fftSize = 1024;
      this.masterAnalyser.smoothingTimeConstant = 0.78;
      this.recordDestination = this.context.createMediaStreamDestination();
      this.master.gain.value = this.masterMuted ? 0 : this.masterVolume;
      this.master.connect(this.masterAnalyser);
      this.masterAnalyser.connect(this.context.destination);
      this.masterAnalyser.connect(this.recordDestination);
    }
    if (this.context.state !== 'running') await this.context.resume();
    return this.context;
  }

  attachDeck(id, audioElement) {
    if (!this.context) throw new Error('Start the audio engine before attaching a deck.');
    if (this.decks.has(id)) return this.decks.get(id);
    const ctx = this.context;
    const source = ctx.createMediaElementSource(audioElement);
    // Pre-EQ trim / input gain, independently controlled from the channel fader.
    const trimGain = ctx.createGain();
    trimGain.gain.value = 1;
    const low = ctx.createBiquadFilter();
    low.type = 'lowshelf'; low.frequency.value = 250; low.gain.value = 0;
    const mid = ctx.createBiquadFilter();
    mid.type = 'peaking'; mid.frequency.value = 1100; mid.Q.value = 0.85; mid.gain.value = 0;
    const high = ctx.createBiquadFilter();
    high.type = 'highshelf'; high.frequency.value = 6500; high.gain.value = 0;
    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass'; highpass.frequency.value = 10; highpass.Q.value = 0.7;
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass'; lowpass.frequency.value = 20000; lowpass.Q.value = 0.7;
    const channelGain = ctx.createGain();
    const crossGain = ctx.createGain();
    const delay = ctx.createDelay(1.5);
    delay.delayTime.value = 0.375;
    const feedback = ctx.createGain();
    feedback.gain.value = 0;
    const wet = ctx.createGain();
    wet.gain.value = 0;

    source.connect(trimGain);
    trimGain.connect(low);
    low.connect(mid);
    mid.connect(high);
    high.connect(highpass);
    highpass.connect(lowpass);
    lowpass.connect(channelGain);
    lowpass.connect(delay);
    delay.connect(wet);
    wet.connect(channelGain);
    delay.connect(feedback);
    feedback.connect(delay);
    channelGain.connect(crossGain);
    crossGain.connect(this.master);

    const deck = { id, audioElement, source, trimGain, low, mid, high, highpass, lowpass, channelGain, crossGain, delay, feedback, wet, trim: 0, volume: 1, echo: 0, filter: 50 };
    this.decks.set(id, deck);
    this.setCrossfader(this.crossfader);
    return deck;
  }

  getDeck(id) { return this.decks.get(id); }

  setEQ(id, band, value) {
    const deck = this.getDeck(id); if (!deck) return;
    const node = band === 'low' ? deck.low : band === 'mid' ? deck.mid : deck.high;
    node.gain.setTargetAtTime(Number(value), this.context.currentTime, 0.025);
  }

  setFilter(id, value) {
    const deck = this.getDeck(id); if (!deck) return;
    const position = Math.max(0, Math.min(100, Number(value)));
    const now = this.context.currentTime;
    if (position < 50) {
      const t = position / 50;
      const cutoff = 320 * Math.pow(20000 / 320, t);
      deck.lowpass.frequency.setTargetAtTime(cutoff, now, 0.035);
      deck.highpass.frequency.setTargetAtTime(10, now, 0.035);
    } else {
      const t = (position - 50) / 50;
      const cutoff = 10 * Math.pow(9000 / 10, t);
      deck.lowpass.frequency.setTargetAtTime(20000, now, 0.035);
      deck.highpass.frequency.setTargetAtTime(cutoff, now, 0.035);
    }
    deck.filter = position;
  }

  setTrim(id, decibels) {
    const deck = this.getDeck(id); if (!deck) return;
    const value = Math.max(-12, Math.min(12, Number(decibels)));
    deck.trim = value;
    const linearGain = Math.pow(10, value / 20);
    deck.trimGain.gain.setTargetAtTime(linearGain, this.context.currentTime, 0.025);
  }

  setChannelVolume(id, value) {
    const deck = this.getDeck(id); if (!deck) return;
    deck.volume = Number(value);
    deck.channelGain.gain.setTargetAtTime(deck.volume, this.context.currentTime, 0.025);
  }

  setCrossfader(value) {
    this.crossfader = Math.max(0, Math.min(1, Number(value)));
    if (!this.context) return;
    const angle = this.crossfader * Math.PI / 2;
    const a = this.decks.get('A'); const b = this.decks.get('B');
    if (a) a.crossGain.gain.setTargetAtTime(Math.cos(angle), this.context.currentTime, 0.018);
    if (b) b.crossGain.gain.setTargetAtTime(Math.sin(angle), this.context.currentTime, 0.018);
  }

  setEcho(id, amount) {
    const deck = this.getDeck(id); if (!deck) return;
    const value = Math.max(0, Math.min(0.55, Number(amount)));
    const now = this.context.currentTime;
    deck.echo = value;
    deck.wet.gain.setTargetAtTime(value, now, 0.04);
    deck.feedback.gain.setTargetAtTime(value === 0 ? 0 : Math.min(0.42, 0.12 + value * 0.48), now, 0.04);
  }

  setMasterVolume(value) {
    this.masterVolume = Math.max(0, Math.min(1, Number(value)));
    if (this.master && !this.masterMuted) this.master.gain.setTargetAtTime(this.masterVolume, this.context.currentTime, 0.025);
  }

  toggleMasterMute() {
    this.masterMuted = !this.masterMuted;
    if (this.master) this.master.gain.setTargetAtTime(this.masterMuted ? 0 : this.masterVolume, this.context.currentTime, 0.01);
    return this.masterMuted;
  }

  getMeter() {
    if (!this.masterAnalyser) return 0;
    const data = new Uint8Array(this.masterAnalyser.fftSize);
    this.masterAnalyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; sum += v * v; }
    return Math.min(1, Math.sqrt(sum / data.length) * 2.6);
  }

  getRecordingStream() { return this.recordDestination?.stream || null; }
}