/** Release-gate guard. It is the first file of the test and runtime gates and lives outside
 * the `tests/*.test.mjs` glob, so `npm test` and CI keep their behavior. A gate cannot pass on
 * a machine without a supported Node.js, the pinned zod, working browser tooling, or with
 * hosted Redis credentials in the environment. Nothing here is skipped. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { supportedRuntime, RUNTIME_REQUIREMENT } from '../../server/runtime.mjs';

test('the gate runs on a supported Node.js', () => {
  assert.ok(supportedRuntime(process.versions.node), `The gates need ${RUNTIME_REQUIREMENT}; this process runs Node.js ${process.versions.node}.`);
});

test('the pinned zod dependency is installed', async () => {
  let zod;
  try { zod = await import('zod'); }
  catch (error) { assert.fail(`The pinned zod could not be loaded (${error.code || error.message}). Run npm ci --ignore-scripts before the gate.`); }
  assert.equal(typeof zod.z?.object, 'function', 'The installed zod does not export z.object.');
});

test('browser test tooling loads and launches a headless browser', async () => {
  const entry = process.env.FORMA_PLAYWRIGHT_MODULE;
  assert.ok(entry, 'Set FORMA_PLAYWRIGHT_MODULE to the absolute file path of the entry module of a Playwright Core installation; without it every browser suite skips.');
  let chromium;
  try { ({ chromium } = await import(pathToFileURL(entry))); }
  catch (error) { assert.fail(`FORMA_PLAYWRIGHT_MODULE could not be loaded (${error.message}). It must be the absolute file path of a Playwright Core entry module.`); }
  assert.ok(chromium, 'FORMA_PLAYWRIGHT_MODULE must name a Playwright Core entry module that exports chromium.');
  let browser;
  try { browser = await chromium.launch({ headless: true, ...(process.env.FORMA_TEST_BROWSER ? { executablePath: process.env.FORMA_TEST_BROWSER } : {}) }); }
  catch (error) { assert.fail(`No browser started (${error.message}). Set FORMA_TEST_BROWSER to the absolute file path of an installed Chrome or Chromium executable.`); }
  await browser.close();
});

test('no hosted Redis credential is present in the environment', () => {
  for (const name of ['QWEN3_KV_REST_API_URL', 'QWEN3_KV_REST_API_TOKEN']) assert.equal(process.env[name], undefined, `Unset ${name}: the gates never run against the shared hosted database.`);
});
