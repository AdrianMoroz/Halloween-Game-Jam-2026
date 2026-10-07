// All campaign numbers and authored content live here; no renderer dependencies.
export const DIRECTIONS = {
  north: { x: 0, y: -1 }, east: { x: 1, y: 0 },
  south: { x: 0, y: 1 }, west: { x: -1, y: 0 },
};

export const DEFAULT_STATS = { maxHP: 1, moveSpeed: 4, visionRadius: 5, maxSpellCasts: 8 };
export const UPGRADES = [
  { id: 'maxHP', name: 'Vitality', label: '+1 maximum HP', amount: 1, cap: 8 },
  { id: 'moveSpeed', name: 'Footwork', label: '+0.5 tiles / second', amount: 0.5, cap: 7 },
  { id: 'visionRadius', name: 'Awareness', label: '+1 vision radius', amount: 1, cap: 9 },
  { id: 'maxSpellCasts', name: 'Dark reserve', label: '+2 casts / level', amount: 2, cap: 20 },
];

// Offsets are [forward, right], rotated by the player's facing.
export const SKILLS = [
  { id: 'miasma', name: 'Shadow Miasma', short: 'Miasma', symbol: '◌', color: '#a895f5',
    kind: 'hide', unlock: 0, duration: 6, offsets: [[0, 0]],
    description: 'Hide inside a shadow cloud for 6 seconds. Leave it to become visible.' },
  { id: 'bone', name: 'Bone Snare', short: 'Snare', symbol: '⋈', color: '#d8cec0',
    kind: 'trap', unlock: 0, duration: 18, offsets: [[2, 0]],
    description: 'Place a lethal trap two tiles forward. Leaves a corpse.' },
  { id: 'frost', name: 'Yin Frost', short: 'Frost', symbol: '❄', color: '#8bccdf',
    kind: 'freeze', unlock: 0, duration: 5, offsets: [[1, 0], [2, 0], [3, 0]],
    description: 'Freeze guards on the next three forward tiles for 5 seconds.' },
  { id: 'wall', name: 'Bone Wall', short: 'Wall', symbol: '▥', color: '#d1b99e',
    kind: 'wall', unlock: 0, duration: 7, offsets: [[1, -1], [1, 0], [1, 1]],
    description: 'Block three tiles immediately ahead for 7 seconds.' },
  { id: 'knight', name: "Knight’s Strike", short: 'Knight', symbol: '⌁', color: '#c19bea',
    kind: 'kill', unlock: 1, autoDispose: false, offsets: [[2, 1]],
    description: 'Strike two tiles forward and one right. Instant kill; leaves a corpse.' },
  { id: 'flame', name: 'Spectral Flame', short: 'Flame', symbol: '♧', color: '#84d7b3',
    kind: 'kill', unlock: 1, autoDispose: true,
    offsets: [[1, -1], [1, 0], [1, 1], [2, -1], [2, 0], [2, 1]],
    description: 'Burn a 2 × 3 area ahead. Instant kills; no corpses remain.' },
  { id: 'eclipse', name: 'Black Eclipse', short: 'Eclipse', symbol: '◒', color: '#bba1fc',
    kind: 'kill', unlock: 2, autoDispose: true,
    offsets: [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]],
    description: 'Erase guards on all eight surrounding tiles. No corpses remain.' },
];

export const DEFAULT_LOADOUT = SKILLS.filter(s => s.unlock === 0).map(s => s.id);
export const SKILL_BY_ID = Object.fromEntries(SKILLS.map(skill => [skill.id, skill]));

function courtyard(extraWalls = []) {
  const width = 19, height = 17;
  const tiles = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) =>
      x === 0 || y === 0 || x === width - 1 || y === height - 1 ? '#' : '.'));
  // Walkable boundary tiles are both escape routes and reinforcement entrances.
  for (const x of [2, 9, 16]) { tiles[0][x] = '.'; tiles[height - 1][x] = '.'; }
  for (const y of [4, 12]) { tiles[y][0] = '.'; tiles[y][width - 1] = '.'; }
  for (const [x, y] of extraWalls) tiles[y][x] = '#';
  tiles[1][9] = 'E';
  return tiles.map(row => row.join(''));
}

const lines = (x1, y1, x2, y2) => {
  const result = [];
  for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) result.push([x, y]);
  return result;
};

function guard(id, patrol, facing = 'south', speed = 1.25, pause = 0.55) {
  return { id, patrol: patrol.map(([x, y]) => ({ x, y })), facing, speed, pause };
}

