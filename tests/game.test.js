import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, FIXED_STEP, freshRun, commitLevel, buyUpgrade, bossStats, validRun } from '../src/game.js';
import { Grid, lineOfSight, visibleTiles, shortestPath, shortestPathToAny, rotateOffsets, actorPosition } from '../src/grid.js';
import { LEVELS, BOSS_LEVEL, DEFAULT_STATS, DEFAULT_LOADOUT, DIRECTIONS, SKILLS } from '../src/content.js';

function level(guards = [], overrides = {}) {
  return { id: 'test', name: 'Test', map: Array(9).fill('.........'),
    start: { x: 4, y: 7 }, exit: { x: 4, y: 0 }, guards, whispers: [], ...overrides };
}
function guard(id = 'one', x = 4, y = 6, facing = 'north') {
  return { id, facing, speed: 1, pause: 10, patrol: [{ x, y }, { x: x + 1, y }] };
}
function advance(game, seconds) {
  for (let index = 0; index < Math.ceil(seconds / FIXED_STEP); index++) game.update(FIXED_STEP);
}
function walk(game, direction) { assert.equal(game.move(direction), true); advance(game, 1 / game.stats.moveSpeed); }

test('every authored map has reachable exits, boundary tiles, and patrol coordinates', () => {
  const ids = new Set();
  for (const data of [...LEVELS, BOSS_LEVEL]) {
    const grid = new Grid(data.map);
    assert.ok(shortestPath(grid, data.start, data.exit));
    assert.ok(grid.boundaryTiles().length >= 4);
    for (const patrol of data.guards) {
      assert.equal(ids.has(patrol.id), false); ids.add(patrol.id);
      for (let index = 0; index < patrol.patrol.length; index++) {
        const from = patrol.patrol[index], to = patrol.patrol[(index + 1) % patrol.patrol.length];
        assert.equal(grid.isWall(from.x, from.y), false);
        assert.ok(shortestPath(grid, from, to));
      }
    }
  }
  assert.equal(ids.size, 18);
});

test('starting HP is one, movement snaps to tiles, and rendering can interpolate', () => {
  const game = new Game(level());
  assert.equal(game.player.hp, 1);
  assert.equal(game.move('north'), true);
  advance(game, .125);
  assert.equal(game.player.y, 7);
  assert.ok(actorPosition(game.player).y > 6 && actorPosition(game.player).y < 7);
  advance(game, .125);
  assert.equal(game.player.y, 6); assert.equal(game.player.motion, null);
  assert.equal(game.player.facing, 'north');
});

test('walls block movement without spending any resource', () => {
  const rows = Array(9).fill('.........'); rows[6] = '....#....';
  const game = new Game(level([], { map: rows }));
  assert.equal(game.move('north'), false); assert.equal(game.player.motion, null);
  assert.equal(game.castsLeft, DEFAULT_STATS.maxSpellCasts);
});

test('fog respects radius, opaque walls, and diagonal wall corners', () => {
  const grid = new Grid(['.....', '..#..', '..#..', '.....', '.....']);
  const origin = { x: 1, y: 2 }, visible = visibleTiles(grid, origin, 3);
  assert.equal(visible.has('2,2'), true); // The visible face of a wall.
  assert.equal(visible.has('3,2'), false); assert.equal(visible.has('4,4'), false);
  const corner = new Grid(['.#.', '#..', '...']);
  assert.equal(lineOfSight(corner, { x: 0, y: 0 }, { x: 1, y: 1 }), false);
});

test('guard cones are directional and occluded by walls', () => {
  const game = new Game(level([guard('one', 4, 4, 'north')]));
  assert.equal(game.guardSees(game.guards[0], { x: 4, y: 2 }), true);
  assert.equal(game.guardSees(game.guards[0], { x: 4, y: 6 }), false);
  const rows = [...game.level.map]; rows[3] = '....#....';
  game.grid = new Grid(rows);
  assert.equal(game.guardSees(game.guards[0], { x: 4, y: 2 }), false);
});

test('a frontal approach alerts a guard instead of silently executing them', () => {
  const game = new Game(level([guard('one', 4, 6, 'south')]));
  assert.equal(game.move('north'), false);
  assert.equal(game.guards[0].state, 'flee'); assert.equal(game.mode, 'chase');
});

