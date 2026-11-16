/** Native authored compositions. References inform interaction design; no upstream
 * executable source is bundled by this registry. IDs never select remote code. */
import { BLOCK_MANIFESTS, MANIFEST_BY_ID } from './blocks.mjs';
const block = (id, group, name, behavior, description, reference) => ({ id, group, name, behavior, description, reference, source: 'Forma original · MIT', license: 'MIT' });
export const EXPANSION_BLOCKS = [
  block('nav-dock', 'navigation', 'Navigation dock', 'dock', 'A compact sticky dock with named destinations and keyboard focus.', 'watermelon'),
  block('nav-mega', 'navigation', 'Mega navigation', 'mega', 'A disclosure menu showing page and section destinations in a broad panel.', 'velora'),
  block('nav-fullscreen', 'navigation', 'Full-screen navigation', 'fullscreen-menu', 'A large dismissible navigation dialog with readable destinations.', 'fancy'),
  block('nav-rail', 'navigation', 'Navigation side rail', 'rail', 'A vertical desktop navigation rail that becomes a horizontal header on mobile.', 'uselayouts'),
  block('nav-shrink', 'navigation', 'Shrinking sticky header', 'shrink', 'A sticky header with compact scroll state and a stable accessible action.', 'velora'),
  block('nav-progress', 'navigation', 'Section progress navigation', 'progress-nav', 'Sticky section links indicate the section currently in view.', 'velora'),
  block('hero-cover', 'hero', 'Full-bleed introduction', 'cover', 'A full-width image with an opaque readable copy panel.'),
  block('hero-halves', 'hero', 'Split-screen introduction', 'halves', 'Equal-height contrasting copy and image panels.'),
  block('hero-browser', 'hero', 'Browser product preview', 'browser', 'Editable introduction and image in a locally drawn browser frame.', 'cult'),
  block('hero-phone', 'hero', 'Phone product preview', 'phone', 'A narrow device frame pairs an uploaded product image with editable copy.', 'cult'),
  block('hero-collage', 'hero', 'Image collage introduction', 'collage', 'A staggered collection of editable images beside the introduction.', 'fancy'),
  block('hero-poster', 'hero', 'Typographic poster', 'poster', 'A large text-led composition with a compact action and no image dependency.'),
  block('hero-tour', 'hero', 'Product tour introduction', 'tour', 'Selectable product steps change the displayed image and description.', 'watermelon'),
  block('hero-layers', 'hero', 'Layered scroll introduction', 'layers', 'Image and copy layers gently separate on scroll; normal flow in reduced motion.', 'fancy'),
  block('features-tabs', 'features', 'Tabbed product showcase', 'tabs', 'Named tabs reveal real editable product details and images.', 'watermelon'),
  block('features-comparison', 'features', 'Feature comparison matrix', 'matrix', 'Structured editable comparison rows with descriptive column headings.', 'spectrum'),
  block('features-media', 'features', 'Alternating media features', 'alternating', 'Alternating image and text passages for detailed product explanations.'),
  block('features-expand', 'features', 'Expandable feature grid', 'expand-grid', 'A grid of native disclosures that reveal detailed feature descriptions.', 'cult'),
  block('features-diagram', 'features', 'Connected workflow diagram', 'diagram', 'An ordered sequence of connected editable stages, with a linear mobile layout.', 'pioneer'),
  block('about-chapters', 'about', 'Chaptered story', 'chapters', 'A readable long-form story with editable chapter headings and text.'),
  block('services-selector', 'services', 'Service selector', 'selector', 'Select a service to reveal its details, price and destination.', 'watermelon'),
  block('process-milestones', 'process', 'Milestone rail', 'milestones', 'A horizontally scrollable timeline with keyboard and touch controls.'),
  block('gallery-masonry', 'gallery', 'Masonry portfolio', 'masonry', 'Natural-height media columns retain every caption and authored image.'),
  block('gallery-justified', 'gallery', 'Justified image rows', 'justified', 'Flexible image rows adapt to available width without cropping captions.'),
  block('gallery-thumbnails', 'gallery', 'Thumbnail image navigator', 'thumbnails', 'A large selected image with named thumbnail controls.', 'watermelon'),
  block('gallery-compare', 'gallery', 'Before and after gallery', 'compare', 'An accessible range control compares two authored images with captions.', 'velora'),
  block('gallery-lightbox', 'gallery', 'Lightbox portfolio', 'lightbox', 'Image buttons open a keyboard-controlled local image viewer.', 'uicomponents'),
  block('gallery-filter', 'gallery', 'Filterable projects', 'filter', 'Category controls filter editable projects using their saved labels.'),
  block('gallery-albums', 'gallery', 'Photo album browser', 'albums', 'Album disclosures group the saved image collection by its labels.', 'uselayouts'),
  block('gallery-accordion', 'gallery', 'Image accordion', 'image-accordion', 'Image disclosures expand on click or keyboard activation.', 'cult'),
  block('quotes-featured', 'testimonials', 'Featured quotation', 'quote', 'A prominent authored quotation and attribution; sample content is labeled.'),
  block('quotes-grid', 'testimonials', 'Quotation collection', 'quote-grid', 'An editable collection of quotations with clear attributions.'),
  block('quotes-slider', 'testimonials', 'Quotation navigator', 'quote-slider', 'Previous and next controls navigate authored quotations without autoplay.', 'uselayouts'),
  block('team-grid', 'team', 'Team portraits', 'team-grid', 'Editable portraits, names, roles and personal links.'),
  block('team-directory', 'team', 'Searchable team directory', 'directory', 'Local search filters editable names, roles and descriptions.'),
  block('logos-wall', 'logos', 'Logo wall', 'logo-wall', 'A named collection of uploaded marks; prepared names are clearly illustrative.'),
  block('logos-marquee', 'logos', 'Moving logo collection', 'marquee', 'An opt-in moving logo collection with pause control and a static fallback.', 'velora'),
  block('stats-band', 'stats', 'Statistics band', 'stats', 'Editable values with supporting context; no fabricated business results.'),
  block('pricing-period', 'pricing', 'Billing-period pricing', 'billing', 'Period controls show authored monthly and annual values separated by a slash.', 'watermelon'),
  block('pricing-matrix', 'pricing', 'Pricing comparison table', 'pricing-matrix', 'A scrollable plan comparison with readable features and actions.'),
  block('pricing-offer', 'pricing', 'Single-offer pricing', 'offer', 'One primary offer and supporting alternatives with editable prices.'),
  block('contact-guided', 'contact', 'Guided inquiry', 'inquiry', 'A local multistep inquiry prepares an email using the public brand address.'),
  block('contact-directory', 'contact', 'Contact directory', 'contacts', 'Named contact channels with validated destinations.'),
  block('cta-image', 'cta', 'Image-backed invitation', 'image-cta', 'A wide image paired with a readable closing invitation and action.'),
  block('app-command', 'hero', 'Command center', 'command-center', 'Searchable local shortcuts and a keyboard command palette.', 'watermelon'),
  block('app-analytics', 'hero', 'Analytics detail', 'analytics', 'A searchable, sortable authored data table; values remain editable.'),
  block('app-files', 'hero', 'File browser', 'files', 'Local search, category filters and an editable document detail viewer.'),
  block('app-notifications', 'hero', 'Notification center', 'notifications', 'Editable updates with read, unread and dismiss controls.'),
  block('app-activity', 'hero', 'Activity timeline', 'activity', 'A dated activity stream with local search and category filtering.', 'motion-primitives'),
  block('app-onboarding', 'hero', 'Onboarding wizard', 'wizard', 'Editable steps with next, back and a real completion state.'),
  block('app-project', 'hero', 'Project detail', 'project', 'Project overview, indexed tasks, completion controls and a progress summary.'),
  block('app-product', 'hero', 'Product detail', 'product', 'Editable product images, quantity and local order summary.'),
  block('app-billing', 'hero', 'Account and billing', 'billing-account', 'Editable account details and a local plan selector; no payment service.'),
  block('app-help', 'hero', 'Help center', 'help', 'Searchable editable help entries and native answer disclosures.'),
  block('faq-search', 'faq', 'Searchable answers', 'faq-search', 'Local search filters authored questions and answers.'),
  block('faq-groups', 'faq', 'Grouped answers', 'faq-groups', 'Question disclosures are grouped by editable category labels.'),
  block('faq-sidebar', 'faq', 'Answers with an index', 'faq-sidebar', 'An indexed question list links to accessible answer disclosures.', 'animate'),
  block('footer-sitemap', 'footer', 'Sitemap footer', 'sitemap', 'Page and section destinations with a prominent brand introduction.'),
  block('footer-contact', 'footer', 'Contact footer', 'contact-footer', 'Public contact, editable closing copy and a clear back-to-top action.'),
  block('footer-wordmark', 'footer', 'Large wordmark footer', 'wordmark-footer', 'An oversized brand wordmark closes the page with readable destinations.'),
  // Blocks defined as manifests (shared/blocks.mjs) follow the hand-listed entries.
  ...BLOCK_MANIFESTS.map((manifest) => block(manifest.id, manifest.group, manifest.name, manifest.behavior, manifest.description, manifest.reference))
];
export const EXPANSION_BY_ID = Object.fromEntries(EXPANSION_BLOCKS.map((entry) => [entry.id, entry]));
export const EXPANSION_APP_BLOCKS = EXPANSION_BLOCKS.filter((entry) => entry.id.startsWith('app-'));
export const ANCHORED_GROUPS = ['navigation', 'hero', 'footer'];
export const EVIDENCE_GROUPS = ['testimonials', 'team', 'logos', 'stats'];
export function expansionCapabilities(entry) {
  const manifest = MANIFEST_BY_ID[entry.id];
  return { behavior: entry.behavior, itemLimit: 8, media: manifest ? manifest.media : ['gallery', 'team', 'logos', 'features'].includes(entry.group) ? 'item' : ['hero', 'cta'].includes(entry.group) ? 'section' : 'none', fallback: 'All authored content is readable without decorative motion.', sources: [], references: entry.reference ? [entry.reference] : [], interactive: manifest ? manifest.interactive : ['dock', 'mega', 'fullscreen-menu', 'shrink', 'progress-nav', 'tour', 'layers', 'tabs', 'expand-grid', 'selector', 'milestones', 'thumbnails', 'compare', 'lightbox', 'filter', 'albums', 'image-accordion', 'quote-slider', 'directory', 'marquee', 'billing', 'inquiry', 'faq-search', 'faq-groups'].includes(entry.behavior) || entry.id.startsWith('app-') };
}
