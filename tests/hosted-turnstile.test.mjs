/** Turnstile configuration, Siteverify transport bounds and pass expiry.
 * Synthetic fixtures only; nothing reaches Cloudflare. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { turnstileConfig, verifyTurnstileToken, issuePass, readPass, SITEVERIFY_URL } from '../hosted/turnstile.mjs';
import { HostedError } from '../hosted/security.mjs';

const cfg = { origin: 'https://forma.example' };
const secret = '0x4AAAAAAAsyntheticSecret';
const env = (values = {}) => ({
  FORMA_SESSION_SECRET: randomBytes(32).toString('base64url'), TURNSTILE_ENFORCE: 'on', NEXT_PUBLIC_TURNSTILE_SITE_KEY: '0x4AAAAAAAsyntheticSiteKey',
  TURNSTILE_SECRET_KEY: secret, TURNSTILE_SESSION_SECRET: randomBytes(32).toString('base64url'), TURNSTILE_ALLOWED_HOSTNAMES: 'Forma.Example, 127.0.0.1, localhost', ...values
});

test('Turnstile configuration is explicit, frozen and never echoes a value', () => {
  const value = turnstileConfig(env(), cfg);
  assert.ok(Object.isFrozen(value));
  assert.equal(value.mode, 'on');
  assert.equal(value.hostname, 'forma.example');
  assert.equal(value.siteKey, '0x4AAAAAAAsyntheticSiteKey');
  assert.deepEqual(turnstileConfig({ TURNSTILE_ENFORCE: 'off' }, cfg), { mode: 'off' });
  for (const values of [{ TURNSTILE_ENFORCE: 'On' }, { TURNSTILE_ENFORCE: ' on' }, { TURNSTILE_ALLOWED_HOSTNAMES: Array(17).fill('forma.example').join(',') }, { TURNSTILE_ALLOWED_HOSTNAMES: 'forma.example,' }, { TURNSTILE_SESSION_SECRET: 'x'.repeat(513) }, { TURNSTILE_SECRET_KEY: `${secret} ` }, { TURNSTILE_SECRET_KEY: '3x0000000000000000000000000000000AA' }, { NEXT_PUBLIC_TURNSTILE_SITE_KEY: '3x00000000000000000000FF' }]) {
    assert.throws(() => turnstileConfig(env(values), cfg), (error) => error instanceof HostedError && error.status === 503 && error.code === 'configuration' && !error.message.includes(secret));
  }
});

test('a pass lives exactly as long as its guest session', () => {
  const config = turnstileConfig(env(), cfg);
  const now = 1_790_000_000, session = { id: randomUUID(), issuedAt: now, expiresAt: now + 86400 }, visitorIp = 'a'.repeat(64);
  const pass = issuePass(config, session, visitorIp, now);
  assert.equal(pass.expiresAt, session.expiresAt * 1000);
  assert.match(pass.setCookie, /; Max-Age=86400$/);
  const request = (cookie) => new Request('https://forma.example/api/compose', { headers: { cookie } });
  const cookie = pass.setCookie.split(';')[0];
  assert.equal(readPass(request(cookie), config, session, visitorIp, now + 86399), session.expiresAt);
  assert.equal(readPass(request(cookie), config, session, visitorIp, now + 86400), null);
  assert.equal(readPass(request(cookie), config, { ...session, expiresAt: session.expiresAt - 1 }, visitorIp, now), null);
  assert.equal(readPass(request(`${cookie}; filler=${'y'.repeat(4096)}`), config, session, visitorIp, now), null);
  assert.equal(readPass(request('other=1'), config, session, visitorIp, now), null);
});

test('Siteverify follows the request signal and never follows redirects', async () => {
  const config = turnstileConfig(env(), cfg), controller = new AbortController();
  let seen;
  const pending = verifyTurnstileToken({ config, token: 'synthetic-token', remoteIp: '192.0.2.1', signal: controller.signal, fetchImpl: (url, init) => {
    seen = { url, init };
    return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true }));
  } });
  controller.abort();
  assert.equal(await pending, 'unavailable');
  assert.equal(seen.url, SITEVERIFY_URL);
  assert.equal(seen.init.redirect, 'error');
  assert.equal(seen.init.cache, 'no-store');
});
