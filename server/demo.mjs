/** NEW: Explicit, offline demonstration provider. It never masquerades as JEV and
 * has no invented probabilities, token costs or confidence scores. */
import { GROUPS } from '../shared/catalog.mjs';
import { explicitOmissions } from './composer.mjs';
import { demoElementChoice, demoCopyChoice } from './element-edits.mjs';
import { demoCanvasChoice, demoCanvasLocalRequest, demoCanvasOwnsElement } from './demo-canvas.mjs';
import { isInterfaceBlock } from '../shared/interfaces.mjs';
const countWords = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
function requestedInterface(prompt) {
  if (/\b(?:landing page|marketing (?:page|site)|website about|website for (?:a |an )?(?:software|chat|dashboard|app))\b/.test(prompt) && !/\b(?:frontend|front.end|clone|login form|sign.in form)\b/.test(prompt)) return 'website';
  const screens = [
    [/\b(?:sign.?up|register|registration|create (?:an? )?account)\b/, 'app-signup'],
    [/\b(?:login|log.in|sign.in|authentication form)\b/, 'app-login'],
    [/\b(?:chatgpt|chat.?bot|chat (?:app|interface|frontend|workspace|clone)|conversational (?:assistant|interface)|messenger)\b/, 'app-chat'],
    [/\b(?:check.?out|payment form|order summary)\b/, 'app-checkout'],
    [/\b(?:kanban|task board|project board|trello)\b/, 'app-board'],
    [/\b(?:calendar|scheduler|event planner)\b/, 'app-calendar'],
    [/\b(?:inbox|email client|mail app)\b/, 'app-inbox'],
    [/\b(?:settings (?:page|screen|panel|form)|account settings|preferences)\b/, 'app-settings'],
    [/\b(?:storefront|product catalog|shopping (?:app|cart)|e.?commerce|online store)\b/, 'app-storefront'],
    [/\b(?:document editor|text editor|writing (?:app|workspace)|notion clone)\b/, 'app-editor'],
    [/\b(?:data table|data grid|spreadsheet|records? (?:manager|management))\b/, 'app-table'],
    [/\b(?:dashboard|analytics (?:app|screen|frontend)|admin (?:panel|interface|app))\b/, 'app-dashboard'],
    [/\b(?:frontend|front.end|app (?:ui|interface|screen)|application (?:ui|interface|screen)|workspace|clone)\b/, 'app-workspace']
  ];
  return screens.find(([pattern]) => pattern.test(prompt))?.[1];
}
function applicationSection(state) {
  return state.selected_sections?.find((section) => isInterfaceBlock(section)) || state.existing?.sections?.find((section) => isInterfaceBlock(section));
}
function demoInterfaceChoice(state, key, question, requestedSurface) {
  const prompt = state.user_request.toLowerCase(), preserve = state.task !== 'create';
  const current = applicationSection(state);
  if (key === 'surface') return requestedSurface || (preserve ? 'keep' : 'website');
  if (key === 'interface_item_count') {
    const count = current?.items?.length ?? current?.contentShape?.itemCount;
    const operation = prompt.match(/\b(add|insert|remove|delete)\s+(a|an|another|new|one|two|three|four|five|six|seven|eight|[1-8])\s+(?:(?:input|form|editable|application|ui)\s+)?(?:fields?|rows?|cards?|items?|products?|tasks?|events?|threads?)\b/);
    if (operation) {
      if (!preserve || !Number.isInteger(count)) return preserve ? 'keep' : 'default';
      const amount = /^\d$/.test(operation[2]) ? Number(operation[2]) : Math.max(1, countWords.indexOf(operation[2]) + 1);
      const next = count + (['add', 'insert'].includes(operation[1]) ? amount : -amount);
      return next >= 1 && next <= 8 ? countWords[next - 1] : 'keep';
    }
    const explicit = prompt.match(/\b(one|two|three|four|five|six|seven|eight|[1-8])\s+(?:(?:input|form|editable|application|ui)\s+)?(?:fields?|rows?|cards?|items?|products?|tasks?|events?|threads?)\b/);
    if (explicit) return /^\d$/.test(explicit[1]) ? countWords[Number(explicit[1]) - 1] : explicit[1];
    return preserve ? 'keep' : 'default';
  }
  if (!key.startsWith('interface_')) return undefined;
  const unchanged = Object.hasOwn(question.criteria, 'keep') ? 'keep' : 'default';
  if (key === 'interface_layout') return /\b(?:side ?bar|side navigation)\b/.test(prompt) ? 'sidebar' : /\b(?:top ?bar|top navigation)\b/.test(prompt) ? 'topbar' : /\b(?:split|two.pane|two.panel)\b/.test(prompt) ? 'split' : /\bcent(?:er|re)(?:d|red)?\b/.test(prompt) ? 'centered' : unchanged;
  const visibility = key.match(/^interface_(navigation|search|tabs|metrics)$/);
  if (visibility) {
    const labels = { navigation: '(?:navigation|nav|menu)', search: '(?:search|search bar)', tabs: '(?:tabs|tab bar)', metrics: '(?:metrics|summary cards|statistics|stats)' };
    const noun = labels[visibility[1]];
    if (new RegExp(`\\b(?:hide|remove|without|no|disable)\\s+(?:the\\s+)?${noun}\\b`).test(prompt)) return 'hide';
    if (new RegExp(`\\b(?:show|add|include|enable|with)\\s+(?:a\\s+|the\\s+)?${noun}\\b`).test(prompt)) return 'show';
    return unchanged;
  }
  const item = key.match(/^interface_item_(\d+)$/);
  if (item) {
    const index = Number(item[1]), ordinal = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'][index];
    const selected = state.selection?.group === 'hero' && state.selection.itemIndex === index && /\b(?:this|selected)\s+(?:field|item|control)\b/.test(prompt);
    const clause = prompt.split(/[.;\n]|\band\b/).find((part) => new RegExp(`\\b(?:${ordinal}|${index + 1}(?:st|nd|rd|th)?)\\s+(?:field|item|control|input)\\b|\\b(?:field|item|control|input)\\s+${index + 1}\\b`).test(part));
    const target = clause || (selected ? prompt : '');
    if (!target) return unchanged;
    const aliases = [['email', /\bemail\b/], ['password', /\bpassword\b/], ['textarea', /\b(?:textarea|multi.line|long text)\b/], ['checkbox', /\b(?:checkbox|toggle)\b/], ['select', /\b(?:select|dropdown|choice)\b/], ['number', /\b(?:number|numeric)\b/], ['date', /\bdate\b/], ['stat', /\b(?:stat|metric)\b/], ['chart', /\bchart\b/], ['table', /\btable\b/], ['product', /\bproduct\b/], ['thread', /\bthread\b/], ['event', /\bevent\b/], ['task', /\btask\b/], ['action', /\b(?:action|button)\b/], ['form', /\bform\b/], ['list', /\blist\b/], ['text', /\b(?:text|name)\b/]];
    return aliases.find(([type, pattern]) => Object.hasOwn(question.criteria, type) && pattern.test(target))?.[0] || unchanged;
  }
  return unchanged;
}
const profiles = {
  editorial: { palette: 'porcelain', font: 'editorial', density: 'airy', radius: 'sharp', typeScale: 'dramatic', width: 'wide', hero: 'hero-editorial', features: 'features-list', about: 'about-statement', services: 'services-list', gallery: 'gallery-featured', process: 'process-timeline', contact: 'contact-simple', surface: 'plain', media: 'landscape' },
  product: { palette: 'ocean', font: 'modern', density: 'balanced', radius: 'soft', typeScale: 'balanced', width: 'standard', hero: 'hero-centered', features: 'features-bento', pricing: 'pricing-featured', surface: 'filled', media: 'landscape' },
  understated: { palette: 'mono', font: 'modern', density: 'airy', radius: 'sharp', typeScale: 'quiet', width: 'focused', hero: 'hero-centered', features: 'features-list', about: 'about-statement', services: 'services-list', gallery: 'gallery-grid', contact: 'contact-simple', surface: 'plain', media: 'square' },
  expressive: { palette: 'midnight', font: 'modern', density: 'airy', radius: 'round', typeScale: 'dramatic', width: 'wide', navigation: 'nav-floating', hero: 'hero-editorial', features: 'features-bento', gallery: 'gallery-featured', cta: 'cta-band', surface: 'outlined', media: 'portrait' },
  organic: { palette: 'sage', font: 'editorial', density: 'airy', radius: 'round', typeScale: 'balanced', width: 'standard', hero: 'hero-split', features: 'features-cards', gallery: 'gallery-grid', process: 'process-timeline', cta: 'cta-card', surface: 'filled', media: 'landscape' }
};
export async function demoEvaluate({ state, questions }) {
  const p = state.user_request.toLowerCase(), edit = state.task === 'edit', preserve = state.task !== 'create', omit = explicitOmissions(p);
  const matches = (regex) => regex.test(p);
  const requestedSurface = requestedInterface(p), currentApplication = applicationSection(state);
  const application = isInterfaceBlock(requestedSurface) || isInterfaceBlock(state.chosen_surface) || Boolean(currentApplication) && requestedSurface !== 'website';
  // Local element adjectives must not accidentally restyle the whole site.
  const canvasLocal = demoCanvasLocalRequest(state);
  const localEdit = canvasLocal || edit && (matches(/\bicons?\b|\bcolumns?\b|\bnumbering\b|\b(?:secondary|primary) (?:button|action|link)\b|\b(?:featured|highlighted) (?:item|plan|tier)\b|\bbutton (?:style|labels?|text)\b|\b(?:card|item|content) align|\bdecorat/) || matches(/(?:title|heading|headline|body|paragraph|button).*(?::|\b(?:to|as))\s*["“]/)) && !matches(/whole (?:page|site)|overall|global|theme|palette/);
  const direction = state.chosen_direction && state.chosen_direction !== 'keep' ? state.chosen_direction : matches(/editorial|magazine|typograph/) ? 'editorial' : matches(/expressive|bold|dramatic|playful|experimental/) ? 'expressive' : matches(/understated|minimal|quiet|restrained/) ? 'understated' : matches(/organic|wellness|calm|botanical|nature|coastal/) ? 'organic' : application || matches(/saas|software|product|technical|clear benefits/) ? 'product' : 'editorial';
  const profile = profiles[direction];
  const defaultTheme = (field) => edit ? 'keep' : profile[field];
  // Build one consistent local order, then answer every pair from it. Merely
  // reversing the named pair creates cycles when a move crosses other sections.
  const desiredOrder = state.selected_sections?.map((section) => section.group) || [...GROUPS];
  const groupPattern = GROUPS.join('|');
  const moves = new RegExp(`\\b(${groupPattern})\\s+(?:section\\s+)?(?:just\\s+)?(before|after|above|below)\\s+(?:the\\s+)?(${groupPattern})\\b`, 'g');
  const requestedMoves = [...p.matchAll(moves)];
  for (const match of requestedMoves) {
    const [, source, relation, target] = match;
    if (source === target || !desiredOrder.includes(source) || !desiredOrder.includes(target)) continue;
    desiredOrder.splice(desiredOrder.indexOf(source), 1);
    desiredOrder.splice(desiredOrder.indexOf(target) + (['after', 'below'].includes(relation) ? 1 : 0), 0, source);
  }
  const answers = {};
  const choose = (q, desired) => Object.hasOwn(q.criteria, desired) ? desired : Object.keys(q.criteria)[0];
  for (const [key, q] of Object.entries(questions)) {
    let value = Object.hasOwn(q.criteria, 'keep') ? 'keep' : Object.keys(q.criteria)[0];
    if (key === 'scope') value = matches(/(?:build|create|implement|connect).*(?:database|authentication backend|payment backend|server api)/) ? 'mixed' : 'supported';
    if (key === 'edit_support') {
      const itemOperations = p.split(/[.;\n]|\band\b/).filter((clause) => !/\b(?:remove|delete|hide)\s+(?:the\s+)?(?:(?:first|second|third|fourth|fifth|sixth|seventh|eighth|\d+)\s+)?(?:(?:feature|item|card)\s+)?icons?\b/.test(clause)).join('. ');
      const unsupported = matches(/custom (?:svg|icons?|code|elements?)|(?:write|generate|translate|rewrite).*(?:copy|text|prose|description|paragraph)/) || !application && /(?:add|insert).*(?:fourth|fifth|sixth|seventh|eighth|new|another|first|second|third) (?:item|card|feature|service|plan|step)|(?:add|insert).*(?:items|cards)\b/.test(itemOperations);
      value = unsupported ? matches(/\b(?:columns?|palette|theme|outlined|icon size|hide.*button)\b/) || /["“]/.test(state.user_request) ? 'partial' : 'unsupported' : 'full';
    }
    if (key === 'family') value = preserve && !matches(/(?:change|switch|convert|turn|make|rebrand|redesign).*(?:into|as|to|category|industry)/) ? 'keep' : matches(/saas|software|developer tool/) ? 'saas' : matches(/apartment|hotel|accommodation|coastal|stay/) ? 'hospitality' : matches(/portfolio|photograph|freelancer/) ? 'portfolio' : matches(/yoga|wellness|mindful|coach/) ? 'wellness' : matches(/cafe|restaurant|local business/) ? 'local' : matches(/event|workshop|conference/) ? 'event' : preserve ? 'keep' : 'studio';
    if (key === 'family' && application && (!preserve || isInterfaceBlock(requestedSurface))) value = 'application';
    if (key === 'direction') value = edit && !matches(/art direction|overall.*(?:style|look)|make.*(?:editorial|expressive|understated|organic)/) ? 'keep' : direction;
    if (key === 'journey') value = edit ? 'keep' : matches(/work.first|lead with work|showcase|portfolio|selected work|photograph/) ? 'showcase' : matches(/story.first|story.led|our story|people.first/) ? 'story' : matches(/conversion|offer|saas|software|product|pricing/) ? 'offer' : 'overview';
    if (key === 'theme_palette') value = matches(/dark|midnight|lime/) ? 'midnight' : matches(/sage|green|botanical/) ? 'sage' : matches(/ocean|blue/) ? 'ocean' : matches(/clay|terracotta|rustic/) ? 'clay' : matches(/monochrome|black.and.white/) ? 'mono' : matches(/warm|ivory|light|white/) ? 'porcelain' : defaultTheme('palette');
    if (key === 'theme_font') value = matches(/serif|editorial|elegant/) ? 'editorial' : matches(/monospace|technical/) ? 'technical' : matches(/sans|modern|clean/) ? 'modern' : defaultTheme('font');
    if (key === 'theme_density') value = matches(/compact|dense/) ? 'compact' : matches(/airy|generous|spacing|spacious/) ? 'airy' : defaultTheme('density');
    if (key === 'theme_radius') value = matches(/square|sharp/) ? 'sharp' : matches(/pill|round/) ? 'round' : defaultTheme('radius');
    if (key === 'theme_typeScale') value = matches(/dramatic|oversized|big headings|large headings/) ? 'dramatic' : matches(/quiet hierarchy|small headings|restrained headings/) ? 'quiet' : defaultTheme('typeScale');
    if (key === 'theme_width') value = matches(/narrow|focused width|intimate/) ? 'focused' : matches(/wide|expansive|full.width/) ? 'wide' : matches(/standard width/) ? 'standard' : defaultTheme('width');
    if (key === 'theme_motion') value = matches(/(?:subtle|gentle) (?:animation|motion|transition)/) ? 'subtle' : matches(/no animation|no motion|without animation/) || !edit ? 'none' : 'keep';
    if (key === 'reorder') value = requestedMoves.length || matches(/reorder/) ? 'reorder' : 'keep';
    if (key.startsWith('include_')) {
      const group = key.slice(8), aliases = { hero: /hero|primary screen/, gallery: /gallery|selected work|featured work|photos/, about: /about|our story/, services: /services|offerings|service menu/, features: /features|benefits|amenities|bento/, process: /process|workflow|three.step/, pricing: /pricing|plans|tiers/, faq: /faq|questions/, contact: /contact|email/, cta: /call.to.action|cta|closing/, navigation: /navigation|header|navbar/, footer: /footer/ };
      const explicitlyAdded = aliases[group]?.test(p) && matches(/\b(?:add|include|insert|introduce|bring back|restore)\b/);
      value = omit.has(group) ? 'omit' : preserve ? explicitlyAdded ? 'include' : 'keep' : aliases[group]?.test(p) || ['navigation', 'footer', 'features', 'contact'].includes(group) ? 'include' : 'omit';
      if (group === 'hero' && !preserve) value = omit.has(group) ? 'omit' : 'include';
      if (group === 'hero' && isInterfaceBlock(requestedSurface) && !omit.has(group)) value = 'include';
      if (application && !preserve && group !== 'hero') value = !omit.has(group) && explicitlyAdded ? 'include' : 'omit';
    }
    if (key.startsWith('block_')) {
      const group = key.slice(6);
      if (!edit || !Object.hasOwn(q.criteria, 'keep')) value = profile[group] || Object.keys(q.criteria)[0];
      const tests = {
        hero: [[/center/, 'hero-centered'], [/editorial hero|wide hero|oversized/, 'hero-editorial'], [/split hero/, 'hero-split']],
        navigation: [[/floating|pill nav/, 'nav-floating'], [/minimal nav|simple nav/, 'nav-minimal']],
        features: [[/bento/, 'features-bento'], [/feature cards|features in cards/, 'features-cards'], [/feature list/, 'features-list']],
        about: [[/about statement|short about|text.led/, 'about-statement']],
        gallery: [[/featured work|featured gallery/, 'gallery-featured'], [/triptych|three.*gallery/, 'gallery-strip'], [/gallery grid|photo gallery/, 'gallery-grid']],
        services: [[/service menu|service list/, 'services-list']],
        process: [[/timeline|vertical process/, 'process-timeline']],
        pricing: [[/highlighted|featured.*pric/, 'pricing-featured']],
        faq: [[/faq cards|filled faq/, 'faq-cards']],
        contact: [[/simple contact|no form/, 'contact-simple'], [/contact form/, 'contact-form']],
        cta: [[/cta card|closing card/, 'cta-card']],
        footer: [[/footer columns|structured footer/, 'footer-columns']]
      };
      for (const [regex, variant] of tests[group] || []) if (regex.test(p)) { value = variant; break; }
      if (group === 'hero' && application) value = requestedSurface && requestedSurface !== 'website' ? requestedSurface : isInterfaceBlock(state.chosen_surface) ? state.chosen_surface : currentApplication?.block || 'app-workspace';
    }
    if (key.startsWith('presentation_')) {
      const [, group, field] = key.split('_');
      if (!edit || !Object.hasOwn(q.criteria, 'keep')) {
        if (field === 'tone') value = group === 'cta' && ['expressive', 'product'].includes(direction) ? 'contrast' : ['features', 'about'].includes(group) && ['organic', 'product'].includes(direction) ? 'soft' : 'default';
        if (field === 'spacing') value = ['hero', 'gallery', 'about'].includes(group) && direction !== 'product' ? 'generous' : 'default';
        if (field === 'heading') value = direction === 'product' && ['hero', 'pricing', 'cta'].includes(group) ? 'center' : 'start';
        if (field === 'surface') value = profile.surface;
        if (field === 'media') value = ['hero-centered', 'about-statement'].includes(profile[group]) ? 'default' : profile.media;
      }
      const groupMentioned = new RegExp(`\\b${group}\\b`).test(p);
      if (field === 'tone' && groupMentioned && matches(/contrasting|contrast background|inverted/)) value = 'contrast';
      if (field === 'tone' && groupMentioned && matches(/soft background|tinted background/)) value = 'soft';
      if (field === 'spacing' && groupMentioned && matches(/compact|tighter/)) value = 'compact';
      if (field === 'spacing' && groupMentioned && matches(/generous|breathing room/)) value = 'generous';
      if (field === 'heading' && (groupMentioned || matches(/all headings/)) && matches(/center.*heading|heading.*center/)) value = 'center';
      if (field === 'heading' && (groupMentioned || matches(/all headings/)) && matches(/left.align|heading.*left/)) value = 'start';
      if (field === 'surface' && (groupMentioned || matches(/all cards/))) {
        const surfaceRequest = p.split(/[.;\n]|\band\b/).filter((clause) => !/\bicons?\b/.test(clause)).join('. ');
        value = /outlined/.test(surfaceRequest) ? 'outlined' : /plain|no cards|remove.*card/.test(surfaceRequest) ? 'plain' : /filled/.test(surfaceRequest) ? 'filled' : value;
      }
      if (field === 'media' && groupMentioned) value = matches(/portrait/) ? 'portrait' : matches(/square image|square photo/) ? 'square' : matches(/landscape/) ? 'landscape' : value;
    }
    if (key.startsWith('order_')) {
      const [, a, b] = key.split('_');
      value = desiredOrder.indexOf(a) < desiredOrder.indexOf(b) ? 'before' : 'after';
    }
    if (localEdit && key.startsWith('theme_')) value = 'keep';
    if (localEdit && key === 'direction') value = 'keep';
    if (localEdit && key.startsWith('block_') && !matches(/layout|component|bento|(?:feature|service) (?:cards|list)|split hero|centered hero/)) value = 'keep';
    if (canvasLocal && (key === 'family' || key === 'journey' || key.startsWith('include_') || key.startsWith('block_'))) value = 'keep';
    const elementChoice = demoElementChoice(state, key, q), copyChoice = demoCopyChoice(state, key, q);
    if (elementChoice !== undefined) value = elementChoice;
    if (copyChoice !== undefined) value = copyChoice;
    if (demoCanvasOwnsElement(state, key)) value = 'keep';
    const canvasChoice = demoCanvasChoice(state, key);
    if (canvasChoice !== undefined) value = canvasChoice;
    const interfaceChoice = demoInterfaceChoice(state, key, q, requestedSurface);
    if (interfaceChoice !== undefined) value = interfaceChoice;
    answers[key] = { type: 'choice', choice: choose(q, value), confidence: null, probabilities: {} };
  }
  return { model: 'demo-rules', answers, usage: { input_tokens: 0, output_tokens: 0 } };
}
