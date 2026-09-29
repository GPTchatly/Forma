/** Shared, bounded raster metadata checks before a browser decoder sees uploads.
 * This inspects containers and dimensions; it is not a replacement image decoder.
 * Only still images are accepted. Never interpret image bytes as HTML or script. */
export const RASTER_LIMITS = Object.freeze({ maxBytes: 12000000, maxDimension: 8192, maxPixels: 24000000, maxDataUrl: 750000 });
const invalid = () => { throw new Error('Choose a valid, static PNG, JPEG, WebP or AVIF image (at most 8192 pixels per side and 24 million pixels).'); };
const ascii = (bytes, offset, length = 4) => String.fromCharCode(...bytes.subarray(offset, offset + length));
function dimensions(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > RASTER_LIMITS.maxDimension || height > RASTER_LIMITS.maxDimension || width * height > RASTER_LIMITS.maxPixels) invalid();
  return { width, height };
}
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => { for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0; });
function crc32(bytes, start, end) { let crc = 0xffffffff; for (let i = start; i < end; i++) crc = crcTable[(crc ^ bytes[i]) & 255] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; }
function png(bytes, view) {
  if (bytes.length < 57 || ![137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte)) invalid();
  let offset = 8, count = 0, size, data = false, endedData = false, palette = false;
  while (offset < bytes.length) {
    if (++count > 4096 || offset + 12 > bytes.length) invalid();
    const length = view.getUint32(offset), type = ascii(bytes, offset + 4), end = offset + 12 + length;
    if (end > bytes.length || !/^[A-Za-z]{4}$/.test(type) || crc32(bytes, offset + 4, end - 4) !== view.getUint32(end - 4)) invalid();
    if (count === 1) {
      if (type !== 'IHDR' || length !== 13) invalid();
      size = dimensions(view.getUint32(offset + 8), view.getUint32(offset + 12));
      const depth = bytes[offset + 16], color = bytes[offset + 17];
      const depths = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
      if (!depths[color]?.includes(depth) || bytes[offset + 18] !== 0 || bytes[offset + 19] !== 0 || bytes[offset + 20] > 1) invalid();
      palette = color === 3;
    } else if (type === 'IHDR' || ['acTL', 'fcTL', 'fdAT'].includes(type)) invalid();
    else if (type === 'PLTE') { if (data || length < 3 || length > 768 || length % 3) invalid(); palette = false; }
    else if (type === 'IDAT') { if (endedData || palette) invalid(); if (length) data = true; }
    else if (type === 'IEND') { if (!data || length || end !== bytes.length) invalid(); return size; }
    else if (type[0] === type[0].toUpperCase()) invalid();
    if (data && type !== 'IDAT') endedData = true;
    offset = end;
  }
  invalid();
}
function jpeg(bytes, view) {
  if (bytes.length < 20 || bytes[0] !== 255 || bytes[1] !== 216) invalid();
  let offset = 2, count = 0, size, scanned = false;
  while (offset < bytes.length) {
    if (++count > 4096 || bytes[offset++] !== 255) invalid();
    while (bytes[offset] === 255) offset++;
    const marker = bytes[offset++];
    if (marker === 217) { if (!size || !scanned || offset !== bytes.length) invalid(); return size; }
    if (marker === 0 || marker === 216 || marker === 1 || marker >= 208 && marker <= 215 || offset + 2 > bytes.length) invalid();
    const length = view.getUint16(offset), end = offset + length;
    if (length < 2 || end > bytes.length) invalid();
    if ([192, 193, 194].includes(marker)) {
      if (size || length < 11 || bytes[offset + 2] !== 8 || length !== 8 + 3 * bytes[offset + 7]) invalid();
      size = dimensions(view.getUint16(offset + 5), view.getUint16(offset + 3));
    } else if (marker >= 192 && marker <= 207 && ![196, 200, 204].includes(marker)) invalid();
    if (marker === 218) {
      if (!size || length < 8 || length !== 6 + 2 * bytes[offset + 2]) invalid();
      offset = end;
      const start = offset;
      while (offset < bytes.length) {
        if (bytes[offset] !== 255) { offset++; continue; }
        const next = bytes[offset + 1];
        if (next === 0 || next >= 208 && next <= 215) { offset += 2; continue; }
        break;
      }
      if (offset === start) invalid();
      scanned = true;
    } else offset = end;
  }
  invalid();
}
function webp(bytes, view) {
  if (bytes.length < 26 || ascii(bytes, 0) !== 'RIFF' || ascii(bytes, 8) !== 'WEBP' || view.getUint32(4, true) !== bytes.length - 8) invalid();
  let offset = 12, count = 0, canvas, frame;
  const uint24 = (at) => bytes[at] + bytes[at + 1] * 256 + bytes[at + 2] * 65536;
  while (offset < bytes.length) {
    if (++count > 4096 || offset + 8 > bytes.length) invalid();
    const type = ascii(bytes, offset), length = view.getUint32(offset + 4, true), start = offset + 8, end = start + length;
    if (end + (length % 2) > bytes.length || length % 2 && bytes[end] !== 0) invalid();
    if (type === 'VP8X') {
      if (count !== 1 || length !== 10 || bytes[start] & 0xc3 || bytes[start + 1] || bytes[start + 2] || bytes[start + 3]) invalid();
      canvas = dimensions(uint24(start + 4) + 1, uint24(start + 7) + 1);
    } else if (type === 'ANIM' || type === 'ANMF') invalid();
    else if (type === 'VP8 ') {
      if (frame || length <= 10 || bytes[start] & 1 || ascii(bytes, start + 3, 3) !== '\x9d\x01\x2a') invalid();
      frame = dimensions(view.getUint16(start + 6, true) & 0x3fff, view.getUint16(start + 8, true) & 0x3fff);
    } else if (type === 'VP8L') {
      if (frame || length <= 5 || bytes[start] !== 0x2f || bytes[start + 4] & 0xe0) invalid();
      const bits = view.getUint32(start + 1, true);
      frame = dimensions((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
    }
    offset = end + length % 2;
  }
  if (!frame || canvas && (canvas.width !== frame.width || canvas.height !== frame.height)) invalid();
  return frame;
}
function avif(bytes, view) {
  let count = 0, branded = false, media = false, meta = false, size, pixels = 0;
  function boxes(start, end, parent) {
    let offset = start;
    while (offset < end) {
      if (++count > 4096 || offset + 8 > end) invalid();
      let length = view.getUint32(offset), header = 8;
      const type = ascii(bytes, offset + 4);
      if (length === 1) { if (offset + 16 > end || view.getUint32(offset + 8) !== 0) invalid(); length = view.getUint32(offset + 12); header = 16; }
      else if (length === 0) length = end - offset;
      const body = offset + header, next = offset + length;
      if (length < header || next > end) invalid();
      if (parent === '' && type === 'ftyp') {
        if (offset !== 0 || length - header < 8 || length - header > 256 || (length - header) % 4) invalid();
        const brands = [ascii(bytes, body)];
        for (let i = body + 8; i < next; i += 4) brands.push(ascii(bytes, i));
        if (!brands.includes('avif') || brands.includes('avis')) invalid();
        branded = true;
      } else if (parent === '' && type === 'meta') {
        if (meta || body + 4 > next || view.getUint32(body) !== 0) invalid();
        meta = true; boxes(body + 4, next, 'meta');
      } else if (parent === 'meta' && type === 'iprp') boxes(body, next, 'iprp');
      else if (parent === 'iprp' && type === 'ipco') boxes(body, next, 'ipco');
      else if (parent === 'ipco' && type === 'ispe') {
        if (next - body !== 12 || view.getUint32(body) !== 0) invalid();
        const item = dimensions(view.getUint32(body + 4), view.getUint32(body + 8));
        pixels += item.width * item.height;
        if (pixels > RASTER_LIMITS.maxPixels * 2) invalid();
        if (!size || item.width * item.height > size.width * size.height) size = item;
      } else if (parent === '' && type === 'mdat' && next > body) media = true;
      else if (parent === '' && type === 'moov') invalid();
      offset = next;
    }
  }
  boxes(0, bytes.length, '');
  if (!branded || !meta || !media || !size) invalid();
  return size;
}
export function inspectRaster(bytes, mime) {
  if (!(bytes instanceof Uint8Array) || bytes.length === 0 || bytes.length > RASTER_LIMITS.maxBytes) invalid();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const parsers = { 'image/png': png, 'image/jpeg': jpeg, 'image/webp': webp, 'image/avif': avif };
  if (!Object.hasOwn(parsers, mime)) invalid();
  return { mime, ...parsers[mime](bytes, view) };
}
export function inspectRasterDataUrl(value) {
  if (typeof value !== 'string' || value.length > RASTER_LIMITS.maxDataUrl) invalid();
  const match = /^data:(image\/(?:png|jpeg|webp|avif));base64,((?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?)$/.exec(value);
  if (!match || !match[2]) invalid();
  let binary;
  try { binary = atob(match[2]); } catch { invalid(); }
  if (btoa(binary) !== match[2]) invalid();
  return inspectRaster(Uint8Array.from(binary, (char) => char.charCodeAt(0)), match[1]);
}
