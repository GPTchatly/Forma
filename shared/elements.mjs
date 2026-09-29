/** One bounded capability vocabulary for internal block controls in every layer.
 * Adding a control requires a renderer, editor, composer and persistence contract. */
import { BUTTON_COMPONENTS, BUTTON_LABELS, BUTTON_ICONS, BUTTON_TEXT_STYLES, libraryOptions } from './ui-catalog.mjs';
import { isInterfaceBlock } from './interfaces.mjs';
export const ELEMENT_CONTROLS = {
  mediaPlacement: { label: 'Image placement', description: 'Place the hero image before or after the content in the actual HTML reading order. Split layouts show it on the left or right; narrow screens stack in the same order.', options: { default: 'After the content', before: 'Before the content', after: 'After the content' }, groups: ['hero'], excludeBlocks: ['hero-centered'] },
  contentOrder: { label: 'Content reading order', description: 'The saved DOM order of the heading, description and action in the content stack. The heading always remains present.', options: { default: 'Heading, description, action', 'heading-body-action': 'Heading, description, action', 'heading-action-body': 'Heading, action, description', 'body-heading-action': 'Description, heading, action', 'body-action-heading': 'Description, action, heading', 'action-heading-body': 'Action, heading, description', 'action-body-heading': 'Action, description, heading' }, groups: ['hero', 'about', 'cta', 'contact'], excludeBlocks: ['contact-form'] },
  textOrder: { label: 'Item text reading order', description: 'The saved DOM order of each item heading and description. Individual item placements can override this choice.', options: { default: 'Heading then description', 'heading-body': 'Heading then description', 'body-heading': 'Description then heading' }, groups: ['features', 'services', 'gallery', 'process'] },
  iconPlacement: { label: 'Feature icon placement', description: 'Place feature icons above or beside their text. Individual item placements can override this choice.', options: { default: 'Component default', above: 'Above the text', beside: 'Beside the text' }, groups: ['features'] },
  buttonIconPlacement: { label: 'Button icon placement', description: 'Place the button icon before or after its label in the actual HTML reading order.', options: { default: 'After the label', leading: 'Before the label', trailing: 'After the label' }, groups: ['hero', 'about', 'pricing', 'cta', 'contact'] },
  columns: { label: 'Columns', description: 'The number of cards per row on a wide screen. Small screens still stack the cards.', options: { default: 'Component default', one: 'One column', two: 'Two columns', three: 'Three columns', four: 'Four columns' }, groups: ['features', 'services', 'gallery', 'pricing', 'process', 'faq'], excludeBlocks: ['features-list', 'services-list', 'process-timeline', 'faq-accordion'] },
  contentAlign: { label: 'Card content alignment', description: 'Align text and content inside each card or row, independently of the section heading.', options: { default: 'Component default', start: 'Left aligned', center: 'Centered' }, groups: ['features', 'services', 'gallery', 'pricing', 'process'] },
  iconStyle: { label: 'Icon treatment', description: 'The container around each feature icon, independently of the card surface.', options: { default: 'Component default', plain: 'Icon only', soft: 'Soft background', outlined: 'Outlined container', solid: 'Solid accent background' }, groups: ['features'] },
  iconSize: { label: 'Icon size', description: 'Size of feature icons. This does not change heading size or page spacing.', options: { default: 'Component default', small: 'Small', large: 'Large' }, groups: ['features'] },
  primaryAction: { label: 'Primary button', description: 'Show or hide the section’s primary action without removing its saved label or destination.', options: { default: 'Component default', show: 'Show', hide: 'Hide' }, groups: ['hero', 'about', 'cta', 'contact'], excludeBlocks: ['contact-form'] },
  secondaryAction: { label: 'Secondary link', description: 'Show or hide the hero’s secondary link to the next section.', options: { default: 'Component default', show: 'Show', hide: 'Hide' }, groups: ['hero'] },
  decoration: { label: 'Decorative details', description: 'Show or hide the prepared hero image label or decorative lines in feature cards. Uploaded images remain visible.', options: { default: 'Component default', show: 'Show', hide: 'Hide' }, groups: ['hero', 'features'], excludeBlocks: ['hero-centered', 'features-cards', 'features-list'] },
  numbering: { label: 'Item numbers', description: 'Show or hide the numbers in services or process items.', options: { default: 'Component default', show: 'Show', hide: 'Hide' }, groups: ['services', 'process'] },
  featuredItem: { label: 'Highlighted plan', description: 'Choose which pricing card receives the prominent treatment.', options: { default: 'Component default', none: 'No highlighted plan', first: 'First plan', second: 'Second plan', third: 'Third plan', fourth: 'Fourth plan', fifth: 'Fifth plan', sixth: 'Sixth plan', seventh: 'Seventh plan', eighth: 'Eighth plan' }, groups: ['pricing'] },
  buttonStyle: { label: 'Button component', description: 'Choose a local button component independently of the section variant and global theme.', library: 'Buttons', source: 'Forma original · MIT', options: libraryOptions(BUTTON_COMPONENTS), groups: ['hero', 'about', 'pricing', 'cta', 'contact'] },
  buttonIcon: { label: 'Button icon', description: 'Choose the small local SVG inside the button independently of its component and text.', library: 'Button icons', source: 'Forma original · MIT', options: libraryOptions(BUTTON_ICONS), groups: ['hero', 'about', 'pricing', 'cta', 'contact'] },
  buttonLabel: { label: 'Button text', description: 'Choose prepared action copy from the library, or keep the saved custom label. Exact user-supplied wording is separate from model-generated text.', library: 'Action copy', source: 'Forma original · MIT', options: libraryOptions(BUTTON_LABELS), groups: ['hero', 'about', 'pricing', 'cta', 'contact'] },
  buttonLabelStyle: { label: 'Button text style', description: 'Choose the typography of the label independently of the button container and icon.', library: 'Text treatments', source: 'Forma original · MIT', options: libraryOptions(BUTTON_TEXT_STYLES), groups: ['hero', 'about', 'pricing', 'cta', 'contact'] }
};
export const DEFAULT_ELEMENTS = Object.fromEntries(Object.keys(ELEMENT_CONTROLS).map((key) => [key, 'default']));
export const ITEM_ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'];
export const MAX_COMPOSITION_QUESTIONS = 160;

export function elementFieldsFor(sectionOrGroup) {
  const section = typeof sectionOrGroup === 'string' ? { group: sectionOrGroup } : sectionOrGroup;
  if (!section) return [];
  if (isInterfaceBlock(section.block)) return ['buttonStyle', 'buttonIcon', 'buttonLabelStyle'];
  return Object.entries(ELEMENT_CONTROLS).filter(([, control]) => control.groups.includes(section.group) && !control.excludeBlocks?.includes(section.block)).map(([key]) => key);
}

export function elementOptionsFor(section, key) {
  if (!Object.hasOwn(ELEMENT_CONTROLS, key)) return {};
  const options = ELEMENT_CONTROLS[key].options;
  if (key !== 'featuredItem' || !Array.isArray(section?.items)) return options;
  return Object.fromEntries(Object.entries(options).filter(([value]) => ['default', 'none'].includes(value) || ITEM_ORDINALS.indexOf(value) < section.items.length));
}
