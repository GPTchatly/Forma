import { libraryOptions } from '/shared/structure.mjs';
import { t } from '/i18n.mjs';

function readEntry(handle) {
  const encoded = handle.dataset.libraryEntry;
  if (typeof encoded !== 'string' || encoded.length > 400) return null;
  try {
    const entry = JSON.parse(encoded);
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    const keys = entry.kind === 'section' ? ['kind', 'blockId'] : entry.kind === 'icon' ? ['kind', 'icon', 'slot'] : [];
    if (!keys.length || Object.keys(entry).some((key) => !keys.includes(key)) || keys.some((key) => typeof entry[key] !== 'string' || entry[key].length > 100)) return null;
    return entry;
  } catch { return null; }
}

function inside(rect, x, y) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function matchesProposal(value, proposal) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length === Object.keys(proposal).length && keys.every((key) => Object.hasOwn(proposal, key) && value[key] === proposal[key]);
}

/** The parent owns capture and frame scaling; the child resolves semantic targets. */
export function installLibraryDrag({ getContext, begin, cancel, move, send }) {
  let gesture = null;
  let frame = 0;
  let suppressClickUntil = 0;
  const overlay = document.createElement('div');
  overlay.className = 'library-drag-overlay';
  overlay.hidden = true;
  overlay.setAttribute('aria-hidden', 'true');
  const feedback = document.createElement('div');
  feedback.className = 'library-drag-feedback';
  feedback.hidden = true;
  feedback.setAttribute('role', 'status');
  feedback.setAttribute('aria-live', 'polite');
  document.body.append(overlay, feedback);

  function finish(notify = true) {
    const previous = gesture;
    gesture = null;
    cancelAnimationFrame(frame);
    frame = 0;
    overlay.hidden = true;
    feedback.hidden = true;
    feedback.textContent = '';
    document.body.classList.remove('library-dragging');
    previous?.handle.classList.remove('library-picked-up');
    if (previous?.handle.hasPointerCapture?.(previous.pointerId)) previous.handle.releasePointerCapture(previous.pointerId);
    if (!previous?.active) return;
    suppressClickUntil = performance.now() + 600;
    send('forma:library-end', { session: previous.session });
    if (notify) cancel();
  }

  function stale(context) {
    return !gesture || context.busy || !context.inspect || !context.ready || context.pageId !== gesture.pageId || context.changeCounter !== gesture.changeCounter || context.channel !== gesture.channel || !gesture.handle.isConnected;
  }

  function feedbackText(text) {
    if (feedback.textContent !== text) feedback.textContent = text;
  }

  function framePoint(context) {
    const rect = context.frame.getBoundingClientRect();
    if (!inside(rect, gesture.x, gesture.y)) return { x: -1, y: -1 };
    // The iframe's CSS pixels differ from the scaled parent viewport pixels.
    return { x: (gesture.x - rect.left) * context.frame.clientWidth / rect.width, y: (gesture.y - rect.top) * context.frame.clientHeight / rect.height };
  }

  function sendPoint(context, final = false) {
    if (!gesture?.ready) return;
    const point = framePoint(context);
    if (!final && gesture.lastPoint?.x === point.x && gesture.lastPoint?.y === point.y) return;
    gesture.lastPoint = point;
    const pointId = ++gesture.lastSent;
    if (final) { gesture.finalPointId = pointId; gesture.deadline = performance.now() + 1800; }
    send('forma:library-point', { session: gesture.session, pointId, ...point });
  }

  function update() {
    frame = 0;
    if (!gesture?.active) return;
    const context = getContext();
    if (stale(context) || !context.frame?.isConnected) { finish(); return; }
    const rect = context.frame.getBoundingClientRect();
    if (!rect.width || !rect.height || Math.abs(rect.width - gesture.frameWidth) > 0.5 || Math.abs(rect.height - gesture.frameHeight) > 0.5 || performance.now() > gesture.deadline) { finish(); return; }
    overlay.style.left = `${rect.left}px`; overlay.style.top = `${rect.top}px`;
    overlay.style.width = `${rect.width}px`; overlay.style.height = `${rect.height}px`;
    // Inside the frame the child draws the outcome in its own scaled coordinates.
    feedback.hidden = gesture.ready && inside(rect, gesture.x, gesture.y) && !gesture.dropped;
    feedback.style.left = `${Math.max(8, Math.min(window.innerWidth - feedback.offsetWidth - 8, gesture.x + 18))}px`;
    feedback.style.top = `${Math.max(8, Math.min(window.innerHeight - feedback.offsetHeight - 8, gesture.y + 20))}px`;
    if (!gesture.dropped) {
      // An established session has no idle timeout while the pointer is held.
      if (gesture.ready) gesture.deadline = Infinity;
      if (!inside(rect, gesture.x, gesture.y)) feedbackText(t('Drag onto a compatible canvas location'));
      sendPoint(context);
    }
    frame = requestAnimationFrame(update);
  }

  function onPointerDown(event) {
    const handle = event.target.closest?.('button[data-library-entry]');
    if (!handle || handle.disabled || event.button !== 0 || !event.isPrimary) return;
    const context = getContext();
    if (context.busy || !context.inspect || !context.ready || !context.channel) return;
    const entry = readEntry(handle);
    if (!entry) return;
    const choices = libraryOptions(context.page, entry, context.pageId, t);
    if (!choices.length) return;
    finish();
    gesture = { handle, entry, choices, pageId: context.pageId, changeCounter: context.changeCounter, channel: context.channel, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, session: crypto.randomUUID(), active: false, ready: false, dropped: false, lastSent: 0, finalPointId: null, lastPoint: null, choice: null };
    handle.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event) {
    if (!gesture || event.pointerId !== gesture.pointerId || gesture.dropped) return;
    gesture.x = event.clientX; gesture.y = event.clientY;
    if (!gesture.active) {
      if (Math.hypot(gesture.x - gesture.startX, gesture.y - gesture.startY) < 6) return;
      const context = getContext();
      if (stale(context) || !context.frame?.isConnected) { finish(); return; }
      const rect = context.frame.getBoundingClientRect();
      if (!rect.width || !rect.height || begin(gesture.entry, gesture.session, gesture.choices) === false) { finish(); return; }
      gesture.active = true; gesture.frameWidth = rect.width; gesture.frameHeight = rect.height;
      gesture.deadline = performance.now() + 1800;
      gesture.handle.classList.add('library-picked-up');
      document.body.classList.add('library-dragging');
      overlay.hidden = false; feedback.hidden = false;
      feedbackText(t('Drag onto a compatible canvas location'));
      send('forma:library-start', { session: gesture.session, pageId: gesture.pageId, changeCounter: gesture.changeCounter, moveOptions: gesture.choices });
    }
    event.preventDefault();
    if (!frame) frame = requestAnimationFrame(update);
  }

  function onPointerUp(event) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    if (!gesture.active) { finish(false); return; }
    gesture.x = event.clientX; gesture.y = event.clientY;
    const context = getContext();
    if (stale(context) || !inside(context.frame.getBoundingClientRect(), gesture.x, gesture.y)) { finish(); return; }
    gesture.dropped = true;
    gesture.deadline = performance.now() + 1800;
    feedbackText(t('Confirming this location…'));
    // A fresh final point prevents committing an earlier in-flight target reply.
    if (gesture.ready) sendPoint(context, true);
    event.preventDefault(); event.stopPropagation();
    suppressClickUntil = performance.now() + 600;
    if (gesture.handle.hasPointerCapture(event.pointerId)) gesture.handle.releasePointerCapture(event.pointerId);
  }

  function receive(message) {
    if (!gesture?.active || !message || typeof message !== 'object' || message.session !== gesture.session) return false;
    const context = getContext();
    if (stale(context)) { finish(); return true; }
    if (message.type === 'forma:library-cancel') { finish(); return true; }
    if (message.type === 'forma:library-ready') {
      if (gesture.ready) return true;
      gesture.ready = true;
      sendPoint(context, gesture.dropped);
      return true;
    }
    if (message.type !== 'forma:library-target') return false;
    if (!gesture.ready || !Number.isSafeInteger(message.pointId) || message.pointId !== gesture.lastSent) return true;
    const choice = gesture.choices.find((entry) => matchesProposal(message.proposal, entry.proposal)) || null;
    gesture.choice = choice;
    feedbackText(choice?.label || t('No compatible canvas location here'));
    if (gesture.dropped && message.pointId === gesture.finalPointId) {
      const scrollY = Number.isFinite(message.scrollY) && message.scrollY >= 0 && message.scrollY <= 1000000 ? message.scrollY : undefined;
      finish(!choice);
      if (choice && move(choice.proposal, choice.label, { scrollY }) === false) cancel();
    }
    return true;
  }

  function onPointerCancel(event) { if (gesture?.pointerId === event.pointerId) finish(); }
  function onLostCapture(event) { if (gesture?.pointerId === event.pointerId && !gesture.dropped) finish(); }
  function onKeyDown(event) {
    if (gesture && event.key === 'Escape') { finish(); event.preventDefault(); event.stopPropagation(); }
  }
  function onClick(event) {
    if (event.detail !== 0 && performance.now() < suppressClickUntil) { suppressClickUntil = 0; event.preventDefault(); event.stopImmediatePropagation(); return; }
    const handle = event.target.closest?.('button[data-library-entry]');
    if (handle) { event.preventDefault(); event.stopImmediatePropagation(); }
  }
  function onWindowLeave(event) { if (!event.relatedTarget && gesture && !gesture.dropped) finish(); }
  const listeners = [
    [document, 'pointerdown', onPointerDown, true], [document, 'pointermove', onPointerMove, { capture: true, passive: false }],
    [document, 'pointerup', onPointerUp, true], [document, 'pointercancel', onPointerCancel, true],
    [document, 'lostpointercapture', onLostCapture, true], [document, 'keydown', onKeyDown, true],
    [document, 'click', onClick, true], [document, 'pointerout', onWindowLeave, true],
    [window, 'blur', finish, false], [window, 'resize', finish, false]
  ];
  listeners.forEach(([target, type, listener, options]) => target.addEventListener(type, listener, options));
  return {
    receive,
    cancel: () => finish(),
    destroy() {
      finish(); listeners.forEach(([target, type, listener, options]) => target.removeEventListener(type, listener, options));
      overlay.remove(); feedback.remove();
    }
  };
}
