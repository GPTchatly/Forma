/** Selection engine: fit data, worded shortlists, the pattern level and runner-up layouts.
 * Every evaluator here is the offline demo or a synthetic fixture, never live JEV. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { PNG_IMAGE } from './fixtures/images.mjs';
import { CATALOG, GROUPS, FAMILIES, blocksFor, getBlock } from '../shared/catalog.mjs';
import { DIRECTIONS } from '../shared/design.mjs';
import { isInterfaceBlock } from '../shared/interfaces.mjs';
import { createSpec, makeSection } from '../shared/content.mjs';
import { validateSpec } from '../shared/schema.mjs';
import { applyMove } from '../shared/structure.mjs';
import { PATTERNS, FIT, fitFor, describeShape, shortlist, liveAlternatives } from '../shared/fit.mjs';
import { compose, planningQuestions, MAX_COMPOSITION_QUESTIONS } from '../server/composer.mjs';
import { demoEvaluate, profiles } from '../server/demo.mjs';

const request = (prompt, operation = 'create', mode = 'jev') => ({ mode, operation, prompt, spec: createSpec(), locks: {} });
// Synthetic distributions: the demo's choice with confidence 1 unless overridden.
const fixtures = (overrides = {}, observe = () => {}) => async (input) => {
  observe(input);
  const demo = await demoEvaluate(input);
  return { model: 'selection-fixture-not-live', usage: { input_tokens: 10, output_tokens: 4 }, answers: Object.fromEntries(Object.entries(input.questions).map(([key, q]) => {
    const picked = overrides[key]?.choice ?? demo.answers[key].choice;
    return [key, { type: 'choice', choice: picked, confidence: overrides[key]?.confidence ?? 1, probabilities: Object.fromEntries(Object.keys(q.criteria).map((v) => [v, v === picked ? 1 : 0])) }];
  })) };
};
const website = (group) => blocksFor(group).filter((block) => !isInterfaceBlock(block.id));
const named = (group) => website(group).map(({ id, name }) => ({ id, name }));
const screens = (group) => blocksFor(group).map((block) => ({ id: block.id, screen: isInterfaceBlock(block.id) }));
const offered = (question) => Object.keys(question.criteria).filter((key) => key !== 'keep');
const catalogOrder = (group, ids) => blocksFor(group).map((block) => block.id).filter((id) => ids.includes(id));
const largeGroups = GROUPS.filter((group) => website(group).length > 8);
const threeItems = () => makeSection('features').items;

test('AC-1 every website block has fit data within the data rules', () => {
  const websiteBlocks = CATALOG.filter((block) => !isInterfaceBlock(block.id));
  for (const block of websiteBlocks) {
    const fit = fitFor(block.id), prepared = makeSection(block.group, block.id).items.length;
    assert.ok(fit, `${block.id} has no fit data`);
    assert.ok(Object.hasOwn(PATTERNS, fit.pattern), `${block.id} pattern`);
    assert.ok(Number.isInteger(fit.items[0]) && Number.isInteger(fit.items[1]) && fit.items[0] >= 0 && fit.items[0] <= fit.items[1] && fit.items[1] <= 8, `${block.id} item range`);
    assert.ok(fit.items[0] <= prepared && prepared <= fit.items[1], `${block.id} range excludes its ${prepared} prepared items`);
    assert.ok(['none', 'optional', 'led'].includes(fit.image), `${block.id} image use`);
    assert.ok(['short', 'medium', 'long'].includes(fit.text), `${block.id} text tolerance`);
    assert.ok(fit.directions.length <= 2 && new Set(fit.directions).size === fit.directions.length && fit.directions.every((key) => Object.hasOwn(DIRECTIONS, key)), `${block.id} directions`);
    assert.ok(fit.families.length <= 3 && new Set(fit.families).size === fit.families.length && fit.families.every((key) => key !== 'application' && Object.hasOwn(FAMILIES, key)), `${block.id} families`);
  }
  for (const id of Object.keys(FIT)) assert.ok(websiteBlocks.some((block) => block.id === id), `${id} is not a website block of the catalog`);
  for (const block of CATALOG.filter((entry) => isInterfaceBlock(entry.id))) assert.equal(fitFor(block.id), null);
});

test('AC-1 per group affinity and patterns stay informative and every demo profile block claims its direction', () => {
  for (const group of GROUPS) {
    const fits = website(group).map((block) => fitFor(block.id));
    for (const direction of Object.keys(DIRECTIONS)) assert.ok(fits.filter((fit) => fit.directions.includes(direction)).length <= 5, `${group} ${direction}`);
    for (const family of Object.keys(FAMILIES)) assert.ok(fits.filter((fit) => fit.families.includes(family)).length <= 3, `${group} ${family}`);
    for (const pattern of Object.keys(PATTERNS)) assert.ok(fits.filter((fit) => fit.pattern === pattern).length <= 6, `${group} ${pattern}`);
    for (const [direction, profile] of Object.entries(profiles)) if (profile[group]) assert.ok(fitFor(profile[group]).directions.includes(direction), `${profile[group]} claims ${direction}`);
  }
});

test('AC-2 large groups are cut to ranked blocks plus pins, in catalog order, with fit in words', async () => {
  const seen = [];
  await compose(request('An editorial studio website with services, a gallery and features.'), fixtures({}, (input) => seen.push(input.questions)));
  assert.equal(seen.length, 2);
  for (const group of largeGroups) {
    const ids = offered(seen[1][`block_${group}`]);
    assert.ok(ids.length <= 10 && ids.length < website(group).length, `${group} offers ${ids.length}`);
    assert.deepEqual(ids, catalogOrder(group, ids));
    assert.ok(ids.includes(blocksFor(group)[0].id), `${group} keeps its standard layout`);
  }
  assert.deepEqual(offered(seen[1].block_services), website('services').map((block) => block.id));
  for (const [key, question] of Object.entries(seen[1]).filter(([key]) => key.startsWith('block_'))) {
    for (const description of Object.values(question.criteria)) assert.match(description, /\sFit: [a-z][a-z0-9 ,;-]*\.$/, key);
  }
  for (const questions of seen) for (const question of Object.values(questions)) assert.ok(!question.instructions.includes('Content shape: {'), question.instructions);
  assert.match(seen[1].block_hero.instructions, /Content shape: no items; section text short; no section image; has an action\./);
});

test('AC-2 the current block and up to two named blocks are pinned, at most four pins in all', () => {
  const prompt = 'Use the Image collage introduction, a Typographic poster and a Product tour introduction.';
  const result = shortlist({ section: { block: 'hero-cover', items: threeItems() }, blocks: named('hero'), prompt, pins: [{ id: 'hero-browser', reason: 'recipe block' }, { id: 'hero-phone', reason: 'content shape' }] });
  const fit = Object.fromEntries(result.options.map((option) => [option.id, option.fit]));
  assert.ok(result.options.length <= 10);
  assert.deepEqual(result.options.map((option) => option.id), catalogOrder('hero', result.options.map((option) => option.id)));
  assert.match(fit['hero-cover'], /current layout$/);
  assert.match(fit['hero-collage'], /named in the request$/);
  assert.match(fit['hero-poster'], /named in the request$/);
  assert.match(fit['hero-browser'], /recipe block$/);
  assert.ok(!fit['hero-tour']?.includes('named in the request'), 'a third named block is not pinned');
  assert.ok(!fit['hero-phone']?.includes('content shape'), 'a fifth pin competes by rank');
  assert.equal(Object.values(fit).filter((phrase) => /(?:current layout|named in the request|recipe block|content shape)$/.test(phrase)).length, 4);
});

test('AC-2 the standard layout keeps one of the six places only while no pattern is in force', () => {
  const input = { section: { block: 'hero-poster', items: threeItems() }, blocks: named('hero'), direction: 'product', family: 'hospitality' };
  const free = shortlist(input).options.map((option) => option.id);
  assert.deepEqual(free, ['hero-split', 'hero-centered', 'hero-browser', 'hero-phone', 'hero-poster', 'hero-tour', 'hero-prompt']);
  const patterned = shortlist({ ...input, pattern: 'interactive' }).options.map((option) => option.id);
  assert.deepEqual(patterned, ['hero-poster', 'hero-tour', 'hero-layers', 'hero-prompt']);
  const phrases = Object.fromEntries(shortlist(input).options.map((option) => [option.id, option.fit]));
  assert.equal(phrases['hero-centered'], 'suits any item count and medium-length text; matches the chosen direction');
  assert.equal(phrases['hero-browser'], 'suits any item count and medium-length text; matches the chosen direction; shows placeholder art until photos are added');
  assert.equal(phrases['hero-poster'], 'suits any item count and long text; current layout');
  const misfit = shortlist({ section: { block: 'hero-split', items: [] }, blocks: named('hero'), prune: false });
  assert.match(Object.fromEntries(misfit.options.map((option) => [option.id, option.fit]))['hero-tour'], /^holds one to eight items, this section has none/);
  assert.equal(describeShape({ title: 'x', body: 'y'.repeat(200), items: [{ title: 'A'.repeat(50), body: 'b'.repeat(400), image: PNG_IMAGE }, { title: 'B', body: '', image: '' }, { title: 'C', body: '', image: PNG_IMAGE }], image: '', button: 'Go', href: '' }), 'three items; item titles medium; item descriptions long; section text medium; two of three items have an uploaded image; no section image; has an action');
});

test('AC-2 sections with eight or fewer candidates and every section of an edit are offered whole', async () => {
  const seen = [];
  await compose(request('Make it dark.', 'edit', 'demo'), async (input) => { seen.push(input.questions); return demoEvaluate(input); });
  const second = seen.at(-1);
  for (const section of createSpec().sections) {
    const question = second[`block_${section.id}`];
    assert.deepEqual(offered(question), website(section.group).map((block) => block.id), section.id);
    assert.ok(Object.hasOwn(question.criteria, 'keep'));
  }
  assert.ok(!Object.keys(seen[0]).some((key) => key.startsWith('pattern_')));
});

test('AC-3 create and redesign ask one pattern question per large group; edit asks none', () => {
  assert.deepEqual(largeGroups, ['hero', 'features', 'gallery']);
  for (const operation of ['create', 'redesign', 'edit']) {
    const questions = planningQuestions({ ...request('A studio website.', operation), operation });
    const keys = Object.keys(questions).filter((key) => key.startsWith('pattern_'));
    if (operation === 'edit') { assert.deepEqual(keys, []); continue; }
    assert.deepEqual(keys, largeGroups.map((group) => `pattern_${group}`));
    for (const group of largeGroups) {
      const options = Object.keys(questions[`pattern_${group}`].criteria);
      assert.equal(options[0], 'any');
      assert.equal(options.includes('keep'), operation === 'redesign');
      for (const pattern of options.filter((option) => !['any', 'keep'].includes(option))) assert.ok(website(group).some((block) => fitFor(block.id).pattern === pattern), `${group} ${pattern}`);
    }
  }
});

test('AC-3 a chosen pattern limits a large section to that pattern plus pins; any, keep and uncertain answers do not', async () => {
  const carousel = website('gallery').filter((block) => fitFor(block.id).pattern === 'carousel').map((block) => block.id);
  const cases = [['create', { choice: 'carousel' }, true], ['create', { choice: 'any' }, false], ['redesign', { choice: 'carousel' }, true], ['redesign', { choice: 'keep' }, false], ['redesign', { choice: 'carousel', confidence: 0.1 }, false]];
  for (const [operation, answer, restricted] of cases) {
    const seen = [];
    await compose(request('A portfolio website with a gallery.', operation), fixtures({ pattern_gallery: answer }, (input) => seen.push(input)));
    const ids = offered(seen[1].questions.block_gallery), others = ids.filter((id) => id !== 'gallery-grid');
    assert.equal(others.every((id) => carousel.includes(id)), restricted, `${operation} ${JSON.stringify(answer)}`);
    if (restricted) assert.deepEqual(others, carousel);
    assert.equal(seen[1].state.chosen_patterns.gallery, restricted ? 'carousel' : 'any');
  }
});

test('AC-3 a pattern without a compatible block leaves every pattern available', () => {
  const input = { section: { block: 'gallery-masonry', items: threeItems() }, blocks: named('gallery'), direction: 'editorial', family: 'studio' };
  assert.ok(!website('gallery').some((block) => fitFor(block.id).pattern === 'statement'));
  assert.deepEqual(shortlist({ ...input, pattern: 'statement' }), shortlist(input));
});

test('AC-3 the demo answers a pattern only for a prompt that points at a block', async () => {
  const cases = [
    ['create', 'A portfolio with a swipeable gallery.', { gallery: 'carousel', hero: 'any', features: 'any' }],
    ['create', 'A studio site with a Masonry portfolio gallery.', { gallery: 'grid' }],
    ['create', 'A site with a centered hero.', { hero: 'statement' }],
    ['create', 'A calm editorial studio website with features and a gallery.', { hero: 'any', features: 'any', gallery: 'any' }],
    ['create', 'An expressive, dramatic product website with features and a gallery.', { hero: 'any', features: 'any', gallery: 'any' }],
    ['redesign', 'Redesign the existing page.', { hero: 'keep', features: 'keep', gallery: 'keep' }]
  ];
  for (const [operation, prompt, expected] of cases) {
    const answers = [];
    await compose(request(prompt, operation, 'demo'), async (input) => { const output = await demoEvaluate(input); answers.push(output.answers); return output; });
    for (const [group, pattern] of Object.entries(expected)) assert.equal(answers[0][`pattern_${group}`].choice, pattern, `${prompt} ${group}`);
  }
});

test('AC-4 live alternatives follow the returned probabilities and carry them', async () => {
  let expected = [];
  const evaluate = async (input) => {
    const response = await fixtures()(input), question = input.questions.block_hero;
    if (question) {
      const answer = response.answers.block_hero, others = offered(question).filter((id) => id !== answer.choice);
      answer.probabilities = Object.fromEntries(Object.keys(question.criteria).map((id) => [id, 0]));
      Object.assign(answer.probabilities, { [answer.choice]: 0.6, [others.at(-1)]: 0.3, [others.at(-2)]: 0.1 });
      expected = [others.at(-1), others.at(-2)];
    }
    return response;
  };
  const output = await compose(request('An editorial studio website with a gallery.'), evaluate);
  const hero = output.report.alternatives.find((entry) => entry.sectionId === 'hero');
  assert.equal(hero.basis, 'probability');
  assert.equal(hero.chosen, output.spec.sections.find((section) => section.id === 'hero').block);
  assert.deepEqual(hero.options, [{ block: expected[0], name: getBlock(expected[0]).name, probability: 0.3 }, { block: expected[1], name: getBlock(expected[1]).name, probability: 0.1 }]);
  for (const entry of output.report.alternatives) {
    assert.ok(entry.options.length >= 1 && entry.options.length <= 2);
    assert.ok(entry.options.every((option) => option.block !== entry.chosen && typeof option.probability === 'number'));
  }
});

test('AC-4 demo alternatives are ordered by fit rank and carry no probability', async () => {
  const prompt = 'An editorial studio website with a gallery.', seen = [];
  const output = await compose(request(prompt, 'create', 'demo'), async (input) => { seen.push(input.questions); return demoEvaluate(input); });
  assert.equal(output.report.calls, 0);
  assert.ok(output.report.alternatives.length > 0);
  for (const entry of output.report.alternatives) {
    assert.equal(entry.basis, 'fit');
    assert.ok(entry.options.every((option) => option.probability === null && option.block !== entry.chosen && offered(seen[1][`block_${entry.sectionId}`]).includes(option.block)));
  }
  const hero = output.report.alternatives.find((entry) => entry.sectionId === 'hero'), ids = offered(seen[1].block_hero);
  const { ranked } = shortlist({ section: makeSection('hero', undefined, output.spec.family), blocks: named('hero'), direction: output.report.strategy.direction, family: output.spec.family, prompt });
  assert.deepEqual(hero.options.map((option) => option.block), ranked.filter((id) => ids.includes(id) && id !== hero.chosen).slice(0, 2));
});

test('AC-4 liveAlternatives keeps only content-keeping website alternatives of the section as it is now', () => {
  const entry = { sectionId: 'hero', group: 'hero', chosen: 'hero-editorial', basis: 'fit', options: [{ block: 'hero-cover', probability: 0.4 }, { block: 'hero-split', probability: null }] };
  const hero = (block) => ({ id: 'hero', group: 'hero', block });
  const cases = [
    ['unchanged section', entry, hero('hero-editorial'), [{ block: 'hero-cover', probability: 0.4 }, { block: 'hero-split', probability: null }]],
    ['section moved to an option', entry, hero('hero-cover'), [{ block: 'hero-split', probability: null }, { block: 'hero-editorial', probability: null }]],
    ['each block once', { ...entry, options: [{ block: 'hero-cover', probability: 0.4 }, { block: 'hero-cover', probability: 0.2 }, { block: 'hero-editorial', probability: 0.1 }] }, hero('hero-split'), [{ block: 'hero-cover', probability: 0.4 }, { block: 'hero-editorial', probability: 0.1 }]],
    ['section became an application screen', entry, hero('app-dashboard'), []],
    ['entry of another section', { ...entry, sectionId: 'hero-2' }, hero('hero-editorial'), []],
    ['entry of another group', { ...entry, group: 'features' }, hero('hero-editorial'), []],
    ['screen or unknown option', { ...entry, options: [{ block: 'app-chat', probability: 0.5 }, { block: 'hero-missing', probability: 0.3 }, { block: 'features-bento', probability: 0.1 }, { block: 'hero-poster', probability: 0.1 }] }, hero('hero-editorial'), [{ block: 'hero-poster', probability: 0.1 }]],
    ['missing entry', undefined, hero('hero-editorial'), []],
    ['options that are not a list', { ...entry, options: 'hero-cover' }, hero('hero-editorial'), []],
    ['missing section', entry, undefined, []]
  ];
  for (const [label, candidate, section, expected] of cases) assert.deepEqual(liveAlternatives(candidate, section, screens('hero')), expected, label);
});

test('AC-4 applying a live alternative keeps the section text, items and item ids', () => {
  const site = validateSpec(createSpec()), before = site.sections.find((section) => section.id === 'features');
  const [alternative] = liveAlternatives({ sectionId: 'features', group: 'features', chosen: before.block, basis: 'fit', options: [{ block: 'features-list', probability: null }] }, before, screens('features'));
  const result = applyMove(site, { kind: 'replace-section', pageId: 'home', sectionId: 'features', blockId: alternative.block });
  assert.equal(result.allowed, true);
  const after = result.page.sections.find((section) => section.id === 'features');
  assert.equal(after.block, 'features-list');
  assert.deepEqual({ title: after.title, body: after.body, items: after.items }, { title: before.title, body: before.body, items: before.items });
  assert.deepEqual(after.items.map((item) => item.id), before.items.map((item) => item.id));
});

test('AC-20 a create request uses two calls within the question and option budgets', async () => {
  const sizes = [];
  const output = await compose(request('A studio site with features, about, services, a gallery, process, pricing, FAQ, contact and a call to action.'), fixtures({}, (input) => {
    sizes.push(Object.keys(input.questions).length);
    assert.ok(Object.values(input.questions).every((question) => Object.keys(question.criteria).length <= 255));
  }));
  assert.equal(sizes.length, 2);
  assert.ok(sizes.every((size) => size <= MAX_COMPOSITION_QUESTIONS));
  assert.equal(output.report.calls, 2);
});

test('AC-SEC-3 a pattern answer outside the offered options is refused and changes nothing', async () => {
  for (const [operation, key, choice] of [['create', 'pattern_hero', 'keep'], ['create', 'pattern_gallery', 'statement'], ['redesign', 'pattern_features', '<script>alert(1)</script>'], ['redesign', 'pattern_gallery', '__proto__']]) {
    const r = request('A portfolio website with features and a gallery.', operation), before = structuredClone(r);
    await assert.rejects(compose(r, fixtures({ [key]: { choice } })), (error) => error.status === 502 && /outside the approved/.test(error.message));
    assert.deepEqual(r, before);
  }
});

test('AC-SEC-4 neither evaluator input carries the brand email, section or item bodies or image bytes', async () => {
  const r = request('Redesign it with the Masonry portfolio and Bento features layouts.', 'redesign');
  r.spec.brand.email = 'brand-contact@example.com';
  for (const [index, section] of r.spec.sections.entries()) {
    section.body = `PRIVATE-SECTION-BODY-${index}`;
    for (const item of section.items) { item.body = `PRIVATE-ITEM-BODY-${index}`; item.image = PNG_IMAGE; }
  }
  const inputs = [];
  await compose(r, fixtures({}, (input) => inputs.push(JSON.stringify({ state: input.state, questions: input.questions }))));
  assert.equal(inputs.length, 2);
  assert.ok(inputs[0].includes('pattern_gallery') && inputs[1].includes(' Fit: '));
  for (const serialized of inputs) for (const secret of ['brand-contact', 'PRIVATE-SECTION-BODY', 'PRIVATE-ITEM-BODY', 'base64']) assert.ok(!serialized.includes(secret), secret);
});

test('AC-FAIL-1 an evaluator failure in either pass with pattern questions present leaves the request untouched', async () => {
  for (const operation of ['create', 'redesign']) for (const failing of [1, 2]) {
    const r = request('A portfolio website with a gallery.', operation), before = structuredClone(r);
    let count = 0;
    await assert.rejects(compose(r, async (input) => {
      if (++count === 1) assert.ok(Object.keys(input.questions).some((key) => key.startsWith('pattern_')));
      if (count === failing) throw new Error('Synthetic evaluator failure');
      return fixtures()(input);
    }), /Synthetic evaluator failure/);
    assert.equal(count, failing);
    assert.deepEqual(r, before);
  }
});

test('AC-FAIL-2 a block without fit data is offered unranked and never throws', () => {
  const blocks = [...named('gallery'), { id: 'gallery-unknown', name: 'Unknown layout' }];
  assert.equal(fitFor('gallery-unknown'), null);
  const whole = shortlist({ section: { block: 'gallery-unknown', items: threeItems() }, blocks, direction: 'editorial', prune: false });
  assert.equal(whole.options.find((option) => option.id === 'gallery-unknown').fit, 'fit not rated; current layout');
  assert.ok(whole.ranked.includes('gallery-unknown'));
  const pruned = shortlist({ section: { items: [] }, blocks, pattern: 'grid' });
  assert.ok(pruned.ranked.includes('gallery-unknown') === false && pruned.options.length > 0);
  const unranked = shortlist({ section: { items: threeItems() }, blocks });
  assert.equal(unranked.ranked.at(-1), 'gallery-unknown', 'no affinity or problems: catalog order decides');
  assert.doesNotThrow(() => shortlist({ section: undefined, blocks: [{ id: 'unknown' }, null, { name: 'no id' }] }));
});

test('AC-FAIL-3 a locked or missing section refuses an alternative and a composed hero that became a screen has none', async () => {
  const site = validateSpec(createSpec());
  site.sections.find((section) => section.id === 'hero').locked = true;
  const before = structuredClone(site);
  for (const sectionId of ['hero', 'missing']) {
    const result = applyMove(site, { kind: 'replace-section', pageId: 'home', sectionId, blockId: 'hero-editorial' });
    assert.equal(result.allowed, false);
    assert.equal(result.changed, false);
    assert.deepEqual(site, before);
  }
  const output = await compose(request('An editorial studio website.', 'create', 'demo'), demoEvaluate);
  const entry = output.report.alternatives.find((candidate) => candidate.sectionId === 'hero');
  const composed = output.spec.sections.find((section) => section.id === 'hero');
  assert.ok(liveAlternatives(entry, composed, screens('hero')).length > 0);
  const moved = applyMove(output.spec, { kind: 'replace-section', pageId: 'home', sectionId: 'hero', blockId: 'app-dashboard' });
  assert.equal(moved.allowed, true);
  const screen = moved.page.sections.find((section) => section.id === 'hero');
  assert.equal(screen.block, 'app-dashboard');
  assert.deepEqual(liveAlternatives(entry, screen, screens('hero')), []);
});
