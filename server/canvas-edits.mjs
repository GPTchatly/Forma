/** JEV selects bounded canvas choices; application code owns every proposal.
 * Normalize pages before planning/composition so item references have stable IDs.
 * Stored copy, image bytes and URLs never enter these questions or metadata. */
import { GROUP_LABELS, OPTIONAL_GROUPS } from '../shared/catalog.mjs';
import { ITEM_ORDINALS } from '../shared/elements.mjs';
import { CONTENT_ICONS } from '../shared/icons.mjs';
import { IMAGE_SIZE_LIMITS, imageOwner, imageSizeOf } from '../shared/media.mjs';
import { HOME_PAGE_ID } from '../shared/pages.mjs';
import { ValidationError, validateImageSize } from '../shared/schema.mjs';
import { slotsFor } from '../shared/slots.mjs';
import { applyMove, canMove, moveOptions, removeItem, setPartRemoved } from '../shared/structure.mjs';
import { partsFor, isPartVisible } from '../shared/parts.mjs';
import { BUTTON_ICONS } from '../shared/ui-catalog.mjs';
import { isInterfaceBlock } from '../shared/interfaces.mjs';

const ACTION_SLOTS = 4;
const repeatedGroups = ['features', 'services', 'gallery', 'process', 'pricing', 'faq'];
const reorderable = (section) => repeatedGroups.includes(section.group) || isInterfaceBlock(section);
const partLabels = { heading: 'heading', body: 'description', action: 'primary action', icon: 'feature icon', buttonIcon: 'button icon', media: 'image' };
const choice = (instructions, criteria) => ({ type: 'choice', instructions, criteria });
const lowConfidence = (answer) => answer.confidence !== null && answer.confidence < 0.25;
const pageIdFor = (page, request = {}) => request.pageId ?? page.id ?? HOME_PAGE_ID;
const ownerRef = (target) => ({ pageId: target.pageId, sectionId: target.sectionId, ...(target.itemId === undefined ? {} : { itemId: target.itemId }) });
const itemLabel = (section, itemId) => `${ITEM_ORDINALS[section.items.findIndex((item) => item.id === itemId)] || 'existing'} item`;
function ownerLabel(page, target) {
  const section = page.sections.find((entry) => entry.id === target.sectionId);
  return section ? `${GROUP_LABELS[section.group]}${target.itemId === undefined ? '' : `, ${itemLabel(section, target.itemId)}`}` : target.pendingGroup ? GROUP_LABELS[target.pendingGroup] : 'Unavailable owner';
}
function moveLabel(page, proposal) {
  if (proposal.kind === 'section') {
    const before = page.sections.find((section) => section.id === proposal.beforeSectionId);
    return before && before.group !== 'footer' ? `Place before ${GROUP_LABELS[before.group]}.` : 'Place last in the body, before the footer when present.';
  }
  if (proposal.kind === 'item' || proposal.kind === 'transfer-item') {
    const target = page.sections.find((section) => section.id === (proposal.targetSectionId ?? proposal.sectionId));
    const location = proposal.beforeItemId === null ? 'last' : `before the ${itemLabel(target, proposal.beforeItemId)}`;
    return proposal.kind === 'transfer-item' ? `Transfer into ${GROUP_LABELS[target.group]}, ${location}; numbering follows its new sequence.` : `Place ${location} in the current collection.`;
  }
  if (proposal.destinationSlot === 'hero-media') return `Place the image ${proposal.beforePartKey} the content in the HTML reading order.`;
  if (proposal.destinationSlot === 'feature-icon') return `Place the feature icon ${proposal.beforePartKey} its text.`;
  if (proposal.destinationSlot === 'button-icon') return `Place the button icon ${proposal.beforePartKey === 'leading' ? 'before' : 'after'} the button label.`;
  return proposal.beforePartKey === null ? 'Place last in the current content stack.' : `Place before the ${partLabels[proposal.beforePartKey]}.`;
}
function availableMoves(page, target) {
  const seen = new Set();
  return moveOptions(page, { ...ownerRef(target), ...(target.partKey === undefined ? {} : { partKey: target.partKey }) })
    .filter(({ proposal }) => target.kind === 'move-section' ? proposal.kind === 'section' : target.kind === 'move-item' ? ['item', 'transfer-item'].includes(proposal.kind) : proposal.kind === 'part')
    .filter(({ proposal }) => { const key = JSON.stringify(proposal); if (seen.has(key)) return false; seen.add(key); return true; })
    .map(({ proposal }) => ({ proposal, label: moveLabel(page, proposal) }));
}
function iconCatalog(target) { return target.slot === 'feature-icon' ? CONTENT_ICONS : BUTTON_ICONS; }
function removalOptions(page, target) {
  const section = page.sections.find((entry) => entry.id === target.sectionId);
  if (!section || section.locked) return {};
  const options = {};
  for (const ref of [ownerRef(target), ...section.items.map((item) => ({ ...ownerRef(target), itemId: item.id }))]) {
    const owner = ownerLabel(page, ref);
    if (ref.itemId !== undefined) options[`remove_${Object.keys(options).length}`] = { kind: 'item', ...ref, label: `Delete the whole ${owner}, including its content and inner elements.` };
    for (const part of partsFor(section, ref.itemId).filter((part) => isPartVisible(ref.itemId === undefined ? section : section.items.find((item) => item.id === ref.itemId), part.partKey))) options[`remove_${Object.keys(options).length}`] = { kind: 'part', ...ref, partKey: part.partKey, label: `Remove only ${part.label} inside ${owner}; preserve its siblings and saved content for Undo.` };
  }
  return options;
}
function iconProposal(target, icon) { return { kind: 'replace-icon', ...ownerRef(target), slot: target.slot, icon }; }
function targetAvailable(page, target, { allowPendingMedia = false } = {}) {
  if (page.id !== undefined && page.id !== target.pageId) return false;
  const section = page.sections.find((entry) => entry.id === target.sectionId);
  if (!section || section.locked || target.itemId !== undefined && !section.items.some((item) => item.id === target.itemId)) return false;
  if (target.kind === 'remove-element') return Object.keys(removalOptions(page, target)).length > 0;
  if (target.pendingGroup && (target.kind !== 'move-section' || !OPTIONAL_GROUPS.includes(target.pendingGroup) || target.sectionId !== target.pendingGroup || section.group !== target.pendingGroup)) return false;
  if (target.kind === 'resize-image') return Boolean(imageOwner(section, target.itemId)) || allowPendingMedia && !isInterfaceBlock(section) && target.itemId === undefined && ['hero', 'about'].includes(target.pendingMedia) && section.group === target.pendingMedia;
  if (target.kind === 'replace-icon') return Object.keys(iconCatalog(target)).some((icon) => canMove(page, iconProposal(target, icon), target.pageId).allowed);
  if (target.kind === 'move-part') return slotsFor(section, target.itemId).some((part) => part.partKey === target.partKey && part.choices.length);
  return target.kind === 'move-item' ? reorderable(section) : !['navigation', 'hero', 'footer'].includes(section.group);
}
function planningTargets(request) {
  const page = request.spec, pageId = pageIdFor(page, request), targets = {};
  const append = (target) => { targets[`canvas_source_${Object.keys(targets).length}`] = target; };
  const add = (target) => {
    if (!targetAvailable(page, target, { allowPendingMedia: true })) return;
    if (target.kind.startsWith('move-') && !availableMoves(page, target).length) return;
    append(target);
  };
  for (const section of page.sections) {
    if (section.locked) continue;
    const base = { pageId, sectionId: section.id };
    add({ kind: 'move-section', ...base });
    add({ kind: 'remove-element', ...base });
    for (const item of section.items) if (reorderable(section)) add({ kind: 'move-item', ...base, itemId: item.id });
    for (const ref of [base, ...section.items.map((item) => ({ ...base, itemId: item.id }))]) {
      for (const part of slotsFor(section, ref.itemId)) if (part.choices.length) add({ kind: 'move-part', ...ref, partKey: part.partKey });
      if (imageOwner(section, ref.itemId)) add({ kind: 'resize-image', ...ref });
      if (ref.itemId !== undefined && ['features', 'pricing'].includes(section.group)) add({ kind: 'replace-icon', ...ref, slot: section.group === 'features' ? 'feature-icon' : 'button-icon' });
    }
    if (!isInterfaceBlock(section) && ['hero', 'about'].includes(section.group) && !imageOwner(section)) add({ kind: 'resize-image', ...base, pendingMedia: section.group });
  }
  // Inclusion remains a separate bounded planning decision. These targets only
  // arrange a section if that decision actually creates its expected identity.
  for (const group of OPTIONAL_GROUPS) if (!page.sections.some((section) => section.group === group)) append({ kind: 'move-section', pageId, sectionId: group, pendingGroup: group });
  if (Object.keys(targets).length > 254) { const error = new Error('This page exceeds the supported canvas-choice budget. Nothing was applied.'); error.status = 422; throw error; }
  return targets;
}
function targetLabel(page, target) {
  const owner = ownerLabel(page, target);
  if (target.pendingGroup) return `Place the new ${owner} section at an explicitly requested body position, only if this request also adds that absent section.`;
  if (target.kind === 'move-section') return `Move the ${owner} section to another permitted body position.`;
  if (target.kind === 'remove-element') return `Delete an explicitly requested item or visible inner element within ${owner}. The next choice identifies the exact item or part; never remove content for a general restyle. Whole-section removal uses the section-presence choices.`;
  if (target.kind === 'move-item') return `Move ${owner} within its collection or to an explicitly offered compatible collection.`;
  if (target.kind === 'move-part') return `Move the ${partLabels[target.partKey]} inside ${owner} to an authored position.`;
  if (target.kind === 'resize-image') return `Resize the ${owner} image frame: width percentage, pixel height or automatic height, and cover/contain fit.${target.pendingMedia ? ' The current component hides its image. Select only when this same request explicitly enables an image-rendering component; resizing alone does not change the component.' : ''}`;
  return `Replace only the ${target.slot === 'feature-icon' ? 'feature' : 'button'} icon in ${owner} with an offered local catalog icon.`;
}
export function canvasPlanning(request) {
  const targets = planningTargets(request);
  if (!Object.keys(targets).length) return { questions: {}, targets };
  const criteria = { keep: 'No additional explicitly requested canvas action.', ...Object.fromEntries(Object.entries(targets).map(([key, target]) => [key, targetLabel(request.spec, target)])) };
  const instructions = 'Plan only an explicitly requested item or inner-element deletion, section move, item reorder/compatible transfer, authored inner-element move, image resize/fit/reset, or individual catalog icon replacement. A broad redesign, restyle, theme change or new page alone requires keep. Use group, ordinal, selected flags and titleMentioned metadata to identify the existing owner; selection applies only inside its own section. Never guess unavailable elements or infer image contents. A pending new-section target is usable only when the inclusion questions also add that section in this request. A hidden-image target is usable only when this request explicitly enables an image-rendering component; it never changes the component itself. Each action slot selects one source and operation, then a second pass chooses its bounded destination or sizing. Up to four requested actions are supported; use keep in unused slots. Use each source/operation once unless the user explicitly requested successive operations on it. A single image resize slot can change width, height and fit together. For a transfer followed by an inner-element edit, select the original item owner in both slots; verified transfers preserve its identity. Removal chooses an exact saved item or authored part in the second pass. Deleting an entire section uses its separate presence question. Item insertion and arbitrary cross-container or cross-page transfers are unsupported.';
  return { questions: Object.fromEntries(Array.from({ length: ACTION_SLOTS }, (_, slot) => [`canvas_target_${slot}`, choice(`${instructions} Select requested action ${slot + 1}, in the user’s requested sequence.`, criteria)])), targets };
}

