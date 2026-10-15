# Yearly update: taking the final IRS forms and instructions for a tax year

Written for the 2026 return (filed in 2027). The same steps apply to every later year. The IRS posts final forms between December and January; until then the program fills the early-release drafts, which are watermarked DRAFT and cannot be filed.

Two separate layers change each year, and each has its own procedure:

1. **The paper.** Where each number is printed. Swapping a PDF never changes a computed figure.
2. **The arithmetic.** Dollar parameters, line logic and worksheets. A PDF swap never updates these.

## Part 1: swap the forms

### Route A, in the browser (no Node, no git)

1. Open `web/index.html`, pick the tax year, go to the Review tab.
2. Expand **Blank IRS forms for <year>**. Each row links to the form's final and draft copies on irs.gov. Download the finals.
3. Click **Choose downloaded PDFs** and select them (names like `f1040.pdf` or `f1040--2026.pdf` are both recognized).
4. Click **Check forms**. Each row reports final or draft, the page and field count, and the lines the program fills that were not found.
5. When every row says final with nothing unmapped, **Fill IRS forms** uses your copies. They are kept in that browser only (IndexedDB); **Remove my copy** goes back to the built-in PDF.

Use this route to file. It does not change the repository, so the next computer starts from the drafts again.

### Route B, in the repository (permanent)

```
npm run fetch-forms -- 2026     # final from irs.gov/pub/irs-prior when it exists, else the draft
npm test
```

`tests/forms.test.ts` checks that every entry in `src/pdf/fieldMaps.ts` resolves to exactly one field on the checked-in PDF, then fills a synthetic household and reads the values back. Outcomes:

- **All green.** Commit `forms/<year>/`. The DRAFT note disappears by itself (a final has no cover sheet).
- **A test names a form and a line.** The field moved or was renamed. Find it:

  ```
  node scripts/pdf-layout.mjs forms/2026/f1040.pdf                 # each printed row with the fields on it
  node scripts/pdf-layout-diff.mjs <draft.pdf> forms/2026/f1040.pdf  # field-by-field difference
  node scripts/pdf-fields.mjs forms/2026/f1040.pdf                 # raw field list
  ```

  Fix the entry under `FIELD_MAPS[2026]` in `src/pdf/fieldMaps.ts`; the key is the form line, the value is the tail of the AcroForm field name. Keep the draft under `scratch_dump/` (gitignored) for the diff before fetching.
- **A line is new on the final.** It is not a map fix; go to Part 2, step 3.

After any change: `npm test`, `npm run build:web`, then verify the filled output on a real return:

```
npm run forms -- data/my-return.json
node scripts/pdf-values.mjs data/my-return-forms/f1040.pdf     # values written, by field
node scripts/pdf-render.mjs data/my-return-forms/f1040.pdf     # PNG per page to eyeball
```

## Part 2: update the arithmetic

### Step 1: dollar parameters (can be done before the forms arrive)

Every figure for the year lives in `src/params/<year>.ts` with a `sources` note. The `unverified` list names entries taken from secondary summaries rather than the IRS text; the CLI and the web page print a warning while that list is not empty.

For 2026 the authority is Revenue Procedure 2025-32 (https://www.irs.gov/pub/irs-drop/rp-25-32.pdf) for the inflation-adjusted amounts, and the One Big Beautiful Bill Act text for the fixed statutory amounts (SALT cap, tips and overtime deductions, senior deduction, charity floor, child tax credit). For each entry: find the section, compare, correct, and remove the name from `unverified`. Entries open for 2026 as of 2026-10-14:

| Entry | Where to confirm |
| --- | --- |
| `brackets.mfs`, `brackets.hoh` | Rev. Proc. 2025-32, "Tax Rate Tables" (section 3, item .01) |
| `additionalStandardDeduction` (65+/blind) | Rev. Proc. 2025-32, "Standard Deduction" item |
| `ltcg.fifteenCeiling` | Rev. Proc. 2025-32, "Maximum Capital Gains Rate" item |
| `ctc.refundableMax` | Rev. Proc. 2025-32, "Child Tax Credit" item |
| `salt.mfs` | IRC 164(b)(7) as amended by OBBBA sec. 70120 |
| `socialSecurityWageBase` | SSA 2026 COLA fact sheet (ssa.gov) |
| `qbi.threshold` | Rev. Proc. 2025-32, "Qualified Business Income" item (IRC 199A(e)(2)) |
| `hsa` | Rev. Proc. 2025-19 (2026 HSA limits, issued May 2025) |
| `foreignGiftCorporateThreshold` | Rev. Proc. 2025-32, "Notice of Large Gifts Received from Foreign Persons" item (IRC 6039F) |

The tax table in the Form 1040 instructions is derived from the brackets with the IRS midpoint rule, which `src/engine` already applies; when the instructions are out, spot-check a few rows against `npm run compute`.

California: `src/params/ca.ts` has its own `unverified` list, filled from the FTB's December release of the indexed amounts.

### Step 2: worksheets and instructions

The Form 1040 instructions and each schedule's instructions are published with the finals. Check each worksheet the engine implements against the printed steps, line by line: Qualified Dividends and Capital Gain Tax Worksheet, Schedule 1-A phase-outs (lines 11 and 19 use floor, car loan uses ceiling), Schedule 8812, Form 8959/8960, Form 8995, Form 1116, the SALT phase-down and the standard-vs-itemized choice. The 2025 engine was checked this way against a filed return; repeat for the lines the new year changed.

### Step 3: new or renumbered lines

`scripts/pdf-layout-diff.mjs` between the draft and the final lists added, removed and renumbered lines. For each:

- **Renumbered only:** a field-map fix (Part 1).
- **New line that cannot apply to the household:** add the map entry so the test covers it, leave the value blank.
- **New line that can apply:** add the computation in `src/engine`, the output in `src/pdf/values.ts`, a model field in `src/model.ts` if it needs input, the web field in `web/template.html`, and a test.

Known from the 2026 drafts, left blank by the engine: Form 1040 line 24b (new Form 1062) and line 32b (new Schedule 3-A); 2026 Form 1116 Part II columns other than the date and the total are unmapped until the final is out.

### Step 4: regression

```
npm test
npm run compute -- data/2025-actual.json --all
```

The filed 2025 return (private, `data/`, gitignored) is the oracle for everything that did not change between years; its test asserts the balance due. For the new year, the oracle is the IRS instruction worksheets, plus any parallel preparation (another program or a preparer) entered as `expected` figures in the return file.

## Checklist

- [ ] `npm run fetch-forms -- <year>`; `npm test` green; commit `forms/<year>/`
- [ ] Field-map fixes for moved lines; new lines mapped
- [ ] `src/params/<year>.ts`: `unverified` empty, each `sources` entry cites the IRS section
- [ ] Worksheets checked against the published instructions
- [ ] New lines modelled or consciously left blank (listed in `docs/design.md` 5.3)
- [ ] `npm run build:web`; filled output of a real return eyeballed with `pdf-render.mjs`
- [ ] California: FTB indexed amounts into `src/params/ca.ts`
- [ ] README and `docs/design.md` updated; commit and push
