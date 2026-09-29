/** Server-only abuse accounting. Provider keys and transport IPs never enter Redis. */
import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';

const PREFIX = 'forma:{quota-v1}:';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HASH = /^[0-9a-f]{64}$/;
const RESPONSE_BYTES = 8192;
const LEASE_MS = 60000;
const UNAVAILABLE = Object.freeze({ granted: false, status: 503, code: 'SERVICE_UNAVAILABLE', retryAfter: 60 });
const FREE_UNAVAILABLE = Object.freeze({ available: false, remaining: 0, resetAt: null, code: 'SERVICE_UNAVAILABLE' });
const OPERATOR_FAILURES = ['credentials', 'credits', 'rate_limit'];

// This is fixed, authored Redis Lua. No application input becomes executable code.
// All checks and accounting run in one Redis transaction, using Redis's clock.
const RESERVE_SCRIPT = `
local clock = redis.call('TIME')
local seconds = tonumber(clock[1])
local now = seconds * 1000 + math.floor(tonumber(clock[2]) / 1000)
local day = math.floor(seconds / 86400)
local policies = cjson.decode(ARGV[1])
local request = ARGV[2]
if redis.call('EXISTS', KEYS[1]) == 1 then return {0, 'duplicate', 60} end
for i, policy in ipairs(policies) do
  local key = KEYS[i + 1]
  if policy.kind == 'health' then
    if redis.call('EXISTS', key) == 1 then
      return {0, 'unavailable', math.max(1, redis.call('TTL', key))}
    end
  elseif policy.kind == 'daily' then
    local stored = redis.call('HMGET', key, 'day', 'used')
    local used = 0
    if tonumber(stored[1]) == day then used = tonumber(stored[2]) or 0 end
    if used + policy.units > policy.limit then
      local reason = 'daily'
      if policy.funded then reason = 'free_daily' end
      return {0, reason, math.max(1, (day + 1) * 86400 - seconds)}
    end
  elseif policy.kind ~= 'health' then
    local cutoff = now
    if policy.kind == 'burst' then cutoff = now - 60000 end
    redis.call('ZREMRANGEBYSCORE', key, '-inf', cutoff)
    if redis.call('ZCARD', key) + policy.units > policy.limit then return {0, policy.kind, 60} end
  end
end
for i, policy in ipairs(policies) do
  local key = KEYS[i + 1]
  if policy.kind == 'daily' then
    if tonumber(redis.call('HGET', key, 'day')) ~= day then
      redis.call('HSET', key, 'day', day, 'used', 0)
    end
    redis.call('HINCRBY', key, 'used', policy.units)
    redis.call('EXPIRE', key, 172800)
  elseif policy.kind ~= 'health' then
    local score = now
    if policy.kind == 'lease' then score = now + 60000 end
    if policy.kind == 'burst' then
      for unit = 1, policy.units do redis.call('ZADD', key, score, request .. ':' .. unit) end
    else
      redis.call('ZADD', key, score, request)
    end
    redis.call('PEXPIRE', key, 61000)
  end
end
local receipt = '1'
if policies[1].kind == 'health' then
  local details = policies[1].receipt
  details.day = day
  details.units = policies[2].units
  details.settled = false
  receipt = cjson.encode(details)
end
redis.call('SET', KEYS[1], receipt, 'PX', 90000)
return {1, 'ok', 0}
`;
const RELEASE_SCRIPT = `
local removed = 0
for i = 1, 3 do removed = removed + redis.call('ZREM', KEYS[i], ARGV[1]) end
if #KEYS == 6 then
  local raw = redis.call('GET', KEYS[4])
  if raw and raw ~= '1' then
    local receipt = cjson.decode(raw)
    local started = tonumber(ARGV[2])
    if not receipt.settled and receipt.visitorIpHash == ARGV[3] and receipt.sessionId == ARGV[4] and receipt.keyHash == ARGV[5] and started >= 0 and started <= receipt.units then
      local unused = receipt.units - started
      for i = 5, 6 do
        if tonumber(redis.call('HGET', KEYS[i], 'day')) == receipt.day then
          local used = tonumber(redis.call('HGET', KEYS[i], 'used')) or 0
          if used >= unused then redis.call('HINCRBY', KEYS[i], 'used', -unused) end
        end
      end
      receipt.settled = true
      local ttl = math.max(1, redis.call('PTTL', KEYS[4]))
      redis.call('SET', KEYS[4], cjson.encode(receipt), 'PX', ttl)
    end
  end
end
return removed
`;
const FREE_STATUS_SCRIPT = `
local clock = redis.call('TIME')
local day = math.floor(tonumber(clock[1]) / 86400)
local reset = (day + 1) * 86400000
local health = redis.call('GET', KEYS[1])
if health then return {0, 0, reset, health} end
local remaining = tonumber(ARGV[1])
for i = 2, 4 do
  local stored = redis.call('HMGET', KEYS[i], 'day', 'used')
  local used = 0
  if tonumber(stored[1]) == day then used = tonumber(stored[2]) or 0 end
  remaining = math.min(remaining, math.max(0, tonumber(ARGV[i - 1]) - used))
end
return {1, remaining, reset, 'ok'}
`;
const MARK_OPERATOR_SCRIPT = `
redis.call('SET', KEYS[1], ARGV[1], 'EX', 300)
return 1
`;

