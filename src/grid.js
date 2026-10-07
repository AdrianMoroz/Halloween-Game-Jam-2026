export const key = (x, y) => `${x},${y}`;
export const sameTile = (a, b) => a.x === b.x && a.y === b.y;
export const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export const NEIGHBORS = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];

export class Grid {
  constructor(rows) {
    if (!rows.length || rows.some(row => row.length !== rows[0].length)) {
      throw new Error('Maps must be nonempty and rectangular.');
    }
    this.rows = rows;
    this.width = rows[0].length;
    this.height = rows.length;
  }
  contains(x, y) { return x >= 0 && y >= 0 && x < this.width && y < this.height; }
  isWall(x, y) { return !this.contains(x, y) || this.rows[y][x] === '#'; }
  isBoundary(x, y) {
    return this.contains(x, y) && (x === 0 || y === 0 || x === this.width - 1 || y === this.height - 1);
  }
  boundaryTiles() {
    const result = [];
    for (let y = 0; y < this.height; y++) for (let x = 0; x < this.width; x++) {
      if (this.isBoundary(x, y) && !this.isWall(x, y)) result.push({ x, y });
    }
    return result;
  }
}

// Breadth-first search on the movement graph, including temporary spell walls.
export function shortestPath(grid, start, goal, blocked = () => false) {
  return shortestPathToAny(grid, start, [goal], blocked);
}

export function shortestPathToAny(grid, start, goals, blocked = () => false) {
  const targetKeys = new Set(goals.filter(p => !grid.isWall(p.x, p.y) && !blocked(p.x, p.y))
    .map(p => key(p.x, p.y)));
  if (!targetKeys.size) return null;
  const queue = [{ x: start.x, y: start.y }];
  const parents = new Map([[key(start.x, start.y), null]]);
  let head = 0;
  while (head < queue.length) {
    const current = queue[head++], currentKey = key(current.x, current.y);
    if (targetKeys.has(currentKey)) {
      const path = [];
      let cursor = currentKey;
      while (cursor !== null) {
        const [x, y] = cursor.split(',').map(Number);
        path.push({ x, y }); cursor = parents.get(cursor);
      }
      return path.reverse();
    }
    for (const d of NEIGHBORS) {
      const next = { x: current.x + d.x, y: current.y + d.y }, nextKey = key(next.x, next.y);
      if (parents.has(nextKey) || grid.isWall(next.x, next.y) || blocked(next.x, next.y)) continue;
      parents.set(nextKey, currentKey); queue.push(next);
    }
  }
  return null;
}

// Supercover rays: two touching wall corners cannot be seen through diagonally.
// The target wall itself is visible, but it occludes every tile behind it.
export function lineOfSight(grid, from, to, blocked = () => false) {
  if (!grid.contains(to.x, to.y)) return false;
  let x = from.x, y = from.y;
  const dx = to.x - x, dy = to.y - y, nx = Math.abs(dx), ny = Math.abs(dy);
  const sx = Math.sign(dx), sy = Math.sign(dy);
  let ix = 0, iy = 0;
  const opaque = (px, py) => grid.isWall(px, py) || blocked(px, py);
  while (ix < nx || iy < ny) {
    const decision = (1 + 2 * ix) * ny - (1 + 2 * iy) * nx;
    if (decision === 0) {
      if (opaque(x + sx, y) || opaque(x, y + sy)) return false;
      x += sx; y += sy; ix++; iy++;
    } else if (decision < 0) { x += sx; ix++; }
    else { y += sy; iy++; }
    if (x === to.x && y === to.y) return true;
    if (opaque(x, y)) return false;
  }
  return true;
}

export function visibleTiles(grid, origin, radius, blocked = () => false) {
  const visible = new Set();
  for (let y = origin.y - radius; y <= origin.y + radius; y++) {
    for (let x = origin.x - radius; x <= origin.x + radius; x++) {
      if ((x - origin.x) ** 2 + (y - origin.y) ** 2 > radius ** 2 || !grid.contains(x, y)) continue;
      if (lineOfSight(grid, origin, { x, y }, blocked)) visible.add(key(x, y));
    }
  }
  return visible;
}

export function rotateOffsets(origin, facing, offsets) {
  const right = { x: -facing.y, y: facing.x };
  return offsets.map(([forward, sideways]) => ({
    x: origin.x + facing.x * forward + right.x * sideways,
    y: origin.y + facing.y * forward + right.y * sideways,
  }));
}

export function actorPosition(actor) {
  if (!actor.motion) return { x: actor.x, y: actor.y };
  const t = Math.min(1, actor.motion.elapsed / actor.motion.duration);
  return { x: actor.motion.from.x + (actor.motion.to.x - actor.motion.from.x) * t,
    y: actor.motion.from.y + (actor.motion.to.y - actor.motion.from.y) * t };
}
