/** Original, dependency-free application UI. Data selects authored markup only. */
import { escapeHtml as e } from './schema.mjs';
import { icon } from './icons.mjs';
import { INTERFACE_BLOCKS, isInterfaceBlock, interfaceFieldsFor } from './interfaces.mjs';
import { imageSizeOf } from './media.mjs';
import { isPartVisible } from './parts.mjs';

const fieldTypes = new Set(['text', 'email', 'password', 'textarea', 'select', 'checkbox', 'number', 'date']);
const markers = (item, index, context) => context.preview ? ` data-item-id="${e(item.id)}" data-item-index="${index}"` : '';
const shown = (section, field, fallback = true) => isPartVisible(section, field) && interfaceFieldsFor(section).includes(field) && (section.interface?.[field] === 'show' || (section.interface?.[field] !== 'hide' && fallback));
const partMarkers = (owner, key, context = {}, item = false) => context.preview ? ` data-part-key="${key}"${item ? ` data-owner-item-id="${e(owner.id)}"` : ''}` : '';
const part = (owner, key, html) => isPartVisible(owner, key) ? html : '';
const value = (owner, key, text) => isPartVisible(owner, key) ? text : '';
const textPart = (owner, key, tag, text, context, attributes = '', item = false) => part(owner, key, `<${tag}${attributes}${partMarkers(owner, key, context, item)}>${e(text)}</${tag}>`);
const feedback = () => '<p class="ui-feedback" role="status" aria-live="polite"></p>';
const badge = (text) => text ? `<span class="ui-badge">${e(text)}</span>` : '';
const initials = (text) => e(String(text || 'W').trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase());
const itemType = (item, fallback = 'list') => item.uiType && item.uiType !== 'default' ? item.uiType : fallback;

function imageAttributes(className, item, context) {
  const { width, height, fit } = imageSizeOf(item);
  const customized = width !== 100 || height !== null || fit !== 'cover';
  return `class="${className} ui-image-frame${customized ? ' image-sized' : ''}${height !== null ? ' image-height-explicit' : ''}" style="--image-width:${width}%;--image-fit:${fit}${height === null ? '' : `;--image-height:${height}px`}"${context.preview && item.image ? ` data-image-width="${width}" data-image-height="${height ?? 'auto'}" data-image-fit="${fit}" data-part-key="media" data-part-slot="product-media" data-owner-item-id="${e(item.id)}"` : ''}`;
}

