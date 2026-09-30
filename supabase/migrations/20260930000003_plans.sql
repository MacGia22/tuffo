-- The 7-day plan per pool: computed by the server (nightly after the forecast is stored,
-- and after each test), read by the pool's owner. Holds advice (daily chlorine use,
-- additions, flags), never model coefficients. Deleted with the pool.
--
-- Safe to run more than once.

create table if not exists public.plans (
  pool_id uuid primary key references public.pools (id) on delete cascade,
  computed_at timestamptz not null default now(),
  version integer not null,
  summary jsonb not null,
  days jsonb not null
);

alter table public.plans enable row level security;

drop policy if exists "plans: owner read" on public.plans;
create policy "plans: owner read" on public.plans
  for select to authenticated
  using (exists (select 1 from public.pools p where p.id = pool_id and p.owner_id = (select auth.uid())));

-- Only the server writes plans.
revoke all on public.plans from anon, authenticated;
grant select on public.plans to authenticated;
grant all on public.plans to service_role;
