# Tuffo

Pool chemistry that knows your weather. Log a water test, see what the sun, heat and
rain did between readings, and get a seven-day dosing plan for your own pool.

This repository is private and proprietary. See `LICENSE`.

## Stack

- Next.js (App Router, TypeScript) on Vercel
- Tailwind CSS 4
- Supabase (Postgres, auth, scheduled jobs); schema in `supabase/migrations`
- Vitest for the chemistry engine

## Layout

```
src/app            routes, metadata files (manifest, icons, robots, sitemap)
src/app/login      magic-link sign-in; src/app/auth/* completes and ends sessions
src/app/app        the signed-in app: pools, tests, doses and events, account
src/app/privacy    privacy notice; src/app/terms the terms of use
src/components     UI components (brand, trend charts, forms, lists)
src/engine         chemistry engine: pure functions, unit tests alongside
src/engine/server  the only import path application code may use for the engine
src/lib/model      chlorine-consumption model: test pairs, fitting, backtest, pool-page summary
src/lib/auth       current user helpers and redirect hygiene
src/lib/supabase   server, browser and admin clients; session refresh used by src/proxy.ts
src/lib/weather    weather cells (0.05° grid), town lookup, refresh job, between-test summary
src/lib/scan       photo reading (vision model) and the monthly scan allowance
supabase           database migrations and notes
docs/ROADMAP.md    what to build next and the final target (rules for agents: CLAUDE.md)
```

The engine never ships to the browser: `src/engine/server.ts` imports `server-only`,
so importing it from a client component fails the build.

## Sign-in and the beta gate

Sign-in is a Supabase magic link: `/login` sends it, `/auth/callback` turns it into a
session cookie, `POST /auth/signout` ends it. `src/proxy.ts` refreshes the session on
every request and bounces signed-out visitors away from `/app`; pages verify the user
again before reading data.

Who may sign in is a Supabase setting, not code: Authentication → Sign In / Providers →
Email → "Allow new users to sign up". Off means invite-only; on opens the beta to
anyone. Supabase also needs the
site URL and redirect URLs (Authentication → URL Configuration): the production domain
plus `https://*-mac-pool.vercel.app/**` for previews.

Supabase's built-in mailer only delivers to members of the Supabase organisation, is
rate-limited and does not allow template edits; custom SMTP (Resend, sender
`hello@tuffo.app`, host `smtp.resend.com`, port 465, user `resend`, password = API key)
is set under Authentication → Emails → SMTP. With it in place, the "Magic Link" and
"Confirm sign up" templates carry both a token-hash link (works from any browser, not
only the one that requested it) and a numeric code the sign-in page accepts:

```html
<h2>Sign in to Tuffo</h2>
<p>Your code: <strong style="font-size:24px;letter-spacing:4px">{{ .Token }}</strong></p>
<p>Or tap <a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email">Open Tuffo</a> on this device.</p>
<p>Both work once and expire in an hour. If you didn't ask for this, ignore the email.</p>
```

## Waitlist, invitations and feedback

The home page form stores sign-ups in the `waitlist` table (server-only, see
`supabase/README.md`) through `POST /api/waitlist`. The answer is the same whether or
not the address was already there. Limits: a hidden field that only bots fill in, 5
sign-ups per network address per 10 minutes (counted in memory, never stored) and
`WAITLIST_HOURLY_LIMIT` per hour across everyone (default 100).

Invitations: people whose email is in `ADMIN_EMAILS` see **Invites** in the app header
(`/app/admin`; everyone else gets a 404). It lists the waitlist and sends an invitation
to any address with Supabase's admin API; the address then leaves the waitlist. Sign-ups
stay closed. The Supabase "Invite user" template needs a token-hash link like the others:

```html
<h2>You're invited to the Tuffo beta</h2>
<p><a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=invite">Open Tuffo</a> to sign in. The link works once and expires in 24 hours.</p>
<p>After that, sign in any time at tuffo.app with this email address.</p>
```

