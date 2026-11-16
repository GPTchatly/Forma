/** Block manifest registry and the catalog-wide block checks. The existing registries consult a
 * manifest first; the base blocks keep their own definitions. This module imports only the
 * manifest modules, so any shared module can read it without an import cycle. The checkers
 * read nothing but their arguments: the caller supplies inventories, renders and stylesheets. */
import { SITE_BLOCKS } from './blocks-site.mjs';
import { AGENT_BLOCKS } from './blocks-agent.mjs';

export const BLOCK_MANIFESTS = [...SITE_BLOCKS, ...AGENT_BLOCKS];
// No prototype: a block id read from data can never resolve to an inherited property.
export const MANIFEST_BY_ID = Object.freeze(Object.assign(Object.create(null), Object.fromEntries(BLOCK_MANIFESTS.map((manifest) => [manifest.id, manifest]))));
const ITEM_FIELDS = ['title', 'body', 'meta', 'price', 'href'];
const MEDIA = ['none', 'item', 'section'];

/** The declared editable item fields of a manifest block, or null for any other block,
 * including an application screen, whose manifest declares no fields. */
export function itemFieldsFor(blockId) {
  const manifest = typeof blockId === 'string' ? MANIFEST_BY_ID[blockId] : undefined;
  return manifest?.fields ? manifest.fields.item : null;
}

const known = (inventory) => inventory instanceof Set ? inventory : new Set(Array.isArray(inventory) ? inventory : []);
function translationProblems(id, label, text, inventory, locales) {
  if (typeof text !== 'string' || !text) return [`${id}: ${label} is missing`];
  const problems = known(inventory).has(text) ? [] : [`${id}: ${label} "${text}" is not in a message inventory`];
  for (const [locale, dictionary] of Object.entries(locales || {})) if (!dictionary || !Object.hasOwn(dictionary, text)) problems.push(`${id}: ${label} "${text}" has no ${locale} translation`);
  return problems;
}

/** Problems of any catalog block: translations of its name and description, fit data for a
 * website block, and its prepared content rendered alone under its section class. */
export function blockProblems(block, { inventory, locales, website = false, fit = null, html = '' } = {}) {
  const id = typeof block?.id === 'string' ? block.id : '(no id)';
  const problems = [...translationProblems(id, 'name', block?.name, inventory, locales), ...translationProblems(id, 'description', block?.description, inventory, locales)];
  if (website && !fit) problems.push(`${id}: website block has no fit data`);
  if (typeof html !== 'string' || !(html.includes(`class="site-section ${id}"`) || html.includes(`class="site-section ${id} `))) problems.push(`${id}: prepared content does not render under its section class`);
  return problems;
}

