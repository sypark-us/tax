# Design: personal US federal tax preparer, 2027 filing season (tax year 2026)

Status: proposal for review. No application code yet.
Date: 2026-10-13

## 1. Goal

A program you run on your own machine that:

1. Lets you enter your tax documents (W-2, 1099-INT/DIV/B, 1099-R, SSA-1099, 1098, HSA, estimated payments, dependents).
2. Walks you through a short interview, TurboTax style, so you don't need to know which schedules apply.
3. Computes the complete federal return.
4. Produces the final, filled IRS PDFs (Form 1040 plus every required schedule) ready to print, sign, and mail, plus a plain-English summary.

## 2. Assumptions (say so if any is wrong)

- "2027 tax program" means the return you file in early 2027, which is **tax year 2026**. All parameters below are TY2026.
- Federal only in v1. State returns are a later phase.
- One household, run locally. No server, no accounts, no network calls after install.
- You are the only user, so this is not a product that must satisfy IRS software-vendor rules.

## 3. The one hard constraint: no e-file

IRS electronic filing goes through Modernized e-File (MeF). To submit through it, software must be registered (EFIN and ETIN via the IRS e-file application), pass the IRS Assurance Testing System scenarios each year, and get a per-year software ID. That is a vendor process, not something a personal tool can do. Direct File used the same MeF API and its code is now archived.

So the output of this program is **completed IRS PDFs for paper filing**. If you want to e-file, you transcribe the final numbers into IRS Free File Fillable Forms, which is free and accepts any income level. The program will print a line-by-line transcription sheet to make that fast. This is exactly how the two mature open-source projects (UsTaxes, OpenTaxSolver) work.

## 4. Scope

### v1 (target: usable for your own TY2026 return)

Income and documents:
- W-2 (multiple, both spouses), including Box 12 codes that matter (D, W, DD, etc.)
- 1099-INT, 1099-DIV (ordinary vs qualified, capital gain distributions, foreign tax)
- 1099-B: stock sales with cost basis, short/long term, wash-sale adjustments, broker CSV import (Fidelity, Schwab, Robinhood, Vanguard formats)
- 1099-R, SSA-1099, 1099-G (state refund), 1098 (mortgage interest), 1098-E. 1095-A not in v1
- HSA (Form 8889), estimated tax payments, prior-year capital loss carryover

Forms produced:
- Form 1040, Schedules 1, 2, 3
- Schedule A (itemized, with the $40,400 SALT cap and its phase-down) and the standard-vs-itemized decision
- Schedule B, Schedule D, Form 8949
- Schedule 1-A (new OBBBA deductions: tips, overtime, senior, car-loan interest)
- Schedule 8812 (child tax credit), Form 8889 (HSA), Form 8959 and 8960 (additional Medicare, NIIT)
- Form 6251 (AMT) at least as a check that AMT doesn't apply, full computation if it does
- Qualified Dividends and Capital Gain Tax Worksheet, Schedule D Tax Worksheet
- Form 1040-V and a summary sheet
- Foreign inheritance set: Form 3520 Part IV (separate mailing, threshold and penalty check), inherited property sale with IRC 1014 basis on Form 8949 Box F, Form 1116 passive category with the rate differential adjustment and carryover, Form 8938 Parts I, III and V for accounts. Treaty rates and the general category are out of scope.
- FinCEN Form 114 (FBAR) worksheet: not an IRS form and not mailable, so the engine decides who must file, converts at the Treasury year-end rate, lays accounts out by Part for the BSA E-Filing System, and fills Schedule B Part III. Form 8938 is only threshold-checked.

### Later
- Schedule C / SE, Schedule E, K-1s, foreign tax credit (1116), education credits, EV and energy credits, 1095-A/8962
- State returns
- PDF import / OCR of documents

## 5. Recommended architecture

**Language: TypeScript on Node.** Reasons: one language for engine, CLI, and web UI; the best PDF form-filling library (pdf-lib) runs anywhere; UsTaxes is in TypeScript so its field maps and test fixtures are directly readable. Nothing is installed on this machine yet; `winget install OpenJS.NodeJS.LTS` is the only prerequisite.

Four layers, strictly one-directional, no layer reaches up:

```
 parameters/2026.ts     numbers only: brackets, deductions, caps, phase-outs, each with a source citation
        |
 engine/                pure functions: Return (your data) -> ComputedReturn (every line of every form)
        |
 forms/2026/            per-form field maps: line -> AcroForm field name in the official IRS PDF
        |
 ui/  (cli first, web second)   interview, document entry, review, "print my return"
```

### 5.1 Data model

One JSON document per return (`data/2026.taxreturn.json`, git-ignored and optionally encrypted with a passphrase). Shape:

```
{ taxYear: 2026, filingStatus, taxpayer, spouse?, dependents[],
  w2s[], int1099s[], div1099s[], b1099s[] (lots), r1099s[], ssa1099s[],
  itemized: { mortgageInterest, stateTaxesPaid, propertyTax, charity, medical },
  hsa, estimatedPayments[], carryovers: { capitalLoss },
  newDeductions: { qualifiedTips, qualifiedOvertime, carLoanInterest } }
```

