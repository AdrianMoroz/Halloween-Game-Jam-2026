// Application-flow checks in a small DOM model. These do not render CSS or WebGL.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as engine from '../src/game.js';
import * as content from '../src/content.js';

class Element {
  constructor(tag, attributes = {}) {
    this.tag = tag; this.attributes = attributes; this.id = attributes.id;
    this.dataset = Object.fromEntries(Object.entries(attributes).filter(([name]) => name.startsWith('data-')).map(([name, value]) => [name.slice(5).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase()), value]));
    this.hidden = 'hidden' in attributes; this.disabled = 'disabled' in attributes;
    this.value = attributes.value ?? ''; this.checked = 'checked' in attributes;
    this.style = {}; this.children = []; this.textContent = ''; this._html = '';
    this.classList = { toggle() {} };
  }
  set innerHTML(value) { this._html = value; this.children = parse(value); }
  get innerHTML() { return this._html; }
  setAttribute(name, value) { this.attributes[name] = value; }
  getAttribute(name) { return this.attributes[name]; }
  querySelectorAll(selector) { return flatten(this.children).filter(element => matches(element, selector)); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  focus() {}
  setPointerCapture() {}
}
function parse(html) {
  return [...html.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*)>/gi)].map(match => {
    const attributes = {};
    for (const value of match[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g)) attributes[value[1]] = value[2] ?? '';
    return new Element(match[1], attributes);
  });
}
function flatten(elements) { return elements.flatMap(element => [element, ...flatten(element.children)]); }
function matches(element, selector) {
  if (selector === 'button:not(:disabled)') return element.tag === 'button' && !element.disabled;
  const attribute = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(selector);
  return attribute ? attribute[1] in element.attributes && (attribute[2] === undefined || element.attributes[attribute[1]] === attribute[2]) : false;
}

function app(initialSave = null) {
  const base = parse(readFileSync(new URL('../index.html', import.meta.url), 'utf8'));
  const events = {}, storage = new Map();
  if (initialSave) storage.set('last-disciple-campaign-v1', JSON.stringify(initialSave));
  const document = {
    body: new Element('body'), hidden: false,
    getElementById: id => flatten(base).find(element => element.id === id) || null,
    querySelectorAll: selector => flatten(base).filter(element => matches(element, selector)),
    querySelector: selector => flatten(base).find(element => matches(element, selector)) || null,
    addEventListener: (name, callback) => { events[name] = callback; },
  };
  class FakeView {
    setGame(game, demo) { this.game = game; this.demo = demo; }
    resize() {} flash() {} render() {}
  }
  class FakeAudio {
    constructor(options) {
      this.options = options; this.settings = { musicVolume: .48, narrationVolume: .9, narrationEnabled: true, muted: false, voiceURI: '' };
      this.supportsNarration = true; this.lastCue = null; this.speaking = false; this.error = ''; this.paused = false;
    }
    englishVoices() { return []; }
    update() { this.options.onStatus(this); }
    unlock() { this.unlocked = true; }
    setMusic(mode) { this.music = mode; }
    narrate(lines, options) { this.lastCue = { lines, options }; this.speaking = true; this.update(); }
    stopNarration({ forget = false } = {}) { this.speaking = false; if (forget) this.lastCue = null; this.options.onNarration(null); this.update(); }
    replay() { this.speaking = true; this.update(); }
    pause() { this.paused = true; }
    resume() { this.paused = false; }
    setMusicVolume(value) { this.settings.musicVolume = value; this.update(); }
    setNarrationVolume(value) { this.settings.narrationVolume = value; this.update(); }
    setNarrationEnabled(value) { this.settings.narrationEnabled = value; if (!value) this.speaking = false; this.update(); }
    setVoice(value) { this.settings.voiceURI = value; this.update(); }
    setMuted(value) { this.settings.muted = value; if (value) this.speaking = false; this.update(); }
  }
  const context = vm.createContext({ ...engine, ...content, GameView: FakeView, AudioManager: FakeAudio, document,
    window: { addEventListener() {} }, performance: { now: () => 0 }, requestAnimationFrame() {},
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) }, console,
  });
  const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8').replace(/^import .*?;\s*$/gm, '');
  vm.runInContext(source, context, { filename: 'main.js' });
  return { context, document, storage, events, get: id => document.getElementById(id),
    evaluate: code => vm.runInContext(code, context),
    click(id) { const element = document.getElementById(id); assert.ok(element, `Missing button ${id}`); assert.equal(element.disabled, false); element.onclick(); },
  };
}
function launch(app) { app.click('new-run'); app.click('story-next'); app.click('launch'); }
function complete(app, kills = 0) {
  app.evaluate(`game.guards.slice(0, ${kills}).forEach(guard => game.killGuard(guard, true)); game.state = 'complete'; game.emit('complete'); handleEvents();`);
}

