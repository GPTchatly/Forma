/** Family sections and thin-group blocks defined as block manifests: one object per block
 * holds its metadata, fit, parts, editable item fields, prepared content, markup and CSS.
 * Markup and CSS are original Forma work; a `reference` names a design reference only, and
 * no upstream code is used.
 * This module imports nothing: `render(kit)` receives escaping, helpers and data from the
 * caller and returns markup in which every authored value is escaped. Prepared content never
 * invents customers, quotations, statistics, prices or times. */
const sectionTitle = ({ s, e, visible, part }) => visible(s, 'heading') ? `<div class="section-heading"><h2${part('heading')}>${e(s.title)}</h2></div>` : '';
const itemTitle = ({ e, visible, part }, item, tag = 'h3') => visible(item, 'heading') ? `<${tag}${part('heading', item)}>${e(item.title)}</${tag}>` : '';
const itemBody = ({ e, visible, part }, item) => item.body && visible(item, 'body') ? `<p${part('body', item)}>${e(item.body)}</p>` : '';
const shownPrice = (kit, item) => item.price ? kit.price(item) : '';
// A quotation is the item body; its title and label form the attribution.
const quotation = ({ e, visible, part, meta }, item) => `${item.body && visible(item, 'body') ? `<blockquote${part('body', item)}>${e(item.body)}</blockquote>` : ''}<figcaption>${visible(item, 'heading') ? `<strong${part('heading', item)}>${e(item.title)}</strong>` : ''}${meta(item)}</figcaption>`;

