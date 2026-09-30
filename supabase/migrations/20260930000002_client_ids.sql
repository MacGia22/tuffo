-- Offline logging: the app gives each test, dose and event a UUID on the device. A
-- unique index on it means sending the same entry twice (a retry after a lost reply)
-- can never create a second row; the second insert fails with 23505 and the server
-- answers "already saved". Null for rows logged before this, and allowed for any row.
--
-- Safe to run more than once.

alter table public.readings add column if not exists client_id uuid;
alter table public.doses add column if not exists client_id uuid;
alter table public.events add column if not exists client_id uuid;

create unique index if not exists readings_client_id_key on public.readings (client_id);
create unique index if not exists doses_client_id_key on public.doses (client_id);
create unique index if not exists events_client_id_key on public.events (client_id);
