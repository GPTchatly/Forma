/** Small UI library entries for nested slots, separate from section compositions.
 * All implementations ship locally. IDs select authored markup/CSS/copy, never code. */
const source = 'Forma original · MIT';
export const BUTTON_COMPONENTS = {
  default: { label: 'Component default', description: 'Keep the button treatment supplied by the containing component.', source },
  solid: { label: 'Solid button', description: 'A filled accent button with a contrasting label.', source },
  outline: { label: 'Outline button', description: 'A transparent button with a visible border.', source },
  plain: { label: 'Text button', description: 'A quiet text action without a filled container.', source }
};
export const BUTTON_LABELS = {
  default: { label: 'Your current label', text: '', description: 'Use the saved custom button text, with the component’s existing fallback.', source },
  'learn-more': { label: 'Learn more', text: 'Learn more', description: 'An invitation to read further details.', source },
  'get-started': { label: 'Get started', text: 'Get started', description: 'A direct invitation to begin the next step.', source },
  'contact-us': { label: 'Contact us', text: 'Contact us', description: 'A clear invitation to contact the business.', source },
  'view-work': { label: 'View work', text: 'View work', description: 'An invitation to explore a portfolio or gallery.', source },
  'read-more': { label: 'Read more', text: 'Read more', description: 'A link to an article or longer explanation.', source }
};
export const BUTTON_ICONS = {
  default: { label: 'Component default', description: 'Use the original right arrow.', source },
  none: { label: 'No icon', description: 'Button label only, without a decorative icon.', source },
  arrow: { label: 'Arrow', description: 'Right arrow for continuing to the next step.', source },
  chevron: { label: 'Chevron', description: 'A small chevron after the button label.', source },
  mail: { label: 'Mail', description: 'Envelope for a contact or email action.', source },
  external: { label: 'External link', description: 'An outward arrow for an external destination.', source },
  check: { label: 'Check', description: 'Check mark for a confirm or completion action.', source }
};
export const BUTTON_TEXT_STYLES = {
  default: { label: 'Component default', description: 'Preserve the label’s original case and weight.', source },
  strong: { label: 'Bold label', description: 'Give the button label stronger weight.', source },
  uppercase: { label: 'Uppercase label', description: 'Display the same button text in uppercase with slight letter spacing.', source }
};
export function libraryOptions(entries) { return Object.fromEntries(Object.entries(entries).map(([id, entry]) => [id, entry.label])); }
