/** Node side of the form filler: reads the blank IRS PDFs from forms/<year> and writes the output files. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as PdfLib from 'pdf-lib';
import type { ComputedReturn } from '../engine';
import type { TaxReturn } from '../model';
import { assemblePackage, fillReturn, type FilledForm } from './fill';
import type { FormId, FormYear } from './fieldMaps';
import { buildFormValues } from './values';

export const FORMS_DIR = fileURLToPath(new URL('../../forms/', import.meta.url));

export const blankFormPath = (year: FormYear, form: FormId): string => join(FORMS_DIR, String(year), `${form}.pdf`);

export const readBlankForm = async (year: FormYear, form: FormId): Promise<Uint8Array> => {
  const path = blankFormPath(year, form);
  if (!existsSync(path)) throw new Error(`blank form missing: ${path} (run: npm run fetch-forms -- ${year})`);
  return new Uint8Array(readFileSync(path));
};

export interface ProduceResult {
  files: string[];
  packageFile: string | null;
  separate: string[];
  forms: FilledForm[];
}

/** Writes one PDF per form plus the mailing package into outDir. */
export const produceForms = async (ret: TaxReturn, c: ComputedReturn, outDir: string, opts: { flatten?: boolean } = {}): Promise<ProduceResult> => {
  const year = ret.taxYear as FormYear;
  const entries = buildFormValues(ret, c);
  const forms = await fillReturn(PdfLib, year, entries, (form) => readBlankForm(year, form), opts);
  mkdirSync(outDir, { recursive: true });
  const files: string[] = [];
  const separate: string[] = [];
  for (const f of forms) {
    const path = join(outDir, f.fileName);
    writeFileSync(path, f.bytes);
    files.push(path);
    if (f.form === 'f3520') separate.push(path);
  }
  const pkg = await assemblePackage(PdfLib, forms);
  const packageFile = join(outDir, `return-${year}.filled.pdf`);
  writeFileSync(packageFile, pkg);
  return { files, packageFile, separate, forms };
};
