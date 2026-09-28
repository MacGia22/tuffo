-- Beta waitlist, replacing the webhook. Written only by the server (the waitlist route
-- and the admin invite action, with the service key); no user or visitor can read or
-- write it. A row is deleted when that person is invited or asks to be removed.
--
-- Safe to run more than once.

create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (char_length(email) between 3 and 254 and email = lower(email)),
  source text check (source is null or char_length(source) <= 40),
  created_at timestamptz not null default now()
);

create index if not exists waitlist_created_idx on public.waitlist (created_at);

alter table public.waitlist enable row level security;

-- No policies on purpose: server only.
revoke all on public.waitlist from anon, authenticated;
grant all on public.waitlist to service_role;
