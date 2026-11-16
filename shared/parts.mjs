/** Authored removable parts. Saved values are finite keys, never selectors or markup. */
import { interfaceFieldsFor, isInterfaceBlock } from './interfaces.mjs';
import { EXPANSION_BY_ID, EVIDENCE_GROUPS } from './expansion.mjs';
import { MANIFEST_BY_ID } from './blocks.mjs';
import { AGENT_ITEM_PARTS, agentItemType } from './blocks-agent.mjs';

export const PART_LABELS = Object.freeze({
  heading: 'Heading', body: 'Description', eyebrow: 'Eyebrow', action: 'Primary action',
  buttonLabel: 'Button text', buttonIcon: 'Button icon', icon: 'Icon', media: 'Image',
  meta: 'Label', price: 'Price', number: 'Number', brand: 'Brand', navigation: 'Navigation links',
  secondaryAction: 'Secondary action', footnote: 'Footnote', decoration: 'Decoration',
  form: 'Form', control: 'Input control', nameField: 'Name field', emailField: 'Email field', messageField: 'Message field',
  backToTop: 'Back to top', search: 'Search', tabs: 'Tabs', metrics: 'Metrics'
});
const english = (message) => message;
const fieldTypes = ['text', 'email', 'password', 'textarea', 'select', 'checkbox', 'number', 'date'];
const buttonParts = ['action', 'buttonLabel', 'buttonIcon'];

/** Match authored renderer paths, which sometimes override an item's saved type. */
function interfaceItemParts(section, item) {
  // A manifest screen draws an item of a type outside the agent types as its default type.
  const manifest = MANIFEST_BY_ID[section.block];
  if (manifest?.interface) {
    const agentType = agentItemType(item, manifest.interface.default);
    return Object.hasOwn(AGENT_ITEM_PARTS, agentType) ? [...AGENT_ITEM_PARTS[agentType]] : [];
  }
  const fallback = ['app-login', 'app-signup', 'app-settings', 'app-checkout', 'app-editor'].includes(section.block) ? 'text' : 'list';
  const type = item.uiType && item.uiType !== 'default' ? item.uiType : fallback;
  if (section.block === 'app-chat') return ['heading', 'body', 'meta', 'icon', ...(section.items.indexOf(item) < 4 ? buttonParts : [])];
  if (section.block === 'app-inbox') return ['heading', 'body', 'meta', 'icon'];
  if (section.block === 'app-table') return ['heading', 'body', 'meta', 'price', 'icon'];
  if (section.block === 'app-board') return ['heading', 'body', 'meta', 'icon', 'control'];
  if (section.block === 'app-storefront') return ['heading', 'body', 'meta', 'price', 'media', 'action', 'buttonIcon'];
  if (['app-login', 'app-signup', 'app-settings', 'app-checkout'].includes(section.block)) {
    if (section.block === 'app-checkout' && type === 'product') return ['heading', 'body', 'meta', 'price', 'media'];
    if (type === 'action') return [...buttonParts];
    return ['heading', 'body', 'control', ...(type === 'checkbox' ? [] : ['meta'])];
  }
  if (section.block !== 'app-calendar') {
    if (Object.hasOwn(AGENT_ITEM_PARTS, type)) return [...AGENT_ITEM_PARTS[type]];
    if (type === 'table') return ['heading', 'body', 'meta', 'price', 'icon'];
    if (fieldTypes.includes(type)) return ['heading', 'body', 'control', ...(type === 'checkbox' ? [] : ['meta'])];
    if (type === 'stat') return ['heading', 'body', 'meta', 'price'];
    if (type === 'chart') return ['heading', 'body', 'meta', 'media'];
    if (type === 'task') return ['heading', 'body', 'meta', 'icon', 'control'];
    if (type === 'product') return ['heading', 'body', 'meta', 'price', 'media', 'action', 'buttonIcon'];
    if (type === 'action') return ['heading', 'body', 'icon', ...buttonParts];
    if (type === 'form') return ['heading', 'body', 'form', 'control', ...buttonParts];
  }
  return ['heading', 'body', 'meta', 'icon', ...(item.price ? ['price'] : [])];
}

export function isPartVisible(owner, partKey) {
  const removed = owner?.removedParts || [];
  if (removed.includes(partKey)) return false;
  if (['buttonLabel', 'buttonIcon'].includes(partKey) && removed.includes('action')) return false;
  if (['nameField', 'emailField', 'messageField'].includes(partKey) && removed.includes('form')) return false;
  return true;
}

