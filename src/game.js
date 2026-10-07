import { DEFAULT_STATS, DEFAULT_LOADOUT, DIRECTIONS, SKILL_BY_ID, LEVELS, BOSS_LEVEL, UPGRADES } from './content.js';
import { Grid, key, sameTile, manhattan, shortestPath, shortestPathToAny, lineOfSight,
  visibleTiles, rotateOffsets, actorPosition } from './grid.js';

export const EXECUTION_SECONDS = 2.5;
export const DISPOSAL_SECONDS = 2;
// Cosmetic only: spell victims are already dead while their model falls.
export const DISPATCH_SECONDS = 0.65;
export const FIXED_STEP = 1 / 60;

export function freshRun() {
  return { version: 1, levelIndex: 0, stats: { ...DEFAULT_STATS }, loadout: [...DEFAULT_LOADOUT],
    killed: 0, total: 0, points: 0, completed: [], phase: 'loadout' };
}

export function buyUpgrade(run, id) {
  const upgrade = UPGRADES.find(u => u.id === id);
  if (!upgrade || run.points < 1 || run.stats[id] >= upgrade.cap) return false;
  run.stats[id] = Math.min(upgrade.cap, run.stats[id] + upgrade.amount);
  run.points--; return true;
}

export function commitLevel(run, game) {
  if (game.state !== 'complete' || game.level.id === BOSS_LEVEL.id || run.completed.includes(game.level.id)) return false;
  const killed = game.guards.filter(g => g.state === 'dead').length;
  run.killed += killed; run.total += game.guards.length;
  const bonus = Math.floor(killed / 2);
  run.points += 2 + bonus;
  run.completed.push(game.level.id); run.levelIndex++;
  run.phase = 'upgrades';
  return { killed, total: game.guards.length, points: 2 + bonus, bonus, mode: game.mode };
}

export function bossStats(killed, total) {
  const ratio = total > 0 ? Math.max(0, Math.min(1, killed / total)) : 0;
  // Literal ratio scaling, with minimum valid combat values for an all-spared run.
  return { ratio, maxHP: Math.max(1, Math.ceil(48 * ratio)),
    damage: Math.max(1, Math.ceil(4 * ratio)), speed: Math.max(0.5, 3.2 * ratio),
    immune: ratio >= 0.9 };
}

export function validRun(value) {
  if (!value || value.version !== 1 || !Number.isInteger(value.levelIndex) || value.levelIndex < 0 || value.levelIndex > LEVELS.length) return false;
  if (!['loadout', 'playing', 'upgrades', 'revelation'].includes(value.phase)) return false;
  if (!value.stats || !Array.isArray(value.loadout) || value.loadout.length !== 4 || new Set(value.loadout).size !== 4) return false;
  if (value.loadout.some(id => !SKILL_BY_ID[id] || SKILL_BY_ID[id].unlock > value.levelIndex)) return false;
  for (const upgrade of UPGRADES) {
    const number = value.stats[upgrade.id];
    if (!Number.isFinite(number) || number < DEFAULT_STATS[upgrade.id] || number > upgrade.cap) return false;
    if (upgrade.id !== 'moveSpeed' && !Number.isInteger(number)) return false;
  }
  if (!Array.isArray(value.completed) || value.completed.length !== value.levelIndex ||
    value.completed.some((id, index) => id !== LEVELS[index]?.id)) return false;
  const expectedTotal = LEVELS.slice(0, value.levelIndex).reduce((n, level) => n + level.guards.length, 0);
  return Number.isInteger(value.killed) && value.killed >= 0 && value.killed <= expectedTotal &&
    value.total === expectedTotal && Number.isInteger(value.points) && value.points >= 0 && value.points <= 50;
}

