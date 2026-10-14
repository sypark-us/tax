# tax

Personal US federal income tax calculator for tax years 2025 and 2026 (returns filed in 2026 and 2027). Design and scope: [docs/design.md](docs/design.md).

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

Form 1040 lines 1 through 37; Schedules 1, 2, 3, A, B, C (net only), D, SE, 1-A, 8812; Forms 8949, 8959, 8960, 8995; the Qualified Dividends and Capital Gain Tax Worksheet; the tax table midpoint rule; SALT cap with phase-down; standard-vs-itemized choice (automatic, or forced either way); capital loss limit and carryover; CTC phase-out and refundable portion; foreign tax credit direct election; excess Social Security withholding.

**Foreign accounts.** Enter each foreign bank, securities or other account with its highest balance of the year in its own currency and the Treasury year-end exchange rate (foreign units per US dollar, from [fiscaldata.treasury.gov](https://fiscaldata.treasury.gov/datasets/treasury-reporting-rates-exchange/)). The engine converts and rounds up the way FinCEN specifies, decides per spouse whether FinCEN Form 114 (FBAR) is required (aggregate over $10,000), sorts accounts into Parts II, III and IV, says when one joint FBAR with Form 114a is allowed, fills Schedule B Part III (lines 7a and 7b), and flags the Form 8938 thresholds. The FBAR is not part of the 1040: `--all` prints a transcription sheet to type into the BSA E-Filing System at bsaefiling.fincen.treas.gov, due April 15 with an automatic extension to October 15.

Not yet: AMT (Form 6251), Form 1116, Form 8938, Form 8995-A, Form 8889 limit checks, 1099-R and Social Security benefits, education credits, state returns, PDF output.

## Develop

```
npm test             # vitest
npm run typecheck    # tsc --noEmit
```

`tests/actual2025.test.ts` reconciles against a private `data/2025-actual.json` and is skipped when that file is absent.
