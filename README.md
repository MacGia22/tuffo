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
src/lib/weather    weather cells (0.03° grid), town lookup, refresh job, between-test summary
src/lib/scan       photo reading (vision model) and the monthly scan allowance
supabase           database migrations and notes
docs/ROADMAP.md    what to build next and the final target (rules for agents: CLAUDE.md)
```

The engine never ships to the browser: `src/engine/server.ts` imports `server-only`,
so importing it from a client component fails the build.

## Sign-in and the beta gate

Sign-in is a Supabase magic link or "Continue with Google": `/login` sends the link (or
starts Google OAuth with PKCE), `/auth/callback` turns the code into a session cookie,
`POST /auth/signout` ends it. Google is configured in Supabase (Authentication → Sign In /
Providers → Google, client ID and secret from the "Tuffo" Google Cloud project, basic
scopes only); an invited address that signs in with Google lands in the same account.
Errors Google or Supabase send back to the callback show on `/login` (`?error=beta` for an
address not invited, `?error=google` otherwise; `src/lib/auth/oauth.ts`). `src/proxy.ts` refreshes the session on
`/app`, `/login` and `/auth` requests only (public pages skip the call to Supabase Auth)
and bounces signed-out visitors away from `/app`; pages verify the user again before
reading data, once per request (`getCurrentUser` is wrapped in React `cache()`).

Taps answer at once: `loading.tsx` skeletons for the pools list, a pool's Today page,
Trends and `/forecast` let Next prefetch those dynamic routes up to the skeleton, and the
bottom bar and menu links dim with `aria-busy` while their page loads (`LinkPending`,
`useLinkStatus`). Other app pages fall back to the nearest skeleton.

Who may sign in is a Supabase setting, not code: Authentication → Sign In / Providers →
"Allow new users to sign up". Off means invite-only for every provider, Google included;
on opens the beta to anyone. Keep `SIGNUPS_OPEN` in Vercel in step with it: unset or anything but `false`
shows **Start free** on the home page and open wording on `/login`; `false` shows the
waitlist form and the private-beta wording (redeploy after changing it). With sign-ups
open, also raise Supabase's email rate limit (Authentication → Rate Limits), which is
separate from Resend's.

A `?ref=` on a link to the home page (`tuffo.app/?ref=pools`) travels with **Start free**
to `/login`; when that sign-in creates a new account, Supabase stores the label in the
user's metadata (`signup_source`). Count new accounts by link in the SQL editor:
`select raw_user_meta_data->>'signup_source' as source, count(*) from auth.users group by 1;`
The proxy also counts page loads from a labelled link (not `/app`, `/auth` or `/login`, not
prefetches, not bots or link previews) in `ref_visits`, one row per label and UTC day,
production only, with nothing about the visitor; a day takes at most 200 labels. Admin →
Links shows 30-day visits next to sign-ups and accounts that have logged a test. Supabase also needs the
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
not the address was already there. A `?ref=` on the link (`tuffo.app/?ref=pools`) is
saved as the entry's source (letters, digits, `-`, `_`, up to 30 characters; otherwise
"landing"), so you can see which post brought people:
`select source, count(*) from waitlist group by source;`. Limits: a hidden field that only bots fill in, 5
sign-ups per network address per 10 minutes (counted in memory, never stored) and
`WAITLIST_HOURLY_LIMIT` per hour across everyone (default 100).

Invitations: people whose email is in `ADMIN_EMAILS` see **Admin** in the app header
(`/app/admin`; everyone else gets a 404). It lists the waitlist and sends an invitation
to any address with Supabase's admin API; the address then leaves the waitlist. Its Users
list shows each account's sign-up, last sign-in and source, and can delete an account
(never your own or another admin's) with everything under it. Sign-ups
stay closed. The Supabase "Invite user" template needs a token-hash link like the others:

```html
<h2>You're invited to the Tuffo beta</h2>
<p><a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=invite">Open Tuffo</a> to sign in. The link works once and expires in 24 hours.</p>
<p>After that, sign in any time at tuffo.app with this email address.</p>
```

Export the list from the Supabase SQL editor:
`select email, source, created_at from waitlist order by created_at;` then Download CSV.

Feedback: **Send feedback** in the app footer, on the account page and on each pool page
opens `/app/feedback`. People pick a kind (idea, problem, question, other), write up to
2000 characters, optionally tick "OK to email me about this", and see their earlier
messages with a status. Rows go to the `feedback` table with the page they came from
(pool ids replaced by `[id]`) and the app version; 10 per person per 24 hours, enforced
in the server action and by a database trigger. No email is sent. On `/app/admin` the
Feedback list shows the newest first, filters by kind and status, and sets the status
(new, planned, done, not planned); the sender's address shows only when they ticked the
box. The data export includes it and deleting the account deletes it.

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
| `SIGNUPS_OPEN` | `false` switches the home page to the waitlist and `/login` to invite-only wording; unset = open. Must match the Supabase sign-up setting |
| `ADMIN_EMAILS` | Comma-separated emails that may open `/app/admin` and send beta invitations; unset = nobody |
| `WAITLIST_HOURLY_LIMIT` | Optional waitlist sign-ups per hour across everyone; default 100 |
| `RESEND_API_KEY` | Resend API key for alert emails (secret). Unset: no alerts are sent |
| `ALERT_DAILY_LIMIT` | Optional: alert emails per day across everyone, a safety net (default 1000) |
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

## Estimate since the last test

`src/lib/model/estimate.ts` replays free chlorine from a test: each local day's predicted
use under that day's actual weather (the pool's fit, or typical-pool numbers), logged doses
and heavy-use events as steps at their time (a dose logged at the test's minute counts after
the test, as in the model's pairs), and what the salt cell made at the settings and pump hours in force; up to 10
days, never below 0, none across a refill or for a salt pool with an unknown cell output.
The Trends page (`src/lib/model/pool-estimate.ts`, service key, fails open) draws it as a ribbon
from the last test to now, marks at each test what the estimate from the previous test
expected (hollow circle, joined to the reading), and shows the typical miss over the last
five tests. The plan starts from the same estimate at now, and a salt pool's plan line runs
smoothly between day ends. Only numbers reach the browser, never coefficients.

## The 7-day plan

`src/engine/plan.ts` simulates free chlorine day by day over the pool's weather forecast
with its chlorine model (the population prior until 4 test pairs, with an extra 0.5 ppm
of margin): each day the smallest addition of liquid chlorine, in 0.25 ppm steps and at
least 0.5 ppm, that ends the day at or above a floor of max(minimum + 1, target low − 1)
ppm for its stabilizer; at most 8 ppm in one addition. Salt pools get the lowest cell
output (in 5% steps) that holds the floor all week, when the cell's rated output is
known. It flags algae-risk days (FC below the minimum even on the plan) and rain that
replaces 2% of the water or more (rain depth × surface area ÷ volume; area from the
volume at 1.5 m when not set), with the diluted stabilizer, calcium and salt.

`src/lib/plan/build.ts` starts it from the latest free chlorine test (plus chlorine logged
since, minus the predicted use since) and stores it in `plans`: nightly inside the weather
job after the forecast and models, after each new, edited or removed entry, and after a
page view that finds it missing, older than 26 hours or starting on a day already over in
the pool's time zone. Day 0 counts only the part of the pool's local day still ahead, for
both the predicted use and the salt cell's output. Until the rebuild after a chlorine dose
lands, the page does not offer that day's addition again (`planMissesDose`). The pool page shows it as a
7-day strip and as a dashed forecast on the chlorine chart. `canSeePlan()`
(`src/lib/entitlements.ts`) gates it; everyone sees it during the beta.

When the forecast free chlorine leaves the target band, the plan says what to change
(`src/lib/plan/band.ts`): "skip chlorine until Thursday" while it is above, "lower the cell
to 25% from Friday, then test" (the next setting down; off for a day at the lowest), or
which day it may fall below the minimum. An old test turns into a "Log a test" button;
the typical-pools and floor notes sit under "ⓘ How this plan works".

## Salt pools

A salt pool's page asks which cell it has: a listed model (Hayward TurboCell T-15/T-9/T-5,
Pentair IntelliChlor IC60/IC40/IC20, CircuPool CORE55/35/15, EDGE40/25/15 and RJ-60/30
Plus, with their rated lb/day; AstralPool E25/E35, VX 7T/9T/11T, Viron V18–V45, Viron
eQuilibrium EQ18–EQ45 and Halo Chlor 18G–45G; Zodiac TRi-XO, eXO iQ, EL Series and Ezi
Salt; Davey EcoSalt2 (standard and low-salt) and EcoSalt; Waterco Electrochlor Mineral, Plus
and Pro and Hydrochlor MK3 and ST, all from their published g/h, each with its source
document noted, `src/lib/salt-cells.ts`)
or the rated output from the label in lb/day, g/hour or kg/day. It is stored as
`pools.swg_cell_lb_per_day` and `swg_cell_model`, and the chlorine model and plan are
refitted. With it, the 7-day plan suggests the lowest cell output that holds free
chlorine all week, and the free chlorine advice card repeats that setting; without it,
both give the ppm per day the cell has to make and ask for the rating.

The same form asks for the salt level the chlorinator wants (a range, or one number that
becomes ±10%; `parseSaltTarget`), stored as `pools.salt_target_low_ppm` and
`salt_target_high_ppm`. Australian cells range from 1,500 ppm (low-salt units) to 6,000 ppm
(AstralPool E Series). Unset, a listed cell's own range applies (`saltPpm` in
`src/lib/salt-cells.ts`: AstralPool's recommended 4,000 ppm ±10%, 4,000–4,800 for the E
Series), else 2,800–3,600 ppm. AstralPool E, VX, eQuilibrium and Halo Chlor controls are set
in levels 1 to 8 (`levelCount`), so their settings read "level 5 of 8" too. `targetsFor` takes it as `saltTarget`, so the
salt card, its dose to the middle of the range, the Water now tile and the plan's rain note
(`dilution.saltLow`, in the weekly email) all use the pool's range. An "Other" cell can be
set in percent or in levels 1 to N (`pools.swg_cell_levels`, 2–20; AstralPool E Series 1–8):
the plan picks among N even steps, and the Today page, plan notes, emails, the activity list
and the cell-setting form say "level 5 of 8". Settings are still stored in percent.

Product names follow the profile's units: metric pools get "pool acid" (hydrochloric acid
32%, `pool-acid-32`) for pH and alkalinity and "baking soda (buffer)", as Australian shops
label them; US pools keep muriatic acid 31.45% and baking soda (`acidFor`, `productShort` in
`src/lib/catalog.ts`).

What the cell makes depends on its setting and on how long water flows through it, so
both are recorded over time: a cell setting is an event ("Salt cell set to 50%", with an
"I set it" link next to the plan's suggestion), and the pump schedule
(`/app/pools/[id]/pump`) is a list of runs with times, the pump's speed (RPM) or flow (GPM), and whether the
cell runs during each, typed or read from a screenshot of the pump's app or panel
(`POST /api/scan/pump`, one scan of the allowance). Between two tests the model counts
rated output × setting × cell hours ÷ 24 for the settings and schedules in force
(`src/engine/swg.ts`); a salt pair with no setting or schedule known at its first test is
left out instead of guessed. The plan suggests the setting for the current pump hours: the
lowest setting that holds free chlorine all week, picked among the settings the cell's own
control offers (`levels` in `src/lib/salt-cells.ts`: CircuPool CORE 25/50/75/100%, EDGE
12.5% steps, Pentair IntelliChlor power center 20% steps), or in 5% steps for dial cells
(Hayward AquaRite, CircuPool RJ Plus) and cells entered by rating. When free chlorine starts
below the target and one weekly setting would climb past it, the plan runs a higher setting
for the first days and then a lower weekly one, keeping above the floor. When it starts
above the target, the plan first runs a lower setting (or the cell off) for as many days as
the floor allows, picking the start that leaves least chlorine above the band, then the weekly
setting (`swgStart` in the plan; the Today line, the note, the setting box, cards, alerts and
the pools list all follow it).

## Navigation and forms

The header has Pools (a switcher when there is more than one pool) and Account; Sign out
is on the account page. Account, Admin and Sign out sit in one menu button next to Pools
at every width. The pool name has a 44 px gear linking to Settings. On phones (below 768 px) a pool's pages have a bottom bar
(`src/components/pool-bottom-bar.tsx`): Today, Trends, Log (test, dose, event, scan),
Maintenance, Settings.

"Water now" (`src/lib/tiles.ts`, `src/components/water-now.tsx`) has one tile per measure
(FC, pH, TA, CYA, CH, and salt for salt pools), each from that measure's newest test: the
value, a status chip (icon and word: OK, High, Low, Too low / Too high outside free
chlorine's minimum or shock level, No reading, or "32 days ago" once FC and pH are over 7
days old and the rest over 30), the target, and one context line (the action when
critical, else something added for it in the last 7 days, else the change since the test
before). Under the grid: water temperature, CC and CSI. Chip colours are `--chip-*` in
`globals.css`.
The Log a test form starts with "Tested with" (the last method used) and When; each field
shows its last value and a gentle check for likely typos (`src/lib/reading-hints.ts`);
calcium, borates and phosphates sit under "More tests"; Save stays in view on phones.

A "Set up N of 7" card (`src/lib/setup.ts`) sits at the top of a pool until everything is
done or it is dismissed (remembered in the browser): location, first test, equipment, the
salt cell's install date and pump schedule (salt pools), the filter's clean pressure and
email alerts, each linking to where it is done.

The pool page ("Today") runs: the name and gear, the last test card ("Tested 5 days ago",
"Time to test" after 7 days, Log a test), Water now, What to do now (`src/lib/today.ts`: the
most urgent action highlighted with the button that logs it, the rest with when: advice
from each measure's newest test (none once the tile says "N days ago"; every dose carries
a never-mix handling note, and a chlorine dose stops at 8 ppm per addition with a retest
for the rest), today's plan step, the plan leaving the target band, maintenance due,
monthly retests), Next 7 days (day cards with UV, rain and chance, FC by evening and the
day's action), a link to Trends, then the salt cell, equipment health, chlorine use,
activity and test history. On wider screens a Log menu (with Import CSV and Send feedback)
sits beside the name; phones use the bottom bar. Menus open with a click, close on Escape or a click outside, and stay inside
the screen.

Links into a form carry `?from=<page>`; the form keeps it in a hidden `return_to` field,
and Save and Cancel go back there (`src/lib/return-to.ts` accepts only paths under
`/app`). A save adds `?saved=1`, or `?saved=<kind>.<id>` for a new test, dose, event or
pump schedule, which the layout shows as "Saved · Undo" (`src/components/saved-notice.tsx`;
Undo deletes that row with the person's own session). Tests, doses and events are removed from their edit screen
(a row in "Doses and events" or Edit in the test history opens it; on phones the test
history is one card per test with each value marked in or out of the pool's range); the page then shows "Removed · Undo". The removed row
is kept only in that browser tab (sessionStorage) and Undo puts it back with the same id
(`src/lib/removed.ts`, `src/app/app/remove-actions.ts`). On the Maintenance page, "Done lately" and the recent
pressure readings work the same way: tap a row to change its day (and the gauge value) or
remove it, with Undo in place; a change adds the new row and then removes the old one, as
owners can add and remove these rows but not update them. Logging maintenance or a filter
pressure shows the same Undo in place. Forms that stay open on their page have a Cancel
that puts them back as they were.

## Pool settings and equipment

Creating a pool lands on its settings page with `?new=1` ("Set up your pool": add the
equipment or skip, "Done, go to the pool"); each card on `/app` also links to Settings. The cards are a dashboard (`src/lib/pool-card.ts`):
how old the last test is, free chlorine against its target (icon and word), today's plan
action ("Add 1 qt" or "Cell 50%"), maintenance due or overdue, and whether alerts are on.
The location is changed from Settings only.
The bottom of the settings page deletes the pool after its name is typed (cascades to
every row for that pool; a weather cell no pool uses stops being refreshed).

`/app/pools/[id]/settings` edits the pool's name, volume, sanitizer, surface and cover (a
change refits the model and plan), a screen enclosure ("pool cage": the kind suggests the
share of sun that gets through, 70% standard, 55% fine, 30% solar screen, and the owner can
type their own; `src/lib/enclosure.ts`) and links to the location map. Every piece of equipment,
the salt cell included, uses the same card: type, model, install date, a mini life bar, the
next maintenance task as one chip (`nextTaskChip` in `src/lib/maintenance.ts`) and links to
Maintenance, the pump schedule and the cell setting. Equipment lives in `pool_equipment`:
pump (common models listed in `src/lib/equipment.ts`, or another with its speed type),
chlorine feeder (floater, inline, liquid dosing pump, controller, with its setting), filter
and heater; kinds not added yet sit in one "Add:" row. "I replaced it" dates the old item
(a replaced cell becomes a dated `cell` row) and starts the new one; "Fix details" corrects
the current one in place, and holds Remove (with a confirm).
Tapping an item's name opens Fix details too; Maintenance links to that card (`#equip-<kind>`)
so each item has one edit place. An install date can be a day or "Not sure: about N years
ago" (`installDateFrom`). A card warns when the upkeep log has entries before the item's
install date and no earlier item of that kind covered them (`installConflicts`). The pump's
running hours come from the pump schedules, like the cell's (`pumpHoursPerDay`).
The pump schedule page starts in GPM for pumps usually set by flow (Pentair VSF).
Feeders are recorded only; counting them in the chlorine model is a later step.

