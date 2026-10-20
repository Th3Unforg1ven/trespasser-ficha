import { deflateSync } from 'node:zlib';

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, bytes) {
  const label = Buffer.from(type), size = Buffer.alloc(4), crc = Buffer.alloc(4);
  size.writeUInt32BE(bytes.length);
  crc.writeUInt32BE(crc32(Buffer.concat([label, bytes])));
  return Buffer.concat([size, label, bytes, crc]);
}

// Deterministic random RGB pixels make a real PNG over the ordinary 50k text
// budget, rather than disguising a large arbitrary string as an image.
export function portraitPng(width = 180, height = 140) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 2;
  const rows = Buffer.alloc(height * (width * 3 + 1));
  let random = 0x12345678;
  for (let y = 0; y < height; y++) for (let x = 0; x < width * 3; x++) {
    random ^= random << 13; random ^= random >>> 17; random ^= random << 5;
    rows[y * (width * 3 + 1) + 1 + x] = random & 255;
  }
  const bytes = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR',header), chunk('IDAT',deflateSync(rows)), chunk('IEND',Buffer.alloc(0))]);
  return `data:image/png;base64,${bytes.toString('base64')}`;
}
