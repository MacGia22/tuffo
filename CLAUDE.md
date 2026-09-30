@AGENTS.md

# Tuffo: working rules for Claude Code

Tuffo (https://tuffo.app) is Gianluca Maccani's pool-chemistry web app: log water tests,
see what the weather did between them, get dosing advice and, next, a 7-day plan. It is a
private beta today. What to build next and the end goal are in `docs/ROADMAP.md`; read it
before starting work. `README.md` covers the stack, environment variables and jobs;
`supabase/README.md` covers the database and migrations.

## Commands

```
npm install
npm run dev          # local app (needs .env.local for anything behind sign-in)
npm run check        # lint + typecheck (next typegen first) + vitest
npm run build        # production build; run it before pushing
```

CI (`.github/workflows/ci.yml`) runs the same checks on every push and pull request, and on
`main` applies new files in `supabase/migrations` to production (`migrate` job).

## How to work

- One branch and one pull request per change. CI must pass. Gianluca merges, or has said
  in the session that you may merge after CI. Vercel builds a preview for each PR and
  deploys `main` to production.
- Before calling something done: `npm run check` and `npm run build` pass, new logic has
  unit tests, README / supabase README are updated, and after deploy
  `https://tuffo.app/api/health` shows the new version with every table true.
- Ask before anything that costs money or changes an account: plan upgrades, domains,
  paid APIs, Stripe live mode, DNS.
- Keep the reply to Gianluca short: what changed, what he has to do (if anything).

## Non-negotiables

1. **Secrets never enter the repo, logs or chat.** They live in Vercel env vars and the
   GitHub `SUPABASE_DB_URL` secret. Never print or decrypt env values. `/api/health`
   reports yes/no and shapes only; keep it that way.
2. **The engine stays on the server.** Application code imports `@/engine/server`
   (it imports `server-only`). Models, coefficients and priors never reach the browser;
   the API returns advice, not parameters. This is the product's main IP protection.
3. **Row-level security on every table**, with explicit grants: `service_role` all,
   `authenticated` only what it needs, `anon` nothing. Users read and write only their
   own rows; server-only tables (like `pool_models`, `scans` writes) have no user policy.
4. **Migrations are additive and safe to re-run** (`if not exists`, `drop … if exists`).
   Vercel deploys while the `migrate` job runs, so code must work before and after the
   migration lands: add first, use later, drop only after nothing uses it. Never edit an
   applied migration; add a new timestamped file. Test locally on Postgres 16 with the
   stand-in auth schema described in `supabase/README.md`.
5. **Privacy by design.** Store only what `/privacy` says. A pool's location is a 0.05°
   weather cell plus a town name, never an address or GPS point. Photos are read once and
   never stored. No analytics or ad trackers without a certified consent platform. If a
   change collects new data or adds a processor, update `src/app/privacy/page.tsx` (and
   its date) in the same PR and tell Gianluca.
6. **Database units are SI**: liters, grams, milliliters, °C, ppm. Convert only at the
   edges (`src/lib/dose-format.ts`, `src/lib/format.ts`).
7. **Advice is advisory.** Keep the "Tuffo advises; you decide" framing, per-addition
   caps and handling notes. Never suggest mixing chemicals. A change to dosing math needs
   engine tests with worked numbers.
8. **Fail open on side features.** Weather refresh, scan quotas and similar must log and
   carry on, never break the page (see `src/lib/weather/job.ts`, `src/lib/scan/quota.ts`).
9. **Dependencies**: permissive licences only (MIT, Apache-2.0, BSD, ISC). Ask before
   adding anything heavy.
10. **Keep Tuffo separate from Gianluca's employer.** Never use the polytec-na GitHub
    organization, BM Group accounts or storage, or company machines for Tuffo work.

## Conventions

- Next.js 16 App Router, server actions with `useActionState`, `after()` for background
  work, `proxy.ts` (not middleware). Read `node_modules/next/dist/docs/` when unsure.
- Tailwind 4 with the brand tokens in `src/app/globals.css`; charts use the
  `--chart-*` tokens and follow the rules in `src/components/trend-charts.tsx`
  (one scale per panel, no dual axes, table view, keyboard access).
- Copy: short, plain, specific, US English, units always shown. No marketing adjectives.
- Tests: vitest next to the code in `__tests__` folders; pure functions over mocks.
- Jobs: two daily Vercel crons hit `/api/jobs/weather` (06:00 UTC) and `/api/jobs/alerts`
  (11:30 UTC) with `CRON_SECRET`; Hobby allows daily crons only, so anything more
  frequent waits for Vercel Pro or runs on page views. Anything that emails or writes on
  a schedule runs only when `VERCEL_ENV` is `production` (previews share the database).
- A weekly scheduled check ("Tuffo weekly check", Mondays) reads health, deployments,
  errors and dependency versions and writes `claude/tuffo-status.md` to the Claude project.
