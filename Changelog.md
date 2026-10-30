# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project uses [Conventional Commits](https://www.conventionalcommits.org/).

## [Unreleased]

### Features

- **monte-carlo:** Verify any conversion strategy, not just smooth-income-target. The runner
  rejected every other mode, so a strategy the tool itself recommended — "Max Ending Assets"
  resolves to auto-optimize — could not be stress tested at all. `runScenario` already
  resolves the search modes into a concrete schedule and passes the rest through, so the
  guard was historical rather than a real constraint. All seven modes now run, and the page
  explains that search modes are solved once against the deterministic plan and replayed, so
  no trial benefits from knowing its own market path.
- **dashboard:** Show the Social Security taxability working. A review read $0 total tax at
  ages 75–90 as a possible missing tax; the engine was right, but nothing in the output let
  anyone check it. `YearResult` now carries the benefit, the provisional income, the taxable
  portion and the deductions applied; the year-by-year table gains a Taxable SS column whose
  tooltip spells out the comparison against the statutory threshold, and all four fields are
  in the CSV export.

### Bug Fixes

- **scenario:** Stop the plan's numbers changing when nothing was edited. The Scenario
  Builder writes a value for every field on Run Scenario, and its dividend-yield default
  (1.5%) disagreed with the engine's (0%), so a scenario that left the field unset — the
  shipped demo among them — produced one set of results before the form was opened and
  another after: total tax $510,922.79 → $515,920.78, ending assets $1,488,896.02 →
  $1,414,410.49. Both sides now share `DEFAULT_DIVIDEND_YIELD`, the demo sets its optional
  fields explicitly, and specs pin that an unset optional field simulates identically to the
  constant the UI shows. Fields that already shared a named constant never drifted; the one
  that repeated a literal in two places did.
- **strategy-selector:** Stop the Buy-Borrow-Die comparison lending past its own collateral.
  The loan compounded unchecked while the main engine's SBLOC correctly caps draws at
  `maxLtv`, so a $500k brokerage funding $150k/yr for 30 years reached ~$15M of debt, a 563%
  stressed LTV, and a headline "BBD value" of -$11,961,153. Draws now stop at the LTV cap and
  the shortfall is sold — with its own basis tracking, since that path realizes gains — which
  brings the same case to -$1,795,186 and states plainly that the bucket cannot fund the plan
  either way. Exhausting the collateral is reported as a fact rather than an infinite ratio.
- **dashboard:** Stop the BBD stress test reading as a broken cap. After the loan brake
  landed, the demo still showed "Fail (421%)" beside "limit 50%", which a regression review
  reasonably read as the cap not holding. It is holding — from year 3 the credit line
  advances nothing — but forced sales then shrink the collateral while the debt stands, so
  the ratio climbs on a vanishing denominator. The selector now reports
  `bbdCollateralExhausted` and the dashboard shows "Fail — collateral exhausted" instead of
  a number that cannot mean what its label says.
- **dashboard:** Reword the drain-down advice. It described a bracket *ceiling* as a target
  ("must be drawn down to exactly $9,891,414"), which read as nonsense against the demo's
  $1.5M pre-tax balance. The arithmetic was right; the sentence was not.

- **cloud-sync:** Add migration `0007_sync_scenario_columns.sql` and persist the columns the
  client already wrote. Saving a scenario failed with `PGRST204` once the Scenario Builder had
  been submitted, because `annual_pre_tax_contribution`, `annual_roth_contribution`,
  `annual_brokerage_contribution`, and `employer_match` were never created by a migration.
  `ss_cola_rate`, `pre_simulation_magi`, `spending_order`, and `sbloc_tax_funding` were also
  silently dropped on a cloud round-trip and are now stored. **Run `0007` against existing
  projects** — it is idempotent and re-asserts every column, constraint, and RLS policy, so it
  also repairs databases that only ever ran `0001_init.sql` as the README used to instruct.
- **cloud-sync:** Save to Supabase now updates existing rows instead of appending copies.
  `AccountService.syncAll` inserts new accounts, updates ones that carry a row id, and prunes
  only rows deleted locally (insert/update before delete, so a failure cannot empty the cloud
  copy); `ScenarioService.save` updates by id and falls back to insert. Previously two saves of
  four accounts produced eight cloud rows.
- **auth:** Clear the browser-local plan when a session ends. Balances and scenarios live in
  `localStorage`, so after sign-out the next person at a shared browser could read the previous
  user's finances, and signing in as a different account could write the first user's numbers
  into the second's rows. Signing in from an anonymous session still keeps unsaved local work.

### Features

- **tranche-planner:** Add a Roth conversion tranche planning UI with January, October, December, and market-drawdown conversion checkpoints.
