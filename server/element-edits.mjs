/** Bounded adapters for the elements inside a component. Models choose approved
 * values and destinations; only ordinary code copies user-supplied wording. */
import { GROUPS, GROUP_LABELS } from '../shared/catalog.mjs';
import { isBareLiteralPrefix } from '../shared/content.mjs';
import { ELEMENT_CONTROLS, MAX_COMPOSITION_QUESTIONS, elementFieldsFor, elementOptionsFor } from '../shared/elements.mjs';
import { CONTENT_ICONS } from '../shared/icons.mjs';
import { safeHref } from '../shared/schema.mjs';
import { parsePageHref, HOME_PAGE_ID } from '../shared/pages.mjs';
import { slotsFor, placementFor } from '../shared/slots.mjs';
import { isInterfaceBlock } from '../shared/interfaces.mjs';
import { partsFor, isPartVisible } from '../shared/parts.mjs';

export { MAX_COMPOSITION_QUESTIONS } from '../shared/elements.mjs';
const choice = (instructions, criteria) => ({ type: 'choice', instructions, criteria });
const sectionLimits = { eyebrow: 120, title: 300, body: 3000, button: 100, href: 2048 };
const itemLimits = { title: 180, body: 1800, meta: 120, price: 80, href: 2048 };
const itemFields = { features: ['title', 'body', 'href'], services: ['title', 'body', 'price', 'href'], gallery: ['title', 'body', 'meta', 'href'], process: ['title', 'body', 'href'], pricing: ['title', 'body', 'meta', 'price', 'href'], faq: ['title', 'body', 'href'] };
const fieldLabels = { eyebrow: 'small section label', title: 'heading', body: 'description', button: 'button text', href: 'link destination', meta: 'caption or period', price: 'price text' };
const fieldParts = { title: 'heading', body: 'body', eyebrow: 'eyebrow', button: 'buttonLabel', meta: 'meta', price: 'price' };
const copyVisible = (owner, field) => !fieldParts[field] || isPartVisible(owner, fieldParts[field]);
export const ordinalNames = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'];

export function assertQuestionBudget(questions) {
  if (Object.keys(questions).length > MAX_COMPOSITION_QUESTIONS || Object.values(questions).some((question) => Object.keys(question.criteria).length > 255)) {
    const error = new Error('This request exceeds the supported design-decision budget. Nothing was applied.'); error.status = 422; throw error;
  }
  return questions;
}
export function selectionFor(request) {
  const section = request.spec.sections.find((candidate) => candidate.id === request.selectedSectionId);
  if (!section) return null;
  const itemIndex = request.selectedItemId === undefined ? request.selectedItemIndex : section.items.findIndex((item) => item.id === request.selectedItemId);
  const item = Number.isInteger(itemIndex) && itemIndex >= 0 ? section.items[itemIndex] : undefined;
  const partKey = partsFor(section, item?.id).some((part) => part.partKey === request.selectedPartKey) && isPartVisible(item || section, request.selectedPartKey) ? request.selectedPartKey : undefined;
  return { pageId: request.pageId ?? HOME_PAGE_ID, sectionId: section.id, group: section.group, itemIndex: item ? itemIndex : null, ...(item ? { itemId: item.id } : {}), ...(partKey === undefined ? {} : { partKey }) };
}
export function itemContext(section, prompt) {
  return section.items.map((item, index) => ({ id: item.id, index, ordinal: ordinalNames[index], uiType: item.uiType, icon: item.icon, buttonIcon: item.buttonIcon, removedParts: item.removedParts, placements: item.placements, titleMentioned: item.title.trim().length >= 4 && prompt.toLocaleLowerCase().includes(item.title.trim().toLocaleLowerCase()) }));
}

