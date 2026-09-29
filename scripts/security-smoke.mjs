/** Real-browser security regression. Test-only modules, isolated files, no provider calls. */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createApp } from '../server/app.mjs';
import { createSpec } from '../shared/content.mjs';

if (!process.env.FORMA_PLAYWRIGHT_MODULE) throw new Error('Set FORMA_PLAYWRIGHT_MODULE to the test-only Playwright module.');
const { chromium } = await import(pathToFileURL(process.env.FORMA_PLAYWRIGHT_MODULE));
const artifacts = path.resolve('artifacts/security-smoke');
await mkdir(artifacts, { recursive: true });
const dataDir = await mkdtemp(path.join(tmpdir(), 'forma-security-smoke-'));
const results = [], errors = [], outboundRequests = [], expectedCspErrors = [], skipped = [];
let providerCalls = 0, browser, app, probingCsp = false;
const ok = (name, value = true) => { assert.ok(value, name); results.push(name); console.log(`PASS ${name}`); };
try {
  app = await createApp({ dataDir, apiKey: '', fetchImpl: async () => { providerCalls++; throw new Error('Provider calls are prohibited in this smoke test.'); } });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  browser = await chromium.launch({ headless: true, ...(process.env.FORMA_TEST_BROWSER ? { executablePath: process.env.FORMA_TEST_BROWSER } : {}) });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, locale: 'en-US' });
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith(`${base}/`) || /^(?:data:|blob:|file:)/.test(url)) return route.continue();
    outboundRequests.push(new URL(url).origin); return route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const observeErrors = (target) => {
    target.on('pageerror', (error) => errors.push(error.message));
    target.on('console', (message) => {
      if (message.type() !== 'error') return;
      if (probingCsp && /(?:inline script|script-src).*Content Security Policy|Executing inline script violates/i.test(message.text())) expectedCspErrors.push('Blocked deliberate inline script probe');
      else errors.push(message.text());
    });
  };
  observeErrors(page);
  await page.addInitScript(() => { if (window === top) localStorage.setItem('forma:cookie-consent', 'accepted'); });
  const startup = await page.goto(base);
  const preview = page.frameLocator('#preview-frame');
  await preview.locator('body[data-edit-mode="true"]').waitFor();
  assert.equal(startup.status(), 200);
  assert.deepEqual(errors, [], 'Startup browser errors');
  ok('Editor starts with an interactive sandbox preview and no JavaScript errors');
  ok('Editor response sets a restrictive CSP', /object-src 'none'/.test(startup.headers()['content-security-policy']) && !/unsafe-eval/.test(startup.headers()['content-security-policy']));
  ok('Preview grants scripts without same-origin privileges', await page.locator('#preview-frame').getAttribute('sandbox') === 'allow-scripts');

  const status = await (await fetch(`${base}/api/status`)).json();
  const headers = { 'X-Forma-Token': status.token };
  const projectId = () => page.evaluate(() => localStorage.getItem('forma:last-project'));
  const saved = async () => {
    const response = await fetch(`${base}/api/projects/${await projectId()}`, { headers });
    assert.equal(response.status, 200); return response.json();
  };
  const save = async () => {
    await page.locator('#save-button').click();
    await page.waitForFunction(() => document.querySelector('#save-status').textContent === 'Saved locally');
    return saved();
  };
  const importProject = async (spec, name) => {
    await page.locator('#projects-button').click();
    await page.locator('#import-file').setInputFiles({ name: `${name}.json`, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(spec)) });
    await page.locator('#projects-dialog').waitFor({ state: 'hidden' });
    await preview.locator('body[data-edit-mode="true"]').waitFor();
  };
  const literal = '<img src=x onerror="globalThis.formaSecurityProbe=1">__proto__';
  const spec = createSpec('Security smoke fixture');
  spec.sections.find((section) => section.group === 'hero').title = literal;
  await importProject(spec, 'inert-text');
  await preview.locator('h1').filter({ hasText: literal }).waitFor();
  ok('Imported markup and prototype-looking text remain literal text', await preview.locator('h1 img').count() === 0);
  await save();
  const originalId = await projectId();
  await page.reload(); await preview.locator('h1').filter({ hasText: literal }).waitFor();
  ok('Save and reopen preserve validated text', (await saved()).spec.sections.find((section) => section.group === 'hero').title === literal && await projectId() === originalId);
  ok('Neither editor nor preview executes imported text', await page.evaluate(() => globalThis.formaSecurityProbe === undefined && ({}).formaSecurityProbe === undefined) && await preview.locator('body').evaluate(() => globalThis.formaSecurityProbe === undefined && ({}).formaSecurityProbe === undefined));

  const rasters = await page.evaluate(() => ['image/png', 'image/jpeg', 'image/webp'].map((mime, index) => {
    const canvas = document.createElement('canvas'); canvas.width = 48; canvas.height = 32;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = ['#274e38', '#823920', '#325b96'][index]; ctx.fillRect(0, 0, 48, 32);
    ctx.fillStyle = '#f4ead2'; ctx.fillRect(8, 6, 20, 16);
    return { mime, data: canvas.toDataURL(mime) };
  }));
  if (process.env.FORMA_SHARP_MODULE) {
    const { default: sharp } = await import(pathToFileURL(process.env.FORMA_SHARP_MODULE));
    const avif = await sharp({ create: { width: 48, height: 32, channels: 3, background: '#70468b' } }).avif().toBuffer();
    rasters.push({ mime: 'image/avif', data: `data:image/avif;base64,${avif.toString('base64')}` });
  } else skipped.push('AVIF encode/upload requires optional test-only FORMA_SHARP_MODULE');
  await page.locator('[data-inspector-tab="design"]').click();
  await page.locator('[data-select-section="hero"]').click();
  let lastImage = '';
  for (const raster of rasters) {
    const extension = raster.mime.split('/')[1];
    assert.ok(raster.data.startsWith(`data:${raster.mime};base64,`));
    const before = await page.locator('[data-image-path]').first().evaluate((input) => input.closest('.image-upload').querySelector('img')?.src || '');
    await page.locator('[data-image-path]').first().setInputFiles({ name: `fixture.${extension}`, mimeType: raster.mime, buffer: Buffer.from(raster.data.split(',')[1], 'base64') });
    await page.waitForFunction((previous) => { const img = document.querySelector('.image-upload img'); return img?.src.startsWith('data:image/webp;base64,') && img.src !== previous; }, before);
    const project = await save(); lastImage = project.spec.sections.find((section) => section.group === 'hero').image;
    await preview.locator('#hero img').waitFor();
    await preview.locator('#hero img').evaluate((img) => img.decode());
    ok(`${extension.toUpperCase()} upload decodes, normalizes and saves`, /^data:image\/webp;base64,/.test(lastImage) && await preview.locator('#hero img').evaluate((img) => img.naturalWidth === 48 && img.naturalHeight === 32));
  }
  const rejectedUploads = [
    { name: 'wrong-mime.png', mimeType: 'image/png', buffer: Buffer.from(rasters[1].data.split(',')[1], 'base64') },
    { name: 'malformed.png', mimeType: 'image/png', buffer: Buffer.from('<svg onload="globalThis.formaSecurityProbe=1"></svg>') }
  ];
  for (const fixture of rejectedUploads) {
    const beforeErrors = await page.locator('#toasts .error').count();
    await page.locator('[data-image-path]').first().setInputFiles(fixture);
    await page.waitForFunction((count) => document.querySelectorAll('#toasts .error').length > count, beforeErrors);
    ok(`${fixture.name} upload is rejected without replacing the saved image`, (await saved()).spec.sections.find((section) => section.group === 'hero').image === lastImage);
  }
  const afterUploads = await saved();
  const invalidImports = [
    ['MIME mismatch', (copy) => { copy.sections.find((section) => section.group === 'hero').image = rasters[0].data.replace('image/png', 'image/jpeg'); }],
    ['Malformed base64', (copy) => { copy.sections.find((section) => section.group === 'hero').image = 'data:image/png;base64,%%%='; }],
    ['Prototype control', (copy) => { copy.sections.find((section) => section.group === 'hero').elements = JSON.parse('{"__proto__":{"formaSecurityProbe":1}}'); }]
  ];
  for (const [name, change] of invalidImports) {
    const copy = structuredClone(afterUploads.spec); change(copy);
    await page.locator('#projects-button').click();
    const beforeErrors = await page.locator('#toasts .error').count();
    await page.locator('#import-file').setInputFiles({ name: 'invalid-project.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(copy)) });
    await page.waitForFunction((count) => document.querySelectorAll('#toasts .error').length > count, beforeErrors);
    assert.ok(await page.locator('#projects-dialog').isVisible());
    await page.locator('[data-close="projects-dialog"]').click();
    const current = await saved();
    ok(`${name} import is rejected and leaves the saved project unchanged`, current.revision === afterUploads.revision && JSON.stringify(current.spec) === JSON.stringify(afterUploads.spec) && await projectId() === originalId);
  }
  const projects = await (await fetch(`${base}/api/projects`, { headers })).json();
  ok('Rejected imports create no additional projects', projects.projects.length === 1);

  await page.locator('#provider-mode').selectOption('demo'); await page.locator('#operation').selectOption('edit');
  await page.locator('#prompt').fill('Switch to the sage palette. Keep the uploaded image. No animation.');
  const composeResponse = page.waitForResponse((response) => response.url() === `${base}/api/compose` && response.request().method() === 'POST');
  await page.locator('#build-button').click();
  const composed = await composeResponse; assert.equal(composed.status(), 200);
  const composition = await composed.json();
  await preview.locator('.site.palette-sage').waitFor();
  ok('Offline compose accepts the strict request envelope without provider calls', composition.report.provider === 'demo' && composition.report.calls === 0 && providerCalls === 0);
  await save();

  const frame = page.frames().find((candidate) => candidate !== page.mainFrame());
  ok('Sandbox prevents preview access to the editor document', await frame.evaluate(() => { try { void parent.document.body; return false; } catch (error) { return error.name === 'SecurityError'; } }));
  probingCsp = true;
  const cspProbe = await frame.evaluate(() => new Promise((resolve) => {
    const finish = (blocked) => resolve({ blocked, executed: globalThis.formaCspProbe === true });
    document.addEventListener('securitypolicyviolation', (event) => { if (event.blockedURI === 'inline') finish(event.effectiveDirective === 'script-src-elem'); }, { once: true });
    const script = document.createElement('script'); script.textContent = 'globalThis.formaCspProbe = true'; document.body.append(script);
    setTimeout(() => finish(false), 1000);
  }));
  ok('Preview CSP blocks an unapproved inline script', cspProbe.blocked && !cspProbe.executed);
  probingCsp = false;

  await page.locator('#export-button').click();
  const downloadPromise = page.waitForEvent('download'); await page.locator('#export-confirm').click();
  const download = await downloadPromise, zipPath = path.join(artifacts, 'website.zip'); await download.saveAs(zipPath);
  const zip = await readFile(zipPath), files = new Map(); let cursor = 0;
  while (cursor + 30 <= zip.length && zip.readUInt32LE(cursor) === 0x04034b50) {
    assert.equal(zip.readUInt16LE(cursor + 8), 0);
    const size = zip.readUInt32LE(cursor + 18), nameLength = zip.readUInt16LE(cursor + 26), extraLength = zip.readUInt16LE(cursor + 28);
    const name = zip.subarray(cursor + 30, cursor + 30 + nameLength).toString();
    const start = cursor + 30 + nameLength + extraLength; files.set(name, zip.subarray(start, start + size)); cursor = start + size;
  }
  assert.ok(files.has('index.html') && files.has('project.json'));
  const htmlPath = path.join(artifacts, 'exported-index.html'); await writeFile(htmlPath, files.get('index.html'));
  const visitor = await context.newPage(); observeErrors(visitor);
  await visitor.goto(pathToFileURL(htmlPath).href); await visitor.locator('h1').filter({ hasText: literal }).waitFor();
  await visitor.locator('#hero img').evaluate((img) => img.decode());
  ok('Export renders saved text and uploaded raster without executable user markup', await visitor.locator('h1 img').count() === 0 && await visitor.evaluate(() => globalThis.formaSecurityProbe === undefined));
  ok('Export includes a fixed script hash policy', /script-src 'sha256-/.test(await visitor.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')));
  await page.screenshot({ path: path.join(artifacts, 'editor.png') });
  assert.deepEqual(errors, [], 'Unexpected browser errors');
  assert.deepEqual(outboundRequests, [], 'Unexpected outbound browser requests');
  assert.equal(providerCalls, 0);
  ok('No unexpected browser errors, remote requests or provider calls');
  await writeFile(path.join(artifacts, 'results.json'), JSON.stringify({ node: process.version, browser: browser.version(), platform: process.platform, provider: 'offline only; no credentials or provider calls', results, skipped, errors, expectedCspErrors, outboundRequests }, null, 2));
  console.log(`${results.length} security browser checks passed.`);
} finally {
  await browser?.close(); await app?.close();
  const target = path.resolve(dataDir), temporaryRoot = path.resolve(tmpdir()), relative = path.relative(temporaryRoot, target);
  assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative) && path.basename(target).startsWith('forma-security-smoke-'), 'Cleanup is restricted to the created temporary fixture directory');
  await rm(target, { recursive: true, force: true });
}
