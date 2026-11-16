/** The AI application set as block manifests: five application screens and two website
 * blocks, plus the markup of the seven agent item types, written once for both of its hosts.
 * Markup and CSS are original Forma work; `gradientdeck` names a design reference only, and no
 * upstream code is used. Every block is a prepared demonstration: its entries are placeholder
 * text written in advance, no model is connected, no form posts anywhere and nothing loads.
 * This module imports nothing: hosts pass escaping, visibility, part attributes and icons in,
 * and every authored value reaches the markup only through them. */

// The part keys `agentItem` marks for each type: one list for the item parts of the screens
// below and of the screens drawn through `module()` in shared/interface-render.mjs.
export const AGENT_ITEM_PARTS = Object.freeze({
  message: Object.freeze(['heading', 'body', 'meta', 'icon']),
  toolcall: Object.freeze(['heading', 'body', 'meta', 'icon']),
  citation: Object.freeze(['heading', 'body', 'meta']),
  plan: Object.freeze(['heading', 'body', 'meta', 'icon']),
  approval: Object.freeze(['heading', 'body', 'meta', 'control']),
  artifact: Object.freeze(['heading', 'body', 'meta']),
  meter: Object.freeze(['heading', 'body', 'meta', 'price'])
});
export const AGENT_ITEM_TYPES = Object.freeze(Object.keys(AGENT_ITEM_PARTS));
/** The type a host draws an item as: its saved type when that is an agent type, else `fallback`. */
export const agentItemType = (item, fallback) => typeof item?.uiType === 'string' && Object.hasOwn(AGENT_ITEM_PARTS, item.uiType) ? item.uiType : fallback;

const FIELDS = Object.freeze({ heading: 'title', body: 'body', meta: 'meta', price: 'price' });
/** Tools for `agentItem`, built from a host's own escaping, visibility, part-attribute and icon
 * helpers: per part key whether it is shown, its escaped text and its part attribute string. */
export function agentTools(item, { escape, visible, attrs, icon }) {
  return {
    shown: (key) => visible(item, key),
    text: (key) => Object.hasOwn(FIELDS, key) ? escape(item?.[FIELDS[key]] ?? '') : '',
    attrs: (key) => attrs(key),
    icon: (name) => icon(name, 18)
  };
}

const GLYPHS = Object.freeze({ message: 'users', toolcall: 'settings', plan: 'check' });
// Two numbers in the value field, such as "40 / 100" or "40 of 100", set the meter's level.
// Digits only reach the attributes; the expression has no nested quantifier.
const LEVEL = /^\s*(\d{1,12}(?:\.\d{1,6})?)\s*(?:\/|of)\s*(\d{1,12}(?:\.\d{1,6})?)(?!\d)/i;

/** The inside of one agent item of a type; nothing of its host. It carries no interaction root,
 * record, status region or item id; the approval's confirm control is its only runtime control,
 * and the host supplies the root and the status region that control needs. */
