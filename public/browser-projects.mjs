/** Browser-owned hosted projects. Nothing in this database is a server identity.
 * All reads normalize untrusted records, and read/write transactions arbitrate
 * revisions and workspace quota across tabs without a second persistence path. */
import { id, object, text, validateSpec, ValidationError } from '../shared/schema.mjs';

const STORE_NAME = 'projects';
const MAX_PROJECTS = 100;
const MAX_HISTORY_CHARACTERS = 20_000_000;

export class BrowserProjectStoreError extends Error {
  constructor(message, status) { super(message); this.name = 'BrowserProjectStoreError'; this.status = status; }
}

function storageError(error) {
  if (error instanceof BrowserProjectStoreError || error instanceof ValidationError) return error;
  if (error?.name === 'QuotaExceededError') return new BrowserProjectStoreError('Browser storage is full. Export your current JSON and free storage before saving again.', 507);
  return new BrowserProjectStoreError('Browser project storage is unavailable. Keep this tab open and export your current JSON before retrying.', 503);
}

function newId(prefix) {
  if (typeof globalThis.crypto?.randomUUID !== 'function') throw new BrowserProjectStoreError('Secure browser storage requires HTTPS and a browser with secure random identifiers.', 503);
  return `${prefix}_${globalThis.crypto.randomUUID()}`;
}

function savedTimestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) throw new ValidationError('Invalid saved timestamp.');
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) throw new ValidationError('Invalid saved timestamp.');
  return value;
}

function savedProject(raw, projectId) {
  if (raw === undefined) throw new BrowserProjectStoreError('Project not found.', 404);
  try {
    const value = object(raw);
    if (id(value.id) !== projectId || !Number.isSafeInteger(value.revision) || value.revision < 1 || !Array.isArray(value.history) || value.history.length > 10 || JSON.stringify(value.history).length > MAX_HISTORY_CHARACTERS) throw new ValidationError('Invalid saved project metadata.');
    const history = value.history.map((rawSnapshot) => {
      const snapshot = object(rawSnapshot);
      return { id: id(snapshot.id), label: text(snapshot.label, 'Checkpoint label', 180, 'Before edit'), createdAt: savedTimestamp(snapshot.createdAt), spec: validateSpec(snapshot.spec) };
    });
    if (new Set(history.map((snapshot) => snapshot.id)).size !== history.length || JSON.stringify(history).length > MAX_HISTORY_CHARACTERS) throw new ValidationError('Invalid saved checkpoint history.');
    return { id: value.id, revision: value.revision, updatedAt: savedTimestamp(value.updatedAt), spec: validateSpec(value.spec), history };
  } catch {
    throw new BrowserProjectStoreError('This saved project or checkpoint is invalid. Restore it from a JSON export.', 500);
  }
}

function metadata(project) {
  const pages = project.spec.pages;
  return { id: project.id, revision: project.revision, name: project.spec.name, brand: project.spec.brand.name, palette: project.spec.theme.palette, updatedAt: project.updatedAt, pageCount: pages.length + 1, sectionCount: project.spec.sections.length + pages.reduce((count, page) => count + page.sections.length, 0), history: project.history.map((snapshot) => ({ id: snapshot.id, label: snapshot.label, createdAt: snapshot.createdAt })) };
}

function expectedRevision(value) {
  if (!Number.isSafeInteger(value) || value < 1) throw new ValidationError('Expected revision is required.');
  return value;
}