function exactHeights(prompt) {
  const values = new Set();
  // Only literal bounded integers from the user can augment the prepared choices.
  for (const expression of [/(?<![\d.+-])\b(\d{2,4})\s*px\b/gi, /\bheight\s*(?:(?:of|to|is|at)\s*|[:=]\s*)?(\d{2,4})(?![.\d])\b/gi, /(?<![\d.+-])\b(\d{2,4})\s*(?:pixels?\s*)?(?:tall|high)\b/gi]) {
    for (const match of prompt.matchAll(expression)) {
      const height = Number(match[1]);
      if (height >= IMAGE_SIZE_LIMITS.minHeight && height <= IMAGE_SIZE_LIMITS.maxHeight) values.add(height);
      if (values.size >= 32) return [...values];
    }
  }
  return [...values];
}
function imageChoices(prompt) {
  const width = Object.fromEntries(Array.from({ length: IMAGE_SIZE_LIMITS.maxWidth - IMAGE_SIZE_LIMITS.minWidth + 1 }, (_, index) => { const value = IMAGE_SIZE_LIMITS.minWidth + index; return [`width_${value}`, value]; }));
  const heights = new Set(Array.from({ length: (IMAGE_SIZE_LIMITS.maxHeight - IMAGE_SIZE_LIMITS.minHeight) / 20 + 1 }, (_, index) => IMAGE_SIZE_LIMITS.minHeight + index * 20));
  exactHeights(prompt).forEach((height) => heights.add(height));
  return { width, height: { auto: null, ...Object.fromEntries([...heights].sort((a, b) => a - b).map((height) => [`height_${height}`, height])) }, fit: { cover: 'cover', contain: 'contain' } };
}
export function canvasQuestions(page, request, planning, answers, warnings) {
  const questions = {}, actions = [];
  for (let slot = 0; slot < ACTION_SLOTS; slot++) {
    const answer = answers[`canvas_target_${slot}`];
    if (!answer || answer.choice === 'keep') continue;
    if (lowConfidence(answer)) { warnings.push(`Canvas action ${slot + 1} was uncertain and was not applied.`); continue; }
    const target = Object.hasOwn(planning.targets, answer.choice) ? planning.targets[answer.choice] : undefined;
    if (!target || target.pageId !== pageIdFor(page, request) || !targetAvailable(page, target, { allowPendingMedia: true })) { warnings.push(`Canvas action ${slot + 1} targeted an unavailable or locked owner and was not applied.`); continue; }
    const label = ownerLabel(page, target), prefix = `canvas_${slot}`;
    if (target.kind === 'remove-element') {
      const options = removalOptions(page, target);
      questions[`${prefix}_remove`] = choice(`Choose exactly the item or inner UI element explicitly requested for deletion inside ${label}. Use keep when the request only restyles, moves or replaces it, when its identity is unclear, or when it is absent or locked. A whole item removal deletes that item; a part removal preserves the other parts and item. Never infer deletions from a redesign.`, { keep: 'Preserve all items and elements.', ...Object.fromEntries(Object.entries(options).map(([key, option]) => [key, option.label])) });
      actions.push({ slot, target, options });
    } else if (target.kind.startsWith('move-')) {
      const options = Object.fromEntries(availableMoves(page, target).map((option, index) => [`move_${index}`, option]));
      if (!Object.keys(options).length) { warnings.push(`${label}: no compatible destination remains for canvas action ${slot + 1}.`); continue; }
      questions[`${prefix}_move`] = choice(`Choose the explicitly requested destination for ${targetLabel(page, target)} Preserve all unrelated content and use keep for an unclear or unavailable destination. These are application-generated proposals bound to stable IDs; never invent a destination. Ordinals refer to the supplied current order. Moves keep fixed Navigation, Hero and Footer positions, cannot cross locked section slots, and only offered plain Services/Process transfers are lossless.`, { keep: 'Keep the source in its current position.', ...Object.fromEntries(Object.entries(options).map(([key, option]) => [key, option.label])) });
      actions.push({ slot, target, options });
    } else if (target.kind === 'replace-icon') {
      const options = Object.fromEntries(Object.entries(iconCatalog(target)).filter(([icon]) => canMove(page, iconProposal(target, icon), target.pageId).allowed).map(([icon, entry]) => [icon, { proposal: iconProposal(target, icon), label: entry.description || entry.label }]));
      questions[`${prefix}_icon`] = choice(`Choose only the explicitly requested catalog icon for ${label}. No custom SVG or arbitrary icon is supported; use keep when the requested icon is unavailable or when the user only requested icon movement or styling.`, { keep: 'Preserve this specific icon.', ...Object.fromEntries(Object.entries(options).map(([key, option]) => [key, option.label])) });
      actions.push({ slot, target, options });
    } else {
      const options = imageChoices(request.prompt), section = page.sections.find((entry) => entry.id === target.sectionId), owner = imageOwner(section, target.itemId), current = imageSizeOf(owner || section);
      const context = `Resize only the image frame in ${label}. Current width: ${current.width}% of its allocated layout slot; current height: ${current.height === null ? 'automatic' : `${current.height}px`}; current fit: ${current.fit}. Preserve each field unless the user requests changing it. A broad redesign alone requires keep. Width is a percentage of the allocated slot, not a pixel measurement. Height is fixed CSS pixels; width remains constrained by the responsive layout. Reset to the original image size means width 100%, automatic height and cover. ${target.pendingMedia ? 'These settings apply only if the separately chosen component actually displays the image after this request. Do not enable or switch components merely to satisfy resizing.' : ''} Do not infer image contents.`;
      questions[`${prefix}_width`] = choice(`${context} Choose width.`, { keep: 'Preserve the current width.', ...Object.fromEntries(Object.entries(options.width).map(([key, value]) => [key, `Set width to ${value}%.`])) });
      questions[`${prefix}_height`] = choice(`${context} Choose height. Exact extra pixel heights are accepted only when already extracted from the user request.`, { keep: 'Preserve the current height.', ...Object.fromEntries(Object.entries(options.height).map(([key, value]) => [key, value === null ? 'Use automatic height from the component proportions.' : `Set height to ${value}px.`])) });
      questions[`${prefix}_fit`] = choice(`${context} Choose fit.`, { keep: 'Preserve the current fit.', cover: 'Fill the frame, allowing cropping.', contain: 'Show the whole image within the frame.' });
      actions.push({ slot, target, options });
    }
  }
  return { questions, actions };
}