test('rear execution locks movement and spells, then creates a corpse after 2.5 seconds', () => {
  const game = new Game(level([guard()]));
  walk(game, 'north'); assert.ok(game.player.execution);
  assert.equal(game.move('west'), false); assert.equal(game.face('west'), false);
  assert.equal(game.cast(0), false); assert.equal(game.castsLeft, 8);
  advance(game, 2.3); assert.equal(game.corpses.length, 0);
  advance(game, .2); assert.equal(game.guards[0].state, 'dead');
  assert.equal(game.corpses.length, 1); assert.equal(game.player.execution, null);
});

test('manual corpse disposal requires two stationary seconds and resets on movement', () => {
  const game = new Game(level());
  game.corpses.push({ id: 'corpse', x: 4, y: 7 });
  advance(game, 1.5); assert.equal(game.corpses.length, 1);
  walk(game, 'west'); assert.equal(game.player.disposal, null);
  walk(game, 'east'); advance(game, 1.4); assert.equal(game.corpses.length, 1);
  advance(game, .7); assert.equal(game.corpses.length, 0);
});

test('corpse discovery raises the same fleeing state as spotting the player', () => {
  const game = new Game(level([guard('one', 4, 4, 'north')]));
  game.corpses.push({ id: 'body', x: 4, y: 2 }); advance(game, FIXED_STEP);
  assert.equal(game.guards[0].state, 'flee');
  assert.ok(game.drainEvents().some(event => event.type === 'alert' && event.reason === 'corpse'));
});

test('loadouts require exactly four different known skills', () => {
  assert.throws(() => new Game(level(), DEFAULT_STATS, ['miasma']));
  assert.throws(() => new Game(level(), DEFAULT_STATS, ['miasma', 'miasma', 'bone', 'wall']));
  assert.throws(() => new Game(level(), DEFAULT_STATS, ['miasma', 'bone', 'wall', 'unknown']));
});

test('knight targeting rotates two forward and one right in all four directions', () => {
  const expected = { north: { x: 6, y: 3 }, east: { x: 7, y: 6 }, south: { x: 4, y: 7 }, west: { x: 3, y: 4 } };
  for (const [name, facing] of Object.entries(DIRECTIONS)) {
    assert.deepEqual(rotateOffsets({ x: 5, y: 5 }, facing, [[2, 1]]), [expected[name]]);
  }
});

test('all spell slots consume one global reserve; exhaustion disables casting', () => {
  const game = new Game(level(), { ...DEFAULT_STATS, maxSpellCasts: 2 });
  assert.equal(game.cast(0), true); advance(game, .3);
  assert.equal(game.cast(1), true); advance(game, .3);
  assert.equal(game.castsLeft, 0); assert.equal(game.cast(2), false);
});

test('miasma conceals the player, while leaving it removes concealment', () => {
  const game = new Game(level([guard('one', 4, 5, 'south')]));
  game.cast(0); advance(game, .3); assert.equal(game.guards[0].state, 'patrol');
  assert.equal(game.isHidden(), true); walk(game, 'west'); assert.equal(game.isHidden(), false);
  assert.equal(game.guards[0].state, 'flee');
});

test('frost stops movement and perception until it expires', () => {
  const game = new Game(level([guard('one', 4, 5, 'south')]));
  assert.equal(game.cast(2), true); advance(game, 4.5);
  assert.equal(game.guards[0].y, 5); assert.equal(game.guards[0].state, 'patrol');
  advance(game, .6); assert.equal(game.guards[0].state, 'flee');
});

test('instant flame kills skip execution and generate no corpse', () => {
  const game = new Game(level([guard()]), DEFAULT_STATS, ['flame', 'bone', 'wall', 'miasma']);
  game.cast(0);
  assert.equal(game.guards[0].state, 'dead'); assert.equal(game.player.execution, null);
  assert.equal(game.corpses.length, 0);
});

test('knight instant kills leave corpses, and bone traps kill on the targeted tile', () => {
  const game = new Game(level([guard('one', 5, 5)]), DEFAULT_STATS, ['knight', 'bone', 'wall', 'miasma']);
  game.cast(0); assert.equal(game.guards[0].state, 'dead'); assert.equal(game.corpses.length, 1);
  const trap = new Game(level([guard('two', 4, 5)]));
  trap.cast(1); assert.equal(trap.guards[0].state, 'dead'); assert.equal(trap.corpses.length, 1);
});

