/** NEW: Auditable, closed component catalog. No remote code or arbitrary HTML is executed.
 * HyperUI-derived items use its MIT layout/markup patterns; see licenses/HYPERUI.txt.
 * Additional compositions, themes and artwork are original, MIT-licensed code.
 */
import { INTERFACE_BLOCKS } from './interfaces.mjs';
import { interactionCapabilities } from './interactions.mjs';
import { EXPANSION_BLOCKS, EXPANSION_BY_ID, expansionCapabilities } from './expansion.mjs';
export const SCHEMA_VERSION = 2;
export const GROUPS = ['navigation', 'hero', 'features', 'about', 'services', 'gallery', 'process', 'testimonials', 'team', 'logos', 'stats', 'pricing', 'faq', 'contact', 'cta', 'footer'];
export const OPTIONAL_GROUPS = GROUPS.filter((g) => !['navigation', 'hero', 'footer'].includes(g));
export const GROUP_LABELS = { navigation: 'Navigation', hero: 'Hero', features: 'Features', about: 'About', services: 'Services', gallery: 'Work / gallery', process: 'Process', testimonials: 'Quotations', team: 'Team', logos: 'Logos', stats: 'Statistics', pricing: 'Pricing', faq: 'FAQ', contact: 'Contact', cta: 'Call to action', footer: 'Footer' };
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
  sand: { name: 'Sand', description: 'Warm neutral surfaces with a deep brown accent.', bg: '#f7f2e9', surface: '#fffdf8', ink: '#342a22', muted: '#6d6258', line: '#ded4c7', accent: '#644531', onAccent: '#ffffff', soft: '#eae0d1', dark: false },
  forest: { name: 'Forest', description: 'Light botanical surfaces and rich forest green.', bg: '#f3f6ee', surface: '#ffffff', ink: '#20372d', muted: '#5a6b61', line: '#d8e1d4', accent: '#27543b', onAccent: '#ffffff', soft: '#dce9db', dark: false },
  slate: { name: 'Slate', description: 'Cool industrial gray with a clear blue accent.', bg: '#f0f2f5', surface: '#ffffff', ink: '#202d3d', muted: '#566476', line: '#d5dbe3', accent: '#264d82', onAccent: '#ffffff', soft: '#e0e8f2', dark: false },
  cobalt: { name: 'Cobalt', description: 'Bright paper and assertive cobalt with dark structural lines.', bg: '#fffdf5', surface: '#ffffff', ink: '#182339', muted: '#526078', line: '#263753', accent: '#214ec7', onAccent: '#ffffff', soft: '#e5ecff', dark: false },
  ink: { name: 'Ink', description: 'Deep navy with legible pale cyan accents.', bg: '#111e30', surface: '#203149', ink: '#eff5ff', muted: '#b0c2da', line: '#405571', accent: '#9cdeea', onAccent: '#122c3b', soft: '#2a4159', dark: true },
  lavender: { name: 'Lavender', description: 'Soft lavender and warm-white panels with a deep plum accent.', bg: '#f6f0ff', surface: '#fffaff', ink: '#32243e', muted: '#73617f', line: '#e0d3ed', accent: '#693682', onAccent: '#ffffff', soft: '#e9dcf6', dark: false },
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
const entry = (id, group, name, description, source = o) => {
  const block = { id, group, name, description, source, license: 'MIT' };
  return { ...block, capabilities: EXPANSION_BY_ID[id] ? expansionCapabilities(EXPANSION_BY_ID[id]) : interactionCapabilities(block) };
};
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
  entry('features-spotlight', 'features', 'Spotlight features', 'Theme-colored spotlight feature cards. Pointer movement adds depth; keyboard focus and touch keep all content available.', 'Velora UI · MIT, adapted'),
  entry('about-split', 'about', 'About, side by side', 'Narrative about section with large image or abstract art and descriptive copy.'),
  entry('about-statement', 'about', 'About statement', 'Large text-led about section with no image. Editorial or minimal.'),
  entry('services-cards', 'services', 'Service cards', 'Three service offerings in bordered cards, with title and description.', h),
  entry('services-list', 'services', 'Service menu', 'Compact divided rows with service title, description and optional price. Good for local businesses.'),
  entry('services-reveal', 'services', 'Revealing services', 'Expandable service cards with editable titles, descriptions and prices. Keyboard and touch disclosure; all content is visible in Inspect.', 'Cult UI · MIT, adapted'),
  entry('gallery-grid', 'gallery', 'Project grid', 'Two-column portfolio or accommodation gallery with captions. User images or original abstract placeholders.', h),
  entry('gallery-featured', 'gallery', 'Featured work', 'One wide lead project followed by smaller work cards. Editorial, visually led.'),
  entry('gallery-strip', 'gallery', 'Image triptych', 'Three equal visual cards with concise captions. Compact gallery.', h),
  entry('gallery-carousel', 'gallery', 'Swipeable gallery', 'A horizontal, swipeable gallery with previous and next controls. Uses your saved images, captions and links; never auto-plays.', 'Watermelon UI · MIT, adapted'),
  entry('gallery-stack', 'gallery', 'Fanned photo gallery', 'A fanned collection of your saved images with readable captions and previous/next controls. Inspect and small screens use a sequential gallery.', 'useLayouts · MIT, adapted'),
  entry('process-steps', 'process', 'Three-step process', 'Horizontal numbered cards explaining a workflow or visitor journey.'),
  entry('process-timeline', 'process', 'Vertical process', 'Vertical timeline with numbered steps and descriptions. Story-led or more detailed.'),
  entry('process-stacked', 'process', 'Stacked process', 'Large process cards layer as you scroll. Long descriptions, small screens, Inspect and reduced motion use the full sequential content.', 'Fancy Components · MIT, adapted'),
  entry('pricing-cards', 'pricing', 'Pricing tiers', 'Responsive pricing-card grid with plan names, descriptions, prices and feature lists. No checkout backend.', h),
  entry('pricing-featured', 'pricing', 'Highlighted pricing', 'Two or three pricing cards with one visually highlighted option. No invented popularity claims.', h),
  entry('faq-accordion', 'faq', 'Quiet accordion', 'Native accessible details and summary FAQ rows divided by borders; works without JavaScript.', h),
  entry('faq-cards', 'faq', 'FAQ cards', 'Native details and summary FAQs in softly filled cards with chevrons.', h),
  entry('contact-form', 'contact', 'Email draft form', 'Contact fields prepare an email in the visitor mail client. Requires a configured public email; does not submit to a server.'),
  entry('contact-simple', 'contact', 'Contact invitation', 'Simple contact text and a public email or configured call to action. No form.'),
  entry('cta-band', 'cta', 'Closing invitation', 'Full-width accent band with closing headline, text and action.', h),
  entry('cta-card', 'cta', 'Closing card', 'Inset, softly colored final call-to-action card.', h),
  entry('footer-simple', 'footer', 'Minimal footer', 'Brand, short description and back-to-top link.'),
  entry('footer-columns', 'footer', 'Structured footer', 'Brand and internal section links in columns; no fabricated social links.'),
  ...EXPANSION_BLOCKS.filter((block) => !block.id.startsWith('app-')).map((block) => entry(block.id, block.group, block.name, block.description))
];
export const getBlock = (id) => CATALOG.find((block) => block.id === id);
export const blocksFor = (group) => CATALOG.filter((block) => block.group === group);
export const DEFAULT_BLOCKS = Object.fromEntries(GROUPS.map((group) => [group, blocksFor(group)[0].id]));
export const DEFAULT_THEME = { palette: 'porcelain', font: 'modern', density: 'balanced', radius: 'soft', motion: 'none', typeScale: 'balanced', width: 'standard', style: 'default' };
// The first preset's brief is the request box placeholder.
export const PRESETS = [
  { name: 'AI product', brand: 'Lumen', icon: 'lightbulb', brief: 'Lumen, an AI product for writing: a landing page with a prompt box introduction, a scripted conversation, statistic cards, pricing, FAQ and a closing call to action. Warm voice copy, ocean blue, clean sans headings. No animation.' },
  { name: 'Creative studio', brand: 'Studio North', icon: 'spark', brief: 'An editorial website for a small design studio. Warm ivory background, elegant serif headings, a split hero, selected work gallery, services, our process, FAQ and contact. No pricing. No animation.' },
  { name: 'Software product', brand: 'Orbit', icon: 'grid', brief: 'A dark modern SaaS landing page with a centered hero, bento features, a three-step workflow, pricing tiers, FAQ and a final call to action. Lime accents. No gallery.' },
  { name: 'Developer tool', brand: 'Relay', icon: 'code', brief: 'A website for Relay, a developer tool and API for software teams: integrations, a code showcase, a changelog timeline, pricing, FAQ and a closing call to action. Monospace headings, compact spacing, square corners.' },
  { name: 'Coastal stay', brand: 'Stillwater', icon: 'sun', brief: 'A website for a small coastal guesthouse: rooms, amenities, our story, testimonials, FAQ and opening hours with the address. Sage green, elegant serif headings, generous spacing.' },
  { name: 'Independent portfolio', brand: 'Alex Morgan', icon: 'frame', brief: 'A minimal monochrome designer portfolio. Editorial hero, featured work gallery, a short about statement and simple contact. Square corners. No pricing, no FAQ, no animation.' },
  { name: 'Restaurant', brand: 'Corner Table', icon: 'leaf', brief: 'A warm website for a neighborhood restaurant. Clay colors, elegant serif headings, a full-bleed photo introduction, the menu with prices to fill in, a few photos, our story, opening hours with the address and contact. No pricing tiers. No animation.' },
  { name: 'Conference', brand: 'Northfield Summit', icon: 'users', brief: 'A website for Northfield Summit, a two-day design conference. Bold voice copy, dark background, modern sans headings. Include stats, the speakers, the schedule, tickets, partner logos, FAQ and a closing call to action. No animation.' },
  { name: 'Agent run', brand: 'Atlas', icon: 'bolt', brief: 'Build the agent run screen for a research assistant.' },
  { name: 'Chat with artifact', brand: 'Lumen', icon: 'layers', brief: 'Build the chat with artifact screen for a writing assistant.' },
  { name: 'Agent inbox', brand: 'Harbor', icon: 'mail', brief: 'Build the agent inbox screen for customer support.' },
  { name: 'Usage and limits', brand: 'Quanta', icon: 'chart', brief: 'Build the usage and limits screen for an AI workspace, dark theme.' },
  { name: 'Agent setup', brand: 'Forge', icon: 'settings', brief: 'Build the agent setup screen for a new coding agent.' }
];
/** The request text a preset puts in the request box: its brand as an exact field, then its brief. */
export const presetPrompt = (preset) => `Brand: ${JSON.stringify(preset.brand)}\n${preset.brief}`;
