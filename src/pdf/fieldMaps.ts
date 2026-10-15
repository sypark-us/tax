/**
 * Where each line of the computed return lands on the IRS fill-in PDFs.
 *
 * Keys are the form's own line numbers (plus a few named header cells);
 * values are the tail of the PDF field name, enough to be unique within the
 * form. `f1_47` means the field whose full name ends in `.f1_47[0]`;
 * `Checkbox_ReadOrder.c1_8[1]` pins a checkbox that shares its short name
 * with another one. The maps were written from `scripts/pdf-layout.mjs`
 * dumps of the forms in `forms/<year>/` and are checked by tests/forms.test.ts
 * against those files, so a new IRS revision shows up as a failing test.
 *
 * 2026 maps follow the IRS early-release drafts (watermarked DRAFT); replace
 * the files in forms/2026 with the finals when they are issued and re-run the
 * tests.
 */

export type FormId =
  | 'f1040' | 'f1040s1' | 'f1040s1a' | 'f1040s2' | 'f1040s3' | 'f1040sa' | 'f1040sb' | 'f1040sd' | 'f8949'
  | 'f1040sse' | 'f1116' | 'f1040s8' | 'f8995' | 'f8959' | 'f8960' | 'f8938' | 'f3520';

export type FieldMap = Record<string, string>;
export type FormYear = 2025 | 2026;

export const FORM_TITLES: Record<FormId, string> = {
  f1040: 'Form 1040', f1040s1: 'Schedule 1', f1040s1a: 'Schedule 1-A', f1040s2: 'Schedule 2', f1040s3: 'Schedule 3',
  f1040sa: 'Schedule A', f1040sb: 'Schedule B', f1040sd: 'Schedule D', f8949: 'Form 8949', f1040sse: 'Schedule SE',
  f1116: 'Form 1116', f1040s8: 'Schedule 8812', f8995: 'Form 8995', f8959: 'Form 8959', f8960: 'Form 8960',
  f8938: 'Form 8938', f3520: 'Form 3520',
};

/** IRS attachment sequence: the order the pages go in the mailed package. */
export const ATTACHMENT_ORDER: FormId[] = [
  'f1040', 'f1040s1', 'f1040s1a', 'f1040s2', 'f1040s3', 'f1040sa', 'f1040sb', 'f1040sd', 'f8949', 'f1040sse',
  'f1116', 'f1040s8', 'f8995', 'f8959', 'f8960', 'f8938',
];

/** Forms that are mailed on their own, not attached to the 1040. */
export const SEPARATE_FORMS: FormId[] = ['f3520'];

const seq = (prefix: string, from: number, count: number, step = 1, pad = 2): string[] =>
  Array.from({ length: count }, (_, i) => `${prefix}${String(from + i * step).padStart(pad, '0')}`);

// ---------------------------------------------------------------- Form 1040
const f1040Header: FieldMap = {
  firstName: 'f1_14', lastName: 'f1_15', ssn: 'f1_16',
  spouseFirstName: 'f1_17', spouseLastName: 'f1_18', spouseSsn: 'f1_19',
  street: 'f1_20', apt: 'f1_21', city: 'f1_22', state: 'f1_23', zip: 'f1_24',
  presidentialYou: 'c1_6', presidentialSpouse: 'c1_7',
  mfsSpouseName: 'f1_28', qualifyingChildName: 'f1_29',
  digitalYes: 'c1_10[0]', digitalNo: 'c1_10[1]',
  dep1First: 'f1_31', dep2First: 'f1_32', dep3First: 'f1_33', dep4First: 'f1_34',
  dep1Last: 'f1_35', dep2Last: 'f1_36', dep3Last: 'f1_37', dep4Last: 'f1_38',
  dep1Ssn: 'f1_39', dep2Ssn: 'f1_40', dep3Ssn: 'f1_41', dep4Ssn: 'f1_42',
  dep1Rel: 'f1_43', dep2Rel: 'f1_44', dep3Rel: 'f1_45', dep4Rel: 'f1_46',
  '1a': 'f1_47', '1b': 'f1_48', '1c': 'f1_49', '1d': 'f1_50', '1e': 'f1_51', '1f': 'f1_52', '1g': 'f1_53', '1h': 'f1_55', '1i': 'f1_56', '1z': 'f1_57',
  '2a': 'f1_58', '2b': 'f1_59', '3a': 'f1_60', '3b': 'f1_61', '4a': 'f1_62', '4b': 'f1_63', '5a': 'f1_65', '5b': 'f1_66', '6a': 'f1_68', '6b': 'f1_69',
  '7a': 'f1_70', '8': 'f1_72', '9': 'f1_73', '10': 'f1_74', '11a': 'f1_75',
  '11b': 'f2_01', you65: 'c2_5', youBlind: 'c2_6', spouse65: 'c2_7', spouseBlind: 'c2_8',
};

