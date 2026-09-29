/** Bounded structural edits. The editor owns canonical data; the preview sends
 * references only. Every control shares these constraints and pure operations. */
import { GROUP_LABELS, getBlock } from './catalog.mjs';
import { ITEM_ORDINALS, elementFieldsFor } from './elements.mjs';
import { CONTENT_ICONS, itemIconName } from './icons.mjs';
import { BUTTON_ICONS } from './ui-catalog.mjs';
import { makeSection } from './content.mjs';
import { isInterfaceBlock } from './interfaces.mjs';
import { HOME_PAGE_ID } from './pages.mjs';
import { ValidationError, id, object } from './schema.mjs';
import { slotsFor, placementFor, effectivePartOrder } from './slots.mjs';
import { partsFor, isPartVisible } from './parts.mjs';

const repeatedGroups = ['features', 'gallery', 'services', 'process', 'pricing', 'faq'];
const anchors = ['navigation', 'hero', 'footer'];
// Only display labels use this callback; proposals and authorization are unchanged.
const english = (message, params = {}) => message.replace(/\{(\w+)\}/g, (match, key) => Object.hasOwn(params, key) ? String(params[key]) : match);
const proposalKeys = {
  section: ['kind', 'pageId', 'sectionId', 'beforeSectionId'],
  item: ['kind', 'pageId', 'sectionId', 'itemId', 'beforeItemId'],
  part: ['kind', 'pageId', 'sectionId', 'itemId', 'partKey', 'destinationSlot', 'beforePartKey'],
  'transfer-item': ['kind', 'pageId', 'sectionId', 'itemId', 'targetSectionId', 'beforeItemId'],
  'insert-section': ['kind', 'pageId', 'blockId', 'beforeSectionId'],
  'replace-section': ['kind', 'pageId', 'sectionId', 'blockId'],
  'replace-icon': ['kind', 'pageId', 'sectionId', 'itemId', 'slot', 'icon']
};
function nullableId(value) { return value === null ? null : id(value); }
function strictKeys(value, allowed) {
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new ValidationError('Unsupported move field.');
}
export function validateMoveProposal(raw) {
  const proposal = object(raw, 'Move');
  if (!Object.hasOwn(proposalKeys, proposal.kind)) throw new ValidationError('Unsupported move operation.');
  strictKeys(proposal, proposalKeys[proposal.kind]);
  const result = { kind: proposal.kind, pageId: id(proposal.pageId), ...(proposal.kind === 'insert-section' ? {} : { sectionId: id(proposal.sectionId) }) };
  if (['section', 'insert-section'].includes(proposal.kind)) result.beforeSectionId = nullableId(proposal.beforeSectionId);
  if (['item', 'transfer-item'].includes(proposal.kind)) Object.assign(result, { itemId: id(proposal.itemId), beforeItemId: nullableId(proposal.beforeItemId) });
  if (proposal.kind === 'transfer-item') result.targetSectionId = id(proposal.targetSectionId);
  if (['insert-section', 'replace-section'].includes(proposal.kind)) result.blockId = id(proposal.blockId);
  if (proposal.kind === 'replace-icon') {
    if (!['feature-icon', 'button-icon'].includes(proposal.slot)) throw new ValidationError('Unsupported icon slot.');
    Object.assign(result, { slot: proposal.slot, icon: id(proposal.icon) });
    if (proposal.itemId !== undefined) result.itemId = id(proposal.itemId);
  }
  if (proposal.kind === 'part') {
    Object.assign(result, { partKey: id(proposal.partKey), destinationSlot: id(proposal.destinationSlot), beforePartKey: nullableId(proposal.beforePartKey) });
    if (proposal.itemId !== undefined) result.itemId = id(proposal.itemId);
  }
  return result;
}
function checkPage(page) {
  object(page, 'Page');
  if (!Array.isArray(page.sections) || page.sections.length > 12) throw new ValidationError('A page supports at most 12 sections.');
  const sectionIds = new Set(), groups = new Set();
  for (const section of page.sections) {
    object(section, 'Section');
    id(section.id);
    if (!getBlock(section.block) || getBlock(section.block).group !== section.group) throw new ValidationError('Unsupported section component.');
    if (sectionIds.has(section.id) || groups.has(section.group)) throw new ValidationError('Section identities and groups must be unique.');
    sectionIds.add(section.id); groups.add(section.group);
    if (!Array.isArray(section.items) || section.items.length > 8) throw new ValidationError('Each section supports at most 8 items.');
    const itemIds = section.items.map((item) => id(object(item, 'Item').id));
    if (new Set(itemIds).size !== itemIds.length) throw new ValidationError('Item identities must be unique within their section.');
    if (section.featuredItemId !== undefined && section.featuredItemId !== null && (section.group !== 'pricing' || !itemIds.includes(id(section.featuredItemId)))) throw new ValidationError('The highlighted plan no longer exists in this section.');
  }
}
function insertedBefore(entries, sourceId, beforeId) {
  const source = entries.find((entry) => entry.id === sourceId);
  if (!source) throw new ValidationError('The source no longer exists.');
  if (beforeId !== null && !entries.some((entry) => entry.id === beforeId)) throw new ValidationError('The destination no longer exists in this collection.');
  if (sourceId === beforeId) return entries;
  const result = entries.filter((entry) => entry.id !== sourceId);
  const destination = beforeId === null ? result.length : result.findIndex((entry) => entry.id === beforeId);
  result.splice(destination, 0, source);
  return result.every((entry, index) => entry === entries[index]) ? entries : result;
}
function outcome(page, selection, changed = false) { return { allowed: true, reason: null, page, selection, changed }; }
function checkSectionOrder(sections) {
  if (sections.some((entry, index) => (entry.group === 'navigation' && index !== 0) || (entry.group === 'hero' && index !== (sections[0].group === 'navigation' ? 1 : 0)) || (entry.group === 'footer' && index !== sections.length - 1))) throw new ValidationError('Keep Navigation first, Hero first in the body and Footer last when present.');
}
function insertedSection(page, proposal, pageId, dryRun) {
  const block = getBlock(proposal.blockId);
  if (!block) throw new ValidationError('This library component does not exist.');
  if (page.sections.length >= 12) throw new ValidationError('A page supports at most 12 sections.');
  if (page.sections.some((section) => section.group === block.group)) throw new ValidationError('This page already has that section family. Use Replace component instead.');
  const destination = proposal.beforeSectionId === null ? page.sections.length : page.sections.findIndex((section) => section.id === proposal.beforeSectionId);
  if (destination < 0) throw new ValidationError('The insertion location no longer exists on this page.');
  if (page.sections.some((section, index) => section.locked && index >= destination)) throw new ValidationError('Insertion cannot shift a locked section from its structural slot.');
  let sectionId = block.group, suffix = 2;
  while (page.sections.some((section) => section.id === sectionId)) sectionId = `${block.group}-${suffix++}`;
  // Previewing a destination never allocates identities or prepared content.
  const placeholder = { id: sectionId, group: block.group, block: block.id };
  const sections = [...page.sections]; sections.splice(destination, 0, placeholder);
  checkSectionOrder(sections);
  if (!dryRun) sections[destination] = { ...makeSection(block.group, block.id, page.family), id: sectionId };
  return outcome({ ...page, sections }, { pageId, sectionId }, true);
}
export const ITEM_TRANSFER_POLICY = {
  groups: ['services', 'process'],
  description: 'Plain text service and process items can move between those collections. Numbering follows the destination sequence. Items with prices, captions, images or custom icons stay in their original collection.'
};
function transferredItem(page, section, proposal, pageId) {
  const target = page.sections.find((entry) => entry.id === proposal.targetSectionId);
  if (!target) throw new ValidationError('The destination section no longer exists on this page.');
  if (target.id === section.id) throw new ValidationError('Use item reordering within the same collection.');
  if (target.locked) throw new ValidationError('Unlock the destination section before moving an item into it.');
  if (!ITEM_TRANSFER_POLICY.groups.includes(section.group) || !ITEM_TRANSFER_POLICY.groups.includes(target.group)) throw new ValidationError('Only plain text Services and Process items share a lossless transfer format.');
  const item = section.items.find((entry) => entry.id === proposal.itemId);
  if (['price', 'meta', 'image', 'alt'].some((field) => item[field]) || ![undefined, 'default'].includes(item.icon) || ![undefined, 'default'].includes(item.buttonIcon)) throw new ValidationError('This item has a price, caption, image or custom icon that the destination cannot display. Keep it in its current collection.');
  if (target.items.length >= 8) throw new ValidationError('The destination already contains 8 items.');
  if (target.items.some((entry) => entry.id === item.id)) throw new ValidationError('The destination already contains that item identity. No content was overwritten.');
  const destination = proposal.beforeItemId === null ? target.items.length : target.items.findIndex((entry) => entry.id === proposal.beforeItemId);
  if (destination < 0) throw new ValidationError('The destination item does not exist in the target section.');
  // Preserve the source's effective reading order when it was inherited from its
  // section. Other placements and item-owned artwork remain on the same identity.
  const sourceIndex = section.items.findIndex((entry) => entry.id === item.id);
  const moved = { ...item, art: item.art ?? sourceIndex, placements: { ...item.placements, textOrder: effectivePartOrder(section, item, 'text').join('-') } };
  const items = [...target.items]; items.splice(destination, 0, moved);
  const sections = page.sections.map((entry) => entry.id === section.id ? { ...entry, items: entry.items.filter((candidate) => candidate.id !== item.id) } : entry.id === target.id ? { ...entry, items } : entry);
  return outcome({ ...page, sections }, { pageId, sectionId: target.id, itemId: item.id }, true);
}
function buttonTargetVisible(page, section, item) {
  if (!isPartVisible(item || section, 'action')) return false;
  if (item) return true;
  if (['app-login', 'app-signup', 'app-checkout'].includes(section.block)) return isPartVisible(section, 'form');
  if (isInterfaceBlock(section)) return true;
  if (elementFieldsFor(section).includes('primaryAction') && section.elements.primaryAction === 'hide') return false;
  if (section.group === 'about' && section.elements.primaryAction !== 'show' && !section.button) return false;
  if (section.block === 'contact-simple') return !!(section.href || page.brand?.email || page.brand?.href && !page.brand.href.startsWith('#'));
  if (section.block === 'contact-form' && !isPartVisible(section, 'form')) return !!(!page.brand?.email && page.brand?.href && !page.brand.href.startsWith('#'));
  return true;
}
function replacedIcon(page, section, proposal, selection) {
  let updated;
  if (proposal.slot === 'feature-icon') {
    if (section.group !== 'features' || proposal.itemId === undefined || !Object.hasOwn(CONTENT_ICONS, proposal.icon)) throw new ValidationError('This icon needs an existing feature-item icon slot.');
    const item = section.items.find((entry) => entry.id === proposal.itemId);
    if (item.icon === proposal.icon && !item.removedParts?.includes('icon')) return outcome(page, { ...selection, partKey: 'icon' });
    updated = { ...section, items: section.items.map((entry) => entry.id === item.id ? { ...entry, icon: proposal.icon, removedParts: (entry.removedParts || []).filter((key) => key !== 'icon') } : entry) };
  } else {
    if (!Object.hasOwn(BUTTON_ICONS, proposal.icon) || !elementFieldsFor(section).includes('buttonIcon')) throw new ValidationError('This icon needs a supported button-icon slot.');
    if (proposal.itemId !== undefined) {
      if (section.group !== 'pricing') throw new ValidationError('Only pricing cards have item-owned button icons.');
      const item = section.items.find((entry) => entry.id === proposal.itemId);
      if (!buttonTargetVisible(page, section, item)) throw new ValidationError('Restore the button before replacing its icon.');
      if ((item.buttonIcon ?? 'default') === proposal.icon && !item.removedParts?.includes('buttonIcon')) return outcome(page, { ...selection, partKey: 'buttonIcon' });
      updated = { ...section, items: section.items.map((entry) => entry.id === item.id ? { ...entry, buttonIcon: proposal.icon, removedParts: (entry.removedParts || []).filter((key) => key !== 'buttonIcon') } : entry) };
    } else {
      if (section.group === 'pricing') throw new ValidationError('Choose a specific pricing card to replace its button icon.');
      if (!buttonTargetVisible(page, section)) throw new ValidationError('Restore the button before replacing its icon.');
      if (section.elements.buttonIcon === proposal.icon && !section.removedParts?.includes('buttonIcon')) return outcome(page, { ...selection, partKey: 'buttonIcon' });
      updated = { ...section, elements: { ...section.elements, buttonIcon: proposal.icon }, removedParts: (section.removedParts || []).filter((key) => key !== 'buttonIcon') };
    }
  }
  return outcome({ ...page, sections: page.sections.map((entry) => entry.id === section.id ? updated : entry) }, { ...selection, partKey: proposal.slot === 'feature-icon' ? 'icon' : 'buttonIcon' }, true);
}
function performMove(page, proposal, pageId, dryRun = false) {
  checkPage(page);
  id(pageId);
  if (proposal.pageId !== pageId || (page.id !== undefined && page.id !== pageId)) throw new ValidationError('Moves must stay on the current page.');
  if (proposal.kind === 'insert-section') return insertedSection(page, proposal, pageId, dryRun);
  const section = page.sections.find((entry) => entry.id === proposal.sectionId);
  if (!section) throw new ValidationError('The section no longer exists on this page.');
  if (section.locked) throw new ValidationError('Unlock this section before arranging its structure. Text and settings remain editable.');
  const selection = { pageId, sectionId: section.id, ...(proposal.itemId === undefined ? {} : { itemId: proposal.itemId }), ...(proposal.partKey === undefined ? {} : { partKey: proposal.partKey }) };
  if (proposal.kind === 'section') {
    if (anchors.includes(section.group)) throw new ValidationError('Navigation, Hero and Footer have fixed positions.');
    const sections = insertedBefore(page.sections, section.id, proposal.beforeSectionId);
    if (sections === page.sections) return outcome(page, selection);
    checkSectionOrder(sections);
    if (sections.some((entry, index) => entry.locked && page.sections[index].id !== entry.id)) throw new ValidationError('A move cannot cross a locked section.');
    return outcome({ ...page, sections }, selection, true);
  }
  if (proposal.itemId !== undefined && !section.items.some((item) => item.id === proposal.itemId)) throw new ValidationError('The item no longer exists in this section.');
  if (proposal.kind === 'transfer-item') return transferredItem(page, section, proposal, pageId);
  if (proposal.kind === 'replace-icon') return replacedIcon(page, section, proposal, selection);
  if (proposal.kind === 'replace-section') {
    const block = getBlock(proposal.blockId);
    if (!block || block.group !== section.group) throw new ValidationError('A replacement component must belong to the same section family.');
    if (block.id === section.block) return outcome(page, selection);
    // App screens have different field contracts. Seed their prepared content on
    // an explicit screen change instead of rendering a login with marketing copy.
    const changesScreen = isInterfaceBlock(section) || isInterfaceBlock(block.id);
    const replacement = changesScreen && !dryRun ? { ...makeSection(block.group, block.id, page.family), id: section.id, locked: section.locked, presentation: { ...section.presentation } } : { ...section, block: block.id };
    return outcome({ ...page, sections: page.sections.map((entry) => entry.id === section.id ? replacement : entry) }, { pageId, sectionId: section.id }, true);
  }
  let updated;
  if (proposal.kind === 'item') {
    if (!repeatedGroups.includes(section.group) && !isInterfaceBlock(section)) throw new ValidationError('This section has no reorderable item collection.');
    const reordered = insertedBefore(section.items, proposal.itemId, proposal.beforeItemId);
    if (reordered === section.items) return outcome(page, selection);
    // Original positional artwork becomes item-owned before the order changes.
    const visuals = new Map(section.items.map((item, index) => [item.id, { ...item, art: item.art ?? index, ...(section.group === 'features' ? { icon: itemIconName(item, index) } : {}) }]));
    const items = reordered.map((item) => visuals.get(item.id));
    updated = { ...section, items };
    if (section.group === 'pricing') {
      const previousIndex = section.elements.featuredItem === 'default' ? (section.block === 'pricing-featured' ? 1 : -1) : ITEM_ORDINALS.indexOf(section.elements.featuredItem);
      const featuredItemId = section.featuredItemId === undefined ? section.items[previousIndex]?.id ?? null : section.featuredItemId;
      updated.featuredItemId = featuredItemId;
      updated.elements = { ...section.elements, featuredItem: featuredItemId === null ? 'none' : ITEM_ORDINALS[items.findIndex((item) => item.id === featuredItemId)] };
    }
  } else {
    const placement = placementFor(section, { sectionId: section.id, ...(proposal.itemId === undefined ? {} : { itemId: proposal.itemId }) }, proposal.partKey, proposal.destinationSlot, proposal.beforePartKey);
    if (!placement.allowed) throw new ValidationError(placement.reason || 'This part does not fit that location.');
    if (placement.changed === false) return outcome(page, selection);
    if (placement.itemId !== undefined) {
      const item = section.items.find((entry) => entry.id === placement.itemId);
      if (!item || placement.itemId !== proposal.itemId) throw new ValidationError('Parts must remain in their authored owner.');
      if (item.placements?.[placement.field] === placement.value) return outcome(page, selection);
      updated = { ...section, items: section.items.map((entry) => entry.id === item.id ? { ...entry, placements: { ...entry.placements, [placement.field]: placement.value } } : entry) };
    } else {
      if (section.elements[placement.field] === placement.value) return outcome(page, selection);
      updated = { ...section, elements: { ...section.elements, [placement.field]: placement.value } };
    }
  }
  return outcome({ ...page, sections: page.sections.map((entry) => entry.id === section.id ? updated : entry) }, selection, true);
}
export function applyMove(page, rawProposal, pageId = HOME_PAGE_ID) {
  try { return performMove(page, validateMoveProposal(rawProposal), pageId); }
  catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    return { allowed: false, reason: error.message, page, selection: null, changed: false };
  }
}
export function canMove(page, proposal, pageId = HOME_PAGE_ID) {
  try {
    const { allowed, reason, changed } = performMove(page, validateMoveProposal(proposal), pageId, true);
    return { allowed, reason, changed };
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    return { allowed: false, reason: error.message, changed: false };
  }
}
export function moveSection(page, sourceSectionId, beforeSectionId) {
  return applyMove(page, { kind: 'section', pageId: page.id ?? HOME_PAGE_ID, sectionId: sourceSectionId, beforeSectionId }, page.id ?? HOME_PAGE_ID);
}
export function moveItem(page, sectionId, sourceItemId, beforeItemId) {
  return applyMove(page, { kind: 'item', pageId: page.id ?? HOME_PAGE_ID, sectionId, itemId: sourceItemId, beforeItemId }, page.id ?? HOME_PAGE_ID);
}
export function removeItem(page, sectionId, itemId) {
  try {
    checkPage(page); id(sectionId); id(itemId);
    const section = page.sections.find((entry) => entry.id === sectionId);
    if (!section) throw new ValidationError('The section no longer exists on this page.');
    if (section.locked) throw new ValidationError('Unlock this section before deleting its items.');
    if (!repeatedGroups.includes(section.group) && !isInterfaceBlock(section)) throw new ValidationError('This section has no removable item collection.');
    if (!section.items.some((item) => item.id === itemId)) throw new ValidationError('The item no longer exists in this section.');
    // Preserve formerly positional visuals when deletion changes sibling indices.
    const items = section.items.map((item, index) => ({ ...item, art: item.art ?? index, ...(section.group === 'features' ? { icon: itemIconName(item, index) } : {}) })).filter((item) => item.id !== itemId);
    let updated = { ...section, items };
    if (section.group === 'pricing') {
      const previousIndex = section.elements.featuredItem === 'default' ? (section.block === 'pricing-featured' ? 1 : -1) : ITEM_ORDINALS.indexOf(section.elements.featuredItem);
      const previousId = section.featuredItemId === undefined ? section.items[previousIndex]?.id ?? null : section.featuredItemId;
      const featuredItemId = previousId === itemId ? null : previousId;
      updated = { ...updated, featuredItemId, elements: { ...section.elements, featuredItem: featuredItemId === null ? 'none' : ITEM_ORDINALS[items.findIndex((item) => item.id === featuredItemId)] } };
    }
    return outcome({ ...page, sections: page.sections.map((entry) => entry.id === sectionId ? updated : entry) }, { pageId: page.id ?? HOME_PAGE_ID, sectionId }, true);
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    return { allowed: false, reason: error.message, page, selection: null, changed: false };
  }
}
export function setPartRemoved(page, ownerRef, partKey, removed = true) {
  try {
    checkPage(page); object(ownerRef, 'Part owner'); strictKeys(ownerRef, ['pageId', 'sectionId', 'itemId']);
    id(ownerRef.sectionId); if (ownerRef.itemId !== undefined) id(ownerRef.itemId);
    const pageId = ownerRef.pageId ?? page.id ?? HOME_PAGE_ID;
    id(pageId);
    if (page.id !== undefined && page.id !== pageId) throw new ValidationError('The part belongs to a different page.');
    if (typeof removed !== 'boolean') throw new ValidationError('Part removal must be true or false.');
    const section = page.sections.find((entry) => entry.id === ownerRef.sectionId);
    if (!section) throw new ValidationError('The section no longer exists on this page.');
    if (section.locked) throw new ValidationError('Unlock this section before deleting or restoring its elements.');
    if (!partsFor(section, ownerRef.itemId).some((part) => part.partKey === partKey)) throw new ValidationError('This element does not exist in this component.');
    const owner = ownerRef.itemId === undefined ? section : section.items.find((item) => item.id === ownerRef.itemId);
    const selection = { pageId, sectionId: section.id, ...(ownerRef.itemId === undefined ? {} : { itemId: ownerRef.itemId }) };
    const existing = owner.removedParts || [];
    if (existing.includes(partKey) === removed) return outcome(page, selection);
    const removedParts = removed ? [...existing, partKey] : existing.filter((key) => key !== partKey);
    const updated = ownerRef.itemId === undefined ? { ...section, removedParts } : { ...section, items: section.items.map((item) => item.id === owner.id ? { ...item, removedParts } : item) };
    return outcome({ ...page, sections: page.sections.map((entry) => entry.id === section.id ? updated : entry) }, selection, true);
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    return { allowed: false, reason: error.message, page, selection: null, changed: false };
  }
}
export function placePart(page, ownerRef, partKey, destinationSlot, beforePartKey) {
  try { object(ownerRef, 'Part owner'); strictKeys(ownerRef, ['pageId', 'sectionId', 'itemId']); }
  catch (error) { if (!(error instanceof ValidationError)) throw error; return { allowed: false, reason: error.message, page, selection: null, changed: false }; }
  const pageId = ownerRef.pageId ?? page.id ?? HOME_PAGE_ID;
  return applyMove(page, { kind: 'part', pageId, sectionId: ownerRef.sectionId, ...(ownerRef.itemId === undefined ? {} : { itemId: ownerRef.itemId }), partKey, destinationSlot, beforePartKey }, pageId);
}
export function moveOptions(page, selection, t = english) {
  if (!selection || typeof selection !== 'object') return [];
  const { pageId = HOME_PAGE_ID, sectionId, itemId, partKey } = selection;
  const section = page.sections.find((entry) => entry.id === sectionId);
  if (!section || section.locked) return [];
  const options = [];
  const add = (label, proposal) => { const result = canMove(page, proposal, pageId); if (result.allowed && result.changed) options.push({ label, proposal }); };
  if (partKey !== undefined) {
    const slot = slotsFor(section, itemId, t).find((entry) => entry.partKey === partKey);
    if (!slot) return [];
    for (const choice of slot.choices) add(choice.label, { kind: 'part', pageId, sectionId, ...(itemId === undefined ? {} : { itemId }), partKey, destinationSlot: choice.destinationSlot, beforePartKey: choice.beforePartKey });
    return options;
  }
  if (itemId !== undefined) {
    const item = section.items.find((entry) => entry.id === itemId);
    if (!item) return [];
    const name = item.title || t('this item');
    const propose = (beforeItemId) => ({ kind: 'item', pageId, sectionId, itemId, beforeItemId });
    add(t('Move {name} first', { name }), propose(section.items[0]?.id ?? null));
    add(t('Move {name} last', { name }), propose(null));
    section.items.forEach((sibling, index) => {
      if (sibling.id === itemId) return;
      const target = sibling.title || t('item {number}', { number: index + 1 });
      add(t('Move {name} before {target}', { name, target }), propose(sibling.id));
      add(t('Move {name} after {target}', { name, target }), propose(section.items[index + 1]?.id ?? null));
    });
    for (const target of page.sections.filter((entry) => entry.id !== sectionId && ITEM_TRANSFER_POLICY.groups.includes(section.group) && ITEM_TRANSFER_POLICY.groups.includes(entry.group))) {
      const transfer = (beforeItemId) => ({ kind: 'transfer-item', pageId, sectionId, itemId, targetSectionId: target.id, beforeItemId });
      const group = t(GROUP_LABELS[target.group]);
      add(t('Move {name} to {group}, first (renumbered in its new sequence)', { name, group }), transfer(target.items[0]?.id ?? null));
      add(t('Move {name} to {group}, last (renumbered in its new sequence)', { name, group }), transfer(null));
      for (const sibling of target.items) add(t('Move {name} to {group}, before {target}', { name, group, target: sibling.title || t('this item') }), transfer(sibling.id));
    }
    return options.map((option) => ({ ...option, label: ['features-bento', 'gallery-featured'].includes(section.block) ? t('{move} (the leading layout slot stays large)', { move: option.label }) : option.label }));
  }
  const name = t(GROUP_LABELS[section.group]);
  const body = page.sections.filter((entry) => !anchors.includes(entry.group));
  const propose = (beforeSectionId) => ({ kind: 'section', pageId, sectionId, beforeSectionId });
  add(t('Move {name} first in the body', { name }), propose(body[0]?.id ?? null));
  add(t('Move {name} last in the body', { name }), propose(page.sections.find((entry) => entry.group === 'footer')?.id ?? null));
  body.forEach((sibling) => {
    if (sibling.id === sectionId) return;
    const index = page.sections.findIndex((entry) => entry.id === sibling.id);
    const target = t(GROUP_LABELS[sibling.group]);
    add(t('Move {name} before {target}', { name, target }), propose(sibling.id));
    add(t('Move {name} after {target}', { name, target }), propose(page.sections[index + 1]?.id ?? null));
  });
  return options;
}

