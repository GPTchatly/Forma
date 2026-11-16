/** Block manifests, the catalog-wide block check, per-page CSS, declared item fields and the
 * bounded copy destinations. Synthetic evaluator inputs validate the contract, not live JEV. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { CATALOG, DEFAULT_BLOCKS, blocksFor } from '../shared/catalog.mjs';
import { EXPANSION_BLOCKS, EXPANSION_BY_ID, ANCHORED_GROUPS } from '../shared/expansion.mjs';
import { BLOCK_MANIFESTS, MANIFEST_BY_ID, itemFieldsFor, blockProblems, manifestProblems } from '../shared/blocks.mjs';
import { filterCss } from '../shared/page-css.mjs';
import { fitFor } from '../shared/fit.mjs';
import { isInterfaceBlock } from '../shared/interfaces.mjs';
import { PART_LABELS } from '../shared/parts.mjs';
import { createSpec, makeSection } from '../shared/content.mjs';
import { validateSpec, escapeHtml } from '../shared/schema.mjs';
import { renderBody, renderDocument, siteStylesheet, pageCss } from '../shared/render.mjs';
import { createExportFiles } from '../shared/export.mjs';
import { createPage, pageEntries, pageFilename } from '../shared/pages.mjs';
import { BUNDLED_NOTICES } from '../shared/notices.mjs';
import { catalogs } from '../public/i18n.mjs';
import { readCompose } from '../hosted/schemas.mjs';
import { compose, MAX_COMPOSITION_QUESTIONS } from '../server/composer.mjs';
import { demoEvaluate } from '../server/demo.mjs';
import { quotedEdits, copyQuestions, MAX_COPY_TARGETS } from '../server/element-edits.mjs';

const read = (name) => readFile(new URL(`../${name}`, import.meta.url), 'utf8');
const css = await read('public/site.css');
const runtimes = await Promise.all(['site-runtime.js', 'interface-runtime.js', 'interaction-runtime.js'].map((name) => read(`public/${name}`)));
const script = runtimes.join('\n').replace(/\r\n?/g, '\n');
const scriptHash = createHash('sha256').update(script).digest('base64');
const notices = Object.fromEntries(await Promise.all(BUNDLED_NOTICES.map(async (name) => [name, await read(`licenses/${name}.txt`)])));
const assets = { css, script, scriptHash, notices, originalLicense: await read('LICENSE') };
const localeDirectory = new URL('../public/locales/', import.meta.url);
const inventory = new Set((await Promise.all((await readdir(localeDirectory)).filter((name) => name.endsWith('-messages.json')).map(async (name) => JSON.parse(await readFile(new URL(name, localeDirectory), 'utf8'))))).flat());
const locales = Object.fromEntries(Object.entries(catalogs).filter(([locale]) => locale !== 'en'));
// The renderer's own block classes, rebuilt here so the filter can be applied to its output.
const blockClasses = { names: new Set([...CATALOG.map((block) => block.id), ...EXPANSION_BLOCKS.map((entry) => `xp-${entry.behavior}`)]), family: (name) => name === 'app-section' || name === 'app-interface' || name.startsWith('ui-') };
const pageOf = (...sections) => validateSpec({ ...createSpec(), sections });
const alone = (group, block) => pageOf(makeSection(group, block));
const styleOf = (html) => html.slice(html.indexOf('<style>') + 7, html.indexOf('</style>'));
// Synthetic distributions validate the contract, not live JEV quality.
const fixture = (changes = {}, observe = () => {}) => async (input) => {
  observe(input);
  const demo = await demoEvaluate(input);
  return { ...demo, model: 'blocks-fixture-not-live', usage: { input_tokens: 3, output_tokens: 2 }, answers: Object.fromEntries(Object.entries(input.questions).map(([key, question]) => {
    const choice = changes[key]?.choice ?? demo.answers[key].choice;
    return [key, { type: 'choice', choice, confidence: 1, probabilities: Object.fromEntries(Object.keys(question.criteria).map((value) => [value, value === choice ? 1 : 0])) }];
  })) };
};
// Every manifest block on one page, each section under its block id.
const allManifests = () => BLOCK_MANIFESTS.map((manifest) => ({ ...makeSection(manifest.group, manifest.id), id: manifest.id }));
// The same sections in manifest order, split into valid pages: at most 12 sections (the schema's
// limit), every application screen on a page of its own, and one section per anchored group.
const manifestPages = () => {
  const pages = [];
  let page = [];
  for (const section of allManifests()) {
    const screen = (entry) => isInterfaceBlock(entry.block);
    const anchoredTaken = ANCHORED_GROUPS.includes(section.group) && page.some((entry) => entry.group === section.group);
    if (page.length && (page.length >= 12 || screen(section) || screen(page.at(-1)) || anchoredTaken)) { pages.push(page); page = []; }
    page.push(section);
  }
  if (page.length) pages.push(page);
  return pages;
};

test('AC-5 every catalog block passes the catalog-wide check', () => {
  for (const block of CATALOG) {
    const html = renderBody(alone(block.group, block.id));
    assert.deepEqual(blockProblems(block, { inventory, locales, website: !isInterfaceBlock(block.id), fit: fitFor(block.id), html }), [], block.id);
  }
});

test('AC-5 every manifest passes the manifest check against the other blocks and the shared classes', () => {
  const taken = [css, ...runtimes].join('\n');
  for (const manifest of BLOCK_MANIFESTS) {
    const others = [...BLOCK_MANIFESTS.filter((other) => other !== manifest), ...CATALOG.filter((block) => !MANIFEST_BY_ID[block.id]).map((block) => ({ id: block.id, behavior: EXPANSION_BY_ID[block.id]?.behavior }))];
    const html = renderBody(alone(manifest.group, manifest.id));
    assert.deepEqual(manifestProblems(manifest, { inventory, locales, partLabels: PART_LABELS, html, others, taken }), [], manifest.id);
  }
});

test('AC-5 an incomplete manifest and an untranslated catalog entry are reported', () => {
  const [manifest] = BLOCK_MANIFESTS, html = renderBody(alone(manifest.group, manifest.id));
  const broken = { ...manifest, render: undefined, fields: { item: { title: 'An untranslated item label', icon: 'Icon' } }, expect: [], css: '.elsewhere{color:var(--ink)}', parts: { section: ['heading'], item: ['nonexistent'] } };
  const problems = manifestProblems(broken, { inventory, locales, partLabels: PART_LABELS, html, others: [manifest], taken: '' });
  for (const pattern of [/render is missing/, /label of item field title "An untranslated item label" is not in a message inventory/, /item field icon is not editable/, /render expectations are missing/, /CSS selector "\.elsewhere"/, /part nonexistent has no label/, /the id is already used/]) assert.ok(problems.some((problem) => pattern.test(problem)), String(pattern));
  const untranslated = blockProblems({ ...CATALOG[0], name: 'An untranslated block name' }, { inventory, locales, website: true, fit: fitFor(CATALOG[0].id), html: renderBody(alone(CATALOG[0].group, CATALOG[0].id)) });
  assert.ok(untranslated.some((problem) => /name "An untranslated block name" is not in a message inventory/.test(problem)));
  assert.ok(untranslated.some((problem) => /has no de translation/.test(problem)));
  assert.ok(blockProblems(CATALOG[0], { inventory, locales, website: true, fit: null, html: '' }).length >= 2, 'missing fit data and section class');
});

test('AC-6 the filter keeps live rules verbatim and leaves out rules every selector of which needs an absent block class', () => {
  const classes = { names: new Set(['a', 'b', 'c']), family: (name) => name === 'app-section' || name.startsWith('ui-') };
  const page = '<div class="x a"></div>';
  const cases = [
    ['.a,.b{x:1}', '.a,.b{x:1}'],
    ['.b,.c .y{x:1}.a{y:2}', '.a{y:2}'],
    [':is(.b){x:1}.x :not(.b){y:1}:where(.c) .y{z:1}', ':is(.b){x:1}.x :not(.b){y:1}:where(.c) .y{z:1}'],
    ['[data-x=".b{"]{x:1}.b::before{content:\'}\'}.a{y:2}', '[data-x=".b{"]{x:1}.a{y:2}'],
    ['/* note */.b{x:1}\n.a{y:1}', '/* note */\n.a{y:1}'],
    ['@media(max-width:5px){.a{x:1}.b{y:1}}', '@media(max-width:5px){.a{x:1}}'],
    ['@media print{.b{x:1}}.a{y:1}', '.a{y:1}'],
    ['@supports(display:grid){.b{x:1}.a .x{y:1}}', '@supports(display:grid){.a .x{y:1}}'],
    ['@keyframes b{from{opacity:0}}.b{x:1}', '@keyframes b{from{opacity:0}}'],
    ['.ui-x{a:1}.app-section .ui-y{b:1}.x{c:1}', '.x{c:1}']
  ];
  for (const [stylesheet, expected] of cases) assert.equal(filterCss(stylesheet, page, classes), expected, stylesheet);
  assert.equal(filterCss('.ui-x{a:1}.app-section .ui-y{b:1}', '<div class="ui-z"></div>', classes), '.ui-x{a:1}.app-section .ui-y{b:1}', 'one family class keeps the whole family');
});