## Maintenance

`/app/pools/[id]/maintenance` lists the upkeep the pool's equipment needs, from the
catalog in `src/lib/maintenance.ts` (salt cell inspection every 3 months, pump basket
weekly, cartridge rinse every 5 weeks, backwash by pressure, sand every 6 years, and so on).
Each task has a default interval the owner can change (`pools.maintenance_intervals`, days
per task id); "Done today" (or another day) logs a row in `pool_maintenance` and the next
due date follows. Filter pressure readings (`pool_pressure`, kPa, shown as psi or bar) mark
the backwash/rinse due when the gauge is 8 psi (55 kPa) over the last reading marked clean.
Upkeep logged before an item's install date does not count for it, and a replacement task
counts from the install date while that is within one interval. Equipment life: the salt cell's hours of making chlorine since
`pools.swg_cell_installed_on`, on the pool's own days, from the pump schedules times the cell
setting, against the maker's rated hours where
published (`ratedHours` in `src/lib/salt-cells.ts`); other equipment shows its age against a
typical life. Tasks due within days show on the pool page with a Done button and on the
settings cards. "Maintenance reminders" in the email alerts (`alert_settings.maintenance`)
adds the tasks due or overdue, at most once a week per pool.

Task cards share one due format: a relative line ("in 5 days", "in 4 weeks", "in 15
months", "3 days overdue") with the date below it, and a status pill (Overdue, Due soon,
OK) with an icon. Tasks never logged come first under "Set a starting date"; tasks more
than 3 months out sit under a collapsed "Later (N)"; each card's "How to" is collapsed.

