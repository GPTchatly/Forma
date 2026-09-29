/** Bounded application-screen choices. No answer can introduce code or markup. */
import { INTERFACE_BLOCKS, INTERFACE_CONTROLS, DEFAULT_INTERFACE, interfaceFieldsFor, interfaceItemTypesFor, isInterfaceBlock } from '../shared/interfaces.mjs';

const choice = (instructions, criteria) => ({ type: 'choice', instructions, criteria });
const lowConfidence = (answer) => answer.confidence !== null && answer.confidence < 0.25;
const counts = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
const typeDescriptions = {
  default: 'Preserve the component’s prepared item type.', text: 'A single-line text field.', email: 'An email-address field.', password: 'A masked password field.', textarea: 'A multiline text or document field.', select: 'A choice field using the saved lines as options.', checkbox: 'A checkbox or setting toggle.', number: 'A numeric input field.', date: 'A date input field.', stat: 'An editable summary value or metric card.', list: 'A text list entry or content card.', table: 'A data-table record.', chart: 'A prepared visual summary, with saved supporting text.', form: 'A grouped form field.', action: 'An action button or shortcut.', product: 'A product or order-summary item.', thread: 'A conversation or inbox thread.', event: 'A calendar event.', task: 'A task or board card.'
};

export function interfacePlanningQuestions(request) {
  const preserve = request.operation !== 'create';
  const keep = preserve ? { keep: 'Preserve the existing application or website surface.' } : {};
  return {
    surface: choice(`Choose the requested frontend surface. Login and signup forms, ChatGPT-style chat clones, dashboards, tools, commerce screens and custom application interfaces are supported deliverables. Select an application screen when the user asks to build its frontend, rather than a marketing page describing that product. Use website for a landing page, marketing site, portfolio, blog or informational page. Use app-workspace for another application frontend that combines available fields, lists, tasks, metrics and actions. These are browser interfaces with local interactions; this choice does not claim to create authentication services, model APIs, payment processing or databases. ${preserve ? 'Use keep for ordinary refinements and unrelated edits. Change the surface only when the user explicitly requests a different screen or application.' : 'Build from the user’s request without inheriting the previous project surface.'}`, { website: 'A marketing, portfolio, article, blog or informational website.', ...Object.fromEntries(INTERFACE_BLOCKS.map((block) => [block.id, block.description])), ...keep }),
    interface_item_count: choice(`Choose the number of editable rows, fields or cards inside the application screen, from one to eight. This never changes the website section count or marketing content collections. Increasing the count appends items; decreasing it removes items from the end while preserving the order of the remaining items. Never use this count to delete a named or selected item elsewhere in the sequence. Use default for a new screen unless the user explicitly requests a count; the prepared screen supplies its own appropriate fields and cards. ${preserve ? 'Use keep unless the user explicitly adds, removes from the end, or sets the count of application fields or items. Preserve unrelated content.' : 'Do not invent a requested count from a general description.'}`, { default: 'Use the prepared screen’s item count for a new interface, or preserve the current count.', ...Object.fromEntries(counts.map((word, index) => [word, `${index + 1} editable application ${index === 0 ? 'item' : 'items'}.`])), ...(preserve ? { keep: 'Preserve the current application item count.' } : {}) })
  };
}

export function interfaceQuestions(section, { preserve = false, context = '' } = {}) {
  if (!isInterfaceBlock(section) || section.locked) return {};
  const keep = preserve ? { keep: 'Preserve the current value exactly.' } : {};
  const instructions = `${context} Application component: ${section.block}. ${preserve ? 'Change only controls or item types explicitly requested; keep every unrelated choice. A style change does not authorize replacing fields or their content.' : 'Choose settings that fit the requested frontend and its prepared content.'}`;
  const questions = {};
  for (const field of interfaceFieldsFor(section)) {
    const control = INTERFACE_CONTROLS[field];
    questions[`interface_${field}`] = choice(`Choose ${control.label}. ${control.description} ${instructions}`, { ...control.options, ...keep });
  }
  const types = interfaceItemTypesFor(section);
  for (const [index, item] of section.items.entries()) {
    questions[`interface_item_${index}`] = choice(`Choose the authored UI type of application item ${index + 1} (zero-based index ${index}, current type ${item.uiType || 'default'}). ${instructions} A type changes the local frontend control, not its saved wording. Use the available metadata and the user’s explicitly named field or ordinal. For an unrelated request keep the current type; for a new screen prefer default unless the requested field requires a particular type.`, { ...Object.fromEntries(types.map((type) => [type, typeDescriptions[type]])), ...keep });
  }
  return questions;
}

export function applyInterfaceAnswers(section, answers, warnings, preserve = false) {
  if (!isInterfaceBlock(section) || section.locked) return;
  section.interface = { ...DEFAULT_INTERFACE, ...section.interface };
  for (const field of interfaceFieldsFor(section)) {
    const answer = answers[`interface_${field}`];
    if (!answer || answer.choice === 'keep' || preserve && lowConfidence(answer)) continue;
    const control = INTERFACE_CONTROLS[field];
    if (!Object.hasOwn(control.options, answer.choice)) { warnings.push(`${control.label} is unavailable in the selected application; its previous value was preserved.`); continue; }
    section.interface[field] = answer.choice;
  }
  const types = interfaceItemTypesFor(section);
  for (const [index, item] of section.items.entries()) {
    const answer = answers[`interface_item_${index}`];
    if (!answer || ['keep', 'default'].includes(answer.choice) || preserve && lowConfidence(answer)) continue;
    if (!types.includes(answer.choice)) { warnings.push(`Application item ${index + 1}: this UI type is unavailable in the selected screen; its previous type was preserved.`); continue; }
    item.uiType = answer.choice;
  }
}

export function interfaceItemCount(answer, fallback) {
  if (!answer || lowConfidence(answer)) return fallback;
  const index = counts.indexOf(answer.choice);
  return index === -1 ? fallback : index + 1;
}
