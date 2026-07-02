create table accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('traditional_401k','traditional_ira','roth_401k','roth_ira','brokerage')),
  balance numeric not null,
  cost_basis numeric,
  snapshot_date date not null default current_date,
  created_at timestamptz not null default now()
);

create table scenarios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  current_age int not null,
  retirement_age int not null,
  birth_year int not null,
  ss_claim_age int not null check (ss_claim_age in (62,63,64,65,66,67,68,69,70)),
  ss_pia numeric not null,
  life_expectancy int not null default 90,
  filing_status text not null default 'single' check (filing_status in ('single')),
  roth_conversion_strategy jsonb not null,
  assumed_return_rate numeric not null,
  state_tax_rate numeric default 0,
  created_at timestamptz not null default now()
);

alter table accounts enable row level security;
alter table scenarios enable row level security;

create policy "own accounts" on accounts for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own scenarios" on scenarios for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
