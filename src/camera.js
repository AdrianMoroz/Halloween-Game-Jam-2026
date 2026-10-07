import * as THREE from '../vendor/three.module.js';
import { actorPosition } from './grid.js';
import { DIRECTIONS } from './content.js';

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
    this.update(0, 0, 0, true);
  }

  resize(width, height) {
    this.camera.aspect = Math.max(0.1, width / Math.max(1, height));
    this.camera.updateProjectionMatrix();
    if (this.game) this.update(0, 0, 0, true);
  }

  toggle() { this.overview = !this.overview; return this.overview; }

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
