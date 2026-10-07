import { Game, FIXED_STEP, freshRun, buyUpgrade, commitLevel, validRun, DISPOSAL_SECONDS } from './game.js';
import { GameView } from './view.js';
import { AudioManager } from './audio.js';
import { LEVELS, BOSS_LEVEL, SKILLS, SKILL_BY_ID, DEFAULT_STATS, DEFAULT_LOADOUT, UPGRADES, OPENING, REVELATION } from './content.js';

const $ = id => document.getElementById(id);
const SAVE_KEY = 'last-disciple-campaign-v1';
const movementKeys = { KeyW: 'north', ArrowUp: 'north', KeyD: 'east', ArrowRight: 'east',
  KeyS: 'south', ArrowDown: 'south', KeyA: 'west', ArrowLeft: 'west' };
let run = freshRun(), game, view, screen = 'title', lastTime = performance.now(), accumulator = 0;
let savedRun = null, held = new Map(), shiftHeld = false, toastUntil = 0, whisperUntil = 0, hudTime = 0;
let settingsOpen = false, voiceSignature = '', currentVoiceCaption = null;
const audio = new AudioManager({ onNarration: narrationCaption, onStatus: updateSoundControls });

function narrationCaption(line) {
  currentVoiceCaption = line;
  document.body.dataset.speaking = String(Boolean(line));
  $('voice-caption').hidden = !line || screen !== 'game';
  if (line) { $('voice-speaker').textContent = line.label; $('voice-text').textContent = line.text; }
}
function escapeText(value) { return String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]); }
function updateSoundControls() {
  const settings = audio.settings;
  $('sound-button').textContent = settings.muted ? '♪ Sound off' : '♪ Sound';
  $('replay-narration').disabled = !audio.lastCue || !audio.supportsNarration || settings.muted || !settings.narrationEnabled;
  $('skip-narration').disabled = !audio.speaking;
  $('music-volume').value = String(Math.round(settings.musicVolume * 100));
  $('music-volume-value').textContent = `${Math.round(settings.musicVolume * 100)}%`;
  $('narration-volume').value = String(Math.round(settings.narrationVolume * 100));
  $('narration-volume-value').textContent = `${Math.round(settings.narrationVolume * 100)}%`;
  $('narration-enabled').checked = settings.narrationEnabled;
  $('narration-enabled').disabled = !audio.supportsNarration;
  $('test-voice').disabled = !audio.supportsNarration || settings.muted || !settings.narrationEnabled;
  $('mute-all').textContent = settings.muted ? 'Unmute all' : 'Mute all';
  const voices = audio.englishVoices(), signature = voices.map(voice => voice.voiceURI).join('|');
  if (signature !== voiceSignature) {
    voiceSignature = signature;
    $('voice-select').innerHTML = '<option value="">Automatic English voice</option>' + voices.map(voice => `<option value="${escapeText(voice.voiceURI)}">${escapeText(voice.name)} · ${escapeText(voice.lang)}</option>`).join('');
  }
  $('voice-select').value = settings.voiceURI;
  $('voice-select').disabled = !audio.supportsNarration || !voices.length;
  $('audio-status').textContent = audio.error || (audio.supportsNarration ? 'Narration uses your browser’s available voices. Story text remains on screen.' : 'Voice playback is unavailable in this browser. The written story remains available.');
}
function closeSoundSettings(restoreFocus = false) {
  settingsOpen = false; $('sound-settings').hidden = true; $('sound-button').setAttribute('aria-expanded', 'false');
  held.clear(); shiftHeld = false; accumulator = 0;
  if (restoreFocus) $(screen === 'game' ? 'scene' : 'sound-button').focus({ preventScroll: true });
}
function toggleSoundSettings() {
  if (settingsOpen) { closeSoundSettings(true); return; }
  audio.unlock(); settingsOpen = true; held.clear(); shiftHeld = false;
  $('sound-settings').hidden = false; $('sound-button').setAttribute('aria-expanded', 'true');
  updateSoundControls(); $('close-sound').focus({ preventScroll: true });
}

