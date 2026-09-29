/** NEW: Auditable, closed component catalog. No remote code or arbitrary HTML is executed.
 * HyperUI-derived items use its MIT layout/markup patterns; see licenses/HYPERUI.txt.
 * Additional compositions, themes and artwork are original, MIT-licensed code.
 */
import { INTERFACE_BLOCKS } from './interfaces.mjs';
export const SCHEMA_VERSION = 1;
export const GROUPS = ['navigation', 'hero', 'features', 'about', 'services', 'gallery', 'process', 'pricing', 'faq', 'contact', 'cta', 'footer'];
export const OPTIONAL_GROUPS = GROUPS.filter((g) => !['navigation', 'hero', 'footer'].includes(g));
export const GROUP_LABELS = { navigation: 'Navigation', hero: 'Hero', features: 'Features', about: 'About', services: 'Services', gallery: 'Work / gallery', process: 'Process', pricing: 'Pricing', faq: 'FAQ', contact: 'Contact', cta: 'Call to action', footer: 'Footer' };
export const FAMILIES = {
  saas: 'Software / SaaS product or technology landing page',
  studio: 'Creative agency, design studio or professional services',
  portfolio: 'Personal portfolio, freelancer or photographer',
  local: 'Local business, cafe, restaurant or neighborhood service',
  wellness: 'Wellness, coaching, yoga, nature or mindful lifestyle',
  hospitality: 'Accommodation, holiday apartment or small hotel',
  event: 'Event, course, workshop or conference landing page',
  application: 'Application frontend, authentication screen, chat, dashboard, tools, commerce or custom workspace',
  general: 'Other informational or marketing website'
};
export const THEMES = {
  porcelain: { name: 'Porcelain', description: 'Warm off-white, charcoal text, restrained terracotta accent. Minimal and welcoming.', bg: '#faf9f6', surface: '#ffffff', ink: '#292824', muted: '#69665e', line: '#e5e2da', accent: '#a7462c', onAccent: '#ffffff', soft: '#f0e8de', dark: false },
  midnight: { name: 'Midnight', description: 'Deep charcoal background, near-white text, electric lime accents. Dark technology or creative.', bg: '#171b1a', surface: '#232927', ink: '#f4f7f2', muted: '#b5beb7', line: '#39423c', accent: '#c0f186', onAccent: '#172312', soft: '#2b342b', dark: true },
  sage: { name: 'Sage', description: 'Soft ivory with botanical green. Calm, organic, sustainable, wellness or nature.', bg: '#f6f7f1', surface: '#ffffff', ink: '#23372b', muted: '#5d6c60', line: '#dce3d8', accent: '#365b3b', onAccent: '#ffffff', soft: '#e3eada', dark: false },
  ocean: { name: 'Ocean', description: 'Cool white with blue accents. Clear, trustworthy, professional and modern.', bg: '#f5f8fc', surface: '#ffffff', ink: '#162d49', muted: '#566980', line: '#dce4ef', accent: '#2356ba', onAccent: '#ffffff', soft: '#e2ebfa', dark: false },
  clay: { name: 'Clay', description: 'Cream and muted terracotta, editorial warmth. Artisan, cafe, hospitality or interiors.', bg: '#fcf3e9', surface: '#fffaf5', ink: '#472f27', muted: '#786055', line: '#e8d6c7', accent: '#963e2c', onAccent: '#ffffff', soft: '#efd9c7', dark: false },
  mono: { name: 'Monochrome', description: 'Strict white, black and neutral gray. Crisp, understated or architectural.', bg: '#ffffff', surface: '#f6f6f6', ink: '#161616', muted: '#666666', line: '#e0e0e0', accent: '#171717', onAccent: '#ffffff', soft: '#eeeeee', dark: false }
};
export const FONTS = {
  modern: { name: 'Modern sans', description: 'Neutral, clean system sans-serif. Product and business interfaces.', value: 'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  editorial: { name: 'Editorial serif', description: 'Expressive serif headings with sans-serif body. Elegant, warm and crafted.', value: 'Georgia, "Times New Roman", serif' },
  technical: { name: 'Technical mono', description: 'Monospace headings with sans-serif body. Developer tools, experimental or technical.', value: 'ui-monospace, "Cascadia Code", "SFMono-Regular", Consolas, monospace' }
};
export const DENSITIES = { airy: 'Generous white space, large sections and relaxed rhythm', balanced: 'Balanced spacing for a conventional landing page', compact: 'Smaller gaps and tighter sections; information-dense' };
export const RADII = { sharp: 'Square or near-square edges', soft: 'Softly rounded cards and buttons', round: 'Large rounded cards and pill buttons' };
const h = 'HyperUI · MIT, adapted';
const o = 'Forma original · MIT';
const entry = (id, group, name, description, source = o) => ({ id, group, name, description, source, license: 'MIT' });
export const CATALOG = [
  entry('nav-minimal', 'navigation', 'Quiet navigation', 'Full-width minimal header, text links and one primary action.'),
  entry('nav-floating', 'navigation', 'Floating navigation', 'Inset rounded header with generous margins; contemporary product or studio.'),
  entry('hero-split', 'hero', 'Split introduction', 'Headline and actions on the left, uploaded image or original abstract illustration on the right.'),
  entry('hero-centered', 'hero', 'Centered statement', 'Large centered headline, concise copy and centered actions. No large image.'),
  entry('hero-editorial', 'hero', 'Editorial introduction', 'Oversized left-aligned headline above a wide image or abstract visual. Portfolio, studio, hospitality.'),
  ...INTERFACE_BLOCKS.map((block) => entry(block.id, 'hero', block.name, block.description)),
  entry('features-bento', 'features', 'Bento features', 'Asymmetric feature cards; the first spans two columns with a decorative visual.'),
  entry('features-cards', 'features', 'Feature cards', 'Three-column grid of bordered feature cards with icons and supporting descriptions.', h),
  entry('features-list', 'features', 'Feature index', 'Minimal feature rows with editable icons and dividers, without prominent cards.'),
  entry('about-split', 'about', 'About, side by side', 'Narrative about section with large image or abstract art and descriptive copy.'),
  entry('about-statement', 'about', 'About statement', 'Large text-led about section with no image. Editorial or minimal.'),
  entry('services-cards', 'services', 'Service cards', 'Three service offerings in bordered cards, with title and description.', h),
  entry('services-list', 'services', 'Service menu', 'Compact divided rows with service title, description and optional price. Good for local businesses.'),
  entry('gallery-grid', 'gallery', 'Project grid', 'Two-column portfolio or accommodation gallery with captions. User images or original abstract placeholders.', h),
  entry('gallery-featured', 'gallery', 'Featured work', 'One wide lead project followed by smaller work cards. Editorial, visually led.'),
  entry('gallery-strip', 'gallery', 'Image triptych', 'Three equal visual cards with concise captions. Compact gallery.', h),
  entry('process-steps', 'process', 'Three-step process', 'Horizontal numbered cards explaining a workflow or visitor journey.'),
  entry('process-timeline', 'process', 'Vertical process', 'Vertical timeline with numbered steps and descriptions. Story-led or more detailed.'),
  entry('pricing-cards', 'pricing', 'Pricing tiers', 'Responsive pricing-card grid with plan names, descriptions, prices and feature lists. No checkout backend.', h),
  entry('pricing-featured', 'pricing', 'Highlighted pricing', 'Two or three pricing cards with one visually highlighted option. No invented popularity claims.', h),
  entry('faq-accordion', 'faq', 'Quiet accordion', 'Native accessible details and summary FAQ rows divided by borders; works without JavaScript.', h),
  entry('faq-cards', 'faq', 'FAQ cards', 'Native details and summary FAQs in softly filled cards with chevrons.', h),
  entry('contact-form', 'contact', 'Email draft form', 'Contact fields prepare an email in the visitor mail client. Requires a configured public email; does not submit to a server.'),
  entry('contact-simple', 'contact', 'Contact invitation', 'Simple contact text and a public email or configured call to action. No form.'),
  entry('cta-band', 'cta', 'Closing invitation', 'Full-width accent band with closing headline, text and action.', h),
  entry('cta-card', 'cta', 'Closing card', 'Inset, softly colored final call-to-action card.', h),
  entry('footer-simple', 'footer', 'Minimal footer', 'Brand, short description and back-to-top link.'),
  entry('footer-columns', 'footer', 'Structured footer', 'Brand and internal section links in columns; no fabricated social links.')
];
export const getBlock = (id) => CATALOG.find((block) => block.id === id);
export const blocksFor = (group) => CATALOG.filter((block) => block.group === group);
export const DEFAULT_BLOCKS = Object.fromEntries(GROUPS.map((group) => [group, blocksFor(group)[0].id]));
export const DEFAULT_THEME = { palette: 'porcelain', font: 'modern', density: 'balanced', radius: 'soft', motion: 'none', typeScale: 'balanced', width: 'standard' };
export const PRESETS = [
  { name: 'Creative studio', brand: 'Studio North', icon: 'spark', brief: 'An editorial website for a small design studio. Warm ivory background, elegant serif headings, a split hero, selected work gallery, services, our process, FAQ and contact. No pricing. No animation.' },
  { name: 'Software product', brand: 'Orbit', icon: 'grid', brief: 'A dark modern SaaS landing page with a centered hero, bento features, a three-step workflow, pricing tiers, FAQ and a final call to action. Lime accents. No gallery.' },
  { name: 'Coastal stay', brand: 'Stillwater', icon: 'sun', brief: 'A calm editorial website for a coastal holiday apartment. Sage greens, generous spacing, a wide hero image, about the space, a photo gallery, amenities, FAQ and a contact form. No subscriptions or pricing tiers.' },
  { name: 'Independent portfolio', brand: 'Alex Morgan', icon: 'frame', brief: 'A minimal monochrome designer portfolio. Editorial hero, featured work gallery, a short about statement and simple contact. Square corners. No pricing, no FAQ, no animation.' }
];
