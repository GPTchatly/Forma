import { GROUP_LABELS } from '../shared/catalog.mjs';
import { PAGE_TEMPLATES } from '../shared/pages.mjs';
import { PART_LABELS } from '../shared/parts.mjs';
// Editor chrome only. Website copy, model vocabulary and project data stay literal.
import es from './locales/es.mjs';
import pt from './locales/pt.mjs';
import de from './locales/de.mjs';
import it from './locales/it.mjs';
import ru from './locales/ru.mjs';
import pl from './locales/pl.mjs';
import fi from './locales/fi.mjs';
import sv from './locales/sv.mjs';

export const SUPPORTED_LOCALES = Object.freeze({ en: 'English', es: 'Español', pt: 'Português', de: 'Deutsch', it: 'Italiano', ru: 'Русский', pl: 'Polski', fi: 'Suomi', sv: 'Svenska' });
export const LOCALE_FLAGS = Object.freeze({
  en: '<svg viewBox="0 0 24 16" aria-hidden="true"><rect width="24" height="16" rx="2" fill="#012169"/><path d="M0 0 24 16M24 0 0 16" stroke="#fff" stroke-width="3.2"/><path d="M0 0 24 16M24 0 0 16" stroke="#C8102E" stroke-width="1.6"/><path d="M12 0v16M0 8h24" stroke="#fff" stroke-width="5.2"/><path d="M12 0v16M0 8h24" stroke="#C8102E" stroke-width="3"/></svg>',
  es: '<svg viewBox="0 0 24 16" aria-hidden="true"><rect width="24" height="16" rx="2" fill="#AA151B"/><rect y="4" width="24" height="8" fill="#F1BF00"/></svg>',
  pt: '<svg viewBox="0 0 24 16" aria-hidden="true"><rect width="24" height="16" rx="2" fill="#DA291C"/><rect width="9.5" height="16" rx="2" fill="#046A38"/><circle cx="9.5" cy="8" r="2.6" fill="#FFE900" stroke="#DA291C" stroke-width=".7"/></svg>',
  de: '<svg viewBox="0 0 24 16" aria-hidden="true"><rect width="24" height="16" rx="2" fill="#FFCE00"/><rect width="24" height="10.67" fill="#DD0000"/><rect width="24" height="5.33" fill="#141414"/></svg>',
  it: '<svg viewBox="0 0 24 16" aria-hidden="true"><rect width="24" height="16" rx="2" fill="#CE2B37"/><rect width="16" height="16" fill="#fff"/><rect width="8" height="16" fill="#009246"/></svg>',
  ru: '<svg viewBox="0 0 24 16" aria-hidden="true"><rect width="24" height="16" rx="2" fill="#D52B1E"/><rect width="24" height="10.67" fill="#0039A6"/><rect width="24" height="5.33" fill="#fff"/></svg>',
  pl: '<svg viewBox="0 0 24 16" aria-hidden="true"><rect width="24" height="16" rx="2" fill="#DC143C"/><rect width="24" height="8" fill="#fff"/></svg>',
  fi: '<svg viewBox="0 0 24 16" aria-hidden="true"><rect width="24" height="16" rx="2" fill="#fff"/><path d="M8.5 0v16M0 8h24" stroke="#003580" stroke-width="4.2"/></svg>',
  sv: '<svg viewBox="0 0 24 16" aria-hidden="true"><rect width="24" height="16" rx="2" fill="#006AA7"/><path d="M8.5 0v16M0 8h24" stroke="#FECC02" stroke-width="3.6"/></svg>'
});
export const catalogs = Object.freeze({ en: Object.freeze({}), es, pt, de, it, ru, pl, fi, sv });
export const LOCALE_STORAGE_KEY = 'forma:locale';
let locale = 'en';