// Splits CSS text into the selector lists of its qualified rules, descending into @media and
// @supports. Returns null when the text cannot be read to the end or holds another at-rule.
function selectorLists(css) {
  const lists = [];
  let index = 0, prelude = '';
  const stack = [];
  while (index < css.length) {
    const character = css[index];
    if (character === '/' && css[index + 1] === '*') { const end = css.indexOf('*/', index + 2); if (end < 0) return null; index = end + 2; continue; }
    if (character === '"' || character === "'") {
      let end = index + 1;
      while (end < css.length && css[end] !== character) end += css[end] === '\\' ? 2 : 1;
      if (end >= css.length) return null;
      prelude += css.slice(index, end + 1); index = end + 1; continue;
    }
    if (character === '{') {
      const head = prelude.trim(); prelude = '';
      if (head.startsWith('@')) { if (!/^@(?:media|supports)\b/i.test(head)) return null; stack.push(head); index++; continue; }
      lists.push(head);
      // A rule body is skipped whole: it holds declarations, not selectors.
      let depth = 1; index++;
      while (index < css.length && depth) {
        const inner = css[index];
        if (inner === '"' || inner === "'") { let end = index + 1; while (end < css.length && css[end] !== inner) end += css[end] === '\\' ? 2 : 1; if (end >= css.length) return null; index = end + 1; continue; }
        if (inner === '/' && css[index + 1] === '*') { const end = css.indexOf('*/', index + 2); if (end < 0) return null; index = end + 2; continue; }
        if (inner === '{') depth++;
        else if (inner === '}') depth--;
        index++;
      }
      if (depth) return null;
      continue;
    }
    if (character === '}') { if (!stack.length || prelude.trim()) return null; stack.pop(); index++; continue; }
    if (character === ';' && prelude.trim().startsWith('@')) return null;
    prelude += character; index++;
  }
  return stack.length || prelude.trim() ? null : lists;
}
function splitSelectors(list) {
  const selectors = [];
  let depth = 0, start = 0, quote = '';
  for (let index = 0; index < list.length; index++) {
    const character = list[index];
    if (quote) { if (character === '\\') index++; else if (character === quote) quote = ''; continue; }
    if (character === '"' || character === "'") quote = character;
    else if (character === '(' || character === '[') depth++;
    else if (character === ')' || character === ']') depth--;
    else if (character === ',' && !depth) { selectors.push(list.slice(start, index).trim()); start = index + 1; }
  }
  selectors.push(list.slice(start).trim());
  return selectors;
}
function cssProblems(manifest) {
  const { id, behavior, css } = manifest;
  if (typeof css !== 'string') return [];
  const problems = /url\(|@import|</i.test(css) ? [`${id}: CSS contains url(, @import or <`] : [];
  const lists = selectorLists(css);
  if (!lists) return [...problems, `${id}: CSS cannot be read to the end or uses an at-rule other than @media and @supports`];
  const scopes = [`.xp-${behavior}`, `.site-section.${id}`];
  const scoped = (selector) => scopes.some((scope) => selector.startsWith(scope) && !/[\w-]/.test(selector[scope.length] || ''));
  for (const list of lists) for (const selector of splitSelectors(list)) if (!scoped(selector)) problems.push(`${id}: CSS selector "${selector}" is outside .xp-${behavior} and .site-section.${id}`);
  return problems;
}

/** Problems of a manifest: every block problem plus the manifest's own shape and rules.
 * An application manifest is told apart by its `interface` field: its id starts with `app-`,
 * its group is `hero`, its item types set its item parts, and it has no pattern, fit or fields.
 * `others` lists the other manifests and the base blocks; `taken` is the text of the static
 * stylesheet and the runtime scripts, whose class names a wrapper class must not reuse. */
export function manifestProblems(manifest, { inventory, locales, partLabels = {}, html = '', others = [], taken = '' } = {}) {
  if (!manifest || typeof manifest !== 'object') return ['A manifest must be an object.'];
  const id = typeof manifest.id === 'string' ? manifest.id : '(no id)';
  const application = manifest.interface !== undefined;
  const problems = blockProblems(manifest, { inventory, locales, website: !application, fit: manifest.fit, html });
  const name = /^[a-z][a-z0-9-]*$/;
  const strings = (value) => Array.isArray(value) && value.every((entry) => typeof entry === 'string');
  const website = {
    pattern: typeof manifest.pattern === 'string' && Boolean(manifest.pattern),
    fit: Boolean(manifest.fit) && Array.isArray(manifest.fit.items) && manifest.fit.items.length === 2 && manifest.fit.items.every(Number.isInteger) && manifest.fit.items[0] >= 0 && manifest.fit.items[0] <= manifest.fit.items[1] && manifest.fit.items[1] <= 8 && ['none', 'optional', 'led'].includes(manifest.fit.image) && ['short', 'medium', 'long'].includes(manifest.fit.text) && strings(manifest.fit.directions) && strings(manifest.fit.families),
    fields: Boolean(manifest.fields) && Boolean(manifest.fields.item) && typeof manifest.fields.item === 'object' && !Array.isArray(manifest.fields.item)
  };
  const screen = { interface: Boolean(manifest.interface) && typeof manifest.interface === 'object' && strings(manifest.interface.types) && manifest.interface.types.length > 0 && manifest.interface.types.includes(manifest.interface.default) };
  const shape = {
    id: name.test(manifest.id), group: typeof manifest.group === 'string' && Boolean(manifest.group), behavior: typeof manifest.behavior === 'string' && name.test(manifest.behavior),
    reference: manifest.reference === undefined || typeof manifest.reference === 'string' && Boolean(manifest.reference),
    ...(application ? screen : website),
    interactive: typeof manifest.interactive === 'boolean', media: MEDIA.includes(manifest.media),
    parts: Boolean(manifest.parts) && strings(manifest.parts.section) && strings(manifest.parts.item),
    elements: strings(manifest.elements),
    content: manifest.content === undefined || typeof manifest.content === 'function',
    render: typeof manifest.render === 'function', css: typeof manifest.css === 'string', expect: strings(manifest.expect)
  };
  for (const [field, valid] of Object.entries(shape)) if (!valid) problems.push(`${id}: manifest field ${field} is missing or has the wrong type`);
  // Every registry knows an application screen by the `app-` prefix of its id.
  const prefixed = typeof manifest.id === 'string' && manifest.id.startsWith('app-');
  if (application) {
    for (const field of Object.keys(website)) if (manifest[field] !== undefined) problems.push(`${id}: an application manifest carries ${field}`);
    if (!prefixed) problems.push(`${id}: an application manifest id must start with app-`);
    if (manifest.group !== 'hero') problems.push(`${id}: an application manifest must belong to the hero group`);
    if (shape.parts && manifest.parts.item.length) problems.push(`${id}: an application manifest lists no item parts; its item types set them`);
  } else if (prefixed) problems.push(`${id}: a website manifest id must not start with app-`);
  for (const other of Array.isArray(others) ? others : []) {
    if (other?.id === manifest.id) problems.push(`${id}: the id is already used`);
    if (other?.behavior && other.behavior === manifest.behavior) problems.push(`${id}: the behavior ${manifest.behavior} is already used`);
  }
  if (shape.behavior && new RegExp(`(?<![\\w-])xp-${manifest.behavior}(?![\\w-])`).test(String(taken))) problems.push(`${id}: the wrapper class xp-${manifest.behavior} already occurs in the shared stylesheet or a runtime script`);
  const labels = new Set(Array.isArray(partLabels) ? partLabels : Object.keys(partLabels || {}));
  if (shape.parts) for (const part of [...manifest.parts.section, ...manifest.parts.item]) if (!labels.has(part)) problems.push(`${id}: part ${part} has no label`);
  if (shape.fields) for (const [field, label] of Object.entries(manifest.fields.item)) {
    if (!ITEM_FIELDS.includes(field)) problems.push(`${id}: item field ${field} is not editable`);
    problems.push(...translationProblems(id, `label of item field ${field}`, label, inventory, locales));
  }
  if (shape.css) problems.push(...cssProblems(manifest));
  if (shape.expect && !manifest.expect.length) problems.push(`${id}: render expectations are missing`);
  if (shape.expect) for (const expected of manifest.expect) if (typeof html !== 'string' || !html.includes(expected)) problems.push(`${id}: the rendered block lacks "${expected}"`);
  return problems;
}
