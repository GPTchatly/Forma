import { PNG_IMAGE } from './fixtures/images.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpec, makeSection, extractLiteralFields } from '../shared/content.mjs';
import { GROUPS } from '../shared/catalog.mjs';
import { createPage } from '../shared/pages.mjs';
import { validateSpec } from '../shared/schema.mjs';
import { compose, MAX_COMPOSITION_QUESTIONS } from '../server/composer.mjs';
import { demoEvaluate } from '../server/demo.mjs';
import { assertQuestionBudget } from '../server/element-edits.mjs';

const request = (prompt, selectedSectionId, selectedItemIndex) => ({ prompt, operation: 'edit', mode: 'demo', spec: createSpec(), locks: {}, ...(selectedSectionId ? { selectedSectionId } : {}), ...(selectedItemIndex !== undefined ? { selectedItemIndex } : {}) });
const section = (spec, group) => spec.sections.find((section) => section.group === group);
// Synthetic distributions validate the contract, not live JEV quality.
const fixture = (changes = {}, observe = () => {}) => async (input) => {
  observe(input);
  const demo = await demoEvaluate(input);
  return { ...demo, model: 'element-fixture-not-live', usage: { input_tokens: 3, output_tokens: 2 }, answers: Object.fromEntries(Object.entries(input.questions).map(([key, question]) => {
    const choice = changes[key]?.choice ?? demo.answers[key].choice;
    return [key, { type: 'choice', choice, confidence: changes[key]?.confidence ?? 1, probabilities: Object.fromEntries(Object.keys(question.criteria).map((value) => [value, value === choice ? 1 : 0])) }];
  })) };
};
test('a request can change the first feature icon without changing its siblings or theme', async () => {
  const r = request('Change the first icon in features to a heart.'), before = validateSpec(r.spec);
  const output = await compose(r, demoEvaluate);
  assert.equal(section(output.spec, 'features').items[0].icon, 'heart');
  assert.deepEqual(section(output.spec, 'features').items.slice(1), section(before, 'features').items.slice(1));
  assert.deepEqual(output.spec.theme, before.theme);
  assert.deepEqual(output.report.changes.map((change) => change.target), ['sections.features.items.0.icon']);
});
test('a request can replace all feature icons and item selection resolves this icon', async () => {
  const all = await compose(request('Change all feature icons to leaves.'), demoEvaluate);
  assert.ok(section(all.spec, 'features').items.every((item) => item.icon === 'leaf'));
  const selected = await compose(request('Change this icon to a shield.', 'features', 1), demoEvaluate);
  assert.deepEqual(section(selected.spec, 'features').items.map((item) => item.icon), ['default', 'shield', 'default']);
});
test('selection in another section does not narrow an explicitly targeted features icon request', async () => {
  const output = await compose(request('Use leaf icons in features.', 'gallery', 1), demoEvaluate);
  assert.deepEqual(section(output.spec, 'features').items.map((item) => item.icon), ['leaf', 'leaf', 'leaf']);
});
test('removing a feature icon is supported without removing its item or section', async () => {
  for (const prompt of ['Remove the first feature icon.', 'Remove the icon from the first feature.']) {
    const r = request(prompt), before = validateSpec(r.spec), output = await compose(r, demoEvaluate);
    assert.equal(section(output.spec, 'features').items.length, section(before, 'features').items.length);
    assert.deepEqual(section(output.spec, 'features').items.map((item) => item.icon), ['none', 'default', 'default']);
    assert.equal(output.report.decisions.find((decision) => decision.key === 'edit_support').choice, 'full');
  }
});
test('icon surface requests preserve the surrounding card surface', async () => {
  for (const [prompt, expected] of [['Make the features icons outlined.', 'outlined'], ['Use plain icons in features.', 'plain']]) {
    const r = request(prompt); section(r.spec, 'features').presentation.surface = 'filled';
    const output = await compose(r, demoEvaluate);
    assert.equal(section(output.spec, 'features').elements.iconStyle, expected);
    assert.equal(section(output.spec, 'features').presentation.surface, 'filled');
    assert.deepEqual(output.report.changes.map((change) => change.target), ['sections.features.elements.iconStyle']);
  }
});
test('icon size and container changes do not change global corners, scale, palette or unrelated sections', async () => {
  const r = request('Use large outlined icons in the features section.'), before = validateSpec(r.spec);
  const output = await compose(r, demoEvaluate);
  assert.equal(section(output.spec, 'features').elements.iconSize, 'large');
  assert.equal(section(output.spec, 'features').elements.iconStyle, 'outlined');
  assert.deepEqual(output.spec.theme, before.theme);
  assert.deepEqual(output.spec.sections.filter((section) => section.group !== 'features'), before.sections.filter((section) => section.group !== 'features'));
});
test('internal changes work beyond features: service columns and content alignment', async () => {
  const r = request('Make the services two columns and center the card content.');
  section(r.spec, 'services').block = 'services-cards';
  const output = await compose(r, demoEvaluate);
  assert.equal(section(output.spec, 'services').elements.columns, 'two');
  assert.equal(section(output.spec, 'services').elements.contentAlign, 'center');
  assert.deepEqual(output.spec.theme, validateSpec(r.spec).theme);
});
test('hero secondary action and process numbering can be hidden independently', async () => {
  const output = await compose(request('Hide the hero secondary link; hide process numbering.'), demoEvaluate);
  assert.equal(section(output.spec, 'hero').elements.secondaryAction, 'hide');
  assert.equal(section(output.spec, 'hero').elements.primaryAction, 'default');
  assert.equal(section(output.spec, 'process').elements.numbering, 'hide');
  assert.equal(section(output.spec, 'services').elements.numbering, 'default');
});
test('pricing prominence can target the third plan and options exclude absent items', async () => {
  const r = request('Highlight the third pricing plan.'); r.spec.sections.splice(-1, 0, makeSection('pricing'));
  const output = await compose(r, fixture({}, ({ questions }) => {
    const q = questions.element_pricing_featuredItem;
    if (q) { assert.ok('third' in q.criteria); assert.ok(!('fourth' in q.criteria)); }
  }));
  assert.equal(section(output.spec, 'pricing').elements.featuredItem, 'third');
});
test('the button component, embedded icon and label typography are independent library choices', async () => {
  const output = await compose(request('Use an outlined hero button with no icon and uppercase button labels.'), demoEvaluate);
  const hero = section(output.spec, 'hero');
  assert.equal(hero.elements.buttonStyle, 'outline'); assert.equal(hero.elements.buttonIcon, 'none'); assert.equal(hero.elements.buttonLabelStyle, 'uppercase');
  assert.equal(hero.elements.primaryAction, 'default');
});
test('a button can select prepared copy and an exact quote supersedes that preset', async () => {
  const r = request('Use Get started button text in the hero.');
  const prepared = await compose(r, demoEvaluate); assert.equal(section(prepared.spec, 'hero').elements.buttonLabel, 'get-started');
  const output = await compose({ ...r, spec: prepared.spec, prompt: 'Change the hero button to “Browse the collection”.' }, demoEvaluate);
  assert.equal(section(output.spec, 'hero').button, 'Browse the collection');
  assert.equal(section(output.spec, 'hero').elements.buttonLabel, 'default');
});
test('prepared Contact us copy does not retarget a selected hero button to the contact section', async () => {
  const output = await compose(request('Change this button label to Contact us.', 'hero'), demoEvaluate);
  assert.equal(section(output.spec, 'hero').elements.buttonLabel, 'contact-us');
  assert.equal(section(output.spec, 'contact').elements.buttonLabel, 'default');
});
test('removing a button icon does not also hide the button', async () => {
  const output = await compose(request('Use a solid hero button without an icon.'), demoEvaluate);
  assert.equal(section(output.spec, 'hero').elements.buttonIcon, 'none');
  assert.equal(section(output.spec, 'hero').elements.primaryAction, 'default');
});
test('exact quoted destinations apply to simple contact actions only', async () => {
  const r = request('Change the contact link to "https://example.com/reach-us".');
  section(r.spec, 'contact').block = 'contact-simple';
  const output = await compose(r, demoEvaluate); assert.equal(section(output.spec, 'contact').href, 'https://example.com/reach-us');
  section(r.spec, 'contact').block = 'contact-form';
  const form = await compose(r, demoEvaluate); assert.equal(section(form.spec, 'contact').href, '');
});
test('exact quoted replacements reach feature item title and CTA button without model-written text', async () => {
  const r = request('Change the first feature title to "Care comes first"; set the CTA button to “Meet our team”.');
  r.spec.sections.splice(-1, 0, makeSection('cta'));
  const output = await compose(r, demoEvaluate);
  assert.equal(section(output.spec, 'features').items[0].title, 'Care comes first');
  assert.equal(section(output.spec, 'cta').button, 'Meet our team');
  assert.ok(output.report.changes.some((change) => change.target === 'sections.features.items.0.title'));
  assert.ok(output.report.changes.some((change) => change.target === 'sections.cta.button'));
  assert.ok(!JSON.stringify(output.report.changes).includes('Care comes first'));
});
test('section-qualified colon fields use the element route instead of changing global literals', async () => {
  const r = request('Change hero button: "Join us"; Change features headline: "Features for you".');
  section(r.spec, 'hero').elements.buttonLabel = 'get-started';
  const before = validateSpec(r.spec), output = await compose(r, demoEvaluate);
  assert.equal(section(output.spec, 'hero').button, 'Join us');
  assert.equal(section(output.spec, 'hero').elements.buttonLabel, 'default');
  assert.equal(section(output.spec, 'features').title, 'Features for you');
  assert.equal(section(output.spec, 'hero').title, section(before, 'hero').title);
  assert.deepEqual(output.spec.brand, before.brand);
  assert.deepEqual(extractLiteralFields(r.prompt), {});
});
test('bare global literal fields retain compact straight and curly quoted syntax', async () => {
  const prompt = 'Brand: "Acme" Headline: “Exact heading” Tagline: "Exact tagline" Button: “Join Acme”';
  assert.deepEqual(extractLiteralFields(prompt), { name: 'Acme', headline: 'Exact heading', tagline: 'Exact tagline', cta: 'Join Acme' });
  const output = await compose(request(prompt), demoEvaluate);
  assert.equal(output.spec.brand.name, 'Acme'); assert.equal(output.spec.brand.tagline, 'Exact tagline'); assert.equal(output.spec.brand.cta, 'Join Acme');
  assert.equal(section(output.spec, 'hero').title, 'Exact heading');
  // Quoted-text questions are copy_<index>; copy_voice is the separate draft-voice question.
  assert.ok(!output.report.decisions.some((decision) => /^copy_\d+$/.test(decision.key)));
});
test('qualified and bare literal fields can coexist without the earlier qualified value winning', async () => {
  const prompt = 'Change hero button: "A local action". Button: "Global action". Change features headline: "Local heading"; Headline: "Global heading".';
  assert.deepEqual(extractLiteralFields(prompt), { headline: 'Global heading', cta: 'Global action' });
  const output = await compose(request(prompt), demoEvaluate);
  assert.equal(section(output.spec, 'hero').button, 'A local action');
  assert.equal(output.spec.brand.cta, 'Global action');
  assert.equal(section(output.spec, 'features').title, 'Local heading');
  assert.equal(section(output.spec, 'hero').title, 'Global heading');
});
test('explicit section headings outrank item selection and selection never carries into another group', async () => {
  for (const [prompt, group, heading] of [
    ['Change gallery heading to "Our projects".', 'gallery', 'Our projects'],
    ['Change hero heading to "New Hero".', 'hero', 'New Hero'],
    ['Change the features section heading to "Our promise".', 'features', 'Our promise']
  ]) {
    const r = request(prompt, 'features', 1), before = validateSpec(r.spec), output = await compose(r, demoEvaluate);
    assert.equal(section(output.spec, group).title, heading);
    for (const current of output.spec.sections) assert.deepEqual(current.items, section(before, current.group).items);
  }
});
test('quoted old wording is a reference and selected item context routes the replacement', async () => {
  const r = request('Replace the title "A clear starting point" with "Your new beginning".', 'features', 0);
  const output = await compose(r, demoEvaluate);
  assert.equal(section(output.spec, 'features').items[0].title, 'Your new beginning');
  assert.equal(output.report.decisions.find((decision) => decision.key === 'copy_0').choice, 'keep');
});
test('quoted arbitrary HTML remains data and unsafe link targets are not offered', async () => {
  const r = request('Set the first feature title to "<script>alert(1)</script>"; set its link to "javascript:alert(1)".', 'features', 0);
  const output = await compose(r, fixture({}, ({ questions }) => {
    if (questions.copy_1) assert.ok(!Object.keys(questions.copy_1.criteria).some((key) => key.endsWith('_href')));
  }));
  assert.equal(section(output.spec, 'features').items[0].title, '<script>alert(1)</script>');
  assert.equal(section(output.spec, 'features').items[0].href, '');
});
test('quoted link routing only accepts existing registered page targets', async () => {
  const r = request('Set the first feature link to "page:services-page#services".');
  r.spec.pages.push(createPage(r.spec, { id: 'services-page', title: 'Services', slug: 'services', template: 'services' }));
  const output = await compose(r, demoEvaluate);
  assert.equal(section(output.spec, 'features').items[0].href, 'page:services-page#services');
  r.prompt = 'Set the first feature link to "page:missing".';
  const rejected = await compose(r, demoEvaluate);
  assert.equal(section(rejected.spec, 'features').items[0].href, '');
});
test('locks omit all element, icon and copy destinations for that section', async () => {
  const r = request('Change the first feature icon to heart and its title to "New title".'); section(r.spec, 'features').locked = true;
  const output = await compose(r, fixture({}, ({ questions }) => {
    assert.ok(!Object.keys(questions).some((key) => /^(?:element|icon)_features_/.test(key)));
    if (questions.copy_0) assert.ok(!Object.keys(questions.copy_0.criteria).some((key) => key.startsWith('item_features_')));
  }));
  assert.deepEqual(section(output.spec, 'features'), section(validateSpec(r.spec), 'features'));
  assert.ok(output.warnings.some((warning) => warning.includes('No supported changes')));
});
test('low-confidence internal changes and quoted copies preserve values', async () => {
  const r = request('Change first feature icon to heart, use large icons and title "New title".');
  const output = await compose(r, fixture({ icon_features_0: { choice: 'heart', confidence: 0.1 }, canvas_0_icon: { choice: 'heart', confidence: 0.1 }, element_features_iconSize: { choice: 'large', confidence: 0.1 }, copy_0: { choice: 'item_features_0_title', confidence: 0.1 } }));
  assert.deepEqual(output.spec, validateSpec(r.spec));
  assert.ok(output.warnings.some((warning) => warning.includes('low distribution confidence')));
});
test('a control incompatible with the chosen block is reported and not silently stored', async () => {
  const output = await compose(request('Use two feature columns.'), fixture({ block_features: { choice: 'features-list' }, element_features_columns: { choice: 'two' } }));
  assert.equal(section(output.spec, 'features').elements.columns, 'default');
  assert.ok(output.warnings.some((warning) => warning.includes('unavailable in the selected component')));
});
test('a newly chosen block can receive element controls in the same bounded pass', async () => {
  const r = request('Change services to cards in two columns.'); section(r.spec, 'services').block = 'services-list';
  const output = await compose(r, fixture({ block_services: { choice: 'services-cards' }, element_services_columns: { choice: 'two' } }));
  assert.equal(section(output.spec, 'services').block, 'services-cards');
  assert.equal(section(output.spec, 'services').elements.columns, 'two');
});
test('unsupported changes are explained and mixed supported changes remain useful', async () => {
  const r = request('Add a custom SVG icon.');
  await assert.rejects(compose(r, demoEvaluate), /outside this builder|No changes were applied/);
  const output = await compose({ ...r, prompt: 'Use two feature columns and a custom SVG icon.' }, demoEvaluate);
  assert.equal(section(output.spec, 'features').elements.columns, 'two');
  assert.ok(output.warnings.some((warning) => /Only supported choices|supported frontend choices/.test(warning)));
});
test('unknown model values fail closed without changing the request', async () => {
  for (const overrides of [{ icon_features_0: { choice: '<svg onload=alert(1)>' } }, { element_features_columns: { choice: '999' } }, { copy_0: { choice: '__proto__' } }]) {
    const r = request('Change first feature title to "Hello".'), before = structuredClone(r);
    await assert.rejects(compose(r, fixture(overrides)), /outside the approved/); assert.deepEqual(r, before);
  }
});
test('selection metadata includes safe icon and item references, not existing item bodies, titles, links or images', async () => {
  const r = request('Change this icon to a heart.', 'features', 1);
  Object.assign(section(r.spec, 'features').items[1], { title: 'PRIVATE-NAME', body: 'PRIVATE-BODY', href: 'https://private.example', image: PNG_IMAGE });
  await compose(r, fixture({}, (input) => {
    const serialized = JSON.stringify(input);
    for (const secret of ['PRIVATE-NAME', 'PRIVATE-BODY', 'private.example', 'base64']) assert.ok(!serialized.includes(secret));
    assert.equal(input.state.selection.sectionId, 'features');
    assert.equal(input.state.selection.group, 'features');
    assert.equal(input.state.selection.itemIndex, 1);
    assert.equal(input.state.existing.sections.find((section) => section.group === 'features').items[1].index, 1);
  }));
});
test('selected page edits preserve independent pages and home content', async () => {
  const r = request('Use two service columns.', 'services');
  const child = createPage(r.spec, { id: 'child', title: 'Services', slug: 'services', template: 'services' }); section(child, 'services').block = 'services-cards';
  r.spec.pages.push(child); r.pageId = 'child';
  const before = validateSpec(r.spec), output = await compose(r, demoEvaluate);
  assert.deepEqual(output.spec.sections, before.sections); assert.deepEqual(output.spec.theme, before.theme);
  assert.equal(section(output.spec.pages[0], 'services').elements.columns, 'two');
});
test('maximum item counts, copy destinations and all pairwise questions stay bounded', async () => {
  const r = request('Move gallery before services. Set the first feature title to "One" and description to "Two".');
  r.spec.sections = GROUPS.filter(group=>!['testimonials','team','logos','stats'].includes(group)).map((group) => { const section = makeSection(group); if (section.items.length) section.items = Array.from({ length: 8 }, (_, index) => ({ ...structuredClone(section.items[0]), id: `item-${index}` })); if (section.featuredItemId) section.featuredItemId = section.items[1].id; return section; });
  await compose(r, fixture({}, ({ questions }) => {
    assert.ok(Object.keys(questions).length <= MAX_COMPOSITION_QUESTIONS);
    assert.ok(Object.values(questions).every((question) => Object.keys(question.criteria).length <= 255));
  }));
  assert.throws(() => assertQuestionBudget(Object.fromEntries(Array.from({ length: MAX_COMPOSITION_QUESTIONS + 1 }, (_, i) => [i, { criteria: { keep: 'Keep' } }]))), /budget/);
});