function button(section, text, { action = '', type = 'button', secondary = false, attributes = '', owner = section, context = {} } = {}) {
  if (!isPartVisible(owner, 'action')) return '';
  const selectedIcon = section.elements?.buttonIcon;
  const glyph = selectedIcon === 'none' ? '' : part(owner, 'buttonIcon', `<span${partMarkers(owner, 'buttonIcon', context, owner !== section)}>${icon(selectedIcon && selectedIcon !== 'default' ? selectedIcon : 'arrow', 16)}</span>`);
  return `<button type="${type}" class="site-button ui-button${secondary ? ' secondary' : ''}" aria-label="${e(text)}"${action ? ` data-ui-action="${action}"` : ''}${attributes}${partMarkers(owner, 'action', context, owner !== section)}>${textPart(owner, 'buttonLabel', 'span', text, context, ' class="button-label"', owner !== section)}${glyph}</button>`;
}
function quietButton(action, title, glyph, attributes = '') {
  return `<button type="button" class="ui-icon-button" data-ui-action="${action}" aria-label="${e(title)}" title="${e(title)}"${attributes}>${icon(glyph, 19)}</button>`;
}
function search(section, placeholder = 'Search this workspace', context = {}) {
  return shown(section, 'search') ? `<label class="ui-search"${partMarkers(section, 'search', context)}>${icon('search', 17)}<span class="sr-only">${e(placeholder)}</span><input type="search" data-ui-search placeholder="${e(placeholder)}" maxlength="200" autocomplete="off"/></label>` : '';
}
function title(section, action = '', context = {}) {
  return `<header class="ui-page-heading"><div>${section.eyebrow ? textPart(section, 'eyebrow', 'p', section.eyebrow, context, ' class="ui-eyebrow"') : ''}${textPart(section, 'heading', 'h1', section.title, context)}${section.body ? textPart(section, 'body', 'p', section.body, context, ' class="ui-description"') : ''}</div>${action}</header>`;
}
function field(section, item, index, context, { required = false, editor = false } = {}) {
  const type = itemType(item, 'text');
  const id = `ui-${section.id}-${item.id}`;
  const name = type === 'password' ? /confirm|repeat/i.test(item.title) ? 'passwordConfirm' : 'password' : type === 'email' ? 'email' : id;
  const common = `id="${e(id)}" name="${e(name)}"${!isPartVisible(item, 'heading') ? ` aria-label="${e(item.title || 'Field')}"` : ''}${required && type !== 'checkbox' ? ' required' : ''}${partMarkers(item, 'control', context, true)}`;
  const wrapper = `class="ui-field${type === 'checkbox' ? ' ui-checkbox' : ''}"${markers(item, index, context)}`;
  if (type === 'checkbox') return `<label ${wrapper}>${part(item, 'control', `<input type="checkbox" ${common}/>`)}<span>${textPart(item, 'heading', 'strong', item.title, context, '', true)}${item.body ? textPart(item, 'body', 'small', item.body, context, '', true) : ''}</span></label>`;
  let control;
  if (type === 'textarea') control = `<textarea ${common} rows="${editor ? '16' : '4'}" maxlength="12000"${editor ? ' data-ui-editor' : ''} placeholder="${e(value(item, 'body', item.body))}"></textarea>`;
  else if (type === 'select') {
    const choices = value(item, 'body', item.body).split(/\n|,/).map((choice) => choice.trim()).filter(Boolean).slice(0, 12);
    control = `<select ${common}>${choices.length ? choices.map((choice) => `<option value="${e(choice)}">${e(choice)}</option>`).join('') : '<option value="">Choose an option</option>'}</select>`;
  } else {
    const inputType = ['email', 'password', 'number', 'date'].includes(type) ? type : 'text';
    const autocomplete = type === 'password' ? section.block === 'app-signup' ? 'new-password' : 'current-password' : type === 'email' ? 'email' : 'off';
    control = `<input ${common} type="${inputType}" autocomplete="${autocomplete}" maxlength="${type === 'password' ? '128' : '500'}"${type === 'password' ? ' minlength="8"' : ''} placeholder="${e(value(item, 'body', item.body))}"/>`;
    if (type === 'password') control = `<div class="ui-password">${control}${quietButton('password', 'Show password', 'eye', ` aria-controls="${e(id)}" aria-pressed="false"`)}</div>`;
  }
  const labelTag = isPartVisible(item, 'control') ? 'label' : 'span';
  return `<div ${wrapper}>${textPart(item, 'heading', labelTag, item.title, context, labelTag === 'label' ? ` for="${e(id)}"` : '', true)}${part(item, 'control', control)}${item.meta ? textPart(item, 'meta', 'small', item.meta, context, '', true) : ''}</div>`;
}
function auth(section, context) {
  const layout = section.interface?.layout === 'default' || !section.interface?.layout ? 'split' : section.interface.layout;
  const fields = section.items.map((item, index) => itemType(item, 'text') === 'action'
    ? `<div${markers(item, index, context)}>${button(section, item.title, { action: 'add-item', secondary: true, owner: item, context })}</div>`
    : field(section, item, index, context, { required: true })).join('');
  return `<div class="interface-screen app-interface ui-auth" data-interface="${section.block.slice(4)}" data-ui-layout="${layout}"><aside class="ui-auth-story"><div class="ui-wordmark">${icon('layers', 25)}${textPart(section, 'eyebrow', 'span', section.eyebrow || 'Your workspace', context)}</div><div class="ui-auth-art" aria-hidden="true"><div class="ui-art-ring"></div><div class="ui-art-card"><span></span><span></span><span></span><div>${icon('spark', 46)}</div></div><div class="ui-art-orb"></div></div><p class="ui-auth-caption">A little focus.<br/>A world of possibilities.</p><span class="ui-subtle">Your space to make things happen.</span></aside><div class="ui-auth-main"><div class="ui-auth-card">${title(section, '', context)}${part(section, 'form', `<form data-ui-form="auth" class="ui-form"${partMarkers(section, 'form', context)}>${fields}${button(section, section.button || (section.block === 'app-signup' ? 'Create account' : 'Sign in'), { type: 'submit', context })}${feedback()}</form>`)}</div><p class="ui-auth-footer">${icon('lock', 13)} Your details stay in this browser preview.</p></div></div>`;
}
function shell(section, context, content, { action = '', details = true } = {}) {
  const kind = section.block.slice(4);
  const layout = !section.interface?.layout || section.interface.layout === 'default' ? ['storefront', 'calendar'].includes(kind) ? 'topbar' : 'sidebar' : section.interface.layout;
  const hasNavigation = shown(section, 'navigation');
  const hasTabs = details && shown(section, 'tabs', ['dashboard', 'table', 'settings', 'workspace'].includes(kind));
  const contentId = `ui-${section.id}-content`;
  const summaryId = `ui-${section.id}-summary`;
  const name = value(section, 'eyebrow', section.eyebrow) || INTERFACE_BLOCKS.find((block) => block.id === section.block)?.name || 'Workspace';
  const navigation = hasNavigation ? `<aside class="ui-sidebar"${partMarkers(section, 'navigation', context)}><div class="ui-wordmark">${icon(kind === 'storefront' ? 'diamond' : 'layers', 23)}<span>${e(name)}</span></div><p class="ui-nav-label">Workspace</p><nav aria-label="Application navigation"><a href="#${e(contentId)}" class="ui-nav-link" aria-current="page"${hasTabs ? ' data-ui-tab="main"' : ''}>${icon('grid', 18)}<span>${e(INTERFACE_BLOCKS.find((block) => block.id === section.block)?.name || 'Overview')}</span></a>${hasTabs ? `<button type="button" class="ui-nav-link" data-ui-tab="summary">${icon('chart', 18)}<span>Summary</span></button>` : ''}</nav><div class="ui-sidebar-bottom"><span class="ui-avatar">${initials(name)}</span><div><strong>${e(name)}</strong><small>Personal workspace</small></div></div></aside>` : '';
  const tabs = hasTabs ? `<div class="ui-tabs" role="tablist" aria-label="Workspace views"${partMarkers(section, 'tabs', context)}><button type="button" role="tab" id="${e(contentId)}-tab" aria-selected="true" aria-controls="${e(contentId)}" data-ui-tab="main">Overview</button><button type="button" role="tab" id="${e(summaryId)}-tab" aria-selected="false" aria-controls="${e(summaryId)}" tabindex="-1" data-ui-tab="summary">Summary</button></div>` : '';
  const summary = hasTabs ? `<section id="${e(summaryId)}" class="ui-summary-panel" data-ui-panel="summary" role="tabpanel" aria-labelledby="${e(summaryId)}-tab" hidden><div class="ui-panel"><p class="ui-eyebrow">At a glance</p>${textPart(section, 'heading', 'h2', section.title, context)}${textPart(section, 'body', 'p', section.body, context)}<div class="ui-summary-count"><strong>${section.items.length}</strong><span>workspace items</span></div><ul class="ui-summary-list">${section.items.map((item) => `<li>${textPart(item, 'heading', 'span', item.title, context, '', true)}${part(item, 'meta', badge(item.meta))}</li>`).join('')}</ul></div></section>` : '';
  return `<div class="interface-screen app-interface ui-workspace" data-interface="${kind}" data-ui-layout="${layout}"${hasNavigation ? '' : ' data-ui-navigation="hide"'}>${navigation}<div class="ui-workspace-main"><div class="ui-topbar">${hasNavigation ? quietButton('toggle-nav', 'Toggle navigation', 'menu', ' aria-expanded="false"') : ''}<span class="ui-breadcrumb">${e(name)}<span>/</span>${e(INTERFACE_BLOCKS.find((block) => block.id === section.block)?.name || 'Overview')}</span>${search(section, 'Search this workspace', context)}<span class="ui-avatar ui-avatar-small" aria-label="Workspace profile">${initials(name)}</span></div><div class="ui-workspace-content">${title(section, action, context)}${tabs}<div id="${e(contentId)}" data-ui-panel="main"${hasTabs ? ` role="tabpanel" aria-labelledby="${e(contentId)}-tab"` : ''}>${content}</div>${summary}${feedback()}</div></div></div>`;
}
function chat(section, context) {
  const hasNavigation = shown(section, 'navigation');
  const layout = !section.interface?.layout || section.interface.layout === 'default' ? 'sidebar' : section.interface.layout;
  const threads = section.items.map((item, index) => `<button type="button" class="ui-chat-thread" aria-label="${e(item.title || 'Conversation')}"${itemType(item, 'thread') === 'action' ? ` data-ui-prompt="${e(value(item, 'body', item.body) || value(item, 'heading', item.title))}"` : ` data-ui-action="select-thread" data-ui-chat-id="${e(item.id)}" data-ui-title="${e(value(item, 'heading', item.title))}" data-ui-body="${e(value(item, 'body', item.body))}" data-ui-meta="${e(value(item, 'meta', item.meta))}"`} data-ui-search-item${markers(item, index, context)}>${part(item, 'icon', icon(itemType(item, 'thread') === 'action' ? 'bolt' : 'mail', 16))}<span>${textPart(item, 'heading', 'strong', item.title, context, '', true)}${textPart(item, 'meta', 'small', item.meta, context, '', true)}</span></button>`).join('');
  const suggestions = section.items.slice(0, 4).map((item) => part(item, 'action', `<button type="button" aria-label="${e(item.title || 'Use suggestion')}" data-ui-prompt="${e(value(item, 'body', item.body) || value(item, 'heading', item.title))}"${partMarkers(item, 'action', context, true)}>${part(item, 'heading', textPart(item, 'buttonLabel', 'span', item.title, context, '', true))}${part(item, 'buttonIcon', icon('arrow', 16))}</button>`)).join('');
  const form = part(section, 'form', `<form class="ui-composer" data-ui-form="chat"${partMarkers(section, 'form', context)}><label class="sr-only" for="ui-${e(section.id)}-message">Message</label><textarea id="ui-${e(section.id)}-message" name="message" placeholder="Ask anything…" rows="2" maxlength="4000" required></textarea><div class="ui-composer-actions"><span>${icon('spark', 14)} A space for your next idea</span>${button(section, section.button || 'Send message', { type: 'submit', context })}</div></form>`);
  return `<div class="interface-screen app-interface ui-chat" data-interface="chat" data-ui-layout="${layout}"${hasNavigation ? '' : ' data-ui-navigation="hide"'}>${hasNavigation ? `<aside class="ui-sidebar"${partMarkers(section, 'navigation', context)}><div class="ui-wordmark">${icon('spark', 24)}${textPart(section, 'eyebrow', 'span', section.eyebrow || 'Assistant', context)}</div>${button(section, 'New chat', { action: 'new-chat', secondary: true, context })}${search(section, 'Search conversations', context)}<p class="ui-nav-label">Conversations</p><div class="ui-chat-list" data-ui-chat-list>${threads}</div><div class="ui-sidebar-bottom"><span class="ui-avatar">${icon('users', 17)}</span><div><strong>Your workspace</strong><small>Ideas start here</small></div></div></aside>` : ''}<div class="ui-chat-main"><header class="ui-chat-topbar">${hasNavigation ? quietButton('toggle-nav', 'Toggle navigation', 'menu', ' aria-expanded="false"') : ''}${textPart(section, 'eyebrow', 'span', section.eyebrow || 'Assistant', context, ' data-ui-chat-title')}${quietButton('new-chat', 'Start a new chat', 'plus')}${quietButton('reset-chat', 'Clear this chat', 'trash')}</header><div class="ui-chat-scroll"><div class="ui-chat-welcome" data-ui-chat-welcome><span class="ui-chat-emblem">${icon('spark', 32)}</span>${textPart(section, 'heading', 'h1', section.title, context)}${textPart(section, 'body', 'p', section.body, context)}<div class="ui-suggestions" data-ui-suggestions>${suggestions}</div></div><div class="ui-transcript" data-ui-transcript role="log" aria-live="polite" aria-label="Conversation"></div></div><div class="ui-composer-wrap">${form}${feedback()}</div></div></div>`;
}
function stat(section, item, index, context) {
  return `<article class="ui-stat" data-ui-search-item${markers(item, index, context)}>${textPart(item, 'heading', 'p', item.title, context, '', true)}${textPart(item, 'price', 'strong', item.price || '—', context, '', true)}<div>${part(item, 'meta', badge(item.meta))}${textPart(item, 'body', 'span', item.body, context, '', true)}</div></article>`;
}
function chart(section, item, index, context) {
  return `<article class="ui-panel ui-chart-panel" data-ui-search-item${markers(item, index, context)}><div class="ui-panel-heading">${textPart(item, 'heading', 'h2', item.title, context, '', true)}${part(item, 'meta', badge(item.meta))}</div>${textPart(item, 'body', 'p', item.body, context, '', true)}${part(item, 'media', `<figure class="ui-chart"${partMarkers(item, 'media', context, true)}><div class="ui-chart-bars" aria-hidden="true">${[35, 52, 42, 72, 57, 85, 68, 96, 77, 91, 65, 82].map((height) => `<span style="--bar-height:${height}%"></span>`).join('')}</div><figcaption>Illustrative chart · replace with your data</figcaption></figure>`)}</article>`;
}
function listItem(section, item, index, context) {
  return `<article class="ui-list-item" data-ui-search-item${markers(item, index, context)}>${part(item, 'icon', `<span class="ui-list-icon"${partMarkers(item, 'icon', context, true)}>${icon(itemType(item) === 'event' ? 'clock' : 'folder', 19)}</span>`)}<div>${textPart(item, 'heading', 'h3', item.title, context, '', true)}${textPart(item, 'body', 'p', item.body, context, '', true)}</div><div class="ui-list-meta">${part(item, 'meta', badge(item.meta))}${item.price ? textPart(item, 'price', 'small', item.price, context, '', true) : ''}</div></article>`;
}
function table(section, items, context) {
  return `<div class="ui-panel ui-table-panel"><div class="ui-table-scroll"><table class="ui-table"><thead><tr>${[['title', 'Name'], ['body', 'Details'], ['meta', 'Status'], ['price', 'Value']].map(([key, text]) => `<th scope="col"><button type="button" data-ui-sort="${key}">${text}${icon('chevron', 13)}</button></th>`).join('')}</tr></thead><tbody>${items.map((item) => `<tr data-ui-row data-ui-search-item data-ui-title="${e(value(item, 'heading', item.title))}" data-ui-body="${e(value(item, 'body', item.body))}" data-ui-meta="${e(value(item, 'meta', item.meta))}" data-ui-price="${e(value(item, 'price', item.price))}"${markers(item, section.items.indexOf(item), context)}><th scope="row"><span class="ui-table-name">${part(item, 'icon', icon('folder', 18))}${textPart(item, 'heading', 'span', item.title, context, '', true)}</span></th><td>${textPart(item, 'body', 'span', item.body, context, '', true)}</td><td>${part(item, 'meta', badge(item.meta))}</td><td>${textPart(item, 'price', 'span', item.price || '—', context, '', true)}</td></tr>`).join('')}</tbody></table></div><div class="ui-table-footer"><span>${items.length} records</span><span>All records shown</span></div></div>`;
}
function taskStatus(item) {
  return /done|complete|finished/i.test(item.meta) ? 'Done' : /progress|doing|review/i.test(item.meta) ? 'In progress' : 'To do';
}
function task(section, item, index, context) {
  return `<article class="ui-task" data-ui-task data-ui-search-item${markers(item, index, context)}>${part(item, 'meta', badge(item.meta || 'Task'))}${textPart(item, 'heading', 'h3', item.title, context, '', true)}${textPart(item, 'body', 'p', item.body, context, '', true)}<div class="ui-task-footer">${part(item, 'icon', `<span class="ui-avatar ui-avatar-small"${partMarkers(item, 'icon', context, true)}>${initials(item.title)}</span>`)}${part(item, 'control', `<label${partMarkers(item, 'control', context, true)}><span class="sr-only">Status for ${e(item.title)}</span><select data-ui-task-status>${['To do', 'In progress', 'Done'].map((status) => `<option${taskStatus(item) === status ? ' selected' : ''}>${status}</option>`).join('')}</select></label>`)}</div></article>`;
}
function metrics(section, context, items = section.items) {
  if (!items.length || !shown(section, 'metrics', ['app-dashboard', 'app-workspace'].includes(section.block))) return '';
  const stats = items.filter((item) => itemType(item) === 'stat');
  return stats.length ? `<div class="ui-stats"${partMarkers(section, 'metrics', context)}>${stats.map((item) => stat(section, item, section.items.indexOf(item), context)).join('')}</div>` : `<div class="ui-stats ui-derived-stats"${partMarkers(section, 'metrics', context)}><article class="ui-stat"><p>Total items</p><strong>${items.length}</strong><span>In this workspace</span></article><article class="ui-stat"><p>Categories</p><strong>${new Set(items.map((item) => item.meta).filter(Boolean)).size}</strong><span>From your item labels</span></article></div>`;
}
function dashboard(section, context) {
  const items = section.items.filter((item) => itemType(item) !== 'stat');
  const content = items.map((item) => module(section, item, section.items.indexOf(item), context)).join('');
  return shell(section, context, `${metrics(section, context)}<div class="ui-modules">${content}</div>`, { action: button(section, section.button || 'New project', { action: 'add-item', context }) });
}
function board(section, context) {
  const content = ['To do', 'In progress', 'Done'].map((status) => `<section class="ui-board-column" data-ui-column="${status}"><h2><span class="ui-status-dot"></span>${status}<span class="ui-column-count" data-ui-column-count>${section.items.filter((item) => taskStatus(item) === status).length}</span></h2><div class="ui-task-list" data-ui-task-list>${section.items.filter((item) => taskStatus(item) === status).map((item) => task(section, item, section.items.indexOf(item), context)).join('')}</div></section>`).join('');
  return shell(section, context, `${metrics(section, context)}<div class="ui-board">${content}</div>`, { action: button(section, section.button || 'Add task', { action: 'add-item', context }) });
}
function settings(section, context) {
  return shell(section, context, part(section, 'form', `<form class="ui-settings-form ui-panel" data-ui-form="settings"${partMarkers(section, 'form', context)}><div class="ui-profile-heading"><span class="ui-avatar ui-profile-avatar">${icon('users', 28)}</span><div><h2>Profile & preferences</h2><p>Keep the details that matter up to date.</p></div></div><div class="ui-form ui-settings-fields">${section.items.map((item, index) => itemType(item, 'text') === 'action' ? `<div${markers(item, index, context)}>${button(section, item.title, { action: 'add-item', secondary: true, owner: item, context })}</div>` : field(section, item, index, context)).join('')}</div><div class="ui-form-footer">${button(section, section.button || 'Save changes', { type: 'submit', context })}${feedback()}</div></form>`));
}
function inbox(section, context) {
  const first = section.items[0];
  const threadData = (item) => `data-ui-title="${e(value(item, 'heading', item.title))}" data-ui-body="${e(value(item, 'body', item.body))}" data-ui-meta="${e(value(item, 'meta', item.meta))}" data-ui-removed-parts="${e((item.removedParts || []).filter((key) => ['heading', 'body', 'meta', 'icon'].includes(key)).join(' '))}"`;
  const list = section.items.map((item, index) => `<button type="button" class="ui-inbox-thread${index === 0 ? ' is-active' : ''}" aria-label="${e(item.title || 'Conversation')}" data-ui-action="select-thread" ${threadData(item)} data-ui-search-item${markers(item, index, context)}>${part(item, 'icon', `<span class="ui-avatar"${partMarkers(item, 'icon', context, true)}>${initials(item.title)}</span>`)}<span>${textPart(item, 'heading', 'strong', item.title, context, '', true)}${textPart(item, 'body', 'small', item.body, context, '', true)}</span>${textPart(item, 'meta', 'time', item.meta, context, '', true)}</button>`).join('');
  const message = first ? `<div class="ui-message-heading">${part(first, 'icon', `<span class="ui-avatar" data-ui-message-icon>${icon('mail', 21)}</span>`)}<div data-ui-message-heading>${textPart(first, 'heading', 'h2', first.title, context, ' data-ui-message-title', true)}${textPart(first, 'meta', 'p', first.meta, context, ' data-ui-message-meta', true)}</div></div>${textPart(first, 'body', 'p', first.body, context, ' class="ui-message-body" data-ui-message-body', true)}` : '<div class="ui-message-heading"><div data-ui-message-heading><h2 data-ui-message-title>Select a conversation</h2><p data-ui-message-meta></p></div></div><p class="ui-message-body" data-ui-message-body>Your selected message will appear here.</p>';
  const reply = part(section, 'form', `<form class="ui-form ui-reply" data-ui-form="generic"${partMarkers(section, 'form', context)}><label for="ui-${e(section.id)}-reply">Your reply</label><textarea id="ui-${e(section.id)}-reply" name="reply" rows="4" maxlength="4000" placeholder="Write a thoughtful reply…" required></textarea>${button(section, 'Prepare reply', { type: 'submit', context })}${feedback()}</form>`);
  return shell(section, context, `<div class="ui-inbox ui-panel"><div class="ui-inbox-list">${list || '<p class="ui-empty">Your inbox is empty.</p>'}</div><article class="ui-message">${message}${reply}</article></div>`, { action: button(section, section.button || 'Compose message', { action: 'add-item', context }) });
}
function calendar(section, context) {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const offset = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells = Array.from({ length: Math.ceil((offset + days) / 7) * 7 }, (_, index) => index - offset + 1);
  const content = `<div class="ui-calendar-layout"><div class="ui-panel ui-calendar"><div class="ui-panel-heading"><h2 data-ui-calendar-label>${e(now.toLocaleString('en', { month: 'long', year: 'numeric', timeZone: 'UTC' }))}</h2><div class="ui-calendar-arrows">${quietButton('previous-month', 'Previous month', 'arrow')}${quietButton('next-month', 'Next month', 'arrow')}</div></div><div class="ui-calendar-week">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => `<span>${day}</span>`).join('')}</div><div class="ui-calendar-grid" data-ui-calendar-grid data-ui-year="${year}" data-ui-month="${month + 1}">${cells.map((day) => day > 0 && day <= days ? `<button type="button" data-ui-day="${day}"${day === now.getUTCDate() ? ' aria-current="date"' : ''}>${day}</button>` : '<span></span>').join('')}</div></div><aside class="ui-panel ui-agenda"><div class="ui-panel-heading"><h2>Upcoming</h2>${icon('clock', 18)}</div>${section.items.map((item, index) => listItem(section, item, index, context)).join('')}</aside></div>`;
  return shell(section, context, content, { action: button(section, section.button || 'Add event', { action: 'add-item', context }) });
}
function product(section, item, index, context) {
  return `<article class="ui-product" data-ui-search-item${markers(item, index, context)}>${part(item, 'media', `<div ${imageAttributes('ui-product-visual', item, context)}>${item.image ? `<img src="${e(item.image)}" alt="${e(item.alt)}" loading="lazy" decoding="async"/>` : `<div class="ui-product-art ui-product-art-${index % 3}" aria-hidden="true"><span></span></div>`}${part(item, 'meta', badge(item.meta))}</div>`)}<div class="ui-product-content">${textPart(item, 'heading', 'h2', item.title, context, '', true)}${textPart(item, 'body', 'p', item.body, context, '', true)}<div>${textPart(item, 'price', 'strong', item.price || 'Price on request', context, '', true)}${part(item, 'action', `<button type="button" class="ui-icon-button" data-ui-action="add-cart" aria-label="Add ${e(item.title)} to cart" data-ui-product="${e(item.id)}" data-ui-name="${e(item.title)}" data-ui-price="${e(item.price)}"${partMarkers(item, 'action', context, true)}>${part(item, 'buttonIcon', `<span${partMarkers(item, 'buttonIcon', context, true)}>${icon('plus', 19)}</span>`)}</button>`)}</div></div></article>`;
}
function storefront(section, context) {
  const cart = `<div class="ui-cart-summary">${icon('briefcase', 17)}<span>Cart <strong data-ui-cart-count>0</strong></span><span data-ui-cart-total></span>${button(section, section.button || 'View cart', { action: 'checkout', secondary: true, context })}</div>`;
  return shell(section, context, `${cart}<div class="ui-products">${section.items.map((item, index) => product(section, item, index, context)).join('')}</div>`);
}
function checkout(section, context) {
  const products = section.items.filter((item) => itemType(item, 'text') === 'product');
  const fields = section.items.filter((item) => itemType(item, 'text') !== 'product');
  const inputs = fields.map((item) => itemType(item, 'text') === 'action'
    ? `<div${markers(item, section.items.indexOf(item), context)}>${button(section, item.title, { action: 'add-item', secondary: true, owner: item, context })}</div>`
    : field(section, item, section.items.indexOf(item), context, { required: true })).join('');
  const order = products.map((item) => `<article class="ui-order-item"${markers(item, section.items.indexOf(item), context)}>${part(item, 'media', `<div class="ui-order-media"><div ${imageAttributes('ui-order-thumbnail', item, context)}>${item.image ? `<img src="${e(item.image)}" alt="${e(item.alt)}" loading="lazy" decoding="async"/>` : icon('diamond', 25)}</div></div>`)}<div>${textPart(item, 'heading', 'h3', item.title, context, '', true)}${textPart(item, 'body', 'p', item.body, context, '', true)}${textPart(item, 'meta', 'small', item.meta, context, '', true)}</div>${textPart(item, 'price', 'strong', item.price, context, '', true)}</article>`).join('');
  const form = part(section, 'form', `<form class="ui-panel ui-form" data-ui-form="checkout"${partMarkers(section, 'form', context)}><div class="ui-panel-heading"><h2>Contact & delivery</h2>${icon('lock', 18)}</div>${inputs}${button(section, section.button || 'Review order', { type: 'submit', context })}${feedback()}</form>`);
  const content = `<div class="ui-checkout">${form}<aside class="ui-panel ui-order"><div class="ui-panel-heading"><h2>Order summary</h2>${icon('briefcase', 18)}</div>${order || '<p class="ui-empty">Add an item to review your order.</p>'}<div class="ui-order-note">${icon('shield', 19)}<span>Review all your details before continuing.</span></div></aside></div>`;
  return shell(section, context, content, { details: false });
}
function editor(section, context) {
  const form = part(section, 'form', `<form class="ui-panel ui-editor-sheet ui-form" data-ui-form="generic"${partMarkers(section, 'form', context)}>${section.items.map((item, index) => ['text', 'textarea', 'default'].includes(item.uiType || 'default') ? field(section, item, index, context, { editor: item.uiType === 'textarea' }) : module(section, item, index, context)).join('')}${feedback()}</form>`);
  const content = `<div class="ui-editor-layout">${form}<aside class="ui-panel ui-document-preview"><div class="ui-panel-heading"><h2>Document preview</h2>${quietButton('preview-document', 'Refresh document preview', 'eye')}</div><div data-ui-document-preview>Start writing to preview your document.</div><p class="ui-subtle">Draft changes stay in this page until you copy or download them.</p></aside></div>`;
  return shell(section, context, content, { action: button(section, section.button || 'Save draft', { action: 'save-editor', context }), details: false });
}
function module(section, item, index, context) {
  const type = itemType(item);
  if ((fieldTypes.has(type) || type === 'form') && !isPartVisible(section, 'form')) return '';
  if (type === 'stat') return stat(section, item, index, context);
  if (type === 'chart') return chart(section, item, index, context);
  if (type === 'task') return task(section, item, index, context);
  if (type === 'table') return table(section, [item], context);
  if (type === 'product') return product(section, item, index, context);
  if (fieldTypes.has(type)) return `<div class="ui-panel">${field(section, item, index, context)}</div>`;
  if (type === 'action') return `<article class="ui-panel ui-action-module" data-ui-search-item${markers(item, index, context)}>${part(item, 'icon', `<span class="ui-list-icon"${partMarkers(item, 'icon', context, true)}>${icon('bolt', 21)}</span>`)}${textPart(item, 'heading', 'h2', item.title, context, '', true)}${textPart(item, 'body', 'p', item.body, context, '', true)}${button(section, item.meta || item.title, { action: 'add-item', owner: item, context })}</article>`;
  if (type === 'form') return part(item, 'form', `<form class="ui-panel ui-form" data-ui-form="generic" data-ui-search-item${markers(item, index, context)}${partMarkers(item, 'form', context, true)}>${textPart(item, 'heading', 'h2', item.title, context, '', true)}${textPart(item, 'body', isPartVisible(item, 'control') ? 'label' : 'p', item.body || 'Your response', context, isPartVisible(item, 'control') ? ` for="ui-${e(item.id)}-input"` : '', true)}${part(item, 'control', `<textarea id="ui-${e(item.id)}-input" name="response" rows="4" maxlength="4000" aria-label="${e(item.body || 'Your response')}" required${partMarkers(item, 'control', context, true)}></textarea>`)}${button(section, item.meta || 'Submit', { type: 'submit', owner: item, context })}${feedback()}</form>`);
  return `<div class="ui-panel">${listItem(section, item, index, context)}</div>`;
}

export function renderInterface(section, spec, context) {
  if (!isInterfaceBlock(section)) return null;
  if (['app-login', 'app-signup'].includes(section.block)) return auth(section, context);
  if (section.block === 'app-chat') return chat(section, context);
  if (section.block === 'app-dashboard') return dashboard(section, context);
  if (section.block === 'app-table') return shell(section, context, `${metrics(section, context)}${table(section, section.items, context)}`, { action: button(section, section.button || 'Add record', { action: 'add-item', context }) });
  if (section.block === 'app-board') return board(section, context);
  if (section.block === 'app-settings') return settings(section, context);
  if (section.block === 'app-inbox') return inbox(section, context);
  if (section.block === 'app-calendar') return calendar(section, context);
  if (section.block === 'app-storefront') return storefront(section, context);
  if (section.block === 'app-checkout') return checkout(section, context);
  if (section.block === 'app-editor') return editor(section, context);
  const content = section.items.filter((item) => itemType(item) !== 'stat').map((item) => module(section, item, section.items.indexOf(item), context)).join('');
  return shell(section, context, `${metrics(section, context)}<div class="ui-modules">${content}</div>`, { action: button(section, section.button || 'New item', { action: 'add-item', context }) });
}