function readSave() {
  try { const value = JSON.parse(localStorage.getItem(SAVE_KEY)); return validRun(value) ? value : null; }
  catch { return null; }
}
function saveRun() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(run)); savedRun = JSON.parse(JSON.stringify(run)); }
  catch { /* Private browsing may disable storage; gameplay still works. */ }
}
function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch { /* Optional persistence. */ } savedRun = null; }

function layout(nextScreen) {
  const wasPaused = screen === 'pause' || screen === 'help';
  screen = nextScreen; document.body.dataset.screen = screen; held.clear(); shiftHeld = false;
  closeSoundSettings();
  if (nextScreen === 'pause' || nextScreen === 'help') audio.pause();
  else if (wasPaused && nextScreen === 'game') audio.resume();
  else { audio.stopNarration({ forget: true }); audio.resume(); }
  const music = nextScreen === 'game' || nextScreen === 'pause' || nextScreen === 'help' ?
    (game?.mode === 'horde' ? 'horde' : game?.boss ? 'boss' : 'stealth') :
    nextScreen === 'death' && game?.boss || nextScreen === 'story' && run.levelIndex >= LEVELS.length ? 'boss' : 'stealth';
  audio.setMusic(music); narrationCaption(currentVoiceCaption);
  const inGame = ['game', 'pause', 'help', 'death', 'ending'].includes(screen);
  $('hud').hidden = !inGame; $('play-footer').hidden = !inGame;
  $('touch-controls').hidden = screen !== 'game';
  $('boss-hud').hidden = !inGame || !game?.boss;
  $('toast').hidden = true; $('whisper').hidden = true;
  view?.resize();
}

function panel(nextScreen, html) {
  layout(nextScreen); $('overlay').hidden = false; $('overlay').innerHTML = html;
  requestAnimationFrame(() => $('overlay').querySelector('button:not(:disabled)')?.focus({ preventScroll: true }));
}

function preview() {
  const demo = new Game(LEVELS[0], DEFAULT_STATS, DEFAULT_LOADOUT);
  view.setGame(demo, true);
}

function title() {
  preview(); savedRun = readSave();
  panel('title', `<section class="hero">
    <div class="hero-copy"><span class="eyebrow">A MARTIAL ARTS STEALTH GAME</span><h1>The Last<br><em>Disciple.</em></h1>
    <div class="gold-rule"></div><p class="hero-intro">One mountain. A stolen heirloom.<br>A debt that only darkness can repay.</p>
    <p class="subtle hero-detail">Ascend the pavilions of the Radiant Yang Sect.<br>Slip through their defenses, or leave no one behind.</p>
    <div class="hero-actions">${savedRun ? '<button id="continue-run" class="primary">Continue ascent <span>↗</span></button>' : ''}<button id="new-run" class="${savedRun ? 'secondary' : 'primary'}">Begin your ascent <span>↗</span></button></div>
    <div class="hero-controls"><span class="tiny-dot"></span> WASD / arrows to move <span class="separator">·</span> 1–4 to cast</div></div>
    <aside class="hero-aside"><div class="vertical-caption">THE NIGHT HAS ONLY JUST BEGUN</div><div class="premise-card"><span class="eyebrow">THE WAY OF YIN</span><p>Move unseen.<br>Strike with intention.<br>Leave nothing to discover.</p><span class="subtle">An alarm is a beginning, too.</span></div><span class="prototype-note">Playable prototype · Three courtyards + summit</span></aside>
  </section>`);
  $('new-run').onclick = () => { audio.unlock(); run = freshRun(); opening(); };
  if ($('continue-run')) $('continue-run').onclick = () => {
    audio.unlock();
    run = JSON.parse(JSON.stringify(savedRun));
    if (run.phase === 'upgrades') upgrades();
    else if (run.phase === 'revelation') revelation();
    else loadout();
  };
}

