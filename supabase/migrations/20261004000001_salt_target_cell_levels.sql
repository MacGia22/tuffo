-- Salt pools: the salt range the chlorinator asks for, in ppm (from its label or manual:
-- 1,500 for low-salt units up to 6,000 for some Australian cells). Null: Tuffo's default
-- (2,800-3,600 ppm, or the listed cell's own range).
-- And how the cell's output is set: null for percent (the default), or the number of
-- levels on its control (an AstralPool E Series is set 1 to 8). Settings are still
-- stored and logged in percent; levels change only the wording.
-- Owner reads and writes through the existing pools policy and grants.
--
-- Safe to run more than once.

alter table public.pools add column if not exists salt_target_low_ppm integer;
alter table public.pools add column if not exists salt_target_high_ppm integer;
alter table public.pools add column if not exists swg_cell_levels smallint;

alter table public.pools drop constraint if exists pools_salt_target_check;
alter table public.pools add constraint pools_salt_target_check
  check (
    (salt_target_low_ppm is null and salt_target_high_ppm is null)
    or (
      salt_target_low_ppm between 500 and 10000
      and salt_target_high_ppm between 500 and 10000
      and salt_target_low_ppm < salt_target_high_ppm
    )
  );

alter table public.pools drop constraint if exists pools_swg_cell_levels_check;
alter table public.pools add constraint pools_swg_cell_levels_check
  check (swg_cell_levels is null or swg_cell_levels between 2 and 20);
