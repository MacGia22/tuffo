-- Tuffo initial schema.
-- Every table carries row-level security; users reach only their own pools.
-- Weather tables are shared reference data: readable by signed-in users, written
-- only by scheduled jobs through the service key.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user, created by trigger
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  locale text not null default 'en',
  units text not null default 'us' check (units in ('us', 'metric')),
  consent_marketing_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- weather reference data, keyed by 0.05-degree cell (about 5 km)
-- ---------------------------------------------------------------------------
create table if not exists public.weather_cells (
  id text primary key,                 -- e.g. "27.80,-82.70" (cell centre)
  lat numeric(6, 2) not null,
  lon numeric(6, 2) not null,
  timezone text not null,
  active boolean not null default true,
  last_actuals_at timestamptz,
  last_forecast_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.weather_daily (
  cell_id text not null references public.weather_cells (id) on delete cascade,
  date date not null,
  tmax_c numeric(5, 2),
  tmin_c numeric(5, 2),
  uv_index_max numeric(4, 2),
  shortwave_mj_m2 numeric(6, 2),
  sunshine_s integer,
  precipitation_mm numeric(6, 2),
  wind_max_kmh numeric(5, 1),
  humidity_mean numeric(5, 2),
  et0_mm numeric(5, 2),
  source text not null default 'open-meteo',
  fetched_at timestamptz not null default now(),
  primary key (cell_id, date)
);

create table if not exists public.weather_forecast (
  cell_id text not null references public.weather_cells (id) on delete cascade,
  date date not null,
  tmax_c numeric(5, 2),
  tmin_c numeric(5, 2),
  uv_index_max numeric(4, 2),
  shortwave_mj_m2 numeric(6, 2),
  sunshine_s integer,
  precipitation_mm numeric(6, 2),
  precipitation_probability numeric(5, 2),
  wind_max_kmh numeric(5, 1),
  humidity_mean numeric(5, 2),
  et0_mm numeric(5, 2),
  source text not null default 'open-meteo',
  fetched_at timestamptz not null default now(),
  primary key (cell_id, date)
);

-- ---------------------------------------------------------------------------
-- pools and their history
-- ---------------------------------------------------------------------------
create table if not exists public.pools (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  volume_l numeric(10, 1) not null check (volume_l > 0),
  surface_area_m2 numeric(8, 2) check (surface_area_m2 is null or surface_area_m2 > 0),
  sanitizer text not null default 'chlorine' check (sanitizer in ('chlorine', 'swg')),
  surface text not null default 'plaster' check (surface in ('plaster', 'vinyl', 'fiberglass')),
  covered boolean not null default false,
  cell_id text references public.weather_cells (id),
  place_label text,
  timezone text,
  fill_water_ch numeric(6, 1),
  fill_water_ta numeric(6, 1),
  swg_cell_lb_per_day numeric(5, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pools_owner_idx on public.pools (owner_id);
create index if not exists pools_cell_idx on public.pools (cell_id);

create trigger pools_set_updated_at
  before update on public.pools
  for each row execute function public.set_updated_at();

create table if not exists public.readings (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.pools (id) on delete cascade,
  taken_at timestamptz not null default now(),
  fc numeric(5, 2) check (fc is null or fc >= 0),
  cc numeric(5, 2) check (cc is null or cc >= 0),
  ph numeric(4, 2) check (ph is null or (ph between 5 and 10)),
  ta numeric(6, 1) check (ta is null or ta >= 0),
  ch numeric(6, 1) check (ch is null or ch >= 0),
  cya numeric(6, 1) check (cya is null or cya >= 0),
  salt numeric(7, 1) check (salt is null or salt >= 0),
  water_temp_c numeric(4, 1),
  borate numeric(6, 1) check (borate is null or borate >= 0),
  phosphate numeric(7, 1) check (phosphate is null or phosphate >= 0),
  tds numeric(7, 1) check (tds is null or tds >= 0),
  method text not null default 'drop_kit'
    check (method in ('drop_kit', 'strips', 'digital', 'store_leslies', 'store_pinch', 'monitor', 'other')),
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now()
);

create index if not exists readings_pool_time_idx on public.readings (pool_id, taken_at desc);

create table if not exists public.doses (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.pools (id) on delete cascade,
  added_at timestamptz not null default now(),
  product_id text not null,
  amount numeric(10, 2) not null check (amount > 0),
  unit text not null check (unit in ('g', 'mL')),
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now()
);

create index if not exists doses_pool_time_idx on public.doses (pool_id, added_at desc);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.pools (id) on delete cascade,
  occurred_at timestamptz not null default now(),
  kind text not null
    check (kind in ('refill', 'backwash', 'heavy_use', 'shock', 'cover_on', 'cover_off', 'other')),
  value numeric(10, 2),
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now()
);

create index if not exists events_pool_time_idx on public.events (pool_id, occurred_at desc);

-- Learned per-pool coefficients. Server-only: no policy grants users access.
create table if not exists public.pool_models (
  pool_id uuid primary key references public.pools (id) on delete cascade,
  coefficients jsonb not null default '{}'::jsonb,
  sample_count integer not null default 0,
  residual numeric(8, 4),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- row-level security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.weather_cells enable row level security;
alter table public.weather_daily enable row level security;
alter table public.weather_forecast enable row level security;
alter table public.pools enable row level security;
alter table public.readings enable row level security;
alter table public.doses enable row level security;
alter table public.events enable row level security;
alter table public.pool_models enable row level security;

create policy "profiles: own row" on public.profiles
  for select using ((select auth.uid()) = id);
create policy "profiles: update own row" on public.profiles
  for update using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "weather cells: signed-in read" on public.weather_cells
  for select to authenticated using (true);
create policy "weather daily: signed-in read" on public.weather_daily
  for select to authenticated using (true);
create policy "weather forecast: signed-in read" on public.weather_forecast
  for select to authenticated using (true);

create policy "pools: owner all" on public.pools
  for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "readings: via pool" on public.readings
  for all to authenticated
  using (exists (select 1 from public.pools p where p.id = pool_id and p.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.pools p where p.id = pool_id and p.owner_id = (select auth.uid())));

create policy "doses: via pool" on public.doses
  for all to authenticated
  using (exists (select 1 from public.pools p where p.id = pool_id and p.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.pools p where p.id = pool_id and p.owner_id = (select auth.uid())));

create policy "events: via pool" on public.events
  for all to authenticated
  using (exists (select 1 from public.pools p where p.id = pool_id and p.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.pools p where p.id = pool_id and p.owner_id = (select auth.uid())));

-- ---------------------------------------------------------------------------
-- privileges: the Data API roles get nothing by default in this project
-- ---------------------------------------------------------------------------
grant usage on schema public to authenticated;
grant select, update on public.profiles to authenticated;
grant select on public.weather_cells, public.weather_daily, public.weather_forecast to authenticated;
grant select, insert, update, delete on public.pools, public.readings, public.doses, public.events to authenticated;
-- anon (signed-out visitors) has no table privileges; pool_models stays service-only.