test('synthetic JEV choices share authored content and selected item placement vocabulary', async () => {
  const heroRequest = request('Move the hero action before its description.');
  const heroOutput = await compose(heroRequest, fixture({ element_hero_contentOrder: { choice: 'heading-action-body' }, element_hero_buttonIconPlacement: { choice: 'leading' } }));
  assert.equal(section(heroOutput.spec, 'hero').elements.contentOrder, 'heading-action-body');
  assert.equal(section(heroOutput.spec, 'hero').elements.buttonIconPlacement, 'leading');
  const r = request('Place this feature icon beside its text.', 'features', 1), before = validateSpec(r.spec);
  const output = await compose(r, fixture({ placement_features: { choice: 'item1_iconPlacement_beside' } }, ({ questions }) => {
    if (questions.placement_features) {
      assert.ok('item1_iconPlacement_beside' in questions.placement_features.criteria);
      assert.ok(!('item0_iconPlacement_beside' in questions.placement_features.criteria));
    }
  }));
  assert.equal(section(output.spec, 'features').items[1].placements.iconPlacement, 'beside');
  assert.deepEqual(section(output.spec, 'features').items[0], section(before, 'features').items[0]);
  assert.deepEqual(section(output.spec, 'features').elements, section(before, 'features').elements);
});

test('model ordinal highlight edits update the stable featured plan reference', async () => {
  const r = request('Highlight the third pricing plan.'); r.spec.sections.splice(-1, 0, makeSection('pricing'));
  const output = await compose(r, fixture({ element_pricing_featuredItem: { choice: 'third' } }));
  const pricing = section(output.spec, 'pricing');
  assert.equal(pricing.featuredItemId, pricing.items[2].id);
});
