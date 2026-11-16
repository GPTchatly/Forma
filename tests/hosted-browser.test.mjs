/** Local browser integration of the hosted artifact. The HTTPS bootstrap and
 * connection/composition responses are synthetic fixtures, not deployed authentication or a
 * live JEV test. Every request is intercepted; no provider is contacted. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { buildHosted, HOSTED_UPLOAD_FILES } from '../scripts/build-hosted.mjs';
import { createSpec } from '../shared/content.mjs';

const ORIGIN = 'https://forma.example.test';
const CSRF = 'b'.repeat(43);
const FIXTURE_KEY = 'fixture-typesafe-not-a-real-key';
const CSP_PROBE = 'globalThis.injected=true';
const PROBE_HASH = createHash('sha256').update(CSP_PROBE).digest('base64');
const TURNSTILE_API = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
// A local stand-in for Cloudflare's api.js: the browser applies the real CSP to it,
// but no request reaches Cloudflare and no real challenge runs.
const turnstileStub = (hold) => `(() => {
  const widgets = new Map(); let next = 0;
  window.__turnstile = { rendered: [], executed: [], removed: 0 };
  window.turnstile = {
    render(container, options) { const id = 'stub-' + (++next); widgets.set(id, { container, options }); window.__turnstile.rendered.push({ container: container.id, sitekey: options.sitekey, action: options.action, appearance: options.appearance, execution: options.execution, retry: options.retry, refresh: options['refresh-expired'] }); return id; },
    // Like Cloudflare's documented API, execute() takes the widget container.
    execute(container) { const widget = [...widgets.values()].find((entry) => entry.container === container); window.__turnstile.executed.push(container?.id ?? null); ${hold ? '' : "setTimeout(() => widget?.options.callback('stub-turnstile-token'), 50);"} },
    remove(id) { widgets.delete(id); window.__turnstile.removed += 1; }
  };
})();`;

function unzipStored(bytes) {
  const files = new Map(); let offset = 0;
  while (offset + 30 <= bytes.length && bytes.readUInt32LE(offset) === 0x04034b50) {
    assert.equal(bytes.readUInt16LE(offset + 8), 0);
    const size = bytes.readUInt32LE(offset + 18), nameLength = bytes.readUInt16LE(offset + 26), extra = bytes.readUInt16LE(offset + 28);
    const name = bytes.subarray(offset + 30, offset + 30 + nameLength).toString();
    const start = offset + 30 + nameLength + extra;
    files.set(name, bytes.subarray(start, start + size)); offset = start + size;
  }
  assert.equal(bytes.readUInt32LE(bytes.length - 22), 0x06054b50);
  return files;
}

test('hosted artifact works in an HTTPS browser with fixture bootstrap and no project or demo API traffic', { skip: !process.env.FORMA_PLAYWRIGHT_MODULE, timeout: 120000 }, async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'forma-hosted-browser-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  // Freeze the exact source tree into a separate build so other local build
  // commands cannot replace assets while the browser is exercising them.
  for (const filename of HOSTED_UPLOAD_FILES) {
    await mkdir(path.dirname(path.join(directory, filename)), { recursive: true });
    await writeFile(path.join(directory, filename), await readFile(new URL(`../${filename}`, import.meta.url)));
  }
  const build = await buildHosted({ root: directory });
  const assets = new Map(await Promise.all(build.files.map(async (name) => [`/${name}`, await readFile(path.join(directory, 'dist', name))])));
  const configuration = JSON.parse(await readFile(path.join(directory, 'vercel.json'), 'utf8'));
  const mime = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain' };
  const headersFor = (pathname) => {
    const headers = { 'content-type': mime[path.extname(pathname === '/' ? 'index.html' : pathname)] || 'application/octet-stream' };
    for (const rule of configuration.headers) if (new RegExp(`^${rule.source}$`).test(pathname)) for (const { key, value } of rule.headers) headers[key.toLowerCase()] = value;
    return headers;
  };
  const { chromium } = await import(pathToFileURL(process.env.FORMA_PLAYWRIGHT_MODULE));
  const browser = await chromium.launch({ headless: true, ...(process.env.FORMA_TEST_BROWSER ? { executablePath: process.env.FORMA_TEST_BROWSER } : {}) });
  t.after(() => browser.close());
  const requests = [], denied = [], errors = [], expectedCsp = [];
  let freeAllowance, statusGate = null, statusFailure = false, humanCheck = { mode: 'off' }, stubHold = false, connectionHold = null;
  const turnstileLoads = [], challengeBodies = [];
  const composeFixtures = [], composeBodies = [];
  const allowance = (remaining, extra = {}) => ({ available: remaining >= 2, remaining, limit: 10, resetAt: Date.now() + 86400000, ...(remaining < 2 ? { reason: 'exhausted' } : {}), ...extra });
  const newContext = async () => {
    // A fresh context has no workers; the tested CSP forbids creating one.
    // Playwright's serviceWorkers:block injects a worker check into the opaque
    // sandbox and itself throws there, so use the application's actual policy.
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, locale: 'en-US' });
    await context.route('**/*', async (route) => {
      const request = route.request(), url = new URL(request.url());
      if (url.href === TURNSTILE_API && request.method() === 'GET') { turnstileLoads.push(url.href); return route.fulfill({ status: 200, contentType: 'text/javascript', body: turnstileStub(stubHold) }); }
      if (url.origin !== ORIGIN) { denied.push(url.origin); return route.abort(); }
      requests.push({ path: url.pathname, method: request.method() });
      if (url.pathname === '/api/status' && request.method() === 'GET') {
        // The allowance is captured when the request arrives, so a held reply is a stale snapshot.
        const snapshot = freeAllowance, gate = statusGate;
        if (statusFailure) return route.fulfill({ status: 503, contentType: 'application/json', headers: { 'cache-control': 'no-store' }, body: JSON.stringify({ error: 'The hosted service is temporarily unavailable.', code: 'unavailable' }) });
        if (gate) await gate;
        return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'cache-control': 'no-store' }, body: JSON.stringify({ deployment: 'hosted', csrfToken: CSRF, version: 'browser-fixture', catalogSize: 40, humanCheck, ...(snapshot ? { freeAllowance: snapshot } : {}) }) });
      }
      if (url.pathname === '/api/challenge' && request.method() === 'POST') {
        assert.equal(request.headers()['x-csrf-token'], CSRF);
        challengeBodies.push(request.postDataJSON());
        return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'cache-control': 'no-store' }, body: JSON.stringify({ verified: true, expiresAt: Date.now() + 86400000 }) });
      }
      if (url.pathname === '/api/connection' && request.method() === 'POST') {
        assert.equal(request.headers()['x-csrf-token'], CSRF);
        assert.equal(request.postDataJSON().apiKey, FIXTURE_KEY);
        if (connectionHold) await connectionHold;
        return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'cache-control': 'no-store' }, body: JSON.stringify({ verified: true, model: 'Fixture connection only', provider: 'typesafe' }) });
      }
      if (url.pathname === '/api/compose' && request.method() === 'POST' && composeFixtures.length) {
        assert.equal(request.headers()['x-csrf-token'], CSRF);
        const input = request.postDataJSON(), fixture = composeFixtures.shift(); composeBodies.push(input);
        freeAllowance = fixture.freeAllowance;
        // This is a transport fixture with zero model calls. Real model output
        // and durable free-call accounting are exercised by separate tests.
        const result = fixture.error ? { error: fixture.error, code: fixture.code, freeAllowance } : { spec: input.spec, freshProject: false, freeAllowance, warnings: ['Synthetic transport fixture; no provider call.'], report: { provider: 'fixture', model: 'Synthetic response (no provider call)', calls: 0, inputTokens: 0, outputTokens: 0, durationMs: 0, decisions: [], changes: [] } };
        return route.fulfill({ status: fixture.status || 200, contentType: 'application/json', headers: { 'cache-control': 'no-store' }, body: JSON.stringify(result) });
      }
      const body = assets.get(url.pathname === '/' ? '/index.html' : url.pathname);
      if (!body || request.method() !== 'GET') { denied.push(url.pathname); return route.abort(); }
      return route.fulfill({ status: 200, headers: headersFor(url.pathname), body });
    });
    await context.addInitScript((origin) => { if (window === top && location.origin === origin && localStorage.getItem('forma:cookie-consent') === null) localStorage.setItem('forma:cookie-consent', 'accepted-2'); }, ORIGIN);
    context.on('page', (page) => {
      page.setDefaultTimeout(15000);
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() !== 'error') return;
        if (message.text().includes(`sha256-${PROBE_HASH}`) && /Content Security Policy/.test(message.text())) expectedCsp.push('blocked fixture script');
        else errors.push(message.text());
      });
    });
    return context;
  };
  const context = await newContext(), page = await context.newPage();
  const preview = page.frameLocator('#preview-frame');
  const boot = async (target) => {
    await target.goto(ORIGIN);
    await target.waitForFunction(() => document.documentElement.dataset.deployment === 'hosted');
    await target.frameLocator('#preview-frame').locator('body[data-preview="true"]').waitFor();
  };
  const saved = () => page.evaluate(async () => {
    const id = localStorage.getItem('forma:hosted:last-project');
    return id ? (await import('/browser-projects.mjs')).createBrowserProjectStore().get(id) : null;
  });
  const save = async () => {
    const before = await saved();
    await page.locator('#save-button').click();
    await page.waitForFunction(async (previous) => {
      const id = localStorage.getItem('forma:hosted:last-project'); if (!id) return false;
      const project = await (await import('/browser-projects.mjs')).createBrowserProjectStore().get(id);
      return project.revision > previous && !document.querySelector('#save-status').textContent.includes('Saving');
    }, before?.revision || 0);
    return saved();
  };
  let image, projectId;
  const literal = 'Browser fixture <img src=x onerror="globalThis.injected=1">';

  await t.test('actual CSP authorizes the fixed preview script and keeps the iframe isolated', async () => {
    await boot(page);
    assert.equal(await page.locator('#preview-frame').getAttribute('sandbox'), 'allow-scripts');
    await page.locator('#inspect-button').click();
    await preview.locator('body[data-edit-mode="false"]').waitFor();
    await page.locator('#inspect-button').click();
    await preview.locator('body[data-edit-mode="true"]').waitFor();
    const frame = page.frames().find((entry) => entry !== page.mainFrame());
    assert.equal(await frame.evaluate(() => { try { void parent.document.body; return false; } catch (error) { return error.name === 'SecurityError'; } }), true);
    const probe = await frame.evaluate((source) => new Promise((resolve) => {
      const script = document.createElement('script');
      const finish = (blocked) => { script.remove(); resolve({ blocked, executed: globalThis.injected === true }); };
      document.addEventListener('securitypolicyviolation', (event) => { if (event.blockedURI === 'inline') finish(true); }, { once: true });
      script.textContent = source; document.body.append(script);
      setTimeout(() => finish(false), 1000);
    }), CSP_PROBE);
    assert.deepEqual(probe, { blocked: true, executed: false });
    assert.deepEqual(errors, []);
  });

  await t.test('hosted privacy and key instructions remain accurate when the interface language changes', async () => {
    const checkCopy = async () => {
      const settings = await page.locator('#settings-dialog').textContent();
      assert.ok(settings.includes('through Forma’s backend'));
      assert.ok(settings.includes('Free JEV calls, when available'));
      assert.ok(settings.includes('saved in this browser so you don’t have to enter it again'));
      assert.ok(settings.includes('visible to anyone using it'));
      assert.equal(/local Node\.js|\.env file|local tool, not a hardened/.test(settings), false);
      assert.ok((await page.locator('#help-question-5').textContent()).includes('There is no cloud backup'));
      assert.ok((await page.locator('.cookie-banner-text').textContent()).includes('necessary cookies for the anonymous session'));
      assert.ok((await page.title()).includes('Browser website builder'));
      assert.ok((await page.locator('meta[name="description"]').getAttribute('content')).includes('save projects in this browser'));
    };
    await checkCopy();
    await page.locator('#app-language').selectOption('fi');
    await checkCopy();
    await page.locator('#app-language').selectOption('en');
  });

  await t.test('imported text and an uploaded image save in IndexedDB without project API calls', async () => {
    const spec = createSpec('Hosted browser fixture'); spec.sections.find((section) => section.group === 'hero').title = literal;
    await page.locator('#projects-button').click();
    await page.locator('#import-file').setInputFiles({ name: 'fixture.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(spec)) });
    await page.locator('#projects-dialog').waitFor({ state: 'hidden' });
    await preview.locator('h1').filter({ hasText: literal }).waitFor();
    assert.equal(await preview.locator('h1 img').count(), 0);
    const png = await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = 48; canvas.height = 32; const context = canvas.getContext('2d'); context.fillStyle = '#386854'; context.fillRect(0, 0, 48, 32); return canvas.toDataURL('image/png'); });
    await page.locator('[data-inspector-tab="design"]').click();
    await page.locator('[data-select-section="hero"]').click();
    await page.locator('[data-image-path]').first().setInputFiles({ name: 'fixture.png', mimeType: 'image/png', buffer: Buffer.from(png.split(',')[1], 'base64') });
    await page.waitForFunction(() => document.querySelector('.image-upload img')?.src.startsWith('data:image/webp;base64,'));
    const project = await save(); projectId = project.id; image = project.spec.sections.find((section) => section.group === 'hero').image;
    assert.match(image, /^data:image\/webp;base64,/);
    await preview.locator('#hero img').evaluate((img) => img.decode());
    assert.equal(await preview.locator('#hero img').evaluate((img) => img.naturalWidth), 48);
    assert.equal(await page.evaluate(() => localStorage.getItem('forma:last-project')), null);
  });

  await t.test('real local demo changes the design and reload restores the image and project', async () => {
    await page.locator('#provider-mode').selectOption('demo'); await page.locator('#operation').selectOption('edit');
    await page.locator('#prompt').fill('Switch to the sage palette. Keep the uploaded image. No animation.');
    await page.locator('#build-button').click();
    await preview.locator('.site.palette-sage').waitFor();
    await page.waitForFunction(() => !document.querySelector('#build-button').disabled);
    const project = await saved();
    assert.equal(project.spec.theme.palette, 'sage');
    assert.equal(project.spec.sections.find((section) => section.group === 'hero').image, image);
    assert.match(await page.locator('#result-label').textContent(), /Offline demo/);
    await page.reload();
    await preview.locator('h1').filter({ hasText: literal }).waitFor();
    await preview.locator('#hero img').evaluate((img) => img.decode());
    assert.equal((await saved()).id, projectId);
    assert.equal((await saved()).spec.sections.find((section) => section.group === 'hero').image, image);
    assert.deepEqual(requests.filter((request) => request.path.startsWith('/api/')).map(({ path }) => path), ['/api/status', '/api/status']);
  });

  await t.test('browser export contains the saved spec, image and fixed runtime without an export API', async () => {
    await page.locator('#export-button').click();
    const downloading = page.waitForEvent('download'); await page.locator('#export-confirm').click();
    const download = await downloading, filename = path.join(directory, 'fixture.website.zip');
    await download.saveAs(filename);
    const files = unzipStored(await readFile(filename));
    assert.ok(files.has('index.html') && files.has('LICENSE.txt') && files.has('licenses/HYPERUI.txt'));
    assert.deepEqual(JSON.parse(files.get('project.json')), (await saved()).spec);
    assert.ok(files.get('index.html').toString().includes(image));
    assert.ok(files.get('index.html').toString().includes('script-src &#39;sha256-'), 'Export keeps its hash-based CSP');
    assert.equal(/<body[^>]*data-preview="true"/.test(files.get('index.html').toString()), false);
  });

  await t.test('separate browser profiles cannot read one another’s projects', async () => {
    const other = await newContext();
    try {
      const visitor = await other.newPage(); await boot(visitor);
      assert.equal(await visitor.evaluate(() => localStorage.getItem('forma:hosted:last-project')), null);
      assert.equal(await visitor.locator('#past-projects-count').textContent(), '0');
      assert.equal(await visitor.frameLocator('#preview-frame').locator('h1').filter({ hasText: literal }).count(), 0);
    } finally { await other.close(); }
  });

  await t.test('an acceptance of the notice from before saved keys shows the updated notice once', async () => {
    const other = await newContext();
    try {
      const visitor = await other.newPage(); await boot(visitor);
      assert.equal(await visitor.locator('#cookie-banner').isHidden(), true);
      await visitor.evaluate(() => localStorage.setItem('forma:cookie-consent', 'accepted')); await boot(visitor);
      await visitor.locator('#cookie-banner').waitFor({ state: 'visible' });
      await visitor.locator('#cookie-accept-button').click();
      assert.equal(await visitor.evaluate(() => localStorage.getItem('forma:cookie-consent')), 'accepted-2');
      await boot(visitor); assert.equal(await visitor.locator('#cookie-banner').isHidden(), true);
    } finally { await other.close(); }
  });

  await t.test('a fixture-tested key is saved only in localStorage, restored without a request, and Remove key deletes it from every tab', async () => {
    await page.locator('#settings-button').click(); await page.locator('#api-key').fill(FIXTURE_KEY);
    await page.locator('#connect-submit').click();
    await page.waitForFunction(() => document.querySelector('#connection-label').textContent === 'JEV connected');
    assert.equal(await page.locator('#api-key').inputValue(), '');
    const stored = await page.evaluate(async () => {
      const database = await new Promise((resolve, reject) => { const request = indexedDB.open('forma-hosted-projects-v1', 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      const projects = await new Promise((resolve, reject) => { const request = database.transaction('projects').objectStore('projects').getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      database.close();
      return { local: { ...localStorage }, other: JSON.stringify({ session: { ...sessionStorage }, projects, cookies: document.cookie }) };
    });
    assert.equal(stored.local['forma:hosted:api-key'], FIXTURE_KEY);
    assert.deepEqual(Object.keys(stored.local).filter((name) => stored.local[name].includes(FIXTURE_KEY)), ['forma:hosted:api-key']);
    assert.equal(stored.other.includes(FIXTURE_KEY), false);
    const tests = () => requests.filter((request) => request.path === '/api/connection').length, tested = tests();
    const sibling = await context.newPage(); await boot(sibling);
    await sibling.waitForFunction(() => document.querySelector('#connection-label').textContent === 'JEV key set');
    await page.reload(); await preview.locator('h1').filter({ hasText: literal }).waitFor();
    await page.waitForFunction(() => document.querySelector('#connection-label').textContent === 'JEV key set');
    assert.equal(tests(), tested, 'Restoring a saved key never contacts the provider');
    await page.locator('#settings-button').click(); await page.locator('#disconnect-button').click();
    await page.waitForFunction(() => document.querySelector('#connection-label').textContent === 'Connect JEV');
    await sibling.waitForFunction(() => document.querySelector('#connection-label').textContent === 'Connect JEV');
    await sibling.close();
    assert.equal(await page.locator('#connection-feedback').textContent(), 'Key removed from this browser.');
    assert.equal(await page.evaluate(() => localStorage.getItem('forma:hosted:api-key')), null);
    await page.reload(); await preview.locator('h1').filter({ hasText: literal }).waitFor();
    assert.equal(await page.locator('#connection-label').textContent(), 'Connect JEV');
    // A removal signal from another tab ignores an older removal, deletes a key this tab saved
    // from a test that began before the removal, and keeps a key another tab saved afterwards.
    const savedKey = () => page.evaluate(() => localStorage.getItem('forma:hosted:api-key'));
    const signal = (age) => page.evaluate((ms) => dispatchEvent(new StorageEvent('storage', { key: 'forma:hosted:api-key:removed', newValue: String(Date.now() - ms) })), age);
    await page.locator('#settings-button').click(); await page.locator('#api-key').fill(FIXTURE_KEY); await page.locator('#connect-submit').click();
    await page.waitForFunction(() => document.querySelector('#connection-label').textContent === 'JEV connected');
    await page.locator('[data-close="settings-dialog"]').click();
    await signal(60000); assert.equal(await savedKey(), FIXTURE_KEY);
    await signal(0); await page.waitForFunction(() => document.querySelector('#connection-label').textContent === 'Connect JEV');
    assert.equal(await savedKey(), null);
    await page.evaluate(() => localStorage.setItem('forma:hosted:api-key', 'saved-by-another-tab'));
    await signal(0); assert.equal(await savedKey(), 'saved-by-another-tab');
    await page.evaluate(() => localStorage.removeItem('forma:hosted:api-key'));
    // Remove key with nothing saved still stops a key test that another tab has running.
    let release; connectionHold = new Promise((resolve) => { release = resolve; });
    const tester = await context.newPage(); await boot(tester);
    await tester.locator('#settings-button').click(); await tester.locator('#api-key').fill(FIXTURE_KEY);
    const sent = tests(); await tester.locator('#connect-submit').click();
    await tester.waitForFunction(() => document.querySelector('#connect-submit').disabled);
    while (tests() === sent) await page.waitForTimeout(20);
    await page.locator('#settings-button').click(); await page.locator('#disconnect-button').click();
    await page.waitForFunction(() => document.querySelector('#connection-feedback').textContent === 'Key removed from this browser.');
    connectionHold = null; release();
    await tester.waitForFunction(() => document.querySelector('#connection-feedback').textContent === 'Request cancelled.');
    await tester.waitForFunction(() => !document.querySelector('#connect-submit').disabled);
    assert.equal(await tester.locator('#connection-label').textContent(), 'Connect JEV');
    assert.equal(await page.evaluate(() => localStorage.getItem('forma:hosted:api-key')), null);
    await tester.close(); await page.locator('[data-close="settings-dialog"]').click();
  });

  await t.test('free call counter follows fixture server responses and exhaustion offers a personal key without retry', async () => {
    freeAllowance = allowance(10);
    await page.reload(); await preview.locator('h1').filter({ hasText: literal }).waitFor();
    assert.ok((await page.locator('#build-button').textContent()).includes('10/10 free calls'));
    assert.equal(await page.locator('#connection-label').textContent(), 'Connect JEV', 'Configured free access does not claim a personal key was connected');
    composeFixtures.push({ freeAllowance: allowance(8) });
    await page.locator('#prompt').fill('Keep the current design for this transport fixture.');
    await page.locator('#build-button').click();
    await page.waitForFunction(() => !document.querySelector('#build-fields').disabled && document.querySelector('#build-button').textContent.includes('8/10 free calls'));
    assert.equal(composeBodies.length, 1); assert.equal(Object.hasOwn(composeBodies[0], 'apiKey'), false);
    assert.equal(JSON.stringify(composeBodies[0]).includes(image), false, 'Uploaded image bytes stay in the browser');
    assert.equal((await saved()).spec.sections.find((section) => section.group === 'hero').image, image);
    composeFixtures.push({ status: 429, code: 'free_limit', error: 'Not enough free calls remain. Connect your own key.', freeAllowance: allowance(0) });
    await page.locator('#prompt').fill('Keep this project for the exhausted allowance fixture.');
    await page.locator('#build-button').click();
    await page.locator('#settings-dialog').waitFor({ state: 'visible' });
    await page.waitForFunction(() => !document.querySelector('#build-fields').disabled);
    assert.ok((await page.locator('#build-button').textContent()).includes('0/10 free calls'));
    assert.ok((await page.locator('#build-button').textContent()).includes('Use your key'));
    assert.equal(composeBodies.length, 2, 'The denied build was not retried');
    await page.locator('[data-close="settings-dialog"]').click();
    const before = requests.filter(({ path }) => path === '/api/status').length;
    await page.locator('#build-button').click(); await page.locator('#settings-dialog').waitFor({ state: 'visible' });
    assert.equal(requests.filter(({ path }) => path === '/api/status').length, before + 1, 'An explicit click refreshes a stale exhausted allowance without a provider probe');
    assert.equal(composeBodies.length, 2);
    await page.locator('[data-close="settings-dialog"]').click();
    freeAllowance = allowance(10); composeFixtures.push({ freeAllowance: allowance(8) });
    await page.locator('#build-button').click();
    await page.waitForFunction(() => !document.querySelector('#build-fields').disabled && document.querySelector('#build-button').textContent.includes('8/10 free calls'));
    assert.equal(composeBodies.length, 3, 'A reset server allowance becomes usable without reloading the page');
  });

  await t.test('personal key selection bypasses free allowance, reload restores the saved key and Remove key restores the latest count', async () => {
    await page.locator('#settings-button').click(); await page.locator('#api-key').fill(FIXTURE_KEY);
    await page.locator('#connect-submit').click();
    await page.waitForFunction(() => document.querySelector('#connection-label').textContent === 'JEV connected');
    assert.ok((await page.locator('#build-button').textContent()).includes('Your key'));
    assert.ok((await page.locator('#mode-note').textContent()).includes('Your free allowance is not used'));
    await page.locator('[data-close="settings-dialog"]').click();
    composeFixtures.push({ freeAllowance: allowance(8) });
    await page.locator('#prompt').fill('Keep this project for a personal key transport fixture.');
    await page.locator('#build-button').click();
    await page.waitForFunction(() => !document.querySelector('#build-fields').disabled);
    assert.equal(composeBodies.at(-1).apiKey, FIXTURE_KEY);
    assert.ok((await page.locator('#build-button').textContent()).includes('Your key'));
    await page.reload(); await preview.locator('h1').filter({ hasText: literal }).waitFor();
    await page.waitForFunction(() => document.querySelector('#connection-label').textContent === 'JEV key set');
    assert.ok((await page.locator('#build-button').textContent()).includes('Your key'), 'Reload restores the saved personal key');
    await page.locator('#settings-button').click(); await page.locator('#api-key').fill(FIXTURE_KEY);
    await page.locator('#connect-submit').click();
    await page.waitForFunction(() => document.querySelector('#connection-label').textContent === 'JEV connected');
    freeAllowance = allowance(4);
    await page.locator('#disconnect-button').click();
    await page.waitForFunction(() => document.querySelector('#build-button').textContent.includes('4/10 free calls'));
    await page.locator('[data-close="settings-dialog"]').click();
    await page.reload(); await preview.locator('h1').filter({ hasText: literal }).waitFor();
    assert.ok((await page.locator('#build-button').textContent()).includes('4/10 free calls'));
    assert.equal(await page.locator('#connection-label').textContent(), 'Connect JEV');
  });

  await t.test('unavailable free provider opens BYOK and offline demo remains free of provider traffic', async () => {
    composeFixtures.push({ status: 503, code: 'free_unavailable', error: 'Free JEV is unavailable. Connect your own key.', freeAllowance: allowance(4, { available: false, reason: 'credits' }) });
    await page.locator('#prompt').fill('Keep this project for the unavailable provider fixture.');
    await page.locator('#build-button').click(); await page.locator('#settings-dialog').waitFor({ state: 'visible' });
    await page.waitForFunction(() => !document.querySelector('#build-fields').disabled);
    assert.ok((await page.locator('#build-button').textContent()).includes('Free calls unavailable'));
    assert.ok((await page.locator('#build-button').textContent()).includes('Use your key'));
    const calls = composeBodies.length;
    await page.locator('[data-close="settings-dialog"]').click();
    await page.locator('#provider-mode').selectOption('demo');
    await page.locator('#prompt').fill('Switch to the sage palette.');
    await page.locator('#build-button').click();
    await page.waitForFunction(() => !document.querySelector('#build-fields').disabled && document.querySelector('#result-label').textContent.includes('Offline demo'));
    assert.equal(composeBodies.length, calls);
    assert.equal((await page.locator('#build-button').textContent()).includes('free calls'), false);
    assert.equal(composeFixtures.length, 0);
  });

  await t.test('a delayed status response after disconnect cannot replace a newer free count', async () => {
    freeAllowance = allowance(10);
    await page.reload(); await preview.locator('h1').filter({ hasText: literal }).waitFor();
    await page.locator('#provider-mode').selectOption('jev');
    await page.waitForFunction(() => document.querySelector('#build-button').textContent.includes('10/10 free calls'));
    await page.locator('#settings-button').click(); await page.locator('#api-key').fill(FIXTURE_KEY);
    await page.locator('#connect-submit').click();
    await page.waitForFunction(() => document.querySelector('#connection-feedback').textContent.startsWith('Connected to'));
    let release; statusGate = new Promise((resolve) => { release = resolve; });
    const held = page.waitForRequest((request) => new URL(request.url()).pathname === '/api/status');
    await page.locator('#disconnect-button').click();
    await held;
    await page.locator('[data-close="settings-dialog"]').click();
    await page.waitForFunction(() => document.querySelector('#build-button').textContent.includes('10/10 free calls'));
    composeFixtures.push({ freeAllowance: allowance(8) });
    await page.locator('#prompt').fill('Keep this project for the delayed status fixture.');
    await page.locator('#build-button').click();
    await page.waitForFunction(() => !document.querySelector('#build-fields').disabled && document.querySelector('#build-button').textContent.includes('8/10 free calls'));
    assert.equal(Object.hasOwn(composeBodies.at(-1), 'apiKey'), false);
    const answered = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/status');
    statusGate = null; release();
    await answered;
    await page.waitForFunction(() => document.querySelector('#connection-feedback').textContent.startsWith('Key removed'));
    assert.ok((await page.locator('#build-button').textContent()).includes('8/10 free calls'), 'The older 10/10 snapshot is discarded');
  });

  await t.test('saved projects, editing and export work when the hosted API is unavailable, without demo fallback', async () => {
    statusFailure = true;
    const before = await saved(), composeRequests = requests.filter(({ path }) => path === '/api/compose').length;
    await page.reload(); await preview.locator('h1').filter({ hasText: literal }).waitFor();
    await page.waitForFunction(() => document.querySelector('#build-button').textContent.includes('JEV unavailable'));
    assert.equal((await saved()).id, before.id);
    const edited = await save();
    assert.ok(edited.revision > before.revision, 'Saving works without the API');
    await page.locator('#export-button').click();
    const downloading = page.waitForEvent('download'); await page.locator('#export-confirm').click();
    const filename = path.join(directory, 'offline.website.zip');
    await (await downloading).saveAs(filename);
    assert.deepEqual(JSON.parse(unzipStored(await readFile(filename)).get('project.json')), (await saved()).spec);
    await page.locator('#provider-mode').selectOption('jev');
    await page.locator('#prompt').fill('Switch to the sage palette for the unavailable service fixture.');
    const statusBefore = requests.filter(({ path }) => path === '/api/status').length;
    await page.locator('#build-button').click();
    await page.locator('.toast.error').filter({ hasText: 'JEV service is unavailable' }).first().waitFor();
    await page.waitForFunction(() => !document.querySelector('#build-fields').disabled);
    assert.equal(requests.filter(({ path }) => path === '/api/status').length, statusBefore + 1, 'An explicit build retries status once');
    assert.equal(requests.filter(({ path }) => path === '/api/compose').length, composeRequests, 'No composition was sent');
    assert.equal((await page.locator('#result-label').textContent()).includes('Offline demo'), false, 'No silent demo fallback');
    assert.deepEqual((await saved()).spec, edited.spec);
    statusFailure = false;
  });

  await t.test('Turnstile loads only for a live action under the real CSP, retries a refused build once and can be cancelled', async () => {
    freeAllowance = allowance(10); humanCheck = { mode: 'turnstile', siteKey: 'fixture-site-key', verifiedUntil: Date.now() + 3600000 };
    await page.reload(); await preview.locator('h1').filter({ hasText: literal }).waitFor();
    await page.locator('#provider-mode').selectOption('jev');
    await page.waitForFunction(() => document.querySelector('#build-button').textContent.includes('10/10 free calls'));
    assert.equal(turnstileLoads.length, 0, 'Page load never fetches Turnstile');
    const composed = composeBodies.length;
    composeFixtures.push({ status: 403, code: 'human_required', error: 'Complete the browser check before using live JEV. Nothing was sent to the provider.', freeAllowance: allowance(10) }, { freeAllowance: allowance(8) });
    await page.locator('#prompt').fill('Keep this project for the browser check fixture.');
    await page.locator('#build-button').click();
    await page.waitForFunction(() => !document.querySelector('#build-fields').disabled && document.querySelector('#build-button').textContent.includes('8/10 free calls'));
    assert.equal(turnstileLoads.length, 1);
    assert.deepEqual(challengeBodies, [{ token: 'stub-turnstile-token' }]);
    assert.equal(composeBodies.length, composed + 2, 'The refused build was retried exactly once');
    assert.deepEqual(await page.evaluate(() => window.__turnstile), { rendered: [{ container: 'human-widget', sitekey: 'fixture-site-key', action: 'forma_live', appearance: 'interaction-only', execution: 'execute', retry: 'never', refresh: 'never' }], executed: ['human-widget'], removed: 1 });
    assert.equal(await page.locator('#human-dialog').evaluate((dialog) => dialog.open), false);
    composeFixtures.push({ freeAllowance: allowance(6) });
    await page.locator('#prompt').fill('Keep this project for the reused browser check fixture.');
    await page.locator('#build-button').click();
    await page.waitForFunction(() => !document.querySelector('#build-fields').disabled && document.querySelector('#build-button').textContent.includes('6/10 free calls'));
    assert.equal(challengeBodies.length, 1, 'The pass is reused');
    humanCheck = { mode: 'turnstile', siteKey: 'fixture-site-key', verifiedUntil: null }; stubHold = true;
    await page.reload(); await preview.locator('h1').filter({ hasText: literal }).waitFor();
    await page.waitForFunction(() => document.querySelector('#build-button').textContent.includes('6/10 free calls'));
    await page.locator('#prompt').fill('Keep this project for the cancelled browser check fixture.');
    await page.locator('#build-button').click();
    await page.locator('#human-dialog').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#human-status').textContent(), 'Checking this browser…');
    await page.locator('#human-dialog .modal-actions [data-close="human-dialog"]').click();
    await page.locator('.toast').filter({ hasText: 'Request cancelled.' }).first().waitFor();
    await page.waitForFunction(() => !document.querySelector('#build-fields').disabled);
    assert.equal(challengeBodies.length, 1);
    assert.equal(composeBodies.length, composed + 3, 'A cancelled check sends nothing to the provider');
    const connections = requests.filter(({ path }) => path === '/api/connection').length;
    await page.locator('#settings-button').click(); await page.locator('#api-key').fill(FIXTURE_KEY);
    await page.locator('#connect-submit').click();
    await page.locator('#human-dialog').waitFor({ state: 'visible' });
    await page.locator('#human-dialog .modal-actions [data-close="human-dialog"]').click();
    await page.waitForFunction(() => document.querySelector('#connection-feedback').textContent === 'Request cancelled.' && !document.querySelector('#connect-submit').disabled);
    assert.equal(requests.filter(({ path }) => path === '/api/connection').length, connections, 'A cancelled key test sends nothing');
    await page.locator('[data-close="settings-dialog"]').click();
    humanCheck = { mode: 'off' }; stubHold = false;
  });

  await t.test('the funded pause countdown keeps rechecking status until the server leaves the pause', async () => {
    freeAllowance = allowance(6, { available: false, reason: 'resetting', resetAt: Date.now() + 2000 });
    await page.clock.install();
    await page.reload(); await preview.locator('h1').filter({ hasText: literal }).waitFor();
    await page.locator('#provider-mode').selectOption('jev');
    await page.waitForFunction(() => document.querySelector('#build-button').textContent.includes('Free calls resume in'));
    // Rechecks that still see the pause, as when the client clock runs ahead of the
    // server, slow down after the first few but continue.
    let paused = 0;
    const count = (response) => { if (new URL(response.url()).pathname === '/api/status') paused += 1; };
    page.on('response', count);
    for (let second = 0; second < 300 && paused < 7; second += 1) await page.clock.runFor(1000);
    page.off('response', count);
    assert.ok(paused >= 7, `${paused} rechecks`);
    freeAllowance = allowance(6);
    await page.clock.runFor(66000);
    await page.waitForFunction(() => document.querySelector('#build-button').textContent.includes('6/10 free calls'));
  });

  assert.deepEqual(denied, [], 'No remote or unsupported API request');
  assert.deepEqual(errors.filter((message) => !/^Failed to load resource: the server responded with a status of (403|429|503)/.test(message)), [], 'No unexpected JavaScript or CSP error');
  assert.ok(expectedCsp.length > 0);
  assert.ok(requests.filter(({ path }) => path.startsWith('/api/')).every(({ path }) => ['/api/status', '/api/challenge', '/api/connection', '/api/compose'].includes(path)));
  t.diagnostic(`Browser test target: ${process.platform}, ${process.version}, Chromium ${browser.version()}; synthetic bootstrap/connection/composition only, no real authentication or provider calls.`);
});
