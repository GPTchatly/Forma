import { escapeHtml as escape } from '/shared/schema.mjs';
import { GROUP_LABELS } from '/shared/catalog.mjs';
import { moveOptions } from '/shared/structure.mjs';
import { PART_LABELS } from '/shared/parts.mjs';
import { t } from '/i18n.mjs';

function selectionAttributes(selection) {
  return `data-section-id="${escape(selection.sectionId)}"${selection.itemId ? ` data-item-id="${escape(selection.itemId)}"` : ''}${selection.partKey ? ` data-part-key="${escape(selection.partKey)}"` : ''}`;
}

function selectionName(page, selection) {
  const section = page.sections.find((entry) => entry.id === selection.sectionId);
  if (!section) return t('selection');
  if (selection.partKey) return t(PART_LABELS[selection.partKey] || 'selection');
  if (selection.itemId) {
    const index = section.items.findIndex((item) => item.id === selection.itemId);
    return index < 0 ? t('item') : t('{group} item {number}', { group: t(GROUP_LABELS[section.group]), number: index + 1 });
  }
  return t(GROUP_LABELS[section.group]);
}

/** Render only choices approved by the shared structural operation layer. */
export function renderMoveControls(page, selection, { compact = false } = {}) {
  const choices = moveOptions(page, selection, t);
  const section = page.sections.find((entry) => entry.id === selection.sectionId);
  const name = selectionName(page, selection);
  const reason = section?.locked ? t('Unlock this section to move its structure. Text and settings remain editable.') : t('This selection has no other compatible positions.');
  const attributes = selectionAttributes(selection);
  const deleteButton = compact || !section ? '' : `<button type="button" class="structure-delete delete-content-button" data-delete-selection="${escape(JSON.stringify(selection))}" title="${escape(section.locked ? t('Unlock this section before deleting its content.') : t('Delete {name}', { name }))}" aria-label="${escape(t('Delete {name}', { name }))}"${section.locked ? ' disabled' : ''}>${escape(t('Delete'))}</button>`;
  return `<div class="structure-controls${compact ? ' compact' : ''}" ${attributes}><button type="button" class="structure-grip" data-structure-handle ${attributes} data-structure-focus="${escape(JSON.stringify(selection))}" title="${escape(choices.length ? t('Drag {name} to move; click to select', { name }) : reason)}" aria-label="${escape(t('Drag {name}, or use the Move menu', { name }))}"${choices.length ? '' : ' disabled'}><svg width="12" height="16" viewBox="0 0 12 16" aria-hidden="true"><g fill="currentColor"><circle cx="3" cy="3" r="1.4"/><circle cx="9" cy="3" r="1.4"/><circle cx="3" cy="8" r="1.4"/><circle cx="9" cy="8" r="1.4"/><circle cx="3" cy="13" r="1.4"/><circle cx="9" cy="13" r="1.4"/></g></svg></button>${choices.length ? `<details class="structure-menu"><summary aria-label="${escape(t('Move {name}', { name }))}">${escape(t('Move…'))}</summary><div class="structure-menu-options" role="group" aria-label="${escape(t('Destinations for {name}', { name }))}">${choices.map(({ label, proposal }) => `<button type="button" data-structure-proposal="${escape(JSON.stringify(proposal))}">${escape(label)}</button>`).join('')}</div></details>` : `<span class="structure-fixed" title="${escape(reason)}">${escape(section?.locked ? t('Locked') : t('Fixed'))}</span>`}${deleteButton}</div>`;
}

function readSelection(handle, pageId) {
  return { pageId, sectionId: handle.dataset.sectionId, ...(handle.dataset.itemId ? { itemId: handle.dataset.itemId } : {}), ...(handle.dataset.partKey ? { partKey: handle.dataset.partKey } : {}) };
}

function containsPoint(rect, x, y) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

