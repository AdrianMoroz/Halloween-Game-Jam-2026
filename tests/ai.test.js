import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, FIXED_STEP } from '../src/game.js';
import { DEFAULT_STATS, DEFAULT_LOADOUT, HORDE_TYPES, BOSS_LEVEL } from '../src/content.js';
import { sameTile, key, manhattan } from '../src/grid.js';

const openLevel = (overrides = {}) => ({ id: 'ai', map: Array(11).fill('...........'),
  start: { x: 5, y: 7 }, exit: { x: 5, y: 0 }, guards: [], ...overrides });
const witness = (x, y, facing = 'north', id = 'witness') => ({ id, speed: 1, pause: 1,
  facing, patrol: [{ x, y }, { x: x + 1, y }] });
function advance(game, seconds) {
  for (let i = 0; i < Math.round(seconds / FIXED_STEP); i++) game.update(FIXED_STEP);
}
function seeded(seed) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}
function horde(archetype, distance, overrides = {}) {
  const game = new Game(openLevel(overrides), { ...DEFAULT_STATS, maxHP: 8 }, DEFAULT_LOADOUT, {}, () => .999);
  game.triggerHorde(); game.spawnClock = 100;
  const enemy = { id: archetype, tag: 'HordeEnemy', archetype, appearance: HORDE_TYPES[archetype].appearance,
    x: game.player.x, y: game.player.y - distance, facing: 'south', speed: HORDE_TYPES[archetype].speed,
    motion: null, warning: null, cooldown: 0 };
  game.horde.push(enemy); return { game, enemy };
}

test('a witness immediately flees around a stationary player blocking the preferred escape route', () => {
  const game = new Game(openLevel({ map: Array(5).fill('.....'), start: { x: 2, y: 1 },
    exit: { x: 4, y: 4 }, guards: [witness(2, 2)] }), DEFAULT_STATS, DEFAULT_LOADOUT, {}, () => .999);
  game.update(FIXED_STEP);
  assert.equal(game.guards[0].state, 'flee'); assert.ok(game.guards[0].motion);
  assert.equal(sameTile(game.guards[0].motion.to, game.player), false);
  advance(game, .7);
  assert.notDeepEqual({ x: game.guards[0].x, y: game.guards[0].y }, { x: 2, y: 2 });
  assert.deepEqual({ x: game.player.x, y: game.player.y }, { x: 2, y: 1 });
});

test('escape planning detours around both other actors and their reserved destination', () => {
  const game = new Game(openLevel({ map: Array(7).fill('.......'), start: { x: 1, y: 5 },
    guards: [witness(3, 3), witness(3, 1, 'north', 'blocking')] }), DEFAULT_STATS, DEFAULT_LOADOUT, {}, () => .999);
  const [escaping, blocking] = game.guards;
  game.alert(escaping, 'corpse'); game.startStep(blocking, { x: 3, y: 2 }, 10);
  blocking.frozenUntil = 10; game.update(FIXED_STEP);
  assert.ok(escaping.motion); assert.notDeepEqual(escaping.motion.to, { x: 3, y: 2 });
  assert.equal(sameTile(escaping.motion.to, blocking), false);
});

test('a genuinely sealed escape waits, then resumes when a temporary wall expires without player input', () => {
  const game = new Game(openLevel({ map: ['##.##', '##.##', '##.##', '##.##', '#####'],
    start: { x: 2, y: 3 }, exit: { x: 2, y: 0 }, guards: [witness(2, 1)] }));
  game.effects.push({ id: 'seal', kind: 'wall', tiles: [{ x: 2, y: 0 }], expires: .2 });
  game.alert(game.guards[0], 'corpse'); advance(game, .1); assert.equal(game.guards[0].motion, null);
  advance(game, .2); assert.deepEqual(game.guards[0].motion.to, { x: 2, y: 0 });
});

test('different random seeds vary equal-length escape routes and patrol pauses', () => {
  const choices = new Set(), pauses = new Set();
  for (let seed = 1; seed <= 30; seed++) {
    const game = new Game(openLevel({ start: { x: 1, y: 9 }, guards: [witness(5, 5)] }),
      DEFAULT_STATS, DEFAULT_LOADOUT, {}, seeded(seed));
    pauses.add(game.guards[0].pauseLeft); game.alert(game.guards[0], 'corpse'); game.update(FIXED_STEP);
    choices.add(key(game.guards[0].motion.to.x, game.guards[0].motion.to.y));
  }
  assert.ok(choices.size > 1); assert.ok(pauses.size > 1);
});

test('watchmen sometimes reverse a patrol and look aside during a pause', () => {
  const game = new Game(openLevel({ start: { x: 1, y: 9 }, guards: [{ ...witness(4, 4),
    patrol: [{ x: 4, y: 4 }, { x: 5, y: 4 }, { x: 5, y: 5 }, { x: 4, y: 5 }] }] }),
    DEFAULT_STATS, DEFAULT_LOADOUT, {}, () => 0);
  const guard = game.guards[0]; game.startStep(guard, guard.patrol[1], .1); game.update(.1);
  assert.equal(guard.patrolDirection, -1); assert.equal(guard.waypoint, 0);
  const oldFacing = guard.facing; game.update(.26);
  assert.notEqual(guard.facing, oldFacing); assert.equal(guard.looked, true);
});

