/** Hosted previews and exports stay in the browser; project images never enter a render API request. */
import { validateSpec, object, text, ValidationError } from '../shared/schema.mjs';
import { renderDocument, renderBody } from '../shared/render.mjs';
import { HOME_PAGE_ID, pageEntries } from '../shared/pages.mjs';
import { createExportFiles } from '../shared/export.mjs';
import { createZip } from '../shared/zip.mjs';

const ASSETS = [
  ['/site.css', ['text/css'], 512 * 1024],
  ['/site-runtime.js', ['text/javascript', 'application/javascript'], 512 * 1024],
  ['/interface-runtime.js', ['text/javascript', 'application/javascript'], 512 * 1024],
  ['/export/LICENSE.txt', ['text/plain'], 32 * 1024],
  ['/export/HYPERUI.txt', ['text/plain'], 32 * 1024]
];
let assetsPromise;

async function loadAsset([url, mimeTypes, maxBytes], signal) {
  const response = await fetch(url, { mode: 'same-origin', credentials: 'omit', redirect: 'error', signal });
  const mime = response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
  const declaredLength = response.headers.get('content-length');
  if (!response.ok || response.redirected || !mimeTypes.includes(mime) || (declaredLength !== null && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > maxBytes))) {
    await response.body?.cancel();
    throw new Error('A bundled renderer asset could not be loaded. Reload the editor and try again.');
  }
  if (!response.body) throw new Error('A bundled renderer asset is empty.');
  const reader = response.body.getReader(), chunks = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) {
        await reader.cancel();
        throw new Error('A bundled renderer asset exceeds its size limit.');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  if (!length) throw new Error('A bundled renderer asset is empty.');
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

function bundledAssets() {
  if (!assetsPromise) {
    const signal = AbortSignal.timeout(15000);
    assetsPromise = Promise.all(ASSETS.map((asset) => loadAsset(asset, signal))).then(async ([css, siteScript, interfaceScript, originalLicense, license]) => {
      // HTML parsing normalizes line endings before CSP hashing, including on Windows.
      const script = `${siteScript}\n${interfaceScript}`.replace(/\r\n?/g, '\n');
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(script)));
      const scriptHash = btoa(String.fromCharCode(...digest));
      return Object.freeze({ css, script, scriptHash, originalLicense, license });
    }).catch((error) => { assetsPromise = undefined; throw error; });
  }
  return assetsPromise;
}

async function waitForAssets(signal) {
  signal?.throwIfAborted();
  const pending = bundledAssets();
  if (!signal) return pending;
  // A superseded preview cancels its own wait, without breaking another preview or export's shared asset load.
  let onAbort;
  const aborted = new Promise((_, reject) => { onAbort = () => reject(signal.reason); signal.addEventListener('abort', onAbort, { once: true }); });
  try { return await Promise.race([pending, aborted]); }
  finally { signal.removeEventListener('abort', onAbort); }
}

function requestData(raw, fields) {
  const data = object(raw, 'Render request');
  if (Object.keys(data).some((key) => !fields.includes(key))) throw new ValidationError('Unexpected render request field.');
  return data;
}

export async function renderLocally(raw, { signal } = {}) {
  signal?.throwIfAborted();
  const data = requestData(raw, ['spec', 'channel', 'pageId']), spec = validateSpec(data.spec);
  const channel = text(data.channel, 'Preview channel', 100);
  if (!/^[a-zA-Z0-9_-]{10,100}$/.test(channel)) throw new ValidationError('Invalid preview channel.');
  const pageId = text(data.pageId, 'Page', 80, HOME_PAGE_ID);
  if (!pageEntries(spec).some((page) => page.id === pageId)) throw new ValidationError('The selected page does not exist.');
  const assets = await waitForAssets(signal);
  signal?.throwIfAborted();
  return { html: renderDocument(spec, { ...assets, preview: true, channel, pageId }), source: renderBody(spec, { pageId }) };
}

export async function exportLocally(raw, { signal } = {}) {
  signal?.throwIfAborted();
  const data = requestData(raw, ['spec']), spec = validateSpec(data.spec);
  const assets = await waitForAssets(signal);
  signal?.throwIfAborted();
  return new Blob([createZip(createExportFiles(spec, assets))], { type: 'application/zip' });
}
