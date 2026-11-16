/** Migration gate: compatibility with an earlier version, proved with that version's own code.
 *
 * Usage: node scripts/compat-check.mjs <commit>
 *
 * Takes shared/, hosted/, server/store.mjs and examples/ of <commit> out of git into a temporary
 * directory and runs them against documents, stored projects and compose requests produced by the
 * working tree, then renders base documents of every base block with the base renderer and with
 * the working tree's. Prints one line per check (`ok - …` or `not ok - …`) and a summary; exits 1
 * when a check failed and 2 on a usage or setup error. Needs the installed pinned zod package
 * (`npm ci --ignore-scripts`), which the base hosted envelope imports. Reads no environment
 * variable, writes only inside a temporary directory that it removes, and never uses a shell. */
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const root = fileURLToPath(new URL('..', import.meta.url));
const MODULES = [['schema', 'shared/schema.mjs'], ['content', 'shared/content.mjs'], ['catalog', 'shared/catalog.mjs'], ['render', 'shared/render.mjs'], ['transport', 'shared/compose-transport.mjs'], ['hosted', 'hosted/schemas.mjs'], ['store', 'server/store.mjs']];
class SetupError extends Error {}

const git = (args) => execFileSync('git', args, { cwd: root, maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
const clone = (value) => structuredClone(value);
const excerpt = (text, index) => JSON.stringify(text.slice(Math.max(0, index - 40), index + 60));
function textDifference(before, after) {
  let index = 0;
  while (index < before.length && index < after.length && before[index] === after[index]) index++;
  return `base ${excerpt(before, index)}, now ${excerpt(after, index)}`;
}
// The path and values of the first difference between two JSON-like values.
function valueDifference(before, after, at = '') {
  if (isDeepStrictEqual(before, after)) return null;
  if (before && after && typeof before === 'object' && typeof after === 'object' && Array.isArray(before) === Array.isArray(after)) {
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      const found = valueDifference(before[key], after[key], `${at}${Array.isArray(before) ? `[${key}]` : `.${key}`}`);
      if (found) return found;
    }
  }
  return `${at || '(root)'}: base ${JSON.stringify(before)?.slice(0, 120)}, now ${JSON.stringify(after)?.slice(0, 120)}`;
}

// A section element opens with <section, <header or <footer followed by id="…" class="site-section…;
// attribute values are escaped, so such a tag ends at its first `>`.
const SECTION_TAG = /<(?:section|header|footer) id="[^"]*" class="site-section[^>]*>/g;
function attributesOf(tag) {
  const attributes = new Map();
  for (const match of tag.matchAll(/\s([^\s="'>/]+)(?:="([^"]*)")?/g)) attributes.set(match[1], match[2] ?? '');
  return attributes;
}
/** null when the working tree renders the base markup: the text between section tags is equal piece
 * by piece, every base attribute is kept with its value, and every further attribute is a `data-`
 * attribute with the value `default`. Otherwise the first difference. */
function markupDifference(before, after) {
  const tags = [before.match(SECTION_TAG) || [], after.match(SECTION_TAG) || []];
  if (tags[0].length !== tags[1].length) return `${tags[0].length} section tags at base, ${tags[1].length} now`;
  const pieces = [before.split(SECTION_TAG), after.split(SECTION_TAG)];
  for (let index = 0; index < pieces[0].length; index++) {
    if (pieces[0][index] !== pieces[1][index]) return `markup ${index ? `after section tag ${index}` : 'before the first section tag'} differs: ${textDifference(pieces[0][index], pieces[1][index])}`;
  }
  for (let index = 0; index < tags[0].length; index++) {
    const base = attributesOf(tags[0][index]), now = attributesOf(tags[1][index]), name = base.get('id');
    for (const [attribute, value] of base) if (now.get(attribute) !== value) return `section ${name}: attribute ${attribute}="${value}" at base, ${now.has(attribute) ? `"${now.get(attribute)}"` : 'missing'} now`;
    for (const [attribute, value] of now) if (!base.has(attribute) && (!attribute.startsWith('data-') || value !== 'default')) return `section ${name}: added attribute ${attribute}="${value}" is not a data- attribute with the value default`;
  }
  return null;
}

const post = (body) => new Request('https://example.com/api/compose', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const accepts = async (readCompose, body) => { try { await readCompose(post(body)); return true; } catch { return false; } };

async function main(commit) {
  let zod;
  try { zod = import.meta.resolve('zod'); } catch { throw new SetupError('The pinned zod package is not installed. Run npm ci --ignore-scripts first.'); }
  let listing;
  try { listing = git(['ls-tree', '-r', '-z', '--name-only', commit, '--', 'shared', 'hosted', 'server/store.mjs', 'examples']).toString('utf8').split('\0').filter(Boolean); }
  catch { throw new SetupError(`git could not list the files of ${commit}.`); }
  for (const [, file] of MODULES) if (!listing.includes(file)) throw new SetupError(`${commit} has no ${file}.`);
  const directory = await mkdtemp(path.join(tmpdir(), 'forma-compat-'));
  try {
    for (const file of listing) {
      const segments = file.split('/');
      if (segments.some((segment) => !segment || segment === '.' || segment === '..')) throw new SetupError(`Unexpected path in ${commit}: ${file}`);
      let bytes = git(['show', `${commit}:${file}`]);
      // The base hosted envelope loads the installed pinned zod package.
      if (/^hosted\/[^/]+\.mjs$/.test(file)) bytes = Buffer.from(bytes.toString('utf8').replace(/(\bfrom\s*|\bimport\s*\(\s*)(['"])zod\2/g, (match, prefix) => `${prefix}${JSON.stringify(zod)}`), 'utf8');
      const target = path.join(directory, ...segments);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, bytes);
    }
    const load = async (resolve, extra = []) => Object.fromEntries(await Promise.all([...MODULES, ...extra].map(async ([key, file]) => [key, await import(resolve(file))])));
    let base, now;
    try {
      base = await load((file) => pathToFileURL(path.join(directory, ...file.split('/'))).href);
      now = await load((file) => new URL(`../${file}`, import.meta.url).href, [['blocks', 'shared/blocks.mjs']]);
    } catch (error) { throw new SetupError(`A module could not be loaded: ${error.message}`); }
    const exampleNames = listing.filter((file) => /^examples\/[^/]+\.project\.json$/.test(file));
    const examples = await Promise.all(exampleNames.map(async (file) => [file, JSON.parse(await readFile(path.join(directory, ...file.split('/')), 'utf8'))]));

    // Documents with vocabulary the base version does not know, built by the working tree.
    if (!now.blocks.MANIFEST_BY_ID['contact-hours']) throw new SetupError('The working tree has no contact-hours block.');
    const withHours = now.content.createSpec();
    withHours.sections[withHours.sections.findIndex((section) => section.group === 'contact')] = now.content.makeSection('contact', 'contact-hours');
    const withBackdrop = now.content.createSpec();
    withBackdrop.sections.find((section) => section.group === 'features').presentation.backdrop = 'grid';
    const withMessage = now.content.createSpec(), workspace = now.content.makeSection('hero', 'app-workspace');
    workspace.items[0].uiType = 'message';
    withMessage.sections[withMessage.sections.findIndex((section) => section.group === 'hero')] = workspace;
    const vocabulary = { 'a contact-hours section': withHours, 'a grid backdrop': withBackdrop, 'an app-workspace item of type message': withMessage };

    const lines = [];
    const check = async (name, run) => {
      let problems;
      try { problems = await run(); } catch (error) { problems = [`${error?.message || error}`]; }
      lines.push(problems.length ? `not ok - ${name}: ${problems[0]}${problems.length > 1 ? ` (and ${problems.length - 1} more)` : ''}` : `ok - ${name}`);
      console.log(lines.at(-1));
      for (const problem of problems.slice(1, 20)) console.log(`# ${problem}`);
    };

    await check('(1) the base validator accepts what the working tree writes for default-only documents, unchanged', () => {
      const problems = [];
      for (const [name, document] of [['base createSpec()', base.content.createSpec()], ['working-tree createSpec()', now.content.createSpec()], ...examples]) {
        try {
          const written = now.schema.validateSpec(clone(document)), read = base.schema.validateSpec(clone(written));
          const found = valueDifference(read, written);
          if (found) problems.push(`${name}: ${found}`);
        } catch (error) { problems.push(`${name}: ${error.message}`); }
      }
      return problems;
    });

    await check('(2) projects saved and checkpointed by the working tree are listed and read by the base store', async () => {
      const problems = [], data = path.join(directory, 'store-defaults');
      const store = new now.store.ProjectStore(data);
      await store.init();
      const created = await store.create(base.content.createSpec());
      let spec = clone(created.spec);
      spec.sections.find((section) => section.group === 'hero').title = 'A first compatibility heading';
      const first = await store.update(created.id, { spec, expectedRevision: created.revision, checkpoint: true, label: 'Compatibility checkpoint' });
      spec = clone(first.spec);
      spec.sections.find((section) => section.group === 'hero').title = 'A second compatibility heading';
      await store.update(created.id, { spec, expectedRevision: first.revision, checkpoint: true, label: 'Compatibility checkpoint' });
      const saved = await store.read(created.id);
      if (saved.history.length < 2) problems.push(`expected two checkpoints, found ${saved.history.length}`);
      const older = new base.store.ProjectStore(data), listed = await older.list();
      if (listed.skipped !== 0) problems.push(`the base store skipped ${listed.skipped} project(s)`);
      if (!listed.projects.some((project) => project.id === created.id)) problems.push('the base store does not list the project');
      const found = valueDifference(await older.read(created.id), saved);
      if (found) problems.push(`the base store reads a different project: ${found}`);
      return problems;
    });

    await check('(3) projects with new vocabulary are refused whole by the base store and kept byte for byte', async () => {
      const problems = [], data = path.join(directory, 'store-vocabulary');
      const store = new now.store.ProjectStore(data);
      await store.init();
      const ids = {};
      for (const [name, document] of Object.entries(vocabulary)) ids[name] = (await store.create(clone(document))).id;
      const files = (await readdir(data)).filter((file) => file.endsWith('.json')).sort();
      const before = await Promise.all(files.map((file) => readFile(path.join(data, file))));
      const older = new base.store.ProjectStore(data), listed = await older.list();
      if (listed.skipped !== Object.keys(ids).length) problems.push(`the base store skipped ${listed.skipped} of ${Object.keys(ids).length} projects`);
      for (const [name, id] of Object.entries(ids)) {
        if (listed.projects.some((project) => project.id === id)) problems.push(`the base store lists the project with ${name}`);
        try { await older.read(id); problems.push(`the base store read the project with ${name}`); }
        catch (error) { if (error.status !== 500) problems.push(`the base store refused the project with ${name} with status ${error.status}, not 500`); }
        try { await store.read(id); } catch (error) { problems.push(`the working-tree store cannot read the project with ${name}: ${error.message}`); }
      }
      const after = await Promise.all(files.map((file) => readFile(path.join(data, file))));
      files.forEach((file, index) => { if (!before[index].equals(after[index])) problems.push(`the bytes of ${file} changed`); });
      if ((await readdir(data)).filter((file) => file.endsWith('.json')).length !== files.length) problems.push('a project file appeared or disappeared');
      return problems;
    });

    await check('(4) new editor, base function: a default-only request is accepted, a request with new vocabulary is refused', async () => {
      const problems = [];
      const request = (spec) => now.transport.prepareComposeRequest({ mode: 'jev', operation: 'edit', prompt: 'Make the page calmer.', spec: clone(spec), locks: {} }).request;
      if (!await accepts(base.hosted.readCompose, request(now.content.createSpec()))) problems.push('the base envelope refused the request for a default-only project');
      if (await accepts(base.hosted.readCompose, request(withHours))) problems.push('the base envelope accepted the request for a project with a contact-hours section');
      return problems;
    });

    await check('(5) base editor, new function: a request built by the base editor is accepted', async () => {
      const request = base.transport.prepareComposeRequest({ mode: 'jev', operation: 'edit', prompt: 'Make the page calmer.', spec: base.content.createSpec(), locks: {} }).request;
      return await accepts(now.hosted.readCompose, request) ? [] : ['the working-tree envelope refused the request built by the base editor'];
    });

    await check('(6) a base editor refuses a composition with new vocabulary whole', () => {
      try { base.schema.validateSpec(clone(withHours)); return ['the base validator accepted a document with a contact-hours section']; }
      catch { return []; }
    });

    await check('(7) base documents render as before: the base default document, the base examples and every base catalog block', () => {
      const problems = [], documents = [['base createSpec()', base.content.createSpec()], ...examples];
      for (const entry of base.catalog.CATALOG) {
        const spec = base.content.createSpec(), section = base.content.makeSection(entry.group, entry.id);
        const index = spec.sections.findIndex((candidate) => candidate.group === entry.group);
        if (index < 0) spec.sections.splice(spec.sections.length - 1, 0, section);
        else spec.sections[index] = section;
        documents.push([`block ${entry.id}`, spec]);
      }
      for (const [name, document] of documents) {
        try {
          // One base validation, so both renderers see the same ids.
          const validated = base.schema.validateSpec(clone(document));
          for (const pageId of [undefined, ...validated.pages.map((page) => page.id)]) {
            const options = pageId === undefined ? {} : { pageId };
            const found = markupDifference(base.render.renderBody(clone(validated), options), now.render.renderBody(clone(validated), options));
            if (found) problems.push(`${name}${pageId === undefined ? '' : ` (page ${pageId})`}: ${found}`);
          }
        } catch (error) { problems.push(`${name}: ${error.message}`); }
      }
      return problems;
    });

    const failures = lines.filter((line) => line.startsWith('not ok')).length;
    console.log(`Compatibility with ${commit}: ${lines.length} checks, ${failures} failures.`);
    return failures ? 1 : 0;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

const commit = process.argv[2];
if (process.argv.length !== 3 || typeof commit !== 'string' || !/^[0-9a-f]{7,40}$/.test(commit)) {
  console.error('Usage: node scripts/compat-check.mjs <commit>, where <commit> is 7 to 40 lowercase hexadecimal characters.');
  process.exitCode = 2;
} else {
  try { process.exitCode = await main(commit); }
  catch (error) {
    console.error(error instanceof SetupError ? error.message : `Setup failed: ${error?.stack || error}`);
    process.exitCode = 2;
  }
}
