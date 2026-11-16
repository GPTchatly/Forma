/** Pure native renderer for the expanded catalog and bounded reusable elements.
 * The containing renderer supplies escaped authored-part and destination helpers. */
import { escapeHtml as e } from './schema.mjs';
import { EXPANSION_BY_ID } from './expansion.mjs';
import { isPartVisible as visible } from './parts.mjs';
import { icon } from './icons.mjs';
import { MANIFEST_BY_ID } from './blocks.mjs';
import { mediaSideFor } from './elements.mjs';

const control = (action, label, attributes = '') => `<button type="button" class="xp-control" data-xp-action="${action}" ${attributes}>${e(label)}</button>`;
const search = (label = 'Search this collection') => `<label class="xp-search">${e(label)}<input type="search" data-xp-search maxlength="180" placeholder="${e(label)}"></label><p class="xp-empty" data-xp-empty hidden>No matching entries.</p>`;
const status = '<p class="xp-status" role="status" aria-live="polite" data-xp-status></p>';
const navigation = (s, spec, context, h) => `<nav class="xp-navigation" aria-label="Main navigation">${h.navigationLinks(spec, context)}</nav>`;

export function renderExpansion(s, spec, context, h) {
  const entry = EXPANSION_BY_ID[s.block];
  if (!entry) return null;
  const part = (key, item) => h.partAttributes(key, item ? 'item' : 'content', context, item);
  const itemAttrs = (item, index) => `${h.itemAttributes(item, index, context)} data-xp-record data-xp-category="${e(item.meta)}"`;
  const meta = (item) => item.meta && visible(item, 'meta') ? `<span class="xp-meta"${part('meta', item)}>${e(item.meta)}</span>` : '';
  const price = (item) => visible(item, 'price') ? `<strong class="xp-price"${part('price', item)}>${e(item.price)}</strong>` : '';
  const image = (item, index, section = false) => visible(item, 'media') ? `<div ${h.mediaAttributes('xp-image', item, context)}${part('media', section ? undefined : item)}>${h.imageOrArt(item.image, item.alt, index)}</div>` : '';
  const copy = (item) => `<div class="xp-copy">${s.group === 'features' ? h.featureIcon(item, s.items.indexOf(item), context) : meta(item)}${h.itemText(s, item, spec, context)}${s.group === 'features' ? meta(item) : ''}</div>`;
  const card = (item, index, media = false, extra = '') => `<article class="xp-card"${itemAttrs(item, index)}>${media ? image(item, index) : ''}${copy(item)}${extra}</article>`;
  const heading = h.heading(s, context);
  const action = (item) => h.link(item ? item.title : s.button || spec.brand.cta, item ? item.href : s.href, spec, context, false, s, item, true);
  const controls = (label = 'Collection') => `<div class="xp-controls" aria-label="${e(label)}">${control('previous', 'Previous')}${control('next', 'Next')}${status}</div>`;
  const tabButton = (item, index) => {
    const button = control('tab', item.title || `Item ${index + 1}`, `data-xp-index="${index}" aria-controls="xp-${e(s.id)}-panel-${index}"`);
    return entry.behavior === 'thumbnails' ? button.replace('>', `><span class="xp-tab-thumbnail" aria-hidden="true">${h.imageOrArt(item.image, '', index)}</span>`) : button;
  };
  const tabs = (items = s.items, media = true) => `<div class="xp-tabs" data-xp-tabs><div class="xp-tablist" aria-label="${e(s.title || entry.name)}">${items.map(tabButton).join('')}</div>${items.map((item, index) => `<article class="xp-tabpanel" id="xp-${e(s.id)}-panel-${index}" data-xp-panel="${index}"${itemAttrs(item, index)}>${media ? image(item, index) : ''}${copy(item)}${item.price ? price(item) : ''}${item.href ? action(item) : ''}</article>`).join('')}</div>`;
  const disclosures = (items = s.items, media = false) => items.map((item, index) => `<details class="xp-disclosure"${itemAttrs(item, index)}><summary${part('heading', item)}>${visible(item, 'heading') ? e(item.title || 'Details') : 'Details'}</summary>${media ? image(item, index) : ''}${meta(item)}${visible(item, 'body') ? `<p${part('body', item)}>${e(item.body)}</p>` : ''}${item.price ? price(item) : ''}${item.href ? action(item) : ''}</details>`).join('');
  const sectionWizard = (inquiry = false) => '<div class="xp-wizard" data-xp-wizard><ol class="xp-step-index">' + s.items.map((item) => '<li>' + e(item.title) + '</li>').join('') + '</ol>' + s.items.map((item, index) => '<div data-xp-step="' + index + '"' + itemAttrs(item, index) + '>' + copy(item) + (visible(item, 'control') ? '<label' + part('control', item) + '>' + e(item.title) + (inquiry && index === 2 ? '<textarea maxlength="1000" rows="4"></textarea>' : '<input type="' + (inquiry && index === 1 ? 'email' : 'text') + '" maxlength="180">') + '</label>' : '') + '</div>').join('') + '<div class="xp-controls">' + control('step-back', 'Back') + control('step-next', 'Next') + '</div>' + status + '</div>';
  const groups = [...new Set(s.items.map((item) => item.meta).filter(Boolean))];
  const filters = `<div class="xp-controls" aria-label="Categories">${control('filter', 'All', 'data-xp-filter="" aria-pressed="true"')}${groups.map((group) => control('filter', group, `data-xp-filter="${e(group)}" aria-pressed="false"`)).join('')}</div>`;
  const collection = (media = false) => `<div class="xp-collection">${s.items.map((item, index) => card(item, index, media)).join('')}</div>`;
  let body = '';
  // A manifest block renders its own body from this kit; the wrapper below stays shared.
  const manifest = MANIFEST_BY_ID[s.block];
  if (manifest) body = manifest.render({ s, spec, context, h, e, visible, icon, control, search, status, part, itemAttrs, meta, price, image, copy, card, heading, action, controls, tabs, disclosures, filters, groups, collection });
  else if (s.group === 'navigation') {
    const brand = visible(s, 'brand') ? `<a class="xp-brand" href="#${e(h.startIdFor(spec))}"${part('brand')}>${e(spec.brand.name)}</a>` : '';
    const links = visible(s, 'navigation') ? navigation(s, spec, context, h) : '';
    if (entry.behavior === 'mega') body = `${brand}<details class="xp-mega"><summary>Explore</summary>${links}</details>${action()}`;
    else if (entry.behavior === 'fullscreen-menu') body = `${brand}${links ? control('open-menu', 'Open navigation') + `<div class="xp-menu-content" data-xp-menu>${links}</div>` : ''}${action()}`;
    else body = `${brand}${links}${action()}`;
  } else if (s.group === 'hero' && !s.block.startsWith('app-')) {
    const heroCopy = `<div class="xp-hero-copy">${visible(s, 'heading') ? `<h1${part('heading')}>${e(s.title)}</h1>` : ''}${visible(s, 'body') ? `<p${part('body')}>${e(s.body)}</p>` : ''}${action()}</div>`;
    const visual = image(s, 0, true);
    if (entry.behavior === 'poster') body = heroCopy;
    else if (entry.behavior === 'browser') body = `${heroCopy}<div class="xp-browser"><div class="xp-browser-bar" aria-hidden="true"><i></i><i></i><i></i><span>${e(spec.brand.name)}</span></div>${visual}</div>`;
    else if (entry.behavior === 'phone') body = `${heroCopy}<div class="xp-phone"><span class="xp-phone-speaker" aria-hidden="true"></span>${visual}</div>`;
    else if (entry.behavior === 'collage') body = `${heroCopy}<div class="xp-collage">${s.items.map((item, index) => card(item, index, true)).join('') || visual}</div>`;
    else if (entry.behavior === 'tour') body = `${heroCopy}${tabs()}`;
    else body = `${heroCopy}${visual}`;
  } else if (s.block.startsWith('app-')) {
    const appHead = `<header class="xp-app-header">${heading}${action()}</header>`;
    const appNav = `<nav class="xp-app-nav" aria-label="Workspace views">${s.items.map((item, index) => `<a href="#xp-${e(s.id)}-entry-${index}">${e(item.title || `Entry ${index + 1}`)}</a>`).join('')}</nav>`;
    if (entry.behavior === 'command-center') body = `${appHead}${control('command', 'Search commands')}${search('Search shortcuts')}${collection()}${status}`;
    else if (entry.behavior === 'analytics') body = `${appHead}${search('Search records')}${control('sort', 'Sort records A–Z')}<div class="xp-table-wrap"><table><caption>${e(s.title)}</caption><thead><tr><th scope="col">Record</th><th scope="col">Details</th><th scope="col">Value</th></tr></thead><tbody data-xp-sortable>${s.items.map((item, index) => `<tr${itemAttrs(item, index)}><th scope="row"${part('heading', item)}>${visible(item, 'heading') ? e(item.title) : ''}</th><td${part('body', item)}>${visible(item, 'body') ? e(item.body) : ''}</td><td>${price(item)}</td></tr>`).join('')}</tbody></table></div>${status}`;
    else if (entry.behavior === 'files') body = `${appHead}${search('Search documents')}${filters}<div class="xp-file-grid">${s.items.map((item, index) => `<article class="xp-card"${itemAttrs(item, index)}>${icon('layers', 24)}${copy(item)}${control('details', 'Open details')}</article>`).join('')}</div>`;
    else if (entry.behavior === 'notifications') body = `${appHead}${filters}<div class="xp-notifications">${s.items.map((item, index) => `<article class="xp-card"${itemAttrs(item, index)}>${copy(item)}<div class="xp-controls">${control('read', 'Mark as read', 'aria-pressed="false"')}${control('dismiss', 'Dismiss')}</div></article>`).join('')}</div>${status}`;
    else if (entry.behavior === 'activity') body = `${appHead}${search('Search activity')}${filters}<ol class="xp-timeline">${s.items.map((item, index) => `<li id="xp-${e(s.id)}-entry-${index}"${itemAttrs(item, index)}>${copy(item)}</li>`).join('')}</ol>`;
    else if (entry.behavior === 'wizard') body = `${appHead}${sectionWizard()}`;
    else if (entry.behavior === 'project') body = `${appHead}${appNav}<div class="xp-project-layout"><div>${s.items.map((item, index) => `<article class="xp-task" id="xp-${e(s.id)}-entry-${index}"${itemAttrs(item, index)}><label>${visible(item, 'control') ? '<input type="checkbox" data-xp-task>' : ''}<span${part('heading', item)}>${visible(item, 'heading') ? e(item.title) : ''}</span></label>${visible(item, 'body') ? `<p${part('body', item)}>${e(item.body)}</p>` : ''}${meta(item)}</article>`).join('')}</div><aside class="xp-summary">${control('project-progress', 'Show task progress')}${status}</aside></div>`;
    else if (entry.behavior === 'product') body = `${appHead}<div class="xp-product-layout">${tabs()}<aside class="xp-summary"><label>Quantity <input type="number" data-xp-quantity min="1" max="99" value="1"></label>${control('order', 'Review local order')}${status}</aside></div>`;
    else if (entry.behavior === 'billing-account') body = `${appHead}<form class="xp-local-form" data-xp-account>${s.items.map((item, index) => `<label${itemAttrs(item, index)}><span${part('heading', item)}>${visible(item, 'heading') ? e(item.title) : ''}</span>${visible(item, 'body') ? `<small${part('body', item)}>${e(item.body)}</small>` : ''}${visible(item, 'control') ? `<input type="text" maxlength="180" value="${e(item.body)}"${part('control', item)}>` : ''}</label>`).join('')}<label>Plan <select><option>Essential</option><option>Complete</option><option>Custom</option></select></label><button type="submit" class="xp-control">Save in this view</button>${status}</form>`;
    else if (entry.behavior === 'help') body = `${appHead}${search('Search help')}${disclosures()}`;
  } else if (s.group === 'gallery') {
    if (entry.behavior === 'compare') body = `${heading}${compareMarkup(s.items.slice(0, 2).map((item, index) => image(item, index)), s.items.slice(0, 2).map((item) => item.title))}${s.items.map((item, index) => card(item, index, false)).join('')}`;
    else if (entry.behavior === 'thumbnails') body = `${heading}${tabs()}`;
    else if (entry.behavior === 'lightbox') body = `${heading}<div class="xp-collection">${s.items.map((item, index) => `<article class="xp-card"${itemAttrs(item, index)}>${image(item, index)}${copy(item)}${control('lightbox', item.title || 'View image', `data-xp-index="${index}"`)}</article>`).join('')}</div>`;
    else if (entry.behavior === 'filter') body = `${heading}${filters}${collection(true)}${status}`;
    else if (entry.behavior === 'albums') body = `${heading}${(groups.length ? groups : ['Collection']).map((group) => `<details class="xp-album"><summary>${e(group)}</summary><div class="xp-collection">${s.items.filter((item) => !groups.length || item.meta === group).map((item) => card(item, s.items.indexOf(item), true)).join('')}</div></details>`).join('')}`;
    else if (entry.behavior === 'image-accordion') body = `${heading}<div class="xp-image-accordion">${disclosures(s.items, true)}</div>`;
    else body = `${heading}${collection(true)}`;
  } else if (s.group === 'features') {
    if (entry.behavior === 'tabs') body = `${heading}${tabs()}`;
    else if (entry.behavior === 'matrix') body = `${heading}<div class="xp-table-wrap"><table><caption>${e(s.title)}</caption><thead><tr><th scope="col">Feature</th><th scope="col">Details</th><th scope="col">Category</th></tr></thead><tbody>${s.items.map((item, index) => `<tr${itemAttrs(item, index)}><th scope="row"${part('heading', item)}>${visible(item, 'heading') ? e(item.title) : ''}</th><td${part('body', item)}>${visible(item, 'body') ? e(item.body) : ''}</td><td${part('meta', item)}>${visible(item, 'meta') ? e(item.meta) : ''}</td></tr>`).join('')}</tbody></table></div>`;
    else if (entry.behavior === 'expand-grid') body = `${heading}<div class="xp-collection">${disclosures(s.items, true)}</div>`;
    else if (entry.behavior === 'diagram') body = `${heading}<ol class="xp-diagram">${s.items.map((item, index) => `<li${itemAttrs(item, index)}>${copy(item)}</li>`).join('')}</ol>`;
    else body = `${heading}<div class="xp-alternating">${s.items.map((item, index) => card(item, index, true)).join('')}</div>`;
  } else if (s.group === 'about') body = `${heading}<div class="xp-chapters">${s.items.map((item, index) => `<article id="xp-${e(s.id)}-chapter-${index}"${itemAttrs(item, index)}>${copy(item)}</article>`).join('')}</div>`;
  else if (s.group === 'services') body = `${heading}${tabs(s.items, false)}`;
  else if (s.group === 'process') body = `${heading}<ol class="xp-milestones" data-xp-rail>${s.items.map((item, index) => `<li${itemAttrs(item, index)}><span class="xp-sequence" aria-hidden="true">${index + 1}</span>${copy(item)}</li>`).join('')}</ol>${controls('Milestones')}`;
  else if (s.group === 'testimonials') {
    const quote = (item, index) => `<figure class="xp-quote"${itemAttrs(item, index)}>${visible(item, 'body') ? `<blockquote${part('body', item)}>${e(item.body)}</blockquote>` : ''}<figcaption>${visible(item, 'heading') ? `<strong${part('heading', item)}>${e(item.title)}</strong>` : ''}${meta(item)}</figcaption></figure>`;
    body = `${heading}<div class="${entry.behavior === 'quote-slider' ? 'xp-quote-rail' : 'xp-quote-grid'}"${entry.behavior === 'quote-slider' ? ' data-xp-rail' : ''}>${s.items.map(quote).join('')}</div>${entry.behavior === 'quote-slider' ? controls('Quotations') : ''}`;
  } else if (s.group === 'team') body = `${heading}${entry.behavior === 'directory' ? search('Search people') : ''}${collection(true)}`;
  else if (s.group === 'logos') body = `${heading}<div class="xp-logo-rail"${entry.behavior === 'marquee' ? ' data-xp-marquee' : ''}>${s.items.map((item, index) => card(item, index, Boolean(item.image))).join('')}</div>${entry.behavior === 'marquee' ? control('pause', 'Pause movement', 'aria-pressed="false"') : ''}`;
  else if (s.group === 'stats') body = `${heading}<dl class="xp-stats">${s.items.map((item, index) => `<div${itemAttrs(item, index)}><dt${part('heading', item)}>${visible(item, 'heading') ? e(item.title) : ''}</dt><dd>${price(item)}${visible(item, 'body') ? `<p${part('body', item)}>${e(item.body)}</p>` : ''}${meta(item)}</dd></div>`).join('')}</dl>`;
  else if (s.group === 'pricing') {
    const plan = (item, index) => `<article class="xp-plan"${itemAttrs(item, index)}>${copy(item)}${entry.behavior === 'billing' ? visible(item, 'price') ? `<div class="xp-period-prices"${part('price', item)}><strong data-xp-monthly>${e(item.price.split('/')[0].trim())}</strong><strong data-xp-annual>${e((item.price.split('/')[1] || item.price).trim())}</strong></div>` : '' : price(item)}${action(item)}</article>`;
    if (entry.behavior === 'pricing-matrix') body = `${heading}<div class="xp-table-wrap"><table><caption>${e(s.title)}</caption><thead><tr><th scope="col">Plan</th><th scope="col">Includes</th><th scope="col">Price</th><th scope="col">Next step</th></tr></thead><tbody>${s.items.map((item, index) => `<tr${itemAttrs(item, index)}><th scope="row"${part('heading', item)}>${visible(item, 'heading') ? e(item.title) : ''}</th><td${part('body', item)}>${visible(item, 'body') ? e(item.body) : ''}</td><td>${price(item)}</td><td>${action(item)}</td></tr>`).join('')}</tbody></table></div>`;
    else body = `${heading}${entry.behavior === 'billing' ? `<div class="xp-controls">${control('period', 'Monthly', 'data-xp-period="monthly" aria-pressed="true"')}${control('period', 'Annual', 'data-xp-period="annual" aria-pressed="false"')}</div>` : ''}<div class="xp-plans">${s.items.map(plan).join('')}</div>`;
  } else if (s.group === 'contact') {
    if (entry.behavior === 'inquiry') body = `${heading}<div data-xp-inquiry data-xp-email="${e(spec.brand.email)}">${sectionWizard(true)}</div>`;
    else body = `${heading}<div class="xp-contacts">${s.items.map((item, index) => card(item, index, false, item.href ? action(item) : '')).join('')}</div>${action()}`;
  } else if (s.group === 'cta') {
    // `default` keeps the base order of the image-backed invitation: the image first (mediaDefaultFor).
    const ctaCopy = `<div class="xp-cta-copy">${heading}${action()}</div>`;
    body = mediaSideFor(s) === 'after' ? `${ctaCopy}${image(s, 0, true)}` : `${image(s, 0, true)}${ctaCopy}`;
  }
  else if (s.group === 'faq') {
    if (entry.behavior === 'faq-groups') body = `${heading}${(groups.length ? groups : ['Answers']).map((group) => `<div class="xp-faq-group"><h3>${e(group)}</h3>${disclosures(s.items.filter((item) => !groups.length || item.meta === group))}</div>`).join('')}`;
    else if (entry.behavior === 'faq-sidebar') body = `${heading}<div class="xp-faq-layout"><nav aria-label="Question index">${s.items.map((item, index) => `<a href="#xp-${e(s.id)}-answer-${index}">${e(item.title)}</a>`).join('')}</nav><div>${s.items.map((item, index) => `<div id="xp-${e(s.id)}-answer-${index}">${disclosures([item])}</div>`).join('')}</div></div>`;
    else body = `${heading}${search('Search questions')}${disclosures()}`;
  } else if (s.group === 'footer') body = `${visible(s, 'brand') ? `<p class="xp-footer-brand"${part('brand')}>${e(spec.brand.name)}</p>` : ''}${visible(s, 'body') ? `<p${part('body')}>${e(s.body)}</p>` : ''}${entry.behavior === 'contact-footer' && spec.brand.email ? `<a href="mailto:${e(spec.brand.email)}">${e(spec.brand.email)}</a>` : ''}${visible(s, 'navigation') ? navigation(s, spec, context, h) : ''}${visible(s, 'backToTop') ? `<a href="#${e(h.startIdFor(spec))}"${part('backToTop')}>Back to top ${icon('arrow', 16)}</a>` : ''}`;
  return `<div class="site-container xp xp-${e(entry.behavior)}" data-xp-block="${e(entry.behavior)}">${body}${!s.items.length && ['gallery', 'features', 'testimonials', 'team', 'logos', 'stats'].includes(s.group) ? '<p class="xp-empty">Add content items to build this collection.</p>' : ''}</div>`;
}

