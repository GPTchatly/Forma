import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHostedQuota, extractTransportIp, hashQuotaIdentity, networkIdentity, HOSTED_QUOTA_LIMITS } from '../hosted/quota.mjs';

const fixtureEndpoint = ['https:/', 'forma-fixture.upstash.io'].join('/');
const fixtureToken = ['fixture', 'token', 'not', 'a', 'real', 'secret'].join('-');
const env = { QWEN3_KV_REST_API_URL: fixtureEndpoint, QWEN3_KV_REST_API_TOKEN: fixtureToken };
const sessionId = '66666666-6666-4666-8666-666666666666';
const ipHash = 'a'.repeat(64), keyHash = 'b'.repeat(64);
const visitorIpHash = 'c'.repeat(64), evidenceHash = 'e'.repeat(64), networkHash = 'f'.repeat(64);
const reservation = (operation = 'compose', overrides = {}) => ({ sessionId, ipHash, visitorIpHash, keyHash, evidenceHash, networkHash, requestId: randomUUID(), operation, ...overrides });
const funded = (overrides = {}) => reservation('compose', { funded: true, acceptBy: Date.now() + HOSTED_QUOTA_LIMITS.fundedAcceptMs, evidenceHash: undefined, networkHash: undefined, ...overrides });
const redisNow = 1790500000000, dayEnd = 1790553600000;
const granted = (extra = 0) => [1, 'ok', 0, redisNow, dayEnd, extra];
const response = (result = granted()) => new Response(JSON.stringify({ result }));
const unavailable = { granted: false, status: 503, code: 'SERVICE_UNAVAILABLE', retryAfter: 60 };
const uncertain = (value) => ({ ...unavailable, uncertain: true, lease: value });
function commandPolicies(command) {
  const value = JSON.parse(command[command.length - 2]);
  return Array.isArray(value) ? value : value.policies;
}
const keysOf = (command) => command.slice(3, 3 + command[2]);
const workLease = (value) => ({ kind: 'work', sessionId: value.sessionId, keyHash: value.keyHash, requestId: value.requestId, networkHash: value.networkHash, evidenceHash: value.evidenceHash });

test('quota configuration restricts Redis to its exact HTTPS allowlist and fails closed without network', async () => {
  let calls = 0;
  for (const endpoint of ['', 'http://forma-fixture.upstash.io', 'https://upstash.io', 'https://a.upstash.io.evil.test', 'https://127.0.0.1', 'https://a.upstash.io:8443', ['https://user:pass', 'a.upstash.io'].join('@'), 'https://a.upstash.io/path', 'https://a.upstash.io/?q=x', 'https://a.upstash.io/#x']) {
    const quota = createHostedQuota({ env: { ...env, QWEN3_KV_REST_API_URL: endpoint }, fetchImpl: async () => { calls++; return response(); } });
    assert.deepEqual(await quota.reserveUsage(reservation()), unavailable);
  }
  for (const token of ['', 'short', 'A'.repeat(2049), 'fixture-token\r\nX-Evil: yes']) {
    const quota = createHostedQuota({ env: { ...env, QWEN3_KV_REST_API_TOKEN: token }, fetchImpl: async () => { calls++; return response(); } });
    assert.deepEqual(await quota.reserveUsage(reservation()), unavailable);
  }
  assert.equal(calls, 0);
});

test('verified personal-key work uses authored Lua, strict transport options and reserves both composition passes', async () => {
  const calls = [];
  const quota = createHostedQuota({ env: { ...env, QWEN3_KV_REST_API_TOKEN: ['fixture/', 'plus+token=='].join('') }, fetchImpl: async (url, options) => { calls.push({ url, options }); return response(); } });
  const request = reservation();
  const result = await quota.reserveUsage(request);
  assert.equal(result.granted, true);
  assert.deepEqual(result.lease, workLease(request));
  assert.equal(calls[0].url, env.QWEN3_KV_REST_API_URL);
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(calls[0].options.cache, 'no-store');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer fixture/plus+token==');
  const command = JSON.parse(calls[0].options.body);
  assert.equal(command[0], 'EVAL');
  const policies = commandPolicies(command);
  assert.equal(policies[0].kind, 'evidence', 'Server-side key evidence is checked before any charge');
  assert.equal(keysOf(command)[policies[0].k - 1], `forma:{quota-v1}:verify:${evidenceHash}`);
  assert.deepEqual(policies.filter(({ kind }) => kind === 'daily').map(({ units, limit }) => [units, limit]), [[2, 200], [2, 200]]);
  assert.deepEqual(policies.filter(({ kind }) => kind === 'burst').map(({ units, limit }) => [units, limit]), [[2, 10], [2, 10], [2, 240], [2, 240]]);
  assert.deepEqual(policies.filter(({ kind }) => kind === 'lease').map(({ units, limit }) => [units, limit]), [[1, 1], [1, 2], [1, 50]]);
  assert.equal(keysOf(command).some((key) => key.includes('daily:provider:global')), false, 'No shared provider counter waits for midnight');
  assert.match(command[1], /redis.call\('TIME'\)/);
  assert.equal(command[1].includes(sessionId), false);
  assert.equal(HOSTED_QUOTA_LIMITS.providerLeaseMs, 60000);
  for (const scope of ['status', 'requests', 'provider', 'probes']) {
    assert.equal(HOSTED_QUOTA_LIMITS[`${scope}PerTransportIpMinute`], HOSTED_QUOTA_LIMITS[`${scope}GlobalMinute`], `A shared Cloudflare address cannot lower the ${scope} ceiling`);
  }
});

test('QWEN3_LIMIT configures both provider minute budgets and invalid policy fails closed', async () => {
  const commands = [];
  const quota = createHostedQuota({ env: { ...env, QWEN3_LIMIT: '16' }, fetchImpl: async (_url, options) => { commands.push(JSON.parse(options.body)); return response(); } });
  assert.equal((await quota.reserveUsage(reservation())).granted, true);
  assert.deepEqual(commandPolicies(commands[0]).filter(({ kind }) => kind === 'burst').map(({ limit }) => limit), [16, 16, 240, 240]);
  for (const limit of ['', '0', '-1', '1.5', '121', '1000000', 'NaN', ' 10', '10 ', '01']) {
    const invalid = createHostedQuota({ env: { ...env, QWEN3_LIMIT: limit }, fetchImpl: async () => { throw new Error('Should not contact Redis'); } });
    assert.deepEqual(await invalid.reserveUsage(reservation()), unavailable);
  }
});

test('status and parsing admission replenish per visitor, transport and deployment without a daily switch', async () => {
  const commands = [];
  const quota = createHostedQuota({ env, fetchImpl: async (_url, options) => { commands.push(JSON.parse(options.body)); return response(); } });
  assert.deepEqual(await quota.reserveUsage(reservation('bootstrap', { sessionId: undefined, keyHash: undefined })), { granted: true });
  assert.deepEqual(await quota.reserveUsage(reservation('request', { keyHash: undefined })), { granted: true });
  assert.deepEqual(commandPolicies(commands[0]).map(({ kind, limit }) => [kind, limit]), [['burst', 10], ['burst', 300], ['burst', 300]]);
  assert.deepEqual(commandPolicies(commands[1]).map(({ kind, limit }) => [kind, limit]), [['burst', 30], ['burst', 120], ['burst', 600], ['burst', 600]]);
  assert.ok(keysOf(commands[0]).includes(`forma:{quota-v1}:burst:bootstrap:visitor:${visitorIpHash}`));
  assert.ok(keysOf(commands[1]).includes(`forma:{quota-v1}:burst:request:visitor:${visitorIpHash}`));
  assert.equal(await quota.reserveUsage(reservation('bootstrap', { visitorIpHash: undefined })).then((value) => value.granted), false, 'A missing visitor identity is refused');
  assert.equal(commands.length, 2);
});

