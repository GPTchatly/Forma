/* Fixed, local interactions for authored application interfaces. No network,
 * credential persistence, generated code, or simulated assistant responses. */
(() => {
  'use strict';
  const ROOT = '.app-interface';
  const preview = document.body.dataset.preview === 'true';
  const inspecting = () => preview && document.body.dataset.editMode !== 'false';
  const states = new WeakMap();
  const inspectControls = new WeakMap();
  const MAX_MESSAGES = 50, MAX_THREADS = 8, MAX_MESSAGE_LENGTH = 4000;
  const text = (value, limit = 4000) => String(value ?? '').slice(0, limit);
  const own = (root, selector) => [...root.querySelectorAll(selector)].filter((node) => node.closest(ROOT) === root);
  const first = (root, selector) => own(root, selector)[0];
  function feedback(root, message, form) {
    let node = form?.querySelector('.ui-feedback') || first(root, '.ui-feedback');
    if (!node) {
      node = document.createElement('p'); node.className = 'ui-feedback';
      (form || root).append(node);
    }
    node.setAttribute('role', 'status'); node.setAttribute('aria-live', 'polite');
    node.textContent = text(message, 600); node.hidden = false;
  }
  const makeButton = (label, action) => {
    const button = document.createElement('button'); button.type = 'button';
    button.textContent = label; button.dataset.uiAction = action; return button;
  };
  function initialMessages(transcript) {
    if (!transcript) return [];
    const marked = [...transcript.querySelectorAll('[data-ui-chat-message]')];
    return (marked.length ? marked : [...transcript.children]).slice(0, MAX_MESSAGES).map((node) => ({
      role: ['user', 'assistant', 'system'].includes(node.dataset.uiRole) ? node.dataset.uiRole : 'system',
      content: text(node.querySelector('[data-ui-message-text]')?.textContent ?? node.textContent).trim(), authored: true
    })).filter((message) => message.content);
  }
  function stateFor(root) {
    if (states.has(root)) return states.get(root);
    const state = { threads: new Map(), activeThread: null, nextThread: 1, cart: new Map(), calendar: null, addedItems: 0 };
    const transcript = first(root, '[data-ui-transcript]');
    if (transcript) {
      const buttons = own(root, '[data-ui-action="select-thread"]').slice(0, MAX_THREADS);
      buttons.forEach((button, index) => {
        const id = `local-chat-${state.nextThread++}`;
        button.dataset.uiChatId = id;
        const selected = button.getAttribute('aria-current') === 'page' || button.getAttribute('aria-pressed') === 'true' || index === 0 && !state.activeThread;
        state.threads.set(id, { id, title: text(button.dataset.uiTitle || button.textContent, 80).trim() || 'Chat', messages: [] });
        if (selected) state.activeThread = id;
      });
      if (!state.activeThread) {
        const id = `local-chat-${state.nextThread++}`;
        state.threads.set(id, { id, title: 'New chat', messages: [] }); state.activeThread = id;
      }
      state.threads.get(state.activeThread).messages = initialMessages(transcript);
    }
    states.set(root, state); return state;
  }
  function renderChat(root) {
    const state = stateFor(root), thread = state.threads.get(state.activeThread), transcript = first(root, '[data-ui-transcript]');
    if (!thread || !transcript) return;
    const fragment = document.createDocumentFragment();
    for (const message of thread.messages) {
      const wrapper = document.createElement('article'); wrapper.className = `ui-chat-message ui-message ui-message-${message.role}`;
      wrapper.dataset.uiChatMessage = ''; wrapper.dataset.uiRole = message.role;
      const label = document.createElement('strong');
      label.textContent = message.role === 'user' ? 'You' : message.authored ? 'Example message' : 'Local chat';
      const body = document.createElement('p'); body.dataset.uiMessageText = ''; body.textContent = message.content;
      wrapper.append(label, body); fragment.append(wrapper);
    }
    transcript.replaceChildren(fragment); transcript.setAttribute('aria-live', 'polite');
    const title = first(root, '[data-ui-chat-title]'); if (title) title.textContent = thread.title;
    own(root, '[data-ui-action="select-thread"][data-ui-chat-id]').forEach((button) => {
      const selected = button.dataset.uiChatId === state.activeThread;
      button.setAttribute('aria-pressed', String(selected));
      if (selected) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
    });
    const suggestions = first(root, '[data-ui-suggestions]'); if (suggestions) suggestions.hidden = thread.messages.length > 0;
    const welcome = first(root, '[data-ui-chat-welcome]'); if (welcome) welcome.hidden = thread.messages.length > 0;
    const scroll = first(root, '.ui-chat-scroll') || transcript; scroll.scrollTop = scroll.scrollHeight;
  }
  function newChat(root) {
    const state = stateFor(root);
    if (state.threads.size >= MAX_THREADS) { feedback(root, 'This local session has eight chats. Reset the current chat to clear its messages.'); return; }
    const id = `local-chat-${state.nextThread++}`, title = `New chat ${state.threads.size + 1}`;
    state.threads.set(id, { id, title, messages: [] }); state.activeThread = id;
    const list = first(root, '[data-ui-chat-list]');
    if (list) { const button = makeButton(title, 'select-thread'); button.className = 'ui-chat-thread'; button.dataset.uiChatId = id; button.dataset.uiTitle = title; button.dataset.uiSearchItem = ''; list.append(button); }
    renderChat(root); feedback(root, 'New local chat. An assistant is not connected.');
    first(root, '[data-ui-form="chat"] textarea[name="message"]')?.focus();
  }
  function sendMessage(root, form) {
    const input = form.querySelector('textarea[name="message"],input[name="message"]');
    if (!input) return;
    input.setCustomValidity('');
    const content = input.value.trim();
    if (!content || content.length > MAX_MESSAGE_LENGTH) {
      input.setCustomValidity(content ? 'Use 4,000 characters or fewer.' : 'Write a message first.'); input.reportValidity(); return;
    }
    if (!form.reportValidity()) return;
    const state = stateFor(root), thread = state.threads.get(state.activeThread);
    if (!thread) return;
    if (thread.messages.length >= MAX_MESSAGES) { feedback(root, 'This chat has 50 messages. Start a new chat or reset this one.', form); return; }
    thread.messages.push({ role: 'user', content, authored: false });
    if (thread.title.startsWith('New chat')) {
      thread.title = text(content.replace(/\s+/g, ' '), 50);
      const button = own(root, '[data-ui-chat-id]').find((entry) => entry.dataset.uiChatId === thread.id);
      if (button) { button.textContent = thread.title; button.dataset.uiTitle = thread.title; }
    }
    input.value = ''; renderChat(root);
    feedback(root, 'Message added locally. An assistant is not connected, so no reply was generated.', form); input.focus();
  }
  function selectTab(root, button, focus = false) {
    const key = button.dataset.uiTab;
    if (!key || !own(root, '[data-ui-panel]').some((panel) => panel.dataset.uiPanel === key)) return;
    const tabs = own(root, '[data-ui-tab]');
    const keys = new Set(tabs.map((tab) => tab.dataset.uiTab));
    tabs.forEach((tab) => {
      const selected = tab.dataset.uiTab === key;
      if (tab.getAttribute('role') === 'tab') { tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1; }
      else tab.setAttribute('aria-pressed', String(selected));
    });
    own(root, '[data-ui-panel]').filter((panel) => keys.has(panel.dataset.uiPanel)).forEach((panel) => { panel.hidden = panel.dataset.uiPanel !== key; });
    if (focus) button.focus();
  }
  function search(root, input) {
    const query = input.value.trim().slice(0, 300).toLocaleLowerCase();
    const scope = input.closest('[data-ui-search-scope]') || root;
    const items = [...scope.querySelectorAll('[data-ui-search-item]')].filter((item) => item.closest(ROOT) === root);
    let count = 0;
    items.forEach((item) => { item.hidden = !text(item.dataset.uiSearchItem || item.textContent, 10000).toLocaleLowerCase().includes(query); if (!item.hidden) count++; });
    const countNode = first(root, '[data-ui-search-count]'); if (countNode) countNode.textContent = `${count} results`;
  }
  function readPrice(value) {
    const raw = String(value ?? '').trim();
    const match = raw.match(/^(USD|EUR|GBP|CAD|AUD|JPY|[$€£¥])?\s*(\d{1,7}(?:,\d{3})*(?:\.\d{1,2})?)\s*(USD|EUR|GBP|CAD|AUD|JPY)?$/);
    const parsed = match ? Number(match[2].replaceAll(',', '')) : NaN;
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1000000 || match[1] && match[3] && match[1] !== match[3]) return { amount: null, currency: '' };
    return { amount: Math.round(parsed * 100), currency: match[1] || match[3] || '' };
  }
  const money = (cents, currency = '') => `${currency}${currency.length > 1 ? ' ' : ''}${(cents / 100).toFixed(2)}`;
  function sortTable(root, button) {
    const field = button.dataset.uiSort;
    if (!['title', 'body', 'meta', 'price'].includes(field)) return;
    const table = button.closest('table') || first(root, 'table'), body = table?.querySelector('tbody'); if (!body) return;
    const rows = [...body.querySelectorAll('[data-ui-row]')], descending = button.dataset.uiSortDirection !== 'descending' && button.dataset.uiSortDirection === 'ascending';
    rows.sort((a, b) => {
      const left = a.dataset[`ui${field[0].toUpperCase()}${field.slice(1)}`] ?? '', right = b.dataset[`ui${field[0].toUpperCase()}${field.slice(1)}`] ?? '';
      const leftPrice = readPrice(left).amount, rightPrice = readPrice(right).amount;
      const comparison = field === 'price' && leftPrice !== null && rightPrice !== null ? leftPrice - rightPrice : left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
      return descending ? -comparison : comparison;
    });
    rows.forEach((row) => body.append(row));
    table.querySelectorAll('[data-ui-sort]').forEach((entry) => { entry.removeAttribute('data-ui-sort-direction'); entry.closest('th')?.removeAttribute('aria-sort'); });
    button.dataset.uiSortDirection = descending ? 'descending' : 'ascending'; button.closest('th')?.setAttribute('aria-sort', button.dataset.uiSortDirection);
    feedback(root, `Sorted by ${field}, ${button.dataset.uiSortDirection}.`);
  }
  function updateCart(root) {
    const entries = [...stateFor(root).cart.values()];
    const count = entries.reduce((sum, entry) => sum + entry.quantity, 0), total = entries.reduce((sum, entry) => sum + (entry.price ?? 0) * entry.quantity, 0);
    const currencies = new Set(entries.map((entry) => entry.currency));
    const totalLabel = entries.some((entry) => entry.price === null) ? 'Price pending' : currencies.size > 1 ? 'Multiple currencies' : money(total, entries[0]?.currency);
    own(root, '[data-ui-cart-count]').forEach((node) => { node.textContent = String(count); });
    own(root, '[data-ui-cart-total]').forEach((node) => { node.textContent = count ? totalLabel : ''; });
    return { count, totalLabel };
  }
  function addCart(root, button) {
    const id = text(button.dataset.uiProduct, 100), price = readPrice(button.dataset.uiPrice);
    if (!id) return;
    const state = stateFor(root), existing = state.cart.get(id), count = updateCart(root).count;
    if (count >= 99) { feedback(root, 'The local cart holds up to 99 items.'); return; }
    state.cart.set(id, { name: text(button.dataset.uiName || 'Item', 120), price: price.amount, currency: price.currency, quantity: (existing?.quantity || 0) + 1 });
    const totals = updateCart(root); feedback(root, `${text(button.dataset.uiName || 'Item', 120)} added. ${totals.count} items. ${totals.totalLabel}.`);
  }
  function checkout(root, form) {
    if (form && !form.reportValidity()) return;
    if (form) {
      const count = own(root, '.ui-order-item').length;
      feedback(root, count ? `Your details and ${count} prepared order items are ready for review. No order was placed and no payment was taken.` : 'Your details are ready for review. Add order items before connecting a checkout service. No order was placed.', form); return;
    }
    const totals = updateCart(root);
    feedback(root, totals.count ? `Local checkout summary: ${totals.count} items. ${totals.totalLabel}. No order was placed and no payment was taken.` : 'Your local cart is empty. No order was placed.', form);
  }
  function renderCalendar(root, offset = 0) {
    const state = stateFor(root), grid = first(root, '[data-ui-calendar-grid]'); if (!grid) return;
    if (!state.calendar) {
      const current = new Date(), year = Number(grid.dataset.uiYear), month = Number(grid.dataset.uiMonth);
      state.calendar = { year: Number.isInteger(year) && year >= 1900 && year <= 2200 ? year : current.getFullYear(), month: Number.isInteger(month) && month >= 1 && month <= 12 ? month - 1 : current.getMonth() };
      state.calendar.initialYear = state.calendar.year; state.calendar.initialMonth = state.calendar.month;
      state.calendar.initialDays = [...grid.children].map((node) => node.cloneNode(true));
    }
    const date = new Date(state.calendar.year, state.calendar.month + offset, 1);
    if (date.getFullYear() < 1900 || date.getFullYear() > 2200) return;
    state.calendar.year = date.getFullYear(); state.calendar.month = date.getMonth();
    const label = first(root, '[data-ui-calendar-label]'); if (label) label.textContent = date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    if (state.calendar.year === state.calendar.initialYear && state.calendar.month === state.calendar.initialMonth) {
      grid.replaceChildren(...state.calendar.initialDays.map((node) => node.cloneNode(true))); return;
    }
    const fragment = document.createDocumentFragment(), start = (date.getDay() + 6) % 7, days = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    for (let index = 0; index < start; index++) { const empty = document.createElement('span'); empty.className = 'ui-calendar-empty'; empty.setAttribute('aria-hidden', 'true'); fragment.append(empty); }
    for (let day = 1; day <= days; day++) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'ui-calendar-day'; button.dataset.uiDay = String(day); button.textContent = String(day);
      button.setAttribute('aria-label', new Date(date.getFullYear(), date.getMonth(), day).toLocaleDateString(undefined, { dateStyle: 'full' })); fragment.append(button);
    }
    grid.replaceChildren(fragment);
  }
  function previewDocument(root, saved = false) {
    const input = first(root, '[data-ui-editor]'), output = first(root, '[data-ui-document-preview]');
    if (!input || !output) return;
    output.textContent = text(input.value, 20000); output.hidden = false;
    feedback(root, saved ? 'Document updated in this local session. Reloading restores the prepared document.' : 'Plain-text preview updated.');
  }
  function selectInbox(root, button) {
    const removed = new Set((button.dataset.uiRemovedParts || '').split(' '));
    const message = first(root, '.ui-message');
    const heading = first(root, '[data-ui-message-heading]');
    for (const field of ['title', 'body', 'meta']) {
      let node = first(root, `[data-ui-message-${field}]`);
      if (removed.has(field === 'title' ? 'heading' : field)) { node?.remove(); continue; }
      if (!node && message && heading) {
        node = document.createElement(field === 'title' ? 'h2' : 'p');
        node.setAttribute(`data-ui-message-${field}`, '');
        if (field === 'body') { node.className = 'ui-message-body'; message.querySelector('.ui-message-heading')?.after(node); }
        else if (field === 'title') heading.prepend(node);
        else heading.append(node);
      }
      if (node) node.textContent = text(button.dataset[`ui${field[0].toUpperCase()}${field.slice(1)}`], field === 'body' ? 4000 : 300);
    }
    let avatar = first(root, '[data-ui-message-icon]');
    if (removed.has('icon')) avatar?.remove();
    else if (!avatar && heading) {
      avatar = document.createElement('span'); avatar.className = 'ui-avatar'; avatar.dataset.uiMessageIcon = '';
      avatar.textContent = text(button.dataset.uiTitle || 'Message', 1).toUpperCase(); heading.before(avatar);
    }
    own(root, '[data-ui-action="select-thread"]').forEach((entry) => { entry.setAttribute('aria-pressed', String(entry === button)); entry.classList.toggle('is-active', entry === button); });
  }
  function changeTask(root, select) {
    const task = select.closest('[data-ui-task]'), status = select.value;
    if (!task || !['To do', 'In progress', 'Done'].includes(status)) return;
    const column = own(root, '[data-ui-column]').find((entry) => entry.dataset.uiColumn === status);
    if (column) (column.querySelector('[data-ui-task-list]') || column).append(task);
    task.dataset.uiStatus = status;
    const badge = task.querySelector('.ui-badge'); if (badge) badge.textContent = status;
    own(root, '[data-ui-column]').forEach((entry) => {
      const count = entry.querySelector('[data-ui-column-count]'); if (count) count.textContent = String(entry.querySelectorAll('[data-ui-task]').length);
    });
    feedback(root, `Task ${column ? 'moved' : 'updated'} to ${status} in this local session.`);
  }
  function appendText(parent, tag, value, className) {
    const node = document.createElement(tag); node.textContent = value;
    if (className) node.className = className;
    parent.append(node); return node;
  }
  function openAddItem(root, trigger) {
    if (['login', 'signup', 'settings', 'checkout'].includes(root.dataset.interface)) { feedback(root, 'This action has no connected service. Nothing was sent.'); return; }
    if (stateFor(root).addedItems >= 8) { feedback(root, 'This local session supports eight additional items. Reload the page to restore the prepared collection.'); return; }
    let dialog = first(root, '.ui-local-dialog');
    if (!dialog) {
      dialog = document.createElement('dialog'); dialog.className = 'ui-local-dialog'; dialog.setAttribute('aria-label', 'Add a local item');
      const form = document.createElement('form'); form.className = 'ui-form'; form.dataset.uiForm = 'local-add';
      appendText(form, 'h2', root.dataset.interface === 'calendar' ? 'Add an event' : root.dataset.interface === 'board' ? 'Add a task' : 'Add an item');
      appendText(form, 'p', 'This item stays in the current page until you reload.', 'ui-description');
      for (const [name, label, maximum] of [['title', 'Title', 180], ['body', 'Details', 1800], ['meta', root.dataset.interface === 'calendar' ? 'Date or time' : 'Label or status', 120]]) {
        const wrapper = document.createElement('label'); wrapper.className = 'ui-field'; appendText(wrapper, 'span', label);
        const input = document.createElement(name === 'body' ? 'textarea' : 'input'); input.name = name; input.maxLength = maximum; input.required = name === 'title';
        if (name === 'body') input.rows = 3; else input.type = 'text';
        wrapper.append(input); form.append(wrapper);
      }
      if (root.dataset.interface === 'table') {
        const wrapper = document.createElement('label'); wrapper.className = 'ui-field'; appendText(wrapper, 'span', 'Value');
        const input = document.createElement('input'); input.type = 'text'; input.name = 'price'; input.maxLength = 80; wrapper.append(input); form.append(wrapper);
      }
      const footer = document.createElement('div'); footer.className = 'ui-form-footer';
      const cancel = makeButton('Cancel', 'cancel-add'); cancel.className = 'site-button ui-button secondary';
      const save = document.createElement('button'); save.type = 'submit'; save.className = 'site-button ui-button'; save.textContent = 'Add item';
      footer.append(cancel, save); form.append(footer); dialog.append(form); root.append(dialog);
    }
    if (dialog.open) return;
    dialog.querySelector('form').reset(); dialog.showModal();
    dialog.addEventListener('close', () => trigger.focus(), { once: true });
  }
  function addLocalItem(root, form) {
    const state = stateFor(root);
    if (state.addedItems >= 8) { feedback(root, 'This local session already has eight additional items.', form); return; }
    const titleInput = form.elements.namedItem('title'); titleInput.setCustomValidity(titleInput.value.trim() ? '' : 'Enter a title.');
    if (!form.reportValidity()) return;
    const value = (name, limit) => text(form.elements.namedItem(name)?.value.trim(), limit);
    const item = { title: value('title', 180), body: value('body', 1800), meta: value('meta', 120), price: value('price', 80) };
    let node;
    if (root.dataset.interface === 'table') {
      const table = first(root, 'table tbody'); if (!table) return;
      node = document.createElement('tr'); node.dataset.uiRow = ''; node.dataset.uiSearchItem = '';
      for (const field of ['title', 'body', 'meta', 'price']) { node.dataset[`ui${field[0].toUpperCase()}${field.slice(1)}`] = item[field]; const cell = appendText(node, field === 'title' ? 'th' : 'td', item[field]); if (field === 'title') cell.scope = 'row'; }
      table.append(node);
      const count = table.closest('.ui-table-panel')?.querySelector('.ui-table-footer span'); if (count) count.textContent = `${table.querySelectorAll('[data-ui-row]').length} records`;
    } else if (root.dataset.interface === 'board') {
      const column = own(root, '[data-ui-column]').find((entry) => entry.dataset.uiColumn === 'To do'); if (!column) return;
      node = document.createElement('article'); node.className = 'ui-task'; node.dataset.uiTask = ''; node.dataset.uiSearchItem = '';
      if (item.meta) appendText(node, 'span', item.meta, 'ui-badge');
      appendText(node, 'h3', item.title); appendText(node, 'p', item.body);
      const footer = document.createElement('div'); footer.className = 'ui-task-footer';
      const label = document.createElement('label'); appendText(label, 'span', 'Status', 'sr-only');
      const select = document.createElement('select'); select.dataset.uiTaskStatus = '';
      for (const status of ['To do', 'In progress', 'Done']) { const option = appendText(select, 'option', status); option.value = status; }
      label.append(select); footer.append(label); node.append(footer); (column.querySelector('[data-ui-task-list]') || column).append(node); changeTask(root, select);
    } else if (root.dataset.interface === 'inbox') {
      const list = first(root, '.ui-inbox-list'); if (!list) return;
      node = makeButton('', 'select-thread'); node.className = 'ui-inbox-thread'; node.dataset.uiSearchItem = '';
      node.dataset.uiTitle = item.title; node.dataset.uiBody = item.body; node.dataset.uiMeta = item.meta;
      const details = document.createElement('span'); appendText(details, 'strong', item.title); appendText(details, 'small', item.body); node.append(details); appendText(node, 'span', item.meta); list.append(node); selectInbox(root, node);
    } else {
      const list = first(root, root.dataset.interface === 'calendar' ? '.ui-agenda' : '.ui-modules') || first(root, '[data-ui-panel="main"]'); if (!list) return;
      node = document.createElement('article'); node.className = root.dataset.interface === 'calendar' ? 'ui-list-item' : 'ui-panel'; node.dataset.uiSearchItem = '';
      const details = document.createElement('div'); appendText(details, 'h3', item.title); appendText(details, 'p', item.body); node.append(details);
      if (item.meta) appendText(node, 'span', item.meta, 'ui-badge'); list.append(node);
    }
    node.dataset.uiLocalItem = ''; state.addedItems++;
    const summary = first(root, '.ui-summary-list'); if (summary) appendText(summary, 'li', item.title);
    const summaryCount = first(root, '.ui-summary-count strong'); if (summaryCount && /^\d+$/.test(summaryCount.textContent)) summaryCount.textContent = String(Number(summaryCount.textContent) + 1);
    const input = first(root, '[data-ui-search]'); if (input) search(root, input);
    form.closest('dialog')?.close(); feedback(root, `${item.title} added to this local session.`);
  }
  function submit(root, form) {
    const kind = form.dataset.uiForm;
    if (kind === 'local-add') { addLocalItem(root, form); return; }
    if (kind === 'chat') { sendMessage(root, form); return; }
    if (kind === 'auth') {
      const password = form.querySelector('input[name="password"]'), confirm = form.querySelector('input[name="passwordConfirm"],input[name="confirmPassword"]');
      if (confirm) confirm.setCustomValidity(password && confirm.value !== password.value ? 'Passwords must match.' : '');
      if (!form.reportValidity()) return;
      form.querySelectorAll('input[type="password"],input[data-ui-password]').forEach((input) => { input.value = ''; input.type = 'password'; });
      own(root, '[data-ui-action="password"]').forEach((button) => { button.setAttribute('aria-pressed', 'false'); button.setAttribute('aria-label', 'Show password'); button.title = 'Show password'; });
      feedback(root, 'Form completed locally. Authentication is not connected; no account was created or signed in.', form); return;
    }
    if (kind === 'checkout') { checkout(root, form); return; }
    if (!form.reportValidity()) return;
    feedback(root, kind === 'settings' ? 'Settings updated in this local session. Reloading restores the prepared settings.' : 'Form completed locally. Nothing was sent or stored.', form);
  }
  // Capturing submission also prevents forms from ever falling through to a
  // browser navigation in Inspect mode or when a form has no authored handler.
  document.addEventListener('submit', (event) => {
    if (!(event.target instanceof HTMLFormElement)) return;
    const root = event.target.closest(ROOT); if (!root) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (!inspecting()) submit(root, event.target);
  }, true);
  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const root = event.target.closest(ROOT); if (!root) return;
    if (inspecting() && event.target.closest('select,label,input[type="checkbox"],input[type="radio"],input[type="file"],input[type="range"],input[type="color"],button[type="submit"]')) { event.preventDefault(); return; }
    const anchor = event.target.closest('a[href^="#"]');
    if (anchor && !inspecting()) {
      const panel = own(root, '[data-ui-panel][id]').find((node) => node.id === anchor.getAttribute('href').slice(1));
      const tab = panel && own(root, '[data-ui-tab]').find((node) => node.dataset.uiTab === panel.dataset.uiPanel);
      if (tab) { event.preventDefault(); selectTab(root, tab); }
    }
    const button = event.target.closest('[data-ui-action],[data-ui-tab],[data-ui-sort],[data-ui-prompt],[data-ui-day]');
    if (!button || button.closest(ROOT) !== root || button.disabled) return;
    event.preventDefault(); if (inspecting()) return;
    if (button.dataset.uiTab !== undefined) { selectTab(root, button); return; }
    if (button.dataset.uiSort !== undefined) { sortTable(root, button); return; }
    if (button.dataset.uiPrompt !== undefined) {
      const input = first(root, '[data-ui-form="chat"] textarea[name="message"]');
      if (input) { input.value = text(button.dataset.uiPrompt || button.textContent, MAX_MESSAGE_LENGTH); input.setCustomValidity(''); input.focus(); } return;
    }
    if (button.dataset.uiDay !== undefined) {
      own(root, '[data-ui-day]').forEach((entry) => entry.setAttribute('aria-pressed', String(entry === button)));
      feedback(root, `${button.getAttribute('aria-label') || `Day ${button.dataset.uiDay}`} selected. This calendar has no connected scheduling service.`); return;
    }
    switch (button.dataset.uiAction) {
      case 'toggle-nav': {
        const open = root.dataset.uiNavOpen !== 'true'; root.dataset.uiNavOpen = String(open); button.setAttribute('aria-expanded', String(open)); break;
      }
      case 'password': {
        const id = button.getAttribute('aria-controls'), input = own(root, 'input').find((entry) => entry.id === id);
        if (!input || !['password', 'text'].includes(input.type)) break;
        input.dataset.uiPassword = ''; const show = input.type === 'password'; input.type = show ? 'text' : 'password'; button.setAttribute('aria-pressed', String(show)); button.setAttribute('aria-label', show ? 'Hide password' : 'Show password'); button.title = show ? 'Hide password' : 'Show password'; break;
      }
      case 'new-chat': newChat(root); break;
      case 'reset-chat': {
        const state = stateFor(root), thread = state.threads.get(state.activeThread); if (thread) { thread.messages = []; renderChat(root); feedback(root, 'Local chat cleared.'); } break;
      }
      case 'select-thread': {
        const state = stateFor(root);
        if (first(root, '[data-ui-transcript]')) { if (state.threads.has(button.dataset.uiChatId)) { state.activeThread = button.dataset.uiChatId; renderChat(root); } }
        else selectInbox(root, button); break;
      }
      case 'previous-month': renderCalendar(root, -1); break;
      case 'next-month': renderCalendar(root, 1); break;
      case 'add-cart': addCart(root, button); break;
      case 'remove-cart': { stateFor(root).cart.delete(text(button.dataset.uiProduct, 100)); updateCart(root); feedback(root, 'Item removed from the local cart.'); break; }
      case 'checkout': checkout(root); break;
      case 'save-editor': previewDocument(root, true); break;
      case 'preview-document': previewDocument(root); break;
      case 'add-item': openAddItem(root, button); break;
      case 'cancel-add': button.closest('dialog')?.close(); break;
      default: break;
    }
  }, true);
  document.addEventListener('input', (event) => {
    if (!(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)) return;
    const input = event.target, root = input.closest(ROOT); if (!root || inspecting()) return;
    input.setCustomValidity('');
    if (input.dataset.uiSearch !== undefined) search(root, input);
    if (input.name === 'password') input.form?.querySelector('input[name="passwordConfirm"],input[name="confirmPassword"]')?.setCustomValidity('');
  });
  document.addEventListener('change', (event) => {
    if (!(event.target instanceof HTMLSelectElement)) return;
    const root = event.target.closest(ROOT); if (!root || inspecting()) return;
    if (event.target.dataset.uiTaskStatus !== undefined) changeTask(root, event.target);
  });
  document.addEventListener('keydown', (event) => {
    if (!(event.target instanceof Element)) return;
    const root = event.target.closest(ROOT); if (!root) return;
    if (inspecting()) {
      if (event.target.closest('select,input[type="checkbox"],input[type="radio"],input[type="file"],input[type="range"],input[type="color"]') && !['Tab', 'Escape'].includes(event.key)) event.preventDefault();
      return;
    }
    const tab = event.target.closest('[role="tab"][data-ui-tab]');
    if (tab && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      const tabs = [...(tab.closest('[role="tablist"]') || root).querySelectorAll('[data-ui-tab]')];
      const index = tabs.indexOf(tab), next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      event.preventDefault(); selectTab(root, tabs[next], true);
    }
    if (event.key === 'Escape' && root.dataset.uiNavOpen === 'true') {
      root.dataset.uiNavOpen = 'false'; const toggle = first(root, '[data-ui-action="toggle-nav"]'); toggle?.setAttribute('aria-expanded', 'false'); toggle?.focus();
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.target instanceof HTMLTextAreaElement && event.target.name === 'message') {
      const form = event.target.closest('[data-ui-form="chat"]'); if (form) { event.preventDefault(); form.requestSubmit(); }
    }
  });
  document.querySelectorAll(ROOT).forEach((root) => {
    stateFor(root);
    own(root, '[data-ui-form="chat"] [name="message"]').forEach((input) => { input.maxLength = MAX_MESSAGE_LENGTH; });
    own(root, '[data-ui-editor]').forEach((input) => { input.maxLength = 20000; });
    own(root, 'input[type="password"]').forEach((input) => { input.dataset.uiPassword = ''; });
    own(root, '[data-ui-tab][aria-selected="true"]').forEach((tab) => selectTab(root, tab));
    if (first(root, '[data-ui-calendar-grid]')) renderCalendar(root);
    if (first(root, '[data-ui-cart-count],[data-ui-cart-total]')) updateCart(root);
  });
  function syncInspectControls() {
    const inspect = inspecting();
    document.querySelectorAll(`${ROOT} input,${ROOT} textarea,${ROOT} select`).forEach((control) => {
      if (inspect) {
        if (!inspectControls.has(control)) inspectControls.set(control, { readOnly: control.readOnly, ariaDisabled: control.getAttribute('aria-disabled') });
        if ('readOnly' in control) control.readOnly = true;
        control.setAttribute('aria-disabled', 'true');
      } else if (inspectControls.has(control)) {
        const original = inspectControls.get(control);
        if ('readOnly' in control) control.readOnly = original.readOnly;
        if (original.ariaDisabled === null) control.removeAttribute('aria-disabled'); else control.setAttribute('aria-disabled', original.ariaDisabled);
        inspectControls.delete(control);
      }
    });
    if (inspect) document.querySelectorAll(`${ROOT} dialog[open]`).forEach((dialog) => dialog.close());
  }
  if (preview) {
    syncInspectControls();
    document.addEventListener('pointerdown', (event) => {
      if (inspecting() && event.target instanceof Element && event.target.closest(ROOT) && event.target.closest('select,input[type="checkbox"],input[type="radio"],input[type="file"],input[type="range"],input[type="color"]')) event.preventDefault();
    }, true);
    new MutationObserver(syncInspectControls).observe(document.body, { attributes: true, attributeFilter: ['data-edit-mode'] });
  }
})();
