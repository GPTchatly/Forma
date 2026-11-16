/** Hosted transport. The editor restores a browser-saved personal key into this client; free allowance comes from the server. */
import { createBrowserProjectStore } from './browser-projects.mjs';
import { renderLocally, exportLocally } from './browser-render.mjs';
import { validateSpec } from '../shared/schema.mjs';
import { prepareComposeRequest } from '../shared/compose-transport.mjs';

function failure(message, status = 400, code) { const error = new Error(message); error.status = status; if (code) error.code = code; return error; }
const defaultDemo = () => Promise.all([import('/composer/composer.mjs'), import('/composer/demo.mjs')]);
const unavailableAllowance = () => ({ available: false, remaining: 0, limit: 10, resetAt: null, reason: 'unavailable' });
const REASONS = ['unconfigured', 'unavailable', 'credentials', 'credits', 'rate_limit', 'exhausted', 'resetting'];
function readAllowance(value) {
  if (!value || typeof value.available !== 'boolean' || value.limit !== 10 || !Number.isInteger(value.remaining) || value.remaining < 0 || value.remaining > 10 || !(value.resetAt === null || Number.isSafeInteger(value.resetAt) && value.resetAt >= 0 && value.resetAt <= 8640000000000000)) return unavailableAllowance();
  return { available: value.available, remaining: value.remaining, limit: 10, resetAt: value.resetAt, ...(REASONS.includes(value.reason) ? { reason: value.reason } : {}) };
}
const UNAVAILABLE_MESSAGE = 'The JEV service is unavailable right now. Editing, saving, export and Offline demo still work. Build again to retry.';
const HUMAN_UNAVAILABLE = 'The browser check is unavailable right now. Try again shortly.';
const noHumanCheck = () => Promise.reject(failure(HUMAN_UNAVAILABLE, 503, 'human_unavailable'));
// A known pass is reused only while it has at least this long left.
const HUMAN_MARGIN_MS = 60000;

