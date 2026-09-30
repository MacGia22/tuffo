-- Tests imported from a CSV (Pool Math or any sheet) are marked method = 'imported'.
-- Widens the method check; every existing value stays valid.
--
-- Safe to run more than once.

alter table public.readings drop constraint if exists readings_method_check;
alter table public.readings add constraint readings_method_check
  check (method in ('drop_kit', 'strips', 'digital', 'store_leslies', 'store_pinch', 'monitor', 'other', 'imported'));
