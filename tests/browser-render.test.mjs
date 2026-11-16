/** Browser adapters run against controlled bundled assets; no model providers are contacted. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createSpec } from '../shared/content.mjs';
import { createPage } from '../shared/pages.mjs';
import { validateSpec } from '../shared/schema.mjs';
import { renderDocument, renderBody } from '../shared/render.mjs';
import { BUNDLED_NOTICES } from '../shared/notices.mjs';
import { createZip, crc32 } from '../shared/zip.mjs';
import { createZip as createServerZip } from '../server/zip.mjs';
import { createApp } from '../server/app.mjs';

const assetDefinitions = [
  ['/site.css', '../public/site.css', 'text/css'],
  ['/site-runtime.js', '../public/site-runtime.js', 'text/javascript'],
  ['/interface-runtime.js', '../public/interface-runtime.js', 'text/javascript'],
  ['/export/LICENSE.txt', '../LICENSE', 'text/plain'],
  ['/interaction-runtime.js', '../public/interaction-runtime.js', 'text/javascript'],
  ...BUNDLED_NOTICES.map(name => [`/export/${name}.txt`, `../licenses/${name}.txt`, 'text/plain'])
];
const assetContents = new Map(await Promise.all(assetDefinitions.map(async ([url, filename, mime]) => [url, { body: await readFile(new URL(filename, import.meta.url), 'utf8'), mime }])));
let moduleId = 0;
const renderer = () => import(`../public/browser-render.mjs?test=${++moduleId}`);
const validRequest = () => ({ spec: createSpec('Example'), channel: 'test-preview-channel-123' });
const runtimeScript = () => `${assetContents.get('/site-runtime.js').body}\n${assetContents.get('/interface-runtime.js').body}\n${assetContents.get('/interaction-runtime.js').body}`.replace(/\r\n?/g, '\n');

function bundledFetch(t, transform = (url, asset) => asset) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options });
    assert.ok(assetContents.has(url), 'only exact bundled asset URLs may be fetched');
    assert.equal(options.mode, 'same-origin');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
    const asset = transform(url, assetContents.get(url));
    return asset instanceof Response ? asset : new Response(asset.body, { headers: { 'Content-Type': `${asset.mime}; charset=utf-8`, ...asset.headers } });
  });
  return calls;
}

function zipFiles(bytes) {
  const buffer = Buffer.from(bytes), files = new Map();
  let offset = 0;
  while (buffer.readUInt32LE(offset) === 0x04034b50) {
    assert.equal(buffer.readUInt16LE(offset + 8), 0, 'stored entries need no decoder dependency');
    const length = buffer.readUInt32LE(offset + 18), nameLength = buffer.readUInt16LE(offset + 26);
    const start = offset + 30 + nameLength;
    const value = buffer.subarray(start, start + length);
    assert.equal(crc32(value), buffer.readUInt32LE(offset + 14));
    files.set(buffer.subarray(offset + 30, start).toString('utf8'), value.toString('utf8'));
    offset = start + length;
  }
  assert.equal(buffer.readUInt32LE(buffer.length - 22), 0x06054b50);
  assert.equal(buffer.readUInt32LE(buffer.length - 6), offset);
  assert.equal(buffer.readUInt16LE(buffer.length - 14), files.size);
  return files;
}

test('portable ZIP matches the existing ZIP format including UTF-8 text and binary bytes', () => {
  const files = { 'index.html': '<h1>Héllo 世界</h1>', 'source/site.js': '/* reference */', 'raster.bin': Uint8Array.of(0, 1, 128, 255) };
  const portable = createZip(files);
  assert.ok(portable instanceof Uint8Array);
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  assert.deepEqual(Buffer.from(portable), createServerZip({ ...files, 'raster.bin': Buffer.from(files['raster.bin']) }));
  assert.deepEqual(Buffer.from(createZip({})), createServerZip({}));
  assert.equal(zipFiles(portable).get('index.html'), files['index.html']);
});