function opening() {
  panel('story', `<section class="panel story-panel"><span class="eyebrow">PROLOGUE · THE LAST SURVIVOR</span><h2>A promise<br>of vengeance.</h2><div class="crawl">${OPENING.map((text, i) => `<p style="--delay:${i * 0.3}s">${text}</p>`).join('')}</div><button id="story-next" class="primary">Enter the lower courtyards <span>↗</span></button></section>`);
  $('story-next').onclick = () => { saveRun(); loadout(); };
  audio.narrate(OPENING, { key: 'opening' });
}

function skillPattern(skill) {
  const targets = new Set(skill.offsets.map(([forward, right]) => `${right},${-forward}`));
  let html = '<span class="spell-pattern" aria-hidden="true">';
  for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) {
    html += `<i class="${x === 0 && y === 0 ? 'origin' : targets.has(`${x},${y}`) ? 'target' : ''}">${x === 0 && y === 0 ? '↑' : ''}</i>`;
  }
  return html + '</span>';
}

function loadout() {
  run.phase = 'loadout'; saveRun();
  const final = run.levelIndex >= LEVELS.length, level = final ? BOSS_LEVEL : LEVELS[run.levelIndex];
  const selection = new Set(run.loadout);
  panel('loadout', `<section class="panel loadout-panel"><div class="panel-heading"><div><span class="eyebrow">${level.subtitle}</span><h2>Choose your dark arts.</h2><p class="subtle">Equip exactly four skills. Every cast shares one reserve.</p></div><div class="reserve-badge"><strong>${run.stats.maxSpellCasts}</strong><span>CASTS THIS LEVEL</span></div></div>
    <div class="skill-grid">${SKILLS.map(skill => {
      const unlocked = skill.unlock <= run.levelIndex;
      return `<button class="skill-card ${unlocked ? '' : 'locked'}" data-skill="${skill.id}" ${unlocked ? '' : 'disabled'} aria-pressed="${selection.has(skill.id)}" style="--skill-color:${skill.color}"><span class="skill-top"><span class="skill-symbol">${skill.symbol}</span><span class="selection-mark">✓</span></span><strong>${skill.name}</strong><span class="skill-description">${unlocked ? skill.description : `Unlocks after courtyard ${skill.unlock}.`}</span>${skillPattern(skill)}<span class="skill-cost">${unlocked ? '1 CAST' : 'LOCKED'}</span></button>`;
    }).join('')}</div><div class="panel-bottom"><div><strong id="selection-count">4 / 4 equipped</strong><span class="subtle pattern-note">Patterns face north. Shift + direction changes your facing.</span></div><button id="launch" class="primary">${final ? 'Face the grandmaster' : 'Enter the courtyard'} <span>↗</span></button></div></section>`);
  const updateSelection = () => {
    for (const button of document.querySelectorAll('[data-skill]')) button.setAttribute('aria-pressed', String(selection.has(button.dataset.skill)));
    $('selection-count').textContent = `${selection.size} / 4 equipped`; $('launch').disabled = selection.size !== 4;
  };
  for (const button of document.querySelectorAll('[data-skill]')) button.onclick = () => {
    const id = button.dataset.skill;
    if (selection.has(id)) selection.delete(id); else if (selection.size < 4) selection.add(id);
    updateSelection();
  };
  $('launch').onclick = () => { run.loadout = [...selection]; startLevel(); };
  updateSelection();
}