test('title, prologue, loadout, and launch connect to a playable simulation', () => {
  const ui = app(); assert.equal(ui.evaluate('screen'), 'title');
  ui.click('new-run'); assert.equal(ui.evaluate('screen'), 'story');
  ui.click('story-next'); assert.equal(ui.evaluate('screen'), 'loadout');
  assert.equal(ui.document.querySelectorAll('[data-skill]').length, 7);
  assert.equal(ui.document.querySelector('[data-skill="knight"]').disabled, true);
  ui.click('launch'); assert.equal(ui.evaluate('screen'), 'game');
  assert.equal(ui.evaluate('game.guards.length'), 4); assert.equal(ui.get('overlay').hidden, true);
  assert.equal(ui.document.querySelectorAll('[data-slot]').length, 4);
});

test('loadout launch is disabled until exactly four skills are selected', () => {
  const ui = app(); ui.click('new-run'); ui.click('story-next');
  ui.document.querySelector('[data-skill="miasma"]').onclick();
  assert.equal(ui.get('launch').disabled, true); assert.equal(ui.get('selection-count').textContent, '3 / 4 equipped');
  ui.document.querySelector('[data-skill="miasma"]').onclick();
  assert.equal(ui.get('launch').disabled, false);
});

test('pause, resume, keyboard casting, and restart keep application state consistent', () => {
  const ui = app(); launch(ui); ui.click('pause-button');
  assert.equal(ui.evaluate('screen'), 'pause'); ui.click('resume'); assert.equal(ui.evaluate('screen'), 'game');
  ui.events.keydown({ code: 'Digit1', repeat: false, preventDefault() {} });
  assert.equal(ui.evaluate('game.castsLeft'), 7);
  ui.events.keydown({ code: 'KeyR', repeat: false, preventDefault() {} });
  assert.equal(ui.evaluate('game.castsLeft'), 8); assert.equal(ui.evaluate('run.killed'), 0);
});

test('successful ascent opens upgrades, unlocks new spells, and preserves committed kills', () => {
  const ui = app(); launch(ui); complete(ui, 2);
  assert.equal(ui.evaluate('screen'), 'story'); assert.equal(ui.evaluate('run.killed'), 2);
  ui.click('transition-next'); assert.equal(ui.evaluate('screen'), 'upgrades');
  ui.document.querySelector('[data-upgrade="maxHP"]').onclick();
  assert.equal(ui.evaluate('run.stats.maxHP'), 2);
  ui.click('upgrade-next'); assert.equal(ui.evaluate('screen'), 'loadout');
  assert.equal(ui.document.querySelector('[data-skill="knight"]').disabled, false);
  ui.click('launch'); assert.equal(ui.evaluate('game.level.id'), 'middle');
  assert.equal(ui.evaluate('game.player.hp'), 2); assert.equal(ui.evaluate('run.killed'), 2);
  assert.equal(ui.evaluate('validRun(run)'), true);
});

test('returning to title can resume a saved campaign at its current level', () => {
  const ui = app(); launch(ui); complete(ui, 2); ui.click('transition-next'); ui.click('upgrade-next'); ui.click('launch');
  const save = JSON.parse(ui.storage.get('last-disciple-campaign-v1'));
  const reopened = app(save); reopened.click('continue-run');
  assert.equal(reopened.evaluate('screen'), 'loadout'); reopened.click('launch');
  assert.equal(reopened.evaluate('game.level.id'), 'middle'); assert.equal(reopened.evaluate('run.killed'), 2);
});

