import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { TacticalCamera } from '../src/camera.js';
import { surfaceTexture } from '../src/art.js';
import { Game } from '../src/game.js';
import { LEVELS } from '../src/content.js';

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
