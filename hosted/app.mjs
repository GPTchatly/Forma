/** Vercel-only boundary. No project persistence or shared visitor keys. */
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { performance } from 'node:perf_hooks';
import { config, assertSameOrigin, bootstrapSession, requireSession, requireIntegrity, HostedError, json, errorResponse } from './security.mjs';
import { readConnection, readCompose, readChallenge } from './schemas.mjs';
import { createHostedQuota, extractTransportIp, hashQuotaIdentity, canonicalIp, networkIdentity, HOSTED_QUOTA_LIMITS } from './quota.mjs';
import { turnstileConfig, verifyTurnstileToken, issuePass, readPass } from './turnstile.mjs';
import { createJevEvaluator, resolveJevConfig, ProviderError } from '../server/jev.mjs';
import { choice, compose } from '../server/composer.mjs';
import { CATALOG } from '../shared/catalog.mjs';

// Local slack subtracted from Redis-measured funded deadlines before each dispatch.
const DISPATCH_MARGIN_MS = 1000;

function requireEdge(request, env) {
  const expected = env.FORMA_EDGE_SECRET;
  if (typeof expected !== 'string' || !/^[A-Za-z0-9_-]{43,86}$/.test(expected)) throw new HostedError(503, 'configuration', 'Hosted service is not configured.');
  const bytes = Buffer.from(expected, 'base64url');
  if (bytes.length < 32 || bytes.length > 64 || bytes.toString('base64url') !== expected) throw new HostedError(503, 'configuration', 'Hosted service is not configured.');
  const supplied = request.headers.get('x-forma-edge-token');
  if (typeof supplied !== 'string' || supplied.length !== expected.length || !/^[A-Za-z0-9_-]+$/.test(supplied) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
    throw new HostedError(403, 'edge', 'Request source is not allowed.');
  }
}

const retryAfter = (value, fallback = 60) => String(Number.isInteger(value) ? Math.min(86400, Math.max(1, value)) : fallback);

function quotaFailure(reservation) {
  if (reservation?.code === 'VERIFICATION_REQUIRED') {
    return json({ error: 'Test this API key in Connect JEV before building. Nothing was sent to the provider.', code: 'verification_required' }, { status: 428 });
  }
  if (reservation?.code === 'PROBE_COOLDOWN') {
    return json({ error: 'Too many API keys from this network were rejected. Try another key test later. Free JEV, an already connected key and editing still work.', code: 'probe_cooldown' }, { status: 429, headers: { 'Retry-After': retryAfter(reservation.retryAfter, 900) } });
  }
  const limited = reservation?.status === 429;
  return json({ error: limited ? 'Usage limit reached. Please try again later.' : 'The usage service is temporarily unavailable.', code: limited ? 'rate_limit' : 'quota_unavailable' }, {
    status: limited ? 429 : 503,
    headers: { 'Retry-After': retryAfter(reservation?.retryAfter) }
  });
}

function operatorConfiguration(env) {
  // Match local precedence, but never trim or silently repair hosted credentials.
  const apiKey = env.TYPESAFE_API_KEY || env.OPENROUTER_API_KEY || '';
  if (typeof apiKey !== 'string' || !/^[\x21-\x7e]{1,512}$/.test(apiKey)) return null;
  const provider = env.JEV_PROVIDER || (!env.TYPESAFE_API_KEY && env.OPENROUTER_API_KEY ? 'openrouter' : '');
  const model = env.JEV_MODEL || 'jev-1.13.0';
  try { return { apiKey, ...resolveJevConfig({ apiKey, provider, model }) }; }
  catch { return null; }
}

function visitorIdentity(request, env) {
  // The caller has already verified the Cloudflare-overwritten edge secret.
  const address = request.headers.get('cf-connecting-ip');
  if (typeof address !== 'string' || address.length > 64 || address.includes('%') || !isIP(address)) return null;
  const secret = env.FORMA_SESSION_SECRET;
  // The raw address leaves this function only as Siteverify's remoteip.
  return { address: canonicalIp(address), visitorIpHash: hashQuotaIdentity(canonicalIp(address), secret, 'ip'), networkHash: hashQuotaIdentity(networkIdentity(address), secret, 'network') };
}

// Status reports the browser-check mode and whether this session and visitor IP hold a
// pass. It never calls Siteverify and never refuses status for a Turnstile problem.
function humanStatus(request, env, cfg, session, visitorIpHash) {
  let human;
  try { human = turnstileConfig(env, cfg); } catch { return { mode: 'unavailable' }; }
  if (human.mode === 'off') return { mode: 'off' };
  const expires = readPass(request, human, session, visitorIpHash);
  return { mode: 'turnstile', siteKey: human.siteKey, verifiedUntil: expires === null ? null : expires * 1000 };
}

