/** Real editor integration in an isolated project; never calls a model provider. */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createApp } from '../server/app.mjs';
import { createSpec, makeInterfaceSection } from '../shared/content.mjs';
import { createPage } from '../shared/pages.mjs';

if (!process.env.FORMA_PLAYWRIGHT_MODULE) throw new Error('Set FORMA_PLAYWRIGHT_MODULE to the test-only Playwright module.');
const { chromium } = await import(pathToFileURL(process.env.FORMA_PLAYWRIGHT_MODULE));
const artifacts = path.resolve('artifacts/deletion');
await mkdir(artifacts, { recursive: true });
const app = await createApp({ dataDir: await mkdtemp(path.join(tmpdir(), 'forma-deletion-browser-')) });
await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${app.server.address().port}`;
const { token } = await (await fetch(`${base}/api/status`)).json();
const headers = { 'Content-Type': 'application/json', 'X-Forma-Token': token, Origin: base };
const initial = createSpec();
initial.pages = [createPage(initial, { id: 'related', title: 'Related page', slug: 'related', template: 'about' })];
initial.pages[0].sections.find((section) => section.group === 'hero').href = 'page:home#hero';
const created = await fetch(`${base}/api/projects`, { method: 'POST', headers, body: JSON.stringify({ spec: initial }) });
assert.equal(created.status, 201, await created.clone().text());
const project = await created.json();
const results = [], errors = [];
const ok = (name, condition = true) => { assert.ok(condition, name); results.push(name); console.log(`PASS ${name}`); };
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.FORMA_TEST_BROWSER ? { executablePath: process.env.FORMA_TEST_BROWSER } : {}) });
  const page = await browser.newPage({ viewport: { width: 2000, height: 1100 } });
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('dialog', (dialog) => dialog.accept());
  page.on('request', (request) => { assert.ok(!/typesafe|openrouter/.test(request.url()), 'No live provider request'); });
  await page.addInitScript((id) => { if (window === window.top) localStorage.setItem('forma:last-project', id); }, project.id);
  await page.goto(base);
  const preview = page.frameLocator('#preview-frame');
  await preview.locator('#hero h1').waitFor();
  if (await page.locator('#cookie-accept-button').isVisible()) await page.locator('#cookie-accept-button').click();
  const select = async (sectionId) => {
    await page.locator('[data-inspector-tab="design"]').click();
    await page.locator(`[data-select-section="${sectionId}"]`).click();
    await page.locator('#section-variant').waitFor();
  };
  const row = (ownerId, partKey) => page.locator(`[data-removable-part="${partKey}"][data-part-owner="${ownerId}"]`);
  const removePart = async (ownerId, partKey) => {
    const target = row(ownerId, partKey);
    const details = target.locator('..');
    if (!(await details.getAttribute('open') !== null)) await details.locator(':scope > summary').click();
    await target.locator('[data-delete-selection]').click();
    await row(ownerId, partKey).locator('[data-restore-part]').waitFor({ state: 'attached' });
  };
  const save = async () => {
    await page.locator('#save-button').click();
    await page.waitForFunction(() => document.querySelector('#save-status').textContent === 'Saved locally');
    const response = await fetch(`${base}/api/projects/${project.id}`, { headers });
    assert.equal(response.status, 200); return (await response.json()).spec;
  };

  await select('hero');
  await removePart('hero', 'heading');
  await preview.locator('#hero h1').waitFor({ state: 'hidden' });
  ok('An individual heading is deleted from the rendered section');
  await page.locator('#undo-button').click(); await preview.locator('#hero h1').waitFor();
  await page.locator('#redo-button').click(); await preview.locator('#hero h1').waitFor({ state: 'hidden' });
  await row('hero', 'heading').locator('[data-restore-part]').click(); await preview.locator('#hero h1').waitFor();
  ok('Part deletion supports Undo, Redo and explicit Restore');

  // A text-editing Delete keystroke must not be interpreted as a structure command.
  const headingInput = page.locator('[data-field="sections.1.title"]');
  await headingInput.focus(); await headingInput.press('End'); await headingInput.press('Delete');
  ok('Delete while editing text leaves the selected element intact', await preview.locator('#hero h1').count() === 1);

  await page.locator('.part-choices [data-structure-select]').filter({ hasText: /^Primary action$/ }).click();
  // Native keyboard activation reliably targets controls in a transformed sandboxed iframe.
  await preview.locator('.editor-delete-selection').press('Enter');
  await preview.locator('#hero .site-button').waitFor({ state: 'hidden' });
  ok('Canvas Delete removes the selected button through the validated preview bridge');
  await row('hero', 'action').locator('[data-restore-part]').click(); await preview.locator('#hero .site-button').waitFor();

  await page.locator('.part-choices [data-structure-select]').filter({ hasText: /^Description$/ }).click();
  await page.keyboard.press('Delete'); await preview.locator('#hero .hero-description').waitFor({ state: 'hidden' });
  ok('Delete outside text fields removes exactly the selected inner part', await preview.locator('#hero h1').count() === 1);
  await page.locator('#undo-button').click(); await preview.locator('#hero .hero-description').waitFor();

  // Malformed/stale messages originate in the real iframe, exercising the parent boundary.
  const currentFrame = page.frames().find((candidate) => candidate !== page.mainFrame());
  await currentFrame.evaluate(() => {
    window.addEventListener('message', (event) => {
      if (event.source === parent && event.data?.type === 'forma:editor-state') window.deletionTestState = event.data;
    });
  });
  await page.locator('.part-choices [data-structure-select]').filter({ hasText: /^Description$/ }).click();
  await currentFrame.waitForFunction(() => window.deletionTestState?.selection?.partKey === 'body');
  await currentFrame.evaluate(() => {
    const state = window.deletionTestState;
    const message = { source: 'forma-preview', channel: document.body.dataset.channel, type: 'delete-selection', pageId: state.pageId, changeCounter: state.changeCounter, selection: state.selection, scrollY: 0 };
    for (const patch of [{ changeCounter: -1 }, { pageId: 'related' }, { channel: 'stale' }, { extra: 'unexpected' }, { selection: { ...state.selection, partKey: 'script' } }]) parent.postMessage({ ...message, ...patch }, '*');
    // Same-source round trip ensures the queued deletion attempts have been handled.
    parent.postMessage({ source: 'forma-preview', channel: message.channel, type: 'ready' }, '*');
  });
  await save();
  ok('Stale, wrong-page and malformed preview deletion requests leave content intact', await preview.locator('#hero .hero-description').count() === 1);

  const featureId = initial.sections.find((section) => section.id === 'features').items[0].id;
  await select('features');
  await removePart(featureId, 'icon');
  await preview.locator(`#features [data-item-id="${featureId}"] .feature-icon`).waitFor({ state: 'hidden' });
  ok('Deleting a nested icon removes its SVG and wrapper');
  const featureCount = initial.sections.find((section) => section.id === 'features').items.length;
  await page.locator(`[data-remove-item="features"][data-item-id="${featureId}"]`).click();
  await preview.locator(`#features [data-item-id="${featureId}"]`).waitFor({ state: 'hidden' });
  ok('A whole card can be deleted independently of its section', await preview.locator('#features [data-item-id]').count() === featureCount - 1);
  await page.locator('#undo-button').click(); await preview.locator(`#features [data-item-id="${featureId}"]`).waitFor();

  await page.locator('[data-inspector-tab="design"]').click();
  await page.locator('[data-lock-section="hero"]').click();
  ok('A locked section disables deletion', await page.locator('[data-remove-section="hero"]').isDisabled());
  await page.locator('[data-lock-section="hero"]').click();
  await page.locator('[data-remove-section="hero"]').click(); await preview.locator('#hero').waitFor({ state: 'hidden' });
  let saved = await save();
  const linkedHero = () => saved.pages[0].sections.find((section) => section.group === 'hero');
  ok('Hero is deletable and incoming links retain their page destination', !saved.sections.some((section) => section.group === 'hero') && linkedHero().href === 'page:home');
  assert.deepEqual({ ...saved.pages[0], sections: saved.pages[0].sections.map((section) => section.group === 'hero' ? { ...section, href: 'page:home#hero' } : section) }, initial.pages[0]);
  ok('Deleting a Home section preserves related-page content');
  await page.locator('#undo-button').click(); await preview.locator('#hero').waitFor(); saved = await save();
  ok('Undo restores the section and its incoming links in one step', linkedHero().href === 'page:home#hero');
  await page.locator('#redo-button').click(); await preview.locator('#hero').waitFor({ state: 'hidden' });
  await page.locator('[data-remove-section="navigation"]').click(); await preview.locator('#navigation').waitFor({ state: 'hidden' });
  ok('The entire navigation section can also be deleted');
  saved = await save(); await page.reload(); await preview.locator('#features').waitFor();
  ok('Section and nested-element deletion survive saving and reopening', await preview.locator('#hero, #navigation').count() === 0 && await preview.locator(`#features [data-item-id="${featureId}"] .feature-icon`).count() === 0);
  await page.screenshot({ path: path.join(artifacts, 'deleted-sections-and-parts.png') });

  const exportSite = async () => {
    await page.locator('#export-button').click();
    const pending = page.waitForEvent('download'); await page.locator('#export-confirm').click();
    const download = await pending, filename = path.join(artifacts, 'website.zip'); await download.saveAs(filename);
    const zip = await readFile(filename), files = new Map(); let cursor = 0;
    while (zip.readUInt32LE(cursor) === 0x04034b50) {
      assert.equal(zip.readUInt16LE(cursor + 8), 0);
      const size = zip.readUInt32LE(cursor + 18), nameLength = zip.readUInt16LE(cursor + 26), extraLength = zip.readUInt16LE(cursor + 28);
      const name = zip.subarray(cursor + 30, cursor + 30 + nameLength).toString(), start = cursor + 30 + nameLength + extraLength;
      files.set(name, zip.subarray(start, start + size)); cursor = start + size;
    }
    return files;
  };
  const files = await exportSite();
  const html = files.get('index.html').toString();
  const exported = path.join(artifacts, 'exported.html'); await writeFile(exported, html);
  const visitor = await browser.newPage(); visitor.on('pageerror', (error) => errors.push(error.message));
  await visitor.goto(pathToFileURL(exported).href);
  ok('Standalone HTML omits deleted sections, nested SVG and editor-only controls', await visitor.locator('#hero, #navigation, .editor-delete-selection').count() === 0 && await visitor.locator('#features .feature-card').first().locator('.feature-icon').count() === 0 && !html.includes('data-part-key='));
  await visitor.close();

  await page.locator('[data-inspector-tab="design"]').click();
  for (const section of saved.sections) {
    await page.locator(`[data-remove-section="${section.id}"]`).click();
    await preview.locator(`[data-section="${section.id}"]`).waitFor({ state: 'hidden' });
  }
  saved = await save();
  ok('The last remaining section can be deleted, leaving a valid empty page', saved.sections.length === 0);
  await page.reload(); await preview.locator('.editor-empty-page > [data-add-section="hero"]').waitFor();
  ok('An empty saved page reopens with an Add section control', await page.locator('#add-section-button').isEnabled());
  await page.screenshot({ path: path.join(artifacts, 'empty-page.png') });
  const emptyFiles = await exportSite();
  ok('Empty pages export successfully alongside related pages', JSON.parse(emptyFiles.get('project.json')).sections.length === 0 && emptyFiles.has('related.html') && !emptyFiles.get('index.html').toString().includes('data-add-section='));
  await preview.locator('.editor-empty-page > [data-add-section="hero"]').press('Enter'); await preview.locator('#hero h1').waitFor();
  ok('A new section can be added to an empty page');

  const openInterface = async (block) => {
    const spec = createSpec(); spec.sections = [makeInterfaceSection(block)];
    const response = await fetch(`${base}/api/projects`, { method: 'POST', headers, body: JSON.stringify({ spec }) });
    assert.equal(response.status, 201); const savedProject = await response.json();
    const editor = await browser.newPage({ viewport: { width: 2000, height: 1100 } });
    editor.on('pageerror', (error) => errors.push(error.message));
    editor.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await editor.addInitScript((id) => { if (window !== window.top) return; localStorage.setItem('forma:last-project', id); localStorage.setItem('forma:cookie-consent', 'accepted'); }, savedProject.id);
    await editor.goto(base); const frame = editor.frameLocator('#preview-frame');
    await frame.locator('#hero h1').waitFor();
    await editor.locator('[data-inspector-tab="design"]').click(); await editor.locator('[data-select-section="hero"]').click();
    return { editor, frame, section: savedProject.spec.sections[0] };
  };
  const login = await openInterface('app-login');
  const emailItem = login.section.items.find((item) => item.uiType === 'email');
  const emailRow = login.editor.locator(`[data-removable-part="heading"][data-part-owner="${emailItem.id}"]`);
  await emailRow.locator('..').locator(':scope > summary').click(); await emailRow.locator('[data-delete-selection]').click();
  await login.frame.locator(`[data-item-id="${emailItem.id}"] [data-part-key="heading"]`).waitFor({ state: 'hidden' });
  ok('Deleting a field label preserves its input and accessible name', await login.frame.locator('input[type="email"]').getAttribute('aria-label') === emailItem.title);
  ok('An expanded element list stays open after deletion', await emailRow.locator('[data-restore-part]').isVisible());
  await login.editor.locator(`[data-removable-part="control"][data-part-owner="${emailItem.id}"] [data-delete-selection]`).click();
  await login.frame.locator('input[type="email"]').waitFor({ state: 'hidden' });
  ok('An input control is independently deletable inside an application screen');
  await login.editor.close();

  const chat = await openInterface('app-chat');
  const suggestionId = chat.section.items[0].id;
  const suggestionLabel = chat.frame.locator(`.ui-suggestions [data-part-key="buttonLabel"][data-owner-item-id="${suggestionId}"]`);
  await suggestionLabel.scrollIntoViewIfNeeded();
  // Native pointer event, with coordinates mapped from iframe CSS pixels to its scaled box.
  const inside = await suggestionLabel.evaluate((node) => { const rect = node.getBoundingClientRect(); return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }; });
  const frameBox = await chat.editor.locator('#preview-frame').boundingBox();
  const size = await chat.editor.locator('#preview-frame').evaluate((node) => ({ width: node.clientWidth, height: node.clientHeight }));
  await chat.editor.mouse.click(frameBox.x + inside.x * frameBox.width / size.width, frameBox.y + inside.y * frameBox.height / size.height);
  await chat.editor.waitForFunction((itemId) => [...document.querySelectorAll('.part-choices [aria-pressed="true"]')].some((node) => { const selection = JSON.parse(node.dataset.structureSelect); return selection.itemId === itemId && selection.partKey === 'buttonLabel'; }), suggestionId);
  ok('A mirrored chat suggestion label selects its item, not the screen action');
  await chat.frame.locator('.editor-delete-selection').press('Enter'); await suggestionLabel.waitFor({ state: 'hidden' });
  ok('Deleting a suggestion label preserves the screen send button and suggestion owner', await chat.frame.locator('.ui-composer .button-label').count() === 1 && await chat.frame.locator(`.ui-chat-thread[data-item-id="${suggestionId}"]`).count() === 1);
  await chat.editor.screenshot({ path: path.join(artifacts, 'chat-suggestion-part.png') });
  await chat.editor.close();
  assert.deepEqual(errors, [], 'Observed JavaScript or CSP errors');
  ok('No observed JavaScript or CSP errors');
  await writeFile(path.join(artifacts, 'results.json'), JSON.stringify({ browser: browser.version(), platform: process.platform, provider: 'no live model calls', results, errors }, null, 2));
  console.log(`${results.length} deletion browser checks passed.`);
} finally { await browser?.close(); await app.close(); }
