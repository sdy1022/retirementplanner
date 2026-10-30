-- keepalive_ping holds one row per scheduled "keep the free-tier project awake" ping.
--
-- It was created from the dashboard instead of a migration, so it never had RLS and
-- Supabase's security advisor flagged it as ERROR / rls_disabled_in_public: with the anon
-- key published in the app bundle (by design), anyone could read, insert, or delete rows.
--
-- The rows themselves are not sensitive — an id and a timestamp. The real exposure is
-- integrity and capacity: unbounded inserts would fill the free tier's 500 MB quota and
-- take `accounts` and `scenarios` down with it, and deletes would silently stop the
-- keepalive so the project pauses after seven idle days.
--
-- RLS with NO policy denies every anon and authenticated request. `service_role` bypasses
-- RLS, so a pinger using the service role key keeps working unchanged. A pinger using the
-- anon key will start getting its insert rejected — that is the intended outcome, and the
-- remedy is to move that job to the service role key (kept as a secret on whatever runs
-- it, never in client-side code).
--
-- Observed cadence before this change: one ping every 5 days at ~23:10 UTC.

create table if not exists public.keepalive_ping (
  id bigint generated always as identity primary key,
  pinged_at timestamptz not null default now()
);

alter table public.keepalive_ping enable row level security;

-- Deliberately no policies. Any policy here would be reachable with the public anon key,
-- which is exactly what this migration exists to prevent. Drop the dashboard templates in
-- case one was ever added: RLS policies are permissive and OR'd together, so a single
-- `using (true)` would undo everything above.
drop policy if exists "public read" on public.keepalive_ping;
drop policy if exists "Enable read access for all users" on public.keepalive_ping;
drop policy if exists "Enable insert for all users" on public.keepalive_ping;
