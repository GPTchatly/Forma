import test from 'node:test';
import assert from 'node:assert/strict';
import { createHostedClient } from '../public/hosted-client.mjs';
import { createSpec } from '../shared/content.mjs';
import { validateSpec } from '../shared/schema.mjs';
import { IMAGE_PLACEHOLDER } from '../shared/compose-transport.mjs';
import { paddedPng } from './fixtures/images.mjs';
import { compose } from '../server/composer.mjs';
import { demoEvaluate } from '../server/demo.mjs';

const bootstrap = { deployment: 'hosted', csrfToken: 'a'.repeat(43), version: '0.3.0', catalogSize: 40 };
const connected = () => Response.json({ verified: true, model: '~typesafe/jev-latest', provider: 'openrouter', usage: { input_tokens: 1 } });
const connection = (apiKey = 'sk-or-test-example') => ({ method: 'POST', data: { apiKey } });
const design = () => ({ spec: createSpec(), prompt: 'Keep this design', mode: 'jev', operation: 'edit', locks: {} });
const allowance = (remaining = 10, values = {}) => ({ available: remaining >= 2, remaining, limit: 10, resetAt: Date.now() + 86400000, ...(remaining < 2 ? { reason: 'exhausted' } : {}), ...values });

test('hosted key is retained only after successful test, survives bootstrap refresh and is attached only to live requests', async () => {
  const calls = [];
  const client = createHostedClient({ fetchImpl: async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) });
    return url === '/api/connection' ? connected() : Response.json({ spec: JSON.parse(options.body).spec, report: {}, warnings: [] });
  } });
  assert.equal(client.setBootstrap(bootstrap).configured, false);
  const testResult = await client.request('/api/connection', connection());
  assert.equal(testResult.verified, true);
  assert.equal(client.setBootstrap({ ...bootstrap, configured: false, verified: false, apiKey: 'must-not-be-retained' }).verified, true);
  assert.equal(JSON.stringify(client.status()).includes('sk-or-test-example'), false);
  assert.equal(JSON.stringify(client.status()).includes('must-not-be-retained'), false);
  const input = design(); input.spec.sections.find((section) => section.group === 'hero').image = paddedPng(150);
  const output = await client.request('/api/compose', { method: 'POST', data: input });
  assert.equal(output.spec.sections.find((section) => section.group === 'hero').image, input.spec.sections.find((section) => section.group === 'hero').image);
  assert.equal(calls[1].body.spec.sections.find((section) => section.group === 'hero').image, IMAGE_PLACEHOLDER);
  for (const { options, body } of calls) {
    assert.equal(body.apiKey, 'sk-or-test-example');
    assert.equal(options.headers['X-CSRF-Token'], bootstrap.csrfToken);
    assert.equal(options.headers['X-Forma-Token'], undefined);
    assert.equal(options.credentials, 'same-origin');
    assert.equal(options.redirect, 'error');
    assert.equal(options.cache, 'no-store');
    assert.ok(options.signal instanceof AbortSignal);
  }
  const reloaded = createHostedClient();
  assert.equal(reloaded.setBootstrap(bootstrap).configured, false);
  await assert.rejects(reloaded.request('/api/compose', { method: 'POST', data: design() }), (error) => error.status === 428);
});

test('hosted project, checkpoint, render and export operations never use fetch', async () => {
  const calls = [];
  const projects = Object.fromEntries(['list', 'create', 'get', 'update', 'delete', 'history'].map((name) => [name, async (...args) => { calls.push([name, ...args]); return name; }]));
  const client = createHostedClient({ projects, fetchImpl: () => assert.fail('Browser-owned data must not reach the hosted server'), render: async (data) => { calls.push(['render', data]); return 'render'; }, exportSite: async (data) => { calls.push(['export', data]); return 'export'; } });
  client.setBootstrap(bootstrap);
  const spec = createSpec();
  assert.equal(await client.request('/api/projects'), 'list');
  assert.equal(await client.request('/api/projects', { method: 'POST', data: { spec } }), 'create');
  assert.equal(await client.request('/api/projects/project-one'), 'get');
  assert.equal(await client.request('/api/projects/project-one', { method: 'PUT', data: { spec, expectedRevision: 1 } }), 'update');
  assert.deepEqual(await client.request('/api/projects/project-one', { method: 'DELETE', data: { expectedRevision: 2 } }), { deleted: true });
  assert.equal(await client.request('/api/projects/project-one/history/snapshot-one'), 'history');
  assert.equal(await client.request('/api/render', { method: 'POST', data: { spec } }), 'render');
  assert.equal(await client.request('/api/export', { method: 'POST', data: { spec } }), 'export');
  assert.deepEqual(calls.map(([name]) => name), ['list', 'create', 'get', 'update', 'delete', 'history', 'render', 'export']);
  assert.deepEqual(calls[4], ['delete', 'project-one', 2]);
  assert.deepEqual(calls[5], ['history', 'project-one', 'snapshot-one']);
  await assert.rejects(client.request('/api/shutdown', { method: 'POST' }), (error) => error.status === 404);
});

