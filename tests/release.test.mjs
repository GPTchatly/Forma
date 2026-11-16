import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { collectReleaseFiles, isReleasePath, scanText, auditDependencyContract } from '../scripts/release-check.mjs';

test('source release rejects private files and allows the runtime, tests and licenses', () => {
  for (const name of ['.env', '.env.local', '.data/projects/site.json', '.impeccable/config.json',
    'artifacts/result.json', 'docs/test-results/output.txt', 'docs/screenshots/workspace.png', 'docs/generated-ui/.impeccable/design.json',
    '.git/config', 'dist/index.html', '.vercel/project.json', 'node_modules/zod/index.js',
    'hosted/.env', 'api/private.key', 'public/private.key', 'server/.env', 'public/../../.env', 'public/../index.html']) {
    assert.equal(isReleasePath(name), false, name);
  }
  for (const name of ['.env.example', '.env.hosted.example', '.vercelignore', 'vercel.json', 'hosted/app.mjs', 'api/status.mjs', 'LICENSE', 'licenses/HYPERUI.txt', 'public/index.html',
    'public/favicon.ico', 'tests/release.test.mjs', 'docs/ARCHITECTURE.md', 'server/app.mjs', '.github/workflows/verify.yml', '.github/dependabot.yml']) {
    assert.equal(isReleasePath(name), true, name);
  }
});

test('release collection rejects modified binary assets even with a valid ICO header', async (t) => {
  const root = await fixture(t);
  await mkdir(path.join(root, 'public'));
  const icon = await readFile(new URL('../public/favicon.ico', import.meta.url));
  await writeFile(path.join(root, 'public/favicon.ico'), icon);
  assert.ok(!(await collectReleaseFiles(root)).problems.some(item => item.file === 'public/favicon.ico'));
  await writeFile(path.join(root, 'public/favicon.ico'), Buffer.concat([icon, Buffer.from('private appended data')]));
  assert.ok((await collectReleaseFiles(root)).problems.some(item => item.file === 'public/favicon.ico' && item.category === 'unreviewed-binary-asset'));
});

test('release scan reports categories and locations without returning sensitive values', () => {
  const key = ['sk', 'or', 'v1'].join('-') + '-' + 'a19b63c84d02ef57'.repeat(4);
  const contact = ['private-person', 'mail-provider.example'].join('@');
  const home = ['C:', 'Users', 'private-person', 'Documents'].join('/');
  const source = `first line\n${key}\n${contact}\n${home}`;
  const findings = scanText(source);
  assert.deepEqual(findings.map(item => item.category).sort(), ['non-example-email', 'personal-home-path', 'provider-token']);
  assert.ok(findings.every(item => item.line >= 2 && item.line <= 4));
  assert.ok(!JSON.stringify(findings).includes(key));
  assert.ok(!JSON.stringify(findings).includes('private-person'));
  assert.ok(scanText(['', 'home', 'private-person'].join('/')).some(item => item.category === 'personal-home-path'));
});

