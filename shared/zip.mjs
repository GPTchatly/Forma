/** Portable stored-entry ZIP writer. Filenames are application-generated, never paths supplied by users. */
const encoder = new TextEncoder();
const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;
const table = Uint32Array.from({ length: 256 }, (_, n) => {
  let crc = n;
  for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});

export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function createZip(files) {
  if (!files || typeof files !== 'object' || Array.isArray(files)) throw new Error('Export files must be an object.');
  const entries = Object.entries(files);
  if (entries.length > 200) throw new Error('Too many export files.');
  let archiveLength = 22;
  const prepared = entries.map(([name, value]) => {
    if (!/^[a-zA-Z0-9_.\/-]+$/.test(name) || name.includes('..') || name.split('/').some((part) => !part || part === '.')) throw new Error('Invalid export filename.');
    const filename = encoder.encode(name);
    if (filename.length > 65535) throw new Error('Export filename is too long.');
    if (typeof value !== 'string' && !(value instanceof Uint8Array)) throw new Error('Export files must contain text or bytes.');
    // Check text length before allocating UTF-8 bytes; the second check accounts for multibyte text.
    if (value.length > MAX_ARCHIVE_BYTES) throw new Error('Export archive exceeds 64 MB.');
    const data = typeof value === 'string' ? encoder.encode(value) : value;
    archiveLength += 76 + filename.length * 2 + data.byteLength;
    if (archiveLength > MAX_ARCHIVE_BYTES) throw new Error('Export archive exceeds 64 MB.');
    return { filename, data, crc: crc32(data), offset: 0 };
  });
  const bytes = new Uint8Array(archiveLength), view = new DataView(bytes.buffer);
  let offset = 0;
  for (const entry of prepared) {
    const { filename, data, crc } = entry;
    entry.offset = offset;
    view.setUint32(offset, 0x04034b50, true);
    view.setUint16(offset + 4, 20, true);
    view.setUint16(offset + 6, 0x0800, true);
    view.setUint16(offset + 12, 33, true);
    view.setUint32(offset + 14, crc, true);
    view.setUint32(offset + 18, data.byteLength, true);
    view.setUint32(offset + 22, data.byteLength, true);
    view.setUint16(offset + 26, filename.length, true);
    bytes.set(filename, offset + 30);
    bytes.set(data, offset + 30 + filename.length);
    offset += 30 + filename.length + data.byteLength;
  }
  const directoryOffset = offset;
  for (const { filename, data, crc, offset: localOffset } of prepared) {
    view.setUint32(offset, 0x02014b50, true);
    view.setUint16(offset + 4, 20, true);
    view.setUint16(offset + 6, 20, true);
    view.setUint16(offset + 8, 0x0800, true);
    view.setUint16(offset + 14, 33, true);
    view.setUint32(offset + 16, crc, true);
    view.setUint32(offset + 20, data.byteLength, true);
    view.setUint32(offset + 24, data.byteLength, true);
    view.setUint16(offset + 28, filename.length, true);
    view.setUint32(offset + 42, localOffset, true);
    bytes.set(filename, offset + 46);
    offset += 46 + filename.length;
  }
  view.setUint32(offset, 0x06054b50, true);
  view.setUint16(offset + 8, prepared.length, true);
  view.setUint16(offset + 10, prepared.length, true);
  view.setUint32(offset + 12, offset - directoryOffset, true);
  view.setUint32(offset + 16, directoryOffset, true);
  return bytes;
}
