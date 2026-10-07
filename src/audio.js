import { NARRATION_CLIPS } from './narration.js';

// Browser-only playback. Recorded narration is optional alongside device voices.
export const MUSIC_TRACKS = {
  stealth: new URL('../assets/music/stealth.mp3', import.meta.url).href,
  horde: new URL('../assets/music/horde.mp3', import.meta.url).href,
  boss: new URL('../assets/music/boss.mp3', import.meta.url).href,
};
export const SOUND_SETTINGS_KEY = 'last-disciple-sound-v1';
const DEFAULT_SOUND = { musicVolume: .48, narrationVolume: .9, narrationEnabled: true, muted: false, voiceURI: '' };
const VOICE_ROLES = {
  narrator: { label: 'NARRATOR', rate: .94, pitch: .92 },
  disciple: { label: 'A DISCIPLE', rate: 1, pitch: 1.1 },
  grandmaster: { label: 'THE GRANDMASTER', rate: .87, pitch: .8 },
};
const clamp = (value, fallback) => Number.isFinite(Number(value)) ? Math.max(0, Math.min(1, Number(value))) : fallback;

export function soundSettings(value) {
  if (!value || typeof value !== 'object') return { ...DEFAULT_SOUND };
  return {
    musicVolume: clamp(value.musicVolume ?? DEFAULT_SOUND.musicVolume, DEFAULT_SOUND.musicVolume),
    narrationVolume: clamp(value.narrationVolume ?? DEFAULT_SOUND.narrationVolume, DEFAULT_SOUND.narrationVolume),
    narrationEnabled: typeof value.narrationEnabled === 'boolean' ? value.narrationEnabled : true,
    muted: typeof value.muted === 'boolean' ? value.muted : false,
    voiceURI: typeof value.voiceURI === 'string' ? value.voiceURI.slice(0, 250) : '',
  };
}