// Only a provider rejection of the credential is evidence against a key. Credit,
// rate, network and server failures are classified separately.
function failureOutcome(error) {
  if (!(error instanceof ProviderError)) return 'none';
  if ([401, 403].includes(error.upstreamStatus)) return 'credentials';
  if ([402, 429].includes(error.upstreamStatus)) return 'backoff';
  return 'none';
}

const noFree = (reason = 'unavailable') => ({ available: false, remaining: 0, limit: 10, resetAt: null, reason });
async function freeStatus(quota, context, signal) {
  if (!context) return noFree('unconfigured');
  try {
    const value = await quota.statusFree({ ...context, ...(signal ? { signal } : {}) });
    if (typeof value?.available !== 'boolean' || !Number.isInteger(value.remaining) || value.remaining < 0 || value.remaining > 10 || (value.resetAt !== null && (!Number.isSafeInteger(value.resetAt) || value.resetAt < 0))) return noFree();
    const reason = value.reason === 'day_closing' ? 'resetting' : ['credentials', 'credits', 'rate_limit'].includes(value.reason) ? value.reason : !value.available ? 'unavailable' : value.remaining < 2 ? 'exhausted' : undefined;
    return { available: value.available && value.remaining >= 2, remaining: value.remaining, limit: 10, resetAt: value.resetAt, ...(reason ? { reason } : {}) };
  } catch { return noFree(); }
}

function freeFailure(freeAllowance, code = 'FREE_UNAVAILABLE', wait) {
  if (code === 'FREE_PAUSED') {
    return json({ error: 'Free JEV pauses during the last minute of each UTC day. Try again after midnight UTC, or use your own API key.', code: 'free_paused', freeAllowance }, { status: 503, headers: { 'Retry-After': retryAfter(wait) } });
  }
  const exhausted = code === 'FREE_LIMIT_REACHED';
  return json({
    error: exhausted ? 'Not enough free JEV calls remain for this design. Add your own API key to continue.' : 'Free JEV is unavailable. Add your own API key to continue.',
    code: exhausted ? 'free_limit' : 'free_unavailable', freeAllowance,
  }, { status: exhausted ? 429 : 503 });
}