test('each reinforcement group includes all four archetypes with distinct speeds and a readable arrival gap', () => {
  const game = new Game(openLevel(), DEFAULT_STATS, DEFAULT_LOADOUT, {}, seeded(33)); game.triggerHorde();
  for (let i = 0; i < 8; i++) game.spawnHorde();
  assert.equal(game.horde.length, 8);
  for (const group of [game.horde.slice(0, 4), game.horde.slice(4, 8)]) {
    assert.equal(new Set(group.map(e => e.archetype)).size, 4);
    assert.equal(new Set(group.map(e => e.speed)).size, 4);
  }
  assert.ok(game.horde.every(e => manhattan(e, game.player) > 2 && e.cooldown >= .4));
});

test('wave acceleration respects each archetype speed cap and the reinforcement limit', () => {
  const game = new Game(openLevel({ map: Array(30).fill('.'.repeat(30)), start: { x: 15, y: 15 } }),
    DEFAULT_STATS, DEFAULT_LOADOUT, {}, seeded(12));
  game.triggerHorde(); game.hordeClock = 1000;
  for (let i = 0; i < 100; i++) game.spawnHorde();
  assert.equal(game.horde.length, 70);
  assert.ok(game.horde.every(e => e.speed === HORDE_TYPES[e.archetype].maxSpeed && e.speed < DEFAULT_STATS.moveSpeed));
});

for (const [archetype, distance] of [['hunter', 1], ['runner', 2], ['lancer', 3], ['brute', 2]]) {
  test(`${archetype} warns before its distinct attack and deals its advertised damage`, () => {
    const { game, enemy } = horde(archetype, distance), profile = HORDE_TYPES[archetype];
    game.update(FIXED_STEP);
    assert.ok(enemy.warning); assert.equal(enemy.warning.duration, profile.windup);
    assert.equal(game.player.hp, 8); assert.equal(enemy.motion, null);
    advance(game, profile.windup - .05); assert.equal(game.player.hp, 8);
    advance(game, .06); assert.equal(game.player.hp, 8 - profile.damage);
    assert.equal(enemy.warning, null); assert.ok(enemy.cooldown > 0);
  });

  test(`${archetype} commits to marked tiles, so dodging avoids the hit`, () => {
    const { game, enemy } = horde(archetype, distance);
    game.update(FIXED_STEP); const marked = JSON.stringify(enemy.warning.tiles);
    assert.equal(game.move('east'), true); advance(game, .25);
    if (archetype === 'brute') { assert.equal(game.move('east'), true); advance(game, .25); }
    assert.equal(JSON.stringify(enemy.warning.tiles), marked);
    advance(game, HORDE_TYPES[archetype].windup);
    assert.equal(game.player.hp, 8);
  });
}

test('a lancer pursues an attack position without entering the player tile and holds spear distance', () => {
  const { game, enemy } = horde('lancer', 5);
  advance(game, 2);
  assert.ok(enemy.warning || enemy.cooldown > 0);
  assert.equal(manhattan(enemy, game.player), 3);
  assert.equal(enemy.motion, null);
});

test('a runner lunges only in its warned direction after the player dodges', () => {
  const { game, enemy } = horde('runner', 2);
  game.update(FIXED_STEP); game.move('east'); advance(game, .25); advance(game, .3);
  assert.equal(game.player.hp, 8); assert.deepEqual(enemy.motion.to, { x: 5, y: 6 });
});

test('walls and temporary spell walls block ranged attack warnings', () => {
  const { game, enemy } = horde('lancer', 3);
  game.effects.push({ id: 'cover', kind: 'wall', tiles: [{ x: 5, y: 6 }], expires: 10 });
  game.update(FIXED_STEP); assert.equal(enemy.warning, null);
  assert.equal(game.attackTiles(enemy, HORDE_TYPES.lancer.offsets).some(p => sameTile(p, game.player)), false);
});

test('pursuit respects other enemies and reserved steps instead of piling onto one tile', () => {
  const game = new Game(openLevel(), { ...DEFAULT_STATS, maxHP: 100 }, DEFAULT_LOADOUT, {}, seeded(80));
  game.triggerHorde(); game.spawnClock = 100;
  for (let i = 0; i < 8; i++) game.spawnHorde();
  for (let frame = 0; frame < 360; frame++) {
    game.update(FIXED_STEP);
    const occupied = new Set();
    for (const enemy of game.horde) {
      const id = key(enemy.x, enemy.y); assert.equal(occupied.has(id), false); occupied.add(id);
      assert.equal(sameTile(enemy, game.player), false);
      if (enemy.motion) {
        assert.equal(sameTile(enemy.motion.to, game.player), false);
        assert.ok(!game.grid.isWall(enemy.motion.to.x, enemy.motion.to.y));
        assert.ok(!game.horde.some(other => other !== enemy && (sameTile(other, enemy.motion.to) ||
          other.motion && sameTile(other.motion.to, enemy.motion.to))));
      }
    }
  }
});

