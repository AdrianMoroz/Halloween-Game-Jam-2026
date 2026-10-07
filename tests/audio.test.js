import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioManager, MUSIC_TRACKS, SOUND_SETTINGS_KEY, soundSettings, speechChunks } from '../src/audio.js';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const flush = () => new Promise(resolve => setImmediate(resolve));

function environment({ unsupported = false, speechUnsupported = false, blockedStorage = false, fetcher, recordings } = {}) {
  const data = new Map(), timers = new Map(), events = {}, sources = [], contexts = [], requests = [];
  let timerId = 0;
  class Param {
    constructor() { this.value = 1; this.ramps = []; }
    cancelAndHoldAtTime() {}
    cancelScheduledValues() {}
    setValueAtTime(value) { this.value = value; }
    linearRampToValueAtTime(value, time) { this.value = value; this.ramps.push([value, time]); }
  }
  class Context {
    constructor() { this.state = 'suspended'; this.currentTime = 0; this.destination = {}; contexts.push(this); }
    createGain() { return { gain: new Param(), connect() {}, disconnect() {} }; }
    createBufferSource() {
      const source = { connect() {}, disconnect() { this.disconnected = true; },
        start(when = 0, offset = 0) { this.started = true; this.offset = offset; }, stop(time) { this.stopped = time ?? true; } };
      sources.push(source); return source;
    }
    async resume() { this.state = 'running'; }
    async suspend() { this.state = 'suspended'; }
    async close() { this.state = 'closed'; }
    async decodeAudioData(bytes) { return { bytes, duration: 30 }; }
  }
  class Utterance { constructor(text) { this.text = text; } }
  const speech = {
    voices: [{ voiceURI: 'english', name: 'David', lang: 'en-US', default: true, localService: true }],
    history: [], cancelCount: 0, current: null,
    getVoices() { return this.voices; },
    addEventListener(name, callback) { events[name] = callback; },
    removeEventListener(name) { delete events[name]; },
    speak(utterance) { this.history.push(utterance); this.current = utterance; utterance.onstart?.(); },
    cancel() { this.cancelCount++; this.current = null; }, resume() {},
    finish() { const current = this.current; this.current = null; current?.onend?.(); },
  };
  const host = {
    AudioContext: unsupported ? undefined : Context,
    speechSynthesis: unsupported || speechUnsupported ? undefined : speech,
    SpeechSynthesisUtterance: unsupported || speechUnsupported ? undefined : Utterance,
    localStorage: { getItem: key => data.get(key) ?? null, setItem(key, value) { if (blockedStorage) throw Error('disabled'); data.set(key, value); } },
    fetch: async url => { requests.push(url); return fetcher ? await fetcher(url) : { ok: true, arrayBuffer: async () => new ArrayBuffer(8) }; },
    setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
  };
  const captions = [], status = [];
  const manager = new AudioManager({ host, recordings, onNarration: line => captions.push(line), onStatus: audio => status.push(audio.error) });
  return { manager, host, data, timers, events, sources, contexts, requests, speech, captions, status };
}

test('every declared music track is bundled and nonempty', () => {
  for (const url of Object.values(MUSIC_TRACKS)) {
    const path = fileURLToPath(url); assert.equal(existsSync(path), true);
    assert.ok(readFileSync(path).length > 10000);
  }
});

test('audio does not create a context or play speech before user activation', async () => {
  const env = environment(); env.manager.setMusic('stealth'); env.manager.narrate('The mountain awaits.'); await flush();
  assert.equal(env.contexts.length, 0); assert.equal(env.speech.history.length, 0);
  assert.equal(env.manager.speaking, false);
  env.manager.unlock(); await flush();
  assert.equal(env.contexts.length, 1); assert.equal(env.contexts[0].state, 'running');
  assert.equal(env.sources[0].loop, true);
});

