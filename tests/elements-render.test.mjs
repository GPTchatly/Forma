import { PNG_IMAGE } from './fixtures/images.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG } from '../shared/catalog.mjs';
import { createSpec, makeSection } from '../shared/content.mjs';
import { ELEMENT_CONTROLS, elementFieldsFor, elementOptionsFor } from '../shared/elements.mjs';
import { CONTENT_ICONS, icon } from '../shared/icons.mjs';
import { BUTTON_LABELS } from '../shared/ui-catalog.mjs';
import { renderBody } from '../shared/render.mjs';

function example(group, block) {
  const site = createSpec();
  const section = makeSection(group, block);
  const index = site.sections.findIndex((entry) => entry.group === group);
  if (index < 0) site.sections.splice(site.sections.length - 1, 0, section);
  else site.sections[index] = section;
  return { site, section };
}
function sectionMarkup(site, id, preview = false) {
  return renderBody(site, { preview }).match(new RegExp(`<section id="${id}"[^>]*>[\\s\\S]*?</section>`))[0];
}

test('legacy elements preserve the same output as explicit defaults', () => {
  const current = createSpec();
  const legacy = structuredClone(current);
  for (const section of legacy.sections) {
    delete section.elements;
    for (const item of section.items) delete item.icon;
  }
  assert.equal(renderBody(legacy), renderBody(current));
});

test('every feature variant renders a chosen icon and genuinely removes icons when requested', () => {
  for (const block of ['features-bento', 'features-cards', 'features-list']) {
    const { site, section } = example('features', block);
    for (const selected of Object.keys(CONTENT_ICONS).filter((name) => !['default', 'none'].includes(name))) {
      section.items[0].icon = selected;
      assert.ok(sectionMarkup(site, section.id).includes(`<div class="feature-icon">${icon(selected, 24)}</div>`), `${block}: ${selected}`);
    }
    for (const item of section.items) item.icon = 'none';
    const html = sectionMarkup(site, section.id);
    assert.ok(!html.includes('class="feature-icon"'));
    assert.equal((html.match(/class="feature-card no-icon"/g) || []).length, section.items.length);
    assert.ok(html.includes(section.items[0].title));
  }
});

test('catalog variants expose only their supported internal controls to the renderer', () => {
  for (const block of CATALOG) {
    const { site, section } = example(block.group, block.id);
    for (const field of elementFieldsFor(section)) {
      for (const value of Object.keys(elementOptionsFor(section, field))) {
        section.elements[field] = value;
        const html = renderBody(site);
        const tag = html.match(new RegExp(`<(?:section|header|footer) id="${section.id}"[^>]*>`))[0];
        const attribute = field.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
        assert.ok(tag.includes(`data-element-${attribute}="${value}"`), `${block.id}: ${field}=${value}`);
        for (const unsupported of Object.keys(ELEMENT_CONTROLS).filter((key) => !elementFieldsFor(section).includes(key))) {
          const name = unsupported.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
          assert.ok(!tag.includes(`data-element-${name}=`), `${block.id}: unsupported ${unsupported}`);
        }
      }
    }
  }
});

test('action and decoration visibility removes actual elements while retaining uploaded media and saved wording', () => {
  const { site, section } = example('hero', 'hero-split');
  section.image = PNG_IMAGE;
  Object.assign(section.elements, { primaryAction: 'hide', secondaryAction: 'hide', decoration: 'hide' });
  let html = sectionMarkup(site, section.id);
  assert.ok(!html.includes('hero-actions'));
  assert.ok(!html.includes('visual-label'));
  assert.ok(html.includes(PNG_IMAGE));
  assert.equal(section.button, 'Explore more');
  section.elements.primaryAction = 'show';
  html = sectionMarkup(site, section.id);
  assert.ok(html.includes('Explore more'));
  assert.ok(!html.includes('class="text-link"'));
  const feature = example('features', 'features-bento');
  feature.section.elements.decoration = 'hide';
  assert.ok(!sectionMarkup(feature.site, feature.section.id).includes('bento-lines'));
});

