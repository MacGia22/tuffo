-- Rain at the pool: an owner can replace the weather cell's rain for a day with what
-- fell at the pool (a gauge, or a guess). One value per pool and day, in millimeters.
-- The chart, the between-tests box, the chlorine model and the 7-day plan use it
-- instead of the cell's figure; removing it goes back to the cell's figure.
--
-- Safe to run more than once.

create table if not exists public.pool_rain (
  pool_id uuid not null references public.pools (id) on delete cascade,
  date date not null,
  rain_mm numeric(5, 1) not null check (rain_mm between 0 and 500),
  updated_at timestamptz not null default now(),
  primary key (pool_id, date)
);

alter table public.pool_rain enable row level security;

drop policy if exists "pool rain: owner read" on public.pool_rain;
create policy "pool rain: owner read" on public.pool_rain
  for select to authenticated
  using (exists (select 1 from public.pools p where p.id = pool_id and p.owner_id = (select auth.uid())));

drop policy if exists "pool rain: owner insert" on public.pool_rain;
create policy "pool rain: owner insert" on public.pool_rain
  for insert to authenticated
  with check (exists (select 1 from public.pools p where p.id = pool_id and p.owner_id = (select auth.uid())));

drop policy if exists "pool rain: owner update" on public.pool_rain;
create policy "pool rain: owner update" on public.pool_rain
  for update to authenticated
  using (exists (select 1 from public.pools p where p.id = pool_id and p.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.pools p where p.id = pool_id and p.owner_id = (select auth.uid())));

drop policy if exists "pool rain: owner delete" on public.pool_rain;
create policy "pool rain: owner delete" on public.pool_rain
  for delete to authenticated
  using (exists (select 1 from public.pools p where p.id = pool_id and p.owner_id = (select auth.uid())));

revoke all on public.pool_rain from anon, authenticated;
grant select, insert, update, delete on public.pool_rain to authenticated;
grant all on public.pool_rain to service_role;
