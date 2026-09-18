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

## Brand

Colours: lagoon `#0E7C9E`, navy `#0B2E4F`, ice `#8FD3F4`, sun `#F5B301`. Type: Sora for
the wordmark and headings, Manrope for the interface. The mark is drawn in
`src/components/brand/logo.tsx`; icons, the PWA manifest icons and the social image are
rendered from it at build time, so there are no binary image assets in the repo.