test('portable ZIP rejects path traversal, empty segments, too many files and oversized content', () => {
  for (const name of ['../evil', '/evil', 'a/../evil', 'a\\evil', 'a//evil', './evil', 'a/', 'https://evil', 'bad\u0000name']) assert.throws(() => createZip({ [name]: 'x' }), /filename/);
  assert.throws(() => createZip({ ['a'.repeat(65536)]: '' }), /filename/);
  assert.throws(() => createZip(Object.fromEntries(Array.from({ length: 201 }, (_, i) => [`${i}.txt`, '']))), /Too many/);
  assert.throws(() => createZip({ 'large.txt': 'x'.repeat(64 * 1024 * 1024 + 1) }), /64 MB/);
  assert.throws(() => createZip({ 'invalid.txt': {} }), /text or bytes/);
});

test('browser preview reuses the validated renderer and hashes normalized fixed runtime bytes', async (t) => {
  const calls = bundledFetch(t, (url, asset) => ({ ...asset, body: url.endsWith('.js') ? asset.body.replace(/\r\n?/g, '\n').replace(/\n/g, '\r\n') : asset.body }));
  const { renderLocally } = await renderer(), request = validRequest();
  request.spec.sections.find((section) => section.group === 'hero').title = '</h1><script>bad()</script>';
  const result = await renderLocally(request);
  const script = runtimeScript(), scriptHash = createHash('sha256').update(script).digest('base64');
  assert.equal(result.html, renderDocument(request.spec, { css: assetContents.get('/site.css').body, script, scriptHash, preview: true, channel: request.channel, originalLicense: assetContents.get("/export/LICENSE.txt").body, notices: Object.fromEntries(BUNDLED_NOTICES.map(name => [name, assetContents.get(`/export/${name}.txt`).body])) }));
  assert.equal(result.source, renderBody(request.spec));
  assert.ok(result.html.includes('&lt;script&gt;bad()&lt;/script&gt;'));
  assert.equal((result.html.match(/<script>/g) || []).length, 1);
  assert.ok(result.html.includes(`sha256-${scriptHash}`));
  await renderLocally(request);
  assert.equal(calls.length, assetDefinitions.length, 'bundled assets are memoized for the tab');
});

test('browser render rejects invalid spec, page and channel before requesting any assets', async (t) => {
  const calls = bundledFetch(t), { renderLocally, exportLocally } = await renderer();
  await assert.rejects(renderLocally({ ...validRequest(), channel: '<script>' }), /channel/);
  await assert.rejects(renderLocally({ ...validRequest(), pageId: 'missing-page' }), /does not exist/);
  await assert.rejects(renderLocally({ ...validRequest(), extra: true }), /Unexpected/);
  const invalid = validRequest(); invalid.spec.sections[1].image = 'https://example.com/image.png';
  await assert.rejects(exportLocally({ spec: invalid.spec }));
  assert.equal(calls.length, 0);
});

test('browser renders the chosen child page with the same page bridge and safe links', async (t) => {
  bundledFetch(t);
  const { renderLocally } = await renderer(), request = validRequest();
  request.spec.pages = [createPage(request.spec, { id: 'journal', title: 'Journal', slug: 'journal', template: 'blog' })];
  request.spec.pages[0].sections.find((section) => section.group === 'hero').title = 'Journal page heading';
  const result = await renderLocally({ ...request, pageId: 'journal' });
  assert.ok(result.html.includes('Journal page heading'));
  assert.ok(result.html.includes('data-preview="true"'));
  assert.ok(result.html.includes('data-channel="test-preview-channel-123"'));
  assert.equal(result.source, renderBody(request.spec, { pageId: 'journal' }));
});

