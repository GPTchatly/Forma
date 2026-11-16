import { PNG_IMAGE, SECOND_PNG_IMAGE } from './fixtures/images.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { GROUPS } from '../shared/catalog.mjs';
import { JOURNEYS } from '../shared/design.mjs';
import { createSpec, makeSection } from '../shared/content.mjs';
import { validateSpec } from '../shared/schema.mjs';
import { compose, MAX_COMPOSITION_QUESTIONS } from '../server/composer.mjs';
import { demoEvaluate } from '../server/demo.mjs';

const request = (prompt, operation = 'redesign') => ({ prompt, operation, mode: 'jev', spec: createSpec(), locks: {} });
// Every answer below is synthetic. No transport fixture is a live-model quality test.
const fixture = (overrides = {}, observe = () => {}) => async (input) => {
  observe(input);
  const demo = await demoEvaluate(input);
  return { ...demo, model: 'synthetic-redesign-fixture', usage: { input_tokens: 13, output_tokens: 7 }, answers: Object.fromEntries(Object.entries(input.questions).map(([key, question]) => {
    const selected = overrides[key]?.choice ?? demo.answers[key].choice;
    return [key, { type: 'choice', choice: selected, confidence: overrides[key]?.confidence ?? 1, probabilities: Object.fromEntries(Object.keys(question.criteria).map((candidate) => [candidate, candidate === selected ? 1 : 0])) }];
  })) };
};
const contentOnly = ({ block, presentation, ...section }) => section;

test('broad redesign changes composition while retaining all supplied and draft content', async () => {
  const r = request('Create an expressive, dramatic, work-first redesign.');
  r.spec.brief = 'The original saved creation brief';
  r.spec.family = 'wellness';
  for (const [index, section] of r.spec.sections.entries()) {
    section.id = `custom-${section.group}`;
    section.title = `My existing heading ${index}`;
    section.body = `A private body to preserve ${index}`;
    section.draft = index % 2 === 0;
    if (section.items.length) section.items[0].image = PNG_IMAGE;
  }
  const before = validateSpec(r.spec), output = await compose(r, fixture());
  assert.equal(output.spec.brief, before.brief);
  assert.deepEqual(output.spec.brand, before.brand);
  assert.equal(output.spec.family, 'wellness');
  assert.deepEqual(output.spec.sections.map((s) => s.group).sort(), before.sections.map((s) => s.group).sort());
  for (const section of output.spec.sections) assert.deepEqual(contentOnly(section), contentOnly(before.sections.find((s) => s.group === section.group)));
  assert.equal(output.spec.theme.typeScale, 'dramatic');
  assert.equal(output.spec.theme.width, 'wide');
  assert.equal(output.spec.sections.find((s) => s.group === 'hero').block, 'hero-editorial');
  assert.equal(output.spec.sections.find((s) => s.group === 'features').presentation.surface, 'outlined');
  assert.ok(output.report.changes.length > 6);
  assert.equal(output.report.strategy.direction, 'expressive');
  assert.equal(output.report.strategy.journey, 'showcase');
  assert.equal(output.report.strategy.operation, 'redesign');
  assert.equal(output.report.calls, 2);
  assert.equal(output.report.inputTokens, 26);
  assert.equal(output.report.outputTokens, 14);
});

test('a palette refinement does not restyle components, local presentation or journey', async () => {
  const r = request('Make it dark.', 'edit'), before = validateSpec(r.spec);
  const output = await compose(r, fixture());
  assert.equal(output.spec.theme.palette, 'midnight');
  assert.deepEqual(output.spec.sections, before.sections);
  assert.deepEqual(output.report.changes, [{ target: 'theme.palette', label: 'Palette', before: before.theme.palette, after: 'midnight' }]);
  assert.equal(output.report.strategy.journey, 'keep');
});