export class Game {
  constructor(level, stats = DEFAULT_STATS, loadout = DEFAULT_LOADOUT, campaign = { killed: 0, total: 0 }, random = Math.random) {
    if (loadout.length !== 4 || new Set(loadout).size !== 4 || loadout.some(id => !SKILL_BY_ID[id])) {
      throw new Error('Equip exactly four distinct skills.');
    }
    this.level = level; this.grid = new Grid(level.map); this.stats = { ...stats };
    this.loadout = [...loadout]; this.random = random; this.time = 0; this.state = 'playing';
    this.mode = level.id === BOSS_LEVEL.id ? 'boss' : 'stealth';
    this.player = { ...level.start, facing: 'north', hp: stats.maxHP, motion: null,
      execution: null, disposal: null, damageCooldown: 0, attackCooldown: 0 };
    this.guards = level.guards.map(data => ({ ...data, ...data.patrol[0],
      patrol: data.patrol.map(p => ({ ...p })), tag: 'StealthGuard', state: 'patrol',
      waypoint: 1 % data.patrol.length, pauseLeft: 0.6, motion: null, frozenUntil: 0 }));
    this.corpses = []; this.effects = []; this.horde = []; this.events = [];
    this.castsLeft = stats.maxSpellCasts; this.castCooldown = 0; this.enemyId = 0;
    this.hordeClock = 0; this.spawnClock = 0; this.spottedWhispers = new Set();
    this.boundaries = this.grid.boundaryTiles(); this.visible = new Set();
    this.visibilityRevision = 0; this.refreshVision();
    this.boss = this.mode === 'boss' ? { x: 9, y: 7, facing: 'south',
      ...bossStats(campaign.killed, campaign.total), hp: bossStats(campaign.killed, campaign.total).maxHP,
      motion: null, frozenUntil: 0, cooldown: 1.5, warning: null, state: 'alive' } : null;
  }

  emit(type, details = {}) { this.events.push({ type, ...details }); }
  drainEvents() { return this.events.splice(0); }
  activeEffects(kind) { return this.effects.filter(e => e.kind === kind && e.expires > this.time); }
  spellBlocked(x, y) { return this.effects.some(e => e.kind === 'wall' && e.expires > this.time && e.tiles.some(p => p.x === x && p.y === y)); }
  blocked(x, y) { return this.grid.isWall(x, y) || this.spellBlocked(x, y); }
  isHidden() { return this.activeEffects('hide').some(e => e.tiles.some(p => sameTile(p, this.player))); }
  frozen(actor) { return actor.frozenUntil > this.time; }
  refreshVision() {
    if (this.mode === 'horde' || this.mode === 'boss') {
      this.visible = new Set();
      for (let y = 0; y < this.grid.height; y++) for (let x = 0; x < this.grid.width; x++) this.visible.add(key(x, y));
    } else {
      this.visible = visibleTiles(this.grid, this.player, this.stats.visionRadius, (x, y) => this.spellBlocked(x, y));
    }
    this.visibilityRevision++;
  }

  visionCone(guard) {
    if (!['patrol', 'flee'].includes(guard.state) || this.frozen(guard)) return [];
    const offsets = [];
    for (let forward = 1; forward <= 3; forward++) for (const right of [-1, 0, 1]) offsets.push([forward, right]);
    return rotateOffsets(guard, DIRECTIONS[guard.facing], offsets)
      .filter(p => !this.blocked(p.x, p.y) && lineOfSight(this.grid, guard, p, (x, y) => this.spellBlocked(x, y)));
  }
  guardSees(guard, target) { return this.visionCone(guard).some(p => sameTile(p, target)); }
  guardAt(x, y) { return this.guards.find(g => g.state !== 'dead' && g.x === x && g.y === y); }
  reservedGuardAt(x, y) {
    return this.guards.find(g => g.state !== 'dead' && g.motion && g.motion.to.x === x && g.motion.to.y === y);
  }
  face(direction) {
    if (this.state !== 'playing' || this.player.execution || !DIRECTIONS[direction]) return false;
    this.player.facing = direction; return true;
  }

