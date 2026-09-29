/** NEW: Windows/macOS/Linux entrypoint. Binds only to loopback; Ctrl+C stops it. */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { PATCHED_RUNTIME, RUNTIME_REQUIREMENT, loadEnvFile, patchedRuntime, supportedRuntime } from './runtime.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (!supportedRuntime(process.versions.node)) { console.error(`Forma needs ${RUNTIME_REQUIREMENT}; this is Node.js ${process.versions.node}.`); process.exit(1); }
if (!patchedRuntime(process.versions.node)) console.warn(`Note: Node.js ${process.versions.node} is older than the reviewed security baseline, ${PATCHED_RUNTIME}. Forma runs anyway; updating Node.js is recommended.`);
// Node.js 18 has Web Crypto only as a module; shared code uses the browser global.
globalThis.crypto ??= (await import('node:crypto')).webcrypto;
// Imported after the runtime check so an old Node.js gets the message above, not a load error.
const { createApp } = await import('./app.mjs');
for (const filename of ['.env.local', '.env']) if (existsSync(path.join(root, filename))) loadEnvFile(path.join(root, filename));
const port = Number(process.env.PORT || 4318);
if (!Number.isInteger(port) || port < 1024 || port > 65535) { console.error('PORT must be an integer between 1024 and 65535.'); process.exit(1); }
const envKey = process.env.TYPESAFE_API_KEY || process.env.OPENROUTER_API_KEY || '';
const envProvider = process.env.JEV_PROVIDER || (!process.env.TYPESAFE_API_KEY && process.env.OPENROUTER_API_KEY ? 'openrouter' : '');
const app = await createApp({ dataDir: path.resolve(root, process.env.DATA_DIR || '.data'), apiKey: envKey, model: process.env.JEV_MODEL || 'jev-1.13.0', provider: envProvider, onShutdown: () => process.exit(0) });
app.server.on('error', (error) => { console.error(error.code === 'EADDRINUSE' ? `Port ${port} is already in use. Run stop.cmd for this app, or choose a different PORT in .env.` : `Server failed: ${error.message}`); process.exit(1); });
app.server.listen(port, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${port}`;
  console.log(`\n  FORMA / JEV SITE STUDIO\n  ${url}\n\n  Local files: ${path.resolve(root, process.env.DATA_DIR || '.data')}\n  Stop: Ctrl+C in this window, or run stop.cmd.\n  No API calls occur until you connect/test a key or request a live design.\n`);
  if (process.argv.includes('--open')) {
    const child = process.platform === 'win32' ? spawn('cmd.exe', ['/d', '/s', '/c', 'start', '""', url], { stdio: 'ignore', windowsHide: true }) : spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { stdio: 'ignore' });
    child.on('error', () => {}); child.unref();
  }
});
let stopping = false;
async function stop() { if (stopping) return; stopping = true; console.log('\nStopping Forma…'); await app.close(); process.exit(0); }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
