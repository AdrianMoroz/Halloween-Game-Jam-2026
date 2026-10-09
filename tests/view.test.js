// Scene-graph checks exercise real Three.js geometry without creating a browser
// or claiming to validate WebGL output. GPU rendering still needs a playtest.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameView, THREE } from '../src/view.js';
import { Game } from '../src/game.js';
import { LEVELS, DEFAULT_STATS, DEFAULT_LOADOUT, HORDE_TYPES } from '../src/content.js';
import { TacticalCamera } from '../src/camera.js';
import { EXECUTION_SECONDS, DISPATCH_SECONDS } from '../src/game.js';

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
  game.move('north'); game.update(.05); view.render(.016, 1.1);
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

test('execution shows two separated participants, a raised sword, a strike, and a matching corpse', () => {
  const game = new Game(LEVELS[0]), guard = game.guards[0];
  game.guards = [guard]; Object.assign(guard, { x: 9, y: 14, facing: 'north', motion: null });
  const view = sceneView(game);
  assert.equal(game.move('north'), true); game.update(.25);
  assert.ok(game.player.execution); assert.equal(game.corpses.length, 0);
  game.player.execution.elapsed = .95; view.render(0, 1);
  const player = view.entities.get('player'), victim = view.entities.get(guard.id);
  assert.ok(player.userData.body.position.z > victim.userData.body.position.z);
  assert.ok(player.userData.arms[1].rotation.x > 1.5);
  assert.equal(game.move('east'), false); assert.equal(game.cast(0), false);
  game.player.execution.elapsed = 1.4; view.render(0, 1.4);
  assert.equal(player.userData.trail.visible, true); assert.ok(victim.userData.body.rotation.x < 0.14);
  game.player.execution.elapsed = EXECUTION_SECONDS - .01; view.render(0, 2.49);
  victim.userData.body.updateMatrix(); const finalPose = victim.userData.body.matrix.clone();
  game.update(.01); view.render(0, 2.5);
  assert.equal(game.player.execution, null); assert.equal(game.guards[0].state, 'dead');
  assert.equal(view.entities.has(guard.id), false);
  const corpse = view.entities.get(`corpse-${guard.id}`); corpse.userData.body.updateMatrix();
  assert.deepEqual(corpse.userData.body.matrix.elements, finalPose.elements);
  assert.equal(corpse.rotation.y, victim.rotation.y);
  assert.equal(player.userData.trail.visible, false);
});

test('paused execution poses do not advance with wall-clock time', () => {
  const game = new Game(LEVELS[0]); game.player.x = game.guards[0].x; game.player.y = game.guards[0].y;
  game.beginExecution(game.guards[0]); game.player.execution.elapsed = 1.4;
  const view = sceneView(game); view.render(0, 1);
  const pose = () => [view.entities.get('player'), view.entities.get(game.guards[0].id)].map(mesh => {
    mesh.userData.body.updateMatrix(); mesh.userData.arms[1].updateMatrix();
    return [...mesh.userData.body.matrix.elements, ...mesh.userData.arms[1].matrix.elements];
  });
  const paused = pose(); view.render(0, 100);
  assert.deepEqual(pose(), paused); assert.equal(game.player.execution.elapsed, 1.4);
});

test('spell kills become lethal immediately, animate a fall, and hand off to one persistent corpse', () => {
  const game = new Game(LEVELS[0]), view = sceneView(game), guard = game.guards[0];
  view.render(0, 0); const robe = view.entities.get(guard.id).userData.robeMaterial;
  let released = false; robe.addEventListener('dispose', () => { released = true; });
  game.killGuard(guard); view.render(0, 0);
  assert.equal(game.guardAt(guard.x, guard.y), undefined); assert.equal(game.corpses.length, 1);
  assert.equal(view.entities.has(`corpse-${guard.id}`), false); assert.equal(view.entities.has(guard.id), true);
  game.time = DISPATCH_SECONDS / 2; view.render(0, 0.3);
  assert.ok(view.entities.get(guard.id).userData.body.rotation.x < 0);
  game.time = DISPATCH_SECONDS; view.render(0, 0.65);
  assert.equal(view.entities.has(guard.id), false); assert.equal(released, true);
  assert.equal(view.entities.has(`corpse-${guard.id}`), true);
});

