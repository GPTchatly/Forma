/** Related static pages share a brand, while composition stays scoped to one page. */
import { makeSection } from './content.mjs';
import { ValidationError, id as validateId } from './schema.mjs';

export const HOME_PAGE_ID = 'home';
export const MAX_PAGES = 8;
export const PAGE_TEMPLATES = {
  general: { label: 'Custom page', title: 'New page', slug: 'new-page', description: 'Start with a simple heading, then add any sections you need.', groups: ['navigation', 'hero', 'footer'] },
  about: { label: 'About', title: 'About us', slug: 'about', description: 'Tell your story, explain your approach and invite the next step.', groups: ['navigation', 'hero', 'about', 'process', 'cta', 'footer'] },
  services: { label: 'Services', title: 'Our services', slug: 'services', description: 'Present your offerings, process and answers to common questions.', groups: ['navigation', 'hero', 'services', 'process', 'faq', 'contact', 'footer'] },
  portfolio: { label: 'Portfolio', title: 'Selected work', slug: 'work', description: 'Show your work alongside your story and contact details.', groups: ['navigation', 'hero', 'gallery', 'about', 'contact', 'footer'] },
  pricing: { label: 'Pricing', title: 'Plans and pricing', slug: 'pricing', description: 'Compare your plans and answer questions before visitors get in touch.', groups: ['navigation', 'hero', 'pricing', 'faq', 'contact', 'footer'] },
  faq: { label: 'FAQ', title: 'Frequently asked questions', slug: 'faq', description: 'Give visitors clear answers and a way to ask another question.', groups: ['navigation', 'hero', 'faq', 'contact', 'footer'] },
  contact: { label: 'Contact', title: 'Get in touch', slug: 'contact', description: 'Create a dedicated place for contact details and enquiries.', groups: ['navigation', 'hero', 'contact', 'footer'] },
  blog: { label: 'Blog index', title: 'Journal', slug: 'journal', description: 'An editable article index. Link each card to a separate article page.', groups: ['navigation', 'hero', 'gallery', 'footer'] },
  article: { label: 'Article', title: 'New article', slug: 'new-article', description: 'A standalone article with a heading and editable body.', groups: ['navigation', 'hero', 'about', 'footer'] }
};

const PAGE_INTRODUCTIONS = {
  general: 'Introduce this page in your own words.',
  about: 'Introduce the people, purpose and values behind your work.',
  services: 'Describe what you offer and who your services are for.',
  portfolio: 'Introduce your selected projects and the work you want to share.',
  pricing: 'Explain your options, what is included and how to choose a plan.',
  faq: 'Help visitors find answers to the questions they ask most often.',
  contact: 'Explain how visitors can reach you and what to include in their enquiry.',
  blog: 'Notes, ideas and stories. Replace this introduction with your own.',
  article: 'Add a short introduction to your article.'
};
const PAGE_ACTIONS = {
  about: { button: 'Read our story', href: '#about' },
  services: { button: 'Explore services', href: '#services' },
  portfolio: { button: 'View selected work', href: '#gallery' },
  pricing: { button: 'Compare plans', href: '#pricing' },
  faq: { button: 'Find answers', href: '#faq' },
  contact: { button: 'Contact details', href: '#contact' }
};

export function pageEntries(site) {
  return [{ id: HOME_PAGE_ID, title: 'Home', slug: 'index', showInNav: true }, ...(site.pages || []).map(({ id, title, slug, showInNav }) => ({ id, title, slug, showInNav }))];
}

export function getPageSpec(site, pageId = HOME_PAGE_ID) {
  const page = pageId === HOME_PAGE_ID ? site : (site.pages || []).find((entry) => entry.id === pageId);
  if (!page) throw new Error('Page not found.');
  return { schemaVersion: site.schemaVersion, name: pageId === HOME_PAGE_ID ? site.name : page.title, family: page.family, brief: page.brief, brand: site.brand, theme: page.theme, sections: page.sections };
}

export function replacePageSpec(site, pageId, next) {
  const result = structuredClone(site);
  getPageSpec(result, pageId); // Do not silently recreate a deleted page after asynchronous work.
  result.brand = structuredClone(next.brand);
  if (pageId === HOME_PAGE_ID) {
    Object.assign(result, { name: next.name, family: next.family, brief: next.brief, theme: structuredClone(next.theme), sections: structuredClone(next.sections) });
  } else {
    const page = result.pages.find((entry) => entry.id === pageId);
    Object.assign(page, { title: next.name, family: next.family, brief: next.brief, theme: structuredClone(next.theme), sections: structuredClone(next.sections) });
  }
  return result;
}