export function agentItem(type, item, index, tools) {
  const { shown, text, attrs, icon } = tools;
  const has = (key) => shown(key) && text(key) !== '';
  const title = (tag) => has('heading') ? `<${tag} class="ui-agent-title"${attrs('heading')}>${text('heading')}</${tag}>` : '';
  const label = () => has('meta') ? `<span class="ui-agent-meta"${attrs('meta')}>${text('meta')}</span>` : '';
  const glyph = () => Object.hasOwn(GLYPHS, type) && shown('icon') ? `<span class="ui-agent-icon"${attrs('icon')}>${icon(GLYPHS[type])}</span>` : '';
  const head = (tag) => { const inner = `${glyph()}${title(tag)}${label()}`; return inner ? `<div class="ui-agent-head">${inner}</div>` : ''; };
  const body = (tag = 'p', className = 'ui-agent-text') => has('body') ? `<${tag} class="${className}"${attrs('body')}>${text('body')}</${tag}>` : '';
  if (type === 'message' || type === 'plan') return `${head(type === 'message' ? 'strong' : 'h3')}${body()}`;
  // A closed disclosure still shows its summary, so the title stays readable without script.
  if (type === 'toolcall') return `<details class="ui-agent-call"><summary>${glyph()}${has('heading') ? `<span class="ui-agent-title"${attrs('heading')}>${text('heading')}</span>` : '<span class="ui-agent-title">Tool call</span>'}${label()}</summary>${body()}</details>`;
  if (type === 'citation') { const source = `${title('cite')}${label()}`; return `${body('blockquote', 'ui-agent-excerpt')}${source ? `<p class="ui-agent-source">${source}</p>` : ''}`; }
  // The runtime replaces the button's text, so it holds text only.
  if (type === 'approval') return `${head('h3')}${body()}${shown('control') ? `<button type="button" class="xp-control" data-xp-action="confirm" aria-pressed="false"${attrs('control')}>Approve</button>` : ''}`;
  if (type === 'artifact') return `${head('h3')}${has('body') ? `<pre class="ui-agent-code"${attrs('body')}><code>${text('body')}</code></pre>` : ''}`;
  if (type === 'meter') {
    const level = shown('price') ? LEVEL.exec(String(item?.price ?? '')) : null;
    const [used, limit] = level ? [Number(level[1]), Number(level[2])] : [0, 0];
    const meter = limit > 0 ? `<meter min="0" max="${limit}" value="${Math.min(used, limit)}"` : '<meter min="0" max="1" value="0"';
    const value = has('price') ? `<strong class="ui-agent-value"${attrs('price')}>${text('price')}</strong>` : '';
    return `${head('h3')}<div class="ui-agent-gauge">${meter} aria-label="${has('heading') ? text('heading') : 'Usage'}"></meter>${value}</div>${body()}`;
  }
  return '';
}

// Markup shared by the manifests below.
const CAPTION = '<p class="xp-demo-note"><strong>Prepared demonstration</strong><span>No model is connected. Every entry here is placeholder text written in advance; replace it with your own.</span></p>';
// An application section has no padding of its own, so each screen spaces its wrapper.
const screenCss = (behavior) => `.xp-${behavior}{padding-block:clamp(32px,5vw,64px)}.xp-${behavior} .xp-demo-note{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 12px;max-width:none;margin:0 0 24px;padding:12px 16px;border:1px dashed var(--line);border-radius:var(--radius);color:var(--muted);font-size:.9rem}.xp-${behavior} .xp-demo-note strong{color:var(--ink)}`;
const appHeader = ({ heading, action }) => `<header class="xp-app-header">${heading}${action()}</header>`;
const kitTools = (kit, item) => agentTools(item, { escape: kit.e, visible: kit.visible, attrs: (key) => kit.part(key, item), icon: kit.icon });
// One entry of a screen: the element that carries the item attributes around the item markup.
// `cell` puts the item markup into one table cell when the entry is a table row.
function entry(kit, item, index, fallback, { tag = 'li', className = '', attributes = '', after = '', cell = false } = {}) {
  const type = agentItemType(item, fallback), inner = `${agentItem(type, item, index, kitTools(kit, item))}${after}`;
  return `<${tag} class="ui-agent-entry ui-agent-${type}${className ? ` ${className}` : ''}"${attributes}${kit.itemAttrs(item, index)}>${cell ? `<td>${inner}</td>` : inner}</${tag}>`;
}
const prepared = (title, body, uiType, meta = '', price = '') => ({ title, body, meta, price, uiType });
const itemTitle = ({ e, visible, part }, item) => visible(item, 'heading') ? `<h3${part('heading', item)}>${e(item.title)}</h3>` : '';
const itemBody = ({ e, visible, part }, item) => item.body && visible(item, 'body') ? `<p${part('body', item)}>${e(item.body)}</p>` : '';
const screen = {
  group: 'hero', reference: 'gradientdeck', interactive: true, media: 'none',
  parts: { section: ['heading', 'body', 'action', 'buttonLabel', 'buttonIcon'], item: [] },
  elements: ['entrance', 'buttonStyle', 'buttonIcon', 'buttonLabelStyle', 'buttonIconPlacement', 'actionMotion']
};

