/** Block fit data and worded shortlists. Pure data and functions; the only import is the
 * manifest registry, which imports nothing else, so the composer, the demo rules and the
 * editor can share them. Code ranks and prunes the
 * hard-compatible candidates of a section in words; the evaluator still chooses. Fit data
 * states what a layout tolerates, not a visual-quality score. */
import { BLOCK_MANIFESTS } from './blocks.mjs';
export const PATTERNS = {
  grid: 'Items in an even grid of cards or tiles.',
  list: 'Text-led rows, a timeline or a table read from top to bottom.',
  showcase: 'One large visual or lead item carries the section.',
  carousel: 'A horizontal sequence the visitor steps or scrolls through.',
  interactive: 'Tabs, filters, search or disclosures reveal content on demand.',
  statement: 'A text-led statement with little or no imagery.'
};
// items: the item counts the layout tolerates; image: 'led' when the main area is an image,
// 'none' when the block never renders section or item images; text: 'short' only where long
// item descriptions break the layout; directions and families: the affinity the block claims.
const fit = (pattern, items, image, text, directions = [], families = []) => ({ pattern, items: [...items], image, text, directions, families });
const C = [1, 8], N = [0, 8];
export const FIT = {
  'nav-minimal': fit('list', N, 'none', 'medium', ['understated', 'editorial'], ['portfolio', 'studio']),
  'nav-floating': fit('showcase', N, 'none', 'medium', ['expressive', 'product'], ['saas', 'studio']),
  'nav-dock': fit('list', N, 'none', 'medium', ['product'], ['general']),
  'nav-mega': fit('interactive', N, 'none', 'medium', ['product'], ['general', 'event']),
  'nav-fullscreen': fit('interactive', N, 'none', 'medium', ['expressive'], ['portfolio']),
  'nav-rail': fit('list', N, 'none', 'medium', ['editorial'], ['hospitality']),
  'nav-shrink': fit('interactive', N, 'none', 'medium', ['understated'], ['local', 'wellness']),
  'nav-progress': fit('interactive', N, 'none', 'medium', ['organic'], ['event']),
  'hero-split': fit('showcase', N, 'optional', 'medium', ['organic'], ['studio', 'local', 'wellness']),
  'hero-centered': fit('statement', N, 'none', 'medium', ['product', 'understated'], ['general']),
  'hero-editorial': fit('showcase', N, 'optional', 'medium', ['editorial', 'expressive'], ['portfolio', 'studio', 'hospitality']),
  'hero-cover': fit('showcase', N, 'led', 'medium', ['organic', 'expressive'], ['hospitality', 'wellness', 'event']),
  'hero-halves': fit('showcase', N, 'optional', 'medium', ['editorial', 'understated'], ['studio', 'portfolio']),
  'hero-browser': fit('showcase', N, 'led', 'medium', ['product'], ['saas']),
  'hero-phone': fit('showcase', N, 'led', 'medium', ['product'], ['general']),
  'hero-collage': fit('grid', C, 'led', 'medium', ['expressive', 'organic'], ['portfolio', 'local']),
  'hero-poster': fit('statement', N, 'none', 'long', ['expressive', 'understated'], ['event', 'general']),
  'hero-tour': fit('interactive', C, 'optional', 'medium', ['product'], ['saas']),
  'hero-layers': fit('interactive', N, 'optional', 'medium', ['organic'], ['hospitality', 'wellness']),
  'features-bento': fit('grid', C, 'none', 'medium', ['product', 'expressive'], ['saas', 'studio']),
  'features-cards': fit('grid', C, 'none', 'medium', ['organic', 'product'], ['local', 'wellness', 'general']),
  'features-list': fit('list', C, 'none', 'long', ['editorial', 'understated'], ['studio', 'portfolio']),
  'features-spotlight': fit('grid', C, 'none', 'medium', ['expressive'], ['event']),
  'features-tabs': fit('interactive', C, 'optional', 'medium', ['product'], ['saas']),
  'features-comparison': fit('list', C, 'none', 'medium', ['understated'], ['general']),
  'features-media': fit('showcase', C, 'optional', 'long', ['editorial', 'organic'], ['hospitality', 'wellness']),
  'features-expand': fit('interactive', C, 'optional', 'long', ['understated'], ['local', 'event']),
  'features-diagram': fit('list', C, 'none', 'short', ['product'], ['general']),
  'about-split': fit('showcase', N, 'optional', 'medium', ['organic'], ['studio', 'local', 'wellness']),
  'about-statement': fit('statement', N, 'none', 'long', ['editorial', 'understated'], ['portfolio', 'studio']),
  'about-chapters': fit('list', C, 'none', 'long', ['editorial'], ['general', 'event']),
  'services-cards': fit('grid', C, 'none', 'medium', ['product', 'organic'], ['studio', 'general']),
  'services-list': fit('list', C, 'none', 'long', ['editorial', 'understated'], ['local', 'wellness']),
  'services-reveal': fit('interactive', C, 'none', 'long', ['expressive'], ['studio']),
  'services-selector': fit('interactive', C, 'none', 'medium', ['product'], ['saas']),
  'gallery-grid': fit('grid', C, 'led', 'medium', ['understated', 'organic'], ['portfolio']),
  'gallery-featured': fit('showcase', C, 'led', 'medium', ['editorial', 'expressive'], ['portfolio', 'studio']),
  'gallery-strip': fit('grid', C, 'led', 'short', ['understated'], ['local', 'general']),
  'gallery-carousel': fit('carousel', C, 'led', 'medium', ['expressive'], ['hospitality', 'event']),
  'gallery-stack': fit('carousel', C, 'led', 'medium', ['expressive', 'organic'], ['wellness', 'event']),
  'gallery-masonry': fit('grid', C, 'led', 'medium', ['editorial'], ['portfolio', 'studio']),
  'gallery-justified': fit('grid', C, 'led', 'medium', ['editorial', 'understated'], ['studio']),
  'gallery-thumbnails': fit('interactive', C, 'led', 'medium', ['product'], ['local', 'saas']),
  'gallery-compare': fit('interactive', [2, 8], 'led', 'medium', ['product'], ['local', 'general']),
  'gallery-lightbox': fit('interactive', C, 'led', 'medium', ['editorial'], ['general']),
  'gallery-filter': fit('interactive', C, 'led', 'medium', ['product'], ['saas']),
  'gallery-albums': fit('list', C, 'led', 'medium', ['organic'], ['event', 'wellness']),
  'gallery-accordion': fit('interactive', C, 'led', 'medium', ['expressive'], ['hospitality', 'wellness']),
  'process-steps': fit('grid', C, 'none', 'medium', ['product'], ['saas', 'general']),
  'process-timeline': fit('list', C, 'none', 'long', ['editorial', 'organic'], ['studio', 'wellness']),
  'process-stacked': fit('showcase', C, 'none', 'long', ['expressive'], ['studio']),
  'process-milestones': fit('carousel', C, 'none', 'short', ['product', 'understated'], ['saas', 'event']),
  'quotes-featured': fit('statement', C, 'none', 'long', ['editorial'], ['studio']),
  'quotes-grid': fit('grid', C, 'none', 'medium', ['product', 'understated'], ['saas', 'general']),
  'quotes-slider': fit('carousel', C, 'none', 'medium', ['expressive'], ['event', 'wellness']),
  'team-grid': fit('grid', C, 'optional', 'medium', ['product'], ['studio', 'saas']),
  'team-directory': fit('interactive', C, 'optional', 'medium', ['understated'], ['general']),
  'logos-wall': fit('grid', C, 'optional', 'short', ['understated'], ['saas']),
  'logos-marquee': fit('carousel', C, 'optional', 'short', ['expressive'], ['event']),
  'stats-band': fit('grid', C, 'none', 'medium', ['product'], ['saas']),
  'pricing-cards': fit('grid', C, 'none', 'medium', ['understated'], ['studio', 'general']),
  'pricing-featured': fit('showcase', C, 'none', 'medium', ['product', 'expressive'], ['saas']),
  'pricing-period': fit('interactive', C, 'none', 'medium', ['product'], ['saas']),
  'pricing-matrix': fit('list', C, 'none', 'long', ['understated'], ['general']),
  'pricing-offer': fit('statement', C, 'none', 'medium', ['editorial'], ['wellness', 'event']),
  'faq-accordion': fit('list', C, 'none', 'long', ['editorial', 'understated'], ['general', 'studio']),
  'faq-cards': fit('grid', C, 'none', 'long', ['organic', 'product'], ['local', 'wellness']),
  'faq-search': fit('interactive', C, 'none', 'long', ['product'], ['saas']),
  'faq-groups': fit('list', C, 'none', 'long', ['understated'], ['event']),
  'faq-sidebar': fit('list', C, 'none', 'long', ['editorial'], ['hospitality']),
  'contact-form': fit('interactive', N, 'none', 'medium', ['product'], ['studio', 'general']),
  'contact-simple': fit('statement', N, 'none', 'medium', ['editorial', 'understated'], ['portfolio']),
  'contact-guided': fit('interactive', C, 'none', 'medium', ['product'], ['saas']),
  'contact-directory': fit('list', C, 'none', 'medium', ['organic'], ['local', 'hospitality']),
  'cta-band': fit('statement', N, 'none', 'medium', ['expressive', 'product'], ['saas', 'event']),
  'cta-card': fit('statement', N, 'none', 'medium', ['organic', 'understated'], ['wellness', 'local']),
  'cta-image': fit('showcase', N, 'led', 'medium', ['editorial'], ['hospitality']),
  'footer-simple': fit('statement', N, 'none', 'medium', ['understated', 'editorial'], ['portfolio']),
  'footer-columns': fit('list', N, 'none', 'medium', ['product'], ['saas', 'general']),
  'footer-sitemap': fit('list', N, 'none', 'medium', ['product'], ['general']),
  'footer-contact': fit('statement', N, 'none', 'medium', ['organic'], ['local', 'hospitality']),
  'footer-wordmark': fit('statement', N, 'none', 'medium', ['expressive'], ['studio', 'event'])
};
// A website manifest states its pattern and fit in its manifest; an application screen has none.
const MANIFEST_FIT = new Map(BLOCK_MANIFESTS.filter((manifest) => manifest.fit).map((manifest) => [manifest.id, fit(manifest.pattern, manifest.fit.items, manifest.fit.image, manifest.fit.text, manifest.fit.directions, manifest.fit.families)]));
export const fitFor = (id) => typeof id !== 'string' ? null : MANIFEST_FIT.get(id) ?? (Object.hasOwn(FIT, id) ? FIT[id] : null);

