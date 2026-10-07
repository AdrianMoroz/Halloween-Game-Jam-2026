import * as THREE from '../vendor/three.module.js';
import { cinematicPhase } from './cutscene.js';
import { DISPATCH_SECONDS, DISPOSAL_SECONDS } from './game.js';

// Original, deterministic surface art. Data textures work offline and in the
// scene tests; no downloaded models, image requests, or canvas APIs are needed.
const noise = (x, y, seed = 1) => {
  let n = Math.imul(x + seed * 197, 374761393) + Math.imul(y, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
};

export function surfaceTexture(kind) {
  const size = kind === 'cloth' ? 64 : 128;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let color, shade = 1;
    const grain = noise(x, y, 9) - 0.5;
    if (kind === 'stone') {
      const row = Math.floor(y / 32), bx = (x + (row % 2) * 32) % 64, by = y % 32;
      color = [151, 151, 131];
      shade = bx < 2 || by < 2 ? 0.35 : 0.86 + noise(Math.floor((x + (row % 2) * 32) / 64), row, 4) * 0.22;
      if (bx === 2 || by === 2) shade += 0.16;
      if (bx > 60 || by > 28) shade -= 0.10;
      shade += grain * 0.18;
      if (by > 23 && noise(x >> 2, y >> 2, 2) > 0.7) color = [111, 130, 98];
    } else if (kind === 'floor') {
      const bx = x % 64, by = y % 64;
      color = [142, 151, 136];
      shade = bx < 2 || by < 2 ? (x < 2 || y < 2 ? 0.42 : 0.75) : 0.88 + noise(x >> 6, y >> 6, 11) * 0.16;
      if (bx === 2 || by === 2) shade += 0.10;
      shade += grain * 0.16;
      // Hairline fractures and small chips stop the paving looking like cubes.
      if ((Math.abs(bx - (18 + by * 0.31)) < 0.7 && by < 36) ||
        (bx > 57 && by > 54 && noise(x, y, 7) > 0.5)) shade *= 0.62;
    } else if (kind === 'roof') {
      color = [77, 103, 99];
      shade = 0.7 + Math.sin((x % 16) / 16 * Math.PI) * 0.30 + grain * 0.13;
      if (x % 16 < 2 || y % 32 < 2) shade *= 0.55;
      if (y % 32 === 3) shade += 0.22;
    } else {
      color = [229, 229, 229];
      shade = 0.91 + ((x + y) % 2) * 0.07 + grain * 0.035;
      if (x % 16 === 0) shade -= 0.06;
    }
    const offset = (y * size + x) * 4;
    for (let channel = 0; channel < 3; channel++) data[offset + channel] = Math.max(0, Math.min(255, color[channel] * shade));
    data[offset + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

// Beveled stone coping catches light along its rim rather than a single flat face.
export function copingGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(-0.52, -0.52); shape.lineTo(0.52, -0.52);
  shape.lineTo(0.52, 0.52); shape.lineTo(-0.52, 0.52); shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: true,
    bevelSegments: 1, steps: 1, bevelSize: 0.045, bevelThickness: 0.045 });
  geometry.rotateX(-Math.PI / 2); geometry.translate(0, -0.04, 0);
  return geometry;
}

// Merge static pieces by material inside each articulated body segment. Every
// actor reuses these geometries, so detail does not require one draw per buckle.
function batchParts(view, group, name) {
  const batches = new Map();
  for (const mesh of [...group.children]) {
    if (!mesh.isMesh) continue;
    const material = mesh.material;
    if (!batches.has(material)) batches.set(material, []);
    mesh.updateMatrix(); batches.get(material).push(mesh); group.remove(mesh);
  }
  for (const [material, parts] of batches) {
    const id = material.name || `${material.color.getHexString()}-${material.emissive?.getHexString()}`;
    const geometry = view.geometry(`character-${name}-${id}`, () => {
      const positions = [], normals = [], uvs = [];
      for (const part of parts) {
        const source = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry.clone();
        source.applyMatrix4(part.matrix);
        positions.push(...source.attributes.position.array);
        normals.push(...source.attributes.normal.array);
        if (source.attributes.uv) uvs.push(...source.attributes.uv.array);
        else uvs.push(...Array(source.attributes.position.count * 2).fill(0));
        source.dispose();
      }
      const merged = new THREE.BufferGeometry();
      merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      merged.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      merged.computeBoundingSphere(); return merged;
    });
    group.add(new THREE.Mesh(geometry, material));
  }
}

