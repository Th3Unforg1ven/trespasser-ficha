// Portraits stay inside the private character JSON. Never retain an input URL,
// SVG, HTML, original file, EXIF metadata, or a remotely hosted image.
export const MAX_PORTRAIT_DATA_URL = 260_000;
export const MAX_PORTRAIT_SIDE = 800;
const MAX_FILE_BYTES = 12 * 1024 * 1024;
const MAX_SOURCE_SIDE = 8192;
const MAX_SOURCE_PIXELS = 32_000_000;
const validImages = new Map();
const empty = () => ({ dataUrl: '', zoom: 1, x: 50, y: 50 });
const invalid = () => new Error('Retrato inválido. Use uma imagem PNG, JPEG ou WebP.');

function dimensions(bytes, mime) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (mime === 'image/png') {
    if (bytes.length < 33 || ![137,80,78,71,13,10,26,10].every((byte, i) => bytes[i] === byte)
        || view.getUint32(8) !== 13 || String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR') throw invalid();
    let offset = 8, pixels = false, ended = false;
    while (offset + 12 <= bytes.length) {
      const length = view.getUint32(offset), kind = String.fromCharCode(...bytes.slice(offset+4,offset+8));
      if (!/^[A-Za-z]{4}$/.test(kind) || offset + length + 12 > bytes.length) throw invalid();
      if (kind === 'IDAT') pixels = true;
      offset += length + 12;
      if (kind === 'IEND') { ended = length === 0 && offset === bytes.length; break; }
    }
    if (!pixels || !ended) throw invalid();
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (mime === 'image/jpeg') {
    if (bytes.length < 4 || bytes[0] !== 255 || bytes[1] !== 216 || bytes.at(-2) !== 255 || bytes.at(-1) !== 217) throw invalid();
    let offset = 2;
    while (offset < bytes.length) {
      if (bytes[offset++] !== 255) throw invalid();
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) throw invalid();
      const size = view.getUint16(offset);
      if (size < 2 || offset + size > bytes.length) throw invalid();
      if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) {
        if (size < 8) throw invalid();
        return { width: view.getUint16(offset + 5), height: view.getUint16(offset + 3) };
      }
      offset += size;
    }
    throw invalid();
  }
  if (mime === 'image/webp') {
    if (bytes.length < 30 || String.fromCharCode(...bytes.slice(0,4)) !== 'RIFF'
        || String.fromCharCode(...bytes.slice(8,12)) !== 'WEBP') throw invalid();
    const kind = String.fromCharCode(...bytes.slice(12,16));
    if (kind === 'VP8X') return {
      width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16),
      height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16),
    };
    if (kind === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
      return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
    }
    if (kind === 'VP8L' && bytes[20] === 0x2f) return {
      width: 1 + (bytes[21] | ((bytes[22] & 0x3f) << 8)),
      height: 1 + ((bytes[22] >> 6) | (bytes[23] << 2) | ((bytes[24] & 0x0f) << 10)),
    };
  }
  throw invalid();
}

function checkDimensions(size, maxSide, maxPixels) {
  if (!Number.isInteger(size.width) || !Number.isInteger(size.height) || size.width < 1 || size.height < 1
      || size.width > maxSide || size.height > maxSide || size.width * size.height > maxPixels) {
    throw new Error('A imagem é grande demais. Escolha uma imagem menor.');
  }
  return size;
}

export function portraitImageInfo(dataUrl) {
  if (typeof dataUrl !== 'string' || dataUrl.length > MAX_PORTRAIT_DATA_URL) throw invalid();
  // Imported WebP is rasterized to JPEG before saving, for PDF compatibility.
  const match = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match || match[2].length % 4 !== 0) throw invalid();
  let binary;
  try { binary = atob(match[2]); } catch { throw invalid(); }
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  const size = checkDimensions(dimensions(bytes, match[1]), MAX_PORTRAIT_SIDE, MAX_PORTRAIT_SIDE ** 2);
  // Fingerprints normalize the same immutable image on every ordinary text
  // edit. Keep a small bounded validation cache; never cache mutable byte arrays.
  if (!validImages.has(dataUrl)) {
    validImages.set(dataUrl, true);
    if (validImages.size > 4) validImages.delete(validImages.keys().next().value);
  }
  return { ...size, mime: match[1], bytes };
}