function chosenOption(answer, options, warnings, label) {
  if (!answer || answer.choice === 'keep') return undefined;
  if (lowConfidence(answer)) { warnings.push(`${label} was uncertain and was preserved.`); return undefined; }
  if (!Object.hasOwn(options, answer.choice)) { warnings.push(`${label} was outside the offered choices and was preserved.`); return undefined; }
  return { value: options[answer.choice] };
}
const transferKey = (ref) => JSON.stringify([ref.pageId, ref.sectionId, ref.itemId]);
function rebaseTarget(target, transfers) {
  const movedOwner = target.itemId === undefined ? undefined : transfers.get(transferKey(target));
  return { ...target, ...(movedOwner ? { sectionId: movedOwner.sectionId } : {}) };
}
function itemDestinationStillMatches(original, proposal, transfers) {
  if (!['item', 'transfer-item'].includes(original.kind) || original.beforeItemId === null) return true;
  const destination = { pageId: original.pageId, sectionId: original.targetSectionId ?? original.sectionId, itemId: original.beforeItemId };
  const current = transfers.get(transferKey(destination)) ?? destination;
  // A reused legacy ID in another collection cannot stand in for the original
  // destination. Only an observed transfer can establish that item's new owner.
  return current.sectionId === (proposal.targetSectionId ?? proposal.sectionId);
}
function rememberTransfer(transfers, originalTarget, proposal) {
  const destination = { pageId: proposal.pageId, sectionId: proposal.targetSectionId, itemId: proposal.itemId };
  for (const [key, current] of transfers) {
    if (current.pageId === proposal.pageId && current.sectionId === proposal.sectionId && current.itemId === proposal.itemId) transfers.set(key, destination);
  }
  // Keep the original source as the key: the physical source may now contain a
  // different item whose legacy ID happens to match an earlier moved item.
  transfers.set(transferKey(originalTarget), destination);
}
export function applyCanvasAnswers(page, actions, answers, warnings) {
  let result = page;
  const transfers = new Map();
  for (const action of actions) {
    const { slot, options } = action, target = rebaseTarget(action.target, transfers), prefix = `canvas_${slot}`, label = `Canvas action ${slot + 1}`;
    if (!targetAvailable(result, target)) { warnings.push(`${label} no longer has an available, unlocked owner after the other edits and was not applied.`); continue; }
    if (target.kind === 'remove-element') {
      const selected = chosenOption(answers[`${prefix}_remove`], options, warnings, label);
      if (!selected) continue;
      const option = rebaseTarget(selected.value, transfers);
      const removed = option.kind === 'item' ? removeItem(result, option.sectionId, option.itemId) : setPartRemoved(result, ownerRef(option), option.partKey, true);
      if (!removed.allowed) { warnings.push(`${label} could not remove the requested element under the current section, item or lock constraints.`); continue; }
      result = removed.page;
      continue;
    }
    if (target.kind !== 'resize-image') {
      const selected = chosenOption(answers[`${prefix}_${target.kind === 'replace-icon' ? 'icon' : 'move'}`], options, warnings, label);
      if (!selected) continue;
      const original = selected.value.proposal, proposal = { ...original, sectionId: target.sectionId };
      if (!itemDestinationStillMatches(original, proposal, transfers)) { warnings.push(`${label} refers to an item destination outside its current collection after a transfer and was not applied.`); continue; }
      const moved = applyMove(result, proposal, target.pageId);
      if (!moved.allowed) { warnings.push(`${label} conflicts with the current section, item or lock constraints and was not applied.`); continue; }
      if (proposal.kind === 'transfer-item' && moved.changed) rememberTransfer(transfers, action.target, proposal);
      result = moved.page;
      continue;
    }
    const section = result.sections.find((entry) => entry.id === target.sectionId), owner = imageOwner(section, target.itemId), imageSize = imageSizeOf(owner);
    let changed = false;
    for (const field of ['width', 'height', 'fit']) {
      const selected = chosenOption(answers[`${prefix}_${field}`], options[field], warnings, `${label} image ${field}`);
      if (selected && imageSize[field] !== selected.value) { imageSize[field] = selected.value; changed = true; }
    }
    if (!changed) continue;
    let validated;
    try { validated = validateImageSize(imageSize); }
    catch (error) { if (!(error instanceof ValidationError)) throw error; warnings.push(`${label} contained an unsupported image size and was not applied.`); continue; }
    const updated = target.itemId === undefined ? { ...section, imageSize: validated } : { ...section, items: section.items.map((item) => item.id === target.itemId ? { ...item, imageSize: validated } : item) };
    result = { ...result, sections: result.sections.map((entry) => entry.id === target.sectionId ? updated : entry) };
  }
  return result;
}