test('offline demo uses the real local rules and makes no provider fetch', async () => {
  const client = createHostedClient({ fetchImpl: () => assert.fail('Demo must not fetch'), loadDemo: async () => [{ compose }, { demoEvaluate }] });
  const output = await client.request('/api/compose', { method: 'POST', data: { ...design(), mode: 'demo' } });
  assert.equal(output.report.provider, 'demo');
  assert.equal(output.report.calls, 0);
  assert.deepEqual(output.spec, validateSpec(output.spec));
  assert.equal(client.status().configured, false);
});

test('failed connection test never retains the supplied key', async () => {
  const client = createHostedClient({ fetchImpl: async () => Response.json({ error: 'Provider rejected the key.' }, { status: 401 }) });
  client.setBootstrap(bootstrap);
  await assert.rejects(client.request('/api/connection', connection()), (error) => error.status === 401);
  assert.equal(client.status().configured, false);
  assert.equal(client.status().verified, false);
  await assert.rejects(client.request('/api/compose', { method: 'POST', data: design() }), (error) => error.status === 428);
});

test('disconnect aborts a pending connection test and ignores a late successful response', async () => {
  let release, captured;
  const pending = new Promise((resolve) => { release = resolve; });
  const client = createHostedClient({ fetchImpl: async (_url, options) => { captured = options; await pending; return connected(); } });
  client.setBootstrap(bootstrap);
  const checking = client.request('/api/connection', connection());
  await client.request('/api/connection', { method: 'DELETE' });
  assert.equal(captured.signal.aborted, true);
  release();
  await assert.rejects(checking, { name: 'AbortError' });
  assert.equal(client.setBootstrap(bootstrap).configured, false);
});

test('disconnect aborts active composition without replacing the canvas from a late response', async () => {
  let release, captured;
  const pending = new Promise((resolve) => { release = resolve; });
  const client = createHostedClient({ fetchImpl: async (url, options) => {
    if (url === '/api/connection') return connected();
    captured = options; await pending;
    return Response.json({ spec: createSpec('Stale result') });
  } });
  client.setBootstrap(bootstrap);
  await client.request('/api/connection', connection());
  const building = client.request('/api/compose', { method: 'POST', data: design() });
  await client.request('/api/connection', { method: 'DELETE' });
  assert.equal(captured.signal.aborted, true);
  release();
  await assert.rejects(building, { name: 'AbortError' });
  assert.equal(client.status().configured, false);
});

test('superseded connection tests cannot restore an older key', async () => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const sent = [];
  const client = createHostedClient({ fetchImpl: async (url, options) => {
    const data = JSON.parse(options.body); sent.push(data.apiKey);
    if (data.apiKey === 'sk-or-old-key') await pending;
    return url === '/api/connection' ? connected() : Response.json({ spec: data.spec });
  } });
  client.setBootstrap(bootstrap);
  const old = client.request('/api/connection', connection('sk-or-old-key'));
  await client.request('/api/connection', connection('sk-or-new-key'));
  release();
  await assert.rejects(old, { name: 'AbortError' });
  await client.request('/api/compose', { method: 'POST', data: design() });
  assert.deepEqual(sent, ['sk-or-old-key', 'sk-or-new-key', 'sk-or-new-key']);
});

test('invalid bootstrap, invalid key and already-aborted requests fail before fetch', async () => {
  const client = createHostedClient({ fetchImpl: () => assert.fail('Invalid request must not fetch') });
  for (const value of [{}, { ...bootstrap, deployment: 'local' }, { ...bootstrap, csrfToken: '' }, { ...bootstrap, csrfToken: 'not a token' }]) assert.throws(() => client.setBootstrap(value));
  client.setBootstrap(bootstrap);
  for (const key of ['', 'has whitespace', 'x'.repeat(513), '\u0000key']) await assert.rejects(client.request('/api/connection', connection(key)));
  await assert.rejects(client.request('/api/connection', { ...connection(), signal: AbortSignal.abort() }), { name: 'AbortError' });
});