/** Includes removed parts so the editor can offer restoration after deletion. */
export function partsFor(section, itemId, t = english) {
  if (!section) return [];
  const item = itemId === undefined || itemId === null ? null : section.items?.find((entry) => entry.id === itemId);
  if (itemId !== undefined && itemId !== null && !item) return [];
  const keys = [];
  const manifest = MANIFEST_BY_ID[section.block];
  // The items of an application screen take their parts from their type, not the manifest.
  if (manifest) return (item ? manifest.interface ? interfaceItemParts(section, item) : manifest.parts.item : manifest.parts.section).map((partKey) => ({ partKey, label: t(PART_LABELS[partKey]) }));
  if (EXPANSION_BY_ID[section.block]) {
    const behavior = EXPANSION_BY_ID[section.block].behavior;
    const expanded = item ? ['heading', 'body'] : ['heading', 'body'];
    if (item) {
      if (!['analytics', 'billing-account', 'wizard'].includes(behavior)) expanded.push('meta');
      if (['pricing', 'stats', 'services'].includes(section.group) || ['product', 'analytics'].includes(behavior)) expanded.push('price');
      if (['gallery', 'team', 'logos'].includes(section.group) || ['tabs', 'alternating', 'expand-grid', 'collage', 'tour', 'product'].includes(behavior)) expanded.push('media');
      if (section.group === 'features' && behavior !== 'matrix') expanded.push('icon');
      if (['pricing', 'services', 'contact'].includes(section.group) || ['tabs', 'tour', 'product'].includes(behavior)) expanded.push(...buttonParts);
      if (['project', 'billing-account', 'wizard', 'inquiry'].includes(behavior)) expanded.push('control');
    } else if (section.group === 'navigation') {
      expanded.splice(0, expanded.length, 'brand', 'navigation', ...buttonParts);
    } else if (section.group === 'footer') {
      expanded.splice(0, expanded.length, 'brand', 'body', 'navigation', 'backToTop');
    } else {
      if (['hero', 'cta', 'contact'].includes(section.group) && behavior !== 'inquiry') expanded.push(...buttonParts);
      if (['cover', 'halves', 'browser', 'phone', 'layers', 'image-cta'].includes(behavior)) expanded.push('media');
    }
    return expanded.map((partKey) => ({ partKey, label: t(PART_LABELS[partKey]) }));
  }
  const add = (...parts) => keys.push(...parts);
  const action = () => add('action', 'buttonLabel', 'buttonIcon');
  if (isInterfaceBlock(section)) {
    if (item) {
      add(...interfaceItemParts(section, item));
    } else {
      add('heading', 'body', 'eyebrow'); action();
      add(...interfaceFieldsFor(section).filter((key) => !['layout', 'tabStyle'].includes(key)));
      if (['app-login', 'app-signup', 'app-chat', 'app-settings', 'app-inbox', 'app-checkout', 'app-editor', 'app-workspace'].includes(section.block)) add('form');
    }
  } else if (item) {
    if (['features', 'services', 'gallery', 'process', 'pricing', 'faq'].includes(section.group)) add('heading', 'body');
    if (['features', 'services'].includes(section.group)) add('icon');
    if (['services', 'process'].includes(section.group)) add('number');
    if (section.group === 'gallery') add('media', 'meta');
    if (['services', 'pricing'].includes(section.group)) add('price');
    if (section.group === 'pricing') { add('meta'); action(); }
    if (section.block === 'features-bento') add('decoration');
  } else if (section.group === 'navigation') {
    add('brand', 'navigation'); action();
  } else if (section.group === 'footer') {
    add('brand', 'body', 'backToTop');
    if (section.block === 'footer-columns') add('navigation');
  } else {
    add('heading', 'body', 'eyebrow');
    if (['hero', 'about', 'cta', 'contact'].includes(section.group)) action();
    if (section.group === 'hero') {
      add('secondaryAction', 'footnote');
      if (section.block !== 'hero-centered') add('media', 'decoration');
    }
    if (section.block === 'about-split') add('media');
    if (section.block === 'features-bento') add('decoration');
    if (section.block === 'contact-form') add('form', 'nameField', 'emailField', 'messageField', 'footnote');
  }
  return [...new Set(keys)].map((partKey) => ({ partKey, label: t(PART_LABELS[partKey]) }));
}
