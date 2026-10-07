import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { TacticalCamera } from '../src/camera.js';
import { surfaceTexture } from '../src/art.js';
import { Game } from '../src/game.js';
import { LEVELS } from '../src/content.js';
import { DeathCutscene } from '../src/cutscene.js';

test('close camera follows interpolated movement and snaps to each level entry', () => {
  const game = new Game(LEVELS[0]), rig = new TacticalCamera();
  rig.resize(1200, 600); rig.setGame(game);
  const start = rig.focus.clone(); game.move('west'); game.update(.125); rig.update(.1);
  assert.ok(rig.focus.x < start.x); assert.ok(rig.focus.x > rig.desired.x);
  const projected = new THREE.Vector3(game.player.x - 9, 0.6, game.player.y - 8).project(rig.camera);
  assert.ok(Math.abs(projected.x) < 0.3 && Math.abs(projected.y) < 0.3);
  rig.setGame(new Game(LEVELS[1]));
  assert.equal(rig.focus.x, 0); assert.equal(rig.focus.z, 6.45);
});

test('wide camera fits the complete courtyard in landscape and portrait without changing fog', () => {
  for (const [width, height] of [[1200, 600], [360, 580]]) {
    const game = new Game(LEVELS[0]), rig = new TacticalCamera(), visible = [...game.visible];
    rig.resize(width, height); rig.setGame(game); const closeDistance = rig.camera.position.distanceTo(rig.focus);
    rig.toggle(); rig.update(0, 0, 0, true);
    assert.ok(rig.camera.position.distanceTo(rig.focus) > closeDistance * 1.5);
    for (const x of [-9.5, 9.5]) for (const z of [-8.5, 8.5]) for (const y of [0, 1.5]) {
      const projected = new THREE.Vector3(x, y, z).project(rig.camera);
      assert.ok(Math.abs(projected.x) <= 1 && Math.abs(projected.y) <= 1, `Clipped corner: ${projected.toArray()}`);
    }
    assert.deepEqual([...game.visible], visible);
  }
});

test('camera shake is relative to the tracked player and clears without drifting', () => {
  const rig = new TacticalCamera(); rig.setGame(new Game(LEVELS[0]));
  const normal = rig.camera.position.clone(); rig.update(0, 1, .16);
  assert.notEqual(rig.camera.position.x, normal.x);
  rig.update(0, 2, 0); assert.deepEqual(rig.camera.position.toArray(), normal.toArray());
});

test('surface textures are deterministic opaque assets with mipmaps and no DOM requirement', () => {
  for (const kind of ['stone', 'floor', 'roof', 'cloth']) {
    const first = surfaceTexture(kind), second = surfaceTexture(kind);
    assert.deepEqual(first.image.data, second.image.data);
    assert.equal(first.generateMipmaps, true);
    for (let index = 3; index < first.image.data.length; index += 4) assert.equal(first.image.data[index], 255);
    assert.ok(new Set(first.image.data).size > 12);
    first.dispose(); second.dispose();
  }
});

test('death shots frame both combatants in landscape and portrait and preserve fog', () => {
  for (const [width, height] of [[1200, 700], [360, 740]]) for (const separation of [0, 3]) {
    const game = new Game({ ...LEVELS[0], map: Array(11).fill('...........'), start: { x: 5, y: 6 }, guards: [] });
    const killer = { id: 'killer', tag: 'HordeEnemy', x: 5, y: 6 - separation, facing: 'south' };
    const visible = [...game.visible], rig = new TacticalCamera(); rig.resize(width, height); rig.setGame(game);
    const normalDistance = rig.camera.position.distanceTo(rig.focus);
    game.damagePlayer(1, killer); const cutscene = new DeathCutscene(game); rig.startDeathCutscene(cutscene);
    cutscene.update(.9); rig.updateDeathCutscene(cutscene);
    for (const subject of [cutscene.player, cutscene.attackerEnd]) for (const y of [0.18, 1.55]) {
      const point = rig.worldPosition(subject, y).project(rig.camera);
      assert.ok(Math.abs(point.x) < .93 && Math.abs(point.y) < .78, `Clipped cinematic ${width}x${height}: ${point.toArray()}`);
    }
    assert.ok(rig.camera.position.distanceTo(rig.focus) < normalDistance);
    assert.deepEqual([...game.visible], visible);
  }
});

test('cinematic camera keeps the victim visible beside walls and temporary spell walls', () => {
  const map = ['.........', '.........', '...###...', '...#.#...', '...#.....', '.........', '.........', '.........', '.........'];
  const game = new Game({ ...LEVELS[0], map, start: { x: 4, y: 3 }, guards: [] }), rig = new TacticalCamera();
  game.effects.push({ id: 'wall', kind: 'wall', tiles: [{ x: 5, y: 3 }], expires: 10 }); game.refreshVision();
  rig.resize(1200, 700); rig.setGame(game); game.damagePlayer();
  const cutscene = new DeathCutscene(game); rig.startDeathCutscene(cutscene);
  for (let step = 0; step < 46; step++) {
    cutscene.update(.1); rig.updateDeathCutscene(cutscene);
    assert.equal(rig.shotBlocked(rig.camera.position, rig.worldPosition(cutscene.player, .18)), false);
  }
  const projected = rig.worldPosition(cutscene.player, .2).project(rig.camera);
  assert.ok(Math.abs(projected.x) < .9 && Math.abs(projected.y) < .78);
});

test('reduced motion holds a steady death shot, resize retains it, and a new level restores tracking', () => {
  const game = new Game(LEVELS[0]), rig = new TacticalCamera(); rig.resize(1200, 700); rig.setGame(game);
  game.damagePlayer(); const cutscene = new DeathCutscene(game, true); rig.startDeathCutscene(cutscene);
  const matrix = rig.camera.matrixWorld.clone(); cutscene.update(3); rig.updateDeathCutscene(cutscene);
  assert.deepEqual(rig.camera.matrixWorld.elements, matrix.elements);
  rig.resize(360, 740); assert.equal(rig.deathShot.cutscene, cutscene);
  assert.ok(Number.isFinite(rig.camera.position.y));
  rig.setGame(new Game(LEVELS[1])); assert.equal(rig.deathShot, null); assert.equal(rig.focus.z, 6.45);
});

test('a death at the exit keeps the victim clear of gate posts, lintel, and roof', () => {
  const game = new Game({ ...LEVELS[0], map: Array(9).fill('.........'), start: { x: 4, y: 1 }, exit: { x: 4, y: 1 }, guards: [] });
  const rig = new TacticalCamera(); rig.resize(1200, 700); rig.setGame(game); game.damagePlayer();
  const cutscene = new DeathCutscene(game); rig.startDeathCutscene(cutscene); cutscene.update(1); rig.updateDeathCutscene(cutscene);
  for (const height of [.18, 1.4]) assert.equal(rig.shotBlocked(rig.camera.position, rig.worldPosition(cutscene.player, height)), false);
  assert.ok(rig.camera.position.y < 8);
});
