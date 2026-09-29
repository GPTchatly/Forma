/** Authored removable parts. Saved values are finite keys, never selectors or markup. */
import { interfaceFieldsFor, isInterfaceBlock } from './interfaces.mjs';

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
  const add = (...parts) => keys.push(...parts);
  const action = () => add('action', 'buttonLabel', 'buttonIcon');
  if (isInterfaceBlock(section)) {
    if (item) {
      add(...interfaceItemParts(section, item));
    } else {
      add('heading', 'body', 'eyebrow'); action();
      add(...interfaceFieldsFor(section).filter((key) => key !== 'layout'));
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
