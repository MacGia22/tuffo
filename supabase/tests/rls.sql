-- Row-level-security tests. Run by supabase/tests/run.sh after every migration has been
-- applied (twice). Two users, A and B, each own one pool with history; A then tries to
-- read and change B's rows, and a signed-out visitor tries to read anything. The first
-- failed check stops the script with "RLS FAIL: <what>". Everything runs inside one
-- transaction that is rolled back.

begin;

create schema rls_test;

create function rls_test.check(ok boolean, what text) returns void
language plpgsql as $$
begin
  if ok is not true then
    raise exception 'RLS FAIL: %', what;
  end if;
end;
$$;

-- Rows a query returns for the current role.
create function rls_test.rows(query text) returns bigint
language plpgsql as $$
declare
  n bigint;
begin
  execute format('select count(*) from (%s) q', query) into n;
  return n;
end;
$$;

-- Rows an update or delete touches for the current role.
create function rls_test.touched(statement text) returns bigint
language plpgsql as $$
declare
  n bigint;
begin
  execute statement;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- The statement must be refused: no privilege, or a row-level-security check.
create function rls_test.denied(statement text, what text) returns void
language plpgsql as $$
begin
  execute statement;
  raise exception 'RLS FAIL: % (allowed: %)', what, statement;
exception
  when insufficient_privilege then
    null;
end;
$$;

create function rls_test.become(role_name text, user_id uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', coalesce(json_build_object('sub', user_id)::text, ''), false);
  perform set_config('role', role_name, false);
end;
$$;

grant usage on schema rls_test to anon, authenticated;
grant execute on all functions in schema rls_test to anon, authenticated;

-- ---------------------------------------------------------------------------
-- The shape of the schema: rules that hold for every table, including future ones
-- ---------------------------------------------------------------------------
select rls_test.check(
  not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
  ),
  'every table in public has row-level security enabled'
);

select rls_test.check(
  not exists (select 1 from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public'),
  'anon holds no privilege on any table in public'
);

select rls_test.check(
  not has_table_privilege('authenticated', 'public.pool_models', 'select, insert, update, delete, truncate'),
  'authenticated has no privilege on pool_models'
);

select rls_test.check(
  not has_table_privilege('authenticated', 'public.scans', 'insert, update, delete, truncate'),
  'authenticated cannot write scans'
);

select rls_test.check(
  not has_table_privilege('authenticated', 'public.waitlist', 'select, insert, update, delete, truncate'),
  'authenticated has no privilege on the waitlist'
);

-- ---------------------------------------------------------------------------
-- Two users with one pool each
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

insert into public.weather_cells (id, lat, lon, timezone) values ('27.80,-82.70', 27.80, -82.70, 'America/New_York');
insert into public.weather_daily (cell_id, date, tmax_c) values ('27.80,-82.70', '2026-09-01', 31);
insert into public.weather_forecast (cell_id, date, tmax_c) values ('27.80,-82.70', '2026-09-02', 32);

insert into public.pools (id, owner_id, name, volume_l, cell_id) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'A pool', 50000, '27.80,-82.70'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', 'B pool', 60000, '27.80,-82.70');

insert into public.readings (id, pool_id, fc) values
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a1', 3),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000b1', 4);

insert into public.doses (id, pool_id, product_id, amount, unit) values
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a1', 'bleach-8', 1000, 'mL'),
  ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000b1', 'bleach-8', 2000, 'mL');

insert into public.events (id, pool_id, kind) values
  ('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-0000000000a1', 'backwash'),
  ('00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-0000000000b1', 'refill');

insert into public.scans (id, user_id, ok) values
  ('00000000-0000-0000-0000-0000000000a5', '00000000-0000-0000-0000-00000000000a', true),
  ('00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-00000000000b', true);

insert into public.waitlist (email) values ('c@example.com');

insert into public.pool_models (pool_id, sample_count) values
  ('00000000-0000-0000-0000-0000000000a1', 3),
  ('00000000-0000-0000-0000-0000000000b1', 5);

-- ---------------------------------------------------------------------------
-- Signed in as A
-- ---------------------------------------------------------------------------
select rls_test.become('authenticated', '00000000-0000-0000-0000-00000000000a');