const PROFILES = {
  player: { cloth: 0x514a76, trim: 0xa99abc, armor: 0x4c5460, skin: 0xceb0a0, hair: 0x191d2b },
  guard: { cloth: 0x8e9574, trim: 0xcab584, armor: 0x565d51, skin: 0xccac8e, hair: 0x252825 },
  horde: { cloth: 0x855d50, trim: 0xbbb092, armor: 0x514b43, skin: 0xa58f7c, hair: 0x352a26 },
  boss: { cloth: 0xd2d0b2, trim: 0xddba71, armor: 0x7c7960, skin: 0xd0b89b, hair: 0xb4b7ad },
};

export function characterModel(view, kind) {
  const profile = PROFILES[kind], isPlayer = kind === 'player', isBoss = kind === 'boss', isHorde = kind === 'horde';
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const cloth = view.surfaceMaterial('cloth', profile.cloth).clone();
  cloth.name = `${kind}-cloth`; cloth.emissive.set(isPlayer ? 0x161022 : 0x000000);
  view.dynamicMaterials.add(cloth);
  const trim = view.material(profile.trim), armor = view.material(profile.armor), skin = view.material(profile.skin);
  const hair = view.material(profile.hair), leather = view.material(0x343730), steel = view.material(0xbfc5bc);
  const place = (group, mesh, x, y, z, rotation = null) => {
    mesh.position.set(x, y, z); if (rotation) mesh.rotation.set(...rotation); group.add(mesh); return mesh;
  };
  const cylinder = (top, bottom, height, material, sides = 8) => view.mesh(
    view.geometry(`cylinder-${top}-${bottom}-${height}-${sides}`, () => new THREE.CylinderGeometry(top, bottom, height, sides)), material);
  const torso = cylinder(0.18, 0.20, 0.42, cloth);
  torso.scale.z = 0.72; place(body, torso, 0, 0.89, 0);
  const skirt = cylinder(0.20, isBoss ? 0.30 : 0.25, 0.29, cloth);
  skirt.scale.z = 0.72; place(body, skirt, 0, 0.57, 0);
  // Overlapping lapels, a diagonal sash, and split coat panels.
  place(body, view.box(0.075, 0.36, 0.025, trim), -0.045, 0.90, -0.145, [0, 0, -0.30]);
  place(body, view.box(0.04, 0.36, 0.025, armor), 0.07, 0.90, -0.151, [0, 0, 0.30]);
  place(body, view.box(0.40, 0.075, 0.29, leather), 0, 0.70, 0);
  place(body, view.box(0.065, 0.065, 0.022, trim), 0.045, 0.70, -0.161);
  place(body, view.box(0.095, 0.27, 0.025, trim), -0.11, 0.56, -0.17, [0.10, 0, -0.06]);
  place(body, view.box(0.095, 0.23, 0.025, cloth), 0.10, 0.57, -0.18, [-0.06, 0, 0.08]);
  if (!isPlayer) {
    for (let row = 0; row < (isBoss ? 4 : 2); row++) {
      place(body, view.box(0.29, 0.055, 0.035, armor), 0, 0.84 + row * 0.065, -0.153);
      if (!isHorde) for (const side of [-1, 1]) place(body, view.sphere(0.013, trim), side * 0.105, 0.84 + row * 0.065, -0.176);
    }
  } else {
    place(body, view.box(0.16, 0.11, 0.09, leather), 0.15, 0.70, 0.10);
    place(body, view.box(0.10, 0.32, 0.025, trim), 0, 0.88, 0.15, [0.12, 0, 0.25]);
  }
  place(body, cylinder(0.057, 0.067, 0.10, skin), 0, 1.13, 0);
  const head = view.sphere(0.13, skin); head.scale.set(0.86, 1.12, 0.88);
  place(body, head, 0, 1.28, -0.015);
  const crown = view.sphere(0.132, hair); crown.scale.set(0.88, 0.63, 0.94);
  place(body, crown, 0, 1.365, 0);
  place(body, view.box(0.224, 0.035, 0.025, trim), 0, 1.335, -0.118);
  for (const side of [-1, 1]) place(body, view.box(0.034, 0.012, 0.018, leather), side * 0.045, 1.295, -0.131);
  if (isPlayer) place(body, view.box(0.20, 0.073, 0.042, cloth), 0, 1.235, -0.115);
  if (!isHorde) {
    place(body, cylinder(0.06, 0.055, 0.085, hair), 0, 1.455, 0.035);
    place(body, cylinder(0.066, 0.066, 0.02, trim), 0, 1.435, 0.035);
  }
  if (kind === 'guard') {
    place(body, cylinder(0.045, 0.245, 0.095, armor, 12), 0, 1.41, 0);
    place(body, cylinder(0.07, 0.07, 0.03, trim), 0, 1.47, 0);
  } else if (isBoss) {
    place(body, view.box(0.23, 0.06, 0.18, trim), 0, 1.40, 0);
    for (const side of [-1, 1]) place(body, view.box(0.028, 0.20, 0.028, trim), side * 0.09, 1.50, 0.035, [0, 0, side * -0.2]);
  }
  const legs = [], arms = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(side * 0.105, 0.48, 0); body.add(leg); legs.push(leg);
    place(leg, cylinder(0.085, 0.065, 0.22, cloth), 0, -0.10, 0);
    place(leg, cylinder(0.065, 0.057, 0.18, leather), 0, -0.285, 0);
    place(leg, view.box(0.115, 0.075, 0.195, leather), 0, -0.395, -0.035);
    if (!isHorde) place(leg, cylinder(0.067, 0.067, 0.04, trim), 0, -0.27, 0);
    batchParts(view, leg, `${kind}-leg`);
    const arm = new THREE.Group(); arm.position.set(side * 0.225, 1.065, 0); body.add(arm); arms.push(arm);
    place(arm, cylinder(0.092, 0.065, 0.23, cloth), 0, -0.115, 0);
    place(arm, cylinder(0.065, 0.05, 0.18, armor), 0, -0.305, -0.015);
    place(arm, view.box(0.083, 0.09, 0.08, skin), 0, -0.42, -0.02);
    if (!isHorde) place(arm, view.box(0.15, 0.07, 0.20, armor), 0, -0.025, 0);
    if (side === 1) {
      place(arm, view.box(0.024, 0.022, isBoss ? 0.74 : 0.57, steel), 0, -0.40, isBoss ? -0.44 : -0.355);
      place(arm, view.box(0.16, 0.027, 0.035, trim), 0, -0.40, -0.073);
      place(arm, view.box(0.032, 0.031, 0.13, leather), 0, -0.40, 0.01);
    }
    batchParts(view, arm, `${kind}-arm-${side}`);
  }
  batchParts(view, body, `${kind}-body`);
  const shadowMaterial = view.contactShadowMaterial();
  const shadow = view.mesh(view.geometry('contact-shadow', () => new THREE.CircleGeometry(0.28, 16)), shadowMaterial);
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.018; shadow.scale.z = 1.1; root.add(shadow);
  const color = isPlayer ? 0xb9a4e3 : isBoss ? 0xe3c481 : isHorde ? 0xbd8070 : 0xbdc69f;
  const ring = view.torus(isBoss ? 0.38 : 0.285, isPlayer ? 0.018 : 0.009, view.material(color, isPlayer ? 0x46385d : 0x000000));
  ring.position.y = 0.028; root.add(ring);
  const pointer = view.cone(0.06, 0.16, view.material(color), 3);
  pointer.rotation.x = -Math.PI / 2; pointer.position.set(0, 0.05, -0.36); root.add(pointer);
  if (isBoss) root.scale.setScalar(1.12);
  const ownedMaterials = [cloth];
  let trail = null;
  if (isPlayer || isBoss || isHorde) {
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0,
      side: THREE.DoubleSide, depthWrite: false });
    ownedMaterials.push(material); view.dynamicMaterials.add(material);
    trail = view.mesh(view.geometry('sword-trail', () => new THREE.RingGeometry(0.28, 0.66, 20, 1, 0, Math.PI * 1.4)), material);
    trail.rotation.x = -Math.PI / 2; trail.position.set(0.05, 0.94, -0.20);
    trail.visible = false; body.add(trail);
  }
  root.userData = { body, robeMaterial: cloth, ring, pointer, legs, arms, trail, ownedMaterials,
    baseColor: profile.cloth, kind };
  return root;
}