Validated with zod at the boundary so bad input fails before computation.

### 5.2 Engine

- Every form line is a pure function of the data plus the parameters. No mutation, no I/O.
- Computed forms are a tree: `F1040 -> { sched1, sched2, sched3, schedA?, schedB?, schedD?, f8949[], ... }`. A schedule is only "present" if the IRS rules say it must be attached, and that decision is itself a tested function.
- Money is integer cents, never floating point. IRS rounding (whole dollars on forms) happens once, at form rendering.
- Worksheets are first-class: the Qualified Dividends and Capital Gain Tax Worksheet is a function with a unit test per IRS example.
- The parameters file has one entry per number with its source (Rev. Proc. 2025-32 section, or IRC section as amended by OBBBA).

### 5.3 Forms and PDF

- Official IRS PDFs live in `forms/2026/pdf/`. Build on the IRS **draft** 2026 forms now (Schedule B, D, and 8949 drafts are already posted); swap in final forms when the IRS releases them, typically December 2026 to January 2027. Field names rarely move between draft and final, and a contract test catches it when they do.
- A generated JSON schema per PDF (`forms/2026/schema/f1040.json`) lists every AcroForm field. A test asserts the field map only references fields that exist. This is the pattern UsTaxes uses and it is what makes the yearly form swap safe.
- Output: one merged PDF in IRS attachment order (1040, then schedules by sequence number), plus `summary.md` with the key lines, refund or amount owed, effective and marginal rate, and a transcription sheet for Free File Fillable Forms.

### 5.4 UI

- **Phase 1: CLI.** `tax init`, `tax add w2`, `tax import 1099b broker.csv`, `tax compute`, `tax print`. Fast to build, scriptable, and enough to verify the engine against your real numbers.
- **Phase 2: local web app** (Vite + React, served from `localhost`). TurboTax-like sections: About you, Income, Deductions, Credits, Review, Print. Each section shows the running refund/owed number. Same engine, same data file.

### 5.5 Interview logic

Keep it simple: a hand-written ordered list of sections with "show this section if" predicates over the data (for example, show Schedule 1-A questions only if any W-2 reports tips or overtime, or anyone is 65 or older). The IRS Fact Graph is a general rules engine for this, but it is Scala, archived, and overkill for one household.

## 6. Tax-year-2026 parameters

Verified from the IRS news release for Rev. Proc. 2025-32 (IR-2025-103) unless marked otherwise.

| Item | TY2026 value |
| --- | --- |
| Standard deduction | $16,100 single/MFS, $32,200 MFJ, $24,150 HoH |
| Brackets (single) | 10% to $12,400; 12% to $50,400; 22% to $105,700; 24% to $201,775; 32% to $256,225; 35% to $640,600; 37% above |
| Brackets (MFJ) | 10% to $24,800; 12% to $100,800; 22% to $211,400; 24% to $403,550; 32% to $512,450; 35% to $768,700; 37% above |
| AMT exemption | $90,100 single (phase-out from $500,000); $140,200 MFJ (from $1,000,000) |
| EITC max, 3+ children | $8,231 |
| LTCG 0% ceiling | $49,450 single/MFS, $98,900 MFJ, $66,200 HoH (secondary sources citing Rev. Proc. 2025-32; confirm in the Rev. Proc. text) |
| Child tax credit | $2,200 per child, $1,700 refundable (secondary sources; confirm) |
| SALT cap | $40,400, phasing down above $505,000 MAGI, floor $10,000 (secondary sources; confirm MFS half-amounts) |
| Tips deduction | up to $25,000, phase-out above $150k/$300k MAGI (OBBBA statute) |
| Overtime deduction | up to $12,500 / $25,000 MFJ, same phase-out (OBBBA statute) |
| Senior deduction | $6,000 per person 65+, phases out 6% of MAGI over $75k/$150k (OBBBA statute; confirm) |

Still to pull from the Rev. Proc. itself: LTCG 15% ceilings, additional standard deduction for 65+/blind, kiddie tax threshold, full EITC table, HSA limits. The parameters file will carry a `verified: true|false` flag per entry and the engine refuses to print a final return while any used parameter is unverified.

## 7. Alternatives considered

