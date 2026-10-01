-- Maintenance: a log of upkeep done (cleaning the salt cell, backwashing, replacing a
-- cartridge…), filter pressure readings with the clean pressure marked, how often the
-- owner wants each task (overrides of the defaults), when the salt cell was installed,
-- and an optional maintenance reminder in the alert email.
--
-- Safe to run more than once.

create table if not exists public.pool_maintenance (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.pools (id) on delete cascade,
  -- A task id from src/lib/maintenance.ts (cell_clean, pump_basket, …).
  task text not null check (task ~ '^[a-z_]{1,40}$'),
  done_on date not null,
  created_at timestamptz not null default now()
);

create index if not exists pool_maintenance_pool_idx on public.pool_maintenance (pool_id, task, done_on desc);

create table if not exists public.pool_pressure (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.pools (id) on delete cascade,
  read_on date not null,
  -- Filter gauge pressure, kPa (SI; shown as psi or bar).
  kpa numeric(5, 1) not null check (kpa >= 0 and kpa <= 400),
  -- Read right after cleaning or backwashing: the filter's clean pressure.
  clean boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists pool_pressure_pool_idx on public.pool_pressure (pool_id, read_on desc);

alter table public.pool_maintenance enable row level security;
alter table public.pool_pressure enable row level security;

drop policy if exists "pool maintenance: owner read" on public.pool_maintenance;
create policy "pool maintenance: owner read" on public.pool_maintenance
  for select to authenticated
  using (exists (select 1 from public.pools p where p.id = pool_id and p.owner_id = (select auth.uid())));

drop policy if exists "pool maintenance: owner insert" on public.pool_maintenance;
create policy "pool maintenance: owner insert" on public.pool_maintenance
  for insert to authenticated
  with check (exists (select 1 from public.pools p where p.id = pool_id and p.owner_id = (select auth.uid())));

drop policy if exists "pool maintenance: owner delete" on public.pool_maintenance;
create policy "pool maintenance: owner delete" on public.pool_maintenance
  for delete to authenticated
  using (exists (select 1 from public.pools p where p.id = pool_id and p.owner_id = (select auth.uid())));

drop policy if exists "pool pressure: owner read" on public.pool_pressure;
create policy "pool pressure: owner read" on public.pool_pressure
  for select to authenticated
  using (exists (select 1 from public.pools p where p.id = pool_id and p.owner_id = (select auth.uid())));

drop policy if exists "pool pressure: owner insert" on public.pool_pressure;
create policy "pool pressure: owner insert" on public.pool_pressure
  for insert to authenticated
  with check (exists (select 1 from public.pools p where p.id = pool_id and p.owner_id = (select auth.uid())));

drop policy if exists "pool pressure: owner delete" on public.pool_pressure;
create policy "pool pressure: owner delete" on public.pool_pressure
  for delete to authenticated
  using (exists (select 1 from public.pools p where p.id = pool_id and p.owner_id = (select auth.uid())));

revoke all on public.pool_maintenance, public.pool_pressure from anon, authenticated;
grant select, insert, delete on public.pool_maintenance, public.pool_pressure to authenticated;
grant all on public.pool_maintenance, public.pool_pressure to service_role;

-- How often, in days, per task id; tasks not listed use the default.
alter table public.pools add column if not exists maintenance_intervals jsonb not null default '{}'::jsonb;
alter table public.pools drop constraint if exists pools_maintenance_intervals_object;
alter table public.pools add constraint pools_maintenance_intervals_object check (jsonb_typeof(maintenance_intervals) = 'object');
alter table public.pools add column if not exists swg_cell_installed_on date;

-- Maintenance reminders in the alert email (off by default).
alter table public.alert_settings add column if not exists maintenance boolean not null default false;
alter table public.alert_log drop constraint if exists alert_log_kind_check;
alter table public.alert_log add constraint alert_log_kind_check
  check (kind in ('algae', 'test_reminder', 'weekly', 'maintenance'));
