/** Server-only abuse accounting. Provider keys and IP addresses never enter Redis. */
import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import { readBoundedJson } from './security.mjs';

const PREFIX = 'forma:{quota-v1}:';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HASH = /^[0-9a-f]{64}$/;
const RESPONSE_BYTES = 8192;
const LEASE_MS = 60000;
const UNAVAILABLE = Object.freeze({ granted: false, status: 503, code: 'SERVICE_UNAVAILABLE', retryAfter: 60 });
const FREE_UNAVAILABLE = Object.freeze({ available: false, remaining: 0, resetAt: null, code: 'SERVICE_UNAVAILABLE' });
const OPERATOR_FAILURES = ['credentials', 'credits', 'rate_limit'];
const RELEASE_OUTCOMES = ['none', 'verified', 'credentials', 'backoff'];

export const HOSTED_QUOTA_LIMITS = Object.freeze({
  // Replenishing admission: every window is a rolling 60 seconds. No shared
  // anonymous/personal-key counter waits for UTC midnight. Behind Cloudflare the
  // transport IP is a Cloudflare address shared by many visitors, so each
  // transport window equals its deployment-wide window.
  statusPerVisitorMinute: 10, statusPerTransportIpMinute: 300, statusGlobalMinute: 300,
  requestsPerVisitorMinute: 30, requestsPerSessionIpMinute: 120, requestsPerTransportIpMinute: 600, requestsGlobalMinute: 600,
  // Verified personal-key and operator-funded work. QWEN3_LIMIT sets the
  // session + transport IP and personal-key minute budgets.
  providerPerTransportIpMinute: 240, providerGlobalMinute: 240,
  providerCallsPerSessionDay: 200, providerCallsPerKeyDay: 200,
  providerConcurrentSession: 1, providerConcurrentKey: 2, providerConcurrentGlobal: 50,
  // Personal-key connection tests have their own rate and concurrency partition.
  probesPerVisitorMinute: 3, probesPerNetworkMinute: 6, probesPerTransportIpMinute: 60, probesGlobalMinute: 60,
  probeConcurrentVisitor: 1, probeConcurrentGlobal: 10,
  // Turnstile Siteverify requests. A pass lasts for the guest session, so these stay small.
  challengesPerVisitorMinute: 5, challengesPerNetworkMinute: 10, challengesPerTransportIpMinute: 120, challengesGlobalMinute: 120,
  credentialFailureLimit: 5, credentialFailureWindowMs: 900000, credentialCooldownMs: 900000,
  keyBackoffMs: 60000, verificationTtlMs: 43200000,
  // Operator-funded daily spending and its durable receipts.
  freeCallsPerVisitorDay: 10, freeCallsGlobalDay: 500, freeProviderPerKeyMinute: 60, freeConcurrentKey: 10,
  fundedCutoffMs: 60000, fundedReceiptMs: 50000, fundedAcceptMs: 30000, receiptRetentionMs: 600000, receiptReconcileBatch: 4,
  providerLeaseMs: LEASE_MS
});
const LIMITS = HOSTED_QUOTA_LIMITS;

