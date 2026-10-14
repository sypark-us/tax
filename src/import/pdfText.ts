import { readFileSync } from 'node:fs';
import type { TextItem } from './parse';

/** Node-side text extraction with pdf.js. The browser page does the same with pdf.js from a CDN. */
export const extractTextItems = async (file: string): Promise<TextItem[]> => {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(readFileSync(file));
  const doc = await getDocument({ data, useSystemFonts: true }).promise;
  const items: TextItem[] = [];
  for (let page = 1; page <= doc.numPages; page++) {
    const p = await doc.getPage(page);
    const tc = await p.getTextContent();
    for (const it of tc.items) {
      if (!('str' in it) || !it.str.trim()) continue;
      items.push({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width, h: it.height, page });
    }
  }
  return items;
};

/** True when a page of the file has no usable text layer (a scan), so OCR is needed. */
export const looksScanned = (items: TextItem[], numPages: number): boolean => {
  for (let page = 1; page <= numPages; page++) if (items.filter((i) => i.page === page).length < 15) return true;
  return false;
};