export const HOSTED_QUOTA_LIMITS = Object.freeze({
  bootstrapPerTransportIpMinute: 60, bootstrapGlobalDay: 30000,
  requestsPerSessionIpMinute: 120, requestsPerTransportIpMinute: 300, requestsGlobalDay: 100000,
  providerPerSessionIpMinute: 10, providerPerKeyMinute: 10, providerPerTransportIpMinute: 120,
  providerCallsPerSessionDay: 200, providerCallsPerKeyDay: 200, providerCallsGlobalDay: 5000,
  providerConcurrentSession: 1, providerConcurrentKey: 2, providerConcurrentGlobal: 50,
  freeCallsPerVisitorDay: 10, freeCallsGlobalDay: 500, freeProviderPerKeyMinute: 60, freeConcurrentKey: 10,
  providerLeaseMs: LEASE_MS
});

/** Only Vercel's overwritten transport header is usable here; it may identify Cloudflare. */
export function extractTransportIp(headers) {
  const raw = typeof headers?.get === 'function' ? headers.get('x-forwarded-for') : headers?.['x-forwarded-for'];
  if (typeof raw !== 'string' || raw.length > 512) throw new Error('Transport identity unavailable.');
  const address = raw.split(',')[0].trim();
  if (!isIP(address)) throw new Error('Transport identity unavailable.');
  // URL canonicalization makes alternate IPv6 spellings share the same limit.
  return isIP(address) === 6 ? new URL(`http://[${address}]/`).hostname.slice(1, -1) : address;
}

export function hashQuotaIdentity(value, secret, kind) {
  if (!['ip', 'key'].includes(kind) || typeof value !== 'string' || !value || value.length > 4096 || typeof secret !== 'string' || secret.length < 32 || secret.length > 4096) {
    throw new Error('Quota identity unavailable.');
  }
  return createHmac('sha256', secret).update(`forma:quota:${kind}:v1\0`).update(value).digest('hex');
}

function redisConfiguration(env) {
  const endpoint = env?.QWEN3_KV_REST_API_URL, token = env?.QWEN3_KV_REST_API_TOKEN;
  const configuredLimit = env?.QWEN3_LIMIT ?? '10';
  const freeGlobalLimit = env?.FORMA_FREE_GLOBAL_DAILY_LIMIT ?? '500';
  if (typeof configuredLimit !== 'string' || !/^[1-9][0-9]{0,2}$/.test(configuredLimit) || Number(configuredLimit) > 120) return null;
  if (typeof freeGlobalLimit !== 'string' || !/^[1-9][0-9]{0,3}$/.test(freeGlobalLimit) || Number(freeGlobalLimit) > 5000) return null;
  if (typeof endpoint !== 'string' || endpoint.length > 256 || typeof token !== 'string' || token.length < 16 || token.length > 2048 || !/^[A-Za-z0-9._~+/-]+={0,2}$/.test(token)) return null;
  try {
    const url = new URL(endpoint);
    if (url.protocol !== 'https:' || !/^[a-z0-9]+(?:-[a-z0-9]+)*\.upstash\.io$/.test(url.hostname) || url.port || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) return null;
    return { endpoint: url.origin, token, providerMinuteLimit: Number(configuredLimit), freeGlobalLimit: Number(freeGlobalLimit) };
  } catch { return null; }
}

function validReservation(value) {
  if (!value || typeof value !== 'object' || !UUID.test(value.requestId) || !HASH.test(value.ipHash) || !['bootstrap', 'request', 'connection', 'compose'].includes(value.operation)) return false;
  if (value.operation !== 'bootstrap' && !UUID.test(value.sessionId)) return false;
  if (['connection', 'compose'].includes(value.operation) && !HASH.test(value.keyHash)) return false;
  if (value.funded !== undefined && typeof value.funded !== 'boolean') return false;
  if (value.funded && (!['connection', 'compose'].includes(value.operation) || !HASH.test(value.visitorIpHash))) return false;
  return true;
}