test('bone wall blocks movement and sight, expires, and cannot appear inside a guard', () => {
  const game = new Game(level()); game.cast(3);
  assert.equal(game.blocked(4, 6), true); assert.equal(game.move('north'), false);
  assert.equal(game.visible.has('4,5'), false); advance(game, 7.1);
  assert.equal(game.blocked(4, 6), false); assert.equal(game.visible.has('4,5'), true);
  const occupied = new Game(level([guard()])); occupied.cast(3);
  assert.equal(occupied.spellBlocked(4, 6), false);
});

test('escape search selects a reachable boundary even when the closest one is blocked', () => {
  const grid = new Grid(['##.##', '#...#', '#...#', '#...#', '##.##']);
  const path = shortestPathToAny(grid, { x: 2, y: 1 }, grid.boundaryTiles(), (x, y) => x === 2 && y === 0);
  assert.deepEqual(path.at(-1), { x: 2, y: 4 }); assert.equal(path.length, 4);
});

test('each fleeing witness must be stopped; a surviving witness can summon the horde', () => {
  const game = new Game(level([guard('one', 1, 2), guard('two', 7, 2)]));
  for (const witness of game.guards) game.alert(witness, 'player');
  game.killGuard(game.guards[0], true); advance(game, FIXED_STEP);
  assert.equal(game.mode, 'chase'); advance(game, 3);
  assert.equal(game.mode, 'horde'); assert.ok(game.horde.length > 0);
});

test('interception returns to stealth when every fleeing witness is dead', () => {
  const game = new Game(level([guard()])); game.alert(game.guards[0], 'player');
  game.killGuard(game.guards[0], true); advance(game, FIXED_STEP);
  assert.equal(game.mode, 'stealth');
});

test('horde reveals the map and locks every remaining stealth spell', () => {
  const game = new Game(level()); const before = game.visible.size;
  game.triggerHorde(); assert.ok(game.visible.size > before); assert.equal(game.visible.size, 81);
  for (let slot = 0; slot < 4; slot++) assert.equal(game.cast(slot), false);
  assert.equal(game.castsLeft, 8);
});

test('horde contact deducts HP, has a damage cooldown, and ends the level at zero', () => {
  const game = new Game(level(), { ...DEFAULT_STATS, maxHP: 2 });
  game.triggerHorde(); game.spawnClock = 100;
  game.horde.push({ id: 'horde', tag: 'HordeEnemy', ...game.player, speed: 1, motion: null });
  advance(game, .1); assert.equal(game.player.hp, 1);
  advance(game, .4); assert.equal(game.player.hp, 1);
  advance(game, .4); assert.equal(game.state, 'dead'); assert.equal(game.player.hp, 0);
});

test('player and horde enemy cannot swap tiles through each other unharmed', () => {
  const game = new Game(level(), { ...DEFAULT_STATS, maxHP: 2 });
  game.triggerHorde(); game.spawnClock = 100;
  const enemy = { id: 'horde', tag: 'HordeEnemy', x: 4, y: 6, facing: 'south', speed: 1, motion: null };
  game.horde.push(enemy); game.startStep(enemy, { x: 4, y: 7 }, 1);
  game.move('north'); advance(game, FIXED_STEP);
  assert.equal(game.player.hp, 1);
});

test('the exit completes a courtyard in both stealth and horde modes', () => {
  for (const horde of [false, true]) {
    const game = new Game(level([], { start: { x: 4, y: 1 } }));
    if (horde) { game.triggerHorde(); game.spawnClock = 100; }
    walk(game, 'north'); assert.equal(game.state, 'complete');
  }
});

test('only successful attempts commit kills and denominator; horde enemies do not count', () => {
  const run = freshRun(), game = new Game(LEVELS[0]);
  game.killGuard(game.guards[0], true);
  game.horde.push({ id: 'fake-horde', state: 'dead', tag: 'HordeEnemy' });
  assert.equal(commitLevel(run, game), false); assert.equal(run.killed, 0); assert.equal(run.total, 0);
  game.state = 'complete'; const result = commitLevel(run, game);
  assert.equal(result.killed, 1); assert.equal(run.killed, 1); assert.equal(run.total, 4);
  assert.equal(commitLevel(run, game), false); assert.equal(run.killed, 1);
  assert.equal(validRun(run), true);
});