function startLevel() {
  audio.stopNarration({ forget: true });
  run.phase = 'playing'; saveRun();
  const level = run.levelIndex >= LEVELS.length ? BOSS_LEVEL : LEVELS[run.levelIndex];
  game = new Game(level, run.stats, run.loadout, run); view.setGame(game);
  layout('game'); $('overlay').hidden = true; accumulator = 0; $('scene').focus({ preventScroll: true });
  $('level-number').textContent = level.subtitle;
  $('level-name').textContent = level.name;
  $('skill-bar').innerHTML = game.loadout.map((id, index) => {
    const skill = SKILL_BY_ID[id];
    return `<button class="skill-slot" data-slot="${index}" title="${skill.name}: ${skill.description}" style="--skill-color:${skill.color}"><kbd>${index + 1}</kbd><span class="slot-symbol">${skill.symbol}</span><span><strong>${skill.short}</strong><small>1 cast</small></span></button>`;
  }).join('');
  for (const button of document.querySelectorAll('[data-slot]')) {
    button.onclick = () => game.cast(Number(button.dataset.slot));
    button.onpointerenter = () => { view.previewSkill = game.loadout[Number(button.dataset.slot)]; };
    button.onpointerleave = () => { view.previewSkill = null; };
    button.onfocus = button.onpointerenter; button.onblur = button.onpointerleave;
  }
  $('strike-hint').hidden = !game.boss; $('touch-strike').hidden = !game.boss;
  if (game.boss) {
    $('boss-name').textContent = game.boss.immune ? 'THE GRANDMASTER · UNBOUND WRATH' : 'THE RADIANT YANG GRANDMASTER';
    notice(game.boss.immune ? '“Everyone I care for is dead…”' : 'Space: strike one tile ahead. Avoid the red attack tiles.', 6);
    if (game.boss.immune) audio.narrate('Everyone I care for is dead. I have nothing left to lose.', { role: 'grandmaster', key: 'wrath' });
  } else notice('Ascend to the glowing gate. Moving onto a disciple begins an execution.', 6);
  updateHUD();
}

function transition(result) {
  const cleared = LEVELS[run.levelIndex - 1];
  panel('story', `<section class="panel story-panel"><span class="eyebrow">${result.mode === 'horde' ? 'SURVIVED THE SWARM' : 'ASCENT COMPLETE'}</span><h2>Another barrier<br>falls away.</h2><div class="crawl"><p>${cleared.crawl}</p></div><div class="result-row"><span><strong>${result.killed} / ${result.total}</strong> disciples slain</span><span><strong>+${result.points}</strong> upgrade points${result.bonus ? ` · ${result.bonus} from kills` : ''}</span></div><button id="transition-next" class="primary">Shape your power <span>↗</span></button></section>`);
  $('transition-next').onclick = upgrades;
  audio.narrate(cleared.crawl, { key: `transition-${cleared.id}` });
}

function upgrades() {
  panel('upgrades', `<section class="panel upgrade-panel"><div class="panel-heading"><div><span class="eyebrow">BETWEEN PAVILIONS</span><h2>Power answers power.</h2><p class="subtle">Upgrade your body, your senses, or your dark reserve.</p></div><div class="reserve-badge"><strong id="upgrade-points">${run.points}</strong><span>POINTS TO SPEND</span></div></div>
    <div class="upgrade-grid">${UPGRADES.map((upgrade, index) => `<article class="upgrade-card"><span class="upgrade-symbol">${['♡', '↗', '◉', '◌'][index]}</span><span class="eyebrow">${upgrade.name}</span><strong id="value-${upgrade.id}" class="upgrade-value">${run.stats[upgrade.id]}</strong><p>${upgrade.label}</p><button data-upgrade="${upgrade.id}" class="secondary">Upgrade · 1 point</button></article>`).join('')}</div>
    <div class="panel-bottom"><span class="subtle">Unused points carry forward. HP and casts refill next level.</span><button id="upgrade-next" class="primary">${run.levelIndex >= LEVELS.length ? 'Reach the summit' : 'Continue the ascent'} <span>↗</span></button></div></section>`);
  const refresh = () => {
    $('upgrade-points').textContent = run.points;
    for (const upgrade of UPGRADES) {
      $(`value-${upgrade.id}`).textContent = run.stats[upgrade.id];
      const button = document.querySelector(`[data-upgrade="${upgrade.id}"]`);
      button.disabled = run.points < 1 || run.stats[upgrade.id] >= upgrade.cap;
      button.textContent = run.stats[upgrade.id] >= upgrade.cap ? 'Maximum reached' : 'Upgrade · 1 point';
    }
  };
  for (const button of document.querySelectorAll('[data-upgrade]')) button.onclick = () => { buyUpgrade(run, button.dataset.upgrade); saveRun(); refresh(); };
  $('upgrade-next').onclick = () => run.levelIndex >= LEVELS.length ? revelation() : loadout();
  refresh();
}

