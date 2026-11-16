import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { catalogs, SUPPORTED_LOCALES, resolveLocale, normalizeLocale, translate, setLocale, getLocale, formatNumber, formatDate, previewMessages } from '../public/i18n.mjs';
import { createSpec } from '../shared/content.mjs';
import { icon } from '../shared/icons.mjs';

test('editor locale resolves saved and regional preferences through a fixed allowlist', () => {
  assert.equal(resolveLocale('de-DE', ['es-ES']), 'de');
  assert.equal(resolveLocale('invalid', ['ja-JP', 'pt-BR']), 'pt');
  assert.equal(resolveLocale(null, ['fi-FI']), 'fi');
  assert.equal(resolveLocale(null, ['zh']), 'en');
  for (const value of ['../../ru', '__proto__', 'constructor', {}, 'a'.repeat(1000)]) assert.equal(normalizeLocale(value), null);
});

test('every shipped translation covers the message inventory and preserves placeholders', async () => {
  const directory = new URL('../public/locales/', import.meta.url);
  const files = (await readdir(directory)).filter((name) => name.endsWith('-messages.json'));
  const keys = new Set((await Promise.all(files.map(async (name) => JSON.parse(await readFile(new URL(name, directory), 'utf8'))))).flat());
  const parameters = (value) => [...value.matchAll(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g)].map((match) => match[1]).sort();
  assert.ok(keys.size > 400);
  for (const [locale, catalog] of Object.entries(catalogs)) {
    if (locale === 'en') continue;
    for (const key of keys) {
      assert.ok(Object.hasOwn(catalog, key), `${locale} missing ${key}`);
      assert.ok(typeof catalog[key] === 'string' && catalog[key].trim(), `${locale} empty ${key}`);
      assert.deepEqual(parameters(catalog[key]), parameters(key), `${locale} parameters differ for ${key}`);
      assert.ok(!/<\/?(?:script|img|iframe|svg|style)\b/i.test(catalog[key]), `${locale} contains markup`);
    }
  }
});

test('fallback and single-pass interpolation keep supplied content literal', () => {
  assert.equal(translate('Unknown {value}', { value: '<img onerror=alert(1)> {other}', other: 'changed' }, 'ru'), 'Unknown <img onerror=alert(1)> {other}');
  assert.equal(translate('Unknown {value}', {}, 'ru'), 'Unknown {value}');
  assert.equal(translate('toString', {}, 'de'), 'toString');
  assert.equal(translate('Export site', {}, 'es'), 'Exportar sitio');
});

test('literal translation calls and static bindings have catalog entries', async () => {
  const files = ['public/app.mjs', 'public/structure-controls.mjs', 'public/library-drag.mjs', 'shared/structure.mjs', 'shared/slots.mjs'];
  const keys = new Set();
  for (const file of files) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    for (const match of source.matchAll(/(?<![\w])t\(\s*(['"])((?:\\.|(?!\1)[^\\\r\n])*)\1/g)) {
      keys.add(match[2].replace(/\\(['"\\])/g, '$1'));
    }
  }
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  for (const match of html.matchAll(/data-i18n(?:-title|-aria-label|-placeholder|-content)?="([^"]+)"/g)) {
    keys.add(match[1].replaceAll('&quot;', '"').replaceAll('&#x27;', "'").replaceAll('&#39;', "'").replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>'));
  }
  for (const [locale, catalog] of Object.entries(catalogs)) {
    if (locale === 'en') continue;
    for (const key of keys) assert.ok(Object.hasOwn(catalog, key), `${locale} UI key missing: ${key}`);
  }
});

test('formatting and preview messages follow the editor locale', () => {
  setLocale('de', { persist: false });
  assert.equal(getLocale(), 'de');
  assert.equal(formatNumber(1234.5), new Intl.NumberFormat('de').format(1234.5));
  assert.equal(formatDate('2026-09-27T12:30:00Z'), new Intl.DateTimeFormat('de', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date('2026-09-27T12:30:00Z')));
  const messages = previewMessages();
  assert.ok(Object.keys(messages).length <= 100);
  assert.ok(Object.entries(messages).every(([key, value]) => key.length <= 250 && value.length <= 1000));
  assert.equal(messages['Move…'], translate('Move…', {}, 'de'));
  setLocale('en', { persist: false });
});

test('only bundled locale assets are exposed by the local static allowlist', async () => {
  const { createApp } = await import('../server/app.mjs');
  const directory = await mkdtemp(path.join(tmpdir(), 'forma-i18n-'));
  const app = await createApp({ dataDir: directory });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  try {
    for (const locale of Object.keys(SUPPORTED_LOCALES).filter((locale) => locale !== 'en')) {
      const response = await fetch(`${base}/locales/${locale}.mjs`);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type'), /javascript/);
    }
    assert.equal((await fetch(`${base}/i18n.mjs`)).status, 200);
    assert.equal((await fetch(`${base}/locales/xx.mjs`)).status, 404);
    assert.equal((await fetch(`${base}/locales/editor-messages.json`)).status, 404);
    assert.equal((await fetch(`${base}/locales/de.mjs`, { headers: { Origin: 'https://example.com' } })).status, 403);
    const { token } = await (await fetch(`${base}/api/status`)).json();
    const preview = await (await fetch(`${base}/api/render`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forma-Token': token, Origin: base }, body: JSON.stringify({ spec: createSpec(), channel: 'i18n-test-channel' }) })).json();
    const script = preview.html.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/\r\n?/g, '\n');
    const hash = createHash('sha256').update(script).digest('base64');
    assert.ok(preview.html.includes(`sha256-${hash}`), 'CSP hash matches the script bytes after HTML newline normalization');
  } finally {
    await new Promise((resolve) => app.server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});

test('left sidebar includes Past projects tab backed by IndexedDB', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const appSource = await readFile(new URL('../public/app.mjs', import.meta.url), 'utf8');
  assert.ok(html.includes('data-left-tab="projects"'), 'Past projects tab button is present');
  assert.ok(html.includes('id="projects-content"'), 'Past projects sidebar content container is present');
  assert.ok(html.includes('id="past-projects-list"'), 'Past projects list container is present');
  assert.ok(html.includes('id="past-projects-count"'), 'Past projects count badge is present');
  assert.ok(appSource.includes("PROJECTS_DB_NAME = 'forma-projects-db'"), 'IndexedDB database name is configured');
  assert.ok(appSource.includes('idbPutProject') && appSource.includes('idbListProjects') && appSource.includes('idbDeleteProject'), 'IndexedDB CRUD helpers are wired');
});

test('footer GitHub link opens the fixed repository without an opener or referrer', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const footer = html.match(/<footer class="canvas-footer">.*?<\/footer>/)[0];
  const order = ['id="result-label"', 'id="github-link"', 'id="section-count"'].map((marker) => footer.indexOf(marker));
  assert.ok(order[0] >= 0 && order[0] < order[1] && order[1] < order[2], 'GitHub mark sits between the result and section labels');
  const links = [...html.matchAll(/<a\b[^>]*>/g)].map(([tag]) => tag).filter((tag) => !/\bhref="#/.test(tag));
  assert.equal(links.length, 1, 'Review any new outbound editor link for opener and referrer isolation');
  assert.match(links[0], /\bhref="https:\/\/github\.com\/GPTchatly\/Forma"/);
  assert.match(links[0], /\btarget="_blank"/);
  assert.match(links[0], /\brel="noopener noreferrer"/);
  assert.match(icon('github'), /<path d="M9 19c/, 'GitHub mark does not fall back to the default icon');
});
