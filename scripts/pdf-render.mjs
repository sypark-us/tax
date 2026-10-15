// Renders PDF pages to PNG for a visual check (needs the @napi-rs/canvas dev dependency):
//   node scripts/pdf-render.mjs filled.pdf outPrefix [scale]
import { createCanvas } from '@napi-rs/canvas';
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
const [file, prefix, scaleArg] = process.argv.slice(2);
const scale = Number(scaleArg || 1.5);
const pdf = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(file)), disableFontFace: true, useSystemFonts: false, standardFontDataUrl: 'node_modules/pdfjs-dist/standard_fonts/' }).promise;
for (let p = 1; p <= pdf.numPages; p++) {
  const page = await pdf.getPage(p);
  const vp = page.getViewport({ scale });
  const canvas = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height));
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport: vp, annotationMode: Number(process.env.ANNOT || 1), canvasFactory: { create: (w, h) => { const c = createCanvas(w, h); return { canvas: c, context: c.getContext('2d') }; }, reset: (cc, w, h) => { cc.canvas.width = w; cc.canvas.height = h; }, destroy: () => {} } }).promise;
  writeFileSync(`${prefix}-${p}.png`, canvas.toBuffer('image/png'));
  console.log(`${prefix}-${p}.png`);
}