test('replacement verification blocks live composition until the new key is active', async () => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; }), sent = [];
  const client = createHostedClient({ fetchImpl: async (url, options) => {
    const data = JSON.parse(options.body); sent.push({ url, key: data.apiKey });
    if (url === '/api/connection' && data.apiKey === 'replacement-key') await pending;
    return url === '/api/connection' ? connected() : Response.json({ spec: data.spec });
  } });
  client.setBootstrap(bootstrap);
  await client.request('/api/connection', connection('previous-key'));
  const replacement = client.request('/api/connection', connection('replacement-key'));
  assert.equal(client.status().testing, true);
  await assert.rejects(client.request('/api/compose', { method: 'POST', data: design() }), (error) => error.status === 409);
  assert.equal(sent.length, 2, 'No composition using the previous key was transmitted');
  release(); await replacement;
  assert.equal(client.status().testing, false);
  await client.request('/api/compose', { method: 'POST', data: design() });
  assert.deepEqual(sent.at(-1), { url: '/api/compose', key: 'replacement-key' });
});

test('a failed replacement releases only its own lock and preserves the previous verified connection', async () => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; }), sent = [];
  const client = createHostedClient({ fetchImpl: async (url, options) => {
    const data = JSON.parse(options.body); sent.push(data.apiKey);
    if (data.apiKey === 'invalid-replacement') { await pending; return Response.json({ error: 'Provider rejected this key.' }, { status: 401 }); }
    return url === '/api/connection' ? connected() : Response.json({ spec: data.spec });
  } });
  client.setBootstrap(bootstrap);
  await client.request('/api/connection', connection('previous-key'));
  const replacement = client.request('/api/connection', connection('invalid-replacement'));
  await assert.rejects(client.request('/api/compose', { method: 'POST', data: design() }), (error) => error.status === 409);
  release(); await assert.rejects(replacement, (error) => error.status === 401);
  assert.equal(client.status().testing, false);
  assert.equal(client.status().configured, true);
  assert.equal(client.status().verified, true);
  await client.request('/api/compose', { method: 'POST', data: design() });
  assert.deepEqual(sent, ['previous-key', 'invalid-replacement', 'previous-key']);
});

test('cancelled older tests and disconnect cannot unlock or restore a newer pending test', async () => {
  const releases = new Map(), pending = new Map();
  for (const key of ['first-pending', 'second-pending', 'after-disconnect']) pending.set(key, new Promise((resolve) => { releases.set(key, resolve); }));
  const client = createHostedClient({ fetchImpl: async (_url, options) => { await pending.get(JSON.parse(options.body).apiKey); return connected(); } });
  client.setBootstrap(bootstrap);
  const first = client.request('/api/connection', connection('first-pending'));
  const second = client.request('/api/connection', connection('second-pending'));
  releases.get('first-pending')(); await assert.rejects(first, { name: 'AbortError' });
  assert.equal(client.status().testing, true);
  await assert.rejects(client.request('/api/compose', { method: 'POST', data: design() }), (error) => error.status === 409);
  await client.request('/api/connection', { method: 'DELETE' });
  assert.equal(client.status().testing, false);
  assert.equal(client.status().configured, false);
  const third = client.request('/api/connection', connection('after-disconnect'));
  releases.get('second-pending')(); await assert.rejects(second, { name: 'AbortError' });
  assert.equal(client.status().testing, true);
  await assert.rejects(client.request('/api/compose', { method: 'POST', data: design() }), (error) => error.status === 409);
  releases.get('after-disconnect')(); await third;
  assert.equal(client.status().testing, false);
  assert.equal(client.status().configured, true);
});

