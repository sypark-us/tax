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
      items.push({ str: it.str, x: it.transform[4], y: it.transform[5], page });
    }
  }
  return items;
};
