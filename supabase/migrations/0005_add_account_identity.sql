alter table public.accounts add column if not exists name text;
alter table public.accounts add column if not exists owner text check (owner in ('primary','spouse','joint'));
