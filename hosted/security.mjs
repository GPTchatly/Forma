// Node-only hosted boundary. Never import this module into browser code.
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

export const SESSION_COOKIE = '__Host-Forma-Session';
export const CSRF_COOKIE = '__Host-Forma-CSRF';
export const SESSION_SECONDS = 24 * 60 * 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const sessionSchema = z.object({ v: z.literal(1), id: z.string().regex(UUID), issuedAt: z.number().int().nonnegative(), expiresAt: z.number().int().nonnegative() }).strict();

export class HostedError extends Error {
  constructor(status, code, message) { super(message); this.name = 'HostedError'; this.status = status; this.code = code; }
}

export function config(env = process.env) {
  let url;
  try { url = new URL(env.PUBLIC_ORIGIN); } catch { throw new HostedError(503, 'configuration', 'Hosted service is not configured.'); }
  if (url.protocol !== 'https:' || url.origin !== env.PUBLIC_ORIGIN || url.username || url.password || url.hostname.includes('*') || url.pathname !== '/' || url.search || url.hash || url.origin.length > 512) {
    throw new HostedError(503, 'configuration', 'Hosted service is not configured.');
  }
  const encoded = env.FORMA_SESSION_SECRET;
  if (typeof encoded !== 'string' || !/^[A-Za-z0-9_-]{43,86}$/.test(encoded)) throw new HostedError(503, 'configuration', 'Hosted service is not configured.');
  const secret = Buffer.from(encoded, 'base64url');
  if (secret.length < 32 || secret.length > 64 || secret.toString('base64url') !== encoded) throw new HostedError(503, 'configuration', 'Hosted service is not configured.');
  return Object.freeze({ origin: url.origin, host: url.host, sessionSecret: secret });
}

function header(request, name, max) {
  const value = request.headers.get(name);
  if (value !== null && (value.length > max || /[\u0000-\u001f\u007f]/u.test(value))) throw new HostedError(400, 'headers', 'Invalid request headers.');
  return value;
}

export function assertSameOrigin(request, cfg, { mutation = false } = {}) {
  let url;
  try { url = new URL(request.url); } catch { throw new HostedError(403, 'origin', 'Request origin is not allowed.'); }
  const host = header(request, 'host', 512);
  const origin = header(request, 'origin', 512);
  const fetchSite = header(request, 'sec-fetch-site', 32);
  const allowedFetchSite = fetchSite === null || fetchSite === 'same-origin' || (!mutation && fetchSite === 'none');
  if (url.origin !== cfg.origin || url.username || url.password || host !== cfg.host || (origin !== null && origin !== cfg.origin) || (mutation && origin !== cfg.origin) || !allowedFetchSite) {
    throw new HostedError(403, 'origin', 'Request origin is not allowed.');
  }
}

function signature(cfg, context, value) { return createHmac('sha256', cfg.sessionSecret).update(context).update(value).digest('base64url'); }
function same(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  const aBytes = Buffer.from(a, 'utf8'), bBytes = Buffer.from(b, 'utf8');
  return aBytes.length === bBytes.length && timingSafeEqual(aBytes, bBytes);
}
function cookies(request) {
  const raw = header(request, 'cookie', 4096) || '';
  const result = new Map();
  for (const part of raw.split(';')) {
    const at = part.indexOf('=');
    const name = part.slice(0, at).trim();
    if (at < 0 || (name !== SESSION_COOKIE && name !== CSRF_COOKIE)) continue;
    if (result.has(name)) throw new HostedError(401, 'session', 'Refresh the page to start a new session.');
    result.set(name, part.slice(at + 1).trim());
  }
  return result;
}
function decodeSession(token, cfg, now) {
  if (typeof token !== 'string' || token.length > 320 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const [payload, mac] = token.split('.');
  if (!same(mac, signature(cfg, 'forma:session:v1:', payload))) return null;
  let parsed;
  try {
    const bytes = Buffer.from(payload, 'base64url');
    if (bytes.toString('base64url') !== payload) return null;
    parsed = sessionSchema.safeParse(JSON.parse(bytes.toString('utf8')));
  } catch { return null; }
  if (!parsed.success) return null;
  const { id, issuedAt, expiresAt } = parsed.data;
  if (expiresAt - issuedAt !== SESSION_SECONDS || issuedAt > now + 60 || expiresAt <= now) return null;
  return { id, issuedAt, expiresAt };
}
function csrfFor(token, cfg) { return signature(cfg, 'forma:csrf:v1:', token); }
function cookie(name, value, maxAge) { return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`; }

export function bootstrapSession(request, cfg, now = Math.floor(Date.now() / 1000)) {
  assertSameOrigin(request, cfg);
  const jar = cookies(request);
  let token = jar.get(SESSION_COOKIE);
  let session = decodeSession(token, cfg, now);
  const setCookies = [];
  if (!session) {
    session = { id: randomUUID(), issuedAt: now, expiresAt: now + SESSION_SECONDS };
    const payload = Buffer.from(JSON.stringify({ v: 1, ...session })).toString('base64url');
    token = `${payload}.${signature(cfg, 'forma:session:v1:', payload)}`;
    setCookies.push(cookie(SESSION_COOKIE, token, SESSION_SECONDS));
  }
  const csrfToken = csrfFor(token, cfg);
  // Repair a missing CSRF cookie without changing the guest identity or quotas.
  if (!same(jar.get(CSRF_COOKIE), csrfToken)) setCookies.push(cookie(CSRF_COOKIE, csrfToken, session.expiresAt - now));
  return { session, csrfToken, setCookies };
}

export function requireSession(request, cfg, now = Math.floor(Date.now() / 1000)) {
  assertSameOrigin(request, cfg);
  const jar = cookies(request);
  const token = jar.get(SESSION_COOKIE);
  const session = decodeSession(token, cfg, now);
  if (!session) throw new HostedError(401, 'session', 'Refresh the page to start a new session.');
  const csrfToken = csrfFor(token, cfg);
  if (!same(jar.get(CSRF_COOKIE), csrfToken)) throw new HostedError(403, 'csrf', 'Refresh the page before retrying this request.');
  return { session, csrfToken };
}

export function requireIntegrity(request, cfg, session) {
  assertSameOrigin(request, cfg, { mutation: true });
  const verified = requireSession(request, cfg);
  const supplied = header(request, 'x-csrf-token', 43);
  if (!session || session.id !== verified.session.id || session.issuedAt !== verified.session.issuedAt || session.expiresAt !== verified.session.expiresAt || !TOKEN.test(supplied || '') || !same(supplied, verified.csrfToken)) {
    throw new HostedError(403, 'csrf', 'Refresh the page before retrying this request.');
  }
}

export function json(body, { status = 200, headers, setCookies = [] } = {}) {
  const responseHeaders = new Headers(headers);
  responseHeaders.set('Content-Type', 'application/json; charset=utf-8');
  responseHeaders.set('Cache-Control', 'no-store, no-transform');
  responseHeaders.set('X-Content-Type-Options', 'nosniff');
  responseHeaders.set('Referrer-Policy', 'no-referrer');
  responseHeaders.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  for (const value of setCookies) responseHeaders.append('Set-Cookie', value);
  return new Response(JSON.stringify(body), { status, headers: responseHeaders });
}

export function errorResponse(error) {
  const known = error instanceof HostedError;
  return json({ error: known ? error.message : 'The request could not be completed.', code: known ? error.code : 'internal' }, { status: known ? error.status : 500 });
}
