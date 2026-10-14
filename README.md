# tax

Personal US federal and California income tax calculator for tax years 2025 and 2026 (returns filed in 2026 and 2027). Design and scope: [docs/design.md](docs/design.md).

Not tax advice. Not an IRS e-file provider. Verify every number against the official instructions before filing.

## Setup

```
winget install OpenJS.NodeJS.LTS   # or any Node 20+
npm install
```

## Use

**Web interview.** Build once, then open `web/index.html` in a browser. It runs entirely in the page: enter documents or import W-2 and 1099 PDFs, and the refund or balance due updates as you type.

```
npm run build:web
```

**Command line.** Import source PDFs into a return file, add anything else by hand (see `tests/fixtures/sample-mfj.json` for every field), keep it under `data/`, which git ignores, then compute:

```
npm run import -- "docs/W2.pdf" "docs/1099-INT.pdf" --into data/my-return.json --owner taxpayer
npm run compute -- data/my-return.json          # Form 1040 summary
npm run compute -- data/my-return.json --all    # every schedule and worksheet
npm run compute -- data/my-return.json --json   # machine-readable
```

PDF import reads W-2 (ADP and IRS layouts), 1099-INT and 1099-DIV. Values are located by their printed box labels, so most employer and bank layouts work; anything it cannot find is reported and entered as 0. 1099-B import is not yet implemented.

## What is computed

Form 1040 lines 1 through 37; Schedules 1, 2, 3, A, B, C (net only), D, SE, 1-A, 8812; Forms 8949, 8959, 8960, 8995, 1116 (passive), 3520 Part IV, 8938; FinCEN Form 114; the Qualified Dividends and Capital Gain Tax Worksheet; the tax table midpoint rule; SALT cap with phase-down; standard-vs-itemized choice (automatic, or forced either way); capital loss limit and carryover; CTC phase-out and refundable portion; foreign tax credit direct election; excess Social Security withholding.

**Foreign accounts.** Enter each foreign bank, securities or other account with its highest balance of the year in its own currency and the Treasury year-end exchange rate (foreign units per US dollar, from [fiscaldata.treasury.gov](https://fiscaldata.treasury.gov/datasets/treasury-reporting-rates-exchange/)). The engine converts and rounds up the way FinCEN specifies, decides per spouse whether FinCEN Form 114 (FBAR) is required (aggregate over $10,000), sorts accounts into Parts II, III and IV, says when one joint FBAR with Form 114a is allowed, fills Schedule B Part III (lines 7a and 7b), and flags the Form 8938 thresholds. The FBAR is not part of the 1040: `--all` prints a transcription sheet to type into the BSA E-Filing System at bsaefiling.fincen.treas.gov, due April 15 with an automatic extension to October 15. Enter the December 31 balance as well and the Form 8938 worksheet (Parts I, III and V) is produced when its thresholds are crossed.

**California.** Form 540 with Schedule CA (540) is prepared automatically when a W-2 shows state CA (or on request under `california`). It starts from federal AGI and applies the state rules: HSA deduction and employer contributions added back, US Treasury interest exempt, capital gains at ordinary rates with an optional separate carryover (Schedule D (540)), itemized deductions without the SALT cap and without state income tax, the 6%/80% high-income limitation, the state standard deduction, personal/senior/blind/dependent exemption credits with the AGI phase-out, the tax table midpoint rule up to $100,000 and rate schedules above, the renter's credit, the 1% Behavioral Health Services Tax, and California withholding from W-2 box 17. Not modeled: Schedule P AMT, CalEITC and young child credit, the FTB 3853 health coverage penalty, use tax, other-state credit. California gives no credit for foreign taxes. 2026 figures are the FTB's published indexing; two phase-out thresholds are estimated and flagged until the FTB's December release.

**Foreign inheritance.** Three more pieces cover money or property inherited from abroad. A gift or bequest entered under `foreignGifts` is checked against the Form 3520 Part IV thresholds ($100,000 from individuals and estates, an indexed amount from corporations), and the form is listed as a separate mailing to Ogden with its due date and penalty. A sale entered under `inheritedProperty` takes the date-of-death value as basis (IRC 1014), converts each amount at its own date's rate, and lands on Form 8949 Box F as a long-term gain. Foreign tax on that sale, on foreign bank interest (1099-INT entries with a `foreignCountry`), and on 1099-DIV box 7 is credited through Form 1116 (passive category, with the rate differential adjustment and carryover) whenever the $300/$600 direct election is not available. `tests/fixtures/sample-inheritance.json` shows every field.

Not yet: AMT (Form 6251), Form 1116 general category and Form 8938 Part II (non-account assets), Form 8995-A, Form 8889 limit checks, 1099-R and Social Security benefits, education credits, other state returns, PDF output.

## Develop

```
npm test             # vitest
npm run typecheck    # tsc --noEmit
```

`tests/actual2025.test.ts` reconciles against a private `data/2025-actual.json` and is skipped when that file is absent.
