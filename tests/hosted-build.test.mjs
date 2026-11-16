import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm, symlink, rename, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { HOSTED_ASSETS, HOSTED_UPLOAD_FILES, buildHosted, hostedCsp, hostedUploadIgnore, updateHostedCsp } from '../scripts/build-hosted.mjs';

const SOURCE_ROOT = new URL('../', import.meta.url);
const configuration = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'forma-hosted-build-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const filename of HOSTED_UPLOAD_FILES) {
    await mkdir(path.dirname(path.join(root, filename)), { recursive: true });
    await writeFile(path.join(root, filename), await readFile(new URL(filename, SOURCE_ROOT)));
  }
  return root;
}

async function filenames(directory, prefix = '') {
  const names = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = `${prefix}${entry.name}`;
    if (entry.isDirectory()) names.push(...await filenames(path.join(directory, entry.name), `${relative}/`));
    else names.push(relative);
  }
  return names.sort();
}

const headersFor = (source) => Object.fromEntries(configuration.headers.find((rule) => rule.source === source).headers.map(({ key, value }) => [key.toLowerCase(), value]));

test('hosted artifact contains only the explicit browser files and excludes accidental public secrets and stale output', async (t) => {
  const root = await fixture(t);
  const excluded = ['.env', '.data/projects/private.json', 'server/jev.mjs', 'docs/private.txt', 'public/private.txt', 'public/.env', 'shared/private.mjs', 'dist/stale-file.txt'];
  for (const filename of excluded) {
    await mkdir(path.dirname(path.join(root, filename)), { recursive: true });
    await writeFile(path.join(root, filename), 'PRIVATE BUILD SENTINEL');
  }
  const result = await buildHosted({ root });
  const output = path.join(root, 'dist');
  assert.deepEqual(await filenames(output), HOSTED_ASSETS.map(([, destination]) => destination).sort());
  assert.deepEqual(result.files, await filenames(output));
  assert.ok(result.files.includes('hosted-client.mjs'));
  assert.ok(result.files.includes('turnstile.mjs'));
  for (const filename of ['public/turnstile.mjs', 'hosted/turnstile.mjs', 'api/challenge.mjs']) assert.ok(HOSTED_UPLOAD_FILES.includes(filename));
  assert.ok(result.files.includes('shared/compose-transport.mjs'));
  // A fixed build marker selects the hosted startup path before any API response.
  assert.match(await readFile(path.join(output, 'deployment.mjs'), 'utf8'), /DEPLOYMENT = 'hosted'/);
  assert.match(await readFile(new URL('public/deployment.mjs', SOURCE_ROOT), 'utf8'), /DEPLOYMENT = 'local'/);
  assert.equal(HOSTED_UPLOAD_FILES.includes('public/deployment.mjs'), false, 'The local marker is never uploaded');
  assert.deepEqual(result.files.filter((name) => name.startsWith('composer/')), ['canvas-edits', 'composer', 'demo-canvas', 'demo', 'element-edits', 'interface-composer'].map((name) => `composer/${name}.mjs`).sort());
  for (const [source, destination] of HOSTED_ASSETS) assert.deepEqual(await readFile(path.join(output, destination)), await readFile(path.join(root, source)));
  for (const filename of result.files) assert.ok(!(await readFile(path.join(output, filename))).includes(Buffer.from('PRIVATE BUILD SENTINEL')));
  assert.equal(await readFile(path.join(root, '.env'), 'utf8'), 'PRIVATE BUILD SENTINEL', 'private workspace files are not modified');
});

