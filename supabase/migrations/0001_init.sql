-- Turn Supervisor OS — initial Supabase schema
-- Personal single-user app. Every table is scoped to the authenticated user
-- via user_id + Row Level Security. IDs are text so existing local IDs
-- (e.g. "unit_ab12cd_xyz") migrate from localStorage without remapping.
--
-- Apply with: supabase db push   (or paste into the SQL editor)

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Core entities
-- ---------------------------------------------------------------------------

create table public.projects (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null default '',
  property_name text not null default '',
  location text not null default '',
  start_date date,
  end_date date,
  supervisor_name text not null default '',
  project_manager_name text not null default '',
  notes text not null default '',
  estimated_buildings int not null default 0,
  estimated_units int not null default 0,
  estimated_beds int not null default 0,
  estimated_common_areas int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.buildings (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id text not null references public.projects (id) on delete cascade,
  name text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.floors (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  building_id text not null references public.buildings (id) on delete cascade,
  name text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.units (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id text not null references public.projects (id) on delete cascade,
  building_id text references public.buildings (id) on delete set null,
  floor_id text references public.floors (id) on delete set null,
  unit_number text not null,
  bed_count int not null default 0,
  bathroom_count int not null default 0,
  has_common_area boolean not null default false,
  overall_status text not null default 'Not Started',
  paint_status text not null default 'Not Started',
  clean_status text not null default 'Not Started',
  repair_status text not null default 'Not Started',
  flooring_status text not null default 'Not Applicable',
  trash_status text not null default 'Not Started',
  inspection_status text not null default 'Not Started',
  assigned_crew_ids text[] not null default '{}',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index units_project_idx on public.units (project_id);
create index units_building_idx on public.units (building_id);
create index units_updated_idx on public.units (updated_at);

-- Optional per-bed / per-room production tracking (only used if per-bed
-- tracking turns out to matter in the field; the app works without rows here).
create table public.beds (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  unit_id text not null references public.units (id) on delete cascade,
  label text not null default '',
  status text not null default 'Not Started',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.common_areas (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id text not null references public.projects (id) on delete cascade,
  building_id text references public.buildings (id) on delete set null,
  floor_id text references public.floors (id) on delete set null,
  name text not null default '',
  status text not null default 'Not Started',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.crew_members (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null default '',
  trade text not null default 'Other',
  phone text not null default '',
  company text not null default '',
  language text not null default '',
  assigned_location text not null default '',
  notes text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.assignments (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id text not null references public.projects (id) on delete cascade,
  crew_member_id text references public.crew_members (id) on delete set null,
  team_name text not null default '',
  trade text not null default 'Other',
  building_id text references public.buildings (id) on delete set null,
  floor_id text references public.floors (id) on delete set null,
  unit_ids text[] not null default '{}',
  scope text not null default '',
  date date,
  start_time text not null default '',
  expected_completion text not null default '',
  actual_completion text not null default '',
  status text not null default 'Planned',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index assignments_date_idx on public.assignments (date);

create table public.issues (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id text not null references public.projects (id) on delete cascade,
  building_id text references public.buildings (id) on delete set null,
  floor_id text references public.floors (id) on delete set null,
  unit_id text references public.units (id) on delete set null,
  title text not null default '',
  category text not null default 'Other',
  priority text not null default 'Medium',
  owner text not null default '',
  status text not null default 'Open',
  due_at text not null default '',
  notes text not null default '',
  resolution_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index issues_status_idx on public.issues (status);
create index issues_unit_idx on public.issues (unit_id);

-- ---------------------------------------------------------------------------
-- Media: binary data lives in Storage buckets; these tables hold metadata.
-- Buckets (create in dashboard or CLI, both PRIVATE):
--   photos  — compressed JPEGs, path: {user_id}/{photo_id}.jpg
--   audio   — voice notes,      path: {user_id}/{audio_id}.m4a
-- ---------------------------------------------------------------------------

create table public.photo_notes (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id text not null references public.projects (id) on delete cascade,
  building_id text,
  floor_id text,
  unit_id text references public.units (id) on delete set null,
  issue_id text references public.issues (id) on delete set null,
  storage_path text not null default '',
  category text not null default 'Other',
  caption text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audio_notes (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id text references public.projects (id) on delete set null,
  storage_path text not null default '',
  duration_seconds numeric,
  status text not null default 'recorded', -- recorded | uploaded | transcribed | failed
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.transcripts (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  audio_note_id text references public.audio_notes (id) on delete set null,
  raw_text text not null default '',
  provider text not null default '',
  confidence numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Copilot / AI (draft-first: nothing here mutates core records directly)
-- ---------------------------------------------------------------------------

create table public.draft_actions (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type text not null,
  title text not null default '',
  summary text not null default '',
  target_entity_type text not null default '',
  target_entity_id text,
  payload jsonb not null default '{}',
  confidence numeric not null default 0,
  why text not null default '',
  source_text text not null default '',
  transcript_id text references public.transcripts (id) on delete set null,
  status text not null default 'pending', -- pending | approved | applied | rejected | failed
  error text,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index draft_actions_status_idx on public.draft_actions (status);

create table public.memory_candidates (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  memory_type text not null default 'Lesson Learned',
  content text not null default '',
  source text not null default '',
  confidence numeric not null default 0,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.memories (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  memory_type text not null default 'Lesson Learned',
  content text not null default '',
  source text not null default '',
  source_entity_id text,
  confidence numeric not null default 0,
  approved boolean not null default false,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Journals & operations
-- ---------------------------------------------------------------------------

create table public.activity_logs (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id text,
  entity_type text not null default '',
  entity_id text not null default '',
  action text not null default '',
  note text not null default '',
  created_at timestamptz not null default now()
);

create index activity_logs_entity_idx on public.activity_logs (entity_id);

create table public.daily_logs (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id text not null references public.projects (id) on delete cascade,
  date date not null,
  morning_plan text not null default '',
  midday_update text not null default '',
  end_of_day_reflection text not null default '',
  completed_summary text not null default '',
  blockers text not null default '',
  lessons text not null default '',
  tomorrow_priorities text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, project_id, date)
);

create table public.reports (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id text references public.projects (id) on delete set null,
  date date not null,
  kind text not null default 'daily', -- daily | morning | midday | end_of_day
  body text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.follow_up_tasks (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default '',
  description text not null default '',
  priority text not null default 'Medium',
  due_at text not null default '',
  owner text not null default '',
  related_entity_type text,
  related_entity_id text,
  status text not null default 'open',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.training_questions (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  question text not null default '',
  category text not null default '',
  status text not null default 'Not Asked',
  answer text not null default '',
  follow_up text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notifications (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null default '',           -- stale_unit | crew_missing | eod_reminder | ...
  title text not null default '',
  body text not null default '',
  related_entity_type text,
  related_entity_id text,
  scheduled_for timestamptz,
  sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  device_label text not null default '',
  subscription jsonb not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'projects','buildings','floors','units','beds','common_areas','crew_members',
    'assignments','issues','photo_notes','audio_notes','transcripts','draft_actions',
    'memory_candidates','memories','daily_logs','reports','follow_up_tasks',
    'training_questions'
  ] loop
    execute format(
      'create trigger %I_updated_at before update on public.%I
       for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Row Level Security: single-user scoping on every table.
-- The browser only ever holds the anon key + the user's session JWT;
-- these policies are what make that safe.
-- ---------------------------------------------------------------------------

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'projects','buildings','floors','units','beds','common_areas','crew_members',
    'assignments','issues','photo_notes','audio_notes','transcripts','draft_actions',
    'memory_candidates','memories','activity_logs','daily_logs','reports',
    'follow_up_tasks','training_questions','notifications','push_subscriptions'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I_owner on public.%I
       for all to authenticated
       using (user_id = (select auth.uid()))
       with check (user_id = (select auth.uid()))', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Storage buckets and policies.
-- Objects are stored under {user_id}/{object_id.ext}; RLS limits each signed-in
-- user to their own folder. Buckets are private.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('photos', 'photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('audio', 'audio', false, 52428800, array['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/wav', 'audio/webm', 'audio/ogg'])
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "turn media read own folder"
on storage.objects for select to authenticated
using (
  bucket_id in ('photos', 'audio')
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "turn media insert own folder"
on storage.objects for insert to authenticated
with check (
  bucket_id in ('photos', 'audio')
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "turn media update own folder"
on storage.objects for update to authenticated
using (
  bucket_id in ('photos', 'audio')
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id in ('photos', 'audio')
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "turn media delete own folder"
on storage.objects for delete to authenticated
using (
  bucket_id in ('photos', 'audio')
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