function revelation() {
  run.phase = 'revelation'; saveRun();
  const immune = run.total > 0 && run.killed / run.total >= 0.9;
  panel('story', `<section class="panel story-panel revelation"><span class="eyebrow">THE SHATTERED SEAL</span><h2>You were<br>breaking <em>out.</em></h2><div class="crawl">${REVELATION.map((text, i) => `<p style="--delay:${i * 0.25}s">${text}</p>`).join('')}<p class="boss-dialogue">${immune ? 'The grandmaster looks past you at the empty courtyards. “Everyone I care for is dead. I have nothing left to lose.” He severs his mortal tethers.' : 'The grandmaster rises. Behind him, the battered sect still lives. He draws his sword.'}</p></div><button id="revelation-next" class="primary">Reclaim your soul-core <span>↗</span></button></section>`);
  $('revelation-next').onclick = loadout;
  const branch = immune ? [
    { text: 'The grandmaster looks past you at the empty courtyards.', role: 'narrator' },
    { text: 'Everyone I care for is dead. I have nothing left to lose.', role: 'grandmaster' },
    { text: 'He severs his mortal tethers.', role: 'narrator' },
  ] : [{ text: 'The grandmaster rises. Behind him, the battered sect still lives. He draws his sword.', role: 'narrator' }];
  audio.narrate([{ text: REVELATION[0], role: 'narrator' }, { text: REVELATION[1], role: 'grandmaster' },
    { text: REVELATION[2], role: 'narrator' }, ...branch], { key: 'revelation' });
}

function pause() {
  if (screen !== 'game') return;
  panel('pause', `<section class="panel compact-panel"><span class="eyebrow">A MOMENT BETWEEN BREATHS</span><h2>Stillness.</h2><div class="stack-actions"><button id="resume" class="primary">Resume ascent</button><button id="restart" class="secondary">Restart this level</button><button id="menu" class="text-button">Return to title</button></div></section>`);
  $('resume').onclick = resume; $('restart').onclick = startLevel; $('menu').onclick = title;
}
function resume() { layout('game'); $('overlay').hidden = true; accumulator = 0; $('scene').focus({ preventScroll: true }); }

function help() {
  if (screen !== 'game') return;
  panel('help', `<section class="panel help-panel"><span class="eyebrow">THE WAY THROUGH</span><h2>Darkness has rules.</h2><div class="help-grid"><p><strong>Move & face</strong>WASD or arrows move one tile at a time. Hold Shift with a direction to face without moving.</p><p><strong>Camera</strong>The close overhead camera follows you. Press C or the camera button for a wide planning view. Fog and guard visibility stay the same.</p><p><strong>Cast</strong>Keys 1–4 cast equipped skills. Hover a skill to preview its pattern. All skills share a limited reserve.</p><p><strong>Execute</strong>Move onto a disciple from outside their sight. Execution locks movement and spells for 2.5 seconds.</p><p><strong>Dispose</strong>Stand still on a corpse for 2 seconds to burn it. Corpses inside another guard’s vision raise an alert.</p><p><strong>Intercept</strong>An alerted guard runs to the nearest reachable boundary. Stop every fleeing witness before they escape.</p><p><strong>Survive</strong>An escaped witness summons the horde. Fog lifts, spells lock, and the glowing exit remains your goal.</p>${game.boss ? '<p><strong>At the summit</strong>Space strikes one tile ahead. Red tiles warn of the grandmaster’s next attack. Soul strikes use no spell casts.</p>' : ''}</div><button id="help-close" class="primary">Return to the courtyard</button></section>`);
  $('help-close').onclick = resume;
}

