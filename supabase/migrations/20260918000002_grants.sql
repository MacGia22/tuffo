-- Privileges, stated explicitly rather than inherited from Supabase defaults
-- (the first run of the schema left service_role and anon without any).
--
--   service_role   everything: it is the key scheduled jobs and admin code use
--   authenticated  its own pools and history, read-only weather, its own profile
--   anon           nothing; row-level security is the second lock

grant usage on schema public to anon, authenticated, service_role;

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all functions in schema public to service_role;

grant select, update on public.profiles to authenticated;
grant select on public.weather_cells, public.weather_daily, public.weather_forecast to authenticated;
grant select, insert, update, delete on public.pools, public.readings, public.doses, public.events to authenticated;

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
revoke all on public.pool_models from authenticated;

-- Tables created later by the same role get the same shape without a further grant.
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant all on functions to service_role;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;