/** Metadata helps resolve natural-language references without sharing image data
 * or stored item text. Selected IDs and ordinal labels describe this page only. */
export function canvasContext(page, request) {
  const mentioned = (title) => typeof title === 'string' && title.trim().length >= 4 && request.prompt.toLocaleLowerCase().includes(title.trim().toLocaleLowerCase());
  return { pageId: pageIdFor(page, request), maximumActions: ACTION_SLOTS, imageLimits: IMAGE_SIZE_LIMITS, sections: page.sections.map((section, order) => ({
    id: section.id, group: section.group, order, locked: section.locked, selected: request.selectedSectionId === section.id, titleMentioned: mentioned(section.title), removedParts: section.removedParts, removableParts: partsFor(section).filter((part) => isPartVisible(section, part.partKey)).map((part) => part.partKey),
    placements: { mediaPlacement: section.elements.mediaPlacement, contentOrder: section.elements.contentOrder, textOrder: section.elements.textOrder, iconPlacement: section.elements.iconPlacement, buttonIconPlacement: section.elements.buttonIconPlacement },
    parts: slotsFor(section).map((part) => part.partKey), ...(!isInterfaceBlock(section) && ['hero', 'about'].includes(section.group) ? { imageSize: imageSizeOf(section), imageVisible: Boolean(imageOwner(section)), hasUploadedImage: Boolean(section.image) } : {}),
    items: section.items.map((item, index) => ({ id: item.id, index, ordinal: ITEM_ORDINALS[index], selected: request.selectedSectionId === section.id && request.selectedItemIndex === index, titleMentioned: mentioned(item.title), removedParts: item.removedParts, removableParts: partsFor(section, item.id).filter((part) => isPartVisible(item, part.partKey)).map((part) => part.partKey), placements: item.placements, parts: slotsFor(section, item.id).map((part) => part.partKey), ...(imageOwner(section, item.id) ? { imageSize: imageSizeOf(item), imageVisible: true, hasUploadedImage: Boolean(item.image) } : {}) }))
  })) };
}
