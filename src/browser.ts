/** Browser bundle entry: exposes the engine as the global `TaxEngine`. */
export { computeReturn } from './engine';
export { parseReturn, TaxReturnSchema } from './model';
export { paramsFor, supportedYears } from './params';
export { caParamsFor } from './params/ca';
export { fmt } from './money';
export { parseTaxDocument, parseTaxDocuments, detectDocType, normalizeItems, lotFromParsed } from './import/parse';
export { wordsToItems, wordsFromResult, isImageFile } from './import/ocr';
export { buildFormValues } from './pdf/values';
export { fillReturn, assemblePackage, inspectBlankForm } from './pdf/fill';
export { FORM_TITLES, ATTACHMENT_ORDER, SEPARATE_FORMS, FIELD_MAPS, IRS_FORM_URLS } from './pdf/fieldMaps';
