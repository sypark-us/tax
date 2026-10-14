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

Form 1040 lines 1 through 37; Schedules 1, 2, 3, A, B, C (net only), D, SE, 1-A, 8812; Forms 8949, 8959, 8960, 8995; the Qualified Dividends and Capital Gain Tax Worksheet; the tax table midpoint rule; SALT cap with phase-down; capital loss limit and carryover; CTC phase-out and refundable portion; foreign tax credit direct election; excess Social Security withholding.

Not yet: AMT (Form 6251), Form 1116, Form 8995-A, Form 8889 limit checks, 1099-R and Social Security benefits, education credits, state returns, PDF output.

## Develop

```
npm test             # vitest
npm run typecheck    # tsc --noEmit
```

`tests/actual2025.test.ts` reconciles against a private `data/2025-actual.json` and is skipped when that file is absent.