test('browser export matches every byte of the server export and preserves licenses and privacy notes', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'forma-browser-export-'));
  const app = await createApp({ dataDir: directory });
  t.after(async () => { await app.close(); await rm(directory, { recursive: true, force: true }); });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`, spec = createSpec('Export fixture');
  spec.pages = [createPage(spec, { id: 'journal', title: 'Journal', slug: 'journal', template: 'blog' })];
  const { token } = await (await fetch(`${base}/api/status`)).json();
  const serverResponse = await fetch(`${base}/api/export`, { method: 'POST', headers: { 'X-Forma-Token': token, 'Content-Type': 'application/json' }, body: JSON.stringify({ spec }) });
  assert.equal(serverResponse.status, 200);
  const serverBytes = Buffer.from(await serverResponse.arrayBuffer());
  bundledFetch(t);
  const { exportLocally } = await renderer();
  const blob = await exportLocally({ spec });
  assert.equal(blob.type, 'application/zip');
  const browserBytes = Buffer.from(await blob.arrayBuffer());
  assert.deepEqual(browserBytes, serverBytes);
  const files = zipFiles(browserBytes);
  assert.deepEqual([...files.keys()], ['index.html', 'journal.html', 'project.json', 'source/site.css', 'source/pages/journal.css', 'source/site.js', 'LICENSE.txt', ...BUNDLED_NOTICES.map(name => `licenses/${name}.txt`), 'README.txt']);
  assert.deepEqual(JSON.parse(files.get('project.json')), validateSpec(spec));
  assert.ok(files.get('README.txt').includes('do not publish project.json if that content is private'));
  assert.equal(files.get('LICENSE.txt'), assetContents.get('/export/LICENSE.txt').body);
  assert.equal(files.get('licenses/HYPERUI.txt'), assetContents.get('/export/HYPERUI.txt').body);
  assert.ok(!/<body[^>]*data-preview="true"/.test(files.get('index.html')));
});

test('an invalid MIME type cannot become executable renderer content and a later attempt can recover', async (t) => {
  let failed = true;
  const calls = bundledFetch(t, (url, asset) => url === '/site-runtime.js' && failed ? { ...asset, mime: 'text/html' } : asset);
  const { renderLocally } = await renderer();
  await assert.rejects(renderLocally(validRequest()), /asset could not be loaded/);
  failed = false;
  assert.ok((await renderLocally(validRequest())).html.startsWith('<!doctype html>'));
  assert.equal(calls.length, assetDefinitions.length * 2);
});

test('renderer asset size caps cover declared lengths and streamed bytes without length headers', async (t) => {
  bundledFetch(t, (url, asset) => url === '/site-runtime.js' ? { ...asset, headers: { 'Content-Length': String(512 * 1024 + 1) } } : asset);
  await assert.rejects((await renderer()).renderLocally(validRequest()), /asset could not be loaded/);
  t.mock.restoreAll();
  bundledFetch(t, (url, asset) => url === '/site-runtime.js' ? { ...asset, body: 'x'.repeat(512 * 1024 + 1) } : asset);
  await assert.rejects((await renderer()).renderLocally(validRequest()), /size limit/);
});

test('an aborted preview stops waiting without cancelling another preview sharing bundled assets', async (t) => {
  let release;
  const blocked = new Promise((resolve) => { release = resolve; });
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options });
    await blocked;
    const asset = assetContents.get(url);
    return new Response(asset.body, { headers: { 'Content-Type': asset.mime } });
  });
  const { renderLocally } = await renderer(), controller = new AbortController();
  const first = renderLocally(validRequest(), { signal: controller.signal });
  const second = renderLocally(validRequest());
  controller.abort();
  await assert.rejects(first, { name: 'AbortError' });
  assert.ok(calls.every((call) => !call.options.signal.aborted));
  release();
  assert.ok((await second).html.startsWith('<!doctype html>'));
  assert.equal(calls.length, assetDefinitions.length);
});

test('already-aborted render and export do not fetch bundled assets', async (t) => {
  const calls = bundledFetch(t), { renderLocally, exportLocally } = await renderer();
  const signal = AbortSignal.abort();
  await assert.rejects(renderLocally(validRequest(), { signal }), { name: 'AbortError' });
  await assert.rejects(exportLocally({ spec: createSpec() }, { signal }), { name: 'AbortError' });
  assert.equal(calls.length, 0);
});
