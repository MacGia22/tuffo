-- In-app feedback, replacing the mailto link. People send ideas, problems and questions
-- from /app/feedback and see their own past messages with a status the admin sets.
-- Users can insert and read their own rows only; they cannot change or delete them, set
-- the status, or send more than 10 in 24 hours (enforced here too, because the REST API
-- is reachable with a user's token without going through the app).
--
-- A scheduled read-only routine selects id, created_at, kind, message, page,
-- app_version, status and contact_ok (never user_id): keep those columns stable.
--
-- Safe to run more than once.

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('idea', 'problem', 'question', 'other')),
  message text not null check (char_length(message) between 1 and 2000 and btrim(message) <> ''),
  page text check (page is null or char_length(page) <= 200),
  app_version text check (app_version is null or char_length(app_version) <= 40),
  contact_ok boolean not null default false,
  status text not null default 'new' check (status in ('new', 'planned', 'done', 'declined'))
);

create index if not exists feedback_created_idx on public.feedback (created_at);
create index if not exists feedback_user_time_idx on public.feedback (user_id, created_at desc);

alter table public.feedback enable row level security;

drop policy if exists "feedback: read own" on public.feedback;
create policy "feedback: read own" on public.feedback
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "feedback: insert own" on public.feedback;
create policy "feedback: insert own" on public.feedback
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- No update or delete for users. Insert only the columns a person fills in, so status,
-- id and created_at always take their defaults.
revoke all on public.feedback from anon, authenticated;
grant select on public.feedback to authenticated;
grant insert (user_id, kind, message, page, app_version, contact_ok) on public.feedback to authenticated;
grant all on public.feedback to service_role;

-- At most 10 messages per person in any 24 hours.
create or replace function public.feedback_daily_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (
    select count(*) from public.feedback
    where user_id = new.user_id and created_at > now() - interval '24 hours'
  ) >= 10 then
    raise exception 'feedback limit reached' using errcode = 'P0001', hint = 'feedback_daily_limit';
  end if;
  return new;
end;
$$;

revoke all on function public.feedback_daily_limit() from public, anon, authenticated;

drop trigger if exists feedback_daily_limit on public.feedback;
create trigger feedback_daily_limit
  before insert on public.feedback
  for each row execute function public.feedback_daily_limit();