const f1040_2025: FieldMap = {
  ...f1040Header,
  fsSingle: 'Checkbox_ReadOrder.c1_8[0]', fsMfj: 'Checkbox_ReadOrder.c1_8[1]', fsMfs: 'Checkbox_ReadOrder.c1_8[2]', fsHoh: 'Page1.c1_8[0]', fsQss: 'Page1.c1_8[1]',
  dep1Ctc: 'Dependent1.c1_28[0]', dep1Odc: 'Dependent1.c1_28[1]', dep2Ctc: 'Dependent2.c1_29[0]', dep2Odc: 'Dependent2.c1_29[1]',
  dep3Ctc: 'Dependent3.c1_30[0]', dep3Odc: 'Dependent3.c1_30[1]', dep4Ctc: 'Dependent4.c1_31[0]', dep4Odc: 'Dependent4.c1_31[1]',
  '7bNoScheduleD': 'c1_43',
  '12e': 'f2_02', '13a': 'f2_03', '13b': 'f2_04', '14': 'f2_05', '15': 'f2_06', '16': 'f2_08', '17': 'f2_09', '18': 'f2_10',
  '19': 'f2_11', '20': 'f2_12', '21': 'f2_13', '22': 'f2_14', '23': 'f2_15', '24': 'f2_16',
  '25a': 'f2_17', '25b': 'f2_18', '25c': 'f2_19', '25d': 'f2_20', '26': 'f2_21', '27a': 'f2_23', '28': 'f2_24', '29': 'f2_25', '30': 'f2_26', '31': 'f2_27',
  '32': 'f2_28', '33': 'f2_29', '34': 'f2_30', '35a': 'f2_31', routing: 'f2_32', checking: 'c2_16[0]', savings: 'c2_16[1]', account: 'f2_33',
  '36': 'f2_34', '37': 'f2_35', '38': 'f2_36', designeeNo: 'c2_17[1]',
  occupation: 'f2_40', spouseOccupation: 'f2_42', phone: 'f2_44', email: 'f2_45',
};

const f1040_2026: FieldMap = {
  ...f1040Header,
  fsSingle: 'Page1.c1_8[0]', fsMfj: 'Page1.c1_8[1]', fsMfs: 'Page1.c1_8[2]', fsHoh: 'HOH-QSS_ReadOrder.c1_8[0]', fsQss: 'HOH-QSS_ReadOrder.c1_8[1]',
  citizenYouYes: 'c1_11[0]', citizenYouNo: 'c1_11[1]', citizenSpouseYes: 'c1_12[0]', citizenSpouseNo: 'c1_12[1]',
  dep1Ctc: 'Dependent1.c1_30[0]', dep1Odc: 'Dependent1.c1_30[1]', dep2Ctc: 'Dependent2.c1_31[0]', dep2Odc: 'Dependent2.c1_31[1]',
  dep3Ctc: 'Dependent3.c1_32[0]', dep3Odc: 'Dependent3.c1_32[1]', dep4Ctc: 'Dependent4.c1_33[0]', dep4Odc: 'Dependent4.c1_33[1]',
  '7bNoScheduleD': 'c1_45',
  '12e': 'f2_02', '12f': 'f2_03', '13a': 'f2_04', '13b': 'f2_05', '14': 'f2_06', '15': 'f2_07', '16': 'f2_09', '17': 'f2_10', '18': 'f2_11',
  '19': 'f2_12', '20': 'f2_13', '21': 'f2_14', '22': 'f2_15', '23': 'f2_16', '24a': 'f2_17', '24b': 'f2_18', '24c': 'f2_19',
  '25a': 'f2_20', '25b': 'f2_21', '25c': 'f2_22', '25d': 'f2_23', '26': 'f2_24', '27a': 'f2_26', '28': 'f2_27', '29': 'f2_28', '30': 'f2_29', '31': 'f2_30',
  '32a': 'f2_31', '32b': 'f2_32', '32c': 'f2_33', '33': 'f2_34', '34': 'f2_35', '35a': 'f2_36', routing: 'f2_37', checking: 'c2_15[0]', savings: 'c2_15[1]', account: 'f2_38',
  '36': 'f2_39', '37': 'f2_40', '38': 'f2_41', designeeNo: 'c2_16[1]',
  occupation: 'f2_45', spouseOccupation: 'f2_47', phone: 'f2_49', email: 'f2_50',
};