// These are fixed, authored Redis Lua fragments. No application input becomes
// executable code. Each script runs atomically and uses Redis's clock. Every key
// shares the {quota-v1} hash tag and is passed through KEYS.
const PRELUDE = `
local clock = redis.call('TIME')
local seconds = tonumber(clock[1])
local now = seconds * 1000 + math.floor(tonumber(clock[2]) / 1000)
local day = math.floor(seconds / 86400)
local dayEnd = (day + 1) * 86400000
local function check(policies)
  for _, policy in ipairs(policies) do
    local key = KEYS[policy.k]
    local kind = policy.kind
    if kind == 'block' then
      if redis.call('EXISTS', key) == 1 then return {policy.reason, math.max(1, redis.call('TTL', key))} end
    elseif kind == 'evidence' then
      if redis.call('HGET', key, 'state') ~= 'verified' then return {'verification_required', 1} end
    elseif kind == 'cutoff' then
      if dayEnd - now <= policy.ms then return {'day_closing', math.max(1, math.ceil((dayEnd - now) / 1000))} end
    elseif kind == 'daily' then
      local stored = redis.call('HMGET', key, 'day', 'used')
      local used = 0
      if tonumber(stored[1]) == day then used = tonumber(stored[2]) or 0 end
      if used + policy.units > policy.limit then
        local reason = 'daily'
        if policy.funded then reason = 'free_daily' end
        return {reason, math.max(1, (day + 1) * 86400 - seconds)}
      end
    elseif kind == 'burst' or kind == 'lease' then
      local cutoff = now
      if kind == 'burst' then cutoff = now - 60000 end
      redis.call('ZREMRANGEBYSCORE', key, '-inf', cutoff)
      local count = redis.call('ZCARD', key)
      if count + policy.units > policy.limit then
        -- Replenishing limits report when enough entries leave the window.
        local over = count + policy.units - policy.limit
        local oldest = redis.call('ZRANGE', key, over - 1, over - 1, 'WITHSCORES')
        local wait = 60
        if oldest[2] then
          local released = tonumber(oldest[2])
          if kind == 'burst' then released = released + 60000 end
          wait = math.ceil((released - now) / 1000)
        end
        return {kind, math.min(60, math.max(1, wait))}
      end
    elseif kind ~= 'observe' then
      return {'invalid', 60}
    end
  end
  return false
end
local function apply(policies, request)
  for _, policy in ipairs(policies) do
    local key = KEYS[policy.k]
    if policy.kind == 'daily' then
      if tonumber(redis.call('HGET', key, 'day')) ~= day then redis.call('HSET', key, 'day', day, 'used', 0) end
      redis.call('HINCRBY', key, 'used', policy.units)
      redis.call('EXPIRE', key, 172800)
    elseif policy.kind == 'burst' then
      for unit = 1, policy.units do redis.call('ZADD', key, now, request .. ':' .. unit) end
      redis.call('PEXPIRE', key, 61000)
    elseif policy.kind == 'lease' then
      redis.call('ZADD', key, now + ${LEASE_MS}, request)
      redis.call('PEXPIRE', key, ${LEASE_MS + 1000})
    end
  end
end
`;
// Funded receipts: KEYS[1] visitor receipts hash, KEYS[2] visitor expiry index,
// KEYS[3] free visitor day counter, KEYS[4] free global day counter.
const RECEIPTS = `
local function refund(receipt, used)
  local unused = receipt.units - used
  if unused <= 0 then return 0 end
  for i = 3, 4 do
    -- A receipt from an earlier UTC day never decrements today's counters.
    if tonumber(redis.call('HGET', KEYS[i], 'day')) == receipt.day then
      local current = tonumber(redis.call('HGET', KEYS[i], 'used')) or 0
      if current >= unused then redis.call('HINCRBY', KEYS[i], 'used', -unused) end
    end
  end
  return unused
end
local function close(request, receipt, used, retention)
  local refunded = refund(receipt, used)
  receipt.state = 'closed'
  receipt.used = used
  redis.call('HSET', KEYS[1], request, cjson.encode(receipt))
  redis.call('ZADD', KEYS[2], now + retention, request)
  return refunded
end
local function reconcile(batch, retention)
  local due = redis.call('ZRANGEBYSCORE', KEYS[2], '-inf', now, 'LIMIT', 0, batch)
  for _, request in ipairs(due) do
    local raw = redis.call('HGET', KEYS[1], request)
    local receipt = raw and cjson.decode(raw)
    if receipt and receipt.state == 'active' then
      -- Abandoned after its deadline: units already authorized for dispatch stay counted.
      close(request, receipt, receipt.authorized, retention)
    else
      redis.call('HDEL', KEYS[1], request)
      redis.call('ZREM', KEYS[2], request)
    end
  end
end
`;
const RESERVE_SCRIPT = `${PRELUDE}
if redis.call('EXISTS', KEYS[1]) == 1 then return {0, 'duplicate', 60, now, dayEnd, 0} end
local policies = cjson.decode(ARGV[1])
local denied = check(policies)
if denied then return {0, denied[1], denied[2], now, dayEnd, 0} end
apply(policies, ARGV[2])
redis.call('SET', KEYS[1], '1', 'PX', 90000)
local generation = 0
for _, policy in ipairs(policies) do
  if policy.kind == 'observe' then generation = tonumber(redis.call('HGET', KEYS[policy.k], 'gen')) or 0 end
end
return {1, 'ok', 0, now, dayEnd, generation}
`;
const FUNDED_RESERVE_SCRIPT = `${PRELUDE}${RECEIPTS}
local spec = cjson.decode(ARGV[1])
local request = ARGV[2]
-- The immutable acceptance deadline stops a delayed command from charging after
-- its caller has given up, even once a cancellation tombstone has expired.
if now > spec.acceptBy then return {0, 'expired', 60, now, dayEnd, 0} end
reconcile(spec.batch, spec.retention)
if redis.call('HEXISTS', KEYS[1], request) == 1 then return {0, 'duplicate', 60, now, dayEnd, 0} end
local denied = check(spec.policies)
if denied then return {0, denied[1], denied[2], now, dayEnd, 0} end
apply(spec.policies, request)
local deadline = math.min(now + spec.receiptMs, dayEnd)
local receipt = spec.receipt
receipt.state = 'active'
receipt.day = day
receipt.authorized = 0
receipt.deadline = deadline
redis.call('HSET', KEYS[1], request, cjson.encode(receipt))
redis.call('ZADD', KEYS[2], deadline, request)
redis.call('PEXPIRE', KEYS[1], 172800000)
redis.call('PEXPIRE', KEYS[2], 172800000)
return {1, 'ok', 0, now, dayEnd, deadline}
`;
// ARGV: request, pass, session ID, key hash.
const AUTHORIZE_SCRIPT = `${PRELUDE}
local raw = redis.call('HGET', KEYS[1], ARGV[1])
if not raw then return {0, 'missing', 0} end
local receipt = cjson.decode(raw)
if receipt.state ~= 'active' then return {0, 'closed', 0} end
if receipt.sessionId ~= ARGV[3] or receipt.keyHash ~= ARGV[4] then return {0, 'mismatch', 0} end
if receipt.day ~= day or now >= receipt.deadline then return {0, 'expired', 0} end
local pass = tonumber(ARGV[2])
if pass ~= receipt.authorized + 1 or pass > receipt.units then return {0, 'order', 0} end
receipt.authorized = pass
redis.call('HSET', KEYS[1], ARGV[1], cjson.encode(receipt))
return {1, 'ok', receipt.deadline - now}
`;
// KEYS[5..7] provider leases. ARGV: request, fetched passes, session ID, key hash, retention.
const SETTLE_SCRIPT = `${PRELUDE}${RECEIPTS}
for i = 5, #KEYS do redis.call('ZREM', KEYS[i], ARGV[1]) end
local retention = tonumber(ARGV[5])
local raw = redis.call('HGET', KEYS[1], ARGV[1])
if not raw then
  -- Closing before a delayed reservation leaves a tombstone that refuses it later.
  redis.call('HSET', KEYS[1], ARGV[1], cjson.encode({state = 'cancelled'}))
  redis.call('ZADD', KEYS[2], now + retention, ARGV[1])
  redis.call('PEXPIRE', KEYS[1], 172800000)
  redis.call('PEXPIRE', KEYS[2], 172800000)
  return {1, 'cancelled', 0}
end
local receipt = cjson.decode(raw)
if receipt.state ~= 'active' then return {1, receipt.state, 0} end
if receipt.sessionId ~= ARGV[3] or receipt.keyHash ~= ARGV[4] then return {0, 'mismatch', 0} end
local used = tonumber(ARGV[2])
if used < 0 or used > receipt.authorized then return {0, 'invalid', 0} end
return {1, 'closed', close(ARGV[1], receipt, used, retention)}
`;
// KEYS[1..L] leases, then evidence, credential failures, probe cooldown and key backoff.
// ARGV: L, request, outcome, generation seen at admission, evidence TTL, failure window,
// failure limit, cooldown, backoff.
const RELEASE_SCRIPT = `${PRELUDE}
local count = tonumber(ARGV[1])
for i = 1, count do redis.call('ZREM', KEYS[i], ARGV[2]) end
local outcome = ARGV[3]
if outcome == 'none' then return {1, 'released'} end
local evidence, failures, cooldown, backoff = KEYS[count + 1], KEYS[count + 2], KEYS[count + 3], KEYS[count + 4]
local ttl = tonumber(ARGV[5])
if outcome == 'verified' then
  local generation = tonumber(redis.call('HGET', evidence, 'gen')) or 0
  -- A late success cannot restore evidence after a newer credential rejection.
  if generation ~= tonumber(ARGV[4]) then return {1, 'stale'} end
  redis.call('HSET', evidence, 'state', 'verified', 'gen', generation)
  redis.call('PEXPIRE', evidence, ttl)
  return {1, 'verified'}
elseif outcome == 'credentials' then
  -- A replayed rejection is recognized by its request and cannot revoke newer evidence.
  if redis.call('ZSCORE', failures, ARGV[2]) then return {1, 'revoked'} end
  local generation = (tonumber(redis.call('HGET', evidence, 'gen')) or 0) + 1
  redis.call('HSET', evidence, 'state', 'revoked', 'gen', generation)
  redis.call('PEXPIRE', evidence, ttl)
  local window = tonumber(ARGV[6])
  redis.call('ZREMRANGEBYSCORE', failures, '-inf', now - window)
  redis.call('ZADD', failures, now, ARGV[2])
  redis.call('PEXPIRE', failures, window)
  if redis.call('ZCARD', failures) >= tonumber(ARGV[7]) then redis.call('SET', cooldown, '1', 'PX', tonumber(ARGV[8])) end
  return {1, 'revoked'}
elseif outcome == 'backoff' then
  redis.call('SET', backoff, '1', 'PX', tonumber(ARGV[9]))
  return {1, 'backoff'}
end
return {0, 'invalid'}
`;
// KEYS[5] operator health. ARGV: visitor limit, global limit, cutoff, batch, retention.
const FREE_STATUS_SCRIPT = `${PRELUDE}${RECEIPTS}
reconcile(tonumber(ARGV[4]), tonumber(ARGV[5]))
local health = redis.call('GET', KEYS[5])
if health then return {0, 0, dayEnd, health} end
local remaining = tonumber(ARGV[1])
for i = 3, 4 do
  local stored = redis.call('HMGET', KEYS[i], 'day', 'used')
  local used = 0
  if tonumber(stored[1]) == day then used = tonumber(stored[2]) or 0 end
  remaining = math.min(remaining, math.max(0, tonumber(ARGV[i - 2]) - used))
end
if dayEnd - now <= tonumber(ARGV[3]) then return {0, remaining, dayEnd, 'day_closing'} end
return {1, remaining, dayEnd, 'ok'}
`;
const MARK_OPERATOR_SCRIPT = `
redis.call('SET', KEYS[1], ARGV[1], 'EX', 300)
return 1
`;

