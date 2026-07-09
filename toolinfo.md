# Tool Accuracy Assessment — Retirement Planner

> Reference notes from the review on 2026-07-06: overall accuracy calibration of the
> planning tool, plus the return-rate correction. Companion to `DesignBindSpots.md1`.

---

## Overall Accuracy Calibration (three tiers)

"Accuracy" means different things depending on what you ask the tool for.

### Tier 1 — Single-year tax mechanics: ~95–98% accurate

- Given correct inputs, a year's federal tax, bracket math, conversion sizing, RMD
  divisors, and IRMAA tiers are computed essentially correctly (hand-verified several
  years during this session; engine matched to the dollar).
- Residual few percent comes from known simplifications:
  - No NIIT (3.8% on investment income above $250k MAGI — relevant in high-income years)
  - Flat-rate state tax (no state brackets/deductions)
  - Flat 85% Social Security taxability assumption
  - No age-65+ additional standard deduction
- Caveat: assessed from code reading and internal tests; the planned validation against
  an external calculator (IRS worksheet / commercial tool) has NOT been done yet. That
  remains the cheapest way to turn this estimate into a fact.

### Tier 2 — Strategy rankings ("is A better than B?"): reliable for big margins, coin-flip for thin ones

- This is what the tool is for, and it's stronger than the dollar figures because most
  model biases hit all candidates symmetrically — especially after this session's fixes
  (bracket inflation-indexing, unified after-tax scoring, brokerage gains discount,
  annual dividend tax drag, funding-order auto-comparison).
- Concrete margins from the user's own runs:
  - "Convert vs. don't convert": ~$630k–950k advantage — **robust**, survives any
    reasonable model correction.
  - "Working-year conversions on vs. off": ~$320k margin — **probably robust**.
  - "Brokerage-first vs. IRA-first funding": ~$70k on $27M (0.3%) — **inside the noise
    floor**; the tool picks a winner but honestly cannot distinguish them.

### Tier 3 — 30-year dollar figures: treat as ±30–50%, maybe worse

- The "$27.4M at 90" is a *scenario*, not a forecast.
- A single deterministic return path is the dominant uncertainty; real return sequences
  put a huge spread around any 35-year compounding number.
- Add legislative risk (brackets, IRMAA rules, step-up rules over 35 years): honest
  reading is "mid-eight figures if assumptions roughly hold," not a six-significant-
  figure number.

### Practical summary

- Use the tool to decide **what to do this year and which strategy shape to follow** —
  there it is genuinely good (IRMAA cliffs, funding order, working-year conversions,
  dividend drag are all modeled).
- Do NOT use it to believe an ending balance to six significant figures.
- Because the plan is re-run every year with fresh balances and tax tables, errors in
  far years never get acted on; only the current-year decision matters — and that is
  the tier where accuracy is highest.

### Two highest-value upgrades remaining

1. External ground-truth validation of one or two simulated years (turns Tier 1 from
   "assessed" into "verified").
2. A two-or-three-path return-sequence check (tells whether Tier 2's thin-margin picks
   are stable or noise). Both roughly an afternoon each.

---

## Correction: Default Return Rate Is 8%, Not 5%

- The app's seeded default is `assumedReturnRate: 0.08` (`local-state.service.ts:21`),
  alongside 4.95% state tax and the $180k MFJ profile.
- The 5% figure quoted earlier came from test scenarios, not the live default.

### Why the correction sharpens (not softens) the accuracy caveats

- **The ±30–50% band is wider at 8%.** Compounding error grows with the rate: at 8% for
  37 years a balance multiplies ~17x, so small deviations in realized return swing the
  terminal number enormously. 8% nominal every year with zero volatility is an
  optimistic-leaning planning assumption (near the long-run equity average, applied to
  a portfolio unlikely to be 100% equities at 75+, with no bad decades).
- **It tilts the strategy math toward aggressive conversion.** Faster assumed growth
  makes the unconverted TIRA balloon harder in projection, raising the modeled
  RMD/residual threat and making early conversions look more valuable. If the real
  blended return lands nearer 5–6%, the optimal conversion pace is somewhat gentler —
  the strategy's direction survives, its intensity moderates.

### Recommended sensitivity check (available now, no code needed)

Re-run the scenario at 5% and 6.5% and see which decisions hold. Expectation:

- "Convert vs. don't": clear win at any plausible rate.
- Working-years advantage: shrinks but persists.
- Thin-margin calls (funding order): may flip freely — further confirmation they are
  noise.

If the strategy shape survives 5% through 8%, it can be acted on with confidence
regardless of which return the future delivers — a poor-man's return-sequence
robustness check using only the return-rate field.
