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
  media: { default: 'Use the component’s original image proportions.', landscape: 'Wide landscape images for spaces, products or panoramic work.', square: 'Square image frames for balanced, compact visual tiles.', portrait: 'Tall portrait image frames for people, posters or vertical work.' },
  backdrop: { default: 'Use the section’s plain background.', grid: 'A faint ruled grid behind the section for a structured, technical feel.', dots: 'A light dot pattern behind the section for quiet texture.', mesh: 'Soft overlapping color washes behind the section for a gentle focal point.', noise: 'Fine diagonal grain behind the section for a tactile, printed feel.' },
  intro: { default: 'Use the component’s original heading layout.', split: 'The heading on one side and the description beside it on wide screens.', ruled: 'A thin rule above a compact heading, like a chapter opening.' }
};
export const PRESENTATION_LABELS = { tone: 'Section background', spacing: 'Section spacing', heading: 'Heading alignment', surface: 'Card treatment', media: 'Image proportions', backdrop: 'Section backdrop', intro: 'Heading layout' };
// Optional axes are stored on a section only when their value is not `default`; a missing key
// means `default`. A section that does not use them keeps exactly the five base keys.
export const OPTIONAL_PRESENTATION = Object.freeze(['backdrop', 'intro']);
export const DEFAULT_PRESENTATION = Object.fromEntries(Object.keys(PRESENTATION).filter((key) => !OPTIONAL_PRESENTATION.includes(key)).map((key) => [key, 'default']));
export function presentationFieldsFor(group) {
  if (['navigation', 'footer'].includes(group)) return ['tone'];
  return ['tone', 'spacing', 'heading',
    ...(['features', 'services', 'process', 'pricing', 'faq'].includes(group) ? ['surface'] : []),
    ...(['hero', 'about', 'gallery'].includes(group) ? ['media'] : []),
    'backdrop',
    ...(['features', 'services', 'gallery', 'process', 'testimonials', 'team', 'logos', 'stats', 'pricing', 'faq'].includes(group) ? ['intro'] : [])];
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
/** Named page archetypes. A recipe orders the body sections that are present (its groups first,
 * in its order; locked sections stay in their slots) and suggests one existing block per group.
 * It never adds or removes a section; the include answers decide which sections exist. */
const recipe = (label, description, order, blocks) => Object.freeze({ label, description, order: Object.freeze(order), blocks: Object.freeze(blocks) });
export const RECIPES = Object.freeze({
  'saas-launch': recipe('Software launch', 'A software product launch page: a browser preview introduction, a moving logo collection, bento features, inline statistics, billing-period pricing and a slim closing banner.', ['logos', 'features', 'process', 'stats', 'testimonials', 'pricing', 'faq', 'cta'], { hero: 'hero-browser', logos: 'logos-marquee', features: 'features-bento', stats: 'stats-inline', pricing: 'pricing-period', cta: 'cta-banner' }),
  'saas-developer': recipe('Developer tool', 'A developer tool, API or SDK page: a typographic poster introduction, an integration directory, a code showcase, a changelog timeline and a split closing invitation.', ['logos', 'features', 'process', 'pricing', 'faq', 'cta'], { hero: 'hero-poster', logos: 'logos-integrations', features: 'features-code', process: 'process-changelog', cta: 'cta-split' }),
  'ai-product': recipe('AI product', 'An AI product or assistant page: a prompt box introduction, a scripted conversation, statistic cards and a slim closing banner, all prepared demonstrations.', ['features', 'logos', 'stats', 'pricing', 'faq', 'cta'], { hero: 'hero-prompt', features: 'features-conversation', stats: 'stats-cards', cta: 'cta-banner' }),
  'studio-services': recipe('Studio and services', 'A creative studio or professional services page: an editorial introduction, a service menu, featured work, a story with values, a quotation spotlight and team profiles.', ['services', 'gallery', 'about', 'process', 'testimonials', 'team', 'contact'], { hero: 'hero-editorial', services: 'services-list', gallery: 'gallery-featured', about: 'about-values', testimonials: 'quotes-spotlight', team: 'team-cards' }),
  'portfolio-showcase': recipe('Portfolio showcase', 'A personal portfolio or photographer page: a typographic poster introduction, a masonry portfolio, a short about statement, a featured quotation and a simple contact invitation.', ['gallery', 'about', 'services', 'testimonials', 'contact'], { hero: 'hero-poster', gallery: 'gallery-masonry', about: 'about-statement', testimonials: 'quotes-featured', contact: 'contact-simple' }),
  'local-menu': recipe('Restaurant or cafe', 'A restaurant, cafe or bakery page: a full-bleed introduction, a menu with sections, an image triptych and opening hours with the address.', ['services', 'gallery', 'about', 'testimonials', 'contact'], { hero: 'hero-cover', services: 'services-menu', gallery: 'gallery-strip', contact: 'contact-hours' }),
  'stay-rooms': recipe('Rooms and stays', 'A hotel, guesthouse or holiday stay page: a full-bleed introduction, room cards, an amenity checklist, a quotation wall and hours with the address.', ['gallery', 'features', 'about', 'testimonials', 'faq', 'contact'], { hero: 'hero-cover', gallery: 'gallery-rooms', features: 'features-amenities', testimonials: 'quotes-wall', contact: 'contact-hours' }),
  'event-conference': recipe('Conference', 'A conference or summit page: a typographic poster introduction, inline statistics, a speaker lineup, an event schedule, ticket tiers, a logo grid and a slim closing banner.', ['stats', 'team', 'process', 'pricing', 'logos', 'faq', 'cta'], { hero: 'hero-poster', stats: 'stats-inline', team: 'team-speakers', process: 'process-schedule', pricing: 'pricing-tickets', logos: 'logos-grid', cta: 'cta-banner' }),
  'event-workshop': recipe('Workshop or course', 'A workshop, course or bootcamp page: a split introduction, a story with values, an event schedule, ticket tiers and a simple contact invitation.', ['about', 'process', 'team', 'pricing', 'faq', 'contact'], { hero: 'hero-split', about: 'about-values', process: 'process-schedule', pricing: 'pricing-tickets', contact: 'contact-simple' }),
  'wellness-practice': recipe('Wellness practice', 'A wellness, coaching or yoga practice page: a split-screen introduction, an about section with an image, revealing services, a featured quotation and hours with the address.', ['about', 'services', 'process', 'testimonials', 'pricing', 'faq', 'contact'], { hero: 'hero-halves', about: 'about-split', services: 'services-reveal', testimonials: 'quotes-featured', contact: 'contact-hours' })
});