test('unknown-key tests use a separate probe partition, cooldown, key backoff and evidence generation', async () => {
  const commands = [];
  const quota = createHostedQuota({ env, fetchImpl: async (_url, options) => { commands.push(JSON.parse(options.body)); return response(granted(7)); } });
  const request = reservation('connection');
  const result = await quota.reserveUsage(request);
  assert.deepEqual(result.lease, { kind: 'probe', sessionId, keyHash, requestId: request.requestId, visitorIpHash, networkHash, evidenceHash, generation: 7 });
  const policies = commandPolicies(commands[0]), keys = keysOf(commands[0]);
  assert.deepEqual(policies.filter(({ kind }) => kind === 'block').map(({ reason, k }) => [reason, keys[k - 1]]), [['cooldown', `forma:{quota-v1}:cooldown:probe:${networkHash}`], ['backoff', `forma:{quota-v1}:backoff:key:${keyHash}`]]);
  assert.deepEqual(policies.filter(({ kind }) => kind === 'burst').map(({ limit, units }) => [limit, units]), [[3, 1], [6, 1], [60, 1], [60, 1]]);
  assert.deepEqual(policies.filter(({ kind }) => kind === 'lease').map(({ limit }) => limit), [1, 10]);
  assert.equal(keys[policies.find(({ kind }) => kind === 'observe').k - 1], `forma:{quota-v1}:verify:${evidenceHash}`);
  assert.equal(keys.some((key) => /provider|lease:global$|lease:session|daily/.test(key)), false, 'Probes cannot consume verified or funded work capacity');
});

test('browser-check challenges use their own replenishing visitor, network, transport and deployment windows', async () => {
  const commands = [];
  const quota = createHostedQuota({ env, fetchImpl: async (_url, options) => { commands.push(JSON.parse(options.body)); return response(); } });
  assert.deepEqual(await quota.reserveUsage(reservation('challenge', { keyHash: undefined, evidenceHash: undefined })), { granted: true });
  const policies = commandPolicies(commands[0]), keys = keysOf(commands[0]);
  assert.deepEqual(policies.map(({ kind, limit, units }) => [kind, limit, units]), [['burst', 5, 1], ['burst', 10, 1], ['burst', 120, 1], ['burst', 120, 1]]);
  assert.deepEqual(policies.map(({ k }) => keys[k - 1]), [`forma:{quota-v1}:burst:challenge:visitor:${visitorIpHash}`, `forma:{quota-v1}:burst:challenge:network:${networkHash}`, `forma:{quota-v1}:burst:challenge:ip:${ipHash}`, 'forma:{quota-v1}:burst:challenge:global']);
  assert.ok(keys.every((key) => key.startsWith('forma:{quota-v1}:')));
  for (const override of [{ networkHash: undefined }, { networkHash: 'raw-network' }, { sessionId: undefined }]) assert.deepEqual(await quota.reserveUsage(reservation('challenge', override)), unavailable);
  assert.equal(commands.length, 1);
});

test('free allowance uses a separate visitor identity, operator budget, UTC cutoff and durable receipt', async () => {
  const commands = [];
  const quota = createHostedQuota({ env, fetchImpl: async (_url, options) => {
    const command = JSON.parse(options.body); commands.push(command);
    return response(command[1].includes("'cancelled'") ? [1, 'closed', 1] : granted(redisNow + 50000));
  } });
  assert.deepEqual(await quota.reserveUsage(funded({ visitorIpHash: undefined })), unavailable);
  assert.deepEqual(await quota.reserveUsage(funded({ acceptBy: undefined })), unavailable);
  assert.deepEqual(await quota.reserveUsage(reservation('connection', { funded: true, acceptBy: Date.now() })), unavailable, 'Connection tests are never funded');
  assert.equal(commands.length, 0);
  const request = funded();
  const result = await quota.reserveUsage(request);
  assert.deepEqual(result, { granted: true, lease: { kind: 'funded', operation: 'compose', sessionId, keyHash, requestId: request.requestId, visitorIpHash, units: 2 }, remainingMs: 50000, dayEndMs: dayEnd - redisNow });
  const spec = JSON.parse(commands[0][commands[0].length - 2]), keys = keysOf(commands[0]);
  assert.deepEqual(keys.slice(0, 4), [`forma:{quota-v1}:receipts:${visitorIpHash}`, `forma:{quota-v1}:receipts-index:${visitorIpHash}`, `forma:{quota-v1}:daily:free:visitor:${visitorIpHash}`, 'forma:{quota-v1}:daily:free:global']);
  assert.equal(spec.acceptBy, request.acceptBy);
  assert.equal(spec.receiptMs, 50000);
  assert.deepEqual(spec.receipt, { sessionId, keyHash, units: 2, operation: 'compose' });
  const { policies } = spec;
  assert.deepEqual(policies.slice(0, 2).map(({ kind, reason, ms }) => [kind, reason ?? ms]), [['block', 'unavailable'], ['cutoff', 60000]]);
  assert.deepEqual(policies.filter(({ funded: free }) => free).map(({ limit, units, k }) => [limit, units, k]), [[10, 2, 3], [500, 2, 4]]);
  assert.deepEqual(policies.filter(({ kind }) => kind === 'lease').map(({ limit }) => limit), [1, 10, 50]);
  assert.deepEqual(policies.filter(({ kind }) => kind === 'burst').map(({ limit }) => limit), [10, 60, 240, 240]);
  assert.equal(keys.some((key) => key.includes(`daily:provider:key:${keyHash}`)), false);
  assert.equal(await quota.releaseUsage(result.lease, { usedProviderCalls: 1 }), true);
  assert.equal(commands[1][2], 7);
  assert.deepEqual(commands[1].slice(-5), [request.requestId, 1, sessionId, keyHash, HOSTED_QUOTA_LIMITS.receiptRetentionMs]);
  assert.equal(await quota.releaseUsage(result.lease, { usedProviderCalls: -1 }), false);
  assert.equal(await quota.releaseUsage(result.lease, { usedProviderCalls: 3 }), false);
  assert.equal(commands.length, 2);
});

test('funded pass authorization is ordered, bounded and never granted from a malformed reply', async () => {
  const commands = [];
  let reply = [1, 'ok', 49000];
  const quota = createHostedQuota({ env, fetchImpl: async (_url, options) => { commands.push(JSON.parse(options.body)); return response(reply); } });
  const lease = { kind: 'funded', operation: 'compose', sessionId, keyHash, requestId: randomUUID(), visitorIpHash, units: 2 };
  assert.deepEqual(await quota.authorizePass(lease, 1), { granted: true, remainingMs: 49000 });
  assert.deepEqual(commands[0].slice(2), [1, `forma:{quota-v1}:receipts:${visitorIpHash}`, lease.requestId, 1, sessionId, keyHash]);
  for (const value of [[0, 'order', 0], [1, 'ok', 0], [1, 'ok', 60000], [1, 'maybe', 100]]) {
    reply = value;
    assert.deepEqual(await quota.authorizePass(lease, 2), { granted: false });
  }
  for (const [candidate, pass] of [[lease, 0], [lease, 3], [{ ...lease, kind: 'work' }, 1], [{ ...lease, requestId: 'forged' }, 1]]) assert.deepEqual(await quota.authorizePass(candidate, pass), { granted: false });
  assert.equal(commands.length, 5);
});

