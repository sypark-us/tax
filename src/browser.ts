/** Browser bundle entry: exposes the engine as the global `TaxEngine`. */
export { computeReturn } from './engine';
export { parseReturn, TaxReturnSchema } from './model';
export { paramsFor, supportedYears } from './params';
export { caParamsFor } from './params/ca';
export { fmt } from './money';
export { parseTaxDocument, parseTaxDocuments, detectDocType, normalizeItems, lotFromParsed } from './import/parse';
export { wordsToItems, wordsFromResult, isImageFile } from './import/ocr';
