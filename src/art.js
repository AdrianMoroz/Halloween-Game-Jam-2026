import * as THREE from '../vendor/three.module.js';

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
  root.userData = { body, robeMaterial: cloth, ring, pointer, legs, arms, baseColor: profile.cloth, kind };
  return root;
}

export function animateCharacter(mesh, actor, time, gameTime) {
  const { body, legs, arms } = mesh.userData;
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
}