function itemPlacementChoices(section, selectedItemIndex) {
  const choices = {};
  for (const [index, item] of section.items.entries()) if (selectedItemIndex === undefined || selectedItemIndex === index) for (const part of slotsFor(section, item.id)) for (const destination of part.choices) {
    const patch = placementFor(section, { sectionId: section.id, itemId: item.id }, part.partKey, destination.destinationSlot, destination.beforePartKey);
    if (patch.allowed) choices[`item${index}_${patch.field}_${patch.value}`] = { ...patch, label: `${ordinalNames[index]} item: ${destination.label}` };
  }
  return choices;
}
function copyFields(section) {
  if (section.group === 'navigation') return [];
  if (section.group === 'footer') return ['body'];
  const fields = ['eyebrow', 'title', 'body'];
  if (['hero', 'about', 'pricing', 'contact', 'cta'].includes(section.group)) fields.push('button');
  if (['hero', 'about', 'pricing', 'cta'].includes(section.group) || section.block === 'contact-simple') fields.push('href');
  return fields;
}
function validLiteralLink(value, site) {
  try {
    safeHref(value);
    const target = parsePageHref(value);
    if (!target) return true;
    const page = target.pageId === HOME_PAGE_ID ? site : site.pages?.find((candidate) => candidate.id === target.pageId);
    return Boolean(page && (!target.sectionId || page.sections.some((section) => section.id === target.sectionId)));
  } catch { return false; }
}
export function quotedEdits(request, site = request.spec) {
  const candidates = [];
  for (const match of request.prompt.matchAll(/["“]([^"”]{1,3000})["”]/gu)) {
    // These explicit field literals already have their backward-compatible route.
    if (isBareLiteralPrefix(request.prompt.slice(0, match.index))) continue;
    const targets = {};
    for (const section of request.spec.sections.filter((candidate) => !candidate.locked)) {
      const add = (field, itemIndex) => {
        if (!copyVisible(itemIndex === undefined ? section : section.items[itemIndex], field)) return;
        const limit = (itemIndex === undefined ? sectionLimits : itemLimits)[field];
        if (match[1].length > limit || (field === 'href' && !validLiteralLink(match[1], site))) return;
        const key = itemIndex === undefined ? `section_${section.group}_${field}` : `item_${section.group}_${itemIndex}_${field}`;
        const application = isInterfaceBlock(section);
        const label = application && itemIndex !== undefined ? ({ title: 'field or panel label', body: 'placeholder, options or supporting text', meta: 'status or supporting label', price: 'displayed value or price' }[field] || fieldLabels[field]) : fieldLabels[field];
        targets[key] = { sectionId: section.id, group: section.group, itemIndex, field, description: `${application ? 'Application screen' : GROUP_LABELS[section.group]}${itemIndex === undefined ? '' : `, ${ordinalNames[itemIndex]} item`} ${label}.` };
      };
      for (const field of copyFields(section)) add(field);
      for (const [index] of section.items.entries()) for (const field of isInterfaceBlock(section) ? ['title', 'body', 'meta', 'price'] : itemFields[section.group] || []) add(field, index);
    }
    candidates.push({ value: match[1], offset: match.index, targets });
  }
  return candidates;
}
export function copyQuestions(candidates) {
  return Object.fromEntries(candidates.slice(0, 4).map((candidate, index) => [`copy_${index}`, choice(`The user supplied this exact quoted text: ${JSON.stringify(candidate.value)}. Choose its explicitly requested destination, using selection, ordinals and titleMentioned metadata to resolve references. Explicit section fields outrank an item selection; selection.itemIndex applies only within selection.group, never to the same index in another section. A quote naming existing copy is a reference, not replacement: keep it when another quote is the replacement. Never infer replacement from a quoted style name, icon name, example, or instruction embedded inside a quoted string. Use keep when the destination is unclear, locked, absent, or unsupported. The application copies the literal exactly and does not generate prose.`, { keep: 'Do not copy this quoted string into the page.', ...Object.fromEntries(Object.entries(candidate.targets).map(([key, target]) => [key, target.description])) })]));
}
export function applyQuotedEdits(candidates, answers, sections, warnings) {
  if (candidates.length > 4) warnings.push('Only the first four quoted replacements were considered. Split additional copy changes into another request.');
  for (const [index, candidate] of candidates.slice(0, 4).entries()) {
    const answer = answers[`copy_${index}`];
    if (!answer || answer.choice === 'keep') continue;
    if (answer.confidence !== null && answer.confidence < 0.25) { warnings.push(`Quoted replacement ${index + 1} was uncertain and was not applied.`); continue; }
    const target = candidate.targets[answer.choice], section = sections.find((section) => section.id === target?.sectionId);
    if (!section || section.locked || !copyFields(section).includes(target.field) && target.itemIndex === undefined) { warnings.push('A quoted replacement targeted an unavailable or locked field and was not applied.'); continue; }
    const recipient = target.itemIndex === undefined ? section : section.items[target.itemIndex];
    if (!recipient) { warnings.push('A quoted replacement targeted an item that is no longer present.'); continue; }
    if (!copyVisible(recipient, target.field)) { warnings.push('A quoted replacement targeted a removed element and was not applied. Restore the element before editing its text.'); continue; }
    recipient[target.field] = candidate.value;
    if (target.field === 'button' && target.itemIndex === undefined) section.elements.buttonLabel = 'default';
  }
}
export function elementQuestions(section, { preserve, edit, existing, context, selectedItemIndex }) {
  const questions = {}, keep = preserve && existing ? { keep: 'Preserve the current value exactly.' } : {};
  context += ' Whole-section controls must stay unchanged for a request limited to one named or selected item. Use targeted canvas actions for that item’s movement, placement or button-icon replacement, including when it is named instead of selected. Change collection-wide settings only when the whole collection is explicitly addressed.';
  // Ask about the family so a newly selected variant can also receive controls.
  for (const field of elementFieldsFor(isInterfaceBlock(section) ? section : section.group)) {
    const control = ELEMENT_CONTROLS[field];
    questions[`element_${section.group}_${field}`] = choice(`Choose ${control.label} inside ${GROUP_LABELS[section.group]}. ${control.description} ${context} ${edit && existing ? 'This is a focused edit: choose keep unless the user requests this specific element change in this section. Resolve “this section” from selection; do not restyle unrelated sections.' : 'Choose a suitable supported setting for this component. Preserve content and actions unless the user explicitly asks to hide or show them.'} ${Number.isInteger(selectedItemIndex) && ['textOrder', 'iconPlacement', 'buttonIconPlacement'].includes(field) ? 'For a placement requested only inside the selected item, choose keep here and use the selected-item placement question. This control applies to the whole collection.' : ''} ${field === 'buttonLabel' ? 'Change the prepared button wording ONLY if explicitly requested. A broad redesign does not authorize changing copy; use keep for existing copy or default for a new section.' : ''} Controls apply only when the selected variant supports them. Columns set desktop item columns; smaller screens remain responsive.`, { ...elementOptionsFor({ ...section, block: undefined }, field), ...keep });
  }
  if (section.group === 'features') for (const [index, item] of section.items.entries()) {
    if (!isPartVisible(item, 'icon')) continue;
    questions[`icon_features_${index}`] = choice(`Choose the icon for the ${ordinalNames[index]} feature item (zero-based index ${index}). Resolve a named item with titleMentioned and “this item” with selection.itemIndex only when selection.group is features. Item selection in another section does not target a feature item. Change ONLY when this icon, all feature icons, or a clearly matching item is explicitly requested; broad redesign alone preserves existing icons. “Remove icons” means none. No custom SVG, uploaded icon or arbitrary icon name is supported. If the named icon is unavailable, choose keep rather than an invented substitute.`, { default: 'Use this item’s original positional icon.', none: 'Hide this item’s icon.', ...Object.fromEntries(Object.entries(CONTENT_ICONS).map(([key, details]) => [key, details.description || details.label])), keep: 'Preserve this item’s current icon exactly.' });
  }
  if (Number.isInteger(selectedItemIndex)) {
    const placements = itemPlacementChoices(section, selectedItemIndex);
    if (Object.keys(placements).length) questions[`placement_${section.group}`] = choice(`Choose one authored inner placement for the selected ${ordinalNames[selectedItemIndex]} item. Only change a placement explicitly requested for this item. Use keep for unrelated requests, hidden parts, unsupported parts and broad redesigns. The choices change actual DOM reading order or an authored icon position without moving or replacing content.`, { keep: 'Preserve this item’s authored placements.', ...Object.fromEntries(Object.entries(placements).map(([key, placement]) => [key, placement.label])) });
  }
  return questions;
}
export function applyElementAnswers(section, answers, warnings, preserve) {
  if (section.locked) return;
  for (const field of elementFieldsFor(section.group)) {
    const answer = answers[`element_${section.group}_${field}`];
    if (!answer || answer.choice === 'keep' || preserve && answer.confidence !== null && answer.confidence < 0.25) continue;
    if (!elementFieldsFor(section).includes(field) || !Object.hasOwn(elementOptionsFor(section, field), answer.choice)) {
      if (answer.choice !== 'default') warnings.push(`${GROUP_LABELS[section.group]}: ${ELEMENT_CONTROLS[field].label} is unavailable in the selected component or item count; it was preserved.`);
      continue;
    }
    section.elements[field] = answer.choice;
    if (field === 'featuredItem') {
      const index = answer.choice === 'default' ? section.block === 'pricing-featured' ? 1 : -1 : ordinalNames.indexOf(answer.choice);
      section.featuredItemId = section.items[index]?.id || null;
    }
  }
  if (section.group === 'features') for (const [index, item] of section.items.entries()) {
    if (!isPartVisible(item, 'icon')) continue;
    const answer = answers[`icon_features_${index}`];
    if (answer && answer.choice !== 'keep' && !(preserve && answer.confidence !== null && answer.confidence < 0.25)) item.icon = answer.choice;
  }
  const placement = answers[`placement_${section.group}`];
  if (placement && placement.choice !== 'keep' && !(preserve && placement.confidence !== null && placement.confidence < 0.25)) {
    const patch = itemPlacementChoices(section)[placement.choice];
    const item = patch && section.items.find((entry) => entry.id === patch.itemId);
    if (item) item.placements = { ...item.placements, [patch.field]: patch.value };
    else warnings.push(`${GROUP_LABELS[section.group]}: this inner placement is unavailable in the selected component; it was preserved.`);
  }
}

const aliases = { hero: /\bhero\b/, features: /\bfeatures?\b|\bbenefits?\b/, services: /\bservices?\b/, gallery: /\bgallery\b|\bportfolio\b/, process: /\bprocess\b|\bsteps?\b/, pricing: /\bpricing\b|\bplans?\b|\btiers?\b/, faq: /\bfaq\b|\bquestions\b/, about: /\babout\b/, cta: /\bcta\b|call.to.action|closing/, contact: /\bcontact\b/, navigation: /\bnav(?:igation|bar)?\b/, footer: /\bfooter\b/ };
const scopeText = (prompt) => prompt.replace(/["“][^"”]*["”]/gu, '').replace(/\b(?:learn more|get started|contact us|view work|read more)\b/gi, '');
export function demoSectionScope(state, group, prompt = state.user_request.toLowerCase()) {
  const mentioned = GROUPS.filter((candidate) => aliases[candidate].test(scopeText(prompt)));
  if (mentioned.length) return mentioned.includes(group);
  if (/\ball (?:sections|cards|buttons|headings)\b/.test(prompt)) return true;
  return state.selection?.group === group || group === 'features' && /\bicons?\b/.test(prompt) && !state.selection;
}
function clauseForGroup(state, group) {
  const clauses = state.user_request.toLowerCase().split(/[;\n]|\.(?:\s|$)/).filter(Boolean);
  const explicit = clauses.filter((clause) => aliases[group].test(scopeText(clause)));
  return explicit.length ? explicit.join('. ') : clauses.filter((clause) => demoSectionScope(state, group, clause)).join('. ');
}
export function demoElementChoice(state, key, question) {
  const placementMatch = key.match(/^placement_([a-z]+)$/);
  if (placementMatch) {
    const group = placementMatch[1], p = clauseForGroup(state, group), index = state.selection?.group === group ? state.selection.itemIndex : undefined;
    if (!Number.isInteger(index) || !demoSectionScope(state, group)) return 'keep';
    let field, value;
    if (/icons?/.test(p)) {
      if (/button|label/.test(p)) { field = 'buttonIconPlacement'; value = /before|leading|left/.test(p) ? 'leading' : /after|trailing|right/.test(p) ? 'trailing' : undefined; }
      else { field = 'iconPlacement'; value = /above|over the text/.test(p) ? 'above' : /beside|next to/.test(p) ? 'beside' : undefined; }
    } else if (/heading|title|body|description/.test(p) && /before|after|above|below/.test(p)) {
      field = 'textOrder'; value = /(?:body|description).*(?:before|above)|(?:heading|title).*(?:after|below)/.test(p) ? 'body-heading' : 'heading-body';
    }
    const answer = `item${index}_${field}_${value}`;
    return Object.hasOwn(question.criteria, answer) ? answer : 'keep';
  }
  const match = key.match(/^element_([a-z]+)_([A-Za-z]+)$/);
  if (match) {
    const [, group, field] = match, p = clauseForGroup(state, group), has = (expression) => expression.test(p);
    if (!p || !demoSectionScope(state, group)) return Object.hasOwn(question.criteria, 'keep') ? 'keep' : 'default';
    const selectedItem = state.selection?.group === group && Number.isInteger(state.selection.itemIndex) && !has(/\ball\b|\bevery\b/);
    if (field === 'iconPlacement') return selectedItem ? 'keep' : has(/icons?.*(?:above|over the text)/) ? 'above' : has(/icons?.*(?:beside|next to)/) ? 'beside' : 'keep';
    if (field === 'buttonIconPlacement') return selectedItem ? 'keep' : has(/(?:button|action).*icon|icon.*(?:button|label)/) ? has(/before|leading|left/) ? 'leading' : has(/after|trailing|right/) ? 'trailing' : 'keep' : 'keep';
    if (field === 'textOrder') return selectedItem ? 'keep' : has(/(?:body|description).*(?:before|above).*?(?:heading|title)|(?:heading|title).*(?:after|below).*?(?:body|description)/) ? 'body-heading' : has(/(?:heading|title).*(?:before|above).*?(?:body|description)|(?:body|description).*(?:after|below).*?(?:heading|title)/) ? 'heading-body' : 'keep';
    if (field === 'contentOrder') {
      const relation = p.match(/\b(button|action|heading|title|body|description)\b[^.;]*?\b(before|after|above|below)\b\s+(?:the\s+)?(button|action|heading|title|body|description)\b/);
      if (!relation || has(/icons?/)) return 'keep';
      const part = (name) => ({ button: 'action', title: 'heading', description: 'body' })[name] || name;
      const source = part(relation[1]), target = part(relation[3]);
      if (source === target) return 'keep';
      const current = state.existing.sections.find((section) => section.group === group)?.elements?.contentOrder;
      const order = (current && current !== 'default' ? current.split('-') : ['heading', 'body', 'action']).filter((key) => key !== source);
      order.splice(order.indexOf(target) + (['after', 'below'].includes(relation[2]) ? 1 : 0), 0, source);
      return order.join('-');
    }
    if (field === 'columns') {
      const count = p.match(/\b(one|two|three|four|1|2|3|4)[ -](?:(?:feature|service|card|item|gallery|pricing|plan|process|faq)s?\s+)?columns?\b/);
      if (count) return ({ 1: 'one', 2: 'two', 3: 'three', 4: 'four' })[count[1]] || count[1];
    }
    if (field === 'contentAlign') {
      if (has(/(?:center|centre)(?!ed?\s+headings?)/) && !has(/headings?/) || has(/(?:card|item|content).*cent(?:er|re)|cent(?:er|re).*(?:card|item|content)/)) return 'center';
      if (has(/left.align|align.*left|start.align/)) return 'start';
    }
    if (field === 'iconStyle' && has(/icons?/)) return has(/outlined?|border/) ? 'outlined' : has(/solid|filled/) ? 'solid' : has(/soft|tint/) ? 'soft' : has(/plain|no.*background|without.*background/) ? 'plain' : 'keep';
    if (field === 'iconSize' && has(/icons?/)) return has(/large|bigger|big|enlarge/) ? 'large' : has(/small|tiny|shrink/) ? 'small' : 'keep';
    if (field === 'primaryAction' && !has(/secondary/)) {
      if (has(/\b(?:hide|remove|disable|without|no)\s+(?:the\s+|a\s+)?(?:(?:hero|about|cta|contact|primary|main)\s+){0,2}(?:buttons?|actions?)\b/)) return 'hide';
      if (has(/\b(?:show|restore|add)\s+(?:the\s+|a\s+)?(?:(?:hero|about|cta|contact|primary|main)\s+){0,2}(?:buttons?|actions?)\b/)) return 'show';
    }
    if (field === 'secondaryAction' && has(/secondary (?:action|button|link)/)) return has(/hide|remove|without|no secondary/) ? 'hide' : has(/show|restore|add/) ? 'show' : 'keep';
    if (field === 'decoration' && has(/decoration|decorative|bento.lines?|abstract art/)) return has(/hide|remove|without|no decor/) ? 'hide' : has(/show|restore|add/) ? 'show' : 'keep';
    if (field === 'numbering' && has(/numbering|numbers|step numbers/)) return has(/hide|remove|without|no number/) ? 'hide' : has(/show|restore|add/) ? 'show' : 'keep';
    if (field === 'featuredItem' && has(/featured|highlight|emphasi/)) {
      if (has(/none|no featured|no highlight|remove.*highlight/)) return 'none';
      const index = ordinalNames.findIndex((ordinal) => new RegExp(`\\b${ordinal}\\b`).test(p));
      if (index !== -1) return ordinalNames[index];
    }
    if (field === 'buttonStyle' && has(/button|action style/)) return has(/outline|border/) ? 'outline' : has(/plain|text.only/) ? 'plain' : has(/solid|filled/) ? 'solid' : 'keep';
    if (field === 'buttonIcon' && has(/button|action/)) {
      if (has(/no icons?|without (?:an? )?icons?|remove.*icons?|hide.*icons?/)) return 'none';
      for (const name of ['arrow', 'chevron', 'mail', 'external', 'check']) if (new RegExp(`\\b${name}\\b`).test(p)) return name;
    }
    if (field === 'buttonLabel' && has(/button|action/)) {
      for (const label of ['learn-more', 'get-started', 'contact-us', 'view-work', 'read-more']) if (p.includes(label.replaceAll('-', ' ')) && !/["“]/.test(p)) return label;
    }
    if (field === 'buttonLabelStyle' && has(/button|action/)) return has(/uppercase|all caps/) ? 'uppercase' : has(/bold|strong/) ? 'strong' : has(/normal case|sentence case|normal weight/) ? 'default' : 'keep';
    return Object.hasOwn(question.criteria, 'keep') ? 'keep' : 'default';
  }
  const iconMatch = key.match(/^icon_features_(\d)$/);
  if (iconMatch) {
    const p = clauseForGroup(state, 'features'), index = Number(iconMatch[1]);
    if (!/\bicons?\b/.test(p) || !demoSectionScope(state, 'features')) return 'keep';
    const section = state.existing.sections.find((section) => section.group === 'features');
    const ordinal = ordinalNames.findIndex((word, i) => new RegExp(`\\b${word}\\b|\\b${i + 1}(?:st|nd|rd|th)?\\b`).test(p));
    const mentioned = section?.items?.find((item) => item.titleMentioned)?.index;
    const target = ordinal !== -1 ? ordinal : mentioned ?? (state.selection?.group === 'features' ? state.selection.itemIndex : undefined);
    if (target !== null && target !== undefined && target !== index && !/\ball\b|every\b/.test(p)) return 'keep';
    if (/remove.*icons?|hide.*icons?|no icons?|without.*icons?/.test(p)) return 'none';
    if (/default|original/.test(p)) return 'default';
    const aliases = { leaf: /\blea(?:f|ves)\b/, heart: /\bhearts?\b/, spark: /\bsparks?\b|\bsparkles?\b/, bolt: /\bbolts?\b|lightning/ };
    for (const name of Object.keys(CONTENT_ICONS)) if ((aliases[name] || new RegExp(`\\b${name}s?\\b`)).test(p)) return name;
    return 'keep';
  }
  return undefined;
}
export function demoCopyChoice(state, key, question) {
  if (!/^copy_\d+$/.test(key)) return undefined;
  const index = Number(key.slice(5)), candidate = state.quoted_replacements?.[index];
  if (!candidate) return 'keep';
  const context = candidate.context.toLowerCase();
  const p = context.split(/\band\s+(?=(?:set|change|rename|replace)\b)/).at(-1);
  // In “replace \"old\" with \"new\"”, only the second quote is replacement text.
  if (candidate.reference) return 'keep';
  let group = GROUPS.find((group) => aliases[group].test(scopeText(p))) || GROUPS.find((group) => aliases[group].test(scopeText(context))) || state.selection?.group;
  const application = state.existing.sections.find((section) => isInterfaceBlock(section));
  if (!group && application && /\b(?:field|input|control|panel|form|screen|placeholder|options|application|chat|login)\b/.test(p)) group = application.group;
  if (!group) return 'keep';
  const ordinal = ordinalNames.findIndex((word, i) => new RegExp(`\\b${word}\\b|\\b${i + 1}(?:st|nd|rd|th)?\\b`).test(p));
  const titleMentioned = state.existing.sections.find((section) => section.group === group)?.items?.find((item) => item.titleMentioned)?.index;
  // Explicit page-section fields outrank an incidental item selection. Selection
  // belongs to its own section and must never address the same index elsewhere.
  const explicitSection = /\bsection\s+(?:title|heading|headline|body|description|paragraph)\b/.test(p) || ordinal === -1 && !/\b(?:item|card)\b/.test(p) && new RegExp(`\\b${group}\\s+(?:title|heading|headline|body|description|paragraph)\\b`).test(p);
  const itemIndex = explicitSection ? undefined : ordinal !== -1 ? ordinal : titleMentioned ?? (state.selection?.group === group ? state.selection.itemIndex : undefined);
  let field = /\b(?:link|url|destination)\b/.test(p) ? 'href' : /\bprice\b/.test(p) ? 'price' : /\b(?:meta|caption|period)\b/.test(p) ? 'meta' : /\b(?:button|action)\b/.test(p) ? 'button' : /\b(?:description|body|paragraph)\b/.test(p) ? 'body' : /\b(?:eyebrow|label)\b/.test(p) ? 'eyebrow' : /\b(?:title|heading|headline|rename|name)\b/.test(p) ? 'title' : '';
  if (application?.group === group && itemIndex !== undefined && itemIndex !== null) field = /\b(?:placeholder|options|description|body)\b/.test(p) ? 'body' : /\b(?:status|meta|caption)\b/.test(p) ? 'meta' : /\b(?:value|price)\b/.test(p) ? 'price' : /\b(?:label|name|title|heading|rename|button|action)\b/.test(p) ? 'title' : field;
  if (!field) return 'keep';
  const target = itemIndex !== undefined && itemIndex !== null && !['button', 'eyebrow'].includes(field) ? `item_${group}_${itemIndex}_${field}` : `section_${group}_${field}`;
  return Object.hasOwn(question.criteria, target) ? target : 'keep';
}
export function quoteContext(request, candidates) {
  return candidates.slice(0, 4).map((candidate, index) => {
    const prefix = request.prompt.slice(0, candidate.offset), start = Math.max(prefix.lastIndexOf(';'), prefix.lastIndexOf('\n'), prefix.lastIndexOf('. ')) + 1;
    return { index, context: prefix.slice(start), reference: /^\s+(?:with|to)\s*["“]/i.test(request.prompt.slice(candidate.offset + candidate.value.length + 2)) };
  });
}