The maintenance page draws: a 30-day strip with a dot on each day a task falls due
(overdue tasks on today), a bar per task for the share of its interval gone by (good
under 80%, warning to 100%, critical overdue, always with an icon and a word), the
filter pressure over time with the clean pressure and the clean + 8 psi line, and a
lifespan bar per item (install to the end of its typical life, the replacement window
shaded, today marked). With a rated cell it shows hours used against the rating and the
month they run out at today's pump hours and setting. The pool page has a compact
"Equipment health" row of the same bars. Status colours are `--status-*` in
`globals.css`; each picture has a list or table view.

## Trends page

`/app/pools/[id]/trends` (`src/components/trend-chart.tsx`) shows free chlorine, pH, peak UV
and rain with one column per day shared by every row; tap, click or the arrow keys select
a day (today by default) and the readout above the chart gives its numbers, with "Rain at
my pool was different" for past days. Ranges: 2 weeks (the default: 7 days back, today and
7 days ahead), 30 or 90 days, or Season (from the first test of the pool year, which starts
January 1, or July 1 for pools south of the equator; at least two weeks, at most a year; `rangeStart` in `src/lib/trends.ts`), as `?range=`. UV cells use the
WHO levels (`src/lib/uv.ts`, `--uv-*` tokens); rain is 1 in = 40 px. Under the chart: a
warning when the plan leaves the target band, and "Between your last two tests" (a plain
sentence and four stats from the pool's last two free chlorine tests and the weather
between them, `betweenLastTests` in `src/lib/between-story.ts`). "Show as a table" lists every day.