export function createBrowserProjectStore({ indexedDB, databaseName = 'forma-hosted-projects-v1' } = {}) {
  async function openDatabase() {
    let browserDatabase;
    // Some privacy modes throw while reading the global property itself.
    try { browserDatabase = indexedDB === undefined ? globalThis.indexedDB : indexedDB; }
    catch (error) { throw storageError(error); }
    if (!browserDatabase || typeof browserDatabase.open !== 'function') throw storageError();
    return new Promise((resolve, reject) => {
      let request, rejected = false;
      const fail = (error) => { rejected = true; reject(storageError(error)); };
      try { request = browserDatabase.open(databaseName, 1); } catch (error) { fail(error); return; }
      request.onupgradeneeded = () => {
        try { request.result.createObjectStore(STORE_NAME, { keyPath: 'id' }); }
        catch { request.transaction.abort(); }
      };
      request.onblocked = () => fail(new BrowserProjectStoreError('Browser project storage is blocked by another tab. Close other Forma tabs and retry; export your current JSON first.', 503));
      request.onerror = () => fail(request.error);
      request.onsuccess = () => {
        const database = request.result;
        if (rejected) { database.close(); return; }
        database.onversionchange = () => database.close();
        if (!database.objectStoreNames.contains(STORE_NAME)) { database.close(); fail(); return; }
        resolve(database);
      };
    });
  }

  async function transaction(mode, operation) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      let active, failure, result;
      const fail = (error) => {
        failure = storageError(error);
        try { active.abort(); }
        catch { database.close(); reject(failure); }
      };
      try {
        active = database.transaction(STORE_NAME, mode);
        active.oncomplete = () => { database.close(); resolve(result); };
        active.onabort = () => { database.close(); reject(failure || storageError(active.error)); };
        const store = active.objectStore(STORE_NAME);
        if (store.keyPath !== 'id' || store.autoIncrement) throw new BrowserProjectStoreError('Browser project storage has an incompatible format. Export your current JSON before retrying.', 503);
        // Request callbacks must stay synchronous: awaiting unrelated promises
        // would let IndexedDB auto-commit before a revision check and its write.
        const receive = (request, callback) => {
          request.onsuccess = () => { try { callback(request.result); } catch (error) { fail(error); } };
        };
        operation(store, receive, (value) => { result = value; });
      } catch (error) {
        if (active) fail(error);
        else { database.close(); reject(storageError(error)); }
      }
    });
  }

  return {
    async list() {
      return transaction('readonly', (store, receive, finish) => {
        const projects = []; let skipped = 0;
        receive(store.openCursor(), function next(cursor) {
          if (!cursor) { projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); finish({ projects, skipped }); return; }
          try { projects.push(metadata(savedProject(cursor.value, cursor.primaryKey))); } catch { skipped++; }
          cursor.continue();
        });
      });
    },

    async create(rawSpec) {
      const spec = validateSpec(rawSpec);
      return transaction('readwrite', (store, receive, finish) => {
        receive(store.count(), (count) => {
          if (count >= MAX_PROJECTS) throw new BrowserProjectStoreError('Browser workspace limit reached (100 projects). Delete an old project first.', 409);
          const project = { id: newId('p'), revision: 1, updatedAt: new Date().toISOString(), spec, history: [] };
          store.add(project);
          finish({ ...metadata(project), spec: project.spec });
        });
      });
    },

    async get(projectId) {
      id(projectId);
      return transaction('readonly', (store, receive, finish) => {
        receive(store.get(projectId), (raw) => { const project = savedProject(raw, projectId); finish({ ...metadata(project), spec: project.spec }); });
      });
    },

    async update(projectId, raw) {
      id(projectId);
      const data = object(raw), next = validateSpec(data.spec), revision = expectedRevision(data.expectedRevision);
      if (Object.keys(data).some((key) => !['spec', 'expectedRevision', 'checkpoint', 'checkpointCurrent', 'label'].includes(key))) throw new ValidationError('Unsupported project update field.');
      if ((data.checkpoint !== undefined && typeof data.checkpoint !== 'boolean') || (data.checkpointCurrent !== undefined && typeof data.checkpointCurrent !== 'boolean')) throw new ValidationError('Checkpoint options must be true or false.');
      const label = text(data.label, 'Checkpoint label', 180, 'Before edit');
      return transaction('readwrite', (store, receive, finish) => {
        receive(store.get(projectId), (rawProject) => {
          const project = savedProject(rawProject, projectId);
          if (project.revision !== revision) throw new BrowserProjectStoreError('This project changed in another tab. Export your current JSON before reloading the saved version.', 409);
          if (project.revision === Number.MAX_SAFE_INTEGER) throw new BrowserProjectStoreError('This project reached its revision limit. Export and reimport it to continue editing.', 409);
          if (data.checkpoint === true) {
            project.history.unshift({ id: newId('v'), label, createdAt: data.checkpointCurrent === true ? new Date().toISOString() : project.updatedAt, spec: data.checkpointCurrent === true ? next : project.spec });
            project.history = project.history.slice(0, 10);
            while (project.history.length && JSON.stringify(project.history).length > MAX_HISTORY_CHARACTERS) project.history.pop();
          }
          project.spec = next; project.revision++; project.updatedAt = new Date().toISOString();
          store.put(project);
          finish({ ...metadata(project), spec: project.spec });
        });
      });
    },

    async delete(projectId, rawRevision) {
      id(projectId); const revision = expectedRevision(rawRevision);
      return transaction('readwrite', (store, receive) => {
        receive(store.get(projectId), (raw) => {
          const project = savedProject(raw, projectId);
          if (project.revision !== revision) throw new BrowserProjectStoreError('The saved version changed. Refresh your projects and try again.', 409);
          store.delete(projectId);
        });
      });
    },

    async history(projectId, historyId) {
      id(projectId); id(historyId);
      return transaction('readonly', (store, receive, finish) => {
        receive(store.get(projectId), (raw) => {
          const snapshot = savedProject(raw, projectId).history.find((entry) => entry.id === historyId);
          if (!snapshot) throw new BrowserProjectStoreError('Checkpoint not found.', 404);
          finish(snapshot);
        });
      });
    },
  };
}