const phase = (value, start = 0, end = 1) => {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return t * t * (3 - 2 * t);
};

function swordTrail(mesh, progress) {
  const trail = mesh.userData.trail;
  if (!trail) return;
  trail.visible = progress > 0 && progress < 1;
  trail.material.opacity = Math.sin(Math.max(0, Math.min(1, progress)) * Math.PI) * 0.7;
  trail.rotation.z = -2.2 + progress * 3.4;
}

// The same final pose is used by a falling victim and its persistent corpse.
function fallPose(mesh, progress) {
  const p = phase(progress), { body, arms, legs } = mesh.userData;
  body.position.set(0, 0.16 * p, 0.45 * p);
  body.rotation.set(-Math.PI / 2 * p, 0, -0.18 * p);
  body.scale.setScalar(THREE.MathUtils.lerp(1, 0.68, p));
  arms[0].rotation.set(0.9 * (1 - p), 0, 0.40 * p);
  arms[1].rotation.set(0.9 * (1 - p), 0, -0.65 * p);
  legs[0].rotation.set(0, 0, 0.12 * p); legs[1].rotation.set(0, 0, -0.18 * p);
  mesh.userData.ring.visible = mesh.userData.pointer.visible = false;
}

export function corpseModel(view) {
  const root = characterModel(view, 'guard'), { ring, pointer, ownedMaterials } = root.userData;
  root.remove(ring, pointer); fallPose(root, 1);
  const burn = new THREE.Group(); burn.visible = false;
  const material = new THREE.MeshBasicMaterial({ color: 0x84d7b3, transparent: true, opacity: 0.6, depthWrite: false });
  ownedMaterials.push(material); view.dynamicMaterials.add(material);
  for (let i = 0; i < 5; i++) {
    const flame = view.cone(0.075, 0.50, material, 5);
    flame.position.set(Math.cos(i * 1.26) * 0.38, 0.25, Math.sin(i * 1.26) * 0.38);
    burn.add(flame);
  }
  const halo = view.torus(0.42, 0.018, material); halo.position.y = 0.04; burn.add(halo);
  root.add(burn); Object.assign(root.userData, { burn, burnMaterial: material });
  return root;
}

