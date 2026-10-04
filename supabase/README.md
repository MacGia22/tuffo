# Database

Schema changes live in `supabase/migrations`, one timestamped SQL file each, applied in
order. The database is a Supabase project (Postgres) with row-level security on every
table; the app reaches it with the publishable key as the signed-in user, and scheduled
jobs use the secret key.

## Applying a migration

GitHub Actions applies them. After the checks pass on `main`, the `migrate` job in
`.github/workflows/ci.yml` runs `supabase db push`, which applies every file in
`supabase/migrations` that the database has not seen yet and records it in
`supabase_migrations.schema_migrations`. The job needs one repository secret:

- `SUPABASE_DB_URL`: the Supabase **session pooler** connection string (Connect →
  Session pooler, port 5432), with the database password filled in. The pooler is used
  because GitHub's runners have no IPv6 and the direct host is IPv6-only.

Without the secret the job leaves a notice and does nothing.

Vercel deploys at the same time as the job runs, so a migration must work with the
code already live, and new code must cope with the migration not being there yet (add
columns and tables before code needs them; drop things only after code stops using
them).

History:

| File | Applied |
| --- | --- |
| 20260918000001_init.sql | 2026-09-18, by hand in the SQL editor |
| 20260918000002_grants.sql | 2026-09-18, by hand in the SQL editor |
| 20260927000001_scans_and_event_kinds.sql | by the `migrate` job |
| 20260928000001_waitlist.sql | by the `migrate` job |
| 20260929000001_feedback.sql | by the `migrate` job |
| 20260930000001_imported_readings.sql | by the `migrate` job |
| 20260930000002_client_ids.sql | by the `migrate` job |
| 20260930000003_plans.sql | by the `migrate` job |
| 20260930000004_alerts.sql | by the `migrate` job |
| 20260930000005_salt_cell_model.sql | by the `migrate` job |
| 20260930000006_cell_settings_pump.sql | by the `migrate` job |

The first two predate the job; it marks them applied (`supabase migration repair`) so
they never run twice. New files are written so a second run is harmless anyway
(`if not exists`, `drop … if exists`).

To try a migration locally: any Postgres 15+ with a stand-in `auth` schema works
(`auth.users`, `auth.uid()`, and the roles `anon`, `authenticated`, `service_role`;
`supabase/tests/auth-stub.sql` creates them), then
`npx supabase db push --db-url postgresql://…`.

## Row-level-security tests

`supabase/tests/run.sh` creates a fresh database on a local Postgres 16 server, adds the
stand-in auth schema, applies every migration, applies each one a second time, and runs
`supabase/tests/rls.sql`. The `rls` job in CI does the same on a `postgres:16` service,
then breaks a policy on purpose (`sabotage.sql`) and requires the tests to fail. The
`migrate` job waits for both.

```
RLS_DB_URL=postgresql://postgres:postgres@localhost:5432/postgres npm run test:rls
```

What `rls.sql` proves, with two users A and B who own one pool each:

- every table in `public` has row-level security on, and `anon` holds no privilege on
  any of them (checked from the catalog, so new tables are covered automatically);
- a signed-out visitor cannot read any table;
- A sees only A's own profile, pools, readings, doses, events, scans, scan reports and feedback, and
  cannot read, update, delete, create or move rows into B's; A can edit A's own
  readings, doses and events in place, and an unfiltered update touches only those;
- a device id (`client_id`) can be stored only once;
- A reads only A's 7-day plan and cannot write plans; plans go with the account;
- A reads and adds only A's pump schedules, never edits them, and can log a cell setting;
- A reads and changes only A's alert settings, sees only A's alert log, cannot write the
  log, and a second alert email for the same person and day is refused;
- A can send feedback as A only, cannot set its status, edit or delete it, and the 11th
  message in 24 hours is refused; feedback goes when the account is deleted;
- users cannot write `scans`, read or write `pool_models` or the `waitlist`, or write
  weather;
- A reads and deletes only A's own scan reports, cannot write or change any, a stored
  photo without consent is refused, and reports go when the account is deleted;
- users cannot read `ref_visits` or call `count_ref_visit` / `users_with_tests`; the
  server counts visits per label and day, ignores malformed labels and keeps at most 200
  labels a day;
- B's rows are unchanged afterwards.