test('services and process numbering can be removed independently of item content', () => {
  for (const [group, block, marker] of [['services', 'services-list', 'index-number'], ['process', 'process-timeline', 'step-number']]) {
    const { site, section } = example(group, block);
    section.elements.numbering = 'hide';
    const html = sectionMarkup(site, section.id);
    assert.ok(!html.includes(`class="${marker}"`));
    assert.ok(html.includes(section.items[0].title));
  }
});

test('highlighted pricing selection works in both pricing variants and permits no highlighted card', () => {
  for (const block of ['pricing-cards', 'pricing-featured']) {
    const { site, section } = example('pricing', block);
    section.elements.featuredItem = 'first';
    section.featuredItemId = section.items[0].id;
    let html = sectionMarkup(site, section.id);
    assert.match(html, /<div class="pricing-grid"><article class="pricing-card featured">/);
    assert.equal((html.match(/class="pricing-card featured"/g) || []).length, 1);
    section.elements.featuredItem = 'none';
    section.featuredItemId = null;
    html = sectionMarkup(site, section.id);
    assert.ok(!html.includes('class="pricing-card featured"'));
  }
});

test('prepared button label and icon entries render independently from custom text and button style', () => {
  for (const [group, block] of [['hero', 'hero-split'], ['about', 'about-split'], ['pricing', 'pricing-cards'], ['cta', 'cta-card'], ['contact', 'contact-simple'], ['contact', 'contact-form']]) {
    const { site, section } = example(group, block);
    section.button = 'My custom action';
    section.href = 'https://example.com/contact';
    Object.assign(section.elements, { primaryAction: 'show', buttonStyle: 'outline', buttonLabel: 'get-started', buttonIcon: 'mail', buttonLabelStyle: 'uppercase' });
    let html = sectionMarkup(site, section.id);
    assert.ok(html.includes(`<span class="button-label">${BUTTON_LABELS['get-started'].text}</span>${icon('mail', 16)}`), block);
    assert.ok(!html.includes('My custom action'), block);
    section.elements.buttonIcon = 'none';
    html = sectionMarkup(site, section.id);
    assert.ok(html.includes('<span class="button-label">Get started</span></'), block);
    section.elements.buttonLabel = 'default';
    html = sectionMarkup(site, section.id);
    assert.ok(html.includes('<span class="button-label">My custom action</span></'), block);
  }
});

test('simple contact honors its section label and destination without changing email form submission', () => {
  const { site, section } = example('contact', 'contact-simple');
  section.button = 'Book an appointment';
  section.href = 'https://example.com/book';
  site.brand.email = 'hello@example.com';
  let html = sectionMarkup(site, section.id);
  assert.ok(html.includes('href="https://example.com/book"'));
  assert.ok(html.includes('Book an appointment'));
  assert.ok(!html.includes('href="mailto:hello@example.com"'));
  section.elements.primaryAction = 'hide';
  html = sectionMarkup(site, section.id);
  assert.ok(!html.includes('site-button'));
  section.block = 'contact-form';
  html = sectionMarkup(site, section.id);
  assert.ok(html.includes('data-contact-email="hello@example.com"'));
  assert.ok(html.includes('type="submit"'));
  assert.ok(html.includes('Nothing is submitted to this website.'));
});

test('each rendered item has a preview-only selection index and its escaped link remains in export', () => {
  for (const group of ['features', 'services', 'gallery', 'process', 'pricing', 'faq']) {
    const { site, section } = example(group);
    section.items[0].title = '<img src=x onerror=alert(1)>';
    section.items[0].href = 'https://example.com/details';
    const preview = sectionMarkup(site, section.id, true);
    const exported = sectionMarkup(site, section.id);
    assert.equal((preview.match(/data-item-index=/g) || []).length, section.items.length, group);
    assert.ok(preview.includes('data-item-index="0"'));
    assert.ok(!exported.includes('data-item-index'));
    assert.ok(exported.includes('href="https://example.com/details"'));
    assert.ok(exported.includes('&lt;img src=x onerror=alert(1)&gt;'));
    assert.ok(!exported.includes('<img src=x'));
  }
});

test('unknown internal choices and icons are rejected at render entry points', () => {
  const { site, section } = example('features', 'features-cards');
  section.items[0].icon = '"><script>alert(1)</script>';
  assert.throws(() => renderBody(site));
  section.items[0].icon = 'default';
  section.elements.columns = '999';
  assert.throws(() => renderBody(site));
});