test('free composition omits personal credentials and shows only server-returned remaining calls', async () => {
  const sent = [], updated = allowance(9);
  const client = createHostedClient({ fetchImpl: async (url, options) => {
    const data = JSON.parse(options.body); sent.push({ url, data });
    return Response.json({ spec: data.spec, freeAllowance: updated });
  } });
  const status = client.setBootstrap({ ...bootstrap, provider: 'openrouter', model: '~typesafe/jev-latest', freeAllowance: allowance() });
  assert.equal(status.configured, true); assert.equal(status.personalKeyConfigured, false); assert.equal(status.verified, false);
  assert.equal(status.provider, 'openrouter'); assert.equal(status.credentialSource, 'free allowance');
  await client.request('/api/compose', { method: 'POST', data: design() });
  assert.equal(sent.length, 1);
  assert.equal(Object.hasOwn(sent[0].data, 'apiKey'), false);
  assert.equal(Object.hasOwn(sent[0].data, 'credentialSource'), false);
  assert.deepEqual(client.status().freeAllowance, updated, 'The client does not assume two calls were charged');
  assert.equal(client.status().verified, false, 'Free access does not claim a personal key was verified');
  assert.equal(client.status().personalKeyConfigured, false);
});

test('personal key explicitly overrides free access and disconnect restores the current free allowance', async () => {
  const free = allowance(6), sent = [];
  const client = createHostedClient({ fetchImpl: async (url, options) => {
    const data = JSON.parse(options.body); sent.push(data);
    return url === '/api/connection' ? connected() : Response.json({ spec: data.spec, freeAllowance: free });
  } });
  client.setBootstrap({ ...bootstrap, freeAllowance: free });
  await assert.rejects(client.request('/api/connection', connection('')), (error) => error.status === 400);
  assert.equal(sent.length, 0, 'The operator key cannot be tested through the personal connection form');
  await client.request('/api/connection', connection());
  await client.request('/api/compose', { method: 'POST', data: design() });
  assert.equal(sent.at(-1).apiKey, 'sk-or-test-example');
  assert.equal(client.status().personalKeyConfigured, true);
  assert.deepEqual(client.status().freeAllowance, free);
  await client.request('/api/connection', { method: 'DELETE' });
  assert.equal(client.status().personalKeyConfigured, false); assert.equal(client.status().configured, true);
  assert.deepEqual(client.status().freeAllowance, free);
  await client.request('/api/compose', { method: 'POST', data: design() });
  assert.equal(Object.hasOwn(sent.at(-1), 'apiKey'), false);
  const reloaded = createHostedClient();
  assert.equal(reloaded.setBootstrap({ ...bootstrap, freeAllowance: free }).freeAllowance.remaining, 6);
});

test('free limit and unavailable responses update allowance and never retry another credential source', async () => {
  for (const [code, remaining, reason] of [['free_limit', 0, 'exhausted'], ['free_unavailable', 8, 'credits']]) {
    let calls = 0;
    const updated = allowance(remaining, { available: false, reason });
    const client = createHostedClient({ fetchImpl: async () => { calls++; return Response.json({ error: 'Use your own key to continue.', code, freeAllowance: updated }, { status: code === 'free_limit' ? 429 : 503 }); } });
    client.setBootstrap({ ...bootstrap, freeAllowance: allowance() });
    await assert.rejects(client.request('/api/compose', { method: 'POST', data: design() }), (error) => error.code === code && error.freeAllowance.remaining === remaining);
    assert.equal(calls, 1); assert.equal(client.status().configured, false);
    assert.deepEqual(client.status().freeAllowance, updated);
    await assert.rejects(client.request('/api/compose', { method: 'POST', data: design() }), (error) => error.code === code);
    assert.equal(calls, 1, 'Known unavailable free access is not retried');
  }
});

test('insufficient or malformed free allowance cannot enable a provider request', async () => {
  const client = createHostedClient({ fetchImpl: () => assert.fail('Invalid allowance must not reach a provider') });
  for (const free of [undefined, allowance(0), allowance(1), allowance(10, { available: false, reason: 'unconfigured' }), allowance(11), allowance(-1), allowance(10, { limit: 100 }), allowance(10, { available: 'true' }), allowance(10, { resetAt: 'tomorrow' })]) {
    const state = client.setBootstrap({ ...bootstrap, freeAllowance: free });
    assert.equal(state.configured, false);
    state.freeAllowance.available = true; state.freeAllowance.remaining = 10;
    assert.equal(client.status().configured, false, 'Returned UI status cannot mutate authoritative client state');
    await assert.rejects(client.request('/api/compose', { method: 'POST', data: design() }), (error) => error.status === 428);
  }
});