// ---------------------------------------------------------------- Schedules 1, 2, 3
const f1040s1: FieldMap = {
  name: 'f1_01', ssn: 'f1_02',
  '1': 'f1_04', '3': 'f1_07', '5': 'f1_09', '7': 'f1_12', '8zType': 'f1_35', '8z': 'f1_36', '9': 'f1_37', '10': 'f1_38',
  '11': 'f2_01', '13': 'f2_03', '15': 'f2_05', '16': 'f2_06', '17': 'f2_07', '20': 'f2_12', '21': 'f2_13', '24zType': 'f2_27', '24z': 'f2_28', '25': 'f2_29', '26': 'f2_30',
};

const f1040s2_2025: FieldMap = {
  name: 'f1_01', ssn: 'f1_02',
  '2': 'f1_12', '3': 'f1_13', '4': 'f1_15', '11': 'f1_22', '12': 'f1_23', '21': 'f2_24',
};
const f1040s2_2026: FieldMap = {
  name: 'f1_01', ssn: 'f1_02',
  '2': 'f1_12', '3': 'f1_13', '4': 'f1_15', '6': 'f1_17', '11': 'f1_22', '15': 'f2_07', '17b': 'f2_12', '17d': 'f2_14', '20': 'f2_19', '21': 'f2_20',
};

const f1040s3_2025: FieldMap = { name: 'f1_01', ssn: 'f1_02', '1': 'f1_03', '8': 'f1_25', '10': 'f1_27', '11': 'f1_28', '15': 'f1_37' };
const f1040s3_2026: FieldMap = { name: 'f1_01', ssn: 'f1_02', '1': 'f1_03', '8': 'f1_25', '10': 'f1_27', '11': 'f1_28', '15': 'f1_38' };

// ---------------------------------------------------------------- Schedule A
const f1040sa_2025: FieldMap = {
  name: 'f1_1', ssn: 'f1_2',
  '1': 'f1_3', '2': 'f1_4', '3': 'f1_5', '4': 'f1_6', '5a': 'f1_7', '5b': 'f1_8', '5c': 'f1_9', '5d': 'f1_10', '5e': 'f1_11', '7': 'f1_14',
  '8a': 'f1_15', '8e': 'f1_20', '10': 'f1_22', '11': 'f1_23', '12': 'f1_24', '14': 'f1_26', '16': 'f1_29', '17': 'f1_30', electItemize: 'Line18_ReadOrder.c1_3',
};
const f1040sa_2026: FieldMap = {
  name: 'f1_01', ssn: 'f1_02',
  '1': 'f1_03', '2': 'f1_04', '3': 'f1_05', '4': 'f1_06', '5a': 'f1_07', '5b': 'f1_08', '5c': 'f1_09', '5d': 'f1_10', '5e': 'f1_11', '7': 'f1_14',
  '8a': 'f1_15', '8e': 'f1_20', '10': 'f1_22', '11': 'f2_01', '12': 'f2_02', '13': 'f2_03', '15': 'f2_05', '17z': 'f2_18',
  limitedNo: 'Page2.c2_1[0]', limitedYes: 'Page2.c2_1[1]', '18': 'f2_19', electItemize: 'Line19_ReadOrder.c2_2',
};

// ---------------------------------------------------------------- Schedule B
const f1040sb: FieldMap = (() => {
  const m: FieldMap = { name: 'f1_01', ssn: 'f1_02', '2': 'f1_31', '4': 'f1_33', '6': 'f1_64' };
  seq('f1_', 3, 14, 2).forEach((f, i) => { m[`int${i + 1}Payer`] = f; });
  seq('f1_', 4, 14, 2).forEach((f, i) => { m[`int${i + 1}Amount`] = f; });
  seq('f1_', 34, 15, 2).forEach((f, i) => { m[`div${i + 1}Payer`] = f; });
  seq('f1_', 35, 15, 2).forEach((f, i) => { m[`div${i + 1}Amount`] = f; });
  Object.assign(m, {
    '7aYes': 'TagcorrectingSubform.c1_1[0]', '7aNo': 'TagcorrectingSubform.c1_1[1]',
    fbarYes: 'Page1.c1_2[0]', fbarNo: 'Page1.c1_2[1]', '7b': 'f1_65', '8Yes': 'c1_3[0]', '8No': 'c1_3[1]',
  });
  return m;
})();

