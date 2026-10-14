/**
 * OCR front end. Scanned statements and photos have no text layer, so the
 * page is recognised with Tesseract and its words are turned into the same
 * positioned items that pdf.js yields for a digital PDF. The readers in
 * parse.ts then work unchanged.
 *
 * Coordinates: pdf.js measures in points from the bottom-left corner of the
 * page; OCR measures in pixels from the top-left. Words are flipped and
 * scaled so that a letter-size page is 612 units wide either way, which
 * keeps the readers' distance tolerances meaningful.
 */
import type { TextItem } from './parse';

export interface OcrWord {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  confidence?: number;
}

export const LETTER_WIDTH = 612;

/** Converts OCR words on one image into positioned items in page units. */
export const wordsToItems = (words: OcrWord[], page: number, imageWidth: number, imageHeight: number, minConfidence = 30): TextItem[] => {
  const scale = imageWidth > 0 ? imageWidth / LETTER_WIDTH : 1;
  return words
    .filter((w) => w.text.trim() && (w.confidence === undefined || w.confidence >= minConfidence))
    .map((w) => ({
      str: w.text.trim(),
      x: w.bbox.x0 / scale,
      y: (imageHeight - w.bbox.y1) / scale,
      w: (w.bbox.x1 - w.bbox.x0) / scale,
      h: (w.bbox.y1 - w.bbox.y0) / scale,
      page,
    }));
};

/** Pulls word boxes out of a Tesseract result, whichever shape the version returns. */
export const wordsFromResult = (data: unknown): OcrWord[] => {
  const d = data as { words?: OcrWord[]; blocks?: Array<{ paragraphs: Array<{ lines: Array<{ words: OcrWord[] }> }> }> };
  if (Array.isArray(d.words)) return d.words;
  if (Array.isArray(d.blocks)) return d.blocks.flatMap((b) => b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words)));
  return [];
};

/** Width and height of a PNG or JPEG from its header, without decoding it. */
export const imageSize = (buf: Uint8Array): { width: number; height: number } | null => {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1]!;
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      const len = view.getUint16(i + 2);
      if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
        return { height: view.getUint16(i + 5), width: view.getUint16(i + 7) };
      }
      i += 2 + len;
    }
  }
  return null;
};

export const isImageFile = (name: string): boolean => /\.(png|jpe?g|webp|bmp|tiff?)$/i.test(name);
