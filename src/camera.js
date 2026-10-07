import * as THREE from '../vendor/three.module.js';
import { actorPosition } from './grid.js';
import { DIRECTIONS } from './content.js';
import { cinematicPhase } from './cutscene.js';

// A close, stable overhead perspective: the camera never rotates with facing.
// The optional wide view is useful for planning without revealing fogged tiles.
export class TacticalCamera {
  constructor() {
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    this.focus = new THREE.Vector3();
    this.desired = new THREE.Vector3();
    this.offset = new THREE.Vector3();
    this.overview = false;
    this.preview = false;
    this.distance = 1;
  }

  setGame(game, preview = false) {
    this.game = game;
    this.preview = preview;
    this.deathShot = null;
    this.update(0, 0, 0, true);
  }

  resize(width, height) {
    this.camera.aspect = Math.max(0.1, width / Math.max(1, height));
    this.camera.updateProjectionMatrix();
    if (this.deathShot) {
      this.deathShot.angle = null;
      this.updateDeathCutscene(this.deathShot.cutscene);
    } else if (this.game) this.update(0, 0, 0, true);
  }

  toggle() { this.overview = !this.overview; return this.overview; }

  startDeathCutscene(cutscene) {
    this.deathShot = { cutscene, fromPosition: this.camera.position.clone(), fromFocus: this.focus.clone(), angle: null };
    this.updateDeathCutscene(cutscene);
  }

  worldPosition(position, height = 0) {
    return new THREE.Vector3(position.x - (this.game.grid.width - 1) / 2,
      height, position.y - (this.game.grid.height - 1) / 2);
  }

  // Conservative wall volumes include caps and active spell walls. Do not
  // reveal or remove map geometry to obtain a cinematic camera angle.
  shotBlocked(from, target) {
    const steps = Math.ceil(from.distanceTo(target) / 0.06), { grid, level } = this.game;
    for (let step = 1; step < steps; step++) {
      const p = step / steps, height = THREE.MathUtils.lerp(from.y, target.y, p);
      const worldX = THREE.MathUtils.lerp(from.x, target.x, p), worldZ = THREE.MathUtils.lerp(from.z, target.z, p);
      if (height < 2.2 && this.game.visible.has(`${level.exit.x},${level.exit.y}`)) {
        const dx = worldX - (level.exit.x - (grid.width - 1) / 2), dz = worldZ - (level.exit.y - (grid.height - 1) / 2);
        const post = height < 1.8 && Math.abs(Math.abs(dx) - 0.45) < 0.15 && Math.abs(dz) < 0.16;
        const lintel = height > 1.64 && height < 1.8 && Math.abs(dx) < 0.6 && Math.abs(dz) < 0.16;
        const plaque = height > 1.48 && height < 1.76 && Math.abs(dx) < 0.18 && dz > 0.15 && dz < 0.25;
        const roof = height >= 1.8 && Math.abs(dx) < 0.7 && Math.abs(dz) < 0.44;
        if (post || lintel || plaque || roof) return true;
      }
      if (height > 1.5) continue;
      const x = Math.round(worldX + (grid.width - 1) / 2), y = Math.round(worldZ + (grid.height - 1) / 2);
      if (!grid.contains(x, y)) continue;
      if (grid.isWall(x, y) && (this.preview || this.game.visible.has(`${x},${y}`))) return true;
      if (height < 1.2 && this.game.spellBlocked(x, y)) return true;
    }
    return false;
  }