-- A sees exactly A's own rows (so the checks below are not passing on an empty view).
select rls_test.check(rls_test.rows('select 1 from public.profiles') = 1, 'A sees only A''s profile');
select rls_test.check(rls_test.rows('select 1 from public.pools') = 1, 'A sees only A''s pool');
select rls_test.check(rls_test.rows('select 1 from public.readings') = 1, 'A sees only A''s readings');
select rls_test.check(rls_test.rows('select 1 from public.doses') = 1, 'A sees only A''s doses');
select rls_test.check(rls_test.rows('select 1 from public.events') = 1, 'A sees only A''s events');
select rls_test.check(rls_test.rows('select 1 from public.scans') = 1, 'A sees only A''s scans');
select rls_test.check(
  rls_test.rows('select 1 from public.pools where id = ''00000000-0000-0000-0000-0000000000a1''') = 1,
  'A sees A''s pool'
);
select rls_test.check(rls_test.rows('select 1 from public.weather_daily') = 1, 'A reads the weather');

-- select B's rows
select rls_test.check(rls_test.rows('select 1 from public.profiles where id = ''00000000-0000-0000-0000-00000000000b''') = 0, 'A cannot read B''s profile');
select rls_test.check(rls_test.rows('select 1 from public.pools where id = ''00000000-0000-0000-0000-0000000000b1''') = 0, 'A cannot read B''s pool');
select rls_test.check(rls_test.rows('select 1 from public.readings where id = ''00000000-0000-0000-0000-0000000000b2''') = 0, 'A cannot read B''s readings');
select rls_test.check(rls_test.rows('select 1 from public.doses where id = ''00000000-0000-0000-0000-0000000000b3''') = 0, 'A cannot read B''s doses');
select rls_test.check(rls_test.rows('select 1 from public.events where id = ''00000000-0000-0000-0000-0000000000b4''') = 0, 'A cannot read B''s events');
select rls_test.check(rls_test.rows('select 1 from public.scans where id = ''00000000-0000-0000-0000-0000000000b5''') = 0, 'A cannot read B''s scans');

-- update B's rows
select rls_test.check(rls_test.touched('update public.profiles set units = ''metric'' where id = ''00000000-0000-0000-0000-00000000000b''') = 0, 'A cannot update B''s profile');
select rls_test.check(rls_test.touched('update public.pools set name = ''taken'' where id = ''00000000-0000-0000-0000-0000000000b1''') = 0, 'A cannot update B''s pool');
select rls_test.check(rls_test.touched('update public.readings set fc = 0 where id = ''00000000-0000-0000-0000-0000000000b2''') = 0, 'A cannot update B''s readings');
select rls_test.check(rls_test.touched('update public.doses set amount = 1 where id = ''00000000-0000-0000-0000-0000000000b3''') = 0, 'A cannot update B''s doses');
select rls_test.check(rls_test.touched('update public.events set notes = ''x'' where id = ''00000000-0000-0000-0000-0000000000b4''') = 0, 'A cannot update B''s events');

-- delete B's rows
select rls_test.check(rls_test.touched('delete from public.pools where id = ''00000000-0000-0000-0000-0000000000b1''') = 0, 'A cannot delete B''s pool');
select rls_test.check(rls_test.touched('delete from public.readings where id = ''00000000-0000-0000-0000-0000000000b2''') = 0, 'A cannot delete B''s readings');
select rls_test.check(rls_test.touched('delete from public.doses where id = ''00000000-0000-0000-0000-0000000000b3''') = 0, 'A cannot delete B''s doses');
select rls_test.check(rls_test.touched('delete from public.events where id = ''00000000-0000-0000-0000-0000000000b4''') = 0, 'A cannot delete B''s events');