test('lost funded settlement acknowledgements are retried once with the same operation and count', async () => {
  const bodies = [];
  let failures = 1;
  const quota = createHostedQuota({ env, fetchImpl: async (_url, options) => { bodies.push(options.body); if (failures-- > 0) throw new Error('lost reply'); return response([1, 'closed', 1]); } });
  const lease = { kind: 'funded', operation: 'compose', sessionId, keyHash, requestId: randomUUID(), visitorIpHash, units: 2 };
  assert.equal(await quota.releaseUsage(lease, { usedProviderCalls: 1 }), true);
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0], bodies[1]);
  failures = 5; bodies.length = 0;
  assert.equal(await quota.releaseUsage(lease, { usedProviderCalls: 1 }), false);
  assert.equal(bodies.length, 2, 'At most one retry');
});

test('lost verification outcomes are retried once; lease-only releases are not', async () => {
  const bodies = [];
  let failures = 1;
  const quota = createHostedQuota({ env, fetchImpl: async (_url, options) => { bodies.push(options.body); if (failures-- > 0) throw new Error('lost reply'); return response([1, 'revoked']); } });
  const lease = { kind: 'work', ...workLease(reservation()) };
  assert.equal(await quota.releaseUsage(lease, { outcome: 'credentials' }), true);
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0], bodies[1]);
  failures = 5; bodies.length = 0;
  assert.equal(await quota.releaseUsage(lease, { outcome: 'credentials' }), false);
  assert.equal(bodies.length, 2, 'At most one retry');
  failures = 5; bodies.length = 0;
  assert.equal(await quota.releaseUsage(lease), false);
  assert.equal(bodies.length, 1, 'Expiring leases are not retried');
});

test('free budget configuration is bounded and no cloud read-only token is used as a write credential', async () => {
  for (const limit of ['', '0', '5001', '-1', '1.5', ' 10']) {
    const quota = createHostedQuota({ env: { ...env, FORMA_FREE_GLOBAL_DAILY_LIMIT: limit }, fetchImpl: async () => { throw new Error('No network expected'); } });
    assert.deepEqual(await quota.reserveUsage(funded()), unavailable);
  }
  const quota = createHostedQuota({ env: { QWEN3_KV_REST_API_URL: fixtureEndpoint, QWEN3_KV_REST_API_READ_ONLY_TOKEN: fixtureToken }, fetchImpl: async () => { throw new Error('No network expected'); } });
  assert.deepEqual(await quota.reserveUsage(reservation()), unavailable);
});

test('free status validates service replies and status failures never claim provider credit', async () => {
  const resetAt = 1790553600000;
  for (const [result, expected] of [
    [[1, 10, resetAt, 'ok'], { available: true, remaining: 10, resetAt }],
    [[0, 0, resetAt, 'credits'], { available: false, remaining: 0, resetAt, code: 'FREE_UNAVAILABLE', reason: 'credits' }],
    [[0, 6, resetAt, 'day_closing'], { available: false, remaining: 6, resetAt, code: 'FREE_PAUSED', reason: 'day_closing' }],
    [[1, 11, resetAt, 'ok'], { available: false, remaining: 0, resetAt: null, code: 'SERVICE_UNAVAILABLE' }],
    [[0, 0, resetAt, 'private upstream diagnostic'], { available: false, remaining: 0, resetAt: null, code: 'SERVICE_UNAVAILABLE' }]
  ]) {
    const quota = createHostedQuota({ env, fetchImpl: async () => response(result) });
    assert.deepEqual(await quota.statusFree({ visitorIpHash, keyHash }), expected);
  }
  for (const [reason, code, status] of [['free_daily', 'FREE_LIMIT_REACHED', 429], ['unavailable', 'FREE_UNAVAILABLE', 503], ['day_closing', 'FREE_PAUSED', 503]]) {
    const quota = createHostedQuota({ env, fetchImpl: async () => response([0, reason, 60, redisNow, dayEnd, 0]) });
    assert.deepEqual(await quota.reserveUsage(funded()), { granted: false, code, status, retryAfter: 60 });
  }
  const expired = createHostedQuota({ env, fetchImpl: async () => response([0, 'expired', 60, redisNow, dayEnd, 0]) });
  assert.deepEqual(await expired.reserveUsage(funded()), unavailable, 'A refused late command is not uncertain');
});

test('operator health accepts only bounded reason enums and never persists raw diagnostics', async () => {
  const commands = [];
  const quota = createHostedQuota({ env, fetchImpl: async (_url, options) => { commands.push(JSON.parse(options.body)); return response(1); } });
  assert.equal(await quota.markOperatorUnavailable({ keyHash, reason: 'credits' }), true);
  assert.equal(await quota.markOperatorUnavailable({ keyHash, reason: 'raw private error body' }), false);
  assert.equal(commands.length, 1);
  assert.equal(commands[0][3], `forma:{quota-v1}:health:free-key:${keyHash}`);
  assert.equal(commands[0][4], 'credits');
  assert.match(commands[0][1], /'EX', 300/);
});

test('malformed internal identities and unrecognized operations never reach Redis', async () => {
  let calls = 0;
  const quota = createHostedQuota({ env, fetchImpl: async () => { calls++; return response(); } });
  for (const override of [{ requestId: 'client-request' }, { sessionId: 'untrusted' }, { ipHash: '127.0.0.1' }, { visitorIpHash: '192.0.2.1' }, { keyHash: 'raw-provider-key' }, { evidenceHash: undefined }, { networkHash: 'raw-network' }, { operation: 'refund' }, { keyHash: undefined }, { funded: 'true' }]) {
    assert.deepEqual(await quota.reserveUsage(reservation('compose', override)), unavailable);
  }
  assert.equal(calls, 0);
});

test('Redis errors, malformed replies and provider diagnostics never escape; uncertain holds keep their descriptor', async () => {
  for (const body of [{ error: 'private Redis credential or internal diagnostic' }, { result: [1, 'ok', 0, redisNow, dayEnd, 0], extra: true }, { result: [0, 'burst', 999999, redisNow, dayEnd, 0] }, { result: [1, 'maybe', 0, redisNow, dayEnd, 0] }, { result: [1, 'ok', 0] }, { result: 'OK' }, []]) {
    const quota = createHostedQuota({ env, fetchImpl: async () => new Response(JSON.stringify(body)) });
    const request = reservation();
    assert.deepEqual(await quota.reserveUsage(request), uncertain(workLease(request)));
    assert.deepEqual(await quota.reserveUsage(reservation('bootstrap', { sessionId: undefined, keyHash: undefined })), unavailable);
  }
  const quota = createHostedQuota({ env, fetchImpl: async () => { throw new Error('private Redis credential or internal diagnostic'); } });
  const request = funded();
  assert.deepEqual(await quota.reserveUsage(request), uncertain({ kind: 'funded', operation: 'compose', sessionId, keyHash, requestId: request.requestId, visitorIpHash, units: 2 }));
  for (const [reason, status, code] of [['burst', 429, 'RATE_LIMITED'], ['daily', 429, 'RATE_LIMITED'], ['lease', 429, 'RATE_LIMITED'], ['duplicate', 429, 'RATE_LIMITED'], ['backoff', 429, 'RATE_LIMITED'], ['cooldown', 429, 'PROBE_COOLDOWN'], ['verification_required', 428, 'VERIFICATION_REQUIRED']]) {
    const limited = createHostedQuota({ env, fetchImpl: async () => response([0, reason, 60, redisNow, dayEnd, 0]) });
    assert.deepEqual(await limited.reserveUsage(reservation()), { granted: false, status, code, retryAfter: 60 });
  }
});

