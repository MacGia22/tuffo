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
src/app/app        the signed-in app: pools, readings, plans
src/components     UI components (brand mark and lockup, waitlist form)
src/engine         chemistry engine: pure functions, unit tests alongside
src/engine/server  the only import path application code may use for the engine
src/lib/auth       current user helpers and redirect hygiene
src/lib/supabase   server, browser and admin clients; session refresh used by src/proxy.ts
src/lib/weather    weather cells (0.05° grid) and town lookup
supabase           database migrations and notes
```

The engine never ships to the browser: `src/engine/server.ts` imports `server-only`,
so importing it from a client component fails the build.

## Sign-in and the beta gate

Sign-in is a Supabase magic link: `/login` sends it, `/auth/callback` turns it into a
session cookie, `POST /auth/signout` ends it. `src/proxy.ts` refreshes the session on
every request and bounces signed-out visitors away from `/app`; pages verify the user
again before reading data.

Who may sign in is a Supabase setting, not code: Authentication → Sign In / Providers →
Email → "Allow new users to sign up". Off means invite-only (add people under
Authentication → Users → Invite); on opens the beta to anyone. Supabase also needs the
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
| `WAITLIST_WEBHOOK_URL` | Endpoint that receives waitlist sign-ups as JSON; until set, the form reports the list as not open |
| `CRON_SECRET` | Bearer token the Vercel cron sends to `/api/jobs/*`; the jobs refuse every call until it is set |
| `ANTHROPIC_API_KEY` | Enables photo scanning of test results (`/api/scan`); unset hides the scan button |
| `SCAN_MODEL` | Optional model id for scans; defaults to `claude-sonnet-4-6` |

## Photo scanning

On the test form, "Scan a printout" sends a photo (downscaled in the browser to about
1,800 px) to `POST /api/scan`, which asks a vision model for the numbers through a
structured tool call and returns them for review; the person checks each value and
saves. The photo is held in memory for that one request and never stored. Store
printouts read well; test strips are estimated and flagged as low confidence.

## Scheduled jobs

`vercel.json` runs `/api/jobs/weather` once a day (the Hobby plan allows daily crons).
The job takes every active weather cell, asks Open-Meteo for the last two days and the
next eight in one request per 40 cells, and upserts `weather_daily` (actuals) and
`weather_forecast`. Trigger it by hand with
`curl -H "Authorization: Bearer $CRON_SECRET" https://tuffo.app/api/jobs/weather`.

## Brand

Colours: lagoon `#0E7C9E`, navy `#0B2E4F`, ice `#8FD3F4`, sun `#F5B301`. Type: Sora for
the wordmark and headings, Manrope for the interface. The mark is drawn in
`src/components/brand/logo.tsx`; icons, the PWA manifest icons and the social image are
rendered from it at build time, so there are no binary image assets in the repo.