-- insert rows that belong to B
select rls_test.denied(
  'insert into public.pools (owner_id, name, volume_l) values (''00000000-0000-0000-0000-00000000000b'', ''planted'', 1000)',
  'A cannot create a pool owned by B'
);
select rls_test.denied(
  'insert into public.readings (pool_id, fc) values (''00000000-0000-0000-0000-0000000000b1'', 9)',
  'A cannot add a reading to B''s pool'
);
select rls_test.denied(
  'insert into public.doses (pool_id, product_id, amount, unit) values (''00000000-0000-0000-0000-0000000000b1'', ''bleach-8'', 1, ''mL'')',
  'A cannot add a dose to B''s pool'
);
select rls_test.denied(
  'insert into public.events (pool_id, kind) values (''00000000-0000-0000-0000-0000000000b1'', ''other'')',
  'A cannot add an event to B''s pool'
);

-- move A's own rows over to B
select rls_test.denied(
  'update public.pools set owner_id = ''00000000-0000-0000-0000-00000000000b'' where id = ''00000000-0000-0000-0000-0000000000a1''',
  'A cannot hand A''s pool to B'
);
select rls_test.denied(
  'update public.readings set pool_id = ''00000000-0000-0000-0000-0000000000b1'' where id = ''00000000-0000-0000-0000-0000000000a2''',
  'A cannot move a reading into B''s pool'
);
select rls_test.denied(
  'update public.doses set pool_id = ''00000000-0000-0000-0000-0000000000b1'' where id = ''00000000-0000-0000-0000-0000000000a3''',
  'A cannot move a dose into B''s pool'
);
select rls_test.denied(
  'update public.events set pool_id = ''00000000-0000-0000-0000-0000000000b1'' where id = ''00000000-0000-0000-0000-0000000000a4''',
  'A cannot move an event into B''s pool'
);
select rls_test.denied(
  'update public.profiles set id = ''00000000-0000-0000-0000-00000000000b'' where id = ''00000000-0000-0000-0000-00000000000a''',
  'A cannot take over B''s profile id'
);

-- server-only writes and tables
select rls_test.denied(
  'insert into public.scans (user_id, ok) values (''00000000-0000-0000-0000-00000000000a'', true)',
  'A cannot log a scan'
);
select rls_test.denied('update public.scans set ok = false', 'A cannot change the scan log');
select rls_test.denied('delete from public.scans', 'A cannot delete the scan log');
select rls_test.denied('select 1 from public.pool_models', 'A cannot read pool_models');
select rls_test.denied(
  'insert into public.pool_models (pool_id) values (''00000000-0000-0000-0000-0000000000a1'')',
  'A cannot write pool_models'
);
select rls_test.denied('delete from public.profiles', 'A cannot delete profiles');
select rls_test.denied('select 1 from public.waitlist', 'A cannot read the waitlist');
select rls_test.denied('insert into public.waitlist (email) values (''x@example.com'')', 'A cannot write the waitlist');
select rls_test.denied(
  'insert into public.weather_daily (cell_id, date) values (''27.80,-82.70'', ''2026-09-03'')',
  'A cannot write weather'
);

-- ---------------------------------------------------------------------------
-- Signed out (anon): no table can be read at all
-- ---------------------------------------------------------------------------
reset role;
select rls_test.become('anon', null);

do $$
declare
  t record;
begin
  for t in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
    order by c.relname
  loop
    perform rls_test.denied(format('select 1 from public.%I', t.relname), format('anon cannot read %s', t.relname));
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- B's rows came through untouched
-- ---------------------------------------------------------------------------
reset role;

select rls_test.check(
  (select owner_id = '00000000-0000-0000-0000-00000000000b' and name = 'B pool' from public.pools where id = '00000000-0000-0000-0000-0000000000b1'),
  'B''s pool is unchanged'
);
select rls_test.check((select fc = 4 from public.readings where id = '00000000-0000-0000-0000-0000000000b2'), 'B''s reading is unchanged');
select rls_test.check((select amount = 2000 from public.doses where id = '00000000-0000-0000-0000-0000000000b3'), 'B''s dose is unchanged');
select rls_test.check((select notes is null from public.events where id = '00000000-0000-0000-0000-0000000000b4'), 'B''s event is unchanged');
select rls_test.check((select units = 'us' from public.profiles where id = '00000000-0000-0000-0000-00000000000b'), 'B''s profile is unchanged');

rollback;