for (const [skillId, duration] of [['flame', .7], ['eclipse', 1]]) {
  test(`${skillId} spends one reserve, locks all combat inputs, and releases only after ${duration}s`, () => {
    const game = new Game(openLevel({ guards: [witness(5, 6)] }), DEFAULT_STATS,
      [skillId, 'bone', 'frost', 'miasma'], {}, () => .999);
    game.guards[0].frozenUntil = 10;
    assert.equal(game.cast(0), true); assert.equal(game.castsLeft, 7);
    assert.equal(game.move('east'), false); assert.equal(game.face('east'), false);
    assert.equal(game.cast(1), false); assert.equal(game.strike(), false);
    assert.equal(game.player.facing, 'north'); assert.equal(game.guards[0].state, 'patrol');
    advance(game, duration - FIXED_STEP); assert.equal(game.guards[0].state, 'patrol');
    game.update(FIXED_STEP); assert.equal(game.guards[0].state, 'dead');
    assert.equal(game.player.casting, null); assert.equal(game.castsLeft, 7); assert.equal(game.corpses.length, 0);
    assert.equal(game.move('east'), true);
    assert.equal(game.drainEvents().filter(e => e.type === 'cast').length, 1);
  });
}

test('witnesses keep moving during a channel and can escape its fixed target area', () => {
  const game = new Game(openLevel({ guards: [witness(6, 6)] }), DEFAULT_STATS,
    ['flame', 'bone', 'frost', 'miasma'], {}, () => .999);
  const guard = game.guards[0]; game.startStep(guard, { x: 7, y: 6 }, .2);
  game.cast(0); advance(game, .7);
  assert.notEqual(guard.state, 'dead'); assert.equal(guard.x, 7);
  assert.equal(game.player.casting, null);
});

test('taking damage interrupts a channel without a refund or delayed resurrection of the spell', () => {
  for (const amount of [1, 100]) {
    const game = new Game(openLevel({ guards: [witness(5, 6)] }), { ...DEFAULT_STATS, maxHP: 3 },
      ['flame', 'bone', 'frost', 'miasma']);
    game.guards[0].frozenUntil = 10; game.cast(0); advance(game, .3);
    game.damagePlayer(amount); advance(game, 1);
    assert.equal(game.player.casting, null); assert.equal(game.castsLeft, 7);
    assert.notEqual(game.guards[0].state, 'dead'); assert.ok(!game.drainEvents().some(e => e.type === 'cast'));
  }
});

test('the alarm breaks a channel and keeps the horde spell seal intact', () => {
  const game = new Game(openLevel(), DEFAULT_STATS, ['flame', 'bone', 'frost', 'miasma']);
  game.cast(0); advance(game, .3); game.triggerHorde(); game.spawnClock = 100; advance(game, 1);
  assert.equal(game.player.casting, null); assert.equal(game.castsLeft, 7);
  assert.equal(game.cast(0), false); assert.ok(!game.drainEvents().some(e => e.type === 'cast'));
});

test('a channel delays gate completion and does not dispose of a corpse at the same time', () => {
  const game = new Game(openLevel({ exit: { x: 5, y: 7 } }), DEFAULT_STATS, ['flame', 'bone', 'frost', 'miasma']);
  game.corpses.push({ id: 'body', ...game.player }); game.cast(0); advance(game, .3);
  assert.equal(game.state, 'playing'); assert.equal(game.player.disposal, null); assert.equal(game.corpses.length, 1);
  advance(game, .4); assert.equal(game.state, 'complete'); assert.equal(game.player.casting, null);
});

test('the grandmaster varies patterns, avoids repeats, and never retargets an announced attack', () => {
  const game = new Game(BOSS_LEVEL, { ...DEFAULT_STATS, maxHP: 100 }, DEFAULT_LOADOUT,
    { killed: 8, total: 18 }, () => .999);
  Object.assign(game.player, { x: 9, y: 8 }); game.boss.cooldown = 0;
  const patterns = new Set(); let previous = null;
  for (let i = 0; i < 5; i++) {
    while (!game.boss.warning) game.update(FIXED_STEP);
    const warning = game.boss.warning; patterns.add(warning.pattern); assert.notEqual(warning.pattern, previous);
    previous = warning.pattern; const marked = JSON.stringify(warning.tiles);
    game.update(.1); assert.equal(JSON.stringify(game.boss.warning.tiles), marked);
    while (game.boss.warning) game.update(FIXED_STEP);
  }
  assert.ok(patterns.size > 1);
});

test('casting commitments also apply at the summit while the boss keeps attacking', () => {
  const game = new Game(BOSS_LEVEL, { ...DEFAULT_STATS, maxHP: 8 }, ['eclipse', 'flame', 'frost', 'miasma'],
    { killed: 8, total: 18 }, () => 0);
  Object.assign(game.player, { x: 9, y: 8 }); game.boss.cooldown = 0;
  const hp = game.boss.hp; game.cast(0); assert.equal(game.strike(), false); advance(game, 1);
  assert.ok(game.player.hp < 8); assert.equal(game.player.casting, null); assert.equal(game.boss.hp, hp);
});