// ---------------------------------------------------------------- Schedule D and Form 8949
const f1040sd: FieldMap = {
  name: 'f1_1', ssn: 'f1_2', qofYes: 'c1_1[0]', qofNo: 'c1_1[1]',
  '1b_d': 'f1_7', '1b_e': 'f1_8', '1b_g': 'f1_9', '1b_h': 'f1_10',
  '2_d': 'f1_11', '2_e': 'f1_12', '2_g': 'f1_13', '2_h': 'f1_14',
  '3_d': 'f1_15', '3_e': 'f1_16', '3_g': 'f1_17', '3_h': 'f1_18',
  '6': 'f1_21', '7': 'f1_22',
  '8b_d': 'f1_27', '8b_e': 'f1_28', '8b_g': 'f1_29', '8b_h': 'f1_30',
  '9_d': 'f1_31', '9_e': 'f1_32', '9_g': 'f1_33', '9_h': 'f1_34',
  '10_d': 'f1_35', '10_e': 'f1_36', '10_g': 'f1_37', '10_h': 'f1_38',
  '13': 'f1_41', '14': 'f1_42', '15': 'f1_43',
  '16': 'f2_1', '17Yes': 'c2_1[0]', '17No': 'c2_1[1]', '20Yes': 'c2_2[0]', '20No': 'c2_2[1]', '21': 'f2_4', '22Yes': 'c2_3[0]', '22No': 'c2_3[1]',
};

export const F8949_ROWS = 11;
const f8949: FieldMap = (() => {
  const m: FieldMap = {
    name: 'f1_01', ssn: 'f1_02', boxA: 'c1_1[0]', boxB: 'c1_1[1]', boxC: 'c1_1[2]',
    name2: 'f2_01', ssn2: 'f2_02', boxD: 'c2_1[0]', boxE: 'c2_1[1]', boxF: 'c2_1[2]',
    st_d: 'f1_91', st_e: 'f1_92', st_g: 'f1_94', st_h: 'f1_95',
    lt_d: 'f2_91', lt_e: 'f2_92', lt_g: 'f2_94', lt_h: 'f2_95',
  };
  const cols = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  for (const [part, prefix] of [['st', 'f1_'], ['lt', 'f2_']] as const) {
    for (let r = 0; r < F8949_ROWS; r++) {
      cols.forEach((c, i) => { m[`${part}${r + 1}${c}`] = `${prefix}${String(3 + r * 8 + i).padStart(2, '0')}`; });
    }
  }
  return m;
})();

// ---------------------------------------------------------------- Schedule SE
const f1040sse: FieldMap = {
  name: 'f1_1', ssn: 'f1_2',
  '2': 'f1_5', '3': 'f1_6', '4a': 'f1_7', '4c': 'f1_9', '6': 'f1_12', '7': 'f1_13', '8a': 'f1_14', '8d': 'f1_17', '9': 'f1_18', '10': 'f1_19', '11': 'f1_20', '12': 'f1_21', '13': 'f1_22',
};