test('journey recipes order the present content without adding sections or querying all pairs', async () => {
  const r = request('Use an editorial showcase.');
  const questions = [];
  const output = await compose(r, fixture({}, (input) => questions.push(input.questions)));
  const body = output.spec.sections.filter((s) => JOURNEYS.showcase.order.includes(s.group));
  assert.deepEqual(body.map((s) => s.group), JOURNEYS.showcase.order.filter((group) => r.spec.sections.some((s) => s.group === group)));
  assert.ok(!Object.keys(questions[1]).some((key) => key.startsWith('order_')));
});

test('journey recipes preserve locked body slots and every field in locked sections', async () => {
  const r = request('Make an expressive showcase. Remove the gallery.');
  const gallery = r.spec.sections.find((s) => s.group === 'gallery');
  gallery.locked = true;
  const slot = r.spec.sections.indexOf(gallery), before = validateSpec(r.spec);
  const output = await compose(r, fixture());
  assert.deepEqual(output.spec.sections[slot], before.sections[slot]);
  assert.ok(output.warnings.some((warning) => warning.includes('locked')));
});

test('fully locked redesign remains an actual no-op, including width and scale', async () => {
  const r = request('Make everything bold, dark, wide and dramatic.');
  r.locks = { palette: true, font: true, density: true, radius: true, motion: true, typeScale: true, width: true };
  for (const section of r.spec.sections) section.locked = true;
  const output = await compose(r, fixture());
  assert.deepEqual(output.spec, validateSpec(r.spec));
  assert.deepEqual(output.report.changes, []);
  assert.equal(output.report.calls, 1);
});

test('choosing current design values produces no invented changes in the report', async () => {
  const r = request('Keep the current design.', 'edit');
  const output = await compose(r, fixture({ theme_palette: { choice: r.spec.theme.palette }, block_hero: { choice: r.spec.sections.find((s) => s.group === 'hero').block }, presentation_hero_tone: { choice: 'default' } }));
  assert.deepEqual(output.spec, validateSpec(r.spec));
  assert.deepEqual(output.report.changes, []);
  assert.ok(output.report.decisions.some((decision) => decision.key === 'theme_palette' && decision.choice !== 'keep'));
});

test('redesign accepts explicit quoted copy while keeping original brief and locked hero copy', async () => {
  const r = request('Editorial redesign. Brand: "New brand" Headline: "An explicitly supplied headline"');
  r.spec.brief = 'Original intent';
  const output = await compose(r, fixture());
  assert.equal(output.spec.brief, 'Original intent');
  assert.equal(output.spec.brand.name, 'New brand');
  assert.equal(output.spec.sections.find((s) => s.group === 'hero').title, 'An explicitly supplied headline');
  r.spec.sections.find((s) => s.group === 'hero').locked = true;
  const locked = await compose(r, fixture());
  assert.deepEqual(locked.spec.sections.find((s) => s.group === 'hero'), validateSpec(r.spec).sections.find((s) => s.group === 'hero'));
  const report = JSON.stringify(output.report.changes);
  assert.ok(!report.includes('An explicitly supplied headline') && !report.includes('New brand'));
});

test('literal-only refinements report actual content changes without exposing the wording', async () => {
  const r = request('Brand: "Confidential name" Headline: "Confidential heading" Tagline: "Confidential tagline" Button: "Confidential action"', 'edit');
  const output = await compose(r, fixture());
  assert.deepEqual(output.report.changes.map((change) => change.label).sort(), ['Brand name', 'Hero heading', 'Primary action text', 'Tagline'].sort());
  assert.ok(output.report.changes.every((change) => change.before === 'Previous wording' && change.after === 'Updated wording'));
  assert.ok(!JSON.stringify(output.report.changes).includes('Confidential'));
  const unchanged = await compose({ ...r, spec: output.spec }, fixture());
  assert.deepEqual(unchanged.report.changes, []);
});

