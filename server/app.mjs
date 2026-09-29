/** NEW: Loopback-only, dependency-free HTTP application. Fixed static routes,
 * same-origin + CSRF protection, size limits, bounded provider calls and local storage. */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATALOG, THEMES, FONTS } from '../shared/catalog.mjs';
import { object, text, validateSpec, validateCompose, ValidationError } from '../shared/schema.mjs';
import { renderDocument, renderBody, themeCss } from '../shared/render.mjs';
import { HOME_PAGE_ID, pageEntries, getPageSpec, pageFilename } from '../shared/pages.mjs';
import { ProjectStore } from './store.mjs';
import { createJevEvaluator, resolveJevConfig } from './jev.mjs';
import { compose, choice } from './composer.mjs';
import { demoEvaluate } from './demo.mjs';
import { createZip } from './zip.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_BODY = 4400000;
function json(res, status, data) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); }
function failure(message, status = 400) { const e = new Error(message); e.status = status; return e; }
function requestObject(raw, fields) {
  const data = object(raw, 'Request');
  if (Object.keys(data).some((key) => !fields.includes(key))) throw new ValidationError('Unexpected request field.');
  return data;
}
function emptyBody(req) {
  if (req.headers['transfer-encoding'] !== undefined || (req.headers['content-length'] !== undefined && req.headers['content-length'] !== '0')) throw new ValidationError('This action does not accept a request body.');
}
async function body(req, limit = MAX_BODY) {
  if ((req.headers['content-type'] || '').split(';', 1)[0].trim().toLowerCase() !== 'application/json') throw failure('Content-Type must be application/json.', 415);
  if (Number(req.headers['content-length']) > limit) throw failure('Request too large. Reduce uploaded image sizes.', 413);
  const chunks = []; let size = 0;
  for await (const chunk of req.iterator({ destroyOnReturn: false })) { size += chunk.length; if (size > limit) throw failure('Request too large.', 413); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw failure('Invalid JSON request.'); }
}
function sameSecret(provided, expected) { return typeof provided === 'string' && Buffer.byteLength(provided) === Buffer.byteLength(expected) && timingSafeEqual(Buffer.from(provided), Buffer.from(expected)); }
const staticFiles = new Map([
  ['/', ['public/index.html', 'text/html']], ['/index.html', ['public/index.html', 'text/html']],
  ['/favicon.svg', ['public/favicon.svg', 'image/svg+xml']],
  ['/app.css', ['public/app.css', 'text/css']], ['/app.mjs', ['public/app.mjs', 'text/javascript']],
  ['/structure-controls.mjs', ['public/structure-controls.mjs', 'text/javascript']],
  ['/library-drag.mjs', ['public/library-drag.mjs', 'text/javascript']],
  ['/i18n.mjs', ['public/i18n.mjs', 'text/javascript']],
  ...['es', 'pt', 'de', 'it', 'ru', 'pl', 'fi', 'sv'].map((locale) => [`/locales/${locale}.mjs`, [`public/locales/${locale}.mjs`, 'text/javascript']]),
  ['/site.css', ['public/site.css', 'text/css']], ['/site-runtime.js', ['public/site-runtime.js', 'text/javascript']],
  ...['catalog', 'design', 'elements', 'ui-catalog', 'schema', 'raster', 'content', 'icons', 'render', 'pages', 'structure', 'slots', 'media', 'interfaces', 'interface-render', 'parts'].map((name) => [`/shared/${name}.mjs`, [`shared/${name}.mjs`, 'text/javascript']])
]);
export async function createApp({ dataDir = path.join(ROOT, '.data'), apiKey = '', model = 'jev-1.13.0', provider = '', fetchImpl = fetch, onShutdown = () => {} } = {}) {
  const store = new ProjectStore(path.join(dataDir, 'projects')); await store.init();
  const token = randomBytes(32).toString('hex'); let memoryKey = '', memoryProvider = '', environmentKey = apiKey.trim(), environmentProvider = provider, connected = false, busy = false;
  const css = await readFile(path.join(ROOT, 'public/site.css'), 'utf8');
  // HTML parsing normalizes CRLF/CR to LF before checking inline script hashes.
  // Hash and embed those same bytes even after editing the bundle on Windows.
  const runtimeSources = await Promise.all(['site-runtime.js', 'interface-runtime.js'].map((name) => readFile(path.join(ROOT, 'public', name), 'utf8')));
  const script = runtimeSources.join('\n').replace(/\r\n?/g, '\n');
  const scriptHash = createHash('sha256').update(script).digest('base64');
  const license = await readFile(path.join(ROOT, 'licenses/HYPERUI.txt'), 'utf8');
  const originalLicense = await readFile(path.join(ROOT, 'LICENSE'), 'utf8');
  const calls = [], apiCalls = []; const activeControllers = new Set();
  let activeRequests = 0, credentialRevision = 0;
  function currentConfig() {
    const activeKey = memoryKey || environmentKey;
    const activeProvider = memoryKey ? memoryProvider : environmentProvider;
    return { apiKey: activeKey, ...resolveJevConfig({ apiKey: activeKey, model, provider: activeProvider }) };
  }
  function evaluator() { const cfg = currentConfig(); return createJevEvaluator({ apiKey: cfg.apiKey, model, provider: cfg.provider, fetchImpl }); }
  function enforceRate(window = calls, limit = 8) {
    const now = Date.now(); while (window.length && now - window[0] >= 60000) window.shift();
    if (window.length >= limit) throw failure(window === calls ? 'Local safety limit: at most 8 design or connection requests per minute.' : 'Local API request limit reached. Try again shortly.', 429);
    window.push(now);
  }
  function beginProviderRequest(res) {
    if (res.destroyed) throw failure('Request cancelled.', 499);
    if (busy) throw failure('A design or connection request is already running. Cancel it or let it finish first.', 409);
    enforceRate(); busy = true;
    const controller = new AbortController(); activeControllers.add(controller);
    const disconnect = () => { if (!res.writableEnded) controller.abort(); };
    res.on('close', disconnect);
    return { controller, finish: () => { busy = false; activeControllers.delete(controller); res.removeListener('close', disconnect); } };
  }
  const server = createServer({ maxHeaderSize: 8192 }, async (req, res) => {
    let countedRequest = false;
    const releaseRequest = () => {
      if (countedRequest) { activeRequests--; countedRequest = false; }
      res.removeListener('finish', releaseRequest); res.removeListener('close', releaseRequest);
    };
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY'); res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Content-Security-Policy', `default-src 'self'; script-src 'self' 'sha256-${scriptHash}'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`);
    try {
      const address = server.address(), port = typeof address === 'object' && address ? address.port : 0;
      const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
      if (!hosts.has(req.headers.host)) throw failure('Only this local application host is allowed.', 403);
      const origin = req.headers.origin;
      if (origin !== undefined && origin !== `http://${req.headers.host}`) throw failure('Cross-origin requests are not allowed.', 403);
      if (req.headers['sec-fetch-site'] === 'cross-site') throw failure('Cross-site requests are not allowed.', 403);
      const url = new URL(req.url, `http://127.0.0.1:${port}`), pathname = url.pathname;
      if (pathname.startsWith('/api/') && pathname !== '/api/status' && !sameSecret(req.headers['x-forma-token'], token)) throw failure('Application token expired or missing. Reload this page.', 403);
      if (pathname.startsWith('/api/')) {
        // This is a single-user local workspace: the process token identifies its session.
        enforceRate(apiCalls, 240);
        if (activeRequests >= 12) throw failure('Too many local requests are running. Try again shortly.', 429);
        activeRequests++; countedRequest = true;
        res.once('finish', releaseRequest); res.once('close', releaseRequest);
      }
      if (req.method === 'GET' && pathname === '/api/status') { const cfg = currentConfig(); return json(res, 200, { token, configured: Boolean(cfg.apiKey), verified: connected, credentialSource: memoryKey ? 'server memory' : environmentKey ? 'server environment' : 'none', provider: cfg.provider, model: cfg.model, version: '0.1.0', catalogSize: CATALOG.length }); }
      if (req.method === 'GET' && pathname === '/api/catalog') return json(res, 200, { catalog: CATALOG, themes: THEMES, fonts: FONTS });
      if (req.method === 'POST' && pathname === '/api/connection') {
        const data = requestObject(await body(req, 4096), ['apiKey', 'provider']);
        const key = text(data.apiKey, 'API key', 512).trim();
        const requestedProvider = data.provider === undefined ? '' : text(data.provider, 'Provider', 32).trim().toLowerCase();
        if (key && /\s/.test(key)) throw failure('The API key must not contain whitespace.');
        const testKey = key || memoryKey || environmentKey;
        const testProvider = key ? requestedProvider : (requestedProvider || (memoryKey ? memoryProvider : environmentProvider));
        const evaluate = createJevEvaluator({ apiKey: testKey, model, provider: testProvider, fetchImpl });
        const operation = beginProviderRequest(res), revision = credentialRevision;
        try {
          const result = await evaluate({ state: 'Connection check for a local website builder.', questions: { connection: choice('Select the successful connection option.', { connected: 'The API connection test is being evaluated.', other: 'Other.' }) }, signal: operation.controller.signal });
          operation.controller.signal.throwIfAborted();
          if (revision !== credentialRevision) throw failure('The connection changed while testing. Try again.', 409);
          if (key) { memoryKey = key; memoryProvider = requestedProvider; }
          else if (requestedProvider) { if (memoryKey) memoryProvider = requestedProvider; else environmentProvider = requestedProvider; }
          connected = true; return json(res, 200, { verified: true, provider: resolveJevConfig({ apiKey: testKey, model, provider: testProvider }).provider, model: result.model, usage: result.usage });
        } finally { operation.finish(); }
      }
      if (req.method === 'DELETE' && pathname === '/api/connection') {
        emptyBody(req);
        // NEW: Disconnect also disables the configured environment key until restart.
        credentialRevision++; for (const controller of activeControllers) controller.abort();
        memoryKey = ''; memoryProvider = ''; environmentKey = ''; environmentProvider = ''; connected = false; return json(res, 200, { disconnected: true });
      }
      if (req.method === 'POST' && pathname === '/api/compose') {
        const data = requestObject(await body(req), ['mode', 'operation', 'prompt', 'spec', 'locks', 'pageId', 'selectedSectionId', 'selectedItemIndex', 'selectedItemId', 'selectedPartKey']);
        const locks = requestObject(data.locks ?? {}, ['palette', 'font', 'density', 'radius', 'motion', 'typeScale', 'width']);
        if (Object.values(locks).some((value) => typeof value !== 'boolean')) throw new ValidationError('Design locks must be boolean values.');
        const input = validateCompose(data), operation = beginProviderRequest(res);
        try {
          const output = await compose(input, input.mode === 'demo' ? demoEvaluate : evaluator(), { signal: AbortSignal.any([operation.controller.signal, AbortSignal.timeout(45000)]) });
          operation.controller.signal.throwIfAborted();
          if (input.mode === 'jev') connected = true;
          if (!res.destroyed) return json(res, 200, output);
        } finally { operation.finish(); }
        return;
      }
      if (req.method === 'POST' && pathname === '/api/render') {
        const data = requestObject(await body(req), ['spec', 'channel', 'pageId']), spec = validateSpec(data.spec);
        const channel = text(data.channel, 'Preview channel', 100);
        if (!/^[a-zA-Z0-9_-]{10,100}$/.test(channel)) throw failure('Invalid preview channel.');
        const pageId = text(data.pageId, 'Page', 80, HOME_PAGE_ID);
        if (!pageEntries(spec).some((page) => page.id === pageId)) throw new ValidationError('The selected page does not exist.');
        return json(res, 200, { html: renderDocument(spec, { css, script, scriptHash, preview: true, channel, pageId }), source: renderBody(spec, { pageId }) });
      }
      if (req.method === 'POST' && pathname === '/api/export') {
        const data = requestObject(await body(req), ['spec']), spec = validateSpec(data.spec);
        const pages = pageEntries(spec);
        const pageFiles = Object.fromEntries(pages.map((page) => [pageFilename(spec, page.id), renderDocument(spec, { css, script, scriptHash, pageId: page.id })]));
        const draftCount = pages.reduce((count, page) => count + getPageSpec(spec, page.id).sections.filter((section) => section.draft).length, 0);
        const sourceStyles = Object.fromEntries(pages.map((page) => [page.id === HOME_PAGE_ID ? 'source/site.css' : `source/pages/${page.slug}.css`, `${css}\n${themeCss(getPageSpec(spec, page.id))}`]));
        const zip = createZip({
          ...pageFiles,
          'project.json': JSON.stringify(spec, null, 2),
          ...sourceStyles,
          'source/site.js': script,
          'LICENSE.txt': originalLicense,
          'licenses/HYPERUI.txt': license,
          'README.txt': `EXPORTED FROM FORMA — JEV SITE STUDIO\n\nOpen index.html in a browser, or upload all ${pages.length} HTML pages together to a static website host.\nPage links use neighboring HTML files; keep their filenames and relative locations.\nEach HTML page contains all CSS, script and images; there are no CDN dependencies.\nThe source CSS and source/site.js files are reference copies. Editing them does not\nchange the HTML pages until you inline the changes yourself.\n\n${draftCount} sections across ${pages.length} pages are still marked as draft copy. Review every claim, contact\ndetail, image right, price and link before publishing. Original abstract visuals\nare decorative placeholders, not real photographs of your business.\n\nContact forms only prepare mailto drafts; they do not deliver or store messages.\nBlog indexes and articles are static pages edited in Forma, without a dynamic CMS.\nApplication screens include local forms, chat entry, search, sorting, task and cart\ninteractions. This temporary state lasts only while the page stays open.\nThere is no live authentication, AI response service, payment processing,\nshared database, booking backend or analytics.\nThe project JSON can be imported back into Forma. It contains user copy and any\nuploaded images; do not publish project.json if that content is private.\n\nHyperUI-derived components are MIT licensed. Preserve the included license\nnotices when redistributing code. Other builder code is MIT licensed.\n`
        });
        res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="website.zip"', 'Cache-Control': 'no-store', 'Content-Length': zip.length }); res.end(zip); return;
      }
      if (pathname === '/api/projects' && req.method === 'GET') return json(res, 200, await store.list());
      if (pathname === '/api/projects' && req.method === 'POST') return json(res, 201, await store.create(requestObject(await body(req), ['spec']).spec));
      const project = pathname.match(/^\/api\/projects\/([a-zA-Z0-9_-]+)$/);
      if (project && req.method === 'GET') return json(res, 200, await store.get(project[1]));
      if (project && req.method === 'PUT') {
        const data = requestObject(await body(req), ['spec', 'expectedRevision', 'checkpoint', 'checkpointCurrent', 'label']);
        for (const key of ['checkpoint', 'checkpointCurrent']) if (data[key] !== undefined && typeof data[key] !== 'boolean') throw new ValidationError('Checkpoint flags must be boolean values.');
        if (data.label !== undefined) text(data.label, 'Checkpoint label', 180);
        return json(res, 200, await store.update(project[1], data));
      }
      if (project && req.method === 'DELETE') { const data = requestObject(await body(req, 1024), ['expectedRevision']); if (!Number.isSafeInteger(data.expectedRevision) || data.expectedRevision < 1) throw new ValidationError('Expected revision is required.'); await store.delete(project[1], data.expectedRevision); return json(res, 200, { deleted: true }); }
      const historical = pathname.match(/^\/api\/projects\/([a-zA-Z0-9_-]+)\/history\/([a-zA-Z0-9_-]+)$/);
      if (historical && req.method === 'GET') return json(res, 200, await store.history(historical[1], historical[2]));
      if (pathname === '/api/shutdown' && req.method === 'POST') {
        emptyBody(req);
        json(res, 200, { stopped: true }); for (const controller of activeControllers) controller.abort(); setTimeout(() => { server.close(); server.closeAllConnections(); onShutdown(); }, 100).unref(); return;
      }
      if ((req.method === 'GET' || req.method === 'HEAD') && staticFiles.has(pathname)) {
        const [filename, mime] = staticFiles.get(pathname), buffer = await readFile(path.join(ROOT, filename));
        res.writeHead(200, { 'Content-Type': `${mime}; charset=utf-8`, 'Cache-Control': 'no-cache', 'Content-Length': buffer.length }); res.end(req.method === 'HEAD' ? undefined : buffer); return;
      }
      if ((req.method === 'GET' || req.method === 'HEAD') && pathname === '/favicon.ico') {
        const buffer = await readFile(path.join(ROOT, 'public/favicon.ico'));
        res.writeHead(200, { 'Content-Type': 'image/x-icon', 'Cache-Control': 'no-cache', 'Content-Length': buffer.length }); res.end(req.method === 'HEAD' ? undefined : buffer); return;
      }
      json(res, 404, { error: 'Not found.' });
    } catch (error) {
      if (res.headersSent || res.destroyed) { res.end(); return; }
      const status = Number.isInteger(error.status) && error.status >= 400 && error.status <= 599 ? error.status : error instanceof ValidationError ? 400 : 500;
      if (status === 413) req.resume();
      json(res, status, { error: status === 500 ? 'Local server error. Your last saved project remains available.' : error.message });
    }
  });
  server.requestTimeout = 65000; server.headersTimeout = 15000; server.maxHeadersCount = 40;
  server.maxConnections = 64;
  return { server, store, close: async () => { for (const c of activeControllers) c.abort(); server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); } };
}