test('high stealth kill counts grant bonus upgrade points; upgrades spend one point', () => {
  const run = freshRun(), game = new Game(LEVELS[0]);
  for (const g of game.guards) game.killGuard(g, true);
  game.state = 'complete'; const result = commitLevel(run, game);
  assert.equal(result.points, 4); assert.equal(result.bonus, 2);
  assert.equal(buyUpgrade(run, 'maxHP'), true); assert.equal(run.stats.maxHP, 2); assert.equal(run.points, 3);
  run.points = 0; assert.equal(buyUpgrade(run, 'maxHP'), false); assert.equal(run.stats.maxHP, 2);
});

test('boss stats scale by the ratio, with exact 90 percent triggering immortality', () => {
  assert.equal(bossStats(89, 100).immune, false);
  assert.equal(bossStats(90, 100).immune, true);
  assert.equal(bossStats(17, 18).immune, true); assert.equal(bossStats(16, 18).immune, false);
  const spared = bossStats(0, 18), killed = bossStats(18, 18);
  assert.ok(spared.maxHP >= 1 && spared.speed > 0 && spared.damage >= 1);
  assert.ok(killed.maxHP > spared.maxHP && killed.speed > spared.speed);
});

test('immortality prevents basic and spell damage; a mortal boss can be defeated', () => {
  const immortal = new Game(BOSS_LEVEL, DEFAULT_STATS, DEFAULT_LOADOUT, { killed: 18, total: 18 });
  immortal.damageBoss(99999); assert.equal(immortal.boss.hp, immortal.boss.maxHP); assert.equal(immortal.state, 'playing');
  const mortal = new Game(BOSS_LEVEL, DEFAULT_STATS, DEFAULT_LOADOUT, { killed: 3, total: 18 });
  mortal.damageBoss(99999); assert.equal(mortal.boss.hp, 0); assert.equal(mortal.state, 'won');
});

test('soul strikes remain available after the boss spell reserve is exhausted', () => {
  const game = new Game(BOSS_LEVEL, DEFAULT_STATS, DEFAULT_LOADOUT, { killed: 8, total: 18 });
  game.castsLeft = 0; game.player.x = 9; game.player.y = 8; game.player.facing = 'north';
  const before = game.boss.hp; assert.equal(game.strike(), true); assert.equal(game.boss.hp, before - 3);
});

test('boss attacks have a warning and damage only the marked tiles', () => {
  const game = new Game(BOSS_LEVEL, { ...DEFAULT_STATS, maxHP: 8 }, DEFAULT_LOADOUT, { killed: 8, total: 18 });
  game.player.x = 9; game.player.y = 8; game.boss.cooldown = 0;
  advance(game, FIXED_STEP); assert.ok(game.boss.warning); assert.equal(game.player.hp, 8);
  advance(game, 1); assert.ok(game.player.hp < 8);
});

test('loading corrupted or edited progress cannot create invalid campaign state', () => {
  assert.equal(validRun(freshRun()), true);
  for (const corrupt of [{ stats: { ...DEFAULT_STATS, maxHP: -1 } }, { levelIndex: 99 },
    { loadout: ['miasma'] }, { killed: 50 }, { total: 9 }, { completed: ['lower'] }, { phase: '<script>' }]) {
    assert.equal(validRun({ ...freshRun(), ...corrupt }), false);
  }
  assert.equal(SKILLS.filter(s => s.unlock === 0).length, 4);
});

test('campaign progresses through three courtyards with a stable total of 18 guards', () => {
  const run = freshRun();
  for (const data of LEVELS) {
    const game = new Game(data, run.stats, run.loadout, run);
    game.state = 'complete'; commitLevel(run, game);
    assert.equal(validRun(run), true);
  }
  assert.equal(run.levelIndex, 3); assert.equal(run.total, 18); assert.equal(run.killed, 0);
  assert.equal(new Game(BOSS_LEVEL, run.stats, run.loadout, run).boss.immune, false);
});
