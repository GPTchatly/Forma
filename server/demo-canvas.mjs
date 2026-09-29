/** Deliberately narrow English rules for the explicitly labeled offline demo.
 * These rules select only offered choices; they are not a substitute for JEV. */
import { IMAGE_SIZE_LIMITS } from '../shared/media.mjs';
const ordinals = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'];
const groupAliases = {
  navigation: /\b(?:navigation|navbar|header)\b/, hero: /\bhero\b/, features: /\bfeatures?\b/,
  about: /\babout\b/, services: /\bservices?\b/, gallery: /\b(?:gallery|portfolio)\b/,
  process: /\b(?:process|steps?)\b/, pricing: /\b(?:pricing|plans?|tiers?)\b/,
  faq: /\bfaq\b/, contact: /\bcontact\b/, cta: /\bcta\b/, footer: /\bfooter\b/
};
const partAliases = { title: 'heading', headline: 'heading', description: 'body', paragraph: 'body', button: 'action', image: 'media', photo: 'media' };
const partName = (name) => partAliases[name] || name;
const sameOwner = (a, b) => a.sectionId === b.sectionId && a.itemId === b.itemId;
const sameTarget = (a, b) => a.kind === b.kind && sameOwner(a, b) && a.partKey === b.partKey && a.slot === b.slot;
const sectionsFor = (state) => state.canvas?.sections || [];
const groupIn = (text) => {
  const groups = Object.keys(groupAliases).filter((group) => groupAliases[group].test(text));
  return groups.length === 1 ? groups[0] : undefined;
};
function ordinalIn(text) {
  const matches = [...text.matchAll(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|[1-8](?:st|nd|rd|th)?)\b/g)];
  if (matches.length !== 1) return undefined;
  return ordinals.includes(matches[0][1]) ? ordinals.indexOf(matches[0][1]) : Number.parseInt(matches[0][1], 10) - 1;
}
function ownerFor(state, text, needsItem = false) {
  if (/\b(?:all|every)\b/.test(text)) return null;
  const sections = sectionsFor(state), explicitGroups = Object.keys(groupAliases).filter((group) => groupAliases[group].test(text));
  if (explicitGroups.length > 1) return null;
  const section = explicitGroups.length ? sections.find((entry) => entry.group === explicitGroups[0]) : sections.find((entry) => entry.id === state.selection?.sectionId) || sections.find((entry) => entry.selected);
  if (!section || section.locked) return null;
  const index = ordinalIn(text), explicitItem = /\b(?:item|card|selected|this|current)\b/.test(text) || index !== undefined;
  let item;
  if (needsItem || explicitItem && section.items?.length && !/\bsection\b/.test(text)) {
    if (index !== undefined) item = section.items?.[index];
    else {
      const mentioned = section.items?.filter((entry) => entry.titleMentioned) || [];
      if (mentioned.length > 1) return null;
      item = mentioned[0] || section.items?.find((entry) => entry.id === state.selection?.itemId) || section.items?.find((entry) => entry.selected);
    }
    if (!item) return null;
  }
  return { section, item, target: { pageId: state.canvas.pageId, sectionId: section.id, ...(item ? { itemId: item.id } : {}) } };
}
function imageIntent(state, clause) {
  if (!/\b(?:image|photo|picture)\b/.test(clause)) return null;
  const width = clause.match(/\b(\d{1,3})\s*%(?!\s*(?:height|tall|high)\b)/) || clause.match(/\bwidth\s*(?:(?:of|to|is|at)\s*|[:=]\s*)?(\d{1,3})\s*(?:percent|per cent)\b/);
  const height = clause.match(/\b(\d{2,4})\s*(?:px|pixels?)\s*(?:height|tall|high)\b/) || clause.match(/\bheight\s*(?:(?:of|to|is|at)\s*|[:=]\s*)?(\d{2,4})(?!\d|\s*%)\b/) || clause.match(/\b(\d{2,4})\s+(?:tall|high)\b/);
  const reset = /\b(?:reset|original|default)\b/.test(clause), smaller = /\b(?:smaller|shrink)\b/.test(clause), larger = /\b(?:larger|bigger|enlarge)\b/.test(clause);
  const auto = /\b(?:auto(?:matic)? height|height auto(?:matic)?)\b/.test(clause), fit = /\bcontain\b|show (?:the )?(?:whole|entire) (?:image|photo|picture)/.test(clause) ? 'contain' : /\bcover\b|fill (?:the )?frame/.test(clause) ? 'cover' : undefined;
  if (!width && !height && !reset && !smaller && !larger && !auto && !fit) return null;
  const group = groupIn(clause), owner = ownerFor(state, clause, group === 'gallery');
  const imageOwner = owner?.item || owner?.section;
  if (!imageOwner?.imageSize || smaller && larger) return null;
  if (width && (Number(width[1]) < IMAGE_SIZE_LIMITS.minWidth || Number(width[1]) > IMAGE_SIZE_LIMITS.maxWidth) || height && (Number(height[1]) < IMAGE_SIZE_LIMITS.minHeight || Number(height[1]) > IMAGE_SIZE_LIMITS.maxHeight)) return null;
  const size = {};
  if (reset) Object.assign(size, { width: 100, height: null, fit: 'cover' });
  if (width) size.width = Number(width[1]);
  else if (smaller || larger) size.width = Math.max(IMAGE_SIZE_LIMITS.minWidth, Math.min(IMAGE_SIZE_LIMITS.maxWidth, imageOwner.imageSize.width + (smaller ? -10 : 10)));
  if (height) size.height = Number(height[1]);
  else if (auto) size.height = null;
  if (fit) size.fit = fit;
  return { target: { kind: 'resize-image', ...owner.target }, size };
}
function sectionIntent(state, clause) {
  const match = clause.match(/\b(navigation|hero|features|about|services|gallery|portfolio|process|pricing|faq|contact|cta|footer)\s+(?:section\s+)?(?:just\s+)?(before|after|above|below)\s+(?:the\s+)?(navigation|hero|features|about|services|gallery|portfolio|process|pricing|faq|contact|cta|footer)\b/);
  if (!match) return null;
  const source = sectionsFor(state).find((section) => section.group === groupIn(match[1])), destination = sectionsFor(state).find((section) => section.group === groupIn(match[3]));
  if (!source || !destination || source.id === destination.id) return null;
  return { target: { kind: 'move-section', pageId: state.canvas.pageId, sectionId: source.id }, relation: match[2], destinationId: destination.id };
}
function itemIntent(state, clause) {
  if (/\b(?:heading|title|description|body|paragraph|icon|image|photo|picture|button)\b/.test(clause)) return null;
  const match = clause.match(/^(.*?)\s+(?:to\s+(?:the\s+)?)?(first|last|start|end)\s*(?:position|place)?\s*$/) || clause.match(/^(.*?)\s+(before|after|above|below)\s+(.*)$/) || clause.match(/^(.*?)\s+(?:to|into)\s+(?:the\s+)?(services?|process)(?:\s+(?:section|collection))?(?:\s+(?:at\s+(?:the\s+)?)?(first|last|start|end))?\s*$/);
  if (!match || !/\b(?:move|reorder|place|put|send|transfer|selected|first|second|third|fourth|fifth|sixth|seventh|eighth|[1-8](?:st|nd|rd|th))\b/.test(match[1])) return null;
  // A transfer with a trailing "end" needs the destination stripped before
  // resolving its source; otherwise two mentioned groups would be ambiguous.
  const transfer = clause.match(/^(.*?)\s+(?:to|into)\s+(?:the\s+)?(services?|process)(?:\s+(?:section|collection))?(?:\s+(?:at\s+(?:the\s+)?)?(first|last|start|end))?\s*$/);
  const owner = ownerFor(state, transfer?.[1] || match[1], true);
  if (!owner) return null;
  const target = { kind: 'move-item', ...owner.target };
  if (transfer) {
    const destination = sectionsFor(state).find((section) => section.group === groupIn(transfer[2]));
    return destination && destination.id !== owner.section.id ? { target, destinationId: destination.id, position: transfer[3] || 'last' } : null;
  }
  if (['first', 'last', 'start', 'end'].includes(match[2])) return { target, position: match[2] };
  const destinationIndex = ordinalIn(match[3]);
  return destinationIndex === undefined ? null : { target, relation: match[2], destinationIndex };
}
function partIntent(state, clause) {
  const match = clause.match(/^(.*?)\b(heading|title|headline|body|description|paragraph|button|action|image|photo|icon)\s+(before|after|above|below|beside|leading|trailing)\s*(.*?)$/);
  if (!match) return null;
  let partKey = partName(match[2]);
  if (partKey === 'icon' && /button|action/.test(match[1])) partKey = 'buttonIcon';
  const owner = ownerFor(state, match[1], /\b(?:item|card|feature|plan|tier)\b/.test(match[1]) || ordinalIn(match[1]) !== undefined);
  if (!owner || !(owner.item || owner.section).parts?.includes(partKey)) return null;
  const destinationName = match[4].match(/\b(heading|title|headline|body|description|paragraph|button|action)\b/);
  if (!['media', 'icon', 'buttonIcon'].includes(partKey) && !destinationName) return null;
  return { target: { kind: 'move-part', ...owner.target, partKey }, relation: match[3], destinationPart: destinationName ? partName(destinationName[1]) : undefined };
}
function iconIntent(state, clause) {
  if (!/\bicons?\b/.test(clause) || /\b(?:before|after|above|below|beside|leading|trailing)\b/.test(clause)) return null;
  const icon = clause.match(/\b(default|none|arrow|chevron|mail|external|check|circle|heart|leaf|spark|bolt|globe|shield|layers|code|chart|clock|users|target|grid|diamond|rocket|lock|sun|lightbulb|briefcase|award|cloud)\b/)?.[1];
  if (!icon) return null;
  const owner = ownerFor(state, clause, true);
  if (!owner || !['features', 'pricing'].includes(owner.section.group)) return null;
  return { target: { kind: 'replace-icon', ...owner.target, slot: owner.section.group === 'pricing' ? 'button-icon' : 'feature-icon' }, icon };
}
function removalIntent(state, clause) {
  if (!/\b(?:remove|delete|hide)\b/.test(clause)) return null;
  // Existing collection controls already handle plural icons and secondary actions.
  if (/\b(?:all|every|icons|numbering|secondary|decoration)\b/.test(clause)) return null;
  const match = clause.match(/\b(button\s+(?:icon|text|label)|heading|headline|title|eyebrow|label|description|paragraph|body|button|action|image|photo|media|icon|price|caption|meta)\b/);
  const owner = ownerFor(state, clause, /\b(?:item|card|field|feature|plan|tier|step)\b/.test(clause) || ordinalIn(clause) !== undefined);
  if (!owner) return null;
  if (!match) {
    const selectedPart = sameOwner(owner.target, state.selection || {}) && /\b(?:this|selected|current)\b/.test(clause) && !/\b(?:item|card|field|row|section)\b/.test(clause) ? state.selection?.partKey : undefined;
    if (selectedPart && (owner.item || owner.section).removableParts?.includes(selectedPart)) return { target: { kind: 'remove-element', pageId: state.canvas.pageId, sectionId: owner.section.id }, removal: { kind: 'part', ...owner.target, partKey: selectedPart } };
    if (/\b(?:element|part)\b/.test(clause)) return null;
    if (!owner.item) return null;
    return { target: { kind: 'remove-element', pageId: state.canvas.pageId, sectionId: owner.section.id }, removal: { kind: 'item', ...owner.target } };
  }
  const selectedButtonIcon = match[1] === 'icon' && sameOwner(owner.target, state.selection || {}) && state.selection?.partKey === 'buttonIcon';
  const partKey = match[1] === 'button icon' || selectedButtonIcon ? 'buttonIcon' : /button (?:text|label)/.test(match[1]) ? 'buttonLabel' : match[1] === 'caption' ? 'meta' : match[1] === 'label' ? 'eyebrow' : partName(match[1]);
  // Keep the established icon=none demo control for explicit feature-icon hiding.
  // A selected generic part deletion instead uses a reversible removedParts marker.
  if (partKey === 'icon' && owner.section.group === 'features' && /\b(?:remove|hide)\b/.test(clause)) return null;
  if (!(owner.item || owner.section).removableParts?.includes(partKey)) return null;
  return { target: { kind: 'remove-element', pageId: state.canvas.pageId, sectionId: owner.section.id }, removal: { kind: 'part', ...owner.target, partKey } };
}
function intentsFor(state) {
  if (!['edit', 'redesign'].includes(state.task) || !state.canvas) return [];
  const prompt = state.user_request.toLowerCase().replace(/["“][^"”]*["”]/gu, '');
  const clauses = prompt.split(/[;\n]|\.(?:\s|$)|\band\s+(?=(?:move|resize|reset|shrink|enlarge|put|place|transfer|set|change|make|remove|delete|hide)\b)/).map((clause) => clause.trim()).filter(Boolean);
  const intents = [];
  for (const clause of clauses) {
    if (/\b(?:do not|don't|never|keep|preserve|unchanged)\b/.test(clause)) continue;
    for (const intent of [removalIntent(state, clause), imageIntent(state, clause), sectionIntent(state, clause), partIntent(state, clause), itemIntent(state, clause), iconIntent(state, clause)]) {
      if (intent && !intents.some((entry) => sameTarget(entry.target, intent.target) && JSON.stringify(entry.removal) === JSON.stringify(intent.removal))) intents.push(intent);
    }
  }
  return intents.slice(0, 4);
}
function moveChoice(state, action, intent) {
  const section = sectionsFor(state).find((entry) => entry.id === action.target.sectionId);
  let expected;
  if (action.target.kind === 'move-section') {
    const sections = sectionsFor(state).filter((entry) => entry.id !== action.target.sectionId);
    const index = sections.findIndex((entry) => entry.id === intent.destinationId);
    if (index < 0) return 'keep';
    expected = { beforeSectionId: ['after', 'below'].includes(intent.relation) ? sections[index + 1]?.id ?? null : intent.destinationId };
  } else if (action.target.kind === 'move-item') {
    const destination = intent.destinationId ? sectionsFor(state).find((entry) => entry.id === intent.destinationId) : section;
    if (!destination) return 'keep';
    const items = destination.items.filter((item) => item.id !== action.target.itemId);
    let beforeItemId = null;
    if (['first', 'start'].includes(intent.position)) beforeItemId = items[0]?.id ?? null;
    else if (intent.destinationIndex !== undefined) {
      const relativeItem = destination.items[intent.destinationIndex];
      if (!relativeItem || relativeItem.id === action.target.itemId) return 'keep';
      const index = items.findIndex((item) => item.id === relativeItem.id);
      beforeItemId = ['after', 'below'].includes(intent.relation) ? items[index + 1]?.id ?? null : relativeItem.id;
    }
    expected = { beforeItemId, ...(intent.destinationId ? { targetSectionId: intent.destinationId } : {}) };
  } else if (action.target.partKey === 'media') expected = { beforePartKey: ['before', 'above'].includes(intent.relation) ? 'before' : ['after', 'below'].includes(intent.relation) ? 'after' : undefined };
  else if (action.target.partKey === 'icon') expected = { beforePartKey: ['above', 'before'].includes(intent.relation) ? 'above' : intent.relation === 'beside' ? 'beside' : undefined };
  else if (action.target.partKey === 'buttonIcon') expected = { beforePartKey: ['before', 'above', 'leading'].includes(intent.relation) ? 'leading' : ['after', 'below', 'trailing'].includes(intent.relation) ? 'trailing' : undefined };
  else {
    const owner = action.target.itemId ? section.items.find((item) => item.id === action.target.itemId) : section;
    const current = owner.placements?.[action.target.itemId ? 'textOrder' : 'contentOrder'];
    const order = (current && current !== 'default' ? current.split('-') : action.target.itemId ? ['heading', 'body'] : ['heading', 'body', 'action']).filter((part) => part !== action.target.partKey && owner.parts.includes(part));
    const index = order.indexOf(intent.destinationPart);
    if (index < 0) return 'keep';
    expected = { beforePartKey: ['after', 'below'].includes(intent.relation) ? order[index + 1] ?? null : intent.destinationPart };
  }
  if (Object.values(expected).some((value) => value === undefined)) return 'keep';
  const options = Object.entries(action.options).filter(([, option]) => {
    const proposal = option.proposal;
    if (!proposal || action.target.kind === 'move-item' && proposal.kind !== (intent.destinationId ? 'transfer-item' : 'item')) return false;
    return Object.entries(expected).every(([key, value]) => proposal[key] === value);
  });
  return options.length === 1 ? options[0][0] : 'keep';
}
export function demoCanvasChoice(state, key) {
  const intents = intentsFor(state), planning = key.match(/^canvas_target_(\d+)$/);
  if (planning) {
    const available = intents.map((intent) => Object.entries(state.canvas_targets || {}).find(([, target]) => sameTarget(target, intent.target))?.[0]).filter(Boolean);
    return available[Number(planning[1])] || 'keep';
  }
  const detail = key.match(/^canvas_(\d+)_(move|icon|width|height|fit|remove)$/);
  if (!detail) return undefined;
  const action = state.canvas_actions?.find((entry) => entry.slot === Number(detail[1]));
  const previousMatches = action && state.canvas_actions.filter((entry) => entry.slot < action.slot && sameTarget(entry.target, action.target)).length;
  const intent = action && intents.filter((entry) => sameTarget(entry.target, action.target))[previousMatches];
  if (!intent) return 'keep';
  if (detail[2] === 'move') return moveChoice(state, action, intent);
  if (detail[2] === 'icon') return Object.hasOwn(action.options, intent.icon) ? intent.icon : 'keep';
  if (detail[2] === 'remove') return Object.entries(action.options).find(([, option]) => option.kind === intent.removal?.kind && sameOwner(option, intent.removal) && option.partKey === intent.removal.partKey)?.[0] || 'keep';
  const field = detail[2];
  if (!Object.hasOwn(intent.size, field)) return 'keep';
  return Object.entries(action.options[field]).find(([, value]) => value === intent.size[field])?.[0] || 'keep';
}
export function demoCanvasLocalRequest(state) {
  return intentsFor(state).length > 0 && !/\b(?:whole (?:page|site)|overall|global|theme|palette|redesign)\b/i.test(state.user_request);
}
export function demoCanvasOwnsElement(state, key) {
  return intentsFor(state).some(({ target, removal }) => {
    const group = sectionsFor(state).find((section) => section.id === target.sectionId)?.group;
    if (target.kind === 'remove-element' && removal?.kind === 'part') {
      if (['action', 'buttonLabel', 'buttonIcon'].includes(removal.partKey) && key === `element_${group}_primaryAction`) return true;
      if (removal.partKey === 'buttonIcon' && key === `element_${group}_buttonIcon`) return true;
    }
    if (target.kind === 'replace-icon') return target.slot === 'button-icon' ? key === `element_${group}_buttonIcon` : key.startsWith(`icon_${group}_`);
    if (target.kind !== 'move-part') return false;
    const fields = target.partKey === 'media' ? ['mediaPlacement'] : target.partKey === 'icon' ? ['iconPlacement'] : target.partKey === 'buttonIcon' ? ['buttonIconPlacement'] : ['contentOrder', 'textOrder'];
    return key === `placement_${group}` || fields.some((field) => key === `element_${group}_${field}`);
  });
}