export function normalizeLocale(value) {
  if (typeof value !== 'string' || value.length > 80) return null;
  const base = value.trim().toLowerCase().replaceAll('_', '-').split('-')[0];
  return Object.hasOwn(SUPPORTED_LOCALES, base) ? base : null;
}
export function resolveLocale(saved, preferred = []) {
  return normalizeLocale(saved) || preferred.map(normalizeLocale).find(Boolean) || 'en';
}
export const getLocale = () => locale;
function syncLanguageFlag(root = globalThis.document) {
  if (!root?.querySelector) return;
  const flag = root.querySelector('#app-language-flag');
  if (flag) flag.innerHTML = LOCALE_FLAGS[locale] || LOCALE_FLAGS.en;
  const selector = root.querySelector('#app-language');
  if (selector) { selector.value = locale; selector.title = SUPPORTED_LOCALES[locale] || 'English'; }
}
export function setLocale(value, { persist = true } = {}) {
  locale = normalizeLocale(value) || 'en';
  if (persist) {
    try { globalThis.localStorage?.setItem(LOCALE_STORAGE_KEY, locale); }
    catch { /* Browser storage is optional; this tab retains the selected language. */ }
  }
  if (globalThis.document) { document.documentElement.lang = locale; syncLanguageFlag(document); }
  return locale;
}
export function initLocale() {
  let saved;
  try { saved = globalThis.localStorage?.getItem(LOCALE_STORAGE_KEY); }
  catch { /* Private/restricted browser storage must not stop the editor. */ }
  return setLocale(resolveLocale(saved, globalThis.navigator?.languages || [globalThis.navigator?.language]), { persist: false });
}
export function translate(message, parameters = {}, language = locale) {
  const catalog = catalogs[normalizeLocale(language) || 'en'];
  const text = Object.hasOwn(catalog, message) ? catalog[message] : message;
  // Substitution is one pass: braces in user text remain literal. Callers escape
  // the result when building HTML, or use textContent / setAttribute.
  return text.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g, (match, name) => Object.hasOwn(parameters, name) ? String(parameters[name]) : match);
}
export const t = (message, parameters) => translate(message, parameters);
export const formatNumber = (value, options) => new Intl.NumberFormat(locale, options).format(value);
export const formatDate = (value) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

export function translateStatic(root = document) {
  const bindings = [['data-i18n', null], ['data-i18n-title', 'title'], ['data-i18n-aria-label', 'aria-label'], ['data-i18n-placeholder', 'placeholder'], ['data-i18n-content', 'content']];
  for (const [binding, attribute] of bindings) {
    const nodes = [...root.querySelectorAll(`[${binding}]`)];
    if (root.matches?.(`[${binding}]`)) nodes.unshift(root);
    for (const node of nodes) {
      const value = t(node.getAttribute(binding));
      if (attribute) node.setAttribute(attribute, value);
      else node.textContent = value;
    }
  }
  syncLanguageFlag(root);
}

initLocale();

const PREVIEW_MESSAGES = [
  "Delete",
  "Delete {name}",
  "Delete selected content. Undo is available.",
  "This page is empty.",
  "This page is empty. Add a component or describe what to build.",
  "Image resize canceled.",
  "Resize image…",
  "Resize image; drag the corner or open size controls",
  "{width}% wide · {height}px tall",
  "Image resize canceled because the selection changed.",
  "Image resize canceled because the page changed.",
  "Image resize canceled outside the canvas.",
  "Image resize canceled after resizing the preview.",

  "Arrange selected content",
  "Section",
  "Card {number}",
  "Primary button",
  "Heading",
  "Description",
  "Icon",
  "Button icon",
  "Button label",
  "Image",
  "Part",
  "Card",
  "Edit image…",
  "Drag {level}",
  "Drag {level}; use Move menu for keyboard controls",
  "Move {level}",
  "Move…",
  "Wait for the current operation.",
  "No available moves. Fixed positions and section locks constrain arranging.",
  "Choose a compatible destination",
  "Library move canceled.",
  "Move canceled.",
  "This content is no longer available.",
  "The preview changed or this library choice is unavailable.",
  "Move canceled because the page changed.",
  "Library move canceled because the page changed.",
  "Move canceled outside the canvas.",
  "Move canceled after resizing the preview.",
  "Library move canceled after resizing the preview.",
  "External links are disabled in the editor preview. They work in your exported site.",
  "Preview only. The exported form prepares an email in the visitor’s mail app.",
  "Add section or page",
  "Add a section",
  "Add a page",
  "All section types are on this page.",
  "This site has the maximum 8 pages."
];
export function previewMessages() {
  const keys = [...PREVIEW_MESSAGES, ...Object.values(PART_LABELS), ...Object.values(GROUP_LABELS), ...Object.values(PAGE_TEMPLATES).map((page) => page.label)];
  return Object.fromEntries(keys.map((key) => [key, t(key)]));
}
