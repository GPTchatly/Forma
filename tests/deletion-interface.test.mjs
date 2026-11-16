import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpec, makeInterfaceSection } from '../shared/content.mjs';
import { INTERFACE_BLOCKS } from '../shared/interfaces.mjs';
import { partsFor } from '../shared/parts.mjs';
import { validateSpec } from '../shared/schema.mjs';
import { renderInterface } from '../shared/interface-render.mjs';

function render(section, preview = false) {
  const spec = validateSpec({ ...createSpec(), sections: [section] });
  return renderInterface(spec.sections[0], spec, { preview });
}

test('application sections omit deleted heading, copy and main action in preview and export', () => {
  for (const { id } of INTERFACE_BLOCKS) {
    const section = makeInterfaceSection(id);
    Object.assign(section, { title: 'Unique section heading', body: 'Unique section description', eyebrow: 'Unique section eyebrow', button: 'Unique section action' });
    section.removedParts = ['heading', 'body', 'eyebrow', 'action'];
    for (const preview of [false, true]) {
      const html = render(section, preview);
      for (const text of [section.title, section.body, section.eyebrow, section.button]) assert.ok(!html.includes(text), `${id}: ${text}`);
      assert.ok(!html.includes('data-part-key="heading" data-owner-item-id="undefined"'));
    }
  }
});

test('deleting application form omits its subtree and preserves independent content', () => {
  for (const { id } of INTERFACE_BLOCKS) {
    const section = makeInterfaceSection(id);
    if (!partsFor(section).some(({ partKey }) => partKey === 'form')) continue;
    section.removedParts = ['form'];
    const html = render(section);
    assert.doesNotMatch(html, /<form\b/, id);
    assert.ok(html.includes(section.title), id);
    if (id === 'app-checkout') assert.ok(html.includes('ui-order-item'));
  }
});

test('deleting a field control removes the input but keeps other fields functional', () => {
  const section = makeInterfaceSection('app-login');
  const removed = section.items[0];
  removed.removedParts = ['control', 'heading', 'body', 'meta'];
  const html = render(section, true);
  assert.ok(!html.includes(`id="ui-${section.id}-${removed.id}"`));
  assert.ok(!html.includes(`for="ui-${section.id}-${removed.id}"`));
  assert.ok(html.includes('type="password"'));
  assert.ok(!html.includes('you@example.com'));
});

test('deleting a visual field heading preserves an accessible input name', () => {
  const section = makeInterfaceSection('app-login');
  section.items[0].removedParts = ['heading'];
  const html = render(section);
  assert.ok(html.includes('aria-label="Email address"'));
  assert.ok(!html.includes(`for="ui-${section.id}-${section.items[0].id}"`));
  assert.ok(html.includes('type="email"'));
});

test('application button label and glyph can be deleted independently of its action', () => {
  const section = makeInterfaceSection('app-login');
  section.removedParts = ['buttonLabel', 'buttonIcon'];
  const button = render(section).match(/<button type="submit"[\s\S]*?<\/button>/)?.[0];
  assert.ok(button);
  assert.ok(button.includes(`aria-label="${section.button}"`));
  assert.doesNotMatch(button, /button-label|<svg/);
});

test('workspace item parts are omitted from saved markup for all typed modules', () => {
  for (const type of ['stat', 'list', 'chart', 'table', 'task', 'product', 'action', 'form', 'text', 'textarea', 'checkbox', 'select']) {
    const section = makeInterfaceSection('app-workspace');
    section.interface.tabs = 'hide';
    const item = { ...section.items[0], uiType: type, title: 'Unique item heading', body: 'Unique item body', meta: 'Unique item meta', price: 'Unique item price' };
    item.removedParts = ['heading', 'body', 'meta', 'price', 'icon', 'media', 'control', 'buttonLabel', 'buttonIcon'];
    section.items = [item];
    const html = render(section, true);
    for (const text of [item.title, item.body, item.meta, item.price]) assert.ok(!html.includes(`>${text}<`), `${type}: ${text}`);
    for (const key of item.removedParts) assert.ok(!html.includes(`data-part-key="${key}" data-owner-item-id="${item.id}"`), `${type}: ${key}`);
    assert.ok(!html.includes(`id="ui-${section.id}-${item.id}"`), type);
    assert.ok(!html.includes('ui-chart-bars'), type);
    assert.ok(!html.includes('ui-product-art'), type);
  }
});

test('deleted application navigation, search, tabs and metrics leave no controls', () => {
  const section = makeInterfaceSection('app-dashboard');
  section.removedParts = ['navigation', 'search', 'tabs', 'metrics'];
  const html = render(section);
  assert.doesNotMatch(html, /class="ui-sidebar"|data-ui-search(?:\s|>)|data-ui-tab=|class="ui-stats/);
  assert.ok(html.includes('ui-chart-panel'));
});

test('empty application sections render without regenerating deleted items', () => {
  for (const { id } of INTERFACE_BLOCKS) {
    const section = makeInterfaceSection(id);
    const previousTitles = section.items.map((item) => item.title);
    section.items = [];
    const html = render(section, true);
    assert.doesNotMatch(html, /data-item-id=|class="ui-derived-stats"/, id);
    for (const title of previousTitles) assert.ok(!html.includes(`>${title}<`), `${id}: ${title}`);
  }
});

test('inbox deleted parts are absent from both thread and initial reading pane', () => {
  const section = makeInterfaceSection('app-inbox');
  section.items[0].removedParts = ['heading', 'body', 'meta', 'icon'];
  const html = render(section, true);
  for (const text of [section.items[0].title, section.items[0].body, section.items[0].meta]) assert.ok(!html.includes(`>${text}<`));
  assert.doesNotMatch(html, /data-ui-message-title|data-ui-message-meta|data-ui-message-body|data-ui-message-icon/);
  assert.ok(html.includes('data-ui-removed-parts="heading body meta icon"'));
});

test('part ownership markers exist only in editor preview', () => {
  const section = makeInterfaceSection('app-chat');
  const preview = render(section, true);
  assert.ok(preview.includes(`data-part-key="buttonLabel" data-owner-item-id="${section.items[0].id}"`));
  assert.doesNotMatch(render(section), /data-part-key=|data-owner-item-id=/);
});