  move(direction) {
    const p = this.player;
    if (!this.face(direction) || p.motion || p.execution) return false;
    const delta = DIRECTIONS[direction], target = { x: p.x + delta.x, y: p.y + delta.y };
    if (this.blocked(target.x, target.y)) return false;
    const guard = this.guardAt(target.x, target.y);
    if (guard && ['captured', 'executing'].includes(guard.state)) return false;
    if (guard?.state === 'patrol' && !this.frozen(guard) && !this.isHidden() && this.guardSees(guard, p)) {
      this.alert(guard, 'player'); return false;
    }
    // Movement reservations stop two actors passing through one another.
    if (!guard && this.reservedGuardAt(target.x, target.y)) return false;
    if (this.boss && this.boss.state === 'alive' && (sameTile(this.boss, target) ||
      this.boss.motion && sameTile(this.boss.motion.to, target))) return false;
    p.disposal = null;
    this.startStep(p, target, 1 / this.stats.moveSpeed);
    if (guard) {
      guard.state = 'captured'; guard.motion = null;
      p.motion.victimId = guard.id;
    }
    return true;
  }

  startStep(actor, target, duration) {
    const dx = target.x - actor.x, dy = target.y - actor.y;
    actor.facing = dx > 0 ? 'east' : dx < 0 ? 'west' : dy > 0 ? 'south' : 'north';
    actor.motion = { from: { x: actor.x, y: actor.y }, to: { ...target }, elapsed: 0, duration };
  }
  advanceStep(actor, dt) {
    if (!actor.motion) return null;
    actor.motion.elapsed += dt;
    if (actor.motion.elapsed + 1e-8 < actor.motion.duration) return null;
    const finished = actor.motion;
    actor.x = finished.to.x; actor.y = finished.to.y; actor.motion = null;
    return finished;
  }

  alert(guard, reason) {
    if (guard.state !== 'patrol') return;
    guard.state = 'flee'; guard.pauseLeft = 0;
    if (this.mode !== 'horde') this.mode = 'chase';
    this.emit('alert', { guardId: guard.id, reason });
  }

  killGuard(guard, autoDispose = false, method = 'spell') {
    if (!guard || guard.state === 'dead') return false;
    const facing = method === 'execution' ? this.player.facing : guard.facing;
    guard.death = { startedAt: this.time, method, autoDispose, facing, position: actorPosition(guard) };
    guard.state = 'dead'; guard.motion = null;
    if (!autoDispose) this.corpses.push({ id: `corpse-${guard.id}`, x: guard.x, y: guard.y, facing,
      settlesAt: this.time + (method === 'execution' ? 0 : DISPATCH_SECONDS) });
    this.emit('kill', { x: guard.x, y: guard.y, autoDispose });
    return true;
  }

  beginExecution(guard) {
    guard.state = 'executing'; guard.motion = null;
    this.player.execution = { guardId: guard.id, elapsed: 0, duration: EXECUTION_SECONDS };
    this.emit('execution');
  }

  spellTiles(id) {
    const skill = SKILL_BY_ID[id];
    if (!skill) return [];
    return rotateOffsets(this.player, DIRECTIONS[this.player.facing], skill.offsets)
      .filter(p => !this.grid.isWall(p.x, p.y));
  }

