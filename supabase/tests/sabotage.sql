-- A deliberately broken policy, used by `run.sh --expect-failure` to show that rls.sql
-- notices when one user can read another's rows. Never apply this anywhere else.
drop policy if exists "readings: via pool" on public.readings;
create policy "readings: via pool" on public.readings
  for all to authenticated
  using (true)
  with check (true);
