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

select rls_test.check(
  not has_table_privilege('authenticated', 'public.feedback', 'update, delete, truncate'),
  'authenticated cannot change or delete feedback'
);

select rls_test.check(
  not has_column_privilege('authenticated', 'public.feedback', 'status', 'insert')
    and not has_column_privilege('authenticated', 'public.feedback', 'created_at', 'insert'),
  'authenticated cannot set a feedback status or time'
);

select rls_test.check(
  not has_table_privilege('authenticated', 'public.plans', 'insert, update, delete, truncate'),
  'authenticated cannot write plans'
);

select rls_test.check(
  not has_table_privilege('authenticated', 'public.alert_settings', 'delete, truncate')
    and not has_table_privilege('authenticated', 'public.alert_emails', 'insert, update, delete, truncate')
    and not has_table_privilege('authenticated', 'public.alert_log', 'insert, update, delete, truncate'),
  'authenticated cannot delete alert settings or write the alert log'
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

insert into public.pump_schedules (id, pool_id, segments, cell_hours) values
  ('00000000-0000-0000-0000-0000000000a7', '00000000-0000-0000-0000-0000000000a1', '[{"start":"08:00","end":"16:00","cell":true}]', 8),
  ('00000000-0000-0000-0000-0000000000b7', '00000000-0000-0000-0000-0000000000b1', '[{"start":"08:00","end":"16:00","cell":true}]', 8);

insert into public.pool_equipment (id, pool_id, kind, model, details) values
  ('00000000-0000-0000-0000-0000000000a8', '00000000-0000-0000-0000-0000000000a1', 'pump', 'A pump', '{"speed":"variable"}'),
  ('00000000-0000-0000-0000-0000000000b8', '00000000-0000-0000-0000-0000000000b1', 'pump', 'B pump', '{"speed":"single"}');

insert into public.pool_rain (pool_id, date, rain_mm) values
  ('00000000-0000-0000-0000-0000000000a1', '2026-09-01', 5),
  ('00000000-0000-0000-0000-0000000000b1', '2026-09-01', 7);

insert into public.pool_maintenance (pool_id, task, done_on) values
  ('00000000-0000-0000-0000-0000000000a1', 'cell_clean', '2026-09-01'),
  ('00000000-0000-0000-0000-0000000000b1', 'cell_clean', '2026-09-01');

insert into public.pool_pressure (pool_id, read_on, kpa, clean) values
  ('00000000-0000-0000-0000-0000000000a1', '2026-09-01', 70, true),
  ('00000000-0000-0000-0000-0000000000b1', '2026-09-01', 80, true);

insert into public.plans (pool_id, version, summary, days) values
  ('00000000-0000-0000-0000-0000000000a1', 1, '{}', '[]'),
  ('00000000-0000-0000-0000-0000000000b1', 1, '{}', '[]');

insert into public.alert_settings (pool_id, algae) values
  ('00000000-0000-0000-0000-0000000000a1', true),
  ('00000000-0000-0000-0000-0000000000b1', true);
insert into public.alert_emails (user_id, sent_on, alerts) values
  ('00000000-0000-0000-0000-00000000000a', '2026-10-01', 1),
  ('00000000-0000-0000-0000-00000000000b', '2026-10-01', 1);
insert into public.alert_log (user_id, pool_id, kind, sent_on) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', 'algae', '2026-10-01'),
  ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000b1', 'algae', '2026-10-01');



insert into public.feedback (id, user_id, kind, message) values
  ('00000000-0000-0000-0000-0000000000a6', '00000000-0000-0000-0000-00000000000a', 'idea', 'A idea'),
  ('00000000-0000-0000-0000-0000000000b6', '00000000-0000-0000-0000-00000000000b', 'problem', 'B problem');

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
select rls_test.check(rls_test.rows('select 1 from public.feedback') = 1, 'A sees only A''s feedback');
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
select rls_test.check(rls_test.rows('select 1 from public.feedback where id = ''00000000-0000-0000-0000-0000000000b6''') = 0, 'A cannot read B''s feedback');

-- update B's rows
select rls_test.check(rls_test.touched('update public.profiles set units = ''metric'' where id = ''00000000-0000-0000-0000-00000000000b''') = 0, 'A cannot update B''s profile');
select rls_test.check(rls_test.touched('update public.pools set name = ''taken'' where id = ''00000000-0000-0000-0000-0000000000b1''') = 0, 'A cannot update B''s pool');
select rls_test.check(rls_test.touched('update public.readings set fc = 0 where id = ''00000000-0000-0000-0000-0000000000b2''') = 0, 'A cannot update B''s readings');
select rls_test.check(rls_test.touched('update public.doses set amount = 1 where id = ''00000000-0000-0000-0000-0000000000b3''') = 0, 'A cannot update B''s doses');
select rls_test.check(rls_test.touched('update public.events set notes = ''x'' where id = ''00000000-0000-0000-0000-0000000000b4''') = 0, 'A cannot update B''s events');

-- edit A's own rows in place (2.6b): allowed, and only those
select rls_test.check(rls_test.touched('update public.readings set fc = 2.5 where id = ''00000000-0000-0000-0000-0000000000a2''') = 1, 'A can edit A''s reading');
select rls_test.check(rls_test.touched('update public.doses set amount = 1500 where id = ''00000000-0000-0000-0000-0000000000a3''') = 1, 'A can edit A''s dose');
select rls_test.check(rls_test.touched('update public.events set notes = ''edited'' where id = ''00000000-0000-0000-0000-0000000000a4''') = 1, 'A can edit A''s event');
select rls_test.check(rls_test.touched('update public.readings set fc = 2.5') = 1, 'an unfiltered edit by A touches only A''s reading');

-- device ids (offline logging): a second insert with the same client_id is refused
select rls_test.check(
  rls_test.touched('insert into public.readings (pool_id, fc, client_id) values (''00000000-0000-0000-0000-0000000000a1'', 3, ''11111111-1111-4111-8111-111111111111'')') = 1,
  'A can log a test with a device id'
);
do $$
begin
  insert into public.readings (pool_id, fc, client_id)
    values ('00000000-0000-0000-0000-0000000000a1', 3, '11111111-1111-4111-8111-111111111111');
  raise exception 'RLS FAIL: the same device id was stored twice';
exception
  when unique_violation then
    null;
end;
$$;

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

-- plans: A reads A's plan only and cannot write any
select rls_test.check(rls_test.rows('select 1 from public.plans') = 1, 'A sees only A''s plan');
select rls_test.check(rls_test.rows('select 1 from public.plans where pool_id = ''00000000-0000-0000-0000-0000000000b1''') = 0, 'A cannot read B''s plan');
select rls_test.denied('update public.plans set version = 9', 'A cannot change a plan');
select rls_test.denied('delete from public.plans', 'A cannot delete a plan');
select rls_test.denied(
  'insert into public.plans (pool_id, version, summary, days) values (''00000000-0000-0000-0000-0000000000a1'', 1, ''{}'', ''[]'')',
  'A cannot write a plan'
);

-- alerts: A manages A's own choices and sees what was sent to A, nothing else
select rls_test.check(rls_test.rows('select 1 from public.alert_settings') = 1, 'A sees only A''s alert settings');
select rls_test.check(rls_test.rows('select 1 from public.alert_emails') = 1, 'A sees only A''s alert emails');
select rls_test.check(rls_test.rows('select 1 from public.alert_log') = 1, 'A sees only A''s alert log');
select rls_test.check(
  rls_test.touched('update public.alert_settings set weekly = true where pool_id = ''00000000-0000-0000-0000-0000000000a1''') = 1,
  'A can change A''s alert settings'
);
select rls_test.check(
  rls_test.touched('update public.alert_settings set algae = false where pool_id = ''00000000-0000-0000-0000-0000000000b1''') = 0,
  'A cannot change B''s alert settings'
);
select rls_test.denied(
  'insert into public.alert_settings (pool_id, algae) values (''00000000-0000-0000-0000-0000000000b9'', true)',
  'A cannot add alert settings for a pool that is not A''s'
);
select rls_test.denied(
  'update public.alert_settings set pool_id = ''00000000-0000-0000-0000-0000000000b1'' where pool_id = ''00000000-0000-0000-0000-0000000000a1''',
  'A cannot move alert settings to B''s pool'
);
select rls_test.denied(
  'insert into public.alert_emails (user_id, sent_on) values (''00000000-0000-0000-0000-00000000000a'', ''2026-10-02'')',
  'A cannot write the alert emails'
);
select rls_test.denied('delete from public.alert_log', 'A cannot delete the alert log');

-- pump schedules: A reads and adds A's only, never edits
select rls_test.check(rls_test.rows('select 1 from public.pump_schedules') = 1, 'A sees only A''s pump schedule');
select rls_test.check(
  rls_test.touched('insert into public.pump_schedules (pool_id, segments, cell_hours) values (''00000000-0000-0000-0000-0000000000a1'', ''[]'', 0)') = 1,
  'A can add a pump schedule to A''s pool'
);
select rls_test.denied(
  'insert into public.pump_schedules (pool_id, segments, cell_hours) values (''00000000-0000-0000-0000-0000000000b1'', ''[]'', 0)',
  'A cannot add a pump schedule to B''s pool'
);
select rls_test.denied('update public.pump_schedules set cell_hours = 24', 'A cannot edit a pump schedule');
select rls_test.check(
  rls_test.touched('delete from public.pump_schedules where id = ''00000000-0000-0000-0000-0000000000b7''') = 0,
  'A cannot delete B''s pump schedule'
);
select rls_test.check(
  rls_test.touched('insert into public.events (pool_id, kind, value) values (''00000000-0000-0000-0000-0000000000a1'', ''cell_setting'', 50)') = 1,
  'A can log a cell setting'
);

-- equipment: A reads, adds, edits and removes A's only; one current item per kind
select rls_test.check(rls_test.rows('select 1 from public.pool_equipment') = 1, 'A sees only A''s equipment');
select rls_test.check(
  rls_test.touched('insert into public.pool_equipment (pool_id, kind, details) values (''00000000-0000-0000-0000-0000000000a1'', ''filter'', ''{"type":"sand"}'')') = 1,
  'A can add equipment to A''s pool'
);
select rls_test.denied(
  'insert into public.pool_equipment (pool_id, kind) values (''00000000-0000-0000-0000-0000000000b1'', ''filter'')',
  'A cannot add equipment to B''s pool'
);
select rls_test.check(rls_test.touched('update public.pool_equipment set model = ''renamed''') = 2, 'A can edit A''s equipment only');
select rls_test.denied(
  'update public.pool_equipment set pool_id = ''00000000-0000-0000-0000-0000000000b1'' where id = ''00000000-0000-0000-0000-0000000000a8''',
  'A cannot move equipment to B''s pool'
);
do $$
begin
  insert into public.pool_equipment (pool_id, kind) values ('00000000-0000-0000-0000-0000000000a1', 'pump');
  raise exception 'RLS FAIL: a second current pump was accepted';
exception
  when unique_violation then
    null;
end;
$$;
select rls_test.check(
  rls_test.touched('update public.pool_equipment set removed_on = current_date where id = ''00000000-0000-0000-0000-0000000000a8''') = 1,
  'A can retire A''s pump'
);
select rls_test.check(
  rls_test.touched('insert into public.pool_equipment (pool_id, kind) values (''00000000-0000-0000-0000-0000000000a1'', ''pump'')') = 1,
  'A can add a new pump once the old one is retired'
);
select rls_test.check(rls_test.touched('delete from public.pool_equipment where kind = ''filter''') = 1, 'A can delete A''s equipment only');

-- maintenance log and filter pressure: A reads, adds and removes A's only; no edits
select rls_test.check(rls_test.rows('select 1 from public.pool_maintenance') = 1, 'A sees only A''s maintenance');
select rls_test.check(
  rls_test.touched('insert into public.pool_maintenance (pool_id, task, done_on) values (''00000000-0000-0000-0000-0000000000a1'', ''pump_basket'', ''2026-09-02'')') = 1,
  'A can log maintenance for A''s pool'
);
select rls_test.denied(
  'insert into public.pool_maintenance (pool_id, task, done_on) values (''00000000-0000-0000-0000-0000000000b1'', ''pump_basket'', ''2026-09-02'')',
  'A cannot log maintenance for B''s pool'
);
select rls_test.denied('update public.pool_maintenance set done_on = ''2026-09-03''', 'A cannot edit maintenance rows');
select rls_test.check(rls_test.touched('delete from public.pool_maintenance') = 2, 'A can remove A''s maintenance only');
do $$
begin
  insert into public.pool_maintenance (pool_id, task, done_on) values ('00000000-0000-0000-0000-0000000000a1', 'Drop table', '2026-09-03');
  raise exception 'RLS FAIL: a malformed task id was accepted';
exception
  when check_violation then
    null;
end;
$$;
select rls_test.check(rls_test.rows('select 1 from public.pool_pressure') = 1, 'A sees only A''s filter pressure');
select rls_test.check(
  rls_test.touched('insert into public.pool_pressure (pool_id, read_on, kpa) values (''00000000-0000-0000-0000-0000000000a1'', ''2026-09-02'', 120)') = 1,
  'A can log pressure for A''s pool'
);
select rls_test.denied(
  'insert into public.pool_pressure (pool_id, read_on, kpa) values (''00000000-0000-0000-0000-0000000000b1'', ''2026-09-02'', 120)',
  'A cannot log pressure for B''s pool'
);
select rls_test.denied('update public.pool_pressure set kpa = 1', 'A cannot edit pressure rows');
select rls_test.check(rls_test.touched('delete from public.pool_pressure') = 2, 'A can remove A''s pressure only');
do $$
begin
  insert into public.pool_pressure (pool_id, read_on, kpa) values ('00000000-0000-0000-0000-0000000000a1', '2026-09-03', 900);
  raise exception 'RLS FAIL: a pressure above 400 kPa was accepted';
exception
  when check_violation then
    null;
end;
$$;

-- rain at the pool: A reads, sets, changes and removes A's only
select rls_test.check(rls_test.rows('select 1 from public.pool_rain') = 1, 'A sees only A''s rain');
select rls_test.check(
  rls_test.touched('insert into public.pool_rain (pool_id, date, rain_mm) values (''00000000-0000-0000-0000-0000000000a1'', ''2026-09-02'', 12.7)') = 1,
  'A can set rain for A''s pool'
);
select rls_test.denied(
  'insert into public.pool_rain (pool_id, date, rain_mm) values (''00000000-0000-0000-0000-0000000000b1'', ''2026-09-02'', 1)',
  'A cannot set rain for B''s pool'
);
select rls_test.check(rls_test.touched('update public.pool_rain set rain_mm = 3') = 2, 'A can change A''s rain only');
select rls_test.denied(
  'update public.pool_rain set pool_id = ''00000000-0000-0000-0000-0000000000b1'' where date = ''2026-09-02''',
  'A cannot move rain to B''s pool'
);
select rls_test.check(rls_test.touched('delete from public.pool_rain') = 2, 'A can remove A''s rain only');
do $$
begin
  insert into public.pool_rain (pool_id, date, rain_mm) values ('00000000-0000-0000-0000-0000000000a1', '2026-09-03', 900);
  raise exception 'RLS FAIL: rain above 500 mm was accepted';
exception
  when check_violation then
    null;
end;
$$;

-- feedback: A sends A's own, nothing else
select rls_test.check(
  rls_test.touched('insert into public.feedback (user_id, kind, message, page) values (''00000000-0000-0000-0000-00000000000a'', ''question'', ''How?'', ''/app'')') = 1,
  'A can send feedback'
);
select rls_test.check(
  (select status = 'new' from public.feedback where message = 'How?'),
  'new feedback starts as new'
);
select rls_test.denied(
  'insert into public.feedback (user_id, kind, message) values (''00000000-0000-0000-0000-00000000000b'', ''idea'', ''planted'')',
  'A cannot send feedback as B'
);
select rls_test.denied(
  'insert into public.feedback (user_id, kind, message, status) values (''00000000-0000-0000-0000-00000000000a'', ''idea'', ''x'', ''done'')',
  'A cannot set the status of new feedback'
);
select rls_test.denied('update public.feedback set status = ''done''', 'A cannot change a feedback status');
select rls_test.denied('update public.feedback set message = ''edited''', 'A cannot edit feedback');
select rls_test.denied('delete from public.feedback', 'A cannot delete feedback');

-- the daily limit: A has 2 now; 8 more reach 10, the 11th is refused
do $$
begin
  for i in 1..8 loop
    insert into public.feedback (user_id, kind, message) values ('00000000-0000-0000-0000-00000000000a', 'other', 'more');
  end loop;
  begin
    insert into public.feedback (user_id, kind, message) values ('00000000-0000-0000-0000-00000000000a', 'other', 'one too many');
    raise exception 'RLS FAIL: the 11th feedback in a day was accepted';
  exception
    when raise_exception then
      if sqlerrm <> 'feedback limit reached' then
        raise;
      end if;
  end;
end;
$$;

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
select rls_test.check(
  (select count(*) = 1 from public.feedback where user_id = '00000000-0000-0000-0000-00000000000b'),
  'B''s feedback is unchanged'
);
select rls_test.check((select cell_hours = 8 from public.pump_schedules where id = '00000000-0000-0000-0000-0000000000b7'), 'B''s pump schedule is unchanged');
select rls_test.check((select model = 'B pump' from public.pool_equipment where id = '00000000-0000-0000-0000-0000000000b8'), 'B''s equipment is unchanged');
select rls_test.check((select rain_mm = 7 from public.pool_rain where pool_id = '00000000-0000-0000-0000-0000000000b1'), 'B''s rain is unchanged');
select rls_test.check((select count(*) = 1 from public.pool_maintenance where pool_id = '00000000-0000-0000-0000-0000000000b1'), 'B''s maintenance is unchanged');
select rls_test.check((select kpa = 80 from public.pool_pressure where pool_id = '00000000-0000-0000-0000-0000000000b1'), 'B''s filter pressure is unchanged');

-- one alert email per person per day: a second claim for the same day is refused
do $$
begin
  insert into public.alert_emails (user_id, sent_on) values ('00000000-0000-0000-0000-00000000000b', '2026-10-01');
  raise exception 'RLS FAIL: a second alert email was claimed for the same day';
exception
  when unique_violation then
    null;
end;
$$;

-- deleting an account deletes its feedback
delete from auth.users where id = '00000000-0000-0000-0000-00000000000a';
select rls_test.check(
  not exists (select 1 from public.feedback where user_id = '00000000-0000-0000-0000-00000000000a'),
  'feedback is deleted with the account'
);
select rls_test.check(
  not exists (select 1 from public.plans where pool_id = '00000000-0000-0000-0000-0000000000a1'),
  'the plan is deleted with the account'
);
select rls_test.check(
  (select algae from public.alert_settings where pool_id = '00000000-0000-0000-0000-0000000000b1'),
  'B''s alert settings are unchanged'
);
select rls_test.check(
  not exists (select 1 from public.alert_emails where user_id = '00000000-0000-0000-0000-00000000000a')
    and not exists (select 1 from public.alert_log where user_id = '00000000-0000-0000-0000-00000000000a')
    and not exists (select 1 from public.alert_settings where pool_id = '00000000-0000-0000-0000-0000000000a1'),
  'alert settings and log are deleted with the account'
);

rollback;
