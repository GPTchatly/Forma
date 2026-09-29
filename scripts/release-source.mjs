/** Create an allowlisted source ZIP; never archive the working directory wholesale. */
import { mkdir, lstat, realpath, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createZip } from '../server/zip.mjs';
import { checkRelease, printReleaseCheck } from './release-check.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try {
  const result = await checkRelease(root);
  printReleaseCheck(result);
  if (result.problems.length) throw new Error('Source release checks failed.');
  // The exact buffers checked above become the archive, avoiding a second source read.
  const manifest = [...result.files].map(([name, content]) => `${createHash('sha256').update(content).digest('hex')}  ${name}`).join('\n') + '\n';
  const files = Object.fromEntries(result.files);
  files['SOURCE-MANIFEST.sha256'] = manifest;
  const archive = createZip(files);
  const outputDirectory = path.join(root, 'artifacts');
  await mkdir(outputDirectory, { recursive: true });
  if ((await lstat(outputDirectory)).isSymbolicLink() || await realpath(outputDirectory) !== path.join(await realpath(root), 'artifacts')) throw new Error('Unsafe artifact directory.');
  const version = JSON.parse(result.files.get('package.json').toString('utf8')).version;
  if (!/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(version)) throw new Error('Invalid release version.');
  const checksum = createHash('sha256').update(archive).digest('hex');
  const name = `forma-source-${version}-${checksum.slice(0, 12)}.zip`, filename = path.join(outputDirectory, name);
  let created = true;
  try { await writeFile(filename, archive, { flag: 'wx' }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const existing = await lstat(filename);
    if (!existing.isFile() || existing.isSymbolicLink() || existing.size !== archive.length || !(await readFile(filename)).equals(archive)) throw new Error('Existing artifact is not the expected archive.');
    created = false;
  }
  console.log(`${created ? 'Created' : 'Verified existing'} artifacts/${name} (${archive.length} bytes). Share this archive, not the private working directory.`);
  console.log(`SHA-256: ${checksum}`);
} catch {
  console.error('Source archive was not created. Resolve release findings and output-directory issues first.');
  process.exitCode = 1;
}
