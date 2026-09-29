/** NEW: Syntax validation without installing a linter or build tool. */
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let checked = 0, failures = 0;
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['.data', 'node_modules', 'artifacts', 'dist', '.vercel'].includes(entry.name)) continue;
    const name = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(name);
    else if (/\.(?:mjs|js)$/.test(entry.name)) {
      const result = spawnSync(process.execPath, ['--check', name], { encoding: 'utf8' }); checked++;
      if (result.status !== 0) { failures++; console.error(result.stderr); }
    }
  }
}
await walk(root); console.log(`${checked} JavaScript files checked; ${failures} syntax failures.`); process.exitCode = failures ? 1 : 0;
