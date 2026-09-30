-- Salt pools: the cell's model name, next to its rated output (swg_cell_lb_per_day),
-- as picked on the pool page. Owner-writable through the existing pools policy.
--
-- Safe to run more than once.

alter table public.pools add column if not exists swg_cell_model text;

alter table public.pools drop constraint if exists pools_swg_cell_model_check;
alter table public.pools add constraint pools_swg_cell_model_check
  check (swg_cell_model is null or char_length(swg_cell_model) <= 80);