export const AGENT_BLOCKS = [
  {
    ...screen, id: 'app-agent-run', name: 'Agent run', behavior: 'agent-run',
    description: 'A prepared run log of plan steps, tool calls, messages, sources and an approval, filtered by label.',
    interface: { types: ['plan', 'toolcall', 'message', 'citation', 'approval'], default: 'plan' },
    content: () => ({ eyebrow: '', title: 'Agent run', body: 'A prepared example of how one run could be shown, step by step. Replace every entry with your own.', button: 'Continue', items: [
      prepared('Outline the task', 'Write the first step the run would take.', 'plan', 'Plan'),
      prepared('Look up a source', 'Describe the lookup and what it would return. Nothing is called.', 'toolcall', 'Tool'),
      prepared('Your source', 'Quote the passage the answer relies on.', 'citation', 'Source'),
      prepared('Prepared reply', 'Write the reply a reader would see. It was not generated.', 'message', 'Message'),
      prepared('Share the summary', 'Explain what would happen once this step is approved.', 'approval', 'Approval')
    ] }),
    render(kit) {
      const { s, filters, groups, status } = kit;
      const entries = s.items.map((item, index) => entry(kit, item, index, 'plan')).join('');
      return `${appHeader(kit)}${CAPTION}<div class="xp-run-bar"><span class="xp-run-state">Example run</span><span>${s.items.length} ${s.items.length === 1 ? 'entry' : 'entries'}</span></div>${groups.length > 1 ? filters : ''}${entries ? `<ol class="xp-run-log">${entries}</ol>` : '<p class="xp-empty">Add entries to show the steps of a run.</p>'}${status}`;
    },
    css: screenCss('agent-run')
      + '.xp-agent-run .xp-run-bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px 16px;margin:0 0 8px;padding:12px 16px;border:1px solid var(--line);border-radius:var(--radius);background:var(--soft);font-size:.9rem}.xp-agent-run .xp-run-state{font-weight:600}'
      + '.xp-agent-run .xp-run-log{list-style:none;margin:16px 0 0;padding:0;max-width:880px}.xp-agent-run .ui-agent-entry{position:relative;min-width:0;padding:16px 0 16px 28px;border-left:2px solid var(--line)}'
      + '.xp-agent-run .ui-agent-entry::before{content:"";position:absolute;left:-6px;top:24px;width:10px;height:10px;border-radius:50%;background:var(--accent)}',
    expect: ['class="xp-run-log"', 'Prepared demonstration', 'data-xp-action="confirm"']
  },
  {
    ...screen, id: 'app-agent-chat', name: 'Chat with artifact', behavior: 'agent-chat',
    description: 'A prepared conversation beside a tabbed artifact pane with a plain-text copy; no model is connected.',
    interface: { types: ['message', 'citation', 'artifact'], default: 'message' },
    content: () => ({ eyebrow: '', title: 'Chat with artifact', body: 'A prepared conversation and the documents it refers to. Replace every entry with your own.', button: 'Continue', items: [
      prepared('You', 'Can you turn these notes into a short project brief?', 'message', 'Question'),
      prepared('Prepared reply', 'This reply was written in advance to show the layout. Nothing here was generated.', 'message', 'Example'),
      prepared('Your notes', 'Quote the notes the reply relies on.', 'citation', 'Source'),
      prepared('Project brief', 'Goal: replace with your goal.\nAudience: replace with your audience.\nNext step: replace with your next step.', 'artifact', 'Draft'),
      prepared('Checklist', '- Replace this line with a real task.\n- Replace this line with another task.', 'artifact', 'List')
    ] }),
    render(kit) {
      const { s, e, visible, control, status } = kit;
      const artifacts = s.items.filter((item) => agentItemType(item, 'message') === 'artifact');
      const transcript = s.items.filter((item) => !artifacts.includes(item)).map((item) => entry(kit, item, s.items.indexOf(item), 'message')).join('');
      const label = (item, ordinal) => item.title && visible(item, 'heading') ? item.title : `Artifact ${ordinal + 1}`;
      const tabs = `<div class="xp-tablist" aria-label="Artifacts">${artifacts.map((item, ordinal) => control('tab', label(item, ordinal), `data-xp-index="${ordinal}" aria-controls="xp-${e(s.id)}-panel-${ordinal}"`)).join('')}</div>`;
      const panels = artifacts.map((item, ordinal) => entry(kit, item, s.items.indexOf(item), 'message', { tag: 'article', className: 'xp-chat-panel', attributes: ` id="xp-${e(s.id)}-panel-${ordinal}" data-xp-panel="${ordinal}"` })).join('');
      // The copy control copies the first textarea of the screen: the artifacts as plain text.
      const plain = artifacts.map((item) => [visible(item, 'heading') ? item.title : '', visible(item, 'body') ? item.body : ''].filter(Boolean).join('\n')).filter(Boolean).join('\n\n');
      const pane = artifacts.length ? `${tabs}${panels}<label class="xp-chat-copy"><span>Artifacts as plain text</span><textarea readonly rows="6">${e(plain)}</textarea></label>${control('copy', 'Copy artifact text')}` : '<p class="xp-empty">Add an entry of the type Artifact to show it here.</p>';
      return `${appHeader(kit)}${CAPTION}<div class="xp-chat-layout"><section class="xp-chat-transcript" aria-label="Conversation">${transcript ? `<ol class="xp-chat-messages">${transcript}</ol>` : '<p class="xp-empty">Add a message to start the conversation.</p>'}</section><section class="xp-chat-pane" aria-label="Artifacts">${pane}</section></div>${status}`;
    },
    css: screenCss('agent-chat')
      + '.xp-agent-chat .xp-chat-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);gap:24px;align-items:start}.xp-agent-chat .xp-chat-transcript{min-width:0}'
      + '.xp-agent-chat .xp-chat-messages{list-style:none;margin:0;padding:0;display:grid;gap:14px}.xp-agent-chat .xp-chat-messages>.ui-agent-entry{min-width:0;padding:14px 16px;border:1px solid var(--line);border-radius:var(--radius);background:var(--surface)}.xp-agent-chat .xp-chat-messages>.ui-agent-entry:nth-child(even){background:var(--soft)}'
      + '.xp-agent-chat .xp-chat-pane{min-width:0;padding:16px;border:1px solid var(--line);border-radius:var(--radius);background:var(--surface)}.xp-agent-chat .xp-tablist{margin:0 0 12px}.xp-agent-chat:not([data-xp-enhanced="true"]) .xp-tablist{display:none}'
      + '.xp-agent-chat .xp-chat-panel{min-width:0;padding:4px 0 16px;border-bottom:1px solid var(--line)}.xp-agent-chat .xp-chat-copy{margin:16px 0 0}.xp-agent-chat .xp-chat-copy textarea{width:100%;min-height:8rem;resize:vertical;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:.85rem}'
      + '@media(max-width:800px){.xp-agent-chat .xp-chat-layout{grid-template-columns:minmax(0,1fr)}}',
    expect: ['class="xp-chat-layout"', '<textarea readonly', 'data-xp-action="copy"']
  },
  {
    ...screen, id: 'app-agent-inbox', name: 'Agent inbox', behavior: 'agent-inbox',
    description: 'Prepared agent requests with read, dismiss and detail controls, filtered by label.',
    interface: { types: ['message', 'approval', 'citation', 'artifact'], default: 'message' },
    content: () => ({ eyebrow: '', title: 'Agent inbox', body: 'Prepared requests that wait for a person. Replace every entry with your own.', button: 'Continue', items: [
      prepared('Approve the weekly summary', 'An example request that waits for a person. Confirming changes only this view.', 'approval', 'Needs approval'),
      prepared('Question about the brief', 'An example question a run could ask. Replace it with your own.', 'message', 'Question'),
      prepared('Draft checklist finished', 'An example note that a step has finished. Nothing ran.', 'message', 'Update')
    ] }),
    render(kit) {
      const { s, control, filters, groups, status } = kit;
      const controls = `<div class="xp-controls">${control('read', 'Mark as read', 'aria-pressed="false"')}${control('dismiss', 'Dismiss')}${control('details', 'Open details')}</div>`;
      const requests = s.items.map((item, index) => entry(kit, item, index, 'message', { tag: 'article', className: 'xp-inbox-request', after: controls })).join('');
      return `${appHeader(kit)}${CAPTION}${groups.length > 1 ? filters : ''}${requests ? `<div class="xp-inbox-list">${requests}</div>` : '<p class="xp-empty">No requests yet. Add entries to show them here.</p>'}${status}`;
    },
    css: screenCss('agent-inbox')
      + '.xp-agent-inbox .xp-inbox-list{display:grid;gap:16px;max-width:880px;margin:16px 0 0}.xp-agent-inbox .xp-inbox-request{min-width:0;padding:20px;border:var(--xp-border) solid var(--line);border-radius:var(--radius);background:var(--xp-panel)}'
      + '.xp-agent-inbox .xp-inbox-request[data-xp-read="true"]{background:var(--soft)}.xp-agent-inbox .xp-inbox-request .xp-controls{margin:16px 0 0}',
    expect: ['data-xp-action="read"', 'data-xp-action="dismiss"', 'data-xp-action="details"']
  },
  {
    ...screen, id: 'app-usage', name: 'Usage and limits', behavior: 'usage',
    description: 'Usage meters drawn from your own two numbers in a sortable, searchable table; no figures are invented.',
    interface: { types: ['meter', 'message', 'approval'], default: 'meter' },
    content: () => ({ eyebrow: '', title: 'Usage and limits', body: 'Prepared meters without figures. Enter the amount used and the limit of each one as two numbers separated by a slash.', button: 'Continue', items: [
      prepared('Team seats', 'Enter the seats in use and the seats available.', 'meter', 'Plan limit'),
      prepared('Requests this month', 'Enter the requests used and the monthly limit.', 'meter', 'Monthly'),
      prepared('Stored files', 'Enter the storage used and the storage available.', 'meter', 'Storage')
    ] }),
    render(kit) {
      const { s, control, search, status } = kit;
      const rows = s.items.map((item, index) => entry(kit, item, index, 'meter', { tag: 'tr', className: 'xp-usage-row', cell: true })).join('');
      return `${appHeader(kit)}${CAPTION}<div class="xp-usage-tools">${search('Search usage')}${control('sort', 'Sort A–Z')}</div><div class="xp-table-wrap"><table class="xp-usage-table"><thead><tr><th scope="col">Limit and current level</th></tr></thead><tbody data-xp-sortable>${rows}</tbody></table></div>${status}`;
    },
    css: screenCss('usage')
      + '.xp-usage .xp-usage-tools{display:flex;flex-wrap:wrap;align-items:end;gap:12px 16px;margin:0 0 16px}.xp-usage .xp-search{flex:1 1 240px;margin:0}'
      + '.xp-usage .xp-usage-table td{min-width:0;padding:16px 18px}.xp-usage .xp-usage-row .ui-agent-gauge{max-width:640px}',
    expect: ['<meter', 'data-xp-sortable', 'data-xp-search']
  },
  {
    ...screen, id: 'app-agent-setup', name: 'Agent setup', behavior: 'agent-setup',
    description: 'A step-by-step agent setup with back and next controls that completes in this view.',
    interface: { types: ['plan', 'approval', 'message'], default: 'plan' },
    content: () => ({ eyebrow: '', title: 'Agent setup', body: 'A prepared walk-through of the setup steps. Nothing is saved or sent.', button: 'Continue', items: [
      prepared('Describe the purpose', 'Write in one sentence what this agent should help with.', 'plan', 'Purpose'),
      prepared('Choose what it may use', 'List the tools or sources it may use. Nothing is connected in this demonstration.', 'plan', 'Tools'),
      prepared('Review and confirm', 'Confirming completes this example in this view only; nothing is saved or sent.', 'approval', 'Review')
    ] }),
    render(kit) {
      const { s, e, visible, control, status } = kit;
      const stepIndex = s.items.map((item, ordinal) => `<li>${item.title && visible(item, 'heading') ? e(item.title) : `Step ${ordinal + 1}`}</li>`).join('');
      const steps = s.items.map((item, ordinal) => entry(kit, item, ordinal, 'plan', { tag: 'div', attributes: ` data-xp-step="${ordinal}"` })).join('');
      return `${appHeader(kit)}${CAPTION}${s.items.length ? `<div class="xp-wizard" data-xp-wizard><ol class="xp-step-index">${stepIndex}</ol>${steps}<div class="xp-controls">${control('step-back', 'Back')}${control('step-next', 'Next')}</div></div>` : '<p class="xp-empty">Add entries to build the setup steps.</p>'}${status}`;
    },
    css: screenCss('agent-setup')
      + '.xp-agent-setup .xp-wizard{max-width:760px}.xp-agent-setup .xp-step-index{gap:12px}.xp-agent-setup .xp-step-index li{min-width:0;overflow-wrap:anywhere}.xp-agent-setup .ui-agent-entry{min-width:0}',
    expect: ['data-xp-wizard', 'data-xp-action="step-next"', 'Prepared demonstration']
  },
  {
    id: 'hero-prompt', group: 'hero', name: 'Prompt box introduction', behavior: 'prompt', reference: 'gradientdeck',
    description: 'A headline beside a framed prompt box whose sample prompts switch between answers written in advance.',
    pattern: 'interactive', fit: { items: [0, 8], image: 'none', text: 'medium', directions: ['product'], families: ['saas'] },
    interactive: true, media: 'none',
    parts: { section: ['heading', 'body', 'action', 'buttonLabel', 'buttonIcon'], item: ['heading', 'body'] },
    elements: ['entrance', 'buttonStyle', 'buttonIcon', 'buttonLabelStyle', 'buttonIconPlacement', 'actionMotion'],
    fields: { item: { title: 'Sample prompt', body: 'Example answer' } },
    content(section, { item }) {
      Object.assign(section, { title: 'See what a good answer looks like.', body: 'Choose a sample prompt to read an example answer. The answers were written in advance; no model is connected to this page.' });
      section.items = [
        item('Explain what this service does', 'Write a short, accurate answer in your own words. Replace this placeholder before publishing.'),
        item('Suggest a first step', 'Describe the first step you would recommend, written and checked by you.'),
        item('Compare two options', 'Add an example comparison that you have written yourself.')
      ];
    },
    render(kit) {
      const { s, e, visible, part, itemAttrs, control, action } = kit;
      const label = (item, index) => item.title && visible(item, 'heading') ? item.title : `Example ${index + 1}`;
      // The chips are the fixed runtime's tabs; without script every example is shown.
      const chips = s.items.length ? `<div class="xp-tablist" aria-label="Sample prompts">${s.items.map((item, index) => control('tab', label(item, index), `data-xp-index="${index}" aria-controls="xp-${e(s.id)}-panel-${index}"`)).join('')}</div>` : '';
      const panels = s.items.map((item, index) => `<article class="xp-prompt-panel" id="xp-${e(s.id)}-panel-${index}" data-xp-panel="${index}"${itemAttrs(item, index)}>${visible(item, 'heading') ? `<p class="xp-prompt-ask"${part('heading', item)}>${e(item.title)}</p>` : ''}${item.body && visible(item, 'body') ? `<p class="xp-prompt-answer"${part('body', item)}>${e(item.body)}</p>` : ''}</article>`).join('');
      const copy = `<div class="xp-prompt-copy">${visible(s, 'heading') ? `<h1${part('heading')}>${e(s.title)}</h1>` : ''}${s.body && visible(s, 'body') ? `<p${part('body')}>${e(s.body)}</p>` : ''}${action()}</div>`;
      return `<div class="xp-prompt-layout">${copy}<div class="xp-prompt-box"><p class="xp-prompt-note"><strong>Prepared demonstration</strong><span>No model is connected; each answer was written in advance.</span></p>${chips}${panels}</div></div>`;
    },
    css: '.xp-prompt .xp-prompt-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:48px;align-items:center}.xp-prompt .xp-prompt-copy{min-width:0}'
      + '.xp-prompt .xp-prompt-box{min-width:0;padding:20px;border:1px solid var(--line);border-radius:calc(var(--radius) + 6px);background:var(--surface);box-shadow:0 1px 0 var(--line)}'
      + '.xp-prompt .xp-prompt-note{display:flex;flex-wrap:wrap;gap:4px 10px;max-width:none;margin:0 0 16px;font-size:.85rem;color:var(--muted)}.xp-prompt .xp-prompt-note strong{color:var(--ink)}'
      + '.xp-prompt .xp-tablist{flex-wrap:wrap;overflow:visible;margin:0 0 16px;padding:0}.xp-prompt .xp-tablist .xp-control{min-height:36px;padding:6px 14px;border-radius:999px;font-size:.85rem}.xp-prompt:not([data-xp-enhanced="true"]) .xp-tablist{display:none}'
      + '.xp-prompt .xp-prompt-panel{display:grid;gap:12px;min-width:0;padding:16px 0;border-top:1px solid var(--line)}'
      + '.xp-prompt .xp-prompt-ask{justify-self:end;max-width:85%;margin:0;padding:10px 14px;border-radius:var(--radius);background:var(--soft);overflow-wrap:anywhere}.xp-prompt .xp-prompt-answer{max-width:none;margin:0;color:var(--muted);overflow-wrap:anywhere}'
      + '@media(max-width:800px){.xp-prompt .xp-prompt-layout{grid-template-columns:minmax(0,1fr);gap:28px}}',
    expect: ['class="xp-prompt-box"', 'data-xp-action="tab"', 'Prepared demonstration']
  },
  {
    id: 'features-conversation', group: 'features', name: 'Scripted conversation', behavior: 'conversation', reference: 'gradientdeck',
    description: 'A scripted conversation written by hand: each turn shows its speaker, a short title and the words.',
    pattern: 'list', fit: { items: [1, 8], image: 'none', text: 'long', directions: ['editorial', 'expressive'], families: ['studio', 'portfolio'] },
    interactive: false, media: 'none',
    parts: { section: ['heading', 'body'], item: ['heading', 'body', 'meta'] },
    elements: ['entrance'],
    fields: { item: { meta: 'Speaker' } },
    content(section, { item }) {
      Object.assign(section, { title: 'How a conversation could go', body: 'A scripted example written by hand to show the tone of your service. Replace each turn with your own wording.' });
      section.items = [
        item('A first question', 'Write the question a visitor might ask, in their own words.', 'Visitor'),
        item('A helpful answer', 'Write the answer you would give. Keep it accurate and specific.', 'Your team'),
        item('A follow-up', 'Add a follow-up question or the next step you would suggest.', 'Visitor')
      ];
    },
    render(kit) {
      const { s, itemAttrs, meta, heading } = kit;
      const turns = s.items.map((item, index) => `<li class="xp-conversation-turn"${itemAttrs(item, index)}>${meta(item)}<div class="xp-conversation-bubble">${itemTitle(kit, item)}${itemBody(kit, item)}</div></li>`).join('');
      return `${heading}<p class="xp-conversation-note"><strong>Prepared demonstration</strong><span>A scripted example written in advance; no model is connected.</span></p>${turns ? `<ol class="xp-conversation-list">${turns}</ol>` : ''}`;
    },
    css: '.xp-conversation .xp-conversation-note{display:flex;flex-wrap:wrap;gap:4px 10px;margin:0 0 24px;font-size:.9rem;color:var(--muted)}.xp-conversation .xp-conversation-note strong{color:var(--ink)}'
      + '.xp-conversation .xp-conversation-list{list-style:none;margin:0;padding:0;display:grid;gap:16px;max-width:820px}.xp-conversation .xp-conversation-turn{display:grid;gap:6px;min-width:0;max-width:min(100%,560px)}.xp-conversation .xp-conversation-turn:nth-child(even){justify-self:end}'
      + '.xp-conversation .xp-meta{margin:0}.xp-conversation .xp-conversation-bubble{min-width:0;padding:16px 18px;border:1px solid var(--line);border-radius:var(--radius);background:var(--surface)}.xp-conversation .xp-conversation-turn:nth-child(even) .xp-conversation-bubble{background:var(--soft)}'
      + '.xp-conversation .xp-conversation-bubble h3{font-size:1.05rem;margin:0 0 6px}.xp-conversation .xp-conversation-bubble p{margin:0;color:var(--muted)}',
    expect: ['class="xp-conversation-list"', 'Your team', 'Prepared demonstration']
  }
];