export function createHostedApp({ env = process.env, fetchImpl = globalThis.fetch, quota = createHostedQuota({ env, fetchImpl }), clock = () => performance.now() } = {}) {
  return async function handle(request) {
    let lease, fundedContext, settledAllowance, settlement;
    let usedProviderCalls = 0, dispatchClosed = false, outcome = 'none';
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(45000)]);
    function settle() {
      if (!lease) return Promise.resolve(true);
      // Dispatch closes before settlement is acknowledged; the fetched count is frozen.
      dispatchClosed = true;
      settlement ??= quota.releaseUsage(lease, { usedProviderCalls, outcome }).catch(() => false);
      return settlement;
    }
    async function remainingFree() {
      if (settledAllowance) return settledAllowance;
      if (await settle() !== true) return (settledAllowance = noFree());
      // Cleanup/status have their own bounded Redis deadline even after cancellation.
      return (settledAllowance = await freeStatus(quota, fundedContext));
    }
    try {
      const cfg = config(env);
      // Cloudflare must overwrite this header. Neither Host nor Origin proves ingress.
      requireEdge(request, env);
      assertSameOrigin(request, cfg);
      const url = new URL(request.url);
      if (url.search || url.hash) throw new HostedError(400, 'query', 'Query parameters are not supported.');
      const route = url.pathname;
      if (!['/api/status', '/api/challenge', '/api/connection', '/api/compose'].includes(route)) throw new HostedError(404, 'route', 'This endpoint is unavailable.');
      const method = route === '/api/status' ? 'GET' : 'POST';
      if (request.method !== method) return json({ error: 'This request method is not supported.', code: 'method' }, { status: 405, headers: { Allow: method } });
      let ipHash;
      try { ipHash = hashQuotaIdentity(extractTransportIp(request.headers), env.FORMA_SESSION_SECRET, 'ip'); }
      catch { throw new HostedError(403, 'transport', 'Request source is not available.'); }
      // Every hosted admission uses the verified Cloudflare visitor. There is no
      // guess from an alternate header when it is missing or invalid.
      const visitor = visitorIdentity(request, env);
      if (!visitor) throw new HostedError(403, 'visitor', 'Request source is not available.');
      signal.throwIfAborted();
      const operator = operatorConfiguration(env);
      const operatorContext = operator ? { visitorIpHash: visitor.visitorIpHash, keyHash: hashQuotaIdentity(operator.apiKey, env.FORMA_SESSION_SECRET, 'key') } : null;
      if (route === '/api/status') {
        const allowed = await quota.reserveUsage({ operation: 'bootstrap', ipHash, visitorIpHash: visitor.visitorIpHash, requestId: randomUUID(), signal });
        if (!allowed.granted) return quotaFailure(allowed);
        const { session, csrfToken, setCookies } = bootstrapSession(request, cfg);
        const humanCheck = humanStatus(request, env, cfg, session, visitor.visitorIpHash);
        const freeAllowance = operatorContext ? await freeStatus(quota, operatorContext, signal) : noFree('unconfigured');
        signal.throwIfAborted();
        return json({ deployment: 'hosted', csrfToken, configured: false, verified: false, credentialSource: 'none', provider: operator?.provider || 'typesafe', model: operator?.model || 'jev-1.13.0', version: '0.3.0', catalogSize: CATALOG.length, freeAllowance, humanCheck }, { setCookies });
      }
      const { session } = requireSession(request, cfg);
      requireIntegrity(request, cfg, session);
      const human = turnstileConfig(env, cfg);
      if (route === '/api/challenge' && human.mode === 'off') throw new HostedError(404, 'route', 'This endpoint is unavailable.');
      // A live route without a pass is refused before any Redis, body or provider work.
      if (route !== '/api/challenge' && human.mode === 'on' && readPass(request, human, session, visitor.visitorIpHash) === null) {
        return json({ error: 'Complete the browser check before using live JEV. Nothing was sent to the provider.', code: 'human_required' }, { status: 403 });
      }
      const identity = { sessionId: session.id, ipHash, visitorIpHash: visitor.visitorIpHash, signal };
      const allowed = await quota.reserveUsage({ ...identity, operation: 'request', requestId: randomUUID() });
      if (!allowed.granted) return quotaFailure(allowed);
      if (route === '/api/challenge') {
        const limited = await quota.reserveUsage({ ...identity, operation: 'challenge', networkHash: visitor.networkHash, requestId: randomUUID() });
        if (!limited.granted) return quotaFailure(limited);
        const { token } = await readChallenge(request);
        signal.throwIfAborted();
        const verdict = await verifyTurnstileToken({ config: human, token, remoteIp: visitor.address, fetchImpl, signal });
        signal.throwIfAborted();
        if (verdict === 'ok') {
          const pass = issuePass(human, session, visitor.visitorIpHash);
          return json({ verified: true, expiresAt: pass.expiresAt }, { setCookies: [pass.setCookie] });
        }
        if (verdict === 'rejected') return json({ error: 'The browser check did not pass. Try again.', code: 'human_failed' }, { status: 403 });
        return json({ error: 'The browser check is unavailable right now. Try again shortly.', code: 'human_unavailable' }, { status: 503, headers: { 'Retry-After': '30' } });
      }
      // Rate-limit before allocating/parsing a bounded body, then charge provider units.
      const { apiKey: suppliedKey, provider: suppliedProvider, ...input } = await (route === '/api/connection' ? readConnection(request) : readCompose(request));
      signal.throwIfAborted();
      const funded = route === '/api/compose' && suppliedKey === undefined;
      if (funded && !operatorContext) return freeFailure(noFree('unconfigured'));
      const apiKey = funded ? operator.apiKey : suppliedKey;
      const provider = funded ? operator.provider : suppliedProvider;
      const model = funded ? operator.model : 'jev-1.13.0';
      const keyHash = hashQuotaIdentity(apiKey, env.FORMA_SESSION_SECRET, 'key');
      const resolvedProvider = resolveJevConfig({ apiKey, provider }).provider;
      // Verification evidence is bound to the resolved provider and exact key; no raw key is stored.
      const personal = funded ? {} : { networkHash: visitor.networkHash, evidenceHash: hashQuotaIdentity(`${resolvedProvider}\n${apiKey}`, env.FORMA_SESSION_SECRET, 'evidence') };
      if (funded) fundedContext = operatorContext;
      const started = clock();
      const reservation = await quota.reserveUsage({ ...identity, ...personal, operation: route === '/api/connection' ? 'connection' : 'compose', keyHash, requestId: randomUUID(), ...(funded ? { funded: true, acceptBy: Date.now() + HOSTED_QUOTA_LIMITS.fundedAcceptMs } : {}) });
      if (!reservation.granted) {
        // A lost reply may hide a committed hold; closing it refunds or tombstones it.
        if (reservation.uncertain) lease = reservation.lease;
        if (funded && ['FREE_LIMIT_REACHED', 'FREE_UNAVAILABLE', 'FREE_PAUSED'].includes(reservation.code)) return freeFailure(await remainingFree(), reservation.code, reservation.retryAfter);
        return quotaFailure(reservation);
      }
      lease = reservation.lease;
      signal.throwIfAborted();
      // Redis measured the remaining receipt/day time. Counting from before the
      // reservation request was sent keeps this monotonic local deadline conservative.
      let dispatchDeadline = funded ? started + Math.min(reservation.remainingMs, reservation.dayEndMs) - DISPATCH_MARGIN_MS : Infinity;
      const evaluate = createJevEvaluator({ apiKey, provider, model, fetchImpl: (target, options) => {
        signal.throwIfAborted();
        if (dispatchClosed || clock() >= dispatchDeadline) throw new DOMException('Provider dispatch is closed.', 'AbortError');
        usedProviderCalls += 1;
        return fetchImpl(target, options);
      } });
      if (route === '/api/connection') {
        const result = await evaluate({ state: 'Connection check for a website builder.', questions: { connection: choice('Select the successful connection option.', { connected: 'The API connection test is being evaluated.', other: 'Other.' }) }, signal });
        signal.throwIfAborted();
        outcome = 'verified';
        const recorded = await settle();
        if (recorded === 'stale') return json({ error: 'This key test finished after a newer rejection of the same key. Test the key again.', code: 'verification_stale' }, { status: 409 });
        if (recorded !== true) return json({ error: 'The provider accepted the key, but the verification could not be recorded. Test the key again shortly.', code: 'quota_unavailable' }, { status: 503, headers: { 'Retry-After': '60' } });
        return json({ verified: true, provider: resolvedProvider, model: result.model, usage: result.usage });
      }
      let calls = 0;
      const output = await compose(input, async (parameters) => {
        if (++calls > 2) throw new HostedError(502, 'provider_budget', 'The design request exceeded its processing limit.');
        signal.throwIfAborted();
        if (!funded) return evaluate({ ...parameters, signal });
        // Each funded pass is durably authorized before dispatch. An authorization
        // whose acknowledgement is lost is never dispatched; it stays counted unless
        // settlement returns it.
        const before = clock();
        const authorization = await quota.authorizePass(lease, calls);
        signal.throwIfAborted();
        const closed = new HostedError(503, 'free_deadline', 'The free design could not continue within its time limit. Your project is unchanged; unused free calls are returned when possible.');
        if (!authorization.granted) throw closed;
        dispatchDeadline = Math.min(dispatchDeadline, before + authorization.remainingMs - DISPATCH_MARGIN_MS);
        // Checked synchronously: the provider fetch starts in this same turn.
        const remaining = dispatchDeadline - clock();
        if (dispatchClosed || remaining <= 0) throw closed;
        return evaluate({ ...parameters, signal: AbortSignal.any([signal, AbortSignal.timeout(Math.max(1, Math.floor(remaining)))]) });
      }, { signal });
      signal.throwIfAborted();
      const freeFields = funded ? { freeAllowance: await remainingFree() } : {};
      signal.throwIfAborted();
      return json({ ...output, ...freeFields });
    } catch (error) {
      if (lease && lease.kind !== 'funded' && outcome === 'none') outcome = failureOutcome(error);
      if (fundedContext && error instanceof ProviderError && [401, 402, 403, 429].includes(error.upstreamStatus)) {
        const reason = error.upstreamStatus === 402 ? 'credits' : error.upstreamStatus === 429 ? 'rate_limit' : 'credentials';
        await quota.markOperatorUnavailable({ keyHash: fundedContext.keyHash, reason }).catch(() => false);
        const freeAllowance = await remainingFree();
        return freeFailure({ ...freeAllowance, available: false, reason });
      }
      const freeFields = fundedContext ? { freeAllowance: await remainingFree() } : {};
      if (signal.aborted) return json({ error: 'The request was cancelled or timed out. Your saved project is unchanged.', code: 'timeout', ...freeFields }, { status: 504 });
      // ProviderError messages are authored by our fixed adapter, never upstream bodies.
      if (error instanceof ProviderError) {
        const code = !fundedContext && [401, 403].includes(error.upstreamStatus) ? 'credentials' : 'provider';
        return json({ error: error.message, code, ...freeFields }, { status: error.status, ...(error.status === 429 ? { headers: { 'Retry-After': '60' } } : {}) });
      }
      if (error?.status === 422) return json({ error: 'Describe a supported website or frontend change. Nothing was applied.', code: 'unsupported_design', ...freeFields }, { status: 422 });
      if (fundedContext && error instanceof HostedError) return json({ error: error.message, code: error.code, ...freeFields }, { status: error.status });
      return errorResponse(error);
    } finally {
      // Redis leases expire after 60s and funded receipts are reconciled later if
      // Vercel terminates a cancelled invocation before this completes.
      await settle();
    }
  };
}

let application;
export function handleHostedRequest(request) {
  application ??= createHostedApp();
  return application(request);
}
