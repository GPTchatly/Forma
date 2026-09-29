import { z } from 'zod';
import { validateCompose } from '../shared/schema.mjs';
import { validateTransportImages } from '../shared/compose-transport.mjs';
import { PRESENTATION } from '../shared/design.mjs';
import { ELEMENT_CONTROLS } from '../shared/elements.mjs';
import { INTERFACE_CONTROLS } from '../shared/interfaces.mjs';
import { PART_LABELS } from '../shared/parts.mjs';
import { HostedError } from './security.mjs';

export const BODY_LIMITS = Object.freeze({ connection: 2048, compose: 2_000_000, empty: 256 });
const identifier = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/);
const bounded = (max) => z.string().max(max).optional();
const controls = (choices) => z.object(Object.fromEntries(Object.keys(choices).map((key) => [key, bounded(80)]))).strict().optional();
const imageSize = z.object({ width: z.number().int().optional(), height: z.number().int().nullable().optional(), fit: bounded(16) }).strict().optional();
const removedParts = z.array(z.enum(Object.keys(PART_LABELS))).max(Object.keys(PART_LABELS).length).optional();
const image = bounded(1024);
const itemSchema = z.object({
  id: identifier.optional(), removedParts, title: bounded(180), body: bounded(1800), meta: bounded(120), price: bounded(80), image, alt: bounded(250), imageSize,
  href: bounded(2048), icon: bounded(80), buttonIcon: bounded(80), uiType: bounded(80), art: z.number().int().min(0).max(7).optional(),
  placements: z.object({ iconPlacement: bounded(80), textOrder: bounded(80), buttonIconPlacement: bounded(80) }).strict().optional()
}).strict();
const sectionSchema = z.object({
  id: identifier, block: z.string().max(80), group: bounded(80), removedParts, eyebrow: bounded(120), title: bounded(300), body: bounded(3000), button: bounded(100), href: bounded(2048), image, alt: bounded(250), imageSize,
  items: z.array(itemSchema).max(8), locked: z.boolean().optional(), draft: z.boolean().optional(), presentation: controls(PRESENTATION), elements: controls(ELEMENT_CONTROLS), interface: controls(INTERFACE_CONTROLS), featuredItemId: identifier.nullable().optional()
}).strict();
const themeSchema = z.object({ palette: z.string().max(80), font: z.string().max(80), density: z.string().max(80), radius: z.string().max(80), motion: z.string().max(80), typeScale: bounded(80), width: bounded(80) }).strict();
const pageShape = { family: z.string().max(80), brief: bounded(5000), theme: themeSchema, sections: z.array(sectionSchema).max(12) };
const specSchema = z.object({
  schemaVersion: z.literal(1), name: bounded(100), ...pageShape,
  brand: z.object({ name: bounded(100), tagline: bounded(250), email: bounded(254), cta: bounded(100), href: bounded(2048), language: bounded(20) }).strict(),
  pages: z.array(z.object({ id: identifier, slug: z.string().max(60), title: z.string().max(80), showInNav: z.boolean().optional(), ...pageShape }).strict()).max(7).optional()
}).strict();
const apiKey = z.string().min(1).max(512).regex(/^[\x21-\x7e]+$/);
const provider = z.enum(['auto', 'typesafe', 'openrouter']).default('auto');
const connectionSchema = z.object({ apiKey, provider }).strict();
const composeSchema = z.object({
  apiKey: apiKey.optional(), provider, mode: z.literal('jev'), operation: z.enum(['create', 'edit', 'redesign']), prompt: z.string().min(3).max(5000), spec: specSchema,
  pageId: identifier.optional(), selectedSectionId: identifier.optional(), selectedItemId: identifier.optional(), selectedItemIndex: z.number().int().min(0).max(7).optional(), selectedPartKey: bounded(32),
  locks: z.object(Object.fromEntries(['palette', 'font', 'density', 'radius', 'motion', 'typeScale', 'width'].map((key) => [key, z.boolean().optional()]))).strict().optional()
}).strict();
const emptySchema = z.object({}).strict();

export async function readJson(request, limit) {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('A bounded request size is required.');
  if (request.signal.aborted) throw new HostedError(408, 'aborted', 'The request was cancelled.');
  const length = request.headers.get('content-length');
  if (length !== null && (!/^\d{1,10}$/.test(length) || Number(length) > limit)) throw new HostedError(413, 'body_size', 'Request body is too large.');
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') || '')) throw new HostedError(415, 'content_type', 'Use an application/json request body.');
  const encoding = request.headers.get('content-encoding');
  if (encoding !== null && encoding !== 'identity') throw new HostedError(415, 'content_encoding', 'Encoded request bodies are not supported.');
  if (!request.body) throw new HostedError(400, 'body', 'A JSON object is required.');
  const reader = request.body.getReader();
  const bytes = new Uint8Array(limit);
  let total = 0;
  let timer;
  let abort;
  let stoppedError;
  const stopped = new Promise((_, reject) => {
    const fail = (error) => {
      stoppedError ||= error;
      reject(stoppedError);
      void reader.cancel().catch(() => {});
    };
    timer = setTimeout(() => fail(new HostedError(408, 'body_timeout', 'The request body took too long.')), 10_000);
    abort = () => fail(new HostedError(408, 'aborted', 'The request was cancelled.'));
    request.signal.addEventListener('abort', abort, { once: true });
    if (request.signal.aborted) abort();
  });
  try {
    while (true) {
      if (stoppedError) throw stoppedError;
      const { done, value } = await Promise.race([reader.read(), stopped]);
      // Cancelling the reader may resolve its pending read as EOF. Preserve the
      // cancellation/timeout cause instead of parsing that truncated body.
      if (stoppedError) throw stoppedError;
      if (done) break;
      if (total + value.byteLength > limit) { void reader.cancel().catch(() => {}); throw new HostedError(413, 'body_size', 'Request body is too large.'); }
      bytes.set(value, total);
      total += value.byteLength;
    }
    try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, total))); }
    catch { throw new HostedError(400, 'json', 'The request body must contain valid JSON.'); }
  } catch (error) {
    if (error instanceof HostedError) throw error;
    throw new HostedError(400, 'body', 'The request body could not be read.');
  } finally {
    clearTimeout(timer);
    request.signal.removeEventListener('abort', abort);
    reader.releaseLock();
  }
}

async function readSchema(request, limit, schema) {
  const parsed = schema.safeParse(await readJson(request, limit));
  if (!parsed.success) throw new HostedError(400, 'validation', 'The request contains invalid or unsupported fields.');
  return parsed.data;
}
export function readConnection(request) { return readSchema(request, BODY_LIMITS.connection, connectionSchema); }
export function readEmpty(request) { return readSchema(request, BODY_LIMITS.empty, emptySchema); }
export async function readCompose(request) {
  const value = await readSchema(request, BODY_LIMITS.compose, composeSchema);
  if (JSON.stringify(value).length > 1_000_000) throw new HostedError(413, 'text_size', 'The project contains too much text for one request.');
  try {
    validateTransportImages(value.spec);
    return { ...validateCompose(value), provider: value.provider, ...(value.apiKey === undefined ? {} : { apiKey: value.apiKey }) };
  } catch { throw new HostedError(400, 'validation', 'The project or design request is invalid.'); }
}
