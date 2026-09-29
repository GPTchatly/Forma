// Test-only browser regression. No provider credentials or live requests.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createApp } from '../server/app.mjs';
import { translate, SUPPORTED_LOCALES } from '../public/i18n.mjs';

if (!process.env.FORMA_PLAYWRIGHT_MODULE) throw new Error('Set FORMA_PLAYWRIGHT_MODULE to a test-only Playwright module.');
const { chromium } = await import(pathToFileURL(process.env.FORMA_PLAYWRIGHT_MODULE));
const artifacts = path.resolve('artifacts/i18n');
await mkdir(artifacts, { recursive: true });
const app = await createApp({ dataDir: await mkdtemp(path.join(tmpdir(), 'forma-i18n-browser-')), fetchImpl: () => { throw new Error('Unexpected provider request'); } });
await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${app.server.address().port}`;
const results = [], errors = [], mutations = [];
const ok = (name, value = true) => { assert.ok(value, name); results.push(name); console.log(`PASS ${name}`); };
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.FORMA_TEST_BROWSER ? { executablePath: process.env.FORMA_TEST_BROWSER } : {}) });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, locale: 'fi-FI' });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', (request) => { if (request.method() !== 'GET' && /\/api\/(?:compose|connection|projects)/.test(request.url())) mutations.push(request.url()); });
  await page.goto(base);
  const frame = page.frameLocator('#preview-frame');
  await frame.locator('h1').waitFor();
  ok('First visit follows a supported regional browser language', await page.locator('html').getAttribute('lang') === 'fi');
  const originalHeading = await frame.locator('h1').textContent();
  const originalSource = await page.locator('#source-code').textContent();
  const metadata = {
    title: await page.locator('head title').getAttribute('data-i18n'),
    description: await page.locator('meta[name="description"]').getAttribute('data-i18n-content'),
    keywords: await page.locator('meta[name="keywords"]').getAttribute('data-i18n-content')
  };
  const noScript = await browser.newContext({ javaScriptEnabled: false });
  const plain = await noScript.newPage(); await plain.goto(base);
  ok('Accurate English metadata is present in the original HTML without JavaScript', await plain.title() === metadata.title && await plain.locator('meta[name="description"]').getAttribute('content') === metadata.description && await plain.locator('meta[name="keywords"]').getAttribute('content') === metadata.keywords);
  await noScript.close();

  const prompt = 'Keep this exact prompt: Save · Привет · {name}';
  await page.locator('#prompt').fill(prompt);
  const brand = 'Preview'; // A translation key used as literal, unsaved brand text.
  await page.locator('#brand-input').evaluate((node, value) => { node.value = value; }, brand);
  for (const locale of Object.keys(SUPPORTED_LOCALES)) {
    await page.locator('#app-language').selectOption(locale);
    ok(`${locale}: document language and export label`, await page.locator('html').getAttribute('lang') === locale && (await page.locator('#export-button').innerText()).trim() === translate('Export site', {}, locale));
    ok(`${locale}: prompt, brand and website are unchanged`, await page.locator('#prompt').inputValue() === prompt && await page.locator('#brand-input').inputValue() === brand && await frame.locator('h1').textContent() === originalHeading && await page.locator('#source-code').textContent() === originalSource);
    ok(`${locale}: title, description and keywords follow the selected language`, await page.title() === translate(metadata.title, {}, locale) && await page.locator('meta[name="description"]').getAttribute('content') === translate(metadata.description, {}, locale) && await page.locator('meta[name="keywords"]').getAttribute('content') === translate(metadata.keywords, {}, locale));
    await page.locator('#help-button').focus(); await page.keyboard.press('Enter');
    const help = page.locator('#help-dialog');
    ok(`${locale}: round help button opens an accessible dialog by keyboard`, await help.isVisible() && await help.getAttribute('aria-labelledby') === 'help-title' && await page.evaluate(() => document.querySelector('#help-dialog').contains(document.activeElement)));
    const entries = await help.locator('.help-question').evaluateAll((nodes) => nodes.map((node) => [...node.querySelectorAll('[data-i18n]')].map((child) => ({ key: child.dataset.i18n, text: child.textContent }))));
    ok(`${locale}: all 15 FAQ questions and answers are translated`, entries.length === 15 && entries.every((entry) => entry.length === 2 && entry.every(({ key, text }) => text === translate(key, {}, locale))));
    await help.locator('#help-question-1>summary').press('Enter');
    ok(`${locale}: FAQ answers expand using the keyboard`, await help.locator('#help-question-1').getAttribute('open') !== null);
    if (locale === 'de') await page.screenshot({ path: path.join(artifacts, 'faq-german-desktop.png'), fullPage: true });
    await page.keyboard.press('Escape');
    ok(`${locale}: Escape closes help and returns focus to its button`, !await help.isVisible() && await page.locator('#help-button').evaluate((node) => node === document.activeElement));
    await page.locator('#help-question-1').evaluate((node) => { node.open = false; });
    await page.locator('[data-inspector-tab="content"]').click();
    ok(`${locale}: inspector labels localized`, await page.locator('#inspector-content').getByText(translate('Brand & site settings', {}, locale), { exact: true }).count() === 1);
    await page.locator('[data-inspector-tab="design"]').click();
    await frame.locator('.editor-selection-tools').waitFor({ state: 'attached' });
    ok(`${locale}: preview editor toolbar translated`, await frame.locator('.editor-selection-tools').getAttribute('aria-label') === translate('Arrange selected content', {}, locale) && await frame.locator('.editor-selection-tools').getAttribute('lang') === locale && await frame.locator('html').getAttribute('lang') === 'en');
  }
  await page.locator('[data-inspector-tab="content"]').click();
  await page.locator('#field-brand-email').evaluate((node) => { node.value = 'draft@example.test'; });
  await page.locator('#app-language').selectOption('sv');
  ok('Pending inspector fields survive rerendering without committing', await page.locator('#field-brand-email').inputValue() === 'draft@example.test' && await page.locator('#source-code').textContent() === originalSource);
  ok('Language switching does not save projects or contact a model', mutations.length === 0);
  await page.reload(); await frame.locator('h1').waitFor();
  ok('Saved language wins over browser language after reload', await page.locator('html').getAttribute('lang') === 'sv');
  await page.locator('#add-page-button').click();
  await page.locator('#page-title-input').fill('Save {name}');
  await page.locator('#page-slug-input').fill('preserved-address');
  // Select through the module while modal focus is trapped; it uses the same public change handler.
  await page.locator('#app-language').evaluate((node) => { node.value = 'de'; node.dispatchEvent(new Event('change', { bubbles: true })); });
  ok('Open page dialog retains unsaved fields and remains open', await page.locator('#page-dialog').evaluate((node) => node.open) && await page.locator('#page-title-input').inputValue() === 'Save {name}' && await page.locator('#page-slug-input').inputValue() === 'preserved-address');
  await page.locator('#page-dialog [data-close="page-dialog"]').first().click();
  await page.screenshot({ path: path.join(artifacts, 'editor-german-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const locale of Object.keys(SUPPORTED_LOCALES)) {
    await page.locator('#app-language').selectOption(locale);
    ok(`${locale}: interface fits a narrow viewport`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.locator('#help-button').click();
    ok(`${locale}: FAQ dialog fits a narrow viewport`, await page.locator('#help-dialog').evaluate((node) => { const rect = node.getBoundingClientRect(); return rect.left >= 0 && rect.right <= innerWidth && rect.height <= innerHeight && node.scrollWidth <= node.clientWidth; }));
    await page.locator('#help-dialog [data-close="help-dialog"]').click();

  }
  await page.locator('#app-language').selectOption('ru');
  ok('Language selector remains visible on mobile', await page.locator('#app-language').isVisible());
  await page.screenshot({ path: path.join(artifacts, 'editor-russian-mobile.png'), fullPage: true });
  const fab = await page.locator('#help-button').evaluate((node) => { const rect = node.getBoundingClientRect(); return { width: rect.width, height: rect.height, left: rect.left, bottom: innerHeight - rect.bottom, radius: getComputedStyle(node).borderRadius }; });
  ok('Floating help button stays round, touch-sized and in the bottom-left corner', fab.width === fab.height && fab.width >= 44 && fab.left >= 0 && fab.left <= 24 && fab.bottom >= 0 && fab.bottom <= 24 && fab.radius === '50%');
  await page.locator('#help-button').click();
  await page.locator('#help-question-1>summary').click();
  for (let i = 0; i < 18; i++) await page.keyboard.press('Tab');
  ok('Keyboard focus remains inside the open help dialog', await page.evaluate(() => document.querySelector('#help-dialog').contains(document.activeElement)));
  await page.locator('#app-language').evaluate((node) => { node.value = 'de'; node.dispatchEvent(new Event('change', { bubbles: true })); });
  ok('Language changes preserve an open FAQ and its expanded answer', await page.locator('#help-dialog').isVisible() && await page.locator('#help-question-1').getAttribute('open') !== null && await page.locator('#help-question-1>summary').textContent() === translate('What does JEV actually do?', {}, 'de'));
  await page.locator('#app-language').evaluate((node) => { node.value = 'ru'; node.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.locator('#help-dialog').evaluate((node) => { node.scrollTop = 0; });
  await page.screenshot({ path: path.join(artifacts, 'faq-russian-mobile.png'), fullPage: true });
  await page.locator('#help-dialog [data-close="help-dialog"]').click();
  ok('Help and metadata changes leave the website and saved projects unchanged', mutations.length === 0 && await page.locator('#source-code').textContent() === originalSource);
  ok('No browser JavaScript or CSP errors', errors.length === 0);
  await writeFile(path.join(artifacts, 'results.json'), JSON.stringify({ results, errors, liveProviderCalls: 0, environment: { platform: process.platform, node: process.version, browser: browser.version() } }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ errors, message: error.message }));
  throw error;
} finally {
  await browser?.close();
  await new Promise((resolve) => app.server.close(resolve));
}
