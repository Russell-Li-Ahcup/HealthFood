/** 商品包装照：列表能认出来即可。压小后才适合塞进本地数据和云同步 JSON。 */
export const IMAGE_MAX_EDGE = 280;
export const IMAGE_MIN_EDGE = 120;
export const IMAGE_TARGET_BYTES = 18_000;
export const IMAGE_HARD_MAX_BYTES = 32_000;
export const IMAGE_MAX_INPUT_BYTES = 12 * 1024 * 1024;

const START_QUALITY = 0.52;
const MIN_QUALITY = 0.32;
const QUALITY_STEP = 0.08;

export function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - padding);
}

export function imageNeedsShrink(dataUrl: string): boolean {
  return dataUrl.startsWith("data:image/") && dataUrlBytes(dataUrl) > IMAGE_TARGET_BYTES;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("无法读取压缩结果"));
    reader.readAsDataURL(blob);
  });
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("无法压缩图片"))), "image/jpeg", quality);
  });
}

function drawScaled(source: ImageBitmap, edge: number): HTMLCanvasElement {
  const scale = Math.min(1, edge / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("无法处理图片");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0, width, height);
  return canvas;
}

async function encodeToBudget(source: ImageBitmap): Promise<string> {
  let edge = Math.min(IMAGE_MAX_EDGE, Math.max(source.width, source.height));
  let best: { url: string; bytes: number } | undefined;

  for (let round = 0; round < 6; round++) {
    const canvas = drawScaled(source, edge);
    for (let quality = START_QUALITY; quality >= MIN_QUALITY - 1e-6; quality -= QUALITY_STEP) {
      const blob = await canvasToJpeg(canvas, quality);
      if (!best || blob.size < best.bytes) best = { url: await blobToDataUrl(blob), bytes: blob.size };
      if (blob.size <= IMAGE_TARGET_BYTES) return best.url;
    }
    if (edge <= IMAGE_MIN_EDGE) break;
    edge = Math.max(IMAGE_MIN_EDGE, Math.round(edge * 0.72));
  }

  if (!best) throw new Error("无法压缩图片");
  if (best.bytes > IMAGE_HARD_MAX_BYTES) throw new Error("照片压缩后仍然太大，请换一张更简单的包装图");
  return best.url;
}

async function bitmapFrom(source: Blob | File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(source, { imageOrientation: "from-image" });
  } catch {
    try {
      return await createImageBitmap(source);
    } catch {
      throw new Error("无法读取这张照片，请换一张或改用相册里的 JPEG / PNG");
    }
  }
}

/** 把用户拍的包装照片压成小 JPEG，方便存在本地数据和云同步里。 */
export async function compressImage(file: File): Promise<string> {
  if (file.size > IMAGE_MAX_INPUT_BYTES) throw new Error("照片超过 12MB，请换一张或先在相册里缩小");
  const bitmap = await bitmapFrom(file);
  try {
    return await encodeToBudget(bitmap);
  } finally {
    bitmap.close();
  }
}

/** 把已存的 data URL 再压一遍（启动时收拾旧照片）。 */
export async function compressDataUrl(dataUrl: string): Promise<string> {
  if (!imageNeedsShrink(dataUrl)) return dataUrl;
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const bitmap = await bitmapFrom(blob);
  try {
    const next = await encodeToBudget(bitmap);
    return dataUrlBytes(next) < dataUrlBytes(dataUrl) ? next : dataUrl;
  } finally {
    bitmap.close();
  }
}

export async function shrinkOversizedProductImages<T extends { products: { image?: string; updatedAt: string }[] }>(
  data: T,
  now: string,
): Promise<T | null> {
  let changed = false;
  const products = [];
  for (const product of data.products) {
    if (!product.image || !imageNeedsShrink(product.image)) {
      products.push(product);
      continue;
    }
    try {
      const image = await compressDataUrl(product.image);
      if (image !== product.image) {
        products.push({ ...product, image, updatedAt: now });
        changed = true;
      } else {
        products.push(product);
      }
    } catch {
      products.push(product);
    }
  }
  return changed ? { ...data, products } : null;
}