export function normalizePortrait(input) {
  if (input === undefined) return empty();
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalid();
  const result = empty();
  if (input.dataUrl !== undefined) {
    if (typeof input.dataUrl !== 'string') throw invalid();
    if (input.dataUrl && !validImages.has(input.dataUrl)) portraitImageInfo(input.dataUrl);
    result.dataUrl = input.dataUrl;
  }
  for (const [key, min, max] of [['zoom',1,3], ['x',0,100], ['y',0,100]]) {
    if (input[key] === undefined) continue;
    if (typeof input[key] !== 'number' || !Number.isFinite(input[key]) || input[key] < min || input[key] > max) {
      throw new Error('Enquadramento do retrato inválido.');
    }
    result[key] = input[key];
  }
  return result;
}

// The same cover/zoom geometry is used by the editor and the PDF clipping path.
export function portraitGeometry(portrait, sourceWidth, sourceHeight, frameWidth, frameHeight) {
  const p = normalizePortrait(portrait);
  for (const value of [sourceWidth, sourceHeight, frameWidth, frameHeight]) {
    if (!Number.isFinite(value) || value <= 0) throw new Error('Dimensões do retrato inválidas.');
  }
  const scale = Math.max(frameWidth / sourceWidth, frameHeight / sourceHeight) * p.zoom;
  const width = sourceWidth * scale, height = sourceHeight * scale;
  return { width, height, x: ((frameWidth - width) * p.x / 100) || 0, y: ((frameHeight - height) * p.y / 100) || 0 };
}

export function portraitStyle(portrait) {
  const p = normalizePortrait(portrait);
  return `object-position:${p.x}% ${p.y}%;transform:scale(${p.zoom});transform-origin:${p.x}% ${p.y}%`;
}

async function decodeImage(blob, environment) {
  if (typeof environment.createImageBitmap === 'function') {
    const image = await environment.createImageBitmap(blob);
    return { image, release: () => image.close?.() };
  }
  const ImageClass = environment.Image;
  if (!ImageClass || !environment.URL?.createObjectURL) throw invalid();
  const url = environment.URL.createObjectURL(blob), image = new ImageClass();
  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(invalid());
      image.src = url;
    });
    return { image, release: () => environment.URL.revokeObjectURL(url) };
  } catch (error) {
    environment.URL.revokeObjectURL(url);
    throw error;
  }
}

export async function importPortrait(file, { environment = globalThis } = {}) {
  if (!file || !['image/png','image/jpeg','image/webp'].includes(file.type)
      || !Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_FILE_BYTES
      || typeof file.arrayBuffer !== 'function') throw invalid();
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length !== file.size || bytes.length > MAX_FILE_BYTES) throw invalid();
  checkDimensions(dimensions(bytes, file.type), MAX_SOURCE_SIDE, MAX_SOURCE_PIXELS);
  const { image, release } = await decodeImage(new Blob([bytes], { type: file.type }), environment);
  try {
    const source = checkDimensions({ width: image.width || image.naturalWidth, height: image.height || image.naturalHeight }, MAX_SOURCE_SIDE, MAX_SOURCE_PIXELS);
    const canvas = environment.document?.createElement('canvas');
    const context = canvas?.getContext('2d');
    if (!context) throw new Error('Não foi possível preparar o retrato neste navegador.');
    let longest = Math.min(MAX_PORTRAIT_SIDE, Math.max(source.width, source.height));
    while (longest >= 1) {
      const scale = longest / Math.max(source.width, source.height);
      canvas.width = Math.max(1, Math.round(source.width * scale));
      canvas.height = Math.max(1, Math.round(source.height * scale));
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      for (const quality of [.88,.78,.68,.56]) {
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        if (dataUrl.length <= 240_000) return normalizePortrait({ dataUrl });
      }
      if (longest <= 160) break;
      longest = Math.max(160, Math.floor(longest * .8));
    }
    throw new Error('Não foi possível reduzir a imagem. Escolha uma imagem menor.');
  } catch (error) {
    if (error instanceof Error) throw error;
    throw invalid();
  } finally { release(); }
}
