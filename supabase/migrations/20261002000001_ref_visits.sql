-- Visits per ?ref= link label per day (tuffo.app/?ref=pools counts one for "pools" on
-- that UTC day). A plain counter: no address, no browser details, no cookie, nothing
-- that tells two visits apart. Written only by the server (the proxy, with the service
-- key, through count_ref_visit); read only by the admin page.
--
-- Also users_with_tests(): which accounts have logged at least one test, for the admin
-- funnel. Server only.
--
-- Safe to run more than once.

create table if not exists public.ref_visits (
  day date not null,
  label text not null check (label ~ '^[a-z0-9_-]{1,30}$'),
  visits integer not null default 0 check (visits >= 0),
  primary key (day, label)
);

alter table public.ref_visits enable row level security;

-- No policies on purpose: server only.
revoke all on public.ref_visits from anon, authenticated;
grant all on public.ref_visits to service_role;

-- One more visit for a label today. A day takes at most 200 labels, so a script
-- inventing labels cannot grow the table without bound; later new labels are dropped.
create or replace function public.count_ref_visit(p_label text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  today date := (now() at time zone 'utc')::date;
begin
  if p_label is null or p_label !~ '^[a-z0-9_-]{1,30}$' then
    return;
  end if;
  update public.ref_visits set visits = visits + 1 where day = today and label = p_label;
  if found then
    return;
  end if;
  if (select count(*) from public.ref_visits where day = today) >= 200 then
    return;
  end if;
  insert into public.ref_visits (day, label, visits) values (today, p_label, 1)
  on conflict (day, label) do update set visits = public.ref_visits.visits + 1;
end;
$$;

revoke all on function public.count_ref_visit(text) from public, anon, authenticated;
grant execute on function public.count_ref_visit(text) to service_role;

-- Accounts with at least one logged test (any pool, imported tests included).
create or replace function public.users_with_tests()
returns table (user_id uuid)
language sql
stable
set search_path = ''
as $$
  select distinct p.owner_id
  from public.pools p
  where exists (select 1 from public.readings r where r.pool_id = p.id);
$$;

revoke all on function public.users_with_tests() from public, anon, authenticated;
grant execute on function public.users_with_tests() to service_role;