test('Redis replies are bounded before buffering and rejected bodies are cancelled', async () => {
  for (const init of [{ status: 401 }, { headers: { 'Content-Length': '8193' } }]) {
    let cancelled = false;
    const quota = createHostedQuota({ env, fetchImpl: async () => new Response(new ReadableStream({ cancel() { cancelled = true; } }), init) });
    assert.equal((await quota.reserveUsage(reservation())).status, 503);
    assert.equal(cancelled, true);
  }
  let chunks = 0, cancelled = false;
  const quota = createHostedQuota({ env, fetchImpl: async () => new Response(new ReadableStream({
    pull(controller) { chunks++; controller.enqueue(new Uint8Array(4096).fill(32)); },
    cancel() { cancelled = true; }
  })) });
  assert.equal((await quota.reserveUsage(reservation())).status, 503);
  assert.equal(cancelled, true);
  assert.ok(chunks <= 4);
});

test('request cancellation stops a stalled Redis response body', { timeout: 5000 }, async () => {
  const controller = new AbortController();
  let started, cancelled = false;
  const reading = new Promise((resolve) => { started = resolve; });
  const quota = createHostedQuota({ env, fetchImpl: async () => new Response(new ReadableStream({ pull() { started(); }, cancel() { cancelled = true; } })) });
  const request = reservation('compose', { signal: controller.signal });
  const pending = quota.reserveUsage(request);
  await reading;
  controller.abort();
  assert.deepEqual(await pending, uncertain(workLease(request)), 'The command was sent, so its hold is uncertain');
  assert.equal(cancelled, true);
});

test('aborted calls never contact Redis and lease release has an independent bounded lifetime', async () => {
  const calls = [];
  const quota = createHostedQuota({ env, fetchImpl: async (_url, options) => { calls.push(options); return response(JSON.parse(options.body)[1].includes("'released'") ? [1, 'released'] : granted()); } });
  const controller = new AbortController();
  controller.abort();
  assert.deepEqual(await quota.reserveUsage(reservation('compose', { signal: controller.signal })), unavailable);
  assert.equal(calls.length, 0);
  const { lease } = await quota.reserveUsage(reservation());
  assert.equal(await quota.releaseUsage(lease), true);
  const release = JSON.parse(calls[1].body);
  assert.equal(release[0], 'EVAL');
  assert.equal(release[2], 3);
  assert.ok(release.slice(3, 6).every((key) => key.startsWith('forma:{quota-v1}:lease:')));
  assert.deepEqual(release.slice(6, 9), [3, lease.requestId, 'none']);
  assert.equal(calls[1].signal.aborted, false);
  assert.equal(await quota.releaseUsage({ ...lease, requestId: 'forged' }), false);
  assert.equal(await quota.releaseUsage(lease, { outcome: 'verified' }), false, 'Only a probe can record verification');
  assert.equal(await quota.releaseUsage(lease, { outcome: 'raw provider body' }), false);
  assert.equal(calls.length, 2);
});

test('probe outcomes add evidence, revocation, cooldown and backoff keys only when needed', async () => {
  const commands = [];
  let reply = [1, 'verified'];
  const quota = createHostedQuota({ env, fetchImpl: async (_url, options) => { const command = JSON.parse(options.body); commands.push(command); return response(command[1].includes("'released'") ? reply : granted(3)); } });
  const { lease } = await quota.reserveUsage(reservation('connection'));
  assert.equal(await quota.releaseUsage(lease, { outcome: 'verified' }), true);
  const verified = commands[1];
  assert.deepEqual(keysOf(verified), [`forma:{quota-v1}:lease:probe:visitor:${visitorIpHash}`, 'forma:{quota-v1}:lease:probe:global', `forma:{quota-v1}:verify:${evidenceHash}`, `forma:{quota-v1}:failures:probe:${networkHash}`, `forma:{quota-v1}:cooldown:probe:${networkHash}`, `forma:{quota-v1}:backoff:key:${keyHash}`]);
  assert.deepEqual(verified.slice(9, 13), [2, lease.requestId, 'verified', 3], 'The admission generation guards late successes');
  reply = [1, 'stale'];
  assert.equal(await quota.releaseUsage(lease, { outcome: 'verified' }), 'stale');
  reply = [1, 'revoked'];
  assert.equal(await quota.releaseUsage(lease, { outcome: 'credentials' }), true);
});

test('transport identity uses only Vercel forwarding; visitor networks group IPv6 by /64 and hashes are purpose scoped', () => {
  assert.equal(extractTransportIp({ 'x-forwarded-for': '198.51.100.19, 10.0.0.2', 'cf-connecting-ip': '203.0.113.1' }), '198.51.100.19');
  assert.equal(extractTransportIp(new Headers({ 'x-forwarded-for': '2001:0db8:0000:0000:0000:0000:0000:0001' })), '2001:db8::1');
  for (const headers of [{ ip: '198.51.100.19' }, { 'cf-connecting-ip': '198.51.100.19' }, { 'x-forwarded-for': ['198.51.100.19'] }, { 'x-forwarded-for': 'not-an-ip' }, { 'x-forwarded-for': 'x'.repeat(513) }]) assert.throws(() => extractTransportIp(headers), /unavailable/);
  assert.equal(networkIdentity('2001:0db8:0001:0002:0003:0004:0005:0006'), '2001:db8:1:2::/64');
  assert.equal(networkIdentity('2001:db8:1:2::ffff'), '2001:db8:1:2::/64');
  assert.equal(networkIdentity('2001:DB8::1'), '2001:db8:0:0::/64');
  assert.equal(networkIdentity('::ffff:192.0.2.1'), '::ffff:c000:201', 'IPv4-mapped addresses are single hosts');
  assert.equal(networkIdentity('192.0.2.1'), '192.0.2.1');
  const secret = 'fixture-secret-for-hmac-only-00000000000';
  const hashedIp = hashQuotaIdentity('198.51.100.19', secret, 'ip');
  assert.match(hashedIp, /^[0-9a-f]{64}$/);
  assert.notEqual(hashedIp, hashQuotaIdentity('198.51.100.19', secret, 'key'));
  assert.notEqual(hashedIp, hashQuotaIdentity('198.51.100.19', secret, 'network'));
  assert.notEqual(hashQuotaIdentity('typesafe\nkey', secret, 'evidence'), hashQuotaIdentity('openrouter\nkey', secret, 'evidence'));
  assert.notEqual(hashedIp, hashQuotaIdentity('198.51.100.19', `${secret}2`, 'ip'));
  assert.throws(() => hashQuotaIdentity('value', 'short', 'key'), /unavailable/);
  assert.throws(() => hashQuotaIdentity('value', secret, 'raw'), /unavailable/);
});