| Option | Pros | Cons | Verdict |
| --- | --- | --- | --- |
| **A. Build a new TypeScript engine (recommended)**, use UsTaxes as reference | Small, fully understood, testable core; parameters and forms isolated per year; you own correctness | More upfront work than forking; must build field maps for about 15 forms (UsTaxes' maps and formgen tool cut this a lot) | **Choose** |
| B. Fork UsTaxes and add TY2026 | Working app today for TY2020-2025 with W-2, 1099-B, 8949, 8889, 8959, 8960; Redux data model; PDF filling solved | AGPL-3.0 (fine for personal use, viral if you ever publish); large React/Redux codebase to learn; parameters are scattered in per-year form code, not one file; no Schedule 1-A yet | Good fallback if speed matters more than ownership. Also the best **oracle** to cross-check engine output for TY2025 |
| C. Fork IRS Direct File / Fact Graph | Legally reviewed interview logic | Scala/JVM + Scala.js, archived and unmaintained, logic is TY2024, e-file path unusable, huge | No |
| D. OpenTaxSolver (C) | Simple text-in, PDF-out | Last public release around TY2020, C, no interview | No, but its line-by-line approach is a sanity check |
| E. Python | Great numeric tooling | Not installed either; weaker browser-side story for Phase 2; PDF filling (pypdf) is fine but UsTaxes assets don't transfer | Not chosen |

## 8. Risks

1. **Correctness.** Your money is on the line. Mitigation: first year, prepare the return in this tool *and* in a commercial product or Free File Fillable Forms, and reconcile every line before mailing. Keep the reconciliation as a test fixture.
2. **Final 2026 forms and instructions arrive late (Dec 2026 to Jan 2027).** Mitigation: build on drafts, contract-test field names, keep a `FORMS_STATUS.md` listing draft vs final per form.
3. **OBBBA is new and the 2025 instructions for Schedule 1-A are the first real guidance.** Mitigation: implement from the IRS 2025 Schedule 1-A instructions, then diff against the 2026 version.
4. **Privacy.** SSNs and income on disk. Mitigation: data directory git-ignored, optional passphrase encryption, no telemetry, no network.
5. **Scope creep toward "all of TurboTax."** Mitigation: v1 scope above is frozen until your own return prints correctly.

## 9. Validation plan

- Unit tests per worksheet and per form line, using the worked examples in IRS Publication 17 and the form instructions.
- Property tests: tax is monotonic non-decreasing in taxable income; standard-vs-itemized picks the larger; 8949 totals equal Schedule D lines.
- Oracle tests: run the engine for **TY2025** against UsTaxes on identical fixtures and require line-for-line equality. This proves the engine before any 2026 numbers exist.
- Contract tests: every field-map entry resolves to a real AcroForm field in the PDF in `forms/2026/pdf/`.
- End-to-end: a synthetic household fixture goes from JSON to merged PDF; a snapshot of the extracted field values is committed.
- Real-data check: your own TY2025 documents through the engine versus your filed 2025 return.

## 10. Acceptance criteria for v1

1. Entering a household with two W-2s, interest, dividends, a 1099-B with 30 lots including a wash sale, an HSA, and two children produces a merged PDF containing Form 1040, Schedules 1, 2, 3, B, D, 8812, Form 8949, 8889, and 8960, with no empty required field and every schedule in IRS sequence order.
2. The same household computed for TY2025 matches UsTaxes line-for-line.
3. Every parameter used by the computed return is marked verified with a citation, or printing is refused.
4. Switching from a draft IRS PDF to the final one requires only replacing the PDF and running the contract test.
5. The CLI completes the flow above in under five commands, and the web UI completes it with no CLI use.
6. No network access is attempted at runtime (verified by running with networking disabled).

## 11. Milestones

1. Toolchain and skeleton: Node LTS, Vitest, zod, pdf-lib; parameters file with citations; data model.
2. Engine core: 1040 main lines, brackets, standard deduction, W-2, Schedule B, QD/CG worksheet. Oracle test vs UsTaxes for TY2025.
3. Capital gains: 1099-B lots, wash sales, 8949/Schedule D, carryovers, broker CSV import.
4. Credits and extras: 8812, 8889, 8959/8960, 6251 check, Schedule A with SALT, Schedule 1-A.
5. PDF output: field maps for all v1 forms, merged PDF, summary and transcription sheet.
6. CLI polish, then web interview.
7. January 2027: swap in final forms, re-verify parameters against final instructions, do the parallel-prep reconciliation.

## 12. Sources

- IRS, IR-2025-103, inflation adjustments for TY2026 including OBBBA amendments: https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2026-including-amendments-from-the-one-big-beautiful-bill
- Rev. Proc. 2025-32 (PDF): https://www.irs.gov/pub/irs-drop/rp-25-32.pdf
- Journal of Accountancy summary of Rev. Proc. 2025-32: https://www.journalofaccountancy.com/news/2025/oct/annual-inflation-adjustments-announced-for-tax-year-2026/
- Current Federal Tax Developments, Rev. Proc. 2025-32 analysis (LTCG, CTC figures): https://www.currentfederaltaxdevelopments.com/blog/2025/10/9/2026-inflation-adjustments-for-tax-professionals-revenue-procedure-2025-32-analysis
- OBBBA individual provisions overview: https://www.taxslayer.com/blog/one-big-beautiful-bill-act/ and https://blog.taxbandits.com/one-big-beautiful-bill-act-12-key-tax-changes-for-2026/
- IRS software developers technical fact sheet (MeF, EFIN/ETIN, ATS): https://www.irs.gov/e-file-providers/software-developers-technical-fact-sheet
- IRS draft forms index (2026 Schedule B, D, 8949 drafts posted): https://www.irs.gov/draft-tax-forms
- UsTaxes README and architecture: https://github.com/ustaxes/UsTaxes (AGPL-3.0)
- IRS Direct File (archived): https://github.com/IRS-Public/direct-file
- OpenTaxSolver: https://opentaxsolver.sourceforge.net/
