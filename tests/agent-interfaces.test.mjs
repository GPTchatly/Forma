/** The AI application set: seven agent item types, five agent screens and two website blocks.
 * Every evaluator here is the offline demo, never live JEV; every block is a prepared demonstration. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpec, makeSection } from '../shared/content.mjs';
import { validateSpec, escapeHtml } from '../shared/schema.mjs';
import { renderBody } from '../shared/render.mjs';
import { blocksFor } from '../shared/catalog.mjs';
import { EXPANSION_BLOCKS } from '../shared/expansion.mjs';
import { INTERFACE_ITEM_TYPES, interfaceItemTypesFor, isInterfaceBlock } from '../shared/interfaces.mjs';
import { BLOCK_MANIFESTS, MANIFEST_BY_ID, itemFieldsFor, manifestProblems } from '../shared/blocks.mjs';
import { AGENT_BLOCKS, AGENT_ITEM_PARTS, agentItem, agentTools } from '../shared/blocks-agent.mjs';
import { fitFor } from '../shared/fit.mjs';
import { partsFor, isPartVisible } from '../shared/parts.mjs';
import { icon } from '../shared/icons.mjs';
import { interfacePlanningQuestions, interfaceQuestions } from '../server/interface-composer.mjs';
import { compose } from '../server/composer.mjs';
import { demoEvaluate } from '../server/demo.mjs';

const TYPES = ['message', 'toolcall', 'citation', 'plan', 'approval', 'artifact', 'meter'];
const SCREENS = ['app-agent-run', 'app-agent-chat', 'app-agent-inbox', 'app-usage', 'app-agent-setup'];
const pageOf = (...sections) => validateSpec({ ...createSpec(), sections });
// A section of a screen whose items are exactly `entries`, with fixed item ids.
function screenWith(block, entries) {
  const section = makeSection('hero', block), template = section.items[0];
  section.items = entries.map((entry, index) => ({ ...structuredClone(template), id: `item-${index}`, removedParts: [], ...entry }));
  // The workspace summary tab repeats item titles; hidden here so markers come from the item.
  if (block === 'app-workspace') section.interface.tabs = 'hide';
  return section;
}
const sample = (uiType, extra = {}) => ({ uiType, title: 'Same title', body: 'Same body', meta: 'Same label', price: '3 / 4', ...extra });
const count = (html, text) => html.split(text).length - 1;
const marker = (html, key, id) => new RegExp(`data-part-key="${key}"(?: data-part-slot="[^"]*")? data-owner-item-id="${id}"`).test(html);

test('AC-10 the schema accepts each agent item type and refuses an unknown one', () => {
  assert.deepEqual(Object.keys(AGENT_ITEM_PARTS), TYPES);
  for (const type of TYPES) {
    assert.ok(INTERFACE_ITEM_TYPES.includes(type), type);
    assert.equal(pageOf(screenWith('app-workspace', [sample(type)])).sections[0].items[0].uiType, type);
  }
  for (const unknown of ['agent-item', 'Message', 'script']) assert.throws(() => pageOf(screenWith('app-workspace', [sample(unknown)])), unknown);
});

test('AC-10 the agent screens and the custom workspace offer the agent types with a description', () => {
  for (const id of [...SCREENS, 'app-workspace']) {
    const offered = interfaceItemTypesFor(id).filter((type) => TYPES.includes(type));
    assert.ok(offered.length > 0, id);
    if (id === 'app-workspace') assert.deepEqual(offered, TYPES);
    const questions = interfaceQuestions(makeSection('hero', id));
    const items = Object.entries(questions).filter(([key]) => key.startsWith('interface_item_'));
    assert.ok(items.length > 0, id);
    for (const [key, question] of items) for (const type of offered) assert.ok(typeof question.criteria[type] === 'string' && question.criteria[type].trim(), `${id} ${key} ${type}`);
  }
});

test('AC-10 each agent type renders its own markup in an agent screen and in the custom workspace', () => {
  for (const host of ['app-agent-run', 'app-workspace']) {
    const markup = TYPES.map((type) => renderBody(pageOf(screenWith(host, [sample(type)])), { preview: true }));
    TYPES.forEach((type, index) => assert.ok(markup[index].includes(`ui-agent-${type}`), `${host} ${type}`));
    // Distinct beyond the type's own class name.
    const normalized = markup.map((html, index) => html.replaceAll(`ui-agent-${TYPES[index]}`, 'ui-agent-TYPE'));
    assert.equal(new Set(normalized).size, TYPES.length, host);
  }
  const list = renderBody(pageOf(screenWith('app-workspace', [sample('list')])));
  assert.ok(!list.includes('ui-agent-') && !list.includes('data-xp-block'));
  const meter = (price) => renderBody(pageOf(screenWith('app-usage', [sample('meter', { price })])));
  assert.ok(meter('40 / 100').includes('<meter min="0" max="100" value="40"'));
  assert.ok(meter('7 of 10 seats').includes('<meter min="0" max="10" value="7"'));
  assert.ok(meter('').includes('<meter min="0" max="1" value="0"'));
  assert.ok(meter('Add your limit').includes('<meter min="0" max="1" value="0"'));
});

test('AC-10 the shared item markup carries no interaction root, status region or item id, and one control only for an approval', () => {
  for (const type of TYPES) {
    const item = { id: 'item-direct', uiType: type, title: 'Title', body: 'Body', meta: 'Label', price: '1 / 2', removedParts: [] };
    const markup = agentItem(type, item, 0, agentTools(item, { escape: escapeHtml, visible: isPartVisible, attrs: (key) => ` data-part-key="${key}"`, icon }));
    assert.ok(markup.length > 0, type);
    for (const forbidden of ['data-xp-block', 'data-xp-widget', 'data-xp-modal', 'data-xp-record', 'data-xp-status', 'data-item-id', 'xp-agent-item']) assert.ok(!markup.includes(forbidden), `${type} ${forbidden}`);
    assert.deepEqual([...markup.matchAll(/data-xp-action="([^"]*)"/g)].map((match) => match[1]), type === 'approval' ? ['confirm'] : [], type);
  }
  const item = { id: 'item-direct', uiType: 'approval', title: 'Title', body: '', meta: '', price: '', removedParts: [] };
  const exported = agentItem('approval', item, 0, agentTools(item, { escape: escapeHtml, visible: isPartVisible, attrs: () => '', icon }));
  assert.ok(exported.includes('<button type="button" class="xp-control" data-xp-action="confirm" aria-pressed="false">Approve</button>'));
});

test('AC-10 inside the custom workspace every agent item is its own root and every approval has its own status region', () => {
  const section = screenWith('app-workspace', TYPES.map((type) => sample(type)));
  for (const preview of [false, true]) {
    const html = renderBody(pageOf(section), { preview });
    assert.equal(count(html, 'data-xp-block="agent-item"'), TYPES.length);
    assert.equal(count(html, 'data-xp-block='), TYPES.length);
    assert.equal(count(html, 'data-xp-status'), TYPES.filter((type) => type === 'approval').length);
    assert.ok(!html.includes('xp-agent-item'));
    const roots = html.split('<article class="ui-panel ui-agent-module ').slice(1);
    assert.equal(roots.length, TYPES.length);
    roots.forEach((root, index) => {
      assert.ok(root.startsWith(`ui-agent-${TYPES[index]}" data-ui-search-item data-xp-block="agent-item"`), TYPES[index]);
      if (TYPES[index] !== 'approval') { assert.ok(!root.includes('data-xp-status'), TYPES[index]); return; }
      // The approval is not the last root, so its segment ends where the next root begins.
      const control = root.indexOf('data-xp-action="confirm"'), status = root.indexOf('data-xp-status');
      assert.ok(control > 0 && status > control, 'the status region follows the confirm control inside the same root');
    });
  }
});

test('AC-10 each agent screen is one interaction root with one status region', () => {
  const behaviors = Object.fromEntries(AGENT_BLOCKS.map((manifest) => [manifest.id, manifest.behavior]));
  for (const id of SCREENS) {
    const section = makeSection('hero', id);
    section.items[0].uiType = 'approval';
    for (const preview of [false, true]) {
      const html = renderBody(pageOf(section), { preview });
      assert.equal(count(html, 'data-xp-block='), 1, id);
      assert.equal(count(html, `data-xp-block="${behaviors[id]}"`), 1, id);
      assert.ok(!html.includes('agent-item'), id);
      assert.equal(count(html, 'data-xp-status'), 1, id);
      assert.equal(count(html, 'data-xp-action="confirm"'), section.items.filter((item) => item.uiType === 'approval').length, id);
      assert.equal(count(html, 'data-xp-record'), section.items.length, id);
    }
  }
  assert.ok(!EXPANSION_BLOCKS.some((entry) => entry.behavior === 'agent-item'));
});

test('AC-11 the surface question offers the five agent screens and the demo builds each one it is asked for', async () => {
  assert.deepEqual(AGENT_BLOCKS.map((manifest) => manifest.id), [...SCREENS, 'hero-prompt', 'features-conversation']);
  assert.deepEqual(BLOCK_MANIFESTS.slice(-AGENT_BLOCKS.length), AGENT_BLOCKS);
  for (const operation of ['create', 'edit']) {
    const { surface } = interfacePlanningQuestions({ operation });
    for (const id of SCREENS) assert.ok(typeof surface.criteria[id] === 'string' && surface.criteria[id].length > 0, `${operation} ${id}`);
  }
  const request = (prompt) => ({ spec: createSpec(), prompt, operation: 'edit', mode: 'demo', locks: {} });
  const prompts = [...SCREENS.map((id) => [`Create a ${id} interface.`, id]), ['Build an agent run view.', 'app-agent-run'], ['A chat app with an artifact pane.', 'app-agent-chat'], ['An agent inbox for pending requests.', 'app-agent-inbox'], ['Show usage and limits for my plan.', 'app-usage'], ['An agent setup wizard.', 'app-agent-setup']];
  for (const [prompt, id] of prompts) {
    const result = await compose(request(prompt), demoEvaluate);
    assert.equal(result.spec.sections.find((section) => section.group === 'hero').block, id, prompt);
  }
});

test('AC-11 the two website blocks exist with their fixed fit data', () => {
  const expected = {
    'hero-prompt': { group: 'hero', fit: { pattern: 'interactive', items: [0, 8], image: 'none', text: 'medium', directions: ['product'], families: ['saas'] } },
    'features-conversation': { group: 'features', fit: { pattern: 'list', items: [1, 8], image: 'none', text: 'long', directions: ['editorial', 'expressive'], families: ['studio', 'portfolio'] } }
  };
  for (const [id, { group, fit }] of Object.entries(expected)) {
    assert.ok(blocksFor(group).some((block) => block.id === id), id);
    assert.ok(!isInterfaceBlock(id), id);
    assert.deepEqual(fitFor(id), fit, id);
    assert.equal(MANIFEST_BY_ID[id].media, 'none', id);
    assert.ok(itemFieldsFor(id), id);
  }
  assert.deepEqual(itemFieldsFor('features-conversation'), { meta: 'Speaker' });
});

test('AC-11 an agent screen has no fit and no declared fields and offers only known item types', () => {
  for (const id of SCREENS) {
    assert.ok(isInterfaceBlock(id), id);
    assert.ok(blocksFor('hero').some((block) => block.id === id), id);
    assert.equal(fitFor(id), null, id);
    assert.equal(itemFieldsFor(id), null, id);
    for (const type of interfaceItemTypesFor(id)) assert.ok(INTERFACE_ITEM_TYPES.includes(type), `${id} ${type}`);
  }
});

test('AC-10 an agent item has the parts of its type in an agent screen and in the custom workspace', () => {
  for (const type of TYPES) {
    const screen = AGENT_BLOCKS.find((manifest) => manifest.interface?.types.includes(type));
    assert.ok(screen, `${type} is offered by an agent screen`);
    for (const host of [screen.id, 'app-workspace']) {
      const section = screenWith(host, [sample(type)]), [item] = section.items;
      assert.deepEqual(partsFor(section, item.id).map((entry) => entry.partKey), [...AGENT_ITEM_PARTS[type]], `${host} ${type}`);
      const html = renderBody(pageOf(section), { preview: true });
      for (const key of AGENT_ITEM_PARTS[type]) assert.ok(marker(html, key, item.id), `${host} ${type} marks ${key}`);
      for (const key of AGENT_ITEM_PARTS[type]) {
        const removed = screenWith(host, [sample(type, { removedParts: [key] })]);
        assert.ok(!marker(renderBody(pageOf(removed), { preview: true }), key, removed.items[0].id), `${host} ${type} without ${key}`);
      }
    }
  }
});

test('AC-10 an item of another type in an agent screen has the parts and markup of the screen default', () => {
  for (const manifest of AGENT_BLOCKS.filter((entry) => entry.interface)) {
    for (const uiType of ['default', 'list', 'email']) {
      const section = screenWith(manifest.id, [sample(uiType)]), [item] = section.items, standard = manifest.interface.default;
      assert.deepEqual(partsFor(section, item.id).map((entry) => entry.partKey), [...AGENT_ITEM_PARTS[standard]], `${manifest.id} ${uiType}`);
      assert.ok(renderBody(pageOf(section)).includes(`ui-agent-entry ui-agent-${standard}`), `${manifest.id} ${uiType}`);
    }
  }
});

test('AC-10 the manifest check tells application and website manifests apart', () => {
  const screen = MANIFEST_BY_ID['app-agent-run'], website = MANIFEST_BY_ID['hero-prompt'];
  const own = (problems) => problems.filter((problem) => /an application manifest|a website manifest|manifest field interface/.test(problem));
  assert.deepEqual(own(manifestProblems(screen, {})), []);
  assert.deepEqual(own(manifestProblems(website, {})), []);
  assert.ok(manifestProblems({ ...screen, fit: website.fit }, {}).some((problem) => /an application manifest carries fit/.test(problem)));
  assert.ok(manifestProblems({ ...screen, id: 'agent-run-screen' }, {}).some((problem) => /an application manifest id must start with app-/.test(problem)));
  assert.ok(manifestProblems({ ...website, id: 'app-prompt' }, {}).some((problem) => /a website manifest id must not start with app-/.test(problem)));
  assert.ok(manifestProblems({ ...screen, interface: { types: ['plan'], default: 'meter' } }, {}).some((problem) => /manifest field interface/.test(problem)));
  assert.ok(manifestProblems({ ...screen, parts: { section: ['heading'], item: ['heading'] } }, {}).some((problem) => /lists no item parts/.test(problem)));
});

test('AC-SEC-1 the seven blocks and the agent types in the custom workspace escape hostile values', () => {
  const unsafe = /<script|<img src=x|<svg onload|onerror="|onmouseover="|href="javascript:|src="https?:/i;
  const hostile = (index) => ({ title: `Item ${index} <img src=x onerror=bad()>`, body: '<script>itemBad()</script>\n</textarea><script>out()</script>', meta: '" onmouseover="bad()', price: '1 / 2"><svg onload=bad()>' });
  const sections = AGENT_BLOCKS.map((manifest) => {
    const section = manifest.interface ? screenWith(manifest.id, TYPES.map((type, index) => ({ ...hostile(index), uiType: type }))) : makeSection(manifest.group, manifest.id);
    if (!manifest.interface) section.items.forEach((item, index) => Object.assign(item, hostile(index)));
    return Object.assign(section, { title: '<script>bad()</script>', body: 'Unsafe <img src=x onerror=bad()>', button: '"><script>button()</script>', eyebrow: '" onmouseover="bad()' });
  });
  sections.push(Object.assign(screenWith('app-workspace', TYPES.map((type, index) => ({ ...hostile(index), uiType: type }))), { title: '<script>bad()</script>' }));
  for (const section of sections) {
    assert.doesNotThrow(() => pageOf(section), section.block);
    for (const preview of [false, true]) assert.ok(!unsafe.test(renderBody(pageOf(section), { preview })), `${section.block} ${preview}`);
    const destination = structuredClone(section); destination.href = 'javascript:alert(1)';
    assert.throws(() => pageOf(destination), section.block);
  }
});

test('AC-SEC-7 the seven blocks say they are a prepared demonstration and reach nothing', () => {
  for (const manifest of AGENT_BLOCKS) {
    for (const preview of [false, true]) {
      const html = renderBody(pageOf(makeSection(manifest.group, manifest.id)), { preview });
      assert.ok(html.includes('Prepared demonstration'), manifest.id);
      assert.match(html, /no model is connected/i, manifest.id);
      assert.ok(!/http/i.test(html), manifest.id);
      assert.ok(!/<form\b[^>]*\baction=/i.test(html), manifest.id);
    }
  }
});
