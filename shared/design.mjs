/** Bounded design vocabulary shared by the composer, editor and renderer.
 * Values describe visible outcomes. No model-selected CSS or executable code. */
export const TYPE_SCALES = {
  quiet: 'Quiet hierarchy: smaller, restrained headings for detailed or understated sites.',
  balanced: 'Balanced hierarchy: familiar heading proportions for a clear landing page.',
  dramatic: 'Dramatic hierarchy: large display headings and a more prominent introduction.'
};
export const CONTENT_WIDTHS = {
  focused: 'Focused page: narrower content for intimate, text-led storytelling.',
  standard: 'Standard page: balanced width for mixed text and visuals.',
  wide: 'Wide page: expansive layouts for portfolios and visual work.'
};
export const PRESENTATION = {
  tone: { default: 'Use the component’s original background.', soft: 'A softly tinted section creates a gentle change of rhythm.', contrast: 'An inverted section with a strong contrasting background creates a focal point.' },
  spacing: { default: 'Use the page’s global spacing.', compact: 'A shorter section with tighter vertical spacing.', generous: 'A taller section with generous breathing room.' },
  heading: { default: 'Use the component’s original heading alignment.', start: 'Left-aligned headings, description and section actions.', center: 'Centered headings, description and section actions.' },
  surface: { default: 'Use the component’s original card or row treatment.', plain: 'Remove panel backgrounds and heavy borders for a quieter editorial treatment.', outlined: 'Clearly outlined cards or rows, with a transparent background.', filled: 'Softly filled cards or rows with comfortable inner padding.' },
  media: { default: 'Use the component’s original image proportions.', landscape: 'Wide landscape images for spaces, products or panoramic work.', square: 'Square image frames for balanced, compact visual tiles.', portrait: 'Tall portrait image frames for people, posters or vertical work.' }
};
export const PRESENTATION_LABELS = { tone: 'Section background', spacing: 'Section spacing', heading: 'Heading alignment', surface: 'Card treatment', media: 'Image proportions' };
export const DEFAULT_PRESENTATION = Object.fromEntries(Object.keys(PRESENTATION).map((key) => [key, 'default']));
export function presentationFieldsFor(group) {
  if (['navigation', 'footer'].includes(group)) return ['tone'];
  return ['tone', 'spacing', 'heading',
    ...(['features', 'services', 'process', 'pricing', 'faq'].includes(group) ? ['surface'] : []),
    ...(['hero', 'about', 'gallery'].includes(group) ? ['media'] : [])];
}
export const DIRECTIONS = {
  editorial: 'Editorial: strong typography, text-led lists, generous space and prominent work imagery. Avoid filling every section with cards.',
  product: 'Product clarity: clear benefits, structured feature cards, balanced headings and visible calls to action.',
  understated: 'Understated: quiet hierarchy, restrained surfaces, limited contrast and a simple reading rhythm.',
  expressive: 'Expressive: dramatic headings, varied section backgrounds and a few strong visual focal points. Do not make every section loud.',
  organic: 'Warm and organic: spacious compositions, soft surfaces and calm visual pacing.'
};
export const JOURNEYS = {
  overview: { description: 'Explain the value first, then services and evidence, answer questions and invite contact.', order: ['features', 'services', 'gallery', 'about', 'process', 'pricing', 'faq', 'cta', 'contact'] },
  showcase: { description: 'Lead with work or imagery, introduce the people behind it, then services and the next step.', order: ['gallery', 'about', 'services', 'features', 'process', 'pricing', 'faq', 'cta', 'contact'] },
  offer: { description: 'Explain benefits, how it works and the offer; resolve objections before the final action.', order: ['features', 'process', 'services', 'pricing', 'gallery', 'about', 'faq', 'cta', 'contact'] },
  story: { description: 'Introduce the story and people, show the work, then explain the offer and invite contact.', order: ['about', 'gallery', 'features', 'services', 'process', 'pricing', 'faq', 'cta', 'contact'] }
};