// ---------------------------------------------------------------- Schedule 1-A
const f1040s1a_2025: FieldMap = {
  name: 'f1_01', ssn: 'f1_02', '1': 'f1_03', '3': 'f1_09',
  '4a': 'f1_10', '4c': 'f1_12', '6': 'f1_14', '7': 'f1_15', '8': 'f1_16', '9': 'f1_17', '10': 'f1_18', '11': 'f1_19', '12': 'f1_20', '13': 'f1_21',
  '14a': 'f1_22', '14c': 'f1_24', '15': 'f1_25', '16': 'f1_26', '17': 'f1_27', '18': 'f1_28', '19': 'f1_29', '20': 'f1_30', '21': 'f1_31',
  car1: 'Line22a.f2_03', '23': 'f2_07', '24': 'f2_08', '25': 'f2_09', '26': 'f2_10', '27': 'f2_11', '28': 'f2_12', '29': 'f2_13', '30': 'f2_14',
  '31': 'f2_15', '32': 'f2_16', '33': 'f2_17', '34': 'f2_18', '35': 'f2_19', '36a': 'f2_20', '36b': 'f2_21', '37': 'f2_22', total: 'f2_23',
};
const f1040s1a_2026: FieldMap = (() => {
  const m: FieldMap = {
    name: 'f1_01', ssn: 'f1_02', '1': 'f1_03', '3': 'f1_09',
    '5': 'f1_35', '8': 'f1_102', '9': 'f1_103', '10': 'f1_104', '11': 'f1_105', '12': 'f1_106', '13': 'f1_107', '14': 'f1_108', '15': 'f1_109',
    '17': 'f2_16', '20': 'f2_38', '21': 'f2_39', '22': 'f2_40', '23': 'f2_41', '24': 'f2_42', '25': 'f2_43', '26': 'f2_44', '27': 'f2_45',
    '29': 'f3_07', '30': 'f3_08', '31': 'f3_09', '32': 'f3_10', '33': 'f3_11', '34': 'f3_12', '35': 'f3_13', '36': 'f3_14',
    '37': 'f3_15', '38': 'f3_16', '39': 'f3_17', '40': 'f3_18', '41': 'f3_19', '42a': 'f3_20', '42b': 'f3_21', '43': 'f3_22', total: 'f3_23',
  };
  // Tip rows 4a-4e: employer, EIN, W-2 tips (iii), Form 4137 tips (iv), larger (v). Overtime rows 16a-16e: employer, EIN, amount.
  for (let i = 0; i < 5; i++) {
    const b = 10 + i * 5;
    m[`tip${i + 1}Employer`] = `f1_${b}`; m[`tip${i + 1}W2`] = `f1_${b + 2}`; m[`tip${i + 1}Larger`] = `f1_${b + 4}`;
    const o = 1 + i * 3;
    m[`ot${i + 1}Employer`] = `f2_${String(o).padStart(2, '0')}`; m[`ot${i + 1}Amount`] = `f2_${String(o + 2).padStart(2, '0')}`;
  }
  return m;
})();

// ---------------------------------------------------------------- Schedule 8812
const f1040s8: FieldMap = {
  name: 'f1_1', ssn: 'f1_2',
  '1': 'f1_3', '3': 'f1_8', '4': 'f1_9', '5': 'f1_10', '6': 'f1_11', '7': 'f1_12', '8': 'f1_13', '9': 'f1_14', '10': 'f1_15', '11': 'f1_16', '12': 'f1_17',
  '12No': 'c1_1[0]', '12Yes': 'c1_1[1]', '13': 'f1_18', '14': 'f1_19',
  '16a': 'f2_2', '16bCount': 'f2_3', '16b': 'f2_4', '17': 'f2_5', '18a': 'f2_6', '19No': 'c2_1[0]', '19Yes': 'c2_1[1]', '19': 'f2_8', '20': 'f2_9', '27': 'f2_16',
};

// ---------------------------------------------------------------- Forms 8959, 8960, 8995
const f8959_2025: FieldMap = {
  name: 'f1_1', ssn: 'f1_2',
  '1': 'f1_3', '4': 'f1_6', '5': 'f1_7', '6': 'f1_8', '7': 'f1_9', '8': 'f1_10', '9': 'f1_11', '10': 'f1_12', '11': 'f1_13', '12': 'f1_14', '13': 'f1_15',
  '18': 'f1_20', '19': 'f1_21', '20': 'f1_22', '21': 'f1_23', '22': 'f1_24', '24': 'f1_26',
};
const f8959_2026: FieldMap = {
  name: 'f1_1', ssn: 'f1_2',
  '1': 'f1_3', '4': 'f1_6', '5': 'f1_7', '6': 'f1_8', '7': 'f1_9', '12': 'f1_14', '13': 'f1_15', '14': 'f1_16', '15': 'f1_17', '16': 'f1_18', '17': 'f1_19',
  '18': 'f1_20', '19': 'f1_21', '20': 'f1_22', '21': 'f1_23', '22': 'f1_24', '24': 'f1_26',
};

