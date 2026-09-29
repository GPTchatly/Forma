import { readFileSync } from 'node:fs';

// Releases with every built-in the local app uses (global fetch, AbortSignal.any,
// structuredClone): 18.17+, 20.3+ and every later line, odd and future ones included.
// 19.x and 20.0-20.2 lack AbortSignal.any. index.mjs supplies Node 18's missing crypto global.
export const RUNTIME_REQUIREMENT = 'Node.js 18.17+ (18.x), 20.3+ (20.x) or 21 and newer';
// Security baseline reviewed 2026-09-27. Older releases still start, with a notice;
// this offline check cannot know about advisories published afterward.
export const PATCHED_RUNTIME = 'Node.js 22.23.3+ (22.x) or 24.21.0+ (24.x)';
const parseVersion = (version) => /^(\d+)\.(\d+)\.(\d+)/.exec(version)?.slice(1).map(Number);
export function supportedRuntime(version) {
  const parts = parseVersion(version);
  if (!parts) return false;
  const [major, minor] = parts;
  if (major === 18) return minor >= 17;
  if (major === 20) return minor >= 3;
  return major >= 21;
}
export function patchedRuntime(version) {
  const parts = parseVersion(version);
  if (!parts) return false;
  const [major, minor, patch] = parts;
  if (major === 22) return minor > 23 || minor === 23 && patch >= 3;
  if (major === 24) return minor >= 21;
  return major > 24;
}

// Minimal KEY=value reader for runtimes older than process.loadEnvFile (20.12/21.7).
export function parseEnv(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match) continue;
    const quoted = /^(["'`])(.*)\1$/.exec(match[2]);
    values[match[1]] = quoted ? quoted[2] : match[2].replace(/\s+#.*$/, '').replace(/^#.*$/, '');
  }
  return values;
}
// Like Node's own loader, never overrides a variable that is already set.
export function loadEnvFile(filename) {
  if (typeof process.loadEnvFile === 'function') return process.loadEnvFile(filename);
  for (const [key, value] of Object.entries(parseEnv(readFileSync(filename, 'utf8')))) if (!(key in process.env)) process.env[key] = value;
}
