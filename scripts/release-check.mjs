/** Audited source-release selection and redacted secret/privacy checks. */
import { lstat, readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_FILES = new Set([
  '.env.example', '.env.hosted.example', '.gitignore', '.vercelignore', 'AGENTS.md', 'CONTRIBUTING.md', 'DESIGN.md',
  'LICENSE', 'PRODUCT.md', 'README.md', 'SECURITY.md', 'THIRD_PARTY_NOTICES.md',
  'package.json', 'package-lock.json', 'vercel.json', 'start.cmd', 'start.sh', 'stop.cmd',
]);
const AUTOMATION_FILES = new Set(['.github/workflows/verify.yml', '.github/dependabot.yml']);
const SOURCE_TYPES = {
  docs: new Set(['.md']), examples: new Set(['.md', '.json']),
  licenses: new Set(['.txt', '.md']), public: new Set(['.html', '.css', '.js', '.mjs', '.json', '.svg']),
  scripts: new Set(['.mjs', '.py']), server: new Set(['.mjs']), hosted: new Set(['.mjs']), api: new Set(['.mjs']),
  shared: new Set(['.mjs']), tests: new Set(['.mjs']),
};
const PRIVATE_TREES = new Set(['.data', '.impeccable', 'artifacts', '.git', 'node_modules', 'dist', '.vercel']);
const OMITTED_DOCS = new Set(['docs/test-results', 'docs/screenshots']);
const MAX_FILE_BYTES = 5_000_000;
const MAX_RELEASE_BYTES = 30_000_000;
// The only binary release asset was visually reviewed. Any replacement needs
// another review; an ICO signature alone would permit hidden appended content.
const REVIEWED_ICON_SHA256 = 'f77786e14998870e6ed60f4952fbbe80abecece8d56c336d79d5ce708ee405f5';
const REQUIRED_FILES = ['LICENSE', 'THIRD_PARTY_NOTICES.md', 'licenses/HYPERUI.txt', 'README.md',
  'SECURITY.md', 'CONTRIBUTING.md', '.env.example', '.gitignore', 'package.json', 'package-lock.json',
  'server/index.mjs', 'server/app.mjs', 'shared/schema.mjs', 'public/index.html',
  '.env.hosted.example', '.vercelignore', 'vercel.json', 'scripts/build-hosted.mjs',
  'hosted/app.mjs', 'hosted/security.mjs', 'hosted/schemas.mjs', 'hosted/quota.mjs',
  'api/status.mjs', 'api/connection.mjs', 'api/compose.mjs',
  'public/hosted-client.mjs', 'public/browser-projects.mjs', 'public/browser-render.mjs',
  'shared/compose-transport.mjs', 'shared/export.mjs', 'shared/zip.mjs'];

// Deliberately independent of package.json: dependency upgrades require source review,
// an audited tarball/integrity update here, and the hosted boundary regression tests.
const AUDITED_ZOD = Object.freeze({
  version: '4.6.5',
  resolved: 'https://registry.npmjs.org/zod/-/zod-4.6.5.tgz',
  integrity: 'sha512-v5l/aFXZQeai4awLbOpSoHecE9UiMrnfx75tEXLjNonXVARxQ5mOeipTjROUchszUNCqnE+hqAMujRsRHsut2Q=='
});
const DEPENDENCY_SECTIONS = ['devDependencies', 'optionalDependencies', 'peerDependencies', 'bundledDependencies', 'bundleDependencies', 'overrides', 'resolutions'];
const INSTALL_HOOKS = ['preinstall', 'install', 'postinstall', 'prepublish', 'preprepare', 'prepare', 'postprepare'];
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const empty = (value) => value === undefined || (value !== null && typeof value === 'object' && Object.keys(value).length === 0);
const approvedDependencies = (value) => record(value) && Object.keys(value).length === 1 && value.zod === AUDITED_ZOD.version;
const hasInstallHook = (value) => (value.hasInstallScript !== undefined && value.hasInstallScript !== false) || INSTALL_HOOKS.some((name) => Object.hasOwn(value.scripts ?? {}, name));
const hasExtraDependencies = (value) => DEPENDENCY_SECTIONS.some((key) => !empty(value[key]));

export function auditDependencyContract(manifest, lock) {
  const problems = [];
  if (!record(manifest) || !approvedDependencies(manifest.dependencies) || hasExtraDependencies(manifest) || hasInstallHook(manifest) || !empty(manifest.workspaces)) {
    problems.push({ file: 'package.json', category: 'audited-dependency-contract' });
  }
  const packages = lock?.packages, lockedRoot = packages?.[''], zod = packages?.['node_modules/zod'];
  const lockValid = record(lock) && lock.lockfileVersion === 3 && record(packages)
    && Object.keys(packages).length === 2 && Object.hasOwn(packages, '') && Object.hasOwn(packages, 'node_modules/zod')
    && empty(lock.dependencies) && !hasExtraDependencies(lock)
    && record(lockedRoot) && approvedDependencies(lockedRoot.dependencies) && !hasExtraDependencies(lockedRoot) && !hasInstallHook(lockedRoot)
    && record(manifest) && lock.name === manifest.name && lock.version === manifest.version
    && lockedRoot.name === manifest.name && lockedRoot.version === manifest.version
    && JSON.stringify(lockedRoot.engines) === JSON.stringify(manifest.engines)
    && record(zod) && zod.version === AUDITED_ZOD.version && zod.resolved === AUDITED_ZOD.resolved && zod.integrity === AUDITED_ZOD.integrity
    && zod.license === 'MIT' && !hasExtraDependencies(zod) && empty(zod.dependencies) && !hasInstallHook(zod)
    && !zod.link && !zod.inBundle && !zod.dev && !zod.optional;
  if (!lockValid) problems.push({ file: 'package-lock.json', category: 'audited-dependency-contract' });
  return problems;
}

export function isReleasePath(name) {
  if (AUTOMATION_FILES.has(name)) return true;
  if (ROOT_FILES.has(name)) return true;
  if (name === 'public/favicon.ico') return true;
  const segments = name.split('/');
  if (segments.length < 2 || segments.some(part => !/^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(part) || part.includes('..'))) return false;
  if (OMITTED_DOCS.has(segments.slice(0, 2).join('/'))) return false;
  return SOURCE_TYPES[segments[0]]?.has(path.posix.extname(name)) ?? false;
}

// Report categories and line numbers only: never include the matched value.
export function scanText(text) {
  const findings = [];
  const add = (category, offset) => findings.push({ category, line: text.slice(0, offset).split('\n').length });
  const patterns = [
    ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/g],
    ['provider-token', /\b(?:sk-(?:or-v1-|proj-)?[A-Za-z0-9_-]{32,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|xox[baprs]-[0-9A-Za-z-]{20,})\b/g],
    ['jwt-token', /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g],
    ['personal-home-path', /(?:[A-Za-z]:[\\/]+(?:Users|Documents and Settings)[\\/]+[^\s\\/'"<>]+|\/(?:Users|home)\/[A-Za-z0-9_.-]+)/g],
    ['credential-url', /\b(?:https?|postgres(?:ql)?|mongodb(?:\+srv)?|redis):\/\/[^\s/:@]+:[^\s/@]+@[^\s/'"<>]+/gi],
    ['credential-assignment', /\b(?:[A-Z_]*(?:API_?KEY|ACCESS_?TOKEN|CLIENT_?SECRET|PASSWORD|AUTH_?TOKEN))["']?[ \t]*[:=][ \t]*["']?[A-Za-z0-9_+./=-]{24,}/gi],
    ['credential-assignment', /\bQWEN3_(?:KV_URL|KV_REST_API_URL|KV_REST_API_TOKEN|KV_REST_API_READ_ONLY_TOKEN|REDIS_URL)["']?[ \t]*[:=][ \t]*["']?[A-Za-z0-9_+./=:-]{16,}/g],
  ];
  for (const [category, pattern] of patterns) for (const match of text.matchAll(pattern)) {
    // Existing URL rejection test: this exact reserved-domain fixture is not a credential.
    if (category === 'credential-url' && match[0] === 'https://user:pass@example.com') continue;
    add(category, match.index);
  }
  for (const match of text.matchAll(/[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})/gi)) {
    const domain = match[1].toLowerCase();
    if (!/(?:^|\.)(?:example\.(?:com|net|org)|test|invalid|localhost)$/.test(domain)) add('non-example-email', match.index);
  }
  return findings;
}

export async function collectReleaseFiles(root) {
  const files = new Map(), problems = [];
  let bytes = 0, excludedEntries = 0;
  async function walk(directory, relative = '') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if ((!relative && PRIVATE_TREES.has(name)) || OMITTED_DOCS.has(name)) { excludedEntries++; continue; }
      const selectedTree = Boolean(SOURCE_TYPES[name.split('/')[0]]) || name.split('/')[0] === '.github';
      if (!relative && !ROOT_FILES.has(name) && !selectedTree) { excludedEntries++; continue; }
      const filename = path.join(directory, entry.name);
      const stat = await lstat(filename);
      if (stat.isSymbolicLink()) { problems.push({ file: name, category: 'symlink-not-allowed' }); continue; }
      if (stat.isDirectory()) {
        if (selectedTree) await walk(filename, name);
        else problems.push({ file: name, category: 'expected-file' });
        continue;
      }
      if (!stat.isFile() || !isReleasePath(name)) { problems.push({ file: name, category: 'unexpected-source-file' }); continue; }
      if (stat.size > MAX_FILE_BYTES || bytes + stat.size > MAX_RELEASE_BYTES) { problems.push({ file: name, category: 'release-size-limit' }); continue; }
      const content = await readFile(filename);
      bytes += content.length;
      if (name === 'public/favicon.ico') {
        if (createHash('sha256').update(content).digest('hex') !== REVIEWED_ICON_SHA256) problems.push({ file: name, category: 'unreviewed-binary-asset' });
      } else {
        let source;
        try { source = new TextDecoder('utf-8', { fatal: true }).decode(content); }
        catch { problems.push({ file: name, category: 'non-utf8-source' }); continue; }
        if (source.includes('\0')) problems.push({ file: name, category: 'binary-in-text-source' });
        for (const finding of scanText(source)) problems.push({ file: name, ...finding });
      }
      files.set(name, content);
    }
  }
  await walk(root);
  for (const name of REQUIRED_FILES) if (!files.has(name)) problems.push({ file: name, category: 'required-file-missing' });
  for (const name of ['.env.example', '.env.hosted.example']) {
    const env = files.get(name)?.toString('utf8') ?? '';
    for (const line of env.split(/\r?\n/)) if (/^\s*(?:export\s+)?(?:TYPESAFE_API_KEY|OPENROUTER_API_KEY|FORMA_SESSION_SECRET|FORMA_EDGE_SECRET|UPSTASH_REDIS_REST_TOKEN|QWEN3_KV_URL|QWEN3_KV_REST_API_URL|QWEN3_KV_REST_API_TOKEN|QWEN3_KV_REST_API_READ_ONLY_TOKEN|QWEN3_REDIS_URL)\s*=\s*\S+/.test(line)) problems.push({ file: name, category: 'example-key-must-be-empty' });
  }
  const packages = new Map();
  for (const name of ['package.json', 'package-lock.json']) {
    try {
      packages.set(name, JSON.parse(files.get(name)?.toString('utf8') ?? 'null'));
    } catch { problems.push({ file: name, category: 'invalid-package-json' }); }
  }
  problems.push(...auditDependencyContract(packages.get('package.json'), packages.get('package-lock.json')));
  return { files: new Map([...files].sort(([left], [right]) => left.localeCompare(right, 'en'))), problems, bytes, excludedEntries };
}

export async function checkRelease(root) {
  const result = await collectReleaseFiles(root);
  let historyAvailable = false;
  try { await lstat(path.join(root, '.git')); historyAvailable = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  return { ...result, historyAvailable };
}

export function printReleaseCheck(result) {
  console.log(`Source release: ${result.files.size} files, ${result.bytes} bytes; ${result.problems.length} findings.`);
  for (const problem of result.problems) console.error(`${problem.file}${problem.line ? `:${problem.line}` : ''}: ${problem.category}`);
  console.log('Private data, environment credentials, raw screenshots, logs and test artifacts are excluded by the release allowlist.');
  console.log(result.historyAvailable
    ? 'Git metadata is present. This gate scans release files only; audit history and tracked exclusions separately before publishing that repository.'
    : 'No local Git metadata: commit history, branches and deleted objects were unavailable for audit.');
  console.log('Pattern checks are a release guard, not proof that all sensitive information is absent. Review new prose and assets before publication.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await checkRelease(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
    printReleaseCheck(result); process.exitCode = result.problems.length ? 1 : 0;
  } catch { console.error('Source release check failed; inspect source permissions and file structure.'); process.exitCode = 1; }
}
