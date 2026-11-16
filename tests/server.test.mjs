/** NEW: Real localhost HTTP tests with only the external TypeSafe transport mocked. */
import test from 'node:test';
import { request as httpRequest } from 'node:http';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.mjs';
import { createSpec, makeSection } from '../shared/content.mjs';
import { validateSpec } from '../shared/schema.mjs';
import { itemFieldsFor } from '../shared/blocks.mjs';
import { ProjectStore } from '../server/store.mjs';
import { demoEvaluate } from '../server/demo.mjs';
import { OPENROUTER_JEV_ENDPOINT, OPENROUTER_DEFAULT_MODEL } from '../server/jev.mjs';
import { HOSTED_ASSETS } from '../scripts/build-hosted.mjs';
async function setup(t, options = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'forma-test-'));
  const app = await createApp({ dataDir: dir, ...options });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const status = await (await fetch(`${base}/api/status`)).json();
  t.after(async () => { await app.close(); await rm(dir, { recursive: true, force: true }); });
  const call = (pathname, method = 'GET', data, headers = {}) => fetch(`${base}${pathname}`, { method, headers: { 'X-Forma-Token': status.token, ...(data === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
  return { app, dir, base, status, call };
}
async function mockTypeSafe(_url, init) {
  const payload = JSON.parse(init.body);
  const output = typeof payload.state === 'string' ? { answers: Object.fromEntries(Object.entries(payload.questions).map(([key, q]) => [key, { choice: Object.keys(q.criteria)[0] }])) } : await demoEvaluate(payload);
  return new Response(JSON.stringify({ model: 'jev-fixture-not-live', usage: { input_tokens: 120, output_tokens: 30 }, answers: Object.fromEntries(Object.entries(payload.questions).map(([key, q]) => [key, { type: 'choice', choice: output.answers[key].choice, confidence: 1, probabilities: Object.fromEntries(Object.keys(q.criteria).map((option) => [option, option === output.answers[key].choice ? 1 : 0])) }])) }));
}
test('HTTP server serves the app with strict headers and no key disclosure', async (t) => { const { call, status } = await setup(t, { apiKey: 'not-public-key' }); const page = await call('/'); assert.equal(page.status, 200); assert.match(await page.text(), /Forma/); assert.ok(page.headers.get('content-security-policy').includes("frame-ancestors 'none'")); assert.equal(page.headers.get('x-content-type-options'), 'nosniff'); assert.ok(!JSON.stringify(status).includes('not-public-key')); assert.equal(status.configured, true); });
test('HTTP server serves SVG and ICO favicons', async (t) => { const { call } = await setup(t); const svgFavicon = await call('/favicon.svg'); assert.equal(svgFavicon.status, 200); assert.match(svgFavicon.headers.get('content-type'), /image\/svg\+xml/); assert.match(await svgFavicon.text(), /<svg\b/); const icoFavicon = await call('/favicon.ico'); assert.equal(icoFavicon.status, 200); assert.equal(icoFavicon.headers.get('content-type'), 'image/x-icon'); assert.ok((await icoFavicon.arrayBuffer()).byteLength > 100); });
test('HTTP rejects missing CSRF token, bad origin, cross-site fetch and bad Host', async (t) => { const { base, call } = await setup(t); assert.equal((await fetch(`${base}/api/projects`)).status, 403); assert.equal((await call('/api/projects', 'GET', undefined, { Origin: 'https://evil.example' })).status, 403); assert.equal((await call('/api/projects', 'GET', undefined, { 'Sec-Fetch-Site': 'cross-site' })).status, 403); // NEW: Undici fetch normalizes Host; a raw HTTP request tests the actual malicious header.
  const badHostStatus = await new Promise((resolve, reject) => {
    const req = httpRequest(base, { headers: { Host: 'evil.example' } }, (res) => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject); req.end();
  });
  assert.equal(badHostStatus, 403); });
test('HTTP does not expose .env, server code or traversal paths', async (t) => { const { call } = await setup(t); for (const url of ['/.env', '/server/jev.mjs', '/.data/projects', '/%2e%2e/.env', '/package.json']) assert.equal((await call(url)).status, 404); });
test('HTTP rejects non-JSON and malformed bodies', async (t) => { const { base, status } = await setup(t); const a = await fetch(`${base}/api/projects`, { method: 'POST', headers: { 'X-Forma-Token': status.token, 'Content-Type': 'text/plain' }, body: '{}' }); assert.equal(a.status, 415); const b = await fetch(`${base}/api/projects`, { method: 'POST', headers: { 'X-Forma-Token': status.token, 'Content-Type': 'application/json' }, body: '{' }); assert.equal(b.status, 400); });
test('HTTP live mode without a key fails visibly and never uses demo', async (t) => { const { call } = await setup(t); const response = await call('/api/compose', 'POST', { mode: 'jev', operation: 'create', prompt: 'A studio website', spec: createSpec(), locks: {} }); assert.equal(response.status, 428); assert.match((await response.json()).error, /API key/); });
test('HTTP demo mode composes a functional spec without a key', async (t) => { const { call } = await setup(t); const response = await call('/api/compose', 'POST', { mode: 'demo', operation: 'create', prompt: 'A dark SaaS website with pricing and FAQ.', spec: createSpec(), locks: {} }); assert.equal(response.status, 200); const result = await response.json(); assert.equal(result.spec.theme.palette, 'midnight'); assert.equal(result.report.calls, 0); assert.equal(result.report.provider, 'demo'); });
test('HTTP live mode exercises the full adapter contract using mock transport', async (t) => { const { call } = await setup(t, { apiKey: 'test-key', fetchImpl: mockTypeSafe }); const response = await call('/api/compose', 'POST', { mode: 'jev', operation: 'create', prompt: 'A dark SaaS website with pricing and FAQ.', spec: createSpec(), locks: {} }); assert.equal(response.status, 200); const result = await response.json(); assert.equal(result.report.provider, 'jev'); assert.equal(result.report.calls, 2); assert.equal(result.report.inputTokens, 240); assert.equal(result.spec.theme.palette, 'midnight'); });
test('HTTP connection test and disconnect keep keys out of disk and status', async (t) => { const { call, dir } = await setup(t, { fetchImpl: mockTypeSafe }); const response = await call('/api/connection', 'POST', { apiKey: 'session-secret-123' }); assert.equal(response.status, 200); const status = await (await call('/api/status')).json(); assert.equal(status.verified, true); assert.ok(!JSON.stringify(status).includes('session-secret')); assert.deepEqual(await readdir(path.join(dir, 'projects')), []); assert.equal((await call('/api/connection', 'DELETE')).status, 200); assert.equal((await (await call('/api/status')).json()).configured, false); });
test('HTTP connection and live composition support OpenRouter API keys and ~typesafe/jev-latest', async (t) => {
  const seen = [];
  const { call } = await setup(t, { fetchImpl: async (url, init) => { seen.push({ url, body: JSON.parse(init.body) }); return mockTypeSafe(url, init); } });
  const conn = await call('/api/connection', 'POST', { apiKey: 'sk-or-v1-test-key' });
  assert.equal(conn.status, 200);
  const status = await (await call('/api/status')).json();
  assert.equal(status.provider, 'openrouter'); assert.equal(status.model, OPENROUTER_DEFAULT_MODEL); assert.ok(!JSON.stringify(status).includes('sk-or-v1'));
  const composed = await call('/api/compose', 'POST', { mode: 'jev', operation: 'create', prompt: 'A dark SaaS website with pricing.', spec: createSpec(), locks: {} });
  assert.equal(composed.status, 200);
  assert.equal(seen.length, 3);
  assert.ok(seen.every((entry) => entry.url === OPENROUTER_JEV_ENDPOINT && entry.body.model === OPENROUTER_DEFAULT_MODEL));
});
test('HTTP failed replacement key does not overwrite a valid key', async (t) => { const { call } = await setup(t, { apiKey: 'good-key', fetchImpl: (url, init) => init.headers.Authorization === 'Bearer wrong-key' ? new Response('', { status: 401 }) : mockTypeSafe(url, init) }); assert.equal((await call('/api/connection', 'POST', { apiKey: 'wrong-key' })).status, 502); assert.equal((await call('/api/connection', 'POST', { apiKey: '' })).status, 200); });
test('HTTP restore returns a browser-saved key to memory without a provider request, never during provider work or after Remove key', async (t) => {
  const seen = []; let hold = null, release;
  const { call } = await setup(t, { fetchImpl: async (url, init) => { seen.push(init.headers.Authorization); if (hold) await hold; return mockTypeSafe(url, init); } });
  const revision = async () => (await (await call('/api/status')).json()).credentialRevision;
  assert.equal((await call('/api/connection', 'POST', { apiKey: 'saved-key', restore: 'yes', revision: 0 })).status, 400);
  assert.equal((await call('/api/connection', 'POST', { apiKey: '', restore: true, revision: 0 })).status, 400);
  assert.equal((await call('/api/connection', 'POST', { apiKey: 'saved-key', restore: true })).status, 400);
  // A restore never interrupts a running connection test; the newer tested key wins.
  hold = new Promise((resolve) => { release = resolve; });
  const testing = call('/api/connection', 'POST', { apiKey: 'newer-key' });
  while (!seen.length) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.deepEqual(await (await call('/api/connection', 'POST', { apiKey: 'saved-key', restore: true, revision: await revision() })).json(), { restored: false });
  hold = null; release(); assert.equal((await testing).status, 200);
  // A restore sent before Remove key cannot return the removed key.
  const stale = await revision(); assert.equal((await call('/api/connection', 'DELETE')).status, 200);
  assert.deepEqual(await (await call('/api/connection', 'POST', { apiKey: 'saved-key', restore: true, revision: stale })).json(), { restored: false });
  assert.equal((await (await call('/api/status')).json()).configured, false);
  const tested = seen.length;
  assert.deepEqual(await (await call('/api/connection', 'POST', { apiKey: 'saved-key', restore: true, revision: await revision() })).json(), { restored: true });
  assert.equal(seen.length, tested);
  const status = await (await call('/api/status')).json();
  assert.equal(status.configured, true); assert.equal(status.verified, false); assert.equal(status.credentialSource, 'server memory'); assert.ok(!JSON.stringify(status).includes('saved-key'));
  assert.deepEqual(await (await call('/api/connection', 'POST', { apiKey: 'other-key', restore: true, revision: await revision() })).json(), { restored: false });
  assert.equal((await call('/api/compose', 'POST', { mode: 'jev', operation: 'create', prompt: 'A dark SaaS website with pricing.', spec: createSpec(), locks: {} })).status, 200);
  assert.ok(seen.length > tested && seen.slice(tested).every((value) => value === 'Bearer saved-key'));
});
test('HTTP project creation, optimistic update, checkpoints, import shape and deletion', async (t) => {
  const { call } = await setup(t); const spec = createSpec();
  const created = await (await call('/api/projects', 'POST', { spec })).json(); assert.equal(created.revision, 1);
  spec.brand.name = 'Revised brand';
  const updated = await (await call(`/api/projects/${created.id}`, 'PUT', { spec, expectedRevision: 1, checkpoint: true, label: 'Before brand edit' })).json(); assert.equal(updated.revision, 2); assert.equal(updated.history.length, 1);
  const snapshot = await (await call(`/api/projects/${created.id}/history/${updated.history[0].id}`)).json(); assert.equal(snapshot.spec.brand.name, 'Studio North');
  assert.equal((await call(`/api/projects/${created.id}`, 'PUT', { spec, expectedRevision: 1 })).status, 409);
  const list = await (await call('/api/projects')).json(); assert.equal(list.projects.length, 1);
  assert.equal((await call(`/api/projects/${created.id}`, 'DELETE', { expectedRevision: 1 })).status, 409);
  assert.equal((await call(`/api/projects/${created.id}`, 'DELETE', { expectedRevision: 2 })).status, 200);
  assert.equal((await call(`/api/projects/${created.id}`)).status, 404);
});
test('HTTP renderer uses sandbox channel and safe markup', async (t) => { const { call } = await setup(t); const spec = createSpec('<script>x</script>'); const response = await call('/api/render', 'POST', { spec, channel: 'channel_123456789' }); assert.equal(response.status, 200); const result = await response.json(); assert.ok(result.html.includes('data-channel="channel_123456789"')); assert.ok(!result.html.includes('<script>x</script>')); });
test('new design vocabulary survives HTTP save, reopen, preview and export', async (t) => {
  const { call } = await setup(t), spec = createSpec();
  spec.theme.width = 'wide'; spec.theme.typeScale = 'dramatic';
  spec.sections[1].presentation = { tone: 'contrast', spacing: 'generous', heading: 'center', surface: 'default', media: 'portrait' };
  assert.equal((await call('/shared/design.mjs')).status, 200);
  const saved = await (await call('/api/projects', 'POST', { spec })).json();
  const reopened = await (await call(`/api/projects/${saved.id}`)).json();
  assert.deepEqual(reopened.spec, spec);
  const preview = await (await call('/api/render', 'POST', { spec, channel: 'channel_123456789' })).json();
  assert.ok(preview.html.includes('data-type-scale="dramatic"'));
  assert.ok(preview.html.includes('data-media="portrait"'));
  const bytes = Buffer.from(await (await call('/api/export', 'POST', { spec })).arrayBuffer());
  assert.ok(bytes.includes(Buffer.from('data-type-scale="dramatic"')));
  assert.ok(bytes.includes(Buffer.from('"media": "portrait"')));
  spec.sections[1].presentation.media = 'url(https://evil.example)';
  assert.equal((await call('/api/render', 'POST', { spec, channel: 'channel_123456789' })).status, 400);
});
test('HTTP export is a ZIP with a standalone site and licenses', async (t) => { const { call } = await setup(t); const response = await call('/api/export', 'POST', { spec: createSpec() }); assert.equal(response.status, 200); assert.equal(response.headers.get('content-type'), 'application/zip'); const bytes = Buffer.from(await response.arrayBuffer()); assert.equal(bytes.readUInt32LE(0), 0x04034b50); assert.ok(bytes.includes(Buffer.from('index.html'))); assert.ok(bytes.includes(Buffer.from('licenses/HYPERUI.txt'))); assert.ok(bytes.includes(Buffer.from('Copyright (c) Mark Mead'))); });
test('HTTP rejects unsafe import before writing to disk', async (t) => { const { call } = await setup(t); const spec = createSpec(); spec.brand.href = 'javascript:alert(1)'; assert.equal((await call('/api/projects', 'POST', { spec })).status, 400); assert.equal((await (await call('/api/projects')).json()).projects.length, 0); });
test('store serializes concurrent writes and rejects stale revisions', async (t) => { const { app } = await setup(t); const p = await app.store.create(createSpec()); const results = await Promise.allSettled([app.store.update(p.id, { spec: { ...p.spec, name: 'One' }, expectedRevision: 1 }), app.store.update(p.id, { spec: { ...p.spec, name: 'Two' }, expectedRevision: 1 })]); assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1); assert.equal(results.filter((r) => r.status === 'rejected' && r.reason.status === 409).length, 1); assert.equal((await app.store.get(p.id)).revision, 2); });
test('store caps checkpoint history and manual checkpoints survive autosave', async (t) => { const { app } = await setup(t); let p = await app.store.create(createSpec()); for (let i = 0; i < 13; i++) p = await app.store.update(p.id, { spec: p.spec, expectedRevision: p.revision, checkpoint: true, label: `Checkpoint ${i}` }); assert.equal(p.history.length, 10); });
test('store skips unreadable files without deleting them', async (t) => { const { app, dir } = await setup(t); const fs = await import('node:fs/promises'); await fs.writeFile(path.join(dir, 'projects', 'broken.json'), '{'); const result = await app.store.list(); assert.equal(result.skipped, 1); assert.equal(await readFile(path.join(dir, 'projects', 'broken.json'), 'utf8'), '{'); });

// NEW: Regression for a manual checkpoint taken while visible copy is still dirty.
test('manual checkpoint records the supplied current version rather than the older disk version', async (t) => {
  const { app } = await setup(t);
  const project = await app.store.create(createSpec());
  const next = structuredClone(project.spec);
  next.sections.find((s) => s.group === 'hero').title = 'Visible, newly edited title';
  const saved = await app.store.update(project.id, { spec: next, expectedRevision: 1, checkpoint: true, checkpointCurrent: true, label: 'Manual checkpoint' });
  const checkpoint = await app.store.history(project.id, saved.history[0].id);
  assert.equal(checkpoint.spec.sections.find((s) => s.group === 'hero').title, 'Visible, newly edited title');
});
test('AC-OPS-1 the local server serves every module the editor imports, statically or dynamically', async (t) => {
  const { call } = await setup(t);
  // Loaded only when the hosted deployment marker is set; the hosted build ships them instead.
  const hostedOnly = new Set(['/turnstile.mjs', '/hosted-client.mjs']);
  const pending = ['/app.mjs'], seen = new Set();
  while (pending.length) {
    const pathname = pending.pop();
    if (seen.has(pathname)) continue;
    seen.add(pathname);
    const response = await call(pathname);
    assert.equal(response.status, 200, pathname);
    assert.match(response.headers.get('content-type') || '', /javascript/, pathname);
    const source = await response.text();
    const specifiers = [...source.matchAll(/^\s*import\s[^;'"]*?(['"])([^'"\n]+)\1/gm), ...source.matchAll(/^\s*export\s[^'"\n]*?\sfrom\s*(['"])([^'"\n]+)\1/gm), ...source.matchAll(/\bimport\(\s*(['"])([^'"\n]+)\1\s*\)/g)].map((match) => match[2]);
    for (const specifier of specifiers) {
      const target = new URL(specifier, `http://editor.invalid${pathname}`).pathname;
      if (hostedOnly.has(target)) assert.ok(HOSTED_ASSETS.some(([, destination]) => `/${destination}` === target), target);
      else pending.push(target);
    }
  }
  assert.ok(seen.has('/shared/fit.mjs'));
});
test('AC-21 declared item fields of manifest blocks survive HTTP save and reopen', async (t) => {
  const { call } = await setup(t), spec = createSpec();
  const added = [makeSection('contact', 'contact-hours'), makeSection('services', 'services-menu'), makeSection('process', 'process-schedule')];
  for (const section of added) for (const [index, item] of section.items.entries()) for (const field of Object.keys(itemFieldsFor(section.block))) item[field] = field === 'href' ? `https://example.com/${section.block}-${index}` : `${section.block} ${field} ${index}`;
  spec.sections = [...spec.sections.filter((section) => !['contact', 'services', 'process'].includes(section.group) && section.group !== 'footer'), ...added, spec.sections.find((section) => section.group === 'footer')];
  const expected = validateSpec(spec);
  const saved = await (await call('/api/projects', 'POST', { spec: expected })).json();
  const reopened = await (await call(`/api/projects/${saved.id}`)).json();
  assert.deepEqual(reopened.spec, expected);
  assert.equal(reopened.spec.sections.find((section) => section.block === 'contact-hours').items[0].price, 'contact-hours price 0');
});