test('release scan covers private keys, assignments, URLs and provider token formats', () => {
  const samples = [
    ['private-key', ['-----BEGIN ', 'PRIVATE KEY-----'].join('')],
    ['provider-token', ['ghp', ''].join('_') + 'a'.repeat(36)],
    ['credential-assignment', ['TYPESAFE_API_KEY', '=' + 'a'.repeat(40)].join('')],
    ['credential-assignment', ['apiKey', ': "' + 'a'.repeat(40) + '"'].join('')],
    ['credential-url', ['https://operator:', 'a'.repeat(25), '@api.example.com'].join('')],
    ['jwt-token', ['eyJ' + 'a'.repeat(12), 'b'.repeat(12), 'c'.repeat(12)].join('.')],
  ];
  for (const [category, source] of samples) assert.ok(scanText(source).some(item => item.category === category), category);
  assert.deepEqual(scanText('hello@example.com hello@example.test TYPESAFE_API_KEY='), []);
  assert.deepEqual(scanText('https://user:pass@example.com'), []);
  assert.ok(scanText('https://user:pass@example.com' + '.evil').some(item => item.category === 'credential-url'));
});

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'forma-release-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test('release collection excludes private directory contents and rejects unexpected source files', async (t) => {
  const root = await fixture(t);
  for (const name of ['.data', '.impeccable', 'artifacts', 'dist', '.vercel', 'node_modules', 'docs/screenshots', 'docs/test-results', 'docs/generated-ui/.impeccable', 'server']) {
    await mkdir(path.join(root, name), { recursive: true });
    await writeFile(path.join(root, name, 'private.key'), 'do not publish');
  }
  await writeFile(path.join(root, 'server', 'app.mjs'), 'export const safe = true;');
  await writeFile(path.join(root, 'docs/generated-ui/.impeccable/design.json'), '{"privateTooling":true}');
  await writeFile(path.join(root, 'docs/generated-ui/DESIGN.md'), 'Documented generated-site tokens.');
  await writeFile(path.join(root, '.env'), 'do not publish');
  const result = await collectReleaseFiles(root);
  assert.deepEqual([...result.files.keys()].sort(), ['docs/generated-ui/DESIGN.md', 'server/app.mjs']);
  assert.ok(result.problems.some(item => item.file === 'server/private.key' && item.category === 'unexpected-source-file'));
  assert.ok(!result.problems.some(item => /^(?:\.data|\.impeccable|artifacts|dist|\.vercel|node_modules|docs\/screenshots|docs\/test-results|docs\/generated-ui\/\.impeccable)(?:\/|$)/.test(item.file)));
});

test('release collection rejects source directory junctions without reading their target', async (t) => {
  const root = await fixture(t), outside = await fixture(t);
  await writeFile(path.join(outside, 'private.mjs'), 'do not publish');
  await symlink(outside, path.join(root, 'server'), process.platform === 'win32' ? 'junction' : 'dir');
  const result = await collectReleaseFiles(root);
  assert.equal(result.files.size, 0);
  assert.ok(result.problems.some(item => item.file === 'server' && item.category === 'symlink-not-allowed'));
});

const actualManifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const actualLock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'));

test('release dependency gate accepts only the reviewed pinned Zod manifest and lock', () => {
  assert.deepEqual(auditDependencyContract(actualManifest, actualLock), []);
  for (const mutate of [
    (manifest) => { manifest.dependencies.zod = '^4.6.7'; },
    (manifest) => { manifest.dependencies.extra = '1.0.0'; },
    (manifest) => { manifest.devDependencies = { extra: '1.0.0' }; },
    (manifest) => { manifest.optionalDependencies = { extra: '1.0.0' }; },
    (manifest) => { manifest.peerDependencies = { extra: '1.0.0' }; },
    (manifest) => { manifest.bundledDependencies = ['extra']; },
    (manifest) => { manifest.overrides = { zod: '4.6.4' }; },
    (manifest) => { manifest.resolutions = { zod: '4.6.4' }; },
    (manifest) => { manifest.workspaces = ['packages/*']; },
    (manifest) => { manifest.scripts.prepare = 'node prepare.mjs'; },
    (manifest) => { manifest.scripts.preinstall = 'node installer.mjs'; },
    (manifest) => { manifest.scripts.install = ''; },
    (manifest) => { manifest.scripts.postinstall = 'node installer.mjs'; },
  ]) {
    const manifest = structuredClone(actualManifest); mutate(manifest);
    assert.ok(auditDependencyContract(manifest, actualLock).some((finding) => finding.file === 'package.json'));
  }
});

