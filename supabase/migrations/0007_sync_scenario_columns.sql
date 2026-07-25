-- Brings the database in line with what the client actually reads and writes.
--
-- Two problems this fixes:
--   1. scenario.service.ts wrote four contribution columns that no migration ever created,
--      so every cloud save failed with PGRST204 once the Scenario Builder form had been
--      submitted (the form defaults the fields to 0, and only `undefined` gets dropped from
--      the request body).
--   2. README only instructed running 0001_init.sql, so 0002-0006 may never have been
--      applied to a given project. Every statement below is idempotent and repeats the
--      columns those migrations added, so running this file alone is enough to reach the
--      schema v1.0 expects — regardless of which earlier migrations are present.

-- Accounts (0005 re-asserted)
alter table public.accounts
  add column if not exists name text,
  add column if not exists owner text;

alter table public.accounts drop constraint if exists accounts_owner_check;
alter table public.accounts add constraint accounts_owner_check
  check (owner is null or owner in ('primary', 'spouse', 'joint'));

-- Scenarios: 0002-0006 re-asserted
alter table public.scenarios
  add column if not exists annual_living_expenses numeric default 0,
  add column if not exists wage_income numeric default 0,
  add column if not exists annual_other_income numeric default 0,
  add column if not exists annual_wage_growth numeric default 0,
  add column if not exists residual_tax_rate numeric,
  add column if not exists allow_pre_retirement_conversions boolean default false,
  add column if not exists brokerage_gains_tax_rate numeric default 0,
  add column if not exists dividend_yield numeric,
  add column if not exists stock_allocation numeric not null default 1,
  add column if not exists spouse_current_age numeric,
  add column if not exists spouse_birth_year integer,
  add column if not exists spouse_life_expectancy numeric,
  add column if not exists spouse_ss_pia numeric,
  add column if not exists spouse_ss_claim_age integer,
  add column if not exists inflation_mode text not null default 'fixed';

-- Scenarios: columns the client wrote or needs but no migration created
alter table public.scenarios
  -- Pre-retirement accumulation (the PGRST204 culprits)
  add column if not exists annual_pre_tax_contribution numeric default 0,
  add column if not exists annual_roth_contribution numeric default 0,
  add column if not exists annual_brokerage_contribution numeric default 0,
  add column if not exists employer_match numeric default 0,
  -- Social Security COLA: collected by the Scenario Builder, previously lost on round-trip
  add column if not exists ss_cola_rate numeric,
  -- MAGI from two years before the plan starts; drives the first two Medicare years' IRMAA
  add column if not exists pre_simulation_magi numeric,
  -- Left null, the engine decides between the two orders and reports the winner
  add column if not exists spending_order text,
  -- Buy-Borrow-Die tax funding window: { startAge, endAge, borrowRate, maxLtv? }
  add column if not exists sbloc_tax_funding jsonb;

alter table public.scenarios drop constraint if exists scenarios_filing_status_check;
alter table public.scenarios add constraint scenarios_filing_status_check
  check (filing_status in ('single', 'married_filing_jointly'));

alter table public.scenarios drop constraint if exists scenarios_inflation_mode_check;
alter table public.scenarios add constraint scenarios_inflation_mode_check
  check (inflation_mode in ('fixed', 'historical'));

alter table public.scenarios drop constraint if exists scenarios_spending_order_check;
alter table public.scenarios add constraint scenarios_spending_order_check
  check (spending_order is null or spending_order in ('traditional-first', 'brokerage-first'));

alter table public.scenarios drop constraint if exists scenarios_stock_allocation_check;
alter table public.scenarios add constraint scenarios_stock_allocation_check
  check (stock_allocation >= 0 and stock_allocation <= 1);

-- Row Level Security re-asserted: owner-only access on both tables. Safe to re-run — the
-- policies are dropped and recreated, and enabling RLS twice is a no-op.
alter table public.accounts enable row level security;
alter table public.scenarios enable row level security;

drop policy if exists "own accounts" on public.accounts;
create policy "own accounts" on public.accounts for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own scenarios" on public.scenarios;
create policy "own scenarios" on public.scenarios for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