function wizardMarkup(labels, descriptions = [], inquiry = false) {
  return `<div class="xp-wizard" data-xp-wizard><ol class="xp-step-index">${labels.map((label) => `<li>${e(label)}</li>`).join('')}</ol>${labels.map((label, index) => `<div data-xp-step="${index}"><h3>${e(label)}</h3><p>${e(descriptions[index] || '')}</p><label>${e(label)}${inquiry && index === 2 ? '<textarea maxlength="1000" rows="4"></textarea>' : `<input type="${inquiry && index === 1 ? 'email' : 'text'}" maxlength="180">`}</label></div>`).join('')}<div class="xp-controls">${control('step-back', 'Back')}${control('step-next', 'Next')}</div>${status}</div>`;
}
function compareMarkup(images, labels) {
  return `<div class="xp-compare" data-xp-compare><div class="xp-compare-images">${images.map((markup, index) => `<figure data-xp-compare-side="${index}">${markup}<figcaption>${e(labels[index] || `Image ${index + 1}`)}</figcaption></figure>`).join('')}</div><label>Comparison position <input type="range" min="0" max="100" value="50" data-xp-compare-range><output>50%</output></label></div>`;
}
export function renderWidgets(s, spec, context, h, slot) {
  const widgets = (s.widgets || []).filter((entry) => entry.slot === slot);
  if (!widgets.length) return '';
  return `<div class="site-container xp-widget-slot">${widgets.map((widget) => {
    const options = widget.options;
    const mediaItems = s.items.length ? s.items : [0, 1].map((index) => ({ image: '', alt: '', title: options[index] || 'Prepared image ' + (index + 1) }));
    const target = widget.href ? h.destination(widget.href, spec, context) : '';
    const optionsList = () => options.map((option, index) => `<li data-xp-record data-xp-category="${e(option)}"><span>${e(option)}</span>${target ? `<a ${target}>Open</a>` : control('select-option', 'Select', `data-xp-index="${index}"`)}</li>`).join('');
    const detail = `<p>${e(widget.body)}</p>`;
    let content = '';
    if (['menu', 'split', 'popover', 'collapse'].includes(widget.kind)) content = `${widget.kind === 'split' ? target ? `<a class="site-button" ${target}>${e(widget.label)}</a>` : control('feedback', widget.label) : ''}<details><summary>${e(widget.label)}</summary>${detail}<ul>${optionsList()}</ul></details>`;
    else if (['dialog', 'drawer', 'command'].includes(widget.kind)) content = `${control('open-widget', widget.label)}<div class="xp-widget-content" data-xp-dialog-content>${detail}${widget.kind === 'command' ? search('Search commands') : ''}<ul>${optionsList()}</ul></div>`;
    else if (widget.kind === 'copy') content = `${control('copy', widget.label)}<textarea readonly aria-label="Text to copy" maxlength="1000">${e(widget.body)}</textarea>${status}`;
    else if (widget.kind === 'confirm') content = `${detail}${control('confirm', widget.label, 'aria-pressed="false"')}${status}`;
    else if (['segmented', 'stepper'].includes(widget.kind)) content = `${detail}<div class="xp-controls">${options.map((option, index) => control('segment', option, `data-xp-index="${index}" aria-pressed="${index === 0}"`)).join('')}</div>${status}`;
    else if (widget.kind === 'breadcrumbs') content = `<nav aria-label="${e(widget.label)}"><ol class="xp-breadcrumbs">${options.map((option, index) => `<li>${target && index < options.length - 1 ? `<a ${target}>${e(option)}</a>` : `<span${index === options.length - 1 ? ' aria-current="page"' : ''}>${e(option)}</span>`}</li>`).join('')}</ol></nav>`;
    else if (widget.kind === 'pagination') content = `<ul class="xp-paged">${optionsList()}</ul><div class="xp-controls">${control('page-back', 'Previous page')}${control('page-next', 'Next page')}</div>${status}`;
    else if (widget.kind === 'combobox') content = `${search(widget.label)}<ul class="xp-choices">${optionsList()}</ul>${status}`;
    else if (widget.kind === 'range') content = `<label>${e(widget.label)}<input type="range" min="0" max="100" value="50" data-xp-range><output>50</output></label>${detail}`;
    else if (widget.kind === 'wizard') content = wizardMarkup(options, options.map(() => widget.body));
    else if (widget.kind === 'tags') content = `<label>${e(widget.label)}<input type="text" maxlength="80" data-xp-tag-input placeholder="Add a tag"></label>${control('add-tag', 'Add tag')}<ul class="xp-tags">${options.map((option) => `<li><span>${e(option)}</span>${control('remove-tag', 'Remove tag')}</li>`).join('')}</ul>${status}`;
    else if (widget.kind === 'toast') content = `${control('feedback', widget.label)}${detail}${status}`;
    else if (widget.kind === 'alert') content = `<div role="note" data-xp-record>${detail}${control('dismiss', 'Dismiss notice')}</div>${status}`;
    else if (widget.kind === 'empty') content = `${detail}<ul class="xp-local-items"></ul>${control('add-local', widget.label)}${status}`;
    else if (widget.kind === 'compare') content = compareMarkup(mediaItems.slice(0, 2).map((item, index) => h.imageOrArt(item.image, item.alt, index)), options);
    else if (widget.kind === 'lightbox') content = `${detail}<div class="xp-collection">${mediaItems.map((item, index) => `<article class="xp-card" data-xp-record>${h.imageOrArt(item.image, item.alt, index)}<p>${e(item.title)}</p>${control('lightbox', item.title || 'View image', `data-xp-index="${index}"`)}</article>`).join('')}</div>`;
    else if (widget.kind === 'sort') content = `${search(widget.label)}${control('sort', 'Sort A–Z')}<table><caption>${e(widget.label)}</caption><thead><tr><th scope="col">Entry</th></tr></thead><tbody data-xp-sortable>${options.map((option) => `<tr data-xp-record><td>${e(option)}</td></tr>`).join('')}</tbody></table>${status}`;
    else if (widget.kind === 'filters') content = `<div class="xp-controls">${control('filter', 'All', 'data-xp-filter="" aria-pressed="true"')}${options.map((option) => control('filter', option, `data-xp-filter="${e(option)}" aria-pressed="false"`)).join('')}</div><ul>${optionsList()}</ul>${status}`;
    if (['breadcrumbs','pagination','tags','compare','sort','filters'].includes(widget.kind)) content = detail + content;
    return `<section class="xp xp-widget xp-widget-${e(widget.kind)}" id="xp-widget-${e(s.id)}-${e(widget.id)}" data-xp-widget="${e(widget.kind)}" data-xp-label="${e(widget.label)}" aria-label="${e(widget.label)}"><h3>${e(widget.label)}</h3>${content}</section>`;
  }).join('')}</div>`;
}
