-- Earlier salt cells in the equipment history. The current cell stays on pools
-- (swg_cell_model, swg_cell_lb_per_day, swg_cell_installed_on); when the owner replaces
-- it, the old one is kept here as a dated 'cell' row (removed_on set), like any other
-- replaced item. A current 'cell' row is never written.
--
-- Safe to run more than once.

alter table public.pool_equipment drop constraint if exists pool_equipment_kind_check;
alter table public.pool_equipment
  add constraint pool_equipment_kind_check check (kind in ('pump', 'feeder', 'filter', 'heater', 'cell'));
