# SSA Stochastic Longevity

This version adds an independent mortality-weighted Monte Carlo analysis while preserving the existing fixed-age 90/95/100 stress tests.

## Method

- Embedded SSA 2023 period life-table annual death probabilities, ages 18-119.
- Separate deterministic random streams for market returns, primary mortality, and spouse mortality.
- Single filers receive one sampled death age per trial.
- Married scenarios sample both spouses independently; the engine transitions to single filing and survivor Social Security after the first death and runs through the last survivor.
- Existing fixed-lifespan Monte Carlo paths and golden values remain unchanged.

## Production QA

The `/qa/golden-scenarios` page now includes check 7 for stochastic-longevity output and Worker parity.

## Limitations

Population-level SSA mortality does not account for individual health, smoking, family history, income, or socioeconomic factors. The model currently assumes independent spouse mortality and uses the primary-age timeline for year labels after the primary spouse dies.
