/** Synthetic transport fixtures exercise the real hosted handler and JEV adapter.
 * These tests never contact a live provider, Redis, Cloudflare or Vercel. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createHostedApp, handleHostedRequest } from '../hosted/app.mjs';
import { createSpec } from '../shared/content.mjs';
import { validateSpec } from '../shared/schema.mjs';
import { prepareComposeRequest, IMAGE_PLACEHOLDER } from '../shared/compose-transport.mjs';
import { demoEvaluate } from '../server/demo.mjs';
import { JEV_ENDPOINT, OPENROUTER_JEV_ENDPOINT } from '../server/jev.mjs';
import { PNG_IMAGE } from './fixtures/images.mjs';
import { GET as statusGET } from '../api/status.mjs';
import { POST as connectionPOST } from '../api/connection.mjs';
import { POST as composePOST } from '../api/compose.mjs';
import { POST as challengePOST } from '../api/challenge.mjs';
import { SITEVERIFY_URL } from '../hosted/turnstile.mjs';

const origin = 'https://forma.example';
const key = () => randomBytes(32).toString('base64url');
// Existing flows run without the browser check; the Turnstile tests below enforce it.
const freshEnv = () => ({ PUBLIC_ORIGIN: origin, FORMA_SESSION_SECRET: key(), FORMA_EDGE_SECRET: key(), TYPESAFE_API_KEY: key(), OPENROUTER_API_KEY: key(), JEV_PROVIDER: 'openrouter', JEV_MODEL: 'unused-environment-model', TURNSTILE_ENFORCE: 'off' });
const accepted = { success: true, hostname: 'forma.example', action: 'forma_live', 'error-codes': [], challenge_ts: '2026-09-28T12:00:00.000Z' };
const turnstileEnv = () => ({ ...freshEnv(), TURNSTILE_ENFORCE: 'on', NEXT_PUBLIC_TURNSTILE_SITE_KEY: '0x4AAAAAAAsyntheticSiteKey', TURNSTILE_SECRET_KEY: `0x4AAAAAAA${key()}`, TURNSTILE_SESSION_SECRET: key(), TURNSTILE_ALLOWED_HOSTNAMES: 'forma.example, 127.0.0.1, localhost' });
const design = (overrides = {}) => ({ mode: 'jev', operation: 'create', prompt: 'A warm studio website with services, gallery, FAQ and contact. No pricing.', spec: createSpec(), locks: {}, ...overrides });

async function providerFixture(_url, init, overrides = {}) {
  const input = JSON.parse(init.body);
  const demo = input.questions.connection ? null : await demoEvaluate(input);
  const answers = Object.fromEntries(Object.entries(input.questions).map(([name, question]) => {
    const picked = overrides[name] || (name === 'connection' ? 'connected' : demo.answers[name].choice);
    return [name, { type: 'choice', choice: picked, confidence: 1, probabilities: Object.fromEntries(Object.keys(question.criteria).map((option) => [option, option === picked ? 1 : 0])) }];
  }));
  return Response.json({ model: 'jev-synthetic-fixture', answers, usage: { input_tokens: 100, output_tokens: 25 } });
}

function fixtureLease(value) {
  const { sessionId, keyHash, requestId, visitorIpHash, networkHash, evidenceHash } = value;
  if (value.operation === 'connection') return { kind: 'probe', sessionId, keyHash, requestId, visitorIpHash, networkHash, evidenceHash, generation: 0 };
  return value.funded ? { kind: 'funded', operation: 'compose', sessionId, keyHash, requestId, visitorIpHash, units: 2 } : { kind: 'work', sessionId, keyHash, requestId, networkHash, evidenceHash };
}

function harness({ env = freshEnv(), provider = providerFixture, reservation, allowance, release, authorize, clock, siteverify = () => Response.json(accepted) } = {}) {
  const calls = [], reservations = [], releases = [], settlements = [], freeReads = [], breakers = [], order = [], authorizations = [], verifications = [];
  const quota = {
    async reserveUsage(value) {
      reservations.push(value);
      const replaced = await reservation?.(value);
      if (replaced) return replaced;
      if (!['connection', 'compose'].includes(value.operation)) return { granted: true };
      return { granted: true, lease: fixtureLease(value), ...(value.funded ? { remainingMs: 50000, dayEndMs: 3600000 } : {}) };
    },
    async authorizePass(lease, pass) { authorizations.push(pass); order.push('authorize'); return authorize ? authorize(lease, pass) : { granted: true, remainingMs: 49000 }; },
    async releaseUsage(lease, settlement) { releases.push(lease); settlements.push(settlement); order.push('settle'); return release ? release(lease, settlement) : true; },
    async statusFree(value) { freeReads.push(value); order.push('status'); return allowance ? allowance(value) : { available: !breakers.length, remaining: breakers.length ? 0 : 10, resetAt: Date.UTC(2026, 9, 2), ...(breakers.length ? { reason: breakers.at(-1).reason } : {}) }; },
    async markOperatorUnavailable(value) { breakers.push(value); order.push('breaker'); return true; },
  };
  const handle = createHostedApp({ env, quota, ...(clock ? { clock } : {}), fetchImpl: async (url, init) => {
    // Siteverify is recorded apart from provider calls, so provider assertions keep their meaning.
    if (url === SITEVERIFY_URL) { verifications.push({ url, init }); return siteverify(init); }
    calls.push({ url, init }); return provider(url, init);
  } });
  function request({ path = '/api/status', method = 'GET', headers, body, session, signal } = {}) {
    return new Request(`${origin}${path}`, {
      method, signal,
      // An undefined fixture value removes that header entirely.
      headers: Object.fromEntries(Object.entries({ host: 'forma.example', 'x-forma-edge-token': env.FORMA_EDGE_SECRET || '', 'x-forwarded-for': '203.0.113.17', 'cf-connecting-ip': '192.0.2.22', ...(method === 'POST' ? { origin, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json' } : {}), ...(session ? { cookie: session.cookie, 'x-csrf-token': session.csrfToken } : {}), ...headers }).filter(([, value]) => value !== undefined)),
      ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
    });
  }
  async function bootstrap() {
    const response = await handle(request());
    assert.equal(response.status, 200);
    return { ...await response.json(), cookie: response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ') };
  }
  return { env, handle, request, bootstrap, calls, reservations, releases, quota, settlements, freeReads, breakers, order, authorizations, verifications };
}

test('Vercel entry modules export the real Web Request handler under named HTTP methods', () => {
  assert.equal(statusGET, handleHostedRequest);
  assert.equal(connectionPOST, handleHostedRequest);
  assert.equal(composePOST, handleHostedRequest);
  assert.equal(challengePOST, handleHostedRequest);
});

test('status bootstraps only hardened guest cookies without reading provider credentials', async () => {
  const h = harness();
  const response = await h.handle(h.request());
  assert.equal(response.status, 200);
  const value = await response.json();
  assert.equal(value.deployment, 'hosted');
  assert.equal(value.configured, false);
  assert.equal(value.verified, false);
  assert.equal(value.credentialSource, 'none');
  assert.equal(response.headers.get('cache-control'), 'no-store, no-transform');
  assert.equal(response.headers.getSetCookie().length, 2);
  assert.ok(response.headers.getSetCookie().every((cookie) => /; Path=\/; HttpOnly; Secure; SameSite=Strict;/.test(cookie)));
  assert.deepEqual(h.reservations.map((v) => v.operation), ['bootstrap']);
  assert.equal(h.calls.length, 0);
  const serialized = JSON.stringify(value);
  for (const secret of Object.values(h.env).filter((v) => v !== origin && v !== 'off')) assert.ok(!serialized.includes(secret));
  assert.deepEqual(value.humanCheck, { mode: 'off' });
  assert.ok(!Object.hasOwn(value, 'session'));
});

test('edge, host and origin denials happen before any quota reservation or provider work', async () => {
  const h = harness();
  for (const headers of [{ 'x-forma-edge-token': '' }, { 'x-forma-edge-token': key() }, { host: 'attacker.example' }, { origin: 'https://attacker.example' }, { 'sec-fetch-site': 'cross-site' }, { host: 'attacker.example', 'x-forwarded-host': 'forma.example' }]) {
    const response = await h.handle(h.request({ headers }));
    assert.equal(response.status, 403);
  }
  assert.equal(h.reservations.length, 0);
  assert.equal(h.calls.length, 0);
});

test('mutation requires a verified guest, exact session CSRF and browser Origin before quota', async () => {
  const h = harness(), session = await h.bootstrap();
  h.reservations.length = 0;
  for (const [headers, expected] of [[{ cookie: '' }, 401], [{ 'x-csrf-token': '' }, 403], [{ 'x-csrf-token': key() }, 403], [{ origin: '' }, 403], [{ 'sec-fetch-site': 'same-site' }, 403]]) {
    const response = await h.handle(h.request({ path: '/api/connection', method: 'POST', session, headers, body: { apiKey: key() } }));
    assert.equal(response.status, expected);
  }
  assert.equal(h.reservations.length, 0);
  assert.equal(h.calls.length, 0);
});

test('routing, methods, queries and transport identity fail closed without provider work', async () => {
  const h = harness();
  for (const [options, expected] of [[{ path: '/api/projects' }, 404], [{ path: '/api/%63ompose' }, 404], [{ path: '/api/status?apiKey=discard' }, 400], [{ path: '/api/status#fragment' }, 400], [{ path: '/api/status', method: 'POST', body: {} }, 405], [{ path: '/api/connection', method: 'DELETE' }, 405], [{ path: '/api/compose' }, 405], [{ headers: { 'x-forwarded-for': '' } }, 403], [{ headers: { 'x-forwarded-for': 'invalid', 'x-real-ip': '203.0.113.4' } }, 403]]) {
    const response = await h.handle(h.request(options));
    assert.equal(response.status, expected);
    if (expected === 405) assert.equal(response.headers.get('allow'), options.path === '/api/status' ? 'GET' : 'POST');
  }
  assert.equal(h.reservations.length, 0);
  assert.equal(h.calls.length, 0);
});

test('missing or invalid deployment secrets make hosted handlers unavailable', async () => {
  for (const name of ['FORMA_SESSION_SECRET', 'FORMA_EDGE_SECRET', 'PUBLIC_ORIGIN']) {
    for (const value of [undefined, 'invalid']) {
      const env = freshEnv(); env[name] = value;
      const h = harness({ env });
      const response = await h.handle(h.request());
      assert.equal(response.status, 503);
      assert.equal(h.reservations.length, 0);
      assert.equal(h.calls.length, 0);
      assert.deepEqual(await response.json(), { error: 'Hosted service is not configured.', code: 'configuration' });
    }
  }
});

test('durable quota failures return bounded retry advice before provider work', async () => {
  for (const operation of ['bootstrap', 'request', 'connection', 'compose']) {
    for (const status of [429, 503]) {
      const h = harness({ reservation: (value) => value.operation === operation ? { granted: false, status, retryAfter: status === 429 ? 123 : 60 } : undefined });
      const session = operation === 'bootstrap' ? undefined : await h.bootstrap();
      const response = await h.handle(h.request(operation === 'bootstrap' ? {} : { path: operation === 'compose' ? '/api/compose' : '/api/connection', method: 'POST', session, body: operation === 'compose' ? { ...design(), apiKey: key() } : { apiKey: key() } }));
      assert.equal(response.status, status);
      assert.equal(response.headers.get('retry-after'), status === 429 ? '123' : '60');
      assert.equal(h.calls.length, 0);
      assert.equal(h.releases.length, 0);
    }
  }
});

test('connection credentials are request-scoped across guests and tabs; environment keys are ignored', async () => {
  const h = harness(), a = await h.bootstrap(), b = await h.bootstrap();
  const aKey = key(), bKey = key(), tabKey = key();
  for (const [session, apiKey, provider] of [[a, aKey, 'typesafe'], [b, bKey, 'openrouter'], [a, tabKey, 'typesafe']]) {
    const response = await h.handle(h.request({ path: '/api/connection', method: 'POST', session, body: { apiKey, provider } }));
    assert.equal(response.status, 200);
    const value = await response.json();
    assert.equal(value.verified, true);
    assert.equal(value.provider, provider);
    assert.ok(!JSON.stringify(value).includes(apiKey));
  }
  assert.deepEqual(h.calls.map((call) => call.init.headers.Authorization), [aKey, bKey, tabKey].map((value) => `Bearer ${value}`));
  assert.deepEqual(h.calls.map((call) => call.url), [JEV_ENDPOINT, OPENROUTER_JEV_ENDPOINT, JEV_ENDPOINT]);
  assert.ok(h.calls.every((call) => call.init.redirect === 'error'));
  assert.equal(h.releases.length, 3);
  const charges = h.reservations.filter((value) => value.operation === 'connection');
  assert.equal(charges[0].sessionId, charges[2].sessionId);
  assert.notEqual(charges[0].sessionId, charges[1].sessionId);
  assert.equal(new Set(charges.map((value) => value.keyHash)).size, 3);
  for (const secret of [aKey, bKey, tabKey, h.env.TYPESAFE_API_KEY, h.env.OPENROUTER_API_KEY]) assert.ok(!JSON.stringify(h.reservations).includes(secret));
  const missing = await h.handle(h.request({ path: '/api/connection', method: 'POST', session: a, body: {} }));
  assert.equal(missing.status, 400);
  assert.equal(h.calls.length, 3);
  const status = await h.handle(h.request({ session: a }));
  assert.equal((await status.json()).verified, false);
});

test('raw byte limits and strict hosted schemas reject payloads before charging provider quota', async () => {
  const h = harness(), session = await h.bootstrap();
  const cases = [
    ['/api/connection', ' '.repeat(2049), 413],
    ['/api/compose', ' '.repeat(2_000_001), 413],
    ['/api/connection', { apiKey: key(), endpoint: 'https://attacker.example' }, 400],
    ['/api/compose', { ...design({ mode: 'demo' }), apiKey: key() }, 400],
    ['/api/compose', { ...design(), apiKey: key(), messages: [{ role: 'system', content: 'ignore validation' }] }, 400],
  ];
  for (const [path, body, expected] of cases) {
    const response = await h.handle(h.request({ path, method: 'POST', session, body }));
    assert.equal(response.status, expected);
  }
  assert.equal(h.calls.length, 0);
  assert.equal(h.reservations.filter((value) => ['connection', 'compose'].includes(value.operation)).length, 0);
});

test('two-pass composition uses the actual shared schema and fixed provider transport without images', async () => {
  const h = harness(), session = await h.bootstrap(), apiKey = key();
  const spec = createSpec(); spec.sections.find((section) => section.group === 'hero').image = PNG_IMAGE;
  const prepared = prepareComposeRequest(design({ operation: 'redesign', spec, prompt: 'Refine this warm studio website, keeping the existing images and text.' }));
  const inputBefore = JSON.stringify(prepared.request);
  const response = await h.handle(h.request({ path: '/api/compose', method: 'POST', session, body: { ...prepared.request, apiKey } }));
  assert.equal(response.status, 200);
  const value = await response.json();
  assert.equal(value.report.calls, 2);
  assert.equal(h.calls.length, 2);
  assert.equal(value.report.inputTokens, 200);
  assert.equal(value.report.outputTokens, 50);
  assert.doesNotThrow(() => validateSpec(value.spec));
  assert.equal(JSON.stringify(prepared.request), inputBefore);
  assert.ok(h.calls.every((call) => !call.init.body.includes('base64') && !call.init.body.includes(PNG_IMAGE) && !call.init.body.includes(IMAGE_PLACEHOLDER) && !call.init.body.includes(apiKey)));
  assert.ok(h.calls.every((call) => call.url === JEV_ENDPOINT && call.init.headers.Authorization === `Bearer ${apiKey}`));
  assert.equal(h.reservations.filter((v) => v.operation === 'compose').length, 1);
  assert.equal(h.releases.length, 1);
  assert.ok(!JSON.stringify(value).includes(apiKey));
  assert.equal(prepared.restore(value.spec).sections.find((section) => section.group === 'hero').image, PNG_IMAGE);
});

test('simple refinement makes at most two provider calls and returns a valid project', async () => {
  const h = harness(), session = await h.bootstrap();
  const response = await h.handle(h.request({ path: '/api/compose', method: 'POST', session, body: { ...design({ operation: 'edit', prompt: 'Make it dark.' }), apiKey: key() } }));
  assert.equal(response.status, 200);
  const value = await response.json();
  assert.ok(h.calls.length >= 1 && h.calls.length <= 2);
  assert.equal(value.report.calls, h.calls.length);
  assert.doesNotThrow(() => validateSpec(value.spec));
  assert.equal(h.releases.length, 1);
});

test('provider failures and malformed responses cannot reflect response bodies, secrets or stacks', async () => {
  for (const kind of ['http', 'json', 'network', '429', 'choice']) {
    const privateText = key();
    const h = harness({ provider: async (url, init) => {
      if (kind === 'network') throw new Error(privateText);
      if (kind === 'choice') {
        const response = await providerFixture(url, init);
        const value = await response.json(); value.answers.connection.choice = privateText;
        return Response.json(value);
      }
      return new Response(privateText, { status: kind === 'http' ? 401 : kind === '429' ? 429 : 200 });
    } });
    const session = await h.bootstrap();
    const response = await h.handle(h.request({ path: '/api/connection', method: 'POST', session, body: { apiKey: key() } }));
    assert.equal(response.status, kind === '429' ? 429 : 502);
    if (kind === '429') assert.equal(response.headers.get('retry-after'), '60');
    const text = await response.text();
    assert.ok(!text.includes(privateText));
    assert.doesNotMatch(text, /stack|Authorization/);
    assert.equal(h.releases.length, 1);
    assert.equal(h.calls.length, 1);
  }
});

test('failure in the second composition pass releases the lease without a partial project response', async () => {
  let count = 0;
  const h = harness({ provider: (url, init) => ++count === 1 ? providerFixture(url, init) : Promise.resolve(new Response(key(), { status: 500 })) });
  const session = await h.bootstrap(), input = design(), before = structuredClone(input);
  const response = await h.handle(h.request({ path: '/api/compose', method: 'POST', session, body: { ...input, apiKey: key() } }));
  assert.equal(response.status, 502);
  assert.ok(!Object.hasOwn(await response.json(), 'spec'));
  assert.deepEqual(input, before);
  assert.equal(h.calls.length, 2);
  assert.equal(h.releases.length, 1);
});

test('unsupported design scope is a safe actionable 422 and still releases the provider lease', async () => {
  const h = harness({ provider: (url, init) => providerFixture(url, init, { scope: 'unsupported' }) }), session = await h.bootstrap();
  const response = await h.handle(h.request({ path: '/api/compose', method: 'POST', session, body: { ...design({ prompt: 'Build a database server only' }), apiKey: key() } }));
  assert.equal(response.status, 422);
  assert.equal((await response.json()).code, 'unsupported_design');
  assert.equal(h.calls.length, 1);
  assert.equal(h.releases.length, 1);
});

test('pre-aborted requests never consume quotas or call providers', async () => {
  const h = harness(), controller = new AbortController(); controller.abort();
  const response = await h.handle(h.request({ signal: controller.signal }));
  assert.equal(response.status, 504);
  assert.equal(h.reservations.length, 0);
  assert.equal(h.calls.length, 0);
});

test('abort after provider reservation releases the acquired lease before making a provider call', async () => {
  const controller = new AbortController();
  const h = harness({ reservation: (value) => { if (value.operation === 'connection') controller.abort(); } });
  const session = await h.bootstrap();
  const response = await h.handle(h.request({ path: '/api/connection', method: 'POST', session, signal: controller.signal, body: { apiKey: key() } }));
  assert.equal(response.status, 504);
  assert.equal(h.calls.length, 0);
  assert.equal(h.releases.length, 1);
});

test('in-flight abort reaches the provider signal and releases its concurrency lease', async () => {
  const controller = new AbortController();
  let providerAborted = false;
  const h = harness({ provider: (_url, init) => new Promise((_, reject) => {
    init.signal.addEventListener('abort', () => { providerAborted = true; reject(new Error('cancelled')); }, { once: true });
    controller.abort();
  }) });
  const session = await h.bootstrap();
  const response = await h.handle(h.request({ path: '/api/connection', method: 'POST', session, signal: controller.signal, body: { apiKey: key() } }));
  assert.equal(response.status, 504);
  assert.equal(providerAborted, true);
  assert.equal(h.calls.length, 1);
  assert.equal(h.releases.length, 1);
});

const fundedEnv = (overrides = {}) => ({ ...freshEnv(), JEV_PROVIDER: 'typesafe', JEV_MODEL: 'jev-1.13.0', ...overrides });

test('a configured operator allowance is advertised without probing the key or spending provider calls', async () => {
  const h = harness({ env: fundedEnv() });
  const session = await h.bootstrap();
  assert.deepEqual(session.freeAllowance, { available: true, remaining: 10, limit: 10, resetAt: Date.UTC(2026, 9, 2) });
  assert.equal(session.verified, false);
  assert.equal(session.configured, false);
  assert.equal(h.calls.length, 0);
  assert.equal(h.freeReads.length, 1);
  assert.deepEqual(h.reservations.map((value) => value.operation), ['bootstrap']);
  for (const secret of [h.env.TYPESAFE_API_KEY, h.env.OPENROUTER_API_KEY, h.env.FORMA_SESSION_SECRET]) assert.ok(!JSON.stringify(session).includes(secret));
  const response = await h.handle(h.request({ path: '/api/connection', method: 'POST', session, body: {} }));
  assert.equal(response.status, 400);
  assert.equal(h.calls.length, 0);
});

test('missing, malformed and Redis-only environment credentials cannot fund requests', async () => {
  for (const overrides of [
    { TYPESAFE_API_KEY: undefined, OPENROUTER_API_KEY: undefined, QWEN3_KV_REST_API_TOKEN: key() },
    { TYPESAFE_API_KEY: 'invalid key' }, { TYPESAFE_API_KEY: 'x'.repeat(513) },
    { JEV_MODEL: 'unsupported-model' }, { JEV_PROVIDER: 'unsupported-provider' },
  ]) {
    const h = harness({ env: fundedEnv(overrides) }), session = await h.bootstrap();
    assert.deepEqual(session.freeAllowance, { available: false, remaining: 0, limit: 10, resetAt: null, reason: 'unconfigured' });
    const response = await h.handle(h.request({ path: '/api/compose', method: 'POST', session, body: design() }));
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, 'free_unavailable');
    assert.equal(h.calls.length, 0);
    assert.equal(h.freeReads.length, 0);
    assert.ok(!h.reservations.some((value) => value.funded));
  }
});

test('verified CF visitor IP is required for every hosted route and canonically hashed after the edge check', async () => {
  const h = harness({ env: fundedEnv() });
  const blocked = await h.handle(h.request({ headers: { 'x-forma-edge-token': key(), 'cf-connecting-ip': '192.0.2.22' } }));
  assert.equal(blocked.status, 403);
  assert.equal(h.freeReads.length, 0);
  assert.equal(h.reservations.length, 0);
  const session = await h.bootstrap();
  h.reservations.length = 0; h.freeReads.length = 0;
  for (const address of [undefined, '', '192.0.2.22, 192.0.2.23', '192.0.2.22:1234', '[2001:db8::1]', 'fe80::1%eth0', 'malformed']) {
    for (const options of [{}, { path: '/api/connection', method: 'POST', session, body: { apiKey: key() } }, { path: '/api/compose', method: 'POST', session, body: design() }]) {
      // Alternate client-controlled headers never replace a missing Cloudflare identity.
      const response = await h.handle(h.request({ ...options, headers: { 'cf-connecting-ip': address, 'x-real-ip': '198.51.100.7', 'true-client-ip': '198.51.100.8' } }));
      assert.equal(response.status, 403);
      assert.equal((await response.json()).code, 'visitor');
    }
  }
  assert.equal(h.reservations.length, 0);
  assert.equal(h.freeReads.length, 0);
  assert.equal(h.calls.length, 0);
  for (const address of ['2001:db8::1', '2001:0db8:0:0:0:0:0:1', '192.0.2.23']) await h.handle(h.request({ headers: { 'cf-connecting-ip': address } }));
  assert.equal(h.freeReads[0].visitorIpHash, h.freeReads[1].visitorIpHash);
  assert.notEqual(h.freeReads[0].visitorIpHash, h.freeReads[2].visitorIpHash);
  assert.deepEqual(h.reservations.map((value) => value.visitorIpHash), h.freeReads.map((value) => value.visitorIpHash));
  assert.ok(h.freeReads.every((value) => /^[0-9a-f]{64}$/.test(value.visitorIpHash)));
  assert.ok(!JSON.stringify([h.freeReads, h.reservations]).includes('2001:db8'));
});

test('IPv6 visitors share one /64 probe network while keeping exact visitor identities', async () => {
  const h = harness(), session = await h.bootstrap();
  for (const address of ['2001:db8:1:2::10', '2001:db8:1:2:ffff::1', '2001:db8:1:3::1', '192.0.2.1', '192.0.2.2']) {
    const response = await h.handle(h.request({ path: '/api/connection', method: 'POST', session, headers: { 'cf-connecting-ip': address }, body: { apiKey: key() } }));
    assert.equal(response.status, 200);
  }
  const probes = h.reservations.filter((value) => value.operation === 'connection');
  assert.equal(new Set(probes.map((value) => value.visitorIpHash)).size, 5);
  assert.equal(probes[0].networkHash, probes[1].networkHash);
  assert.notEqual(probes[0].networkHash, probes[2].networkHash);
  assert.notEqual(probes[3].networkHash, probes[4].networkHash, 'IPv4 addresses are not grouped');
  assert.ok(probes.every((value) => /^[0-9a-f]{64}$/.test(value.networkHash) && value.networkHash !== value.visitorIpHash));
});

test('operator-funded two-pass requests settle actual calls before returning the updated allowance', async () => {
  let used = 0;
  const h = harness({ env: fundedEnv(), allowance: () => ({ available: true, remaining: 10 - used, resetAt: Date.UTC(2026, 9, 2) }), release: (_lease, value) => { used += value.usedProviderCalls; return true; } });
  const session = await h.bootstrap();
  const response = await h.handle(h.request({ path: '/api/compose', method: 'POST', session, body: { ...design(), provider: 'openrouter' } }));
  assert.equal(response.status, 200);
  const output = await response.json();
  assert.equal(output.report.calls, 2);
  assert.equal(output.freeAllowance.remaining, 8);
  assert.equal(h.calls.length, 2);
  assert.ok(h.calls.every(({ url, init }) => url === JEV_ENDPOINT && init.headers.Authorization === `Bearer ${h.env.TYPESAFE_API_KEY}`));
  assert.deepEqual(h.order, ['status', 'authorize', 'authorize', 'settle', 'status']);
  assert.deepEqual(h.authorizations, [1, 2], 'Each funded pass is authorized in order before dispatch');
  assert.deepEqual(h.settlements, [{ usedProviderCalls: 2, outcome: 'none' }]);
  const reserved = h.reservations.find((value) => value.operation === 'compose');
  assert.equal(reserved.funded, true);
  assert.equal(reserved.visitorIpHash, h.freeReads[0].visitorIpHash);
  assert.equal(reserved.keyHash, h.freeReads[0].keyHash);
  assert.ok(!JSON.stringify(output).includes(h.env.TYPESAFE_API_KEY));
});

test('a one-pass funded refinement settles one actual provider attempt and makes the unused unit available', async () => {
  let used = 0;
  const h = harness({ env: fundedEnv(), allowance: () => ({ available: true, remaining: 10 - used, resetAt: Date.UTC(2026, 9, 2) }), release: (_lease, value) => { used += value.usedProviderCalls; return true; } });
  const session = await h.bootstrap(), spec = createSpec();
  for (const section of spec.sections) section.locked = true;
  const response = await h.handle(h.request({ path: '/api/compose', method: 'POST', session, body: design({ operation: 'edit', prompt: 'Make it dark.', spec }) }));
  assert.equal(response.status, 200);
  const value = await response.json();
  assert.equal(h.calls.length, 1);
  assert.equal(value.report.calls, 1);
  assert.equal(value.freeAllowance.remaining, 9);
  assert.deepEqual(h.settlements, [{ usedProviderCalls: 1, outcome: 'none' }]);
});

test('operator configuration follows local TypeSafe/OpenRouter precedence and never accepts a client-selected funded provider', async () => {
  const env = fundedEnv({ TYPESAFE_API_KEY: undefined, JEV_PROVIDER: '', JEV_MODEL: 'jev-1.13' });
  const h = harness({ env }), session = await h.bootstrap();
  const response = await h.handle(h.request({ path: '/api/compose', method: 'POST', session, body: { ...design(), provider: 'typesafe' } }));
  assert.equal(response.status, 200);
  assert.ok(h.calls.every(({ url, init }) => url === OPENROUTER_JEV_ENDPOINT && init.headers.Authorization === `Bearer ${env.OPENROUTER_API_KEY}` && JSON.parse(init.body).model === 'typesafe/jev-1.13'));
  const personal = key();
  const byok = await h.handle(h.request({ path: '/api/compose', method: 'POST', session, body: { ...design(), apiKey: personal, provider: 'typesafe' } }));
  assert.equal(byok.status, 200);
  assert.ok(h.calls.slice(2).every(({ url, init }) => url === JEV_ENDPOINT && init.headers.Authorization === `Bearer ${personal}` && JSON.parse(init.body).model === 'jev-1.13.0'));
  assert.equal(h.reservations.filter((value) => value.operation === 'compose').at(-1).funded, undefined);
});

test('free exhaustion and a durable operator circuit offer BYOK without starting provider work', async () => {
  for (const code of ['FREE_LIMIT_REACHED', 'FREE_UNAVAILABLE']) {
    const h = harness({ env: fundedEnv(), reservation: (value) => value.funded ? { granted: false, status: code === 'FREE_LIMIT_REACHED' ? 429 : 503, code, retryAfter: 60 } : undefined, allowance: () => code === 'FREE_LIMIT_REACHED' ? { available: true, remaining: 1, resetAt: Date.UTC(2026, 9, 2) } : { available: false, remaining: 0, resetAt: Date.UTC(2026, 9, 2), reason: 'credits' } });
    const session = await h.bootstrap();
    const response = await h.handle(h.request({ path: '/api/compose', method: 'POST', session, body: design() }));
    const value = await response.json();
    assert.equal(value.code, code === 'FREE_LIMIT_REACHED' ? 'free_limit' : 'free_unavailable');
    assert.equal(value.freeAllowance.available, false);
    assert.equal(value.freeAllowance.reason, code === 'FREE_LIMIT_REACHED' ? 'exhausted' : 'credits');
    assert.equal(h.calls.length, 0);
    assert.equal(h.releases.length, 0);
    const byok = await h.handle(h.request({ path: '/api/connection', method: 'POST', session, body: { apiKey: key() } }));
    assert.equal(byok.status, 200);
  }
});

test('operator authorization, credit and rate failures trip only the operator circuit and hide provider secrets', async () => {
  for (const upstreamStatus of [401, 402, 403, 429]) {
    const privateText = key();
    const h = harness({ env: fundedEnv(), provider: () => new Response(privateText, { status: upstreamStatus }) }), session = await h.bootstrap();
    const response = await h.handle(h.request({ path: '/api/compose', method: 'POST', session, body: design() }));
    assert.equal(response.status, 503);
    const value = await response.json();
    const reason = upstreamStatus === 402 ? 'credits' : upstreamStatus === 429 ? 'rate_limit' : 'credentials';
    assert.equal(value.code, 'free_unavailable');
    assert.equal(value.freeAllowance.reason, reason);
    assert.equal(value.freeAllowance.available, false);
    assert.deepEqual(h.breakers, [{ keyHash: h.freeReads[0].keyHash, reason }]);
    assert.deepEqual(h.order, ['status', 'authorize', 'breaker', 'settle', 'status']);
    assert.deepEqual(h.settlements, [{ usedProviderCalls: 1, outcome: 'none' }]);
    for (const secret of [privateText, h.env.TYPESAFE_API_KEY]) assert.ok(!JSON.stringify(value).includes(secret));
    const byok = await h.handle(h.request({ path: '/api/connection', method: 'POST', session, body: { apiKey: key() } }));
    assert.equal(byok.status, upstreamStatus === 429 ? 429 : 502);
    assert.equal((await byok.json()).code, [401, 403].includes(upstreamStatus) ? 'credentials' : 'provider');
    assert.equal(h.settlements.at(-1).outcome, [401, 403].includes(upstreamStatus) ? 'credentials' : 'backoff', 'A personal-key rejection is classified separately from credit and rate failures');
    assert.equal(h.breakers.length, 1);
  }
});

test('aborted funded reservations settle zero attempts and failed attempts still count once', async () => {
  for (const startsProvider of [false, true]) {
    const controller = new AbortController();
    const h = harness({ env: fundedEnv(), reservation: (value) => { if (value.funded && !startsProvider) controller.abort(); }, provider: (_url, init) => new Promise((_, reject) => { init.signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true }); controller.abort(); }) });
    const session = await h.bootstrap();
    const response = await h.handle(h.request({ path: '/api/compose', method: 'POST', session, signal: controller.signal, body: design() }));
    assert.equal(response.status, 504);
    assert.equal(h.calls.length, Number(startsProvider));
    assert.deepEqual(h.settlements, [{ usedProviderCalls: Number(startsProvider), outcome: 'none' }]);
    assert.equal(h.breakers.length, 0);
    assert.ok((await response.json()).freeAllowance);
  }
});

test('failed free settlement cannot advertise an available free allowance', async () => {
  const h = harness({ env: fundedEnv(), release: () => false }), session = await h.bootstrap();
  const response = await h.handle(h.request({ path: '/api/compose', method: 'POST', session, body: design() }));
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).freeAllowance, { available: false, remaining: 0, limit: 10, resetAt: null, reason: 'unavailable' });
  assert.equal(h.releases.length, 1);
  assert.equal(h.freeReads.length, 1);
});

test('personal-key composition requires server evidence bound to the resolved provider and exact key', async () => {
  const h = harness({ reservation: (value) => value.operation === 'compose' && !value.funded ? { granted: false, status: 428, code: 'VERIFICATION_REQUIRED', retryAfter: 1 } : undefined });
  const a = await h.bootstrap(), b = await h.bootstrap(), apiKey = key();
  const direct = await h.handle(h.request({ path: '/api/compose', method: 'POST', session: a, body: { ...design(), apiKey } }));
  assert.equal(direct.status, 428);
  assert.equal((await direct.json()).code, 'verification_required');
  assert.equal(h.calls.length, 0, 'An unverified key never reaches the provider');
  assert.equal(h.releases.length, 0);
  for (const [session, provider] of [[a, 'typesafe'], [a, 'openrouter'], [b, 'auto']]) await h.handle(h.request({ path: '/api/connection', method: 'POST', session, body: { apiKey, provider } }));
  const [typesafe, openrouter, otherSession] = h.reservations.filter((value) => value.operation === 'connection').map((value) => value.evidenceHash);
  assert.notEqual(typesafe, openrouter, 'Evidence is bound to the resolved provider');
  assert.equal(typesafe, otherSession, 'Evidence belongs to the provider and key, not a guest cookie');
  assert.equal(h.reservations.find((value) => value.operation === 'compose').evidenceHash, typesafe);
  const other = await h.handle(h.request({ path: '/api/connection', method: 'POST', session: a, body: { apiKey: key() } }));
  assert.equal(other.status, 200);
  assert.notEqual(h.reservations.at(-1).evidenceHash, typesafe);
  assert.ok(!JSON.stringify(h.reservations).includes(apiKey));
});

test('connection tests record evidence only after a validated success and classify provider failures', async () => {
  for (const [kind, status, outcome, code] of [['ok', 200, 'verified'], ['401', 502, 'credentials', 'credentials'], ['403', 502, 'credentials', 'credentials'], ['402', 502, 'backoff', 'provider'], ['429', 429, 'backoff', 'provider'], ['500', 502, 'none', 'provider'], ['network', 502, 'none', 'provider'], ['choice', 502, 'none', 'provider']]) {
    const h = harness({ provider: async (url, init) => {
      if (kind === 'ok') return providerFixture(url, init);
      if (kind === 'network') throw new Error('offline');
      if (kind === 'choice') {
        const value = await (await providerFixture(url, init)).json();
        value.answers.connection.choice = 'invented';
        return Response.json(value);
      }
      return new Response('private', { status: Number(kind) });
    } });
    const session = await h.bootstrap();
    const response = await h.handle(h.request({ path: '/api/connection', method: 'POST', session, body: { apiKey: key() } }));
    assert.equal(response.status, status, kind);
    const value = await response.json();
    if (code) assert.equal(value.code, code, kind); else assert.equal(value.verified, true);
    assert.deepEqual(h.settlements, [{ usedProviderCalls: 1, outcome }], kind);
  }
  const controller = new AbortController();
  const h = harness({ provider: async (url, init) => { const response = await providerFixture(url, init); controller.abort(); return response; } });
  const session = await h.bootstrap();
  const aborted = await h.handle(h.request({ path: '/api/connection', method: 'POST', session, signal: controller.signal, body: { apiKey: key() } }));
  assert.equal(aborted.status, 504);
  assert.deepEqual(h.settlements, [{ usedProviderCalls: 1, outcome: 'none' }], 'An aborted check cannot create positive evidence');
});

test('stale or unrecorded verification is never reported as a successful connection', async () => {
  for (const [result, status, code] of [['stale', 409, 'verification_stale'], [false, 503, 'quota_unavailable']]) {
    const h = harness({ release: () => result }), session = await h.bootstrap();
    const response = await h.handle(h.request({ path: '/api/connection', method: 'POST', session, body: { apiKey: key() } }));
    assert.equal(response.status, status);
    const value = await response.json();
    assert.equal(value.code, code);
    assert.equal(Object.hasOwn(value, 'verified'), false);
    assert.equal(h.releases.length, 1, 'Settlement is attempted once');
  }
});

test('probe cooldown and throttles answer before provider work without touching funded access', async () => {
  const h = harness({ env: fundedEnv(), reservation: (value) => value.operation === 'connection' ? { granted: false, status: 429, code: 'PROBE_COOLDOWN', retryAfter: 840 } : undefined });
  const session = await h.bootstrap();
  const response = await h.handle(h.request({ path: '/api/connection', method: 'POST', session, body: { apiKey: key() } }));
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '840');
  assert.equal((await response.json()).code, 'probe_cooldown');
  assert.equal(h.calls.length, 0);
  const funded = await h.handle(h.request({ path: '/api/compose', method: 'POST', session, body: design() }));
  assert.equal(funded.status, 200, 'Probe cooldown does not block operator-funded work');
});

test('personal-key credential rejection during composition revokes evidence and tells the client', async () => {
  for (const [upstream, outcome, code] of [[401, 'credentials', 'credentials'], [403, 'credentials', 'credentials'], [402, 'backoff', 'provider'], [500, 'none', 'provider']]) {
    const h = harness({ provider: () => new Response('private', { status: upstream }) }), session = await h.bootstrap();
    const response = await h.handle(h.request({ path: '/api/compose', method: 'POST', session, body: { ...design(), apiKey: key() } }));
    assert.equal((await response.json()).code, code);
    assert.equal(h.releases[0].kind, 'work');
    assert.deepEqual(h.settlements, [{ usedProviderCalls: 1, outcome }]);
  }
});

test('funded passes stop when authorization is refused and settle only fetched passes', async () => {
  const h = harness({ env: fundedEnv(), authorize: (_lease, pass) => pass === 1 ? { granted: true, remainingMs: 49000 } : { granted: false } });
  const session = await h.bootstrap();
  const response = await h.handle(h.request({ path: '/api/compose', method: 'POST', session, body: design() }));
  assert.equal(response.status, 503);
  const value = await response.json();
  assert.equal(value.code, 'free_deadline');
  assert.ok(value.freeAllowance);
  assert.equal(h.calls.length, 1);
  assert.deepEqual(h.authorizations, [1, 2]);
  assert.deepEqual(h.settlements, [{ usedProviderCalls: 1, outcome: 'none' }]);
});

test('a funded pass is not dispatched after its conservative local deadline, even after authorization', async () => {
  let now = 1000;
  // The reservation leaves 5 s; the acknowledged authorization arrives after a 6 s stall.
  const h = harness({ env: fundedEnv(), clock: () => now, reservation: (value) => value.funded ? { granted: true, lease: fixtureLease(value), remainingMs: 5000, dayEndMs: 3600000 } : undefined, authorize: () => { now += 6000; return { granted: true, remainingMs: 49000 }; } });
  const session = await h.bootstrap();
  const response = await h.handle(h.request({ path: '/api/compose', method: 'POST', session, body: design() }));
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'free_deadline');
  assert.equal(h.calls.length, 0);
  assert.deepEqual(h.settlements, [{ usedProviderCalls: 0, outcome: 'none' }], 'The authorized but undispatched unit is returned');
  now = 1000;
  const dayBound = harness({ env: fundedEnv(), clock: () => now, reservation: (value) => value.funded ? { granted: true, lease: fixtureLease(value), remainingMs: 50000, dayEndMs: 800 } : undefined });
  const second = await dayBound.bootstrap();
  assert.equal((await dayBound.handle(dayBound.request({ path: '/api/compose', method: 'POST', session: second, body: design() }))).status, 503);
  assert.equal(dayBound.calls.length, 0, 'No funded pass starts past the Redis UTC day boundary');
});

test('an uncertain funded reservation keeps its descriptor and closes it without provider work', async () => {
  const h = harness({ env: fundedEnv(), reservation: (value) => value.funded ? { granted: false, status: 503, code: 'SERVICE_UNAVAILABLE', retryAfter: 60, uncertain: true, lease: fixtureLease(value) } : undefined });
  const session = await h.bootstrap();
  const response = await h.handle(h.request({ path: '/api/compose', method: 'POST', session, body: design() }));
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'quota_unavailable');
  assert.equal(h.calls.length, 0);
  const reserved = h.reservations.find((value) => value.funded);
  assert.equal(h.releases[0].requestId, reserved.requestId, 'The server-created operation ID is retained');
  assert.ok(Number.isSafeInteger(reserved.acceptBy) && reserved.acceptBy > Date.now(), 'Redis receives an immutable acceptance deadline');
  assert.deepEqual(h.settlements, [{ usedProviderCalls: 0, outcome: 'none' }]);
});

test('the funded daily pause returns a resetting allowance and Retry-After while personal keys still work', async () => {
  const resetAt = Date.UTC(2026, 9, 2);
  const h = harness({ env: fundedEnv(), allowance: () => ({ available: false, remaining: 6, resetAt, reason: 'day_closing', code: 'FREE_PAUSED' }), reservation: (value) => value.funded ? { granted: false, status: 503, code: 'FREE_PAUSED', retryAfter: 42 } : undefined });
  const session = await h.bootstrap();
  assert.deepEqual(session.freeAllowance, { available: false, remaining: 6, limit: 10, resetAt, reason: 'resetting' });
  const response = await h.handle(h.request({ path: '/api/compose', method: 'POST', session, body: design() }));
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('retry-after'), '42');
  const value = await response.json();
  assert.equal(value.code, 'free_paused');
  assert.equal(value.freeAllowance.reason, 'resetting');
  assert.equal(h.calls.length, 0);
  assert.equal((await h.handle(h.request({ path: '/api/connection', method: 'POST', session, body: { apiKey: key() } }))).status, 200);
});

// Cloudflare Turnstile. Siteverify is a synthetic fixture; nothing reaches Cloudflare.
async function withPass(h, session, headers) {
  const response = await h.handle(h.request({ path: '/api/challenge', method: 'POST', session, headers, body: { token: 'synthetic.turnstile-token_1' } }));
  assert.equal(response.status, 200);
  const [pass] = response.headers.getSetCookie();
  return { ...session, cookie: `${session.cookie}; ${pass.split(';')[0]}`, pass, value: await response.json() };
}
const live = (session, headers) => [
  { path: '/api/connection', method: 'POST', session, headers, body: { apiKey: key() } },
  { path: '/api/compose', method: 'POST', session, headers, body: { ...design(), apiKey: key() } }
];

test('with Turnstile enforced, live routes without a pass are refused before quota, body or provider work', async () => {
  const h = harness({ env: turnstileEnv() }), session = await h.bootstrap();
  assert.deepEqual(session.humanCheck, { mode: 'turnstile', siteKey: '0x4AAAAAAAsyntheticSiteKey', verifiedUntil: null });
  for (const options of [...live(session), { path: '/api/compose', method: 'POST', session, body: '{not json' }]) {
    const response = await h.handle(h.request(options));
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: 'Complete the browser check before using live JEV. Nothing was sent to the provider.', code: 'human_required' });
  }
  assert.deepEqual(h.reservations.map((value) => value.operation), ['bootstrap']);
  assert.equal(h.calls.length, 0);
  assert.equal(h.verifications.length, 0);
});

test('an accepted Turnstile token sets a hardened pass cookie and unlocks connection tests and compose', async () => {
  const h = harness({ env: turnstileEnv() }), session = await h.bootstrap();
  h.reservations.length = 0;
  const passed = await withPass(h, session);
  assert.match(passed.pass, /^__Host-Forma-Human=\d{10}\.[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; Secure; SameSite=Strict; Max-Age=\d+$/);
  assert.ok(!/domain=/i.test(passed.pass));
  const exp = Number(passed.pass.split('=')[1].split('.')[0]);
  assert.deepEqual(passed.value, { verified: true, expiresAt: exp * 1000 });
  assert.ok(exp * 1000 > Date.now() && exp * 1000 <= Date.now() + 86400000 + 1000);
  assert.deepEqual(h.reservations.map((value) => value.operation), ['request', 'challenge']);
  assert.match(h.reservations[1].networkHash, /^[0-9a-f]{64}$/);
  const [{ init }] = h.verifications;
  assert.equal(init.method, 'POST');
  assert.equal(init.redirect, 'error');
  assert.equal(init.cache, 'no-store');
  assert.equal(init.headers['Content-Type'], 'application/x-www-form-urlencoded');
  const form = new URLSearchParams(init.body);
  assert.deepEqual([...form.keys()], ['secret', 'response', 'remoteip', 'idempotency_key']);
  assert.equal(form.get('secret'), h.env.TURNSTILE_SECRET_KEY);
  assert.equal(form.get('response'), 'synthetic.turnstile-token_1');
  assert.equal(form.get('remoteip'), '192.0.2.22');
  assert.match(form.get('idempotency_key'), /^[0-9a-f-]{36}$/);
  for (const options of live(passed)) assert.equal((await h.handle(h.request(options))).status, 200);
  assert.equal(h.calls.length, 3, 'One key test and one two-pass design reached the provider fixture');
  const status = await h.handle(h.request({ headers: { cookie: passed.cookie } }));
  const value = await status.json();
  assert.deepEqual(value.humanCheck, { mode: 'turnstile', siteKey: '0x4AAAAAAAsyntheticSiteKey', verifiedUntil: exp * 1000 });
  for (const secret of [h.env.TURNSTILE_SECRET_KEY, h.env.TURNSTILE_SESSION_SECRET, 'synthetic.turnstile-token_1']) assert.ok(!JSON.stringify(value).includes(secret));
  assert.equal(h.verifications.length, 1, 'Status never calls Siteverify');
});

test('a pass is bound to its guest session, exact visitor IP, MAC, single cookie and pass secret', async () => {
  const env = turnstileEnv(), h = harness({ env }), session = await h.bootstrap(), other = await h.bootstrap();
  const passed = await withPass(h, session, { 'cf-connecting-ip': '2001:db8:1:2::10' });
  const [name, value] = passed.pass.split(';')[0].split('=');
  const [exp, mac] = value.split('.');
  const flipped = `${mac.slice(0, -1)}${mac.endsWith('A') ? 'B' : 'A'}`;
  const refused = [
    [{ ...other, cookie: `${other.cookie}; ${name}=${value}` }, '2001:db8:1:2::10'],
    [passed, '2001:db8:1:2::ffff'],
    [passed, '2001:db8:1:3::10'],
    [passed, '192.0.2.22'],
    [{ ...session, cookie: `${session.cookie}; ${name}=${exp}.${flipped}` }, '2001:db8:1:2::10'],
    [{ ...session, cookie: `${session.cookie}; ${name}=${Number(exp) - 60}.${mac}` }, '2001:db8:1:2::10'],
    [{ ...passed, cookie: `${passed.cookie}; ${name}=${value}` }, '2001:db8:1:2::10']
  ];
  const before = h.reservations.length;
  for (const [candidate, address] of refused) {
    const response = await h.handle(h.request(live(candidate, { 'cf-connecting-ip': address })[0]));
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, 'human_required');
  }
  assert.equal(h.reservations.length, before);
  const status = await (await h.handle(h.request({ headers: { cookie: passed.cookie, 'cf-connecting-ip': '2001:db8:1:2::ffff' } }))).json();
  assert.equal(status.humanCheck.verifiedUntil, null, 'Status reports a pass only for the current visitor IP');
  assert.equal((await h.handle(h.request(live(passed, { 'cf-connecting-ip': '2001:db8:1:2::10' })[0]))).status, 200, 'The pass still works from its own address');
  const rotated = harness({ env: { ...env, TURNSTILE_SESSION_SECRET: key() } });
  const response = await rotated.handle(rotated.request(live(passed, { 'cf-connecting-ip': '2001:db8:1:2::10' })[0]));
  assert.equal((await response.json()).code, 'human_required', 'Rotating the pass secret invalidates existing passes');
});

test('Siteverify rejections and outages never set a pass or reach the provider', async () => {
  const body = (value) => () => Response.json(value);
  const cases = [
    [body({ success: false, 'error-codes': ['invalid-input-response'] }), 403, 'human_failed'],
    [body({ success: false, 'error-codes': ['timeout-or-duplicate'] }), 403, 'human_failed'],
    [body({ ...accepted, action: 'other_action' }), 403, 'human_failed'],
    [body({ ...accepted, hostname: 'attacker.example' }), 403, 'human_failed'],
    [body({ ...accepted, hostname: 'localhost' }), 403, 'human_failed'],
    [body({ success: true, action: 'forma_live' }), 403, 'human_failed'],
    [body({ success: false, 'error-codes': ['internal-error'] }), 503, 'human_unavailable'],
    [body({ success: false, 'error-codes': ['invalid-input-secret'] }), 503, 'human_unavailable'],
    [body({ success: 'true', hostname: 'forma.example', action: 'forma_live' }), 503, 'human_unavailable'],
    [() => new Response('upstream failure', { status: 500 }), 503, 'human_unavailable'],
    [() => new Response('{"success":tru', { headers: { 'content-type': 'application/json' } }), 503, 'human_unavailable'],
    [() => new Response(JSON.stringify({ ...accepted, padding: 'x'.repeat(9000) })), 503, 'human_unavailable'],
    [() => { throw new TypeError('network failure'); }, 503, 'human_unavailable']
  ];
  for (const [siteverify, status, code] of cases) {
    const h = harness({ env: turnstileEnv(), siteverify }), session = await h.bootstrap();
    const response = await h.handle(h.request({ path: '/api/challenge', method: 'POST', session, body: { token: 'synthetic-token' } }));
    assert.equal(response.status, status);
    assert.equal((await response.json()).code, code);
    assert.equal(response.headers.getSetCookie().length, 0);
    if (status === 503) assert.equal(response.headers.get('retry-after'), '30');
    assert.equal(h.verifications.length, 1);
    assert.equal(h.calls.length, 0);
  }
});

test('the challenge route runs every hosted admission check and both reservations before Siteverify', async () => {
  const h = harness({ env: turnstileEnv() }), session = await h.bootstrap();
  h.reservations.length = 0;
  for (const [headers, expected] of [[{ cookie: '' }, 401], [{ 'x-csrf-token': '' }, 403], [{ origin: 'https://attacker.example' }, 403], [{ 'cf-connecting-ip': 'not-an-ip' }, 403], [{ 'x-forma-edge-token': key() }, 403]]) {
    const response = await h.handle(h.request({ path: '/api/challenge', method: 'POST', session, headers, body: { token: 'synthetic-token' } }));
    assert.equal(response.status, expected);
  }
  assert.equal((await h.handle(h.request({ path: '/api/challenge', session }))).status, 405);
  assert.equal(h.reservations.length, 0);
  for (const body of [{ token: '' }, { token: 'has space' }, { token: 'x'.repeat(2049) }, { token: 'ok', extra: true }, { token: 7 }, 'x'.repeat(4097)]) {
    const response = await h.handle(h.request({ path: '/api/challenge', method: 'POST', session, body }));
    assert.ok([400, 413].includes(response.status));
  }
  assert.equal(h.verifications.length, 0);
  for (const operation of ['request', 'challenge']) {
    const denied = harness({ env: turnstileEnv(), reservation: (value) => value.operation === operation ? { granted: false, status: 429, retryAfter: 12 } : undefined });
    const guest = await denied.bootstrap();
    const response = await denied.handle(denied.request({ path: '/api/challenge', method: 'POST', session: guest, body: { token: 'synthetic-token' } }));
    assert.equal(response.status, 429);
    assert.equal(response.headers.get('retry-after'), '12');
    assert.equal(denied.verifications.length, 0);
  }
});

test('TURNSTILE_ENFORCE=off skips the check; missing or invalid Turnstile settings fail closed for live routes only', async () => {
  const off = harness(), guest = await off.bootstrap();
  assert.deepEqual(guest.humanCheck, { mode: 'off' });
  assert.equal((await off.handle(off.request(live(guest)[0]))).status, 200);
  const hidden = await off.handle(off.request({ path: '/api/challenge', method: 'POST', session: guest, body: { token: 'synthetic-token' } }));
  assert.equal(hidden.status, 404);
  const variants = [
    { TURNSTILE_ENFORCE: undefined }, { TURNSTILE_ENFORCE: 'ON' }, { TURNSTILE_ENFORCE: 'true' },
    { NEXT_PUBLIC_TURNSTILE_SITE_KEY: undefined }, { NEXT_PUBLIC_TURNSTILE_SITE_KEY: '1x00000000000000000000AA' }, { NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'bad site key' },
    { TURNSTILE_SECRET_KEY: undefined }, { TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA' }, { TURNSTILE_SECRET_KEY: 'has space' },
    { TURNSTILE_SESSION_SECRET: 'too-short' }, { TURNSTILE_ALLOWED_HOSTNAMES: undefined }, { TURNSTILE_ALLOWED_HOSTNAMES: 'other.example, localhost' }, { TURNSTILE_ALLOWED_HOSTNAMES: 'forma.example, bad host' }
  ];
  for (const variant of variants) {
    const h = harness({ env: { ...turnstileEnv(), ...variant } }), session = await h.bootstrap();
    assert.deepEqual(session.humanCheck, { mode: 'unavailable' });
    for (const options of [live(session)[0], { path: '/api/challenge', method: 'POST', session, body: { token: 'synthetic-token' } }]) {
      const response = await h.handle(h.request(options));
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { error: 'Hosted service is not configured.', code: 'configuration' });
    }
    assert.deepEqual(h.reservations.map((value) => value.operation), ['bootstrap']);
    assert.equal(h.calls.length + h.verifications.length, 0);
  }
  const env = turnstileEnv(), shared = harness({ env: { ...env, TURNSTILE_SESSION_SECRET: env.FORMA_SESSION_SECRET } });
  assert.deepEqual((await shared.bootstrap()).humanCheck, { mode: 'unavailable' }, 'The pass secret must differ from the session secret');
});