/** Only Vercel's overwritten transport header is usable here; behind Cloudflare it identifies Cloudflare. */
export function extractTransportIp(headers) {
  const raw = typeof headers?.get === 'function' ? headers.get('x-forwarded-for') : headers?.['x-forwarded-for'];
  if (typeof raw !== 'string' || raw.length > 512) throw new Error('Transport identity unavailable.');
  const address = raw.split(',')[0].trim();
  if (!isIP(address)) throw new Error('Transport identity unavailable.');
  return canonicalIp(address);
}

/** URL canonicalization makes alternate IPv6 spellings share the same limit. */
export function canonicalIp(address) {
  return isIP(address) === 6 ? new URL(`http://[${address}]/`).hostname.slice(1, -1) : address;
}

/** IPv6 visitors share probe limits per /64 so privacy-address rotation stays cheap to bound. */
export function networkIdentity(address) {
  const canonical = canonicalIp(address);
  if (isIP(canonical) !== 6) return canonical;
  const [head, tail] = canonical.split('::');
  const left = head ? head.split(':') : [], right = tail ? tail.split(':') : [];
  const groups = tail === undefined ? left : [...left, ...Array(8 - left.length - right.length).fill('0'), ...right];
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return canonical;
  // IPv4-mapped addresses are single hosts, not a shared /64.
  if (groups.slice(0, 5).every((group) => group === '0') && groups[5] === 'ffff') return canonical;
  return `${groups.slice(0, 4).join(':')}::/64`;
}