function death(nightmare) {
  panel('death', `<section class="panel compact-panel ${nightmare ? 'nightmare' : ''}"><span class="eyebrow">${nightmare ? 'AN ENDLESS NIGHTMARE' : 'THE ASCENT ENDS'}</span><h2>${nightmare ? 'His wrath<br>cannot die.' : 'Darkness<br>takes you.'}</h2><p>${nightmare ? 'You extinguished his lineage. He extinguished his mortality. The Yin Ghost General meets the same unkillable fury, again and again.' : 'Your body falls before the summit. The mountain keeps its secret a little longer.'}</p><div class="stack-actions"><button id="retry" class="primary">${nightmare ? 'Enter the nightmare again' : 'Restart this level'}</button><button id="death-menu" class="text-button">Return to title</button></div><span class="subtle">This attempt’s kills and points are reset.</span></section>`);
  $('retry').onclick = startLevel; $('death-menu').onclick = title;
  audio.narrate(nightmare ? 'You extinguished his lineage. He extinguished his mortality. The Yin Ghost General meets the same unkillable fury, again and again.' :
    'Your body falls before the summit. The mountain keeps its secret a little longer.', { key: 'death' });
}

function victory() {
  clearSave();
  panel('ending', `<section class="panel story-panel"><span class="eyebrow">THE SEAL IS BROKEN</span><h2>The soul-core<br>is <em>yours.</em></h2><p>The grandmaster falls. What remains of the Radiant Yang Sect scatters beneath a sky that no longer feels safe.</p><p>There was no justice waiting at the summit. Only your own ancient power, finally whole.</p><div class="result-row"><span><strong>${run.killed} / ${run.total}</strong> disciples slain</span><span><strong>${Math.round(run.killed / Math.max(1, run.total) * 100)}%</strong> of the prison’s watchmen</span></div><button id="ending-menu" class="primary">Return to title <span>↗</span></button></section>`);
  $('ending-menu').onclick = title;
  audio.narrate(['The grandmaster falls. What remains of the Radiant Yang Sect scatters beneath a sky that no longer feels safe.',
    'There was no justice waiting at the summit. Only your own ancient power, finally whole.'], { key: 'ending' });
}

function notice(text, seconds = 3) {
  $('toast').textContent = text; $('toast').hidden = false; toastUntil = performance.now() + seconds * 1000;
}

function updateHUD() {
  if (!game) return;
  $('hp').textContent = `${game.player.hp} / ${game.stats.maxHP}`;
  $('casts').textContent = `${game.castsLeft} / ${game.stats.maxSpellCasts}`;
  $('kills').textContent = String(run.killed + game.guards.filter(g => g.state === 'dead').length);
  $('camera-button').setAttribute('aria-pressed', String(Boolean(view.overview)));
  $('camera-button').setAttribute('aria-label', view.overview ? 'Switch to close camera' : 'Switch to wide camera');
  const mode = game.mode, fleeing = game.guards.filter(g => g.state === 'flee').length;
  $('mode').textContent = game.isHidden() && mode !== 'horde' ? 'HIDDEN' : ({ stealth: 'UNSEEN', chase: 'WITNESS FLEEING', horde: 'HORDE MODE', boss: 'THE SHATTERED SEAL' })[mode];
  $('mode').className = `mode mode-${mode}`;
  $('objective').textContent = mode === 'chase' ? `Intercept ${fleeing} fleeing ${fleeing === 1 ? 'disciple' : 'disciples'} before the boundary.` : mode === 'horde' ? 'Spells sealed. Survive and reach the glowing gate.' : mode === 'boss' ? 'Face the grandmaster. Space strikes one tile ahead.' : 'Reach the glowing gate at the top of the courtyard.';
  const action = game.player.execution || game.player.disposal;
  $('commitment').hidden = !action;
  if (action) {
    const duration = game.player.execution ? action.duration : DISPOSAL_SECONDS;
    $('commitment-label').textContent = `${game.player.execution ? 'EXECUTING · INPUTS LOCKED' : 'DISPOSING · STAY STILL'} · ${Math.max(0, duration - action.elapsed).toFixed(1)}s`;
    $('commitment-fill').style.width = `${Math.min(100, action.elapsed / duration * 100)}%`;
  }
  for (const button of document.querySelectorAll('[data-slot]')) button.disabled = game.mode === 'horde' || game.castsLeft <= 0 || Boolean(game.player.execution) || game.state !== 'playing';
  if (game.boss) {
    $('boss-health').style.width = `${game.boss.hp / game.boss.maxHP * 100}%`;
    $('boss-health-text').textContent = game.boss.immune ? 'IMMORTAL' : `${game.boss.hp} / ${game.boss.maxHP}`;
    $('boss-hud').classList.toggle('immortal', game.boss.immune);
  }
}

