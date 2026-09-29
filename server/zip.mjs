/** NEW: Minimal standards-compliant ZIP writer (stored entries). No package install.
 * Only application-generated filenames are accepted. UTF-8 + CRC32, <4 GB archives. */
const table = Uint32Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
export function crc32(buffer) { let crc = 0xffffffff; for (const byte of buffer) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; }
export function createZip(files) {
  const entries = Object.entries(files), locals = [], directory = [];
  let offset = 0;
  if (entries.length > 200) throw new Error('Too many export files.');
  for (const [name, value] of entries) {
    if (!/^[a-zA-Z0-9_.\/-]+$/.test(name) || name.includes('..') || name.startsWith('/')) throw new Error('Invalid export filename.');
    const filename = Buffer.from(name, 'utf8'), data = Buffer.isBuffer(value) ? value : Buffer.from(value, 'utf8');
    const crc = crc32(data), header = Buffer.alloc(30), central = Buffer.alloc(46);
    header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x0800, 6); header.writeUInt16LE(33, 12);
    header.writeUInt32LE(crc, 14); header.writeUInt32LE(data.length, 18); header.writeUInt32LE(data.length, 22); header.writeUInt16LE(filename.length, 26);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(33, 14);
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(filename.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(header, filename, data); directory.push(central, filename); offset += header.length + filename.length + data.length;
  }
  const centralSize = directory.reduce((sum, b) => sum + b.length, 0), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(centralSize, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...directory, end]);
}