test('a high-kill campaign reaches the immortal branch and retries the same nightmare', () => {
  const ui = app(); launch(ui);
  for (let index = 0; index < 3; index++) {
    complete(ui, content.LEVELS[index].guards.length); ui.click('transition-next'); ui.click('upgrade-next');
    if (index < 2) ui.click('launch');
  }
  assert.equal(ui.evaluate('screen'), 'story'); assert.ok(ui.get('overlay').innerHTML.includes('Yin Ghost General'));
  assert.ok(ui.get('overlay').innerHTML.includes('Everyone I care for is dead'));
  ui.click('revelation-next'); ui.click('launch');
  assert.equal(ui.evaluate('game.boss.immune'), true); assert.equal(ui.get('boss-hud').hidden, false);
  ui.evaluate("game.damagePlayer(999); handleEvents();");
  assert.equal(ui.evaluate('screen'), 'death'); assert.ok(ui.get('overlay').innerHTML.includes('AN ENDLESS NIGHTMARE'));
  ui.click('retry'); assert.equal(ui.evaluate('game.boss.immune'), true); assert.equal(ui.evaluate('run.total'), 18);
});

test('a spared campaign can finish the mortal boss and clears its finished save', () => {
  const run = engine.freshRun();
  for (const level of content.LEVELS) { const game = new engine.Game(level); game.state = 'complete'; engine.commitLevel(run, game); }
  run.phase = 'revelation';
  const ui = app(run); ui.click('continue-run'); ui.click('revelation-next'); ui.click('launch');
  assert.equal(ui.evaluate('game.boss.immune'), false);
  ui.evaluate('game.damageBoss(1000); handleEvents();');
  assert.equal(ui.evaluate('screen'), 'ending'); assert.equal(ui.storage.has('last-disciple-campaign-v1'), false);
});

test('opening narration starts from user interaction and stops when the story is skipped', () => {
  const ui = app(); ui.click('new-run');
  assert.equal(ui.evaluate('audio.unlocked'), true); assert.equal(ui.evaluate('audio.lastCue.options.key'), 'opening');
  assert.equal(ui.get('skip-narration').disabled, false);
  ui.click('skip-narration'); assert.equal(ui.evaluate('audio.speaking'), false);
  ui.click('replay-narration'); assert.equal(ui.evaluate('audio.speaking'), true);
  ui.click('story-next'); assert.equal(ui.evaluate('audio.lastCue'), null);
});

test('sound settings stop simulation, retain independent volume values, and can mute everything', () => {
  const ui = app(); launch(ui); ui.click('sound-button');
  let focusReturns = 0; ui.get('scene').focus = () => focusReturns++;
  assert.equal(ui.evaluate('settingsOpen'), true);
  const before = ui.evaluate('game.time'); ui.evaluate('frame(120)'); assert.equal(ui.evaluate('game.time'), before);
  ui.get('music-volume').value = '25'; ui.get('music-volume').oninput();
  ui.get('narration-volume').value = '70'; ui.get('narration-volume').oninput();
  assert.equal(ui.evaluate('audio.settings.musicVolume'), .25); assert.equal(ui.evaluate('audio.settings.narrationVolume'), .7);
  ui.click('mute-all'); assert.equal(ui.evaluate('audio.settings.muted'), true);
  ui.click('close-sound'); assert.equal(ui.evaluate('settingsOpen'), false);
  assert.equal(focusReturns, 1);
});

test('horde and boss events select the matching music, while pause suspends audio', () => {
  const ui = app(); launch(ui); assert.equal(ui.evaluate('audio.music'), 'stealth');
  ui.evaluate('game.triggerHorde(); handleEvents();'); assert.equal(ui.evaluate('audio.music'), 'horde');
  ui.click('pause-button'); assert.equal(ui.evaluate('audio.paused'), true);
  ui.click('resume'); assert.equal(ui.evaluate('audio.paused'), false); assert.equal(ui.evaluate('audio.music'), 'horde');
  ui.evaluate('run.levelIndex = 3; startLevel();'); assert.equal(ui.evaluate('audio.music'), 'boss');
});

test('disabling narration leaves the written prologue and gameplay available', () => {
  const ui = app(); ui.click('sound-button');
  ui.get('narration-enabled').checked = false; ui.get('narration-enabled').onchange();
  assert.equal(ui.evaluate('audio.settings.narrationEnabled'), false);
  ui.click('close-sound'); ui.click('new-run');
  assert.ok(ui.get('overlay').innerHTML.includes(content.OPENING[0])); ui.click('story-next'); ui.click('launch');
  assert.equal(ui.evaluate('screen'), 'game');
});