test('personal provider failure is not retried using available free calls', async () => {
  let calls = 0;
  const client = createHostedClient({ fetchImpl: async (url) => {
    calls++;
    return url === '/api/connection' ? connected() : Response.json({ error: 'Personal provider request failed.', code: 'provider', freeAllowance: allowance(10) }, { status: 503 });
  } });
  client.setBootstrap({ ...bootstrap, freeAllowance: allowance() });
  await client.request('/api/connection', connection());
  await assert.rejects(client.request('/api/compose', { method: 'POST', data: design() }), (error) => error.code === 'provider');
  assert.equal(calls, 2); assert.equal(client.status().personalKeyConfigured, true);
  assert.equal(client.status().freeAllowance.remaining, 10);
});

test('a status response requested before a newer charge cannot restore an older allowance', async () => {
  let releaseStatus, statusCalls = 0;
  const statusPending = new Promise((resolve) => { releaseStatus = resolve; });
  const sent = [];
  const client = createHostedClient({ fetchImpl: async (url, options) => {
    if (url === '/api/status') { statusCalls++; await statusPending; return Response.json({ ...bootstrap, csrfToken: 'b'.repeat(43), freeAllowance: allowance(10) }); }
    sent.push(options.headers['X-CSRF-Token']);
    return Response.json({ spec: JSON.parse(options.body).spec, freeAllowance: allowance(8) });
  } });
  client.setBootstrap({ ...bootstrap, freeAllowance: allowance(10) });
  const first = client.refreshStatus(), second = client.refreshStatus();
  assert.equal(first, second, 'Concurrent refreshes in one generation share one request');
  await client.request('/api/compose', { method: 'POST', data: design() });
  assert.equal(client.status().freeAllowance.remaining, 8);
  releaseStatus();
  await first;
  assert.equal(statusCalls, 1);
  assert.equal(client.status().freeAllowance.remaining, 8, 'The older snapshot is discarded, not merged with min()');
  await client.request('/api/compose', { method: 'POST', data: design() });
  assert.equal(sent.at(-1), 'b'.repeat(43), 'The late response still supplies the session token its cookie paired with');
});

test('session bootstrap reads never overlap, so the token always pairs with the stored cookie', async () => {
  let cookie = '', statusCalls = 0, releaseHeaders, releaseBody;
  const headers = new Promise((resolve) => { releaseHeaders = resolve; }), body = new Promise((resolve) => { releaseBody = resolve; });
  const tokenFor = (session) => session.padEnd(43, 'x');
  const sent = [];
  const client = createHostedClient({ fetchImpl: async (url, options) => {
    if (url !== '/api/status') { sent.push(options.headers['X-CSRF-Token'] === tokenFor(cookie)); return url === '/api/connection' ? connected() : Response.json({ spec: JSON.parse(options.body).spec }); }
    const call = ++statusCalls, session = cookie || `session${call}`;
    await headers;
    // The browser stores Set-Cookie when headers arrive; the token comes with the body.
    cookie = session;
    return { ok: true, status: 200, json: async () => { if (call === 1) await body; return { ...bootstrap, csrfToken: tokenFor(session), freeAllowance: allowance(10) }; } };
  } });
  const startup = client.refreshStatus();
  const connecting = client.request('/api/connection', connection());
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(statusCalls, 1, 'A newer bootstrap waits for the older read');
  releaseHeaders();
  await new Promise((resolve) => setTimeout(resolve, 0));
  releaseBody();
  await startup;
  await connecting;
  await client.request('/api/compose', { method: 'POST', data: design() });
  assert.equal(statusCalls, 2);
  assert.deepEqual(sent, [true, true]);
});

test('a refresh started after the newest charge accepts a legitimate increase and preserves reset time', async () => {
  const resetAt = Date.UTC(2026, 9, 1);
  let status = allowance(10, { resetAt: resetAt + 86400000 });
  const client = createHostedClient({ fetchImpl: async (url, options) => url === '/api/status' ? Response.json({ ...bootstrap, freeAllowance: status }) : Response.json({ spec: JSON.parse(options.body).spec, freeAllowance: allowance(2, { resetAt }) }) });
  client.setBootstrap({ ...bootstrap, freeAllowance: allowance(4, { resetAt }) });
  await client.request('/api/compose', { method: 'POST', data: design() });
  assert.deepEqual(client.status().freeAllowance, allowance(2, { resetAt }));
  await client.refreshStatus();
  assert.deepEqual(client.status().freeAllowance, status, 'A new UTC day is accepted with its own reset time');
  status = allowance(10, { available: false, reason: 'resetting', resetAt });
  await client.refreshStatus();
  assert.equal(client.status().freeAllowance.reason, 'resetting');
  await assert.rejects(client.request('/api/compose', { method: 'POST', data: design() }), (error) => error.status === 428 && error.code === 'free_paused' && error.freeAllowance.resetAt === resetAt);
});

