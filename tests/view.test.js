// Scene-graph checks exercise real Three.js geometry without creating a browser
// or claiming to validate WebGL output. GPU rendering still needs a playtest.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameView, THREE } from '../src/view.js';
import { Game } from '../src/game.js';
import { LEVELS, DEFAULT_STATS, DEFAULT_LOADOUT } from '../src/content.js';
import { TacticalCamera } from '../src/camera.js';

function sceneView(game) {
  const view = Object.create(GameView.prototype);
  view.renderer = { domElement: { parentElement: { getBoundingClientRect: () => ({ width: 1200, height: 700 }) } }, setSize() {}, render() {} };
  view.scene = new THREE.Scene(); view.cameraRig = new TacticalCamera(); view.camera = view.cameraRig.camera;
  view.materials = new Map(); view.geometries = new Map(); view.entities = new Map();
  view.textures = new Map();
  view.dynamicMaterials = new Set(); view.flashes = []; view.previewSkill = null;
  view.world = null; view.revision = -1; view.shake = 0; view.dummy = new THREE.Object3D(); view.color = new THREE.Color();
  view.setGame(game); return view;
}

test('invisible tiles are black and invisible walls have zero-sized instances', () => {
  const game = new Game(LEVELS[0]), view = sceneView(game), color = new THREE.Color();
  view.floors.getColorAt(0, color); assert.equal(color.getHex(), 0);
  const matrix = new THREE.Matrix4();
  for (const mesh of [view.walls, view.caps, view.footings, view.bands]) {
    mesh.getMatrixAt(0, matrix);
    assert.equal(new THREE.Vector3().setFromMatrixScale(matrix).length(), 0);
  }
  assert.equal(view.exitGate.visible, false);
});

test('guard meshes disappear in fog, then become visible when the horde reveals the board', () => {
  const game = new Game(LEVELS[0]), view = sceneView(game); view.render(.016, 1);
  assert.equal(view.entities.get('lower-2').visible, false);
  game.triggerHorde(); view.render(.016, 2);
  assert.equal(view.entities.get('lower-2').visible, true); assert.equal(view.exitGate.visible, true);
});

test('spell previews use the actual facing-relative target tiles', () => {
  const game = new Game(LEVELS[0]), view = sceneView(game); view.previewSkill = 'bone';
  view.render(.016, 1); assert.equal(view.targets.count, 1);
  const matrix = new THREE.Matrix4(); view.targets.getMatrixAt(0, matrix);
  const position = new THREE.Vector3().setFromMatrixPosition(matrix);
  assert.equal(position.x, 0); assert.equal(position.z, 5); // Player y=15, target y=13, center y=8.
  game.triggerHorde(); view.render(.016, 2); assert.equal(view.targets.count, 0);
});

test('corpses, temporary walls, and miasma build valid scene objects', () => {
  const game = new Game(LEVELS[0]), view = sceneView(game);
  game.corpses.push({ id: 'body', x: 9, y: 15 });
  game.cast(0); game.castCooldown = 0; game.cast(3); view.render(.016, 1);
  assert.ok(view.entities.has('body'));
  for (const effect of game.effects) assert.ok(view.entities.has(effect.id));
  const aliveMaterialCount = view.dynamicMaterials.size;
  game.effects = []; view.render(.016, 2);
  assert.ok(view.dynamicMaterials.size < aliveMaterialCount);
});

test('switching levels releases old instance buffers and transient flash materials', () => {
  const view = sceneView(new Game(LEVELS[0]));
  let disposed = false, flashDisposed = false;
  view.floors.addEventListener('dispose', () => { disposed = true; });
  view.flash([{ x: 9, y: 15 }]); view.flashes[0].material.addEventListener('dispose', () => { flashDisposed = true; });
  view.setGame(new Game(LEVELS[1], DEFAULT_STATS, DEFAULT_LOADOUT));
  assert.equal(disposed, true); assert.equal(flashDisposed, true);
  assert.equal(view.scene.children.length, 1);
  assert.equal(view.cones.frustumCulled, false);
});

test('detailed characters reuse geometry, articulate their limbs, and release corpse materials', () => {
  const game = new Game(LEVELS[0]), view = sceneView(game); view.render(.016, 1);
  const first = view.entities.get('lower-1'), second = view.entities.get('lower-2');
  const firstTorso = first.userData.body.children.find(mesh => mesh.isMesh && mesh.material === first.userData.robeMaterial);
  const secondTorso = second.userData.body.children.find(mesh => mesh.isMesh && mesh.material === second.userData.robeMaterial);
  assert.equal(firstTorso.geometry, secondTorso.geometry);
  assert.notEqual(first.userData.robeMaterial, second.userData.robeMaterial);
  game.move('north'); view.render(.016, 1.1);
  const player = view.entities.get('player');
  assert.notEqual(player.userData.legs[0].rotation.x, 0);
  assert.equal(player.userData.legs[0].rotation.x, -player.userData.legs[1].rotation.x);
  game.corpses.push({ id: 'test-corpse', x: 9, y: 15 }); view.render(.016, 2);
  const corpseMaterial = view.entities.get('test-corpse').userData.robeMaterial;
  let disposed = false; corpseMaterial.addEventListener('dispose', () => { disposed = true; });
  game.corpses = []; view.render(.016, 3);
  assert.equal(disposed, true); assert.equal(view.dynamicMaterials.has(corpseMaterial), false);
});

test('a full horde reuses the first reinforcement geometry instead of growing an asset cache per enemy', () => {
  const game = new Game(LEVELS[0]), view = sceneView(game); game.triggerHorde();
  const enemy = index => ({ id: `horde-${index}`, x: 1 + index % 17, y: 1 + Math.floor(index / 17), facing: 'south', motion: null });
  game.horde.push(enemy(0)); view.render(.016, 1);
  const geometryCount = view.geometries.size;
  for (let index = 1; index < 70; index++) game.horde.push(enemy(index));
  view.render(.016, 2);
  assert.equal(view.entities.size, 75); assert.equal(view.geometries.size, geometryCount);
  const textures = [...view.textures.values()];
  view.setGame(new Game(LEVELS[1])); view.render(.016, 3);
  assert.deepEqual([...view.textures.values()], textures);
  assert.equal(view.entities.size, 7);
});
