-- Email alerts: per-pool choices (off by default), and what was sent, so the daily job
-- sends at most one email per person per day and does not repeat itself.
--
-- Safe to run more than once.

-- Choices per pool, set by the owner on the account page.
create table if not exists public.alert_settings (
  pool_id uuid primary key references public.pools (id) on delete cascade,
  algae boolean not null default false,
  test_reminder boolean not null default false,
  test_after_days integer not null default 7 check (test_after_days between 1 and 60),
  weekly boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.alert_settings enable row level security;

drop policy if exists "alert settings: owner read" on public.alert_settings;
create policy "alert settings: owner read" on public.alert_settings
  for select to authenticated
  using (exists (select 1 from public.pools p where p.id = pool_id and p.owner_id = (select auth.uid())));

drop policy if exists "alert settings: owner insert" on public.alert_settings;
create policy "alert settings: owner insert" on public.alert_settings
  for insert to authenticated
  with check (exists (select 1 from public.pools p where p.id = pool_id and p.owner_id = (select auth.uid())));

drop policy if exists "alert settings: owner update" on public.alert_settings;
create policy "alert settings: owner update" on public.alert_settings
  for update to authenticated
  using (exists (select 1 from public.pools p where p.id = pool_id and p.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.pools p where p.id = pool_id and p.owner_id = (select auth.uid())));

revoke all on public.alert_settings from anon, authenticated;
grant select, insert, update on public.alert_settings to authenticated;
grant all on public.alert_settings to service_role;

-- One row per email sent: the primary key is the "one email per person per day" rule.
create table if not exists public.alert_emails (
  user_id uuid not null references auth.users (id) on delete cascade,
  sent_on date not null,
  alerts integer not null default 0 check (alerts >= 0),
  created_at timestamptz not null default now(),
  primary key (user_id, sent_on)
);

-- One row per alert in an email, so a warning is not repeated too soon.
create table if not exists public.alert_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  pool_id uuid references public.pools (id) on delete set null,
  kind text not null check (kind in ('algae', 'test_reminder', 'weekly')),
  sent_on date not null,
  created_at timestamptz not null default now()
);

create index if not exists alert_log_user_idx on public.alert_log (user_id, sent_on desc);
create index if not exists alert_emails_day_idx on public.alert_emails (sent_on);

alter table public.alert_emails enable row level security;
alter table public.alert_log enable row level security;

-- People can see what was sent to them (the data export); only the server writes.
drop policy if exists "alert emails: own rows" on public.alert_emails;
create policy "alert emails: own rows" on public.alert_emails
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "alert log: own rows" on public.alert_log;
create policy "alert log: own rows" on public.alert_log
  for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.alert_emails, public.alert_log from anon, authenticated;
grant select on public.alert_emails, public.alert_log to authenticated;
grant all on public.alert_emails, public.alert_log to service_role;