export const SITE_BLOCKS = [
  {
    id: 'contact-hours', group: 'contact', name: 'Hours and location', behavior: 'hours',
    description: 'Opening days and hours beside the address and a directions link; every row stays editable.',
    pattern: 'list', fit: { items: [0, 8], image: 'none', text: 'medium', directions: ['organic', 'understated'], families: ['local', 'hospitality', 'wellness'] },
    interactive: false, media: 'none',
    parts: { section: ['heading', 'body', 'action', 'buttonLabel', 'buttonIcon'], item: ['heading', 'body', 'price'] },
    elements: ['entrance', 'buttonStyle', 'buttonIcon', 'buttonLabelStyle', 'buttonIconPlacement', 'actionMotion'],
    fields: { item: { title: 'Days', price: 'Hours', body: 'Note' } },
    content(section, { item }) {
      Object.assign(section, { title: 'Opening hours', body: 'Add your street address, town and postal code.', button: 'Get directions', href: '' });
      section.items = [item('Monday to Friday', 'Add a note, such as appointments only.', '', 'Add hours'), item('Saturday', '', '', 'Add hours'), item('Sunday', '', '', 'Add hours')];
    },
    render(kit) {
      const { s, e, visible, part, itemAttrs, action } = kit;
      const rows = s.items.map((item, index) => `<div class="xp-hours-row"${itemAttrs(item, index)}><dt${part('heading', item)}>${visible(item, 'heading') ? e(item.title) : ''}</dt><dd>${shownPrice(kit, item)}${itemBody(kit, item)}</dd></div>`).join('');
      const address = s.body && visible(s, 'body') ? `<address class="xp-hours-address"${part('body')}>${e(s.body)}</address>` : '';
      return `${sectionTitle(kit)}<div class="xp-hours-layout">${rows ? `<dl class="xp-hours-list">${rows}</dl>` : ''}<div class="xp-hours-place">${address}${action()}</div></div>`;
    },
    css: '.xp-hours .xp-hours-layout{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);gap:48px;align-items:start}'
      + '.xp-hours .xp-hours-list{margin:0}.xp-hours .xp-hours-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:6px 24px;padding:16px 0;border-bottom:1px solid var(--line)}'
      + '.xp-hours dt{font-weight:600;overflow-wrap:anywhere}.xp-hours dd{margin:0;min-width:0}.xp-hours .xp-price{font-size:1rem;margin:0}.xp-hours dd p{margin:6px 0 0;color:var(--muted);font-size:.9rem}'
      + '.xp-hours .xp-hours-address{font-style:normal;line-height:1.65;white-space:pre-line;overflow-wrap:anywhere;margin:0 0 24px}'
      + '@media(max-width:800px){.xp-hours .xp-hours-layout{grid-template-columns:minmax(0,1fr);gap:28px}}@media(max-width:520px){.xp-hours .xp-hours-row{grid-template-columns:minmax(0,1fr)}}',
    expect: ['<dl class="xp-hours-list">', 'Add hours', 'class="xp-hours-address"']
  },
  {
    id: 'services-menu', group: 'services', name: 'Menu with sections', behavior: 'menu-list',
    description: 'Items grouped under their menu section, each name joined to its price by a dotted leader.',
    pattern: 'list', fit: { items: [1, 8], image: 'none', text: 'medium', directions: ['editorial', 'organic'], families: ['local', 'hospitality'] },
    interactive: false, media: 'none',
    parts: { section: ['heading', 'body'], item: ['heading', 'body', 'meta', 'price'] },
    elements: ['entrance'],
    fields: { item: { meta: 'Menu section', price: 'Price text' } },
    content(section, { item }) {
      Object.assign(section, { title: 'The menu', body: 'Replace these examples with your actual dishes, drinks or treatments and their prices.' });
      const entry = (title, label) => item(title, 'Describe it in a few words, including the main ingredients or what is included.', label, 'Add price');
      section.items = [entry('A seasonal starter', 'To begin'), entry('A signature main', 'Mains'), entry('A second main', 'Mains'), entry('A sweet ending', 'To finish')];
    },
    render(kit) {
      const { s, e, visible, part, itemAttrs, heading } = kit;
      // An item whose label is removed joins the unlabelled group; no item is ever left out.
      const label = (item) => visible(item, 'meta') ? item.meta : '';
      const entries = (key) => s.items.filter((item) => label(item) === key).map((item) => `<li class="xp-menu-item"${itemAttrs(item, s.items.indexOf(item))}><div class="xp-menu-line">${visible(item, 'heading') ? `<span class="xp-menu-name"${part('heading', item)}>${e(item.title)}</span>` : ''}${item.price && visible(item, 'price') ? `<span class="xp-menu-leader" aria-hidden="true"></span>${kit.price(item)}` : ''}</div>${itemBody(kit, item)}</li>`).join('');
      return `${heading}<div class="xp-menu-sections">${[...new Set(s.items.map(label))].map((key) => `<div class="xp-menu-group">${key ? `<h3>${e(key)}</h3>` : ''}<ul class="xp-menu-items">${entries(key)}</ul></div>`).join('')}</div>`;
    },
    css: '.xp-menu-list .xp-menu-sections{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));gap:32px 56px}'
      + '.xp-menu-list .xp-menu-group h3{font-size:1.25rem;margin:0 0 8px;padding-bottom:10px;border-bottom:1px solid var(--line)}.xp-menu-list .xp-menu-items{list-style:none;margin:0;padding:0}'
      + '.xp-menu-list .xp-menu-item{padding:14px 0}.xp-menu-list .xp-menu-line{display:flex;align-items:baseline;gap:12px;min-width:0}.xp-menu-list .xp-menu-name{font-weight:600;min-width:0;overflow-wrap:anywhere}'
      + '.xp-menu-list .xp-menu-leader{flex:1 1 24px;min-width:16px;border-bottom:1px dotted var(--muted)}.xp-menu-list .xp-price{font-size:1rem;margin:0;max-width:50%;text-align:right;overflow-wrap:anywhere}'
      + '.xp-menu-list .xp-menu-item p{margin:6px 0 0;color:var(--muted)}',
    expect: ['class="xp-menu-sections"', '<h3>Mains</h3>', 'xp-menu-leader']
  },
  {
    id: 'gallery-rooms', group: 'gallery', name: 'Rooms and stays', behavior: 'rooms',
    description: 'Room cards with a photo, name, description, rate text and an optional booking or detail link.',
    pattern: 'grid', fit: { items: [1, 8], image: 'led', text: 'medium', directions: ['organic'], families: ['hospitality'] },
    interactive: false, media: 'item',
    parts: { section: ['heading', 'body'], item: ['heading', 'body', 'price', 'media'] },
    elements: ['entrance', 'textOrder', 'columns'],
    fields: { item: { price: 'Rate', href: 'Card link' } },
    content(section, { item }) {
      Object.assign(section, { title: 'Rooms and stays', body: 'Add real photos, room names, rates and what each stay includes.' });
      section.items = ['A quiet double room', 'A family suite', 'A studio with a kitchen'].map((title) => item(title, 'Describe the beds, the view and what the room includes.', '', 'Add rate'));
    },
    render(kit) {
      const { s, spec, context, h, itemAttrs, image, heading } = kit;
      return `${heading}<div class="xp-rooms-grid">${s.items.map((item, index) => `<article class="xp-card xp-room"${itemAttrs(item, index)}>${image(item, index)}<div class="xp-copy">${h.itemText(s, item, spec, context)}</div>${shownPrice(kit, item)}</article>`).join('')}</div>`;
    },
    css: '.xp-rooms .xp-rooms-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),1fr));gap:24px}'
      + '.site-section.gallery-rooms[data-element-columns]:not([data-element-columns="default"]) .xp-rooms-grid{grid-template-columns:repeat(var(--element-columns),minmax(0,1fr))}'
      + '.xp-rooms .xp-room{display:flex;flex-direction:column}.xp-rooms .xp-price{font-size:1.15rem;margin:auto 0 0;padding-top:16px}',
    expect: ['class="xp-rooms-grid"', 'Add rate', 'xp-card xp-room']
  },
  {
    id: 'features-amenities', group: 'features', name: 'Amenity checklist', behavior: 'amenities',
    description: 'A compact checklist of short amenities, each with an icon and an optional note.',
    pattern: 'grid', fit: { items: [1, 8], image: 'none', text: 'short', directions: ['organic', 'understated'], families: ['hospitality', 'local'] },
    interactive: false, media: 'none',
    parts: { section: ['heading', 'body'], item: ['heading', 'body', 'icon'] },
    elements: ['entrance', 'iconStyle', 'iconSize', 'columns'],
    fields: { item: {} },
    content(section, { item }) {
      Object.assign(section, { title: 'What is included', body: 'Replace these examples with the amenities you actually offer.' });
      section.items = ['Wireless internet', 'Kitchen', 'Parking', 'Washing machine', 'Garden or terrace', 'Step-free access'].map((title) => item(title));
    },
    render(kit) {
      const { s, context, h, itemAttrs, heading } = kit;
      return `${heading}<ul class="xp-amenity-list">${s.items.map((item, index) => `<li class="xp-amenity"${itemAttrs(item, index)}>${h.featureIcon(item, index, context)}<div class="xp-amenity-text">${itemTitle(kit, item)}${itemBody(kit, item)}</div></li>`).join('')}</ul>`;
    },
    css: '.xp-amenities .xp-amenity-list{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,220px),1fr));gap:4px 32px}'
      + '.site-section.features-amenities[data-element-columns]:not([data-element-columns="default"]) .xp-amenity-list{grid-template-columns:repeat(var(--element-columns),minmax(0,1fr))}'
      + '.xp-amenities .xp-amenity{display:flex;align-items:flex-start;gap:14px;padding:16px 0;border-top:1px solid var(--line);min-width:0}.xp-amenities .feature-icon{margin:0;flex:none}'
      + '.xp-amenities .xp-amenity-text{min-width:0}.xp-amenities .xp-amenity h3{font-size:1.05rem;margin:0}.xp-amenities .xp-amenity p{margin:6px 0 0;color:var(--muted);font-size:.95rem}',
    expect: ['class="xp-amenity-list"', 'Step-free access', 'class="feature-icon"']
  },
  {
    id: 'process-schedule', group: 'process', name: 'Event schedule', behavior: 'schedule',
    description: 'Timed sessions grouped by day or track, with native filter buttons that work without network access.', reference: 'shadcn-html',
    pattern: 'interactive', fit: { items: [1, 8], image: 'none', text: 'medium', directions: ['product', 'understated'], families: ['event'] },
    interactive: true, media: 'none',
    parts: { section: ['heading', 'body'], item: ['heading', 'body', 'meta', 'price'] },
    elements: ['entrance'],
    fields: { item: { price: 'Time', meta: 'Day or track' } },
    content(section, { item }) {
      Object.assign(section, { title: 'Programme', body: 'Add your sessions, times and rooms. Replace these examples before publishing.' });
      const session = (title, day) => item(title, 'Describe what happens in this session and who it is for.', day, 'Add time');
      section.items = [session('Arrival and welcome', 'Day one'), session('Opening session', 'Day one'), session('Workshops', 'Day two'), session('Closing session', 'Day two')];
    },
    render(kit) {
      const { s, e, visible, part, itemAttrs, meta, heading, filters, groups, status } = kit;
      const rows = s.items.map((item, index) => {
        const when = `${item.price && visible(item, 'price') ? `<strong class="xp-schedule-time"${part('price', item)}>${e(item.price)}</strong>` : ''}${meta(item)}`;
        return `<li class="xp-schedule-row"${itemAttrs(item, index)}>${when ? `<div class="xp-schedule-when">${when}</div>` : ''}<div class="xp-schedule-what">${itemTitle(kit, item)}${itemBody(kit, item)}</div></li>`;
      }).join('');
      // Filters appear only when there is more than one day or track to choose between.
      return `${heading}${groups.length > 1 ? filters : ''}<ol class="xp-schedule-list">${rows}</ol>${groups.length > 1 ? status : ''}`;
    },
    css: '.xp-schedule .xp-schedule-list{list-style:none;margin:0;padding:0}.xp-schedule .xp-schedule-row{display:flex;flex-wrap:wrap;gap:8px 32px;padding:20px 0;border-top:1px solid var(--line)}'
      + '.xp-schedule .xp-schedule-when{flex:0 0 11rem;min-width:0}.xp-schedule .xp-schedule-what{flex:1 1 260px;min-width:0}'
      + '.xp-schedule .xp-schedule-time{display:block;font-size:1.15rem;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}.xp-schedule .xp-meta{margin:4px 0 0}'
      + '.xp-schedule .xp-schedule-what h3{font-size:1.2rem;margin:0 0 6px}.xp-schedule .xp-schedule-what p{margin:0;color:var(--muted)}',
    expect: ['class="xp-schedule-list"', 'data-xp-filter="Day two"', 'Add time']
  },
  {
    id: 'team-speakers', group: 'team', name: 'Speaker lineup', behavior: 'speakers',
    description: 'Portrait cards with each speaker’s name, role or topic and a short introduction.',
    pattern: 'grid', fit: { items: [1, 8], image: 'optional', text: 'medium', directions: ['expressive', 'editorial'], families: ['event'] },
    interactive: false, media: 'item',
    parts: { section: ['heading', 'body'], item: ['heading', 'body', 'meta', 'media'] },
    elements: ['entrance', 'columns'],
    fields: { item: { meta: 'Role or topic' } },
    render(kit) {
      const { s, itemAttrs, image, meta, heading } = kit;
      return `${heading}<div class="xp-speakers-grid">${s.items.map((item, index) => `<article class="xp-speaker"${itemAttrs(item, index)}>${image(item, index)}<div class="xp-speaker-text">${itemTitle(kit, item)}${meta(item)}${itemBody(kit, item)}</div></article>`).join('')}</div>`;
    },
    css: '.xp-speakers .xp-speakers-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,220px),1fr));gap:32px 24px}'
      + '.site-section.team-speakers[data-element-columns]:not([data-element-columns="default"]) .xp-speakers-grid{grid-template-columns:repeat(var(--element-columns),minmax(0,1fr))}'
      + '.xp-speakers .xp-image:not(.image-height-explicit){aspect-ratio:4/5}.xp-speakers .xp-speaker-text{min-width:0}.xp-speakers .xp-speaker h3{font-size:1.2rem;margin:16px 0 4px}'
      + '.xp-speakers .xp-meta{margin:0 0 8px;color:var(--accent)}.xp-speakers .xp-speaker p{margin:8px 0 0;color:var(--muted)}',
    expect: ['class="xp-speakers-grid"', 'class="xp-speaker"', 'Team member']
  },
  {
    id: 'pricing-tickets', group: 'pricing', name: 'Ticket tiers', behavior: 'tickets',
    description: 'Ticket cards with a name, price label, price text, what is included and a link; no scarcity or countdown claims.',
    pattern: 'grid', fit: { items: [1, 8], image: 'none', text: 'medium', directions: ['expressive', 'organic'], families: ['event'] },
    interactive: false, media: 'none',
    parts: { section: ['heading', 'body'], item: ['heading', 'body', 'meta', 'price', 'action', 'buttonLabel', 'buttonIcon'] },
    elements: ['entrance', 'buttonStyle', 'buttonIcon', 'buttonLabelStyle', 'buttonIconPlacement', 'actionMotion', 'columns'],
    fields: { item: { meta: 'Billing / price label', price: 'Price text', href: 'Item link' } },
    content(section, { item }) {
      Object.assign(section, { title: 'Tickets', body: 'Add your ticket types, prices and what each includes before publishing.' });
      const ticket = (title, label) => item(title, 'Add what this ticket includes, one item per line.', label, 'Add price');
      section.items = [ticket('Day ticket', 'per person'), ticket('Full event ticket', 'per person'), ticket('Group ticket', 'per group')];
    },
    render(kit) {
      const { s, spec, context, h, itemAttrs, meta, heading } = kit;
      return `${heading}<div class="xp-tickets-grid">${s.items.map((item, index) => `<article class="xp-plan xp-ticket"${itemAttrs(item, index)}><div class="xp-ticket-head">${itemTitle(kit, item)}${meta(item)}</div>${shownPrice(kit, item)}${itemBody(kit, item)}${h.link(s.button || 'Choose this ticket', item.href, spec, context, false, s, item, true)}</article>`).join('')}</div>`;
    },
    css: '.xp-tickets .xp-tickets-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,260px),1fr));gap:24px}'
      + '.site-section.pricing-tickets[data-element-columns]:not([data-element-columns="default"]) .xp-tickets-grid{grid-template-columns:repeat(var(--element-columns),minmax(0,1fr))}'
      + '.xp-tickets .xp-ticket{display:flex;flex-direction:column;gap:8px;border-style:dashed}.xp-tickets .xp-ticket h3{margin:0}.xp-tickets .xp-ticket .xp-meta{margin:4px 0 0}'
      + '.xp-tickets .xp-price{margin:8px 0}.xp-tickets .xp-ticket p{margin:0 0 12px}.xp-tickets .xp-ticket .site-button{margin-top:auto;align-self:flex-start}',
    expect: ['class="xp-tickets-grid"', 'xp-plan xp-ticket', 'Add price']
  },
  {
    id: 'logos-integrations', group: 'logos', name: 'Integration directory', behavior: 'integrations',
    description: 'A searchable directory of integration cards with a name, category and short description.', reference: 'shadcn-html',
    pattern: 'interactive', fit: { items: [1, 8], image: 'optional', text: 'short', directions: ['product'], families: ['saas'] },
    interactive: true, media: 'item',
    parts: { section: ['heading', 'body'], item: ['heading', 'body', 'meta', 'media'] },
    elements: ['entrance'],
    fields: { item: { meta: 'Category' } },
    render(kit) {
      const { s, itemAttrs, image, meta, heading, search, status } = kit;
      return `${heading}${search('Search integrations')}<div class="xp-integrations-grid">${s.items.map((item, index) => `<article class="xp-card xp-integration"${itemAttrs(item, index)}>${item.image ? image(item, index) : ''}${itemTitle(kit, item)}${meta(item)}${itemBody(kit, item)}</article>`).join('')}</div>${status}`;
    },
    css: '.xp-integrations .xp-integrations-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,240px),1fr));gap:20px}'
      + '.xp-integrations .xp-card>.xp-image{margin:0 0 16px;max-width:100%;background:transparent}.xp-integrations .xp-card>.xp-image:not(.image-height-explicit){aspect-ratio:2/1}'
      + '.xp-integrations .xp-integration h3{font-size:1.15rem;margin:0 0 4px}.xp-integrations .xp-integration .xp-meta{margin:0 0 8px}',
    expect: ['class="xp-integrations-grid"', 'data-xp-search', 'Search integrations']
  },
  {
    id: 'process-changelog', group: 'process', name: 'Changelog timeline', behavior: 'changelog',
    description: 'Dated release notes in reading order, each with a date label, a title and a description.',
    pattern: 'list', fit: { items: [1, 8], image: 'none', text: 'medium', directions: ['understated', 'editorial'], families: ['saas'] },
    interactive: false, media: 'none',
    parts: { section: ['heading', 'body'], item: ['heading', 'body', 'meta'] },
    elements: ['entrance'],
    fields: { item: { meta: 'Date label' } },
    content(section, { item }) {
      Object.assign(section, { title: 'What’s new', body: 'Record notable changes in your own words. Replace these examples before publishing.' });
      section.items = ['A notable improvement', 'A new capability', 'First release'].map((title) => item(title, 'Describe what changed and why it matters to the people who use it.', 'Add date'));
    },
    render(kit) {
      const { s, itemAttrs, meta, heading } = kit;
      return `${heading}<ol class="xp-changelog-list">${s.items.map((item, index) => `<li class="xp-changelog-entry"${itemAttrs(item, index)}>${meta(item)}<div class="xp-changelog-body">${itemTitle(kit, item)}${itemBody(kit, item)}</div></li>`).join('')}</ol>`;
    },
    css: '.xp-changelog .xp-changelog-list{list-style:none;margin:0;padding:0;max-width:880px}.xp-changelog .xp-changelog-entry{display:flex;flex-wrap:wrap;gap:8px 32px;padding:24px 0;border-top:1px solid var(--line)}'
      + '.xp-changelog .xp-changelog-entry>.xp-meta{flex:0 0 10rem;margin:4px 0 0;font-variant-numeric:tabular-nums}.xp-changelog .xp-changelog-body{flex:1 1 260px;min-width:0}'
      + '.xp-changelog .xp-changelog-body h3{font-size:1.3rem;margin:0 0 8px}.xp-changelog .xp-changelog-body p{margin:0;color:var(--muted)}',
    expect: ['class="xp-changelog-list"', 'Add date', 'First release']
  },
  {
    id: 'features-code', group: 'features', name: 'Code showcase', behavior: 'code',
    description: 'A window frame with one tab per example; each example is shown as escaped plain text.', reference: 'shadcn-html',
    pattern: 'interactive', fit: { items: [1, 8], image: 'none', text: 'medium', directions: ['product'], families: ['saas'] },
    interactive: true, media: 'none',
    parts: { section: ['heading', 'body'], item: ['heading', 'body'] },
    elements: ['entrance'],
    fields: { item: {} },
    content(section, { item }) {
      Object.assign(section, { title: 'Start in a few steps', body: 'Replace these placeholders with short, tested examples from your own documentation.' });
      section.items = [item('Install', '# Replace with your installation command'), item('Configure', '# Replace with a short configuration example'), item('Use', '# Replace with a minimal usage example')];
    },
    render(kit) {
      const { s, e, visible, part, itemAttrs, control, heading } = kit;
      const label = (item, index) => item.title && visible(item, 'heading') ? item.title : `Example ${index + 1}`;
      const tabs = `<div class="xp-tablist" aria-label="${e(s.title || 'Code examples')}">${s.items.map((item, index) => control('tab', label(item, index), `data-xp-index="${index}" aria-controls="xp-${e(s.id)}-panel-${index}"`)).join('')}</div>`;
      const panels = s.items.map((item, index) => `<article class="xp-code-panel" id="xp-${e(s.id)}-panel-${index}" data-xp-panel="${index}"${itemAttrs(item, index)}>${itemTitle(kit, item)}${visible(item, 'body') ? `<pre${part('body', item)}><code>${e(item.body)}</code></pre>` : ''}</article>`).join('');
      return `${heading}<div class="xp-code-window"><div class="xp-code-bar" aria-hidden="true"><i></i><i></i><i></i></div>${s.items.length ? tabs + panels : ''}</div>`;
    },
    css: '.xp-code .xp-code-window{min-width:0;border:1px solid var(--line);border-radius:var(--radius);background:var(--surface);overflow:hidden}'
      + '.xp-code .xp-code-bar{display:flex;gap:6px;padding:12px 16px;background:var(--soft);border-bottom:1px solid var(--line)}.xp-code .xp-code-bar i{width:9px;height:9px;border-radius:50%;background:var(--muted)}'
      + '.xp-code .xp-tablist{margin:0;padding:10px 12px;border-bottom:1px solid var(--line)}.xp-code .xp-code-panel{min-width:0;padding:20px}.xp-code .xp-code-panel h3{font-size:1.1rem;margin:0 0 12px}'
      + '.xp-code pre{margin:0;max-width:100%;overflow:auto;padding:16px;background:var(--soft);color:var(--ink);border-radius:8px}.xp-code code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:.9rem;white-space:pre}',
    expect: ['class="xp-code-window"', 'data-xp-action="tab"', '<code># Replace with your installation command</code></pre>']
  },
  // Thin-group blocks. They keep the group's prepared placeholders: a statistic's value is its
  // `price` and its source `meta`, a quotation is its `body` with `title` and `meta` as the
  // attribution, a person's role and a logo's caption are `meta`.
  {
    id: 'stats-cards', group: 'stats', name: 'Statistic cards', behavior: 'stat-cards',
    description: 'Each value on its own card with its label, context and source.', reference: 'tailark',
    pattern: 'grid', fit: { items: [1, 8], image: 'none', text: 'medium', directions: ['understated', 'organic'], families: ['general', 'local', 'wellness'] },
    interactive: false, media: 'none',
    parts: { section: ['heading', 'body'], item: ['heading', 'body', 'meta', 'price'] },
    elements: ['entrance', 'columns'],
    fields: { item: { price: 'Value', meta: 'Source' } },
    render(kit) {
      const { s, itemAttrs, meta, heading } = kit;
      return `${heading}<div class="xp-stat-card-grid">${s.items.map((item, index) => `<article class="xp-stat-card"${itemAttrs(item, index)}>${shownPrice(kit, item)}${itemTitle(kit, item)}${itemBody(kit, item)}${meta(item)}</article>`).join('')}</div>`;
    },
    css: '.xp-stat-cards .xp-stat-card-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:20px}'
      + '.site-section.stats-cards[data-element-columns]:not([data-element-columns="default"]) .xp-stat-card-grid{grid-template-columns:repeat(var(--element-columns),minmax(0,1fr))}'
      + '.xp-stat-cards .xp-stat-card{display:flex;flex-direction:column;gap:8px;min-width:0;padding:28px;border:1px solid var(--line);border-radius:var(--radius);background:var(--surface)}'
      + '.xp-stat-cards .xp-price{font-size:clamp(2rem,4vw,3.2rem);margin:0;color:var(--accent)}.xp-stat-cards .xp-stat-card h3{font-size:1.1rem;margin:0}'
      + '.xp-stat-cards .xp-stat-card p{margin:0;color:var(--muted)}.xp-stat-cards .xp-meta{margin:auto 0 0;padding-top:12px;border-top:1px solid var(--line)}',
    expect: ['class="xp-stat-card-grid"', 'class="xp-stat-card"', 'Source or period']
  },
  {
    id: 'stats-split', group: 'stats', name: 'Statistics with context', behavior: 'stat-split',
    description: 'The section text leads on one side; the values, each with its explanation and source, follow on the other.', reference: 'tailark',
    pattern: 'showcase', fit: { items: [1, 8], image: 'none', text: 'long', directions: ['editorial', 'expressive'], families: ['studio', 'event'] },
    interactive: false, media: 'none',
    parts: { section: ['heading', 'body'], item: ['heading', 'body', 'meta', 'price'] },
    elements: ['entrance'],
    fields: { item: { price: 'Value', meta: 'Source' } },
    render(kit) {
      const { s, itemAttrs, meta, heading } = kit;
      const rows = s.items.map((item, index) => `<li class="xp-stat-split-row"${itemAttrs(item, index)}><div class="xp-stat-split-value">${shownPrice(kit, item)}</div><div class="xp-stat-split-text">${itemTitle(kit, item)}${itemBody(kit, item)}${meta(item)}</div></li>`).join('');
      return `<div class="xp-stat-split-layout"><div class="xp-stat-split-lead">${heading}</div>${rows ? `<ul class="xp-stat-split-list">${rows}</ul>` : ''}</div>`;
    },
    css: '.xp-stat-split .xp-stat-split-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.4fr);gap:64px;align-items:start}.xp-stat-split .xp-stat-split-lead .section-heading{margin:0}'
      + '.xp-stat-split .xp-stat-split-list{list-style:none;margin:0;padding:0}.xp-stat-split .xp-stat-split-row{display:grid;grid-template-columns:minmax(0,11rem) minmax(0,1fr);gap:8px 32px;padding:24px 0;border-top:1px solid var(--line)}'
      + '.xp-stat-split .xp-price{font-size:clamp(2rem,4vw,3rem);margin:0;color:var(--accent)}.xp-stat-split .xp-stat-split-value,.xp-stat-split .xp-stat-split-text{min-width:0}.xp-stat-split .xp-stat-split-text h3{font-size:1.2rem;margin:0 0 6px}'
      + '.xp-stat-split .xp-stat-split-text p{margin:0;color:var(--muted)}.xp-stat-split .xp-meta{margin:10px 0 0}'
      + '@media(max-width:800px){.xp-stat-split .xp-stat-split-layout{grid-template-columns:minmax(0,1fr);gap:28px}}@media(max-width:520px){.xp-stat-split .xp-stat-split-row{grid-template-columns:minmax(0,1fr)}}',
    expect: ['class="xp-stat-split-layout"', 'class="xp-stat-split-row"', 'Your measure']
  },
  {
    id: 'stats-inline', group: 'stats', name: 'Inline statistics', behavior: 'stat-inline',
    description: 'Two to four short values in one ruled band, each beside its label.', reference: 'tailark',
    pattern: 'list', fit: { items: [2, 4], image: 'none', text: 'short', directions: ['product', 'understated'], families: ['saas', 'portfolio'] },
    interactive: false, media: 'none',
    parts: { section: ['heading', 'body'], item: ['heading', 'body', 'meta', 'price'] },
    elements: ['entrance'],
    fields: { item: { price: 'Value', meta: 'Source' } },
    render(kit) {
      const { s, itemAttrs, meta, heading } = kit;
      return `${heading}${s.items.length ? `<ul class="xp-stat-inline-list">${s.items.map((item, index) => `<li class="xp-stat-inline-item"${itemAttrs(item, index)}>${shownPrice(kit, item)}${itemTitle(kit, item)}${itemBody(kit, item)}${meta(item)}</li>`).join('')}</ul>` : ''}`;
    },
    css: '.xp-stat-inline .xp-stat-inline-list{list-style:none;margin:0;padding:20px 0;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr));gap:20px 0;border-block:1px solid var(--line)}'
      + '.xp-stat-inline .xp-stat-inline-item{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 12px;min-width:0;padding:4px 24px;border-left:1px solid var(--line)}'
      + '.xp-stat-inline .xp-price{font-size:clamp(1.6rem,3vw,2.2rem);margin:0}.xp-stat-inline .xp-stat-inline-item h3{font-size:1rem;margin:0;min-width:0}'
      + '.xp-stat-inline .xp-stat-inline-item p,.xp-stat-inline .xp-meta{flex:1 1 100%;margin:0;font-size:.85rem;color:var(--muted)}',
    expect: ['class="xp-stat-inline-list"', 'class="xp-stat-inline-item"', 'Your measure']
  },
  {
    id: 'logos-grid', group: 'logos', name: 'Logo grid', behavior: 'logo-grid',
    description: 'Uploaded marks or names in an even ruled grid, each with an optional caption and link.', reference: 'tailark',
    pattern: 'grid', fit: { items: [1, 8], image: 'optional', text: 'short', directions: ['editorial', 'organic'], families: ['studio', 'general', 'local'] },
    interactive: false, media: 'item',
    parts: { section: ['heading', 'body'], item: ['heading', 'body', 'meta', 'media'] },
    elements: ['entrance', 'columns'],
    fields: { item: { meta: 'Caption', href: 'Card link' } },
    render(kit) {
      const { s, spec, context, h, itemAttrs, image, meta, heading } = kit;
      // A tile without an uploaded mark shows the name alone, never placeholder art.
      return `${heading}${s.items.length ? `<div class="xp-logo-tile-grid">${s.items.map((item, index) => `<article class="xp-logo-tile"${itemAttrs(item, index)}>${item.image ? image(item, index) : ''}<div class="xp-logo-name">${h.itemText(s, item, spec, context)}</div>${meta(item)}</article>`).join('')}</div>` : ''}`;
    },
    css: '.xp-logo-grid .xp-logo-tile-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,180px),1fr));border-top:1px solid var(--line);border-left:1px solid var(--line)}'
      + '.site-section.logos-grid[data-element-columns]:not([data-element-columns="default"]) .xp-logo-tile-grid{grid-template-columns:repeat(var(--element-columns),minmax(0,1fr))}'
      + '.xp-logo-grid .xp-logo-tile{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-width:0;min-height:140px;padding:28px 16px;text-align:center;border-right:1px solid var(--line);border-bottom:1px solid var(--line)}'
      + '.xp-logo-grid .xp-image{background:transparent;margin:0 0 8px}.xp-logo-grid .xp-image:not(.image-sized){width:100%;max-width:160px}.xp-logo-grid .xp-image:not(.image-height-explicit){aspect-ratio:2/1}.xp-logo-grid .xp-image:not(.image-sized) img{object-fit:contain}'
      + '.xp-logo-grid .xp-logo-name{min-width:0;max-width:100%}.xp-logo-grid .xp-logo-name h3{font-size:1.05rem;margin:0}.xp-logo-grid .xp-logo-name p{margin:4px 0 0;font-size:.85rem;color:var(--muted)}.xp-logo-grid .xp-logo-name p:empty{display:none}.xp-logo-grid .xp-meta{margin:0}',
    expect: ['class="xp-logo-tile-grid"', 'class="xp-logo-tile"', 'Sample mark']
  },
  {
    id: 'quotes-wall', group: 'testimonials', name: 'Quotation wall', behavior: 'quote-wall',
    description: 'Quotations of any length flow in balanced columns, each with its attribution.', reference: 'tailark',
    pattern: 'grid', fit: { items: [1, 8], image: 'none', text: 'long', directions: ['organic', 'understated'], families: ['local', 'hospitality', 'wellness'] },
    interactive: false, media: 'none',
    parts: { section: ['heading', 'body'], item: ['heading', 'body', 'meta'] },
    elements: ['entrance', 'columns'],
    fields: { item: { body: 'Quotation', meta: 'Source' } },
    render(kit) {
      const { s, itemAttrs, heading } = kit;
      return `${heading}<div class="xp-quote-wall-columns">${s.items.map((item, index) => `<figure class="xp-quote"${itemAttrs(item, index)}>${quotation(kit, item)}</figure>`).join('')}</div>`;
    },
    css: '.xp-quote-wall .xp-quote-wall-columns{columns:3 260px;column-gap:24px}.xp-quote-wall .xp-quote{display:block;break-inside:avoid;margin:0 0 24px}'
      + '.site-section.quotes-wall[data-element-columns]:not([data-element-columns="default"]) .xp-quote-wall-columns{columns:var(--element-columns);column-width:auto}'
      + '.xp-quote-wall .xp-quote blockquote{font-size:1.1rem;line-height:1.6;margin:0 0 20px}.xp-quote-wall .xp-quote:nth-child(3n+1) blockquote{font-size:1.3rem}',
    expect: ['class="xp-quote-wall-columns"', 'class="xp-quote"', 'Add an approved quotation here.']
  },
  {
    id: 'quotes-spotlight', group: 'testimonials', name: 'Quotation spotlight', behavior: 'quote-spotlight',
    description: 'One large quotation at a time, chosen from named tabs that also work with arrow keys.', reference: 'tailark',
    pattern: 'interactive', fit: { items: [1, 8], image: 'none', text: 'long', directions: ['expressive', 'product'], families: ['saas', 'studio'] },
    interactive: true, media: 'none',
    parts: { section: ['heading', 'body'], item: ['heading', 'body', 'meta'] },
    elements: ['entrance'],
    fields: { item: { body: 'Quotation', meta: 'Source' } },
    render(kit) {
      const { s, e, visible, itemAttrs, control, heading } = kit;
      const label = (item, index) => item.title && visible(item, 'heading') ? item.title : `Quotation ${index + 1}`;
      // The fixed runtime's tab action selects a panel; without script every quotation is shown.
      const tabs = `<div class="xp-tablist" aria-label="${e(s.title || 'Quotations')}">${s.items.map((item, index) => control('tab', label(item, index), `data-xp-index="${index}" aria-controls="xp-${e(s.id)}-panel-${index}"`)).join('')}</div>`;
      const panels = s.items.map((item, index) => `<figure class="xp-quote-spotlight-panel" id="xp-${e(s.id)}-panel-${index}" data-xp-panel="${index}"${itemAttrs(item, index)}>${quotation(kit, item)}</figure>`).join('');
      return `${heading}${s.items.length ? `<div class="xp-quote-spotlight-stage">${tabs}${panels}</div>` : ''}`;
    },
    css: '.xp-quote-spotlight .xp-quote-spotlight-stage{max-width:920px}.xp-quote-spotlight:not([data-xp-enhanced="true"]) .xp-tablist{display:none}'
      + '.xp-quote-spotlight .xp-quote-spotlight-panel{margin:0;padding:32px 0;border-top:1px solid var(--line);min-width:0}'
      + '.xp-quote-spotlight blockquote{font-family:var(--heading-font);font-size:clamp(1.5rem,3.2vw,2.6rem);line-height:1.35;margin:0 0 28px;white-space:pre-line;overflow-wrap:anywhere}'
      + '.xp-quote-spotlight figcaption{display:grid;gap:6px}.xp-quote-spotlight .xp-meta{margin:0}',
    expect: ['class="xp-quote-spotlight-stage"', 'data-xp-action="tab"', 'data-xp-panel="1"']
  },
  {
    id: 'team-cards', group: 'team', name: 'Team profiles', behavior: 'team-cards',
    description: 'One row per person: a portrait beside the role, name, optional link and a longer biography.', reference: 'tailark',
    pattern: 'list', fit: { items: [1, 8], image: 'optional', text: 'long', directions: ['editorial', 'organic'], families: ['studio', 'wellness', 'portfolio'] },
    interactive: false, media: 'item',
    parts: { section: ['heading', 'body'], item: ['heading', 'body', 'meta', 'media'] },
    elements: ['entrance'],
    fields: { item: { meta: 'Role', href: 'Item link' } },
    render(kit) {
      const { s, spec, context, h, itemAttrs, image, meta, heading } = kit;
      return `${heading}${s.items.length ? `<ul class="xp-team-cards-list">${s.items.map((item, index) => `<li class="xp-team-card"${itemAttrs(item, index)}>${image(item, index)}<div class="xp-team-card-text">${meta(item)}${h.itemText(s, item, spec, context)}</div></li>`).join('')}</ul>` : ''}`;
    },
    css: '.xp-team-cards .xp-team-cards-list{list-style:none;margin:0;padding:0}'
      + '.xp-team-cards .xp-team-card{display:grid;grid-template-columns:minmax(0,220px) minmax(0,1fr);gap:24px 40px;align-items:start;padding:32px 0;border-top:1px solid var(--line)}.xp-team-cards .xp-team-card:not(:has(>.xp-image)){grid-template-columns:minmax(0,1fr)}'
      + '.xp-team-cards .xp-image:not(.image-height-explicit){aspect-ratio:4/5}.xp-team-cards .xp-team-card-text{min-width:0}.xp-team-cards .xp-meta{margin:0 0 8px;color:var(--accent)}'
      + '.xp-team-cards .xp-team-card h3{font-size:1.5rem;margin:0 0 12px}.xp-team-cards .xp-team-card p{margin:0;color:var(--muted)}'
      + '@media(max-width:640px){.xp-team-cards .xp-team-card{grid-template-columns:minmax(0,1fr)}.xp-team-cards .xp-image{max-width:240px}}',
    expect: ['class="xp-team-cards-list"', 'class="xp-team-card"', 'Add a real biography.']
  },
  {
    id: 'about-values', group: 'about', name: 'Story with values', behavior: 'values',
    description: 'The story beside a numbered list of the values behind the work, each with a short explanation.', reference: 'tailark',
    pattern: 'list', fit: { items: [1, 8], image: 'none', text: 'medium', directions: ['product', 'organic'], families: ['saas', 'general', 'hospitality'] },
    interactive: false, media: 'none',
    parts: { section: ['heading', 'body'], item: ['heading', 'body'] },
    elements: ['entrance'],
    fields: { item: {} },
    content(section, { item }) {
      section.items = ['Your first value', 'Your second value', 'Your third value'].map((title) => item(title, 'Describe what this value means in practice for the people you work with.'));
    },
    render(kit) {
      const { s, itemAttrs, heading } = kit;
      const values = s.items.map((item, index) => `<li class="xp-value"${itemAttrs(item, index)}>${itemTitle(kit, item)}${itemBody(kit, item)}</li>`).join('');
      return `<div class="xp-values-layout"><div class="xp-values-story">${heading}</div>${values ? `<ol class="xp-values-list">${values}</ol>` : ''}</div>`;
    },
    css: '.xp-values .xp-values-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.2fr);gap:64px;align-items:start}.xp-values .xp-values-layout:not(:has(.xp-values-list)){grid-template-columns:minmax(0,1fr)}'
      + '.xp-values .xp-values-story .section-heading{margin:0}.xp-values .xp-values-list{list-style:none;margin:0;padding:0;counter-reset:xp-value}'
      + '.xp-values .xp-value{position:relative;min-width:0;padding:24px 0 24px 56px;border-top:1px solid var(--line);counter-increment:xp-value}'
      + '.xp-values .xp-value::before{content:counter(xp-value,decimal-leading-zero);position:absolute;left:0;top:26px;font-weight:600;font-variant-numeric:tabular-nums;color:var(--accent)}'
      + '.xp-values .xp-value h3{font-size:1.3rem;margin:0 0 8px}.xp-values .xp-value p{margin:0;color:var(--muted)}'
      + '@media(max-width:800px){.xp-values .xp-values-layout{grid-template-columns:minmax(0,1fr);gap:32px}}',
    expect: ['class="xp-values-list"', 'class="xp-values-story"', 'Your first value']
  },
  {
    id: 'cta-split', group: 'cta', name: 'Split invitation', behavior: 'cta-split',
    description: 'A large closing headline on one side, the supporting text and action on the other.', reference: 'tailark',
    pattern: 'showcase', fit: { items: [0, 8], image: 'none', text: 'medium', directions: ['editorial', 'expressive'], families: ['studio', 'portfolio'] },
    interactive: false, media: 'none',
    parts: { section: ['heading', 'body', 'action', 'buttonLabel', 'buttonIcon'], item: [] },
    elements: ['entrance', 'buttonStyle', 'buttonIcon', 'buttonLabelStyle', 'buttonIconPlacement', 'actionMotion'],
    fields: { item: {} },
    render(kit) {
      const { s, e, visible, part, action } = kit;
      const title = visible(s, 'heading') ? `<h2${part('heading')}>${e(s.title)}</h2>` : '';
      const body = s.body && visible(s, 'body') ? `<p${part('body')}>${e(s.body)}</p>` : '';
      return `<div class="xp-cta-split-layout"><div class="xp-cta-split-title">${title}</div><div class="xp-cta-split-side">${body}${action()}</div></div>`;
    },
    css: '.xp-cta-split .xp-cta-split-layout{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:24px 56px;align-items:end;padding-top:40px;border-top:1px solid var(--line)}'
      + '.xp-cta-split .xp-cta-split-title h2{font-size:clamp(2.2rem,5vw,4rem);line-height:1.05;margin:0}.xp-cta-split .xp-cta-split-side{min-width:0}.xp-cta-split .xp-cta-split-side p{margin:0 0 24px;color:var(--muted)}'
      + '@media(max-width:800px){.xp-cta-split .xp-cta-split-layout{grid-template-columns:minmax(0,1fr)}}',
    expect: ['class="xp-cta-split-layout"', 'Ready for a fresh perspective?', 'Get in touch']
  },
  {
    id: 'cta-banner', group: 'cta', name: 'Slim banner', behavior: 'cta-banner',
    description: 'A single compact bar with a short headline, one line of text and the action.', reference: 'tailark',
    pattern: 'statement', fit: { items: [0, 8], image: 'none', text: 'medium', directions: ['understated', 'product'], families: ['saas', 'general', 'local'] },
    interactive: false, media: 'none',
    parts: { section: ['heading', 'body', 'action', 'buttonLabel', 'buttonIcon'], item: [] },
    elements: ['entrance', 'buttonStyle', 'buttonIcon', 'buttonLabelStyle', 'buttonIconPlacement', 'actionMotion'],
    fields: { item: {} },
    render(kit) {
      const { s, e, visible, part, action } = kit;
      const title = visible(s, 'heading') ? `<h2${part('heading')}>${e(s.title)}</h2>` : '';
      const body = s.body && visible(s, 'body') ? `<p${part('body')}>${e(s.body)}</p>` : '';
      return `<div class="xp-cta-banner-bar"><div class="xp-cta-banner-text">${title}${body}</div>${action()}</div>`;
    },
    css: '.xp-cta-banner .xp-cta-banner-bar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:16px 32px;padding:24px 32px;border:1px solid var(--line);border-radius:var(--radius);background:var(--soft)}'
      + '.xp-cta-banner .xp-cta-banner-text{flex:1 1 320px;min-width:0}.xp-cta-banner .xp-cta-banner-text h2{font-size:clamp(1.3rem,2.4vw,1.8rem);margin:0}.xp-cta-banner .xp-cta-banner-text p{margin:6px 0 0;color:var(--muted)}'
      + '@media(max-width:520px){.xp-cta-banner .xp-cta-banner-bar{padding:20px}}',
    expect: ['class="xp-cta-banner-bar"', 'Ready for a fresh perspective?', 'Get in touch']
  }
];