export function hashQuotaIdentity(value, secret, kind) {
  if (!['ip', 'key', 'network', 'evidence'].includes(kind) || typeof value !== 'string' || !value || value.length > 4096 || typeof secret !== 'string' || secret.length < 32 || secret.length > 4096) {
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
  if (!value || typeof value !== 'object' || !UUID.test(value.requestId) || !HASH.test(value.ipHash) || !HASH.test(value.visitorIpHash) || !['bootstrap', 'request', 'challenge', 'connection', 'compose'].includes(value.operation)) return false;
  if (value.operation !== 'bootstrap' && !UUID.test(value.sessionId)) return false;
  if (value.operation === 'challenge' && !HASH.test(value.networkHash)) return false;
  if (value.funded !== undefined && typeof value.funded !== 'boolean') return false;
  if (value.operation === 'connection' || (value.operation === 'compose' && !value.funded)) {
    if (!HASH.test(value.keyHash) || !HASH.test(value.evidenceHash) || !HASH.test(value.networkHash)) return false;
  }
  if (value.funded && (value.operation !== 'compose' || !HASH.test(value.keyHash) || !Number.isSafeInteger(value.acceptBy) || value.acceptBy <= 0)) return false;
  return true;
}

const key = (name) => `${PREFIX}${name}`;
const workLeaseKeys = ({ sessionId, keyHash, funded = false }) => [key(`lease:session:${sessionId}`), key(`lease:${funded ? 'free-key' : 'key'}:${keyHash}`), key('lease:global')];
const probeLeaseKeys = ({ visitorIpHash }) => [key(`lease:probe:visitor:${visitorIpHash}`), key('lease:probe:global')];
const outcomeKeys = ({ evidenceHash, networkHash, keyHash }) => [key(`verify:${evidenceHash}`), key(`failures:probe:${networkHash}`), key(`cooldown:probe:${networkHash}`), key(`backoff:key:${keyHash}`)];
const receiptKeys = ({ visitorIpHash }) => [key(`receipts:${visitorIpHash}`), key(`receipts-index:${visitorIpHash}`), key(`daily:free:visitor:${visitorIpHash}`), key('daily:free:global')];

function leaseFor(value) {
  const { operation, sessionId, keyHash, requestId, visitorIpHash, networkHash, evidenceHash } = value;
  if (operation === 'connection') return Object.freeze({ kind: 'probe', sessionId, keyHash, requestId, visitorIpHash, networkHash, evidenceHash });
  if (value.funded) return Object.freeze({ kind: 'funded', operation, sessionId, keyHash, requestId, visitorIpHash, units: 2 });
  return Object.freeze({ kind: 'work', sessionId, keyHash, requestId, networkHash, evidenceHash });
}

function reservationCommand(value, { providerMinuteLimit, freeGlobalLimit }) {
  const { operation, sessionId, ipHash, visitorIpHash, keyHash, requestId, funded = false } = value;
  const keys = [], policies = [];
  const add = (name, kind, extra = {}) => { keys.push(key(name)); policies.push({ kind, k: keys.length, ...extra }); };
  const burst = (scope, limit, units = 1) => add(`burst:${scope}`, 'burst', { limit, units });
  const lease = (scope, limit) => add(`lease:${scope}`, 'lease', { limit, units: 1 });
  const daily = (scope, limit, units, extra = {}) => add(`daily:${scope}`, 'daily', { limit, units, ...extra });
  if (funded) {
    keys.push(...receiptKeys(value));
    const units = 2;
    add(`health:free-key:${keyHash}`, 'block', { reason: 'unavailable' });
    policies.push({ kind: 'cutoff', k: 0, ms: LIMITS.fundedCutoffMs });
    policies.push({ kind: 'daily', k: 3, limit: LIMITS.freeCallsPerVisitorDay, units, funded: true }, { kind: 'daily', k: 4, limit: freeGlobalLimit, units, funded: true });
    burst(`provider:session-ip:${sessionId}:${ipHash}`, providerMinuteLimit, units);
    burst(`free:key:${keyHash}`, LIMITS.freeProviderPerKeyMinute, units);
    burst(`provider:ip:${ipHash}`, LIMITS.providerPerTransportIpMinute, units);
    burst('provider:global', LIMITS.providerGlobalMinute, units);
    daily(`provider:session:${sessionId}`, LIMITS.providerCallsPerSessionDay, units);
    lease(`session:${sessionId}`, LIMITS.providerConcurrentSession);
    lease(`free-key:${keyHash}`, LIMITS.freeConcurrentKey);
    lease('global', LIMITS.providerConcurrentGlobal);
    const spec = { policies, acceptBy: value.acceptBy, receiptMs: LIMITS.fundedReceiptMs, retention: LIMITS.receiptRetentionMs, batch: LIMITS.receiptReconcileBatch, receipt: { sessionId, keyHash, units, operation } };
    return ['EVAL', FUNDED_RESERVE_SCRIPT, keys.length, ...keys, JSON.stringify(spec), requestId];
  }
  keys.push(key(`seen:${operation}:${requestId}`));
  if (operation === 'bootstrap') {
    burst(`bootstrap:visitor:${visitorIpHash}`, LIMITS.statusPerVisitorMinute);
    burst(`bootstrap:ip:${ipHash}`, LIMITS.statusPerTransportIpMinute);
    burst('bootstrap:global', LIMITS.statusGlobalMinute);
  } else if (operation === 'request') {
    burst(`request:visitor:${visitorIpHash}`, LIMITS.requestsPerVisitorMinute);
    burst(`request:session-ip:${sessionId}:${ipHash}`, LIMITS.requestsPerSessionIpMinute);
    burst(`request:ip:${ipHash}`, LIMITS.requestsPerTransportIpMinute);
    burst('request:global', LIMITS.requestsGlobalMinute);
  } else if (operation === 'challenge') {
    burst(`challenge:visitor:${visitorIpHash}`, LIMITS.challengesPerVisitorMinute);
    burst(`challenge:network:${value.networkHash}`, LIMITS.challengesPerNetworkMinute);
    burst(`challenge:ip:${ipHash}`, LIMITS.challengesPerTransportIpMinute);
    burst('challenge:global', LIMITS.challengesGlobalMinute);
  } else if (operation === 'connection') {
    // Unknown-key tests cannot consume verified or funded work capacity.
    add(`cooldown:probe:${value.networkHash}`, 'block', { reason: 'cooldown' });
    add(`backoff:key:${keyHash}`, 'block', { reason: 'backoff' });
    burst(`probe:visitor:${visitorIpHash}`, LIMITS.probesPerVisitorMinute);
    burst(`probe:network:${value.networkHash}`, LIMITS.probesPerNetworkMinute);
    burst(`probe:ip:${ipHash}`, LIMITS.probesPerTransportIpMinute);
    burst('probe:global', LIMITS.probesGlobalMinute);
    lease(`probe:visitor:${visitorIpHash}`, LIMITS.probeConcurrentVisitor);
    lease('probe:global', LIMITS.probeConcurrentGlobal);
    add(`verify:${value.evidenceHash}`, 'observe');
  } else {
    // Server-side evidence from a successful connection test is checked before any charge.
    const units = 2;
    add(`verify:${value.evidenceHash}`, 'evidence');
    add(`backoff:key:${keyHash}`, 'block', { reason: 'backoff' });
    burst(`provider:session-ip:${sessionId}:${ipHash}`, providerMinuteLimit, units);
    burst(`provider:key:${keyHash}`, providerMinuteLimit, units);
    burst(`provider:ip:${ipHash}`, LIMITS.providerPerTransportIpMinute, units);
    burst('provider:global', LIMITS.providerGlobalMinute, units);
    daily(`provider:session:${sessionId}`, LIMITS.providerCallsPerSessionDay, units);
    daily(`provider:key:${keyHash}`, LIMITS.providerCallsPerKeyDay, units);
    lease(`session:${sessionId}`, LIMITS.providerConcurrentSession);
    lease(`key:${keyHash}`, LIMITS.providerConcurrentKey);
    lease('global', LIMITS.providerConcurrentGlobal);
  }
  return ['EVAL', RESERVE_SCRIPT, keys.length, ...keys, JSON.stringify(policies), requestId];
}

class NotSent extends Error {}

async function readRedisResponse(response, signal) {
  const decoded = await readBoundedJson(response, signal, RESPONSE_BYTES, 'Quota service unavailable.');
  if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded) || Object.keys(decoded).length !== 1 || !Object.hasOwn(decoded, 'result')) throw new Error('Quota service unavailable.');
  return decoded.result;
}

