// Node-only hosted boundary. Never import this module into browser code.
// Cloudflare Turnstile gates live JEV: one Siteverify-checked token earns a signed
// pass cookie bound to the guest session and exact visitor IP. No token, secret or
// Siteverify body is logged, returned or stored.
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { HostedError, readBoundedJson } from './security.mjs';

export const HUMAN_COOKIE = '__Host-Forma-Human';
export const TURNSTILE_ACTION = 'forma_live';
export const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const SITEVERIFY_TIMEOUT_MS = 8000;
const RESPONSE_BYTES = 8192;
// Cloudflare's documented test keys always pass or fail; they never protect a deployment.
const DUMMY_SITE_KEYS = new Set(['1x00000000000000000000AA', '2x00000000000000000000AB', '1x00000000000000000000BB', '2x00000000000000000000BB', '3x00000000000000000000FF']);
const DUMMY_SECRET = /^[123]x0000000000000000000000000000000AA$/;
const HOSTNAME = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/;
const PASS = /^\d{10}\.[A-Za-z0-9_-]{43}$/;
// Only failures of the service or its secret are unavailability; everything else rejects the token.
const UNAVAILABLE_CODES = ['internal-error', 'missing-input-secret', 'invalid-input-secret'];
const OFF = Object.freeze({ mode: 'off' });
const siteverifySchema = z.object({
  success: z.boolean(), hostname: z.string().max(253).optional(), action: z.string().max(32).optional(),
  'error-codes': z.array(z.string().max(64)).max(16).optional()
}).loose();

const unconfigured = () => new HostedError(503, 'configuration', 'Hosted service is not configured.');

/** Explicit `on`/`off` only; anything else fails closed. Values are never echoed. */
export function turnstileConfig(env, cfg) {
  if (env.TURNSTILE_ENFORCE === 'off') return OFF;
  if (env.TURNSTILE_ENFORCE !== 'on') throw unconfigured();
  const siteKey = env.NEXT_PUBLIC_TURNSTILE_SITE_KEY, secretKey = env.TURNSTILE_SECRET_KEY, passSecret = env.TURNSTILE_SESSION_SECRET, hostnames = env.TURNSTILE_ALLOWED_HOSTNAMES;
  if (typeof siteKey !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(siteKey) || DUMMY_SITE_KEYS.has(siteKey)) throw unconfigured();
  if (typeof secretKey !== 'string' || !/^[\x21-\x7e]{1,256}$/.test(secretKey) || DUMMY_SECRET.test(secretKey)) throw unconfigured();
  if (typeof passSecret !== 'string' || !/^[\x21-\x7e]{32,512}$/.test(passSecret) || passSecret === env.FORMA_SESSION_SECRET) throw unconfigured();
  if (typeof hostnames !== 'string' || hostnames.length > 4096) throw unconfigured();
  const allowed = hostnames.split(',').map((value) => value.trim().toLowerCase());
  // Tokens must name the one public origin this API serves; other listed hosts are inert.
  const hostname = new URL(cfg.origin).hostname;
  if (allowed.length > 16 || allowed.some((value) => !HOSTNAME.test(value)) || !allowed.includes(hostname)) throw unconfigured();
  return Object.freeze({ mode: 'on', siteKey, secretKey, passSecret: Buffer.from(passSecret, 'utf8'), hostname });
}

/** Returns 'ok', 'rejected' or 'unavailable'. */
export async function verifyTurnstileToken({ config, token, remoteIp, fetchImpl, signal }) {
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(SITEVERIFY_TIMEOUT_MS)]);
  let body;
  try {
    const response = await fetchImpl(SITEVERIFY_URL, {
      method: 'POST', redirect: 'error', cache: 'no-store', signal: deadline,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ secret: config.secretKey, response: token, remoteip: remoteIp, idempotency_key: randomUUID() }).toString()
    });
    body = await readBoundedJson(response, deadline, RESPONSE_BYTES, 'Siteverify unavailable.');
  } catch { return 'unavailable'; }
  const parsed = siteverifySchema.safeParse(body);
  if (!parsed.success) return 'unavailable';
  const { success, hostname, action } = parsed.data;
  if (success && action === TURNSTILE_ACTION && typeof hostname === 'string' && hostname.toLowerCase() === config.hostname) return 'ok';
  if (!success && (parsed.data['error-codes'] ?? []).some((code) => UNAVAILABLE_CODES.includes(code))) return 'unavailable';
  return 'rejected';
}

function passMac(config, session, visitorIpHash, exp) {
  return createHmac('sha256', config.passSecret).update(`forma:human:v1\0${session.id}\0${session.issuedAt}\0${visitorIpHash}\0${exp}`).digest('base64url');
}

/** The pass lives as long as the guest session and only for this exact visitor IP. */
export function issuePass(config, session, visitorIpHash, now = Math.floor(Date.now() / 1000)) {
  const exp = session.expiresAt;
  return { expiresAt: exp * 1000, setCookie: `${HUMAN_COOKIE}=${exp}.${passMac(config, session, visitorIpHash, exp)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${Math.max(1, exp - now)}` };
}

/** Returns the pass expiry in seconds, or null for a missing, duplicated, altered or foreign pass. */
export function readPass(request, config, session, visitorIpHash, now = Math.floor(Date.now() / 1000)) {
  const raw = request.headers.get('cookie') || '';
  if (raw.length > 4096) return null;
  let value, found = false;
  for (const part of raw.split(';')) {
    const at = part.indexOf('=');
    if (at < 0 || part.slice(0, at).trim() !== HUMAN_COOKIE) continue;
    if (found) return null;
    found = true;
    value = part.slice(at + 1).trim();
  }
  if (!found || !PASS.test(value)) return null;
  const [text, mac] = value.split('.');
  const exp = Number(text);
  if (exp <= now || exp > session.expiresAt) return null;
  const expected = Buffer.from(passMac(config, session, visitorIpHash, exp));
  const supplied = Buffer.from(mac);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected) ? exp : null;
}