The free chlorine panel runs from 0 to a round tick above the target, the tests and the
plan, with the target band, a muted dashed "Never below" line (red when the estimate or
the plan comes within 1 ppm of it), tests as dots with values, the
estimate since the last test as a shaded ribbon that widens with the days (the pool's typical
miss once it has its own model, else ±0.1 ppm a day), the plan as one solid line with its
peak labelled when it leaves the band, a Today line, and ▼ for doses and events. "What
Tuffo expected" markers and the estimate-accuracy line appear only once the pool has its
own model (4 test pairs).

## Rain at the pool

The weather cell's rain is a model estimate for a few kilometers around; storms vary a
lot within that. Picking a past day on the chart (or its table view) links to
`/app/pools/[id]/rain?date=…`, where the owner enters what fell at the pool (inches or
mm; stored in mm in `pool_rain`). That figure replaces the cell's for that day in the
chart, the between-tests box, the chlorine model's pairs and today's plan
(`src/lib/weather/own-rain.ts`); "Use the area figure again" removes it. A missing table
or read error falls back to the cell's rain.

## Email alerts

Per pool, off by default, on the account page (`#alerts`): an algae-risk warning (the
plan expects FC below the minimum today or tomorrow, or it is estimated low now; at most
every 3 days), "time to test" after N days without a test (2–14, default 7; once per
gap) and a weekly summary on Saturdays. `GET /api/jobs/alerts` (second Vercel cron,
`30 11 * * *`, morning in the US) sends them through Resend's API from hello@tuffo.app:
one email per person per day with every due alert in it (`alert_emails` primary key),
at most `ALERT_DAILY_LIMIT` a day (default 1,000; over it, `[alerts]` is logged and the
rest wait). It runs only when `VERCEL_ENV` is `production` (previews share the database)
and `RESEND_API_KEY` is set. Each email has a signed link to stop them (key derived from
`CRON_SECRET`) and `List-Unsubscribe` / `List-Unsubscribe-Post` headers for one-click
unsubscribe (`POST /api/alerts/unsubscribe`). "Today", Saturday and the summary's days
are the pool's own (its time zone). Hobby crons run once a day, so every
alert goes at the same hour; sending at each person's local morning waits for Vercel Pro.