test('release dependency gate rejects unexpected registry, integrity, transitive code and lifecycle flags', () => {
  for (const mutate of [
    (lock) => { lock.lockfileVersion = 2; },
    (lock) => { lock.version = '9.9.9'; },
    (lock) => { lock.dependencies = { extra: { version: '1.0.0' } }; },
    (lock) => { lock.packages[''].dependencies.zod = '4.6.4'; },
    (lock) => { lock.packages[''].devDependencies = { extra: '1.0.0' }; },
    (lock) => { lock.packages[''].hasInstallScript = true; },
    (lock) => { lock.packages['node_modules/extra'] = { version: '1.0.0' }; },
    (lock) => { lock.packages['node_modules/zod'].version = '4.6.4'; },
    (lock) => { lock.packages['node_modules/zod'].resolved = 'https://example.com/zod.tgz'; },
    (lock) => { lock.packages['node_modules/zod'].integrity += 'a'; },
    (lock) => { delete lock.packages['node_modules/zod'].integrity; },
    (lock) => { lock.packages['node_modules/zod'].hasInstallScript = true; },
    (lock) => { lock.packages['node_modules/zod'].hasInstallScript = 'true'; },
    (lock) => { lock.packages['node_modules/zod'].scripts = { install: 'node installer.mjs' }; },
    (lock) => { lock.packages['node_modules/zod'].dependencies = { extra: '1.0.0' }; },
    (lock) => { lock.packages['node_modules/zod'].optionalDependencies = { extra: '1.0.0' }; },
    (lock) => { lock.packages['node_modules/zod'].link = true; },
  ]) {
    const lock = structuredClone(actualLock); mutate(lock);
    assert.ok(auditDependencyContract(actualManifest, lock).some((finding) => finding.file === 'package-lock.json'));
  }
});

test('source releases require hosted deployment entrypoints and empty credential examples', async (t) => {
  const root = await fixture(t);
  await writeFile(path.join(root, '.env.hosted.example'), 'PUBLIC_ORIGIN=https://example.com\nFORMA_SESSION_SECRET=\nFORMA_EDGE_SECRET=\nUPSTASH_REDIS_REST_TOKEN=\n');
  let result = await collectReleaseFiles(root);
  for (const filename of ['.vercelignore', 'vercel.json', 'scripts/build-hosted.mjs', 'hosted/app.mjs', 'hosted/turnstile.mjs', 'api/status.mjs', 'api/challenge.mjs', 'api/connection.mjs', 'api/compose.mjs', 'public/hosted-client.mjs', 'public/turnstile.mjs']) {
    assert.ok(result.problems.some((finding) => finding.file === filename && finding.category === 'required-file-missing'));
  }
  assert.ok(!result.problems.some((finding) => finding.file === '.env.hosted.example'));
  await writeFile(path.join(root, '.env.hosted.example'), ['FORMA_SESSION_SECRET=' + 'a'.repeat(20), 'UPSTASH_REDIS_REST_TOKEN=' + 'b'.repeat(20), 'FORMA_EDGE_SECRET=' + 'c'.repeat(20), 'TURNSTILE_SECRET_KEY=' + 'd'.repeat(20), 'TURNSTILE_SESSION_SECRET=' + 'e'.repeat(40), 'TURNSTILE_ENFORCE=on'].join('\n'));
  result = await collectReleaseFiles(root);
  assert.equal(result.problems.filter((finding) => finding.file === '.env.hosted.example' && finding.category === 'example-key-must-be-empty').length, 5);
});

test('QWEN3 Redis variables are empty in examples and literal credentials are detected without echoing values', async (t) => {
  const root = await fixture(t);
  const names = ['QWEN3_KV_URL', 'QWEN3_KV_REST_API_URL', 'QWEN3_KV_REST_API_TOKEN', 'QWEN3_KV_REST_API_READ_ONLY_TOKEN', 'QWEN3_REDIS_URL'];
  const credential = ['synthetic', 'credential', 'fixture'].join('-');
  for (const name of names) {
    const findings = scanText(`${name}="${credential}"`);
    assert.ok(findings.some((finding) => finding.category === 'credential-assignment'));
    assert.ok(!JSON.stringify(findings).includes(credential));
  }
  await writeFile(path.join(root, '.env.hosted.example'), names.map((name) => `${name}=`).join('\n') + '\nQWEN3_LIMIT=10\n');
  assert.ok(!(await collectReleaseFiles(root)).problems.some((finding) => finding.file === '.env.hosted.example'));
  await writeFile(path.join(root, '.env.hosted.example'), names.map((name) => `${name}=filled`).join('\n'));
  assert.equal((await collectReleaseFiles(root)).problems.filter((finding) => finding.file === '.env.hosted.example' && finding.category === 'example-key-must-be-empty').length, names.length);
});