test('AC-6 a page carries the site rules it can use and none it cannot', () => {
  const whole = siteStylesheet(css);
  const applicationRules = ['.site-section.app-section:not(header):not(footer){padding:0;min-width:0}', '.ui-chat-main{display:flex;flex-direction:column;min-width:0;min-height:0;background:var(--surface)}', '.ui-tab-indicator{position:absolute;left:0;top:0;pointer-events:none;border:1px solid var(--line);border-radius:8px;background:var(--surface);z-index:-1}'];
  const centered = '.hero-centered h1{font-size:clamp(46px,7.4vw,94px)}', halves = '.xp-halves{gap:0!important;align-items:stretch!important}';
  for (const rule of [...applicationRules, centered, halves]) assert.ok(whole.includes(rule), rule);
  const html = renderBody(validateSpec(createSpec())), filtered = pageCss(css, html);
  assert.equal(DEFAULT_BLOCKS.hero, 'hero-split');
  assert.ok(filtered.includes('.hero-split[data-element-media-placement="before"] .hero-inner{grid-template-columns:1fr 1.05fr}'));
  for (const rule of [...applicationRules, centered, halves]) assert.ok(!filtered.includes(rule), rule);
  assert.ok(filtered.length < whole.length * 0.9);
  const application = pageCss(css, renderBody(alone('hero', 'app-dashboard')));
  for (const rule of applicationRules) assert.ok(application.includes(rule), rule);
  assert.ok(pageCss(css, renderBody(alone('hero', 'hero-centered'))).includes(centered));
  assert.ok(pageCss(css, renderBody(alone('hero', 'hero-halves'))).includes(halves));
  const everything = `<div class="${[...blockClasses.names, 'app-section'].join(' ')}"></div>`;
  assert.equal(pageCss(css, everything), whole);
  assert.equal(filterCss(filtered, html, blockClasses), filtered);
});