  cast(slot) {
    if (this.state !== 'playing' || this.mode === 'horde' || this.player.execution || this.player.motion || this.castCooldown > 0) return false;
    if (this.castsLeft <= 0) { this.emit('notice', { text: 'Your dark reserve is exhausted.' }); return false; }
    const skill = SKILL_BY_ID[this.loadout[slot]];
    if (!skill) return false;
    let tiles = this.spellTiles(skill.id);
    if (skill.kind === 'wall') {
      tiles = tiles.filter(p => !sameTile(p, this.player) && !this.guardAt(p.x, p.y) && !this.reservedGuardAt(p.x, p.y) &&
        !this.horde.some(e => sameTile(e, p) || e.motion && sameTile(e.motion.to, p)) &&
        !(this.boss && (sameTile(this.boss, p) || this.boss.motion && sameTile(this.boss.motion.to, p))));
    }
    if (!tiles.length) { this.emit('notice', { text: 'No valid target tiles in that direction.' }); return false; }
    this.castsLeft--; this.castCooldown = 0.22; this.player.disposal = null;
    if (['hide', 'trap', 'wall'].includes(skill.kind)) {
      this.effects.push({ id: `effect-${this.enemyId++}`, kind: skill.kind, tiles, expires: this.time + skill.duration });
    }
    for (const tile of tiles) {
      const guard = this.guardAt(tile.x, tile.y);
      if (skill.kind === 'freeze' && guard) { guard.frozenUntil = this.time + skill.duration; }
      if (skill.kind === 'kill' && guard) this.killGuard(guard, skill.autoDispose);
      if (skill.autoDispose) this.corpses = this.corpses.filter(c => !sameTile(c, tile));
      if (this.boss && this.boss.state === 'alive' && sameTile(this.boss, tile)) {
        if (skill.kind === 'freeze') this.boss.frozenUntil = this.time + 2;
        if (skill.kind === 'kill') this.damageBoss(6);
      }
    }
    this.resolveTraps(); this.refreshVision();
    this.emit('cast', { skill: skill.id, tiles }); return true;
  }

  resolveTraps() {
    for (const effect of this.activeEffects('trap')) {
      for (const tile of effect.tiles) {
        const guard = this.guardAt(tile.x, tile.y);
        if (guard && !['captured', 'executing'].includes(guard.state)) {
          this.killGuard(guard); effect.expires = this.time;
        }
        if (this.boss && this.boss.state === 'alive' && sameTile(this.boss, tile)) {
          this.damageBoss(6); effect.expires = this.time;
        }
      }
    }
  }

  triggerHorde() {
    if (this.mode === 'horde' || this.mode === 'boss' || this.state !== 'playing') return;
    this.mode = 'horde'; this.spawnClock = 0; this.hordeClock = 0;
    this.refreshVision(); this.emit('horde');
  }

  damagePlayer(amount = 1, attacker = null) {
    if (this.state !== 'playing' || this.player.damageCooldown > 0) return false;
    this.player.hp = Math.max(0, this.player.hp - amount);
    this.player.damageCooldown = 0.7; this.player.disposal = null;
    this.emit('damage', { amount });
    if (this.player.hp <= 0) {
      this.player.death = { startedAt: this.time, position: actorPosition(this.player), facing: this.player.facing,
        attacker: attacker ? { id: attacker === this.boss ? 'boss' : attacker.id,
          kind: attacker === this.boss ? 'boss' : attacker.tag === 'HordeEnemy' ? 'horde' : 'guard',
          position: actorPosition(attacker), facing: attacker.facing } : null };
      this.state = 'dead';
      this.emit('death', { nightmare: Boolean(this.boss?.immune) });
    }
    return true;
  }

  spawnHorde() {
    const options = this.boundaries.filter(p => !this.blocked(p.x, p.y) && !sameTile(p, this.player) &&
      !this.horde.some(e => sameTile(e, p)) && shortestPath(this.grid, p, this.player, (x, y) => this.spellBlocked(x, y)));
    if (!options.length || this.horde.length >= 70) return;
    const position = options[Math.min(options.length - 1, Math.floor(this.random() * options.length))];
    this.horde.push({ ...position, id: `horde-${this.enemyId++}`, tag: 'HordeEnemy', facing: 'south', motion: null,
      speed: Math.min(3, 1.8 + this.hordeClock * 0.018) });
  }

  strike() {
    if (this.state !== 'playing' || this.mode !== 'boss' || this.player.execution || this.player.motion || this.player.attackCooldown > 0) return false;
    this.player.attackCooldown = 0.4;
    this.player.attackStartedAt = this.time;
    const facing = DIRECTIONS[this.player.facing];
    const tile = { x: this.player.x + facing.x, y: this.player.y + facing.y };
    this.emit('strike', { tiles: [tile] });
    if (this.boss && sameTile(this.boss, tile)) this.damageBoss(3);
    return true;
  }