test('browser projects, preview, export and demo work while the hosted API is unavailable', async () => {
  const fetched = [];
  const projects = Object.fromEntries(['list', 'create', 'get', 'update', 'delete', 'history'].map((name) => [name, async () => name]));
  const client = createHostedClient({ projects, render: async () => 'render', exportSite: async () => 'export', loadDemo: async () => [{ compose }, { demoEvaluate }], fetchImpl: async (url) => { fetched.push(url); throw new TypeError('Failed to fetch'); } });
  assert.equal(client.status().service, 'checking');
  assert.equal(client.status().configured, false);
  await assert.rejects(client.refreshStatus(), TypeError);
  assert.equal(client.status().service, 'unavailable');
  const spec = createSpec();
  assert.equal(await client.request('/api/projects'), 'list');
  assert.equal(await client.request('/api/projects/project-one', { method: 'PUT', data: { spec, expectedRevision: 1 } }), 'update');
  assert.equal(await client.request('/api/render', { method: 'POST', data: { spec } }), 'render');
  assert.equal(await client.request('/api/export', { method: 'POST', data: { spec } }), 'export');
  assert.deepEqual(fetched, ['/api/status']);
  await assert.rejects(client.request('/api/compose', { method: 'POST', data: design() }), (error) => error.status === 503 && error.code === 'service_unavailable');
  assert.deepEqual(fetched, ['/api/status', '/api/status'], 'An explicit build retries the session once and never sends compose');
  const demo = await client.request('/api/compose', { method: 'POST', data: { ...design(), mode: 'demo' } });
  assert.equal(demo.report.provider, 'demo', 'The demo is explicit, not an automatic fallback');
  assert.equal(fetched.length, 2);
});

test('a failed status refresh keeps the last confirmed allowance and session', async () => {
  let fail = true;
  const client = createHostedClient({ fetchImpl: async (url) => {
    if (url === '/api/status' && fail) return Response.json({ error: 'busy', code: 'rate_limited' }, { status: 429 });
    return Response.json({ ...bootstrap, freeAllowance: allowance(4) });
  } });
  client.setBootstrap({ ...bootstrap, freeAllowance: allowance(6) });
  await assert.rejects(client.refreshStatus(), (error) => error.status === 429);
  assert.equal(client.status().service, 'ready');
  assert.equal(client.status().freeAllowance.remaining, 6);
  fail = false;
  await client.refreshStatus();
  assert.equal(client.status().freeAllowance.remaining, 4);
});

test('server verification refusal blocks the next personal-key build without another request', async () => {
  for (const code of ['verification_required', 'credentials']) {
    const sent = [];
    const client = createHostedClient({ fetchImpl: async (url) => { sent.push(url); return url === '/api/connection' ? connected() : Response.json({ error: 'Test this API key again.', code }, { status: code === 'credentials' ? 502 : 428 }); } });
    client.setBootstrap(bootstrap);
    await client.request('/api/connection', connection());
    await assert.rejects(client.request('/api/compose', { method: 'POST', data: design() }), (error) => error.code === code);
    assert.equal(client.status().verified, false);
    await assert.rejects(client.request('/api/compose', { method: 'POST', data: design() }), (error) => error.status === 428 && error.code === 'verification_required');
    assert.deepEqual(sent, ['/api/connection', '/api/compose'], code);
    await client.request('/api/connection', connection());
    assert.equal(client.status().verified, true);
  }
});