export function animateCorpse(mesh, disposal, gameTime) {
  fallPose(mesh, 1);
  const { body, burn, burnMaterial } = mesh.userData;
  burn.visible = Boolean(disposal);
  if (!disposal) return;
  const progress = Math.min(1, disposal.elapsed / DISPOSAL_SECONDS), consumed = phase(progress, 0.75, 1);
  body.scale.multiplyScalar(1 - consumed * 0.97); body.position.y += consumed * 0.16;
  burnMaterial.opacity = 0.4 + Math.sin(progress * Math.PI) * 0.3;
  burn.children.slice(0, 5).forEach((flame, i) => {
    const flicker = Math.sin(gameTime * 13 + i * 1.7);
    flame.position.y = 0.25 + progress * 0.20 + flicker * 0.035;
    flame.scale.set(0.8 + flicker * 0.2, 0.65 + progress + flicker * 0.22, 0.8 + flicker * 0.2);
  });
}

export function animateCharacter(mesh, actor, time, gameTime, { execution = null, deathScene = null, role = null } = {}) {
  const { body, legs, arms, trail, ring, pointer, kind } = mesh.userData;
  body.position.set(0, 0, 0); body.rotation.set(0, 0, 0); body.scale.setScalar(1);
  ring.visible = pointer.visible = true; if (trail) trail.visible = false;
  for (const limb of [...legs, ...arms]) limb.rotation.set(0, 0, 0);

  if (deathScene && role === 'victim') {
    const { recoil, kneel, fall } = deathScene, upright = 1 - phase(fall);
    fallPose(mesh, fall);
    // Keep the close-up victim at full size instead of the tile-sized corpse
    // scale used for guard disposal; leave room for its head by the attacker.
    body.scale.setScalar(1);
    body.position.y += 0.035 * phase(fall); body.position.z += 0.22 * phase(fall);
    body.position.y -= 0.27 * kneel * upright;
    body.position.z += 0.14 * recoil * upright;
    body.rotation.x += (0.18 * recoil - 0.35 * kneel) * upright;
    arms[0].rotation.x += 0.45 * recoil * upright;
    arms[1].rotation.x += 0.25 * recoil * upright;
    legs[0].rotation.x = -0.85 * kneel * upright;
    legs[1].rotation.x = -0.95 * kneel * upright;
    return;
  }
  if (deathScene && role === 'attacker') {
    const t = deathScene.time, lift = cinematicPhase(t, 0, 0.20),
      strike = cinematicPhase(t, 0.20, 0.65), recover = cinematicPhase(t, 0.65, 1.6);
    arms[0].rotation.set(-0.1, 0, 0.06);
    arms[1].rotation.set(2.1 - strike * 2.65 + recover * 0.42,
      -0.4 * lift + 0.4 * strike, -0.08);
    body.rotation.y = -0.3 + 0.6 * strike - 0.3 * recover;
    body.rotation.x = -0.1 * strike * (1 - recover);
    swordTrail(mesh, (t - 0.18) / 0.55);
    ring.visible = pointer.visible = false;
    return;
  }

  if (actor.death) {
    const progress = (gameTime - actor.death.startedAt) / DISPATCH_SECONDS;
    fallPose(mesh, actor.death.method === 'execution' ? 1 : progress);
    if (actor.death.autoDispose) {
      const dissolved = phase(progress, 0.25, 1);
      body.scale.multiplyScalar(1 - dissolved); body.position.y += dissolved * 0.3;
    }
    return;
  }

  const action = actor.execution || execution;
  if (action) {
    const t = Math.min(1, action.elapsed / action.duration);
    if (kind === 'player') {
      const grab = phase(t, 0, 0.18), windup = phase(t, 0.20, 0.46);
      const strike = phase(t, 0.46, 0.62), release = phase(t, 0.64, 1);
      body.position.z = 0.24 * grab * (1 - release);
      body.position.x = -0.16 * grab * (1 - release);
      body.rotation.set(-0.08 * windup + 0.16 * strike - 0.08 * release,
        -0.35 * windup + 0.70 * strike - 0.35 * release, 0);
      arms[0].rotation.set(1.3 * grab * (1 - release) - 0.1 * release, -0.4 * grab * (1 - release), 0.06);
      arms[1].rotation.set(1.2 * grab + 1.15 * windup - 2.8 * strike + 0.32 * release,
        -0.55 * windup + 0.55 * strike, -0.28 * windup + 0.20 * strike + 0.02 * release);
      legs[0].rotation.x = -0.12 * (1 - release); legs[1].rotation.x = 0.12 * (1 - release);
      swordTrail(mesh, (t - 0.48) / 0.18);
    } else {
      const falling = phase(t, 0.55, 0.93);
      fallPose(mesh, falling); body.position.z -= 0.18 * (1 - falling);
      body.position.x = 0.10 * (1 - falling) * phase(t, 0, 0.18);
      body.rotation.x -= 0.08 * (1 - falling);
    }
    return;
  }

  if (actor.disposal) {
    const kneel = phase(actor.disposal.elapsed, 0, 0.25);
    body.position.set(0, -0.20 * kneel, 0.24 * kneel); body.rotation.x = -0.22 * kneel;
    legs[0].rotation.x = legs[1].rotation.x = -0.95 * kneel;
    arms[0].rotation.set(1.1 * kneel, -0.3 * kneel, 0.1);
    arms[1].rotation.set(0.9 * kneel, 0.3 * kneel, -0.1);
    return;
  }

  const frozen = actor.frozenUntil > gameTime;
  const walking = Boolean(actor.motion) && !frozen;
  const pace = frozen ? 0 : Math.sin(time * (mesh.userData.kind === 'horde' ? 12 : 14));
  const stride = walking ? pace * 0.38 : 0;
  legs[0].rotation.x = stride; legs[1].rotation.x = -stride;
  arms[0].rotation.x = walking ? -stride * 0.75 : -0.10;
  arms[1].rotation.x = walking ? stride * 0.55 - 0.13 : -0.13;
  arms[0].rotation.z = 0.06; arms[1].rotation.z = -0.06;
  body.position.y = walking ? Math.abs(pace) * 0.018 : frozen ? 0 : Math.sin(time * 2 + actor.x) * 0.006;
  body.rotation.x = actor.state === 'flee' ? -0.08 : 0;
  if (actor.state === 'captured' || actor.state === 'executing') {
    body.rotation.x = 0.18; arms[0].rotation.x = arms[1].rotation.x = -0.45;
  }
  if (frozen) return;
  if (actor.warning) {
    const ready = phase(1 - actor.warning.remaining / actor.warning.duration);
    arms[1].rotation.x = 1.4 + ready * 0.8; arms[1].rotation.y = -0.45;
    body.rotation.y = -0.20 * ready;
  } else if (Number.isFinite(actor.attackStartedAt)) {
    const t = (gameTime - actor.attackStartedAt) / 0.4;
    if (t >= 0 && t < 1) {
      const lift = phase(t, 0, 0.18), strike = phase(t, 0.18, 0.60), recover = phase(t, 0.60, 1);
      arms[1].rotation.x = -0.13 + lift * 2.3 - strike * 2.9 + recover * 0.6;
      arms[1].rotation.y = -0.4 * lift + 0.4 * strike;
      body.rotation.y = -0.35 * lift + 0.7 * strike - 0.35 * recover;
      swordTrail(mesh, (t - 0.2) / 0.4);
    }
  }
}
