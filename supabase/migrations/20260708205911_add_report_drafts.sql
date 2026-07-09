create table public.report_drafts (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id text not null references public.projects (id) on delete cascade,
  date date not null,
  title text not null default '',
  title_edited boolean not null default false,
  summary text not null default '',
  summary_edited boolean not null default false,
  sections jsonb not null default '[]'::jsonb check (jsonb_typeof(sections) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, project_id, date)
);

create index report_drafts_project_date_idx on public.report_drafts (project_id, date);
create index report_drafts_updated_idx on public.report_drafts (updated_at);

create trigger report_drafts_updated_at before update on public.report_drafts
for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.report_drafts to authenticated;

alter table public.report_drafts enable row level security;

create policy report_drafts_owner on public.report_drafts
for all to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'report_drafts'
  ) then
    alter publication supabase_realtime add table public.report_drafts;
  end if;
end $$;