// Short utterances also keep cancellation responsive on different speech engines.
export function speechChunks(text, limit = 180) {
  const sentences = String(text).trim().match(/[^.!?]+[.!?]+["”’]?|[^.!?]+$/g) || [];
  const chunks = []; let current = '';
  for (const sentence of sentences) {
    const value = sentence.trim();
    if (value.length <= limit) {
      if (current && current.length + value.length + 1 > limit) { chunks.push(current); current = ''; }
      current = current ? `${current} ${value}` : value;
    } else {
      for (const word of value.split(/\s+/)) {
        if (current && current.length + word.length + 1 > limit) { chunks.push(current); current = ''; }
        current = current ? `${current} ${word}` : word;
      }
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export class AudioManager {
  constructor({ host = globalThis, storage, recordings = NARRATION_CLIPS, onNarration = () => {}, onStatus = () => {} } = {}) {
    this.host = host; this.onNarration = onNarration; this.onStatus = onStatus;
    this.recordings = recordings && typeof recordings === 'object' ? recordings : {};
    try { this.storage = storage ?? host.localStorage; } catch { this.storage = null; }
    let saved;
    try { saved = JSON.parse(this.storage?.getItem(SOUND_SETTINGS_KEY) ?? 'null'); } catch { saved = null; }
    this.settings = soundSettings(saved);
    this.Context = host.AudioContext || host.webkitAudioContext;
    this.speech = host.speechSynthesis; this.Utterance = host.SpeechSynthesisUtterance;
    this.fetcher = host.fetch?.bind(host);
    this.timer = host.setTimeout?.bind(host) ?? setTimeout;
    this.clearTimer = host.clearTimeout?.bind(host) ?? clearTimeout;
    this.context = null; this.musicBus = null; this.currentMusic = null; this.retiring = new Set();
    this.buffers = new Map(); this.desiredMusic = 'stealth'; this.musicRequest = 0;
    this.unlocked = false; this.paused = false; this.disposed = false; this.error = '';
    this.speaking = false; this.queue = []; this.index = 0; this.token = 0; this.utterance = null;
    this.recordingBuffers = new Map(); this.recording = null; this.recordingOffset = 0;
    this.lastCue = null; this.timers = []; this.voiceList = [];
    this.voiceListener = () => { this.refreshVoices(); this.notify(); };
    this.speech?.addEventListener?.('voiceschanged', this.voiceListener);
    this.refreshVoices();
  }

  get supportsSpeech() { return Boolean(this.speech && this.Utterance); }
  get hasRecordings() {
    return Object.values(this.recordings).some(value => (Array.isArray(value) ? value : [value])
      .some(url => typeof url === 'string' && url.length > 0));
  }
  get supportsNarration() { return this.supportsSpeech || this.supportsMusic && this.hasRecordings; }
  get supportsMusic() { return Boolean(this.Context && this.fetcher); }
  refreshVoices() {
    try { this.voiceList = this.speech?.getVoices?.() ?? []; } catch { this.voiceList = []; }
    return this.voiceList;
  }
  englishVoices() { return this.voiceList.filter(voice => /^en(?:[-_]|$)/i.test(voice.lang)); }
  selectedVoice() {
    const explicit = this.voiceList.find(voice => voice.voiceURI === this.settings.voiceURI);
    if (explicit) return explicit;
    const voices = this.englishVoices();
    const score = voice => (voice.default ? 2 : 0) + (voice.localService ? 1 : 0) +
      (/natural|premium|enhanced/i.test(voice.name) ? 3 : 0) + (/Daniel|David|George|Ryan|Mark/i.test(voice.name) ? 1 : 0);
    return [...voices].sort((a, b) => score(b) - score(a))[0] ?? null;
  }
  notify() { this.onStatus(this); }
  persist() {
    try { this.storage?.setItem(SOUND_SETTINGS_KEY, JSON.stringify(this.settings)); } catch { /* Optional persistence. */ }
    this.notify();
  }

  // Call directly from a click/tap, before awaiting fetch or decoding.
  unlock() {
    if (this.disposed) return;
    this.unlocked = true;
    try {
      if (!this.context && this.supportsMusic) {
        this.context = new this.Context();
        this.musicBus = this.context.createGain(); this.musicBus.gain.value = 0;
        this.musicBus.connect(this.context.destination);
      }
      if (this.context && this.context.state !== 'running' && !this.paused) {
        Promise.resolve(this.context.resume()).catch(() => { this.error = 'Click Sound to enable music playback.'; this.notify(); });
      }
    } catch { this.error = 'Music playback is unavailable in this browser.'; }
    this.refreshVoices();
    this.startDesiredMusic(); this.notify();
  }

  ramp(param, value, duration) {
    if (!this.context || !param) return;
    const now = this.context.currentTime;
    if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(now);
    else { param.cancelScheduledValues(now); param.setValueAtTime(param.value, now); }
    param.linearRampToValueAtTime(value, now + duration);
  }
  applyMusicVolume() {
    const value = this.settings.muted ? 0 : this.settings.musicVolume * (this.speaking ? .24 : 1);
    this.ramp(this.musicBus?.gain, value, .25);
  }
  setMusicVolume(value) { this.settings.musicVolume = clamp(value, .48); this.applyMusicVolume(); this.persist(); }
  setNarrationVolume(value) {
    this.settings.narrationVolume = clamp(value, .9);
    if (this.utterance) this.utterance.volume = this.settings.narrationVolume;
    this.ramp(this.recording?.gain.gain, this.settings.narrationVolume, .08);
    if (this.settings.narrationVolume === 0) this.stopNarration();
    this.persist();
  }
  setNarrationEnabled(value) {
    this.settings.narrationEnabled = Boolean(value);
    if (!value) this.stopNarration();
    this.persist();
  }
  setVoice(uri) { this.settings.voiceURI = typeof uri === 'string' ? uri.slice(0, 250) : ''; this.persist(); }
  setMuted(value) {
    this.settings.muted = Boolean(value);
    if (value) this.stopNarration();
    this.applyMusicVolume(); this.persist();
  }

  setMusic(mode) {
    if (!(mode in MUSIC_TRACKS)) mode = 'stealth';
    this.desiredMusic = mode;
    return this.startDesiredMusic();
  }
  async bufferFor(mode) {
    if (!this.buffers.has(mode)) {
      const loading = (async () => {
        const response = await this.fetcher(MUSIC_TRACKS[mode]);
        if (!response.ok) throw Error(`Unable to load ${mode} music.`);
        const bytes = await response.arrayBuffer();
        return await this.context.decodeAudioData(bytes);
      })();
      this.buffers.set(mode, loading);
      loading.catch(() => { if (this.buffers.get(mode) === loading) this.buffers.delete(mode); });
    }
    return await this.buffers.get(mode);
  }
  async startDesiredMusic() {
    if (!this.unlocked || !this.context || this.paused || this.disposed) return;
    if (this.currentMusic?.mode === this.desiredMusic) { this.applyMusicVolume(); return; }
    const request = ++this.musicRequest, mode = this.desiredMusic;
    try {
      const buffer = await this.bufferFor(mode);
      if (request !== this.musicRequest || this.disposed || this.paused || mode !== this.desiredMusic) return;
      const source = this.context.createBufferSource(), gain = this.context.createGain();
      source.buffer = buffer; source.loop = true; gain.gain.value = 0;
      source.connect(gain); gain.connect(this.musicBus); source.start();
      const previous = this.currentMusic;
      this.currentMusic = { source, gain, mode };
      if (this.error.startsWith('A music file could not load.')) this.error = '';
      this.ramp(gain.gain, 1, 1.2);
      if (previous) {
        this.retiring.add(previous); this.ramp(previous.gain.gain, 0, 1.2);
        previous.source.onended = () => { previous.source.disconnect(); previous.gain.disconnect(); this.retiring.delete(previous); };
        previous.source.stop(this.context.currentTime + 1.25);
      }
      this.applyMusicVolume(); this.notify();
    } catch {
      if (request === this.musicRequest && !this.disposed) {
        this.error = 'A music file could not load. Extract the entire project and use its local server.';
        this.notify();
      }
    }
  }

  clearSpeechTimers() { for (const timer of this.timers) this.clearTimer(timer); this.timers = []; }
  releaseRecording() {
    if (!this.recording) return;
    const { source, gain } = this.recording; this.recording = null;
    source.onended = null;
    try { source.stop(); } catch { /* A finished clip may already have stopped. */ }
    source.disconnect(); gain.disconnect();
  }
  cancelCurrent({ preserveRecording = false } = {}) {
    if (preserveRecording && this.recording) {
      this.recordingOffset = this.recording.offset + Math.max(0, this.context.currentTime - this.recording.startedAt);
    } else if (!preserveRecording) this.recordingOffset = 0;
    this.token++; this.clearSpeechTimers(); this.utterance = null;
    this.releaseRecording();
    try { this.speech?.cancel(); } catch { /* Text remains available. */ }
    this.speaking = false; this.onNarration(null); this.applyMusicVolume();
  }
  stopNarration({ forget = false } = {}) {
    this.cancelCurrent(); this.queue = []; this.index = 0;
    if (forget) this.lastCue = null;
    this.notify();
  }

  narrate(lines, { role = 'narrator', key = '' } = {}) {
    const list = Array.isArray(lines) ? lines : [lines];
    this.stopNarration();
    this.lastCue = { lines: list.map(line => typeof line === 'string' ? line : { ...line }), role, key };
    const clips = this.recordings[key];
    const entry = (text, speaker, recording) => ({ text, role: speaker in VOICE_ROLES ? speaker : 'narrator',
      ...(typeof recording === 'string' && recording ? { recording } : {}) });
    this.queue = typeof clips === 'string' && clips ?
      [entry(list.map(line => typeof line === 'string' ? line : line?.text ?? '').join(' '), role, clips)] :
      list.flatMap((line, index) => {
        const text = typeof line === 'string' ? line : line?.text ?? '';
        const speaker = typeof line === 'string' ? role : line?.role ?? role;
        const recording = Array.isArray(clips) ? clips[index] : null;
        return typeof recording === 'string' && recording ? [entry(text, speaker, recording)] :
          speechChunks(text).map(chunk => entry(chunk, speaker));
      });
    this.index = 0;
    return this.speakNext();
  }
  replay() {
    if (!this.lastCue) return false;
    const cue = this.lastCue;
    return this.narrate(cue.lines, { role: cue.role, key: cue.key });
  }

  speakNext() {
    if (!this.supportsNarration || !this.unlocked || this.paused || this.disposed ||
      this.settings.muted || !this.settings.narrationEnabled || this.settings.narrationVolume === 0) {
      this.speaking = false; this.onNarration(null); this.applyMusicVolume(); this.notify(); return false;
    }
    // Recorded scenes still work on devices with no speech synthesis API.
    while (!this.supportsSpeech && this.queue[this.index] && !this.queue[this.index].recording) this.index++;
    const line = this.queue[this.index];
    if (!line) { this.speaking = false; this.onNarration(null); this.applyMusicVolume(); this.notify(); return false; }
    this.clearSpeechTimers();
    if (line.recording && this.context && this.fetcher) {
      this.speaking = true;
      this.onNarration({ ...line, label: VOICE_ROLES[line.role].label }); this.applyMusicVolume(); this.notify();
      this.playRecording(line, this.token); return true;
    }
    if (line.recording) return this.fallbackRecording(line);
    const token = this.token, utterance = new this.Utterance(line.text), profile = VOICE_ROLES[line.role];
    const voice = this.selectedVoice();
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang ?? 'en-US'; utterance.rate = profile.rate;
    utterance.pitch = profile.pitch; utterance.volume = this.settings.narrationVolume;
    this.utterance = utterance; this.speaking = true;
    this.onNarration({ ...line, label: profile.label }); this.applyMusicVolume(); this.notify();
    const current = () => this.token === token && this.utterance === utterance && !this.disposed;
    let started = false;
    utterance.onstart = () => { if (current()) { started = true; this.error = ''; this.notify(); } };
    utterance.onend = () => {
      if (!current()) return;
      this.clearSpeechTimers(); this.utterance = null; this.index++; this.speakNext();
    };
    const fail = () => {
      if (!current()) return;
      this.error = 'Voice playback could not start. Choose a voice or use Replay voice; the written text is always available.';
      this.stopNarration();
    };
    utterance.onerror = fail;
    try { this.speech.resume?.(); this.speech.speak(utterance); } catch { fail(); return false; }
    const timer = this.timer(() => { if (current() && !started) fail(); }, 6000);
    timer?.unref?.(); this.timers.push(timer);
    const watchdog = this.timer(() => { if (current()) fail(); }, Math.max(20000, line.text.length * 220 + 8000));
    watchdog?.unref?.(); this.timers.push(watchdog);
    return true;
  }

  async recordingBuffer(url) {
    if (!this.recordingBuffers.has(url)) {
      const loading = (async () => {
        const response = await this.fetcher(url);
        if (!response.ok) throw Error('Unable to load narration.');
        return await this.context.decodeAudioData(await response.arrayBuffer());
      })();
      this.recordingBuffers.set(url, loading);
      loading.catch(() => { if (this.recordingBuffers.get(url) === loading) this.recordingBuffers.delete(url); });
    }
    return await this.recordingBuffers.get(url);
  }
  fallbackRecording(line) {
    this.clearSpeechTimers(); this.releaseRecording(); this.recordingOffset = 0;
    this.recordingBuffers.delete(line.recording);
    this.error = 'A narration recording could not load. Available browser voices will read the written text.';
    const fallback = speechChunks(line.text).map(text => ({ text, role: line.role }));
    this.queue.splice(this.index, 1, ...fallback);
    return this.speakNext();
  }
  async playRecording(line, token) {
    const current = () => this.token === token && this.queue[this.index] === line && !this.paused && !this.disposed;
    const timeout = this.timer(() => { if (current()) this.fallbackRecording(line); }, 8000);
    timeout?.unref?.(); this.timers.push(timeout);
    try {
      const buffer = await this.recordingBuffer(line.recording);
      if (!current()) return;
      this.clearSpeechTimers();
      const offset = Math.min(this.recordingOffset, buffer.duration);
      if (offset >= buffer.duration) { this.recordingOffset = 0; this.index++; this.speakNext(); return; }
      const source = this.context.createBufferSource(), gain = this.context.createGain();
      source.buffer = buffer; source.loop = false; gain.gain.value = this.settings.narrationVolume;
      source.connect(gain); gain.connect(this.context.destination);
      this.recording = { source, gain, offset, startedAt: this.context.currentTime };
      source.onended = () => {
        if (!current() || this.recording?.source !== source) return;
        this.releaseRecording(); this.recordingOffset = 0; this.index++; this.speakNext();
      };
      source.start(0, offset); this.error = ''; this.notify();
    } catch { if (current()) this.fallbackRecording(line); }
  }

  pause() {
    if (this.paused || this.disposed) return;
    this.paused = true;
    // Speech resumes at its short chunk; recordings resume at the exact offset.
    this.cancelCurrent({ preserveRecording: true });
    try { Promise.resolve(this.context?.suspend()).catch(() => {}); } catch { /* Audio is optional. */ }
    this.notify();
  }
  resume() {
    const wasPaused = this.paused; this.paused = false;
    if (this.disposed) return;
    if (this.unlocked && this.context) {
      try { Promise.resolve(this.context.resume()).catch(() => {}); } catch { /* Audio is optional. */ }
    }
    this.startDesiredMusic();
    if (wasPaused && this.queue.length) this.speakNext();
    this.notify();
  }
  dispose() {
    if (this.disposed) return;
    this.stopNarration({ forget: true }); this.disposed = true; this.musicRequest++;
    this.speech?.removeEventListener?.('voiceschanged', this.voiceListener);
    for (const item of [this.currentMusic, ...this.retiring]) if (item) {
      try { item.source.stop(); } catch { /* An old fade may already have ended. */ }
      item.source.disconnect(); item.gain.disconnect();
    }
    this.currentMusic = null; this.retiring.clear();
    try { Promise.resolve(this.context?.close()).catch(() => {}); } catch { /* Page is closing. */ }
  }
}
