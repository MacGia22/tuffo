-- Pool equipment besides the salt cell (kept on pools): the pump, a chlorine feeder, the
-- filter and a heater, with history. One current item per kind (removed_on is null);
-- replacing one dates the old row instead of overwriting it, so what was running between
-- two tests stays known. Owners read, add, edit and delete their own rows.
--
-- Safe to run more than once.

create table if not exists public.pool_equipment (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.pools (id) on delete cascade,
  kind text not null check (kind in ('pump', 'feeder', 'filter', 'heater')),
  model text check (model is null or char_length(model) <= 80),
  -- pump {speed, catalog}, feeder {type, setting}, filter {type}, heater {type, inUse}
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  installed_on date not null default current_date,
  removed_on date check (removed_on is null or removed_on >= installed_on),
  created_at timestamptz not null default now()
);

create index if not exists pool_equipment_pool_idx on public.pool_equipment (pool_id, kind, installed_on desc);
create unique index if not exists pool_equipment_current_idx on public.pool_equipment (pool_id, kind) where removed_on is null;

alter table public.pool_equipment enable row level security;

drop policy if exists "pool equipment: owner read" on public.pool_equipment;
create policy "pool equipment: owner read" on public.pool_equipment
  for select to authenticated
  using (exists (select 1 from public.pools p where p.id = pool_id and p.owner_id = (select auth.uid())));

drop policy if exists "pool equipment: owner insert" on public.pool_equipment;
create policy "pool equipment: owner insert" on public.pool_equipment
  for insert to authenticated
  with check (exists (select 1 from public.pools p where p.id = pool_id and p.owner_id = (select auth.uid())));

drop policy if exists "pool equipment: owner update" on public.pool_equipment;
create policy "pool equipment: owner update" on public.pool_equipment
  for update to authenticated
  using (exists (select 1 from public.pools p where p.id = pool_id and p.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.pools p where p.id = pool_id and p.owner_id = (select auth.uid())));

drop policy if exists "pool equipment: owner delete" on public.pool_equipment;
create policy "pool equipment: owner delete" on public.pool_equipment
  for delete to authenticated
  using (exists (select 1 from public.pools p where p.id = pool_id and p.owner_id = (select auth.uid())));

revoke all on public.pool_equipment from anon, authenticated;
grant select, insert, update, delete on public.pool_equipment to authenticated;
grant all on public.pool_equipment to service_role;
