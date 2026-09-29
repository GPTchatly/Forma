/** Authored, bounded part locations. These reference existing content; they are
 * neither an arbitrary node tree nor permission to move between containers. */
import { elementFieldsFor } from './elements.mjs';
import { imageOwner } from './media.mjs';
import { isInterfaceBlock } from './interfaces.mjs';
import { isPartVisible } from './parts.mjs';

const labels = { heading: 'Heading', body: 'Description', action: 'Primary action', icon: 'Feature icon', buttonIcon: 'Button icon', media: 'Image' };
// Display translation is optional; validation and saved placement values stay locale-neutral.
const english = (message, params = {}) => message.replace(/\{(\w+)\}/g, (match, key) => Object.hasOwn(params, key) ? String(params[key]) : match);
const textGroups = ['features', 'services', 'gallery', 'process'];
export function effectiveButtonIcon(section, item) {
  const selected = item?.buttonIcon && item.buttonIcon !== 'default' ? item.buttonIcon : section?.elements?.buttonIcon;
  return !selected || selected === 'default' ? 'arrow' : selected;
}
export function effectivePlacement(section, item, field) {
  const override = item?.placements?.[field];
  return override && override !== 'default' ? override : section.elements?.[field] || 'default';
}
export function effectivePartOrder(section, item, slot = 'content') {
  const field = slot === 'text' ? 'textOrder' : 'contentOrder';
  const selected = effectivePlacement(section, item, field);
  return selected === 'default' ? (slot === 'text' ? ['heading', 'body'] : ['heading', 'body', 'action']) : selected.split('-');
}
function orderedSlots(section, item, slot, t) {
  const order = effectivePartOrder(section, item, slot).filter((partKey) => isPartVisible(item || section, partKey));
  return order.map((partKey) => ({ partKey, label: t(labels[partKey]), destinationSlot: slot, required: false, choices: [
    ...order.filter((key) => key !== partKey).map((key) => ({ label: t('Place {part} before {target}', { part: t(labels[partKey]), target: t(labels[key]) }), destinationSlot: slot, beforePartKey: key })),
    { label: t('Place {part} last', { part: t(labels[partKey]) }), destinationSlot: slot, beforePartKey: null }
  ] }));
}
function enumSlot(partKey, destinationSlot, choices, t) {
  return { partKey, label: t(labels[partKey]), destinationSlot, required: false, choices: Object.entries(choices).map(([beforePartKey, label]) => ({ label: t(label), destinationSlot, beforePartKey })) };
}
export function slotsFor(section, itemId, t = english) {
  if (!section) return [];
  const item = itemId ? section.items?.find((entry) => entry.id === itemId) : undefined;
  if (itemId && !item) return [];
  if (isInterfaceBlock(section)) return imageOwner(section, itemId) && isPartVisible(item || section, 'media') ? [{ partKey: 'media', label: t(labels.media), destinationSlot: 'product-media', required: false, choices: [] }] : [];
  const fields = elementFieldsFor(section), slots = [];
  if (!item && fields.includes('contentOrder')) slots.push(...orderedSlots(section, null, 'content', t));
  if (!item && fields.includes('mediaPlacement')) slots.push(enumSlot('media', 'hero-media', { before: 'Place image before the content', after: 'Place image after the content' }, t));
  else if (imageOwner(section, itemId)) slots.push({ partKey: 'media', label: t(labels.media), destinationSlot: item ? 'gallery-media' : 'about-media', required: false, choices: [] });
  if (item && textGroups.includes(section.group)) slots.push(...orderedSlots(section, item, 'text', t));
  if (item && section.group === 'features' && item.icon !== 'none') slots.push(enumSlot('icon', 'feature-icon', { above: 'Place icon above the text', beside: 'Place icon beside the text' }, t));
  if (fields.includes('buttonIconPlacement') && effectiveButtonIcon(section, item) !== 'none' && (section.group === 'pricing' ? !!item : !item)) slots.push(enumSlot('buttonIcon', 'button-icon', { leading: 'Place icon before label', trailing: 'Place icon after label' }, t));
  return slots.filter((part) => isPartVisible(item || section, part.partKey));
}
export function placementFor(section, ownerRef, partKey, destinationSlot, beforePartKey = null) {
  if (!section || ownerRef?.sectionId && ownerRef.sectionId !== section.id) return { allowed: false, reason: 'The part belongs to a different section.' };
  const itemId = ownerRef?.itemId;
  const descriptor = slotsFor(section, itemId).find((part) => part.partKey === partKey && part.destinationSlot === destinationSlot);
  if (!descriptor) return { allowed: false, reason: 'This part has no compatible location in this component.' };
  if (beforePartKey === partKey && ['content', 'text'].includes(destinationSlot)) {
    const item = itemId ? section.items.find((entry) => entry.id === itemId) : undefined;
    return { allowed: true, changed: false, field: destinationSlot === 'text' ? 'textOrder' : 'contentOrder', value: effectivePartOrder(section, item, destinationSlot).join('-'), ...(itemId ? { itemId } : {}) };
  }
  if (!descriptor.choices.some((choice) => choice.beforePartKey === beforePartKey)) return { allowed: false, reason: 'That destination is not supported for this part.' };
  let field, value;
  if (destinationSlot === 'content' || destinationSlot === 'text') {
    field = destinationSlot === 'text' ? 'textOrder' : 'contentOrder';
    const item = itemId ? section.items.find((entry) => entry.id === itemId) : undefined;
    const order = effectivePartOrder(section, item, destinationSlot).filter((key) => key !== partKey);
    order.splice(beforePartKey === null ? order.length : order.indexOf(beforePartKey), 0, partKey);
    value = order.join('-');
  } else {
    field = destinationSlot === 'feature-icon' ? 'iconPlacement' : destinationSlot === 'hero-media' ? 'mediaPlacement' : 'buttonIconPlacement';
    value = beforePartKey;
  }
  const item = itemId ? section.items.find((entry) => entry.id === itemId) : undefined;
  let current = effectivePlacement(section, item, field);
  if (field === 'contentOrder' || field === 'textOrder') current = effectivePartOrder(section, item, destinationSlot).join('-');
  if (current === 'default') current = field === 'iconPlacement' ? section.block === 'features-list' ? 'beside' : 'above' : field === 'mediaPlacement' ? 'after' : 'trailing';
  return { allowed: true, changed: current !== value, field, value, ...(itemId ? { itemId } : {}) };
}
