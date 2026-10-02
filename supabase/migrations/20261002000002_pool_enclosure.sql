-- A screen enclosure ("pool cage", lanai) over the pool: its kind and the share of the
-- sun that reaches the water through it, in percent. The settings card suggests a share
-- for the kind; the owner can type their own. Null: no enclosure (all the sun).
-- Owner reads and writes through the existing pools policy and grants.
--
-- Safe to run more than once.

alter table public.pools add column if not exists enclosure text;
alter table public.pools add column if not exists enclosure_sun_pct smallint;

alter table public.pools drop constraint if exists pools_enclosure_check;
alter table public.pools add constraint pools_enclosure_check
  check (enclosure is null or enclosure in ('screen', 'fine_screen', 'solar_screen', 'other'));

alter table public.pools drop constraint if exists pools_enclosure_sun_pct_check;
alter table public.pools add constraint pools_enclosure_sun_pct_check
  check (enclosure_sun_pct is null or (enclosure_sun_pct between 5 and 100));
