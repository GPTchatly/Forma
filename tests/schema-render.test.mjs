import { PNG_IMAGE } from './fixtures/images.mjs';
/** NEW: Portable validation, renderer and export unit tests. Run with node --test. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { CATALOG, THEMES, GROUPS } from '../shared/catalog.mjs';
import { BLOCK_MANIFESTS } from '../shared/blocks.mjs';
import { createSpec, makeSection, extractLiteralFields } from '../shared/content.mjs';
import { validateSpec, validateCompose, safeHref, safeImage, escapeHtml } from '../shared/schema.mjs';
import { renderBody, renderDocument, themeCss, resolveHref } from '../shared/render.mjs';
import { createZip, crc32 } from '../server/zip.mjs';
const css = await readFile(new URL('../public/site.css', import.meta.url), 'utf8');
const script = await readFile(new URL('../public/site-runtime.js', import.meta.url), 'utf8');
const scriptHash = createHash('sha256').update(script).digest('base64');
const makeDocument = (spec) => renderDocument(spec, { css, script, scriptHash });

test('default spec passes the shared schema', () => { const result = validateSpec(createSpec()); assert.equal(result.sections.length, 9); assert.equal(result.schemaVersion, 2); });
test('component ids are unique and every group has a component', () => { assert.equal(new Set(CATALOG.map((b) => b.id)).size, CATALOG.length); assert.ok(GROUPS.every((group) => CATALOG.some((b) => b.group === group))); });
test(`catalog contains ${105 + BLOCK_MANIFESTS.length} auditable MIT components`, () => { assert.equal(CATALOG.length, 105 + BLOCK_MANIFESTS.length); assert.ok(CATALOG.every((b) => b.license === 'MIT' && b.source)); });
for (const block of CATALOG) test(`renders catalog component ${block.id}`, () => {
  const spec = createSpec();
  const existing = spec.sections.find((s) => s.group === block.group);
  if (existing) existing.block = block.id;
  else spec.sections.splice(spec.sections.length - 1, 0, makeSection(block.group, block.id));
  const html = makeDocument(spec);
  assert.match(html, new RegExp(`class="site-section ${block.id}(?: app-section)?"`));
  // Inspect rendered markup; the fixed runtime may legitimately use JS undefined.
  const markup = html.replace(/<script>[\s\S]*?<\/script>/g, '').replace(/<style>[\s\S]*?<\/style>/g, '');
  assert.ok(!markup.includes('undefined')); assert.ok(!markup.includes('[object Object]'));
});
for (const palette of Object.keys(THEMES)) test(`theme preset ${palette} produces bounded CSS tokens`, () => { const spec = createSpec(); spec.theme.palette = palette; assert.ok(themeCss(spec).includes(THEMES[palette].bg)); assert.ok(themeCss(spec).includes('color-scheme')); });
test('all untrusted copy and brand names are escaped', () => {
  const spec = createSpec('<img src=x onerror=alert(1)>'); spec.sections[1].title = '</h1><script>alert(1)</script>';
  const html = makeDocument(spec); assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;')); assert.equal((html.match(/<script>/g) || []).length, 1); assert.ok(!html.includes('<img src=x')); assert.ok(!html.includes('</h1><script>alert(1)'));
});
test('escaping includes attribute metacharacters', () => { assert.equal(escapeHtml('<a "x" \'y\' & >'), '&lt;a &quot;x&quot; &#39;y&#39; &amp; &gt;'); });
test('generated scripts are fixed and hash-authorized', () => { const html = makeDocument(createSpec()); assert.ok(html.includes(`sha256-${scriptHash}`)); assert.ok(html.includes("connect-src &#39;none&#39;")); assert.ok(html.includes('form-action &#39;none&#39;')); });
test('navigation destinations exist even when contact is absent', () => { const spec = createSpec(); spec.sections = spec.sections.filter((s) => s.group !== 'contact'); const resolved = resolveHref('#contact', spec); assert.notEqual(resolved, '#contact'); assert.ok(spec.sections.some((s) => `#${s.id}` === resolved)); });
test('custom hero identifiers work throughout navigation', () => { const spec = createSpec(); spec.sections.find((s) => s.group === 'hero').id = 'introduction'; const body = renderBody(spec); assert.ok(body.includes('href="#introduction"')); });
test('email form is disabled without public recipient', () => { const html = renderBody(createSpec()); assert.match(html, /type="submit" disabled/); assert.ok(html.includes('Nothing is submitted to this website')); });
test('email form becomes enabled with public recipient', () => { const spec = createSpec(); spec.brand.email = 'hello@example.com'; const html = renderBody(spec); assert.ok(html.includes('data-contact-email="hello@example.com"')); assert.ok(!html.includes('type="submit" disabled')); });
test('native FAQ requires no third-party runtime', () => { const html = renderBody(createSpec()); assert.ok(html.includes('<details class="faq-item">')); assert.ok(html.includes('<summary>')); });
test('source contains no automatic external resource loads', () => { const html = makeDocument(createSpec()); assert.ok(!/<(?:script|img|link)[^>]+(?:src|href)="https?:/i.test(html)); assert.ok(!/@import\s|url\(["']?https?:/i.test(css)); });
test('every rendered page has one h1', () => { for (const id of ['hero-split', 'hero-centered', 'hero-editorial']) { const spec = createSpec(); spec.sections.find((s) => s.group === 'hero').block = id; assert.equal((renderBody(spec).match(/<h1>/g) || []).length, 1); } });
for (const href of ['javascript:alert(1)', 'data:text/html,hi', '//evil.example', 'http://example.com', 'https://user:pass@example.com', 'mailto:test%0d%0aBCC:x@example.com', '#bad"onclick']) test(`rejects unsafe link ${href}`, () => assert.throws(() => safeHref(href)));
for (const href of ['https://example.com/path?q=x', '#contact', 'mailto:hello@example.com', 'tel:+12025550123', '']) test(`accepts bounded link ${href}`, () => assert.equal(safeHref(href), href));
test('rejects SVG and external image URLs', () => { assert.throws(() => safeImage('data:image/svg+xml;base64,PHN2Zz4=')); assert.throws(() => safeImage('https://example.com/image.png')); });
test('accepts a local raster data URL', () => assert.equal(safeImage(PNG_IMAGE), PNG_IMAGE));
test('rejects unknown blocks, excessive content, duplicate groups and CSS injection', () => {
  for (const mutate of [(s) => { s.sections[1].block = 'evil'; }, (s) => { s.sections[1].title = 'x'.repeat(301); }, (s) => { s.sections.push({ ...s.sections[1], id: 'secondhero' }); }, (s) => { s.theme.palette = 'red;}script{'; }, (s) => { s.schemaVersion = 99; }]) { const spec = createSpec(); mutate(spec); assert.throws(() => validateSpec(spec)); }
});
test('hero is optional while present navigation and footer retain their order', () => { const spec = createSpec(); assert.doesNotThrow(() => validateSpec({ ...spec, sections: spec.sections.filter((s) => s.group !== 'hero') })); assert.doesNotThrow(() => validateSpec({ ...spec, sections: [] })); assert.throws(() => validateSpec({ ...spec, sections: [...spec.sections].reverse() })); });
test('schema drops unexpected executable or credential fields', () => { const spec = createSpec(); spec.apiKey = 'secret'; spec.theme.css = 'bad'; spec.sections[0].onClick = 'bad'; const output = JSON.stringify(validateSpec(spec)); assert.ok(!output.includes('secret')); assert.ok(!output.includes('onClick')); });
test('rejects API-key-like injected email headers', () => { const spec = createSpec(); spec.brand.email = 'test%0aBCC@example.com'; assert.throws(() => validateSpec(spec)); });
test('mode and edit operation must be explicit', () => { assert.throws(() => validateCompose({ prompt: 'hello', spec: createSpec(), mode: 'fake', operation: 'create' })); assert.throws(() => validateCompose({ prompt: 'hi', spec: createSpec(), mode: 'jev', operation: 'create' })); });
test('literal copy extraction preserves user words only', () => { assert.deepEqual(extractLiteralFields('Brand: "Acme" Headline: “A better day.” Button: "Say hello"'), { name: 'Acme', headline: 'A better day.', cta: 'Say hello' }); assert.deepEqual(extractLiteralFields('make it poetic'), {}); });
test('ZIP writer computes a standard CRC32 and valid headers', () => { assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926); const zip = createZip({ 'index.html': '<h1>Hello</h1>', 'project.json': '{}' }); assert.equal(zip.readUInt32LE(0), 0x04034b50); assert.equal(zip.readUInt32LE(zip.length - 22), 0x06054b50); assert.equal(zip.readUInt16LE(zip.length - 14), 2); });
test('ZIP writer disallows traversal filenames', () => { assert.throws(() => createZip({ '../evil': 'x' })); assert.throws(() => createZip({ '/evil': 'x' })); });

// NEW: Exported pages include a primary content landmark.
test('renderer supplies exactly one main landmark', () => { const html = renderBody(createSpec()); assert.equal((html.match(/<main\b[^>]*>/g) || []).length, 1); assert.equal((html.match(/<\/main>/g) || []).length, 1); });