test('a browser-saved key is restored without a request and a server refusal requires a new test', async () => {
  const restore = (apiKey) => ({ method: 'POST', data: { apiKey, restore: true } });
  const sent = [];
  const client = createHostedClient({ fetchImpl: async (url, options) => { sent.push(JSON.parse(options.body).apiKey); return Response.json({ spec: JSON.parse(options.body).spec, report: {}, warnings: [] }); } });
  client.setBootstrap(bootstrap);
  await assert.rejects(client.request('/api/connection', restore('bad key')), (error) => error.status === 400);
  assert.deepEqual(await client.request('/api/connection', restore('sk-or-saved-example')), { restored: true });
  assert.deepEqual(sent, []);
  const { personalKeyConfigured, verified, provider } = client.status();
  assert.deepEqual({ personalKeyConfigured, verified, provider }, { personalKeyConfigured: true, verified: false, provider: 'openrouter' });
  assert.deepEqual(await client.request('/api/connection', restore('sk-or-other-example')), { restored: false });
  await client.request('/api/compose', { method: 'POST', data: design() });
  assert.deepEqual(sent, ['sk-or-saved-example']);
  assert.equal(client.status().verified, true);
  await client.request('/api/connection', { method: 'DELETE' });
  assert.equal(client.status().personalKeyConfigured, false);

  const refusedUrls = [];
  const refused = createHostedClient({ fetchImpl: async (url) => { refusedUrls.push(url); return Response.json({ error: 'Test this API key in Connect JEV before building. Nothing was sent to the provider.', code: 'verification_required' }, { status: 428 }); } });
  refused.setBootstrap(bootstrap);
  await refused.request('/api/connection', restore('saved-example-key'));
  await assert.rejects(refused.request('/api/compose', { method: 'POST', data: design() }), (error) => error.code === 'verification_required');
  await assert.rejects(refused.request('/api/compose', { method: 'POST', data: design() }), (error) => error.status === 428 && error.code === 'verification_required');
  assert.deepEqual(refusedUrls, ['/api/compose']);
});

test('a rejected retest of the connected key clears its verification, and another key\'s rejection does not', async () => {
  for (const [code, status] of [['credentials', 502], ['verification_stale', 409]]) {
    let reject = false;
    const client = createHostedClient({ fetchImpl: async () => reject ? Response.json({ error: 'The provider rejected this key.', code }, { status }) : connected() });
    client.setBootstrap(bootstrap);
    await client.request('/api/connection', connection());
    reject = true;
    await assert.rejects(client.request('/api/connection', connection('sk-or-other-example')), (error) => error.code === code);
    assert.equal(client.status().verified, true, code);
    await assert.rejects(client.request('/api/connection', connection('')), (error) => error.code === code);
    assert.equal(client.status().verified, false, code);
  }
});

test('an expired session or CSRF pairing is re-bootstrapped by the next explicit action', async () => {
  for (const code of ['session', 'csrf']) {
    const sent = [];
    let first = true;
    const client = createHostedClient({ fetchImpl: async (url, options) => {
      sent.push([url, options.headers?.['X-CSRF-Token']]);
      if (url === '/api/status') return Response.json({ ...bootstrap, csrfToken: 'c'.repeat(43), freeAllowance: allowance(10) });
      if (first) { first = false; return Response.json({ error: 'Reload this page.', code }, { status: 403 }); }
      return Response.json({ spec: JSON.parse(options.body).spec, freeAllowance: allowance(8) });
    } });
    client.setBootstrap({ ...bootstrap, freeAllowance: allowance(10) });
    await assert.rejects(client.request('/api/compose', { method: 'POST', data: design() }), (error) => error.code === code);
    await client.request('/api/compose', { method: 'POST', data: design() });
    assert.deepEqual(sent, [['/api/compose', bootstrap.csrfToken], ['/api/status', undefined], ['/api/compose', 'c'.repeat(43)]], code);
  }
});

const turnstile = (verifiedUntil = null) => ({ ...bootstrap, freeAllowance: allowance(), humanCheck: { mode: 'turnstile', siteKey: 'synthetic-site-key', verifiedUntil } });
const designed = (options) => Response.json({ spec: JSON.parse(options.body).spec, report: {}, warnings: [] });

