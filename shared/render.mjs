/** NEW: Pure allowlisted renderer shared by live preview and static export.
 * Pricing, cards, FAQ and CTA markup are adaptations of HyperUI's MIT components.
 * Utility classes are replaced with local theme-aware CSS; content is escaped.
 */
import { escapeHtml as e, validateSpec, validatePageSpec } from './schema.mjs';
import { THEMES, FONTS, GROUPS, GROUP_LABELS } from './catalog.mjs';
import { presentationFieldsFor } from './design.mjs';
import { icon, itemIconName } from './icons.mjs';
import { elementFieldsFor } from './elements.mjs';
import { BUTTON_LABELS } from './ui-catalog.mjs';
import { effectivePartOrder, effectivePlacement, effectiveButtonIcon } from './slots.mjs';
import { imageSizeOf } from './media.mjs';
import { isInterfaceBlock, INTERFACE_BLOCKS } from './interfaces.mjs';
import { renderInterface } from './interface-render.mjs';
import { isPartVisible } from './parts.mjs';
import { HOME_PAGE_ID, MAX_PAGES, PAGE_TEMPLATES, getPageSpec, pageEntries, pageFilename } from './pages.mjs';
function mainIdFor(spec) {
  let candidate = 'forma-main', suffix = 1;
  while (spec.sections.some((section) => section.id === candidate)) candidate = `forma-main-${suffix++}`;
  return candidate;
}
const startIdFor = (spec) => spec.sections.find((section) => section.group === 'hero')?.id || spec.sections.find((section) => !['navigation', 'footer'].includes(section.group))?.id || mainIdFor(spec);
export function resolveHref(proposed, spec, site = spec) {
  if (proposed?.startsWith('page:')) {
    const [pageId, sectionId] = proposed.slice(5).split('#');
    return `${pageFilename(site, pageId)}${sectionId ? `#${sectionId}` : ''}`;
  }
  if (proposed && !proposed.startsWith('#')) return proposed;
  if (proposed && spec.sections.some((s) => `#${s.id}` === proposed)) return proposed;
  if (spec.brand.email) return `mailto:${spec.brand.email}`;
  const target = spec.sections.find((s) => s.group === 'contact') || spec.sections.find((s) => !['navigation', 'hero', 'footer', 'cta'].includes(s.group)) || spec.sections.find((s) => s.group === 'hero');
  return `#${target?.id || mainIdFor(spec)}`;
}
const label = (s, context) => s.eyebrow && isPartVisible(s, 'eyebrow') ? `<p class="eyebrow"${partAttributes('eyebrow', 'content', context)}><span></span>${e(s.eyebrow)}</p>` : '';
const heading = (s, context) => {
  const content = `${label(s, context)}${isPartVisible(s, 'heading') ? `<h2${partAttributes('heading', 'content', context)}>${e(s.title)}</h2>` : ''}${s.body && isPartVisible(s, 'body') ? `<p class="section-description"${partAttributes('body', 'content', context)}>${e(s.body)}</p>` : ''}`;
  return content ? `<div class="section-heading">${content}</div>` : '';
};
// Prepared placeholder art: four landscape scenes (a ridge at dusk, dunes under a crescent moon, a sea horizon,
// a misty pine forest) drawn as inline SVG and coloured from the site palette. Authored fallbacks for missing
// images, never JEV output, no user data.
const ART_PLATES = ["<defs><linearGradient id=\"sc0-sky\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" class=\"sc-sky1\"/><stop offset=\".48\" class=\"sc-sky2\"/><stop offset=\".72\" class=\"sc-sky3\"/><stop offset=\"1\" class=\"sc-sky3\"/></linearGradient><radialGradient id=\"sc0-glow\" cx=\"322\" cy=\"178\" r=\"210\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" class=\"sc-glow1\"/><stop offset=\".45\" class=\"sc-glow2\"/><stop offset=\"1\" class=\"sc-glow3\"/></radialGradient><filter id=\"sc0-blur\" x=\"-20%\" y=\"-100%\" width=\"140%\" height=\"300%\"><feGaussianBlur stdDeviation=\"8\"/></filter></defs><rect width=\"480\" height=\"360\" fill=\"url(#sc0-sky)\"/><rect width=\"480\" height=\"360\" fill=\"url(#sc0-glow)\"/><circle class=\"sc-halo\" cx=\"322\" cy=\"178\" r=\"64\"/><circle class=\"sc-sun\" cx=\"322\" cy=\"178\" r=\"40\"/><path class=\"sc-r1\" d=\"M0 236C48 222 96 200 156 206S250 190 312 190 396 214 480 204V360H0Z\"/><ellipse class=\"sc-mist\" cx=\"250\" cy=\"250\" rx=\"290\" ry=\"15\" filter=\"url(#sc0-blur)\"/><path class=\"sc-r2\" d=\"M0 272C46 258 92 236 150 244S238 224 300 232 402 266 480 254V360H0Z\"/><ellipse class=\"sc-mist\" cx=\"190\" cy=\"290\" rx=\"250\" ry=\"13\" filter=\"url(#sc0-blur)\"/><path class=\"sc-r3\" d=\"M0 310C60 296 116 282 186 292S302 278 362 286 444 308 480 302V360H0Z\"/><path class=\"sc-r4\" d=\"M0 340C36 334 74 328 112 331L120 314 128 330C168 330 200 326 238 328L246 312 254 327C300 328 340 323 398 329L406 316 414 329C444 331 462 335 480 334V360H0Z\"/><path class=\"sc-bird\" d=\"M84 116q7-6 14 0q7-6 14 0M122 96q6-5 12 0q6-5 12 0M150 122q5-4 10 0q5-4 10 0\"/>", "<defs><linearGradient id=\"sc1-sky\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" class=\"sc-sky1\"/><stop offset=\".48\" class=\"sc-sky2\"/><stop offset=\".72\" class=\"sc-sky3\"/><stop offset=\"1\" class=\"sc-sky3\"/></linearGradient><radialGradient id=\"sc1-glow\" cx=\"132\" cy=\"96\" r=\"150\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" class=\"sc-glow1\"/><stop offset=\".45\" class=\"sc-glow2\"/><stop offset=\"1\" class=\"sc-glow3\"/></radialGradient><filter id=\"sc1-blur\" x=\"-20%\" y=\"-100%\" width=\"140%\" height=\"300%\"><feGaussianBlur stdDeviation=\"7\"/></filter><mask id=\"sc1-moon\"><rect width=\"480\" height=\"360\" fill=\"#fff\"/><circle cx=\"146\" cy=\"86\" r=\"26\" fill=\"#000\"/></mask></defs><rect width=\"480\" height=\"360\" fill=\"url(#sc1-sky)\"/><rect width=\"480\" height=\"360\" fill=\"url(#sc1-glow)\"/><circle class=\"sc-halo\" cx=\"132\" cy=\"96\" r=\"48\"/><circle class=\"sc-sun\" cx=\"132\" cy=\"96\" r=\"30\" mask=\"url(#sc1-moon)\"/><path class=\"sc-r1\" d=\"M0 222C90 198 190 200 280 220S420 234 480 214V360H0Z\"/><ellipse class=\"sc-mist\" cx=\"260\" cy=\"236\" rx=\"260\" ry=\"12\" filter=\"url(#sc1-blur)\"/><path class=\"sc-r2\" d=\"M0 286C70 250 176 236 296 258S420 272 480 250V360H0Z\"/><path class=\"sc-lit\" d=\"M0 286C70 250 176 236 296 258L296 266C176 252 82 268 0 306Z\"/><path class=\"sc-r3\" d=\"M0 360V332C90 302 176 294 258 308S416 318 480 298V360Z\"/><path class=\"sc-lit\" d=\"M0 332C90 302 176 294 258 308L258 316C176 306 92 316 0 346Z\"/><path class=\"sc-ripple\" d=\"M40 342q40-9 82-3M150 334q34-6 70 2M270 328q36-4 74 4M370 324q30-4 62 0\"/><path class=\"sc-bird\" d=\"M330 136q6-5 12 0q6-5 12 0M360 120q5-4 10 0q5-4 10 0\"/>", "<defs><linearGradient id=\"sc2-sky\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" class=\"sc-sky1\"/><stop offset=\".48\" class=\"sc-sky2\"/><stop offset=\".72\" class=\"sc-sky3\"/><stop offset=\"1\" class=\"sc-sky3\"/></linearGradient><radialGradient id=\"sc2-glow\" cx=\"246\" cy=\"212\" r=\"230\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" class=\"sc-glow1\"/><stop offset=\".45\" class=\"sc-glow2\"/><stop offset=\"1\" class=\"sc-glow3\"/></radialGradient><filter id=\"sc2-blur\" x=\"-20%\" y=\"-100%\" width=\"140%\" height=\"300%\"><feGaussianBlur stdDeviation=\"6\"/></filter><linearGradient id=\"sc2-sea\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" class=\"sc-sea1\"/><stop offset=\"1\" class=\"sc-sea2\"/></linearGradient></defs><rect width=\"480\" height=\"360\" fill=\"url(#sc2-sky)\"/><rect width=\"480\" height=\"360\" fill=\"url(#sc2-glow)\"/><circle class=\"sc-halo\" cx=\"246\" cy=\"204\" r=\"62\"/><circle class=\"sc-sun\" cx=\"246\" cy=\"204\" r=\"38\"/><path class=\"sc-r1\" d=\"M0 214V204C40 194 96 190 152 198S208 210 224 214Z\"/><rect y=\"214\" width=\"480\" height=\"146\" fill=\"url(#sc2-sea)\"/><g class=\"sc-refl\"><rect x=\"220\" y=\"216\" width=\"52\" height=\"4\" rx=\"2\" opacity=\".9\"/><rect x=\"212\" y=\"225\" width=\"68\" height=\"4\" rx=\"2\" opacity=\".7\"/><rect x=\"204\" y=\"236\" width=\"84\" height=\"5\" rx=\"2.5\" opacity=\".55\"/><rect x=\"196\" y=\"250\" width=\"98\" height=\"5\" rx=\"2.5\" opacity=\".42\"/><rect x=\"186\" y=\"266\" width=\"120\" height=\"6\" rx=\"3\" opacity=\".3\"/><rect x=\"176\" y=\"286\" width=\"140\" height=\"6\" rx=\"3\" opacity=\".2\"/><rect x=\"164\" y=\"310\" width=\"164\" height=\"7\" rx=\"3.5\" opacity=\".12\"/></g><path class=\"sc-ripple\" d=\"M20 262q30-4 62 0M40 292q40-6 84 2M330 268q36-4 78 2M360 300q30-4 66 0\"/><path class=\"sc-r4\" d=\"M300 360C322 334 366 322 420 326S470 338 480 344V360Z\"/><path class=\"sc-bird\" d=\"M96 138q7-6 14 0q7-6 14 0M132 120q6-5 12 0q6-5 12 0\"/>", "<defs><linearGradient id=\"sc3-sky\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" class=\"sc-sky1\"/><stop offset=\".48\" class=\"sc-sky2\"/><stop offset=\".72\" class=\"sc-sky3\"/><stop offset=\"1\" class=\"sc-sky3\"/></linearGradient><radialGradient id=\"sc3-glow\" cx=\"372\" cy=\"126\" r=\"190\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" class=\"sc-glow1\"/><stop offset=\".45\" class=\"sc-glow2\"/><stop offset=\"1\" class=\"sc-glow3\"/></radialGradient><filter id=\"sc3-blur\" x=\"-20%\" y=\"-100%\" width=\"140%\" height=\"300%\"><feGaussianBlur stdDeviation=\"9\"/></filter><path id=\"sc3-pine\" d=\"M10 0 16 12 13 12 19 24 15 24 21 37 0 37 6 24 2 24 8 12 5 12Z\"/></defs><rect width=\"480\" height=\"360\" fill=\"url(#sc3-sky)\"/><rect width=\"480\" height=\"360\" fill=\"url(#sc3-glow)\"/><circle class=\"sc-halo\" cx=\"372\" cy=\"126\" r=\"46\"/><circle class=\"sc-sun\" cx=\"372\" cy=\"126\" r=\"26\"/><g class=\"sc-r1\"><use href=\"#sc3-pine\" transform=\"translate(0 214) scale(.85 0.85)\"/><use href=\"#sc3-pine\" transform=\"translate(18 208) scale(.85 1)\"/><use href=\"#sc3-pine\" transform=\"translate(34 202) scale(.85 0.85)\"/><use href=\"#sc3-pine\" transform=\"translate(52 214) scale(.85 1)\"/><use href=\"#sc3-pine\" transform=\"translate(70 208) scale(.85 0.85)\"/><use href=\"#sc3-pine\" transform=\"translate(86 202) scale(.85 1)\"/><use href=\"#sc3-pine\" transform=\"translate(104 214) scale(.85 0.85)\"/><use href=\"#sc3-pine\" transform=\"translate(120 208) scale(.85 1)\"/><use href=\"#sc3-pine\" transform=\"translate(138 202) scale(.85 0.85)\"/><use href=\"#sc3-pine\" transform=\"translate(156 214) scale(.85 1)\"/><use href=\"#sc3-pine\" transform=\"translate(172 208) scale(.85 0.85)\"/><use href=\"#sc3-pine\" transform=\"translate(190 202) scale(.85 1)\"/><use href=\"#sc3-pine\" transform=\"translate(206 214) scale(.85 0.85)\"/><use href=\"#sc3-pine\" transform=\"translate(224 208) scale(.85 1)\"/><use href=\"#sc3-pine\" transform=\"translate(242 202) scale(.85 0.85)\"/><use href=\"#sc3-pine\" transform=\"translate(258 214) scale(.85 1)\"/><use href=\"#sc3-pine\" transform=\"translate(276 208) scale(.85 0.85)\"/><use href=\"#sc3-pine\" transform=\"translate(294 202) scale(.85 1)\"/><use href=\"#sc3-pine\" transform=\"translate(312 214) scale(.85 0.85)\"/><use href=\"#sc3-pine\" transform=\"translate(328 208) scale(.85 1)\"/><use href=\"#sc3-pine\" transform=\"translate(346 202) scale(.85 0.85)\"/><use href=\"#sc3-pine\" transform=\"translate(364 214) scale(.85 1)\"/><use href=\"#sc3-pine\" transform=\"translate(382 208) scale(.85 0.85)\"/><use href=\"#sc3-pine\" transform=\"translate(400 202) scale(.85 1)\"/><use href=\"#sc3-pine\" transform=\"translate(418 214) scale(.85 0.85)\"/><use href=\"#sc3-pine\" transform=\"translate(436 208) scale(.85 1)\"/><use href=\"#sc3-pine\" transform=\"translate(452 202) scale(.85 0.85)\"/><use href=\"#sc3-pine\" transform=\"translate(470 214) scale(.85 1)\"/><rect y=\"244\" width=\"480\" height=\"116\"/></g><ellipse class=\"sc-mist\" cx=\"240\" cy=\"256\" rx=\"290\" ry=\"14\" filter=\"url(#sc3-blur)\"/><g class=\"sc-r2\"><use href=\"#sc3-pine\" transform=\"translate(-6 226) scale(1.35 1.35)\"/><use href=\"#sc3-pine\" transform=\"translate(22 218) scale(1.35 1.5)\"/><use href=\"#sc3-pine\" transform=\"translate(48 226) scale(1.35 1.6500000000000001)\"/><use href=\"#sc3-pine\" transform=\"translate(76 218) scale(1.35 1.35)\"/><use href=\"#sc3-pine\" transform=\"translate(102 226) scale(1.35 1.5)\"/><use href=\"#sc3-pine\" transform=\"translate(130 218) scale(1.35 1.6500000000000001)\"/><use href=\"#sc3-pine\" transform=\"translate(156 226) scale(1.35 1.35)\"/><use href=\"#sc3-pine\" transform=\"translate(184 218) scale(1.35 1.5)\"/><use href=\"#sc3-pine\" transform=\"translate(210 226) scale(1.35 1.6500000000000001)\"/><use href=\"#sc3-pine\" transform=\"translate(238 218) scale(1.35 1.35)\"/><use href=\"#sc3-pine\" transform=\"translate(264 226) scale(1.35 1.5)\"/><use href=\"#sc3-pine\" transform=\"translate(292 218) scale(1.35 1.6500000000000001)\"/><use href=\"#sc3-pine\" transform=\"translate(318 226) scale(1.35 1.35)\"/><use href=\"#sc3-pine\" transform=\"translate(346 218) scale(1.35 1.5)\"/><use href=\"#sc3-pine\" transform=\"translate(372 226) scale(1.35 1.6500000000000001)\"/><use href=\"#sc3-pine\" transform=\"translate(400 218) scale(1.35 1.35)\"/><use href=\"#sc3-pine\" transform=\"translate(426 226) scale(1.35 1.5)\"/><use href=\"#sc3-pine\" transform=\"translate(454 218) scale(1.35 1.6500000000000001)\"/><rect y=\"276\" width=\"480\" height=\"84\"/></g><ellipse class=\"sc-mist\" cx=\"220\" cy=\"292\" rx=\"260\" ry=\"13\" filter=\"url(#sc3-blur)\"/><g class=\"sc-r4\"><use href=\"#sc3-pine\" transform=\"translate(-14 250) scale(2.1 2.1)\"/><use href=\"#sc3-pine\" transform=\"translate(34 238) scale(2.1 2.3000000000000003)\"/><use href=\"#sc3-pine\" transform=\"translate(82 250) scale(2.1 2.5)\"/><use href=\"#sc3-pine\" transform=\"translate(132 238) scale(2.1 2.1)\"/><use href=\"#sc3-pine\" transform=\"translate(182 250) scale(2.1 2.3000000000000003)\"/><use href=\"#sc3-pine\" transform=\"translate(232 238) scale(2.1 2.5)\"/><use href=\"#sc3-pine\" transform=\"translate(282 250) scale(2.1 2.1)\"/><use href=\"#sc3-pine\" transform=\"translate(332 238) scale(2.1 2.3000000000000003)\"/><use href=\"#sc3-pine\" transform=\"translate(382 250) scale(2.1 2.5)\"/><use href=\"#sc3-pine\" transform=\"translate(432 238) scale(2.1 2.1)\"/><rect y=\"326\" width=\"480\" height=\"34\"/></g><path class=\"sc-bird\" d=\"M60 96q7-6 14 0q7-6 14 0M96 82q6-5 12 0q6-5 12 0M126 104q5-4 10 0q5-4 10 0\"/>"];
const imageOrArt = (src, alt, variant = 0) => src ? `<img class="site-image" src="${e(src)}" alt="${e(alt)}" loading="lazy" decoding="async"/>` : `<div class="art art-${variant % 4}" aria-hidden="true"><svg viewBox="0 0 480 360" preserveAspectRatio="xMidYMid slice" focusable="false" aria-hidden="true">${ART_PLATES[variant % 4]}</svg></div>`;
function destination(href, spec, context) {
  const safe = resolveHref(href, spec, context.site);
  let attributes = `href="${e(safe)}"`;
  if (safe.startsWith('https://')) attributes += ' target="_blank" rel="noopener noreferrer"';
  if (context.preview && href?.startsWith('page:')) {
    const [pageId, sectionId] = href.slice(5).split('#');
    attributes += ` data-page-id="${e(pageId)}"${sectionId ? ` data-target-section="${e(sectionId)}"` : ''}`;
  }
  return attributes;
}
const partAttributes = (partKey, slot, context, item) => context?.preview ? ` data-part-key="${partKey}" data-part-slot="${slot}"${item ? ` data-owner-item-id="${e(item.id)}"` : ''}` : '';
function mediaAttributes(className, owner, context) {
  const { width, height, fit } = imageSizeOf(owner);
  const customized = width !== 100 || height !== null || fit !== 'cover';
  const classes = `${className}${customized ? ' image-sized' : ''}${height !== null ? ' image-height-explicit' : ''}`;
  // Geometry is validated numeric data; user-authored CSS never reaches this attribute.
  const style = `--image-width:${width}%;--image-fit:${fit}${height !== null ? `;--image-height:${height}px` : ''}`;
  return `class="${classes}" style="${style}"${context.preview ? ` data-image-width="${width}" data-image-height="${height ?? 'auto'}" data-image-fit="${fit}"` : ''}`;
}
function contentStack(section, parts) {
  return effectivePartOrder(section).map((key) => parts[key] || '').join('');
}
function itemText(section, item, spec, context, gallery = false) {
  const parts = { heading: isPartVisible(item, 'heading') ? `<h3${partAttributes('heading', 'text', context, item)}>${itemTitle(item, spec, context, gallery)}</h3>` : '', body: isPartVisible(item, 'body') ? `<p${partAttributes('body', 'text', context, item)}>${e(item.body)}</p>` : '' };
  return effectivePartOrder(section, item, 'text').map((key) => parts[key] || '').join('');
}
function contentHeading(section, context, action = '') {
  return `${label(section, context)}${contentStack(section, { heading: isPartVisible(section, 'heading') ? `<h2${partAttributes('heading', 'content', context)}>${e(section.title)}</h2>` : '', body: section.body && isPartVisible(section, 'body') ? `<p class="section-description"${partAttributes('body', 'content', context)}>${e(section.body)}</p>` : '', action })}`;
}
const buttonLabel = (text, section) => section?.elements?.buttonLabel && section.elements.buttonLabel !== 'default' ? BUTTON_LABELS[section.elements.buttonLabel].text : text;
function buttonContent(text, section, context, item) {
  const owner = item || section;
  const labelText = buttonLabel(text, section);
  const iconName = effectiveButtonIcon(section, item);
  const labelMarkup = isPartVisible(owner, 'buttonLabel') ? `<span class="button-label"${partAttributes('buttonLabel', 'button', context, item)}>${e(labelText)}</span>` : '';
  const glyph = iconName === 'none' || !isPartVisible(owner, 'buttonIcon') ? '' : icon(iconName, 16).replace('<svg ', `<svg${section ? partAttributes('buttonIcon', 'button-icon', context, item) : ''} `);
  return effectivePlacement(section || {}, item, 'buttonIconPlacement') === 'leading' ? `${glyph}${labelMarkup}` : `${labelMarkup}${glyph}`;
}
function link(text, href, spec, context, secondary = false, section, item, authoredAction = false) {
  const owner = item || section;
  if (!isPartVisible(owner, 'action')) return '';
  const content = buttonContent(text || spec.brand.cta, section, context, item);
  if (!content) return '';
  const accessibleLabel = !isPartVisible(owner, 'buttonLabel') ? ` aria-label="${e(buttonLabel(text || spec.brand.cta, section) || 'Open link')}"` : '';
  return `<a class="site-button${secondary ? ' secondary' : ''}" ${destination(href || spec.brand.href, spec, context)}${authoredAction ? partAttributes('action', 'content', context, item) : ''}${accessibleLabel}>${content}</a>`;
}
function itemTitle(item, spec, context, gallery = false) {
  return item.href ? `<a class="${gallery ? 'gallery-card-link' : 'item-title-link'}" ${destination(item.href, spec, context)}>${e(item.title || 'Read more')}${icon('arrow', 16)}</a>` : e(item.title);
}
const itemAttributes = (item, index, context) => context.preview ? ` data-item-index="${index}" data-item-id="${e(item.id)}"` : '';
const shown = (section, field, fallback = true) => section.elements[field] === 'show' || (section.elements[field] !== 'hide' && fallback);
function featureIcon(item, index, context) {
  const name = itemIconName(item, index);
  return name === 'none' || !isPartVisible(item, 'icon') ? '' : `<div class="feature-icon"${partAttributes('icon', 'feature-icon', context, item)}>${icon(name, 24)}</div>`;
}
function featuredItemIndex(section) {
  if (section.featuredItemId !== undefined) return section.items.findIndex((item) => item.id === section.featuredItemId);
  if (section.elements.featuredItem === 'default') return section.block === 'pricing-featured' ? 1 : -1;
  return ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'].indexOf(section.elements.featuredItem);
}
function navigationLinks(spec, context) {
  const sections = spec.sections.filter((section) => !['navigation', 'hero', 'footer'].includes(section.group));
  const pages = pageEntries(context.site);
  const pageLinks = pages.length > 1 ? pages.filter((page) => page.showInNav || page.id === HOME_PAGE_ID).map((page) => `<a ${destination(`page:${page.id}`, spec, context)}${page.id === context.pageId ? ' aria-current="page"' : ''}>${e(page.title)}</a>`).join('') : '';
  return `${pageLinks}${sections.map((section) => `<a href="#${e(section.id)}"${context.preview ? ` data-page-id="${e(context.pageId)}" data-target-section="${e(section.id)}"` : ''}>${e(GROUP_LABELS[section.group])}</a>`).join('')}`;
}
function addMenu(spec, context) {
  if (!context.preview) return '';
  const missing = GROUPS.filter((group) => !spec.sections.some((section) => section.group === group));
  const sectionButtons = missing.map((group) => `<button type="button" data-add-section="${e(group)}">${icon('plus', 14)}<span data-editor-i18n="${e(GROUP_LABELS[group])}">${e(GROUP_LABELS[group])}</span></button>`).join('');
  const pagesFull = pageEntries(context.site).length >= MAX_PAGES;
  const pageButtons = Object.entries(PAGE_TEMPLATES).map(([template, details]) => `<button type="button" data-add-page="${e(template)}"${pagesFull ? ' disabled' : ''}>${icon('plus', 14)}<span data-editor-i18n="${e(details.label || details.name || template)}">${e(details.label || details.name || template)}</span></button>`).join('');
  return `<details class="editor-add-menu"><summary aria-label="Add section or page" data-editor-i18n-label="Add section or page" title="Add section or page">${icon('plus', 19)}</summary><div class="editor-add-options"><p data-editor-i18n="Add a section">Add a section</p>${sectionButtons || '<span class="editor-add-empty" data-editor-i18n="All section types are on this page.">All section types are on this page.</span>'}<p data-editor-i18n="Add a page">Add a page</p>${pageButtons}${pagesFull ? `<span class="editor-add-empty" data-editor-i18n="This site has the maximum ${MAX_PAGES} pages.">This site has the maximum ${MAX_PAGES} pages.</span>` : ''}</div></details>`;
}
function sectionBody(s, spec, context) {
  const application = renderInterface(s, spec, context);
  if (application !== null) return application;
  const brand = spec.brand;
  const navlinks = navigationLinks(spec, context);
  if (s.group === 'navigation') {
    const action = link(brand.cta, brand.href, spec, context, false, s, null, true);
    const navigation = isPartVisible(s, 'navigation');
    return `<div class="site-container nav-inner${navigation ? '' : ' without-navigation'}">${isPartVisible(s, 'brand') ? `<a href="#${e(startIdFor(spec))}" class="wordmark"${partAttributes('brand', 'navigation', context)}>${icon('spark', 22)}<span>${e(brand.name)}</span></a>` : ''}${navigation ? `<nav class="desktop-nav" aria-label="Main navigation"${partAttributes('navigation', 'navigation', context)}>${navlinks}</nav>` : ''}<div class="nav-tools">${action ? `<div class="nav-action">${action}</div>` : ''}${addMenu(spec, context)}${navigation ? `<details class="mobile-nav"${partAttributes('navigation', 'navigation', context)}><summary aria-label="Open navigation">${icon('menu', 22)}</summary><nav aria-label="Mobile navigation">${navlinks}${action}</nav></details>` : ''}</div></div>`;
  }
  if (s.group === 'hero') {
    const firstContent = spec.sections.find((x) => !['navigation', 'hero', 'footer', 'contact', 'cta'].includes(x.group));
    const primary = shown(s, 'primaryAction') ? link(s.button || brand.cta, s.href || brand.href, spec, context, false, s, null, true) : '';
    const secondary = firstContent && shown(s, 'secondaryAction') && isPartVisible(s, 'secondaryAction') ? `<a class="text-link" href="#${e(firstContent.id)}"${partAttributes('secondaryAction', 'content', context)}>${e(GROUP_LABELS[firstContent.group])}${icon('arrow', 15)}</a>` : '';
    const decoration = shown(s, 'decoration') && isPartVisible(s, 'decoration') ? `<div class="visual-label"${partAttributes('decoration', 'media', context)}><span class="small-dot"></span>${e(brand.name)}<span>Ideas take shape.</span></div>` : '';
    const copy = `<div class="hero-copy">${label(s, context)}${contentStack(s, { heading: isPartVisible(s, 'heading') ? `<h1${partAttributes('heading', 'content', context)}>${e(s.title)}</h1>` : '', body: isPartVisible(s, 'body') ? `<p class="hero-description"${partAttributes('body', 'content', context)}>${e(s.body)}</p>` : '', action: primary || secondary ? `<div class="hero-actions">${primary}${secondary}</div>` : '' })}${isPartVisible(s, 'footnote') ? `<p class="hero-footnote"${partAttributes('footnote', 'content', context)}>${e(brand.tagline)}</p>` : ''}</div>`;
    const visual = s.block !== 'hero-centered' && isPartVisible(s, 'media') ? `<div ${mediaAttributes('hero-visual', s, context)}${partAttributes('media', 'hero-media', context)}>${imageOrArt(s.image, s.alt, 0)}${decoration}</div>` : '';
    return `<div class="site-container hero-inner${visual ? '' : ' without-media'}">${s.elements.mediaPlacement === 'before' ? `${visual}${copy}` : `${copy}${visual}`}</div>`;
  }
  if (s.group === 'features') return `<div class="site-container">${heading(s, context)}<div class="feature-grid">${s.items.map((it, i) => `<article class="feature-card${itemIconName(it, i) === 'none' || !isPartVisible(it, 'icon') ? ' no-icon' : ''}"${itemAttributes(it, i, context)}${effectivePlacement(s, it, 'iconPlacement') !== 'default' ? ` data-icon-placement="${e(effectivePlacement(s, it, 'iconPlacement'))}"` : ''}>${featureIcon(it, i, context)}<div class="item-text">${itemText(s, it, spec, context)}</div>${s.block === 'features-bento' && i === 0 && shown(s, 'decoration') && isPartVisible(s, 'decoration') && isPartVisible(it, 'decoration') ? `<div class="bento-lines" aria-hidden="true"${partAttributes('decoration', 'item', context, it)}><span></span><span></span><span></span><span></span></div>` : ''}</article>`).join('')}</div></div>`;
  if (s.group === 'about') {
    const visual = s.block === 'about-split' && isPartVisible(s, 'media') ? `<div ${mediaAttributes('about-visual', s, context)}${partAttributes('media', 'about-media', context)}>${imageOrArt(s.image, s.alt, 1)}</div>` : '';
    return `<div class="site-container about-inner${visual ? '' : ' without-media'}">${visual}<div><div class="section-heading authored-content">${contentHeading(s, context, shown(s, 'primaryAction', !!s.button) ? link(s.button, s.href, spec, context, true, s, null, true) : '')}</div></div></div>`;
  }
  if (s.group === 'services') return `<div class="site-container">${heading(s, context)}<div class="service-grid">${s.items.map((it, i) => {
    const number = shown(s, 'numbering') && isPartVisible(it, 'number');
    const trailing = it.price ? isPartVisible(it, 'price') ? `<strong class="service-price"${partAttributes('price', 'item', context, it)}>${e(it.price)}</strong>` : '' : isPartVisible(it, 'icon') ? icon('arrow', 22).replace('<svg ', `<svg${partAttributes('icon', 'item', context, it)} `) : '';
    return `<article class="service-card${number ? '' : ' without-number'}${trailing ? '' : ' without-trailing'}"${itemAttributes(it, i, context)}>${number ? `<span class="index-number"${partAttributes('number', 'item', context, it)}>${String(i + 1).padStart(2, '0')}</span>` : ''}<div class="item-text">${itemText(s, it, spec, context)}</div>${trailing}</article>`;
  }).join('')}</div></div>`;
  if (s.group === 'gallery') return `<div class="site-container">${heading(s, context)}<div class="gallery-grid">${s.items.map((it, i) => `<figure class="gallery-card${it.href && isPartVisible(it, 'heading') ? ' linked' : ''}"${itemAttributes(it, i, context)}>${isPartVisible(it, 'media') ? `<div ${mediaAttributes('gallery-visual', it, context)}${partAttributes('media', 'gallery-media', context, it)}>${imageOrArt(it.image, it.alt, (it.art ?? i) + 1)}</div>` : ''}<figcaption><div class="item-text">${isPartVisible(it, 'meta') ? `<p class="gallery-meta"${partAttributes('meta', 'item', context, it)}>${e(it.meta)}</p>` : ''}${itemText(s, it, spec, context, true)}</div></figcaption></figure>`).join('')}</div></div>`;
  if (s.group === 'process') return `<div class="site-container">${heading(s, context)}<ol class="process-grid">${s.items.map((it, i) => {
    const number = shown(s, 'numbering') && isPartVisible(it, 'number');
    return `<li${number ? '' : ' class="without-number"'}${itemAttributes(it, i, context)}>${number ? `<span class="step-number"${partAttributes('number', 'item', context, it)}>${String(i + 1).padStart(2, '0')}</span>` : ''}<div class="item-text">${itemText(s, it, spec, context)}</div></li>`;
  }).join('')}</ol></div>`;
  if (s.group === 'pricing') {
    const featured = featuredItemIndex(s);
    return `<div class="site-container">${heading(s, context)}<div class="pricing-grid">${s.items.map((it, i) => `<article class="pricing-card${i === featured ? ' featured' : ''}"${itemAttributes(it, i, context)}><div class="pricing-top">${isPartVisible(it, 'heading') ? `<h3${partAttributes('heading', 'item', context, it)}>${itemTitle(it, spec, context)}<span class="sr-only"> plan</span></h3>` : ''}${isPartVisible(it, 'price') ? `<div class="price"${partAttributes('price', 'item', context, it)}>${e(it.price || 'Contact us')}</div>` : ''}${isPartVisible(it, 'meta') ? `<p class="price-period"${partAttributes('meta', 'item', context, it)}>${e(it.meta)}</p>` : ''}${link(s.button || 'Discuss this option', s.href, spec, context, i !== featured, s, it, true)}</div>${isPartVisible(it, 'body') ? `<ul${partAttributes('body', 'item', context, it)}>${it.body.split('\n').filter(Boolean).map((line) => `<li>${icon('check', 16)}<span>${e(line)}</span></li>`).join('')}</ul>` : ''}</article>`).join('')}</div></div>`;
  }
  if (s.group === 'faq') {
    const introduction = heading(s, context);
    return `<div class="site-container faq-inner${introduction ? '' : ' without-introduction'}">${introduction}<div class="faq-list">${s.items.map((it, i) => {
      const body = isPartVisible(it, 'body') ? `<p${partAttributes('body', 'item', context, it)}>${e(it.body)}</p>` : '';
      return isPartVisible(it, 'heading') ? `<details class="faq-item"${itemAttributes(it, i, context)}><summary${partAttributes('heading', 'item', context, it)}><span>${itemTitle(it, spec, context)}</span>${icon('chevron', 20)}</summary>${body}</details>` : `<article class="faq-item"${itemAttributes(it, i, context)}>${body}</article>`;
    }).join('')}</div></div>`;
  }
  if (s.group === 'contact') {
    const simpleHref = s.href || (brand.email ? `mailto:${brand.email}` : brand.href && !brand.href.startsWith('#') ? brand.href : '');
    const invitation = !isPartVisible(s, 'action') ? '' : s.block === 'contact-simple'
      ? shown(s, 'primaryAction') ? simpleHref ? link(s.button || brand.cta, simpleHref, spec, context, false, s, null, true) : `<p class="contact-missing"${partAttributes('action', 'content', context)}>Contact details coming soon.</p>` : ''
      : brand.email ? `<a class="contact-email" href="mailto:${e(brand.email)}"${partAttributes('action', 'content', context)}>${e(brand.email)}${icon('arrow', 20)}</a>` : brand.href && !brand.href.startsWith('#') ? link(brand.cta, brand.href, spec, context, false, s, null, true) : `<p class="contact-missing"${partAttributes('action', 'content', context)}>Contact details coming soon.</p>`;
    const hasForm = s.block === 'contact-form' && isPartVisible(s, 'form');
    const submitContent = buttonContent(s.button || 'Prepare email', s, context);
    const submitLabel = !isPartVisible(s, 'buttonLabel') ? ` aria-label="${e(buttonLabel(s.button || 'Prepare email', s))}"` : '';
    const form = hasForm ? `<form class="contact-fields" data-contact-email="${e(brand.email)}"${partAttributes('form', 'form', context)}>${isPartVisible(s, 'nameField') ? `<label${partAttributes('nameField', 'form', context)}>Your name<input name="name" autocomplete="name" maxlength="160" required placeholder="Alex Morgan"/></label>` : ''}${isPartVisible(s, 'emailField') ? `<label${partAttributes('emailField', 'form', context)}>Email address<input name="email" type="email" autocomplete="email" maxlength="254" required placeholder="you@example.com"/></label>` : ''}${isPartVisible(s, 'messageField') ? `<label${partAttributes('messageField', 'form', context)}>What do you have in mind?<textarea name="message" rows="4" maxlength="3000" required placeholder="Tell us a little about it…"></textarea></label>` : ''}${submitContent && isPartVisible(s, 'action') ? `<button class="site-button" type="submit"${!brand.email ? ' disabled' : ''}${partAttributes('action', 'form', context)}${submitLabel}>${submitContent}</button>` : ''}${isPartVisible(s, 'footnote') ? `<p class="form-note"${partAttributes('footnote', 'form', context)}>Opens a draft in your email app. Nothing is submitted to this website.</p>` : ''}<p class="form-feedback" role="status"></p></form>` : '';
    return `<div class="site-container contact-inner${hasForm ? '' : ' without-form'}"><div>${s.block === 'contact-simple' ? `<div class="section-heading authored-content">${contentHeading(s, context, invitation)}</div>` : `${heading(s, context)}${invitation}`}</div>${form}</div>`;
  }
  if (s.group === 'cta') {
    const action = shown(s, 'primaryAction') ? link(s.button, s.href, spec, context, false, s, null, true) : '';
    const parts = { heading: isPartVisible(s, 'heading') ? `<h2${partAttributes('heading', 'content', context)}>${e(s.title)}</h2>` : '', body: isPartVisible(s, 'body') ? `<p${partAttributes('body', 'content', context)}>${e(s.body)}</p>` : '', action };
    const defaultOrder = ['default', 'heading-body-action'].includes(s.elements.contentOrder);
    return `<div class="site-container"><div class="cta-inner${defaultOrder ? '' : ' authored-content-stack'}">${defaultOrder ? `<div>${label(s, context)}${parts.heading}${parts.body}</div>${action}` : `<div class="authored-content">${label(s, context)}${contentStack(s, parts)}</div>`}</div></div>`;
  }
  if (s.group === 'footer') return `<div class="site-container footer-inner"><div>${isPartVisible(s, 'brand') ? `<a class="wordmark" href="#${e(startIdFor(spec))}"${partAttributes('brand', 'footer', context)}>${icon('spark', 22)}${e(brand.name)}</a>` : ''}${isPartVisible(s, 'body') ? `<p${partAttributes('body', 'footer', context)}>${e(s.body)}</p>` : ''}</div>${s.block === 'footer-columns' && isPartVisible(s, 'navigation') ? `<nav aria-label="Footer navigation"${partAttributes('navigation', 'footer', context)}>${navlinks}</nav>` : ''}${isPartVisible(s, 'backToTop') ? `<a class="back-to-top" href="#${e(startIdFor(spec))}"${partAttributes('backToTop', 'footer', context)}>Back to top ${icon('up', 16)}</a>` : ''}</div>`;
  return '';
}
const TYPE_SIZES = {
  quiet: {
    'display-size': 'clamp(38px,4.4vw,60px)', 'centered-display-size': 'clamp(40px,5.6vw,74px)', 'editorial-display-size': 'clamp(42px,5.9vw,80px)', 'heading-size': 'clamp(28px,2.7vw,40px)',
    'tablet-display-size': 'clamp(38px,4.4vw,56px)', 'mobile-display-size': '38px', 'mobile-centered-display-size': '40px', 'mobile-editorial-display-size': '42px', 'mobile-heading-size': '30px'
  },
  balanced: {
    'display-size': 'clamp(44px,5.7vw,76px)', 'centered-display-size': 'clamp(46px,7.4vw,94px)', 'editorial-display-size': 'clamp(50px,7.8vw,102px)', 'heading-size': 'clamp(30px,3.4vw,48px)',
    'tablet-display-size': 'clamp(44px,5.7vw,68px)', 'mobile-display-size': '44px', 'mobile-centered-display-size': '49px', 'mobile-editorial-display-size': '52px', 'mobile-heading-size': '34px'
  },
  dramatic: {
    'display-size': 'clamp(54px,7vw,96px)', 'centered-display-size': 'clamp(56px,9.2vw,118px)', 'editorial-display-size': 'clamp(60px,10vw,128px)', 'heading-size': 'clamp(36px,4.2vw,60px)',
    'tablet-display-size': 'clamp(50px,6.8vw,88px)', 'mobile-display-size': '50px', 'mobile-centered-display-size': '56px', 'mobile-editorial-display-size': '60px', 'mobile-heading-size': '40px'
  }
};
export function themeCss(rawSpec, { pageId = HOME_PAGE_ID } = {}) {
  const spec = validatePageSpec(getPageSpec(rawSpec, pageId));
  const t = THEMES[spec.theme.palette];
  const radius = { sharp: '2px', soft: '16px', round: '30px' }[spec.theme.radius];
  const spacing = { airy: '104px', balanced: '80px', compact: '48px' }[spec.theme.density];
  const width = { focused: '920px', standard: '1120px', wide: '1360px' }[spec.theme.width];
  const typeTokens = Object.entries(TYPE_SIZES[spec.theme.typeScale]).map(([name, value]) => `--${name}:${value}`).join(';');
  // Placeholder scenes: the darkest and lightest palette tones plus two sky tones, so silhouettes stay dark and
  // the sky reads as light in light palettes and as night in dark ones.
  const luminance = (hex) => { const n = parseInt(hex.slice(1), 16); return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255); };
  const [deep, light] = luminance(t.bg) < luminance(t.ink) ? [t.bg, t.ink] : [t.ink, t.bg];
  const skyBase = t.dark ? deep : light;
  const artTokens = `--art-deep:${deep};--art-light:${light};--art-sky-top:color-mix(in srgb,${t.accent} ${t.dark ? 8 : 5}%,${skyBase});--art-sky-mid:color-mix(in srgb,${t.accent} ${t.dark ? 30 : 20}%,${skyBase})`;
  // Each contrast tone swaps a known foreground/background pair, including buttons.
  // Keep these base values independent of the section tokens to avoid CSS cycles.
  const contrastTokens = `--contrast-bg:${t.ink};--contrast-ink:${t.bg};--contrast-surface:color-mix(in srgb,${t.bg} 6%,${t.ink});--contrast-muted:color-mix(in srgb,${t.bg} 82%,${t.ink});--contrast-line:color-mix(in srgb,${t.bg} 24%,${t.ink});--contrast-soft:color-mix(in srgb,${t.bg} 10%,${t.ink});--contrast-accent:${t.bg};--contrast-on-accent:${t.ink};--contrast-scheme:${t.dark ? 'light' : 'dark'}`;
  return `.site{--bg:${t.bg};--surface:${t.surface};--ink:${t.ink};--muted:${t.muted};--line:${t.line};--accent:${t.accent};--on-accent:${t.onAccent};--soft:${t.soft};--radius:${radius};--section-space:${spacing};--content-width:${width};${typeTokens};${contrastTokens};${artTokens};--heading-font:${FONTS[spec.theme.font].value};--button-radius:${spec.theme.radius === 'round' ? '999px' : spec.theme.radius === 'sharp' ? '2px' : '8px'};color-scheme:${t.dark ? 'dark' : 'light'}}`;
}
export function renderBody(rawSpec, { preview = false, pageId = HOME_PAGE_ID } = {}) {
  const site = validateSpec(rawSpec);
  const spec = getPageSpec(site, pageId);
  const context = { site, pageId, preview };
  // NEW: Render one main landmark between the optional header and footer.
  const renderSection = (s) => {
    const tag = s.group === 'navigation' ? 'header' : s.group === 'footer' ? 'footer' : 'section';
    const presentation = presentationFieldsFor(s.group).map((field) => ` data-${field}="${e(s.presentation[field])}"`).join('');
    const elements = elementFieldsFor(s).map((field) => ` data-element-${field.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}="${e(s.elements[field])}"`).join('');
    const application = isInterfaceBlock(s);
    const sectionLabel = application ? INTERFACE_BLOCKS.find((block) => block.id === s.block).name : GROUP_LABELS[s.group];
    return `<${tag} id="${e(s.id)}" class="site-section ${e(s.block)}${application ? ' app-section' : ''}"${presentation}${elements}${preview ? ` data-section="${e(s.id)}" data-section-label="${e(sectionLabel)}"` : ''}>${sectionBody(s, spec, context)}</${tag}>`;
  };
  const navigation = spec.sections.filter((s) => s.group === 'navigation').map(renderSection).join('');
  const content = spec.sections.filter((s) => !['navigation', 'footer'].includes(s.group)).map(renderSection).join('');
  const footer = spec.sections.filter((s) => s.group === 'footer').map(renderSection).join('');
  const emptyState = preview && !spec.sections.length ? `<div class="editor-empty-page"><p data-editor-i18n="This page is empty.">This page is empty.</p><button type="button" data-add-section="hero" data-editor-i18n="Add a section">Add a section</button>${addMenu(spec, context)}</div>` : '';
  return `<div class="site palette-${e(spec.theme.palette)} font-${e(spec.theme.font)} motion-${e(spec.theme.motion)}" data-type-scale="${e(spec.theme.typeScale)}" data-width="${e(spec.theme.width)}"><a class="skip-link" href="#${e(mainIdFor(spec))}">Skip to content</a>${navigation}<main id="${e(mainIdFor(spec))}">${content}${emptyState}</main>${footer}<div class="site-notice" role="status" hidden></div></div>`;
}
export function renderDocument(rawSpec, { css, script, preview = false, channel = '', scriptHash = '', pageId = HOME_PAGE_ID }) {
  const site = validateSpec(rawSpec);
  const spec = getPageSpec(site, pageId);
  const policy = `default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'sha256-${scriptHash}'; base-uri 'none'; form-action 'none'; object-src 'none'; connect-src 'none'; font-src 'none'`;
  return `<!doctype html>\n<html lang="${e(spec.brand.language)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${e(policy)}"><meta name="referrer" content="no-referrer"><title>${e(spec.brand.name)} — ${e(spec.name)}</title><meta name="description" content="${e(spec.brand.tagline)}"><style>${css}\n${themeCss(spec)}</style></head><body${preview ? ` data-preview="true" data-channel="${e(channel)}" data-edit-mode="true"` : ''}>${renderBody(site, { preview, pageId })}<script>${script}</script></body></html>`;
}
