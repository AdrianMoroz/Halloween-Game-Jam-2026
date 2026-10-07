import { actorPosition } from './grid.js';
import { DIRECTIONS } from './content.js';

export const DEATH_CUTSCENE_SECONDS = 4.6;

export function cinematicPhase(time, start, end) {
  const t = Math.max(0, Math.min(1, (time - start) / (end - start)));
  return t * t * (3 - 2 * t);
}

// Rendering owns this clock. The fatal hit has already ended the simulation.
export class DeathCutscene {
  constructor(game, reducedMotion = false) {
    this.elapsed = 0; this.finished = false; this.reducedMotion = reducedMotion;
    this.player = { ...(game.player.death?.position || actorPosition(game.player)) };
    this.attacker = game.player.death?.attacker || null;
    const facing = DIRECTIONS[this.attacker?.facing || game.player.facing];
    let dx = this.attacker ? this.attacker.position.x - this.player.x : facing.x;
    let dy = this.attacker ? this.attacker.position.y - this.player.y : facing.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 0.01) { dx = -facing.x; dy = -facing.y; }
    const length = Math.hypot(dx, dy);
    this.direction = { x: dx / length, y: dy / length };
    this.attackerEnd = this.attacker ? { ...this.attacker.position } : null;
    // Contact enemies may occupy the same tile. Separate their silhouettes
    // cosmetically, within reachable paving, without moving either game actor.
    if (this.attacker && distance < 1.05) {
      for (const separation of [1.05, 0.65]) {
        const position = { x: this.player.x + this.direction.x * separation,
          y: this.player.y + this.direction.y * separation };
        if (!game.blocked(Math.round(position.x), Math.round(position.y))) {
          this.attackerEnd = position; break;
        }
      }
    }
  }

  update(dt) {
    if (!this.finished && Number.isFinite(dt)) this.elapsed = Math.min(DEATH_CUTSCENE_SECONDS, this.elapsed + Math.max(0, dt));
    this.finished = this.elapsed >= DEATH_CUTSCENE_SECONDS;
    return this.frame;
  }

  finish() { this.elapsed = DEATH_CUTSCENE_SECONDS; this.finished = true; }

  get frame() {
    const time = this.elapsed;
    return { time, spread: cinematicPhase(time, 0, 0.45),
      recoil: cinematicPhase(time, 0.08, 0.4), kneel: cinematicPhase(time, 0.4, 1.15),
      fall: cinematicPhase(time, 1.15, 2.55),
      title: cinematicPhase(time, 2.3, 3), fade: cinematicPhase(time, 3.85, DEATH_CUTSCENE_SECONDS) };
  }
}
