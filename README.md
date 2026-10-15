# tax

Personal US federal and California income tax calculator for tax years 2025 and 2026 (returns filed in 2026 and 2027). Design and scope: [docs/design.md](docs/design.md). Taking the final forms and instructions each January: [docs/yearly-update.md](docs/yearly-update.md).

Not tax advice. Not an IRS e-file provider. Verify every number against the official instructions before filing.

## Getting it

The repository is private, so clone it from a computer signed in to GitHub:

```
git clone https://github.com/sypark-us/tax.git
cd tax
```

The web page is committed already built, so the clone alone is enough to use it: open `web/index.html` in a browser. Nothing else is needed. The blank IRS PDFs are in the clone next to the page, so the forms fill without a network connection; only the PDF library (and the OCR engine, if you import a scan) is fetched from a CDN on first use. There is no hosted URL: GitHub Pages does not serve a private repository on a free plan.

## Setup for the command line, tests, or rebuilding the page

```
winget install OpenJS.NodeJS.LTS   # or any Node 20+
npm install
npm test                           # the test suite
npm run typecheck
```

## Use

**Web interview.** Open `web/index.html` in a browser. It runs entirely in the page: enter documents or import W-2 and 1099 PDFs, scans and photos, and the refund or balance due updates as you type. Your entries are kept in the browser and never sent anywhere. Pick the tax year (2025 or 2026) at the top; the Review tab shows every form line, fills the IRS PDFs, and holds the blank-forms panel for the yearly form swap. After editing `web/template.html` or anything under `src/`, rebuild the page:

```
npm run build:web
```

**Command line.** Import source PDFs into a return file, add anything else by hand (see `tests/fixtures/sample-mfj.json` for every field, and set `taxYear` to 2025 or 2026), keep it under `data/`, which git ignores, then compute:

```
npm run import -- "docs/W2.pdf" "docs/1099-INT.pdf" --into data/my-return.json
npm run import -- "docs/spouse-W2.pdf" --into data/my-return.json --owner spouse
npm run compute -- data/my-return.json          # Form 1040 summary
npm run compute -- data/my-return.json --all    # every schedule and worksheet
npm run compute -- data/my-return.json --json   # machine-readable
npm run forms -- data/my-return.json            # filled IRS PDFs, one per form, plus the mailing package
npm run forms -- data/my-return.json --out ~/Desktop/return --flatten   # choose the folder; make the single forms non-editable too
```

`npm run forms` writes into `<name>-forms/` next to the JSON file unless `--out` says otherwise. Those folders and every `*.filled.pdf` are gitignored as well.