test('nonadjacent explicit demo moves produce a consistent order without cycles', async () => {
  for (const prompt of ['Move FAQ before gallery.', 'Put the FAQ above the gallery.']) {
    const r = request(prompt, 'edit'); r.mode = 'demo';
    const before = r.spec.sections.map((section) => section.group);
    const output = await compose(r, demoEvaluate), after = output.spec.sections.map((section) => section.group);
    const expected = before.filter((group) => group !== 'faq'); expected.splice(expected.indexOf('gallery'), 0, 'faq');
    assert.deepEqual(after, expected);
    assert.ok(!output.warnings.some((warning) => /ordering choices conflicted/.test(warning)));
  }
});

test('an explicit move blocked by a locked body slot retains the slot and explains the constraint', async () => {
  const r = request('Move FAQ before features.', 'edit'); r.mode = 'demo';
  const features = r.spec.sections.find((section) => section.group === 'features'); features.locked = true;
  const slot = r.spec.sections.indexOf(features);
  const output = await compose(r, demoEvaluate);
  assert.deepEqual(output.spec.sections[slot], validateSpec(r.spec).sections[slot]);
  assert.ok(output.warnings.some((warning) => /locked|lock/i.test(warning)));
});

test('low-confidence redesign choices preserve globals, local treatments, components and journey', async () => {
  const r = request('Redesign the existing page.');
  const output = await compose(r, async (input) => {
    const response = await fixture({ direction: { choice: 'expressive' }, journey: { choice: 'showcase' }, theme_width: { choice: 'wide' }, theme_typeScale: { choice: 'dramatic' }, block_hero: { choice: 'hero-editorial' }, presentation_hero_tone: { choice: 'contrast' } })(input);
    for (const answer of Object.values(response.answers)) answer.confidence = 0.1;
    return response;
  });
  assert.deepEqual(output.spec, validateSpec(r.spec));
  assert.deepEqual(output.report.changes, []);
  assert.equal(output.report.strategy.direction, 'keep');
  assert.equal(output.report.strategy.journey, 'keep');
  assert.ok(output.warnings.some((warning) => warning.includes('low distribution confidence')));
});

test('uploaded hero and about images cannot be hidden by a newly selected text-only component', async () => {
  const r = request('A quiet understated redesign with centered hero and short about statement.');
  r.spec.sections.splice(3, 0, makeSection('about'));
  for (const section of r.spec.sections.filter((s) => ['hero', 'about'].includes(s.group))) section.image = PNG_IMAGE;
  const output = await compose(r, fixture({}, ({ questions }) => {
    if (questions.block_hero) assert.ok(!Object.hasOwn(questions.block_hero.criteria, 'hero-centered'));
    if (questions.block_about) assert.ok(!Object.hasOwn(questions.block_about.criteria, 'about-statement'));
  }));
  assert.equal(output.spec.sections.find((s) => s.group === 'hero').block, 'hero-split');
  assert.equal(output.spec.sections.find((s) => s.group === 'about').block, 'about-split');
  assert.equal(output.warnings.filter((warning) => warning.includes('hide that image')).length, 2);
});

test('media treatment is not reported as changed when the chosen block does not render media', async () => {
  const output = await compose(request('A product redesign.'), fixture({ block_hero: { choice: 'hero-centered' }, presentation_hero_media: { choice: 'portrait' } }));
  assert.equal(output.spec.sections.find((s) => s.group === 'hero').presentation.media, 'default');
  assert.ok(!output.report.changes.some((change) => change.target === 'sections.hero.presentation.media'));
  assert.ok(output.warnings.some((warning) => warning.includes('text-only')));
});