  damageBoss(amount) {
    if (!this.boss || this.boss.state !== 'alive') return;
    if (this.boss.immune) { this.emit('immune'); return; }
    this.boss.hp = Math.max(0, this.boss.hp - amount);
    this.emit('bossHit');
    if (this.boss.hp === 0) {
      this.boss.death = { startedAt: this.time }; this.boss.state = 'dead';
      this.state = 'won'; this.emit('victory');
    }
  }

  updateBoss(dt) {
    const boss = this.boss;
    if (!boss || boss.state !== 'alive' || this.frozen(boss)) return;
    this.advanceStep(boss, dt);
    boss.cooldown -= dt;
    if (boss.warning) {
      boss.warning.remaining -= dt;
      if (boss.warning.remaining <= 0) {
        boss.attackStartedAt = this.time;
        if (boss.warning.tiles.some(tile => sameTile(tile, this.player))) this.damagePlayer(boss.damage, boss);
        this.emit('bossAttack', { tiles: boss.warning.tiles });
        boss.warning = null; boss.cooldown = boss.immune ? 0.65 : 1.1;
      }
      return;
    }
    if (boss.motion) return;
    if (manhattan(boss, this.player) <= 3 && boss.cooldown <= 0) {
      const dx = this.player.x - boss.x, dy = this.player.y - boss.y;
      boss.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'east' : 'west') : (dy > 0 ? 'south' : 'north');
      const offsets = [];
      for (let f = 1; f <= 3; f++) for (const r of [-1, 0, 1]) offsets.push([f, r]);
      const tiles = rotateOffsets(boss, DIRECTIONS[boss.facing], offsets)
        .filter(p => !this.blocked(p.x, p.y) && lineOfSight(this.grid, boss, p, (x, y) => this.spellBlocked(x, y)));
      boss.warning = { remaining: boss.immune ? 0.5 : 0.85, duration: boss.immune ? 0.5 : 0.85, tiles };
      this.emit('bossWarning');
    } else if (manhattan(boss, this.player) > 1) {
      const path = shortestPath(this.grid, boss, this.player, (x, y) => this.spellBlocked(x, y));
      if (path?.length > 2) this.startStep(boss, path[1], 1 / boss.speed);
    }
  }

  updateGuard(guard, dt) {
    if (guard.state === 'dead' || guard.state === 'captured' || guard.state === 'executing' || this.frozen(guard)) return;
    const arrived = this.advanceStep(guard, dt);
    if (arrived) {
      this.resolveTraps();
      if (guard.state === 'dead') return;
      if (guard.state === 'flee' && this.grid.isBoundary(guard.x, guard.y)) this.triggerHorde();
      if (guard.state === 'patrol' && sameTile(guard, guard.patrol[guard.waypoint])) {
        guard.waypoint = (guard.waypoint + 1) % guard.patrol.length;
        guard.pauseLeft = guard.pause;
      }
    }
    if (guard.state === 'patrol') {
      if (!this.isHidden() && (this.guardSees(guard, this.player) || sameTile(guard, this.player))) this.alert(guard, 'player');
      else if (this.corpses.some(corpse => this.guardSees(guard, corpse) || sameTile(guard, corpse))) this.alert(guard, 'corpse');
    }
    if (guard.motion) return;
    guard.pauseLeft = Math.max(0, guard.pauseLeft - dt);
    if (guard.pauseLeft > 0) return;
    const obstacles = (x, y) => this.spellBlocked(x, y);
    let path;
    if (guard.state === 'flee') {
      if (this.grid.isBoundary(guard.x, guard.y)) { this.triggerHorde(); return; }
      path = shortestPathToAny(this.grid, guard, this.boundaries, obstacles);
    } else path = shortestPath(this.grid, guard, guard.patrol[guard.waypoint], obstacles);
    if (!path || path.length < 2) return;
    const next = path[1];
    if (sameTile(next, this.player) || this.player.motion && sameTile(next, this.player.motion.to)) return;
    if (this.guards.some(other => other !== guard && other.state !== 'dead' && (sameTile(other, next) || other.motion && sameTile(other.motion.to, next)))) return;
    this.startStep(guard, next, 1 / (guard.speed * (guard.state === 'flee' ? 1.55 : 1)));
    // Turning is a simulation action: perception uses the new facing immediately.
    if (guard.state === 'patrol' && !this.isHidden() && this.guardSees(guard, this.player)) this.alert(guard, 'player');
  }

  update(dt) {
    if (this.state !== 'playing' || !Number.isFinite(dt) || dt <= 0) return;
    this.time += dt;
    this.castCooldown = Math.max(0, this.castCooldown - dt);
    this.player.damageCooldown = Math.max(0, this.player.damageCooldown - dt);
    this.player.attackCooldown = Math.max(0, this.player.attackCooldown - dt);
    const previousEffects = this.effects.length;
    this.effects = this.effects.filter(e => e.expires > this.time);
    if (previousEffects !== this.effects.length) this.refreshVision();
    const arrived = this.advanceStep(this.player, dt);
    if (arrived) {
      this.refreshVision();
      if (arrived.victimId) {
        const guard = this.guards.find(g => g.id === arrived.victimId);
        if (guard && guard.state !== 'dead') this.beginExecution(guard);
      }
    }
    if (this.player.execution) {
      const execution = this.player.execution;
      execution.elapsed += dt;
      if (execution.elapsed + 1e-8 >= execution.duration) {
        this.killGuard(this.guards.find(g => g.id === execution.guardId), false, 'execution');
        this.player.execution = null;
      }
    } else if (!this.player.motion) {
      const corpse = this.corpses.find(c => sameTile(c, this.player));
      if (corpse) {
        if (this.player.disposal?.corpseId !== corpse.id) this.player.disposal = { corpseId: corpse.id, elapsed: 0 };
        this.player.disposal.elapsed += dt;
        if (this.player.disposal.elapsed + 1e-8 >= DISPOSAL_SECONDS) {
          this.corpses = this.corpses.filter(c => c.id !== corpse.id);
          this.player.disposal = null; this.emit('dispose', { x: corpse.x, y: corpse.y });
        }
      } else this.player.disposal = null;
    }
    for (const guard of this.guards) this.updateGuard(guard, dt);
    if (this.mode === 'chase' && !this.guards.some(g => g.state === 'flee')) {
      this.mode = 'stealth'; this.emit('intercepted');
    }
    if (this.mode === 'horde') {
      this.hordeClock += dt; this.spawnClock -= dt;
      if (this.spawnClock <= 0) { this.spawnHorde(); this.spawnClock = Math.max(0.3, 0.9 - this.hordeClock * 0.012); }
      for (const enemy of this.horde) {
        const crossing = enemy.motion && this.player.motion &&
          sameTile(enemy.motion.to, this.player.motion.from) && sameTile(enemy.motion.from, this.player.motion.to);
        this.advanceStep(enemy, dt);
        if (sameTile(enemy, this.player) || crossing) this.damagePlayer(1, enemy);
        if (this.state !== 'playing') break;
        if (!enemy.motion && !sameTile(enemy, this.player)) {
          const path = shortestPath(this.grid, enemy, this.player, (x, y) => this.spellBlocked(x, y));
          if (path?.length > 1) this.startStep(enemy, path[1], 1 / enemy.speed);
        }
      }
    }
    if (this.state === 'playing') this.updateBoss(dt);
    if (this.state !== 'playing') return;
    for (const [index, whisper] of (this.level.whispers || []).entries()) {
      if (!this.spottedWhispers.has(index) && manhattan(whisper, this.player) <= 2) {
        this.spottedWhispers.add(index); this.emit('whisper', { text: whisper.text, index });
      }
    }
    if (!this.boss && !this.player.motion && !this.player.execution && sameTile(this.player, this.level.exit)) {
      this.state = 'complete'; this.emit('complete');
    }
  }
}
