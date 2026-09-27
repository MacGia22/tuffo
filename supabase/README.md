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

The first two predate the job; it marks them applied (`supabase migration repair`) so
they never run twice. New files are written so a second run is harmless anyway
(`if not exists`, `drop … if exists`).

To try a migration locally: any Postgres 15+ with a stand-in `auth` schema works
(`auth.users`, `auth.uid()`, and the roles `anon`, `authenticated`, `service_role`),
then `npx supabase db push --db-url postgresql://…`.

## Conventions

- Every migration that creates a table grants `service_role` on it explicitly and
  leaves `anon` with nothing; Supabase's default privileges are not relied on.

- Units in the database are SI: liters, grams, millilitres, degrees Celsius, ppm.
- A pool's location is a weather cell (0.05°, about 5 km), never an address.
- `pool_models` has no user policy on purpose: coefficients are served through the API,
  never read directly by the browser.
- `scans` is written only by the server (the photo-scan route); users can read their
  own rows, which is how the app shows the scans left this month. Rows older than a
  year are deleted by the nightly job.
