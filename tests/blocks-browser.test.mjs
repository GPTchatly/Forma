/** Real Chromium checks of the block and selection additions in the local editor.
 * No provider, Redis, Turnstile or external component request is made. The editor renders the
 * preview 200 ms and saves 1400 ms after a change, so every assertion waits for a condition
 * through a waiting locator or page.waitForFunction; nothing sleeps for a fixed time. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { createApp } from '../server/app.mjs';
import { createSpec, makeSection } from '../shared/content.mjs';
import { CATALOG } from '../shared/catalog.mjs';
import { EXPANSION_BLOCKS } from '../shared/expansion.mjs';
import { BLOCK_MANIFESTS } from '../shared/blocks.mjs';
import { validateSpec } from '../shared/schema.mjs';
import { renderBody, siteStylesheet, themeCss } from '../shared/render.mjs';
import { createExportFiles } from '../shared/export.mjs';
import { getPageSpec } from '../shared/pages.mjs';
import { BUNDLED_NOTICES } from '../shared/notices.mjs';
import { SHOWCASES, makeShowcase } from '../shared/showcases.mjs';

const browserTest = { skip: !process.env.FORMA_PLAYWRIGHT_MODULE, timeout: 240000 };

// Shared setup for every test of this file: a loopback app with a temporary store and a
// throwing provider transport, one headless browser, and editor pages that open a project
// stored through the test's own store, in English. Page errors are collected for assertion.
async function setup(t) {
  const { chromium } = await import(pathToFileURL(process.env.FORMA_PLAYWRIGHT_MODULE));
  const directory = await mkdtemp(path.join(tmpdir(), 'forma-blocks-'));
  const app = await createApp({ dataDir: directory, fetchImpl: () => { throw new Error('No live provider may be called.'); } });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  let browser;
  t.after(async () => { await browser?.close(); await app.close(); await rm(directory, { recursive: true, force: true }); });
  browser = await chromium.launch({ headless: true, ...(process.env.FORMA_TEST_BROWSER ? { executablePath: process.env.FORMA_TEST_BROWSER } : {}) });
  const base = `http://127.0.0.1:${app.server.address().port}`, errors = [];
  const newPage = async (options = { viewport: { width: 2000, height: 1100 } }) => {
    const page = await browser.newPage(options);
    page.on('pageerror', (error) => errors.push(error.message));
    return page;
  };
  const openEditor = async (spec) => {
    const saved = await app.store.create(spec), page = await newPage();
    await page.addInitScript((id) => { if (window !== window.top) return; localStorage.setItem('forma:last-project', id); localStorage.setItem('forma:locale', 'en'); }, saved.id);
    await page.goto(base);
    // Keep the preview at 1:1 so automation targets the visible content.
    await page.waitForFunction(() => document.querySelector('#preview-frame').style.transform === 'scale(1)');
    if (await page.locator('#cookie-accept-button').isVisible()) await page.locator('#cookie-accept-button').click();
    const frame = page.frameLocator('#preview-frame');
    await frame.locator('[data-section]').first().waitFor();
    return { page, frame, saved };
  };
  return { app, browser, base, errors, newPage, openEditor };
}
// Runs an offline demo request through the editor's own request controls and waits until the
// editor has applied and saved it and is no longer busy.
async function demoRequest(page, operation, prompt) {
  await page.locator('#provider-mode').selectOption('demo');
  await page.locator('#operation').selectOption(operation);
  await page.locator('#prompt').fill(prompt);
  await page.locator('#build-button').click();
  await message(page, 'Demo ready. This used local rules, not JEV.');
  await page.waitForFunction(() => !document.querySelector('#build-fields').disabled && document.querySelector('#busy-overlay').hidden);
}
// Selects a section through the page-structure list, which opens its content tab.
async function selectSection(page, sectionId) {
  await page.locator('[data-inspector-tab="design"]').click();
  await page.locator(`[data-select-section="${sectionId}"]`).click();
  await page.locator(`#inspector-content [data-variant="${sectionId}"]`).waitFor();
}
const message = (page, text) => page.locator('.toast').filter({ hasText: text }).first().waitFor();
const inspectMode = (page, pressed) => page.locator(`#inspect-button[aria-pressed="${pressed}"]`).waitFor();
const alternativeIds = (page) => page.locator('#inspector-content [data-alternative-block]').evaluateAll((nodes) => nodes.map((node) => node.dataset.alternativeBlock));
const itemIds = (section) => section.locator('[data-item-id]').evaluateAll((nodes) => nodes.map((node) => node.dataset.itemId));

test('AC-22 an alternative layout is applied and undone in the editor', browserTest, async (t) => {
  const { errors, openEditor } = await setup(t);
  const { page, frame } = await openEditor(createSpec('Alternatives fixture'));
  await demoRequest(page, 'redesign', 'An expressive, dramatic redesign.');
  await selectSection(page, 'hero');
  const buttons = page.locator('#inspector-content [data-alternative-block]'), hero = frame.locator('[data-section="hero"]');
  await buttons.first().waitFor();
  const listed = await alternativeIds(page), original = await hero.getAttribute('class'), heading = await hero.locator('h1').first().textContent();
  await page.locator('#inspect-button').click();
  await inspectMode(page, 'false');
  await page.locator('#inspect-button').click();
  await inspectMode(page, 'true');
  assert.deepEqual(await alternativeIds(page), listed);
  await buttons.first().click();
  await frame.locator(`[data-section="hero"].${listed[0]}`).waitFor();
  assert.equal(await hero.locator('h1').first().textContent(), heading);
  await page.locator('#undo-button').click();
  await frame.locator(`[data-section="hero"][class="${original}"]`).waitFor();
  assert.deepEqual(errors, []);
});

test('AC-22 no alternative is offered or applied after the section became an application screen', browserTest, async (t) => {
  const { errors, openEditor } = await setup(t);
  const { page, frame } = await openEditor(createSpec('Alternatives fixture'));
  await demoRequest(page, 'redesign', 'An expressive, dramatic redesign.');
  await selectSection(page, 'hero');
  await page.locator('#inspector-content [data-alternative-block]').first().waitFor();
  const [stale] = await alternativeIds(page), hero = frame.locator('[data-section="hero"]');
  // The library's own replace choice installs the screen and its prepared fields.
  await page.locator('[data-left-tab="library"]').click();
  await page.locator('[data-library-filter="all"]').click();
  const menu = page.locator('details.library-placement-menu').filter({ has: page.locator('[data-library-choice*="app-dashboard"]') });
  await menu.locator('summary').click();
  await menu.locator('[data-library-proposal]').filter({ hasText: 'and its prepared fields' }).click();
  await frame.locator('[data-section="hero"].app-dashboard').waitFor();
  await selectSection(page, 'hero');
  const titleField = await page.locator('#inspector-content [data-field]').evaluateAll((nodes) => nodes.map((node) => node.dataset.field).find((field) => /^sections\.\d+\.title$/.test(field)));
  const typed = 'Typed dashboard heading';
  await page.locator(`#inspector-content [data-field="${titleField}"]`).fill(typed);
  await hero.filter({ hasText: typed }).waitFor();
  await selectSection(page, 'hero');
  assert.equal(await page.locator('#inspector-content [data-alternative-block]').count(), 0);
  const items = await itemIds(hero);
  assert.ok(items.length > 0);
  await page.evaluate((block) => {
    const button = document.createElement('button');
    button.type = 'button'; button.dataset.alternativeBlock = block; button.textContent = 'Stale alternative';
    document.querySelector('#inspector-content').append(button);
  }, stale);
  await page.locator('#inspector-content [data-alternative-block]').click();
  await message(page, 'This layout is no longer available for this section.');
  assert.match(await hero.getAttribute('class'), /(?:^|\s)app-dashboard(?:\s|$)/);
  assert.ok((await hero.textContent()).includes(typed));
  assert.deepEqual(await itemIds(hero), items);
  assert.deepEqual(errors, []);
});

test('AC-22 an alternative layout is applied in Interact mode and a locked section says why it stays', browserTest, async (t) => {
  const { errors, openEditor } = await setup(t);
  const { page, frame } = await openEditor(createSpec('Alternatives fixture'));
  await demoRequest(page, 'redesign', 'An expressive, dramatic redesign.');
  await selectSection(page, 'hero');
  const first = page.locator('#inspector-content [data-alternative-block]').first(), hero = frame.locator('[data-section="hero"]');
  await first.waitFor();
  const block = await first.getAttribute('data-alternative-block'), original = await hero.getAttribute('class'), heading = await hero.locator('h1').first().textContent();
  // (1) A locked section keeps its layout, and the message says why.
  await page.locator('[data-inspector-tab="design"]').click();
  await page.locator('[data-lock-section="hero"]').click();
  await page.locator('[data-lock-section="hero"].locked').waitFor();
  await selectSection(page, 'hero');
  await first.click();
  await message(page, 'Unlock this section before changing its component.');
  assert.equal(await hero.getAttribute('class'), original);
  await page.locator('[data-inspector-tab="design"]').click();
  await page.locator('[data-lock-section="hero"]').click();
  await page.locator('[data-lock-section="hero"]:not(.locked)').waitFor();
  await selectSection(page, 'hero');
  // (2) Interact mode with the alternatives already shown: the click applies the layout.
  await page.locator('#inspect-button').click();
  await inspectMode(page, 'false');
  assert.equal(await first.getAttribute('data-alternative-block'), block);
  assert.equal(await first.isDisabled(), false);
  await first.click();
  await frame.locator(`[data-section="hero"].${block}`).waitFor();
  assert.equal(await hero.locator('h1').first().textContent(), heading);
  assert.equal(await page.locator('#inspect-button').getAttribute('aria-pressed'), 'false');
  // (3) Undo in Interact mode.
  await page.locator('#undo-button').click();
  await frame.locator(`[data-section="hero"][class="${original}"]`).waitFor();
  assert.equal(await page.locator('#inspect-button').getAttribute('aria-pressed'), 'false');
  assert.deepEqual(errors, []);
});

// Export files and pages: the static assets of an export, a temporary directory per test, and
// a page written there and opened by file: URL, as a visitor opens a downloaded export.
const read = (name) => readFile(new URL(`../${name}`, import.meta.url), 'utf8');
async function exportAssets() {
  const css = await read('public/site.css');
  const script = (await Promise.all(['site-runtime.js', 'interface-runtime.js', 'interaction-runtime.js'].map((name) => read(`public/${name}`)))).join('\n').replace(/\r\n?/g, '\n');
  const notices = Object.fromEntries(await Promise.all(BUNDLED_NOTICES.map(async (name) => [name, await read(`licenses/${name}.txt`)])));
  return { css, script, scriptHash: createHash('sha256').update(script).digest('base64'), notices, originalLicense: await read('LICENSE') };
}
async function exportDirectory(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'forma-blocks-export-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}
async function writePage(directory, name, html) {
  const file = path.join(directory, `${name}.html`);
  await writeFile(file, html);
  return pathToFileURL(file).href;
}
// One section alone on a page, motion off unless a case says otherwise.
function single(section) {
  const spec = createSpec(); spec.theme.motion = 'none'; spec.sections = [section];
  return validateSpec(spec);
}
const fits = (page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
const blockNames = new Set([...CATALOG.map((block) => block.id), ...EXPANSION_BLOCKS.map((entry) => `xp-${entry.behavior}`)]);
const familyClass = (name) => name === 'app-section' || name === 'app-interface' || name.startsWith('ui-');
// The class tokens a selector requires: `.name` outside (…) and […] groups.
function selectorClasses(selector) {
  let flat = selector, previous;
  do { previous = flat; flat = flat.replace(/\([^()]*\)|\[[^[\]]*\]/g, ''); } while (flat !== previous);
  return [...flat.matchAll(/\.([\w-]+)/g)].map((match) => match[1]);
}
function topLevelSelectors(text) {
  const selectors = [];
  let depth = 0, start = 0;
  for (let index = 0; index < text.length; index++) {
    if (text[index] === '(' || text[index] === '[') depth++;
    else if (text[index] === ')' || text[index] === ']') depth--;
    else if (text[index] === ',' && !depth) { selectors.push(text.slice(start, index)); start = index + 1; }
  }
  return [...selectors, text.slice(start)];
}

test('AC-22 every manifest block fits narrow and wide screens offline', browserTest, async (t) => {
  const { errors, newPage } = await setup(t), assets = await exportAssets(), directory = await exportDirectory(t);
  const page = await newPage({ viewport: { width: 390, height: 844 } }), outgoing = [];
  page.on('request', (request) => { if (request.url().startsWith('http')) outgoing.push(request.url()); });
  for (const manifest of BLOCK_MANIFESTS) {
    const url = await writePage(directory, manifest.id, createExportFiles(single(makeSection(manifest.group, manifest.id)), assets)['index.html']);
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(url);
      await page.locator(`.site-section.${manifest.id}`).waitFor();
      assert.ok(await fits(page), `${manifest.id} fits ${width} px`);
    }
  }
  assert.deepEqual(outgoing, []);
  assert.deepEqual(errors, []);
});

test('AC-22 manifest blocks are readable without script', browserTest, async (t) => {
  const { browser } = await setup(t), assets = await exportAssets(), directory = await exportDirectory(t);
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  t.after(() => context.close());
  const page = await context.newPage();
  for (const manifest of BLOCK_MANIFESTS) {
    const section = makeSection(manifest.group, manifest.id);
    section.items.forEach((item, index) => { item.title = `Marker ${manifest.id} ${'abcdefgh'[index]}`; });
    const spec = single(section), preview = renderBody(spec, { preview: true });
    const shown = spec.sections[0].items.filter((item) => preview.includes(`data-item-id="${item.id}"`));
    await page.goto(await writePage(directory, manifest.id, createExportFiles(spec, assets)['index.html']));
    const root = page.locator(`section.site-section.${manifest.id}`);
    await root.waitFor();
    // Outer disclosures come first in document order, so an inner one is reachable when opened.
    const disclosures = root.locator('details');
    for (let index = 0; index < await disclosures.count(); index++) {
      const disclosure = disclosures.nth(index);
      if (await disclosure.getAttribute('open') !== null) continue;
      const summary = disclosure.locator(':scope > summary');
      assert.ok(await summary.isVisible(), `${manifest.id} disclosure ${index} has a visible summary`);
      await summary.click();
    }
    for (const item of shown) {
      const matches = root.getByText(item.title);
      let visible = false;
      for (let index = 0; index < await matches.count() && !visible; index++) visible = await matches.nth(index).isVisible();
      assert.ok(visible, `${manifest.id} shows ${item.title}`);
    }
  }
});

test('AC-22 schedule filter, integration search and code tabs work', browserTest, async (t) => {
  const { errors, newPage } = await setup(t), assets = await exportAssets(), directory = await exportDirectory(t);
  const integrations = makeSection('logos', 'logos-integrations');
  ['Calendar sync', 'Payments', 'Team chat'].forEach((title, index) => { integrations.items[index].title = title; });
  const urls = {
    schedule: await writePage(directory, 'schedule', createExportFiles(single(makeSection('process', 'process-schedule')), assets)['index.html']),
    integrations: await writePage(directory, 'integrations', createExportFiles(single(integrations), assets)['index.html']),
    code: await writePage(directory, 'code', createExportFiles(single(makeSection('features', 'features-code')), assets)['index.html'])
  };
  for (const options of [{}, { reducedMotion: 'reduce' }]) {
    const page = await newPage({ viewport: { width: 1440, height: 900 }, ...options }), label = options.reducedMotion || 'default motion';
    await page.goto(urls.schedule);
    const schedule = page.locator('.process-schedule');
    assert.equal(await schedule.locator('[data-xp-action="filter"]').count(), 3);
    await schedule.locator('[data-xp-filter="Day two"]').click();
    assert.equal(await schedule.locator('[data-xp-record]:visible').count(), 2, label);
    assert.equal(await schedule.locator('[data-xp-category="Day one"]:visible').count(), 0, label);
    assert.equal(await schedule.locator('[data-xp-category="Day two"]:visible').count(), 2, label);
    await page.goto(urls.integrations);
    const directoryBlock = page.locator('.logos-integrations'), search = directoryBlock.locator('[data-xp-search]');
    await search.fill('Payments');
    assert.equal(await directoryBlock.locator('[data-xp-record]:visible').count(), 1, label);
    assert.ok(await directoryBlock.locator('[data-xp-record]:visible').filter({ hasText: 'Payments' }).isVisible(), label);
    await search.fill('');
    assert.equal(await directoryBlock.locator('[data-xp-record]:visible').count(), 3, label);
    await page.goto(urls.code);
    const code = page.locator('.features-code'), tabs = code.locator('.xp-tablist [data-xp-action="tab"]'), panels = code.locator('[data-xp-panel]');
    await tabs.nth(1).click();
    assert.equal(await tabs.nth(1).getAttribute('aria-selected'), 'true', label);
    assert.ok(await panels.nth(1).isVisible(), label); assert.equal(await panels.nth(0).isVisible(), false, label);
    await page.keyboard.press('ArrowLeft');
    assert.equal(await tabs.nth(0).getAttribute('aria-selected'), 'true', label);
    assert.ok(await tabs.nth(0).evaluate((node) => node === document.activeElement), label);
    assert.ok(await panels.nth(0).isVisible(), label); assert.equal(await panels.nth(1).isVisible(), false, label);
    await page.close();
  }
  assert.deepEqual(errors, []);
});

test('AC-22 the quotation spotlight switches quotations', browserTest, async (t) => {
  const { errors, newPage } = await setup(t), assets = await exportAssets(), directory = await exportDirectory(t);
  const section = makeSection('testimonials', 'quotes-spotlight');
  section.items.forEach((item, index) => { item.body = `Spotlight quotation ${'abc'[index]}`; });
  const url = await writePage(directory, 'spotlight', createExportFiles(single(section), assets)['index.html']);
  for (const options of [{}, { reducedMotion: 'reduce' }]) {
    const page = await newPage({ viewport: { width: 1440, height: 900 }, ...options }), label = options.reducedMotion || 'default motion';
    await page.goto(url);
    const spotlight = page.locator('.quotes-spotlight'), tabs = spotlight.locator('.xp-tablist [data-xp-action="tab"]'), quotes = spotlight.locator('blockquote');
    assert.equal(await tabs.count(), 3, label);
    await tabs.nth(1).click();
    assert.equal(await tabs.nth(1).getAttribute('aria-selected'), 'true', label);
    assert.ok(await quotes.nth(1).isVisible(), label); assert.equal(await quotes.nth(0).isVisible(), false, label);
    await page.keyboard.press('ArrowRight');
    assert.equal(await tabs.nth(2).getAttribute('aria-selected'), 'true', label);
    assert.ok(await tabs.nth(2).evaluate((node) => node === document.activeElement), label);
    assert.ok(await quotes.nth(2).isVisible(), label); assert.equal(await quotes.nth(1).isVisible(), false, label);
    await page.keyboard.press('ArrowLeft');
    assert.equal(await tabs.nth(1).getAttribute('aria-selected'), 'true', label);
    assert.ok(await quotes.nth(1).isVisible(), label); assert.equal(await quotes.nth(2).isVisible(), false, label);
    await page.close();
  }
  assert.deepEqual(errors, []);
});

test('AC-22 a declared item field is edited in the inspector and survives reopening', browserTest, async (t) => {
  const { app, errors, openEditor } = await setup(t);
  const spec = createSpec('Declared fields fixture');
  spec.sections = spec.sections.map((section) => section.group === 'contact' ? makeSection('contact', 'contact-hours') : section);
  const { page, frame, saved } = await openEditor(spec), dialogs = [];
  page.on('dialog', (dialog) => { dialogs.push(dialog.type()); dialog.accept(); });
  const typed = 'Typed opening hours 4417', contact = frame.locator('[data-section="contact"]');
  const hours = () => page.locator('#inspector-content [data-editor-item-index="0"]').getByLabel('Hours', { exact: true });
  // (2) The first item card of the selected section takes the value; the preview shows it.
  await selectSection(page, 'contact');
  await hours().fill(typed);
  await contact.getByText(typed).waitFor();
  // (3) An explicit save, then the editor's own settled state.
  const before = (await app.store.get(saved.id)).revision;
  await page.locator('#save-button').click();
  await page.waitForFunction(() => document.querySelector('#save-status').textContent === 'Saved locally');
  // (4) The value is on disk before the page is left.
  const stored = await app.store.get(saved.id);
  assert.ok(stored.revision > before);
  assert.equal(stored.spec.sections.find((section) => section.block === 'contact-hours').items[0].price, typed);
  // (5) Reopen the same project and read the value back from the inspector and the preview.
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#preview-frame').style.transform === 'scale(1)');
  await frame.locator('[data-section]').first().waitFor();
  await selectSection(page, 'contact');
  await page.waitForFunction((value) => document.querySelector('#inspector-content [data-editor-item-index="0"] [data-field$=".items.0.price"]')?.value === value, typed);
  assert.equal(await hours().inputValue(), typed);
  await contact.getByText(typed).waitFor();
  // (6) No unsaved-changes prompt was raised on leaving.
  assert.deepEqual(dialogs, []);
  assert.ok((await page.locator('#library-count').textContent()).includes(String(CATALOG.length)));
  assert.deepEqual(errors, []);
});

test('AC-22 no droppable rule is left on a single-block page', { ...browserTest, timeout: 600000 }, async (t) => {
  const { newPage } = await setup(t), assets = await exportAssets(), directory = await exportDirectory(t);
  const page = await newPage({ viewport: { width: 1440, height: 900 } });
  for (const block of CATALOG) {
    const html = createExportFiles(single(makeSection(block.group, block.id)), assets)['index.html'];
    const tokens = new Set([...html.matchAll(/class="([^"]*)"/g)].flatMap((match) => match[1].split(/\s+/)).filter(Boolean));
    const family = [...tokens].some(familyClass);
    const absent = (name) => familyClass(name) ? !family : blockNames.has(name) && !tokens.has(name);
    await page.goto(await writePage(directory, block.id, html));
    const selectors = await page.evaluate(() => {
      const found = [];
      const walk = (rules) => { for (const rule of rules) { if (rule instanceof CSSMediaRule || rule instanceof CSSSupportsRule) walk(rule.cssRules); else if (rule instanceof CSSStyleRule) found.push(rule.selectorText); } };
      walk(document.styleSheets[0].cssRules);
      return found;
    });
    const droppable = selectors.filter((text) => topLevelSelectors(text).every((selector) => selectorClasses(selector).some(absent)));
    assert.deepEqual(droppable, [], block.id);
  }
});

test('AC-22 the filtered stylesheet renders exactly like the whole one', { ...browserTest, timeout: 600000 }, async (t) => {
  const { newPage } = await setup(t), assets = await exportAssets(), directory = await exportDirectory(t);
  const page = await newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const record = () => page.evaluate(() => [...document.body.querySelectorAll('*')].map((element) => {
    const read = (pseudo) => { const style = getComputedStyle(element, pseudo); return Array.from(style, (name) => `${name}:${style.getPropertyValue(name)}`).join(';'); };
    return [read(null), ...['::before', '::after'].filter((pseudo) => getComputedStyle(element, pseudo).content !== 'none').map(read)];
  }));
  const compare = async (name, spec, widths) => {
    const site = validateSpec(spec), html = createExportFiles(site, assets)['index.html'];
    const start = html.indexOf('<style>') + 7, end = html.indexOf('</style>');
    const whole = `${html.slice(0, start)}${siteStylesheet(assets.css)}\n${themeCss(getPageSpec(site, 'home'))}${html.slice(end)}`;
    const filteredUrl = await writePage(directory, `${name}-filtered`, html), wholeUrl = await writePage(directory, `${name}-whole`, whole);
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(filteredUrl); const filtered = await record();
      await page.goto(wholeUrl); const reference = await record();
      assert.equal(filtered.length, reference.length, `${name} ${width}`);
      const first = filtered.findIndex((entry, index) => JSON.stringify(entry) !== JSON.stringify(reference[index]));
      assert.equal(first, -1, `${name} at ${width} px differs from element ${first}`);
    }
  };
  for (const block of CATALOG) await compare(block.id, single(makeSection(block.group, block.id)), [1440]);
  for (const key of Object.keys(SHOWCASES)) await compare(`showcase-${key}`, makeShowcase(key), [390, 1440]);
});

// AI application set: exported pages opened from disk, once in a default context and once with
// reduced motion. The interaction runtime acts synchronously on a click, but every check still
// waits for its condition through a locator, so nothing here depends on timing.
const motions = [{}, { reducedMotion: 'reduce' }];
const texts = (locator) => locator.evaluateAll((nodes) => nodes.map((node) => node.textContent));
// Waits for a status region of the root to hold the text, which is how the runtime announces.
const announced = (root, text) => root.locator('[data-xp-status]').filter({ hasText: text }).first().waitFor();
const shownEntries = (count) => `${count} ${count === 1 ? 'entry' : 'entries'} shown.`;
// Waits until a native disclosure is open; works on a locator that resolves to one <details>.
async function opened(page, details) {
  const handle = await details.elementHandle();
  await page.waitForFunction((node) => node.open, handle);
}
// The runtime enhances each interaction root after load; controls act only from then on.
const enhanced = (page) => page.locator('[data-xp-block][data-xp-enhanced="true"]').first().waitFor();
async function agentPage(newPage, url, options) {
  const page = await newPage({ viewport: { width: 1440, height: 900 }, ...options });
  await page.goto(url);
  await enhanced(page);
  return page;
}

test('AC-22 agent screens respond to their controls', browserTest, async (t) => {
  const { errors, newPage } = await setup(t), assets = await exportAssets(), directory = await exportDirectory(t);
  const urls = {};
  for (const id of ['app-agent-run', 'app-agent-chat', 'app-agent-inbox', 'app-usage', 'app-agent-setup']) {
    urls[id] = await writePage(directory, id, createExportFiles(single(makeSection('hero', id)), assets)['index.html']);
  }
  for (const options of motions) {
    const label = options.reducedMotion || 'default motion';

    // Agent run: a tool call opens by click, the approval announces, a filter leaves its entries.
    let page = await agentPage(newPage, urls['app-agent-run'], options);
    const run = page.locator('[data-xp-block="agent-run"]');
    const closed = await run.locator('details').evaluateAll((nodes) => nodes.findIndex((node) => !node.open));
    assert.ok(closed >= 0, `${label}: the run has a closed tool call`);
    const call = run.locator('details').nth(closed);
    await call.locator(':scope > summary').click();
    await opened(page, call);
    const approve = run.locator('[data-xp-action="confirm"]').first(), statusBefore = await run.locator('[data-xp-status]').first().textContent();
    await approve.click();
    await announced(run, 'Activate Confirm now to confirm.');
    assert.notEqual(await run.locator('[data-xp-status]').first().textContent(), statusBefore, label);
    assert.equal(await approve.getAttribute('aria-pressed'), 'false', label);
    await approve.click();
    await announced(run, 'Confirmed in this view.');
    assert.equal(await approve.getAttribute('aria-pressed'), 'true', label);
    const records = run.locator('[data-xp-record]'), total = await records.count(), chosen = run.locator('[data-xp-action="filter"]:not([data-xp-filter=""])').first();
    const category = await chosen.getAttribute('data-xp-filter');
    const expected = await records.evaluateAll((nodes, value) => nodes.filter((node) => node.dataset.xpCategory === value).length, category);
    assert.ok(expected > 0 && expected < total, `${label}: the filter "${category}" selects some of the ${total} entries`);
    await chosen.click();
    await announced(run, shownEntries(expected));
    assert.equal(await chosen.getAttribute('aria-pressed'), 'true', label);
    assert.equal(await run.locator('[data-xp-record]:visible').count(), expected, label);
    assert.equal(await run.locator(`[data-xp-record][data-xp-category="${category}"]:visible`).count(), expected, label);
    await page.close();

    // Chat with artifact: the second artifact tab shows its panel, the copy control announces.
    page = await agentPage(newPage, urls['app-agent-chat'], options);
    const chat = page.locator('[data-xp-block="agent-chat"]'), tabs = chat.locator('.xp-tablist [data-xp-action="tab"]'), panels = chat.locator('[data-xp-panel]');
    assert.ok(await tabs.count() >= 2, label);
    assert.equal(await chat.locator('textarea').first().evaluate((node) => node.readOnly), true, `${label}: the first textarea is read-only`);
    assert.equal(await tabs.nth(0).getAttribute('aria-selected'), 'true', label);
    await tabs.nth(1).click();
    await panels.nth(1).waitFor({ state: 'visible' });
    assert.equal(await tabs.nth(1).getAttribute('aria-selected'), 'true', label);
    assert.equal(await tabs.nth(0).getAttribute('aria-selected'), 'false', label);
    assert.equal(await panels.nth(0).isVisible(), false, label);
    await chat.locator('[data-xp-action="copy"]:visible').first().click();
    // Either outcome is a local announcement; the clipboard may be unavailable to a page opened from disk.
    await announced(chat, /Copied\.|Text selected\./);
    await page.close();

    // Agent inbox: read toggles the request it belongs to, dismiss removes only that request.
    page = await agentPage(newPage, urls['app-agent-inbox'], options);
    const inbox = page.locator('[data-xp-block="agent-inbox"]'), requests = inbox.locator('[data-xp-record]');
    const readable = requests.filter({ has: page.locator('[data-xp-action="read"]') }).first(), reader = readable.locator('[data-xp-action="read"]');
    await reader.click();
    await announced(inbox, 'Marked as read.');
    assert.equal(await readable.getAttribute('data-xp-read'), 'true', label);
    assert.equal(await reader.getAttribute('aria-pressed'), 'true', label);
    assert.equal(await inbox.locator('[data-xp-record][data-xp-read="true"]').count(), 1, label);
    await reader.click();
    await announced(inbox, 'Marked as unread.');
    assert.equal(await readable.getAttribute('data-xp-read'), 'false', label);
    const dismissable = requests.filter({ has: page.locator('[data-xp-action="dismiss"]') }).first(), shown = await inbox.locator('[data-xp-record]:visible').count();
    assert.ok(shown >= 2, label);
    await dismissable.locator('[data-xp-action="dismiss"]').click();
    await announced(inbox, 'Dismissed in this view.');
    await dismissable.waitFor({ state: 'hidden' });
    assert.equal(await inbox.locator('[data-xp-record]:visible').count(), shown - 1, label);
    await page.close();

    // Usage and limits: sort reorders the table rows, search hides the rows that do not match.
    page = await agentPage(newPage, urls['app-usage'], options);
    const usage = page.locator('[data-xp-block="usage"]'), rows = usage.locator('[data-xp-sortable] > *');
    assert.ok(await usage.locator('table').count() >= 1, label);
    const initial = await texts(rows);
    assert.ok(initial.length >= 2, label);
    await usage.locator('[data-xp-action="sort"]').click();
    await announced(usage, 'Sorted ascending.');
    const ascending = await texts(rows);
    assert.deepEqual(ascending, await page.evaluate((list) => [...list].sort((a, b) => a.localeCompare(b)), initial), label);
    await usage.locator('[data-xp-action="sort"]').click();
    await announced(usage, 'Sorted descending.');
    const descending = await texts(rows);
    assert.deepEqual(descending, [...ascending].reverse(), label);
    assert.notDeepEqual(descending, ascending, label);
    const entries = await texts(usage.locator('[data-xp-record]')), lowered = entries.map((entry) => entry.toLowerCase());
    const term = entries.flatMap((entry) => entry.toLowerCase().split(/\s+/)).find((word) => word.length >= 3 && lowered.some((entry) => entry.includes(word)) && !lowered.every((entry) => entry.includes(word)));
    assert.ok(term, `${label}: a search term that matches some entries and not others`);
    const matching = lowered.filter((entry) => entry.includes(term)).length;
    await usage.locator('[data-xp-search]').fill(term);
    await announced(usage, shownEntries(matching));
    assert.equal(await usage.locator('[data-xp-record]:visible').count(), matching, label);
    assert.equal(await usage.locator('[data-xp-record]:visible').filter({ hasText: term }).count(), matching, label);
    await usage.locator('[data-xp-search]').fill('');
    await announced(usage, shownEntries(entries.length));
    assert.equal(await usage.locator('[data-xp-record]:visible').count(), entries.length, label);
    await page.close();

    // Agent setup: next and back move through the steps and the last one completes locally.
    page = await agentPage(newPage, urls['app-agent-setup'], options);
    // The runtime also writes data-xp-step (the current index) on the wizard root, so steps are its children.
    const setupScreen = page.locator('[data-xp-block="agent-setup"]'), steps = setupScreen.locator('[data-xp-wizard] > [data-xp-step]');
    const back = setupScreen.locator('[data-xp-action="step-back"]'), next = setupScreen.locator('[data-xp-action="step-next"]'), count = await steps.count();
    assert.ok(count >= 2, label);
    // The prepared steps have no input field, so Next never waits for validation.
    assert.equal(await setupScreen.locator('[data-xp-step] :is(input, textarea)').count(), 0, label);
    const advance = () => next.click();
    await steps.nth(0).waitFor({ state: 'visible' });
    assert.equal(await steps.nth(1).isVisible(), false, label);
    assert.equal(await back.isDisabled(), true, label);
    await advance(0);
    await steps.nth(1).waitFor({ state: 'visible' });
    await steps.nth(0).waitFor({ state: 'hidden' });
    assert.equal(await back.isDisabled(), false, label);
    await back.click();
    await steps.nth(0).waitFor({ state: 'visible' });
    await steps.nth(1).waitFor({ state: 'hidden' });
    for (let index = 0; index < count - 1; index++) {
      await advance(index);
      await steps.nth(index + 1).waitFor({ state: 'visible' });
    }
    await steps.nth(count - 1).waitFor({ state: 'visible' });
    assert.equal((await next.textContent()).trim(), 'Finish', label);
    await advance(count - 1);
    await announced(setupScreen, 'All steps completed in this view.');
    assert.equal((await next.textContent()).trim(), 'Completed', label);
    await page.close();
  }
  assert.deepEqual(errors, []);
});

test('AC-22 the prompt introduction switches examples', browserTest, async (t) => {
  const { errors, newPage } = await setup(t), assets = await exportAssets(), directory = await exportDirectory(t);
  // The prepared content brings three sample prompts, each with an example answer.
  const section = makeSection('hero', 'hero-prompt');
  assert.equal(section.items.length, 3);
  const url = await writePage(directory, 'prompt', createExportFiles(single(section), assets)['index.html']);
  for (const options of motions) {
    const label = options.reducedMotion || 'default motion';
    const page = await agentPage(newPage, url, options);
    const prompt = page.locator('[data-xp-block="prompt"]'), chips = prompt.locator('.xp-tablist [data-xp-action="tab"]'), panels = prompt.locator('[data-xp-panel]');
    assert.equal(await chips.count(), 3, label);
    assert.equal(await chips.nth(0).getAttribute('aria-selected'), 'true', label);
    assert.equal((await chips.nth(1).textContent()).trim(), section.items[1].title, label);
    await panels.nth(0).getByText(section.items[0].body).waitFor();
    assert.equal(await panels.nth(1).isVisible(), false, label);
    await chips.nth(1).click();
    await panels.nth(1).getByText(section.items[1].body).waitFor();
    assert.equal(await chips.nth(1).getAttribute('aria-selected'), 'true', label);
    assert.equal(await chips.nth(0).getAttribute('aria-selected'), 'false', label);
    assert.equal(await panels.nth(0).isVisible(), false, label);
    await page.close();
  }
  assert.deepEqual(errors, []);
});

test('AC-22 an approval inside the custom workspace is confirmed', browserTest, async (t) => {
  const { errors, newPage } = await setup(t), assets = await exportAssets(), directory = await exportDirectory(t);
  const section = makeSection('hero', 'app-workspace');
  ['approval', 'approval', 'toolcall'].forEach((type, index) => { section.items[index].uiType = type; section.items[index].title = `${type} entry ${index + 1}`; });
  section.items = section.items.slice(0, 3);
  const url = await writePage(directory, 'workspace', createExportFiles(single(section), assets)['index.html']);
  for (const options of motions) {
    const label = options.reducedMotion || 'default motion';
    const page = await agentPage(newPage, url, options);
    const roots = page.locator('[data-xp-block="agent-item"]'), approvals = roots.filter({ has: page.locator('[data-xp-action="confirm"]') });
    assert.equal(await roots.count(), 3, label);
    assert.equal(await approvals.count(), 2, label);
    const [first, second] = [approvals.nth(0), approvals.nth(1)], firstControl = first.locator('[data-xp-action="confirm"]'), firstStatus = first.locator('[data-xp-status]');
    // The first click only arms the control and says so inside its own item.
    await firstControl.click();
    await firstStatus.filter({ hasText: /\S/ }).waitFor();
    assert.equal(await firstControl.getAttribute('aria-pressed'), 'false', label);
    // The second click confirms.
    await firstControl.click();
    await firstStatus.filter({ hasText: 'Confirmed in this view.' }).waitFor();
    assert.equal((await firstStatus.textContent()).trim(), 'Confirmed in this view.', label);
    assert.equal(await firstControl.getAttribute('aria-pressed'), 'true', label);
    // The other approval is a separate root and stays untouched.
    assert.equal(await second.locator('[data-xp-action="confirm"]').getAttribute('aria-pressed'), 'false', label);
    assert.equal((await second.locator('[data-xp-status]').textContent()).trim(), '', label);
    // A tool call opens by click.
    const call = roots.locator('details').first();
    assert.equal(await call.evaluate((node) => node.open), false, label);
    await call.locator(':scope > summary').click();
    await opened(page, call);
    await page.close();
  }
  assert.deepEqual(errors, []);
});

// Breadth additions: the section backdrop in the editor, and the media side and column count on
// exported pages. Boxes are read with getBoundingClientRect once the section is on the page.
const boxOf = (locator) => locator.evaluate((node) => { const { x, y, width, height } = node.getBoundingClientRect(); return { x, y, width, height }; });

test('AC-22 a backdrop is chosen in the inspector', browserTest, async (t) => {
  const { app, errors, openEditor } = await setup(t);
  const { page, frame, saved } = await openEditor(createSpec('Backdrop fixture'));
  const features = frame.locator('[data-section="features"]'), backdrop = page.locator('#presentation-features-backdrop');
  await selectSection(page, 'features');
  await backdrop.waitFor();
  // The preview shows the plain section until a backdrop is chosen.
  await frame.locator('[data-section="features"][data-backdrop="default"]').waitFor();
  const plain = await features.evaluate((node) => getComputedStyle(node).backgroundImage);
  await backdrop.selectOption('grid');
  await frame.locator('[data-section="features"][data-backdrop="grid"]').waitFor();
  const grid = await features.evaluate((node) => getComputedStyle(node).backgroundImage);
  assert.notEqual(grid, 'none');
  assert.notEqual(grid, plain);
  // The choice is saved sparsely: the stored section carries the value once the save is complete.
  const before = (await app.store.get(saved.id)).revision;
  await page.locator('#save-button').click();
  await page.waitForFunction(() => document.querySelector('#save-status').textContent === 'Saved locally');
  const stored = await app.store.get(saved.id);
  assert.ok(stored.revision > before);
  assert.equal(stored.spec.sections.find((section) => section.id === 'features').presentation.backdrop, 'grid');
  // Choosing the default again returns the section to its plain background.
  await backdrop.selectOption('default');
  await frame.locator('[data-section="features"][data-backdrop="default"]').waitFor();
  assert.equal(await features.evaluate((node) => getComputedStyle(node).backgroundImage), plain);
  assert.deepEqual(errors, []);
});

test('AC-22 media side and columns change the layout', { ...browserTest, timeout: 600000 }, async (t) => {
  const { errors, newPage } = await setup(t), assets = await exportAssets(), directory = await exportDirectory(t);
  const exported = (name, section) => writePage(directory, name, createExportFiles(single(section), assets)['index.html']);
  const page = await newPage({ viewport: { width: 1440, height: 900 } });

  // (1) The image box sits beside the copy box at 1440 px and above or below it at 390 px.
  const sides = [
    { block: 'about-split', group: 'about', image: '.about-visual', copy: '.about-inner > div:not(.about-visual)' },
    { block: 'cta-image', group: 'cta', image: '.xp-image', copy: '.xp-cta-copy' }
  ];
  for (const { block, group, image, copy } of sides) {
    for (const placement of ['default', 'before', 'after']) {
      const section = makeSection(group, block);
      section.elements.mediaPlacement = placement;
      const url = await exported(`${block}-${placement}`, section), label = `${block} ${placement}`;
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(url);
        const root = page.locator(`.site-section.${block}`);
        await root.waitFor();
        assert.equal(await root.getAttribute('data-element-media-placement'), placement, label);
        const picture = await boxOf(root.locator(image).first()), words = await boxOf(root.locator(copy).first());
        if (width === 1440) {
          if (placement === 'after') assert.ok(words.x + words.width <= picture.x + 1, `${label} at 1440: the image is right of the copy`);
          else assert.ok(picture.x + picture.width <= words.x + 1, `${label} at 1440: the image is left of the copy`);
        } else if (placement === 'after') assert.ok(words.y + words.height <= picture.y + 1, `${label} at 390: the image is below the copy`);
        else assert.ok(picture.y + picture.height <= words.y + 1, `${label} at 390: the image is above the copy`);
      }
    }
  }

  // (2) Two and four columns give different card widths at 1440 px, and `default` is styled by no
  // column rule: the cards keep their boxes when the attribute is removed from the section tag.
  await page.setViewportSize({ width: 1440, height: 900 });
  const grids = [
    { block: 'stats-cards', group: 'stats', cards: '.xp-stat-card-grid > *' },
    { block: 'quotes-grid', group: 'testimonials', cards: '.xp-quote-grid > *' },
    { block: 'team-grid', group: 'team', cards: '.xp-collection > *' },
    { block: 'team-directory', group: 'team', cards: '.xp-collection > *' },
    { block: 'logos-wall', group: 'logos', cards: '.xp-logo-rail > *' },
    { block: 'stats-band', group: 'stats', cards: '.xp-stats > *' }
  ];
  const cardBoxes = (root, cards) => root.locator(cards).evaluateAll((nodes) => nodes.map((node) => { const { x, y, width, height } = node.getBoundingClientRect(); return [x, y, width, height]; }));
  for (const { block, group, cards } of grids) {
    const widths = {};
    for (const columns of ['two', 'four']) {
      const section = makeSection(group, block);
      section.elements.columns = columns;
      await page.goto(await exported(`${block}-${columns}`, section));
      const root = page.locator(`.site-section.${block}`);
      await root.locator(cards).first().waitFor();
      assert.equal(await root.getAttribute('data-element-columns'), columns, block);
      widths[columns] = (await boxOf(root.locator(cards).first())).width;
    }
    assert.ok(widths.two > widths.four, `${block}: ${widths.two} px with two columns, ${widths.four} px with four`);
    if (block === 'stats-cards') continue;
    const section = makeSection(group, block);
    await page.goto(await exported(`${block}-default`, section));
    const root = page.locator(`.site-section.${block}`);
    await root.locator(cards).first().waitFor();
    assert.equal(await root.getAttribute('data-element-columns'), 'default', block);
    const withAttribute = await cardBoxes(root, cards);
    assert.ok(withAttribute.length > 0, block);
    await root.evaluate((node) => node.removeAttribute('data-element-columns'));
    assert.equal(await root.getAttribute('data-element-columns'), null, block);
    assert.deepEqual(await cardBoxes(root, cards), withAttribute, `${block}: default is styled by no column rule`);
  }
  assert.deepEqual(errors, []);
});