  updateDeathCutscene(cutscene) {
    const shot = this.deathShot;
    if (!shot) return;
    const player = this.worldPosition(cutscene.player), attacker = cutscene.attackerEnd ? this.worldPosition(cutscene.attackerEnd) : player.clone();
    const target = player.clone().lerp(attacker, 0.3);
    target.y = cutscene.reducedMotion ? 0.65 : THREE.MathUtils.lerp(0.78, 0.36, cutscene.frame.fall);
    const tangent = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const framingPosition = (angle, elevation) => {
      const direction = new THREE.Vector3(Math.cos(angle) * 3.9, elevation - target.y, Math.sin(angle) * 3.9).normalize();
      const right = new THREE.Vector3(0, 1, 0).cross(direction).normalize(), up = direction.clone().cross(right);
      let distance = Math.hypot(3.9, elevation - target.y);
      // Solve the perspective fit for both outfits, limbs, and the lying body.
      // Padding also keeps them inside the cinematic letterbox in portrait.
      for (const subject of [player, attacker]) for (const x of [-0.9, 0.9]) for (const z of [-0.9, 0.9]) for (const y of [0.12, 1.8]) {
        const relative = subject.clone().add(new THREE.Vector3(x, y, z)).sub(target);
        const depth = relative.dot(direction);
        distance = Math.max(distance, depth + Math.abs(relative.dot(right)) / (tangent * this.camera.aspect * 0.84),
          depth + Math.abs(relative.dot(up)) / (tangent * 0.74));
      }
      return direction.multiplyScalar(distance).add(target);
    };
    const targets = [player.clone().setY(0.18), player.clone().setY(1.4), attacker.clone().setY(1.45)];
    if (shot.angle === null) {
      const ideal = Math.atan2(cutscene.direction.y, cutscene.direction.x) + (this.camera.aspect < 1 ? Math.PI / 4 : Math.PI / 2);
      const offsets = [0, Math.PI, Math.PI / 4, -Math.PI / 4, Math.PI * 0.75, -Math.PI * 0.75, Math.PI / 2, -Math.PI / 2];
      let found = false;
      for (const elevation of [3.4, 5.4, 8.4]) {
        for (const offset of offsets) {
          const angle = ideal + offset;
          // Validate both ends of the small orbit before choosing a view.
          const clear = [0, cutscene.reducedMotion ? 0 : 0.16].every(drift => {
            const position = framingPosition(angle + drift, elevation);
            return targets.every(point => !this.shotBlocked(position, point));
          });
          if (clear) { shot.angle = angle; shot.elevation = elevation; found = true; break; }
        }
        if (found) break;
      }
      if (!found) { shot.angle = ideal; shot.elevation = 10; }
    }
    const time = cutscene.elapsed, drift = cutscene.reducedMotion ? 0 : cinematicPhase(time, 1.5, 3.8) * 0.16;
    const angle = shot.angle + drift;
    const desired = framingPosition(angle, shot.elevation);
    const blend = cutscene.reducedMotion ? 1 : cinematicPhase(time, 0, 0.85);
    this.camera.position.lerpVectors(shot.fromPosition, desired, blend);
    this.focus.lerpVectors(shot.fromFocus, target, blend);
    // Keep the dolly clear as it crosses the courtyard toward the chosen shot.
    while (this.camera.position.y < 24 && targets.some(point => this.shotBlocked(this.camera.position, point))) this.camera.position.y += 0.3;
    this.camera.lookAt(this.focus); this.camera.updateMatrixWorld();
  }

  update(dt, elapsed = 0, shake = 0, snap = false) {
    if (!this.game) return;
    const { grid, player } = this.game;
    const wide = this.overview || this.preview;
    if (wide) this.desired.set(0, 0, 0);
    else {
      const position = actorPosition(player), facing = DIRECTIONS[player.facing];
      this.desired.set(position.x - (grid.width - 1) / 2 + facing.x * 0.55,
        0, position.y - (grid.height - 1) / 2 + facing.y * 0.55);
    }
    const blend = snap ? 1 : 1 - Math.exp(-Math.max(0, dt) * 8);
    this.focus.lerp(this.desired, blend);
    // Keep a usable horizontal field on narrow screens. Wide view fits the map.
    const tangent = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const length = Math.hypot(9.2, 6.8), sin = 9.2 / length, cos = 6.8 / length;
    const halfWidth = (grid.width + 1) / 2, halfDepth = (grid.height + 1) / 2;
    const fitWidth = halfWidth / (tangent * this.camera.aspect) + halfDepth * cos;
    const fitHeight = (halfDepth * sin + 2 * cos) / tangent + halfDepth * cos + 2 * sin;
    const base = wide ? Math.max(fitWidth, fitHeight) * 1.06 / length : Math.max(1, 0.9 / this.camera.aspect);
    this.distance += (base - this.distance) * blend;
    this.offset.set(0, 9.2, 6.8).multiplyScalar(this.distance);
    this.camera.position.copy(this.focus).add(this.offset);
    this.camera.lookAt(this.focus);
    this.camera.position.x += Math.sin(elapsed * 63) * shake;
    this.camera.updateMatrixWorld();
  }
}