function handleEvents() {
  for (const event of game.drainEvents()) {
    if (event.type === 'alert') notice(event.reason === 'corpse' ? 'A corpse was discovered. Intercept the witness.' : 'You were seen. Stop the fleeing disciple.', 4);
    if (event.type === 'intercepted') notice('No witnesses remain. The ascent is quiet again.');
    if (event.type === 'horde') { audio.setMusic('horde'); notice('THE ALARM HAS SOUNDED · Reach the exit. Stealth spells are sealed.', 6); }
    if (event.type === 'cast') view.flash(event.tiles, SKILL_BY_ID[event.skill].color);
    if (event.type === 'strike') view.flash(event.tiles, 0xd7b4ef);
    if (event.type === 'kill') view.flash([event], event.autoDispose ? 0x84d7b3 : 0xb796d7);
    if (event.type === 'dispose') view.flash([event], 0x84d7b3);
    if (event.type === 'damage') view.shake = 0.16;
    if (event.type === 'immune') notice('His mortal tethers are gone. Your attacks cannot harm him.', 3);
    if (event.type === 'notice') notice(event.text);
    if (event.type === 'whisper') {
      $('whisper').textContent = event.text; $('whisper').hidden = false; whisperUntil = performance.now() + 8500;
      audio.narrate(event.text, { role: /^[“"']/.test(event.text) ? 'disciple' : 'narrator', key: 'whisper' });
    }
    if (event.type === 'bossAttack') view.flash(event.tiles, 0xee745e);
    if (event.type === 'complete') { const result = commitLevel(run, game); if (result) { saveRun(); transition(result); } }
    if (event.type === 'death') death(event.nightmare);
    if (event.type === 'victory') victory();
  }
}

function input() {
  const keys = [...held.keys()];
  const direction = keys.length ? held.get(keys[keys.length - 1]) : null;
  if (direction) shiftHeld ? game.face(direction) : game.move(direction);
}

document.addEventListener('keydown', event => {
  const code = event.code;
  if (settingsOpen) { if (code === 'Escape') { event.preventDefault(); closeSoundSettings(true); } return; }
  if (code === 'Space' && event.target?.tagName === 'BUTTON') return;
  if (movementKeys[code] && screen === 'game') { event.preventDefault(); if (!held.has(code)) held.set(code, movementKeys[code]); }
  if (code === 'ShiftLeft' || code === 'ShiftRight') shiftHeld = true;
  if (event.repeat) return;
  if (code === 'Escape') { event.preventDefault(); if (screen === 'game') pause(); else if (screen === 'pause' || screen === 'help') resume(); }
  if (screen !== 'game') return;
  if (/^Digit[1-4]$/.test(code)) { event.preventDefault(); game.cast(Number(code.slice(-1)) - 1); }
  if (code === 'Space' && game.boss) { event.preventDefault(); game.strike(); }
  if (code === 'KeyR') { event.preventDefault(); startLevel(); }
  if (code === 'KeyC') { event.preventDefault(); view.toggleCamera(); updateHUD(); }
  if (code === 'Slash' && event.shiftKey) { event.preventDefault(); help(); }
});
document.addEventListener('keyup', event => {
  held.delete(event.code);
  if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') shiftHeld = event.shiftKey;
});
window.addEventListener('blur', () => { held.clear(); if (screen === 'game') pause(); else audio.pause(); });
window.addEventListener('focus', () => { if (!document.hidden && screen !== 'pause' && screen !== 'help') audio.resume(); });
window.addEventListener('pagehide', () => audio.pause());
window.addEventListener('pageshow', () => { if (!document.hidden && screen !== 'pause' && screen !== 'help') audio.resume(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { held.clear(); if (screen === 'game') pause(); else audio.pause(); }
  else if (screen !== 'pause' && screen !== 'help') audio.resume();
});
for (const button of document.querySelectorAll('[data-direction]')) {
  button.onpointerdown = event => { event.preventDefault(); button.setPointerCapture(event.pointerId); held.set(`touch-${event.pointerId}`, button.dataset.direction); };
  const end = event => held.delete(`touch-${event.pointerId}`);
  button.onpointerup = end; button.onpointercancel = end; button.onlostpointercapture = end;
}
$('pause-button').onclick = pause; $('help-button').onclick = help;
$('camera-button').onclick = () => { if (screen === 'game' && !settingsOpen) { view.toggleCamera(); updateHUD(); } };
$('touch-strike').onclick = () => game?.strike();
$('sound-button').onclick = toggleSoundSettings;
$('close-sound').onclick = () => closeSoundSettings(true);
$('music-volume').oninput = () => audio.setMusicVolume(Number($('music-volume').value) / 100);
$('narration-volume').oninput = () => audio.setNarrationVolume(Number($('narration-volume').value) / 100);
$('narration-enabled').onchange = () => audio.setNarrationEnabled($('narration-enabled').checked);
$('voice-select').onchange = () => audio.setVoice($('voice-select').value);
$('mute-all').onclick = () => { audio.unlock(); audio.setMuted(!audio.settings.muted); };
$('test-voice').onclick = () => { audio.unlock(); audio.narrate('The mountain is quiet. Your ascent begins.', { key: 'voice-test' }); };
$('replay-narration').onclick = () => { audio.unlock(); audio.replay(); };
$('skip-narration').onclick = () => audio.stopNarration();
updateSoundControls();

function frame(now) {
  const dt = Math.min(0.12, Math.max(0, (now - lastTime) / 1000)); lastTime = now;
  if (screen === 'game' && !settingsOpen && game?.state === 'playing') {
    accumulator += dt;
    while (accumulator >= FIXED_STEP && screen === 'game' && !settingsOpen) { input(); game.update(FIXED_STEP); handleEvents(); accumulator -= FIXED_STEP; }
    if (now - hudTime > 90) { updateHUD(); hudTime = now; }
    if (now > toastUntil) $('toast').hidden = true;
    if (now > whisperUntil) $('whisper').hidden = true;
  } else accumulator = 0;
  view?.render(dt, now / 1000); requestAnimationFrame(frame);
}

try {
  view = new GameView($('scene')); title(); requestAnimationFrame(frame);
} catch (error) {
  console.error(error);
  panel('error', '<section class="panel compact-panel"><span class="eyebrow">THE COURTYARD COULD NOT OPEN</span><h2>A light<br>is missing.</h2><p>This game needs a browser with WebGL 2 and hardware acceleration. Try current Chrome, Edge, or Firefox, and check that all project files were extracted.</p><button id="reload" class="primary">Try again</button><p class="subtle">For local play, use start.bat or a local web server.</p></section>');
  $('reload').onclick = () => location.reload();
}
