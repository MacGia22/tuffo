-- "Report a misread": after a photo scan, a person can tell Tuffo which numbers the
-- scanner got wrong, with an optional note and, only if they tick the box for that
-- report, the (cropped) photo. The server writes every row and file; users read and
-- delete their own rows. Photos live in the private Storage bucket "scan-reports" at
-- {user_id}/{report_id}.jpg, are deleted after photo_delete_after (12 months) by the
-- daily alerts job, and can be deleted any time from the Account page.
--
-- Safe to run more than once.

create table if not exists public.scan_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('test', 'pump')),
  source text check (source is null or char_length(source) <= 40),
  model text check (model is null or char_length(model) <= 80),
  prompt_version text check (prompt_version is null or char_length(prompt_version) <= 40),
  read jsonb not null default '{}'::jsonb,
  corrected jsonb not null default '{}'::jsonb,
  note text check (note is null or char_length(note) <= 500),
  photo_path text check (photo_path is null or char_length(photo_path) <= 200),
  photo_consent_at timestamptz,
  consent_version text check (consent_version is null or char_length(consent_version) <= 40),
  status text not null default 'new' check (status in ('new', 'reviewed', 'fixed')),
  photo_delete_after date,
  -- A stored photo always carries the consent that allowed it and its deletion date.
  constraint scan_reports_photo_consent check (
    photo_path is null or (photo_consent_at is not null and consent_version is not null and photo_delete_after is not null)
  )
);

create index if not exists scan_reports_user_time_idx on public.scan_reports (user_id, created_at desc);
create index if not exists scan_reports_time_idx on public.scan_reports (created_at desc);
create index if not exists scan_reports_photo_due_idx on public.scan_reports (photo_delete_after) where photo_path is not null;

alter table public.scan_reports enable row level security;

drop policy if exists "scan_reports: read own" on public.scan_reports;
create policy "scan_reports: read own" on public.scan_reports
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "scan_reports: delete own" on public.scan_reports;
create policy "scan_reports: delete own" on public.scan_reports
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- No insert or update for users: the report route and the admin page write with the
-- service key.
revoke all on public.scan_reports from anon, authenticated;
grant select, delete on public.scan_reports to authenticated;
grant all on public.scan_reports to service_role;

-- The private bucket for shared photos. No storage policies: only the server reads and
-- writes it, and people view their photos through 5-minute signed URLs. Skipped where
-- there is no Storage schema (the local RLS test database).
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('scan-reports', 'scan-reports', false, 2097152, array['image/jpeg'])
    on conflict (id) do nothing;
  end if;
end;
$$;
