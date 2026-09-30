-- Salt pools: the cell setting over time (an event, value = percent) and the pump
-- schedule over time (hours a day the cell runs), so the chlorine model counts what
-- the cell actually made instead of assuming 100% round the clock.
--
-- Safe to run more than once.

alter table public.events drop constraint if exists events_kind_check;
alter table public.events add constraint events_kind_check
  check (kind in ('refill', 'drain_refill', 'backwash', 'heavy_use', 'shock', 'cover_on', 'cover_off', 'other', 'cell_setting'));

create table if not exists public.pump_schedules (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.pools (id) on delete cascade,
  effective_from timestamptz not null default now(),
  -- [{ "start": "08:00", "end": "18:00", "cell": true, "rpm": 2400 }], local time
  segments jsonb not null check (jsonb_typeof(segments) = 'array' and jsonb_array_length(segments) <= 24),
  cell_hours numeric(4, 2) not null check (cell_hours between 0 and 24),
  source text not null default 'manual' check (source in ('manual', 'screenshot')),
  created_at timestamptz not null default now()
);

create index if not exists pump_schedules_pool_idx on public.pump_schedules (pool_id, effective_from desc);

alter table public.pump_schedules enable row level security;

drop policy if exists "pump schedules: owner read" on public.pump_schedules;
create policy "pump schedules: owner read" on public.pump_schedules
  for select to authenticated
  using (exists (select 1 from public.pools p where p.id = pool_id and p.owner_id = (select auth.uid())));

drop policy if exists "pump schedules: owner insert" on public.pump_schedules;
create policy "pump schedules: owner insert" on public.pump_schedules
  for insert to authenticated
  with check (exists (select 1 from public.pools p where p.id = pool_id and p.owner_id = (select auth.uid())));

drop policy if exists "pump schedules: owner delete" on public.pump_schedules;
create policy "pump schedules: owner delete" on public.pump_schedules
  for delete to authenticated
  using (exists (select 1 from public.pools p where p.id = pool_id and p.owner_id = (select auth.uid())));

-- A schedule is replaced by a newer one, never edited, so history stays true.
revoke all on public.pump_schedules from anon, authenticated;
grant select, insert, delete on public.pump_schedules to authenticated;
grant all on public.pump_schedules to service_role;
