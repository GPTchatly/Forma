/** NEW: Local JSON projects, serialized per-project writes, optimistic concurrency,
 * atomic replacement and bounded checkpoint history. Never stores provider keys. */
import { mkdir, open, readdir, writeFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { id, validateSpec, text, object, ValidationError } from '../shared/schema.mjs';
export class StoreError extends Error { constructor(message, status) { super(message); this.status = status; } }
const MAX_PROJECTS = 100;
const MAX_HISTORY_CHARACTERS = 20_000_000;
// Existing limits count JavaScript characters, not UTF-8 bytes. Allow their
// worst-case encoding (20M history + 4M current spec) and bounded metadata.
const MAX_PROJECT_FILE_BYTES = 72_100_000;
const PROJECT_FILENAME = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}\.json$/;

async function readProjectFile(filename) {
  const file = await open(filename, 'r');
  try {
    const info = await file.stat();
    if (!info.isFile()) throw new StoreError('This saved project is not a regular file.', 500);
    if (info.size > MAX_PROJECT_FILE_BYTES) throw new StoreError('This saved project exceeds the file size limit.', 500);
    const chunks = [];
    let total = 0;
    // Enforce the bound during reading too, if another local process changes it.
    while (true) {
      const chunk = Buffer.allocUnsafe(Math.min(65_536, MAX_PROJECT_FILE_BYTES - total + 1));
      const { bytesRead } = await file.read(chunk, 0, chunk.length, null);
      if (!bytesRead) break;
      total += bytesRead;
      if (total > MAX_PROJECT_FILE_BYTES) throw new StoreError('This saved project exceeds the file size limit.', 500);
      chunks.push(chunk.subarray(0, bytesRead));
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, total));
  } finally { await file.close(); }
}

function savedTimestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) throw new ValidationError('Invalid saved timestamp.');
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) throw new ValidationError('Invalid saved timestamp.');
  return value;
}

function savedProject(raw, projectId) {
  const value = object(raw);
  if (id(value.id) !== projectId || !Number.isSafeInteger(value.revision) || value.revision < 1 || !Array.isArray(value.history) || value.history.length > 10 || JSON.stringify(value.history).length > MAX_HISTORY_CHARACTERS) throw new ValidationError('Invalid saved project metadata.');
  const history = value.history.map((rawSnapshot) => {
    const snapshot = object(rawSnapshot);
    return { id: id(snapshot.id), label: text(snapshot.label, 'Checkpoint label', 180, 'Before edit'), createdAt: savedTimestamp(snapshot.createdAt), spec: validateSpec(snapshot.spec) };
  });
  if (new Set(history.map((snapshot) => snapshot.id)).size !== history.length || JSON.stringify(history).length > MAX_HISTORY_CHARACTERS) throw new ValidationError('Invalid saved checkpoint history.');
  return { id: value.id, revision: value.revision, updatedAt: savedTimestamp(value.updatedAt), spec: validateSpec(value.spec), history };
}