test('music switches crossfade old sources and reuse decoded buffers', async () => {
  const env = environment(); env.manager.unlock(); await flush();
  const previous = env.manager.currentMusic;
  await env.manager.setMusic('horde');
  assert.equal(env.manager.currentMusic.mode, 'horde'); assert.equal(previous.source.stopped, 1.25);
  assert.equal(previous.gain.gain.value, 0); assert.equal(env.manager.currentMusic.gain.gain.value, 1);
  await env.manager.setMusic('stealth');
  assert.equal(env.requests.filter(url => url === MUSIC_TRACKS.stealth).length, 1);
  assert.equal(env.sources.length, 3);
});

test('late music loads cannot replace the newer requested mode', async () => {
  const gates = new Map();
  const env = environment({ fetcher: url => new Promise(resolve => gates.set(url, resolve)) });
  env.manager.unlock(); const incoming = env.manager.setMusic('horde');
  gates.get(MUSIC_TRACKS.horde)({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
  await incoming; assert.equal(env.manager.currentMusic.mode, 'horde');
  gates.get(MUSIC_TRACKS.stealth)({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
  await flush(); assert.equal(env.manager.currentMusic.mode, 'horde'); assert.equal(env.sources.length, 1);
});

test('speech lowers music volume and restores it when the last phrase ends', async () => {
  const env = environment(); env.manager.unlock(); await flush();
  env.manager.narrate('Your ascent begins.');
  assert.equal(env.manager.musicBus.gain.value, .48 * .24);
  assert.equal(env.captions.at(-1).text, 'Your ascent begins.');
  env.speech.finish(); assert.equal(env.manager.speaking, false); assert.equal(env.manager.musicBus.gain.value, .48);
  assert.equal(env.timers.size, 0);
});

test('a new scene cancels speech; stale end events cannot resurrect the old queue', () => {
  const env = environment(); env.manager.unlock();
  env.manager.narrate(['Old first phrase.', 'Old second phrase.']); const old = env.speech.current;
  env.manager.narrate('The new scene.'); old.onend();
  assert.equal(env.speech.current.text, 'The new scene.'); assert.equal(env.speech.history.length, 2);
  env.manager.stopNarration({ forget: true }); env.speech.history.at(-1).onend();
  assert.equal(env.manager.lastCue, null); assert.equal(env.manager.speaking, false);
});

test('skip retains the replay cue and replay starts it again', () => {
  const env = environment(); env.manager.unlock(); env.manager.narrate('A promise of vengeance.', { key: 'intro' });
  env.manager.stopNarration(); assert.equal(env.manager.speaking, false);
  assert.equal(env.manager.lastCue.key, 'intro'); assert.equal(env.manager.replay(), true);
  assert.equal(env.speech.current.text, 'A promise of vengeance.');
});

test('pause suspends music and resumes only the interrupted short speech chunk', async () => {
  const env = environment(); env.manager.unlock(); await flush();
  env.manager.narrate(['First phrase.', 'Second phrase.']);
  env.manager.pause(); assert.equal(env.contexts[0].state, 'suspended'); assert.equal(env.manager.speaking, false);
  env.manager.resume(); assert.equal(env.contexts[0].state, 'running'); assert.equal(env.speech.current.text, 'First phrase.');
  env.speech.finish(); assert.equal(env.speech.current.text, 'Second phrase.');
});

test('disabling narration or muting immediately cancels the voice and restores music mixing', async () => {
  const env = environment(); env.manager.unlock(); await flush(); env.manager.narrate('The seal must hold.');
  env.manager.setNarrationEnabled(false); assert.equal(env.manager.speaking, false);
  assert.equal(env.manager.musicBus.gain.value, .48);
  env.manager.setNarrationEnabled(true); env.manager.replay(); env.manager.setMuted(true);
  assert.equal(env.manager.musicBus.gain.value, 0); assert.equal(env.manager.speaking, false);
  assert.equal(env.manager.narrate('Muted phrase.'), false);
});

test('music and narration volumes save independently without touching the campaign save', () => {
  const env = environment(); env.manager.setMusicVolume(.2); env.manager.setNarrationVolume(.7);
  env.manager.setVoice('english');
  const settings = JSON.parse(env.data.get(SOUND_SETTINGS_KEY));
  assert.equal(settings.musicVolume, .2); assert.equal(settings.narrationVolume, .7);
  assert.equal(settings.voiceURI, 'english'); assert.equal(env.data.size, 1);
  const reopened = new AudioManager({ host: env.host }); assert.equal(reopened.settings.musicVolume, .2);
});

test('unsupported speech and audio APIs leave a functional silent fallback', () => {
  const env = environment({ unsupported: true });
  assert.doesNotThrow(() => { env.manager.unlock(); env.manager.pause(); env.manager.resume(); });
  assert.equal(env.manager.supportsNarration, false); assert.equal(env.manager.narrate('Written text.'), false);
});

test('unavailable storage cannot break playback or settings controls', () => {
  const env = environment({ blockedStorage: true });
  assert.doesNotThrow(() => { env.manager.setMusicVolume(.3); env.manager.setMuted(true); });
  assert.equal(env.manager.settings.musicVolume, .3);
});

test('voice lists can arrive later, and explicit voice selection survives auto-choice', () => {
  const env = environment(); env.speech.voices = []; env.events.voiceschanged();
  env.manager.unlock(); env.manager.narrate('Default voice.'); assert.equal(env.speech.current.voice, undefined);
  env.speech.voices = [{ voiceURI: 'uk', name: 'Daniel', lang: 'en-GB', localService: true },
    { voiceURI: 'us', name: 'Jane', lang: 'en-US', localService: true }]; env.events.voiceschanged();
  assert.equal(env.manager.englishVoices().length, 2);
  env.manager.setVoice('us'); env.manager.narrate('Selected voice.'); assert.equal(env.speech.current.voice.voiceURI, 'us');
});

test('narrator, disciple, and grandmaster profiles change speech delivery', () => {
  const env = environment(); env.manager.unlock();
  env.manager.narrate([{ text: 'Story.', role: 'narrator' }, { text: 'I am afraid.', role: 'disciple' },
    { text: 'Everyone I care for is dead.', role: 'grandmaster' }]);
  const firstPitch = env.speech.current.pitch; env.speech.finish(); assert.ok(env.speech.current.pitch > firstPitch);
  env.speech.finish(); assert.ok(env.speech.current.pitch < firstPitch);
  assert.equal(env.captions.at(-1).label, 'THE GRANDMASTER');
});

test('speech errors restore music volume instead of leaving it permanently lowered', async () => {
  const env = environment(); env.manager.unlock(); await flush(); env.manager.narrate('An interrupted voice.');
  env.speech.current.onerror({ error: 'not-allowed' });
  assert.equal(env.manager.speaking, false); assert.equal(env.manager.musicBus.gain.value, .48);
  assert.ok(env.manager.error.includes('Voice playback')); assert.equal(env.timers.size, 0);
});

test('a speech engine that never starts times out safely and restores mixing', async () => {
  const env = environment(); env.speech.speak = utterance => { env.speech.current = utterance; };
  env.manager.unlock(); await flush(); env.manager.narrate('No start event.');
  [...env.timers.values()].find(timer => timer.delay === 6000).callback();
  assert.equal(env.manager.speaking, false); assert.equal(env.manager.musicBus.gain.value, .48);
});

test('failed music loads do not throw or stop narration, and the music can be retried', async () => {
  let fail = true;
  const env = environment({ fetcher: async () => ({ ok: !fail, arrayBuffer: async () => new ArrayBuffer(8) }) });
  env.manager.unlock(); await flush(); assert.ok(env.manager.error.includes('music file'));
  assert.equal(env.manager.narrate('The story still speaks.'), true);
  await env.manager.setMusic('stealth'); assert.ok(env.manager.error.includes('music file'));
  fail = false; await env.manager.setMusic('stealth'); assert.equal(env.manager.currentMusic.mode, 'stealth');
  assert.equal(env.manager.error, '');
});

test('settings and speech chunking handle invalid values and long passages', () => {
  const settings = soundSettings({ musicVolume: -10, narrationVolume: 100, voiceURI: {}, muted: 'yes' });
  assert.equal(settings.musicVolume, 0); assert.equal(settings.narrationVolume, 1);
  assert.equal(settings.voiceURI, ''); assert.equal(settings.muted, false);
  const text = ('The sacred prison was quiet. ').repeat(40), chunks = speechChunks(text);
  assert.ok(chunks.length > 1); assert.ok(chunks.every(chunk => chunk.length <= 180));
  assert.equal(chunks.join(' '), text.trim());
});

test('dispose stops music and speech and unregisters voice-list listeners', async () => {
  const env = environment(); env.manager.unlock(); await flush(); await env.manager.setMusic('boss');
  env.manager.narrate('Goodbye.'); env.manager.dispose();
  assert.equal(env.manager.disposed, true); assert.equal(env.contexts[0].state, 'closed');
  assert.equal(env.manager.speaking, false); assert.equal(env.timers.size, 0); assert.equal(env.events.voiceschanged, undefined);
  assert.ok(env.sources.every(source => source.disconnected));
});

test('a full-scene MP3 uses the written script, ducks music, and replaces speech for that cue', async () => {
  const env = environment({ recordings: { opening: 'opening.mp3' } }); env.manager.unlock(); await flush();
  env.manager.narrate(['First passage.', 'Second passage.'], { key: 'opening' }); await flush();
  const recording = env.manager.recording;
  assert.ok(recording); assert.equal(recording.source.loop, false); assert.equal(recording.gain.gain.value, .9);
  assert.equal(env.speech.history.length, 0); assert.equal(env.captions.at(-1).text, 'First passage. Second passage.');
  assert.equal(env.manager.musicBus.gain.value, .48 * .24); assert.ok(env.requests.includes('opening.mp3'));
  recording.source.onended(); assert.equal(env.manager.speaking, false); assert.equal(env.manager.musicBus.gain.value, .48);
  assert.equal(recording.source.disconnected, true); assert.equal(env.timers.size, 0);
});

test('per-passage clips can mix recorded speakers and browser voices in order', async () => {
  const env = environment({ recordings: { scene: ['narrator.mp3', null, 'master.mp3'] } });
  env.manager.unlock(); await flush();
  env.manager.narrate([{ text: 'The mountain.', role: 'narrator' }, { text: 'The watchman.', role: 'disciple' },
    { text: 'My sect.', role: 'grandmaster' }], { key: 'scene' }); await flush();
  env.manager.recording.source.onended(); assert.equal(env.speech.current.text, 'The watchman.');
  assert.equal(env.captions.at(-1).label, 'A DISCIPLE'); env.speech.finish(); await flush();
  assert.ok(env.requests.includes('master.mp3')); assert.equal(env.captions.at(-1).label, 'THE GRANDMASTER');
  env.manager.recording.source.onended(); assert.equal(env.manager.speaking, false);
});

test('recordings wait for user activation and replay reuses the decoded clip', async () => {
  const env = environment({ recordings: { opening: 'opening.mp3' } });
  assert.equal(env.manager.narrate('The prologue.', { key: 'opening' }), false); await flush();
  assert.equal(env.requests.length, 0); env.manager.unlock(); await flush(); env.manager.replay(); await flush();
  env.manager.recording.source.onended(); env.manager.replay(); await flush();
  assert.equal(env.requests.filter(url => url === 'opening.mp3').length, 1);
  assert.equal(env.manager.recording.source.offset, 0);
});

test('recorded narration resumes at its paused offset and replay starts from the beginning', async () => {
  const env = environment({ recordings: { opening: 'opening.mp3' } }); env.manager.unlock(); await flush();
  env.manager.narrate('A long prologue.', { key: 'opening' }); await flush();
  const previous = env.manager.recording, staleEnd = previous.source.onended;
  env.contexts[0].currentTime = 5; env.manager.pause();
  assert.equal(previous.source.disconnected, true); assert.equal(env.contexts[0].state, 'suspended');
  env.manager.resume(); await flush(); assert.equal(env.manager.recording.source.offset, 5);
  const resumed = env.manager.recording; staleEnd(); assert.equal(env.manager.recording, resumed);
  env.manager.stopNarration(); env.manager.replay(); await flush();
  assert.equal(env.manager.recording.source.offset, 0); assert.equal(env.requests.filter(url => url === 'opening.mp3').length, 1);
});

test('a missing MP3 falls back to speech without changing the script or preventing retry', async () => {
  let missing = true;
  const env = environment({ recordings: { opening: 'opening.mp3' },
    fetcher: async url => ({ ok: url !== 'opening.mp3' || !missing, arrayBuffer: async () => new ArrayBuffer(8) }) });
  env.manager.unlock(); await flush(); env.manager.narrate('The written prologue.', { key: 'opening' }); await flush();
  assert.equal(env.speech.current.text, 'The written prologue.'); assert.equal(env.manager.recording, null);
  env.speech.finish(); assert.equal(env.manager.musicBus.gain.value, .48);
  missing = false; env.manager.replay(); await flush(); assert.ok(env.manager.recording);
  assert.equal(env.requests.filter(url => url === 'opening.mp3').length, 2);
});

test('a canceled recording load cannot start playback over a newer scene', async () => {
  let resolveClip;
  const env = environment({ recordings: { old: 'old.mp3' }, fetcher: url => url === 'old.mp3' ?
    new Promise(resolve => { resolveClip = resolve; }) : { ok: true, arrayBuffer: async () => new ArrayBuffer(8) } });
  env.manager.unlock(); await flush(); env.manager.narrate('Old scene.', { key: 'old' });
  env.manager.narrate('New scene.'); resolveClip({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }); await flush();
  assert.equal(env.manager.recording, null); assert.equal(env.speech.current.text, 'New scene.');
  assert.equal(env.sources.length, 1); assert.equal(env.timers.size, 2);
});

test('recording volume, mute, and disposal apply independently from music and release sources', async () => {
  const env = environment({ recordings: { opening: 'opening.mp3' } }); env.manager.unlock(); await flush();
  env.manager.narrate('Recorded prologue.', { key: 'opening' }); await flush();
  const source = env.manager.recording.source; env.manager.setNarrationVolume(.3);
  assert.equal(env.manager.recording.gain.gain.value, .3); assert.equal(env.manager.settings.musicVolume, .48);
  env.manager.setMuted(true); assert.equal(source.disconnected, true); assert.equal(env.manager.recording, null);
  assert.equal(env.manager.musicBus.gain.value, 0);
  env.manager.setMuted(false); env.manager.replay(); await flush(); const replayed = env.manager.recording.source;
  env.manager.dispose(); assert.equal(replayed.disconnected, true); assert.equal(env.contexts[0].state, 'closed');
});

test('recordings work without speech synthesis and a failed recording still leaves sound usable', async () => {
  const env = environment({ speechUnsupported: true, recordings: { opening: 'opening.mp3' } });
  assert.equal(env.manager.supportsSpeech, false); assert.equal(env.manager.supportsNarration, true);
  env.manager.unlock(); await flush(); env.manager.narrate('Recorded scene.', { key: 'opening' }); await flush();
  assert.ok(env.manager.recording); env.manager.recording.source.onended();
  assert.equal(env.manager.speaking, false); assert.equal(env.manager.musicBus.gain.value, .48);
  env.manager.narrate('Unrecorded text.'); assert.equal(env.manager.speaking, false);
});

test('stalled recording loads time out to speech and late completions cannot revive playback', async () => {
  let resolveClip;
  const env = environment({ recordings: { opening: 'opening.mp3' }, fetcher: url => url === 'opening.mp3' ?
    new Promise(resolve => { resolveClip = resolve; }) : { ok: true, arrayBuffer: async () => new ArrayBuffer(8) } });
  env.manager.unlock(); await flush(); env.manager.narrate('The prologue.', { key: 'opening' });
  [...env.timers.values()].find(timer => timer.delay === 8000).callback();
  assert.equal(env.speech.current.text, 'The prologue.');
  resolveClip({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }); await flush();
  assert.equal(env.manager.recording, null); assert.equal(env.sources.length, 1);
  env.speech.finish(); assert.equal(env.manager.musicBus.gain.value, .48);
});
