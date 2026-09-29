/** The browser and local server export the same validated, self-contained static files. */
import { validateSpec } from './schema.mjs';
import { renderDocument, themeCss } from './render.mjs';
import { HOME_PAGE_ID, pageEntries, pageFilename, getPageSpec } from './pages.mjs';

export function createExportFiles(rawSpec, { css, script, scriptHash, license, originalLicense }) {
  const spec = validateSpec(rawSpec), pages = pageEntries(spec);
  const pageFiles = Object.fromEntries(pages.map((page) => [pageFilename(spec, page.id), renderDocument(spec, { css, script, scriptHash, pageId: page.id })]));
  const draftCount = pages.reduce((count, page) => count + getPageSpec(spec, page.id).sections.filter((section) => section.draft).length, 0);
  const sourceStyles = Object.fromEntries(pages.map((page) => [page.id === HOME_PAGE_ID ? 'source/site.css' : `source/pages/${page.slug}.css`, `${css}\n${themeCss(getPageSpec(spec, page.id))}`]));
  return {
    ...pageFiles,
    'project.json': JSON.stringify(spec, null, 2),
    ...sourceStyles,
    'source/site.js': script,
    'LICENSE.txt': originalLicense,
    'licenses/HYPERUI.txt': license,
    'README.txt': `EXPORTED FROM FORMA — JEV SITE STUDIO\n\nOpen index.html in a browser, or upload all ${pages.length} HTML pages together to a static website host.\nPage links use neighboring HTML files; keep their filenames and relative locations.\nEach HTML page contains all CSS, script and images; there are no CDN dependencies.\nThe source CSS and source/site.js files are reference copies. Editing them does not\nchange the HTML pages until you inline the changes yourself.\n\n${draftCount} sections across ${pages.length} pages are still marked as draft copy. Review every claim, contact\ndetail, image right, price and link before publishing. Original abstract visuals\nare decorative placeholders, not real photographs of your business.\n\nContact forms only prepare mailto drafts; they do not deliver or store messages.\nBlog indexes and articles are static pages edited in Forma, without a dynamic CMS.\nApplication screens include local forms, chat entry, search, sorting, task and cart\ninteractions. This temporary state lasts only while the page stays open.\nThere is no live authentication, AI response service, payment processing,\nshared database, booking backend or analytics.\nThe project JSON can be imported back into Forma. It contains user copy and any\nuploaded images; do not publish project.json if that content is private.\n\nHyperUI-derived components are MIT licensed. Preserve the included license\nnotices when redistributing code. Other builder code is MIT licensed.\n`
  };
}
