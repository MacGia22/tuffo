# Tuffo roadmap

Where Tuffo is going, in the order to build it. Each item says what to build, where it
lives and how to know it is done. Rules for how to work are in `CLAUDE.md`. Last updated
2026-09-30.

## Final target

A pool owner opens Tuffo at the pool, logs a test in under 30 seconds (typed, scanned or
imported), and gets three things no calculator gives them:

1. **Why the water moved**: how much chlorine their own pool loses per day under its own
   sun, heat and rain, learned from their tests.
2. **What to do this week**: a 7-day plan with the daily dose (or salt-cell output) that
   keeps chlorine in range, with a warning before an algae-risk day or after heavy rain.
3. **Where to buy it**: the recommended product with prices from several retailers.

The business around it:

| Tier | Price | What it adds |
| --- | --- | --- |
| Free | $0 | Up to 3 pools, logging, advice, charts, a monthly scan allowance |
| Premium | $29/yr or $3.99/mo; $19/yr for the first 500 accounts | 7-day plan, alerts and reminders, unlimited pools and scans, exports |
| Pro (later) | about $19/mo | Service companies: 25+ pools, sharing with clients, route view, reports |

Launch is US-first in English, with metric units and GDPR-grade privacy from day one so
other countries need only translation. Ads are optional, free tier only, and only behind
a certified consent platform.

### Public-launch gates

The public launch (end of milestone 3) happens when all of these hold:

- The forecast works: on beta pools with 4+ test pairs, the median error of predicted
  free chlorine at the next test is 1.0 ppm or less (measured by a backtest script).
- Money flows: Stripe live with Stripe Tax, self-service cancel, entitlements enforced.
- Infrastructure is paid where the free tiers forbid commercial use: Vercel Pro,
  Supabase Pro (daily backups, one restore test done), Open-Meteo commercial API key.
- Errors and uptime are watched: Sentry alerts, an external uptime check on
  `/api/health`, row-level-security tests passing in CI.
- Legal is in order: LLC formed and owning code, domains and accounts; terms and privacy
  reviewed by a lawyer; trademark search for TUFFO (classes 9 and 42); liability
  insurance.
- Support works: hello@ and privacy@ forwarding, in-app feedback link.

## Milestone 2: private beta (target 2026-10-23)

### 2.1 Observability — done 2026-09-28 (#3)
- Add Sentry for server and browser (`@sentry/nextjs`), release = commit SHA, no emails
  or request bodies in events (scrub PII), sample rate low. Env: `SENTRY_DSN`,
  `SENTRY_AUTH_TOKEN` for source maps (upload them, but do not serve them publicly).
- Add Sentry to `/api/health` as a yes/no flag and to the weekly check.
- Done when a thrown test error shows up in Sentry without personal data.

### 2.2 Row-level-security tests in CI — done 2026-09-28 (#4)
- New CI job with a `postgres:16` service: create the stand-in auth schema and roles
  (see `supabase/README.md`), apply every migration, run SQL tests.
- Tests prove: user A cannot select, insert, update or delete user B's pools, readings,
  doses, events or scans; `anon` can read nothing; users cannot write `scans` or read
  `pool_models`; running each migration twice is harmless.
- Done when the job fails on a deliberately broken policy and passes on `main`.

### 2.3 Chlorine-consumption model v1 (the core IP) — done 2026-09-28 (#5); backtest waits for beta data
- Pure math in `src/engine/model.ts`, orchestration in `src/lib/model/`, results in
  `pool_models` (server-only).
- Observations: for each pair of consecutive tests with FC,
  `loss per day = (FC before + ppm added by logged doses − FC after) / days`
  (the between-tests box already computes this). Salt pools: net loss after the cell's
  output when `swg_cell_lb_per_day` is known, otherwise skip.
- Drivers per day from `weather_daily`: UV dose (`uv_index_max` × sunshine hours or
  `shortwave_mj_m2`), heat above 25 °C (`tmax_c`), rain (`precipitation_mm`), plus the
  pool's CYA (more stabilizer, less sun loss), cover, and logged heavy-use events.
- Fit: ridge regression per pool with population priors, so a new pool starts from the
  average and becomes its own by about week 3. Store coefficients, `sample_count`,
  `residual`.
- Recompute after each new test (`after()` in the reading action) and in the nightly job.
- UI on the pool page: "Your pool uses about 1.8 ppm a day on a sunny, 90 °F day",
  with the basis ("from 6 test pairs over 5 weeks"). Hidden until 4 pairs.
