# Same-Seed Strategy Comparison

Route: `/compare-strategies`

The comparison page runs three editable strategy variants with the same seed and trial count. Because every worker invocation starts from the same seed, each option receives aligned historical stock, bond, and CPI paths. Only the selected strategy inputs differ.

Version 1 comparison controls:

- Retirement age
- Stock allocation
- Saved Roth-conversion strategy versus no conversion
- Adaptive spending guardrail

The saved scenario and accounts are read-only. Results show success rate, median and 10th-percentile ending assets, consumption realization, and deltas from the baseline.

The page deliberately reports consumption next to success. A guardrail can improve modeled success by reducing spending, so success rate alone is not a sufficient decision rule.