## Importing tests

`/app/pools/[id]/import` (linked from the pool page as **Import CSV**) reads a CSV of
water tests: Pool Math's "Export All Test Logs (.csv)" or any sheet with a date column.
The browser parses it for the column mapping and a preview; `POST /api/pools/[id]/import`
parses it again with the same code (`src/lib/import/`). The column separator (comma,
semicolon or tab) and the number format ("3.5 and 3,200" or "3,5 and 3.200") are guessed
from the file and can be changed above the column choices. It checks ranges, reads times
without a zone in the pool's time zone, and drops rows in the same minute as another row
or a test already logged. Rows on the same day as a logged test with the same results
(`src/lib/import/logged.ts`: every result both have agrees) are shown as near-duplicates
and skipped unless the owner ticks "Import them anyway". A dry run returns the counts;
the real run inserts every row in one statement with `method = 'imported'` and refits the
chlorine model once. Limits: 1 MB and 5,000 rows per file.

Pool Math's export (`src/lib/import/__tests__/fixtures/poolmath-export.csv`) has `Date`
as `2026-09-26 09:47:03 AM`, `FC`, `pH`, `TA`, `CH`, `CYA`, `Salt`, `Temp`, `CSI` (left
out), `Notes`, and `Backwashed`, `Cleaned Filter`, `Vacuumed` as `True`/`False`. Those
three are offered, off by default, as upkeep to log too: one backwash event per day
(and, for a sand or DE filter, its backwash task done that day),
"Cleaned Filter" as the filter's cleaning task done that day (cartridge rinse or DE
grids; skipped for sand or no filter), and vacuuming skipped (no task). Days already
logged are skipped; a failed upkeep insert is logged and reported, never undoing the
tests. Pool Math exports hold no chemical additions.

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
  shield 1 / (1 + CYA / 20) × 0.1 under a cover × the enclosure's sun share
  (`pools.enclosure_sun_pct`, read on its own so it fails open to 100%); °C of daily high above 25; cm of rain;
  heavy-use events per day. CYA is the latest test (40 ppm assumed until tested).
