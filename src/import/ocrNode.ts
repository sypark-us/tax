import { imageSize, wordsFromResult, wordsToItems } from './ocr';
import type { TextItem } from './parse';

/**
 * Node-side OCR of an image file with tesseract.js. The English model is
 * downloaded on first use into the system temp directory.
 */
export const ocrImageFile = async (file: string, log: (msg: string) => void = () => {}): Promise<TextItem[]> => {
  const { readFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const buf = new Uint8Array(readFileSync(file));
  const size = imageSize(buf);
  if (!size) throw new Error('only PNG and JPEG images can be read by OCR');
  const tesseract = (await import('tesseract.js')) as unknown as { createWorker: (lang: string, oem?: number, opts?: Record<string, unknown>) => Promise<{ recognize: (img: unknown) => Promise<{ data: unknown }>; terminate: () => Promise<unknown> }> };
  log(`OCR ${file} (${size.width}x${size.height})`);
  const worker = await tesseract.createWorker('eng', 1, { cachePath: join(tmpdir(), 'tax-tessdata') });
  try {
    const { data } = await worker.recognize(file);
    return wordsToItems(wordsFromResult(data), 1, size.width, size.height);
  } finally {
    await worker.terminate();
  }
};
