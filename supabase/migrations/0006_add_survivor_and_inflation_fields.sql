-- Survivor RMD ownership and historical inflation mode.
alter table public.scenarios
  add column if not exists spouse_current_age numeric,
  add column if not exists spouse_birth_year integer,
  add column if not exists spouse_life_expectancy numeric,
  add column if not exists spouse_ss_pia numeric,
  add column if not exists spouse_ss_claim_age integer,
  add column if not exists inflation_mode text not null default 'fixed'
    check (inflation_mode in ('fixed', 'historical'));
