# Retirement Planner — Model Confidence & Blindspot Notes

> Reference document capturing (1) the least-confident areas of the calculation engine and
> (2) the biggest blindspots in the current setup, from the review on 2026-07-06.
> File references point to `src/app/core/calculators/`.

---

## Part 1 — Least-Confident Areas (ranked, most severe first)

### 1. Fixed 2026 tax tables over a 30-year simulation (biggest concern)

- `tax-tables.ts` contains only 2026 brackets, applied as **nominal, un-indexed** values to every simulated year.
- Living expenses inflate at 3% (`EXPENSE_INFLATION_RATE`, `roth-conversion-calculator.ts:28`) and balances compound, but brackets stay frozen.
- This creates artificial bracket creep: by age 85+ the simulation pushes inflated dollars through frozen 2026 brackets, systematically **overstating future RMD tax pain** and therefore **overstating the benefit of converting early**.
- In reality brackets are inflation-indexed annually; over 30 years nominal brackets roughly double.

**Mitigation analysis — "re-run every year with updated tables":**
- *What it fixes:* the current year's numbers. Only year one of a plan is ever acted on before re-planning, so errors never accumulate across real decisions (rolling-horizon planning).
- *What it does NOT fix:* the bias inside each projection — every run still applies one year's brackets, frozen, to all 25–30 future years. This year's decision is still made from a biased comparison.
- *Mechanical gotcha:* the simulation uses one fixed tax year for all simulated years (`input.taxYear ?? 2026`, `roth-conversion-calculator.ts:56`), and `scenario-engine.ts:37,124` hardcode `getTaxTable(2026, ...)`. Adding a 2027 table would not be picked up until those call sites change.
- *Recommended fix:* keep the annual refresh AND index brackets inside the loop — multiply `min` / `max` / `standardDeduction` by `(1 + inflation)^(age - currentAge)`, reusing the same 3% already applied to expenses. Small change confined to `tax-tables.ts` / `tax-bracket-calculator.ts`.

### 2. Social Security taxed at a flat 85%

- `taxableSsIncome = ssIncome * 0.85` (`roth-conversion-calculator.ts:55`) regardless of provisional income.
- In low-income years the actual taxable share can be 0–50%.
- The real "tax torpedo" (conversion dollars dragging SS dollars into taxability at an effective 150–185% marginal rate) is completely absent.

### 3. Capital gains model too simple

- Flat 15% LTCG (`roth-conversion-calculator.ts:25`, applied at lines 89–94).
- Ignores the **0% LTCG bracket** (retiree under ~$48k taxable income pays zero on gains — a major reason to spend brokerage in low-income years).
- Ignores **gains stacking** on ordinary income (a conversion can push gains from 0% to 15%).
- Net effect: likely undervalues brokerage-first spending and hides a conversion↔gains interaction.

### 4. `auto-optimize` scoring inconsistency

- `auto-optimize` picks winners by raw `endingAssets` (`scenario-engine.ts:43`); `smooth-to-bracket` / `smooth-income-target` use `afterTaxScore` (`scenario-engine.ts:14`), which discounts leftover traditional by the residual rate (24%).
- Different yardsticks bias `auto-optimize` toward NOT converting (unconverted traditional counts at face value). Cross-strategy comparisons are not apples-to-apples until the metric is unified.

### 5. Unverified search heuristics in the smooth modes

- **Monotonicity assumption** in `smooth-to-bracket` (`scenario-engine.ts:88–93`): "if this amount fails, lower amounts also fail" — may not hold with IRMAA cliffs and withdrawal-ordering interactions.
- **Early break** in `smooth-income-target` (`scenario-engine.ts:177–180`): stops at the first feasible bracket; never checks whether a higher bracket scores better.
- Coarse discretizations: $50k preserve-floor steps (up to $2.5M), fixed RMD-behavior menu (stop at RMD age / never / +5 / +10 years).

### 6. Smaller known approximations

- IRMAA MAGI proxy = `taxableIncome + realizedGain`; omits tax-exempt interest, inherits the flat-85% SS assumption.
- No additional standard deduction for age 65+.
- `LOW_BRACKET_HARVEST_RATE` 12% (`roth-conversion-calculator.ts:32`) is a hardcoded heuristic, not solved for.
- `RESIDUAL_TRADITIONAL_TAX_RATE = 0.24` (`scenario-engine.ts:8`) is a guess.
- IRMAA tiers are "approximate 2026 values" per the source and not inflation-indexed.

### Priority order for raising confidence

1. Bracket inflation-indexing (#1) — changes the *numbers*.
2. SS provisional-income taxation (#2) — changes the *numbers*.
3. Unify the scoring metric (#4) — changes the *rankings*.

---

## Part 2 — Biggest Blindspots (things the setup doesn't even represent)

### 1. Single deterministic return path (the biggest one)

- `assumedReturnRate` is applied uniformly every year; no volatility, no sequence-of-returns risk.
- Roth conversion value is highly sequence-sensitive: converting before a market drop is great; a bad first decade can leave no brokerage money to pay conversion taxes.
- The optimizer picks winners by margins (a few % of ending assets) almost certainly smaller than the noise a return distribution would introduce — optimizing the third decimal of a number whose first decimal is uncertain.
- Cheap check: run two or three hand-picked paths (bad decade first vs. good decade first) and see whether strategy rankings survive.

### 2. No external validation of the tax math

- Spec files test the engine against expectations derived from the same assumptions the engine encodes.
- Nothing has been checked against ground truth (IRS worksheet, commercial tool, hand-computed return). A systematic error in `calculateTax` or SS/LTCG handling would pass all tests and infect every scenario.
- Cheap check: pick two simulated years and reproduce them by hand.

### 3. Life events the model structurally cannot express

- **Filing-status change (widow's penalty):** a surviving spouse becomes a single filer with roughly half the bracket widths on the same RMDs — often the #1 real-world argument for converting. The model fixes filing status for life.
- **Heirs / inherited-IRA 10-year rule:** beneficiaries drain traditional balances fast, often in peak earning years. This entire dynamic is compressed into the single `RESIDUAL_TRADITIONAL_TAX_RATE = 0.24` guess, which directly decides rankings via `afterTaxScore`.
- **Pre-65 ACA subsidies:** for retirement before 65, conversions raise MAGI and can cost thousands in premium subsidies — often a bigger cliff than IRMAA; completely absent.

### 4. Silent data-handling behavior: same-type accounts get dropped

- `latestAccounts` (`roth-conversion-calculator.ts:186`) keeps exactly **one account per type** — the one with the newest `snapshotDate`.
- Fine if rows are snapshots of one account over time; but two traditional IRAs (or two brokerage accounts) entered as separate rows means one is silently excluded, with no warning. Nothing in the UI or model enforces the one-account-per-type assumption.

### 5. Process exposure

- ~240 lines of recent engine work uncommitted on `main`.
- Untracked `.env` in the repo root — if it holds real Supabase keys, a careless `git add .` publishes them. Verify `.env` is in `.gitignore`; commit working state in logical pieces.

### Bottom line

If forced to pick one blindspot: **#1 (deterministic returns)**. Items 2–4 make individual numbers wrong; #1 questions whether the comparison framework can distinguish the strategies being ranked at all.
