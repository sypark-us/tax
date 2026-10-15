/**
 * Fills the IRS PDFs with pdf-lib. The library is passed in rather than
 * imported so the same code runs in Node (import from 'pdf-lib') and in the
 * browser page (window.PDFLib from the CDN build).
 */
import type * as PdfLib from 'pdf-lib';
import { ATTACHMENT_ORDER, FIELD_MAPS, FORM_TITLES, fieldSuffix, type FieldMap, type FormId, type FormYear } from './fieldMaps';
import { fmtWhole, type CellValue, type FormValues } from './values';

export type PdfLibModule = typeof PdfLib;
type PDFDocument = PdfLib.PDFDocument;

export interface FillOptions {
  /** Burn the values into the page so any viewer prints them; the fields stop being editable. */
  flatten?: boolean;
  /** Keep only these pages (0-based, after any draft cover sheet). */
  pages?: number[];
}

/** Leading pages that carry no form fields: the "DRAFT - DO NOT FILE" cover sheet on early-release forms. */
const coverPageCount = (doc: PDFDocument, lib: PdfLibModule): number => {
  let n = 0;
  for (const page of doc.getPages()) {
    const annots = page.node.Annots()?.asArray() ?? [];
    const hasWidget = annots.some((ref) => {
      const dict = doc.context.lookup(ref);
      return dict instanceof lib.PDFDict && dict.get(lib.PDFName.of('Subtype')) === lib.PDFName.of('Widget');
    });
    if (hasWidget) break;
    n++;
  }
  return n;
};

export class FieldMapError extends Error {}

/** Resolves a map value (field-name tail) to exactly one field of the form. */
export const resolveField = (fields: Array<{ name: string; field: PdfLib.PDFField }>, short: string): PdfLib.PDFField => {
  const suffix = fieldSuffix(short);
  const hits = fields.filter((f) => f.name === suffix || f.name.endsWith('.' + suffix));
  if (hits.length !== 1) throw new FieldMapError(`field "${short}" matched ${hits.length} fields`);
  return hits[0]!.field;
};

export const fillForm = async (lib: PdfLibModule, blank: Uint8Array, map: FieldMap, values: Record<string, CellValue>, opts: FillOptions = {}): Promise<Uint8Array> => {
  const doc = await lib.PDFDocument.load(blank, { ignoreEncryption: true, updateMetadata: false });
  const form = doc.getForm();
  const fields = form.getFields().map((field) => ({ name: field.getName(), field }));
  for (const [key, raw] of Object.entries(values)) {
    if (raw === '' || raw === false || raw === 0 || raw === undefined || raw === null) continue;
    const short = map[key];
    if (!short) throw new FieldMapError(`no field mapped for "${key}"`);
    const field = resolveField(fields, short);
    if (field instanceof lib.PDFCheckBox) {
      if (raw !== true) throw new FieldMapError(`"${key}" is a checkbox; got ${String(raw)}`);
      field.check();
    } else if (field instanceof lib.PDFTextField) {
      let text = typeof raw === 'number' ? fmtWhole(raw) : String(raw);
      const max = field.getMaxLength();
      if (max && text.length > max) text = text.replace(/[^A-Za-z0-9]/g, '').slice(0, max);
      field.setText(text);
    } else {
      throw new FieldMapError(`"${key}" maps to an unsupported field type`);
    }
  }
  form.updateFieldAppearances();
  if (opts.flatten) form.flatten();
  const cover = coverPageCount(doc, lib);
  const total = doc.getPageCount();
  const keep = new Set((opts.pages ?? Array.from({ length: total - cover }, (_, i) => i)).map((i) => i + cover));
  // Fields whose widgets sit on a dropped page must go too, or later flattening fails to find their page.
  const dropped = new Set<string>();
  doc.getPages().forEach((page, i) => {
    if (keep.has(i)) return;
    for (const ref of page.node.Annots()?.asArray() ?? []) dropped.add(ref.toString());
  });
  if (dropped.size) {
    for (const { field } of fields) {
      const widgets = field.acroField.getWidgets();
      const refs = widgets.map((w) => doc.context.getObjectRef(w.dict)?.toString() ?? '');
      if (refs.length && refs.every((r) => dropped.has(r))) form.removeField(field);
    }
  }
  for (let i = total - 1; i >= 0; i--) if (!keep.has(i)) doc.removePage(i);
  return doc.save();
};

export interface BlankFormReport {
  pages: number;
  /** An early-release draft carries a cover sheet without fields. */
  draft: boolean;
  fieldCount: number;
  /** Map entries that no longer resolve to exactly one field. */
  unmapped: string[];
}

/** Checks a blank IRS PDF against the year's field map: is it a draft, and does every mapped line still exist? */
export const inspectBlankForm = async (lib: PdfLibModule, year: FormYear, form: FormId, bytes: Uint8Array): Promise<BlankFormReport> => {
  const doc = await lib.PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const fields = doc.getForm().getFields().map((field) => ({ name: field.getName(), field }));
  const unmapped: string[] = [];
  for (const [key, short] of Object.entries(FIELD_MAPS[year][form])) {
    try { resolveField(fields, short); } catch { unmapped.push(key); }
  }
  return { pages: doc.getPageCount(), draft: coverPageCount(doc, lib) > 0, fieldCount: fields.length, unmapped };
};

export interface FilledForm {
  form: FormId;
  copy: number;
  title: string;
  fileName: string;
  bytes: Uint8Array;
}

/** Fills every form the return needs. `blanks` supplies the IRS PDF for a form id. */
export const fillReturn = async (
  lib: PdfLibModule,
  year: FormYear,
  entries: FormValues[],
  blanks: (form: FormId) => Promise<Uint8Array>,
  opts: { flatten?: boolean } = {},
): Promise<FilledForm[]> => {
  const maps = FIELD_MAPS[year];
  const out: FilledForm[] = [];
  const cache = new Map<FormId, Uint8Array>();
  for (const e of entries) {
    let blank = cache.get(e.form);
    if (!blank) { blank = await blanks(e.form); cache.set(e.form, blank); }
    const bytes = await fillForm(lib, blank, maps[e.form], e.values, { flatten: opts.flatten ?? false, ...(e.pages ? { pages: e.pages } : {}) });
    const suffix = e.copy ? `-${e.copy + 1}` : '';
    out.push({ form: e.form, copy: e.copy, title: FORM_TITLES[e.form] + (e.copy ? ` (${e.copy + 1})` : ''), fileName: `${e.form}${suffix}.pdf`, bytes });
  }
  return out;
};

/** One flattened PDF with the attached forms in IRS sequence order, for printing and mailing. */
export const assemblePackage = async (lib: PdfLibModule, filled: FilledForm[]): Promise<Uint8Array> => {
  const merged = await lib.PDFDocument.create();
  const order = (f: FilledForm): number => ATTACHMENT_ORDER.indexOf(f.form) * 100 + f.copy;
  const attached = filled.filter((f) => ATTACHMENT_ORDER.includes(f.form)).sort((a, b) => order(a) - order(b));
  for (const f of attached) {
    const src = await lib.PDFDocument.load(f.bytes, { ignoreEncryption: true, updateMetadata: false });
    src.getForm().flatten();
    const pages = await merged.copyPages(src, src.getPageIndices());
    for (const pg of pages) merged.addPage(pg);
  }
  return merged.save();
};
