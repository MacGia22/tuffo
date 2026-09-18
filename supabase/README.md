# Database

Schema changes live in `supabase/migrations`, one timestamped SQL file each, applied in
order. The database is a Supabase project (Postgres) with row-level security on every
table; the app reaches it with the publishable key as the signed-in user, and scheduled
jobs use the secret key.

## Applying a migration

Until a CI migration step exists, apply new files by hand: open the project's SQL
editor, paste the file, run it. Each file is written to be safe to run once; do not run
a file twice. Applied so far is recorded in this list; keep it current:

| File | Applied |
| --- | --- |
| 20260918000001_init.sql | pending |
| 20260918000002_tighten_grants.sql | pending |

With the Supabase CLI (`npx supabase link --project-ref <ref>` once, then
`npx supabase db push`) the same files are applied automatically.

## Conventions

- Units in the database are SI: liters, grams, millilitres, degrees Celsius, ppm.
- A pool's location is a weather cell (0.05°, about 5 km), never an address.
- `pool_models` has no user policy on purpose: coefficients are served through the API,
  never read directly by the browser.
