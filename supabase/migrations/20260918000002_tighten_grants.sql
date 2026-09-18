-- Supabase grants anon, authenticated and service_role full privileges on new
-- public tables by default. Row-level security already stops signed-out visitors,
-- but the privileges should say the same thing: anon gets nothing, and the
-- server-only table is closed to signed-in users too.

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke all on functions from anon;

revoke all on public.pool_models from authenticated;

-- Signed-in users write only the columns the app writes; jobs (service role) own the rest.
revoke insert, update, delete on public.weather_cells, public.weather_daily, public.weather_forecast from authenticated;
revoke insert, delete on public.profiles from authenticated;
