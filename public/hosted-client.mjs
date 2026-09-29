/** Hosted transport. Personal keys stay in this tab; free allowance comes from the server. */
import { createBrowserProjectStore } from './browser-projects.mjs';
import { renderLocally, exportLocally } from './browser-render.mjs';
import { validateSpec } from '../shared/schema.mjs';
import { prepareComposeRequest } from '../shared/compose-transport.mjs';

function failure(message, status = 400) { const error = new Error(message); error.status = status; return error; }
const defaultDemo = () => Promise.all([import('/composer/composer.mjs'), import('/composer/demo.mjs')]);
const unavailableAllowance = () => ({ available: false, remaining: 0, limit: 10, resetAt: null, reason: 'unavailable' });
function readAllowance(value) {
  if (!value || typeof value.available !== 'boolean' || value.limit !== 10 || !Number.isInteger(value.remaining) || value.remaining < 0 || value.remaining > 10 || !(value.resetAt === null || Number.isSafeInteger(value.resetAt) && value.resetAt >= 0 && value.resetAt <= 8640000000000000)) return unavailableAllowance();
  const reasons = ['unconfigured', 'unavailable', 'credentials', 'credits', 'rate_limit', 'exhausted'];
  return { available: value.available, remaining: value.remaining, limit: 10, resetAt: value.resetAt, ...(reasons.includes(value.reason) ? { reason: value.reason } : {}) };
}

export function createHostedClient({ fetchImpl = globalThis.fetch, projects = createBrowserProjectStore(), render = renderLocally, exportSite = exportLocally, loadDemo = defaultDemo, prepareRequest = prepareComposeRequest } = {}) {
  let csrfToken = '', apiKey = '', verified = false, revision = 0, verifyingRevision = null, metadata = {}, model = 'jev-1.13.0', provider = 'typesafe';
  let freeAllowance = unavailableAllowance();
  const active = new Set();
  const canUseFree = () => freeAllowance.available && freeAllowance.remaining >= 2;
  const status = () => ({ ...metadata, deployment: 'hosted', configured: Boolean(apiKey) || canUseFree(), personalKeyConfigured: Boolean(apiKey), verified: Boolean(apiKey) && verified, testing: verifyingRevision !== null, credentialSource: apiKey ? 'this tab memory' : canUseFree() ? 'free allowance' : 'none', provider: apiKey ? provider : metadata.provider || 'typesafe', model: apiKey ? model : metadata.model || 'jev-1.13.0', freeAllowance: { ...freeAllowance } });
  function invalidate() {
    revision++;
    for (const controller of active) controller.abort();
    active.clear();
  }
  function setBootstrap(value) {
    if (value?.deployment !== 'hosted' || typeof value.csrfToken !== 'string' || !/^[A-Za-z0-9_-]{16,256}$/.test(value.csrfToken)) throw failure('The hosted session could not be initialized. Reload this page.', 503);
    csrfToken = value.csrfToken;
    metadata = { version: typeof value.version === 'string' ? value.version.slice(0, 40) : '', catalogSize: Number.isSafeInteger(value.catalogSize) ? value.catalogSize : 0, ...(value.provider === 'typesafe' || value.provider === 'openrouter' ? { provider: value.provider } : {}), ...(typeof value.model === 'string' && value.model.length <= 120 ? { model: value.model } : {}) };
    freeAllowance = readAllowance(value.freeAllowance);
    return status();
  }
  async function providerRequest(endpoint, data, signal) {
    if (!csrfToken) throw failure('The hosted session is not ready. Reload this page.', 403);
    const controller = new AbortController(), stamp = revision;
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
        if (hasAllowance) error.freeAllowance = { ...freeAllowance };
        throw error;
      }
      return result;
    } finally { active.delete(controller); }
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
      invalidate(); verifyingRevision = null; apiKey = ''; verified = false; model = 'jev-1.13.0'; provider = 'typesafe';
      return { disconnected: true };
    }
    if (endpoint === '/api/connection' && method === 'POST') {
      if (typeof data?.apiKey !== 'string') throw failure('Enter a TypeSafe or OpenRouter API key.');
      const candidate = data.apiKey.trim() || apiKey;
      if (!candidate || candidate.length > 512 || /\s|[\u0000-\u001f\u007f]/.test(candidate)) throw failure('Enter a valid TypeSafe or OpenRouter API key.');
      invalidate();
      const stamp = revision;
      verifyingRevision = stamp;
      try {
        const result = await providerRequest(endpoint, { apiKey: candidate }, signal);
        if (stamp !== revision) throw new DOMException('The connection changed.', 'AbortError');
        if (result?.verified !== true || typeof result.model !== 'string' || result.model.length > 120) throw failure('The provider connection could not be verified.', 502);
        apiKey = candidate; verified = true; model = result.model; provider = /^sk-or-/i.test(candidate) ? 'openrouter' : 'typesafe';
        return { ...result, model, provider };
      } finally {
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
      if (!apiKey && !canUseFree()) {
        const error = failure('Free JEV is unavailable. Connect your own TypeSafe or OpenRouter API key to continue.', 428);
        error.code = freeAllowance.reason === 'exhausted' ? 'free_limit' : 'free_unavailable'; error.freeAllowance = { ...freeAllowance };
        throw error;
      }
      const prepared = prepareRequest(data), stamp = revision;
      const result = await providerRequest(endpoint, { ...prepared.request, ...(apiKey ? { apiKey } : {}) }, signal);
      if (stamp !== revision) throw new DOMException('The connection changed.', 'AbortError');
      result.spec = validateSpec(prepared.restore(result.spec));
      if (apiKey) verified = true;
      return result;
    }
    throw failure('This operation is unavailable in the hosted editor.', 404);
  }
  return { request, setBootstrap, status };
}
