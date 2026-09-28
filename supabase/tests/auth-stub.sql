-- Stand-in for the parts of Supabase the migrations rely on, so they can run on a plain
-- Postgres 16: the three API roles, auth.users and auth.uid(). auth.uid() reads the
-- JWT claims the same way Supabase does, so a test becomes a user with
--   set role authenticated;
--   select set_config('request.jwt.claims', '{"sub":"<uuid>"}', false);

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end;
$$;

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key,
  email text
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