test('auto-dispatched frozen victims dissolve without creating a corpse or revealing fog', () => {
  const game = new Game(LEVELS[0]), view = sceneView(game), guard = game.guards[1];
  guard.frozenUntil = 100; game.killGuard(guard, true);
  game.time = DISPATCH_SECONDS * .7; view.render(0, 1);
  const victim = view.entities.get(guard.id);
  assert.equal(victim.visible, false); assert.ok(victim.userData.body.scale.x < .68);
  assert.equal(game.corpses.length, 0);
  game.time = DISPATCH_SECONDS; view.render(0, 2);
  assert.equal(view.entities.has(guard.id), false); assert.equal(view.entities.has(`corpse-${guard.id}`), false);
});

test('corpse disposal kneels and burns, cancellation restores the body, and removal releases its materials', () => {
  const game = new Game(LEVELS[0]), view = sceneView(game);
  game.corpses.push({ id: 'burning-body', x: 9, y: 15 });
  game.player.disposal = { corpseId: 'burning-body', elapsed: 1.8 }; view.render(0, 1);
  const corpse = view.entities.get('burning-body'), player = view.entities.get('player');
  assert.equal(corpse.userData.burn.visible, true); assert.ok(corpse.userData.body.scale.x < .68);
  assert.ok(player.userData.body.position.y < 0);
  assert.equal(game.move('east'), true); view.render(0, 2);
  assert.equal(corpse.userData.burn.visible, false); assert.equal(corpse.userData.body.scale.x, .68);
  const owned = [...corpse.userData.ownedMaterials]; let released = 0;
  owned.forEach(material => material.addEventListener('dispose', () => released++));
  game.corpses = []; view.render(0, 3);
  assert.equal(released, owned.length); assert.ok(owned.every(material => !view.dynamicMaterials.has(material)));
});

test('boss combat has sword swings and a terminal collapse while gameplay remains stopped', () => {
  const game = new Game(LEVELS[0]), view = sceneView(game);
  game.mode = 'boss'; game.boss = { x: 9, y: 14, facing: 'south', state: 'alive', hp: 6,
    frozenUntil: 0, cooldown: 1, damage: 1, speed: 1, motion: null, warning: null, immune: false };
  game.refreshVision(); game.strike(); game.time = .1; view.render(0, .1);
  assert.ok(view.entities.get('player').userData.arms[1].rotation.x > 1);
  game.damageBoss(3); const stoppedTime = game.time; view.render(.3, .46);
  const boss = view.entities.get('boss'); assert.ok(boss.userData.body.rotation.x < 0);
  const pausedAngle = boss.userData.body.rotation.x; view.render(0, 20);
  assert.equal(boss.userData.body.rotation.x, pausedAngle);
  view.render(.5, 20.5); assert.equal(boss.userData.body.rotation.x, -Math.PI / 2);
  assert.equal(game.state, 'won'); assert.equal(game.time, stoppedTime); assert.equal(boss.userData.ring.visible, false);
});

