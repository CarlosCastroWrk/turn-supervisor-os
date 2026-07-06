alter table public.projects
add column if not exists project_mode text not null default 'demo'
check (project_mode in ('demo', 'real'));

alter table public.crew_members
add column if not exists project_id text references public.projects (id) on delete set null;

create index if not exists crew_members_project_idx on public.crew_members (project_id);
