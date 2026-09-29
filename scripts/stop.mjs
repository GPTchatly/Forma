/** NEW: Stops only the Forma instance on the configured local port, not all Node processes. */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from '../server/runtime.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const filename of ['.env.local', '.env']) if (existsSync(path.join(root, filename))) loadEnvFile(path.join(root, filename));
const port = Number(process.env.PORT || 4318);
try {
  const response = await fetch(`http://127.0.0.1:${port}/api/status`, { signal: AbortSignal.timeout(3000) });
  const status = await response.json();
  if (!response.ok || typeof status.token !== 'string' || status.version !== '0.1.0') throw new Error('The application on this port is not the expected Forma instance.');
  const stopped = await fetch(`http://127.0.0.1:${port}/api/shutdown`, { method: 'POST', headers: { 'X-Forma-Token': status.token }, signal: AbortSignal.timeout(3000) });
  if (!stopped.ok) throw new Error('The server refused the stop request.');
  console.log(`Forma on port ${port} has stopped.`);
} catch (error) { console.error(`Could not stop Forma: ${error.message}\nIt may already be stopped. You can also use Ctrl+C in its terminal.`); process.exitCode = 1; }