A new table needs its own lines in `rls.sql` for the per-user checks. The first
migration (`…_init.sql`) is the one file not re-run: it was applied by hand, is
recorded as applied, and uses plain `create trigger` / `create policy`. Every later
migration must survive a second run.

## Conventions

- Every migration that creates a table grants `service_role` on it explicitly and
  leaves `anon` with nothing; Supabase's default privileges are not relied on.

- Units in the database are SI: liters, grams, millilitres, degrees Celsius, ppm.
- A pool's location is a weather cell (0.03°, about 3 km; 0.05° for pools not moved since
  September 2026), never an address.
- `pool_models` has no user policy on purpose: coefficients are served through the API,
  never read directly by the browser.
- `scans` is written only by the server (the photo-scan route); users can read their
  own rows, which is how the app shows the scans left this month. Rows older than a
  year are deleted by the nightly job.
- `scan_reports` (misread reports) is written only by the server (`/api/scan-report`,
  the admin page); users read and delete their own rows, never insert or update. A row
  with `photo_path` must carry `photo_consent_at`, `consent_version` and
  `photo_delete_after` (check constraint). The photo itself is in the private Storage
  bucket `scan-reports` (created by the migration, no storage policies: only the service
  key reads or writes it). Rows cascade from `auth.users`; files do not, so account
  deletion removes the `{user_id}/` folder in code. The alerts job deletes photos past
  `photo_delete_after`.
- `waitlist` has no policies and no user grants: only the server writes it (the
  waitlist route, the admin invite page). A row is deleted when the person is invited,
  asks to be removed, or deletes an account with the same address.
- `readings`, `doses` and `events` have a unique `client_id` (a UUID made on the device
  for offline logging); a second insert with the same id fails with 23505, which the
  app treats as "already saved". Null for older rows.
- `pump_schedules`: one row per schedule a salt pool has run (segments as JSON, the hours
  a day the cell runs, from when); owner reads, inserts and deletes, never updates, so the
  history the chlorine model reads stays true. Cell settings are `events` of kind
  `cell_setting` with the percent in `value`.
- `pool_equipment`: the pump, chlorine feeder, filter and heater of a pool (`kind`, `model`,
  `details` JSON, `installed_on`, `removed_on`); one current row per kind (partial unique
  index on `removed_on is null`); replacing dates the old row. Owner reads, inserts, updates
  and deletes. The current salt cell stays on `pools`; a replaced cell is kept here as a
  dated `cell` row (`details.lbPerDay`), never as a current one.
- `pool_maintenance`: upkeep done (`task` id from `src/lib/maintenance.ts`, `done_on`);
  `pool_pressure`: filter gauge readings (`kpa`, `read_on`, `clean` for the reading right
  after cleaning). Owner reads, inserts and deletes. `pools.maintenance_intervals` (JSON,
  days per task id) and `pools.swg_cell_installed_on` hold the owner's settings;
  `pools.enclosure` (screen kind) and `pools.enclosure_sun_pct` (5–100, share of sun through it)
  the screen enclosure;
  `pools.salt_target_low_ppm` / `salt_target_high_ppm` (both or neither, 500–10,000, low <
  high) the salt range the chlorinator asks for, and `pools.swg_cell_levels` (2–20, null for
  percent) a cell set in levels;
  `alert_settings.maintenance` switches the reminder email on.
- `pool_rain`: the rain an owner entered for a day at the pool (mm, one row per pool and
  day), used instead of the weather cell's rain; owner reads, inserts, updates and deletes.
- `plans` (the 7-day plan per pool) is written only by the server (nightly job, after a
  test, on a stale page view) and read by the pool's owner. It holds advice per day, never
  model coefficients.
- `alert_settings` (per pool, owner reads, inserts and updates), `alert_emails` (one row
  per person per day: the primary key is the one-email-a-day rule) and `alert_log` (one
  row per alert sent, kept 90 days); the last two are written only by the alerts job.
- `feedback`: users insert and read their own rows only (insert limited to the columns
  they fill in, so `status` always starts as `new`); no update or delete. A trigger
  refuses more than 10 rows per user in 24 hours. The admin page changes the status with
  the service key. Rows cascade from `auth.users`. A scheduled read-only routine selects
  `id, created_at, kind, message, page, app_version, status, contact_ok` (never
  `user_id`): keep those columns stable.
