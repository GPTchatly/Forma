/** Real browser regression: navigation scroll stays within the sandboxed preview. */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createApp } from '../server/app.mjs';

if (!process.env.FORMA_PLAYWRIGHT_MODULE) throw new Error('Set FORMA_PLAYWRIGHT_MODULE to the test-only Playwright module.');
const { chromium } = await import(pathToFileURL(process.env.FORMA_PLAYWRIGHT_MODULE));
const artifacts = path.resolve('artifacts/navigation-scroll');
await mkdir(artifacts, { recursive: true });
const app = await createApp({ dataDir: await mkdtemp(path.join(tmpdir(), 'forma-navigation-scroll-')) });
await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${app.server.address().port}`;
const results = [], observations = [], errors = [];
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.FORMA_TEST_BROWSER ? { executablePath: process.env.FORMA_TEST_BROWSER } : {}) });
  const page = await browser.newPage({ viewport: { width: 1898, height: 945 } });
  page.setDefaultTimeout(10000);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(() => { if (window === top) localStorage.setItem('forma:cookie-consent', 'accepted'); });
  await page.goto(base);
  const preview = page.frameLocator('#preview-frame');
  await preview.locator('body[data-edit-mode="true"]').waitFor();
  const snapshot = () => page.evaluate(() => {
    const rect = (selector) => { const bounds = document.querySelector(selector).getBoundingClientRect(); return { top: bounds.top, bottom: bounds.bottom, left: bounds.left, right: bounds.right }; };
    return { x: scrollX, y: scrollY, viewport: innerHeight, bodyScroll: document.body.scrollTop, header: rect('.app-header'), workspace: rect('.workspace'), frame: rect('#preview-frame'), shell: document.querySelector('#preview-shell').scrollTop, canvas: document.querySelector('#canvas-area').scrollTop };
  });
  const frameWindow = () => page.frames().find((candidate) => candidate !== page.mainFrame());
  const clickPreview = async (selector) => {
    const target = preview.locator(selector); await target.waitFor();
    const rect = await target.evaluate((node) => { const r = node.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, visible: r.top >= 0 && r.bottom <= innerHeight }; });
    assert.ok(rect.visible, `Pointer target is in the preview viewport: ${selector}`);
    const box = await page.locator('#preview-frame').boundingBox();
    const size = await page.locator('#preview-frame').evaluate((node) => ({ width: node.clientWidth, height: node.clientHeight }));
    await page.mouse.click(box.x + rect.x * box.width / size.width, box.y + rect.y * box.height / size.height);
  };
  const stable = async (name, before) => {
    const after = await snapshot(); observations.push({ name, before, after });
    await writeFile(path.join(artifacts, 'geometry.json'), JSON.stringify(observations, null, 2));
    if (Math.abs(after.header.top) > 1 || after.y !== before.y || Math.abs(after.workspace.bottom - before.workspace.bottom) > 1) await page.screenshot({ path: path.join(artifacts, 'navigation-jump.png') });
    assert.equal(after.x, before.x, `${name}: outer horizontal scroll`);
    assert.equal(after.y, before.y, `${name}: outer vertical scroll`);
    assert.equal(after.bodyScroll, before.bodyScroll, `${name}: body scroll`);
    assert.equal(after.shell, before.shell, `${name}: preview shell scroll`);
    assert.equal(after.canvas, before.canvas, `${name}: canvas scroll`);
    for (const key of ['header', 'workspace', 'frame']) for (const edge of ['top', 'bottom', 'left', 'right']) assert.ok(Math.abs(after[key][edge] - before[key][edge]) <= 1, `${name}: ${key} ${edge} moved`);
    assert.equal(after.header.top, 0, `${name}: header stays at the top`);
    assert.ok(Math.abs(after.workspace.bottom - after.viewport) <= 1, `${name}: workspace fills the viewport`);
    results.push(name); console.log(`PASS ${name}`);
  };
  for (const width of [1898, 1280, 800, 390]) {
    await page.setViewportSize({ width, height: 945 });
    if (width <= 950) await page.locator('.mobile-workspace-nav [data-panel="canvas"]').click();
    await page.locator('[data-device="desktop"]').click();
    for (const inspect of [true, false]) {
      const editing = await preview.locator('body').getAttribute('data-edit-mode') === 'true';
      if (editing !== inspect) await page.locator('#inspect-button').click();
      await frameWindow().evaluate(() => window.scrollTo(0, 0));
      const before = await snapshot();
      await preview.locator('.desktop-nav a[href="#gallery"]').press('Enter');
      // A render/scroll acknowledgement crosses postMessage asynchronously.
      await page.waitForTimeout(150);
      await stable(`${width}px ${inspect ? 'Inspect' : 'Interact'} navigation`, before);
      await preview.locator('#gallery').waitFor();
      assert.ok(Math.abs(await preview.locator('#gallery').evaluate((node) => node.getBoundingClientRect().top)) < 100, 'Navigation reveals its destination');
      // Keyboard navigation exercises a different browser focus/scroll path.
      await frameWindow().evaluate(() => window.scrollTo(0, 0));
      await preview.locator('.desktop-nav a[href="#services"]').press('Enter');
      assert.ok(Math.abs(await preview.locator('#services').evaluate((node) => node.getBoundingClientRect().top)) < 100, 'Keyboard navigation reveals its destination');
      await stable(`${width}px ${inspect ? 'Inspect' : 'Interact'} keyboard navigation`, before);
      await frameWindow().evaluate(() => window.scrollTo(0, 0));
      await clickPreview('.desktop-nav a[href="#gallery"]');
      await page.waitForTimeout(150);
      assert.ok(Math.abs(await preview.locator('#gallery').evaluate((node) => node.getBoundingClientRect().top)) < 100, 'Pointer navigation reveals its destination');
      await stable(`${width}px ${inspect ? 'Inspect' : 'Interact'} pointer navigation`, before);
    }
    const anchored = await snapshot();
    await page.evaluate(() => { window.scrollTo(0, 200); for (const node of [document.body, document.querySelector('#preview-shell'), document.querySelector('#canvas-area')]) node.scrollTop = 200; });
    await stable(`${width}px editor shell rejects accidental programmatic scrolling`, anchored);
    if (width === 1898) await page.screenshot({ path: path.join(artifacts, 'navigation-fixed-desktop.png') });
  }
  await page.screenshot({ path: path.join(artifacts, 'navigation-fixed-mobile-editor.png') });
  await page.setViewportSize({ width: 1280, height: 945 });
  await page.locator('#operation').selectOption('edit');
  if (await preview.locator('body').getAttribute('data-edit-mode') !== 'true') await page.locator('#inspect-button').click();
  const inspectorBefore = await snapshot();
  await page.locator('[data-inspector-tab="design"]').click();
  await page.locator('[data-select-section="hero"]').click();
  await page.locator('.part-choices [data-structure-select]').filter({ hasText: /^Image$/ }).click();
  await preview.locator('.editor-edit-media').filter({ hasText: /^Edit image/ }).press('Enter');
  await page.locator('#selected-media-editor').waitFor();
  await page.waitForFunction(() => document.activeElement?.id === 'selected-media-editor');
  await stable('Image settings reveal only scrolls the inspector', inspectorBefore);
  assert.ok(await page.locator('#inspector-content').evaluate((node) => node.scrollTop > 0), 'Inspector still scrolls normally');
  await page.locator('[data-inspector-tab="design"]').click();
  await page.locator('[data-select-section="features"]').click();
  await page.locator('[data-select-item="features"]').last().click();
  await page.waitForTimeout(100);
  await stable('Nested item selection leaves the editor shell in place', inspectorBefore);

  await page.locator('[data-device="mobile"]').click();
  await frameWindow().evaluate(() => window.scrollTo(0, 0));
  const mobileBefore = await snapshot();
  await preview.locator('.mobile-nav > summary').press('Enter');
  await preview.locator('.mobile-nav a[href="#gallery"]').press('Enter');
  await page.waitForTimeout(100);
  assert.ok(Math.abs(await preview.locator('#gallery').evaluate((node) => node.getBoundingClientRect().top)) < 100, 'Mobile menu reveals destination');
  await stable('Mobile preview navigation stays inside the frame', mobileBefore);
  await page.locator('[data-inspector-tab="design"]').click();
  await page.locator('[data-select-section="footer"]').click();
  await preview.locator('.back-to-top').press('Enter');
  await page.waitForTimeout(100);
  assert.ok(Math.abs(await preview.locator('#hero').evaluate((node) => node.getBoundingClientRect().top)) < 100, 'Back to top reveals Hero');
  await stable('Footer hash navigation stays inside the frame', mobileBefore);
  assert.deepEqual(errors, []);
  await writeFile(path.join(artifacts, 'results.json'), JSON.stringify({ browser: browser.version(), platform: process.platform, results, errors, provider: 'no model calls' }, null, 2));
  console.log(`${results.length} navigation scroll checks passed.`);
} finally { await browser?.close(); await app.close(); }