function metadata(project) {
  const pages = project.spec.pages || [];
  return { id: project.id, revision: project.revision, name: project.spec.name, brand: project.spec.brand.name, palette: project.spec.theme.palette, updatedAt: project.updatedAt, pageCount: pages.length + 1, sectionCount: project.spec.sections.length + pages.reduce((count, page) => count + page.sections.length, 0), history: project.history.map((h) => ({ id: h.id, label: h.label, createdAt: h.createdAt })) };
}
export class ProjectStore {
  constructor(directory) { this.directory = directory; this.queues = new Map(); this.createQueue = Promise.resolve(); }
  async init() { await mkdir(this.directory, { recursive: true, mode: 0o700 }); }
  filename(projectId) { return path.join(this.directory, `${id(projectId)}.json`); }
  async read(projectId) {
    const filename = this.filename(projectId);
    let value;
    try { value = JSON.parse(await readProjectFile(filename)); }
    catch (error) {
      if (error.code === 'ENOENT') throw new StoreError('Project not found.', 404);
      if (error instanceof StoreError) throw error;
      throw new StoreError('This saved project is unreadable. Restore it from a JSON export.', 500);
    }
    try { return savedProject(value, projectId); }
    catch { throw new StoreError('Project metadata or checkpoint data is invalid. Restore it from a JSON export.', 500); }
  }
  async get(projectId) { const p = await this.read(projectId); return { ...metadata(p), spec: p.spec }; }
  async list() {
    const names = await readdir(this.directory), projects = []; let skipped = 0;
    for (const name of names.filter((n) => PROJECT_FILENAME.test(n))) {
      try { projects.push(metadata(await this.read(name.slice(0, -5)))); } catch { skipped++; }
    }
    projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return { projects, skipped };
  }
  async atomicWrite(project) {
    const target = this.filename(project.id), temporary = `${target}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(project), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      for (let attempt = 0; ; attempt++) {
        try { await rename(temporary, target); break; }
        catch (error) {
          // Windows scanners/readers may briefly hold the destination open.
          // Retry only atomic replacement; never delete the previous save.
          if (process.platform !== 'win32' || !['EPERM', 'EACCES', 'EBUSY'].includes(error.code) || attempt >= 4) throw error;
          await delay(25 * 2 ** attempt);
        }
      }
    }
    finally { await unlink(temporary).catch(() => {}); }
  }
  async create(rawSpec) {
    const spec = validateSpec(rawSpec);
    const operation = this.createQueue.then(async () => {
      // Reserve quota through the write. Unreadable files still consume space.
      const names = await readdir(this.directory);
      if (names.filter((name) => PROJECT_FILENAME.test(name)).length >= MAX_PROJECTS) throw new StoreError('Local workspace limit reached (100 projects). Delete an old project first.', 409);
      const p = { id: `p_${randomUUID()}`, revision: 1, updatedAt: new Date().toISOString(), spec, history: [] };
      await this.atomicWrite(p); return { ...metadata(p), spec };
    });
    this.createQueue = operation.then(() => {}, () => {});
    return operation;
  }
  async update(projectId, raw) {
    const data = object(raw), next = validateSpec(data.spec), revision = data.expectedRevision;
    if (!Number.isSafeInteger(revision) || revision < 1) throw new ValidationError('Expected revision is required.');
    const previousQueue = this.queues.get(projectId) || Promise.resolve();
    const operation = previousQueue.catch(() => {}).then(async () => {
      const p = await this.read(projectId);
      if (p.revision !== revision) throw new StoreError('This project changed in another tab. Export your current JSON before reloading the saved version.', 409);
      if (p.revision === Number.MAX_SAFE_INTEGER) throw new StoreError('This project reached its revision limit. Export and reimport it to continue editing.', 409);
      if (data.checkpoint === true) {
        // NEW: Manual checkpoints capture the newly supplied visible version;
        // composition/restore checkpoints retain the previous saved version.
        const checkpointSpec = data.checkpointCurrent === true ? next : p.spec;
        const checkpointTime = data.checkpointCurrent === true ? new Date().toISOString() : p.updatedAt;
        p.history.unshift({ id: `v_${randomUUID()}`, label: text(data.label, 'Checkpoint label', 180, 'Before edit'), createdAt: checkpointTime, spec: checkpointSpec });
        p.history = p.history.slice(0, 10);
        // Cap snapshots to approximately 20 MB including uploaded images.
        while (p.history.length > 1 && JSON.stringify(p.history).length > MAX_HISTORY_CHARACTERS) p.history.pop();
      }
      p.spec = next; p.revision++; p.updatedAt = new Date().toISOString();
      await this.atomicWrite(p); return { ...metadata(p), spec: p.spec };
    });
    this.queues.set(projectId, operation);
    try { return await operation; } finally { if (this.queues.get(projectId) === operation) this.queues.delete(projectId); }
  }
  async history(projectId, historyId) {
    id(historyId); const p = await this.read(projectId), snapshot = p.history.find((h) => h.id === historyId);
    if (!snapshot) throw new StoreError('Checkpoint not found.', 404);
    return snapshot;
  }
  async delete(projectId, revision) {
    const previousQueue = this.queues.get(projectId) || Promise.resolve();
    const operation = previousQueue.catch(() => {}).then(async () => {
      const p = await this.read(projectId);
      if (p.revision !== revision) throw new StoreError('The saved version changed. Refresh your projects and try again.', 409);
      await unlink(this.filename(projectId));
    });
    this.queues.set(projectId, operation);
    try { return await operation; } finally { if (this.queues.get(projectId) === operation) this.queues.delete(projectId); }
  }
}
