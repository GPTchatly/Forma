/** Test-only browser integration: no credentials, network providers or user projects. */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createApp } from '../server/app.mjs';

if (!process.env.FORMA_PLAYWRIGHT_MODULE) throw new Error('Set FORMA_PLAYWRIGHT_MODULE to a test-only Playwright module.');
const { chromium } = await import(pathToFileURL(process.env.FORMA_PLAYWRIGHT_MODULE));
const artifacts = path.resolve('artifacts/pages');
await mkdir(artifacts, { recursive: true });
const app = await createApp({ dataDir: await mkdtemp(path.join(tmpdir(), 'forma-pages-browser-')) });
await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${app.server.address().port}`;
const results = [], errors = [];
const ok = (name, value = true) => { assert.ok(value, name); results.push(name); console.log(`PASS ${name}`); };
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.FORMA_TEST_BROWSER ? { executablePath: process.env.FORMA_TEST_BROWSER } : {}) });
  const page = await browser.newPage({ viewport: { width: 2000, height: 1050 } });
  page.setDefaultTimeout(10000);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('dialog', (dialog) => dialog.accept());
  const preview = page.frameLocator('#preview-frame');
  // Native keyboard activation also exercises accessibility and avoids automation's
  // inconsistent pointer coordinates inside transformed sandboxed srcdoc frames.
  const previewClick = async (selector) => {
    const target = preview.locator(selector);
    await target.waitFor(); await target.press('Enter');
  };
  await page.goto(base); await preview.locator('h1').waitFor();
  await preview.locator('body[data-edit-mode="true"]').waitFor();
  ok('Editor loads the sandbox preview in Inspect mode');
  await previewClick('.desktop-nav a[href="#services"]');
  await preview.locator('[data-section="services"][data-selected]').waitFor();
  const servicesTop = await preview.locator('#services').evaluate((node) => node.getBoundingClientRect().top);
  ok('Navigation in Inspect selects and scrolls to its destination', Math.abs(servicesTop) < 100);

  await previewClick('.editor-add-menu > summary');
  await previewClick('[data-add-section="about"]');
  await preview.locator('[data-section="about"][data-selected]').waitFor();
  ok('Navigation + adds a missing section and presents it immediately', await preview.locator('#about').evaluate((node) => { const rect = node.getBoundingClientRect(); return rect.top < innerHeight && rect.bottom > 0 && scrollY > 0; }));
  ok('Added section receives a navigation link', await preview.locator('.desktop-nav a[href="#about"]').count() === 1);

  const addPage = async (template, title, slug, showInNav) => {
    await previewClick('.editor-add-menu > summary');
    await previewClick(`[data-add-page="${template}"]`);
    await page.locator('#page-title-input').fill(title); await page.locator('#page-slug-input').fill(slug);
    await page.locator('#page-nav-input').setChecked(showInNav); await page.locator('#page-submit').click();
    await preview.locator('h1').filter({ hasText: title }).waitFor();
    return page.locator('#page-select').inputValue();
  };
  const blogId = await addPage('blog', 'Blog', 'blog', true);
  ok('Navigation + creates an independent blog index', await preview.locator('.gallery-card').count() === 3);
  const articleId = await addPage('article', 'A considered process', 'our-process', false);
  ok('Article template creates an independent readable page', await preview.locator('.about-statement').count() === 1);
  ok('Hidden article stays out of navigation', await preview.locator(`.desktop-nav a[data-page-id="${articleId}"]:not([data-target-section])`).count() === 0);

  await page.locator('[data-inspector-tab="design"]').click();
  await page.locator('[data-palette="sage"]').click();
  await preview.locator('.site.palette-sage').waitFor();
  await page.locator('[data-lock-setting="palette"]').click();
  await page.locator('#page-select').selectOption('home');
  await preview.locator('.site.palette-porcelain').waitFor();
  ok('Changing a page theme preserves the Home theme');
  await previewClick(`.desktop-nav a[data-page-id="${blogId}"]`);
  await preview.locator('h1').filter({ hasText: 'Blog' }).waitFor();
  ok('A page navigation link opens the related page inside the editor', await page.locator('#page-select').inputValue() === blogId);
  ok('Shared primary contact action keeps its Home destination', await preview.locator('.nav-action a').getAttribute('href') === 'index.html#contact');

  await page.locator('[data-inspector-tab="design"]').click();
  await page.locator('[data-select-section="gallery"]').click();
  await page.locator('[data-link-path="sections.2.items.0.href"]').selectOption(`page:${articleId}`);
  await preview.locator(`.gallery-card-link[data-page-id="${articleId}"]`).waitFor();
  await page.locator('#inspect-button').click();
  await previewClick(`.gallery-card-link[data-page-id="${articleId}"]`);
  await preview.locator('h1').filter({ hasText: 'A considered process' }).waitFor();
  ok('Blog article cards open their linked pages in Interact mode');
  await page.locator('#inspect-button').click();
  await page.locator('[data-inspector-tab="design"]').click();
  ok('Page design locks survive navigation away and back', await page.locator('[data-lock-setting="palette"]').getAttribute('aria-pressed') === 'true');
  await page.locator('#page-settings-button').click();
  await page.locator('#page-slug-input').fill('the-process'); await page.locator('#page-submit').click();
  await page.locator('#page-select').selectOption(blogId);
  await preview.locator('.gallery-card-link[href="the-process.html"]').waitFor();
  ok('Renaming a page address updates existing article links');

  // Synthetic bridge messages still need a valid destination and the current iframe/channel.
  const frame = page.frames().find((candidate) => candidate !== page.mainFrame());
  await frame.evaluate(() => {
    const common = { source: 'forma-preview', channel: document.body.dataset.channel };
    parent.postMessage({ ...common, type: 'navigate-page', pageId: 'missing' }, '*');
    parent.postMessage({ ...common, type: 'add-section', group: 'script' }, '*');
    parent.postMessage({ ...common, channel: 'stale', type: 'add-page', template: 'blog' }, '*');
  });
  await page.locator('#save-button').click();
  await page.waitForFunction(() => document.querySelector('#save-status').textContent === 'Saved locally');
  ok('Unknown targets and stale preview channels cannot navigate or add content', await page.locator('#page-select').inputValue() === blogId && !await page.locator('#page-dialog').isVisible());

  const status = await (await fetch(`${base}/api/status`)).json();
  const headers = { 'X-Forma-Token': status.token };
  const saved = async () => {
    const projectId = await page.evaluate(() => localStorage.getItem('forma:last-project'));
    const response = await fetch(`${base}/api/projects/${projectId}`, { headers }); assert.equal(response.status, 200); return response.json();
  };
  const beforeCompose = (await saved()).spec;
  await page.locator('#page-select').selectOption(articleId);
  await preview.locator('h1').filter({ hasText: 'A considered process' }).waitFor();
  await page.locator('#provider-mode').selectOption('demo'); await page.locator('#operation').selectOption('edit');
  await page.locator('#prompt').fill('Headline: "An edited article"');
  let releaseCompose;
  const gate = new Promise((resolve) => { releaseCompose = resolve; });
  await page.route('**/api/compose', async (route) => { await gate; await route.continue(); });
  const requestStarted = page.waitForRequest('**/api/compose');
  await page.locator('#build-button').click(); await requestStarted;
  ok('Page switching and creation are disabled during composition', await page.locator('#page-select').isDisabled() && await page.locator('#add-page-button').isDisabled());
  releaseCompose();
  await preview.locator('h1').filter({ hasText: 'An edited article' }).waitFor();
  await page.waitForFunction(() => !document.querySelector('#build-button').disabled);
  await page.unroute('**/api/compose');
  const afterCompose = (await saved()).spec;
  assert.deepEqual(afterCompose.sections, beforeCompose.sections);
  assert.deepEqual(afterCompose.pages.find((entry) => entry.id === blogId), beforeCompose.pages.find((entry) => entry.id === blogId));
  ok('Composing one page preserves Home and sibling blog content');

  await page.locator('#page-settings-button').click(); await page.locator('#delete-page-button').click();
  await page.waitForFunction(() => document.querySelector('#page-select').value === 'home');
  ok('Page deletion returns to Home and removes the page', await page.locator('#page-select option').count() === 2);
  await page.locator('#undo-button').click();
  await preview.locator('h1').filter({ hasText: 'An edited article' }).waitFor();
  ok('Undo restores the deleted page and selected page', await page.locator('#page-select').inputValue() === articleId);
  await page.locator('#page-select').selectOption(blogId);
  await preview.locator('.gallery-card-link[href="the-process.html"]').waitFor();
  ok('Undo restores incoming article links');
  await page.locator('#save-button').click();
  await page.waitForFunction(() => document.querySelector('#save-status').textContent === 'Saved locally');
  await page.reload(); await preview.locator('h1').waitFor();
  ok('Reload preserves every page in the saved project', await page.locator('#page-select option').count() === 3);

  const servicesId = await addPage('services', 'Consulting', 'consulting', true);
  ok('Services starter creates a separate page with service, process and contact sections', await preview.locator('#services').count() === 1 && await preview.locator('#process').count() === 1 && await preview.locator('#contact').count() === 1);
  await page.locator('#add-page-button').click();
  const choices = await page.locator('#page-template option').evaluateAll((options) => options.map((option) => option.value));
  ok('Page chooser offers custom, about, services, portfolio, pricing, FAQ, contact, blog and article', ['general', 'about', 'services', 'portfolio', 'pricing', 'faq', 'contact', 'blog', 'article'].every((choice) => choices.includes(choice)));
  await page.locator('#page-title-input').fill('Resources'); await page.locator('#page-slug-input').fill('resources'); await page.locator('#page-submit').click();
  await preview.locator('h1').filter({ hasText: 'Resources' }).waitFor();
  ok('Custom pages start with a minimal independently editable structure', await preview.locator('[data-section]').count() === 3);
  await previewClick('.editor-add-menu > summary'); await previewClick('[data-add-section="features"]');
  await preview.locator('#features[data-selected]').waitFor();
  ok('Custom pages can grow with any catalog section');
  await previewClick(`.desktop-nav a[data-page-id="${servicesId}"]`);
  await preview.locator('h1').filter({ hasText: 'Consulting' }).waitFor();
  ok('Other page types link through the same site navigation');
  await page.locator('#save-button').click();
  await page.waitForFunction(() => document.querySelector('#save-status').textContent === 'Saved locally');

  await page.locator('#page-select').selectOption(blogId);
  await preview.locator('h1').filter({ hasText: 'Blog' }).waitFor();
  await page.locator('#toasts .toast').last().waitFor({ state: 'hidden' });
  await page.screenshot({ path: path.join(artifacts, 'editor-blog-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 }); await page.locator('button[data-panel="canvas"]').click();
  await page.locator('[data-device="mobile"]').click();
  await previewClick('.mobile-nav > summary');
  await previewClick('.mobile-nav a[data-page-id="home"]:not([data-target-section])');
  await preview.locator('h1').filter({ hasText: 'Good ideas' }).waitFor();
  ok('Mobile navigation switches pages without leaving the preview panel', await page.locator('.workspace').getAttribute('data-panel') === 'canvas');
  await previewClick('.mobile-nav > summary');
  await previewClick('.mobile-nav a[href="#about"]');
  await preview.locator('#about[data-selected]').waitFor();
  ok('Mobile section links present the destination and close the menu', await preview.locator('.mobile-nav[open]').count() === 0 && await page.locator('.workspace').getAttribute('data-panel') === 'canvas');
  await previewClick('.editor-add-menu > summary');
  ok('Mobile navigation + dropdown remains available', await preview.locator('[data-add-section="pricing"]').isVisible());
  await page.screenshot({ path: path.join(artifacts, 'editor-nav-mobile.png') });
  await preview.locator('.editor-add-menu > summary').press('Escape');
  ok('Escape closes the add menu', await preview.locator('.editor-add-menu[open]').count() === 0);
  await page.locator('#inspect-button').click();
  ok('Editor-only + controls are hidden in Interact mode', !await preview.locator('.editor-add-menu').isVisible());
  ok('Mobile editor has no document overflow', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));

  await page.setViewportSize({ width: 2000, height: 1050 });
  await page.locator('#export-button').click();
  ok('Export review includes all pages', /5 linked pages/.test(await page.locator('#export-review').innerText()));
  const downloadPromise = page.waitForEvent('download'); await page.locator('#export-confirm').click();
  const download = await downloadPromise, zipPath = path.join(artifacts, 'website.zip'); await download.saveAs(zipPath);
  const zip = await readFile(zipPath), files = new Map(); let cursor = 0;
  while (zip.readUInt32LE(cursor) === 0x04034b50) {
    assert.equal(zip.readUInt16LE(cursor + 8), 0);
    const size = zip.readUInt32LE(cursor + 18), nameLength = zip.readUInt16LE(cursor + 26), extraLength = zip.readUInt16LE(cursor + 28);
    const name = zip.subarray(cursor + 30, cursor + 30 + nameLength).toString();
    const start = cursor + 30 + nameLength + extraLength; files.set(name, zip.subarray(start, start + size)); cursor = start + size;
  }
  const exported = path.join(artifacts, 'exported'); await mkdir(exported, { recursive: true });
  for (const name of ['index.html', 'blog.html', 'the-process.html', 'consulting.html', 'resources.html']) {
    assert.ok(files.has(name)); await writeFile(path.join(exported, name), files.get(name));
    assert.ok(!files.get(name).toString().includes('editor-add-menu">'));
  }
  ok('Export contains all independent HTML pages and excludes editor controls');
  const exportedSite = JSON.parse(files.get('project.json').toString());
  ok('Project JSON keeps the complete page graph', exportedSite.pages.length === 4);
  const visitor = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  visitor.on('pageerror', (error) => errors.push(error.message));
  await visitor.goto(pathToFileURL(path.join(exported, 'index.html')).href);
  await visitor.locator('.desktop-nav a[href="blog.html"]').click(); await visitor.waitForURL('**/blog.html');
  await visitor.locator('.gallery-card-link[href="the-process.html"]').click(); await visitor.waitForURL('**/the-process.html');
  ok('Exported navigation and blog card links work directly from local files', await visitor.locator('h1').innerText() === 'An edited article');
  await visitor.screenshot({ path: path.join(artifacts, 'exported-article.png'), fullPage: true });
  await writeFile(path.join(artifacts, 'results.json'), JSON.stringify({ browser: browser.version(), platform: process.platform, provider: 'offline only; no JEV calls', results, errors }, null, 2));
  assert.deepEqual(errors, [], 'Observed editor JavaScript or CSP errors');
  ok('No observed editor JavaScript or CSP errors');
  await writeFile(path.join(artifacts, 'results.json'), JSON.stringify({ browser: browser.version(), platform: process.platform, provider: 'offline only; no JEV calls', results, errors }, null, 2));
  console.log(`${results.length} page browser checks passed.`);
} finally { await browser?.close(); await app.close(); }
