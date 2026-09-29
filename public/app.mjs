/** NEW: Dependency-free local website studio. Model decisions are inspectable;
 * all rendering, persistence, editing and export remain ordinary application code. */
import { CATALOG, THEMES, FONTS, DENSITIES, RADII, GROUPS, GROUP_LABELS, PRESETS, getBlock, blocksFor } from '/shared/catalog.mjs';
import { createSpec, newItemId } from '/shared/content.mjs';
import { applyMove, moveOptions, libraryOptions, removeItem, setPartRemoved } from '/shared/structure.mjs';
import { renderMoveControls, installStructureControls } from '/structure-controls.mjs';
import { installLibraryDrag } from '/library-drag.mjs';
import { t, formatNumber, formatDate, translateStatic, setLocale, getLocale, previewMessages } from '/i18n.mjs';
import { validateSpec, validateImageSize, escapeHtml as e } from '/shared/schema.mjs';
import { IMAGE_SIZE_LIMITS, imageOwner, imageSizeOf, supportsProductImage } from '/shared/media.mjs';
import { inspectRaster, inspectRasterDataUrl, RASTER_LIMITS } from '/shared/raster.mjs';
import { icon, CONTENT_ICONS, itemIconName } from '/shared/icons.mjs';
import { ELEMENT_CONTROLS, DEFAULT_ELEMENTS, ITEM_ORDINALS, elementFieldsFor, elementOptionsFor } from '/shared/elements.mjs';
import { PART_LABELS, partsFor, isPartVisible } from '/shared/parts.mjs';
import { BUTTON_ICONS } from '/shared/ui-catalog.mjs';
import { TYPE_SCALES, CONTENT_WIDTHS, PRESENTATION, PRESENTATION_LABELS, presentationFieldsFor, DIRECTIONS, JOURNEYS } from '/shared/design.mjs';
import { HOME_PAGE_ID, MAX_PAGES, PAGE_TEMPLATES, pageEntries, getPageSpec, replacePageSpec, createPage, removePage, removeSection } from '/shared/pages.mjs';
import { INTERFACE_CONTROLS, interfaceFieldsFor, interfaceItemTypesFor, isInterfaceBlock } from '/shared/interfaces.mjs';
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const clone = (value) => structuredClone(value);
const defaultLocks = () => ({ palette: false, font: false, radius: false, density: false, motion: false, typeScale: false, width: false });
const OPERATION_LABELS = { create: 'New design', edit: 'Refine current design', redesign: 'Redesign current site' };
const OPERATION_GUIDANCE = {
  create: 'Start from a blank canvas in a new project. Previous copy, images, layouts and locks are not reused. Your current project stays saved.',
  edit: 'Change layouts, image sizes, element positions, application controls or exact wording. Select a section or item to give your request context. Locks protect what matters.',
  redesign: 'Rethink the unlocked layout, section order and visual presentation. Keep existing copy, images and locked choices; your previous version is saved.'
};
const PRESENTATION_OPTIONS = {
  tone: { default: 'Component default', soft: 'Soft tint', contrast: 'Strong contrast' },
  spacing: { default: 'Page default', compact: 'Compact', generous: 'Generous' },
  heading: { default: 'Component default', start: 'Left aligned', center: 'Centered' },
  surface: { default: 'Component default', plain: 'Plain', outlined: 'Outlined', filled: 'Filled' },
  media: { default: 'Component default', landscape: 'Landscape', square: 'Square', portrait: 'Portrait' }
};
function sectionPresentationFields(section) {
  if (isInterfaceBlock(section)) return [];
  return presentationFieldsFor(section.group).filter((key) => key !== 'media' || !['hero-centered', 'about-statement'].includes(section.block));
}
function sectionLabel(section) { return isInterfaceBlock(section) ? getBlock(section.block).name : GROUP_LABELS[section.group]; }
const state = {
  site: validateSpec(createSpec()), activePageId: HOME_PAGE_ID, project: null, status: null, token: '', hostedClient: null,
  mode: 'jev', operation: 'create', inspectorTab: 'design', leftTab: 'brief',
  device: 'desktop', selected: 'hero', selectedItemId: null, selectedPart: null, inspect: true, busy: false,
  locks: defaultLocks(), pageLocks: new Map(),
  undo: [], redo: [], report: null, warnings: [], history: [], source: '',
  dirty: false, change: 0, saving: null, saveTimer: null, previewTimer: null,
  previewController: null, renderNumber: 0, channel: '', controller: null,
  lastEditKey: '', lastEditAt: 0, checkpointLabel: '', activities: [], pendingScroll: false,
  pageDialogId: null, pageSlugEdited: false,
  displayed: null, gesture: null, usedSessions: new Set(), pendingFocus: false, pendingPreviewScroll: null, pendingAnnouncement: '',
  projectsResult: null, pastProjects: [], pastProjectsSkipped: 0, pastProjectsLoaded: false, connectionFeedback: null
};
Object.defineProperty(state, 'spec', { get: () => getPageSpec(state.site, state.activePageId) });
// Ordinals are presentation/provider context only. The saved identity resolves
// the index immediately before an inspector or model request uses it.
Object.defineProperty(state, 'selectedItemIndex', {
  get: () => { const index = state.spec.sections.find((s) => s.id === state.selected)?.items.findIndex((item) => item.id === state.selectedItemId); return index >= 0 ? index : null; },
  set: (index) => { state.selectedItemId = index === null ? null : state.spec.sections.find((s) => s.id === state.selected)?.items[index]?.id || null; }
});
const GRIP_SVG = '<svg width="12" height="16" viewBox="0 0 12 16" aria-hidden="true"><g fill="currentColor"><circle cx="3" cy="3" r="1.4"/><circle cx="9" cy="3" r="1.4"/><circle cx="3" cy="8" r="1.4"/><circle cx="9" cy="8" r="1.4"/><circle cx="3" cy="13" r="1.4"/><circle cx="9" cy="13" r="1.4"/></g></svg>';
function hydrateIcons(root = document) { root.querySelectorAll('[data-icon]').forEach((node) => { node.innerHTML = icon(node.dataset.icon); }); }
// Pointer-lit foil: the New project seal tilts its light toward the cursor via --fx/--fy in -1..1. No state, no network.
(() => { const seal = document.getElementById('new-button'); if (!seal) return; seal.addEventListener('pointermove', (event) => { const rect = seal.getBoundingClientRect(); if (!rect.width || !rect.height) return; seal.style.setProperty('--fx', ((event.clientX - rect.left) / rect.width * 2 - 1).toFixed(3)); seal.style.setProperty('--fy', ((event.clientY - rect.top) / rect.height * 2 - 1).toFixed(3)); }); seal.addEventListener('pointerleave', () => { seal.style.removeProperty('--fx'); seal.style.removeProperty('--fy'); }); })();
function toast(message, kind = '') {
  const node = document.createElement('div'); node.className = `toast ${kind}`; node.textContent = t(message);
  $('#toasts').append(node); window.setTimeout(() => node.remove(), kind === 'error' ? 9000 : 4500);
}
async function api(endpoint, { method = 'GET', data, signal, blob = false } = {}) {
  if (state.hostedClient) {
    try { return await state.hostedClient.request(endpoint, { method, data, signal }); }
    catch (error) {
      // An aborted or unreadable response may still have spent free calls. A
      // status read refreshes accounting without retrying any provider work.
      if (endpoint === '/api/compose' && data?.mode === 'jev' && !error.freeAllowance) await refreshStatus().catch(() => {});
      throw error;
    }
    finally { state.status = state.hostedClient.status(); updateConnection(); }
  }
  const response = await fetch(endpoint, { method, signal, headers: { 'X-Forma-Token': state.token, ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}) }, ...(data !== undefined ? { body: JSON.stringify(data) } : {}) });
  if (!response.ok) { let message = t('Request failed ({status}).', { status: response.status }); try { message = (await response.json()).error || message; } catch { /* Safe generic message retained. */ } const error = new Error(message); error.status = response.status; throw error; }
  return blob ? response.blob() : response.json();
}
async function refreshStatus() {
  const response = await fetch('/api/status', { cache: 'no-store', credentials: 'same-origin', redirect: 'error' });
  if (!response.ok) throw new Error(state.hostedClient || location.protocol === 'https:' ? t('Request failed ({status}).', { status: response.status }) : t("Could not connect to the local server."));
  const bootstrap = await response.json();
  if (bootstrap.deployment === 'hosted') {
    if (!state.hostedClient) { const { createHostedClient } = await import('./hosted-client.mjs'); state.hostedClient = createHostedClient(); }
    state.status = state.hostedClient.setBootstrap(bootstrap); state.token = '';
    document.documentElement.dataset.deployment = 'hosted';
    applyHostedCopy();
  } else {
    if (state.hostedClient) throw new Error('The deployment changed. Reload this page before continuing.');
    state.status = bootstrap; state.token = state.status.token;
  }
  updateConnection();
}
function applyHostedCopy() {
  for (const node of $$('[data-i18n-hosted], [data-i18n-hosted-content]')) {
    const content = node.hasAttribute('data-i18n-hosted-content');
    node.setAttribute(content ? 'data-i18n-content' : 'data-i18n', node.getAttribute(content ? 'data-i18n-hosted-content' : 'data-i18n-hosted'));
    translateStatic(node);
  }
}
function updateConnection() {
  const verified = state.status?.verified;
  const personalKey = state.hostedClient ? state.status?.personalKeyConfigured : state.status?.configured;
  $('#settings-button').classList.toggle('verified', Boolean(verified));
  $('#connection-label').textContent = t(verified ? 'JEV connected' : personalKey ? 'JEV key set' : 'Connect JEV');
  const typedKey = $('#api-key').value.trim();
  $('#model-label').textContent = /^sk-or-/i.test(typedKey) ? '~typesafe/jev-latest' : (state.status?.model || 'jev-1.13.0');
  $('#api-key').placeholder = t(personalKey ? 'Key already set — leave blank to test it' : 'Paste your TypeSafe or OpenRouter API key');
  $('#catalog-count').textContent = formatNumber(CATALOG.length);
  if (state.connectionFeedback) $('#connection-feedback').textContent = t(state.connectionFeedback.message, state.connectionFeedback.params);
  updateBuildAction();
}
function setConnectionFeedback(message, params = {}) {
  state.connectionFeedback = { message, params };
  $('#connection-feedback').textContent = t(message, params);
}
function lastProjectKey() { return state.hostedClient ? 'forma:hosted:last-project' : 'forma:last-project'; }
function rememberProject() { try { if (state.project) localStorage.setItem(lastProjectKey(), state.project.id); else localStorage.removeItem(lastProjectKey()); } catch { /* The optional last-opened preference is independent of project persistence. */ } }
const PROJECTS_DB_NAME = 'forma-projects-db', PROJECTS_DB_VERSION = 1, PROJECTS_STORE = 'projects';
function openProjectsDb() {
  if (state.hostedClient) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { resolve(null); return; }
    try {
      const request = indexedDB.open(PROJECTS_DB_NAME, PROJECTS_DB_VERSION);
      request.onupgradeneeded = () => { const db = request.result; if (!db.objectStoreNames.contains(PROJECTS_STORE)) db.createObjectStore(PROJECTS_STORE, { keyPath: 'id' }); };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB unavailable'));
    } catch (error) { reject(error); }
  });
}
async function idbPutProject(project, fallbackSpec) {
  if (!project?.id) return;
  try {
    const db = await openProjectsDb(); if (!db) return;
    const spec = validateSpec(project.spec || fallbackSpec);
    const pageCount = 1 + (spec.pages?.length || 0);
    const sectionCount = spec.sections.length + (spec.pages || []).reduce((sum, page) => sum + page.sections.length, 0);
    const record = {
      id: project.id, name: spec.name, brand: spec.brand.name, palette: spec.theme.palette,
      pageCount, sectionCount, revision: Number.isInteger(project.revision) ? project.revision : 1,
      createdAt: project.createdAt || new Date().toISOString(), updatedAt: project.updatedAt || new Date().toISOString(),
      spec, history: Array.isArray(project.history) ? project.history : []
    };
    await new Promise((resolve, reject) => {
      const tx = db.transaction(PROJECTS_STORE, 'readwrite');
      tx.objectStore(PROJECTS_STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch { /* IndexedDB is optional; local server workspace persists project files. */ }
}
async function idbGetProject(id) {
  if (!id || typeof id !== 'string') return null;
  try {
    const db = await openProjectsDb(); if (!db) return null;
    const record = await new Promise((resolve, reject) => {
      const tx = db.transaction(PROJECTS_STORE, 'readonly');
      const req = tx.objectStore(PROJECTS_STORE).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (!record?.spec) return null;
    record.spec = validateSpec(record.spec);
    return record;
  } catch { return null; }
}
async function idbListProjects() {
  try {
    const db = await openProjectsDb(); if (!db) return [];
    const records = await new Promise((resolve, reject) => {
      const tx = db.transaction(PROJECTS_STORE, 'readonly');
      const req = tx.objectStore(PROJECTS_STORE).getAll();
      req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
      req.onerror = () => reject(req.error);
    });
    db.close();
    const valid = [];
    for (const item of records) {
      if (!item?.id || typeof item.id !== 'string') continue;
      try {
        const spec = item.spec ? validateSpec(item.spec) : null;
        const palette = spec ? spec.theme.palette : item.palette;
        if (!Object.hasOwn(THEMES, palette)) continue;
        valid.push({
          id: item.id, name: spec ? spec.name : String(item.name || 'Untitled'),
          brand: spec ? spec.brand.name : String(item.brand || ''),
          palette,
          pageCount: spec ? 1 + (spec.pages?.length || 0) : (Number(item.pageCount) || 1),
          sectionCount: spec ? spec.sections.length + (spec.pages || []).reduce((sum, page) => sum + page.sections.length, 0) : (Number(item.sectionCount) || 1),
          revision: Number.isInteger(item.revision) ? item.revision : 1,
          createdAt: String(item.createdAt || ''), updatedAt: String(item.updatedAt || '')
        });
      } catch { /* Skip corrupted IndexedDB entry. */ }
    }
    return valid.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch { return []; }
}
async function idbDeleteProject(id) {
  if (!id || typeof id !== 'string') return;
  try {
    const db = await openProjectsDb(); if (!db) return;
    await new Promise((resolve, reject) => {
      const tx = db.transaction(PROJECTS_STORE, 'readwrite');
      tx.objectStore(PROJECTS_STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch { /* Optional storage. */ }
}
const THEME_STORAGE_KEY = 'forma:theme';
const THEME_LABELS = { en: { dark: 'Switch to light theme', light: 'Switch to dark theme' }, es: { dark: 'Cambiar a tema claro', light: 'Cambiar a tema oscuro' }, pt: { dark: 'Mudar para tema claro', light: 'Mudar para tema escuro' }, de: { dark: 'Zu hellem Design wechseln', light: 'Zu dunklem Design wechseln' }, it: { dark: 'Passa al tema chiaro', light: 'Passa al tema scuro' }, ru: { dark: 'Переключить на светлую тему', light: 'Переключить на тёмную тему' }, pl: { dark: 'Przełącz na jasny motyw', light: 'Przełącz na ciemny motyw' }, fi: { dark: 'Vaihda vaaleaan teemaan', light: 'Vaihda tummaan teemaan' }, sv: { dark: 'Byt till ljust tema', light: 'Byt till mörkt tema' } };
function syncEditorTheme(nextTheme) {
  let theme = nextTheme;
  if (theme !== 'dark' && theme !== 'light') { try { const saved = localStorage.getItem(THEME_STORAGE_KEY); if (saved === 'dark' || saved === 'light') theme = saved; } catch { /* Optional storage. */ } }
  if (theme !== 'dark' && theme !== 'light') theme = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  if (nextTheme === 'dark' || nextTheme === 'light') { try { localStorage.setItem(THEME_STORAGE_KEY, theme); } catch { /* Optional storage. */ } }
  const btn = $('#theme-button');
  if (btn) { const iconName = theme === 'dark' ? 'sun' : 'moon'; btn.dataset.icon = iconName; btn.innerHTML = icon(iconName); const label = (THEME_LABELS[getLocale()] || THEME_LABELS.en)[theme]; btn.title = label; btn.setAttribute('aria-label', label); }
}
const COOKIE_CONSENT_KEY = 'forma:cookie-consent';
function syncCookieBanner(accept = false) {
  const banner = $('#cookie-banner');
  if (!banner) return;
  if (accept) {
    try { localStorage.setItem(COOKIE_CONSENT_KEY, 'accepted'); } catch { /* Optional storage. */ }
    banner.hidden = true;
    return;
  }
  let consent = null;
  try { consent = localStorage.getItem(COOKIE_CONSENT_KEY); } catch { /* Optional storage. */ }
  banner.hidden = consent === 'accepted';
}
function updateHeader({ preserveInputs = false } = {}) {
  $('#project-title').textContent = state.site.name;
  if (!preserveInputs) $('#brand-input').value = state.spec.brand.name;
  $('#section-count').textContent = t('Pages: {count} · Sections here: {sections}', { count: formatNumber(pageEntries(state.site).length), sections: formatNumber(state.spec.sections.length) });
  $('#save-status').textContent = t(state.saving ? 'Saving…' : state.dirty ? 'Unsaved changes' : state.project ? 'Saved locally' : 'Sample canvas');
  $('#undo-button').disabled = !state.undo.length || state.busy;
  $('#redo-button').disabled = !state.redo.length || state.busy;
  $('#result-label').textContent = state.report ? state.report.provider === 'demo' ? t('Offline demo · local rules, not JEV') : t('{model} · API calls: {count}', { model: state.report.model, count: formatNumber(state.report.calls) }) : t(state.project ? 'Local project · session report not loaded' : 'Sample design · no API call made');
  syncEditorTheme();
  renderPagePicker();
}
function updateMode() {
  state.mode = $('#provider-mode').value;
  state.operation = $('#operation').value;
  $('#brand-context-field').hidden = state.operation === 'create';
  updateBuildAction();
  $('#operation-note').textContent = t(OPERATION_GUIDANCE[state.operation]);
  $('#prompt').placeholder = t(state.operation === 'redesign' ? 'Redesign this interface with a dark palette, clearer navigation and more compact spacing. Keep its content and images.' : state.operation === 'edit' ? 'For example: make the selected image 70% wide, move the heading below the description, or add search to this dashboard.' : 'A sign-in screen, chat workspace, project dashboard, storefront, or marketing website. Describe the layout, controls and visual style you need.');
  renderPagePicker();
}
function updateBuildAction() {
  const label = state.mode === 'demo' ? { create: 'Build offline demo', edit: 'Refine offline demo', redesign: 'Redesign offline demo' }[state.operation] : { create: 'Build with JEV', edit: 'Refine with JEV', redesign: 'Redesign with JEV' }[state.operation];
  let caption = t(label), note = t(state.mode === 'demo' ? 'DEMO MODE: local keyword rules, not JEV. Use this to try the editor and export without an API key.' : 'Your request is sent to TypeSafe or OpenRouter only when you build. An API key is required.');
  if (state.hostedClient && state.mode === 'jev') {
    const free = state.status.freeAllowance;
    if (state.status.personalKeyConfigured) {
      caption += ` · ${t('Your key')}`;
      note = t('Using your API key. Provider charges apply. Your free allowance is not used.');
    } else {
      const count = t('{remaining}/{limit} free calls', { remaining: formatNumber(free.remaining), limit: formatNumber(free.limit) });
      caption += ` · ${free.available || free.reason === 'exhausted' ? count : t('Free calls unavailable')}`;
      if (free.available && free.remaining >= 2) note = t('Free JEV includes 10 provider calls per public IP address each UTC day, usually 5 designs. Each design reserves up to 2 calls. Availability depends on the provider.');
      else {
        caption += ` · ${t('Use your key')}`;
        note = free.available || free.reason === 'exhausted' ? t('Free JEV: {remaining}/{limit} calls left. At least 2 calls are needed to start a design. Connect your own API key to continue, or try after midnight UTC.', { remaining: formatNumber(free.remaining), limit: formatNumber(free.limit) }) : t('Free JEV is currently unavailable. Connect your own TypeSafe or OpenRouter API key, or use Offline demo.');
      }
    }
  }
  $('#build-button').innerHTML = `${icon('spark', 16)}<span>${e(caption)}</span>${icon('arrow', 17)}`;
  $('#mode-note').classList.toggle('demo', state.mode === 'demo');
  $('#mode-note').textContent = note;
}
function offerPersonalKey(message) {
  if (message) setConnectionFeedback(message);
  if (!$('#settings-dialog').open) $('#settings-dialog').showModal();
  $('#api-key').focus();
}
function activity(message, detail = '', error = false, params = {}) {
  state.activities.unshift({ message, detail, error, params }); state.activities = state.activities.slice(0, 5);
  renderActivity();
}
function renderActivity() {
  $('#activity').innerHTML = state.activities.map((item) => {
    const params = Object.fromEntries(Object.entries(item.params).map(([key, value]) => [key, typeof value === 'number' ? formatNumber(value) : value]));
    return `<div class="activity-entry${item.error ? ' error' : ''}"><strong>${e(t(item.message))}</strong><p>${e(t(item.detail, params))}</p></div>`;
  }).join('');
}
function markChanged() { state.change++; state.dirty = true; updateHeader(); if (state.leftTab === 'library') renderLibrary(); schedulePreview(); scheduleSave(); }
function historySnapshot(label) {
  return { spec: clone(state.site), pageId: state.activePageId, selection: currentSelection(), locks: clone(state.locks), pageLocks: clone([...state.pageLocks]), label };
}
function pushUndo(label, key = '') {
  const now = Date.now();
  key = key ? `${state.activePageId}:${key}` : '';
  if (!key || key !== state.lastEditKey || now - state.lastEditAt > 1500) { state.undo.push(historySnapshot(label)); if (state.undo.length > 15) state.undo.shift(); }
  state.redo = []; state.lastEditKey = key; state.lastEditAt = now;
}
function commit(change, label = 'Manual edit', { render = true, key = '' } = {}) {
  if (state.busy) return false;
  cancelGesture('Content changed.');
  try {
    const next = clone(state.spec); change(next);
    const valid = validateSpec(replacePageSpec(state.site, state.activePageId, next));
    if (JSON.stringify(valid) === JSON.stringify(state.site)) return false;
    pushUndo(label, key); state.site = valid;
    normalizeSelection();
    markChanged(); if (render) renderInspector(); return true;
  } catch (error) { toast(error.message, 'error'); return false; }
}
function commitSite(change, label) {
  if (state.busy) return false;
  cancelGesture('Content changed.');
  try {
    const next = clone(state.site), result = change(next) || next;
    const valid = validateSpec(result);
    if (JSON.stringify(valid) === JSON.stringify(state.site)) return false;
    pushUndo(label); state.site = valid;
    if (!pageEntries(state.site).some((page) => page.id === state.activePageId)) resetPageView(HOME_PAGE_ID);
    normalizeSelection();
    markChanged(); renderInspector(); return true;
  } catch (error) { toast(error.message, 'error'); return false; }
}
function renderPagePicker() {
  const pages = pageEntries(state.site);
  $('#page-select').innerHTML = pages.map((page) => `<option value="${e(page.id)}"${page.id === state.activePageId ? ' selected' : ''}>${e(page.title)}${page.id !== HOME_PAGE_ID && !page.showInNav ? e(t(' · hidden from nav')) : ''}</option>`).join('');
  $('#page-select').disabled = state.busy;
  $('#add-page-button').disabled = state.busy || pages.length >= MAX_PAGES;
  $('#page-settings-button').disabled = state.busy || state.activePageId === HOME_PAGE_ID;
  const current = pages.find((page) => page.id === state.activePageId);
  $('#page-address').textContent = state.activePageId === HOME_PAGE_ID ? 'index.html' : `${current.slug}.html`;
  $('#page-scope-note').textContent = state.operation === 'create' ? t('New design creates a separate project with a fresh Home page.') : t('Design requests change {title} only. Brand settings are shared across the site.', { title: current.title });
  updateSelectionContext();
}
function invalidatePreview() {
  cancelGesture('The preview changed.');
  clearTimeout(state.previewTimer); state.previewController?.abort(); state.renderNumber++; state.channel = '';
  state.displayed = null;
}
function resetPageView(pageId, sectionId, { newProject = false } = {}) {
  state.pendingPreviewScroll = null; state.pendingFocus = false; state.pendingAnnouncement = '';
  if (newProject) state.pageLocks.clear();
  else state.pageLocks.set(state.activePageId, state.locks);
  invalidatePreview(); state.activePageId = pageId;
  const sections = state.spec.sections;
  state.selected = sections.some((section) => section.id === sectionId) ? sectionId : defaultSectionId(sections);
  state.selectedItemId = null; state.selectedPart = null;
  state.locks = state.pageLocks.get(pageId) || defaultLocks(); state.pageLocks.set(pageId, state.locks);
  state.pendingScroll = Boolean(sectionId); state.report = null; state.warnings = []; state.lastEditKey = '';
  if (state.leftTab === 'library') renderLibrary();
}
function defaultSectionId(sections = state.spec.sections) { return sections.find((section) => section.group === 'hero')?.id || sections[0]?.id || null; }
function switchPage(pageId, sectionId) {
  if (state.busy || !pageEntries(state.site).some((page) => page.id === pageId)) return;
  if (pageId === state.activePageId) {
    const target = sectionId || defaultSectionId();
    if (target) selectSection(target, { scroll: true });
    else { normalizeSelection(); renderInspector(); syncPreviewState(); }
  } else {
    resetPageView(pageId, sectionId); updateHeader(); renderInspector(); renderPreview();
  }
  showPanel('canvas');
}
function uniquePageSlug(value) {
  const base = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 45);
  const start = /^[a-z]/.test(base) ? base : `page-${base || 'new'}`;
  const reserved = /^(?:index|source|con|prn|aux|nul|com[1-9]|lpt[1-9])$/;
  const taken = new Set(pageEntries(state.site).map((page) => page.slug));
  let candidate = reserved.test(start) ? `${start}-page` : start, number = 2;
  while (taken.has(candidate)) candidate = `${start}-${number++}`;
  return candidate;
}
function openPageDialog(template = 'general', edit = false) {
  if (state.busy || !Object.hasOwn(PAGE_TEMPLATES, template)) return;
  if (!edit && pageEntries(state.site).length >= MAX_PAGES) { toast(t('A site can contain up to {count} pages.', { count: formatNumber(MAX_PAGES) })); return; }
  const page = edit ? state.site.pages.find((item) => item.id === state.activePageId) : null;
  if (edit && !page) return;
  state.pageDialogId = page?.id || null; state.pageSlugEdited = Boolean(page);
  $('#page-dialog-heading').textContent = t(page ? 'Page settings.' : 'Add a page.');
  $('#page-title-input').value = page?.title || PAGE_TEMPLATES[template].title;
  $('#page-slug-input').value = page?.slug || uniquePageSlug(PAGE_TEMPLATES[template].slug);
  $('#page-template').innerHTML = Object.entries(PAGE_TEMPLATES).map(([id, choice]) => `<option value="${e(id)}"${id === template ? ' selected' : ''}>${e(t(choice.label))}</option>`).join('');
  $('#page-template-field').hidden = Boolean(page);
  $('#page-nav-input').checked = page ? page.showInNav : template !== 'article';
  $('#delete-page-button').hidden = !page; $('#page-submit').textContent = t(page ? 'Save page settings' : 'Create page');
  $('#page-template-description').textContent = t(PAGE_TEMPLATES[template].description);
  $('#page-feedback').textContent = '';
  $('#page-dialog').showModal(); $('#page-title-input').focus();
}
function addSection(group, blockId) {
  if (state.busy || !GROUPS.includes(group)) return;
  const block = blockId ? getBlock(blockId) : blocksFor(group)[0], current = state.spec.sections.find((section) => section.group === group);
  if (!block || block.group !== group) { toast('This component is no longer available.'); return; }
  if (current?.locked) { toast('Unlock this section before changing its component.'); return; }
  if (!blockId && current) { selectSection(current.id, { scroll: true, content: true }); return; }
  const proposal = current
    ? { kind: 'replace-section', pageId: state.activePageId, sectionId: current.id, blockId: block.id }
    : { kind: 'insert-section', pageId: state.activePageId, blockId: block.id, beforeSectionId: group === 'navigation' ? state.spec.sections[0]?.id ?? null : group === 'footer' ? null : state.spec.sections.find((section) => section.group === 'footer')?.id ?? null };
  const result = applyMove(state.spec, proposal, state.activePageId);
  if (!result.allowed) { toast(result.reason); return; }
  if (!result.changed) { selectSection(current.id, { scroll: true, content: true }); return; }
  const changed = commit((spec) => Object.assign(spec, result.page), `${current ? 'Replace' : 'Add'} ${block.name}`);
  if (changed) {
    assignSelection(result.selection); state.inspectorTab = 'content'; state.pendingScroll = true;
    invalidatePreview(); renderInspector(); renderPreview(); showPanel('canvas'); toast(t(current ? '{name} selected.' : '{name} added.', { name: t(block.name) }));
  }
}
function scheduleSave() { clearTimeout(state.saveTimer); state.saveTimer = setTimeout(() => saveProject().catch((error) => toast(error.message, 'error')), 1400); }
async function saveProject({ checkpoint = false, label = 'Saved checkpoint', snapshotCurrent = false } = {}) {
  clearTimeout(state.saveTimer);
  if (state.saving) { await state.saving; if (!state.dirty && !checkpoint) return state.project; return saveProject({ checkpoint, label, snapshotCurrent }); }
  if (!state.dirty && state.project && !checkpoint) return state.project;
  const snapshot = clone(state.site), stamp = state.change;
  state.saving = (async () => {
    // NEW: A manual checkpoint records the visible version. A design/restore
    // checkpoint records the previous saved version for rollback instead.
    let result;
    if (state.project) {
      try {
        result = await api(`/api/projects/${state.project.id}`, { method: 'PUT', data: { spec: snapshot, expectedRevision: state.project.revision, checkpoint, checkpointCurrent: snapshotCurrent, label } });
      } catch (error) {
        if (state.hostedClient || error.status !== 404) throw error;
        const previousId = state.project.id;
        result = await api('/api/projects', { method: 'POST', data: { spec: snapshot } });
        if (checkpoint) result = await api(`/api/projects/${result.id}`, { method: 'PUT', data: { spec: snapshot, expectedRevision: result.revision, checkpoint: true, checkpointCurrent: true, label } });
        await idbDeleteProject(previousId);
      }
    } else {
      result = await api('/api/projects', { method: 'POST', data: { spec: snapshot } });
      if (checkpoint) result = await api(`/api/projects/${result.id}`, { method: 'PUT', data: { spec: snapshot, expectedRevision: result.revision, checkpoint: true, checkpointCurrent: true, label } });
    }
    state.project = result; state.history = result.history || []; state.dirty = state.change !== stamp; rememberProject();
    await idbPutProject(result, snapshot);
    await refreshPastProjects();
    return result;
  })();
  updateHeader();
  try { return await state.saving; }
  finally { state.saving = null; updateHeader(); }
}
function schedulePreview() { clearTimeout(state.previewTimer); state.previewTimer = setTimeout(renderPreview, 200); }
async function renderPreview() {
  if (state.gesture) return false;
  const sequence = ++state.renderNumber;
  const change = state.change, pageId = state.activePageId;
  state.previewController?.abort(); state.previewController = new AbortController();
  const channel = crypto.randomUUID();
  try {
    const data = await api('/api/render', { method: 'POST', data: { spec: state.site, pageId: state.activePageId, channel }, signal: state.previewController.signal });
    if (sequence !== state.renderNumber || state.gesture || change !== state.change || pageId !== state.activePageId) return false;
    state.channel = channel; state.source = data.source; state.usedSessions.clear();
    state.displayed = { channel, change, pageId, ready: false };
    $('#preview-frame').srcdoc = data.html;
    $('#source-code').textContent = data.source.replace(/></g, '>\n<');
    resizePreview();
    return true;
  } catch (error) { if (error.name !== 'AbortError') toast(t('Preview: {message}', { message: error.message }), 'error'); return false; }
}
function resizePreview() {
  const area = $('#canvas-area');
  if (!area.clientWidth) return;
  const inset = window.innerWidth < 570 ? 20 : window.innerWidth < 1200 ? 30 : 48;
  const available = Math.max(240, area.clientWidth - inset);
  const width = { desktop: 1200, tablet: 768, mobile: 390 }[state.device];
  const scale = Math.min(1, available / width);
  const height = Math.max(180, area.clientHeight - 65);
  const shell = $('#preview-shell'), frame = $('#preview-frame');
  if (state.gesture && (frame.style.width !== `${width}px` || frame.style.height !== `${height / scale}px` || frame.style.transform !== `scale(${scale})`)) cancelGesture('The preview size changed.');
  shell.style.width = `${width * scale}px`; shell.style.height = `${height}px`;
  frame.style.width = `${width}px`; frame.style.height = `${height / scale}px`; frame.style.transform = `scale(${scale})`;
  $('#canvas-width').textContent = t('{width} px · {scale}%', { width: formatNumber(width), scale: formatNumber(Math.round(scale * 100)) });
}
function sendPreview(type, payload = {}) { $('#preview-frame').contentWindow?.postMessage({ source: 'forma-editor', channel: state.channel, type, ...payload }, '*'); }
function currentSelection() {
  return { pageId: state.activePageId, sectionId: state.selected, ...(state.selectedItemId ? { itemId: state.selectedItemId } : {}), ...(state.selectedPart ? { partKey: state.selectedPart } : {}) };
}
function validSelection(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((key) => !['pageId', 'sectionId', 'itemId', 'partKey'].includes(key))) return false;
  if (value.pageId !== undefined && value.pageId !== state.activePageId) return false;
  const section = state.spec.sections.find((s) => s.id === value.sectionId);
  if (!section || (value.itemId !== undefined && !section.items.some((item) => item.id === value.itemId))) return false;
  const owner = value.itemId ? section.items.find((item) => item.id === value.itemId) : section;
  return value.partKey === undefined || (partsFor(section, value.itemId).some((part) => part.partKey === value.partKey) && isPartVisible(owner, value.partKey));
}
function assignSelection(value) {
  state.selected = value.sectionId; state.selectedItemId = value.itemId || null; state.selectedPart = value.partKey || null; normalizeSelection();
}
function syncPreviewState(extra = {}) {
  if (!state.channel) return;
  const section = state.spec.sections.find((entry) => entry.id === state.selected);
  const owner = state.selectedPart === 'media' ? imageOwner(section, state.selectedItemId || undefined) : null;
  const media = owner ? { ...imageSizeOf(owner), canResize: state.inspect && !state.busy && !section.locked } : null;
  sendPreview('forma:editor-state', { pageId: state.activePageId, changeCounter: state.change, busy: state.busy, selection: currentSelection(), moveOptions: state.inspect && !state.busy ? moveOptions(state.spec, currentSelection(), t) : [], canDelete: state.inspect && !state.busy && Boolean(section && !section.locked && validSelection(currentSelection())), deleteReason: section?.locked ? t('Unlock this section before deleting its content.') : '', partLabels: PART_LABELS, media, messages: previewMessages(), locale: getLocale(), ...extra });
}
function cancelGesture(reason = 'Move cancelled.') {
  const gesture = state.gesture; if (!gesture) return;
  state.gesture = null;
  if (gesture.surface === 'preview') sendPreview('forma:drag-cancel', { session: gesture.session, reason: t(reason) });
  if (gesture.surface === 'library') sendPreview('forma:library-end', { session: gesture.session });
  document.dispatchEvent(new CustomEvent('forma-cancel-move', { detail: reason }));
  if (state.displayed?.change !== state.change) schedulePreview();
}
function beginGesture(selection, { surface = 'outline', session = crypto.randomUUID(), scrollY, kind = 'move' } = {}) {
  if (state.busy || !state.inspect || state.gesture || !validSelection(selection)) return false;
  if (surface === 'preview' && (!state.displayed?.ready || state.displayed.change !== state.change || state.displayed.pageId !== state.activePageId)) return false;
  const choices = kind === 'resize' ? [] : moveOptions(state.spec, { ...selection, pageId: state.activePageId }, t);
  if (kind === 'resize') {
    const section = state.spec.sections.find((entry) => entry.id === selection.sectionId);
    if (selection.partKey !== 'media' || section.locked || !imageOwner(section, selection.itemId)) return false;
  } else if (!choices.length) return false;
  // Invalidate pending responses without changing the live frame's channel.
  clearTimeout(state.previewTimer); state.previewController?.abort(); state.renderNumber++;
  assignSelection(selection);
  state.gesture = { surface, session, kind, pageId: state.activePageId, changeCounter: state.change, selection: currentSelection(), choices, scrollY };
  return true;
}
function commitImageSize(selection, size, { scrollY, focus = false } = {}) {
  if (!validSelection(selection) || selection.partKey !== 'media') throw new Error(t('This image is no longer available.'));
  const section = state.spec.sections.find((entry) => entry.id === selection.sectionId);
  if (!imageOwner(section, selection.itemId)) throw new Error(t('This component has no image area.'));
  if (section.locked) throw new Error(t('Unlock this section before resizing its image.'));
  const valid = validateImageSize(size);
  const changed = commit((page) => { imageOwner(page.sections.find((entry) => entry.id === selection.sectionId), selection.itemId).imageSize = valid; }, 'Resize image');
  if (changed && focus) {
    assignSelection(selection); state.pendingFocus = true; state.pendingPreviewScroll = scrollY ?? null;
    state.pendingAnnouncement = t('Image resized.'); renderInspector();
  }
  return changed;
}
function commitMove(proposal, label = 'Move content', { focus = true, scrollY, surface = 'outline' } = {}) {
  if (state.busy || !state.inspect) return false;
  const result = applyMove(state.spec, proposal, state.activePageId);
  if (!result.allowed) { cancelGesture(); toast(result.reason || 'This move is unavailable.'); return false; }
  if (!result.changed) { cancelGesture(); return false; }
  // Commit consumes a gesture once; no pointer movement writes canonical state.
  state.gesture = null;
  const beforeSelection = proposal.kind === 'transfer-item' ? { pageId: state.activePageId, sectionId: proposal.sectionId, itemId: proposal.itemId } : result.selection;
  if (validSelection(beforeSelection)) assignSelection(beforeSelection);
  else if (beforeSelection && validSelection({ ...beforeSelection, partKey: undefined })) assignSelection({ ...beforeSelection, partKey: undefined });
  const changed = commit((page) => Object.assign(page, result.page), label, { render: false });
  if (changed) {
    assignSelection(result.selection); state.pendingFocus = focus && surface === 'preview'; state.pendingPreviewScroll = scrollY ?? null;
    state.pendingAnnouncement = label;
    state.pendingScroll = scrollY === undefined; renderInspector();
    $('#structure-announcement').textContent = label; toast(label, 'success');
    if (focus && surface === 'outline') requestAnimationFrame(() => {
      const handle = $$('[data-structure-focus]').find((node) => node.dataset.structureFocus === JSON.stringify(currentSelection()));
      handle?.focus({ preventScroll: true }); revealInPanel(handle);
    });
  }
  return changed;
}
function normalizeSelection({ previousPage } = {}) {
  let section = state.spec.sections.find((candidate) => candidate.id === state.selected);
  if (previousPage && state.selectedItemId && !section?.items.some((item) => item.id === state.selectedItemId)) {
    const previousSection = previousPage.sections.find((candidate) => candidate.id === state.selected);
    if (previousSection?.items.some((item) => item.id === state.selectedItemId) && ['services', 'process'].includes(previousSection.group)) {
      const destinations = state.spec.sections.filter((candidate) => candidate.id !== previousSection.id && ['services', 'process'].includes(candidate.group)
        && candidate.items.some((item) => item.id === state.selectedItemId)
        && !previousPage.sections.find((entry) => entry.id === candidate.id)?.items.some((item) => item.id === state.selectedItemId));
      // Legacy item IDs are section-scoped, so only follow a unique new owner.
      if (destinations.length === 1) { section = destinations[0]; state.selected = section.id; }
    }
  }
  if (!section) { state.selected = defaultSectionId(); section = state.spec.sections.find((candidate) => candidate.id === state.selected); state.selectedItemId = null; state.selectedPart = null; }
  if (!section) return;
  if (state.selectedItemId && !section.items.some((item) => item.id === state.selectedItemId)) { state.selectedItemId = null; state.selectedPart = null; }
  if (state.selectedPart && !validSelection(currentSelection())) state.selectedPart = null;
}
function deleteSelection(selection = currentSelection(), { restore = false, scrollY } = {}) {
  if (state.busy || !selection || (selection.pageId !== undefined && selection.pageId !== state.activePageId)) return false;
  const section = state.spec.sections.find((entry) => entry.id === selection.sectionId);
  if (!section || !validSelection({ ...selection, partKey: undefined })) return false;
  if (section.locked) { toast('Unlock this section before deleting its content.'); return false; }
  const part = selection.partKey && partsFor(section, selection.itemId, t).find((entry) => entry.partKey === selection.partKey);
  if (selection.partKey && !part) return false;
  const preserveInspector = Boolean(part && state.selected === section.id && $('#inspector-content').contains(document.activeElement));
  const label = restore ? t('Restore {name}', { name: part.label }) : t('Delete {name}', { name: part?.label || (selection.itemId ? t('item') : t(sectionLabel(section))) });
  cancelGesture('Content deleted.');
  if (!restore) assignSelection(selection);
  let changed = false, nextSelection;
  if (selection.partKey || selection.itemId) {
    const ownerRef = { pageId: state.activePageId, sectionId: selection.sectionId, ...(selection.itemId ? { itemId: selection.itemId } : {}) };
    const result = selection.partKey ? setPartRemoved(state.spec, ownerRef, selection.partKey, !restore) : removeItem(state.spec, selection.sectionId, selection.itemId);
    if (!result.allowed) { toast(result.reason || 'This content cannot be deleted.'); return false; }
    if (!result.changed) return false;
    nextSelection = result.selection ? { ...result.selection, pageId: state.activePageId } : null;
    changed = commit((page) => Object.assign(page, result.page), label, { render: false });
  } else {
    const index = state.spec.sections.indexOf(section);
    const nextSection = state.spec.sections[index + 1] || state.spec.sections[index - 1];
    nextSelection = { pageId: state.activePageId, sectionId: nextSection?.id || null };
    changed = commitSite((site) => removeSection(site, state.activePageId, section.id), label);
  }
  if (changed) {
    if (nextSelection && validSelection(nextSelection)) assignSelection(nextSelection);
    else normalizeSelection();
    state.pendingFocus = Boolean(state.selected) && !preserveInspector; state.pendingPreviewScroll = scrollY ?? null;
    state.pendingAnnouncement = t(restore ? 'Element restored. Undo is available.' : 'Content deleted. Undo is available.');
    renderInspector({ preserveScroll: preserveInspector }); syncPreviewState();
    if (preserveInspector) {
      const attribute = restore ? 'deleteSelection' : 'restorePart';
      const control = $$(`#inspector-content [data-${restore ? 'delete-selection' : 'restore-part'}]`).find((node) => {
        const target = JSON.parse(node.dataset[attribute]);
        return target.sectionId === selection.sectionId && target.itemId === selection.itemId && target.partKey === selection.partKey;
      });
      control?.focus({ preventScroll: true });
    }
    $('#structure-announcement').textContent = state.pendingAnnouncement;
    toast(state.pendingAnnouncement, 'success');
    if (!state.selected) requestAnimationFrame(() => $('#add-section-button')?.focus({ preventScroll: true }));
  }
  return changed;
}
function selectionPayload() { return { id: state.selected, ...(state.selectedItemId ? { itemId: state.selectedItemId, itemIndex: state.selectedItemIndex } : {}), ...(state.selectedPart ? { partKey: state.selectedPart } : {}) }; }
function updateSelectionContext() {
  const section = state.spec.sections.find((candidate) => candidate.id === state.selected);
  const node = $('#selection-context'); if (!node) return;
  if (!section) { node.textContent = t('This page is empty. Add a component or describe what to build.'); return; }
  if (state.operation === 'create') { node.textContent = t('Your brief defines the new project; the current selection is not reused.'); return; }
  const part = partsFor(section, state.selectedItemId || undefined, t).find((entry) => entry.partKey === state.selectedPart);
  const label = `${t(sectionLabel(section))}${part ? ` · ${part.label}` : ''}`;
  node.textContent = state.selectedItemIndex === null
    ? t('Request context: {section}. You can name a different section in your request.', { section: label })
    : t('Request context: {section} · item {count}. You can name a different section in your request.', { section: label, count: formatNumber(state.selectedItemIndex + 1) });
}
function revealInPanel(node, block = 'nearest') {
  const panel = node?.closest('.inspector-scroll,.left-scroll');
  if (!panel) return;
  const bounds = node.getBoundingClientRect(), viewport = panel.getBoundingClientRect();
  const top = bounds.top - viewport.top - panel.clientTop;
  const bottom = bounds.bottom - viewport.top - panel.clientTop;
  let delta = 0;
  if (block === 'start') delta = top;
  else if (top < 0 && bottom > panel.clientHeight) return;
  else if (top < 0) delta = bounds.height > panel.clientHeight ? bottom - panel.clientHeight : top;
  else if (bottom > panel.clientHeight) delta = bounds.height > panel.clientHeight ? top : bottom - panel.clientHeight;
  // Reveal editor controls inside their panel, without scrolling the app shell.
  panel.scrollTo({ top: panel.scrollTop + delta, behavior: 'instant' });
}
function selectSection(sectionId, { scroll = false, content = false, itemIndex = null, itemId, partKey } = {}) {
  if (state.busy) return;
  const section = state.spec.sections.find((s) => s.id === sectionId);
  if (itemId !== undefined) itemIndex = section?.items.findIndex((item) => item.id === itemId) ?? -1;
  if (!section || (itemIndex !== null && (!Number.isInteger(itemIndex) || itemIndex < 0 || !section.items[itemIndex]))) return;
  if (state.gesture) cancelGesture('Selection changed.');
  state.selected = sectionId; state.selectedItemIndex = itemIndex; state.selectedPart = partKey || null;
  if ((itemIndex !== null || state.selectedPart) && state.operation === 'create') { $('#operation').value = 'edit'; updateMode(); }
  if (content) state.inspectorTab = 'content';
  renderInspector(); sendPreview('select', { ...selectionPayload(), scroll }); syncPreviewState();
  if (content && itemIndex !== null) requestAnimationFrame(() => revealInPanel($('#inspector-content .selected-item')));
}
function receiveImageResize(message) {
  if (!['resize-start', 'resize-end', 'resize-cancel'].includes(message.type)) return false;
  const reject = () => sendPreview('forma:drag-cancel', { session: message.sessionId, reason: t('This image resize is stale or unavailable.') });
  const allowed = ['source', 'channel', 'type', 'sessionId', 'pageId', 'changeCounter', 'selection', 'width', 'height', 'scrollY'];
  if (Object.keys(message).some((key) => !allowed.includes(key))) { reject(); return true; }
  if (message.type === 'resize-cancel') {
    if (state.gesture?.kind === 'resize' && state.gesture.session === message.sessionId) cancelGesture();
    return true;
  }
  if (message.type === 'resize-start') {
    const sessionValid = typeof message.sessionId === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(message.sessionId) && !state.usedSessions.has(message.sessionId);
    if (state.usedSessions.size >= 100) { reject(); if (!state.gesture) renderPreview(); return true; }
    if (sessionValid) state.usedSessions.add(message.sessionId);
    if (!sessionValid || message.pageId !== state.activePageId || message.changeCounter !== state.change || !beginGesture(message.selection, { surface: 'preview', kind: 'resize', session: message.sessionId })) reject();
    return true;
  }
  const gesture = state.gesture;
  if (!gesture || gesture.kind !== 'resize' || gesture.surface !== 'preview' || gesture.session !== message.sessionId) { reject(); return true; }
  state.gesture = null;
  const sameSelection = validSelection(message.selection) && ['sectionId', 'itemId', 'partKey'].every((key) => message.selection[key] === gesture.selection[key]);
  if (!sameSelection || state.busy || !state.inspect || gesture.changeCounter !== state.change || message.changeCounter !== state.change || gesture.pageId !== state.activePageId || message.pageId !== state.activePageId || !Number.isInteger(message.width) || !Number.isInteger(message.height)) { reject(); return true; }
  try {
    const section = state.spec.sections.find((entry) => entry.id === gesture.selection.sectionId);
    const owner = imageOwner(section, gesture.selection.itemId);
    const scrollY = Number.isFinite(message.scrollY) && message.scrollY >= 0 && message.scrollY < 1000000 ? message.scrollY : undefined;
    commitImageSize(gesture.selection, { ...imageSizeOf(owner), width: message.width, height: message.height }, { focus: true, scrollY });
  } catch (error) { reject(); toast(error.message, 'error'); }
  return true;
}
window.addEventListener('message', (event) => {
  if (!state.channel || event.source !== $('#preview-frame').contentWindow || event.origin !== 'null' || event.data?.source !== 'forma-preview' || event.data.channel !== state.channel) return;
  const message = event.data;
  if (message.type === 'delete-selection') {
    const allowed = ['source', 'channel', 'type', 'pageId', 'changeCounter', 'selection', 'scrollY'];
    if (Object.keys(message).some((key) => !allowed.includes(key)) || state.busy || !state.inspect || !state.displayed?.ready || state.displayed.change !== state.change || message.pageId !== state.activePageId || message.changeCounter !== state.change || !validSelection(message.selection)) return;
    if (['sectionId', 'itemId', 'partKey'].some((key) => message.selection[key] !== currentSelection()[key])) return;
    const scrollY = Number.isFinite(message.scrollY) && message.scrollY >= 0 && message.scrollY < 1000000 ? message.scrollY : undefined;
    deleteSelection(message.selection, { scrollY }); return;
  }
  if (receiveImageResize(message)) return;
  if (typeof message.type === 'string' && message.type.startsWith('forma:library-')) { libraryDrag.receive(message); return; }
  if (message.type === 'ready') {
    if (state.displayed) state.displayed.ready = true;
    sendPreview('mode', { edit: state.inspect }); sendPreview('select', { ...selectionPayload(), scroll: state.pendingScroll });
    syncPreviewState({ focus: state.pendingFocus, announcement: state.pendingAnnouncement, ...(state.pendingPreviewScroll === null ? {} : { scrollY: state.pendingPreviewScroll }) });
    state.pendingScroll = false; state.pendingFocus = false; state.pendingPreviewScroll = null; state.pendingAnnouncement = '';
  }
  if (message.type === 'forma:drag-start') {
    if (state.usedSessions.size >= 100) { sendPreview('forma:drag-cancel', { session: message.session, reason: t('Refreshing the preview. Try this move again.') }); if (!state.gesture) renderPreview(); return; }
    const sessionValid = typeof message.session === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(message.session) && !state.usedSessions.has(message.session);
    const scrollY = Number.isFinite(message.scrollY) && message.scrollY >= 0 && message.scrollY < 1000000 ? message.scrollY : undefined;
    if (sessionValid) state.usedSessions.add(message.session);
    if (!sessionValid || message.pageId !== state.activePageId || message.changeCounter !== state.change || !beginGesture(message.selection, { surface: 'preview', session: message.session, scrollY })) {
      sendPreview('forma:drag-cancel', { session: message.session, reason: t('The preview changed or this move is unavailable.') }); return;
    }
    sendPreview('forma:drag-accepted', { session: message.session, moveOptions: state.gesture.choices }); return;
  }
  if (message.type === 'forma:drag-cancel') { if (state.gesture?.session === message.session) cancelGesture(); return; }
  if (message.type === 'forma:move') {
    const gesture = state.gesture;
    if (!gesture || gesture.kind === 'resize' || gesture.surface !== 'preview' || gesture.session !== message.session) return;
    const choice = gesture.choices.find((entry) => JSON.stringify(entry.proposal) === JSON.stringify(message.proposal));
    state.gesture = null;
    if (!choice || state.busy || !state.inspect || gesture.changeCounter !== state.change || message.changeCounter !== state.change || message.pageId !== state.activePageId || gesture.pageId !== state.activePageId) {
      sendPreview('forma:drag-cancel', { session: message.session, reason: t('This move is stale or incompatible.') }); return;
    }
    const dropScroll = Number.isFinite(message.scrollY) && message.scrollY >= 0 && message.scrollY < 1000000 ? message.scrollY : gesture.scrollY;
    commitMove(choice.proposal, choice.label, { scrollY: dropScroll, surface: 'preview' }); return;
  }
  if (event.data.type === 'select' && typeof event.data.id === 'string' && !state.busy) {
    const section = state.spec.sections.find((candidate) => candidate.id === event.data.id), itemIndex = event.data.itemId === undefined ? event.data.itemIndex : section?.items.findIndex((item) => item.id === event.data.itemId);
    if (!section || (itemIndex !== undefined && (!Number.isInteger(itemIndex) || itemIndex < 0 || !section.items[itemIndex]))) return;
    if (message.partKey !== undefined && !validSelection({ sectionId: section.id, ...(message.itemId ? { itemId: message.itemId } : {}), partKey: message.partKey })) return;
    selectSection(event.data.id, { content: true, itemIndex: itemIndex ?? null, partKey: message.partKey }); if (window.innerWidth <= 950 && !message.forDrag) showPanel('inspector');
  }
  if (state.busy) return;
  if (message.type === 'edit-media') {
    const section = state.spec.sections.find((entry) => entry.id === message.sectionId);
    if (!state.inspect || !imageOwner(section, message.itemId)) return;
    selectSection(section.id, { content: true, itemId: message.itemId, partKey: 'media' }); showPanel('inspector');
    requestAnimationFrame(() => { const editor = $('#selected-media-editor'); revealInPanel(editor, 'start'); (message.focus === 'size' ? editor?.querySelector('[data-image-size-key="width"]') : editor)?.focus({ preventScroll: true }); }); return;
  }
  if (event.data.type === 'navigate-page' && typeof event.data.pageId === 'string') {
    const target = pageEntries(state.site).find((page) => page.id === event.data.pageId);
    if (!target || (event.data.sectionId !== undefined && (typeof event.data.sectionId !== 'string' || !getPageSpec(state.site, target.id).sections.some((section) => section.id === event.data.sectionId)))) return;
    switchPage(target.id, event.data.sectionId);
  }
  if (event.data.type === 'add-section' && state.inspect && GROUPS.includes(event.data.group)) addSection(event.data.group);
  if (event.data.type === 'add-page' && state.inspect && Object.hasOwn(PAGE_TEMPLATES, event.data.template)) openPageDialog(event.data.template);
});
function settingLock(field) {
  const label = { typeScale: 'Heading hierarchy', width: 'Content width', palette: 'Color story', font: 'Typography', radius: 'Corners', density: 'Spacing', motion: 'Motion' }[field];
  return `<button class="icon-button ${state.locks[field] ? 'active' : ''}" data-lock-setting="${field}" title="${e(t(state.locks[field] ? 'Unlock {setting} during JEV requests' : 'Lock {setting} during JEV requests', { setting: t(label) }))}" aria-label="${e(t(state.locks[field] ? 'Unlock {setting}' : 'Lock {setting}', { setting: t(label) }))}" aria-pressed="${state.locks[field]}">${icon(state.locks[field] ? 'lock' : 'unlock', 12)}</button>`;
}
function options(values, selected) { return Object.entries(values).map(([key, value]) => `<option value="${e(key)}"${key === selected ? ' selected' : ''}>${e(t(typeof value === 'string' ? value : value.name))}</option>`).join(''); }
function themeSetting(field, label, values, descriptions) {
  const hint = descriptions?.[state.spec.theme[field]];
  return `<div class="setting-row"><div class="field-label"><label for="theme-${field}">${e(t(label))}</label>${settingLock(field)}</div><select id="theme-${field}" data-theme-field="${field}"${hint ? ` aria-describedby="theme-${field}-hint"` : ''}>${options(values, state.spec.theme[field])}</select>${hint ? `<p class="field-help" id="theme-${field}-hint">${e(t(hint))}</p>` : ''}</div>`;
}
function renderLayoutSettings() {
  return themeSetting('typeScale', 'Heading hierarchy', { quiet: 'Quiet', balanced: 'Balanced', dramatic: 'Dramatic' }, TYPE_SCALES) + themeSetting('width', 'Content width', { focused: 'Focused', standard: 'Standard', wide: 'Wide' }, CONTENT_WIDTHS);
}
function renderOutline() {
  return `<div class="section-list">${state.spec.sections.map((section, index) => {
    const selection = { pageId: state.activePageId, sectionId: section.id };
    const controls = renderMoveControls(state.spec, selection, { compact: true });
    return `<div class="outline-entry" data-outline-section="${e(section.id)}"><div class="section-row ${section.id === state.selected ? 'active' : ''}">${controls}<button class="section-select" data-select-section="${e(section.id)}"><span class="section-index">${String(index + 1).padStart(2, '0')}</span><span><strong>${e(t(sectionLabel(section)))}</strong><small>${e(t(getBlock(section.block).name))}</small></span></button><div class="section-controls"><button class="icon-button ${section.locked ? 'locked' : ''}" data-lock-section="${e(section.id)}" aria-label="${e(t(section.locked ? 'Unlock {section}' : 'Lock {section}', { section: t(sectionLabel(section)) }))}" title="${e(t(section.locked ? 'Unlock structure and model changes' : 'Lock structure and model changes; manual text remains editable'))}">${icon(section.locked ? 'lock' : 'unlock', 12)}</button><button class="icon-button" data-remove-section="${e(section.id)}" aria-label="${e(t('Remove {section}', { section: t(sectionLabel(section)) }))}"${section.locked ? ` disabled title="${e(t('Unlock this section before deleting its content.'))}"` : ''}>${icon('trash', 12)}</button></div></div>${section.items.length ? `<details class="outline-items"${section.id === state.selected ? ' open' : ''}><summary>${e(t('Items: {count}', { count: formatNumber(section.items.length) }))}</summary>${section.items.map((item, ordinal) => `<div class="outline-item" data-editor-item-id="${e(item.id)}" data-section-id="${e(section.id)}">${renderMoveControls(state.spec, { ...selection, itemId: item.id }, { compact: true })}<button data-structure-select="${e(JSON.stringify({ ...selection, itemId: item.id }))}" aria-pressed="${item.id === state.selectedItemId && section.id === state.selected}">${ordinal + 1}. ${e(item.title || t('Untitled item'))}</button></div>`).join('')}</details>` : ''}</div>`;
  }).join('')}</div>`;
}
function renderSelectionBreadcrumbs(section) {
  const owner = { pageId: state.activePageId, sectionId: section.id };
  const crumb = (label, selection) => `<button type="button" data-structure-select="${e(JSON.stringify(selection))}" aria-pressed="${JSON.stringify(selection) === JSON.stringify(currentSelection())}">${e(label)}</button>`;
  const item = section.items.find((entry) => entry.id === state.selectedItemId);
  const selectedOwner = item ? { ...owner, itemId: item.id } : owner;
  const parts = partsFor(section, item?.id, t).filter((part) => isPartVisible(item || section, part.partKey));
  return `<nav class="selection-breadcrumbs" aria-label="${e(t("Selected content"))}">${crumb(t(sectionLabel(section)), owner)}${item ? `<span aria-hidden="true">›</span>${crumb(t('Item {count}', { count: formatNumber(section.items.indexOf(item) + 1) }), selectedOwner)}` : ''}${state.selectedPart ? `<span aria-hidden="true">›</span>${crumb(t(parts.find((part) => part.partKey === state.selectedPart)?.label || state.selectedPart), currentSelection())}` : ''}</nav><div class="part-choices" aria-label="${e(t("Select an inner part"))}">${parts.map((part) => crumb(t(part.label), { ...selectedOwner, partKey: part.partKey })).join('')}</div>${renderMoveControls(state.spec, currentSelection())}${section.locked ? `<p class="inspector-note">${e(t("Unlock this section to arrange or delete its structure. You can still edit its text, icons and settings."))}</p>` : ''}`;
}
function renderPartControls(section, item) {
  const parts = partsFor(section, item?.id, t);
  if (!parts.length) return '';
  const owner = item || section;
  const selection = { pageId: state.activePageId, sectionId: section.id, ...(item ? { itemId: item.id } : {}) };
  return `<details class="details-block part-management" data-parts-owner="${e(JSON.stringify(selection))}"${!item ? ' open' : ''}><summary>${e(t(item ? 'Elements in this item' : 'Elements in this section'))}</summary><p class="inspector-note">${e(t('Delete an element to remove it from the page. Its saved content stays available to restore.'))}</p>${parts.map((part) => {
    const removed = owner.removedParts?.includes(part.partKey), hiddenWithParent = !removed && !isPartVisible(owner, part.partKey), target = e(JSON.stringify({ ...selection, partKey: part.partKey }));
    return `<div class="part-management-row${removed ? ' removed' : ''}" data-removable-part="${e(part.partKey)}" data-part-owner="${e(owner.id)}"><span>${e(part.label)}${removed || hiddenWithParent ? `<small>${e(t(removed ? 'Deleted' : 'Hidden with its parent'))}</small>` : ''}</span><button type="button" class="button small${removed ? '' : ' delete-content-button'}" ${removed ? 'data-restore-part' : 'data-delete-selection'}="${target}" aria-label="${e(t(removed ? 'Restore {name}' : 'Delete {name}', { name: part.label }))}"${section.locked ? ` disabled title="${e(t('Unlock this section before deleting its content.'))}"` : ''}>${e(t(removed ? 'Restore' : 'Delete'))}</button></div>`;
  }).join('')}</details>`;
}
function renderDesign() {
  return `<div class="inspector-group"><div class="inspector-heading"><h2>${e(t("Color story"))}</h2>${settingLock('palette')}</div><div class="palette-grid">${Object.entries(THEMES).map(([key, theme]) => `<button class="palette-button ${key === state.spec.theme.palette ? 'active' : ''}" data-palette="${key}" title="${e(t(theme.description))}" aria-label="${e(t('{name} palette', { name: t(theme.name) }))}" aria-pressed="${key === state.spec.theme.palette}"><span class="palette-preview" style="background:${theme.bg}"><i style="background:${theme.ink}"></i><i style="background:${theme.accent}"></i></span><span>${e(t(theme.name))}</span></button>`).join('')}</div></div>
    ${themeSetting('font', 'Typography', FONTS)}${renderLayoutSettings()}<div class="dual-settings">${themeSetting('radius', 'Corners', { sharp: 'Sharp', soft: 'Soft', round: 'Rounded' })}${themeSetting('density', 'Spacing', { airy: 'Airy', balanced: 'Balanced', compact: 'Compact' })}</div>${themeSetting('motion', 'Motion', { none: 'No animation', subtle: 'Subtle hover only' })}<p class="inspector-note">${e(t("Locks protect these choices during JEV requests. Manual edits remain available."))}</p><div class="section-divider"></div><div class="inspector-heading"><h2>${e(t("Page structure"))}</h2><span class="subtle">${e(t('Sections: {count}', { count: formatNumber(state.spec.sections.length) }))}</span></div>${renderOutline()}<button class="add-section" id="add-section-button">${icon('plus', 13)} ${e(t('Add a component'))}</button><p class="inspector-note" style="margin-top:14px">${e(t("Drag a grip or use Move… to arrange this page. Locked sections stay in their slots and block structural moves inside them. Text and settings remain editable."))}</p>${state.history.length ? `<div class="section-divider"></div><div class="inspector-heading"><h2>${e(t("Saved checkpoints"))}</h2></div><div class="history-list">${state.history.map((h) => `<button class="history-entry" data-restore-history="${e(h.id)}">${e(h.label)}<small>${e(formatDate(h.createdAt))}</small></button>`).join('')}</div>` : ''}`;
}
function fieldIdentityAttributes(path) {
  const match = /^sections\.(\d+)\.(?:items\.(\d+)\.)?/.exec(path);
  if (!match) return '';
  const section = state.spec.sections[Number(match[1])], item = match[2] === undefined ? null : section.items[Number(match[2])];
  return ` data-field-section="${e(section.id)}"${item ? ` data-field-item="${e(item.id)}"` : ''}`;
}
function captureFieldReference(target) {
  const owner = target.closest('[data-field-section]');
  return owner ? { sectionId: owner.dataset.fieldSection, itemId: owner.dataset.fieldItem } : null;
}
function resolveFieldPath(path, reference) {
  if (!reference) return path;
  const sectionIndex = state.spec.sections.findIndex((section) => section.id === reference.sectionId);
  if (sectionIndex < 0) throw new Error(t("This section no longer exists."));
  let resolved = path.replace(/^sections\.\d+\./, `sections.${sectionIndex}.`);
  if (reference.itemId) {
    const itemIndex = state.spec.sections[sectionIndex].items.findIndex((item) => item.id === reference.itemId);
    if (itemIndex < 0) throw new Error(t("This item no longer exists."));
    resolved = resolved.replace(/\.items\.\d+\./, `.items.${itemIndex}.`);
  }
  return resolved;
}
function field(path, label, value, { multiline = false, max = 1000, hint = '', type = 'text', live = true } = {}) {
  const fieldId = `field-${path.replaceAll('.', '-')}`;
  const sectionHrefPrefix = path === 'brand.href' ? `page:${state.activePageId}#` : '#';
  const links = path.endsWith('.href') ? `<label class="sr-only" for="${fieldId}-target">${e(t('Choose {label}', { label: t(label) }))}</label><select class="link-target-select" id="${fieldId}-target" data-link-path="${e(path)}"><option value="" disabled selected>${e(t("Choose a page or section…"))}</option><optgroup label="${e(t("Pages"))}">${pageEntries(state.site).map((page) => `<option value="page:${e(page.id)}">${e(page.title)}</option>`).join('')}</optgroup><optgroup label="${e(t("Sections on this page"))}">${state.spec.sections.filter((section) => !['navigation', 'footer'].includes(section.group)).map((section) => `<option value="${e(sectionHrefPrefix + section.id)}">${e(t(sectionLabel(section)))}</option>`).join('')}</optgroup></select>` : '';
  return `<div class="editor-field"${fieldIdentityAttributes(path)}><label for="${fieldId}">${e(t(label))}</label>${links}${multiline ? `<textarea id="${fieldId}" data-field="${e(path)}" data-live="${live}" maxlength="${max}" rows="3">${e(value)}</textarea>` : `<input id="${fieldId}" type="${type}" data-field="${e(path)}" data-live="${live}" maxlength="${max}" value="${e(value)}"/>`}${hint ? `<p class="field-help">${e(t(hint))}</p>` : ''}</div>`;
}
function imageField(path, value) { return `<div class="editor-field"${fieldIdentityAttributes(path)}><label>${e(t("Image"))}</label><div class="image-upload">${value ? `<img src="${e(value)}" alt="${e(t("Uploaded image preview"))}"/>` : ''}<label>${icon('upload', 13)}${e(t(value ? 'Replace image' : 'Upload image'))}<input type="file" data-image-path="${e(path)}" accept="image/png,image/jpeg,image/webp,image/avif" hidden/></label>${value ? `<button class="icon-button" data-clear-image="${e(path)}" title="${e(t("Remove image"))}" aria-label="${e(t("Remove image"))}">${icon('trash', 12)}</button>` : ''}</div><p class="field-help">${e(t("PNG, JPEG, WebP or AVIF. Resized locally; never sent to JEV. No upload uses a remote service."))}</p></div>`; }
function renderPresentation(section) {
  const fields = sectionPresentationFields(section);
  if (!fields.length) return '';
  return `<details class="details-block section-presentation" open><summary>${e(t("Section presentation"))}</summary><p class="inspector-note">${e(t("Adjust this section independently of the page theme. A section lock preserves these choices during JEV requests."))}</p>${fields.map((key) => {
    const selected = section.presentation[key], fieldId = `presentation-${section.id}-${key}`;
    return `<div class="editor-field"><label for="${e(fieldId)}">${e(t(PRESENTATION_LABELS[key]))}</label><select id="${e(fieldId)}" data-presentation-section="${e(section.id)}" data-presentation-key="${key}" aria-describedby="${e(fieldId)}-hint">${options(PRESENTATION_OPTIONS[key], selected)}</select><p class="field-help" id="${e(fieldId)}-hint">${e(t(PRESENTATION[key][selected]))}</p></div>`;
  }).join('')}</details>`;
}
function renderElements(section) {
  const fields = isInterfaceBlock(section) ? [] : elementFieldsFor(section);
  if (!fields.length) return '';
  return `<details class="details-block section-elements" open><summary>${e(t("Inside this block"))}</summary><p class="inspector-note">${e(t("Choose from the element library: layouts, buttons, labels and icons supported by this component. You can request these choices with JEV."))}</p>${fields.map((key) => {
    const control = ELEMENT_CONTROLS[key], selected = section.elements?.[key] ?? DEFAULT_ELEMENTS[key], values = elementOptionsFor(section, key), fieldId = `element-${section.id}-${key}`;
    return `<div class="editor-field"><label for="${e(fieldId)}">${e(t(control.label))}</label><select id="${e(fieldId)}" data-element-section="${e(section.id)}" data-element-key="${e(key)}" aria-describedby="${e(fieldId)}-hint">${options(values, selected)}</select><p class="field-help" id="${e(fieldId)}-hint">${e(t(values[selected] || control.description))}${key === 'buttonLabel' && selected !== 'default' ? ' ' + e(t('This prepared label overrides the custom button label below. Editing that field returns to custom wording.')) : ''}</p></div>`;
  }).join('')}</details>`;
}
function renderInterfaceControls(section) {
  const fields = interfaceFieldsFor(section);
  if (!fields.length) return '';
  return `<details class="details-block interface-controls" open><summary>${e(t('Application controls'))}</summary><p class="inspector-note">${e(t('Choose the layout and visible controls for this screen. Edit each field or panel below, or describe the change to JEV.'))}</p>${fields.map((key) => {
    const control = INTERFACE_CONTROLS[key], selected = section.interface?.[key] || 'default', fieldId = `interface-${section.id}-${key}`;
    return `<div class="editor-field"><label for="${e(fieldId)}">${e(t(control.label))}</label><select id="${e(fieldId)}" data-interface-section="${e(section.id)}" data-interface-key="${e(key)}" aria-describedby="${e(fieldId)}-hint">${options(control.options, selected)}</select><p class="field-help" id="${e(fieldId)}-hint">${e(t(control.description))}</p></div>`;
  }).join('')}</details>`;
}
const interfaceTypeLabels = { default: 'Component default', text: 'Text field', email: 'Email field', password: 'Password field', textarea: 'Text area', select: 'Select field', checkbox: 'Checkbox', number: 'Number field', date: 'Date field', stat: 'Metric', list: 'List entry', table: 'Table row', chart: 'Chart panel', form: 'Form panel', action: 'Action', product: 'Product', thread: 'Conversation', event: 'Event', task: 'Task' };
function renderInterfaceItemFields(section, item, itemBase) {
  const fieldId = `interface-item-${section.id}-${item.id}`, values = Object.fromEntries(interfaceItemTypesFor(section).map((value) => [value, interfaceTypeLabels[value]]));
  const type = item.uiType || 'default', input = ['text', 'email', 'password', 'number', 'date'].includes(type);
  const bodyLabel = type === 'select' ? 'Options, one per line' : input ? 'Placeholder' : type === 'textarea' ? 'Text content' : 'Description / content';
  const valueLabel = type === 'stat' ? 'Metric value' : type === 'product' ? 'Price text' : type === 'event' ? 'Time' : 'Value / secondary detail';
  return `<div class="editor-field interface-item-type"><label for="${e(fieldId)}">${e(t('Field or panel type'))}</label><select id="${e(fieldId)}" data-interface-item-section="${e(section.id)}" data-item-id="${e(item.id)}">${options(values, type)}</select></div>${field(`${itemBase}.title`, 'Label / title', item.title, { max: 180 })}${field(`${itemBase}.body`, bodyLabel, item.body, { multiline: !input, max: 1800 })}${field(`${itemBase}.meta`, input || ['checkbox', 'select', 'textarea'].includes(type) ? 'Help text / label' : 'Category / status', item.meta, { max: 120 })}${field(`${itemBase}.price`, valueLabel, item.price, { max: 80 })}`;
}
function renderIconPicker(section, item, index) {
  const effective = itemIconName(item, index), fieldId = `item-icon-${section.id}-${index}`;
  return `<div class="editor-field"><label for="${e(fieldId)}">${e(t("Icon"))}</label><div class="item-icon-picker"><span class="item-icon-preview" aria-hidden="true">${effective && effective !== 'none' ? icon(effective, 20) : '—'}</span><select id="${e(fieldId)}" data-item-icon-section="${e(section.id)}" data-item-index="${index}" data-item-id="${e(item.id)}">${options(Object.fromEntries(Object.entries(CONTENT_ICONS).map(([name, value]) => [name, value.label])), item.icon || 'default')}</select></div></div>`;
}
function renderItemCard(section, item, index, base) {
  const selected = state.selectedItemIndex === index, itemBase = `${base}.items.${index}`;
  const productImage = supportsProductImage(section, item.id) && !(selected && state.selectedPart === 'media') ? renderImageSize(section, item.id) + imageField(`${itemBase}.image`, item.image) + field(`${itemBase}.alt`, 'Image alternative text', item.alt, { max: 250 }) : '';
  const content = isInterfaceBlock(section) ? renderInterfaceItemFields(section, item, itemBase) + productImage
    : `${section.group === 'features' ? renderIconPicker(section, item, index) : ''}${field(`${itemBase}.title`, section.group === 'faq' ? 'Question' : 'Title', item.title, { max: 180 })}${field(`${itemBase}.body`, section.group === 'faq' ? 'Answer' : section.group === 'pricing' ? 'Included features, one per line' : 'Description', item.body, { multiline: true, max: 1800 })}${['gallery', 'pricing'].includes(section.group) ? field(`${itemBase}.meta`, section.group === 'pricing' ? 'Billing / price label' : 'Small caption', item.meta, { max: 120 }) : ''}${['pricing', 'services'].includes(section.group) ? field(`${itemBase}.price`, 'Price text', item.price, { max: 80 }) : ''}${['features', 'gallery', 'services', 'process', 'pricing', 'faq'].includes(section.group) ? field(`${itemBase}.href`, section.group === 'gallery' ? 'Card link' : 'Item link', item.href, { max: 2048, live: false, hint: 'Link this item title to a page, section or HTTPS destination. Leave blank for no link.' }) : ''}${section.group === 'gallery' && !(selected && state.selectedPart === 'media') ? renderImageSize(section, item.id) + imageField(`${itemBase}.image`, item.image) + field(`${itemBase}.alt`, 'Image alternative text', item.alt, { max: 250 }) : ''}`;
  return `<div class="editor-card${selected ? ' selected-item' : ''}" data-editor-item-index="${index}" data-editor-item-id="${e(item.id)}" data-section-id="${e(section.id)}"><div class="editor-card-header">${renderMoveControls(state.spec, { pageId: state.activePageId, sectionId: section.id, itemId: item.id }, { compact: true })}<span>${e(t(selected ? 'ITEM {count} · SELECTED' : 'ITEM {count}', { count: formatNumber(index + 1, { minimumIntegerDigits: 2 }) }))}</span><button class="icon-button" data-remove-item="${e(section.id)}" data-item-index="${index}" data-item-id="${e(item.id)}" aria-label="${e(t('Remove item {count}', { count: formatNumber(index + 1) }))}"${section.locked ? ' disabled' : ''}>${icon('trash', 12)}</button></div><button class="item-context-button" data-select-item="${e(section.id)}" data-item-index="${index}" data-item-id="${e(item.id)}" aria-pressed="${selected}">${icon('cursor', 12)}${e(t(selected ? 'Using this item as request context' : 'Use this item in a request'))}</button>${renderPartControls(section, item)}${content}</div>`;
}
function renderImageSize(section, itemId) {
  const owner = imageOwner(section, itemId); if (!owner) return '';
  const size = imageSizeOf(owner), limits = IMAGE_SIZE_LIMITS;
  const identity = `data-image-size-section="${e(section.id)}" data-image-size-page="${e(state.activePageId)}"${itemId ? ` data-image-size-item="${e(itemId)}"` : ''}`;
  const fieldId = `image-size-${section.id}-${itemId || 'section'}`;
  return `<fieldset class="image-size-controls"${section.locked ? ' disabled' : ''}><legend>${e(t('Image size'))}</legend><div class="image-size-dimensions"><div class="editor-field"><label for="${e(fieldId)}-width">${e(t('Width (%)'))}</label><input id="${e(fieldId)}-width" type="number" min="${limits.minWidth}" max="${limits.maxWidth}" step="1" value="${size.width}" ${identity} data-image-size-key="width"/></div><div class="editor-field"><label for="${e(fieldId)}-height">${e(t('Height (px)'))}</label><input id="${e(fieldId)}-height" type="number" min="${limits.minHeight}" max="${limits.maxHeight}" step="1" value="${size.height ?? ''}" placeholder="${e(t('Auto'))}" ${identity} data-image-size-key="height"/></div></div><div class="editor-field"><label for="${e(fieldId)}-fit">${e(t('Image fit'))}</label><select id="${e(fieldId)}-fit" ${identity} data-image-size-key="fit">${options({ cover: 'Fill frame (crop)', contain: 'Show whole image' }, size.fit)}</select></div><button type="button" class="button full-width" ${identity} data-reset-image-size>${e(t('Reset image size'))}</button></fieldset><p class="field-help">${e(t(section.locked ? 'Unlock this section before resizing its image.' : 'Width is relative to the image area. Leave height empty for the component default, or drag the image’s corner on the canvas.'))}</p>`;
}
function imageSizeSelection(target) {
  return { pageId: target.dataset.imageSizePage, sectionId: target.dataset.imageSizeSection, ...(target.dataset.imageSizeItem ? { itemId: target.dataset.imageSizeItem } : {}), partKey: 'media' };
}
function commitImageSizeField(target) {
  const selection = imageSizeSelection(target), section = state.spec.sections.find((entry) => entry.id === selection.sectionId);
  const owner = imageOwner(section, selection.itemId), key = target.dataset.imageSizeKey;
  if (!owner || !['width', 'height', 'fit'].includes(key)) throw new Error(t('This image is no longer available.'));
  if (!target.checkValidity()) { target.reportValidity(); return; }
  const value = key === 'fit' ? target.value : key === 'height' && target.value.trim() === '' ? null : target.valueAsNumber;
  const changed = commitImageSize(selection, { ...imageSizeOf(owner), [key]: value });
  if (changed) requestAnimationFrame(() => document.getElementById(target.id)?.focus({ preventScroll: true }));
}
function renderSelectedMedia(section, base) {
  if (state.selectedPart !== 'media') return '';
  const itemId = state.selectedItemId || undefined, owner = imageOwner(section, itemId);
  if (!owner) return '';
  const imageBase = itemId ? `${base}.items.${section.items.findIndex((item) => item.id === itemId)}` : base;
  return `<section id="selected-media-editor" tabindex="-1" aria-label="${e(t('Image settings'))}"><div class="content-heading"><h2>${e(t('Image'))}</h2><p>${e(t('Resize the image, replace it, or describe it for screen readers.'))}</p></div>${renderImageSize(section, itemId)}${imageField(`${imageBase}.image`, owner.image)}${field(`${imageBase}.alt`, 'Image alternative text', owner.alt, { max: 250 })}</section>`;
}
function renderContent() {
  const index = Math.max(0, state.spec.sections.findIndex((s) => s.id === state.selected)), s = state.spec.sections[index] || state.spec.sections[0], base = `sections.${index}`;
  if (!s) return `<div class="empty-page-inspector"><h2>${e(t('This page is empty.'))}</h2><p class="inspector-note">${e(t('Add a component to continue building. Deleted content can be recovered with Undo.'))}</p><button class="add-section" id="add-section-button">${icon('plus', 13)} ${e(t('Add a component'))}</button></div>`;
  const textSection = !['navigation', 'footer'].includes(s.group);
  return `<details class="details-block" open><summary>${e(t("Brand & site settings"))}</summary>${field('name', state.activePageId === HOME_PAGE_ID ? 'Project name' : 'Page title', state.spec.name, { max: state.activePageId === HOME_PAGE_ID ? 100 : 80 })}<p class="inspector-note">${e(t("Brand name, contact details and primary link are shared by every page."))}</p>${field('brand.name', 'Brand name', state.spec.brand.name, { max: 100 })}${field('brand.tagline', 'Tagline / page description', state.spec.brand.tagline, { multiline: true, max: 250 })}${field('brand.email', 'Public contact email', state.spec.brand.email, { max: 254, type: 'email', live: false, hint: 'Used by contact links and email-draft forms.' })}${field('brand.cta', 'Primary button label', state.spec.brand.cta, { max: 100 })}${field('brand.href', 'Primary link', state.spec.brand.href, { max: 2048, live: false, hint: 'Choose a page or section above, or enter https://, mailto: or tel:.' })}${field('brand.language', 'HTML language code', state.spec.brand.language, { max: 20, live: false, hint: 'For example en, fi or sv. This does not translate the copy.' })}</details>${renderSelectionBreadcrumbs(s)}${renderPartControls(s)}${renderSelectedMedia(s, base)}<div class="content-heading"><h2>${e(t(sectionLabel(s)))}</h2><p>${e(t(getBlock(s.block).source))}</p></div><div class="editor-field"><label for="section-variant">${e(t("Component variant"))}</label><select id="section-variant" data-variant="${e(s.id)}">${options(Object.fromEntries(blocksFor(s.group).map((b) => [b.id, b.name])), s.block)}</select></div>${renderPresentation(s)}${renderElements(s)}${renderInterfaceControls(s)}${textSection ? field(`${base}.eyebrow`, 'Small label', s.eyebrow, { max: 120 }) + field(`${base}.title`, isInterfaceBlock(s) ? 'Screen title' : 'Heading', s.title, { multiline: true, max: 300 }) : ''}${s.group !== 'navigation' ? field(`${base}.body`, s.group === 'footer' ? 'Footer description' : 'Description', s.body, { multiline: true, max: 3000 }) : `<p class="inspector-note">${e(t("Navigation links to sections on this page and pages marked to appear in navigation. Click a link in the preview to jump there. Use + in the navigation to add sections or pages."))}</p>`}${['hero', 'about', 'contact', 'cta', 'pricing'].includes(s.group) ? field(`${base}.button`, 'Button label', s.button, { max: 100 }) + (s.block === 'contact-form' || isInterfaceBlock(s) ? '' : field(`${base}.href`, 'Button destination', s.href, { max: 2048, live: false, hint: 'Leave blank to use the primary brand link.' })) : ''}${!isInterfaceBlock(s) && ['hero', 'about'].includes(s.group) && state.selectedPart !== 'media' ? ['hero-centered', 'about-statement'].includes(s.block) ? `<p class="inspector-note">${e(t("This variant has no image area. Choose a split or framed component variant to show an uploaded image."))}</p>` : renderImageSize(s) + imageField(`${base}.image`, s.image) + field(`${base}.alt`, 'Image alternative text', s.alt, { max: 250 }) : ''}${s.block === 'contact-form' ? `<p class="inspector-note">${e(t("This form prepares an email draft using the public contact email in Brand settings. Choose the simple contact variant to use a custom button destination."))}</p>` : ''}${isInterfaceBlock(s) || s.items.length || ['features', 'gallery', 'services', 'process', 'pricing', 'faq'].includes(s.group) ? `<div class="section-divider"></div><div class="inspector-heading"><h2>${e(t(isInterfaceBlock(s) ? 'Fields & panels' : s.group === 'faq' ? 'Questions & answers' : 'Content items'))}</h2><span class="subtle">${s.items.length} / 8</span></div>${s.items.map((it, i) => renderItemCard(s, it, i, base)).join('')}<button class="add-section" data-add-item="${s.id}"${s.locked || s.items.length >= 8 ? ' disabled' : ''}>${icon('plus', 12)} ${e(t(isInterfaceBlock(s) ? 'Add field or panel' : 'Add item'))}</button>` : ''}<div class="draft-note ${s.draft ? '' : 'reviewed'}">${e(t(s.draft ? 'This section contains prepared draft copy. Replace examples and verify facts before publishing.' : 'You have marked this section as reviewed.'))}<label class="draft-toggle"><input type="checkbox" data-reviewed="${s.id}"${s.draft ? '' : ' checked'}/>${e(t("I have reviewed this section for publication."))}</label></div><button class="button full-width" data-back-design>${e(t("Back to page structure"))}</button>`;
}
function renderAppliedChanges(report) {
  const changes = report.changes;
  const direction = Object.hasOwn(DIRECTIONS, report.strategy?.direction) ? DIRECTIONS[report.strategy.direction] : '';
  const journey = Object.hasOwn(JOURNEYS, report.strategy?.journey) ? JOURNEYS[report.strategy.journey].description : '';
  const operation = Object.hasOwn(OPERATION_LABELS, report.strategy?.operation) ? OPERATION_LABELS[report.strategy.operation] : 'Design request';
  const changeList = (items) => `<ul class="applied-changes">${items.map((change) => `<li><strong>${e(change.label)}</strong><span class="change-values"><span><span class="sr-only">${e(t("Before:"))} </span>${e(change.before)}</span><span class="change-arrow" aria-hidden="true">→</span><span><span class="sr-only">${e(t("After:"))} </span>${e(change.after)}</span></span></li>`).join('')}</ul>`;
  return `<section class="request-result" aria-labelledby="request-result-heading"><p class="micro-label">${e(t(operation))}</p><h3 id="request-result-heading">${e(t("Last request result"))}</h3>${direction || journey ? `<dl class="design-strategy">${direction ? `<div><dt>${e(t("Visual direction"))}</dt><dd>${e(t(direction))}</dd></div>` : ''}${journey ? `<div><dt>${e(t("Visitor flow"))}</dt><dd>${e(t(journey))}</dd></div>` : ''}</dl>` : ''}${Array.isArray(changes) ? changes.length ? `<p class="change-count">${e(t('Applied changes: {count}', { count: formatNumber(changes.length) }))}</p>${changeList(changes.slice(0, 6))}${changes.length > 6 ? `<details class="more-changes"><summary>${e(t('Show more changes: {count}', { count: formatNumber(changes.length - 6) }))}</summary>${changeList(changes.slice(6))}</details>` : ''}` : `<p class="no-changes">${e(t("No changes were applied. Review the notes below for locked choices or unsupported requests. Available controls include item icons, columns, alignment, buttons, decoration and exact quoted text; select a section to see the controls supported by its component."))}</p>` : `<p class="inspector-note">${e(t("This report does not include applied-change details."))}</p>`}<p class="report-snapshot-note">${e(t("Recorded when this request finished. Later manual edits are not included."))}</p></section>`;
}
function renderDecisions() {
  if (!state.report) return `<div class="empty-decisions"><span>${icon('spark', 26)}</span><h2 style="margin-top:20px">${e(t("Design, with a paper trail."))}</h2><p>${e(t("Build a site to see the component and theme choices returned by JEV, including its option probabilities and distribution confidence."))}</p><p>${e(t("The initial canvas is a prepared example. It is not a JEV result."))}</p><p>${e(t("Reports describe the current session. Download a report to keep it; project files store the site, not the prompt transcript."))}</p></div>`;
  const r = state.report;
  return `<div class="content-heading"><h2>${e(t(r.provider === 'demo' ? 'A local demonstration.' : 'Decisions, not guesswork.'))}</h2><p>${e(r.model)}</p></div>${renderAppliedChanges(r)}<div class="report-metrics"><div class="report-metric"><strong>${e(formatNumber(r.calls))}</strong><span>${e(t("JEV API calls"))}</span></div><div class="report-metric"><strong>${e(t('{seconds}s', { seconds: formatNumber(r.durationMs / 1000, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) }))}</strong><span>${e(t("Server composition time"))}</span></div><div class="report-metric"><strong>${e(formatNumber(r.inputTokens))}</strong><span>${e(t("Reported input tokens"))}</span></div><div class="report-metric"><strong>${e(formatNumber(r.decisions.length))}</strong><span>${e(t("Bounded decisions"))}</span></div></div><p class="inspector-note">${e(t(r.provider === 'demo' ? 'These are keyword-rule outputs, not JEV predictions. No probabilities or confidence are invented.' : 'Confidence measures the concentration of a choice distribution. It is not a visual-quality score or a guarantee of correctness.'))}</p><button class="button full-width" id="download-report">${icon('download', 13)} ${e(t('Download decision report'))}</button><div class="section-divider"></div>${state.warnings.map((w) => `<p class="report-warning">${e(w)}</p>`).join('')}<div class="inspector-heading"><h2>${e(t("Raw bounded decisions"))}</h2></div><div>${r.decisions.map((d) => `<details class="decision-entry"><summary><span><strong>${e(d.key.replaceAll('_', ' '))}</strong><br/><span>${e(d.choice)}</span></span><span>${e(d.confidence === null ? t('rule') : formatNumber(d.confidence, { style: 'percent', maximumFractionDigits: 0 }))}</span></summary><p>${e(d.question)}</p><p><strong>${e(t("Selected:"))}</strong> ${e(d.description)}</p>${Object.entries(d.probabilities).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([key, value]) => `<div class="decision-option"><span>${e(key)}</span><strong>${e(formatNumber(value, { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }))}</strong></div>`).join('')}</details>`).join('')}</div>`;
}
function renderInspector({ preserveScroll = false } = {}) {
  const inspector = $('#inspector-content');
  const scrollTop = inspector.scrollTop;
  const partDisclosures = new Map([...inspector.querySelectorAll('.part-management[data-parts-owner]')].map((node) => [node.dataset.partsOwner, node.open]));
  updateSelectionContext();
  $$('.inspector-tabs button').forEach((button) => button.classList.toggle('active', button.dataset.inspectorTab === state.inspectorTab));
  inspector.innerHTML = state.inspectorTab === 'content' ? renderContent() : state.inspectorTab === 'decisions' ? renderDecisions() : renderDesign();
  for (const node of inspector.querySelectorAll('.part-management[data-parts-owner]')) {
    if (partDisclosures.has(node.dataset.partsOwner)) node.open = partDisclosures.get(node.dataset.partsOwner);
  }
  if (preserveScroll) inspector.scrollTop = scrollTop;
  inspector.inert = state.busy;
}
function updatePromptCounter() {
  $('#prompt-counter').textContent = `${formatNumber($('#prompt').value.length)} / ${formatNumber(5000)}`;
}
function renderStarters() {
  $('#starters').innerHTML = PRESETS.map((preset, index) => `<button type="button" class="starter" data-preset="${index}">${icon(preset.icon, 16)}<span>${e(t(preset.name))}</span></button>`).join('');
}
function updatePageDialogLanguage() {
  const editing = Boolean(state.pageDialogId), template = $('#page-template').value;
  $('#page-dialog-heading').textContent = t(editing ? 'Page settings.' : 'Add a page.');
  $('#page-submit').textContent = t(editing ? 'Save page settings' : 'Create page');
  $('#page-template').querySelectorAll('option').forEach((option) => {
    if (Object.hasOwn(PAGE_TEMPLATES, option.value)) option.textContent = t(PAGE_TEMPLATES[option.value].label);
  });
  if (Object.hasOwn(PAGE_TEMPLATES, template)) $('#page-template-description').textContent = t(PAGE_TEMPLATES[template].description);
}
function changeEditorLanguage(locale) {
  // Language is editor presentation only. Retain pending field values and UI
  // disclosure state; never commit, reload the preview, or fetch project data.
  const inspector = $('#inspector-content');
  const pendingFields = [...inspector.querySelectorAll('input:not([type="file"]), textarea, select')].map((node) => ({ id: node.id, value: node.value, checked: node.checked }));
  const disclosures = [...inspector.querySelectorAll('details')].map((node) => node.open);
  const scrollTop = inspector.scrollTop;
  const active = document.activeElement;
  const focus = inspector.contains(active) ? { id: active.id, start: active.selectionStart, end: active.selectionEnd } : null;
  cancelGesture();
  setLocale(locale); translateStatic();
  updateHeader({ preserveInputs: true }); updateMode(); updateConnection();
  renderInspector(); renderLibrary(); renderPastProjects(); renderStarters(); renderActivity(); updatePromptCounter();
  for (const field of pendingFields) {
    const node = field.id ? document.getElementById(field.id) : null;
    if (node && inspector.contains(node)) { node.value = field.value; if (typeof field.checked === 'boolean') node.checked = field.checked; }
  }
  inspector.querySelectorAll('details').forEach((node, index) => { if (index < disclosures.length) node.open = disclosures[index]; });
  inspector.scrollTop = scrollTop;
  if (focus?.id) {
    const node = document.getElementById(focus.id);
    node?.focus({ preventScroll: true });
    if (typeof focus.start === 'number' && typeof node?.setSelectionRange === 'function') node.setSelectionRange(focus.start, focus.end);
  }
  $('#inspect-button').innerHTML = `${icon(state.inspect ? 'cursor' : 'eye', 12)}<span>${e(t(state.inspect ? 'Inspect' : 'Interact'))}</span>`;
  updateBusyCopy();
  if ($('#page-dialog').open) updatePageDialogLanguage();
  if ($('#projects-dialog').open) renderProjectList();
  if ($('#export-dialog').open) renderExportReview();
  resizePreview(); syncPreviewState();
}
function renderLibraryPlacements(entry) {
  const choices = libraryOptions(state.spec, entry, state.activePageId, t);
  if (!choices.length) return '';
  const encoded = e(JSON.stringify(entry));
  return `<details class="library-placement-menu"><summary>${e(t(entry.kind === 'section' ? 'Insert or replace…' : 'Replace icon in…'))}</summary>${choices.map((choice) => `<button type="button" data-library-choice="${encoded}" data-library-proposal="${e(JSON.stringify(choice.proposal))}">${e(choice.label)}</button>`).join('')}</details>`;
}
function renderLibrary() {
  const filter = $('#library-search').value.toLocaleLowerCase();
  const groupIcon = { navigation: 'menu', hero: 'frame', features: 'grid', about: 'circle', services: 'layers', gallery: 'frame', process: 'arrow', pricing: 'grid', faq: 'info', contact: 'mail', cta: 'bolt', footer: 'layers' };
  const groups = [{ label: 'Application interfaces', blocks: CATALOG.filter((block) => isInterfaceBlock(block.id)), icon: 'grid' }, ...GROUPS.map((group) => ({ label: GROUP_LABELS[group], blocks: blocksFor(group).filter((block) => !isInterfaceBlock(block.id)), icon: groupIcon[group] }))];
  $('#library-list').innerHTML = groups.map((group) => {
    const blocks = group.blocks.filter((b) => `${b.name} ${b.description} ${b.source} ${t(b.name)} ${t(b.description)} ${t(b.source)} ${t(group.label)}`.toLocaleLowerCase().includes(filter));
    return blocks.length ? `<h3 class="library-group-title">${e(t(group.label))}</h3>${blocks.map((b) => `<div class="library-entry"><button class="library-drag-grip" data-library-entry="${e(JSON.stringify({ kind: 'section', blockId: b.id }))}" aria-label="${e(t('Drag {name} onto the canvas', { name: t(b.name) }))}">${GRIP_SVG}</button><button class="library-card" data-add-block="${b.id}" title="${e(t(b.description))}"><span>${icon(group.icon, 17)}</span><span><strong>${e(t(b.name))}</strong><small>${e(t(b.source))}</small></span>${icon('plus', 13)}</button></div>${renderLibraryPlacements({ kind: 'section', blockId: b.id })}`).join('')}` : '';
  }).join('') || `<p class="muted-message">${e(t("No matching component."))}</p>`;
  const iconGroup = (label, catalog, slot) => {
    const entries = Object.entries(catalog).filter(([name, entry]) => name !== 'default' && name !== 'none' && `${entry.label || entry.name || name} ${t(entry.label || entry.name || name)} ${name}`.toLocaleLowerCase().includes(filter));
    if (!entries.length) return '';
    return `<details class="library-icon-group"${filter ? ' open' : ''}><summary>${e(t(label))}</summary><p class="inspector-note">${e(t("Drag a grip onto a compatible icon to replace it, or select the destination and click an icon."))}</p><div class="library-icon-grid">${entries.map(([name, entry]) => {
      const encoded = e(JSON.stringify({ kind: 'icon', icon: name, slot })), title = entry.label || entry.name || name;
      return `<div class="library-entry"><button class="library-drag-grip" data-library-entry="${encoded}" aria-label="${e(t('Drag {name} to replace an icon', { name: t(title) }))}">${GRIP_SVG}</button><button class="library-icon-choice" data-apply-library-entry="${encoded}" aria-label="${e(t('Replace selected icon with {name}', { name: t(title) }))}">${icon(name, 20)}<span>${e(t(title))}</span></button></div>${renderLibraryPlacements({ kind: 'icon', icon: name, slot })}`;
    }).join('')}</div></details>`;
  };
  $('#library-list').insertAdjacentHTML('beforeend', iconGroup('Feature icons', CONTENT_ICONS, 'feature-icon') + iconGroup('Button icons', BUTTON_ICONS, 'button-icon'));
}
function showPanel(panel) { $('.workspace').dataset.panel = panel; $$('.mobile-workspace-nav button').forEach((button) => button.classList.toggle('active', button.dataset.panel === panel)); requestAnimationFrame(resizePreview); }
function setLeftTab(tab) {
  state.leftTab = tab;
  $('#brief-content').hidden = tab !== 'brief';
  $('#library-content').hidden = tab !== 'library';
  $('#projects-content').hidden = tab !== 'projects';
  $$('[data-left-tab]').forEach((b) => b.classList.toggle('active', b.dataset.leftTab === tab));
  if (tab === 'library') renderLibrary();
  if (tab === 'projects') refreshPastProjects();
}
function updateBusyCopy() {
  $('#busy-heading').textContent = t(state.operation === 'create' ? 'Starting from a blank canvas.' : state.mode === 'demo' ? 'Trying a new direction.' : 'Finding the right shape.');
  $('#busy-message').textContent = t(state.mode === 'demo' ? 'Using local demonstration rules. No JEV request is made.' : 'JEV selects the layout, application controls and supported design settings from your brief. Exact wording comes from your request.');
  $('#busy-preservation-note').textContent = t(state.operation === 'create' ? 'Your previous project stays saved. The new project appears when it is ready.' : 'Your current site is kept until the changes are ready.');
}
function setBusy(value) {
  if (value) { cancelGesture('Composition started.'); updateBusyCopy(); }
  state.busy = value; syncPreviewState(); $('#build-fields').disabled = value; $('#busy-overlay').hidden = !value; $('#cancel-button').hidden = !value;
  $('#canvas-area').classList.toggle('new-design-pending', value && state.operation === 'create');
  $('#inspector-content').inert = value; $('#library-content').inert = value; $('#projects-content').inert = value;
  ['#new-button', '#sidebar-new-button', '#sidebar-import-button', '#projects-button', '#export-button', '#save-button', '#settings-button', '#page-submit', '#delete-page-button'].forEach((selector) => { const el = $(selector); if (el) el.disabled = value; });
  updateHeader();
}
function getPathValue(object, path) { return path.split('.').reduce((current, part) => current?.[part], object); }
function assignPath(object, path, value) {
  if (!/^(?:name|brand\.(?:name|tagline|email|cta|href|language)|sections\.\d+\.(?:eyebrow|title|body|button|href|image|alt|items\.\d+\.(?:title|body|meta|price|image|alt|href)))$/.test(path)) throw new Error(t("Unsupported editable field."));
  const parts = path.split('.'); let current = object;
  for (const part of parts.slice(0, -1)) current = current[part];
  current[parts.at(-1)] = value;
}
async function imageToDataUrl(file) {
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/avif'].includes(file.type)) throw new Error(t("Choose a PNG, JPEG, WebP or AVIF image. SVG uploads are intentionally not supported."));
  if (file.size > 12000000) throw new Error(t("Choose an image smaller than 12 MB."));
  const bytes = new Uint8Array(await file.arrayBuffer());
  try { inspectRaster(bytes, file.type); } catch { throw new Error(t("Choose a valid, static PNG, JPEG, WebP or AVIF image (at most 8192 pixels per side and 24 million pixels).")); }
  let bitmap;
  try { bitmap = await createImageBitmap(file); } catch { throw new Error(t("The browser could not read this image. Try PNG or JPEG.")); }
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width > RASTER_LIMITS.maxDimension || bitmap.height > RASTER_LIMITS.maxDimension || bitmap.width * bitmap.height > RASTER_LIMITS.maxPixels) throw new Error(t("This image remains too large. Resize it before uploading."));
    let dimension = 1400;
    for (let attempt = 0; attempt < 5; attempt++) {
      const scale = Math.min(1, dimension / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d'); if (!context) throw new Error(t("Could not prepare this image."));
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const result = canvas.toDataURL('image/webp', .86 - attempt * .07);
      if (result.length <= 700000) { inspectRasterDataUrl(result); return result; }
      dimension *= .8;
    }
    throw new Error(t("This image remains too large. Resize it before uploading."));
  } finally { bitmap.close(); }
}
function downloadBlob(blob, name) { const url = URL.createObjectURL(blob), anchor = document.createElement('a'); anchor.href = url; anchor.download = name; document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000); }
function filename(suffix) { return `${state.spec.brand.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'website'}${suffix}`; }
function downloadJson(value, suffix) { downloadBlob(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }), filename(suffix)); }
function renderProjectCardsHtml(projects, skipped = 0) {
  const cards = projects.length ? projects.map((project) => {
    const palette = Object.hasOwn(THEMES, project.palette) ? project.palette : 'stone';
    const active = state.project?.id === project.id;
    return `<div class="project-card${active ? ' active' : ''}"><span class="project-color" style="background:${THEMES[palette].bg};color:${THEMES[palette].accent}">${icon('globe', 19)}</span><button class="project-open" data-open-project="${e(project.id)}"${active ? ' aria-current="true"' : ''}><strong>${e(project.name)}</strong><small>${e(t('Pages: {count} · Sections: {sections} · {date}', { count: formatNumber(project.pageCount || 1), sections: formatNumber(project.sectionCount), date: formatDate(project.updatedAt) }))}</small></button><button class="icon-button" data-delete-project="${e(project.id)}" data-revision="${project.revision}" title="${e(t('Delete {name}', { name: project.name }))}" aria-label="${e(t('Delete {name}', { name: project.name }))}">${icon('trash', 14)}</button></div>`;
  }).join('') : `<p class="project-empty">${e(t('Your saved projects will appear here.'))}</p>`;
  const warning = skipped ? `<p class="report-warning">${e(t('Unreadable files skipped: {count}. No files were deleted.', { count: formatNumber(skipped) }))}</p>` : '';
  return cards + warning;
}
function renderPastProjects() {
  const countEl = $('#past-projects-count');
  if (countEl) countEl.textContent = formatNumber(state.pastProjects.length);
  const listEl = $('#past-projects-list');
  if (!listEl) return;
  if (!state.pastProjectsLoaded && !state.pastProjects.length) {
    listEl.innerHTML = `<p class="muted-message">${e(t("Reading local projects…"))}</p>`;
    return;
  }
  listEl.innerHTML = renderProjectCardsHtml(state.pastProjects, state.pastProjectsSkipped);
}
async function refreshPastProjects() {
  if (!state.pastProjectsLoaded && !state.pastProjects.length && $('#past-projects-list')) {
    $('#past-projects-list').innerHTML = `<p class="muted-message">${e(t("Reading local projects…"))}</p>`;
  }
  if (state.hostedClient) {
    const result = await api('/api/projects');
    state.pastProjects = result.projects; state.pastProjectsSkipped = result.skipped || 0; state.pastProjectsLoaded = true; state.projectsResult = result;
    renderPastProjects(); if ($('#projects-dialog')?.open) renderProjectList();
    return result;
  }
  const [apiResult, idbProjects] = await Promise.all([api('/api/projects').catch(() => null), idbListProjects()]);
  const byId = new Map();
  if (apiResult?.projects) {
    const serverIds = new Set(apiResult.projects.map((item) => item.id));
    for (const item of idbProjects) {
      if (serverIds.has(item.id)) byId.set(item.id, item);
      else await idbDeleteProject(item.id);
    }
    for (const item of apiResult.projects) {
      const existing = byId.get(item.id);
      if (!existing || String(item.updatedAt || '') >= String(existing.updatedAt || '')) byId.set(item.id, item);
    }
  } else {
    for (const item of idbProjects) byId.set(item.id, item);
  }
  state.pastProjects = [...byId.values()].sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  state.pastProjectsSkipped = apiResult?.skipped || 0;
  state.pastProjectsLoaded = true;
  state.projectsResult = { projects: state.pastProjects, skipped: state.pastProjectsSkipped };
  renderPastProjects();
  if ($('#projects-dialog')?.open) renderProjectList();
  return state.projectsResult;
}
async function openProjects() {
  state.projectsResult = null;
  if (!$('#projects-dialog').open) $('#projects-dialog').showModal(); $('#project-list').innerHTML = `<p class="muted-message">${e(t("Reading local projects…"))}</p>`;
  try {
    await refreshPastProjects();
    renderProjectList();
  } catch (error) { $('#project-list').textContent = error.message; }
}
function renderProjectList() {
  const data = state.projectsResult;
  if (!data) return;
  $('#project-list').innerHTML = renderProjectCardsHtml(data.projects, data.skipped);
}
async function loadProject(projectId) {
  if (state.dirty) await saveProject();
  let project;
  try {
    project = await api(`/api/projects/${projectId}`);
    await idbPutProject(project, project.spec);
  } catch (error) {
    if (state.hostedClient) throw error;
    if (error.status === 404) { await idbDeleteProject(projectId); throw error; }
    const cached = await idbGetProject(projectId);
    if (!cached) throw error;
    project = cached;
  }
  state.site = validateSpec(project.spec); resetPageView(HOME_PAGE_ID, undefined, { newProject: true }); state.project = project; state.history = project.history || [];
  state.undo = []; state.redo = []; state.report = null; state.warnings = []; state.selected = defaultSectionId(); state.dirty = false; state.change++;
  state.operation = 'edit'; $('#operation').value = 'edit'; state.activities = []; $('#activity').innerHTML = '';
  $('#prompt').value = ''; $('#prompt').placeholder = t('Describe a change. For example: make it dark, keep the fonts, and move the gallery before services.');
  rememberProject(); updateMode(); updateHeader(); renderInspector(); renderPastProjects(); renderPreview();
}
async function newProject() {
  if (state.busy) return;
  if (state.dirty) await saveProject();
  clearTimeout(state.saveTimer); state.site = validateSpec(createSpec('Your brand')); resetPageView(HOME_PAGE_ID, undefined, { newProject: true }); state.project = null; state.history = []; state.report = null; state.warnings = []; state.undo = []; state.redo = []; state.selected = defaultSectionId(); state.dirty = false; state.change++;
  state.operation = 'create'; $('#operation').value = 'create'; $('#prompt').value = ''; updatePromptCounter();
  $('#projects-dialog').close(); rememberProject(); updateMode(); updateHeader(); renderInspector(); renderPastProjects(); renderPreview(); setLeftTab('brief'); showPanel('brief'); $('#prompt').focus(); activity('A new canvas.', 'Describe the website or application screen you want.');
}
async function submitDesign(event) {
  event.preventDefault(); if (state.busy) return;
  const prompt = $('#prompt').value.trim(); if (prompt.length < 3) { $('#prompt').reportValidity(); return; }
  if (state.hostedClient && state.mode === 'jev' && !state.status.personalKeyConfigured && (!state.status.configured || state.status.freeAllowance.resetAt !== null && state.status.freeAllowance.resetAt <= Date.now())) {
    await refreshStatus().catch(() => {});
    if (state.busy) return;
  }
  if (state.mode === 'jev' && !state.status?.configured) { offerPersonalKey(state.hostedClient ? 'Free JEV is currently unavailable. Connect your own TypeSafe or OpenRouter API key, or use Offline demo.' : ''); toast('Connect a TypeSafe or OpenRouter API key, then build your site. Offline demo is available without a key.'); return; }
  const newDesign = state.operation === 'create';
  let designApplied = false, designSaved = false;
  state.controller = new AbortController(); setBusy(true); showPanel('canvas');
  try { await saveProject(); } catch (error) { state.controller = null; setBusy(false); toast(t('Could not save your starting point: {message}', { message: error.message }), 'error'); return; }
  if (state.controller.signal.aborted) { state.controller = null; setBusy(false); toast('Request cancelled.'); return; }
  updateBusyCopy();
  try {
    const previousPage = state.spec;
    const output = await api('/api/compose', { method: 'POST', data: { spec: state.site, pageId: state.activePageId, prompt, mode: state.mode, operation: state.operation, locks: state.locks, ...(state.selected ? { selectedSectionId: state.selected } : {}), ...(state.selectedItemIndex === null ? {} : { selectedItemId: state.selectedItemId, selectedItemIndex: state.selectedItemIndex }), ...(state.selectedPart ? { selectedPartKey: state.selectedPart } : {}) }, signal: state.controller.signal });
    const next = validateSpec(output.spec);
    if (newDesign !== (output.freshProject === true) || newDesign && next.pages.length) throw new Error(t('The design response did not match the requested project operation. Your current project was kept.'));
    if (state.controller.signal.aborted) throw new DOMException('Request cancelled.', 'AbortError');
    pushUndo('Before design request');
    if (newDesign) { state.project = null; state.history = []; }
    state.site = next; state.change++; state.dirty = true; designApplied = true;
    state.controller = null; $('#cancel-button').hidden = true;
    if (newDesign) { resetPageView(HOME_PAGE_ID, undefined, { newProject: true }); rememberProject(); }
    else normalizeSelection({ previousPage });
    state.report = output.report; state.warnings = output.warnings; state.pendingScroll = true;
    state.inspectorTab = 'decisions';
    state.operation = 'edit'; $('#operation').value = 'edit'; updateMode(); updateHeader(); renderInspector();
    const previewReady = await renderPreview();
    await saveProject(newDesign ? {} : { checkpoint: true, label: `Before: ${prompt.slice(0, 130)}` });
    designSaved = true;
    const appliedCount = state.report.changes?.length;
    const changeSummary = appliedCount === 0 ? 'No changes were applied. Open Decisions to review the result and any notes.' : Number.isInteger(appliedCount) ? 'Applied changes: {count}. Open Decisions to review the result and any notes.' : 'Sections assembled: {count}. Open Decisions to review the result and any notes.';
    activity(state.mode === 'demo' ? 'Demo request complete.' : 'Design request complete.', changeSummary, false, { count: Number.isInteger(appliedCount) ? appliedCount : state.spec.sections.length });
    toast(newDesign ? 'New project saved. Your previous project is still available in Projects.' : appliedCount === 0 ? 'Request complete. No changes were applied; see Decisions for details.' : state.mode === 'demo' ? 'Demo ready. This used local rules, not JEV.' : 'Design ready. Your previous version is kept as a checkpoint.', 'success');
    if (!previewReady) toast('The design is saved. Select Preview to retry loading the canvas.', 'error');
    if (state.mode === 'jev') { if (!state.hostedClient) state.status.verified = true; updateConnection(); }
    $('#prompt').value = ''; updatePromptCounter();
  } catch (error) {
    if (designApplied) {
      if (!designSaved) state.dirty = true;
      const message = designSaved ? 'The design is saved, but the editor could not finish updating. {message}' : 'The design is applied and remains in this canvas. Use Save checkpoint to retry saving. {message}';
      activity(designSaved ? 'Design saved; editor update incomplete.' : 'Design applied; local save incomplete.', message, true, { message: error.message });
      toast(t(message, { message: error.message }), 'error');
    } else if (error.name === 'AbortError') { activity('Request cancelled.', 'Your site was not replaced. A provider call already sent may still be billed.'); toast('Request cancelled.'); }
    else { activity('Design request did not finish.', error.message, true); toast(error.message, 'error'); if (state.hostedClient && ['free_limit', 'free_unavailable'].includes(error.code)) offerPersonalKey(error.message); }
  } finally {
    state.controller = null;
    if (newDesign && designApplied && !state.displayed) { $('#preview-frame').srcdoc = ''; state.source = ''; $('#source-code').textContent = ''; }
    setBusy(false); renderInspector();
  }
}
function renderExportReview() {
  const pages = pageEntries(state.site), sections = pages.flatMap((page) => getPageSpec(state.site, page.id).sections);
  const drafts = sections.filter((s) => s.draft).length;
  const missingAlt = sections.reduce((sum, s) => sum + Number(Boolean(s.image && !s.alt)) + s.items.filter((it) => it.image && !it.alt).length, 0);
  $('#export-review').innerHTML = `<p><strong>${e(t('Pages: {count} · Sections: {sections}', { count: formatNumber(pages.length), sections: formatNumber(sections.length) }))}</strong> · ${e(t('Responsive layouts'))}</p><p>${pages.map((page) => e(page.id === HOME_PAGE_ID ? 'index.html' : `${page.slug}.html`)).join(' · ')}</p><p>${e(drafts ? t('Sections with draft copy: {count}. Review them before publishing.', { count: formatNumber(drafts) }) : t('All sections are marked as reviewed.'))}</p>${missingAlt ? `<p>${e(t('Uploaded images needing alternative text: {count}. Describe informative images in the Content tab.', { count: formatNumber(missingAlt) }))}</p>` : ''}${!state.spec.brand.email && sections.some((s) => s.group === 'contact') ? `<p>${e(t('No contact email is configured. The email-draft form is disabled until one is added.'))}</p>` : ''}<p>${e(t('Decorative abstract visuals are placeholders, not photographs of your business. Blog and article pages are editable static pages.'))}</p>`;
}
function exportReview() {
  renderExportReview();
  $('#export-dialog').showModal();
}
// NEW: Delegated events keep the dynamic inspector lightweight and prevent listeners
// from piling up when a section or design tab is re-rendered.
document.addEventListener('click', async (event) => {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest('button'); if (!button || button.disabled) return;
  try {
    if (button.dataset.libraryProposal) {
      const entry = JSON.parse(button.dataset.libraryChoice), proposal = JSON.parse(button.dataset.libraryProposal);
      const choice = libraryOptions(state.spec, entry, state.activePageId, t).find((option) => JSON.stringify(option.proposal) === JSON.stringify(proposal));
      if (choice) commitMove(choice.proposal, choice.label, { surface: 'preview' });
      else toast('This destination changed. Choose a current library destination.');
      return;
    }
    if (button.dataset.applyLibraryEntry) {
      const entry = JSON.parse(button.dataset.applyLibraryEntry);
      const choice = libraryOptions(state.spec, entry, state.activePageId, t).find(({ proposal }) => proposal.sectionId === state.selected && (proposal.itemId || null) === state.selectedItemId);
      if (choice) commitMove(choice.proposal, choice.label);
      else toast('Select a compatible icon on the canvas first, then choose its replacement.');
      return;
    }
    if (button.dataset.structureSelect) {
      const selection = JSON.parse(button.dataset.structureSelect);
      if (validSelection(selection) && !state.busy) selectSection(selection.sectionId, { itemId: selection.itemId, partKey: selection.partKey, scroll: true });
      return;
    }
    if (button.dataset.deleteSelection || button.dataset.restorePart) {
      deleteSelection(JSON.parse(button.dataset.deleteSelection || button.dataset.restorePart), { restore: Boolean(button.dataset.restorePart) }); return;
    }
    if (button.dataset.structureProposal) {
      const proposal = JSON.parse(button.dataset.structureProposal);
      const choice = moveOptions(state.spec, { pageId: state.activePageId, sectionId: proposal.sectionId, ...(proposal.itemId ? { itemId: proposal.itemId } : {}), ...(proposal.partKey ? { partKey: proposal.partKey } : {}) }, t).find((entry) => JSON.stringify(entry.proposal) === JSON.stringify(proposal));
      if (choice) commitMove(choice.proposal, choice.label);
      return;
    }
    if (button.dataset.close) { $(`#${button.dataset.close}`).close(); return; }
    if (button.dataset.panel) { showPanel(button.dataset.panel); return; }
    if (button.dataset.leftTab) { setLeftTab(button.dataset.leftTab); return; }
    if (button.dataset.inspectorTab) { state.inspectorTab = button.dataset.inspectorTab; renderInspector(); return; }
    if (button.dataset.device) { state.device = button.dataset.device; $$('[data-device]').forEach((b) => b.classList.toggle('active', b === button)); resizePreview(); return; }
    if (button.dataset.preset !== undefined && !state.busy) {
      const preset = PRESETS[Number(button.dataset.preset)];
      $('#prompt').value = `Brand: ${JSON.stringify(preset.brand)}\n${preset.brief}`; updatePromptCounter(); $('#operation').value = 'create'; updateMode(); $('#prompt').focus(); return;
    }
    if (button.dataset.palette) { commit((spec) => { spec.theme.palette = button.dataset.palette; }, 'Change palette'); return; }
    if (button.dataset.lockSetting && !state.busy) { const key = button.dataset.lockSetting; state.locks[key] = !state.locks[key]; renderInspector(); return; }
    if (button.dataset.selectSection) { selectSection(button.dataset.selectSection, { scroll: true, content: true }); return; }
    if (button.dataset.selectItem) {
      const section = state.spec.sections.find((candidate) => candidate.id === button.dataset.selectItem), itemIndex = section?.items.findIndex((item) => item.id === button.dataset.itemId) ?? -1;
      if (state.busy || !section || !Number.isInteger(itemIndex) || itemIndex < 0 || !section.items[itemIndex]) return;
      selectSection(section.id, { scroll: true, content: true, itemIndex });
      if (state.operation === 'create') { $('#operation').value = 'edit'; updateMode(); }
      setLeftTab('brief'); showPanel('brief'); $('#prompt').focus(); return;
    }
    if (button.dataset.lockSection) { commit((spec) => { const s = spec.sections.find((x) => x.id === button.dataset.lockSection); s.locked = !s.locked; }, 'Toggle section lock'); return; }
    if (button.dataset.removeSection) {
      deleteSelection({ pageId: state.activePageId, sectionId: button.dataset.removeSection }); return;
    }
    if (button.dataset.moveSection) {
      const index = state.spec.sections.findIndex((s) => s.id === button.dataset.moveSection), target = index + (button.dataset.direction === 'up' ? -1 : 1);
      const current = state.spec.sections[index], neighbor = state.spec.sections[target];
      if (!neighbor || current.locked || neighbor.locked || ['navigation', 'hero', 'footer'].includes(neighbor.group)) { toast('This move would cross a fixed or locked section.'); return; }
      commitMove({ kind: 'section', pageId: state.activePageId, sectionId: current.id, beforeSectionId: button.dataset.direction === 'up' ? neighbor.id : state.spec.sections[target + 1]?.id ?? null }, 'Move section'); return;
    }
    if (button.dataset.addBlock) {
      const block = getBlock(button.dataset.addBlock); if (!block) throw new Error(t('This component is no longer available.')); addSection(block.group, block.id); return;
    }
    if (button.dataset.addItem) { commit((spec) => { const s = spec.sections.find((x) => x.id === button.dataset.addItem); if (!s || s.locked) throw new Error(t('Unlock this section before changing its item list.')); if (s.items.length < 8) { s.items.push({ id: newItemId(), title: 'New item', body: isInterfaceBlock(s) ? '' : 'Add your description.', meta: '', price: '', image: '', alt: '', href: '', icon: 'default', uiType: interfaceItemTypesFor(s)[1] || 'default' }); s.draft = true; } }, 'Add content item'); return; }
    if (button.dataset.removeItem) {
      deleteSelection({ pageId: state.activePageId, sectionId: button.dataset.removeItem, itemId: button.dataset.itemId }); return;
    }
    if (button.hasAttribute('data-reset-image-size')) { commitImageSize(imageSizeSelection(button), { width: 100, height: null, fit: 'cover' }); return; }
    if (button.dataset.clearImage) { const path = resolveFieldPath(button.dataset.clearImage, captureFieldReference(button)); commit((spec) => assignPath(spec, path, ''), 'Remove image'); return; }
    if (button.hasAttribute('data-back-design')) { state.inspectorTab = 'design'; renderInspector(); return; }
    if (button.dataset.openProject) { await loadProject(button.dataset.openProject); $('#projects-dialog').close(); if (window.innerWidth <= 950) showPanel('canvas'); return; }
    if (button.dataset.deleteProject) {
      if (!confirm(t('Delete this saved project and its checkpoints? This cannot be undone. Export its JSON first to keep a backup.'))) return;
      const deleteId = button.dataset.deleteProject;
      await api(`/api/projects/${deleteId}`, { method: 'DELETE', data: { expectedRevision: Number(button.dataset.revision) } }).catch((error) => { if (error.status !== 404) throw error; });
      await idbDeleteProject(deleteId);
      if (state.project?.id === deleteId) { clearTimeout(state.saveTimer); state.project = null; state.history = []; state.dirty = false; rememberProject(); updateHeader(); }
      await refreshPastProjects(); return;
    }
    if (button.dataset.restoreHistory) {
      let snapshot;
      try {
        snapshot = await api(`/api/projects/${state.project.id}/history/${button.dataset.restoreHistory}`);
      } catch (error) {
        if (state.hostedClient) throw error;
        const cached = await idbGetProject(state.project?.id);
        snapshot = cached?.history?.find((entry) => entry.id === button.dataset.restoreHistory);
        if (!snapshot?.spec) throw error;
      }
      pushUndo('Before checkpoint restore'); state.site = validateSpec(snapshot.spec); resetPageView(pageEntries(state.site).some((page) => page.id === state.activePageId) ? state.activePageId : HOME_PAGE_ID); markChanged(); await saveProject({ checkpoint: true, label: 'Before restoring checkpoint' }); renderInspector(); toast('Checkpoint restored.', 'success'); return;
    }
    switch (button.id) {
      case 'help-button': $('#help-dialog').showModal(); break;
      case 'settings-button': $('#settings-dialog').showModal(); break;
      case 'projects-button': await openProjects(); break;
      case 'new-button': case 'modal-new-button': case 'sidebar-new-button': await newProject(); break;
      case 'cancel-button': state.controller?.abort(); break;
      case 'add-page-button': openPageDialog(); break;
      case 'page-settings-button': openPageDialog('general', true); break;
      case 'delete-page-button': {
        const pageId = state.pageDialogId, page = state.site.pages.find((item) => item.id === pageId);
        if (!page || state.busy) break;
        if (!confirm(t('Delete “{title}” and its sections? Links to this page will be cleared. You can undo this change.', { title: page.title }))) break;
        if (commitSite((site) => removePage(site, pageId), `Delete ${page.title}`)) { $('#page-dialog').close(); renderPreview(); showPanel('canvas'); toast('Page deleted. Undo is available.'); }
        break;
      }
      case 'save-button': await saveProject({ checkpoint: true, label: 'Manual checkpoint', snapshotCurrent: true }); renderInspector(); toast('Saved on this computer.', 'success'); break;
      case 'undo-button': case 'redo-button': {
        if (state.busy) break;
        const backwards = button.id === 'undo-button', from = backwards ? state.undo : state.redo, to = backwards ? state.redo : state.undo;
        const previous = from.pop(); if (!previous) break;
        cancelGesture('History changed.');
        to.push(historySnapshot(previous.label)); state.site = validateSpec(previous.spec); resetPageView(pageEntries(state.site).some((page) => page.id === previous.pageId) ? previous.pageId : HOME_PAGE_ID, undefined, { newProject: true });
        state.pageLocks = new Map((previous.pageLocks || []).filter(([pageId]) => pageEntries(state.site).some((page) => page.id === pageId)));
        state.locks = clone(previous.locks || state.pageLocks.get(state.activePageId) || defaultLocks()); state.pageLocks.set(state.activePageId, state.locks);
        if (previous.selection && validSelection({ ...previous.selection, partKey: undefined })) assignSelection(previous.selection);
        state.pendingScroll = true; state.pendingFocus = true; markChanged(); renderInspector(); break;
      }
      case 'inspect-button': cancelGesture(); state.inspect = !state.inspect; syncPreviewState(); button.classList.toggle('active', state.inspect); button.setAttribute('aria-pressed', String(state.inspect)); button.innerHTML = `${icon(state.inspect ? 'cursor' : 'eye', 12)}<span>${e(t(state.inspect ? 'Inspect' : 'Interact'))}</span>`; sendPreview('mode', { edit: state.inspect }); break;
      case 'canvas-preview-tab': case 'canvas-code-tab': { const code = button.id === 'canvas-code-tab'; $('#canvas-preview-tab').classList.toggle('active', !code); $('#canvas-code-tab').classList.toggle('active', code); $('#preview-shell').hidden = code; $('#code-view').hidden = !code; if (!code && !state.busy && (!state.displayed || state.displayed.change !== state.change)) await renderPreview(); break; }
      case 'copy-code-button': await navigator.clipboard.writeText(state.source); toast('Rendered HTML copied. Export the site to include its CSS and behavior.'); break;
      case 'download-json-button': downloadJson(state.site, '.project.json'); break;
      case 'download-report': downloadJson({ report: state.report, warnings: state.warnings }, '.decisions.json'); break;
      case 'add-section-button': setLeftTab('library'); showPanel('brief'); break;
      case 'theme-button': syncEditorTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'); break;
      case 'cookie-accept-button': syncCookieBanner(true); break;
      case 'import-button': case 'sidebar-import-button': $('#import-file').click(); break;
      case 'export-button': exportReview(); break;
      case 'export-confirm': {
        button.disabled = true;
        try { const zip = await api('/api/export', { method: 'POST', data: { spec: state.site }, blob: true }); downloadBlob(zip, filename('.website.zip')); $('#export-dialog').close(); toast('Website exported.', 'success'); }
        finally { button.disabled = false; } break;
      }
      case 'disconnect-button': await api('/api/connection', { method: 'DELETE' }); $('#api-key').value = ''; await refreshStatus(); setConnectionFeedback(state.hostedClient ? 'Disconnected. The API key was removed from this tab.' : 'Disconnected. Environment keys stay disabled until restart.'); break;
    }
  } catch (error) { toast(error.message || 'This action could not be completed.', 'error'); }
});
function commitField(target) {
  if (!target.dataset.field) return;
  const path = resolveFieldPath(target.dataset.field, captureFieldReference(target));
  if (getPathValue(state.spec, path) === target.value) return;
  const buttonMatch = /^sections\.(\d+)\.button$/.exec(path);
  const applied = commit((spec) => {
    assignPath(spec, path, target.value);
    if (buttonMatch) spec.sections[Number(buttonMatch[1])].elements.buttonLabel = 'default';
  }, 'Edit content', { render: false, key: path });
  if (applied && buttonMatch) {
    const section = state.spec.sections[Number(buttonMatch[1])], labelChoice = $(`[data-element-section="${section.id}"][data-element-key="buttonLabel"]`);
    if (labelChoice) { labelChoice.value = 'default'; const hint = $(`#element-${section.id}-buttonLabel-hint`); if (hint) hint.textContent = t(elementOptionsFor(section, 'buttonLabel').default); }
  }
  if (!applied) target.value = getPathValue(state.spec, path) || '';
}
function commitPresentation(target) {
  const sectionId = target.dataset.presentationSection, key = target.dataset.presentationKey;
  const section = state.spec.sections.find((candidate) => candidate.id === sectionId);
  if (!section || !sectionPresentationFields(section).includes(key) || !Object.hasOwn(PRESENTATION[key], target.value)) throw new Error(t("Unsupported section presentation choice."));
  const applied = commit((spec) => { spec.sections.find((candidate) => candidate.id === sectionId).presentation[key] = target.value; }, `Change ${PRESENTATION_LABELS[key].toLowerCase()}`);
  if (!applied) target.value = section.presentation[key];
}
function commitElement(target) {
  const sectionId = target.dataset.elementSection, key = target.dataset.elementKey;
  const section = state.spec.sections.find((candidate) => candidate.id === sectionId);
  if (!section || isInterfaceBlock(section) || !elementFieldsFor(section).includes(key) || !Object.hasOwn(elementOptionsFor(section, key), target.value)) throw new Error(t("Unsupported internal element choice."));
  const applied = commit((spec) => {
    const selected = spec.sections.find((candidate) => candidate.id === sectionId); selected.elements[key] = target.value;
    if (key === 'featuredItem') selected.featuredItemId = selected.items[target.value === 'default' ? (selected.block === 'pricing-featured' ? 1 : -1) : ITEM_ORDINALS.indexOf(target.value)]?.id ?? null;
  }, `Change ${ELEMENT_CONTROLS[key].label.toLowerCase()}`);
  if (!applied) target.value = section.elements[key];
}
function commitItemIcon(target) {
  const section = state.spec.sections.find((candidate) => candidate.id === target.dataset.itemIconSection), index = section?.items.findIndex((item) => item.id === target.dataset.itemId) ?? -1;
  if (!section || section.group !== 'features' || !Number.isInteger(index) || index < 0 || !section.items[index] || !Object.hasOwn(CONTENT_ICONS, target.value)) throw new Error(t("Unsupported item icon choice."));
  const applied = commit((spec) => { spec.sections.find((candidate) => candidate.id === section.id).items[index].icon = target.value; }, 'Change item icon');
  if (!applied) target.value = section.items[index].icon;
}
function commitInterface(target) {
  const section = state.spec.sections.find((entry) => entry.id === target.dataset.interfaceSection), key = target.dataset.interfaceKey;
  if (!section || !interfaceFieldsFor(section).includes(key) || !Object.hasOwn(INTERFACE_CONTROLS[key].options, target.value)) throw new Error(t('Unsupported application control.'));
  const applied = commit((spec) => { spec.sections.find((entry) => entry.id === section.id).interface[key] = target.value; }, `Change ${INTERFACE_CONTROLS[key].label.toLowerCase()}`);
  if (!applied) target.value = section.interface[key];
}
function commitInterfaceItem(target) {
  const section = state.spec.sections.find((entry) => entry.id === target.dataset.interfaceItemSection), item = section?.items.find((entry) => entry.id === target.dataset.itemId);
  if (!item || !interfaceItemTypesFor(section).includes(target.value)) throw new Error(t('Unsupported field or panel type.'));
  const applied = commit((spec) => { spec.sections.find((entry) => entry.id === section.id).items.find((entry) => entry.id === item.id).uiType = target.value; }, 'Change field or panel type');
  if (!applied) target.value = item.uiType;
}
document.addEventListener('input', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;
  if (target.dataset.field && target.dataset.live === 'true') commitField(target);
  if (target.id === 'prompt') updatePromptCounter();
  if (target.id === 'library-search') renderLibrary();
  if (target.id === 'api-key') updateConnection();
  if (target.id === 'page-title-input' && !state.pageSlugEdited) $('#page-slug-input').value = uniquePageSlug(target.value);
  if (target.id === 'page-slug-input') state.pageSlugEdited = true;
});
document.addEventListener('change', async (event) => {
  const target = event.target; if (!(target instanceof HTMLElement)) return;
  try {
    if (target.id === 'app-language') { changeEditorLanguage(target.value); return; }
    if (target.dataset.imageSizeKey) { commitImageSizeField(target); return; }
    if (target.dataset.field) commitField(target);
    if (target.id === 'provider-mode' || target.id === 'operation') updateMode();
    if (target.id === 'brand-input') commitSite((site) => { site.brand.name = target.value || 'Your brand'; site.name = `${site.brand.name} website`; }, 'Change brand');
    if (target.id === 'page-select') switchPage(target.value);
    if (target.id === 'page-template' && Object.hasOwn(PAGE_TEMPLATES, target.value)) {
      const template = PAGE_TEMPLATES[target.value];
      if (Object.values(PAGE_TEMPLATES).some((choice) => choice.title === $('#page-title-input').value)) $('#page-title-input').value = template.title;
      if (!state.pageSlugEdited) $('#page-slug-input').value = uniquePageSlug($('#page-title-input').value);
      $('#page-template-description').textContent = t(template.description); $('#page-nav-input').checked = target.value !== 'article';
    }
    if (target.dataset.linkPath) {
      const path = resolveFieldPath(target.dataset.linkPath, captureFieldReference(target));
      if (commit((spec) => assignPath(spec, path, target.value), 'Change link')) toast('Link updated.');
    }
    if (target.dataset.themeField) commit((spec) => { spec.theme[target.dataset.themeField] = target.value; }, 'Change design setting');
    if (target instanceof HTMLSelectElement && target.dataset.presentationSection) commitPresentation(target);
    if (target instanceof HTMLSelectElement && target.dataset.elementSection) commitElement(target);
    if (target instanceof HTMLSelectElement && target.dataset.itemIconSection) commitItemIcon(target);
    if (target instanceof HTMLSelectElement && target.dataset.interfaceSection) commitInterface(target);
    if (target instanceof HTMLSelectElement && target.dataset.interfaceItemSection) commitInterfaceItem(target);
    if (target.dataset.variant) { const section = state.spec.sections.find((entry) => entry.id === target.dataset.variant), block = getBlock(target.value); if (section && block?.group === section.group) addSection(block.group, block.id); }
    if (target.dataset.reviewed) commit((spec) => { spec.sections.find((s) => s.id === target.dataset.reviewed).draft = !target.checked; }, 'Review copy');
    if (target.dataset.imagePath && target.files?.[0]) {
      const reference = captureFieldReference(target), originalPath = target.dataset.imagePath;
      const path = resolveFieldPath(originalPath, reference), projectId = state.project?.id, pageId = state.activePageId, before = getPathValue(state.spec, path);
      const image = await imageToDataUrl(target.files[0]);
      const currentPath = resolveFieldPath(originalPath, reference);
      if (state.project?.id !== projectId || state.activePageId !== pageId || getPathValue(state.spec, currentPath) !== before) throw new Error(t("The selected page or section changed while the image was loading. Upload it again."));
      commit((spec) => assignPath(spec, currentPath, image), 'Upload image');
    }
    if (target.id === 'import-file' && target.files?.[0]) {
      const file = target.files[0]; if (file.size > 4400000) throw new Error(t("Project files must be smaller than 4.4 MB."));
      let parsed; try { parsed = JSON.parse(await file.text()); } catch { throw new Error(t("This file does not contain valid JSON.")); }
      const spec = validateSpec(parsed.spec || parsed); if (state.dirty) await saveProject();
      const imported = await api('/api/projects', { method: 'POST', data: { spec } });
      await idbPutProject(imported, spec);
      await loadProject(imported.id); await refreshPastProjects(); $('#projects-dialog').close(); toast('Project imported as a new local copy.', 'success'); target.value = '';
    }
  } catch (error) { toast(error.message, 'error'); }
});
$('#page-form').addEventListener('submit', (event) => {
  event.preventDefault(); if (state.busy) return;
  try {
    const title = $('#page-title-input').value.trim(), slug = $('#page-slug-input').value.trim(), showInNav = $('#page-nav-input').checked;
    const site = clone(state.site), existing = state.pageDialogId ? site.pages.find((page) => page.id === state.pageDialogId) : null;
    if (state.pageDialogId && !existing) throw new Error(t("This page no longer exists. Close this dialog and try again."));
    const pageId = existing?.id || `p-${crypto.randomUUID()}`;
    if (existing) Object.assign(existing, { title, slug, showInNav });
    else site.pages.push(createPage(site, { id: pageId, title, slug, showInNav, template: $('#page-template').value, sourcePageId: state.activePageId }));
    const valid = validateSpec(site);
    if (commitSite(() => valid, existing ? 'Edit page settings' : `Add ${title}`)) {
      $('#page-dialog').close(); switchPage(pageId); toast(existing ? t('Page settings saved.') : t('{title} added. Edit its sections or describe a design for this page.', { title }), 'success');
    } else if (existing) $('#page-dialog').close();
  } catch (error) { $('#page-feedback').textContent = error.message; }
});
$('#connection-form').addEventListener('submit', async (event) => {
  event.preventDefault(); const button = $('#connect-submit'); button.disabled = true; const feedback = $('#connection-feedback'); feedback.className = 'feedback';
  const apiKey = $('#api-key').value; $('#api-key').value = '';
  setConnectionFeedback(/^sk-or-/i.test(apiKey.trim()) || (!apiKey.trim() && state.status?.provider === 'openrouter') ? 'Checking the key with OpenRouter…' : 'Checking the key with TypeSafe…');
  try {
    const result = await api('/api/connection', { method: 'POST', data: { apiKey } });
    await refreshStatus(); setConnectionFeedback('Connected to {model}. You can close this dialog and build a site.', { model: result.model }); toast('JEV connection verified.', 'success');
  } catch (error) { if (error.name !== 'AbortError') { setConnectionFeedback(error.message); feedback.classList.add('error'); } await refreshStatus().catch(() => {}); }
  finally { button.disabled = false; }
});
$('#build-form').addEventListener('submit', submitDesign);
window.addEventListener('beforeunload', (event) => { if (state.dirty || state.busy || state.saving) { event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('keydown', (event) => {
  if (['Delete', 'Backspace'].includes(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey && !event.repeat && state.inspect && !state.busy && !document.querySelector('dialog[open]') && !(event.target instanceof Element && event.target.closest('input,textarea,select,form,[contenteditable]:not([contenteditable="false"]),[role="textbox"],dialog')) && validSelection(currentSelection())) {
    event.preventDefault(); deleteSelection(); return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); if (!state.busy) saveProject({ checkpoint: true, label: 'Keyboard checkpoint', snapshotCurrent: true }).then(() => toast('Saved locally.', 'success')).catch((error) => toast(error.message, 'error')); }
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && document.activeElement === $('#prompt')) { event.preventDefault(); $('#build-form').requestSubmit(); }
});
const observer = new ResizeObserver(resizePreview); observer.observe($('#canvas-area'));
const structureAnnouncement = document.createElement('div');
structureAnnouncement.id = 'structure-announcement'; structureAnnouncement.className = 'sr-only'; structureAnnouncement.setAttribute('role', 'status'); structureAnnouncement.setAttribute('aria-live', 'polite'); document.body.append(structureAnnouncement);
const structureControls = installStructureControls({
  getContext: () => ({ pageId: state.activePageId, changeCounter: state.change, busy: state.busy, inspect: state.inspect, page: state.spec, selection: currentSelection() }),
  select: (selection) => { if (validSelection(selection)) selectSection(selection.sectionId, { itemId: selection.itemId, partKey: selection.partKey, scroll: true }); },
  begin: (selection) => beginGesture(selection),
  cancel: () => cancelGesture(),
  move: (proposal, label) => commitMove(proposal, label)
});
document.addEventListener('forma-cancel-move', () => structureControls.cancel());
const libraryDrag = installLibraryDrag({
  getContext: () => ({ page: state.spec, pageId: state.activePageId, changeCounter: state.change, channel: state.channel, ready: Boolean(state.displayed?.ready && state.displayed.change === state.change && state.displayed.pageId === state.activePageId), busy: state.busy, inspect: state.inspect, frame: $('#preview-frame') }),
  begin: (entry, session, choices) => {
    if (state.busy || !state.inspect || state.gesture || !state.displayed?.ready || state.displayed.change !== state.change || state.displayed.pageId !== state.activePageId) return false;
    clearTimeout(state.previewTimer); state.previewController?.abort(); state.renderNumber++;
    state.gesture = { surface: 'library', session, entry, choices, pageId: state.activePageId, changeCounter: state.change, channel: state.channel };
    return true;
  },
  send: sendPreview,
  cancel: () => cancelGesture(),
  move: (proposal, label, { scrollY } = {}) => {
    const gesture = state.gesture;
    const choice = gesture?.surface === 'library' && gesture.choices.find((entry) => JSON.stringify(entry.proposal) === JSON.stringify(proposal));
    if (!choice || gesture.changeCounter !== state.change || gesture.channel !== state.channel || gesture.pageId !== state.activePageId) { cancelGesture('The library destination changed.'); return; }
    return commitMove(choice.proposal, choice.label || label, { surface: 'preview', scrollY });
  }
});
document.addEventListener('forma-cancel-move', () => libraryDrag.cancel());
async function boot() {
  hydrateIcons();
  translateStatic(); renderStarters(); syncCookieBanner();
  $('#prompt').value = PRESETS[0].brief; updatePromptCounter();
  updateMode(); renderInspector(); renderPastProjects(); updateHeader();
  try {
    await refreshStatus(); await refreshPastProjects();
    let lastProject; try { lastProject = localStorage.getItem(lastProjectKey()); } catch { /* Optional storage. */ }
    if (lastProject && /^[a-zA-Z0-9_-]+$/.test(lastProject)) { try { await loadProject(lastProject); await refreshPastProjects(); return; } catch { rememberProject(); } }
    await renderPreview();
  } catch (error) { toast(state.hostedClient || location.protocol === 'https:' ? error.message : t('Startup: {message} Keep the Node.js server running and reload this page.', { message: error.message }), 'error'); }
}
boot();
