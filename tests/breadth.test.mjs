/** Composition breadth: presentation axes, media side and columns, page recipes, layout rules,
 * prepared copy packs, element proposals, the demo repertoire and compatibility of stored data.
 * Every evaluator here is the offline demo or a synthetic fixture, never live JEV. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PNG_IMAGE } from './fixtures/images.mjs';
import { CATALOG, DEFAULT_BLOCKS, GROUP_LABELS, PRESETS, presetPrompt, getBlock } from '../shared/catalog.mjs';
import { PRESENTATION, DEFAULT_PRESENTATION, OPTIONAL_PRESENTATION, JOURNEYS, RECIPES, presentationFieldsFor } from '../shared/design.mjs';
import { COPY_VOICES, COPY_FAMILIES, COPY_GROUPS, copyFor } from '../shared/copy.mjs';
import { createSpec, createSampleSpec, makeSection } from '../shared/content.mjs';
import { validateSpec, validateCompose } from '../shared/schema.mjs';
import { renderBody } from '../shared/render.mjs';
import { elementFieldsFor, elementOptionsFor, mediaDefaultFor } from '../shared/elements.mjs';
import { slotsFor, placementFor } from '../shared/slots.mjs';
import { WIDGETS, makeWidget } from '../shared/widgets.mjs';
import { fitFor } from '../shared/fit.mjs';
import { isInterfaceBlock } from '../shared/interfaces.mjs';
import { prepareComposeRequest } from '../shared/compose-transport.mjs';
import { elementQuestions } from '../server/element-edits.mjs';
import { compose, planningQuestions, MAX_COMPOSITION_QUESTIONS } from '../server/composer.mjs';
import { demoEvaluate } from '../server/demo.mjs';
import { ProjectStore } from '../server/store.mjs';
import { readCompose } from '../hosted/schemas.mjs';

const EMAIL = 'studio@example.com';
const RULE = 'Layout rule (not a model choice): ';
const request = (prompt, operation = 'create', spec = createSpec(), extra = {}) => ({ mode: 'jev', operation, prompt, spec, locks: {}, ...extra });
// Synthetic distributions: the demo's choice with confidence 1 unless a key is overridden. An
// override is a choice, or { choice, confidence, probabilities }; `overrides` may be a function.
function evaluator(overrides = {}, seen = []) {
  return async (input) => {
    const demo = await demoEvaluate(input);
    const answers = Object.fromEntries(Object.entries(input.questions).map(([key, question]) => {
      const custom = typeof overrides === 'function' ? overrides(key, question) : overrides[key];
      const wanted = typeof custom === 'string' ? { choice: custom } : custom || {};
      const choice = wanted.choice ?? demo.answers[key].choice;
      return [key, { type: 'choice', choice, confidence: wanted.confidence ?? 1, probabilities: wanted.probabilities ?? Object.fromEntries(Object.keys(question.criteria).map((option) => [option, option === choice ? 1 : 0])) }];
    }));
    seen.push({ state: input.state, questions: input.questions, answers });
    return { model: 'breadth-fixture-not-live', usage: { input_tokens: 10, output_tokens: 4 }, answers };
  };
}
async function run(prompt, overrides = {}, { operation = 'create', spec, extra } = {}) {
  const seen = [];
  const output = await compose(request(prompt, operation, spec, extra), evaluator(overrides, seen));
  return { output, seen, q2: seen[1]?.questions || {} };
}
const demo = (prompt) => compose({ mode: 'demo', operation: 'create', prompt, spec: createSpec(), locks: {} }, demoEvaluate);
const section = (spec, group) => spec.sections.find((entry) => entry.group === group);
const body = (spec) => spec.sections.filter((entry) => !['navigation', 'hero', 'footer'].includes(entry.group)).map((entry) => entry.group);
const isGrid = (id) => fitFor(id)?.pattern === 'grid';
const gridFirst = (key, question) => key.startsWith('block_') ? Object.keys(question.criteria).find(isGrid) : undefined;
const leaning = (question, choice, weight) => ({ choice, probabilities: Object.fromEntries(Object.keys(question.criteria).map((option) => [option, option === choice ? weight : (1 - weight) / (Object.keys(question.criteria).length - 1)])) });
function fixture(group, block) {
  const site = createSpec(), added = makeSection(group, block);
  const index = site.sections.findIndex((entry) => entry.group === group);
  if (index >= 0) site.sections[index] = added;
  else site.sections.splice(-1, 0, added);
  return { site, section: added };
}
const markup = (site, id, preview = false) => renderBody(site, { preview }).match(new RegExp(`<section id="${id}"[^>]*>[\\s\\S]*?</section>`))[0];
const SECTION_TAG = /<(?:section|header|footer) id="([^"]*)" class="site-section[^>]*>/g;
const tags = (html) => Object.fromEntries([...html.matchAll(SECTION_TAG)].map((match) => [match[1], match[0]]));
// Image and heading of one section with unique strings; true when the image comes first.
function imageFirst(site, target, preview) {
  const html = markup(site, target.id, preview), image = html.indexOf(`alt="${target.alt}"`), heading = html.indexOf(`>${target.title}<`);
  assert.ok(image >= 0 && heading >= 0, `${target.block}: image and heading are rendered`);
  return image < heading;
}
function withImage(target, label) { target.image = PNG_IMAGE; target.alt = `${label} image alternative`; target.title = `${label} heading text`; return target; }
async function examples() {
  const names = (await readdir(new URL('../examples/', import.meta.url))).filter((name) => name.endsWith('.project.json'));
  assert.ok(names.length >= 3);
  return Promise.all(names.map(async (name) => JSON.parse(await readFile(new URL(`../examples/${name}`, import.meta.url), 'utf8'))));
}
const allSections = (spec) => [...spec.sections, ...(spec.pages || []).flatMap((page) => page.sections)];
const post = (body) => new Request('https://example.com/api/compose', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('AC-12 both axes validate sparsely and a default section keeps exactly the base keys', () => {
  const site = createSpec(), features = section(site, 'features');
  assert.deepEqual(Object.keys(validateSpec(site).sections.find((entry) => entry.id === features.id).presentation), Object.keys(DEFAULT_PRESENTATION));
  assert.deepEqual(OPTIONAL_PRESENTATION, ['backdrop', 'intro']);
  assert.deepEqual(Object.keys(PRESENTATION.backdrop), ['default', 'grid', 'dots', 'mesh', 'noise']);
  assert.deepEqual(Object.keys(PRESENTATION.intro), ['default', 'split', 'ruled']);
  features.presentation = { ...features.presentation, backdrop: 'default', intro: 'default' };
  assert.deepEqual(validateSpec(site).sections.find((entry) => entry.id === features.id).presentation, DEFAULT_PRESENTATION);
  features.presentation = { ...DEFAULT_PRESENTATION, intro: 'ruled', backdrop: 'grid' };
  const once = validateSpec(site), stored = once.sections.find((entry) => entry.id === features.id).presentation;
  assert.deepEqual(Object.keys(stored), [...Object.keys(DEFAULT_PRESENTATION), 'backdrop', 'intro']);
  assert.equal(stored.backdrop, 'grid'); assert.equal(stored.intro, 'ruled');
  assert.deepEqual(validateSpec(once), once);
  for (const foreign of [{ backdrop: 'stripes' }, { intro: 'center' }, { pattern: 'grid' }]) {
    features.presentation = { ...DEFAULT_PRESENTATION, ...foreign };
    assert.throws(() => validateSpec(site), Error, JSON.stringify(foreign));
  }
});

test('AC-12 data attributes appear on applicable groups only, with default for a missing key', () => {
  const site = createSpec();
  section(site, 'features').presentation.backdrop = 'grid';
  section(site, 'features').presentation.intro = 'split';
  const validated = validateSpec(site), found = tags(renderBody(validated));
  for (const entry of validated.sections) {
    const tag = found[entry.id], fields = presentationFieldsFor(entry.group);
    assert.ok(tag, `${entry.id} has a section tag`);
    for (const axis of OPTIONAL_PRESENTATION) {
      const expected = fields.includes(axis) ? ` data-${axis}="${entry.presentation[axis] ?? 'default'}"` : null;
      if (expected) assert.ok(tag.includes(expected), `${entry.id} ${axis}`);
      else assert.ok(!tag.includes(`data-${axis}=`), `${entry.id} has no ${axis}`);
    }
  }
  assert.ok(found.features.includes('data-backdrop="grid"') && found.features.includes('data-intro="split"'));
  assert.ok(found.hero.includes('data-backdrop="default"') && !found.hero.includes('data-intro='));
});

test('AC-12 pass two asks both axes where they apply and stores only non-default answers', async () => {
  const { output, q2 } = await run('A studio website with features.', { presentation_features_backdrop: 'grid', presentation_features_intro: 'split', presentation_hero_backdrop: 'default' });
  assert.deepEqual(Object.keys(q2.presentation_features_backdrop.criteria), Object.keys(PRESENTATION.backdrop));
  assert.deepEqual(Object.keys(q2.presentation_features_intro.criteria), Object.keys(PRESENTATION.intro));
  assert.ok(q2.presentation_hero_backdrop && !q2.presentation_hero_intro);
  assert.ok(!q2.presentation_navigation_backdrop && !q2.presentation_footer_backdrop);
  assert.equal(section(output.spec, 'features').presentation.backdrop, 'grid');
  assert.equal(section(output.spec, 'features').presentation.intro, 'split');
  assert.ok(!Object.hasOwn(section(output.spec, 'hero').presentation, 'backdrop'));
});

test('AC-13 media side and columns are offered to the listed blocks only', () => {
  const fields = (id) => elementFieldsFor(makeSection(getBlock(id).group, id));
  for (const id of ['about-split', 'cta-image']) assert.ok(fields(id).includes('mediaPlacement'), id);
  for (const id of ['about-statement', 'about-chapters', 'cta-band', 'cta-card', 'hero-halves', 'hero-browser', 'hero-phone']) assert.ok(!fields(id).includes('mediaPlacement'), id);
  for (const id of ['quotes-grid', 'team-grid', 'team-directory', 'logos-wall', 'stats-band', 'stats-cards', 'logos-grid', 'quotes-wall', 'team-speakers', 'gallery-rooms', 'features-amenities', 'pricing-tickets']) assert.ok(fields(id).includes('columns'), id);
  for (const id of ['gallery-lightbox', 'gallery-filter']) assert.ok(!fields(id).includes('columns'), id);
});

test('AC-13 about-split and cta-image keep the image first by default and follow before and after', () => {
  for (const [group, block] of [['about', 'about-split'], ['cta', 'cta-image']]) {
    for (const [value, first] of [['default', true], [undefined, true], ['before', true], ['after', false]]) {
      const { site, section: target } = fixture(group, block);
      withImage(target, `Unique ${block}`);
      if (value === undefined) delete target.elements.mediaPlacement;
      else target.elements.mediaPlacement = value;
      const validated = validateSpec(site), stored = validated.sections.find((entry) => entry.id === target.id);
      for (const preview of [true, false]) assert.equal(imageFirst(validated, stored, preview), first, `${block} ${value ?? 'missing'} preview=${preview}`);
    }
  }
  for (const [value, first] of [['default', false], ['after', false], ['before', true]]) {
    const { site, section: target } = fixture('hero', 'hero-split');
    withImage(target, 'Unique hero-split');
    target.elements.mediaPlacement = value;
    for (const preview of [true, false]) assert.equal(imageFirst(site, target, preview), first, `hero-split ${value}`);
  }
});

test('AC-13 the default option is true for every block with the control', () => {
  let checked = 0;
  for (const entry of CATALOG.filter((block) => !isInterfaceBlock(block.id))) {
    const { site, section: target } = fixture(entry.group, entry.id);
    if (!elementFieldsFor(target).includes('mediaPlacement')) continue;
    withImage(target, `Default ${entry.id}`);
    const strip = (html) => html.replace(/ data-element-media-placement="[^"]*"/g, '');
    target.elements.mediaPlacement = 'default';
    const standard = strip(renderBody(site));
    target.elements.mediaPlacement = mediaDefaultFor(target);
    assert.equal(strip(renderBody(site)), standard, entry.id);
    checked++;
  }
  assert.ok(checked >= 4);
  for (const target of [makeSection('about', 'about-split'), makeSection('cta', 'cta-image'), { group: 'about' }, makeSection('hero', 'hero-split')]) {
    const options = elementOptionsFor(target, 'mediaPlacement');
    assert.equal(Object.keys(options)[0], 'default');
    assert.equal(options.default, target.group === 'hero' ? 'After the content' : 'Before the content', target.block || target.group);
  }
});

test('AC-13 the image slots of about-split and cta-image stay as they were and columns reach the tag', () => {
  for (const [group, block] of [['about', 'about-split'], ['cta', 'cta-image']]) {
    const target = makeSection(group, block), media = slotsFor(target).find((slot) => slot.partKey === 'media');
    assert.equal(media.destinationSlot, 'about-media', block);
    assert.deepEqual(media.choices, []);
    assert.equal(placementFor(target, { sectionId: target.id }, 'media', 'hero-media', 'before').allowed, false, block);
  }
  const hero = slotsFor(makeSection('hero', 'hero-split')).find((slot) => slot.partKey === 'media');
  assert.equal(hero.destinationSlot, 'hero-media');
  assert.equal(hero.choices.length, 2);
  const question = elementQuestions(makeSection('about', 'about-split'), { preserve: false, edit: false, existing: false, context: '' }).element_about_mediaPlacement;
  assert.ok(question && !question.instructions.includes('hero image'));
  assert.equal(question.criteria.default, 'Before the content');
  const { site, section: quotes } = fixture('testimonials', 'quotes-grid');
  quotes.elements.columns = 'two';
  assert.ok(tags(renderBody(site))[quotes.id].includes('data-element-columns="two"'));
});

test('AC-13 an edit that sets the columns or the media side of a block reports the change', async () => {
  for (const [group, block, prompt, field, value] of [['testimonials', 'quotes-grid', 'Show the quotations in two columns.', 'columns', 'two'], ['cta', 'cta-image', 'Place the image after the content.', 'mediaPlacement', 'after']]) {
    const { site, section: target } = fixture(group, block);
    const { output } = await run(prompt, { [`element_${group}_${field}`]: value }, { operation: 'edit', spec: site, extra: { selectedSectionId: target.id } });
    assert.equal(output.spec.sections.find((entry) => entry.id === target.id).elements[field], value, block);
    assert.deepEqual(output.report.changes.find((change) => change.target === `sections.${target.id}.elements.${field}`), { target: `sections.${target.id}.elements.${field}`, label: `${GROUP_LABELS[group]} · ${field === 'columns' ? 'Columns' : 'Image placement'}`, before: 'default', after: value }, block);
    assert.ok(!output.warnings.some((warning) => warning.startsWith('No supported changes were applied')), block);
  }
});

test('AC-14 the recipe question is asked on create and redesign only, the voice on every operation', () => {
  const planned = (operation) => planningQuestions(validateCompose(request('A studio website.', operation)));
  assert.deepEqual(Object.keys(planned('create').recipe.criteria), ['none', ...Object.keys(RECIPES)]);
  assert.deepEqual(Object.keys(planned('redesign').recipe.criteria), ['none', ...Object.keys(RECIPES), 'keep']);
  assert.equal(planned('edit').recipe, undefined);
  assert.deepEqual(Object.keys(planned('create').copy_voice.criteria), Object.keys(COPY_VOICES));
  for (const operation of ['redesign', 'edit']) assert.deepEqual(Object.keys(planned(operation).copy_voice.criteria), [...Object.keys(COPY_VOICES), 'keep']);
  assert.match(planned('create').journey.instructions, /recipe supplies the order/);
});

test('AC-14 a recipe orders after the journey, pins its blocks and is reported; none keeps the journey order', async () => {
  const prompt = 'A website with services, gallery and process.';
  const plain = await run(prompt, { recipe: 'none' });
  const groups = new Set(body(plain.output.spec)), journey = JOURNEYS[plain.output.report.strategy.journey].order;
  assert.deepEqual(body(plain.output.spec), [...journey.filter((group) => groups.has(group)), ...body(plain.output.spec).filter((group) => !journey.includes(group))]);
  assert.equal(plain.output.report.strategy.recipe, 'none');
  assert.equal(plain.output.report.strategy.recipeLabel, 'No page recipe');
  const { output, q2, seen } = await run(prompt, { recipe: 'studio-services' });
  const order = RECIPES['studio-services'].order;
  assert.deepEqual(body(output.spec), [...order.filter((group) => groups.has(group)), ...body(plain.output.spec).filter((group) => !order.includes(group))]);
  assert.deepEqual(output.spec.sections.map((entry) => entry.id).sort(), plain.output.spec.sections.map((entry) => entry.id).sort());
  for (const group of ['hero', 'services', 'gallery']) assert.match(q2[`block_${group}`].criteria[RECIPES['studio-services'].blocks[group]], /suggested by the page recipe/, group);
  assert.equal(seen[1].state.chosen_recipe, 'studio-services');
  assert.equal(output.report.strategy.recipe, 'studio-services');
  assert.equal(output.report.strategy.recipeLabel, 'Studio and services');
});

test('AC-14 locked sections stay barriers for a recipe on redesign', async () => {
  const spec = createSpec(); section(spec, 'process').locked = true;
  const { output } = await run('Rebuild this as a studio services page.', { recipe: 'studio-services', journey: 'keep' }, { operation: 'redesign', spec });
  assert.deepEqual(body(output.spec), ['services', 'gallery', 'features', 'process', 'contact', 'faq']);
  const edit = await run('Make the gallery calmer.', {}, { operation: 'edit', spec: createSpec() });
  assert.equal(edit.seen[0].questions.recipe, undefined);
  assert.equal(edit.output.report.strategy.recipe, 'none');
});

test('AC-15 three grid layouts in a row are broken on create and the change is reported', async () => {
  const prompt = 'A website with features, services, gallery, process, pricing, faq and contact.';
  const first = await run(prompt, gridFirst);
  const walk = first.output.spec.sections.filter((entry) => !['navigation', 'footer'].includes(entry.group));
  const runs = first.output.report.rhythm.filter((entry) => entry.rule === 'grid-run');
  assert.ok(runs.length >= 1, 'a grid run was adjusted');
  for (const entry of runs) {
    const index = walk.findIndex((candidate) => candidate.id === entry.sectionId);
    assert.ok(index >= 2 && walk.slice(index - 2, index).every((candidate) => isGrid(candidate.block)), entry.sectionId);
    assert.ok(isGrid(entry.from) && !isGrid(entry.to));
    assert.equal(walk[index].block, entry.to);
    assert.ok(Object.hasOwn(first.q2[`block_${entry.sectionId}`].criteria, entry.to));
  }
  assert.ok(first.output.warnings.some((warning) => warning.startsWith(RULE) && warning.includes('three grid layouts')));
  // The same answers with the adjusted block named in the request: the named block stays.
  const recorded = Object.assign({}, ...first.seen.map((call) => Object.fromEntries(Object.entries(call.answers).map(([key, answer]) => [key, answer.choice]))));
  const named = await run(`${prompt} Keep the ${getBlock(runs[0].from).name}.`, (key, question) => Object.hasOwn(recorded, key) && Object.hasOwn(question.criteria, recorded[key]) ? recorded[key] : undefined);
  assert.equal(named.output.spec.sections.find((entry) => entry.id === runs[0].sectionId).block, runs[0].from);
  assert.ok(!named.output.report.rhythm.some((entry) => entry.sectionId === runs[0].sectionId));
});

test('AC-15 one contrast section stays on create; the prompt, redesign and edit keep every choice', async () => {
  const prompt = 'A website with features, process and a call to action.';
  const contrast = (weights = {}) => (key, question) => {
    const match = key.match(/^presentation_(features|process|cta)_tone$/);
    return match ? leaning(question, 'contrast', weights[match[1]] ?? 1) : undefined;
  };
  const tie = await run(prompt, contrast());
  assert.equal(section(tie.output.spec, 'cta').presentation.tone, 'contrast');
  for (const group of ['features', 'process']) assert.equal(section(tie.output.spec, group).presentation.tone, 'soft', group);
  assert.deepEqual(tie.output.report.rhythm.filter((entry) => entry.rule === 'single-contrast').map((entry) => [entry.sectionId, entry.from, entry.to]).sort(), [['features', 'contrast', 'soft'], ['process', 'contrast', 'soft']]);
  assert.equal(tie.output.warnings.filter((warning) => warning.startsWith(RULE) && warning.includes('focal point')).length, 2);
  const leader = await run(prompt, contrast({ features: 0.9, process: 0.6, cta: 0.6 }));
  assert.deepEqual(leader.output.spec.sections.filter((entry) => entry.presentation.tone === 'contrast').map((entry) => entry.group), ['features']);
  const asked = await run(`${prompt} Use contrast sections.`, contrast());
  for (const group of ['features', 'process', 'cta']) assert.equal(section(asked.output.spec, group).presentation.tone, 'contrast');
  assert.deepEqual(asked.output.report.rhythm.filter((entry) => entry.rule === 'single-contrast'), []);
  // A small page, so that every presentation question is asked individually.
  for (const operation of ['redesign', 'edit']) {
    const spec = createSpec(); spec.sections = spec.sections.filter((entry) => ['navigation', 'hero', 'features', 'process', 'footer'].includes(entry.group));
    spec.sections.splice(-1, 0, makeSection('cta'));
    const both = (key, question) => contrast()(key, question) ?? gridFirst(key, question);
    const { output } = await run('Make the whole page bolder.', both, { operation, spec, extra: { selectedSectionId: 'process' } });
    for (const group of ['features', 'process', 'cta']) assert.equal(section(output.spec, group).presentation.tone, 'contrast', `${operation} ${group}`);
    assert.deepEqual(output.report.rhythm, [], operation);
  }
});

test('AC-16 copy packs cover every family and group, without numbers, prices or evidence groups', () => {
  const forbidden = /[0-9%]|\p{Sc}/u;
  for (const family of COPY_FAMILIES) for (const group of COPY_GROUPS) {
    const packs = Object.keys(COPY_VOICES).map((voice) => copyFor(group, family, voice));
    for (const pack of packs) {
      assert.ok(pack && typeof pack.title === 'string' && pack.title, `${family} ${group}`);
      assert.ok(!forbidden.test(JSON.stringify(pack)), `${family} ${group}: ${JSON.stringify(pack)}`);
      assert.equal(pack.items?.length ?? 0, makeSection(group).items.length, `${family} ${group} items`);
      assert.ok(!Object.hasOwn(pack, 'price') && !(pack.items || []).some((item) => Object.hasOwn(item, 'price')));
    }
    if (['hero', 'about', 'cta'].includes(group)) assert.equal(new Set(packs.map((pack) => pack.title)).size, 3, `${family} ${group} voices`);
    else assert.ok(packs.every((pack) => JSON.stringify(pack) === JSON.stringify(packs[0])), `${family} ${group} is fixed`);
  }
  for (const voice of Object.values(COPY_VOICES)) assert.match(voice, /prepared/i);
  const content = (entry) => JSON.stringify({ ...entry, items: entry.items.map(({ id, ...rest }) => rest), featuredItemId: null });
  for (const group of ['testimonials', 'team', 'logos', 'stats', 'pricing']) {
    for (const family of COPY_FAMILIES) {
      assert.equal(copyFor(group, family, 'bold'), null);
      assert.equal(content(makeSection(group, undefined, family, 'warm')), content(makeSection(group, undefined, family)), `${group} ${family}`);
    }
  }
  assert.equal(copyFor('hero', 'general', 'plain'), null);
  assert.equal(copyFor('hero', 'studio', 'shout'), null);
});

test('AC-16 a call without a voice returns the content recorded before copy packs existed', () => {
  const text = (entry) => ({ eyebrow: entry.eyebrow, title: entry.title, body: entry.body, items: entry.items.map((item) => [item.title, item.meta]) });
  assert.deepEqual(text(makeSection('hero')), { eyebrow: 'A considered approach', title: 'Good ideas deserve a thoughtful home.', body: 'Introduce what you do, who you do it for, and what makes your approach different.', items: [] });
  assert.equal(makeSection('hero', undefined, 'saas').title, 'Less friction. More possibility.');
  assert.deepEqual(text(makeSection('about')), { eyebrow: 'Our story', title: 'A little about what drives us.', body: 'Tell your story in your own words. Describe your purpose, the people behind the work, and what visitors can expect.', items: [] });
  assert.deepEqual(text(makeSection('cta', undefined, 'event')), { eyebrow: 'The next step', title: 'Ready for a fresh perspective?', body: 'Give your visitors one clear next step.', items: [] });
  assert.deepEqual(text(makeSection('features', undefined, 'local')), { eyebrow: 'The essentials', title: 'Thoughtfully made. Simply useful.', body: 'Make your most important benefits clear at a glance.', items: [['A clear starting point', ''], ['Built around you', ''], ['Every detail matters', '']] });
  assert.deepEqual(text(makeSection('gallery', undefined, 'hospitality')), { eyebrow: 'Take a look around', title: 'Space to settle in.', body: 'Add your own images, project names and descriptions.', items: [['Your space', 'The stay'], ['The details', 'Inside'], ['Around us', 'The setting']] });
  assert.equal(makeSection('pricing', undefined, 'saas', 'bold').items[0].price, 'Ask for a quote');
});

test('AC-16 the voice reaches only the sections a request creates', async () => {
  const blocks = Object.fromEntries(['hero', 'features', 'about', 'cta'].map((group) => [`block_${group}`, DEFAULT_BLOCKS[group]]));
  const { output } = await run('A studio website with features, about and a call to action.', { family: 'studio', copy_voice: 'warm', ...blocks });
  for (const group of ['hero', 'about', 'cta']) assert.equal(section(output.spec, group).title, copyFor(group, 'studio', 'warm').title, group);
  assert.notEqual(copyFor('hero', 'studio', 'warm').title, copyFor('hero', 'studio', 'plain').title);
  assert.deepEqual(section(output.spec, 'features').items.map((item) => item.title), copyFor('features', 'studio', 'warm').items.map((item) => item.title));
  const spec = createSpec(), before = new Map(spec.sections.map((entry) => [entry.id, entry.title]));
  const redesign = await run('Add an about section and make the page friendlier.', { copy_voice: 'warm', include_about: 'include', block_about: DEFAULT_BLOCKS.about }, { operation: 'redesign', spec });
  assert.equal(section(redesign.output.spec, 'about').title, copyFor('about', 'studio', 'warm').title);
  for (const entry of redesign.output.spec.sections.filter((candidate) => before.has(candidate.id))) assert.equal(entry.title, before.get(entry.id), entry.id);
});

function proposalSpec({ gallery = 4, images = 2, steps = 5, email = EMAIL } = {}) {
  const spec = createSpec(); spec.brand.email = email;
  const pictures = section(spec, 'gallery');
  while (pictures.items.length < gallery) pictures.items.push({ ...structuredClone(pictures.items[0]), id: `item-gallery-${pictures.items.length}` });
  pictures.items.forEach((item, index) => { if (index < images) { item.image = PNG_IMAGE; item.alt = `Picture ${index}`; } });
  const process = section(spec, 'process');
  const names = ['Listen first', 'Sketch the idea', 'Agree the plan', 'Make the thing', 'Hand it over'];
  process.items = names.slice(0, steps).map((title, index) => ({ ...structuredClone(process.items[0]), id: `item-step-${index}`, title }));
  return { spec, names };
}

test('AC-17 proposals follow their rules, are capped at two and seed only the composition', async () => {
  const { spec, names } = proposalSpec();
  const keep = { journey: 'keep', recipe: 'keep' };
  const accepted = await run('Redesign the page and add suggested elements.', { ...keep, propose_element_gallery: 'lightbox', propose_element_process: 'stepper' }, { operation: 'redesign', spec });
  assert.deepEqual(Object.keys(accepted.q2).filter((key) => key.startsWith('propose_element_')), ['propose_element_gallery', 'propose_element_process']);
  assert.deepEqual(Object.keys(accepted.q2.propose_element_process.criteria), ['none', 'stepper', 'keep']);
  assert.ok(accepted.q2.propose_element_process.criteria.stepper.startsWith(`${WIDGETS.stepper.name}: ${WIDGETS.stepper.description} Suggested because`));
  assert.ok(!names.some((name) => accepted.q2.propose_element_process.criteria.stepper.includes(name)));
  const gallery = section(accepted.output.spec, 'gallery'), process = section(accepted.output.spec, 'process');
  assert.deepEqual(gallery.widgets.map((widget) => widget.kind), ['lightbox']);
  assert.deepEqual(process.widgets.map((widget) => widget.kind), ['stepper']);
  assert.deepEqual(process.widgets[0].options, names);
  assert.deepEqual(section(accepted.output.spec, 'contact').widgets, []);
  assert.doesNotThrow(() => validateSpec(accepted.output.spec));
  const declined = await run('Redesign the page.', { ...keep, propose_element_gallery: 'none', propose_element_process: 'none' }, { operation: 'redesign', spec: proposalSpec().spec });
  assert.ok(declined.output.spec.sections.every((entry) => !entry.widgets.length));
  const edit = await run('Make the gallery calmer.', {}, { operation: 'edit', spec: proposalSpec().spec });
  assert.ok(!Object.keys(edit.q2).some((key) => key.startsWith('propose_element_')));
  assert.ok(edit.output.spec.sections.every((entry) => !entry.widgets.length));
  const none = await run('Redesign the page.', keep, { operation: 'redesign', spec: proposalSpec({ images: 1, steps: 4, email: '' }).spec });
  assert.ok(!Object.keys(none.q2).some((key) => key.startsWith('propose_element_')));
});

test('AC-17 AC-SEC-4 a copy proposal is seeded with the brand email that no evaluator input contains', async () => {
  const spec = createSpec(); spec.brand.email = EMAIL;
  const { output, q2, seen } = await run('Redesign the page.', { journey: 'keep', recipe: 'keep', propose_element_contact: 'copy' }, { operation: 'redesign', spec });
  assert.deepEqual(Object.keys(q2).filter((key) => key.startsWith('propose_element_')), ['propose_element_contact']);
  const copy = section(output.spec, 'contact').widgets;
  assert.deepEqual(copy.map((widget) => widget.kind), ['copy']);
  assert.equal(copy[0].body, EMAIL);
  assert.equal(seen.length, 2);
  for (const call of seen) assert.ok(!JSON.stringify({ state: call.state, questions: call.questions }).includes(EMAIL));
});

test('AC-17 the admission step adds the explicit element first and never exceeds four', async () => {
  const skipped = `A suggested ${WIDGETS.copy.name} was not added to ${GROUP_LABELS.contact}: the section already holds four elements or one of that kind.`;
  const full = createSpec(); full.brand.email = EMAIL;
  section(full, 'contact').widgets = ['split', 'toast', 'alert'].map((kind, index) => makeWidget(kind, `element-existing-${index}`));
  const crowded = await run('Redesign the contact section.', { journey: 'keep', recipe: 'keep', reusable_element: 'menu', propose_element_contact: 'copy' }, { operation: 'redesign', spec: full, extra: { selectedSectionId: 'contact' } });
  const widgets = section(crowded.output.spec, 'contact').widgets;
  assert.equal(widgets.length, 4);
  assert.ok(widgets.some((widget) => widget.kind === 'menu') && !widgets.some((widget) => widget.kind === 'copy'));
  assert.ok(crowded.output.warnings.includes(skipped));
  assert.doesNotThrow(() => validateSpec(crowded.output.spec));
  const empty = createSpec(); empty.brand.email = EMAIL;
  const twice = await run('Redesign the contact section.', { journey: 'keep', recipe: 'keep', reusable_element: 'copy', propose_element_contact: 'copy' }, { operation: 'redesign', spec: empty, extra: { selectedSectionId: 'contact' } });
  assert.deepEqual(section(twice.output.spec, 'contact').widgets.map((widget) => widget.kind), ['copy']);
  assert.ok(twice.output.warnings.includes(skipped));
});

test('AC-17 content shape pins the filter, search and directory layouts with their reasons', async () => {
  const spec = createSpec();
  const grow = (target, count) => { while (target.items.length < count) target.items.push({ ...structuredClone(target.items[0]), id: `item-${target.group}-${target.items.length}` }); };
  grow(section(spec, 'gallery'), 6); grow(section(spec, 'faq'), 6);
  const team = makeSection('team'); grow(team, 6); spec.sections.splice(-1, 0, team);
  const { q2 } = await run('Redesign the page.', { journey: 'keep', recipe: 'keep' }, { operation: 'redesign', spec });
  assert.match(q2.block_gallery.criteria['gallery-filter'], /suggested for six or more labelled items/);
  assert.match(q2.block_faq.criteria['faq-search'], /suggested for six or more questions/);
  assert.match(q2.block_team.criteria['team-directory'], /suggested for six or more people/);
});

test('AC-18 AC-SEC-7 six demo prompts take their recipes, differ from one another and stay labelled', async () => {
  const prompts = [['A restaurant website.', 'local-menu'], ['A conference website with speakers and tickets.', 'event-conference'], ['A small hotel website.', 'stay-rooms'], ['A developer tool website.', 'saas-developer'], ['An AI product landing page.', 'ai-product'], ['A weekend workshop website.', 'event-workshop']];
  const sequences = new Set();
  for (const [prompt, recipe] of prompts) {
    const output = await demo(prompt);
    assert.equal(output.report.strategy.recipe, recipe, prompt);
    assert.match(output.warnings[0], /^DEMO: this composition used local keyword rules, not JEV\./);
    assert.equal(output.report.model, 'Local demo rules (not JEV)');
    assert.equal(output.report.calls, 0);
    const order = RECIPES[recipe].order;
    assert.deepEqual(body(output.spec).slice(0, order.length), order, prompt);
    const recipeBlocks = Object.entries(RECIPES[recipe].blocks);
    assert.ok(recipeBlocks.length > 0, prompt);
    for (const [group, block] of recipeBlocks) assert.equal(section(output.spec, group)?.block, block, `${prompt} ${group}`);
    assert.doesNotThrow(() => validateSpec(output.spec));
    sequences.add(output.spec.sections.map((entry) => entry.block).join(' '));
  }
  assert.equal(sequences.size, prompts.length);
  for (const name of ['Restaurant', 'Conference', 'AI product', 'Developer tool']) assert.ok(PRESETS.some((entry) => entry.name === name), name);
  assert.equal(PRESETS[0].name, 'AI product', 'the first preset is the request box placeholder');
  // Every inspiration card builds a valid page in the offline demo from the exact text it enters.
  for (const preset of PRESETS) {
    const output = await demo(presetPrompt(preset));
    assert.ok(output.spec.sections.length > 0, preset.name);
    assert.doesNotThrow(() => validateSpec(output.spec), preset.name);
    assert.equal(output.spec.brand.name, preset.brand, preset.name);
    const screen = CATALOG.find((entry) => entry.id.startsWith('app-') && entry.name === preset.name);
    if (screen) assert.deepEqual(output.spec.sections.map((entry) => entry.block), [screen.id], preset.name);
  }
});

test('the sample canvas keeps the default site’s brand, copy and blocks and changes only its presentation', () => {
  const plain = createSpec(), sample = validateSpec(createSampleSpec());
  const content = (spec) => spec.sections.map(({ id, group, block, eyebrow, title, body, button, items }) => ({ id, group, block, eyebrow, title, body, button, items: items.map((entry) => [entry.title, entry.body, entry.meta]) }));
  assert.deepEqual(content(sample), content(plain));
  assert.deepEqual(sample.brand, plain.brand);
  assert.deepEqual({ ...sample.theme, typeScale: plain.theme.typeScale, width: plain.theme.width }, plain.theme);
  assert.deepEqual([sample.theme.typeScale, sample.theme.width], ['dramatic', 'wide']);
  assert.equal(section(sample, 'gallery').elements.columns, 'three');
  const html = renderBody(sample);
  for (const fragment of ['data-backdrop="mesh"', 'data-tone="contrast"', 'data-tone="soft"', 'data-intro="split"']) assert.ok(html.includes(fragment), fragment);
});

test('AC-20 a twelve-section redesign stays within two calls and the question and option limits', async () => {
  const { spec } = proposalSpec();
  for (const group of ['about', 'pricing', 'cta']) spec.sections.splice(-1, 0, makeSection(group));
  assert.equal(spec.sections.length, 12);
  const { output, seen } = await run('Redesign the whole page with a bolder look and suggested elements.', {}, { operation: 'redesign', spec });
  assert.ok(seen.length <= 2 && output.report.calls <= 2);
  for (const call of seen) {
    assert.ok(Object.keys(call.questions).length <= MAX_COMPOSITION_QUESTIONS);
    for (const [key, question] of Object.entries(call.questions)) assert.ok(Object.keys(question.criteria).length <= 255, key);
  }
});

test('AC-SEC-3 foreign recipe, voice, proposal and axis answers are refused with nothing applied', async () => {
  const cases = [[{ recipe: 'foreign-recipe' }], [{ copy_voice: 'shout' }], [{ presentation_features_backdrop: 'stripes' }], [{ presentation_features_intro: 'center' }]];
  const withEmail = createSpec(); withEmail.brand.email = EMAIL;
  cases.push([{ journey: 'keep', recipe: 'keep', propose_element_contact: 'confetti' }, 'redesign', withEmail]);
  for (const [overrides, operation = 'create', spec = createSpec()] of cases) {
    const input = request('A studio website with features.', operation, spec), before = JSON.stringify(input);
    await assert.rejects(compose(input, evaluator(overrides)), (error) => error.status === 502 && /outside the approved/.test(error.message), JSON.stringify(overrides));
    assert.equal(JSON.stringify(input), before);
  }
});

test('AC-SEC-7 layout rule warnings say that code, not the model, made the change', async () => {
  const { output } = await run('A website with features, services, gallery, process, pricing, faq and contact.', gridFirst);
  const rules = output.warnings.filter((warning) => warning.includes('Layout rule'));
  assert.ok(rules.length >= 1);
  for (const warning of rules) { assert.ok(warning.startsWith(RULE)); assert.ok(!/\bJEV\b/.test(warning)); }
  const planned = planningQuestions(validateCompose(request('A studio website.')));
  assert.match(planned.copy_voice.instructions, /writes no text/);
});

test('AC-MIG-1 default documents and the examples carry no optional axis and validate idempotently', async () => {
  for (const document of [createSpec(), ...await examples()]) {
    const once = validateSpec(document);
    for (const entry of allSections(once)) for (const axis of OPTIONAL_PRESENTATION) assert.ok(!Object.hasOwn(entry.presentation, axis), `${entry.id} ${axis}`);
    assert.deepEqual(validateSpec(once), once);
  }
  const site = createSpec();
  const added = [['hero', 'hero-split'], ['about', 'about-split'], ['cta', 'cta-image']].map(([group, block]) => {
    const target = withImage(makeSection(group, block), `Base ${block}`);
    const index = site.sections.findIndex((entry) => entry.group === group);
    if (index >= 0) site.sections[index] = target; else site.sections.splice(-1, 0, target);
    return target;
  });
  const validated = validateSpec(site);
  for (const target of added) {
    const stored = validated.sections.find((entry) => entry.id === target.id);
    assert.equal(stored.elements.mediaPlacement, 'default');
    assert.equal(imageFirst(validated, stored, false), target.group !== 'hero', target.block);
  }
});

test('AC-MIG-3 a saved project with an unknown block is skipped, refused and kept byte for byte', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'forma-breadth-'));
  try {
    const store = new ProjectStore(directory);
    await store.init();
    const kept = await store.create(createSpec()), future = await store.create(createSpec());
    const file = path.join(directory, `${future.id}.json`), saved = JSON.parse(await readFile(file, 'utf8'));
    saved.spec.sections[2].block = 'future-component';
    await writeFile(file, JSON.stringify(saved));
    const bytes = await readFile(file);
    const listed = await store.list();
    assert.equal(listed.skipped, 1);
    assert.deepEqual(listed.projects.map((project) => project.id), [kept.id]);
    await assert.rejects(store.read(future.id), (error) => error.status === 500);
    assert.ok(bytes.equals(await readFile(file)));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('AC-MIG-4 a default-only request carries no optional axis and the hosted envelope accepts both forms', async () => {
  const prepared = prepareComposeRequest({ mode: 'jev', operation: 'edit', prompt: 'Make the page calmer.', spec: createSpec(), locks: {} }).request;
  for (const entry of allSections(prepared.spec)) for (const axis of OPTIONAL_PRESENTATION) assert.ok(!Object.hasOwn(entry.presentation, axis), `${entry.id} ${axis}`);
  assert.equal((await readCompose(post(prepared))).operation, 'edit');
  const spec = createSpec(); section(spec, 'features').presentation.backdrop = 'grid';
  const patterned = prepareComposeRequest({ mode: 'jev', operation: 'edit', prompt: 'Make the page calmer.', spec, locks: {} }).request;
  assert.equal(section((await readCompose(post(patterned))).spec, 'features').presentation.backdrop, 'grid');
});
