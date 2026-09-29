/* NEW: Fixed first-party site behaviors. This script's hash is allowed by the CSP.
 * User copy is never interpolated into JavaScript. No requests, analytics or cookies. */
(() => {
  'use strict';
  const preview = document.body.dataset.preview === 'true';
  const channel = document.body.dataset.channel;
  let parentOrigin;
  let editorMessages = Object.create(null);
  let editorLocale = 'en';
  const tr = (key, parameters = {}) => {
    const message = Object.hasOwn(editorMessages, key) ? editorMessages[key] : key;
    return message.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g, (match, name) => Object.hasOwn(parameters, name) ? String(parameters[name]) : match);
  };
  const localizeEditor = (messages, locale) => {
    if (!messages || typeof messages !== 'object' || Array.isArray(messages)) return;
    const entries = Object.entries(messages);
    if (entries.length > 100 || entries.some(([key, value]) => key.length > 250 || typeof value !== 'string' || value.length > 1000)) return;
    editorMessages = Object.fromEntries(entries);
    if (['en', 'es', 'pt', 'de', 'it', 'ru', 'pl', 'fi', 'sv'].includes(locale)) editorLocale = locale;
    document.querySelectorAll('.editor-add-menu,.editor-selection-tools,.editor-resize-handle,.editor-resize-status,.site-notice').forEach((node) => { node.lang = editorLocale; });
    document.querySelectorAll('[data-editor-i18n]').forEach((node) => { node.textContent = tr(node.dataset.editorI18n); });
    document.querySelectorAll('[data-editor-i18n-label]').forEach((node) => {
      const label = tr(node.dataset.editorI18nLabel); node.setAttribute('aria-label', label); node.title = label;
    });
    if (toolbar) toolbar.setAttribute('aria-label', tr("Arrange selected content"));
  };
  const send = (type, payload = {}) => {
    if (preview && window.parent !== window) window.parent.postMessage({ source: 'forma-preview', channel, type, ...payload }, parentOrigin || '*');
  };
  const notify = (message) => {
    const node = document.querySelector('.site-notice');
    if (!node) return;
    node.textContent = message; node.hidden = false;
    window.setTimeout(() => { node.hidden = true; }, 4500);
  };
  let editorState = { pageId: '', changeCounter: -1, busy: true, selection: null, moveOptions: [], media: null, canDelete: false, deleteReason: '' };
  let selected = null;
  let selectedPartNode = null;
  let toolbar;
  let drag = null;
  let libraryDrag = null;
  let resize = null;
  let resizeHandle;
  let resizeStatus;
  let scrollFrame = 0;
  let suppressClickUntil = 0;
  const sectionNode = (id) => [...document.querySelectorAll('[data-section]')].find((node) => node.dataset.section === id);
  const itemNode = (section, id) => section && id && [...section.querySelectorAll('[data-item-id]')].find((node) => node.dataset.itemId === id && node.closest('[data-section]') === section);
  const partOwner = (node) => {
    const section = node?.closest('[data-section]');
    if (!section) return null;
    // Mirrored labels outside an item wrapper still belong to a canonical item
    // in this same section. An unknown explicit owner never becomes the section.
    if (node.dataset.ownerItemId !== undefined) return itemNode(section, node.dataset.ownerItemId) || null;
    return node.closest('[data-item-id]') || section;
  };
  const partNode = (owner, key) => {
    const section = owner?.closest('[data-section]');
    return section && key && [...section.querySelectorAll('[data-part-key]')].find((node) => node.dataset.partKey === key && partOwner(node) === owner);
  };
  const ownerNode = (selection) => {
    const section = sectionNode(selection?.sectionId);
    return section && (selection.itemId ? itemNode(section, selection.itemId) : section);
  };
  const selectedNode = (selection) => {
    const owner = ownerNode(selection);
    if (selection?.partKey && selectedPartNode?.isConnected && selectedPartNode.dataset.partKey === selection.partKey && partOwner(selectedPartNode) === owner) return selectedPartNode;
    return owner && (selection.partKey ? partNode(owner, selection.partKey) : owner);
  };
  const selectionKey = (selection) => JSON.stringify([selection?.sectionId, selection?.itemId, selection?.partKey]);
  const scrollToTarget = (target) => {
    if (!target) return;
    const margin = parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
    // Scroll only this document. scrollIntoView can also move embedding containers.
    window.scrollTo({ top: window.scrollY + target.getBoundingClientRect().top - margin, behavior: 'instant' });
  };
  const partLabels = { heading: 'Heading', body: 'Description', action: 'Primary button', icon: 'Icon', buttonIcon: 'Button icon', buttonLabel: 'Button label', media: 'Image' };
  const selectSection = (id, scroll = false, itemIndex, itemId, partKey, clickedPart) => {
    document.querySelectorAll('[data-selected]').forEach((node) => node.removeAttribute('data-selected'));
    document.querySelectorAll('[data-item-selected]').forEach((node) => node.removeAttribute('data-item-selected'));
    document.querySelectorAll('[data-part-selected]').forEach((node) => node.removeAttribute('data-part-selected'));
    const node = sectionNode(id);
    if (node) {
      node.dataset.selected = 'true';
      const item = itemNode(node, itemId) || (Number.isInteger(itemIndex) && itemIndex >= 0 && itemIndex < 8
        ? [...node.querySelectorAll('[data-item-index]')].find((el) => Number(el.dataset.itemIndex) === itemIndex && el.closest('[data-section]') === node) : null);
      if (item) item.dataset.itemSelected = 'true';
      const owner = item || node;
      const previousPart = clickedPart || selectedPartNode;
      const part = previousPart?.isConnected && previousPart.dataset.partKey === partKey && partOwner(previousPart) === owner ? previousPart : partNode(owner, partKey);
      selectedPartNode = part || null;
      if (part) part.dataset.partSelected = 'true';
      selected = { sectionId: id, ...(item ? { itemId: item.dataset.itemId } : {}), ...(part ? { partKey } : {}) };
      if (scroll) scrollToTarget(part || item || node);
      renderToolbar();
    } else { selected = null; selectedPartNode = null; if (toolbar) toolbar.hidden = true; if (resizeHandle) resizeHandle.hidden = true; }
  };
  const requestSelection = (selection, clickedPart) => {
    if (resize) endResize(tr("Image resize canceled."));
    const node = ownerNode(selection);
    if (!node) return;
    selectSection(selection.sectionId, false, null, selection.itemId, selection.partKey, clickedPart);
    send('select', { id: selection.sectionId, forDrag: true, ...(selection.itemId ? { itemId: selection.itemId } : {}), ...(selection.partKey ? { partKey: selection.partKey } : {}) });
  };
  const activeOptions = () => selectionKey(selected) === selectionKey(editorState.selection) ? editorState.moveOptions : [];
  const activeMedia = () => selected?.partKey === 'media' && selectionKey(selected) === selectionKey(editorState.selection) ? editorState.media : null;
  const requestDelete = () => {
    if (!preview || !selected || document.body.dataset.editMode !== 'true' || editorState.busy || !editorState.canDelete || selectionKey(selected) !== selectionKey(editorState.selection)) return;
    endDrag(); endLibraryDrag(); endResize();
    send('delete-selection', { pageId: editorState.pageId, changeCounter: editorState.changeCounter, selection: { ...selected }, scrollY: Math.round(window.scrollY) });
  };
  const button = (label, className, action) => {
    const node = document.createElement('button'); node.type = 'button'; node.textContent = label; node.lang = editorLocale;
    if (className) node.className = className;
    if (action) node.addEventListener('click', action);
    return node;
  };
  const positionMoveMenu = () => {
    const menu = toolbar?.querySelector('.editor-move-menu[open]');
    const list = menu?.querySelector('.editor-move-options');
    if (!list) return;
    const anchor = menu.querySelector('summary').getBoundingClientRect();
    const margin = 8, below = innerHeight - anchor.bottom - margin, above = anchor.top - margin;
    // The iframe is scaled by its parent. Use its own viewport coordinates so
    // a wide popup beside a narrow selection never extends beyond the canvas.
    const openBelow = below >= Math.min(180, above);
    const space = Math.max(44, openBelow ? below : above);
    list.style.maxHeight = `${Math.min(320, space)}px`;
    list.style.left = `${Math.max(margin, Math.min(anchor.right - list.offsetWidth, innerWidth - list.offsetWidth - margin))}px`;
    list.style.top = `${Math.max(margin, openBelow ? anchor.bottom : anchor.top - list.offsetHeight)}px`;
  };
  const positionToolbar = () => {
    positionResizeHandle();
    if (!toolbar || document.body.dataset.editMode !== 'true' || drag?.started || libraryDrag || resize?.started) return;
    const node = selectedNode(selected);
    if (!node) { toolbar.hidden = true; return; }
    const rect = node.getBoundingClientRect();
    toolbar.hidden = rect.bottom < 0 || rect.top > innerHeight;
    if (toolbar.hidden) return;
    toolbar.style.left = `${Math.max(8, Math.min(rect.left + 2, innerWidth - toolbar.offsetWidth - 8))}px`;
    toolbar.style.top = `${Math.max(4, Math.min(rect.top - toolbar.offsetHeight, innerHeight - toolbar.offsetHeight - 4))}px`;
    positionMoveMenu();
  };
  function renderToolbar() {
    if (!preview || !selected || drag || libraryDrag || resize) return;
    if (!toolbar) {
      toolbar = document.createElement('div'); toolbar.className = 'editor-selection-tools'; toolbar.setAttribute('role', 'toolbar'); toolbar.lang = editorLocale;
      toolbar.setAttribute('aria-label', tr("Arrange selected content")); document.body.append(toolbar);
    }
    toolbar.replaceChildren();
    toolbar.hidden = document.body.dataset.editMode !== 'true';
    const section = sectionNode(selected.sectionId);
    if (!section) { toolbar.hidden = true; return; }
    toolbar.append(button(tr(section.dataset.sectionLabel || 'Section'), 'editor-breadcrumb', () => requestSelection({ sectionId: selected.sectionId })));
    if (selected.itemId) {
      const item = itemNode(section, selected.itemId);
      toolbar.append(button(`› ${tr('Card {number}', { number: Number(item?.dataset.itemIndex || 0) + 1 })}`, 'editor-breadcrumb', () => requestSelection({ sectionId: selected.sectionId, itemId: selected.itemId })));
    }
    if (selected.partKey) {
      if (selected.partKey === 'buttonIcon' && partNode(ownerNode(selected), 'action')) toolbar.append(button(`› ${tr('Primary button')}`, 'editor-breadcrumb', () => requestSelection({ ...selected, partKey: 'action' })));
      const crumb = document.createElement('span'); crumb.className = 'editor-active-part'; crumb.textContent = `› ${tr(partLabels[selected.partKey] || 'Part')}`; toolbar.append(crumb);
    }
    if (selected.partKey === 'media') {
      toolbar.append(button(tr("Edit image…"), 'editor-edit-media', () => editMedia()));
      if (activeMedia()?.canResize && !editorState.busy) toolbar.append(button(tr("Resize image…"), 'editor-edit-media', () => editMedia('size')));
    }
    const options = activeOptions();
    const handle = button('⠿', 'editor-drag-handle');
    const level = tr(selected.partKey ? partLabels[selected.partKey] || 'Part' : selected.itemId ? 'Card' : 'Section');
    handle.setAttribute('aria-label', tr('Drag {level}', { level })); handle.title = tr('Drag {level}; use Move menu for keyboard controls', { level });
    handle.disabled = editorState.busy || options.length === 0; toolbar.append(handle);
    const menu = document.createElement('details'); menu.className = 'editor-move-menu';
    menu.addEventListener('toggle', () => { if (menu.open) positionMoveMenu(); });
    const summary = document.createElement('summary'); summary.textContent = tr("Move…"); summary.setAttribute('aria-label', tr('Move {level}', { level })); menu.append(summary);
    const list = document.createElement('div'); list.className = 'editor-move-options';
    if (!options.length) {
      const status = document.createElement('p'); status.textContent = editorState.busy ? tr("Wait for the current operation.") : tr("No available moves. Fixed positions and section locks constrain arranging."); list.append(status);
    }
    for (const option of options) {
      const choice = button(option.label, '', () => { menu.open = false; startMenuMove(option); });
      choice.disabled = editorState.busy; list.append(choice);
    }
    menu.append(list); toolbar.append(menu);
    const remove = button(tr('Delete'), 'editor-delete-selection', requestDelete);
    remove.setAttribute('aria-label', tr('Delete {name}', { name: level }));
    remove.disabled = editorState.busy || !editorState.canDelete || selectionKey(selected) !== selectionKey(editorState.selection);
    remove.title = editorState.deleteReason || tr('Delete selected content. Undo is available.');
    toolbar.append(remove); positionToolbar();
  }

  const editMedia = (focus) => {
    if (selected?.partKey !== 'media') return;
    send('edit-media', { sectionId: selected.sectionId, ...(selected.itemId ? { itemId: selected.itemId } : {}), ...(focus ? { focus } : {}) });
  };
  const readMedia = (media) => media && Number.isInteger(media.width) && media.width >= 25 && media.width <= 100
    && (media.height === null || (Number.isInteger(media.height) && media.height >= 80 && media.height <= 1200))
    && ['cover', 'contain'].includes(media.fit)
    ? { width: media.width, height: media.height, fit: media.fit, canResize: media.canResize === true } : null;
  function positionResizeHandle() {
    const media = activeMedia();
    const node = selectedNode(selected);
    const visible = preview && document.body.dataset.editMode === 'true' && !editorState.busy && media?.canResize && node && !drag && !libraryDrag;
    if (!visible) { if (resizeHandle) resizeHandle.hidden = true; if (resizeStatus) resizeStatus.hidden = true; return; }
    if (!resizeHandle) {
      resizeHandle = button('↘', 'editor-resize-handle', () => editMedia('size'));
      document.body.append(resizeHandle);
    }
    const label = tr('Resize image; drag the corner or open size controls');
    resizeHandle.setAttribute('aria-label', label); resizeHandle.title = label;
    const rect = node.getBoundingClientRect();
    resizeHandle.hidden = rect.bottom < 0 || rect.top > innerHeight || rect.right < 0 || rect.left > innerWidth;
    if (resizeHandle.hidden) { if (resizeStatus) resizeStatus.hidden = true; return; }
    const left = Math.max(4, Math.min(rect.right - 18, innerWidth - 40));
    const top = Math.max(4, Math.min(rect.bottom - 18, innerHeight - 40));
    Object.assign(resizeHandle.style, { left: `${left}px`, top: `${top}px` });
    if (resizeStatus && resize?.started) {
      resizeStatus.hidden = false;
      resizeStatus.textContent = tr('{width}% wide · {height}px tall', { width: resize.width, height: resize.height });
      resizeStatus.style.left = `${Math.max(4, Math.min(left - resizeStatus.offsetWidth - 8, innerWidth - resizeStatus.offsetWidth - 4))}px`;
      resizeStatus.style.top = `${Math.max(4, Math.min(top, innerHeight - resizeStatus.offsetHeight - 4))}px`;
    }
  }

  // The child only measures authored targets. The parent owns all destination policy,
  // identity validation, staleness checks and the single canonical mutation.
  const readOptions = (options, kinds = ['section', 'item', 'part', 'transfer-item']) => Array.isArray(options) ? options.slice(0, 160).filter((entry) => entry && typeof entry.label === 'string' && entry.label.length <= 500 && entry.proposal && kinds.includes(entry.proposal.kind)) : [];
  const newSession = () => {
    const bytes = crypto.getRandomValues(new Uint8Array(16)); bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
    const value = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
  };
  const releasePointer = (gesture) => {
    if (Number.isInteger(gesture.pointerId) && gesture.handle?.hasPointerCapture(gesture.pointerId)) gesture.handle.releasePointerCapture(gesture.pointerId);
  };
  const restoreResizePreview = (gesture) => {
    for (const [property, value, priority] of gesture.previousStyles) {
      if (value) gesture.node.style.setProperty(property, value, priority);
      else gesture.node.style.removeProperty(property);
    }
    if (gesture.previousResizing === null) gesture.node.removeAttribute('data-image-resizing');
    else gesture.node.setAttribute('data-image-resizing', gesture.previousResizing);
    document.body.removeAttribute('data-resizing-image');
    if (resizeStatus) resizeStatus.hidden = true;
  };
  const endResize = (reason, informParent = true) => {
    if (!resize) return;
    const previous = resize; resize = null;
    restoreResizePreview(previous); releasePointer(previous);
    if (previous.started) {
      suppressClickUntil = performance.now() + 350;
      if (informParent) send('resize-cancel', { sessionId: previous.sessionId });
      if (reason) notify(reason);
    }
    renderToolbar();
  };
  const updateResize = (event) => {
    if (!resize) return;
    const gesture = resize;
    gesture.width = Math.max(25, Math.min(100, Math.round((gesture.startWidth + event.clientX - gesture.startX) / gesture.availableWidth * 100)));
    gesture.height = Math.max(80, Math.min(1200, Math.round(gesture.startHeight + event.clientY - gesture.startY + window.scrollY - gesture.startScrollY)));
    gesture.node.style.setProperty('--image-width', `${gesture.width}%`);
    gesture.node.style.setProperty('--image-height', `${gesture.height}px`);
    gesture.node.dataset.imageResizing = 'true';
    positionResizeHandle();
  };
  const announceResize = () => {
    if (!resize || resize.started) return;
    resize.started = true;
    closeMenus();
    if (toolbar) toolbar.hidden = true;
    document.body.dataset.resizingImage = 'true';
    if (!resizeStatus) {
      resizeStatus = document.createElement('div'); resizeStatus.className = 'editor-resize-status'; resizeStatus.setAttribute('role', 'status');
      document.body.append(resizeStatus);
    }
    send('resize-start', { sessionId: resize.sessionId, pageId: resize.pageId, changeCounter: resize.changeCounter, selection: resize.selection });
  };
  const commitResize = (event) => {
    if (!resize?.started) { endResize(); return; }
    updateResize(event);
    const completed = resize; resize = null;
    restoreResizePreview(completed); releasePointer(completed);
    suppressClickUntil = performance.now() + 350;
    send('resize-end', { sessionId: completed.sessionId, pageId: completed.pageId, changeCounter: completed.changeCounter, selection: completed.selection, width: completed.width, height: completed.height, scrollY: Math.round(window.scrollY) });
    renderToolbar();
  };
  const clearFeedback = () => {
    if (scrollFrame) cancelAnimationFrame(scrollFrame);
    scrollFrame = 0;
    document.querySelectorAll('.editor-drop-line,.editor-drag-preview').forEach((node) => node.remove());
    document.querySelectorAll('.editor-compatible-target').forEach((node) => node.classList.remove('editor-compatible-target'));
    document.body.removeAttribute('data-dragging');
  };
  const createFeedback = () => {
    const line = document.createElement('div'); line.className = 'editor-drop-line'; line.hidden = true;
    const feedback = document.createElement('div'); feedback.className = 'editor-drag-preview'; feedback.setAttribute('role', 'status');
    document.body.append(line, feedback);
  };
  const pointInside = (x, y, rect, pad = 0) => x >= rect.left - pad && x <= rect.right + pad && y >= rect.top - pad && y <= rect.bottom + pad;
  const pointInCanvas = (point) => point.x >= 0 && point.y >= 0 && point.x <= innerWidth && point.y <= innerHeight;
  const paintFeedback = (point, best) => {
    document.querySelectorAll('.editor-compatible-target').forEach((node) => node.classList.remove('editor-compatible-target'));
    const indicator = document.querySelector('.editor-drop-line');
    const feedback = document.querySelector('.editor-drag-preview');
    if (!indicator || !feedback) return;
    indicator.hidden = !best;
    feedback.hidden = !pointInCanvas(point);
    if (best) {
      const line = best.geometry; line.target.classList.add('editor-compatible-target');
      indicator.dataset.axis = line.axis;
      Object.assign(indicator.style, { left: `${line.x}px`, top: `${line.y}px`, width: `${line.width}px`, height: `${line.height}px` });
    }
    feedback.textContent = best?.option.label || tr("Choose a compatible destination");
    feedback.style.left = `${Math.max(8, Math.min(point.x + 16, innerWidth - feedback.offsetWidth - 8))}px`;
    feedback.style.top = `${Math.max(8, Math.min(point.y + 20, innerHeight - feedback.offsetHeight - 8))}px`;
  };
  const endLibraryDrag = (reason, informParent = true) => {
    if (!libraryDrag) return;
    const session = libraryDrag.session; libraryDrag = null;
    clearFeedback(); renderToolbar();
    if (informParent) send('forma:library-cancel', { session, reason: reason || tr("Library move canceled.") });
  };
  const endDrag = (reason, informParent = true) => {
    if (!drag) return;
    const previous = drag; drag = null;
    clearFeedback(); releasePointer(previous);
    if (previous.started) {
      suppressClickUntil = performance.now() + 350;
      if (informParent) send('forma:drag-cancel', { session: previous.session });
      if (reason) notify(reason);
    }
    renderToolbar(); toolbar?.querySelector('.editor-drag-handle:not(:disabled),.editor-breadcrumb')?.focus({ preventScroll: true });
  };
  const announceStart = () => {
    if (!drag || drag.started) return;
    drag.started = true;
    closeMenus();
    if (toolbar) toolbar.hidden = true;
    if (resizeHandle) resizeHandle.hidden = true;
    document.body.dataset.dragging = 'true';
    send('forma:drag-start', { session: drag.session, pageId: drag.pageId, changeCounter: drag.changeCounter, selection: drag.selection, scrollY: Math.round(window.scrollY) });
  };
  const startMenuMove = (option) => {
    if (editorState.busy || drag || libraryDrag || resize || !selected) return;
    drag = { session: newSession(), pageId: editorState.pageId, changeCounter: editorState.changeCounter, selection: { ...selected }, started: false, accepted: false, menuOption: option, handle: toolbar?.querySelector('.editor-drag-handle') };
    announceStart();
  };
  const commitMove = (option) => {
    if (!drag?.accepted || !option) { endDrag(tr("Move canceled.")); return; }
    const completed = drag; drag = null;
    clearFeedback(); releasePointer(completed); suppressClickUntil = performance.now() + 350;
    send('forma:move', { session: completed.session, pageId: completed.pageId, changeCounter: completed.changeCounter, scrollY: Math.round(window.scrollY), proposal: option.proposal });
    renderToolbar();
  };
  const sameRow = (a, b) => Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > Math.min(a.height, b.height) * .35 && (a.right <= b.left + 8 || b.right <= a.left + 8);
  const horizontalLine = (rect, y) => ({ x: rect.left, y, width: rect.width, height: 3, axis: 'horizontal' });
  const verticalLine = (rect, x) => ({ x, y: rect.top, width: 3, height: rect.height, axis: 'vertical' });
  const insertionGeometry = (nodes, beforeId, identify) => {
    const targetIndex = beforeId === null ? nodes.length : nodes.findIndex((node) => identify(node) === beforeId);
    if (targetIndex < 0 || !nodes.length) return null;
    const target = nodes[targetIndex]; const previous = nodes[targetIndex - 1]; const next = nodes[targetIndex + 1];
    if (target) {
      const rect = target.getBoundingClientRect();
      const adjacent = previous || next;
      return adjacent && sameRow(rect, adjacent.getBoundingClientRect()) ? { ...verticalLine(rect, rect.left - 5), target } : { ...horizontalLine(rect, rect.top - 5), target };
    }
    const last = nodes[nodes.length - 1]; const rect = last.getBoundingClientRect(); const penultimate = nodes[nodes.length - 2];
    return penultimate && sameRow(rect, penultimate.getBoundingClientRect()) ? { ...verticalLine(rect, rect.right + 5), target: last } : { ...horizontalLine(rect, rect.bottom + 5), target: last };
  };
  const geometryFor = (option) => {
    const proposal = option.proposal;
    if (proposal.kind === 'insert-section') {
      const nodes = [...document.querySelectorAll('[data-section]')];
      const target = proposal.beforeSectionId === null ? nodes.at(-1) : sectionNode(proposal.beforeSectionId);
      if (!target) return null;
      const rect = target.getBoundingClientRect();
      return { ...horizontalLine(rect, proposal.beforeSectionId === null ? rect.bottom : rect.top), target };
    }
    const section = sectionNode(proposal.kind === 'transfer-item' ? proposal.targetSectionId : proposal.sectionId);
    if (!section) return null;
    if (proposal.kind === 'replace-section') return { ...horizontalLine(section.getBoundingClientRect(), section.getBoundingClientRect().top), target: section };
    if (proposal.kind === 'replace-icon') {
      const owner = proposal.itemId ? itemNode(section, proposal.itemId) : section;
      if (!owner) return null;
      const target = proposal.slot === 'feature-icon'
        ? partNode(owner, 'icon') || partNode(owner, 'heading') || owner
        : partNode(owner, 'buttonIcon') || owner.querySelector('.site-button');
      if (!target) return null;
      const rect = target.getBoundingClientRect();
      return { ...horizontalLine(rect, rect.top - 4), target };
    }
    if (proposal.kind === 'section') {
      const nodes = [...document.querySelectorAll('[data-section]')].filter((node) => node.dataset.section !== proposal.sectionId);
      const target = proposal.beforeSectionId === null ? nodes.at(-1) : sectionNode(proposal.beforeSectionId);
      if (!target) return null;
      const rect = target.getBoundingClientRect();
      return { ...horizontalLine(rect, proposal.beforeSectionId === null ? rect.bottom : rect.top), target };
    }
    if (proposal.kind === 'item' || proposal.kind === 'transfer-item') {
      const nodes = [...section.querySelectorAll('[data-item-id]')].filter((node) => node.closest('[data-section]') === section && (proposal.kind === 'transfer-item' || node.dataset.itemId !== proposal.itemId));
      if (!nodes.length && proposal.kind === 'transfer-item' && proposal.beforeItemId === null) {
        const target = section.querySelector('.service-grid,.process-grid') || section;
        const rect = target.getBoundingClientRect();
        return { ...horizontalLine(rect, rect.top), target };
      }
      return insertionGeometry(nodes, proposal.beforeItemId, (node) => node.dataset.itemId);
    }
    const owner = proposal.itemId ? itemNode(section, proposal.itemId) : section;
    const moving = owner && partNode(owner, proposal.partKey);
    if (!owner || !moving) return null;
    if (proposal.destinationSlot === 'hero-media') {
      const target = section.querySelector('.hero-copy');
      if (!target) return null;
      const rect = target.getBoundingClientRect(), mediaRect = moving.getBoundingClientRect();
      const before = proposal.beforePartKey === 'before';
      return { ...(sameRow(rect, mediaRect) ? verticalLine(rect, before ? rect.left - 8 : rect.right + 8) : horizontalLine(rect, before ? rect.top - 8 : rect.bottom + 8)), target };
    }
    if (proposal.destinationSlot === 'feature-icon') {
      const target = partNode(owner, 'heading') || owner; const rect = target.getBoundingClientRect();
      return { ...(proposal.beforePartKey === 'beside' ? verticalLine(rect, rect.left - 8) : horizontalLine(rect, rect.top - 8)), target };
    }
    if (proposal.destinationSlot === 'button-icon') {
      const target = moving.closest('.site-button,.text-link') || moving.parentElement; const rect = target.getBoundingClientRect();
      return { ...verticalLine(rect, proposal.beforePartKey === 'leading' ? rect.left + 6 : rect.right - 6), target };
    }
    const nodes = [...owner.querySelectorAll('[data-part-key]')].filter((node) => node.dataset.partSlot === proposal.destinationSlot && node.dataset.partKey !== proposal.partKey && (node.closest('[data-item-id]') || node.closest('[data-section]')) === owner);
    return insertionGeometry(nodes, proposal.beforePartKey, (node) => node.dataset.partKey);
  };
  const distanceToLine = (x, y, line) => Math.hypot(Math.max(line.x - x, 0, x - line.x - line.width), Math.max(line.y - y, 0, y - line.y - line.height));
  const updateDestination = () => {
    if (!drag?.accepted || drag.menuOption) return;
    const source = selectedNode(drag.selection); const owner = ownerNode(drag.selection);
    if (!source || !owner) { endDrag(tr("This content is no longer available.")); return; }
    const sourceRect = source.getBoundingClientRect(); const ownerRect = owner.getBoundingClientRect();
    const isInside = (rect, pad = 0) => pointInside(drag.x, drag.y, rect, pad);
    const insideSource = isInside(sourceRect, -Math.min(14, sourceRect.width / 4, sourceRect.height / 4));
    const candidates = drag.options.filter((option) => {
      const proposal = option.proposal;
      if (insideSource && (proposal.kind !== 'part' || proposal.partKey === 'media')) return false;
      if (proposal.kind === 'part') return isInside(ownerRect, 30);
      if (proposal.kind === 'item' || proposal.kind === 'transfer-item') {
        const destination = sectionNode(proposal.kind === 'transfer-item' ? proposal.targetSectionId : proposal.sectionId);
        return destination && isInside(destination.getBoundingClientRect(), 20);
      }
      return true;
    }).map((option) => ({ option, geometry: geometryFor(option) })).filter((entry) => entry.geometry);
    let best = null; let distance = Infinity;
    for (const candidate of candidates) {
      const next = distanceToLine(drag.x, drag.y, candidate.geometry);
      if (candidate.option.proposal.partKey === 'media' && next > 80) continue;
      if (next < distance) { best = candidate; distance = next; }
    }
    drag.destination = best?.option;
    paintFeedback(drag, best);
  };
  const updateLibraryDestination = (respond = false) => {
    if (!libraryDrag) return;
    const gesture = libraryDrag;
    let best = null; let distance = Infinity; let priority = -1;
    if (pointInCanvas(gesture)) for (const option of gesture.options) {
      const geometry = geometryFor(option);
      if (!geometry) continue;
      const kind = option.proposal.kind, rect = geometry.target.getBoundingClientRect();
      if (kind !== 'insert-section' && !pointInside(gesture.x, gesture.y, rect, kind === 'replace-icon' ? 24 : 0)) continue;
      const next = distanceToLine(gesture.x, gesture.y, geometry);
      const nestedPriority = kind === 'replace-icon' ? 2 : kind === 'replace-section' ? 1 : 0;
      if (nestedPriority > priority || (nestedPriority === priority && next < distance)) {
        best = { option, geometry }; distance = next; priority = nestedPriority;
      }
    }
    gesture.destination = best?.option || null;
    paintFeedback(gesture, best);
    if (respond && gesture.pointId >= 0) send('forma:library-target', { session: gesture.session, pointId: gesture.pointId, proposal: best?.option.proposal || null, scrollY: Math.round(window.scrollY) });
  };
  const scrollDuringDrag = () => {
    scrollFrame = 0;
    const gesture = libraryDrag || (drag?.started && !drag.menuOption ? drag : null);
    if (!gesture) return;
    const edge = Math.min(72, innerHeight / 5);
    const direction = !pointInCanvas(gesture) ? 0 : gesture.y < edge ? -(edge - gesture.y) / edge : gesture.y > innerHeight - edge ? (gesture.y - innerHeight + edge) / edge : 0;
    const previousScroll = window.scrollY;
    if (direction) window.scrollBy(0, direction * 18);
    if (libraryDrag) updateLibraryDestination(window.scrollY !== previousScroll);
    else updateDestination();
    if (libraryDrag || drag?.started) scrollFrame = requestAnimationFrame(scrollDuringDrag);
  };
  const acceptDrag = (message) => {
    if (!drag || drag.session !== message.session || !drag.started) return;
    drag.accepted = true; drag.options = readOptions(message.moveOptions || editorState.moveOptions);
    if (drag.menuOption) {
      const selectedOption = drag.options.find((entry) => JSON.stringify(entry.proposal) === JSON.stringify(drag.menuOption.proposal));
      commitMove(selectedOption); return;
    }
    createFeedback(); updateDestination(); scrollFrame = requestAnimationFrame(scrollDuringDrag);
  };
  const startLibraryDrag = (message) => {
    const options = readOptions(message.moveOptions, ['insert-section', 'replace-section', 'replace-icon']);
    if (typeof message.session !== 'string' || message.session.length > 100) return;
    if (drag || libraryDrag || resize || editorState.busy || document.body.dataset.editMode !== 'true' || message.pageId !== editorState.pageId || message.changeCounter !== editorState.changeCounter || !options.length || options.some((option) => option.proposal.pageId !== message.pageId)) {
      send('forma:library-cancel', { session: message.session, reason: tr("The preview changed or this library choice is unavailable.") }); return;
    }
    libraryDrag = { session: message.session, pageId: message.pageId, changeCounter: message.changeCounter, options, pointId: -1, x: -1, y: -1, destination: null };
    closeMenus(); if (toolbar) toolbar.hidden = true; if (resizeHandle) resizeHandle.hidden = true;
    document.body.dataset.dragging = 'true'; createFeedback(); updateLibraryDestination();
    scrollFrame = requestAnimationFrame(scrollDuringDrag);
    send('forma:library-ready', { session: message.session });
  };
  const closeMenus = () => document.querySelectorAll('.mobile-nav[open],.editor-add-menu[open],.editor-move-menu[open]').forEach((node) => node.removeAttribute('open'));
  window.addEventListener('message', (event) => {
    if (!preview || event.source !== window.parent || event.data?.channel !== channel || event.data?.source !== 'forma-editor') return;
    if (parentOrigin && event.origin !== parentOrigin) return;
    parentOrigin = event.origin;
    if (event.data.type === 'mode') { endDrag(); endLibraryDrag(); endResize(); document.body.dataset.editMode = event.data.edit === true ? 'true' : 'false'; closeMenus(); renderToolbar(); }
    if (event.data.type === 'select' && (typeof event.data.id === 'string' || event.data.id === null)) {
      if (resize) endResize(tr("Image resize canceled because the selection changed."));
      selectSection(event.data.id, event.data.scroll === true, event.data.itemIndex, event.data.itemId, event.data.partKey);
    }
    if (event.data.type === 'forma:editor-state') {
      const data = event.data;
      if (typeof data.pageId !== 'string' || !Number.isSafeInteger(data.changeCounter)) return;
      localizeEditor(data.messages, data.locale);
      if (drag && (data.busy || data.pageId !== drag.pageId || data.changeCounter !== drag.changeCounter || selectionKey(data.selection) !== selectionKey(drag.selection))) endDrag(tr("Move canceled because the page changed."));
      if (libraryDrag && (data.busy || data.pageId !== libraryDrag.pageId || data.changeCounter !== libraryDrag.changeCounter)) endLibraryDrag(tr("Library move canceled because the page changed."));
      if (resize && (data.busy || !readMedia(data.media)?.canResize || data.pageId !== resize.pageId || data.changeCounter !== resize.changeCounter || selectionKey(data.selection) !== selectionKey(resize.selection))) endResize(tr("Image resize canceled because the page changed."));
      editorState = { pageId: data.pageId, changeCounter: data.changeCounter, busy: data.busy === true, selection: data.selection, moveOptions: readOptions(data.moveOptions), media: readMedia(data.media), canDelete: data.canDelete === true, deleteReason: typeof data.deleteReason === 'string' ? data.deleteReason.slice(0, 500) : '' };
      if (data.partLabels && typeof data.partLabels === 'object' && !Array.isArray(data.partLabels)) for (const [key, label] of Object.entries(data.partLabels).slice(0, 50)) {
        if (/^[a-zA-Z][a-zA-Z0-9]{0,30}$/.test(key) && !['__proto__', 'constructor', 'prototype'].includes(key) && typeof label === 'string' && label.length <= 100) partLabels[key] = label;
      }
      selectSection(data.selection?.sectionId || null, false, null, data.selection?.itemId, data.selection?.partKey);
      if (Number.isFinite(data.scrollY) && data.scrollY >= 0 && data.scrollY <= 1000000) window.scrollTo(0, data.scrollY);
      if (typeof data.announcement === 'string' && data.announcement) notify(data.announcement.slice(0, 500));
      if (data.focus) requestAnimationFrame(() => { renderToolbar(); toolbar?.querySelector('.editor-drag-handle:not(:disabled),.editor-breadcrumb')?.focus({ preventScroll: true }); });
    }
    if (event.data.type === 'forma:drag-accepted') acceptDrag(event.data);
    if (event.data.type === 'forma:drag-cancel') {
      const session = event.data.sessionId || event.data.session;
      const reason = typeof event.data.reason === 'string' ? event.data.reason.slice(0, 200) : tr("Move canceled.");
      if (!session || drag?.session === session) endDrag(reason, false);
      if (!session || resize?.sessionId === session) endResize(reason, false);
    }
    if (event.data.type === 'forma:library-start') startLibraryDrag(event.data);
    if (event.data.type === 'forma:library-point') {
      const message = event.data;
      if (!libraryDrag || message.session !== libraryDrag.session || !Number.isSafeInteger(message.pointId) || message.pointId <= libraryDrag.pointId || !Number.isFinite(message.x) || !Number.isFinite(message.y)) return;
      libraryDrag.pointId = message.pointId; libraryDrag.x = message.x; libraryDrag.y = message.y;
      updateLibraryDestination(true);
    }
    if (['forma:library-end', 'forma:library-cancel'].includes(event.data.type) && libraryDrag?.session === event.data.session) endLibraryDrag(null, false);
  });
  document.addEventListener('pointerdown', (event) => {
    if (!preview || document.body.dataset.editMode !== 'true' || editorState.busy || event.button !== 0 || !event.isPrimary || !(event.target instanceof Element)) return;
    if (event.target.closest('.editor-resize-handle')) {
      const media = activeMedia(), node = selectedNode(selected);
      if (!media?.canResize || !node || drag || libraryDrag || resize) return;
      const rect = node.getBoundingClientRect();
      const availableWidth = rect.width / (media.width / 100);
      if (!Number.isFinite(availableWidth) || availableWidth <= 0 || !Number.isFinite(rect.height) || rect.height <= 0) return;
      event.preventDefault();
      resize = {
        sessionId: newSession(), selection: { ...selected }, pageId: editorState.pageId, changeCounter: editorState.changeCounter,
        pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, startScrollY: window.scrollY,
        startWidth: rect.width, startHeight: rect.height, availableWidth, width: media.width, height: media.height,
        node, handle: resizeHandle, started: false, previousResizing: node.getAttribute('data-image-resizing'),
        previousStyles: ['--image-width', '--image-height'].map((property) => [property, node.style.getPropertyValue(property), node.style.getPropertyPriority(property)]),
      };
      resizeHandle.setPointerCapture(event.pointerId); return;
    }
    const handle = event.target.closest('.editor-drag-handle');
    if (!handle || handle.disabled || !selected || drag || libraryDrag || resize) return;
    event.preventDefault();
    drag = { session: newSession(), selection: { ...selected }, pageId: editorState.pageId, changeCounter: editorState.changeCounter, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, handle, started: false, accepted: false };
    handle.setPointerCapture(event.pointerId);
  });
  document.addEventListener('pointermove', (event) => {
    if (resize?.pointerId === event.pointerId) {
      if (event.clientX < 0 || event.clientY < 0 || event.clientX > innerWidth || event.clientY > innerHeight) { endResize(tr("Image resize canceled outside the canvas.")); return; }
      if (!resize.started && Math.hypot(event.clientX - resize.startX, event.clientY - resize.startY) >= (event.pointerType === 'touch' ? 10 : 6)) announceResize();
      if (resize?.started) { event.preventDefault(); updateResize(event); }
      return;
    }
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag.x = event.clientX; drag.y = event.clientY;
    if (drag.x < 0 || drag.y < 0 || drag.x > innerWidth || drag.y > innerHeight) { endDrag(tr("Move canceled outside the canvas.")); return; }
    if (!drag.started && Math.hypot(drag.x - drag.startX, drag.y - drag.startY) >= (event.pointerType === 'touch' ? 10 : 6)) announceStart();
    if (drag?.started) { event.preventDefault(); updateDestination(); }
  });
  document.addEventListener('pointerup', (event) => {
    if (resize?.pointerId === event.pointerId) {
      if (resize.started) event.preventDefault();
      commitResize(event); return;
    }
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!drag.started) { endDrag(); return; }
    event.preventDefault(); updateDestination(); if (drag) commitMove(drag.destination);
  });
  document.addEventListener('pointercancel', (event) => { if (drag?.pointerId === event.pointerId) endDrag(tr("Move canceled.")); if (resize?.pointerId === event.pointerId) endResize(tr("Image resize canceled.")); });
  document.addEventListener('lostpointercapture', (event) => { if (drag?.pointerId === event.pointerId) endDrag(tr("Move canceled.")); if (resize?.pointerId === event.pointerId) endResize(tr("Image resize canceled.")); });
  window.addEventListener('blur', () => { endDrag(tr("Move canceled.")); endResize(tr("Image resize canceled.")); });
  window.addEventListener('resize', () => { endDrag(tr("Move canceled after resizing the preview.")); endLibraryDrag(tr("Library move canceled after resizing the preview.")); endResize(tr("Image resize canceled after resizing the preview.")); positionToolbar(); });
  window.addEventListener('scroll', () => { if (libraryDrag) updateLibraryDestination(true); else if (drag?.accepted) updateDestination(); else positionToolbar(); }, { passive: true });
  document.addEventListener('click', (event) => {
    // Run before button handlers, including breadcrumbs revealed after a drop.
    if (performance.now() < suppressClickUntil) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest('.editor-selection-tools,.editor-resize-handle,.editor-resize-status')) return;
    const editing = preview && document.body.dataset.editMode === 'true';
    const addButton = event.target.closest('button[data-add-section],button[data-add-page]');
    if (editing && addButton && !addButton.disabled) {
      event.preventDefault(); closeMenus();
      if (addButton.dataset.addSection) send('add-section', { group: addButton.dataset.addSection });
      else if (addButton.dataset.addPage) send('add-page', { template: addButton.dataset.addPage });
      return;
    }
    // Navigation and editor menus remain usable while section inspection is on.
    if (event.target.closest('.mobile-nav>summary,.editor-add-menu>summary')) return;
    if (!event.target.closest('.mobile-nav,.editor-add-menu')) closeMenus();
    const section = event.target.closest('[data-section]');
    const item = event.target.closest('[data-item-id]');
    const anchor = event.target.closest('a[href]');
    const isNavigation = anchor && Boolean(anchor.closest('header,footer,.mobile-nav'));
    if (editing && section && !isNavigation && !event.target.closest('input,textarea,select,form label,form button')) {
      const part = event.target.closest('[data-part-key]');
      event.preventDefault();
      const owner = part ? partOwner(part) : item?.closest('[data-section]') === section ? item : section;
      if (!owner) return;
      requestSelection({ sectionId: section.dataset.section, ...(owner.dataset.itemId ? { itemId: owner.dataset.itemId } : {}), ...(part ? { partKey: part.dataset.partKey } : {}) }, part);
      return;
    }
    if (anchor) {
      const href = anchor.getAttribute('href') || '';
      if (preview && anchor.dataset.pageId) {
        event.preventDefault(); closeMenus();
        if (href.startsWith('#')) selectSection(href.slice(1), true);
        send('navigate-page', { pageId: anchor.dataset.pageId, ...(anchor.dataset.targetSection ? { sectionId: anchor.dataset.targetSection } : {}) });
        return;
      }
      if (href.startsWith('#')) {
        const target = document.getElementById(href.slice(1));
        if (target) {
          event.preventDefault(); scrollToTarget(target); closeMenus();
          if (preview && target.dataset.section) { selectSection(target.dataset.section); send('select', { id: target.dataset.section }); }
          return;
        }
      }
      if (preview && !href.startsWith('#')) {
        event.preventDefault(); notify(tr("External links are disabled in the editor preview. They work in your exported site.")); return;
      }
    }
    if (editing && section) {
      requestSelection({ sectionId: section.dataset.section });
    }
  });
  document.addEventListener('keydown', (event) => {
    if (['Delete', 'Backspace'].includes(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey && !event.repeat && preview && document.body.dataset.editMode === 'true' && !editorState.busy && !document.querySelector('dialog[open]') && !(event.target instanceof Element && event.target.closest('input,textarea,select,form,[contenteditable]:not([contenteditable="false"]),[role="textbox"],dialog'))) {
      if (selected && editorState.canDelete) { event.preventDefault(); requestDelete(); }
      return;
    }
    if (event.key !== 'Escape') return;
    if (resize) { event.preventDefault(); endResize(tr("Image resize canceled.")); resizeHandle?.focus({ preventScroll: true }); return; }
    if (libraryDrag) { event.preventDefault(); endLibraryDrag(); return; }
    if (drag) { event.preventDefault(); endDrag(tr("Move canceled.")); return; }
    const moveMenu = document.querySelector('.editor-move-menu[open]');
    if (moveMenu) { moveMenu.open = false; moveMenu.querySelector('summary')?.focus(); return; }
    const openMenu = document.querySelector('.editor-add-menu[open],.mobile-nav[open]');
    if (openMenu) { openMenu.querySelector('summary')?.focus(); closeMenus(); }
  });
  document.querySelectorAll('[data-contact-email]').forEach((form) => {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const email = form.dataset.contactEmail;
      if (!email) return;
      if (preview) { notify(tr("Preview only. The exported form prepares an email in the visitor’s mail app.")); return; }
      if (!form.reportValidity()) return;
      const fields = new FormData(form);
      const name = String(fields.get('name') || '');
      const reply = String(fields.get('email') || '');
      const message = String(fields.get('message') || '');
      const href = `mailto:${email}?subject=${encodeURIComponent(`Website enquiry from ${name}`)}&body=${encodeURIComponent(`Name: ${name}\nReply email: ${reply}\n\n${message}`)}`;
      const feedback = form.querySelector('.form-feedback');
      if (feedback) {
        feedback.replaceChildren(document.createTextNode('Your email draft is ready. '));
        const anchor = document.createElement('a'); anchor.href = href; anchor.textContent = 'Open your email app'; feedback.append(anchor);
      }
      window.location.href = href;
    });
  });
  send('ready');
})();
