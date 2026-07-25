# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project uses [Conventional Commits](https://www.conventionalcommits.org/).

## [Unreleased]

### Bug Fixes

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
