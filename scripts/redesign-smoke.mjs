/** Optional browser verification. Playwright is test-only, never a runtime dependency.
 * Set FORMA_PLAYWRIGHT_MODULE to playwright/index.mjs and FORMA_TEST_BROWSER to Chromium. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { createApp } from '../server/app.mjs';
import { createSpec, makeSection } from '../shared/content.mjs';
import { CATALOG, THEMES } from '../shared/catalog.mjs';
import { renderDocument } from '../shared/render.mjs';
import { compose } from '../server/composer.mjs';
import { demoEvaluate } from '../server/demo.mjs';

if (!process.env.FORMA_PLAYWRIGHT_MODULE) throw new Error('Set FORMA_PLAYWRIGHT_MODULE to an existing test-only Playwright module.');
const { chromium } = await import(pathToFileURL(process.env.FORMA_PLAYWRIGHT_MODULE));
const artifacts = path.resolve(process.env.FORMA_TEST_ARTIFACTS || 'artifacts/redesign');
await mkdir(artifacts, { recursive: true });
const css = await readFile(new URL('../public/site.css', import.meta.url), 'utf8');
const script = await readFile(new URL('../public/site-runtime.js', import.meta.url), 'utf8');
const scriptHash = createHash('sha256').update(script).digest('base64');
const dataDir = await mkdtemp(path.join(tmpdir(), 'forma-redesign-browser-'));
const app = await createApp({ dataDir }); // Does not load .env or any user's key.
await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${app.server.address().port}`;
let browser;
const results = [], errors = [];
const ok = (name, condition = true) => { assert.ok(condition, name); results.push(name); console.log(`PASS ${name}`); };
const rendered = async (page, spec, width = 1280) => {
  await page.setViewportSize({ width, height: 1000 });
  await page.setContent(renderDocument(spec, { css, script, scriptHash }));
};
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
try {
  browser = await chromium.launch({ headless: true, ...(process.env.FORMA_TEST_BROWSER ? { executablePath: process.env.FORMA_TEST_BROWSER } : {}) });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(base);
  const preview = page.frameLocator('#preview-frame');
  await preview.locator('h1').waitFor();
  ok('Native browser loads modules and sandbox preview');
  await page.locator('#provider-mode').selectOption('demo');
  await page.locator('#operation').selectOption('redesign');
  await page.locator('#prompt').fill('Reimagine this as an expressive editorial studio portfolio. Lead with our work. Dramatic headings, wide layout, generous spacing and landscape images. Keep the copy. No animation.');
  await page.locator('#build-button').click();
  await page.locator('.applied-changes').first().waitFor();
  await page.waitForFunction(() => !document.querySelector('#build-button').disabled);
  ok('Redesign runs through real local HTTP and shows applied changes');
  assert.match(await page.locator('#inspector-content').innerText(), /local|demo/i);
  ok('Offline report is explicitly labeled');
  await page.screenshot({ path: path.join(artifacts, 'editor-redesign-desktop.png') });
  await page.locator('[data-inspector-tab="design"]').click();
  await page.locator('#theme-typeScale').selectOption('quiet');
  await page.waitForFunction(() => document.querySelector('#undo-button').disabled === false);
  await preview.locator('.site[data-type-scale="quiet"]').waitFor();
  await page.locator('#undo-button').click();
  await preview.locator('.site[data-type-scale="dramatic"]').waitFor();
  await page.locator('#redo-button').click();
  await preview.locator('.site[data-type-scale="quiet"]').waitFor();
  ok('Heading-scale inspector changes support undo and redo');
  await page.locator('[data-select-section="gallery"]').click();
  await page.locator('#presentation-gallery-media').selectOption('portrait');
  await preview.locator('[data-section="gallery"][data-media="portrait"]').waitFor();
  ok('Section image proportions round-trip through manual editing and preview');
  await page.locator('#prompt').fill('Headline: "A precise user-supplied replacement"');
  await page.locator('#build-button').click();
  await preview.locator('h1').filter({ hasText: 'A precise user-supplied replacement' }).waitFor();
  await page.locator('.applied-changes').first().waitFor();
  ok('Literal-only edit reports the changed heading without repeating private copy', /Hero heading/.test(await page.locator('.request-result').innerText()) && !(await page.locator('.request-result').innerText()).includes('A precise user-supplied replacement'));
  await page.waitForFunction(() => !document.querySelector('#build-button').disabled);
  await page.locator('#prompt').fill('Move FAQ before gallery.');
  await page.locator('#build-button').click();
  await page.waitForFunction(() => !document.querySelector('#build-button').disabled);
  const groups = await preview.locator('main>section').evaluateAll((sections) => sections.map((section) => section.id));
  ok('Nonadjacent move changes the actual preview order', groups.indexOf('faq') < groups.indexOf('gallery'));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-panel="inspector"]').click();
  ok('Phone editor has no horizontal overflow', !(await overflow(page)));
  await page.screenshot({ path: path.join(artifacts, 'editor-redesign-mobile.png') });

  const site = await browser.newPage();
  site.on('pageerror', (error) => errors.push(error.message));
  const specimen = createSpec();
  specimen.sections.push(makeSection('about')); specimen.sections.sort((a, b) => a.group === 'navigation' || b.group === 'footer' ? -1 : b.group === 'navigation' || a.group === 'footer' ? 1 : 0);
  let measurements = {};
  for (const width of [390, 1280]) {
    for (const scale of ['quiet', 'dramatic']) {
      specimen.theme.typeScale = scale;
      await rendered(site, specimen, width);
      measurements[`${width}-${scale}`] = await site.locator('h1').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      ok(`${scale} hierarchy fits ${width}px`, !(await overflow(site)));
    }
    ok(`Heading hierarchy has a real size difference at ${width}px`, measurements[`${width}-dramatic`] > measurements[`${width}-quiet`]);
  }
  for (const width of ['focused', 'wide']) {
    specimen.theme.width = width; await rendered(site, specimen);
    measurements[width] = await site.locator('.hero-inner').evaluate((el) => el.getBoundingClientRect().width);
  }
  ok('Page width changes actual desktop content geometry', measurements.wide > measurements.focused);
  const gallery = specimen.sections.find((section) => section.group === 'gallery'); gallery.block = 'gallery-grid';
  await rendered(site, specimen);
  const galleryWidth = await site.locator('.site-section.gallery-grid>.site-container').evaluate((el) => el.getBoundingClientRect().width);
  const heroWidth = await site.locator('.hero-inner').evaluate((el) => el.getBoundingClientRect().width);
  ok('Gallery container uses the full page grid rather than a nested half-width grid', Math.abs(galleryWidth - heroWidth) < 1);

  for (const blockId of ['hero-centered', 'hero-editorial', 'about-statement', 'faq-cards', 'contact-simple', 'cta-card', 'cta-band']) {
    const block = CATALOG.find((entry) => entry.id === blockId);
    const sample = createSpec();
    sample.sections = [makeSection('hero'), ...(block.group === 'hero' ? [] : [makeSection(block.group)])];
    const section = sample.sections.find((entry) => entry.group === block.group); section.block = block.id;
    for (const heading of ['start', 'center']) {
      section.presentation.heading = heading;
      for (const width of [390, 1280]) {
        await rendered(site, sample, width);
        const alignment = await site.locator(`.${blockId} :is(h1,h2)`).first().evaluate((el) => getComputedStyle(el).textAlign);
        ok(`${blockId} ${heading} heading works at ${width}px`, alignment === heading && !(await overflow(site)));
      }
    }
  }
  for (const [blockId, itemSelector] of [['features-list', '.feature-card'], ['services-list', '.service-card'], ['process-timeline', 'li'], ['faq-accordion', '.faq-item']]) {
    const block = CATALOG.find((entry) => entry.id === blockId), sample = createSpec();
    sample.sections = [makeSection('hero'), makeSection(block.group, block.id)];
    const section = sample.sections[1]; section.presentation.tone = 'soft';
    for (const surface of ['outlined', 'filled']) {
      section.presentation.surface = surface;
      await rendered(site, sample, 390);
      const appearance = await site.locator(`.${blockId} ${itemSelector}`).first().evaluate((el) => {
        const card = getComputedStyle(el), section = getComputedStyle(el.closest('section'));
        return { border: parseFloat(card.borderTopWidth), borderColor: card.borderTopColor, fill: card.backgroundColor, background: section.backgroundColor };
      });
      ok(`${blockId} ${surface} changes the actual row surface`, surface === 'outlined' ? appearance.border > 0 && appearance.borderColor !== 'rgba(0, 0, 0, 0)' : appearance.fill !== 'rgba(0, 0, 0, 0)' && appearance.fill !== appearance.background);
      assert.equal(await overflow(site), false);
    }
  }
  const rhythm = createSpec();
  for (const spacing of ['compact', 'generous']) {
    rhythm.sections[1].presentation.spacing = spacing; await rendered(site, rhythm, 390);
    measurements[spacing] = await site.locator('.hero-split').evaluate((el) => parseFloat(getComputedStyle(el).paddingTop));
  }
  ok('Local generous spacing exceeds compact spacing on a phone', measurements.generous > measurements.compact);

  for (const block of CATALOG.filter((entry) => ['hero', 'about', 'gallery'].includes(entry.group) && !['hero-centered', 'about-statement'].includes(entry.id))) {
    const section = specimen.sections.find((entry) => entry.group === block.group); section.block = block.id;
    for (const ratio of ['landscape', 'square', 'portrait']) {
      section.presentation.media = ratio;
      for (const width of [390, 1280]) {
        await rendered(site, specimen, width);
        const selector = `.${block.id} .${block.group === 'gallery' ? 'gallery' : block.group === 'about' ? 'about' : 'hero'}-visual`;
        const actual = await site.locator(selector).first().evaluate((el) => { const r = el.getBoundingClientRect(); return r.width / r.height; });
        const expected = ratio === 'square' ? 1 : ratio === 'portrait' ? 0.75 : 16 / 10;
        ok(`${block.id} ${ratio} ratio works at ${width}px`, Math.abs(actual - expected) < .03);
        assert.equal(await overflow(site), false, `${block.id} overflows at ${width}px`);
      }
    }
  }
  for (const palette of Object.keys(THEMES)) {
    specimen.theme.palette = palette;
    for (const section of specimen.sections) section.presentation.tone = 'contrast';
    await rendered(site, specimen, 390);
    const color = await site.locator('.hero-copy h1').evaluate((el) => getComputedStyle(el).color);
    const background = await site.locator('[data-tone="contrast"]').first().evaluate((el) => getComputedStyle(el).backgroundColor);
    ok(`${palette} contrast has distinct foreground/background and no phone overflow`, color !== background && !(await overflow(site)));
  }
  for (const [name, prompt] of [
    ['editorial', 'Editorial studio portfolio, work first, dramatic headings, wide layout, generous spacing.'],
    ['product', 'Clear SaaS product design, benefits first, balanced headings, filled cards.']
  ]) {
    const output = await compose({ operation: 'redesign', mode: 'demo', prompt, spec: createSpec(), locks: {} }, demoEvaluate);
    for (const width of [1280, 390]) {
      await rendered(site, output.spec, width);
      ok(`${name} demonstration has no ${width}px overflow`, !(await overflow(site)));
      await site.screenshot({ path: path.join(artifacts, `${name}-${width}.png`), fullPage: true });
    }
  }
  ok('No observed editor JavaScript or CSP errors', errors.length === 0);
  await writeFile(path.join(artifacts, 'results.json'), JSON.stringify({ transport: 'native Chromium navigation to isolated loopback app', provider: 'offline demonstration only; no JEV calls', browser: browser.version(), platform: process.platform, results, errors }, null, 2));
  console.log(`${results.length} browser checks passed. Artifacts: ${artifacts}`);
} finally {
  await browser?.close(); await app.close();
}
