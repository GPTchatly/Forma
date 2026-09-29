/** Explicit static release boundary for Vercel. No directory copy or environment interpolation. */
import { readFile, writeFile, mkdir, lstat, realpath, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const PUBLIC_FILES = [
  'index.html', 'app.css', 'app.mjs', 'favicon.ico', 'favicon.svg', 'i18n.mjs',
  'library-drag.mjs', 'structure-controls.mjs', 'browser-projects.mjs', 'browser-render.mjs', 'hosted-client.mjs',
  'site.css', 'site-runtime.js', 'interface-runtime.js',
  ...['de', 'es', 'fi', 'it', 'pl', 'pt', 'ru', 'sv'].map((locale) => `locales/${locale}.mjs`)
];
const SHARED_MODULES = [
  'catalog', 'content', 'compose-transport', 'design', 'elements', 'export', 'icons', 'interface-render', 'interfaces',
  'media', 'pages', 'parts', 'raster', 'render', 'schema', 'slots', 'structure', 'ui-catalog', 'zip'
];
const COMPOSER_MODULES = ['composer', 'canvas-edits', 'element-edits', 'interface-composer', 'demo', 'demo-canvas'];

export const HOSTED_ASSETS = Object.freeze([
  ...PUBLIC_FILES.map((name) => [`public/${name}`, name]),
  ...SHARED_MODULES.map((name) => [`shared/${name}.mjs`, `shared/${name}.mjs`]),
  ...COMPOSER_MODULES.map((name) => [`server/${name}.mjs`, `composer/${name}.mjs`]),
  ['LICENSE', 'export/LICENSE.txt'], ['licenses/HYPERUI.txt', 'export/HYPERUI.txt']
].map((entry) => Object.freeze(entry)));

// Vercel uploads source before running the static build. Keep that separate boundary
// equally explicit, including only the private API code needed by the hosted runtime.
export const HOSTED_UPLOAD_FILES = Object.freeze([...new Set([
  ...HOSTED_ASSETS.map(([source]) => source),
  '.vercelignore', 'package.json', 'package-lock.json', 'vercel.json', 'scripts/build-hosted.mjs',
  'server/jev.mjs', 'hosted/app.mjs', 'hosted/security.mjs', 'hosted/schemas.mjs', 'hosted/quota.mjs',
  'api/status.mjs', 'api/connection.mjs', 'api/compose.mjs'
])].sort());

export function hostedUploadIgnore() {
  const lines = ['/*', '# Exact upload allowlist checked by scripts/build-hosted.mjs.'], directories = new Set();
  for (const filename of HOSTED_UPLOAD_FILES) {
    const segments = filename.split('/');
    for (let index = 1; index < segments.length; index++) {
      const directory = segments.slice(0, index).join('/');
      if (directories.has(directory)) continue;
      // Reopen each ancestor for traversal, then exclude all of its children before
      // adding exact file exceptions. Negating a whole tree would upload private files.
      lines.push(`!/${directory}/`, `/${directory}/*`);
      directories.add(directory);
    }
    lines.push(`!/${filename}`);
  }
  return `${lines.join('\n')}\n`;
}

export function hostedCsp(scriptHash) {
  return `default-src 'none'; script-src 'self' 'sha256-${scriptHash}'; script-src-attr 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-src 'self' blob:; font-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`;
}

async function readSource(root, relative) {
  const source = path.resolve(root, relative);
  const resolved = await realpath(source);
  if (resolved !== source || !source.startsWith(`${root}${path.sep}`) || !(await lstat(source)).isFile()) throw new Error(`Hosted asset must be a regular file inside the project: ${relative}`);
  return readFile(source);
}

async function readInputs(root) {
  const ignore = (await readSource(root, '.vercelignore')).toString('utf8').replace(/\r\n?/g, '\n');
  if (ignore !== hostedUploadIgnore()) throw new Error('The Vercel upload allowlist is stale or changed. Review HOSTED_UPLOAD_FILES and regenerate .vercelignore before deployment.');
  const sources = new Map(await Promise.all(HOSTED_UPLOAD_FILES.map(async (source) => [source, await readSource(root, source)])));
  const assets = new Map(HOSTED_ASSETS.map(([source, destination]) => [destination, sources.get(source)]));
  const script = ['site-runtime.js', 'interface-runtime.js'].map((name) => assets.get(name).toString('utf8')).join('\n').replace(/\r\n?/g, '\n');
  const scriptHash = createHash('sha256').update(script).digest('base64');
  const configuration = JSON.parse(sources.get('vercel.json').toString('utf8'));
  return { assets, scriptHash, configuration };
}

function validateBrowserImports(assets) {
  for (const [filename, bytes] of assets) {
    if (!filename.endsWith('.mjs')) continue;
    const source = bytes.toString('utf8');
    const expressions = [/(?:^|\n)\s*(?:import|export)\s+(?:[^;\r\n]*?\s+from\s+)?['"]([^'"]+)['"]/g, /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g];
    for (const expression of expressions) for (const match of source.matchAll(expression)) {
      const specifier = match[1];
      if ((!specifier.startsWith('./') && !specifier.startsWith('../') && !specifier.startsWith('/')) || specifier.startsWith('//') || /[?#\\]/.test(specifier)) throw new Error(`Unapproved browser import in ${filename}: ${specifier}`);
      // Browser URL resolution clamps ../ at the origin root, unlike filesystem-relative normalization.
      const destination = path.posix.resolve('/', path.posix.dirname(filename), specifier).slice(1);
      if (!assets.has(destination)) throw new Error(`Browser import is outside the hosted asset allowlist: ${filename} -> ${specifier}`);
    }
  }
}

function cspHeader(configuration) {
  const policy = configuration.headers?.find((rule) => rule.source === '/(.*)')?.headers?.filter((header) => header.key.toLowerCase() === 'content-security-policy');
  if (policy?.length !== 1) throw new Error('vercel.json must define one global Content-Security-Policy header.');
  return policy[0];
}

export async function updateHostedCsp({ root = ROOT } = {}) {
  const canonicalRoot = await realpath(root);
  const { configuration, scriptHash } = await readInputs(canonicalRoot);
  cspHeader(configuration).value = hostedCsp(scriptHash);
  await writeFile(path.join(canonicalRoot, 'vercel.json'), `${JSON.stringify(configuration, null, 2)}\n`);
  return scriptHash;
}

export async function buildHosted({ root = ROOT } = {}) {
  const canonicalRoot = await realpath(root);
  const { assets, configuration, scriptHash } = await readInputs(canonicalRoot);
  if (configuration.outputDirectory !== 'dist' || configuration.framework !== null) throw new Error('Hosted build requires the explicit dist output directory and no framework preset.');
  if (cspHeader(configuration).value !== hostedCsp(scriptHash)) throw new Error('The hosted CSP is stale. Review runtime changes, then run node scripts/build-hosted.mjs --update-csp.');
  validateBrowserImports(assets);
  if (/<meta\b[^>]*http-equiv\s*=\s*["']?content-security-policy/i.test(assets.get('index.html').toString('utf8'))) throw new Error('The editor CSP belongs in vercel.json, not a conflicting HTML meta policy.');
  const destination = path.resolve(canonicalRoot, 'dist');
  if (path.dirname(destination) !== canonicalRoot || path.basename(destination) !== 'dist') throw new Error('Invalid hosted output directory.');
  let existing;
  try { existing = await lstat(destination); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (existing && (!existing.isDirectory() || existing.isSymbolicLink() || await realpath(destination) !== destination)) throw new Error('Hosted output must be a regular dist directory inside the project.');
  // All inputs and the exact canonical output target are checked before replacing generated output.
  if (existing) await rm(destination, { recursive: true });
  await mkdir(destination);
  for (const [relative, bytes] of assets) {
    const output = path.join(destination, relative);
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, bytes, { flag: 'wx' });
  }
  return { files: [...assets.keys()].sort(), bytes: [...assets.values()].reduce((total, value) => total + value.length, 0), scriptHash };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const argumentsList = process.argv.slice(2);
    if (argumentsList.some((argument) => argument !== '--update-csp') || argumentsList.length > 1) throw new Error('Usage: node scripts/build-hosted.mjs [--update-csp]');
    if (argumentsList.includes('--update-csp')) await updateHostedCsp();
    const result = await buildHosted();
    console.log(`Hosted build: ${result.files.length} allowlisted static files, ${result.bytes} bytes.`);
    console.log(`Preview runtime CSP: sha256-${result.scriptHash}`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