Export the list from the Supabase SQL editor:
`select email, created_at from waitlist order by created_at;` then Download CSV.

The app footer's **Send feedback** link opens an email to hello@tuffo.app with the app
version filled in.

## Domains

`tuffo.app` is the one address; `www.tuffo.app`, `gettuffo.com` and `www.gettuffo.com`
redirect to it (308) from Vercel's domain settings, and `tuffo.vercel.app` stays as a
spare. Supabase's Site URL and the `NEXT_PUBLIC_SITE_URL` default both point at it.

Note for pushes: Vercel skips a commit that changes no files, so an empty commit does
not trigger a deployment; redeploy from the dashboard or push a real change. If pushes
stop producing deployments at all, disconnecting and reconnecting the repository under
Settings → Git re-registers the link (nothing else is lost).

## Develop

```
npm install
npm run dev        # http://localhost:3000
npm run check      # lint, typecheck, tests
npm run build
```

## Environment

Copy `.env.example` to `.env.local`. Nothing is required for the landing page.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Canonical URL used in metadata, robots and sitemap (defaults to https://tuffo.app) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase publishable key (`sb_publishable_…` or the legacy anon key); safe in the browser |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase secret key (`sb_secret_…` or the legacy service_role key); server only, used by scheduled jobs |
| `ADMIN_EMAILS` | Comma-separated emails that may open `/app/admin` and send beta invitations; unset = nobody |
| `WAITLIST_HOURLY_LIMIT` | Optional waitlist sign-ups per hour across everyone; default 100 |
| `CRON_SECRET` | Bearer token the Vercel cron sends to `/api/jobs/*`; the jobs refuse every call until it is set |
| `ANTHROPIC_API_KEY` | Enables photo scanning of test results (`/api/scan`); unset hides the scan button |
| `SCAN_MODEL` | Optional model id for scans; defaults to `claude-sonnet-4-6` |
| `SCAN_MONTHLY_LIMIT` | Optional successful scans per user per calendar month (UTC); default 30 |
| `SCAN_DAILY_GLOBAL_LIMIT` | Optional successful scans across all users per UTC day; default 300 |
| `SENTRY_DSN` | Turns on error reporting (server and browser); unset sends nothing. Read at build time for the browser, so redeploy after changing it |
| `SENTRY_AUTH_TOKEN` | Optional: uploads source maps to Sentry during the build (with `SENTRY_ORG` and `SENTRY_PROJECT`); they are deleted from the build afterwards |
| `SENTRY_ORG`, `SENTRY_PROJECT` | Sentry organization and project slugs, for the source-map upload |

GitHub Actions needs one repository secret, `SUPABASE_DB_URL`, to apply migrations
(see `supabase/README.md`).

## Photo scanning

On the test form, "Scan a printout" sends a photo (downscaled in the browser to about
1,800 px) to `POST /api/scan`, which asks a vision model for the numbers through a
structured tool call and returns them for review; the person checks each value and
saves. The photo is held in memory for that one request and never stored. Store
printouts read well; test strips are estimated and flagged as low confidence.

Every scan attempt is logged in `scans` (time, success, test type, confidence, model,
tokens; never the photo or the numbers). The log drives three limits in
`src/lib/scan/quota.ts`: a monthly allowance per user (shown under the scan button), at
most 6 attempts per user in 10 minutes, and a daily total across everyone as a spending
backstop. If the table is missing or a count fails, scanning stays open. The hard cap
is the monthly spend limit set in the Anthropic console.

## Chlorine-consumption model

Each pool learns how much free chlorine it uses per day. The math is in
`src/engine/model.ts`; `src/lib/model/` turns a pool's log into observations and stores
the fit in `pool_models` (server-only: users never read it, the page shows a figure).

- Observations: every pair of consecutive tests with FC, loss per day =
  (FC before + ppm added by logged doses + salt-cell output − FC after) / days. Pairs
  under 6 hours or over 10 days apart, pairs ending below 0.5 ppm (chlorine ran out),
  pairs with a refill in between, salt pools without `swg_cell_lb_per_day` (read as
  what the cell makes per day at its current setting) and pairs without weather are
  skipped.
- Drivers per day: base demand; UV dose (peak UV × sunny share of 12 h) × a stabilizer
  shield 1 / (1 + CYA / 20) × 0.1 under a cover; °C of daily high above 25; cm of rain;
  heavy-use events per day. CYA is the latest test (40 ppm assumed until tested).
- Fit: ridge regression towards a population prior (the default, blended with the fits
  of pools that have 6+ pairs), weather coefficients kept at zero or above. Stored:
  coefficients, `sample_count`, `residual` (RMS error, ppm/day).
- Runs after each new or removed test (`after()`), and for every pool in the nightly
  job. Failures are logged; the page shows without it.
- The pool page shows "about X ppm a day on a sunny, 90 °F day" from 4 test pairs on.

Backtest: `CRON_SECRET=… node scripts/backtest.mjs` asks `/api/jobs/backtest` to fit
each pool on its past pairs only, predict FC at each next test and print the median
error for predictions with 4+ pairs of history, next to the error of the average pool.
The public-launch gate is 1.0 ppm or less. Only error statistics come back.

## Error reporting

With `SENTRY_DSN` set, server errors (`src/instrumentation.ts`, including `onRequestError`)
and browser errors (`src/instrumentation-client.ts`, plus `src/app/global-error.tsx`) go
to Sentry, tagged with the commit SHA as the release. Browser reports travel through
`/api/monitoring` on the app itself. Before anything is sent, `src/lib/sentry/scrub.ts`
removes the user, cookies, headers (except content type and browser), request bodies,
query strings and any email address in messages or breadcrumbs. Session replay is not
used; 5% of requests send a performance trace.

To check it end to end, send one deliberate error and look for its event id in Sentry:
`curl -H "Authorization: Bearer $CRON_SECRET" https://tuffo.app/api/jobs/sentry-test`.
Its message contains an example address, which should arrive as `[email]`.
`/api/health` reports `sentry: true` once the DSN is set.

## Scheduled jobs

`vercel.json` runs `/api/jobs/weather` once a day at 06:00 UTC (the Hobby plan allows
daily crons). The job takes every active weather cell, asks Open-Meteo for the days
since that cell's last fetch (a month for a new cell, at most 92) and the next week, in
one request per 40 cells, and upserts `weather_daily` (actuals) and `weather_forecast`.
It then refits every pool's chlorine model and deletes photo-scan log rows older than a
year. Trigger it by hand with
`curl -H "Authorization: Bearer $CRON_SECRET" https://tuffo.app/api/jobs/weather`.

Weather does not wait for the cron: creating a pool fetches its cell in the background
(`after()`), and opening a pool whose cell is more than 20 hours old refreshes that cell
after the page is sent. `/api/health` reports the newest and oldest fetch times and a
`late` flag (a cell never fetched, or older than 30 hours).

## Email

Sign-in emails go out through Resend (custom SMTP in Supabase) from hello@tuffo.app;
Resend's records live on `send.tuffo.app` and `resend._domainkey`. Incoming mail to
hello@ and privacy@ is forwarded to the developer's inbox by ImprovMX (free plan): MX
`mx1.improvmx.com` (10) and `mx2.improvmx.com` (20) plus SPF
`v=spf1 include:spf.improvmx.com ~all` on the root domain, added in Vercel DNS with the
ImprovMX preset.

## Brand

Colours: lagoon `#0E7C9E`, navy `#0B2E4F`, ice `#8FD3F4`, sun `#F5B301`. Type: Sora for
the wordmark and headings, Manrope for the interface. The mark is drawn in
`src/components/brand/logo.tsx`; icons, the PWA manifest icons and the social image are
rendered from it at build time, so there are no binary image assets in the repo.