test('hosted CSP matches the actual combined fixed runtime after HTML line-ending normalization', async (t) => {
  const root = await fixture(t);
  for (const name of ['site-runtime.js', 'interface-runtime.js', 'interaction-runtime.js']) {
    const filename = path.join(root, 'public', name);
    await writeFile(filename, (await readFile(filename, 'utf8')).replace(/\r\n?/g, '\n').replace(/\n/g, '\r\n'));
  }
  const result = await buildHosted({ root });
  const scripts = await Promise.all(['site-runtime.js', 'interface-runtime.js', 'interaction-runtime.js'].map((name) => readFile(path.join(root, 'dist', name), 'utf8')));
  const expected = createHash('sha256').update(scripts.join('\n').replace(/\r\n?/g, '\n')).digest('base64');
  assert.equal(result.scriptHash, expected);
  assert.equal(headersFor('/(.*)')['content-security-policy'], hostedCsp(expected));
  assert.ok(!hostedCsp(expected).includes('unsafe-eval'));
  assert.ok(hostedCsp(expected).includes("script-src 'self' 'sha256-"));
  // The owner-approved Turnstile origin is allowed only to load its script and challenge frame.
  const directives = Object.fromEntries(hostedCsp(expected).split('; ').map((part) => { const [name, ...values] = part.split(' '); return [name, values]; }));
  assert.deepEqual(directives['script-src'], ["'self'", `'sha256-${expected}'`, 'https://challenges.cloudflare.com']);
  assert.deepEqual(directives['frame-src'], ["'self'", 'blob:', 'https://challenges.cloudflare.com']);
  assert.deepEqual(directives['connect-src'], ["'self'"]);
  assert.deepEqual(Object.keys(directives).filter((name) => directives[name].includes('https://challenges.cloudflare.com')), ['script-src', 'frame-src']);
  assert.ok(hostedCsp(expected).includes("frame-ancestors 'none'"));
  assert.ok(!/<meta\b[^>]*http-equiv\s*=\s*["']?content-security-policy/i.test(await readFile(path.join(root, 'dist/index.html'), 'utf8')));
});

test('changed runtimes fail closed before replacing output until the checked-in CSP is explicitly refreshed', async (t) => {
  const root = await fixture(t);
  await mkdir(path.join(root, 'dist'));
  await writeFile(path.join(root, 'dist/previous-build.txt'), 'previous output');
  const runtime = path.join(root, 'public/site-runtime.js');
  await writeFile(runtime, `${await readFile(runtime, 'utf8')}\n/* changed fixture runtime */\n`);
  await assert.rejects(buildHosted({ root }), /CSP is stale/);
  assert.equal(await readFile(path.join(root, 'dist/previous-build.txt'), 'utf8'), 'previous output');
  const originalConfiguration = JSON.parse(await readFile(path.join(root, 'vercel.json'), 'utf8'));
  const updatedHash = await updateHostedCsp({ root });
  const updatedConfiguration = JSON.parse(await readFile(path.join(root, 'vercel.json'), 'utf8'));
  originalConfiguration.headers[0].headers.find((header) => header.key === 'Content-Security-Policy').value = hostedCsp(updatedHash);
  assert.deepEqual(updatedConfiguration, originalConfiguration, 'explicit refresh changes only the known CSP header');
  assert.equal((await buildHosted({ root })).scriptHash, updatedHash);
});

test('new imports cannot accidentally expose server-only modules or unmanaged external code', async (t) => {
  const root = await fixture(t), app = path.join(root, 'public/app.mjs');
  const original = await readFile(app, 'utf8');
  await writeFile(path.join(root, 'server/private.mjs'), 'export const privateValue = true;');
  for (const specifier of ['../server/private.mjs', 'node:fs', 'https://example.com/runtime.mjs', '//example.com/runtime.mjs']) {
    await writeFile(app, `import '${specifier}';\n${original}`);
    await assert.rejects(buildHosted({ root }), /browser import|Browser import/);
  }
  await writeFile(app, `${original}\nconst imported = import('/shared/private.mjs');\n`);
  await assert.rejects(buildHosted({ root }), /Browser import/);
});

test('hosted build refuses symlinked source or output directories without touching their targets', async (t) => {
  const root = await fixture(t), protectedDirectory = path.join(root, 'protected');
  await mkdir(protectedDirectory);
  await writeFile(path.join(protectedDirectory, 'sentinel.txt'), 'protected output');
  try { await symlink(protectedDirectory, path.join(root, 'dist'), 'junction'); }
  catch (error) { if (['EPERM', 'EACCES'].includes(error.code)) return t.skip('This host does not permit directory links.'); throw error; }
  await assert.rejects(buildHosted({ root }), /regular dist directory/);
  assert.equal(await readFile(path.join(protectedDirectory, 'sentinel.txt'), 'utf8'), 'protected output');
  assert.equal((await lstat(path.join(root, 'dist'))).isSymbolicLink(), true);
  await rm(path.join(root, 'dist'));
  await rename(path.join(root, 'public'), path.join(root, 'public-original'));
  await symlink(path.join(root, 'public-original'), path.join(root, 'public'), 'junction');
  await assert.rejects(buildHosted({ root }), /regular file inside the project/);
  assert.ok((await readFile(path.join(root, 'public-original/app.mjs'), 'utf8')).length > 0);
});

test('Vercel configuration limits function duration, enables cancellation and separates API caching from assets', () => {
  assert.equal(configuration.framework, null);
  assert.equal(configuration.outputDirectory, 'dist');
  assert.equal(configuration.public, undefined, 'Vercel refuses deployments that set the retired public property');
  assert.equal(configuration.buildCommand, 'node scripts/build-hosted.mjs');
  assert.equal(configuration.installCommand, 'npm ci --ignore-scripts');
  assert.deepEqual(configuration.functions, { 'api/*.mjs': { maxDuration: 60, supportsCancellation: true } });
  assert.equal(configuration.rewrites, undefined, 'no catch-all rewrite can accidentally expose application source');
  assert.equal(headersFor('/api/(.*)')['cache-control'], 'no-store');
  assert.equal(headersFor('/')['cache-control'], 'no-cache');
  assert.equal(headersFor('/index.html')['cache-control'], 'no-cache');
  assert.equal(headersFor('/export/(.*)')['content-type'], 'text/plain; charset=utf-8');
  const globalHeaders = headersFor('/(.*)');
  assert.equal(globalHeaders['x-content-type-options'], 'nosniff');
  assert.equal(globalHeaders['referrer-policy'], 'no-referrer');
  assert.equal(globalHeaders['x-frame-options'], 'DENY');
  assert.equal(globalHeaders['strict-transport-security'], 'max-age=31536000');
  assert.ok(globalHeaders['content-security-policy'].includes("connect-src 'self'"));
});

test('Vercel upload allowlist excludes undeclared files at every depth under real gitignore semantics', async (t) => {
  if (spawnSync('git', ['--version'], { encoding: 'utf8' }).error?.code === 'ENOENT') return t.skip('Git is unavailable for ignore-pattern verification.');
  const root = await fixture(t);
  const ignored = ['.env', '.env.local', '.env.hosted.example', '.data/projects/private.json', 'artifacts/site.zip',
    '.vercel/project.json', 'dist/index.html', 'node_modules/zod/index.js', 'README.md', 'AGENTS.md',
    'docs/private.md', '.github/workflows/verify.yml', 'tests/private.test.mjs', 'server/app.mjs', 'server/store.mjs',
    'public/.env', 'public/private.key', 'public/private.mjs', 'public/private/photo.png', 'public/.hidden/private.txt',
    'public/locales/.env', 'public/locales/private.key', 'public/locales/de.mjs.backup', 'public/locales/nested/private.txt',
    'shared/.env', 'shared/private.mjs', 'shared/nested/schema.mjs', 'hosted/.env', 'hosted/private.mjs',
    'api/.env', 'api/private.mjs', 'scripts/private.mjs', 'licenses/private.txt'];
  for (const filename of ignored) {
    await mkdir(path.dirname(path.join(root, filename)), { recursive: true });
    await writeFile(path.join(root, filename), 'private upload fixture');
  }
  const ignore = await readFile(path.join(root, '.vercelignore'), 'utf8');
  assert.equal(ignore.replace(/\r\n?/g, '\n'), hostedUploadIgnore());
  await writeFile(path.join(root, '.gitignore'), ignore);
  const init = spawnSync('git', ['init', '--quiet'], { cwd: root, encoding: 'utf8' });
  assert.equal(init.status, 0, init.stderr);
  const checked = spawnSync('git', ['-c', 'core.excludesFile=', '-c', 'core.ignoreCase=false', 'check-ignore', '--no-index', '--stdin', '-z'], {
    cwd: root, encoding: 'utf8', input: [...HOSTED_UPLOAD_FILES, ...ignored].join('\0') + '\0'
  });
  assert.equal(checked.status, 0, checked.stderr);
  assert.deepEqual(checked.stdout.split('\0').filter(Boolean).sort(), ignored.sort());
});

test('Vercel upload allowlist keeps every allowlisted directory when directories are tested by bare path', async (t) => {
  if (spawnSync('git', ['--version'], { encoding: 'utf8' }).error?.code === 'ENOENT') return t.skip('Git is unavailable for ignore-pattern verification.');
  // Vercel's upload walker tests a directory by its path without a trailing slash and skips the whole
  // directory when that path is ignored. Git matches paths absent from this empty root the same way.
  const root = await mkdtemp(path.join(tmpdir(), 'forma-upload-directories-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, '.gitignore'), hostedUploadIgnore());
  const init = spawnSync('git', ['init', '--quiet'], { cwd: root, encoding: 'utf8' });
  assert.equal(init.status, 0, init.stderr);
  const directories = [...new Set(HOSTED_UPLOAD_FILES.flatMap((filename) => filename.split('/').slice(0, -1).map((_, index, segments) => segments.slice(0, index + 1).join('/'))))];
  assert.ok(directories.includes('api') && directories.includes('public/locales'));
  const checked = spawnSync('git', ['-c', 'core.excludesFile=', '-c', 'core.ignoreCase=false', 'check-ignore', '--no-index', '--stdin', '-z'], {
    cwd: root, encoding: 'utf8', input: directories.join('\0') + '\0'
  });
  assert.equal(checked.status, 1, checked.stderr || `ignored directories: ${checked.stdout.split('\0').filter(Boolean).join(', ')}`);
});

test('an expanded or missing Vercel upload policy fails before replacing static output', async (t) => {
  const root = await fixture(t), policy = path.join(root, '.vercelignore');
  await mkdir(path.join(root, 'dist'));
  await writeFile(path.join(root, 'dist/previous-build.txt'), 'previous output');
  await writeFile(policy, `${hostedUploadIgnore()}!/public/**\n`);
  await assert.rejects(buildHosted({ root }), /upload allowlist is stale or changed/);
  assert.equal(await readFile(path.join(root, 'dist/previous-build.txt'), 'utf8'), 'previous output');
  await rm(policy);
  await assert.rejects(buildHosted({ root }), { code: 'ENOENT' });
  assert.equal(await readFile(path.join(root, 'dist/previous-build.txt'), 'utf8'), 'previous output');
});