const NUMBER_WORDS = ['none', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
const word = (count) => NUMBER_WORDS[count] ?? String(count);
const lengthClass = (characters, short, medium) => characters <= short ? 'short' : characters <= medium ? 'medium' : 'long';
const characters = (value) => typeof value === 'string' ? value.length : 0;
// Counts and length classes only: never section or item text, destinations or image data.
function measure(section) {
  const items = Array.isArray(section?.items) ? section.items : [];
  const longest = (field) => items.reduce((max, item) => Math.max(max, characters(item?.[field])), 0);
  return { count: items.length, title: longest('title'), body: longest('body'), images: items.filter((item) => item?.image).length, sectionBody: characters(section?.body), sectionImage: Boolean(section?.image), action: Boolean(section?.button || section?.href) };
}
export function describeShape(section) {
  const shape = measure(section), parts = [shape.count ? `${word(shape.count)} item${shape.count === 1 ? '' : 's'}` : 'no items'];
  if (shape.count) {
    parts.push(shape.title ? `item titles ${lengthClass(shape.title, 40, 80)}` : 'no item titles');
    parts.push(shape.body ? `item descriptions ${lengthClass(shape.body, 120, 300)}` : 'no item descriptions');
  }
  parts.push(shape.sectionBody ? `section text ${lengthClass(shape.sectionBody, 120, 300)}` : 'no section text');
  if (shape.count === 1) parts.push(shape.images ? 'the item has an uploaded image' : 'the item has no uploaded image');
  else if (shape.count) parts.push(shape.images ? `${word(shape.images)} of ${word(shape.count)} items ${shape.images === 1 ? 'has' : 'have'} an uploaded image` : 'no item has an uploaded image');
  parts.push(shape.sectionImage ? 'has a section image' : 'no section image');
  parts.push(shape.action ? 'has an action' : 'no action');
  return parts.join('; ');
}
const rangeWords = ([min, max]) => min === max ? word(min) : min === 0 ? `up to ${word(max)}` : `${word(min)} to ${word(max)}`;
function problemsFor(id, shape) {
  const entry = fitFor(id);
  if (!entry) return [];
  const problems = [];
  if (shape.count < entry.items[0] || shape.count > entry.items[1]) problems.push(`holds ${rangeWords(entry.items)} items, this section has ${word(shape.count)}`);
  if (entry.text === 'short' && shape.body > 300) problems.push('made for short item descriptions, this section has long ones');
  if (entry.image === 'none' && shape.images > 0) problems.push('does not show item images, this section has uploaded ones');
  return problems;
}
/** The stated fit problems of one block for a section's content shape, in words; none for a
 * block without fit data. The same rules rank the shortlist. */
export function fitProblems(id, section) { return problemsFor(id, measure(section)); }
/** Ranks and, on create and redesign, prunes the hard-compatible candidates of a section.
 * `blocks` is `[{ id, name }]` in catalog order; options keep that order. */
export function shortlist({ section, blocks, direction = null, family = null, pattern = null, prompt = '', pins = [], prune = true } = {}) {
  const list = (Array.isArray(blocks) ? blocks : []).filter((block) => block && typeof block.id === 'string');
  const order = new Map(list.map((block, index) => [block.id, index])), shape = measure(section);
  const pinned = new Map();
  const pin = (id, reason) => { if (pinned.size < 4 && order.has(id) && !pinned.has(id)) pinned.set(id, reason); };
  if (typeof section?.block === 'string') pin(section.block, 'current layout');
  // Substring tests only: the prompt never becomes a regular expression.
  const text = typeof prompt === 'string' ? prompt.toLowerCase() : '';
  let named = 0;
  for (const block of list) {
    if (named >= 2) break;
    if (!text || !(text.includes(block.id) || typeof block.name === 'string' && block.name && text.includes(block.name.toLowerCase()))) continue;
    named++; pin(block.id, 'named in the request');
  }
  for (const entry of Array.isArray(pins) ? pins : []) if (entry && typeof entry.id === 'string') pin(entry.id, typeof entry.reason === 'string' && entry.reason ? entry.reason : 'suggested');
  const whole = !prune || list.length <= 8;
  const patterned = whole || !pattern ? [] : list.filter((block) => fitFor(block.id)?.pattern === pattern);
  const pool = patterned.length ? patterned : list;
  const problems = new Map(list.map((block) => [block.id, problemsFor(block.id, shape)]));
  const affinity = (id) => {
    const entry = fitFor(id);
    return { direction: Boolean(entry && direction && entry.directions.includes(direction)), family: Boolean(entry && family && entry.families.includes(family)) };
  };
  const score = (id) => (problems.get(id).length ? -1000 : 0) + (affinity(id).direction ? 20 : 0) + (affinity(id).family ? 10 : 0);
  const ranked = list.filter((block) => pool.includes(block) || pinned.has(block.id)).map((block) => block.id).sort((a, b) => score(b) - score(a) || order.get(a) - order.get(b));
  let kept;
  if (whole) kept = new Set(order.keys());
  else {
    const others = ranked.filter((id) => !pinned.has(id)).slice(0, 6);
    // The group's standard layout keeps a place when no pattern is in force and it fits.
    const standard = list[0]?.id;
    if (pool === list && standard && !problems.get(standard).length && !pinned.has(standard) && !others.includes(standard) && others.length === 6) others[5] = standard;
    kept = new Set([...pinned.keys(), ...others]);
  }
  const uploads = shape.sectionImage || shape.images > 0;
  const phrase = (id) => {
    const entry = fitFor(id), found = problems.get(id), words = [];
    if (!entry) words.push('fit not rated');
    else if (found.length) words.push(...found);
    else {
      words.push(`suits ${entry.items[0] === 0 && entry.items[1] === 8 ? 'any item count' : `${rangeWords(entry.items)} items`} and ${entry.text === 'medium' ? 'medium-length' : entry.text} text`);
      if (affinity(id).direction) words.push('matches the chosen direction');
      if (affinity(id).family) words.push('suits the chosen site category');
    }
    if (entry?.image === 'led' && !uploads) words.push('shows placeholder art until photos are added');
    if (pinned.has(id)) words.push(pinned.get(id));
    return words.join('; ');
  };
  return { options: list.filter((block) => kept.has(block.id)).map((block) => ({ id: block.id, fit: phrase(block.id) })), ranked };
}
/** Runner-up layouts that are still a content-keeping change for the section as it is now.
 * `entry` is one element of `report.alternatives`; `blocks` is `[{ id, screen }]` for the
 * section's group. Reads nothing but its arguments and never throws. */
export function liveAlternatives(entry, section, blocks) {
  if (!entry || typeof entry !== 'object' || !section || typeof section !== 'object' || !Array.isArray(blocks)) return [];
  if (entry.sectionId !== section.id || entry.group !== section.group) return [];
  const website = new Set(blocks.filter((block) => block && typeof block.id === 'string' && !block.screen).map((block) => block.id));
  if (!website.has(section.block)) return [];
  const options = Array.isArray(entry.options) ? entry.options : [];
  const candidates = [...options.map((option) => ({ block: option?.block, probability: option?.probability })), { block: entry.chosen, probability: null }];
  const seen = new Set([section.block]), result = [];
  for (const candidate of candidates) {
    if (typeof candidate.block !== 'string' || seen.has(candidate.block) || !website.has(candidate.block)) continue;
    seen.add(candidate.block);
    result.push({ block: candidate.block, probability: typeof candidate.probability === 'number' && Number.isFinite(candidate.probability) ? candidate.probability : null });
  }
  return result;
}
