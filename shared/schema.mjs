/** NEW: Shared runtime validation. Imported projects, model-derived values and API bodies
 * cross the same allowlist. Data is rendered as text, never accepted as executable markup. */
import { SCHEMA_VERSION, GROUPS, FAMILIES, THEMES, FONTS, DENSITIES, RADII, getBlock } from './catalog.mjs';
import { TYPE_SCALES, CONTENT_WIDTHS, PRESENTATION, DEFAULT_PRESENTATION } from './design.mjs';
import { HOME_PAGE_ID, MAX_PAGES, parsePageHref } from './pages.mjs';
import { CONTENT_ICONS } from './icons.mjs';
import { BUTTON_ICONS } from './ui-catalog.mjs';
import { ELEMENT_CONTROLS, DEFAULT_ELEMENTS, ITEM_ORDINALS } from './elements.mjs';
import { IMAGE_SIZE_LIMITS } from './media.mjs';
import { inspectRasterDataUrl } from './raster.mjs';
import { PART_LABELS, partsFor, isPartVisible } from './parts.mjs';
import { INTERFACE_CONTROLS, DEFAULT_INTERFACE, INTERFACE_ITEM_TYPES } from './interfaces.mjs';
export class ValidationError extends Error { constructor(message) { super(message); this.name = 'ValidationError'; this.status = 400; } }
export function object(value, label = 'Object') {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new ValidationError(`${label} must be an object.`);
  return value;
}
export function text(value, label, max = 1000, fallback = '') {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value)) throw new ValidationError(`${label} must be text of at most ${max} characters.`);
  return value;
}
export function member(value, values, label) {
  if (!values.includes(value)) throw new ValidationError(`Unsupported ${label}.`);
  return value;
}
export function id(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(value)) throw new ValidationError('Invalid identifier.');
  return value;
}
export function safeHref(value = '') {
  text(value, 'Link', 2048);
  if (!value) return '';
  if (parsePageHref(value)) return value;
  if (/^#[a-zA-Z][\w-]*$/.test(value)) return value;
  if (/^mailto:[^\s<>"'`?%&]+@[^\s<>"'`?%&]+$/u.test(value)) return value;
  if (/^tel:\+?[0-9(). -]{3,30}$/.test(value)) return value;
  if (/^https:\/\//i.test(value)) {
    try { const parsed = new URL(value); if (parsed.username || parsed.password) throw new Error(); return parsed.href; } catch { /* Reject below. */ }
  }
  throw new ValidationError('Links must use https://, mailto:, tel:, an internal #section, or a registered page link.');
}
export function safeImage(value = '') {
  if (value === '') return '';
  try { inspectRasterDataUrl(value); } catch { throw new ValidationError('Images must be valid static PNG, JPEG, WebP or AVIF files under 550 KB, at most 8192 pixels per side and 24 million pixels.'); }
  return value;
}
export function validateImageSize(raw = {}) {
  const value = object(raw, 'Image size');
  if (Object.keys(value).some((key) => !['width', 'height', 'fit'].includes(key))) throw new ValidationError('Unsupported image size field.');
  const width = value.width === undefined ? 100 : value.width;
  const height = value.height === undefined ? null : value.height;
  if (!Number.isInteger(width) || width < IMAGE_SIZE_LIMITS.minWidth || width > IMAGE_SIZE_LIMITS.maxWidth) throw new ValidationError(`Image width must be a whole percentage from ${IMAGE_SIZE_LIMITS.minWidth} to ${IMAGE_SIZE_LIMITS.maxWidth}.`);
  if (height !== null && (!Number.isInteger(height) || height < IMAGE_SIZE_LIMITS.minHeight || height > IMAGE_SIZE_LIMITS.maxHeight)) throw new ValidationError(`Image height must be automatic or a whole number from ${IMAGE_SIZE_LIMITS.minHeight} to ${IMAGE_SIZE_LIMITS.maxHeight} pixels.`);
  return { width, height, fit: member(value.fit === undefined ? 'cover' : value.fit, ['cover', 'contain'], 'image fit') };
}
export const ITEM_PLACEMENTS = Object.fromEntries(['iconPlacement', 'textOrder', 'buttonIconPlacement'].map((key) => [key, Object.keys(ELEMENT_CONTROLS[key].options)]));
export function validateRemovedParts(raw = []) {
  if (!Array.isArray(raw) || raw.length > Object.keys(PART_LABELS).length || raw.some((key) => typeof key !== 'string' || !Object.hasOwn(PART_LABELS, key)) || new Set(raw).size !== raw.length) throw new ValidationError('Removed parts must be unique supported part names.');
  return [...raw];
}
export function validateItemPlacements(raw = {}) {
  const value = object(raw, 'Item placements');
  if (Object.keys(value).some((key) => !Object.hasOwn(ITEM_PLACEMENTS, key))) throw new ValidationError('Unsupported item placement.');
  return Object.fromEntries(Object.entries(ITEM_PLACEMENTS).map(([key, choices]) => [key, member(value[key] === undefined ? 'default' : value[key], choices, 'item placement')]));
}
export function validateItem(raw, index = 0) {
  const item = object(raw, 'Item');
  const art = item.art === undefined ? index : item.art;
  if (!Number.isInteger(art) || art < 0 || art > 7) throw new ValidationError('Item artwork must be a prepared visual from 0 to 7.');
  return { removedParts: validateRemovedParts(item.removedParts), ...(item.id === undefined ? {} : { id: id(item.id) }), title: text(item.title, 'Item title', 180), body: text(item.body, 'Item description', 1800), meta: text(item.meta, 'Item label', 120), price: text(item.price, 'Price', 80), image: safeImage(item.image), alt: text(item.alt, 'Image alternative text', 250), imageSize: validateImageSize(item.imageSize), href: safeHref(item.href), icon: member(item.icon === undefined ? 'default' : item.icon, Object.keys(CONTENT_ICONS), 'item icon'), buttonIcon: member(item.buttonIcon === undefined ? 'default' : item.buttonIcon, Object.keys(BUTTON_ICONS), 'item button icon'), uiType: member(item.uiType === undefined ? 'default' : item.uiType, INTERFACE_ITEM_TYPES, 'interface item type'), art, placements: validateItemPlacements(item.placements) };
}
function normalizeItems(raw) {
  const items = raw.map(validateItem);
  const existing = items.filter((item) => item.id !== undefined).map((item) => item.id);
  if (new Set(existing).size !== existing.length) throw new ValidationError('Item identifiers must be unique within their section.');
  const used = new Set(existing);
  return items.map((item, index) => {
    if (item.id !== undefined) return item;
    let suffix = index + 1;
    while (used.has(`item-${suffix}`)) suffix += 1;
    const itemId = `item-${suffix}`;
    used.add(itemId);
    return { id: itemId, ...item };
  });
}
export function validateElements(raw = {}) {
  const value = object(raw, 'Block elements');
  if (Object.keys(value).some((key) => !Object.hasOwn(ELEMENT_CONTROLS, key))) throw new ValidationError('Unsupported block element control.');
  return Object.fromEntries(Object.entries(ELEMENT_CONTROLS).map(([key, control]) => [key, member(value[key] === undefined ? DEFAULT_ELEMENTS[key] : value[key], Object.keys(control.options), control.label.toLowerCase())]));
}
export function validatePresentation(raw = {}) {
  const value = object(raw, 'Section presentation');
  if (Object.keys(value).some((key) => !Object.hasOwn(PRESENTATION, key))) throw new ValidationError('Unsupported section presentation field.');
  return Object.fromEntries(Object.entries(PRESENTATION).map(([key, options]) => [key, member(value[key] === undefined ? DEFAULT_PRESENTATION[key] : value[key], Object.keys(options), `section ${key}`)]));
}
export function validateInterface(raw = {}) {
  const value = object(raw, 'Application interface');
  if (Object.keys(value).some((key) => !Object.hasOwn(INTERFACE_CONTROLS, key))) throw new ValidationError('Unsupported application interface control.');
  return Object.fromEntries(Object.entries(INTERFACE_CONTROLS).map(([key, control]) => [key, member(value[key] === undefined ? DEFAULT_INTERFACE[key] : value[key], Object.keys(control.options), control.label.toLowerCase())]));
}
export function validateSection(raw) {
  const s = object(raw, 'Section');
  const block = getBlock(s.block);
  if (!block) throw new ValidationError('Unknown component.');
  if (!Array.isArray(s.items) || s.items.length > 8) throw new ValidationError('Each section supports at most 8 items.');
  const items = normalizeItems(s.items), elements = validateElements(s.elements);
  const featuredIndex = elements.featuredItem === 'default' ? (block.id === 'pricing-featured' ? 1 : -1) : ITEM_ORDINALS.indexOf(elements.featuredItem);
  const featuredItemId = s.featuredItemId === undefined ? (block.group === 'pricing' ? items[featuredIndex]?.id ?? null : null) : s.featuredItemId === null ? null : id(s.featuredItemId);
  if (featuredItemId !== null && (block.group !== 'pricing' || !items.some((item) => item.id === featuredItemId))) throw new ValidationError('The highlighted plan must identify an existing pricing item.');
  return { removedParts: validateRemovedParts(s.removedParts), id: id(s.id), block: block.id, group: block.group, eyebrow: text(s.eyebrow, 'Section label', 120), title: text(s.title, 'Section heading', 300), body: text(s.body, 'Section description', 3000), button: text(s.button, 'Button text', 100), href: safeHref(s.href), image: safeImage(s.image), alt: text(s.alt, 'Image alternative text', 250), imageSize: validateImageSize(s.imageSize), items, locked: s.locked === true, draft: s.draft !== false, presentation: validatePresentation(s.presentation), elements, interface: validateInterface(s.interface), featuredItemId };
}
export function validatePageSpec(raw) {
  const p = object(raw, 'Website');
  if (p.schemaVersion !== SCHEMA_VERSION) throw new ValidationError('Unsupported project version. Expected schemaVersion 1.');
  const t = object(p.theme, 'Theme');
  const b = object(p.brand, 'Brand');
  const email = text(b.email, 'Email', 254);
  if (email && !/^[^\s<>"'`?%&]+@[^\s<>"'`?%&]+\.[^\s<>"'`?%&]+$/u.test(email)) throw new ValidationError('Enter a valid public contact email.');
  if (!Array.isArray(p.sections) || p.sections.length > 12) throw new ValidationError('A website supports at most 12 sections.');
  const sections = p.sections.map(validateSection);
  if (new Set(sections.map((s) => s.id)).size !== sections.length || new Set(sections.map((s) => s.group)).size !== sections.length) throw new ValidationError('Section identifiers and section groups must be unique.');
  if (sections.some((s, i) => s.group === 'navigation' && i !== 0)) throw new ValidationError('Navigation must be first.');
  if (sections.some((s, i) => s.group === 'footer' && i !== sections.length - 1)) throw new ValidationError('Footer must be last.');
  const result = {
    schemaVersion: SCHEMA_VERSION,
    name: text(p.name, 'Project name', 100, 'Untitled site'),
    family: member(p.family, Object.keys(FAMILIES), 'site category'),
    brief: text(p.brief, 'Brief', 5000),
    brand: { name: text(b.name, 'Brand name', 100, 'Your brand'), tagline: text(b.tagline, 'Tagline', 250), email, cta: text(b.cta, 'Primary action', 100, 'Get in touch'), href: safeHref(b.href), language: text(b.language, 'Language code', 20, 'en') },
    theme: { palette: member(t.palette, Object.keys(THEMES), 'palette'), font: member(t.font, Object.keys(FONTS), 'font'), density: member(t.density, Object.keys(DENSITIES), 'spacing'), radius: member(t.radius, Object.keys(RADII), 'corner style'), motion: member(t.motion, ['none', 'subtle'], 'motion'), typeScale: member(t.typeScale === undefined ? 'balanced' : t.typeScale, Object.keys(TYPE_SCALES), 'type scale'), width: member(t.width === undefined ? 'standard' : t.width, Object.keys(CONTENT_WIDTHS), 'content width') },
    sections
  };
  if (!/^[a-z]{2,3}(?:-[A-Za-z]{2,4})?$/.test(result.brand.language)) throw new ValidationError('Use a language code such as en or fi.');
  if (JSON.stringify(result).length > 4000000) throw new ValidationError('Project exceeds 4 MB. Reduce the image sizes.');
  return result;
}
export function validatePageSlug(value) {
  const slug = text(value, 'Page address', 60);
  if (!/^[a-z][a-z0-9-]{0,59}$/.test(slug) || /^(?:index|source|project|licenses|readme|con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(slug)) throw new ValidationError('Page addresses must start with a lowercase letter and contain only lowercase letters, numbers and hyphens. Choose a non-reserved name.');
  return slug;
}
export function validateSpec(raw) {
  const p = object(raw, 'Website');
  if (p.pages !== undefined && (!Array.isArray(p.pages) || p.pages.length > MAX_PAGES - 1)) throw new ValidationError(`A website supports at most ${MAX_PAGES} pages including Home.`);
  const result = validatePageSpec(p);
  result.pages = (p.pages || []).map((rawPage) => {
    const page = object(rawPage, 'Page');
    const pageId = id(page.id);
    if (pageId === HOME_PAGE_ID) throw new ValidationError('The home page identifier is reserved.');
    const title = text(page.title, 'Page title', 80).trim();
    if (!title) throw new ValidationError('A page needs a title.');
    if (page.showInNav !== undefined && typeof page.showInNav !== 'boolean') throw new ValidationError('Page navigation visibility must be true or false.');
    const validated = validatePageSpec({ ...page, schemaVersion: result.schemaVersion, name: title, brand: result.brand });
    return { id: pageId, slug: validatePageSlug(page.slug), title, showInNav: page.showInNav !== false, family: validated.family, brief: validated.brief, theme: validated.theme, sections: validated.sections };
  });
  if (new Set(result.pages.map((page) => page.id)).size !== result.pages.length) throw new ValidationError('Page identifiers must be unique.');
  if (new Set(result.pages.map((page) => page.slug)).size !== result.pages.length) throw new ValidationError('Page addresses must be unique.');
  // Legacy brand actions belonged to Home. Preserve that destination once the
  // brand is shared with other pages instead of resolving it against each page.
  if (result.pages.length && result.brand.href.startsWith('#') && result.sections.some((section) => `#${section.id}` === result.brand.href)) result.brand.href = `page:${HOME_PAGE_ID}${result.brand.href}`;
  const registry = new Map([[HOME_PAGE_ID, result], ...result.pages.map((page) => [page.id, page])]);
  const checkLink = (href) => {
    const target = parsePageHref(href);
    if (!target) return;
    const destination = registry.get(target.pageId);
    if (!destination || (target.sectionId && !destination.sections.some((section) => section.id === target.sectionId))) throw new ValidationError('A page link points to a page or section that does not exist.');
  };
  checkLink(result.brand.href);
  for (const page of registry.values()) for (const section of page.sections) {
    checkLink(section.href);
    for (const item of section.items) checkLink(item.href);
  }
  if (JSON.stringify(result).length > 4000000) throw new ValidationError('Project exceeds 4 MB. Reduce the image sizes.');
  return result;
}
export function validateCompose(raw) {
  const v = object(raw, 'Design request');
  const prompt = text(v.prompt, 'Request', 5000).trim();
  if (prompt.length < 3) throw new ValidationError('Describe the site or change in at least 3 characters.');
  const locks = object(v.locks ?? {});
  const spec = validateSpec(v.spec);
  const pageId = v.pageId === undefined ? HOME_PAGE_ID : id(v.pageId);
  if (pageId !== HOME_PAGE_ID && !spec.pages.some((page) => page.id === pageId)) throw new ValidationError('Page not found.');
  const selectedPage = pageId === HOME_PAGE_ID ? spec : spec.pages.find((page) => page.id === pageId);
  const selectedSectionId = v.selectedSectionId === undefined ? undefined : id(v.selectedSectionId);
  const selectedSection = selectedPage.sections.find((section) => section.id === selectedSectionId);
  if (selectedSectionId !== undefined && !selectedSection) throw new ValidationError('The selected section does not exist on this page.');
  const legacyItemIndex = v.selectedItemIndex;
  if (legacyItemIndex !== undefined && (!selectedSection || !Number.isInteger(legacyItemIndex) || legacyItemIndex < 0 || legacyItemIndex >= selectedSection.items.length)) throw new ValidationError('The selected item does not exist in this section.');
  let selectedItemId = v.selectedItemId === undefined ? undefined : id(v.selectedItemId);
  const selectedItemIndex = selectedItemId === undefined ? legacyItemIndex : selectedSection?.items.findIndex((item) => item.id === selectedItemId);
  if (selectedItemId !== undefined && (selectedItemIndex === undefined || selectedItemIndex < 0)) throw new ValidationError('The selected item does not exist in this section.');
  if (selectedItemId !== undefined && legacyItemIndex !== undefined && selectedItemIndex !== legacyItemIndex) throw new ValidationError('The selected item identifier and position disagree.');
  if (selectedItemIndex !== undefined) selectedItemId = selectedSection.items[selectedItemIndex].id;
  const selectedPartKey = v.selectedPartKey === undefined ? undefined : text(v.selectedPartKey, 'Selected element', 32);
  const selectedOwner = selectedItemId === undefined ? selectedSection : selectedSection?.items.find((item) => item.id === selectedItemId);
  if (selectedPartKey !== undefined && (!selectedSection || !partsFor(selectedSection, selectedItemId).some((part) => part.partKey === selectedPartKey) || !isPartVisible(selectedOwner, selectedPartKey))) throw new ValidationError('The selected element does not exist in this component.');
  return {
    mode: member(v.mode, ['jev', 'demo'], 'mode'),
    operation: member(v.operation, ['create', 'edit', 'redesign'], 'operation'), prompt,
    spec, pageId,
    ...(selectedSectionId === undefined ? {} : { selectedSectionId }), ...(selectedItemIndex === undefined ? {} : { selectedItemId, selectedItemIndex }), ...(selectedPartKey === undefined ? {} : { selectedPartKey }),
    locks: { palette: locks.palette === true, font: locks.font === true, density: locks.density === true, radius: locks.radius === true, motion: locks.motion === true, typeScale: locks.typeScale === true, width: locks.width === true }
  };
}
export function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