- Done when engine tests cover the fit on synthetic data with known coefficients, and a
  backtest script prints next-test error on real beta data.

### 2.4 Beta invitations and feedback — done 2026-09-28 (#6)
- Waitlist into a `waitlist` table (RLS, server-only insert, rate-limited) instead of the
  webhook; admin export via SQL.
- Invite flow: keep sign-ups closed; invite by email with Supabase's admin API from a
  server action behind an `ADMIN_EMAILS` allowlist.
- "Send feedback" link in the app footer (mailto hello@tuffo.app with the app version);
  replaced by in-app feedback (2.7).

### 2.5 Installable app and offline logging
- Service worker: offline shell, and a queue (IndexedDB) for tests, doses and events
  logged without signal, sent when back online, with a visible "waiting to send" state.
- "Add to Home Screen" hint on iOS Safari.
- Done when a test logged in airplane mode appears on the server after reconnecting.

### 2.6 Imports, edits and small gaps
- 2.6a Pool Math import: CSV upload, map columns, preview, dedupe by timestamp. Research
  the current export format first and keep a sample file in the tests.
- 2.6b Edit a test, dose or event in place (today it is remove and log again).
- 2.6c Count calcium chloride and salt logged since the latest test the way stabilizer is
  counted in `adviseFor` (its `since` list, PR #1) — done 2026-09-30 (#14).

### 2.7 In-app feedback — done 2026-09-29
- `/app/feedback`: kind, message (2000 characters), "OK to email me", and the person's
  own past feedback with its status; 10 per day. Linked from the footer, the account page
  and the pool page. No email.
- `feedback` table (RLS: own insert and read only), admin list with filters and status,
  in `/api/health`, the data export and account deletion; privacy notice updated.
- A scheduled Claude routine reads it through a read-only connector to sort suggestions.

## Milestone 3: forecast and premium = public launch (target 2026-11-13)

### 3.1 The 7-day plan
- Nightly per pool (and after each new test): simulate FC day by day over
  `weather_forecast` with the pool's model; pick the smallest daily dose, or salt-cell
  output %, that keeps FC inside the CYA-based range with a margin; flag days where FC
  would drop below the minimum (algae risk) and days after rain heavy enough to dilute
  CYA, CH or salt (rain depth × surface area ÷ volume).
- Store in a `plans` table (server-written, user-readable), show as a 7-day strip on the
  pool page plus the chart's forecast extension.
- Respect the dosing caps and handling notes the advice already uses.

### 3.2 Alerts and reminders
- Email through Resend: algae-risk warning, "time to test" after N days without a test,
  weekly summary; per-pool opt-in, one-click unsubscribe, quiet hours.
- Web push later; email first.

### 3.3 Salt pools
- Suggest the cell's output % from chlorine demand and `swg_cell_lb_per_day`; ask for the
  cell model to fill it.

### 3.4 Premium with Stripe
- Checkout, Customer Portal, webhooks into a `subscriptions` table; an `entitlements()`
  helper used by pages, actions and `/api/scan`; founding price for the first 500.
- Free-tier limits enforced server-side: 3 pools, scan allowance, plan preview only.
- Update the privacy notice (Stripe as a processor) and the terms (billing, refunds).

### 3.5 Launch checklist
- Everything under "Public-launch gates" above, plus a pricing section on the landing
  page, a status page, and an announcement plan for the pool communities (post only
  where the moderators allow it).

## Milestone 4: growth (target 2026-12-04)

- **Products and prices**: public product pages (good for search), offers from retailer
  affiliate networks (CJ, Impact, Ascend; Amazon only on public pages, per its rules),
  a daily price refresh job, "Buy" links from advice cards, an affiliate disclosure. No
  tracking pixels for EU visitors without consent.
- **Pro tier**: multi-pool dashboard, sharing a pool with family or a service pro
  (`pool_members` table with RLS), route view, PDF reports.
- **Ads (optional)**: free tier only, certified TCF consent platform, non-personalized
  without consent.
- **Localization**: i18n scaffolding; Spanish, Italian and French first; metric by
  default outside the US.
- **Hardware**: Ondilo ICO integration as the first monitor source.
- **Native apps**: decide on a Capacitor wrapper from PWA usage data.

## Maintenance, all along

- Weekly check (scheduled task) stays read-only until it has repo write access; then it
  opens a dependency-update PR when tests pass.
- Monthly: privacy checklist (processor list, mailbox, retention jobs), backup restore
  test once on Supabase Pro.
- Keep `docs/ROADMAP.md` current: tick items off with the date and the PR number.
