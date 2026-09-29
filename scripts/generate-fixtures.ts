/** Regenerates fixtures/<group>.json from @diff-text/core. Run: npm run fixtures */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFixtures, serialize } from './fixtures-lib';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
mkdirSync(outDir, { recursive: true });

for (const [group, fixtures] of Object.entries(buildFixtures())) {
  writeFileSync(join(outDir, `${group}.json`), serialize(fixtures));
  console.log(`fixtures/${group}.json  ${fixtures.length} cases`);
}