function providerLeaseKeys({ sessionId, keyHash, funded = false }) {
  return [`${PREFIX}lease:session:${sessionId}`, `${PREFIX}lease:${funded ? 'free-key' : 'key'}:${keyHash}`, `${PREFIX}lease:global`];
}

function reservationCommand(value, { providerMinuteLimit, freeGlobalLimit } = {}) {
  const { operation, sessionId, ipHash, keyHash, requestId, funded = false, visitorIpHash } = value;
  const keys = [`${PREFIX}seen:${operation}:${requestId}`], policies = [];
  const add = (scope, kind, limit, units = 1, freeBudget = false) => { keys.push(`${PREFIX}${kind}:${scope}`); policies.push({ kind, limit, units, ...(freeBudget ? { funded: true } : {}) }); };
  const bounds = HOSTED_QUOTA_LIMITS;
  if (operation === 'bootstrap') {
    add(`bootstrap:ip:${ipHash}`, 'burst', bounds.bootstrapPerTransportIpMinute);
    add('bootstrap:global', 'daily', bounds.bootstrapGlobalDay);
  } else if (operation === 'request') {
    add(`request:session-ip:${sessionId}:${ipHash}`, 'burst', bounds.requestsPerSessionIpMinute);
    add(`request:ip:${ipHash}`, 'burst', bounds.requestsPerTransportIpMinute);
    add('request:global', 'daily', bounds.requestsGlobalDay);
  } else {
    const units = operation === 'compose' ? 2 : 1;
    if (funded) {
      add(`free-key:${keyHash}`, 'health', 0, 0);
      policies[0].receipt = { sessionId, keyHash, visitorIpHash };
      add(`free:visitor:${visitorIpHash}`, 'daily', bounds.freeCallsPerVisitorDay, units, true);
      add('free:global', 'daily', freeGlobalLimit, units, true);
    }
    add(`provider:session-ip:${sessionId}:${ipHash}`, 'burst', providerMinuteLimit, units);
    add(`${funded ? 'free' : 'provider'}:key:${keyHash}`, 'burst', funded ? bounds.freeProviderPerKeyMinute : providerMinuteLimit, units);
    add(`provider:ip:${ipHash}`, 'burst', bounds.providerPerTransportIpMinute, units);
    add(`provider:session:${sessionId}`, 'daily', bounds.providerCallsPerSessionDay, units);
    if (!funded) add(`provider:key:${keyHash}`, 'daily', bounds.providerCallsPerKeyDay, units);
    add('provider:global', 'daily', bounds.providerCallsGlobalDay, units);
    add(`session:${sessionId}`, 'lease', bounds.providerConcurrentSession);
    add(`${funded ? 'free-key' : 'key'}:${keyHash}`, 'lease', funded ? bounds.freeConcurrentKey : bounds.providerConcurrentKey);
    add('global', 'lease', bounds.providerConcurrentGlobal);
  }
  return ['EVAL', RESERVE_SCRIPT, keys.length, ...keys, JSON.stringify(policies), requestId];
}

async function readRedisResponse(response, signal) {
  if (!response.ok || Number(response.headers.get('content-length')) > RESPONSE_BYTES || !response.body) {
    response.body?.cancel().catch(() => {});
    throw new Error('Quota service unavailable.');
  }
  const reader = response.body.getReader(), chunks = [];
  let size = 0;
  const cancel = () => { reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const { value, done } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > RESPONSE_BYTES) throw new Error('Quota service unavailable.');
      chunks.push(Buffer.from(value));
    }
    const decoded = JSON.parse(Buffer.concat(chunks, size).toString('utf8'));
    if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded) || Object.keys(decoded).length !== 1 || !Object.hasOwn(decoded, 'result')) throw new Error('Quota service unavailable.');
    return decoded.result;
  } finally {
    signal.removeEventListener('abort', cancel);
    cancel();
  }
}