/** Library entries are closed catalog references, never markup or new data types. */
export function libraryOptions(page, rawEntry, pageId = HOME_PAGE_ID, t = english) {
  try {
    const entry = object(rawEntry, 'Library entry');
    if (!['section', 'icon'].includes(entry.kind)) throw new ValidationError('Unsupported library entry.');
    strictKeys(entry, entry.kind === 'section' ? ['kind', 'blockId'] : ['kind', 'icon', 'slot']);
    const options = [];
    const add = (label, proposal) => { const result = canMove(page, proposal, pageId); if (result.allowed && result.changed) options.push({ label, proposal }); };
    if (entry.kind === 'section') {
      const block = getBlock(id(entry.blockId));
      if (!block) return [];
      const existing = page.sections.find((section) => section.group === block.group);
      if (existing) add(t(isInterfaceBlock(existing) || isInterfaceBlock(block.id) ? 'Replace {group} with {component} and its prepared fields' : 'Replace {group} component with {component}; keep its content', { group: t(GROUP_LABELS[existing.group]), component: t(block.name) }), { kind: 'replace-section', pageId, sectionId: existing.id, blockId: block.id });
      else {
        for (const target of page.sections) add(t('Insert {component} before {group} with prepared draft copy', { component: t(block.name), group: t(GROUP_LABELS[target.group]) }), { kind: 'insert-section', pageId, blockId: block.id, beforeSectionId: target.id });
        add(t('Insert {component} at the end with prepared draft copy', { component: t(block.name) }), { kind: 'insert-section', pageId, blockId: block.id, beforeSectionId: null });
      }
    } else {
      const icon = id(entry.icon);
      if (!['feature-icon', 'button-icon'].includes(entry.slot)) return [];
      const catalog = entry.slot === 'feature-icon' ? CONTENT_ICONS : BUTTON_ICONS;
      if (!Object.hasOwn(catalog, icon)) return [];
      for (const section of page.sections) {
        const proposal = { kind: 'replace-icon', pageId, sectionId: section.id, slot: entry.slot, icon };
        if (entry.slot === 'feature-icon' ? section.group === 'features' : section.group === 'pricing') {
          for (const item of section.items) {
            const name = item.title || t('{group} item', { group: t(GROUP_LABELS[section.group]) });
            add(t(entry.slot === 'feature-icon' ? 'Replace {name} feature icon with {icon}' : 'Replace {name} button icon with {icon}', { name, icon: t(catalog[icon].label) }), { ...proposal, itemId: item.id });
          }
        } else if (entry.slot === 'button-icon') add(t('Replace {name} button icon with {icon}', { name: t(GROUP_LABELS[section.group]), icon: t(catalog[icon].label) }), proposal);
      }
    }
    return options;
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    return [];
  }
}
