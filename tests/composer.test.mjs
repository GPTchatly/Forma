import { PNG_IMAGE } from './fixtures/images.mjs';
/** NEW: Composition tests use explicit synthetic answer fixtures, not live JEV. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpec, makeSection } from '../shared/content.mjs';
import { GROUPS } from '../shared/catalog.mjs';
import { compose, planningQuestions, orderSections, explicitOmissions } from '../server/composer.mjs';
import { demoEvaluate } from '../server/demo.mjs';
import { createJevEvaluator, validateResponse, resolveJevConfig, JEV_ENDPOINT, OPENROUTER_JEV_ENDPOINT, OPENROUTER_DEFAULT_MODEL } from '../server/jev.mjs';
const request = (prompt = 'A warm studio website with services, gallery, FAQ and contact. No pricing.', operation = 'create', mode = 'demo') => ({ mode, operation, prompt, spec: createSpec(), locks: {} });
const fixtures = (overrides = {}) => async (input) => {
  const demo = await demoEvaluate(input);
  return { model: 'jev-fixture-not-live', usage: { input_tokens: 100, output_tokens: 25 }, answers: Object.fromEntries(Object.entries(input.questions).map(([key, q]) => {
    const picked = overrides[key]?.choice ?? demo.answers[key].choice;
    return [key, { type: 'choice', choice: picked, confidence: overrides[key]?.confidence ?? 1, probabilities: Object.fromEntries(Object.keys(q.criteria).map((v) => [v, v === picked ? 1 : 0])) }];
  })) };
};
test('demo mode is explicitly labeled and reports zero API tokens/calls', async () => { const output = await compose(request(), demoEvaluate); assert.equal(output.report.provider, 'demo'); assert.equal(output.report.calls, 0); assert.equal(output.report.inputTokens, 0); assert.ok(output.report.decisions.every((d) => d.confidence === null)); assert.ok(output.warnings[0].includes('not JEV')); });
test('two-stage live path produces actual fixture-selected theme and blocks', async () => { const output = await compose(request('A dark SaaS website with bento features and pricing.', 'create', 'jev'), fixtures()); assert.equal(output.spec.theme.palette, 'midnight'); assert.equal(output.spec.family, 'saas'); assert.equal(output.spec.sections.find((s) => s.group === 'features').block, 'features-bento'); assert.equal(output.report.calls, 2); assert.equal(output.report.inputTokens, 200); });
test('explicit omissions handle comma and conjunction lists', () => { assert.deepEqual([...explicitOmissions('No pricing, no FAQ. No subscriptions or pricing tiers. Remove the gallery and contact.')].sort(), ['contact', 'faq', 'gallery', 'pricing']); assert.equal(explicitOmissions('No changes to pricing.').size, 0); });
test('hard omissions override an inconsistent model inclusion', async () => { const output = await compose(request('A site with no pricing.'), fixtures({ include_pricing: { choice: 'include' } })); assert.ok(!output.spec.sections.some((s) => s.group === 'pricing')); });
test('a new application screen survives an inconsistent Hero omission', async () => { const output = await compose(request('Frontend for ChatGPT clone', 'create', 'jev'), fixtures({ include_hero: { choice: 'omit' } })); assert.deepEqual(output.spec.sections.map((s) => s.block), ['app-chat']); assert.ok(output.warnings.some((w) => w.includes('chosen application screen, so the screen was kept'))); });
test('a new design with no sections is refused instead of saved empty', async () => { const omitted = Object.fromEntries(GROUPS.map((group) => [`include_${group}`, { choice: 'omit' }])); await assert.rejects(compose(request('A bakery website.', 'create', 'jev'), fixtures(omitted)), (error) => error.status === 422 && /no new project was created/.test(error.message)); });
test('an edit to an application screen keeps the screen when every section is omitted', async () => {
  const omitted = Object.fromEntries(GROUPS.map((group) => [`include_${group}`, { choice: 'omit' }]));
  for (const operation of ['edit', 'redesign']) {
    const output = await compose(request('Frontend AI login form', operation, 'jev'), fixtures({ ...omitted, surface: { choice: 'app-login' } }));
    assert.deepEqual(output.spec.sections.map((s) => s.block), ['app-login']);
    assert.ok(output.warnings.some((w) => w.includes('chosen application screen, so the screen was kept')));
  }
});
test('an edit that removes every section is refused unless the prompt names them', async () => {
  const omitted = Object.fromEntries(GROUPS.map((group) => [`include_${group}`, { choice: 'omit' }]));
  for (const operation of ['edit', 'redesign']) await assert.rejects(compose(request('Make it calmer.', operation, 'jev'), fixtures(omitted)), (error) => error.status === 422 && /no changes were applied/.test(error.message));
  const r = request('Remove the hero.', 'edit', 'jev'); r.spec.sections = r.spec.sections.filter((s) => s.group === 'hero');
  assert.deepEqual((await compose(r, fixtures(omitted))).spec.sections, []);
});
test('no-animation instruction overrides a contradictory motion selection', async () => { const output = await compose(request('A calm website. No animation.'), fixtures({ theme_motion: { choice: 'subtle' } })); assert.equal(output.spec.theme.motion, 'none'); });
test('narrow edits preserve unrelated content and section identity', async () => {
  const r = request('Make it dark.', 'edit'); r.spec.sections.find((s) => s.group === 'gallery').items[0].title = 'My own project';
  const before = structuredClone(r.spec); const output = await compose(r, demoEvaluate);
  assert.equal(output.spec.theme.palette, 'midnight'); assert.deepEqual(output.spec.sections, before.sections); assert.equal(output.spec.theme.font, before.theme.font);
});
test('all design locks are enforced outside the model', async () => { const r = request('Make it dark with a monospace font, compact spacing, rounded corners and subtle animation.', 'edit'); r.locks = { style: true, palette: true, font: true, density: true, radius: true, motion: true, typeScale: true, width: true }; const q = planningQuestions(r); assert.ok(!Object.keys(q).some((k) => k.startsWith('theme_'))); const output = await compose(r, demoEvaluate); assert.deepEqual(output.spec.theme, r.spec.theme); });
test('locked section cannot be removed by an explicit omission', async () => { const r = request('Remove the gallery.', 'edit'); const gallery = r.spec.sections.find((s) => s.group === 'gallery'); gallery.locked = true; gallery.items[0].title = 'Retain this'; const output = await compose(r, demoEvaluate); assert.deepEqual(output.spec.sections.find((s) => s.group === 'gallery'), gallery); assert.ok(output.warnings.some((w) => w.includes('locked'))); });
test('literal title and brand survive composition safely', async () => { const output = await compose(request('A studio site. Brand: "Acme" Headline: "Our exact headline"'), demoEvaluate); assert.equal(output.spec.brand.name, 'Acme'); assert.equal(output.spec.sections.find((s) => s.group === 'hero').title, 'Our exact headline'); });
test('reviewed copy survives a redesign request while create starts fresh', async () => { const r = request('A SaaS landing page with a hero and features.', 'redesign'); r.spec.sections[1].title = 'Our reviewed claim'; r.spec.sections[1].draft = false; const output = await compose(r, demoEvaluate); assert.equal(output.spec.sections[1].title, 'Our reviewed claim'); const fresh = await compose(request('A SaaS landing page with a hero and features.', 'create'), demoEvaluate); assert.equal(fresh.freshProject, true); });
test('low-confidence edit preserves the existing design setting', async () => { const r = request('Make it dark.', 'edit', 'jev'); const output = await compose(r, fixtures({ theme_palette: { choice: 'midnight', confidence: 0.1 } })); assert.equal(output.spec.theme.palette, r.spec.theme.palette); assert.ok(output.warnings.some((w) => w.includes('Uncertain'))); });
test('ordering can put gallery before services', async () => { const r = request('Move gallery before services.', 'edit'); const servicesIndex = r.spec.sections.findIndex((s) => s.group === 'services'), galleryIndex = r.spec.sections.findIndex((s) => s.group === 'gallery'); [r.spec.sections[servicesIndex], r.spec.sections[galleryIndex]] = [r.spec.sections[galleryIndex], r.spec.sections[servicesIndex]]; const output = await compose(r, demoEvaluate); assert.ok(output.spec.sections.findIndex((s) => s.group === 'gallery') < output.spec.sections.findIndex((s) => s.group === 'services')); });
test('cyclic ordering decisions retain the original order with warning', () => {
  const sections = [makeSection('hero'), makeSection('features'), makeSection('services'), makeSection('gallery')], warnings = [];
  const before = { choice: 'before', confidence: 1 }, after = { choice: 'after', confidence: 1 };
  const result = orderSections(sections, { order_features_services: before, order_services_gallery: before, order_features_gallery: after }, warnings);
  assert.deepEqual(result, sections); assert.equal(warnings.length, 1);
});
test('provider failure makes no partial edits to the input', async () => { const r = request('A modern site', 'create', 'jev'), before = structuredClone(r); let count = 0; await assert.rejects(compose(r, async (input) => { if (++count === 2) throw new Error('Second pass failed'); return fixtures()(input); })); assert.deepEqual(r, before); });
test('unsupported requested scope is reported rather than fabricated', async () => { await assert.rejects(compose(request('Build a backend server only'), fixtures({ scope: { choice: 'unsupported' } })), /Describe a website or frontend interface/); const mixed = await compose(request('Build a working dashboard with a database'), demoEvaluate); assert.ok(mixed.warnings.some((w) => w.includes('backend connections'))); });
test('state excludes uploaded image bytes and public contact email', async () => { const r = request('A studio site', 'create', 'jev'); r.spec.sections[1].image = PNG_IMAGE; r.spec.brand.email = 'private@example.com'; const seen = []; await compose(r, async (input) => { seen.push(JSON.stringify(input.state)); return fixtures()(input); }); assert.ok(seen.every((s) => !s.includes('base64') && !s.includes('private@example.com'))); });
const questions = { theme: { type: 'choice', instructions: 'Choose a theme.', criteria: { light: 'Light theme', dark: 'Dark theme' } } };
const validResponse = { model: 'jev-1.13.0', usage: { input_tokens: 10, output_tokens: 5 }, answers: { theme: { type: 'choice', choice: 'light', confidence: .8, probabilities: { light: .9, dark: .1 } } } };
test('real adapter sends exact fixed endpoint, Bearer header and System One shape', async () => {
  let captured;
  const evaluate = createJevEvaluator({ apiKey: 'test-key', fetchImpl: async (url, init) => { captured = { url, init }; return new Response(JSON.stringify(validResponse)); } });
  const result = await evaluate({ state: 'Design a site.', questions });
  assert.equal(captured.url, JEV_ENDPOINT); assert.equal(captured.init.redirect, 'error'); assert.equal(captured.init.headers.Authorization, 'Bearer test-key'); assert.deepEqual(JSON.parse(captured.init.body), { state: 'Design a site.', questions, model: 'jev-1.13.0' }); assert.equal(result.answers.theme.choice, 'light');
});
test('OpenRouter API key routes to fixed OpenRouter endpoint with ~typesafe/jev-latest', async () => {
  let captured;
  const openRouterResponse = { id: 'gen-123', model: 'typesafe/jev-1.13-20260917', provider: 'TypeSafe', usage: { input_tokens: 10, output_tokens: 5, cost: 0.00018 }, answers: validResponse.answers };
  const evaluate = createJevEvaluator({ apiKey: 'sk-or-v1-test-key', fetchImpl: async (url, init) => { captured = { url, init }; return new Response(JSON.stringify(openRouterResponse)); } });
  const result = await evaluate({ state: 'Design a site.', questions });
  assert.equal(captured.url, OPENROUTER_JEV_ENDPOINT); assert.equal(captured.init.redirect, 'error'); assert.equal(captured.init.headers.Authorization, 'Bearer sk-or-v1-test-key'); assert.deepEqual(JSON.parse(captured.init.body), { state: 'Design a site.', questions, model: OPENROUTER_DEFAULT_MODEL }); assert.equal(result.model, 'typesafe/jev-1.13-20260917'); assert.equal(result.answers.theme.choice, 'light');
});
test('OpenRouter model identifiers (~typesafe/jev-latest and typesafe/jev-1.13) and provider options resolve accurately', () => {
  assert.deepEqual(resolveJevConfig({ apiKey: 'custom-key', model: '~typesafe/jev-latest' }), { provider: 'openrouter', providerLabel: 'OpenRouter', endpoint: OPENROUTER_JEV_ENDPOINT, model: '~typesafe/jev-latest' });
  assert.deepEqual(resolveJevConfig({ apiKey: 'sk-or-v1-abc', model: 'typesafe/jev-1.13' }), { provider: 'openrouter', providerLabel: 'OpenRouter', endpoint: OPENROUTER_JEV_ENDPOINT, model: 'typesafe/jev-1.13' });
  assert.deepEqual(resolveJevConfig({ apiKey: 'or-env-key', provider: 'openrouter' }), { provider: 'openrouter', providerLabel: 'OpenRouter', endpoint: OPENROUTER_JEV_ENDPOINT, model: '~typesafe/jev-latest' });
  assert.throws(() => resolveJevConfig({ apiKey: 'key', model: 'openai/gpt-5' }));
  assert.throws(() => resolveJevConfig({ apiKey: 'key', provider: 'evil' }));
});
test('real provider requires credentials and validates model id', () => { assert.throws(() => createJevEvaluator({ apiKey: '' }), /API key/); assert.throws(() => createJevEvaluator({ apiKey: 'key', model: 'https://evil.example' })); });
test('real adapter does not echo provider error bodies', async () => { const evaluate = createJevEvaluator({ apiKey: 'super-secret', fetchImpl: async () => new Response('super-secret <script>bad</script>', { status: 401 }) }); await assert.rejects(evaluate({ state: 'x', questions }), (error) => !error.message.includes('super-secret') && !error.message.includes('<script>') && error.message.includes('API key')); });
test('real adapter handles rate limiting without silently switching to demo', async () => { const evaluate = createJevEvaluator({ apiKey: 'key', fetchImpl: async () => new Response('', { status: 429 }) }); await assert.rejects(evaluate({ state: 'x', questions }), (error) => error.status === 429); });
test('real adapter reports non-JSON responses', async () => { const evaluate = createJevEvaluator({ apiKey: 'key', fetchImpl: async () => new Response('<html>bad gateway</html>') }); await assert.rejects(evaluate({ state: 'x', questions }), /unreadable JSON/); });
test('adapter rejects unknown choices, missing answers, invalid probabilities and usage', () => {
  for (const change of [(r) => { r.answers.theme.choice = 'evil'; }, (r) => { delete r.answers.theme; }, (r) => { r.answers.theme.probabilities.light = 5; }, (r) => { r.answers.theme.probabilities.extra = .1; }, (r) => { r.usage.input_tokens = -1; }, (r) => { r.answers.theme.confidence = NaN; }, (r) => { r.answers.theme.probabilities.dark = .5; }]) { const response = structuredClone(validResponse); change(response); assert.throws(() => validateResponse(response, questions)); }
});
test('cancellation is propagated through the adapter', async () => {
  const controller = new AbortController(); controller.abort();
  const evaluate = createJevEvaluator({ apiKey: 'key', fetchImpl: async (_url, init) => { init.signal.throwIfAborted(); return new Response(); } });
  await assert.rejects(evaluate({ state: 'x', questions, signal: controller.signal }), /cancelled or timed out/);
});