- Fit: ridge regression towards a population prior (the default, blended with the fits
  of pools that have 6+ pairs), weather coefficients kept at zero or above. Stored:
  coefficients, `sample_count`, `residual` (RMS error, ppm/day).
- Runs after each new, edited or removed test, and after an edited or removed dose or
  event (`after()`), and for every pool in the nightly
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
used, and neither is performance tracing (this SDK version streams trace spans without
passing them through the scrubber).

To check it end to end, send one deliberate error and look for its event id in Sentry:
`curl -H "Authorization: Bearer $CRON_SECRET" https://tuffo.app/api/jobs/sentry-test`.
Its message contains an example address, which should arrive as `[email]`.
`/api/health` reports `sentry: true` once the DSN is set.

## Scheduled jobs

`vercel.json` runs `/api/jobs/weather` once a day at 06:00 UTC and `/api/jobs/alerts` at
11:30 UTC (the Hobby plan allows daily crons; see "Email alerts"). The job takes every active weather cell, asks Open-Meteo for the days
since that cell's last fetch (a month for a new cell, at most 92) and the next week, in
one request per 40 cells, and upserts `weather_daily` (actuals) and `weather_forecast`.
When a batch request fails, each of its cells is tried on its own, so one bad answer
does not leave every cell stale; failures are logged as `[weather] nightly:` (and reach
Sentry).
It then refits every pool's chlorine model, rebuilds every 7-day plan and deletes photo-scan log rows older than a
year. Trigger it by hand with
`curl -H "Authorization: Bearer $CRON_SECRET" https://tuffo.app/api/jobs/weather`.