export function pageFilename(site, pageId = HOME_PAGE_ID) {
  if (pageId === HOME_PAGE_ID) return 'index.html';
  const page = (site.pages || []).find((entry) => entry.id === pageId);
  if (!page) throw new Error('Page not found.');
  // Filenames only come from a schema-validated page registry, never from href text.
  return `${page.slug}.html`;
}

export function parsePageHref(href) {
  if (typeof href !== 'string') return null;
  const match = /^page:([a-zA-Z0-9][a-zA-Z0-9_-]{0,79})(?:#([a-zA-Z][\w-]*))?$/.exec(href);
  return match ? { pageId: match[1], ...(match[2] ? { sectionId: match[2] } : {}) } : null;
}

export function createPage(site, { id, title, slug, template = 'general', showInNav = true, sourcePageId = HOME_PAGE_ID }) {
  if (!Object.hasOwn(PAGE_TEMPLATES, template)) throw new Error('Unknown page template.');
  if ((site.pages || []).length >= MAX_PAGES - 1) throw new Error(`A site supports at most ${MAX_PAGES} pages.`);
  const source = getPageSpec(site, sourcePageId);
  const sections = PAGE_TEMPLATES[template].groups.map((group) => makeSection(group, undefined, source.family));
  const hero = sections.find((section) => section.group === 'hero');
  Object.assign(hero, { block: 'hero-centered', title, eyebrow: template === 'article' ? 'Journal' : '', body: PAGE_INTRODUCTIONS[template], button: '', href: '', ...PAGE_ACTIONS[template] });
  if (template === 'blog') {
    const gallery = sections.find((section) => section.group === 'gallery');
    Object.assign(gallery, { title: 'Latest articles', eyebrow: 'From the journal', body: 'Add article pages, then choose a page link for each card.', items: gallery.items.map((item, index) => ({ ...item, title: `Article ${index + 1}`, body: 'Write a short summary of your article.', meta: 'Draft article', href: '' })) });
  }
  if (template === 'article') {
    Object.assign(sections.find((section) => section.group === 'about'), { block: 'about-statement', eyebrow: '', title: 'Your story starts here.', body: 'Write the body of your article here. Add your own ideas, examples and conclusions.', button: '', href: '' });
  }
  return { id, slug, title, showInNav, family: source.family, brief: '', theme: structuredClone(source.theme), sections };
}

export function removePage(site, pageId) {
  if (pageId === HOME_PAGE_ID) throw new Error('The home page cannot be deleted.');
  getPageSpec(site, pageId);
  const result = structuredClone(site);
  result.pages = result.pages.filter((page) => page.id !== pageId);
  const clear = (record) => { if (parsePageHref(record.href)?.pageId === pageId) record.href = ''; };
  clear(result.brand);
  for (const page of [result, ...result.pages]) for (const section of page.sections) {
    clear(section);
    for (const item of section.items) clear(item);
  }
  return result;
}

/** Repair incoming links after a section disappears, retaining page destinations. */
export function clearSectionReferences(site, pageId, sectionId) {
  validateId(pageId); validateId(sectionId);
  getPageSpec(site, pageId);
  const result = structuredClone(site);
  const clear = (record, ownerPageId) => {
    const target = parsePageHref(record.href);
    if (target?.pageId === pageId && target.sectionId === sectionId) record.href = `page:${pageId}`;
    else if (ownerPageId === pageId && record.href === `#${sectionId}`) record.href = '';
  };
  // Bare shared-brand fragments retain their historical Home-page meaning.
  clear(result.brand, HOME_PAGE_ID);
  for (const page of [{ ...result, id: HOME_PAGE_ID }, ...(result.pages || [])]) for (const section of page.sections) {
    clear(section, page.id);
    for (const item of section.items) clear(item, page.id);
  }
  return result;
}

export function removeSection(site, pageId, sectionId) {
  validateId(pageId); validateId(sectionId);
  const page = getPageSpec(site, pageId);
  const section = page.sections.find((entry) => entry.id === sectionId);
  if (!section) throw new ValidationError('The section no longer exists on this page.');
  if (section.locked) throw new ValidationError('Unlock this section before deleting it.');
  const result = clearSectionReferences(site, pageId, sectionId);
  const target = pageId === HOME_PAGE_ID ? result : result.pages.find((entry) => entry.id === pageId);
  target.sections = target.sections.filter((entry) => entry.id !== sectionId);
  return result;
}