test('AC-6 manifest CSS travels only with its block', () => {
  const html = renderBody(validateSpec(createSpec())), base = pageCss(css, html);
  for (const manifest of BLOCK_MANIFESTS) {
    assert.ok(pageCss(css, renderBody(alone(manifest.group, manifest.id))).includes(manifest.css), manifest.id);
    assert.ok(!new RegExp(`\\.xp-${manifest.behavior}(?![\\w-])`).test(base), manifest.id);
  }
});

test('AC-6 the shared agent item rules travel only with application screens', () => {
  const workspace = pageCss(css, renderBody(alone('hero', 'app-workspace')));
  assert.ok(/\.ui-agent-[\w-]+[^{]*\{/.test(workspace));
  assert.ok(workspace.includes('.ui-agent-approval .xp-control{margin-top:14px}'));
  assert.ok(!pageCss(css, renderBody(validateSpec(createSpec()))).includes('.ui-agent-'));
});

test('AC-6 exported source CSS equals the CSS inlined in its page', () => {
  const spec = pageOf(...allManifests().slice(0, 4));
  spec.pages = [createPage(spec, { id: 'child', title: 'Rooms', slug: 'rooms', template: 'services' })];
  const site = validateSpec(spec), files = createExportFiles(site, assets);
  assert.equal(pageEntries(site).length, 2);
  for (const page of pageEntries(site)) {
    const source = page.id === 'home' ? 'source/site.css' : `source/pages/${page.slug}.css`;
    assert.equal(files[source], styleOf(files[pageFilename(site, page.id)]), source);
  }
});

test('AC-7 a created section takes its chosen block content and keeps its ids; an existing one keeps its copy', async () => {
  const spec = validateSpec(createSpec()), inputs = [];
  spec.sections = spec.sections.filter((section) => section.group !== 'services');
  const output = await compose({ prompt: 'Add a services section.', operation: 'edit', mode: 'jev', spec, locks: {} }, fixture({ include_services: { choice: 'include' }, block_services: { choice: 'services-menu' } }, (input) => inputs.push(input)));
  const created = output.spec.sections.find((section) => section.group === 'services'), prepared = makeSection('services', 'services-menu');
  const planned = inputs[1].state.existing.sections.find((section) => section.id === 'services');
  assert.equal(created.id, 'services'); assert.equal(created.block, 'services-menu');
  assert.equal(created.title, prepared.title);
  assert.deepEqual(created.items.map(({ title, meta, price }) => ({ title, meta, price })), prepared.items.map(({ title, meta, price }) => ({ title, meta, price })));
  assert.ok(planned.items.length > 0 && planned.items.length < created.items.length);
  assert.deepEqual(created.items.slice(0, planned.items.length).map((item) => item.id), planned.items.map((item) => item.id));
  const authored = validateSpec(createSpec()), services = authored.sections.find((section) => section.group === 'services');
  services.title = 'Our own services heading'; services.items[0].title = 'Our own first service'; services.items[0].price = 'From our own price';
  const kept = (await compose({ prompt: 'Use a menu layout for services.', operation: 'edit', mode: 'jev', spec: authored, locks: {} }, fixture({ block_services: { choice: 'services-menu' } }))).spec.sections.find((section) => section.id === services.id);
  assert.equal(kept.block, 'services-menu'); assert.equal(kept.title, services.title);
  assert.deepEqual(kept.items.map(({ id, title, body, meta, price }) => ({ id, title, body, meta, price })), services.items.map(({ id, title, body, meta, price }) => ({ id, title, body, meta, price })));
});

// Each listed manifest block is composable in its group and renders its prepared content and its
// group's generic content with every item: by id in a preview render, by a unique title in an export.
function rendersEveryItem(ids) {
  for (const id of ids) {
    const manifest = MANIFEST_BY_ID[id];
    assert.ok(manifest, id);
    assert.ok(blocksFor(manifest.group).some((block) => block.id === manifest.id), manifest.id);
    assert.ok(fitFor(manifest.id), manifest.id);
    const generic = makeSection(manifest.group); generic.block = manifest.id;
    for (const section of [makeSection(manifest.group, manifest.id), generic]) {
      section.items.forEach((item, index) => { item.title = `Marker ${manifest.id} ${'abcdefgh'[index]}`; });
      const spec = pageOf(section), preview = renderBody(spec, { preview: true }), exported = renderBody(spec);
      for (const item of spec.sections[0].items) assert.ok(preview.includes(`data-item-id="${item.id}"`), `${manifest.id} ${item.id}`);
      assert.ok(!exported.includes('data-item-id'), manifest.id);
      for (const item of spec.sections[0].items) assert.ok(exported.includes(item.title), `${manifest.id} ${item.title}`);
    }
  }
}

test('AC-8 the ten family sections exist, are composable and render prepared and generic content with every item', () => {
  const listed = ['contact-hours', 'services-menu', 'gallery-rooms', 'features-amenities', 'process-schedule', 'team-speakers', 'pricing-tickets', 'logos-integrations', 'process-changelog', 'features-code'];
  assert.deepEqual(BLOCK_MANIFESTS.slice(0, listed.length).map((manifest) => manifest.id), listed);
  rendersEveryItem(listed);
});

test('AC-9 ten blocks fill the thin groups and render prepared and generic content with every item', () => {
  const listed = ['stats-cards', 'stats-split', 'stats-inline', 'logos-grid', 'quotes-wall', 'quotes-spotlight', 'team-cards', 'about-values', 'cta-split', 'cta-banner'];
  rendersEveryItem(listed);
  for (const [group, count] of Object.entries({ stats: 4, logos: 4, testimonials: 5, team: 4, about: 4, cta: 5 })) assert.ok(blocksFor(group).length >= count, `${group} has ${blocksFor(group).length} blocks`);
  // The two invitations show no items, so their section text is checked instead.
  for (const id of ['cta-split', 'cta-banner']) {
    const section = makeSection('cta', id);
    assert.equal(section.items.length, 0, id);
    Object.assign(section, { title: `Marker ${id} title`, body: `Marker ${id} body`, button: `Marker ${id} action` });
    const preview = renderBody(pageOf(section), { preview: true }), exported = renderBody(pageOf(section));
    for (const html of [preview, exported]) for (const text of [section.title, section.body, section.button]) assert.ok(html.includes(text), `${id} ${text}`);
  }
});

test('AC-19 the catalog and its displayed count derive from the registries', async () => {
  assert.equal(CATALOG.length, 105 + BLOCK_MANIFESTS.length);
  assert.equal(105 + BLOCK_MANIFESTS.length, 132);
  assert.equal(CATALOG.filter((block) => !isInterfaceBlock(block.id)).length, 104);
  assert.equal(CATALOG.filter((block) => isInterfaceBlock(block.id)).length, 28);
  assert.equal(CATALOG.filter((block) => MANIFEST_BY_ID[block.id]).length, BLOCK_MANIFESTS.length);
  const html = await read('public/index.html'), app = await read('public/app.mjs');
  assert.ok(html.includes('<p id="library-count"></p>')); assert.ok(!html.includes('105 blocks'));
  assert.ok(app.includes("$('#library-count').textContent = t('{blocks} blocks, {elements} reusable elements and {styles} styles. Preview, insert or replace a compatible component.', { blocks: formatNumber(CATALOG.length)"));
  for (const reference of new Set(BLOCK_MANIFESTS.map((manifest) => manifest.reference).filter(Boolean))) assert.ok(html.includes(`<option value="${reference}">`), reference);
});

// A page of `count` schedules of eight items each between navigation, hero and footer.
function densePage(count = 8) {
  const schedules = Array.from({ length: count }, (_, index) => {
    const n = index + 1, section = makeSection('process', 'process-schedule');
    section.id = n === 1 ? 'process' : `process-${n}`; section.title = `Programme ${n}`;
    section.items = Array.from({ length: 8 }, (_, item) => ({ ...structuredClone(section.items[0]), id: `p${n}-item-${item}`, title: `Slot ${n}-${item + 1}` }));
    if (section.featuredItemId) section.featuredItemId = section.items[1].id;
    return section;
  });
  return validateSpec({ ...createSpec(), sections: [makeSection('navigation'), makeSection('hero'), ...schedules, makeSection('footer')] });
}
const scheduleIds = (count = 8) => Array.from({ length: count }, (_, index) => index ? `process-${index + 1}` : 'process');
const scheduleFields = ['title', 'body', 'meta', 'price'];
const sectionKeys = ['section_hero_title', 'section_footer_body', ...scheduleIds().flatMap((id) => ['eyebrow', 'title', 'body'].map((field) => `section_${id}_${field}`))];
const quote = 'Set this time to "10:30".';

test('AC-20 copy destinations stop at the limit and keep the selection', () => {
  const selected = { prompt: quote, spec: densePage(), selectedSectionId: 'process-6', selectedItemIndex: 2 };
  const candidates = quotedEdits(selected), [candidate] = candidates, keys = Object.keys(candidate.targets);
  assert.equal(candidates.length, 1); assert.equal(keys.length, MAX_COPY_TARGETS); assert.ok(candidate.omitted > 0);
  const expected = [...scheduleFields.map((field) => `item_process-6_2_${field}`), ...['eyebrow', 'title', 'body'].map((field) => `section_process-6_${field}`), ...Array.from({ length: 8 }, (_, index) => scheduleFields.map((field) => `item_process-6_${index}_${field}`)).flat(), ...sectionKeys, 'item_process_0_title'];
  for (const key of expected) assert.ok(keys.includes(key), key);
  assert.ok(!keys.includes('item_process-8_7_price'));
  const unselected = { prompt: quote, spec: densePage() }, [plain] = quotedEdits(unselected);
  assert.equal(Object.keys(plain.targets).length, MAX_COPY_TARGETS);
  for (const key of sectionKeys) assert.ok(Object.hasOwn(plain.targets, key), key);
  assert.deepEqual(quotedEdits(selected), candidates); assert.deepEqual(quotedEdits(unselected), quotedEdits(unselected));
});

test('AC-20 pages under the limit list every destination in page order', () => {
  const spec = densePage(2), [candidate] = quotedEdits({ prompt: quote, spec }), order = spec.sections.map((section) => section.id);
  assert.equal(candidate.omitted, 0); assert.ok(Object.keys(candidate.targets).length <= MAX_COPY_TARGETS);
  let previous = { position: -1, item: false, index: -1 };
  for (const target of Object.values(candidate.targets)) {
    const position = order.indexOf(target.sectionId), item = target.itemIndex !== undefined;
    assert.ok(position >= previous.position);
    if (position === previous.position) { assert.ok(item || !previous.item); if (item && previous.item) assert.ok(target.itemIndex >= previous.index); }
    previous = { position, item, index: item ? target.itemIndex : -1 };
  }
});

test('AC-20 named titles outrank unnamed items', () => {
  const [slot] = quotedEdits({ prompt: 'Set the time of Slot 8-8 to "10:30".', spec: densePage() });
  assert.equal(Object.keys(slot.targets).length, MAX_COPY_TARGETS);
  for (const field of scheduleFields) assert.ok(Object.hasOwn(slot.targets, `item_process-8_7_${field}`), field);
  assert.ok(!Object.hasOwn(slot.targets, 'item_process-8_0_title'));
  const [programme] = quotedEdits({ prompt: 'In Programme 8 set the last time to "10:30".', spec: densePage() });
  assert.equal(Object.keys(programme.targets).length, MAX_COPY_TARGETS);
  assert.ok(Object.hasOwn(programme.targets, 'item_process-8_7_price'));
  assert.ok(!Object.hasOwn(programme.targets, 'item_process-7_7_price'));
});

test('AC-20 the copy question says when destinations are missing', () => {
  const sentence = 'This page has more possible destinations than one question can list. The selected section, the section-level fields of every section and items named by title are listed first, and some other items are missing. If the requested destination is not listed, choose keep.';
  const cut = copyQuestions(quotedEdits({ prompt: quote, spec: densePage(), selectedSectionId: 'process-6', selectedItemIndex: 2 })).copy_0;
  assert.equal(Object.keys(cut.criteria).length, MAX_COPY_TARGETS + 1); assert.ok(cut.instructions.includes(sentence));
  assert.ok(!copyQuestions(quotedEdits({ prompt: quote, spec: densePage(2) })).copy_0.instructions.includes(sentence));
});

test('AC-20 a quoted replacement on a dense page is applied in edit and redesign', async () => {
  const copyOf = (sections) => Object.fromEntries(sections.map((section) => [section.id, { eyebrow: section.eyebrow, title: section.title, body: section.body, button: section.button, href: section.href, items: section.items.map(({ id, title, body, meta, price, href }) => ({ id, title, body, meta, price, href })) }]));
  for (const operation of ['edit', 'redesign']) {
    const spec = densePage(), inputs = [];
    const output = await compose({ prompt: quote, operation, mode: 'jev', spec, locks: {}, selectedSectionId: 'process-6', selectedItemIndex: 2 }, fixture({ copy_0: { choice: 'item_process-6_2_price' } }, (input) => inputs.push(input)));
    assert.equal(inputs.length, 2, operation); assert.equal(output.report.calls, 2, operation);
    for (const { questions } of inputs) {
      assert.ok(Object.keys(questions).length <= MAX_COMPOSITION_QUESTIONS, operation);
      assert.ok(Object.values(questions).every((question) => Object.keys(question.criteria).length <= 255), operation);
    }
    const offered = Object.keys(inputs[1].questions.copy_0.criteria);
    assert.equal(offered.length, MAX_COPY_TARGETS + 1); assert.ok(offered.includes('item_process-6_2_price'));
    const expected = validateSpec(spec); expected.sections.find((section) => section.id === 'process-6').items[2].price = '10:30';
    assert.deepEqual(copyOf(output.spec.sections), copyOf(expected.sections), operation);
  }
});

test('AC-21 a manifest block renders an item field if and only if it declares it', () => {
  // Shown means visible text, or for a destination an href; item attributes carry no shown copy.
  const text = (html) => html.replace(/<[^>]*>/g, ' ');
  // Application screens declare no fields; the inspector treats them as application screens.
  for (const manifest of BLOCK_MANIFESTS.filter((entry) => entry.fields)) for (const field of ['meta', 'price', 'href']) {
    const section = makeSection(manifest.group, manifest.id), marker = `marker${field}${manifest.behavior.replaceAll('-', '')}`;
    for (const item of section.items) item[field] = field === 'href' ? `https://example.com/${marker}` : marker;
    const html = renderBody(pageOf(section)), shown = field === 'href' ? html.includes(`href="https://example.com/${marker}"`) : text(html).includes(marker);
    assert.equal(shown, Object.hasOwn(itemFieldsFor(manifest.id), field), `${manifest.id} ${field}`);
  }
});

test('AC-21 quoted copy offers the declared item fields of a manifest block', () => {
  const spec = pageOf(makeSection('contact', 'contact-hours')), [candidate] = quotedEdits({ prompt: 'Set the hours to "Closed".', spec });
  assert.ok(Object.hasOwn(candidate.targets, 'item_contact_0_price'));
  assert.ok(candidate.targets.item_contact_0_price.description.endsWith('first item hours.'));
  assert.ok(Object.hasOwn(candidate.targets, 'item_contact_0_title') && Object.hasOwn(candidate.targets, 'item_contact_0_body'));
  for (const field of ['meta', 'href']) assert.ok(!Object.hasOwn(candidate.targets, `item_contact_0_${field}`), field);
});

test('AC-21 a deleted item heading leaves the code example panel and its tab, and restoring it brings both back', () => {
  const section = makeSection('features', 'features-code');
  section.items.forEach((item, index) => { item.title = `Marker code heading ${'abc'[index]}`; });
  const render = (removed) => {
    section.items[0].removedParts = removed;
    const spec = pageOf(structuredClone(section));
    return [renderBody(spec, { preview: true }), renderBody(spec)];
  };
  for (const html of render(['heading'])) {
    assert.ok(!html.includes('Marker code heading a'), 'deleted text is gone from the panel and the tab');
    assert.ok(html.includes('>Example 1</button>'), 'the tab takes the positional fallback');
    assert.ok(html.includes('Marker code heading b') && html.includes('>Marker code heading b</button>'), 'other items keep their tab');
  }
  for (const html of render([])) {
    assert.ok(html.includes('<h3') && html.includes('>Marker code heading a</h3>'), 'the panel heading returns');
    assert.ok(html.includes('>Marker code heading a</button>') && !html.includes('>Example 1</button>'), 'the tab text returns');
  }
});

test('AC-21 declared item fields reach the exported page and project file', () => {
  let count = 0;
  for (const sections of manifestPages()) {
    const values = [];
    // A section without declared fields (an application screen) contributes no value.
    for (const section of sections) for (const field of ['meta', 'price', 'href'].filter((name) => itemFieldsFor(section.block) && Object.hasOwn(itemFieldsFor(section.block), name))) {
      const value = field === 'href' ? `https://example.com/${section.id}-link` : `Declared ${field} of ${section.id}`;
      for (const item of section.items) item[field] = value;
      values.push(value);
    }
    const files = createExportFiles(pageOf(...sections), assets);
    for (const value of values) { assert.ok(files['index.html'].includes(value), value); assert.ok(files['project.json'].includes(value), value); }
    count += values.length;
  }
  assert.ok(count >= 10);
});

test('AC-SEC-1 manifest blocks escape hostile values and the schema refuses script destinations', () => {
  for (const manifest of BLOCK_MANIFESTS) {
    const section = makeSection(manifest.group, manifest.id);
    Object.assign(section, { title: '<script>bad()</script>', body: 'Unsafe <img src=x onerror=bad()>', button: '"><script>button()</script>', eyebrow: '" onmouseover="bad()' });
    for (const item of section.items) Object.assign(item, { title: 'Item <img src=x onerror=bad()>', body: '<script>itemBad()</script>', meta: '" onmouseover="bad()', price: '<svg onload=bad()>' });
    const spec = createSpec(); spec.sections = [section];
    const html = renderBody(spec, { preview: true });
    assert.doesNotThrow(() => validateSpec(spec), manifest.id);
    assert.ok(!/<script|<img src=x|<svg onload|onerror="|onmouseover="|href="javascript:|src="https?:/i.test(html), manifest.id);
    // A block without items (the invitations) has only the section destination to refuse.
    for (const owner of [section, ...section.items.slice(0, 1)]) {
      const hostile = structuredClone(spec), target = owner === section ? hostile.sections[0] : hostile.sections[0].items[0];
      target.href = 'javascript:alert(1)';
      assert.throws(() => validateSpec(hostile), manifest.id);
    }
  }
});

test('AC-SEC-2 an exported page keeps the base content security policy', () => {
  const policy = `default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'sha256-${scriptHash}'; base-uri 'none'; form-action 'none'; object-src 'none'; connect-src 'none'; font-src 'none'`;
  for (const sections of manifestPages()) {
    const files = createExportFiles(pageOf(...sections), assets);
    assert.equal(files['index.html'].match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)">/)[1], escapeHtml(policy));
    assert.ok(renderDocument(pageOf(...sections), { css, script, scriptHash }).includes(`content="${escapeHtml(policy)}"`));
  }
});

test('AC-SEC-5 hosted validation accepts a spec with the new blocks', async () => {
  const accepted = [];
  for (const sections of manifestPages()) {
    const spec = pageOf(...sections);
    const request = new Request('https://forma.example/api/compose', { method: 'POST', headers: { host: 'forma.example', 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'jev', operation: 'edit', prompt: 'Refine the page', spec }) });
    accepted.push(...(await readCompose(request)).spec.sections.map((section) => section.block));
  }
  assert.deepEqual(accepted, BLOCK_MANIFESTS.map((manifest) => manifest.id));
});

test('AC-SEC-6 manifest CSS loads nothing and manifest markup references no network address', () => {
  for (const manifest of BLOCK_MANIFESTS) {
    assert.ok(!/url\(|@import|</i.test(manifest.css), manifest.id);
    assert.ok(!/http/i.test(renderBody(alone(manifest.group, manifest.id))), manifest.id);
  }
});

test('AC-FAIL-2 a stylesheet the filter cannot read to the end is returned whole', () => {
  const page = '<div class="a"></div>';
  for (const stylesheet of ['.b{x:1', '.b{x:1}}.a{y:1}', '.b{x:1}/* open comment', '.b::before{content:"open}.a{y:1}', '@media print{.b{x:1}']) assert.equal(filterCss(stylesheet, page, blockClasses), stylesheet, stylesheet);
  for (const value of [null, undefined, 42, { css: '.b{}' }]) assert.equal(filterCss(value, page, blockClasses), value);
});

test('AC-MIG-1 base-shaped and version one projects validate, stay idempotent and render', async () => {
  const examples = (await readdir(new URL('../examples/', import.meta.url))).filter((name) => name.endsWith('.project.json'));
  const legacy = createSpec(); legacy.schemaVersion = 1; delete legacy.theme.style;
  const documents = [createSpec(), legacy, ...await Promise.all(examples.map(async (name) => JSON.parse(await read(`examples/${name}`))))];
  assert.ok(examples.length >= 3);
  const baseKeys = Object.keys(validateSpec(createSpec()).sections[0]).sort();
  for (const raw of documents) {
    const spec = validateSpec(raw);
    assert.equal(spec.schemaVersion, 2); assert.deepEqual(validateSpec(spec), spec);
    assert.ok(spec.sections.every((section) => !MANIFEST_BY_ID[section.block]));
    for (const section of spec.sections) assert.deepEqual(Object.keys(section).sort(), baseKeys);
    const html = renderDocument(spec, { css, script, scriptHash });
    for (const section of spec.sections) assert.ok(html.includes(`id="${section.id}"`), section.id);
  }
});