Weather does not wait for the cron: creating a pool fetches its cell in the background
(`after()`), and opening a pool whose cell is more than 20 hours old refreshes that cell
after the page is sent. `/api/health` reports the newest and oldest fetch times and a
`late` flag (a cell never fetched, or older than 30 hours).

Cells are 0.03° (about 3 km, 2 miles), close to the 3 km HRRR model Open-Meteo uses in the
US; the pool's position is already a town or ZIP centroid, so nothing finer would help.
Pools created before September 30, 2026 are on the older 0.05° grid until the owner uses
"Change location" (`/app/pools/[id]/location`). After a town search, a Leaflet map (OpenStreetMap
tiles, loaded by the browser; named in `/privacy`) shows the grid around the town and the owner
taps the square the pool is in, within 0.3° of the town; only the square's center is sent
(`src/components/cell-map.tsx`, `src/components/place-picker.tsx`). North/South/West/East
buttons move the square for keyboard users. Search results list places in the visitor's
country first (Vercel's `x-vercel-ip-country` header, read in the server action, used only
for the order and never stored or logged), then US places, then the rest
(`src/lib/weather/place-order.ts`). Moving a pool fetches the new cell with
92 days of history (`backfill`), refits the model and plan, and stops refreshing the old
cell if no pool uses it.

## Email

Sign-in emails go out through Resend (custom SMTP in Supabase) from hello@tuffo.app;
Resend's records live on `send.tuffo.app` and `resend._domainkey`. Incoming mail to
hello@ and privacy@ is forwarded to the developer's inbox by ImprovMX (free plan): MX
`mx1.improvmx.com` (10) and `mx2.improvmx.com` (20) plus SPF
`v=spf1 include:spf.improvmx.com ~all` on the root domain, added in Vercel DNS with the
ImprovMX preset.

## Installing on a phone or computer