const f8960: FieldMap = {
  name: 'f1_1', ssn: 'f1_2',
  '1': 'f1_3', '2': 'f1_4', '5a': 'f1_9', '5d': 'f1_12', '8': 'f1_15', '11': 'f1_21', '12': 'f1_22', '13': 'f1_23', '14': 'f1_24', '15': 'f1_25', '16': 'f1_26', '17': 'f1_27',
};

const f8995_2025: FieldMap = {
  name: 'f1_01', ssn: 'f1_02', biz1Name: 'f1_03', biz1Tin: 'f1_04', biz1Qbi: 'f1_05',
  '2': 'f1_18', '4': 'f1_20', '5': 'f1_21', '6': 'f1_22', '8': 'f1_24', '9': 'f1_25', '10': 'f1_26', '11': 'f1_27', '12': 'f1_28', '13': 'f1_29', '14': 'f1_30', '15': 'f1_31', '16': 'f1_32',
};
const f8995_2026: FieldMap = {
  name: 'f1_1', ssn: 'f1_2', biz1Name: 'f1_3', biz1Tin: 'f1_4', biz1Qbi: 'f1_5',
  '2': 'f1_18', '4': 'f1_20', '5': 'f1_21', '6': 'f1_22', '8': 'f1_24', '9': 'f1_25', '10': 'f1_26', '11': 'f1_27', '12': 'f1_28', '13': 'f1_29', '14': 'f1_30', '15': 'f1_31', '17': 'f1_33', '18': 'f1_34',
};

// ---------------------------------------------------------------- Form 1116 (passive category, one country column)
const f1116_2025: FieldMap = {
  name: 'f1_01', ssn: 'f1_02', passive: 'LineC-D_ReadOrder.c1_1[0]', residentOf: 'f1_03', countryA: 'Rowi.f1_04',
  '1aDesc': 'f1_07', '1aA': 'ColA.f1_10', '1a': 'f1_13',
  '3aA': 'Line3a.f1_17', '3bA': 'Line3b.f1_20', '3cA': 'Line3c.f1_23', '3dA': 'Line3d.f1_26', '3eA': 'Line3e.f1_29', '3fA': 'Line3f.f1_32', '3gA': 'Line3g.f1_35',
  '4aA': 'Line4a.f1_38', '5A': 'Line5.f1_44', '6A': 'Line6.f1_47', '6': 'f1_50', '7': 'f1_51',
  paid: 'ActiveHeaderElements.c1_3[0]', rowADate: 'RowA.f1_52', rowADividends: 'RowA.f1_57', rowAInterest: 'RowA.f1_59', rowAOther: 'RowA.f1_60', rowATotal: 'RowA.f1_61', '8': 'f1_82',
  '9': 'f2_01', '10': 'f2_02', '11': 'f2_03', '14': 'f2_06', '15': 'f2_07', '17': 'f2_09', '18': 'f2_10', '19': 'f2_11', '20': 'f2_12', '21': 'f2_13', '23': 'f2_15', '24': 'f2_16',
  '27': 'f2_19', '32': 'f2_24', '33': 'f2_25', '35': 'f2_27',
};
const f1116_2026: FieldMap = {
  name: 'f1_01', ssn: 'f1_02', passive: 'LineC-D_ReadOrder.c1_1[0]', residentOf: 'f1_03', countryA: 'Rowi.f1_04',
  '1aDesc': 'f1_07', '1aA': 'ColA.f1_08', '1a': 'f1_11',
  '3aA': 'Line3a.f1_15', '3bA': 'Line3b.f1_18', '3cA': 'Line3c.f1_21', '3dA': 'Line3d.f1_24', '3eA': 'Line3e.f1_27', '3fA': 'Line3f.f1_30', '3gA': 'Line3g.f1_33',
  '4aA': 'Line4a.f1_36', '5A': 'Line5.f1_42', '6A': 'Line6.f1_45', '6': 'f1_48', '7': 'f1_49',
  paid: 'Credit_ReadOrder.c2_1[0]', rowADate: 'Table_Part2_ColsL-Q.RowA.f2_01', rowATotal: 'Table_Part2_ColsR-W.RowA.f2_28', '8': 'f2_43',
  '9': 'f2_44', '10': 'f2_45', '11': 'f2_46', '14': 'f2_49', '15': 'f2_50', '17': 'f2_52', '18': 'f2_53', '19': 'f2_54', '20': 'f2_55', '21': 'f2_56', '23': 'f2_58', '24': 'f2_59',
  '27': 'f2_62', '32': 'f2_67', '33': 'f2_68', '35': 'f2_70',
};

