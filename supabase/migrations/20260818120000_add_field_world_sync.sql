-- The Wave 2A.2 field world — the Turn ledger itself. Until now sync covered
-- only the wave-1 entities; the record that actually runs a turn (day
-- sessions, release batches, today tasks, FIELD EVENTS, walk sessions,
-- property contacts) stayed device-only. These six tables carry the whole
-- record as jsonb so local shape changes never need column migrations.
--
-- NO before-update trigger on purpose: updated_at is the APP's timestamp
-- (fieldEvents are immutable — recordedAt), so merge comparisons stay
-- deterministic instead of being re-stamped by the server.

create table if not exists public.day_sessions (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id text not null default '',
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.daily_release_batches (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id text not null default '',
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.today_tasks (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id text not null default '',
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.field_events (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id text not null default '',
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.walk_sessions (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id text not null default '',
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.property_contacts (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id text not null default '',
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array[
    'day_sessions','daily_release_batches','today_tasks','field_events',
    'walk_sessions','property_contacts'
  ] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('alter table public.%I enable row level security', t);
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = t and policyname = t || '_owner'
    ) then
      execute format(
        'create policy %I_owner on public.%I
         for all to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))', t, t);
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