export function createHostedClient({ fetchImpl = globalThis.fetch, projects = createBrowserProjectStore(), render = renderLocally, exportSite = exportLocally, loadDemo = defaultDemo, prepareRequest = prepareComposeRequest, humanCheck = noHumanCheck } = {}) {
  // `restored` marks a browser-saved key that has not yet been refused in this tab.
  let csrfToken = '', apiKey = '', verified = false, restored = false, revision = 0, verifyingRevision = null, metadata = {}, model = 'jev-1.13.0', provider = 'typesafe';
  let freeAllowance = unavailableAllowance();
  // The server decides whether live routes need a Turnstile pass; this only avoids a
  // refused request. `verifiedUntil` is the pass expiry in milliseconds, 0 when unknown.
  let human = { mode: 'unknown', siteKey: '', verifiedUntil: 0 }, humanRequest = null;
  // Browser-owned projects work without the API. Live JEV starts as checking.
  let service = 'checking';
  // Connection changes and live operations advance this generation. A status
  // response requested before a newer change cannot replace that newer state.
  let generation = 0, statusRequest = null;
  const advance = () => { generation++; };
  const active = new Set();
  const canUseFree = () => freeAllowance.available && freeAllowance.remaining >= 2;
  const status = () => ({ ...metadata, deployment: 'hosted', service, configured: Boolean(apiKey) || canUseFree(), personalKeyConfigured: Boolean(apiKey), verified: Boolean(apiKey) && verified, testing: verifyingRevision !== null, credentialSource: apiKey ? 'this browser' : canUseFree() ? 'free allowance' : 'none', provider: apiKey ? provider : metadata.provider || 'typesafe', model: apiKey ? model : metadata.model || 'jev-1.13.0', freeAllowance: { ...freeAllowance } });
  function invalidate() {
    revision++;
    advance();
    for (const controller of active) controller.abort();
    active.clear();
  }
  function setBootstrap(value, { current = true } = {}) {
    if (value?.deployment !== 'hosted' || typeof value.csrfToken !== 'string' || !/^[A-Za-z0-9_-]{16,256}$/.test(value.csrfToken)) throw failure('The hosted session could not be initialized. Reload this page.', 503);
    // The browser already applied this response's session cookie, so its token is current.
    csrfToken = value.csrfToken;
    metadata = { version: typeof value.version === 'string' ? value.version.slice(0, 40) : '', catalogSize: Number.isSafeInteger(value.catalogSize) ? value.catalogSize : 0, ...(value.provider === 'typesafe' || value.provider === 'openrouter' ? { provider: value.provider } : {}), ...(typeof value.model === 'string' && value.model.length <= 120 ? { model: value.model } : {}) };
    if (current) freeAllowance = readAllowance(value.freeAllowance);
    readHuman(value.humanCheck, current);
    service = 'ready';
    return status();
  }
  function readHuman(value, current) {
    if (value?.mode === 'off' || value?.mode === 'unavailable') { human = { mode: value.mode, siteKey: '', verifiedUntil: 0 }; return; }
    if (value?.mode !== 'turnstile' || typeof value.siteKey !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(value.siteKey)) { human = { mode: 'unknown', siteKey: '', verifiedUntil: 0 }; return; }
    // Mode and sitekey are configuration. A stale response cannot replace newer pass state.
    const reported = Number.isSafeInteger(value.verifiedUntil) && value.verifiedUntil > 0 ? value.verifiedUntil : 0;
    const verifiedUntil = current ? reported : human.siteKey === value.siteKey ? human.verifiedUntil : 0;
    human = { mode: 'turnstile', siteKey: value.siteKey, verifiedUntil };
  }
  /** One coordinated status read per generation; stale allowance snapshots are discarded. */
  function refreshStatus({ signal } = {}) {
    if (statusRequest?.generation === generation) return statusRequest.promise;
    const requested = generation;
    // The browser stores a response's session cookie when its headers arrive but the
    // client reads its token from the body, so status reads never overlap: a newer
    // read starts after the older one settles and sends the cookie that read set.
    const previous = statusRequest?.promise.catch(() => {});
    const promise = (async () => {
      if (previous) await previous;
      try {
        const response = await fetchImpl('/api/status', { cache: 'no-store', credentials: 'same-origin', redirect: 'error', signal: AbortSignal.any([AbortSignal.timeout(15000), ...(signal ? [signal] : [])]) });
        let value;
        try { value = await response.json(); } catch { throw failure('The hosted service returned an unreadable response.', 502); }
        if (!response.ok) throw failure(typeof value?.error === 'string' ? value.error.slice(0, 400) : `Request failed (${response.status}).`, response.status, typeof value?.code === 'string' && /^[a-z_]{1,60}$/.test(value.code) ? value.code : undefined);
        return setBootstrap(value, { current: requested === generation });
      } catch (error) {
        // Keep the last confirmed allowance; without any session, live JEV is unavailable.
        if (!csrfToken) service = 'unavailable';
        throw error;
      }
    })().finally(() => { if (statusRequest?.promise === promise) statusRequest = null; });
    statusRequest = { generation: requested, promise };
    return promise;
  }
  async function ensureSession(signal) {
    if (csrfToken) return;
    try { await refreshStatus({ signal }); } catch (error) { if (error.name === 'AbortError') throw error; }
    if (!csrfToken) throw failure(UNAVAILABLE_MESSAGE, 503, 'service_unavailable');
  }
  async function providerRequest(endpoint, data, signal, stamp) {
    // With a session, dispatch stays synchronous so a newer connection change aborts it.
    if (!csrfToken) await ensureSession(signal);
    if (stamp !== revision) throw new DOMException('The connection changed.', 'AbortError');
    const controller = new AbortController();
    const combined = AbortSignal.any([controller.signal, AbortSignal.timeout(55000), ...(signal ? [signal] : [])]);
    active.add(controller);
    try {
      combined.throwIfAborted();
      const response = await fetchImpl(endpoint, { method: 'POST', credentials: 'same-origin', redirect: 'error', cache: 'no-store', signal: combined, headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }, body: JSON.stringify(data) });
      combined.throwIfAborted();
      let result;
      try { result = await response.json(); } catch { throw failure('The hosted service returned an unreadable response.', 502); }
      combined.throwIfAborted();
      if (stamp !== revision) throw new DOMException('The connection changed.', 'AbortError');
      const hasAllowance = result && Object.hasOwn(result, 'freeAllowance');
      if (hasAllowance) freeAllowance = readAllowance(result.freeAllowance);
      if (!response.ok) {
        const error = failure(typeof result?.error === 'string' ? result.error.slice(0, 400) : `Request failed (${response.status}).`, response.status);
        if (typeof result?.code === 'string' && /^[a-z_]{1,60}$/.test(result.code)) error.code = result.code;
        // An expired session or CSRF pairing is re-bootstrapped by the next explicit action.
        if (['session', 'csrf'].includes(error.code)) csrfToken = '';
        if (['verification_required', 'credentials'].includes(error.code) && endpoint === '/api/compose') { verified = false; restored = false; }
        if (hasAllowance) error.freeAllowance = { ...freeAllowance };
        throw error;
      }
      return result;
    } finally { active.delete(controller); }
  }
  /** One browser check at a time; connection changes and disconnect abort it. Null when no check is needed. */
  function ensureHuman(signal, stamp) {
    if (human.mode !== 'turnstile' || human.verifiedUntil - Date.now() > HUMAN_MARGIN_MS) return null;
    humanRequest ??= (async () => {
      const controller = new AbortController();
      active.add(controller);
      try {
        const token = await humanCheck({ siteKey: human.siteKey, signal: AbortSignal.any([controller.signal, ...(signal ? [signal] : [])]) });
        controller.signal.throwIfAborted();
        if (typeof token !== 'string' || !token || token.length > 2048 || /[^\x21-\x7e]/.test(token)) throw failure(HUMAN_UNAVAILABLE, 503, 'human_unavailable');
        const result = await providerRequest('/api/challenge', { token }, signal, stamp);
        if (result?.verified !== true || !Number.isSafeInteger(result.expiresAt) || result.expiresAt <= 0) throw failure(HUMAN_UNAVAILABLE, 503, 'human_unavailable');
        human = { ...human, verifiedUntil: result.expiresAt };
      } finally { active.delete(controller); }
    })().finally(() => { humanRequest = null; });
    return humanRequest;
  }
  /** Live provider routes need a server-checked pass; a refusal happens before any quota use, so one retry is safe. */
  async function liveRequest(endpoint, data, signal, stamp) {
    if (!csrfToken) await ensureSession(signal);
    // Without a needed check, dispatch stays synchronous so a newer connection change aborts it.
    const checking = ensureHuman(signal, stamp);
    if (checking) await checking;
    try { return await providerRequest(endpoint, data, signal, stamp); }
    catch (error) {
      if (error?.code !== 'human_required') throw error;
      human = { ...human, verifiedUntil: 0 };
      if (human.mode !== 'turnstile') await refreshStatus({ signal }).catch(() => {});
      if (human.mode !== 'turnstile') throw error;
      await ensureHuman(signal, stamp);
      return providerRequest(endpoint, data, signal, stamp);
    }
  }
  async function request(endpoint, { method = 'GET', data, signal } = {}) {
    signal?.throwIfAborted();
    if (endpoint === '/api/projects') {
      if (method === 'GET') return projects.list();
      if (method === 'POST') return projects.create(data?.spec);
    }
    const project = /^\/api\/projects\/([a-zA-Z0-9_-]+)$/.exec(endpoint);
    if (project) {
      if (method === 'GET') return projects.get(project[1]);
      if (method === 'PUT') return projects.update(project[1], data);
      if (method === 'DELETE') { await projects.delete(project[1], data?.expectedRevision); return { deleted: true }; }
    }
    const checkpoint = /^\/api\/projects\/([a-zA-Z0-9_-]+)\/history\/([a-zA-Z0-9_-]+)$/.exec(endpoint);
    if (checkpoint && method === 'GET') return projects.history(checkpoint[1], checkpoint[2]);
    if (endpoint === '/api/render' && method === 'POST') return render(data, { signal });
    if (endpoint === '/api/export' && method === 'POST') return exportSite(data, { signal });
    if (endpoint === '/api/connection' && method === 'DELETE') {
      invalidate(); verifyingRevision = null; apiKey = ''; verified = false; restored = false; model = 'jev-1.13.0'; provider = 'typesafe';
      return { disconnected: true };
    }
    if (endpoint === '/api/connection' && method === 'POST' && data?.restore === true) {
      // No provider request: the server still requires unexpired verification evidence
      // for this exact key before any live work, and refuses it before the provider.
      const candidate = typeof data.apiKey === 'string' ? data.apiKey.trim() : '';
      if (!candidate || candidate.length > 512 || /\s|[\u0000-\u001f\u007f]/.test(candidate)) throw failure('Enter a valid TypeSafe or OpenRouter API key.');
      if (apiKey || verifyingRevision !== null) return { restored: false };
      apiKey = candidate; verified = false; restored = true;
      provider = /^sk-or-/i.test(candidate) ? 'openrouter' : 'typesafe'; model = provider === 'openrouter' ? '~typesafe/jev-latest' : 'jev-1.13.0';
      return { restored: true };
    }
    if (endpoint === '/api/connection' && method === 'POST') {
      if (typeof data?.apiKey !== 'string') throw failure('Enter a TypeSafe or OpenRouter API key.');
      const candidate = data.apiKey.trim() || apiKey;
      if (!candidate || candidate.length > 512 || /\s|[\u0000-\u001f\u007f]/.test(candidate)) throw failure('Enter a valid TypeSafe or OpenRouter API key.');
      invalidate();
      const stamp = revision;
      verifyingRevision = stamp;
      try {
        const result = await liveRequest(endpoint, { apiKey: candidate }, signal, stamp);
        if (stamp !== revision) throw new DOMException('The connection changed.', 'AbortError');
        if (result?.verified !== true || typeof result.model !== 'string' || result.model.length > 120) throw failure('The provider connection could not be verified.', 502);
        apiKey = candidate; verified = true; restored = false; model = result.model; provider = /^sk-or-/i.test(candidate) ? 'openrouter' : 'typesafe';
        return { ...result, model, provider };
      } catch (error) {
        // A rejected retest of the connected key means the server revoked its evidence.
        if (candidate === apiKey && ['credentials', 'verification_stale'].includes(error?.code)) { verified = false; restored = false; }
        throw error;
      } finally {
        advance();
        // An older cancelled test must not unlock a newer connection test.
        if (verifyingRevision === stamp) verifyingRevision = null;
      }
    }
    if (endpoint === '/api/compose' && method === 'POST') {
      if (data?.mode === 'demo') {
        const [{ compose }, { demoEvaluate }] = await loadDemo();
        signal?.throwIfAborted();
        const result = await compose(data, demoEvaluate, { signal });
        signal?.throwIfAborted();
        return result;
      }
      if (verifyingRevision !== null) throw failure('Wait for the connection test to finish before building.', 409);
      const stamp = revision;
      advance();
      try {
        if (!csrfToken) await ensureSession(signal);
        if (stamp !== revision) throw new DOMException('The connection changed.', 'AbortError');
        if (apiKey && !verified && !restored) throw failure('Test this API key in Connect JEV before building. Nothing was sent to the provider.', 428, 'verification_required');
        if (!apiKey && !canUseFree()) {
          const error = failure('Free JEV is unavailable. Connect your own TypeSafe or OpenRouter API key to continue.', 428, freeAllowance.reason === 'exhausted' ? 'free_limit' : freeAllowance.reason === 'resetting' ? 'free_paused' : 'free_unavailable');
          error.freeAllowance = { ...freeAllowance };
          throw error;
        }
        const prepared = prepareRequest(data);
        const result = await liveRequest(endpoint, { ...prepared.request, ...(apiKey ? { apiKey } : {}) }, signal, stamp);
        if (stamp !== revision) throw new DOMException('The connection changed.', 'AbortError');
        result.spec = validateSpec(prepared.restore(result.spec));
        if (apiKey) verified = true;
        return result;
      } finally { advance(); }
    }
    throw failure('This operation is unavailable in the hosted editor.', 404);
  }
  return { request, setBootstrap, refreshStatus, status };
}