The app is a web app with a manifest (`src/app/manifest.ts`, opens at `/app`). Inside the
app, `src/components/install-banner.tsx` shows how to add it to the home screen for the
device in use, as numbered steps with small icons (`install-steps.tsx`). iPhone/iPad:
menu button by the address, Share, View More, Add to Home Screen. Android and desktop
Chrome or Edge: an Install button when the browser offers one, otherwise the menu steps. It is
hidden once installed, where installing is not possible, and after it is closed (a flag
in the browser's local storage on that device).

## Offline logging

A hand-written service worker (`src/app/sw.js/route.ts`, served at `/sw.js`, registered
in production by `OfflineSync` in the app layout) keeps the last copy of each app page
opened (network first, the page shown as it streams and its copy saved in the
background; never `/app/admin`) and Next.js build files (cache first), and
shows `/offline` for a page never opened. The pool page asks it to keep that pool's log
forms too. Sign-out and the sign-in page drop the kept pages.

Without a connection, the log forms put new tests, doses and events in an IndexedDB
queue (`src/lib/offline`) with the time fixed and a UUID made on the device; the banner
at the top of the app shows what is waiting. On reconnect (and on load, and when the app
comes to the front) the queue is sent to `POST /api/log`, which validates like the forms
(`src/lib/log/save.ts`). `client_id` is unique in `readings`, `doses` and `events`, so a
resend after a lost reply is answered "already saved" and never makes a second row. A
refused entry stays in the banner with its reason until discarded. Edits need a
connection.

## Public forecast

`/forecast` works without signing in: type a town or ZIP (the same `PlacePicker`, through
`findForecastPlaces`, limited per address) and it shows a typical pool's week there. The
inputs live in the URL so a result can be shared:
`/forecast?place=<label>&lat=<cell lat>&lon=<cell lon>&v=<liters>&cya=<n>&s=chlorine|salt`
(plus `u=us|metric` when it differs from the place's default, and `ref` when the visitor came
from a labelled link). Coordinates are always the 0.03° cell's center; a link with a finer
point is redirected to its cell. Bad volume or CYA fall back to the defaults (15,000 gal /
57,000 L, CYA 40) with a notice (`src/lib/forecast/params.ts`). Before a place is picked, the
form shows metric when the browser's time zone is in Australia or its language region is not
the US; the new-pool form does the same when the profile has no units yet
(`src/lib/browser-units.ts`, worked out in the browser, nothing sent).

- Weather: a cell Tuffo already tracks is read from `weather_forecast`; any other is fetched
  from Open-Meteo (forecast only) and cached per cell for 3 hours with `unstable_cache`.
  Anonymous lookups never write `weather_cells` or `weather_forecast`.
- Plan: `planWeek()` with the population prior (cached for an hour, `DEFAULT_PRIOR` when it
  cannot be read), `pairs = 0`, an uncovered plaster pool starting at the bottom of its
  CYA-based band. Salt: a typical cell rated for 1.5× the pool with the pump on 12 h a day
  (`src/lib/forecast/typical.ts`).
- The page gets display values only (`src/lib/forecast/view.ts`): use to 0.5 ppm, liquid
  chlorine 12.5% to 0.25 qt / 0.25 L, rain to 0.1 in / 1 mm. Tests check that no
  coefficient or raw plan field reaches the payload.
- 30 forecasts and 60 town searches per address per 10 minutes, in memory; the address
  is never stored or logged. Each forecast shown to a person adds one to the `forecast`
  label in the link-visit counts on the admin page.
- "Track my pool, free" goes to `/login?ref=<incoming ref or forecast>` with `next` set to
  `/app/pools/new?…`, which `prefillFromForecast()` turns into the new-pool form's values
  (place and time zone, volume, sanitizer; CYA is shown as a note for the first test).
- Under the result, "Weather for a 2-mile square at the center of <town>. Pool somewhere else
  in town? Pick your square for a closer forecast" (`src/app/forecast/adjust-map.tsx`) loads the weather-square
  map (`CellMap`, Leaflet and OpenStreetMap tiles) only after it is tapped, via a dynamic
  import, so most visitors make no tile requests. Tapping another square reloads the
  forecast for it; the URL gets only the square's center. OpenStreetMap's public tile
  server is for light use: move to a tile provider whose terms allow a public app (or
  self-host) before heavy traffic.
- Indexable, with `rel=canonical` to `/forecast` for every result URL; in the sitemap.

## Landing page

`/` opens with a town or ZIP box ("See your pool's week, no sign-up", the same form as
`/forecast`): picking a town goes to its forecast, carrying the `?ref=` of the incoming
link on to sign-up. "Start free" stays as the secondary button. Below, a product screenshot (the week's plan and the trends card, light and dark, as
`public/screens/*.webp`, taken from the app with demo data and marked as such), a short
FAQ (free, Pool Math import, what data is kept) and the About section. Retake the
screenshots when the plan or chart look changes noticeably.

## Brand

Colours: lagoon `#0E7C9E`, navy `#0B2E4F`, ice `#8FD3F4`, sun `#F5B301`. Type: Sora for
the wordmark and headings, Manrope for the interface. The mark is drawn in
`src/components/brand/logo.tsx`; icons, the PWA manifest icons and the social image are
rendered from it at build time, so there are no binary image assets in the repo.
