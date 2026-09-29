/** Vercel-only boundary. No project persistence or shared visitor keys. */
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { config, assertSameOrigin, bootstrapSession, requireSession, requireIntegrity, HostedError, json, errorResponse } from './security.mjs';
import { readConnection, readCompose } from './schemas.mjs';
import { createHostedQuota, extractTransportIp, hashQuotaIdentity } from './quota.mjs';
import { createJevEvaluator, resolveJevConfig, ProviderError } from '../server/jev.mjs';
import { choice, compose } from '../server/composer.mjs';
import { CATALOG } from '../shared/catalog.mjs';

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

function quotaFailure(reservation) {
  const limited = reservation?.status === 429;
  return json({ error: limited ? 'Usage limit reached. Please try again later.' : 'The usage service is temporarily unavailable.', code: limited ? 'rate_limit' : 'quota_unavailable' }, {
    status: limited ? 429 : 503,
    headers: { 'Retry-After': String(Number.isInteger(reservation?.retryAfter) ? Math.min(86400, Math.max(1, reservation.retryAfter)) : 60) }
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
  const normalized = isIP(address) === 6 ? new URL(`http://[${address}]/`).hostname.slice(1, -1) : address;
  return hashQuotaIdentity(normalized, env.FORMA_SESSION_SECRET, 'ip');
}

const noFree = (reason = 'unavailable') => ({ available: false, remaining: 0, limit: 10, resetAt: null, reason });
async function freeStatus(quota, context, signal) {
  if (!context) return noFree('unconfigured');
  try {
    const value = await quota.statusFree({ ...context, ...(signal ? { signal } : {}) });
    if (typeof value?.available !== 'boolean' || !Number.isInteger(value.remaining) || value.remaining < 0 || value.remaining > 10 || (value.resetAt !== null && (!Number.isSafeInteger(value.resetAt) || value.resetAt < 0))) return noFree();
    const reason = ['credentials', 'credits', 'rate_limit'].includes(value.reason) ? value.reason : !value.available ? 'unavailable' : value.remaining < 2 ? 'exhausted' : undefined;
    return { available: value.available && value.remaining >= 2, remaining: value.remaining, limit: 10, resetAt: value.resetAt, ...(reason ? { reason } : {}) };
  } catch { return noFree(); }
}

function freeFailure(freeAllowance, exhausted = false) {
  return json({
    error: exhausted ? 'Not enough free JEV calls remain for this design. Add your own API key to continue.' : 'Free JEV is unavailable. Add your own API key to continue.',
    code: exhausted ? 'free_limit' : 'free_unavailable', freeAllowance,
  }, { status: exhausted ? 429 : 503 });
}

export function createHostedApp({ env = process.env, fetchImpl = globalThis.fetch, quota = createHostedQuota({ env, fetchImpl }) } = {}) {
  return async function handle(request) {
    let lease, fundedContext, settledAllowance;
    let usedProviderCalls = 0, settled = false;
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(45000)]);
    async function settle() {
      if (!lease || settled) return true;
      settled = true;
      return quota.releaseUsage(lease, { usedProviderCalls }).catch(() => false);
    }
    async function remainingFree() {
      if (settledAllowance) return settledAllowance;
      if (!await settle()) return (settledAllowance = noFree());
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
      if (!['/api/status', '/api/connection', '/api/compose'].includes(route)) throw new HostedError(404, 'route', 'This endpoint is unavailable.');
      const method = route === '/api/status' ? 'GET' : 'POST';
      if (request.method !== method) return json({ error: 'This request method is not supported.', code: 'method' }, { status: 405, headers: { Allow: method } });
      let ipHash;
      try { ipHash = hashQuotaIdentity(extractTransportIp(request.headers), env.FORMA_SESSION_SECRET, 'ip'); }
      catch { throw new HostedError(403, 'transport', 'Request source is not available.'); }
      signal.throwIfAborted();
      const operator = operatorConfiguration(env);
      const visitorIpHash = operator ? visitorIdentity(request, env) : null;
      const operatorContext = operator && visitorIpHash ? { visitorIpHash, keyHash: hashQuotaIdentity(operator.apiKey, env.FORMA_SESSION_SECRET, 'key') } : null;
      if (route === '/api/status') {
        const allowed = await quota.reserveUsage({ operation: 'bootstrap', ipHash, requestId: randomUUID(), signal });
        if (!allowed.granted) return quotaFailure(allowed);
        const { csrfToken, setCookies } = bootstrapSession(request, cfg);
        const freeAllowance = operatorContext ? await freeStatus(quota, operatorContext, signal) : noFree(operator ? 'unavailable' : 'unconfigured');
        signal.throwIfAborted();
        return json({ deployment: 'hosted', csrfToken, configured: false, verified: false, credentialSource: 'none', provider: operator?.provider || 'typesafe', model: operator?.model || 'jev-1.13.0', version: '0.1.0', catalogSize: CATALOG.length, freeAllowance }, { setCookies });
      }
      const { session } = requireSession(request, cfg);
      requireIntegrity(request, cfg, session);
      const identity = { sessionId: session.id, ipHash, signal };
      const allowed = await quota.reserveUsage({ ...identity, operation: 'request', requestId: randomUUID() });
      if (!allowed.granted) return quotaFailure(allowed);
      // Rate-limit before allocating/parsing a bounded body, then charge provider units.
      const { apiKey: suppliedKey, provider: suppliedProvider, ...input } = await (route === '/api/connection' ? readConnection(request) : readCompose(request));
      signal.throwIfAborted();
      const funded = route === '/api/compose' && suppliedKey === undefined;
      if (funded && !operatorContext) return freeFailure(noFree(operator ? 'unavailable' : 'unconfigured'));
      const apiKey = funded ? operator.apiKey : suppliedKey;
      const provider = funded ? operator.provider : suppliedProvider;
      const model = funded ? operator.model : 'jev-1.13.0';
      if (funded) fundedContext = operatorContext;
      const reservation = await quota.reserveUsage({ ...identity, operation: route === '/api/connection' ? 'connection' : 'compose', keyHash: hashQuotaIdentity(apiKey, env.FORMA_SESSION_SECRET, 'key'), requestId: randomUUID(), ...(funded ? { funded: true, visitorIpHash } : {}) });
      if (!reservation.granted) {
        if (funded && ['FREE_LIMIT_REACHED', 'FREE_UNAVAILABLE'].includes(reservation.code)) return freeFailure(await remainingFree(), reservation.code === 'FREE_LIMIT_REACHED');
        return quotaFailure(reservation);
      }
      lease = reservation.lease;
      signal.throwIfAborted();
      const evaluate = createJevEvaluator({ apiKey, provider, model, fetchImpl: (url, options) => {
        signal.throwIfAborted();
        usedProviderCalls += 1;
        return fetchImpl(url, options);
      } });
      if (route === '/api/connection') {
        const result = await evaluate({ state: 'Connection check for a website builder.', questions: { connection: choice('Select the successful connection option.', { connected: 'The API connection test is being evaluated.', other: 'Other.' }) }, signal });
        signal.throwIfAborted();
        return json({ verified: true, provider: resolveJevConfig({ apiKey, provider }).provider, model: result.model, usage: result.usage });
      }
      let calls = 0;
      const output = await compose(input, async (parameters) => {
        if (++calls > 2) throw new HostedError(502, 'provider_budget', 'The design request exceeded its processing limit.');
        signal.throwIfAborted();
        return evaluate({ ...parameters, signal });
      }, { signal });
      signal.throwIfAborted();
      const freeFields = funded ? { freeAllowance: await remainingFree() } : {};
      signal.throwIfAborted();
      return json({ ...output, ...freeFields });
    } catch (error) {
      if (fundedContext && error instanceof ProviderError && [401, 402, 403, 429].includes(error.upstreamStatus)) {
        const reason = error.upstreamStatus === 402 ? 'credits' : error.upstreamStatus === 429 ? 'rate_limit' : 'credentials';
        await quota.markOperatorUnavailable({ keyHash: fundedContext.keyHash, reason }).catch(() => false);
        const freeAllowance = await remainingFree();
        return freeFailure({ ...freeAllowance, available: false, reason });
      }
      const freeFields = fundedContext ? { freeAllowance: await remainingFree() } : {};
      if (signal.aborted) return json({ error: 'The request was cancelled or timed out. Your saved project is unchanged.', code: 'timeout', ...freeFields }, { status: 504 });
      // ProviderError messages are authored by our fixed adapter, never upstream bodies.
      if (error instanceof ProviderError) return json({ error: error.message, code: 'provider', ...freeFields }, { status: error.status, ...(error.status === 429 ? { headers: { 'Retry-After': '60' } } : {}) });
      if (error?.status === 422) return json({ error: 'Describe a supported website or frontend change. Nothing was applied.', code: 'unsupported_design', ...freeFields }, { status: 422 });
      return errorResponse(error);
    } finally {
      // Redis leases also expire after 60s if Vercel terminates a cancelled invocation.
      await settle();
    }
  };
}

let application;
export function handleHostedRequest(request) {
  application ??= createHostedApp();
  return application(request);
}