test('content-shape context excludes full bodies, item text, destinations and image payloads', async () => {
  const r = request('Make a coherent expressive redesign.');
  r.spec.brand.email = 'excluded-contact@example.com';
  r.spec.brand.href = 'https://private.example/brand-secret';
  const hero = r.spec.sections.find((s) => s.group === 'hero');
  hero.body = 'NEVER-SEND-THIS-FULL-BODY'; hero.href = 'https://private.example/section-secret'; hero.image = PNG_IMAGE;
  const gallery = r.spec.sections.find((s) => s.group === 'gallery');
  gallery.items[0].title = 'PRIVATE-ITEM-TITLE'; gallery.items[0].body = 'PRIVATE-ITEM-BODY'; gallery.items[0].image = SECOND_PNG_IMAGE;
  await compose(r, fixture({}, (input) => {
    const serialized = JSON.stringify({ state: input.state, questions: input.questions });
    for (const secret of ['excluded-contact', 'private.example', 'NEVER-SEND', 'PRIVATE-ITEM', 'base64']) assert.ok(!serialized.includes(secret));
    const shape = input.state.existing.sections.find((s) => s.group === 'hero').contentShape;
    assert.equal(shape.bodyCharacters, hero.body.length); assert.equal(shape.hasSectionImage, true); assert.equal(shape.hasAction, true);
  }));
});

test('all section families and explicit pairwise ordering stay within the bounded question budget', async () => {
  const r = request('Make an expressive redesign. Move gallery before services.');
  r.spec.sections = GROUPS.filter(group=>!['testimonials','team','logos','stats'].includes(group)).map((group) => makeSection(group));
  const counts = [];
  const output = await compose(r, fixture({}, (input) => counts.push(Object.keys(input.questions).length)));
  assert.equal(counts.length, 2); assert.ok(counts.every((count) => count <= MAX_COMPOSITION_QUESTIONS));
  assert.ok(output.report.decisions.some((decision) => decision.key.startsWith('order_') || decision.key.endsWith('_move')));
});

test('second-pass failure leaves a redesign input immutable', async () => {
  const r = request('Make an expressive redesign.'), before = structuredClone(r); let call = 0;
  await assert.rejects(compose(r, async (input) => { if (++call === 2) throw new Error('Synthetic second-pass failure'); return fixture()(input); }), /second-pass failure/);
  assert.deepEqual(r, before);
});

test('choices outside named design vocabulary fail closed and never change the input', async () => {
  for (const bad of [{ direction: { choice: '<script>alert(1)</script>' } }, { presentation_hero_tone: { choice: 'url(https://evil.example)' } }, { block_hero: { choice: 'footer-simple' } }]) {
    const r = request('Make an expressive redesign.'), before = structuredClone(r);
    await assert.rejects(compose(r, fixture(bad)), /outside the approved/);
    assert.deepEqual(r, before);
  }
});

test('redesign allows deliberate membership and category changes through bounded semantic answers', async () => {
  const r = request('Our business is now software; we need plans and no gallery.');
  const output = await compose(r, fixture({ family: { choice: 'saas' }, include_pricing: { choice: 'include' }, include_gallery: { choice: 'omit' } }));
  assert.equal(output.spec.family, 'saas');
  assert.ok(output.spec.sections.some((section) => section.group === 'pricing'));
  assert.ok(!output.spec.sections.some((section) => section.group === 'gallery'));
  for (const section of output.spec.sections.filter((s) => s.group !== 'pricing')) assert.deepEqual(contentOnly(section), contentOnly(validateSpec(r.spec).sections.find((s) => s.group === section.group)));
});

test('offline redesign honestly reports local rules with no model probability or cost', async () => {
  const r = request('An expressive redesign.'); r.mode = 'demo';
  const output = await compose(r, demoEvaluate);
  assert.equal(output.report.calls, 0); assert.equal(output.report.inputTokens, 0); assert.equal(output.report.outputTokens, 0);
  assert.ok(output.report.decisions.every((decision) => decision.confidence === null && Object.keys(decision.probabilities).length === 0));
  assert.match(output.report.model, /not JEV/);
  assert.ok(output.report.changes.length > 0);
});