export const LEVELS = [
  {
    id: 'lower', name: 'The Lower Courtyards', subtitle: 'I · A debt in blood',
    map: courtyard([...lines(4, 5, 6, 5), ...lines(12, 5, 14, 5),
      ...lines(4, 6, 4, 9), ...lines(14, 6, 14, 9)]),
    start: { x: 9, y: 15 }, exit: { x: 9, y: 1 },
    guards: [
      guard('lower-1', [[7, 12], [11, 12], [11, 10], [7, 10]], 'east'),
      guard('lower-2', [[2, 8], [2, 3], [7, 3], [7, 8]], 'north'),
      guard('lower-3', [[12, 3], [16, 3], [16, 10], [12, 10]], 'east'),
      guard('lower-4', [[8, 7], [11, 7], [11, 4], [8, 4]], 'east'),
    ],
    whispers: [
      { x: 7, y: 10, text: '“They said the night watch would be safe. I have never even drawn my sword.”' },
      { x: 9, y: 4, text: '“Do not leave your post. The seal must hold until dawn.”' },
    ],
    crawl: 'The first pavilion falls behind you. These watchmen sounded young. Afraid. Your masters deserved better than hesitation. Above, another barrier hums against the night.',
  },
  {
    id: 'middle', name: 'The Silent Pavilions', subtitle: 'II · A familiar darkness',
    map: courtyard([...lines(5, 5, 5, 9), ...lines(13, 5, 13, 9),
      ...lines(7, 7, 8, 7), ...lines(10, 7, 11, 7),
      ...lines(3, 11, 5, 11), ...lines(13, 11, 15, 11)]),
    start: { x: 9, y: 15 }, exit: { x: 9, y: 1 },
    guards: [
      guard('middle-1', [[7, 12], [11, 12], [11, 10], [7, 10]], 'east', 1.45),
      guard('middle-2', [[2, 9], [2, 3], [4, 3], [4, 9]], 'north', 1.35),
      guard('middle-3', [[14, 3], [16, 3], [16, 9], [14, 9]], 'east', 1.35),
      guard('middle-4', [[6, 6], [12, 6], [12, 3], [6, 3]], 'east', 1.4),
      guard('middle-5', [[6, 9], [12, 9], [12, 8], [6, 8]], 'east', 1.3),
      guard('middle-6', [[8, 2], [11, 2], [11, 4], [8, 4]], 'east', 1.25),
    ],
    whispers: [
      { x: 6, y: 10, text: '“Master says we must buy him time. Even if none of us return.”' },
      { x: 10, y: 5, text: 'The carvings face uphill. Their blades point toward the mountain’s heart.' },
    ],
    crawl: 'The second barrier shatters. Its inscriptions were turned toward the summit. The sacred heirloom calls more clearly now, its pulse disturbingly like your own.',
  },
  {
    id: 'upper', name: 'The Upper Sanctums', subtitle: 'III · What the walls remember',
    map: courtyard([...lines(4, 6, 6, 6), ...lines(12, 6, 14, 6),
      ...lines(4, 7, 4, 10), ...lines(14, 7, 14, 10),
      ...lines(7, 4, 7, 5), ...lines(11, 4, 11, 5)]),
    start: { x: 9, y: 15 }, exit: { x: 9, y: 1 },
    guards: [
      guard('upper-1', [[6, 13], [12, 13], [12, 11], [6, 11]], 'east', 1.5),
      guard('upper-2', [[2, 10], [2, 3], [6, 3], [6, 5]], 'north', 1.5),
      guard('upper-3', [[12, 3], [16, 3], [16, 11], [15, 11]], 'east', 1.5),
      guard('upper-4', [[6, 9], [12, 9], [12, 7], [6, 7]], 'east', 1.4),
      guard('upper-5', [[8, 6], [10, 6], [10, 3], [8, 3]], 'east', 1.3),
      guard('upper-6', [[8, 2], [10, 2], [10, 4], [8, 4]], 'east', 1.3),
      guard('upper-7', [[3, 12], [3, 7], [2, 7], [2, 12]], 'north', 1.3),
      guard('upper-8', [[15, 12], [16, 12], [16, 7], [15, 7]], 'east', 1.3),
    ],
    whispers: [
      { x: 9, y: 10, text: '“It is awake. It is wearing a man’s memories again.”' },
      { x: 9, y: 4, text: 'These barriers were never built to keep a trespasser out. They were built to keep something in.' },
    ],
    crawl: 'The final prison layer breaks. You remember no massacre. No masters. Only centuries of sleep, and the part of your soul waiting at the summit.',
  },
];

export const BOSS_LEVEL = {
  id: 'summit', name: 'The Shattered Seal', subtitle: 'IV · The truth at the summit',
  map: courtyard([...lines(3, 4, 3, 5), ...lines(15, 4, 15, 5),
    ...lines(3, 11, 3, 12), ...lines(15, 11, 15, 12)]),
  start: { x: 9, y: 13 }, exit: { x: 9, y: 1 }, guards: [], whispers: [],
};

export const OPENING = [
  'Your clan is gone. Your masters lie beneath the ashes.',
  'The Radiant Yang Sect took everything—and carried your ancestral heirloom to the summit.',
  'Tonight, you climb their mountain uninvited. Slip past their watchmen, or silence them. Reclaim what is yours.',
];

export const REVELATION = [
  'The grandmaster kneels inside a broken Bagua formation. Blood runs from his eyes. He is holding the seal together with his life.',
  '“There was no clan. No stolen heirloom. You are the Yin Ghost General.”',
  'The thing calling to you is your severed soul-core. Each courtyard was a layer of your prison. You were never breaking in. You were breaking out.',
];