/** Pointer mechanics own temporary feedback only; the caller owns commits and selection. */
export function installStructureControls({ getContext, select, move, begin, cancel }) {
  let gesture = null;
  let frame = 0;
  let suppressClickUntil = 0;
  const indicator = document.createElement('div');
  indicator.className = 'structure-insertion';
  indicator.hidden = true;
  indicator.setAttribute('aria-hidden', 'true');
  const preview = document.createElement('div');
  preview.className = 'structure-drag-preview';
  preview.hidden = true;
  preview.setAttribute('role', 'status');
  preview.setAttribute('aria-live', 'polite');
  document.body.append(indicator, preview);

  function finish(notify = true) {
    const previous = gesture;
    gesture = null;
    cancelAnimationFrame(frame);
    frame = 0;
    indicator.hidden = true;
    preview.hidden = true;
    preview.textContent = '';
    document.body.classList.remove('structure-moving');
    previous?.handle.classList.remove('structure-picked-up');
    previous?.target?.classList.remove('structure-destination');
    if (previous?.openedMenu) previous.openedMenu.open = false;
    if (previous?.handle.hasPointerCapture?.(previous.pointerId)) previous.handle.releasePointerCapture(previous.pointerId);
    if (previous?.active) {
      suppressClickUntil = performance.now() + 600;
      if (notify) cancel();
    }
  }

  function stale(context) {
    return !gesture || context.busy || !context.inspect || context.pageId !== gesture.pageId || context.changeCounter !== gesture.changeCounter || !gesture.handle.isConnected;
  }

  function matchingChoice(choices, beforeId, sectionId = gesture.selection.sectionId) {
    return choices.find(({ proposal }) => {
      if (!gesture.selection.itemId) return proposal.kind === 'section' && proposal.beforeSectionId === beforeId;
      if (sectionId === gesture.selection.sectionId) return proposal.kind === 'item' && proposal.beforeItemId === beforeId;
      return proposal.kind === 'transfer-item' && proposal.targetSectionId === sectionId && proposal.beforeItemId === beforeId;
    });
  }

  function destination(context) {
    const choices = moveOptions(context.page, gesture.selection, t);
    if (gesture.menuTargets) {
      const options = [...gesture.controls.querySelectorAll('[data-structure-proposal]')];
      const target = options.find((element) => containsPoint(element.getBoundingClientRect(), gesture.x, gesture.y));
      if (!target) return null;
      const choice = choices.find(({ proposal }) => JSON.stringify(proposal) === target.dataset.structureProposal);
      return choice ? { ...choice, target, rect: target.getBoundingClientRect(), part: true } : null;
    }
    const isItem = !!gesture.selection.itemId;
    const nodes = [...gesture.surface.querySelectorAll(isItem ? '[data-editor-item-id]' : '[data-outline-section]')];
    const entries = nodes.map((element) => ({ element, id: isItem ? element.dataset.editorItemId : element.dataset.outlineSection, sectionId: element.dataset.sectionId || element.closest('[data-outline-section]')?.dataset.outlineSection || gesture.selection.sectionId, rect: element.getBoundingClientRect() }))
      .filter(({ id, sectionId, rect }) => !(isItem ? id === gesture.selection.itemId && sectionId === gesture.selection.sectionId : id === gesture.selection.sectionId) && rect.width && rect.height);
    // Use each rendered rectangle, including unequal-height or wrapped cards.
    // Distance to an insertion edge works without assuming uniform grid cells.
    let edges = entries.map((entry) => ({ ...entry, beforeId: entry.id, y: entry.rect.top }));
    if (isItem) {
      // Item IDs are local to a section, so every candidate carries its owner.
      const sectionIds = new Set(entries.map((entry) => entry.sectionId));
      for (const sectionId of sectionIds) {
        const last = entries.filter((entry) => entry.sectionId === sectionId).at(-1);
        edges.push({ ...last, beforeId: null, y: last.rect.bottom });
      }
      const sections = [...gesture.surface.querySelectorAll('[data-outline-section]')].map((element) => ({ element, sectionId: element.dataset.outlineSection, rect: element.getBoundingClientRect() }));
      for (const section of sections) {
        // Empty and collapsed outlines offer an explicit append destination.
        if (!sectionIds.has(section.sectionId)) edges.push({ ...section, beforeId: null, y: section.rect.bottom });
      }
      const owner = sections.find(({ rect }) => containsPoint(rect, gesture.x, gesture.y));
      if (owner) edges = edges.filter((edge) => edge.sectionId === owner.sectionId);
    } else if (entries.length) {
      const last = entries.at(-1);
      edges.push({ ...last, beforeId: null, y: last.rect.bottom });
    }
    if (!edges.length) return null;
    let best = null;
    let distance = Infinity;
    for (const edge of edges) {
      const dx = Math.max(edge.rect.left - gesture.x, 0, gesture.x - edge.rect.right);
      const dy = Math.abs(gesture.y - edge.y);
      const candidateDistance = dx * dx + dy * dy;
      if (candidateDistance < distance) { best = edge; distance = candidateDistance; }
    }
    const choice = matchingChoice(choices, best.beforeId, best.sectionId);
    return choice ? { ...choice, target: best.element, rect: best.rect, y: best.y } : null;
  }

  function update() {
    frame = 0;
    if (!gesture?.active) return;
    const context = getContext();
    const surfaceRect = gesture.surface.getBoundingClientRect();
    if (stale(context) || !containsPoint(surfaceRect, gesture.x, gesture.y)) { finish(); return; }
    const edge = Math.min(48, surfaceRect.height / 4);
    const scrollDelta = gesture.y < surfaceRect.top + edge ? -Math.ceil((surfaceRect.top + edge - gesture.y) / 4) : gesture.y > surfaceRect.bottom - edge ? Math.ceil((gesture.y - surfaceRect.bottom + edge) / 4) : 0;
    if (scrollDelta) gesture.surface.scrollTop += scrollDelta;
    const next = destination(context);
    gesture.target?.classList.remove('structure-destination');
    gesture.target = next?.target || null;
    gesture.choice = next;
    if (next?.part) next.target.classList.add('structure-destination');
    indicator.hidden = !next || !!next.part;
    if (next && !next.part) {
      const left = Math.max(next.rect.left, surfaceRect.left + 3);
      const right = Math.min(next.rect.right, surfaceRect.right - 3);
      indicator.style.left = `${left}px`;
      indicator.style.width = `${Math.max(0, right - left)}px`;
      indicator.style.top = `${Math.max(surfaceRect.top + 2, Math.min(surfaceRect.bottom - 2, next.y))}px`;
    }
    const label = next?.label || (gesture.menuTargets ? t('Choose a compatible location in the Move menu') : t('This position is unchanged, fixed or locked'));
    if (preview.textContent !== label) preview.textContent = label;
    preview.style.left = `${Math.max(8, Math.min(window.innerWidth - preview.offsetWidth - 8, gesture.x + 16))}px`;
    preview.style.top = `${Math.max(8, Math.min(window.innerHeight - preview.offsetHeight - 8, gesture.y + 18))}px`;
    frame = requestAnimationFrame(update);
  }

  function onPointerDown(event) {
    const handle = event.target.closest?.('[data-structure-handle]');
    if (!handle || handle.disabled || event.button !== 0 || !event.isPrimary) return;
    const context = getContext();
    if (context.busy || !context.inspect) return;
    finish();
    const selection = readSelection(handle, context.pageId);
    if (!moveOptions(context.page, selection).length) return;
    const surface = handle.closest('.inspector-scroll') || handle.closest('#inspector-content');
    if (!surface) return;
    gesture = { handle, controls: handle.closest('.structure-controls'), surface, selection, pageId: context.pageId, changeCounter: context.changeCounter, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, active: false, choice: null, target: null };
    handle.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    gesture.x = event.clientX;
    gesture.y = event.clientY;
    if (!gesture.active) {
      if (Math.hypot(gesture.x - gesture.startX, gesture.y - gesture.startY) < 6) return;
      if (stale(getContext()) || begin(gesture.selection) === false) { finish(); return; }
      gesture.active = true;
      gesture.handle.classList.add('structure-picked-up');
      document.body.classList.add('structure-moving');
      gesture.menuTargets = !!gesture.selection.partKey || !gesture.surface.querySelector(gesture.selection.itemId ? '[data-editor-item-id]' : '[data-outline-section]');
      if (gesture.menuTargets) {
        const menu = gesture.controls.querySelector('.structure-menu');
        if (menu && !menu.open) { menu.open = true; gesture.openedMenu = menu; }
      }
      preview.hidden = false;
      preview.textContent = t('Moving {name}', { name: selectionName(getContext().page, gesture.selection) });
    }
    event.preventDefault();
    if (!frame) frame = requestAnimationFrame(update);
  }

  function onPointerUp(event) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    if (!gesture.active) { finish(false); return; }
    gesture.x = event.clientX;
    gesture.y = event.clientY;
    const context = getContext();
    const choice = !stale(context) && containsPoint(gesture.surface.getBoundingClientRect(), gesture.x, gesture.y) ? destination(context) : null;
    // Release capture and temporary state before the canonical commit replaces DOM.
    finish(!choice);
    if (choice) move(choice.proposal, choice.label);
    event.preventDefault();
    event.stopPropagation();
  }

  function onPointerCancel(event) { if (gesture?.pointerId === event.pointerId) finish(); }
  function onKeyDown(event) {
    if (event.key === 'Escape' && gesture) { finish(); event.preventDefault(); event.stopPropagation(); }
  }
  function onClick(event) {
    if (performance.now() < suppressClickUntil && event.detail !== 0) { suppressClickUntil = 0; event.preventDefault(); event.stopImmediatePropagation(); return; }
    const handle = event.target.closest?.('[data-structure-handle]');
    if (!handle || handle.disabled) return;
    const context = getContext();
    if (!context.busy && context.inspect) select(readSelection(handle, context.pageId));
    event.preventDefault();
    event.stopImmediatePropagation();
  }
  function onWindowLeave(event) { if (!event.relatedTarget) finish(); }
  const listeners = [
    [document, 'pointerdown', onPointerDown, true], [document, 'pointermove', onPointerMove, { capture: true, passive: false }],
    [document, 'pointerup', onPointerUp, true], [document, 'pointercancel', onPointerCancel, true],
    [document, 'lostpointercapture', onPointerCancel, true], [document, 'keydown', onKeyDown, true],
    [document, 'click', onClick, true], [document, 'pointerout', onWindowLeave, true],
    [window, 'blur', finish, false], [window, 'resize', finish, false]
  ];
  listeners.forEach(([target, type, listener, options]) => target.addEventListener(type, listener, options));
  return {
    cancel: () => finish(),
    destroy() {
      finish();
      listeners.forEach(([target, type, listener, options]) => target.removeEventListener(type, listener, options));
      indicator.remove(); preview.remove();
    }
  };
}