// Optional real-engine verification. The named container must be a disposable,
// labelled Forma test container; no cloud account or ambient Redis URL is used.
test('actual Redis serializes concurrent quota reservation, receipts and recovery', { skip: !process.env.FORMA_REDIS_TEST_CONTAINER, timeout: 600000 }, async (t) => {
  const container = process.env.FORMA_REDIS_TEST_CONTAINER;
  assert.match(container, /^forma-quota-test-[a-f0-9]{8}$/);
  const run = promisify(execFile);
  const { stdout: marker } = await run('podman', ['inspect', container, '--format', '{{index .Config.Labels "io.forma.test"}}']);
  assert.equal(marker.trim(), 'hosted-quota');
  const redis = async (...command) => {
    const { stdout } = await run('podman', ['exec', container, 'redis-cli', '--json', ...command.map(String)], { maxBuffer: 1024 * 1024 });
    return JSON.parse(stdout);
  };
  // Only this labelled, network-isolated disposable engine is changed. Leaving
  // its default disk snapshot schedule enabled conflicts with its read-only root.
  await redis('CONFIG', 'SET', 'save', '');
  const commands = [];
  let rewrite = (command) => command;
  const quota = createHostedQuota({ env, fetchImpl: async (_url, options) => {
    const command = rewrite(JSON.parse(options.body));
    commands.push(command);
    return response(await redis(...command));
  } });
  const reset = async () => { await redis('FLUSHDB'); commands.length = 0; rewrite = (command) => command; };
  const today = async () => Math.floor(Number((await redis('TIME'))[0]) / 86400);
  const verify = (hash = evidenceHash) => redis('HSET', `forma:{quota-v1}:verify:${hash}`, 'state', 'verified', 'gen', 0);
  const receiptKey = (visitor = visitorIpHash) => `forma:{quota-v1}:receipts:${visitor}`;
  const remainingFree = async (visitor = visitorIpHash) => (await quota.statusFree({ visitorIpHash: visitor, keyHash })).remaining;
  const expireReceipt = async (requestId, changes = {}) => {
    const receipt = JSON.parse(await redis('HGET', receiptKey(), requestId));
    const past = Number((await redis('TIME'))[0]) * 1000 - 1000;
    await redis('HSET', receiptKey(), requestId, JSON.stringify({ ...receipt, deadline: past, ...changes }));
    await redis('ZADD', `forma:{quota-v1}:receipts-index:${visitorIpHash}`, past, requestId);
  };

  await t.test('same session allows one in-flight operation and release never refunds personal-key costs', async () => {
    await reset(); await verify();
    const results = await Promise.all(Array.from({ length: 12 }, () => quota.reserveUsage(reservation())));
    assert.equal(results.filter(({ granted: allowed }) => allowed).length, 1);
    assert.equal(results.filter(({ status }) => status === 429).length, 11);
    const grantedResult = results.find(({ granted: allowed }) => allowed);
    assert.equal(await quota.releaseUsage(grantedResult.lease), true);
    assert.equal(await redis('HGET', `forma:{quota-v1}:daily:provider:key:${keyHash}`, 'used'), '2');
    assert.equal((await quota.reserveUsage(reservation())).granted, true);
  });
  await t.test('unverified random keys sent directly to compose are refused before any counter changes', async () => {
    await reset();
    const results = await Promise.all(Array.from({ length: 6 }, (_, index) => quota.reserveUsage(reservation('compose', { sessionId: randomUUID(), keyHash: String(index).repeat(64), evidenceHash: String(index).repeat(64) }))));
    assert.ok(results.every((value) => value.code === 'VERIFICATION_REQUIRED' && value.status === 428));
    assert.equal(await redis('DBSIZE'), 0, 'No burst, daily, lease or replay state was written');
  });
  await t.test('same provider key allows only two simultaneous sessions', async () => {
    await reset(); await verify();
    const results = await Promise.all(Array.from({ length: 12 }, () => quota.reserveUsage(reservation('compose', { sessionId: randomUUID() }))));
    assert.equal(results.filter(({ granted: allowed }) => allowed).length, 2);
    assert.equal(results.filter(({ status }) => status === 429).length, 10);
    await Promise.all(results.filter(({ granted: allowed }) => allowed).map(({ lease }) => quota.releaseUsage(lease)));
  });
  await t.test('session sliding window counts two units per composition', async () => {
    await reset(); await verify();
    for (let index = 0; index < 5; index++) {
      const result = await quota.reserveUsage(reservation());
      assert.equal(result.granted, true);
      await quota.releaseUsage(result.lease);
    }
    const limited = await quota.reserveUsage(reservation());
    assert.equal(limited.status, 429);
    assert.ok(limited.retryAfter >= 1 && limited.retryAfter <= 60, 'A replenishing window reports when capacity returns');
    assert.equal(await redis('HGET', `forma:{quota-v1}:daily:provider:key:${keyHash}`, 'used'), '10');
  });
  await t.test('personal-key daily boundary admits exactly one concurrent remaining reservation', async () => {
    await reset(); await verify();
    await redis('HSET', `forma:{quota-v1}:daily:provider:key:${keyHash}`, 'day', await today(), 'used', 198);
    const results = await Promise.all(Array.from({ length: 8 }, (_, index) => quota.reserveUsage(reservation('compose', { sessionId: randomUUID(), ipHash: String(index).repeat(64) }))));
    assert.equal(results.filter(({ granted: allowed }) => allowed).length, 1);
    assert.equal(await redis('HGET', `forma:{quota-v1}:daily:provider:key:${keyHash}`, 'used'), '200');
  });
  await t.test('key burst limits remain shared when sessions and network identities change', async () => {
    await reset(); await verify();
    const now = Number((await redis('TIME'))[0]) * 1000;
    await redis('ZADD', `forma:{quota-v1}:burst:provider:key:${keyHash}`, ...Array.from({ length: 8 }, (_, index) => [now, `earlier-${index}`]).flat());
    const result = await quota.reserveUsage(reservation('compose', { sessionId: randomUUID(), ipHash: 'c'.repeat(64) }));
    assert.equal(result.granted, true);
    await quota.releaseUsage(result.lease);
    assert.equal((await quota.reserveUsage(reservation('compose', { sessionId: randomUUID(), ipHash: 'd'.repeat(64) }))).status, 429);
  });
  await t.test('session daily ceiling cannot be reset by changing provider keys', async () => {
    await reset(); await verify('d'.repeat(64));
    await redis('HSET', `forma:{quota-v1}:daily:provider:session:${sessionId}`, 'day', await today(), 'used', 200);
    assert.equal((await quota.reserveUsage(reservation('compose', { keyHash: 'c'.repeat(64), evidenceHash: 'd'.repeat(64) }))).status, 429);
    assert.equal(await redis('EXISTS', `forma:{quota-v1}:daily:provider:key:${'c'.repeat(64)}`), 0);
  });
  await t.test('Redis UTC day rollover resets session and key daily counters together', async () => {
    await reset(); await verify();
    const previousDay = await today() - 1;
    for (const [scope, used] of [[`session:${sessionId}`, 200], [`key:${keyHash}`, 200]]) await redis('HSET', `forma:{quota-v1}:daily:provider:${scope}`, 'day', previousDay, 'used', used);
    assert.equal((await quota.reserveUsage(reservation())).granted, true);
    for (const scope of [`session:${sessionId}`, `key:${keyHash}`]) assert.equal(await redis('HGET', `forma:{quota-v1}:daily:provider:${scope}`, 'used'), '2');
  });
  await t.test('no deployment-wide daily switch remains; global windows replenish and the in-flight cap holds', async () => {
    await reset(); await verify();
    const day = await today();
    for (const [scope, used] of [['provider:global', 5000], ['bootstrap:global', 30000], ['request:global', 100000]]) await redis('HSET', `forma:{quota-v1}:daily:${scope}`, 'day', day, 'used', used);
    assert.equal((await quota.reserveUsage(reservation('bootstrap', { sessionId: undefined, keyHash: undefined }))).granted, true);
    assert.equal((await quota.reserveUsage(reservation('request'))).granted, true);
    const work = await quota.reserveUsage(reservation());
    assert.equal(work.granted, true, 'Legacy exhausted daily counters no longer lock the service until midnight');
    await quota.releaseUsage(work.lease);
    const now = Number((await redis('TIME'))[0]) * 1000;
    await redis('ZADD', 'forma:{quota-v1}:burst:provider:global', ...Array.from({ length: 240 }, (_, index) => [now - 55000, `recent-${index}`]).flat());
    const full = await quota.reserveUsage(reservation('compose', { sessionId: randomUUID() }));
    assert.equal(full.status, 429);
    assert.ok(full.retryAfter >= 1 && full.retryAfter <= 6, `Global capacity replenishes within seconds, not at midnight (${full.retryAfter})`);
    await redis('ZADD', 'forma:{quota-v1}:burst:provider:global', ...Array.from({ length: 240 }, (_, index) => [now - 61000, `recent-${index}`]).flat());
    const replenished = await quota.reserveUsage(reservation('compose', { sessionId: randomUUID() }));
    assert.equal(replenished.granted, true);
    await quota.releaseUsage(replenished.lease);
    await reset(); await verify();
    await redis('ZADD', 'forma:{quota-v1}:lease:global', ...Array.from({ length: 50 }, (_, index) => [now + 60000, `fixture-lease-${index}`]).flat());
    assert.equal((await quota.reserveUsage(reservation())).status, 429);
    assert.equal(await redis('EXISTS', `forma:{quota-v1}:daily:provider:key:${keyHash}`), 0);
  });
  await t.test('expired leases and old window members recover without refunding daily quota', async () => {
    await reset(); await verify();
    const first = await quota.reserveUsage(reservation());
    assert.equal(first.granted, true);
    for (const key of providerKeys(first.lease)) await redis('ZADD', key, 1, first.lease.requestId);
    const result = await quota.reserveUsage(reservation());
    assert.equal(result.granted, true);
    assert.equal(await redis('HGET', `forma:{quota-v1}:daily:provider:key:${keyHash}`, 'used'), '4');
    await quota.releaseUsage(result.lease);
    const burstKey = `forma:{quota-v1}:burst:provider:session-ip:${sessionId}:${ipHash}`;
    await redis('ZADD', burstKey, ...Array.from({ length: 20 }, (_, index) => [1, `old-${index}`]).flat());
    assert.equal((await quota.reserveUsage(reservation())).granted, true);
    const ttl = await redis('PTTL', burstKey);
    assert.ok(ttl > 0 && ttl <= 61000);
    const dailyTtl = await redis('TTL', `forma:{quota-v1}:daily:provider:key:${keyHash}`);
    assert.ok(dailyTtl > 0 && dailyTtl <= 172800);
  });
  await t.test('duplicates cannot bypass accounting and bootstrap survives cookie changes', async () => {
    await reset(); await verify();
    const request = reservation();
    const first = await quota.reserveUsage(request);
    await quota.releaseUsage(first.lease);
    assert.equal((await quota.reserveUsage(request)).status, 429);
    assert.equal(await redis('HGET', `forma:{quota-v1}:daily:provider:key:${keyHash}`, 'used'), '2');
    await reset();
    assert.equal((await quota.reserveUsage(reservation('bootstrap', { sessionId: undefined, keyHash: undefined }))).granted, true);
    const now = Number((await redis('TIME'))[0]) * 1000;
    await redis('ZADD', `forma:{quota-v1}:burst:bootstrap:ip:${ipHash}`, ...Array.from({ length: HOSTED_QUOTA_LIMITS.statusPerTransportIpMinute - 1 }, (_, index) => [now, `other-session-${index}`]).flat());
    assert.equal((await quota.reserveUsage(reservation('bootstrap', { sessionId: undefined, keyHash: undefined, visitorIpHash: 'd'.repeat(64) }))).status, 429);
    await reset();
    const visits = await Promise.all(Array.from({ length: 12 }, () => quota.reserveUsage(reservation('bootstrap', { sessionId: undefined, keyHash: undefined, ipHash: randomUUID().replaceAll('-', '').padEnd(64, '0') }))));
    assert.equal(visits.filter(({ granted: allowed }) => allowed).length, 10, 'The verified visitor is limited even across transport addresses');
  });
  await t.test('probe verification, revocation and late successes are versioned', async () => {
    await reset();
    const probe = await quota.reserveUsage(reservation('connection'));
    assert.equal(probe.lease.generation, 0);
    assert.equal(await quota.releaseUsage(probe.lease, { outcome: 'verified' }), true);
    assert.equal(await redis('HGET', `forma:{quota-v1}:verify:${evidenceHash}`, 'state'), 'verified');
    const ttl = await redis('PTTL', `forma:{quota-v1}:verify:${evidenceHash}`);
    assert.ok(ttl > 0 && ttl <= HOSTED_QUOTA_LIMITS.verificationTtlMs);
    const late = await quota.reserveUsage(reservation('connection', { visitorIpHash: 'd'.repeat(64) }));
    const work = await quota.reserveUsage(reservation());
    assert.equal(work.granted, true);
    assert.equal(await quota.releaseUsage(work.lease, { outcome: 'credentials' }), true);
    assert.deepEqual(await redis('HMGET', `forma:{quota-v1}:verify:${evidenceHash}`, 'state', 'gen'), ['revoked', '1']);
    assert.equal((await quota.reserveUsage(reservation())).code, 'VERIFICATION_REQUIRED');
    assert.equal(await quota.releaseUsage(late.lease, { outcome: 'verified' }), 'stale', 'A late success cannot restore revoked evidence');
    assert.equal(await redis('HGET', `forma:{quota-v1}:verify:${evidenceHash}`, 'state'), 'revoked');
    const fresh = await quota.reserveUsage(reservation('connection', { visitorIpHash: 'e'.repeat(64) }));
    assert.equal(fresh.lease.generation, 1);
    assert.equal(await quota.releaseUsage(fresh.lease, { outcome: 'verified' }), true);
    assert.equal(await quota.releaseUsage(work.lease, { outcome: 'credentials' }), true, 'A replayed rejection is acknowledged');
    assert.deepEqual(await redis('HMGET', `forma:{quota-v1}:verify:${evidenceHash}`, 'state', 'gen'), ['verified', '1'], 'and cannot revoke newer evidence');
    const next = await quota.reserveUsage(reservation());
    assert.equal(next.granted, true);
    assert.equal(await quota.releaseUsage(next.lease, { outcome: 'credentials' }), true);
    assert.deepEqual(await redis('HMGET', `forma:{quota-v1}:verify:${evidenceHash}`, 'state', 'gen'), ['revoked', '2'], 'A new rejection still revokes');
  });
  await t.test('credential failures cool down probes only; the probe partition cannot starve verified or funded work', async () => {
    await reset(); await verify('9'.repeat(64));
    for (let index = 0; index < 5; index++) {
      const probe = await quota.reserveUsage(reservation('connection', { visitorIpHash: String(index).repeat(64), keyHash: randomUUID().replaceAll('-', '').padEnd(64, '0'), evidenceHash: String(index).repeat(64) }));
      assert.equal(probe.granted, true, `probe ${index}`);
      assert.equal(await quota.releaseUsage(probe.lease, { outcome: 'credentials' }), true);
    }
    const cooled = await quota.reserveUsage(reservation('connection', { visitorIpHash: '5'.repeat(64) }));
    assert.equal(cooled.code, 'PROBE_COOLDOWN');
    assert.ok(cooled.retryAfter > 800 && cooled.retryAfter <= 900);
    assert.equal((await quota.reserveUsage(reservation('connection', { networkHash: '1'.repeat(64), visitorIpHash: '6'.repeat(64) }))).granted, true, 'Another network is unaffected');
    const verifiedWork = await quota.reserveUsage(reservation('compose', { keyHash: '9'.repeat(64), evidenceHash: '9'.repeat(64) }));
    assert.equal(verifiedWork.granted, true, 'Verified work continues during a probe cooldown');
    await quota.releaseUsage(verifiedWork.lease);
    const free = await quota.reserveUsage(funded({ sessionId: randomUUID() }));
    assert.equal(free.granted, true, 'Funded work continues during a probe cooldown');
    await quota.releaseUsage(free.lease, { usedProviderCalls: 0 });
    await reset(); await verify();
    const now = Number((await redis('TIME'))[0]) * 1000;
    await redis('ZADD', 'forma:{quota-v1}:burst:probe:global', ...Array.from({ length: 60 }, (_, index) => [now, `probe-${index}`]).flat());
    assert.equal((await quota.reserveUsage(reservation('connection', { visitorIpHash: '7'.repeat(64), networkHash: '7'.repeat(64) }))).status, 429);
    const work = await quota.reserveUsage(reservation());
    assert.equal(work.granted, true, 'Saturated key tests do not consume verified capacity');
    await quota.releaseUsage(work.lease);
    await reset();
    const visitorProbes = [];
    for (let index = 0; index < 4; index++) {
      const probe = await quota.reserveUsage(reservation('connection', { keyHash: String(index).repeat(64), evidenceHash: String(index).repeat(64) }));
      visitorProbes.push(probe);
      if (probe.granted) await quota.releaseUsage(probe.lease);
    }
    assert.deepEqual(visitorProbes.map(({ granted: allowed }) => allowed), [true, true, true, false], 'Three unknown-key tests per visitor per minute');
    await reset();
    const concurrent = await Promise.all(Array.from({ length: 4 }, (_, index) => quota.reserveUsage(reservation('connection', { keyHash: String(index).repeat(64), evidenceHash: String(index).repeat(64) }))));
    assert.equal(concurrent.filter(({ granted: allowed }) => allowed).length, 1, 'One concurrent unknown-key test per visitor');
  });
  await t.test('credit and rate failures back off one key without revoking its evidence', async () => {
    await reset(); await verify();
    const work = await quota.reserveUsage(reservation());
    assert.equal(await quota.releaseUsage(work.lease, { outcome: 'backoff' }), true);
    assert.equal(await redis('HGET', `forma:{quota-v1}:verify:${evidenceHash}`, 'state'), 'verified');
    const limited = await quota.reserveUsage(reservation('compose', { sessionId: randomUUID() }));
    assert.equal(limited.code, 'RATE_LIMITED');
    assert.ok(limited.retryAfter >= 1 && limited.retryAfter <= 60);
    assert.equal(await redis('EXISTS', `forma:{quota-v1}:failures:probe:${networkHash}`), 0, 'Not a credential failure');
  });
  await t.test('free status is read-only on an empty database and identifies the Redis UTC reset', async () => {
    await reset();
    const status = await quota.statusFree({ visitorIpHash, keyHash });
    const clock = await redis('TIME');
    assert.deepEqual(status, { available: true, remaining: 10, resetAt: (Math.floor(Number(clock[0]) / 86400) + 1) * 86400000 });
    assert.equal(await redis('DBSIZE'), 0);
  });
  await t.test('free visitor quota is atomic across cookie resets and transport identity changes', async () => {
    await reset();
    const results = await Promise.all(Array.from({ length: 8 }, (_, index) => quota.reserveUsage(funded({ sessionId: randomUUID(), ipHash: String(index).repeat(64) }))));
    assert.equal(results.filter(({ granted: allowed }) => allowed).length, 5);
    assert.equal(results.filter(({ code }) => code === 'FREE_LIMIT_REACHED').length, 3);
    assert.equal(await redis('HGET', `forma:{quota-v1}:daily:free:visitor:${visitorIpHash}`, 'used'), '10');
    assert.equal(await remainingFree(), 0);
    const grantedResult = results.find(({ granted: allowed }) => allowed);
    assert.ok(grantedResult.remainingMs > 0 && grantedResult.remainingMs <= 50000);
    assert.ok(grantedResult.dayEndMs > grantedResult.remainingMs, 'Admission ends before the UTC reset');
    assert.equal((await quota.reserveUsage(funded({ visitorIpHash: 'd'.repeat(64), sessionId: randomUUID() }))).granted, true);
  });
  await t.test('free settlement refunds only undispatched passes, atomically and once', async () => {
    await reset();
    const result = await quota.reserveUsage(funded());
    assert.equal(result.granted, true);
    assert.equal(await remainingFree(), 8);
    assert.equal((await quota.authorizePass(result.lease, 1)).granted, true);
    const settled = await Promise.all(Array.from({ length: 8 }, () => quota.releaseUsage(result.lease, { usedProviderCalls: 1 })));
    assert.ok(settled.every(Boolean));
    assert.equal(await remainingFree(), 9);
    assert.equal(await redis('HGET', 'forma:{quota-v1}:daily:free:global', 'used'), '1');
    assert.equal(await redis('ZCARD', `forma:{quota-v1}:lease:free-key:${keyHash}`), 0);
    assert.equal(await quota.releaseUsage(result.lease, { usedProviderCalls: 2 }), true, 'A closed receipt ignores a different later count');
    assert.equal(await remainingFree(), 9);
  });
  await t.test('pass authorization is ordered, bounded and closed after settlement', async () => {
    await reset();
    const { lease } = await quota.reserveUsage(funded());
    assert.equal((await quota.authorizePass(lease, 2)).granted, false);
    const first = await quota.authorizePass(lease, 1);
    assert.equal(first.granted, true);
    assert.ok(first.remainingMs > 0 && first.remainingMs <= 50000);
    assert.equal((await quota.authorizePass(lease, 1)).granted, false);
    assert.equal((await quota.authorizePass(lease, 2)).granted, true);
    assert.equal((await quota.authorizePass({ ...lease, units: 3 }, 3)).granted, false);
    assert.equal(await quota.releaseUsage(lease, { usedProviderCalls: 3 }), false);
    assert.equal(await quota.releaseUsage(lease, { usedProviderCalls: 2 }), true);
    assert.equal((await quota.authorizePass(lease, 2)).granted, false);
    const expired = (await quota.reserveUsage(funded({ sessionId: randomUUID() }))).lease;
    await expireReceipt(expired.requestId);
    assert.equal((await quota.authorizePass(expired, 1)).granted, false, 'An expired receipt cannot authorize dispatch');
  });
  await t.test('a lost reservation reply is closed by a tombstone or a refund, and late commands cannot charge', async () => {
    await reset();
    const request = funded();
    const lease = { kind: 'funded', operation: 'compose', sessionId, keyHash, requestId: request.requestId, visitorIpHash, units: 2 };
    assert.equal(await quota.releaseUsage(lease, { usedProviderCalls: 0 }), true);
    assert.equal(JSON.parse(await redis('HGET', receiptKey(), request.requestId)).state, 'cancelled');
    assert.equal((await quota.reserveUsage(request)).granted, false, 'A delayed reservation meets the tombstone');
    assert.equal(await redis('EXISTS', `forma:{quota-v1}:daily:free:visitor:${visitorIpHash}`), 0);
    const late = await quota.reserveUsage(funded({ acceptBy: Date.now() - 60000 }));
    assert.deepEqual(late, unavailable, 'The immutable acceptance deadline refuses a late command');
    assert.equal(await redis('EXISTS', `forma:{quota-v1}:daily:free:visitor:${visitorIpHash}`), 0);
    const committed = funded({ sessionId: randomUUID() });
    assert.equal((await quota.reserveUsage(committed)).granted, true);
    assert.equal(await remainingFree(), 8);
    assert.equal(await quota.releaseUsage({ ...lease, sessionId: committed.sessionId, requestId: committed.requestId }, { usedProviderCalls: 0 }), true);
    assert.equal(await remainingFree(), 10, 'A committed hold whose reply was lost is refunded');
  });
  await t.test('process loss recovers only units that were never durably authorized, once', async () => {
    for (const authorized of [0, 1, 2]) {
      await reset();
      const { lease } = await quota.reserveUsage(funded());
      for (let pass = 1; pass <= authorized; pass++) assert.equal((await quota.authorizePass(lease, pass)).granted, true);
      await expireReceipt(lease.requestId);
      assert.equal(await remainingFree(), 10 - authorized, `${authorized} authorized`);
      assert.equal(JSON.parse(await redis('HGET', receiptKey(), lease.requestId)).state, 'closed');
      assert.equal(await quota.releaseUsage(lease, { usedProviderCalls: 0 }), true, 'A late handler settlement is idempotent');
      assert.equal(await remainingFree(), 10 - authorized);
    }
    await reset();
    const { lease } = await quota.reserveUsage(funded());
    await quota.authorizePass(lease, 1);
    await expireReceipt(lease.requestId);
    await Promise.all([...Array.from({ length: 4 }, () => quota.releaseUsage(lease, { usedProviderCalls: 1 })), ...Array.from({ length: 4 }, () => quota.statusFree({ visitorIpHash, keyHash }))]);
    assert.equal(await remainingFree(), 9, 'Concurrent settlement and recovery refund once');
    assert.equal(await redis('HGET', 'forma:{quota-v1}:daily:free:global', 'used'), '1');
  });
  await t.test('recovery and settlement never refund a different visitor or a new UTC day', async () => {
    await reset();
    const result = await quota.reserveUsage(funded());
    const day = await today();
    const differentVisitor = 'd'.repeat(64);
    await redis('HSET', `forma:{quota-v1}:daily:free:visitor:${differentVisitor}`, 'day', day, 'used', 5);
    await quota.releaseUsage({ ...result.lease, visitorIpHash: differentVisitor }, { usedProviderCalls: 0 });
    assert.equal(await redis('HGET', `forma:{quota-v1}:daily:free:visitor:${differentVisitor}`, 'used'), '5');
    assert.equal(await redis('HGET', 'forma:{quota-v1}:daily:free:global', 'used'), '2');
    for (const key of [`forma:{quota-v1}:daily:free:visitor:${visitorIpHash}`, 'forma:{quota-v1}:daily:free:global']) await redis('HSET', key, 'day', day + 1, 'used', 6);
    await quota.releaseUsage(result.lease, { usedProviderCalls: 0 });
    assert.equal(await redis('HGET', `forma:{quota-v1}:daily:free:visitor:${visitorIpHash}`, 'used'), '6');
    assert.equal(await redis('HGET', 'forma:{quota-v1}:daily:free:global', 'used'), '6');
    await reset();
    const old = await quota.reserveUsage(funded());
    await redis('HSET', `forma:{quota-v1}:daily:free:visitor:${visitorIpHash}`, 'day', day, 'used', 4);
    await expireReceipt(old.lease.requestId, { day: day - 1 });
    assert.equal(await remainingFree(), 6, 'Old-day recovery never decrements today');
  });
  await t.test('free operator global ceiling prevents concurrent overspend across visitors', async () => {
    await reset();
    await redis('HSET', 'forma:{quota-v1}:daily:free:global', 'day', await today(), 'used', 498);
    const results = await Promise.all(Array.from({ length: 8 }, (_, index) => quota.reserveUsage(funded({ sessionId: randomUUID(), visitorIpHash: String(index).repeat(64) }))));
    assert.equal(results.filter(({ granted: allowed }) => allowed).length, 1);
    assert.equal(results.filter(({ code }) => code === 'FREE_LIMIT_REACHED').length, 7);
    assert.equal(await redis('HGET', 'forma:{quota-v1}:daily:free:global', 'used'), '500');
    assert.equal(await remainingFree(), 0);
  });
  await t.test('the funded UTC cutoff pauses new designs before charging and reports the reset', async () => {
    await reset();
    // Widen only the fixed cutoff policy so the real Lua path is exercised now.
    rewrite = (command) => {
      if (command[1].includes('spec.acceptBy')) {
        const spec = JSON.parse(command[command.length - 2]);
        for (const policy of spec.policies) if (policy.kind === 'cutoff') policy.ms = 86400001;
        command[command.length - 2] = JSON.stringify(spec);
      } else if (command[1].includes("redis.call('GET', KEYS[5])")) command[3 + 5 + 2] = 86400001;
      return command;
    };
    const paused = await quota.reserveUsage(funded());
    assert.equal(paused.code, 'FREE_PAUSED');
    const clock = await redis('TIME');
    assert.ok(Math.abs(paused.retryAfter - ((Math.floor(Number(clock[0]) / 86400) + 1) * 86400 - Number(clock[0]))) <= 2);
    assert.equal(await redis('EXISTS', `forma:{quota-v1}:daily:free:visitor:${visitorIpHash}`), 0);
    const status = await quota.statusFree({ visitorIpHash, keyHash });
    assert.equal(status.reason, 'day_closing');
    assert.equal(status.remaining, 10);
    await verify();
    assert.equal((await quota.reserveUsage(reservation())).granted, true, 'Verified personal keys remain available');
  });
  await t.test('operator health closes only free calls and recovers after its bounded TTL', async () => {
    await reset(); await verify();
    assert.equal(await quota.markOperatorUnavailable({ keyHash, reason: 'credits' }), true);
    const status = await quota.statusFree({ visitorIpHash, keyHash });
    assert.equal(status.available, false);
    assert.equal(status.reason, 'credits');
    const result = await quota.reserveUsage(funded());
    assert.equal(result.code, 'FREE_UNAVAILABLE');
    assert.equal(await redis('EXISTS', `forma:{quota-v1}:daily:free:visitor:${visitorIpHash}`), 0);
    const byok = await quota.reserveUsage(reservation());
    assert.equal(byok.granted, true);
    await quota.releaseUsage(byok.lease);
    const ttl = await redis('TTL', `forma:{quota-v1}:health:free-key:${keyHash}`);
    assert.ok(ttl > 0 && ttl <= 300);
    await redis('PEXPIREAT', `forma:{quota-v1}:health:free-key:${keyHash}`, 1);
    assert.equal((await quota.statusFree({ visitorIpHash, keyHash })).available, true);
  });
  await reset();
});

function providerKeys(lease) {
  return [`forma:{quota-v1}:lease:session:${lease.sessionId}`, `forma:{quota-v1}:lease:key:${lease.keyHash}`, 'forma:{quota-v1}:lease:global'];
}
