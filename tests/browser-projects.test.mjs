import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createBrowserProjectStore, BrowserProjectStoreError } from '../public/browser-projects.mjs';
import { createSpec } from '../shared/content.mjs';
import { paddedPng } from './fixtures/images.mjs';

test('browser persistence explicitly rejects unavailable storage without a fallback', async () => {
  const store = createBrowserProjectStore({ indexedDB: null });
  for (const operation of [() => store.list(), () => store.create(createSpec()), () => store.get('project'), () => store.update('project', { spec: createSpec(), expectedRevision: 1 }), () => store.delete('project', 1), () => store.history('project', 'checkpoint')]) {
    await assert.rejects(operation(), (error) => error instanceof BrowserProjectStoreError && error.status === 503 && /export your current JSON/.test(error.message));
  }
});

test('browser project inputs validate before a database is opened', async () => {
  let opens = 0;
  const store = createBrowserProjectStore({ indexedDB: { open() { opens++; throw new Error('Unexpected database open'); } } });
  const unsafe = createSpec(); unsafe.brand.href = 'javascript:alert(1)';
  const badInputs = [
    () => store.create(unsafe),
    () => store.get('../project'),
    () => store.update('project', { spec: unsafe, expectedRevision: 1 }),
    () => store.update('project', { spec: createSpec(), expectedRevision: '1' }),
    () => store.update('project', { spec: createSpec(), expectedRevision: 1, unexpected: true }),
    () => store.update('project', { spec: createSpec(), expectedRevision: 1, checkpoint: 'true' }),
    () => store.update('project', { spec: createSpec(), expectedRevision: 1, label: 'x'.repeat(181) }),
    () => store.delete('project', 0),
    () => store.history('project', '../checkpoint'),
  ];
  for (const operation of badInputs) await assert.rejects(operation(), { name: 'ValidationError', status: 400 });
  assert.equal(opens, 0);
});

test('browser storage errors omit implementation details and explain recovery', async () => {
  const store = createBrowserProjectStore({ indexedDB: { open() { throw new Error('private implementation detail'); } } });
  await assert.rejects(store.list(), (error) => error.status === 503 && !error.message.includes('private implementation') && error.message.includes('Keep this tab open'));
});

test('storage access denial does not crash store construction', async (t) => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, get() { throw new DOMException('Storage access denied', 'SecurityError'); } });
  t.after(() => { if (original) Object.defineProperty(globalThis, 'indexedDB', original); else delete globalThis.indexedDB; });
  const store = createBrowserProjectStore();
  await assert.rejects(store.list(), (error) => error.status === 503 && /export your current JSON/.test(error.message));
});

