/**
 * Fails (exit 1) if fixtures/ differs from what core generates now, or if a committed copy of
 * the canonical stylesheet (packages/core/src/style.css) has drifted. Run: npm run fixtures:check
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFixtures, serialize } from './fixtures-lib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'fixtures');
const groups = buildFixtures();
const problems: string[] = [];

for (const [group, fixtures] of Object.entries(groups)) {
  const file = join(dir, `${group}.json`);
  if (!existsSync(file)) {
    problems.push(`missing fixtures/${group}.json`);
    continue;
  }
  const onDisk = readFileSync(file, 'utf8');
  if (onDisk === serialize(fixtures)) continue;
  const disk = JSON.parse(onDisk) as Array<{ name: string }>;
  const names = new Set(disk.map((f) => f.name));
  const changed = fixtures.filter((f, i) => JSON.stringify(f) !== JSON.stringify(disk[i])).map((f) => f.name);
  const added = fixtures.filter((f) => !names.has(f.name)).map((f) => f.name);
  problems.push(`fixtures/${group}.json is stale (${changed.length} differing: ${changed.slice(0, 5).join('; ')}${added.length ? `; new: ${added.join('; ')}` : ''})`);
}

for (const file of existsSync(dir) ? readdirSync(dir) : []) {
  if (file.endsWith('.json') && !(file.slice(0, -5) in groups)) problems.push(`unexpected fixtures/${file}`);
}

// Every package ships a copy of the canonical stylesheet. The Vue/React builds re-copy it into
// dist/style.css, but PHP serves css/style.css as committed, so all copies must stay identical.
const STYLE_COPIES = ['packages/vue/src/style.css', 'packages/react/src/style.css', 'packages/php/css/style.css'];
const canonicalStyle = readFileSync(join(root, 'packages/core/src/style.css'), 'utf8');
for (const copy of STYLE_COPIES) {
  const file = join(root, copy);
  if (!existsSync(file)) problems.push(`missing ${copy}`);
  else if (readFileSync(file, 'utf8') !== canonicalStyle) problems.push(`${copy} differs from packages/core/src/style.css (copy it over)`);
}

if (problems.length) {
  console.error(problems.join('\n'));
  console.error('\nRun `npm run fixtures` (and copy packages/core/src/style.css) and commit the result.');
  process.exit(1);
}
console.log(`fixtures up to date (${Object.values(groups).reduce((n, g) => n + g.length, 0)} cases); ${STYLE_COPIES.length} stylesheet copies match core`);
