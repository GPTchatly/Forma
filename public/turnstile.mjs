/** Hosted-only Cloudflare Turnstile check. The editor imports this module on the first
 * explicit live action; it never loads at page load or in the local runtime. Cloudflare
 * requires api.js from this exact URL; proxying or caching it breaks the widget. */
const API_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const LOAD_TIMEOUT_MS = 20000;
const UNAVAILABLE = 'The browser check is unavailable right now. Try again shortly.';
const EXPIRED = 'The browser check expired. Try again.';
let loading = null;

function failure(message, code) { const error = new Error(message); error.status = 503; error.code = code; return error; }

function abortable(promise, signal) {
  if (!signal) return promise;
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

function loadApi() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  // One script element at a time; a failed load may be retried by a later action.
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timer = window.setTimeout(() => fail(), LOAD_TIMEOUT_MS);
    function fail() { window.clearTimeout(timer); script.remove(); reject(failure(UNAVAILABLE, 'human_unavailable')); }
    script.addEventListener('load', () => { window.clearTimeout(timer); if (window.turnstile) resolve(window.turnstile); else fail(); }, { once: true });
    script.addEventListener('error', fail, { once: true });
    script.src = API_URL;
    document.head.append(script);
  }).catch((error) => { loading = null; throw error; });
  return loading;
}

/** Resolves with a single-use token for the `forma_live` action, or rejects. */
export async function runTurnstile({ siteKey, container, signal }) {
  const api = await abortable(loadApi(), signal);
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    let widget = null, settled = false;
    function finish(settle, value) {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', abort);
      try { if (widget !== null) api.remove(widget); } catch { /* The widget is already gone. */ }
      settle(value);
    }
    const abort = () => finish(reject, signal.reason);
    signal?.addEventListener('abort', abort, { once: true });
    const unavailable = () => finish(reject, failure(UNAVAILABLE, 'human_unavailable'));
    const expired = () => finish(reject, failure(EXPIRED, 'human_expired'));
    try {
      widget = api.render(container, {
        sitekey: siteKey, action: 'forma_live', appearance: 'interaction-only', execution: 'execute',
        size: 'flexible', theme: 'auto', retry: 'never', 'refresh-expired': 'never',
        callback: (token) => { if (typeof token === 'string' && token.length > 0 && token.length <= 2048) finish(resolve, token); else unavailable(); },
        'error-callback': () => { unavailable(); return true; },
        'unsupported-callback': unavailable,
        'expired-callback': expired,
        'timeout-callback': expired
      }) ?? null;
      if (widget === null) { unavailable(); return; }
      // Cloudflare documents execute() with the widget container, not the render() id.
      if (!settled) api.execute(container);
    } catch { unavailable(); }
  });
}
