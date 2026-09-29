/** Test-only real editor integration. Uses isolated data and offline rules, never credentials. */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createApp } from '../server/app.mjs';
import { icon } from '../shared/icons.mjs';

if (!process.env.FORMA_PLAYWRIGHT_MODULE) throw new Error('Set FORMA_PLAYWRIGHT_MODULE to a test-only Playwright module.');
const { chromium } = await import(pathToFileURL(process.env.FORMA_PLAYWRIGHT_MODULE));
const artifacts = path.resolve('artifacts/elements');
await mkdir(artifacts, { recursive: true });
const app = await createApp({ dataDir: await mkdtemp(path.join(tmpdir(), 'forma-elements-browser-')) });
await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${app.server.address().port}`;
const results = [], errors = [];
const ok = (name, value = true) => { assert.ok(value, name); results.push(name); console.log(`PASS ${name}`); };
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.FORMA_TEST_BROWSER ? { executablePath: process.env.FORMA_TEST_BROWSER } : {}) });
  const page = await browser.newPage({ viewport: { width: 2000, height: 1050 } });
  page.setDefaultTimeout(12000);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('dialog', (dialog) => dialog.accept());
  const preview = page.frameLocator('#preview-frame');
  // Native keyboard avoids transformed iframe pointer-coordinate errors in Chromium automation.
  const activate = async (selector) => { await preview.locator(selector).waitFor(); await preview.locator(selector).press('Enter'); };
  const content = async (group) => {
    await page.locator('[data-inspector-tab="design"]').click();
    await page.locator(`[data-select-section="${group}"]`).click();
    await page.locator('#section-variant').waitFor();
  };
  const waitIcon = async (index, name) => {
    const paths = [...icon(name).matchAll(/\sd="([^"]*)"/g)].map((match) => match[1]);
    assert.deepEqual(await preview.locator(`#features [data-item-index="${index}"] .feature-icon svg path`).evaluateAll((nodes) => nodes.map((node) => node.getAttribute('d'))), paths);
  };
  const save = async () => {
    await page.locator('#save-button').click();
    await page.waitForFunction(() => document.querySelector('#save-status').textContent === 'Saved locally');
  };
  await page.goto(base); await preview.locator('h1').waitFor();
  await page.locator('#provider-mode').selectOption('demo');
  await activate('.desktop-nav a[href="#features"]');
  await preview.locator('#features[data-selected]').waitFor();
  await page.locator('[data-inspector-tab="content"]').click();
  await page.locator('#item-icon-features-0').waitFor();
  ok('Navigation selects the destination and exposes its nested element library');
  const originalTitle = await preview.locator('#features [data-item-index="0"] h3').innerText();
  await page.locator('#item-icon-features-0').selectOption('heart');
  await preview.locator('#features .feature-icon svg path[d^="M20.8"]').waitFor();
  await waitIcon(0, 'heart');
  ok('Manual icon choice changes actual SVG paths');
  await page.locator('#undo-button').click();
  await preview.locator('#features [data-item-index="0"] .feature-icon circle').first().waitFor();
  await page.locator('#redo-button').click();
  await preview.locator('#features .feature-icon svg path[d^="M20.8"]').waitFor();
  ok('Undo and redo restore individual icon choices');

  // Turn the item heading into a focusable native link, then activate it in Inspect.
  await content('features');
  await page.locator('[data-link-path="sections.2.items.0.href"]').selectOption('#contact');
  await preview.locator('#features .item-title-link').first().waitFor();
  await activate('#features [data-item-index="0"] .item-title-link');
  await page.locator('[data-select-item="features"][data-item-index="0"][aria-pressed="true"]').waitFor();
  ok('Inspect activation selects a nested item instead of following its link', await preview.locator('#features [data-item-index="0"][data-item-selected]').count() === 1);
  ok('Selecting an item changes New design to focused refinement', await page.locator('#operation').inputValue() === 'edit');
  const build = async (prompt) => {
    await page.locator('#prompt').fill(prompt);
    const response = page.waitForResponse((response) => response.url().endsWith('/api/compose'));
    await page.locator('#build-button').click();
    const result = await response; assert.equal(result.status(), 200, await result.text());
    await page.waitForFunction(() => !document.querySelector('#build-button').disabled);
    await preview.locator('h1').waitFor();
    return result.json();
  };
  const firstEdit = await build('Change this icon to a leaf.');
  await content('features');
  assert.equal(firstEdit.spec.sections.find((section) => section.group === 'features').items[0].icon, 'leaf');
  await waitIcon(0, 'leaf');
  ok('A selected-item request reaches the composer and changes its rendered icon');
  ok('Icon-only refinement preserves other items and copy', firstEdit.spec.sections.find((section) => section.group === 'features').items[1].icon === 'default' && await preview.locator('#features [data-item-index="0"] h3').innerText() === originalTitle);
  ok('Actual-change report includes the affected icon', firstEdit.report.changes.some((change) => /icon/i.test(change.label)));
  await page.locator('[data-select-item="features"][data-item-index="0"]').click();
  const secondEdit = await build('Change this item title to "Thoughtful & precise <work>".');
  await preview.locator('#features h3').filter({ hasText: 'Thoughtful & precise <work>' }).waitFor();
  ok('Exact quoted wording edits the selected item and is rendered as escaped text', await preview.locator('#features work').count() === 0);
  ok('Exact copy is reported without exposing the literal in change details', !JSON.stringify(secondEdit.report.changes).includes('Thoughtful'));

  await content('features');
  await page.locator('#section-variant').selectOption('features-cards');
  await page.locator('#element-features-columns').selectOption('two');
  await page.locator('#element-features-contentAlign').selectOption('center');
  await page.locator('#element-features-iconStyle').selectOption('outlined');
  await page.locator('#element-features-iconSize').selectOption('large');
  await preview.locator('#features[data-element-icon-size="large"]').waitFor();
  const layout = await preview.locator('#features').evaluate((section) => ({
    columns: getComputedStyle(section.querySelector('.feature-grid')).gridTemplateColumns.split(' ').length,
    align: getComputedStyle(section.querySelector('.feature-card')).textAlign,
    width: section.querySelector('.feature-icon').getBoundingClientRect().width
  }));
  ok('Nested layout choices affect computed columns, alignment and icon size', layout.columns === 2 && layout.align === 'center' && layout.width === 56);
  await page.locator('#item-icon-features-1').selectOption('none');
  await preview.locator('#features [data-item-index="1"].no-icon').waitFor();
  ok('No-icon choice removes the SVG and its wrapper', await preview.locator('#features [data-item-index="1"] .feature-icon').count() === 0);

  await content('hero');
  await page.locator('#element-hero-buttonStyle').selectOption('outline');
  await page.locator('#element-hero-buttonIcon').selectOption('mail');
  await page.locator('#element-hero-buttonLabel').selectOption('get-started');
  await page.locator('#element-hero-buttonLabelStyle').selectOption('uppercase');
  await preview.locator('#hero[data-element-button-label-style="uppercase"]').waitFor();
  ok('Button container, glyph, label and text style have independent choices', await preview.locator('#hero .site-button .button-label').innerText() === 'GET STARTED' && await preview.locator('#hero .site-button svg rect').count() === 1);
  await page.locator('[data-field="sections.1.button"]').fill('Book a conversation');
  await preview.locator('#hero .site-button .button-label').filter({ hasText: 'Book a conversation' }).waitFor();
  ok('Custom button wording resets a prepared label without losing the other button choices', await page.locator('#element-hero-buttonLabel').inputValue() === 'default' && await page.locator('#element-hero-buttonIcon').inputValue() === 'mail');
  await page.locator('#element-hero-primaryAction').selectOption('hide');
  await preview.locator('#hero[data-element-primary-action="hide"]').waitFor();
  ok('Action visibility actually removes the action', await preview.locator('#hero .site-button').count() === 0);
  await page.locator('#element-hero-primaryAction').selectOption('show');
  await preview.locator('#hero .site-button').waitFor();
  await save(); await page.reload(); await preview.locator('h1').waitFor();
  await page.locator('#provider-mode').selectOption('demo');
  await content('features');
  ok('Saved nested choices survive reopening the project', await page.locator('#item-icon-features-0').inputValue() === 'leaf' && await page.locator('#element-features-columns').inputValue() === 'two');
  await activate('.desktop-nav a[href="#features"]');
  await page.locator('#toasts .toast').last().waitFor({ state: 'hidden' });
  await page.locator('#inspector-content > details.details-block > summary').first().click();
  await page.locator('.section-presentation > summary').click();
  await page.locator('#inspector-content').evaluate((node) => { node.scrollTop = 0; });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(artifacts, 'editor-elements-desktop.png') });
  await page.locator('[data-device="mobile"]').click();
  await preview.locator('#features .feature-grid').evaluate((grid) => {
    if (getComputedStyle(grid).gridTemplateColumns.split(' ').length !== 1) throw new Error('Mobile grid did not collapse');
  });
  ok('Explicit desktop columns still collapse on mobile');
  await page.screenshot({ path: path.join(artifacts, 'editor-elements-mobile-preview.png') });

  await page.locator('#export-button').click();
  const downloadPromise = page.waitForEvent('download'); await page.locator('#export-confirm').click();
  const download = await downloadPromise, zipPath = path.join(artifacts, 'website.zip'); await download.saveAs(zipPath);
  const zip = await readFile(zipPath), files = new Map(); let cursor = 0;
  while (zip.readUInt32LE(cursor) === 0x04034b50) {
    assert.equal(zip.readUInt16LE(cursor + 8), 0);
    const size = zip.readUInt32LE(cursor + 18), nameLength = zip.readUInt16LE(cursor + 26), extraLength = zip.readUInt16LE(cursor + 28);
    const name = zip.subarray(cursor + 30, cursor + 30 + nameLength).toString(), start = cursor + 30 + nameLength + extraLength;
    files.set(name, zip.subarray(start, start + size)); cursor = start + size;
  }
  const html = files.get('index.html').toString(), exported = path.join(artifacts, 'exported.html'); await writeFile(exported, html);
  const project = JSON.parse(files.get('project.json').toString());
  ok('Exported project retains icon and button-part selections', project.sections.find((section) => section.group === 'features').items[0].icon === 'leaf' && project.sections.find((section) => section.group === 'hero').elements.buttonIcon === 'mail');
  ok('Export excludes editor-only item selection markers', !html.includes('data-item-index='));
  const visitor = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  visitor.on('pageerror', (error) => errors.push(error.message));
  await visitor.goto(pathToFileURL(exported).href);
  ok('Standalone export renders the saved button label and feature copy', /BOOK A CONVERSATION/.test(await visitor.locator('#hero .button-label').innerText()) && (await visitor.locator('#features h3').first().innerText()).includes('Thoughtful & precise <work>'));
  await visitor.locator('#features').scrollIntoViewIfNeeded();
  await visitor.screenshot({ path: path.join(artifacts, 'exported-elements.png') });
  assert.deepEqual(errors, [], 'Observed editor JavaScript or CSP errors');
  ok('No observed JavaScript or CSP errors');
  await writeFile(path.join(artifacts, 'results.json'), JSON.stringify({ browser: browser.version(), platform: process.platform, provider: 'offline rules only; no live JEV calls', results, errors }, null, 2));
  console.log(`${results.length} element browser checks passed.`);
} finally { await browser?.close(); await app.close(); }