// ---------------------------------------------------------------- Forms 8938 and 3520 (not revised yearly)
const f8938: FieldMap = {
  year: 'Pg1Header.f1_01', name: 'f1_07', ssn: 'f1_08', individual: 'c1_2[0]',
  '5': 'f1_11', '6': 'f1_12', '7': 'f1_13', '8': 'f1_14', '9Yes': 'c1_3[0]', '9No': 'c1_3[1]', '10': 'f1_15', '11': 'f1_16', '12No': 'c1_4[1]',
  '13aAmount': 'BodyRow13a.f1_17', '13aForm': 'BodyRow13a.f1_18', '13bAmount': 'BodyRow13b.f1_20', '13bForm': 'BodyRow13b.f1_21', '13eAmount': 'BodyRow13e.f1_29', '13eForm': 'BodyRow13e.f1_30',
  deposit: 'Line20_ReadOrder.c2_1[0]', custodial: 'Line20_ReadOrder.c2_1[1]', '21': 'f2_01', opened: 'c2_2', closed: 'c2_3', jointSpouse: 'c2_4', noTaxItem: 'c2_5',
  '23': 'f2_02', '24Yes': 'c2_6[0]', '24No': 'c2_6[1]', '25a': 'f2_03', '25b': 'f2_04', '25c': 'f2_05', '26a': 'f2_06', '27': 'f2_11', '28': 'f2_12',
};

const f3520: FieldMap = (() => {
  const m: FieldMap = {
    year: 'Page1.f1_1', initial: 'c1_1', individual: 'c1_4[0]', partIV: 'c1_9',
    name: 'f1_6', ssn: 'f1_7', street: 'f1_8', spouseSsn: 'f1_9', city: 'f1_10', state: 'f1_11', zip: 'f1_12', country: 'f1_13', joint: 'c1_10',
    '54Yes': 'c6_1[0]', '54No': 'c6_1[1]', '54Total': 'f6_10', '55Yes': 'c6_2[0]', '55No': 'c6_2[1]', '56No': 'c6_7[1]',
  };
  for (let i = 0; i < 3; i++) { m[`g${i + 1}Date`] = `f6_${1 + i * 3}`; m[`g${i + 1}Desc`] = `f6_${2 + i * 3}`; m[`g${i + 1}Fmv`] = `f6_${3 + i * 3}`; }
  for (let i = 0; i < 4; i++) {
    m[`c${i + 1}Date`] = `f6_${11 + i * 4}`; m[`c${i + 1}Name`] = `f6_${12 + i * 4}`; m[`c${i + 1}Address`] = `f6_${13 + i * 4}`; m[`c${i + 1}Tin`] = `f6_${14 + i * 4}`;
    m[`c${i + 1}Corp`] = `Row${i + 1}.c6_${3 + i}[0]`; m[`c${i + 1}Partnership`] = `Row${i + 1}.c6_${3 + i}[1]`;
    m[`c${i + 1}Desc`] = `f6_${27 + i * 2}`; m[`c${i + 1}Fmv`] = `f6_${28 + i * 2}`;
  }
  return m;
})();

export const FIELD_MAPS: Record<FormYear, Record<FormId, FieldMap>> = {
  2025: {
    f1040: f1040_2025, f1040s1, f1040s1a: f1040s1a_2025, f1040s2: f1040s2_2025, f1040s3: f1040s3_2025, f1040sa: f1040sa_2025, f1040sb, f1040sd, f8949,
    f1040sse, f1116: f1116_2025, f1040s8, f8995: f8995_2025, f8959: f8959_2025, f8960, f8938, f3520,
  },
  2026: {
    f1040: f1040_2026, f1040s1, f1040s1a: f1040s1a_2026, f1040s2: f1040s2_2026, f1040s3: f1040s3_2026, f1040sa: f1040sa_2026, f1040sb, f1040sd, f8949,
    f1040sse, f1116: f1116_2026, f1040s8, f8995: f8995_2026, f8959: f8959_2026, f8960, f8938, f3520,
  },
};

/** Expands a map value to the PDF field-name tail it must match. */
export const fieldSuffix = (short: string): string =>
  short.split('.').map((seg) => (/\[\d+\]$/.test(seg) ? seg : `${seg}[0]`)).join('.');
