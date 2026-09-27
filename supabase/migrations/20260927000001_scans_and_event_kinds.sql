-- Photo-scan log (for the per-user monthly allowance and cost control) and the
-- "drained some water and refilled" event.
--
-- Safe to run more than once: every statement checks before it creates.

-- ---------------------------------------------------------------------------
-- scans: one row per photo sent to the vision model. No photo, no numbers read:
-- only when, whether it worked, and how many tokens it used.
-- ---------------------------------------------------------------------------
create table if not exists public.scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  ok boolean not null default false,
  source text check (source is null or char_length(source) <= 40),
  confidence text check (confidence is null or confidence in ('high', 'medium', 'low')),
  model text check (model is null or char_length(model) <= 80),
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0)
);

create index if not exists scans_user_time_idx on public.scans (user_id, created_at desc);
create index if not exists scans_time_idx on public.scans (created_at);

alter table public.scans enable row level security;

-- Users can see their own scans (the app counts them to show what is left). Only the
-- server writes: users get no insert, update or delete, so the count cannot be reset.
drop policy if exists "scans: own rows" on public.scans;
create policy "scans: own rows" on public.scans
  for select to authenticated
  using ((select auth.uid()) = user_id);

grant select on public.scans to authenticated;
grant all on public.scans to service_role;
revoke all on public.scans from anon;

-- ---------------------------------------------------------------------------
-- events: add drain_refill (part of the water drained and replaced)
-- ---------------------------------------------------------------------------
alter table public.events drop constraint if exists events_kind_check;
alter table public.events add constraint events_kind_check
  check (kind in ('refill', 'drain_refill', 'backwash', 'heavy_use', 'shock', 'cover_on', 'cover_off', 'other'));