// Real browser transactions are required to test cross-tab serialization. No
// hand-built IndexedDB fake is used as evidence for those guarantees.
test('real IndexedDB retains projects and enforces cross-tab revisions and bounds', { skip: !process.env.FORMA_PLAYWRIGHT_MODULE, timeout: 120000 }, async (t) => {
  const { chromium } = await import(pathToFileURL(process.env.FORMA_PLAYWRIGHT_MODULE));
  const routes = new Map([['/', '<!doctype html><title>Isolated browser project tests</title>'], ['/browser-projects.mjs', await readFile(new URL('../public/browser-projects.mjs', import.meta.url), 'utf8')]]);
  for (const name of await readdir(new URL('../shared/', import.meta.url))) if (/^[a-z-]+\.mjs$/.test(name)) routes.set(`/shared/${name}`, await readFile(new URL(`../shared/${name}`, import.meta.url), 'utf8'));
  const server = createServer((request, response) => {
    const body = routes.get(request.url);
    response.writeHead(body === undefined ? 404 : 200, { 'Content-Type': request.url === '/' ? 'text/html' : 'text/javascript', 'Cache-Control': 'no-store' });
    response.end(body || 'Not found');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const browser = await chromium.launch({ headless: true, ...(process.env.FORMA_TEST_BROWSER ? { executablePath: process.env.FORMA_TEST_BROWSER } : {}) });
  t.after(() => browser.close());
  const context = await browser.newContext();
  const pages = await Promise.all([context.newPage(), context.newPage()]);
  const base = `http://127.0.0.1:${server.address().port}`;
  await Promise.all(pages.map((page) => page.goto(base)));
  const errors = [];
  for (const page of pages) page.on('pageerror', (error) => errors.push(error.message));
  const initialize = async (page, name) => page.evaluate(async (databaseName) => {
    const { createBrowserProjectStore } = await import('/browser-projects.mjs');
    globalThis.projects = createBrowserProjectStore({ databaseName });
    globalThis.testDatabaseName = databaseName;
    globalThis.mutateRaw = async (transform) => {
      const database = await new Promise((resolve, reject) => { const request = indexedDB.open(databaseName, 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      try {
        await new Promise((resolve, reject) => { const transaction = database.transaction('projects', 'readwrite'); transaction.oncomplete = resolve; transaction.onabort = () => reject(transaction.error); transform(transaction.objectStore('projects')); });
      } finally { database.close(); }
    };
  }, name);
  const setup = async (name) => Promise.all(pages.map((page) => initialize(page, `forma-browser-store-test-${name}`)));

  await t.test('normalization, checkpoints, reload and separate-browser isolation', async () => {
    await setup('persistence');
    const legacy = createSpec(); delete legacy.pages; delete legacy.sections[0].removedParts; legacy.unrecognized = 'unpersisted field';
    const first = await pages[0].evaluate((spec) => projects.create(spec), legacy);
    assert.match(first.id, /^p_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.equal(first.revision, 1);
    assert.deepEqual(first.spec.pages, []);
    assert.deepEqual(first.spec.sections[0].removedParts, []);
    assert.equal(Object.hasOwn(first.spec, 'unrecognized'), false);
    const next = { ...first.spec, name: 'Edited browser project' };
    const saved = await pages[0].evaluate(({ first, next }) => projects.update(first.id, { spec: next, expectedRevision: 1, checkpoint: true }), { first, next });
    assert.equal(saved.revision, 2);
    assert.equal((await pages[0].evaluate(({ id, history }) => projects.history(id, history[0].id), saved)).spec.name, first.spec.name);
    const current = await pages[0].evaluate((saved) => projects.update(saved.id, { spec: { ...saved.spec, name: 'Manual snapshot' }, expectedRevision: 2, checkpoint: true, checkpointCurrent: true, label: 'Visible version' }), saved);
    assert.equal((await pages[0].evaluate(({ id, history }) => projects.history(id, history[0].id), current)).spec.name, 'Manual snapshot');
    await pages[0].reload(); await initialize(pages[0], 'forma-browser-store-test-persistence');
    assert.deepEqual(await pages[0].evaluate((id) => projects.get(id), first.id), current);
    const other = await browser.newContext();
    try { const page = await other.newPage(); await page.goto(base); await initialize(page, 'forma-browser-store-test-persistence'); assert.deepEqual(await page.evaluate(() => projects.list()), { projects: [], skipped: 0 }); }
    finally { await other.close(); }
    await pages[0].evaluate((current) => projects.delete(current.id, current.revision), current);
    assert.equal(await pages[0].evaluate(async (id) => { try { await projects.get(id); return 0; } catch (error) { return error.status; } }, first.id), 404);
  });

  await t.test('racing tabs commit one revision and reject stale update/delete without changes', async () => {
    await setup('race');
    const first = await pages[0].evaluate((spec) => projects.create(spec), createSpec());
    const results = await Promise.all(pages.map((page, index) => page.evaluate(async ({ first, index }) => {
      try { const result = await projects.update(first.id, { spec: { ...first.spec, name: `Concurrent ${index}` }, expectedRevision: 1, checkpoint: true }); return { ok: true, result }; }
      catch (error) { return { ok: false, status: error.status }; }
    }, { first, index })));
    assert.equal(results.filter((entry) => entry.ok).length, 1);
    assert.equal(results.find((entry) => !entry.ok).status, 409);
    const winner = results.find((entry) => entry.ok).result;
    assert.equal(winner.revision, 2); assert.equal(winner.history.length, 1);
    assert.equal(await pages[1].evaluate(async (id) => { try { await projects.delete(id, 1); return 0; } catch (error) { return error.status; } }, first.id), 409);
    assert.deepEqual(await pages[1].evaluate((id) => projects.get(id), first.id), winner);
    const bad = { ...winner.spec, brand: { ...winner.spec.brand, href: 'javascript:alert(1)' } };
    assert.equal(await pages[1].evaluate(async ({ id, spec }) => { try { await projects.update(id, { spec, expectedRevision: 2 }); return 0; } catch (error) { return error.status; } }, { id: first.id, spec: bad }), 400);
    assert.deepEqual(await pages[0].evaluate((id) => projects.get(id), first.id), winner);
  });

  await t.test('all records count against atomic quota while corrupt rows are skipped safely', async () => {
    await setup('quota');
    await pages[0].evaluate(() => projects.list());
    await pages[0].evaluate(() => mutateRaw((store) => { for (let index = 0; index < 99; index++) store.add({ id: `broken_${index}`, spec: { malicious: '<script>invalid</script>' } }); }));
    const results = await Promise.all(pages.map((page) => page.evaluate(async (spec) => { try { return { ok: true, project: await projects.create(spec) }; } catch (error) { return { ok: false, status: error.status }; } }, createSpec())));
    assert.equal(results.filter((entry) => entry.ok).length, 1);
    assert.equal(results.find((entry) => !entry.ok).status, 409);
    const list = await pages[0].evaluate(() => projects.list());
    assert.equal(list.projects.length, 1); assert.equal(list.skipped, 99);
    assert.equal(await pages[0].evaluate(async () => { try { await projects.get('broken_1'); return 0; } catch (error) { return error.status; } }), 500);
    assert.equal(await pages[0].evaluate(async (spec) => { try { await projects.update('broken_1', { spec, expectedRevision: 1 }); return 0; } catch (error) { return error.status; } }, createSpec()), 500);
    const saved = results.find((entry) => entry.ok).project;
    await pages[0].evaluate((saved) => projects.delete(saved.id, saved.revision), saved);
    assert.equal((await pages[1].evaluate((spec) => projects.create(spec), createSpec())).revision, 1);
  });

  await t.test('checkpoint count and aggregate payload bounds survive reopening', async () => {
    await setup('history');
    const small = await pages[0].evaluate(async (spec) => {
      let project = await projects.create(spec);
      for (let count = 1; count <= 12; count++) project = await projects.update(project.id, { spec: { ...spec, name: `Version ${count}` }, expectedRevision: project.revision, checkpoint: true, checkpointCurrent: true, label: `Checkpoint ${count}` });
      return project;
    }, createSpec());
    assert.equal(small.history.length, 10);
    assert.equal(small.history[0].label, 'Checkpoint 12'); assert.equal(small.history.at(-1).label, 'Checkpoint 3');
    const large = createSpec(), image = paddedPng();
    for (const section of large.sections.slice(0, 5)) section.image = image;
    const stats = await pages[0].evaluate(async (spec) => {
      let project = await projects.create(spec);
      for (let count = 0; count < 7; count++) project = await projects.update(project.id, { spec, expectedRevision: project.revision, checkpoint: true });
      const snapshots = await Promise.all(project.history.map((snapshot) => projects.history(project.id, snapshot.id)));
      return { id: project.id, revision: project.revision, count: snapshots.length, characters: JSON.stringify(snapshots).length };
    }, large);
    assert.equal(stats.revision, 8); assert.ok(stats.count > 0 && stats.count < 7); assert.ok(stats.characters <= 20_000_000);
    await pages[0].reload(); await initialize(pages[0], 'forma-browser-store-test-history');
    assert.equal((await pages[0].evaluate((id) => projects.get(id), stats.id)).history.length, stats.count);
  });

  await t.test('tampering and revision overflow reject without overwriting saved data', async () => {
    await setup('tampering');
    const created = await pages[0].evaluate((spec) => projects.create(spec), createSpec());
    const outcomes = await pages[0].evaluate(async (created) => {
      const raw = { id: created.id, revision: Number.MAX_SAFE_INTEGER, updatedAt: created.updatedAt, spec: created.spec, history: [] };
      await mutateRaw((store) => store.put(raw));
      let overflow; try { await projects.update(raw.id, { spec: raw.spec, expectedRevision: raw.revision }); } catch (error) { overflow = error.status; }
      const retainedRevision = (await projects.get(raw.id)).revision;
      raw.history = [{ id: 'bad_snapshot', label: 'Invalid', createdAt: raw.updatedAt, spec: { ...raw.spec, brand: { ...raw.spec.brand, href: 'javascript:alert(1)' } } }];
      await mutateRaw((store) => store.put(raw));
      let corrupt; try { await projects.get(raw.id); } catch (error) { corrupt = error.status; }
      return { overflow, retainedRevision, corrupt, list: await projects.list() };
    }, created);
    assert.equal(outcomes.overflow, 409); assert.equal(outcomes.retainedRevision, Number.MAX_SAFE_INTEGER); assert.equal(outcomes.corrupt, 500); assert.deepEqual(outcomes.list, { projects: [], skipped: 1 });
  });

  await t.test('a failed write aborts its transaction and permits a later successful save', async () => {
    await setup('failure');
    const result = await pages[0].evaluate(async (spec) => {
      const first = await projects.create(spec);
      const originalPut = IDBObjectStore.prototype.put;
      let failure;
      // Inject only a browser write failure; IndexedDB still owns the actual
      // transaction, rollback and subsequent successful operation.
      IDBObjectStore.prototype.put = function () { throw new DOMException('Fixture quota limit', 'QuotaExceededError'); };
      try { await projects.update(first.id, { spec: { ...spec, name: 'Unsaved' }, expectedRevision: 1, checkpoint: true }); }
      catch (error) { failure = error.status; }
      finally { IDBObjectStore.prototype.put = originalPut; }
      const retained = await projects.get(first.id);
      const saved = await projects.update(first.id, { spec: { ...spec, name: 'Successful retry' }, expectedRevision: 1, checkpoint: true });
      return { failure, retained, saved };
    }, createSpec());
    assert.equal(result.failure, 507); assert.equal(result.retained.revision, 1); assert.equal(result.retained.history.length, 0);
    assert.equal(result.saved.revision, 2); assert.equal(result.saved.history.length, 1); assert.equal(result.saved.name, 'Successful retry');
  });
  assert.deepEqual(errors, []);
});
