import * as THREE from '../vendor/three.module.js';
import { actorPosition, key } from './grid.js';
import { SKILL_BY_ID } from './content.js';

const COLORS = { stone: 0x253f3c, wall: 0x46544e, gold: 0xcaaa70,
  yin: 0xae91e7, guard: 0xddc28b, alarm: 0xed7b65, frost: 0x83d4ee };
const facingAngle = direction => ({ north: 0, east: -Math.PI / 2, south: Math.PI, west: Math.PI / 2 })[direction];

export class GameView {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x080f12);
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xc7ddd1, 0x102023, 2.1));
    const sun = new THREE.DirectionalLight(0xffdfb0, 2.6);
    sun.position.set(-8, 18, 7); this.scene.add(sun);
    this.camera = new THREE.OrthographicCamera(-12, 12, 10, -10, 0.1, 100);
    this.camera.position.set(0, 26, 21); this.camera.lookAt(0, 0, 0);
    this.materials = new Map(); this.geometries = new Map(); this.entities = new Map();
    this.dynamicMaterials = new Set(); this.flashes = []; this.previewSkill = null;
    this.world = null; this.game = null; this.revision = -1; this.shake = 0;
    this.dummy = new THREE.Object3D(); this.color = new THREE.Color();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement); this.resize();
  }

  material(color, emissive = 0x000000) {
    const id = `${color}:${emissive}`;
    if (!this.materials.has(id)) this.materials.set(id, new THREE.MeshStandardMaterial({
      color, emissive, emissiveIntensity: 0.35, roughness: 0.86, metalness: 0.05,
    }));
    return this.materials.get(id);
  }
  geometry(id, create) {
    if (!this.geometries.has(id)) this.geometries.set(id, create());
    return this.geometries.get(id);
  }
  mesh(shape, material) { return new THREE.Mesh(shape, material); }
  box(w, h, d, material) {
    return this.mesh(this.geometry(`box-${w}-${h}-${d}`, () => new THREE.BoxGeometry(w, h, d)), material);
  }
  sphere(radius, material) {
    return this.mesh(this.geometry(`sphere-${radius}`, () => new THREE.SphereGeometry(radius, 10, 8)), material);
  }
  cone(radius, height, material, sides = 8) {
    return this.mesh(this.geometry(`cone-${radius}-${height}-${sides}`, () => new THREE.ConeGeometry(radius, height, sides)), material);
  }
  torus(radius, tube, material) {
    const mesh = this.mesh(this.geometry(`torus-${radius}-${tube}`, () => new THREE.TorusGeometry(radius, tube, 6, 32)), material);
    mesh.rotation.x = -Math.PI / 2; return mesh;
  }
  position(x, y, height = 0) { return new THREE.Vector3(x - (this.game.grid.width - 1) / 2, height, y - (this.game.grid.height - 1) / 2); }

  setGame(game, preview = false) {
    if (this.world) {
      this.world.traverse(object => { if (object.isInstancedMesh) object.dispose(); });
      this.scene.remove(this.world);
    }
    for (const flash of this.flashes) flash.material.dispose();
    for (const material of this.dynamicMaterials) material.dispose();
    this.dynamicMaterials.clear(); this.entities.clear(); this.flashes = [];
    if (this.sealTexture) { this.sealTexture.dispose(); this.sealTexture = null; }
    this.game = game; this.demo = preview; this.revision = -1; this.previewSkill = null;
    this.world = new THREE.Group(); this.scene.add(this.world);
    const { width, height } = game.grid, count = width * height;
    this.floors = new THREE.InstancedMesh(this.geometry('floor', () => new THREE.BoxGeometry(0.975, 0.12, 0.975)),
      this.material(COLORS.stone), count);
    this.walls = new THREE.InstancedMesh(this.geometry('wall', () => new THREE.BoxGeometry(0.96, 1.28, 0.96)),
      this.material(COLORS.wall), count);
    this.caps = new THREE.InstancedMesh(this.geometry('wallcap', () => new THREE.BoxGeometry(1, 0.08, 1)),
      this.material(0x718276), count);
    this.world.add(this.floors, this.walls, this.caps);
    this.floors.frustumCulled = this.walls.frustumCulled = this.caps.frustumCulled = false;
    const base = this.box(width + 0.5, 0.5, height + 0.5, this.material(0x102326));
    base.position.y = -0.36; this.world.add(base);
    const frame = this.box(width + 0.7, 0.1, height + 0.7, this.material(0x33423b));
    frame.position.y = -0.57; this.world.add(frame);
    this.exitGate = this.makeGate();
    this.exitGate.position.copy(this.position(game.level.exit.x, game.level.exit.y));
    this.world.add(this.exitGate);
    this.cones = this.overlay(96, 0xeac279, 0.2, 0.03);
    this.targets = this.overlay(32, COLORS.yin, 0.38, 0.05);
    this.danger = this.overlay(32, 0xee745e, 0.45, 0.07);
    if (game.boss) this.makeSeal();
    this.refreshMap(); this.resize();
  }

  overlay(capacity, color, opacity, elevation) {
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
    this.dynamicMaterials.add(material);
    const mesh = new THREE.InstancedMesh(this.geometry('overlay', () => new THREE.PlaneGeometry(0.92, 0.92)), material, capacity);
    mesh.frustumCulled = false;
    mesh.userData.elevation = elevation; mesh.count = 0; this.world.add(mesh); return mesh;
  }
  fillOverlay(mesh, tiles) {
    let index = 0;
    const seen = new Set();
    for (const tile of tiles) {
      const id = key(tile.x, tile.y);
      if (seen.has(id) || !(this.demo || this.game.visible.has(id)) || index >= mesh.instanceMatrix.count) continue;
      seen.add(id); this.dummy.position.copy(this.position(tile.x, tile.y, mesh.userData.elevation));
      this.dummy.rotation.set(-Math.PI / 2, 0, 0); this.dummy.scale.set(1, 1, 1); this.dummy.updateMatrix();
      mesh.setMatrixAt(index++, this.dummy.matrix);
    }
    mesh.count = index; mesh.instanceMatrix.needsUpdate = true;
  }

  refreshMap() {
    const game = this.game, { width, height } = game.grid;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const index = y * width + x, visible = this.demo || game.visible.has(key(x, y));
      this.dummy.rotation.set(0, 0, 0); this.dummy.scale.set(1, 1, 1);
      this.dummy.position.copy(this.position(x, y, -0.07)); this.dummy.updateMatrix();
      this.floors.setMatrixAt(index, this.dummy.matrix);
      const shade = 0.68 + ((x * 17 + y * 11) % 7) * 0.045;
      this.color.set(visible ? (game.mode === 'horde' ? 0x3b3733 : 0x2c4b45) : 0x000000).multiplyScalar(shade);
      this.floors.setColorAt(index, this.color);
      const drawWall = visible && game.grid.isWall(x, y);
      this.dummy.scale.setScalar(drawWall ? 1 : 0);
      this.dummy.position.copy(this.position(x, y, 0.59)); this.dummy.updateMatrix();
      this.walls.setMatrixAt(index, this.dummy.matrix);
      this.dummy.position.y = 1.27; this.dummy.updateMatrix(); this.caps.setMatrixAt(index, this.dummy.matrix);
    }
    this.floors.instanceMatrix.needsUpdate = true; this.floors.instanceColor.needsUpdate = true;
    this.walls.instanceMatrix.needsUpdate = true; this.caps.instanceMatrix.needsUpdate = true;
    this.exitGate.visible = this.demo || game.visible.has(key(game.level.exit.x, game.level.exit.y));
    this.revision = game.visibilityRevision;
  }

  makeGate() {
    const gate = new THREE.Group(), stone = this.material(0x667668), gold = this.material(COLORS.gold, 0x755629);
    for (const side of [-1, 1]) {
      const post = this.box(0.14, 1.75, 0.14, stone); post.position.set(side * 0.42, 0.8, 0); gate.add(post);
      const lamp = this.sphere(0.09, gold); lamp.position.set(side * 0.42, 1.38, 0.12); gate.add(lamp);
    }
    const lintel = this.box(1.2, 0.16, 0.32, gold); lintel.position.y = 1.72; gate.add(lintel);
    const roof = this.cone(0.83, 0.33, this.material(0x203532), 4); roof.position.y = 1.94; roof.rotation.y = Math.PI / 4; roof.scale.z = 0.6; gate.add(roof);
    const ring = this.torus(0.37, 0.035, gold); ring.position.y = 0.04; gate.add(ring);
    return gate;
  }

  makeSeal() {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.translate(256, 256); ctx.strokeStyle = '#c8b780'; ctx.lineWidth = 3;
    ctx.shadowBlur = 12; ctx.shadowColor = '#c8b780';
    for (const radius of [168, 208, 232]) { ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.stroke(); }
    for (let index = 0; index < 8; index++) {
      ctx.save(); ctx.rotate(index * Math.PI / 4); ctx.translate(0, -190);
      for (let line = 0; line < 3; line++) {
        ctx.beginPath();
        if ((index >> line) & 1) { ctx.moveTo(-18, line * 10 - 10); ctx.lineTo(18, line * 10 - 10); }
        else { ctx.moveTo(-18, line * 10 - 10); ctx.lineTo(-5, line * 10 - 10); ctx.moveTo(5, line * 10 - 10); ctx.lineTo(18, line * 10 - 10); }
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.beginPath(); ctx.arc(0, 0, 72, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, -36, 36, -Math.PI / 2, Math.PI / 2); ctx.arc(0, 36, 36, -Math.PI / 2, Math.PI / 2, true); ctx.stroke();
    this.sealTexture = new THREE.CanvasTexture(canvas); this.sealTexture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({ map: this.sealTexture, transparent: true, depthWrite: false, opacity: 0.8 });
    this.dynamicMaterials.add(material);
    const seal = this.mesh(this.geometry('seal', () => new THREE.PlaneGeometry(8, 8)), material);
    seal.rotation.x = -Math.PI / 2; seal.position.copy(this.position(9, 7, 0.016)); this.world.add(seal);
  }

  makeActor(kind) {
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    const isPlayer = kind === 'player', isBoss = kind === 'boss', isHorde = kind === 'horde';
    const color = isPlayer ? COLORS.yin : isBoss ? 0xf2e7c3 : isHorde ? 0x9b6556 : COLORS.guard;
    const robeMaterial = this.material(color, isPlayer ? 0x453566 : 0x000000).clone();
    this.dynamicMaterials.add(robeMaterial);
    const robe = this.cone(0.25, 0.63, robeMaterial); robe.rotation.z = Math.PI; robe.position.y = 0.49; body.add(robe);
    const belt = this.box(0.32, 0.055, 0.28, this.material(isPlayer ? 0x4b3d67 : 0x645540)); belt.position.y = 0.46; body.add(belt);
    const head = this.sphere(0.115, this.material(isPlayer ? 0xc6afda : 0xc9b29b)); head.position.y = 0.89; body.add(head);
    if (!isPlayer) {
      const hat = this.cone(0.2, 0.1, this.material(isBoss ? 0xf5dfb1 : 0x394640)); hat.position.y = 0.99; body.add(hat);
    }
    const weapon = this.box(0.035, 0.07, 0.42, this.material(isPlayer ? 0xe2cff5 : 0xdfd8bf));
    weapon.position.set(0.23, 0.52, -0.26); body.add(weapon);
    const pointer = this.cone(0.1, 0.24, this.material(color), 3);
    pointer.rotation.x = -Math.PI / 2; pointer.position.set(0, 0.08, -0.4); root.add(pointer);
    const ring = this.torus(isBoss ? 0.46 : 0.31, isPlayer ? 0.025 : 0.013, this.material(color, isPlayer ? 0x7552ac : 0x000000));
    ring.position.y = 0.035; root.add(ring);
    if (isBoss) root.scale.setScalar(1.3);
    root.userData = { body, robeMaterial, ring, baseColor: color, kind };
    this.world.add(root); return root;
  }

  makeCorpse() {
    const group = new THREE.Group();
    const body = this.box(0.27, 0.12, 0.63, this.material(0x6b6856)); body.position.y = 0.085; group.add(body);
    const head = this.sphere(0.105, this.material(0xbda58b)); head.position.set(0, 0.095, -0.38); group.add(head);
    this.world.add(group); return group;
  }

  makeEffect(effect) {
    const group = new THREE.Group();
    for (const tile of effect.tiles) {
      const part = new THREE.Group(); part.position.copy(this.position(tile.x, tile.y));
      if (effect.kind === 'wall') {
        const bone = this.box(0.84, 0.8, 0.84, this.material(0x9caa9a)); bone.position.y = 0.4; part.add(bone);
        for (let i = 0; i < 3; i++) { const spike = this.cone(0.1, 0.37, this.material(0xe0d9c1)); spike.position.set((i - 1) * 0.23, 0.97, 0); part.add(spike); }
      } else if (effect.kind === 'trap') {
        const ring = this.torus(0.3, 0.026, this.material(0xbeb4a2)); ring.position.y = 0.06; part.add(ring);
        for (let i = 0; i < 5; i++) { const spike = this.cone(0.055, 0.26, this.material(0xd7cebb)); spike.position.set(Math.sin(i * 1.26) * 0.22, 0.12, Math.cos(i * 1.26) * 0.22); part.add(spike); }
      } else {
        const smokeMat = new THREE.MeshBasicMaterial({ color: 0x8b6cbd, transparent: true, opacity: 0.3, depthWrite: false });
        this.dynamicMaterials.add(smokeMat);
        const smoke = this.sphere(0.47, smokeMat); smoke.scale.y = 0.8; smoke.position.y = 0.3; part.add(smoke);
        const ring = this.torus(0.44, 0.02, this.material(COLORS.yin, 0x7251a1)); ring.position.y = 0.05; part.add(ring);
      }
      part.userData.tile = tile; group.add(part);
    }
    this.world.add(group); return group;
  }

  flash(tiles, color = COLORS.yin) {
    const group = new THREE.Group();
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide });
    for (const tile of tiles) {
      if (!this.game.grid.contains(tile.x, tile.y) || !this.game.visible.has(key(tile.x, tile.y))) continue;
      const mesh = this.mesh(this.geometry('overlay', () => new THREE.PlaneGeometry(0.92, 0.92)), material);
      mesh.rotation.x = -Math.PI / 2; mesh.position.copy(this.position(tile.x, tile.y, 0.09)); group.add(mesh);
    }
    this.world.add(group); this.flashes.push({ group, material, age: 0 });
  }

  resize() {
    const canvas = this.renderer.domElement, rect = canvas.parentElement.getBoundingClientRect();
    const width = Math.max(1, rect.width), height = Math.max(1, rect.height), aspect = width / height;
    this.renderer.setSize(width, height, false);
    const halfHeight = Math.max(8.3, 11 / aspect);
    this.camera.left = -halfHeight * aspect; this.camera.right = halfHeight * aspect;
    this.camera.top = halfHeight; this.camera.bottom = -halfHeight;
    this.camera.updateProjectionMatrix();
  }

  render(dt, elapsed) {
    const game = this.game;
    if (!game) return;
    if (this.revision !== game.visibilityRevision) this.refreshMap();
    const aliveKeys = new Set();
    const syncActor = (id, actor, kind) => {
      aliveKeys.add(id);
      let mesh = this.entities.get(id);
      if (!mesh) { mesh = this.makeActor(kind); this.entities.set(id, mesh); }
      const position = actorPosition(actor);
      const fogVisible = Boolean(this.demo || game.visible.has(key(actor.x, actor.y)) ||
        actor.motion && game.visible.has(key(actor.motion.to.x, actor.motion.to.y)));
      mesh.visible = kind === 'player' || fogVisible;
      mesh.position.copy(this.position(position.x, position.y)); mesh.rotation.y = facingAngle(actor.facing);
      const bob = actor.motion ? Math.sin(elapsed * 16) * 0.025 : Math.sin(elapsed * 2 + actor.x) * 0.012;
      mesh.userData.body.position.y = bob;
      const color = actor.frozenUntil > game.time ? COLORS.frost : actor.state === 'flee' ? COLORS.alarm : actor.immune ? 0xf7ce86 : mesh.userData.baseColor;
      mesh.userData.robeMaterial.color.set(color);
      mesh.userData.ring.scale.setScalar(kind === 'player' ? 1 + Math.sin(elapsed * 3) * 0.055 : 1);
      if (kind === 'player') mesh.visible = actor.hp > 0 || Math.sin(elapsed * 12) > 0;
      if (kind === 'player' && actor.damageCooldown > 0) mesh.userData.robeMaterial.emissive.set(0xaa3333);
      else mesh.userData.robeMaterial.emissive.set(kind === 'player' ? 0x453566 : actor.immune ? 0x8d6020 : 0x000000);
    };
    syncActor('player', game.player, 'player');
    for (const guard of game.guards) if (guard.state !== 'dead') syncActor(guard.id, guard, 'guard');
    for (const enemy of game.horde) syncActor(enemy.id, enemy, 'horde');
    if (game.boss?.state === 'alive') syncActor('boss', game.boss, 'boss');
    for (const corpse of game.corpses) {
      aliveKeys.add(corpse.id); let mesh = this.entities.get(corpse.id);
      if (!mesh) { mesh = this.makeCorpse(); this.entities.set(corpse.id, mesh); }
      mesh.position.copy(this.position(corpse.x, corpse.y)); mesh.visible = this.demo || game.visible.has(key(corpse.x, corpse.y));
    }
    for (const effect of game.effects) {
      aliveKeys.add(effect.id); let mesh = this.entities.get(effect.id);
      if (!mesh) { mesh = this.makeEffect(effect); this.entities.set(effect.id, mesh); }
      for (const child of mesh.children) child.visible = this.demo || game.visible.has(key(child.userData.tile.x, child.userData.tile.y));
    }
    for (const [id, mesh] of this.entities) if (!aliveKeys.has(id)) {
      this.world.remove(mesh);
      if (mesh.userData.robeMaterial) { mesh.userData.robeMaterial.dispose(); this.dynamicMaterials.delete(mesh.userData.robeMaterial); }
      if (id.startsWith('effect-')) mesh.traverse(object => {
        if (object.material && this.dynamicMaterials.has(object.material)) {
          object.material.dispose(); this.dynamicMaterials.delete(object.material);
        }
      });
      this.entities.delete(id);
    }
    this.fillOverlay(this.cones, game.guards.filter(g => g.state !== 'dead').flatMap(g => game.visionCone(g)));
    this.fillOverlay(this.targets, this.previewSkill && game.mode !== 'horde' && !game.player.execution ? game.spellTiles(this.previewSkill) : []);
    this.fillOverlay(this.danger, game.boss?.warning?.tiles || []);
    if (game.boss?.warning) this.danger.material.opacity = 0.35 + Math.sin(elapsed * 18) * 0.15;
    for (const flash of this.flashes) {
      flash.age += dt; flash.material.opacity = Math.max(0, 0.75 - flash.age * 1.5);
      if (flash.age >= 0.5) { this.world.remove(flash.group); flash.material.dispose(); }
    }
    this.flashes = this.flashes.filter(f => f.age < 0.5);
    this.shake = Math.max(0, this.shake - dt * 0.8);
    this.camera.position.x = Math.sin(elapsed * 63) * this.shake;
    this.renderer.render(this.scene, this.camera);
  }
}

export { THREE, SKILL_BY_ID };
