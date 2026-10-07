import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let count = 0;
for (const directory of ['src', 'tests', 'scripts']) {
  for (const name of readdirSync(resolve(root, directory))) {
    if (!/\.(js|mjs)$/.test(name)) continue;
    const file = resolve(root, directory, name), source = readFileSync(file, 'utf8');
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (result.status !== 0) throw Error(result.stderr);
    for (const match of source.matchAll(/(?:from\s+|import\s*)['"](\.\.?\/[^'"]+)['"]/g)) {
      if (!existsSync(resolve(dirname(file), match[1]))) throw Error(`Missing import: ${file} -> ${match[1]}`);
    }
    count++;
  }
}
const html = readFileSync(resolve(root, 'index.html'), 'utf8');
for (const match of html.matchAll(/(?:src|href)="(\.\/[^"?#]+)"/g)) {
  if (!existsSync(resolve(root, match[1]))) throw Error(`Missing static asset: ${match[1]}`);
}
const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
const main = readFileSync(resolve(root, 'src/main.js'), 'utf8');
const generated = new Set([...main.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
for (const match of main.matchAll(/\$\('([^']+)'\)/g)) {
  if (!ids.has(match[1]) && !generated.has(match[1])) throw Error(`Unbound UI element: ${match[1]}`);
}
if (!existsSync(resolve(root, '.nojekyll'))) throw Error('Missing .nojekyll for static Pages publishing.');
console.log(`Checked ${count} JavaScript files, local imports, static assets, and UI element bindings.`);