/** No configuration or provider/Redis exception details cross this module's boundary. */
export function createHostedQuota({ env = process.env, fetchImpl = fetch } = {}) {
  const configuration = redisConfiguration(env);
  async function execute(command, signal) {
    if (!configuration) throw new Error('Quota service unavailable.');
    const deadline = AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(3000)]);
    deadline.throwIfAborted();
    const response = await fetchImpl(configuration.endpoint, {
      method: 'POST', redirect: 'error', cache: 'no-store', signal: deadline,
      headers: { Authorization: `Bearer ${configuration.token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(command)
    });
    return readRedisResponse(response, deadline);
  }
  return {
    async reserveUsage(value) {
      if (!validReservation(value)) return UNAVAILABLE;
      try {
        const result = await execute(reservationCommand(value, configuration ?? undefined), value.signal);
        if (!Array.isArray(result) || result.length !== 3) return UNAVAILABLE;
        const [granted, reason, retryAfter] = result;
        if (value.funded && granted === 0 && ['free_daily', 'unavailable'].includes(reason) && Number.isInteger(retryAfter) && retryAfter >= 1 && retryAfter <= 86400) {
          return { granted: false, status: reason === 'free_daily' ? 429 : 503, code: reason === 'free_daily' ? 'FREE_LIMIT_REACHED' : 'FREE_UNAVAILABLE', retryAfter };
        }
        if (granted === 0 && ['daily', 'burst', 'lease', 'duplicate'].includes(reason) && Number.isInteger(retryAfter) && retryAfter >= 1 && retryAfter <= 86400) {
          return { granted: false, status: 429, code: 'RATE_LIMITED', retryAfter };
        }
        if (granted !== 1 || reason !== 'ok' || retryAfter !== 0) return UNAVAILABLE;
        if (!['connection', 'compose'].includes(value.operation)) return { granted: true };
        return { granted: true, lease: Object.freeze({ sessionId: value.sessionId, keyHash: value.keyHash, requestId: value.requestId, ...(value.funded ? { funded: true, visitorIpHash: value.visitorIpHash, operation: value.operation } : {}) }) };
      } catch { return UNAVAILABLE; }
    },
    async releaseUsage(lease, settlement = {}) {
      if (!lease || !UUID.test(lease.sessionId) || !UUID.test(lease.requestId) || !HASH.test(lease.keyHash) || (lease.funded !== undefined && typeof lease.funded !== 'boolean')) return false;
      if (lease.funded && (!HASH.test(lease.visitorIpHash) || !['connection', 'compose'].includes(lease.operation))) return false;
      const started = settlement?.usedProviderCalls ?? (lease.operation === 'connection' ? 1 : 2);
      if (lease.funded && (!Number.isInteger(started) || started < 0 || started > (lease.operation === 'connection' ? 1 : 2))) return false;
      try {
        const keys = providerLeaseKeys(lease);
        const args = [lease.requestId];
        if (lease.funded) {
          keys.push(`${PREFIX}seen:${lease.operation}:${lease.requestId}`, `${PREFIX}daily:free:visitor:${lease.visitorIpHash}`, `${PREFIX}daily:free:global`);
          args.push(started, lease.visitorIpHash, lease.sessionId, lease.keyHash);
        }
        // Cleanup must remain possible after the request's abort signal fires.
        const result = await execute(['EVAL', RELEASE_SCRIPT, keys.length, ...keys, ...args]);
        return Number.isInteger(result) && result >= 0 && result <= 3;
      } catch { return false; } // Expiring leases recover independently if Redis is unavailable.
    },
    async statusFree({ visitorIpHash, keyHash, signal } = {}) {
      if (!HASH.test(visitorIpHash) || !HASH.test(keyHash)) return FREE_UNAVAILABLE;
      try {
        const keys = [`${PREFIX}health:free-key:${keyHash}`, `${PREFIX}daily:free:visitor:${visitorIpHash}`, `${PREFIX}daily:free:global`, `${PREFIX}daily:provider:global`];
        const result = await execute(['EVAL', FREE_STATUS_SCRIPT, keys.length, ...keys, HOSTED_QUOTA_LIMITS.freeCallsPerVisitorDay, configuration?.freeGlobalLimit, HOSTED_QUOTA_LIMITS.providerCallsGlobalDay], signal);
        if (!Array.isArray(result) || result.length !== 4) return FREE_UNAVAILABLE;
        const [available, remaining, resetAt, reason] = result;
        if (!Number.isSafeInteger(remaining) || remaining < 0 || remaining > HOSTED_QUOTA_LIMITS.freeCallsPerVisitorDay || !Number.isSafeInteger(resetAt) || resetAt <= 0) return FREE_UNAVAILABLE;
        if (available === 1 && reason === 'ok') return { available: true, remaining, resetAt };
        if (available === 0 && remaining === 0 && OPERATOR_FAILURES.includes(reason)) return { available: false, remaining, resetAt, code: 'FREE_UNAVAILABLE', reason };
        return FREE_UNAVAILABLE;
      } catch { return FREE_UNAVAILABLE; }
    },
    async markOperatorUnavailable({ keyHash, reason } = {}) {
      if (!HASH.test(keyHash) || !OPERATOR_FAILURES.includes(reason)) return false;
      try {
        // The five-minute circuit breaker is shared across invocations. It never
        // stores exception bodies, keys, or a permanent claim about account credit.
        return await execute(['EVAL', MARK_OPERATOR_SCRIPT, 1, `${PREFIX}health:free-key:${keyHash}`, reason]) === 1;
      } catch { return false; }
    }
  };
}