test('a mixed horde has distinct weapons and colors while reusing geometry for each archetype', () => {
  const game = new Game(LEVELS[0]), view = sceneView(game); game.triggerHorde();
  const types = Object.keys(HORDE_TYPES);
  const enemy = index => ({ id: `mixed-${index}`, x: 1 + index % 17, y: 1 + Math.floor(index / 17),
    facing: 'south', motion: null, archetype: types[index % 4], appearance: HORDE_TYPES[types[index % 4]].appearance });
  for (let index = 0; index < 4; index++) game.horde.push(enemy(index));
  view.render(0, 0); const geometryCount = view.geometries.size;
  const actors = game.horde.map(e => view.entities.get(e.id));
  assert.equal(new Set(actors.map(mesh => mesh.userData.robeMaterial.color.getHex())).size, 4);
  assert.equal(new Set(actors.map(mesh => mesh.userData.kind)).size, 4);
  assert.ok(actors[3].scale.x > actors[1].scale.x);
  const weaponBounds = actors.map(mesh => new THREE.Box3().setFromObject(mesh.userData.arms[1]));
  assert.ok(weaponBounds[2].getSize(new THREE.Vector3()).z > weaponBounds[1].getSize(new THREE.Vector3()).z * 1.5);
  for (let index = 4; index < 70; index++) game.horde.push(enemy(index));
  view.render(0, 0);
  assert.equal(view.geometries.size, geometryCount); assert.equal(view.entities.size, 75);
});

test('all reinforcement danger tiles render, including more than the old 32-tile limit, and pause holds the pulse', () => {
  const game = new Game(LEVELS[0]), view = sceneView(game); game.triggerHorde();
  for (let index = 0; index < 40; index++) game.horde.push({ id: `warn-${index}`, x: 1 + index % 17,
    y: 1 + Math.floor(index / 17), facing: 'south', motion: null,
    warning: { remaining: .4, duration: .8, tiles: [{ x: 1 + index % 17, y: 1 + Math.floor(index / 17) }] } });
  game.time = .4; view.render(0, .4);
  assert.equal(view.danger.count, 40); const opacity = view.danger.material.opacity;
  const arm = view.entities.get('warn-0').userData.arms[1].rotation.toArray();
  view.render(0, 100);
  assert.equal(view.danger.material.opacity, opacity);
  assert.deepEqual(view.entities.get('warn-0').userData.arms[1].rotation.toArray(), arm);
});

test('channeling shows a stationary raised-arm pose and the committed target pattern, then clears on interruption', () => {
  const game = new Game(LEVELS[0], { ...DEFAULT_STATS, maxHP: 2 }, ['flame', 'eclipse', 'frost', 'miasma']);
  const view = sceneView(game); view.previewSkill = 'bone';
  game.cast(0); game.update(.3); view.render(0, .3);
  const player = view.entities.get('player'), aura = player.userData.channelAura;
  assert.equal(aura.visible, true); assert.equal(view.targets.count, 6);
  assert.ok(player.userData.arms[0].rotation.x > 1);
  const opacity = aura.material.opacity, scale = aura.scale.toArray(); view.render(0, 100);
  assert.equal(aura.material.opacity, opacity); assert.deepEqual(aura.scale.toArray(), scale);
  game.damagePlayer(); view.previewSkill = null; view.render(0, 100);
  assert.equal(aura.visible, false); assert.equal(view.targets.count, 0);
  let disposed = false; aura.material.addEventListener('dispose', () => { disposed = true; });
  view.setGame(new Game(LEVELS[1])); assert.equal(disposed, true);
});

test('fatal damage uses the ordinary collapse and tactical camera while gameplay remains stopped', () => {
  const game = new Game(LEVELS[0]), view = sceneView(game); view.render(0, 0);
  const cameraPosition = view.camera.position.clone(); game.damagePlayer(); const stoppedTime = game.time;
  view.render(.3, .3); assert.ok(view.entities.get('player').userData.body.rotation.x < 0);
  assert.deepEqual(view.camera.position.toArray(), cameraPosition.toArray());
  view.render(.5, .8); assert.equal(view.entities.get('player').userData.body.rotation.x, -Math.PI / 2);
  assert.equal(game.time, stoppedTime); assert.equal(view.startDeathCutscene, undefined);
  view.setGame(new Game(LEVELS[0])); view.render(0, 0);
  assert.equal(view.entities.get('player').userData.body.rotation.x, 0);
});