test('the browser check runs only before live key tests and designs, and its pass is reused', async () => {
  const calls = [], checks = [];
  const client = createHostedClient({
    humanCheck: async ({ siteKey, signal }) => { checks.push(siteKey); assert.ok(signal instanceof AbortSignal); return 'synthetic-token'; },
    loadDemo: async () => [{ compose }, { demoEvaluate }], render: async () => 'render', exportSite: async () => 'export',
    fetchImpl: async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body), options });
      if (url === '/api/challenge') return Response.json({ verified: true, expiresAt: Date.now() + 86400000 });
      return url === '/api/connection' ? connected() : designed(options);
    }
  });
  client.setBootstrap(turnstile());
  await client.request('/api/compose', { method: 'POST', data: { ...design(), mode: 'demo' } });
  await client.request('/api/render', { method: 'POST', data: { spec: createSpec() } });
  await client.request('/api/export', { method: 'POST', data: { spec: createSpec() } });
  assert.equal(checks.length + calls.length, 0, 'Demo, preview and export never load the check');
  await client.request('/api/connection', connection());
  // A stale status response cannot erase the newer pass.
  client.setBootstrap(turnstile(), { current: false });
  await client.request('/api/compose', { method: 'POST', data: design() });
  assert.deepEqual(checks, ['synthetic-site-key']);
  assert.deepEqual(calls.map(({ url }) => url), ['/api/challenge', '/api/connection', '/api/compose']);
  assert.deepEqual(calls[0].body, { token: 'synthetic-token' });
  assert.equal(calls[0].options.headers['X-CSRF-Token'], bootstrap.csrfToken);
  assert.equal(JSON.stringify(client.status()).includes('synthetic-token'), false);
});

test('a reported pass skips the check until it nears expiry', async () => {
  const calls = [], checks = [];
  const client = createHostedClient({
    humanCheck: async () => { checks.push(1); return 'synthetic-token'; },
    fetchImpl: async (url, options) => { calls.push(url); return url === '/api/challenge' ? Response.json({ verified: true, expiresAt: Date.now() + 86400000 }) : designed(options); }
  });
  client.setBootstrap(turnstile(Date.now() + 3600000));
  await client.request('/api/compose', { method: 'POST', data: design() });
  client.setBootstrap(turnstile(Date.now() + 30000));
  await client.request('/api/compose', { method: 'POST', data: design() });
  assert.equal(checks.length, 1);
  assert.deepEqual(calls, ['/api/compose', '/api/challenge', '/api/compose']);
});

test('a human_required refusal runs one new check and retries the same request once', async () => {
  for (const refusals of [1, 2]) {
    const calls = [];
    let refused = 0;
    const client = createHostedClient({
      humanCheck: async () => 'synthetic-token',
      fetchImpl: async (url, options) => {
        calls.push(url);
        if (url === '/api/challenge') return Response.json({ verified: true, expiresAt: Date.now() + 86400000 });
        if (refused++ < refusals) return Response.json({ error: 'Complete the browser check before using live JEV. Nothing was sent to the provider.', code: 'human_required' }, { status: 403 });
        return designed(options);
      }
    });
    client.setBootstrap(turnstile(Date.now() + 3600000));
    const pending = client.request('/api/compose', { method: 'POST', data: design() });
    if (refusals === 1) assert.ok((await pending).spec);
    else await assert.rejects(pending, (error) => error.code === 'human_required' && error.status === 403);
    assert.deepEqual(calls, ['/api/compose', '/api/challenge', '/api/compose']);
  }
});

test('a cancelled, failed or unavailable browser check sends nothing to the provider', async () => {
  const refusal = (code, status) => Response.json({ error: 'The browser check did not pass. Try again.', code }, { status });
  const cases = [
    [async () => { throw new DOMException('Request cancelled.', 'AbortError'); }, null, (error) => error.name === 'AbortError'],
    [async () => { const error = new Error('The browser check is unavailable right now. Try again shortly.'); error.code = 'human_unavailable'; throw error; }, null, (error) => error.code === 'human_unavailable'],
    [async () => 'token with spaces', null, (error) => error.code === 'human_unavailable'],
    [async () => 'synthetic-token', refusal('human_failed', 403), (error) => error.code === 'human_failed']
  ];
  for (const [humanCheck, challenge, expected] of cases) {
    const calls = [];
    const client = createHostedClient({ humanCheck, fetchImpl: async (url) => { calls.push(url); return url === '/api/challenge' ? challenge : assert.fail('No provider request'); } });
    client.setBootstrap(turnstile());
    await assert.rejects(client.request('/api/compose', { method: 'POST', data: design() }), expected);
    assert.deepEqual(calls, challenge ? ['/api/challenge'] : []);
  }
  const client = createHostedClient({ humanCheck: ({ signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })), fetchImpl: () => assert.fail('No request after disconnect') });
  client.setBootstrap(turnstile());
  const pending = client.request('/api/compose', { method: 'POST', data: design() });
  await Promise.resolve();
  await client.request('/api/connection', { method: 'DELETE' });
  await assert.rejects(pending, (error) => error.name === 'AbortError');
});