const bounded = (value, max = 86400) => Number.isInteger(value) && value >= 1 && value <= max;
const timestamp = (value) => Number.isSafeInteger(value) && value > 0;

function denial(reason, retryAfter, funded) {
  if (!bounded(retryAfter)) return null;
  if (funded && reason === 'free_daily') return { granted: false, status: 429, code: 'FREE_LIMIT_REACHED', retryAfter };
  if (funded && reason === 'unavailable') return { granted: false, status: 503, code: 'FREE_UNAVAILABLE', retryAfter };
  if (funded && reason === 'day_closing') return { granted: false, status: 503, code: 'FREE_PAUSED', retryAfter };
  if (reason === 'cooldown') return { granted: false, status: 429, code: 'PROBE_COOLDOWN', retryAfter };
  if (reason === 'verification_required') return { granted: false, status: 428, code: 'VERIFICATION_REQUIRED', retryAfter };
  if (['daily', 'burst', 'lease', 'duplicate', 'backoff'].includes(reason)) return { granted: false, status: 429, code: 'RATE_LIMITED', retryAfter };
  return null;
}

/** No configuration or provider/Redis exception details cross this module's boundary. */
export function createHostedQuota({ env = process.env, fetchImpl = fetch } = {}) {
  const configuration = redisConfiguration(env);
  async function execute(command, signal, timeout = 3000) {
    if (!configuration) throw new NotSent();
    const deadline = AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(timeout)]);
    if (deadline.aborted) throw new NotSent();
    const response = await fetchImpl(configuration.endpoint, {
      method: 'POST', redirect: 'error', cache: 'no-store', signal: deadline,
      headers: { Authorization: `Bearer ${configuration.token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(command)
    });
    return readRedisResponse(response, deadline);
  }
  function uncertain(value) {
    // The command may have committed. Keep the server-only descriptor so the
    // caller can close it: a committed hold is released, a missing one tombstoned.
    return ['connection', 'compose'].includes(value.operation) ? { ...UNAVAILABLE, uncertain: true, lease: leaseFor(value) } : UNAVAILABLE;
  }
  async function settleFunded(lease, used) {
    const keys = [...receiptKeys(lease), ...workLeaseKeys({ ...lease, funded: true })];
    const command = ['EVAL', SETTLE_SCRIPT, keys.length, ...keys, lease.requestId, used, lease.sessionId, lease.keyHash, LIMITS.receiptRetentionMs];
    // Settlement has its own small deadline after cancellation. A lost reply is
    // retried once with the same operation and count; the script is idempotent.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await execute(command, undefined, 2500);
        return Array.isArray(result) && result.length === 3 && result[0] === 1 && ['closed', 'cancelled'].includes(result[1]) && Number.isInteger(result[2]) && result[2] >= 0 && result[2] <= lease.units;
      } catch (error) { if (error instanceof NotSent) return false; }
    }
    return false;
  }
  return {
    async reserveUsage(value) {
      if (!validReservation(value)) return UNAVAILABLE;
      let result;
      try { result = await execute(reservationCommand(value, configuration ?? {}), value.signal); }
      catch (error) { return error instanceof NotSent ? UNAVAILABLE : uncertain(value); }
      if (!Array.isArray(result) || result.length !== 6 || !timestamp(result[3]) || !timestamp(result[4])) return uncertain(value);
      const [granted, reason, retryAfter, redisNow, dayEnd, extra] = result;
      if (granted === 0) {
        if (value.funded && reason === 'expired' && retryAfter === 60) return UNAVAILABLE;
        return denial(reason, retryAfter, value.funded) ?? uncertain(value);
      }
      if (granted !== 1 || reason !== 'ok' || retryAfter !== 0 || dayEnd <= redisNow || dayEnd - redisNow > 86400000) return uncertain(value);
      if (!['connection', 'compose'].includes(value.operation)) return { granted: true };
      if (value.funded) {
        if (!timestamp(extra) || extra <= redisNow || extra > dayEnd) return uncertain(value);
        // Remaining time is measured by Redis; callers derive a conservative local deadline.
        return { granted: true, lease: leaseFor(value), remainingMs: extra - redisNow, dayEndMs: dayEnd - redisNow };
      }
      if (!Number.isSafeInteger(extra) || extra < 0) return uncertain(value);
      return { granted: true, lease: value.operation === 'connection' ? Object.freeze({ ...leaseFor(value), generation: extra }) : leaseFor(value) };
    },
    async authorizePass(lease, pass) {
      if (lease?.kind !== 'funded' || !UUID.test(lease.requestId) || !UUID.test(lease.sessionId) || !HASH.test(lease.keyHash) || !HASH.test(lease.visitorIpHash) || !Number.isInteger(pass) || pass < 1 || pass > lease.units) return { granted: false };
      try {
        const result = await execute(['EVAL', AUTHORIZE_SCRIPT, 1, receiptKeys(lease)[0], lease.requestId, pass, lease.sessionId, lease.keyHash], undefined, 2500);
        if (Array.isArray(result) && result.length === 3 && result[0] === 1 && result[1] === 'ok' && Number.isSafeInteger(result[2]) && result[2] > 0 && result[2] <= LIMITS.fundedReceiptMs) return { granted: true, remainingMs: result[2] };
        return { granted: false };
      } catch { return { granted: false }; } // An unacknowledged authorization stays counted until settlement.
    },
    async releaseUsage(lease, { usedProviderCalls, outcome = 'none' } = {}) {
      if (!lease || !UUID.test(lease.sessionId) || !UUID.test(lease.requestId) || !HASH.test(lease.keyHash)) return false;
      if (lease.kind === 'funded') {
        if (!HASH.test(lease.visitorIpHash) || !Number.isInteger(usedProviderCalls) || usedProviderCalls < 0 || usedProviderCalls > lease.units) return false;
        return settleFunded(lease, usedProviderCalls);
      }
      if (!['probe', 'work'].includes(lease.kind) || !RELEASE_OUTCOMES.includes(outcome) || (outcome === 'verified' && (lease.kind !== 'probe' || !Number.isSafeInteger(lease.generation)))) return false;
      if (!HASH.test(lease.evidenceHash) || !HASH.test(lease.networkHash) || (lease.kind === 'probe' && !HASH.test(lease.visitorIpHash))) return false;
      const leases = lease.kind === 'probe' ? probeLeaseKeys(lease) : workLeaseKeys(lease);
      const keys = outcome === 'none' ? leases : [...leases, ...outcomeKeys(lease)];
      const command = ['EVAL', RELEASE_SCRIPT, keys.length, ...keys, leases.length, lease.requestId, outcome, lease.generation ?? 0, LIMITS.verificationTtlMs, LIMITS.credentialFailureWindowMs, LIMITS.credentialFailureLimit, LIMITS.credentialCooldownMs, LIMITS.keyBackoffMs];
      // Cleanup must remain possible after the request's abort signal fires. A lost
      // outcome is retried once: a replayed rejection is recognized by its request and
      // changes nothing, and other outcomes leave the same state. Leases just expire.
      for (let attempt = 0; attempt < (outcome === 'none' ? 1 : 2); attempt++) {
        try {
          const result = await execute(command, undefined, 2500);
          if (!Array.isArray(result) || result.length !== 2 || result[0] !== 1) return false;
          if (outcome === 'verified') return result[1] === 'verified' ? true : result[1] === 'stale' ? 'stale' : false;
          return ['released', 'revoked', 'backoff'].includes(result[1]);
        } catch (error) { if (error instanceof NotSent) return false; }
      }
      return false; // Expiring leases recover independently if Redis is unavailable.
    },
    async statusFree({ visitorIpHash, keyHash, signal } = {}) {
      if (!HASH.test(visitorIpHash) || !HASH.test(keyHash)) return FREE_UNAVAILABLE;
      try {
        const keys = [...receiptKeys({ visitorIpHash }), key(`health:free-key:${keyHash}`)];
        const result = await execute(['EVAL', FREE_STATUS_SCRIPT, keys.length, ...keys, LIMITS.freeCallsPerVisitorDay, configuration?.freeGlobalLimit, LIMITS.fundedCutoffMs, LIMITS.receiptReconcileBatch, LIMITS.receiptRetentionMs], signal);
        if (!Array.isArray(result) || result.length !== 4) return FREE_UNAVAILABLE;
        const [available, remaining, resetAt, reason] = result;
        if (!Number.isSafeInteger(remaining) || remaining < 0 || remaining > LIMITS.freeCallsPerVisitorDay || !Number.isSafeInteger(resetAt) || resetAt <= 0) return FREE_UNAVAILABLE;
        if (available === 1 && reason === 'ok') return { available: true, remaining, resetAt };
        if (available === 0 && reason === 'day_closing') return { available: false, remaining, resetAt, code: 'FREE_PAUSED', reason };
        if (available === 0 && remaining === 0 && OPERATOR_FAILURES.includes(reason)) return { available: false, remaining, resetAt, code: 'FREE_UNAVAILABLE', reason };
        return FREE_UNAVAILABLE;
      } catch { return FREE_UNAVAILABLE; }
    },
    async markOperatorUnavailable({ keyHash, reason } = {}) {
      if (!HASH.test(keyHash) || !OPERATOR_FAILURES.includes(reason)) return false;
      try {
        // The five-minute circuit breaker is shared across invocations. It never
        // stores exception bodies, keys, or a permanent claim about account credit.
        return await execute(['EVAL', MARK_OPERATOR_SCRIPT, 1, key(`health:free-key:${keyHash}`), reason]) === 1;
      } catch { return false; }
    }
  };
}