**IRS forms.** `npm run forms` (or the "Fill IRS forms" button on the web page's review tab) fills the official IRS fill-in PDFs from the computed return: Form 1040 and every schedule and form the return needs, one file each (still editable in a PDF viewer), plus `return-<year>.filled.pdf`, every attached form flattened in IRS attachment-sequence order for printing, signing and mailing. Form 3520 is produced too but is mailed separately. Enter SSNs, address, occupations and bank details under `identity` (the web page's Filing info tab); nothing there affects the computation. The blank PDFs are checked in under `forms/<year>/`. The 2025 set is final. The 2026 set is the IRS early-release drafts, watermarked DRAFT and not fileable: when the IRS issues the finals (usually December to January) either run `npm run fetch-forms -- 2026` and `npm test` (the tests check that every mapped line still exists on the new PDFs, and `node scripts/pdf-layout.mjs forms/2026/f1040.pdf` prints a form's rows with its field names for fixing any that moved), or use the "Blank IRS forms" panel on the web page's review tab: it links to each form on irs.gov, takes the downloaded PDFs, keeps them in the browser in place of the built-in copies, and reports for each whether it is a draft or final and whether every line the program fills was found. Swapping the PDFs changes only where figures print; the yearly parameter and worksheet check is a separate step, described in [docs/yearly-update.md](docs/yearly-update.md). The output is for paper filing; the IRS does not let software e-file without an approved provider, so to e-file type the figures into IRS Free File Fillable Forms.

**Document import.** Reads W-2, 1099-INT, 1099-DIV, 1099-MISC and 1099-B, including consolidated brokerage statements that carry several forms in one file (verified on a Fidelity statement; built from the IRS labels rather than any issuer's layout, so other brokers should read the same way, but check the cards). Box values are located by their printed IRS labels; 1099-B sales by the table's column headings (date acquired, date sold, proceeds, cost basis, wash sale, gain/loss) and by the section titles that give the holding period and whether basis was reported, or the Form 8949 box letter. Each sale becomes a lot with wash-sale and accrued-market-discount adjustments, and the broker's printed totals are checked against the lots read. Digital PDFs are read from their text layer. Scans and photos (PNG, JPEG, or a PDF without a text layer) are read with Tesseract OCR: the web page fetches the OCR engine from a CDN on first use; on the command line `npm run import` accepts PNG and JPEG files and downloads the English model into the temp directory. Anything it cannot find is reported and entered as 0.

## What is computed

Form 1040 lines 1 through 37; Schedules 1, 2, 3, A, B, C (net only), D, SE, 1-A, 8812; Forms 8949, 8959, 8960, 8995, 1116 (passive), 3520 Part IV, 8938; FinCEN Form 114; the Qualified Dividends and Capital Gain Tax Worksheet; the tax table midpoint rule; SALT cap with phase-down; standard-vs-itemized choice (automatic, or forced either way); capital loss limit and carryover; CTC phase-out and refundable portion; foreign tax credit direct election; excess Social Security withholding.

**Foreign accounts.** Enter each foreign bank, securities or other account with its highest balance of the year in its own currency and the Treasury year-end exchange rate (foreign units per US dollar, from [fiscaldata.treasury.gov](https://fiscaldata.treasury.gov/datasets/treasury-reporting-rates-exchange/)). The engine converts and rounds up the way FinCEN specifies, decides per spouse whether FinCEN Form 114 (FBAR) is required (aggregate over $10,000), sorts accounts into Parts II, III and IV, says when one joint FBAR with Form 114a is allowed, fills Schedule B Part III (lines 7a and 7b), and flags the Form 8938 thresholds. The FBAR is not part of the 1040: `--all` prints a transcription sheet to type into the BSA E-Filing System at bsaefiling.fincen.treas.gov, due April 15 with an automatic extension to October 15. Enter the December 31 balance as well and the Form 8938 worksheet (Parts I, III and V) is produced when its thresholds are crossed.

**California.** Form 540 with Schedule CA (540) is prepared automatically when a W-2 shows state CA (or on request under `california`). It starts from federal AGI and applies the state rules: HSA deduction and employer contributions added back, US Treasury interest exempt, capital gains at ordinary rates with an optional separate carryover (Schedule D (540)), itemized deductions without the SALT cap and without state income tax, the 6%/80% high-income limitation, the state standard deduction, personal/senior/blind/dependent exemption credits with the AGI phase-out, the tax table midpoint rule up to $100,000 and rate schedules above, the renter's credit, the 1% Behavioral Health Services Tax, and California withholding from W-2 box 17. Not modeled: Schedule P AMT, CalEITC and young child credit, the FTB 3853 health coverage penalty, use tax, other-state credit. California gives no credit for foreign taxes. 2026 figures are the FTB's published indexing; two phase-out thresholds are estimated and flagged until the FTB's December release.

**Foreign inheritance.** Three more pieces cover money or property inherited from abroad. A gift or bequest entered under `foreignGifts` is checked against the Form 3520 Part IV thresholds ($100,000 from individuals and estates, an indexed amount from corporations), and the form is listed as a separate mailing to Ogden with its due date and penalty. A sale entered under `inheritedProperty` takes the date-of-death value as basis (IRC 1014), converts each amount at its own date's rate, and lands on Form 8949 Box F as a long-term gain. Foreign tax on that sale, on foreign bank interest (1099-INT entries with a `foreignCountry`), and on 1099-DIV box 7 is credited through Form 1116 (passive category, with the rate differential adjustment and carryover) whenever the $300/$600 direct election is not available. `tests/fixtures/sample-inheritance.json` shows every field.

Not yet: AMT (Form 6251), Form 1116 general category and Form 8938 Part II (non-account assets), Form 8995-A, Form 8889 limit checks, 1099-R and Social Security benefits, education credits, other state returns, California Form 540 as a filled PDF (the federal forms are done), Schedule C as a filled PDF (the figures are on Schedule 1, SE and 8995).

## Develop

```
npm test             # vitest
npm run typecheck    # tsc --noEmit
```

`tests/actual2025.test.ts` reconciles against a private `data/2025-actual.json` and is skipped when that file is absent.
