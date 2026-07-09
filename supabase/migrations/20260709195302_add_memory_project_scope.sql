set lock_timeout = '5s';

alter table if exists public.memories
  add column if not exists project_id text references public.projects (id) on delete restrict;

alter table if exists public.memory_candidates
  add column if not exists project_id text references public.projects (id) on delete restrict,
  add column if not exists source_entity_id text;

create index if not exists memories_user_project_idx
  on public.memories (user_id, project_id);

create index if not exists memory_candidates_user_project_idx
  on public.memory_candidates (user_id, project_id);

comment on column public.memories.project_id is
  'Null only for explicit global personal preferences or built-in safety rules; otherwise scopes memory consumption to one project.';

comment on column public.memory_candidates.project_id is
  'Project where the candidate was captured. Unscoped legacy candidates require explicit review before use.';

comment on column public.memory_candidates.source_entity_id is
  'Optional local entity that grounded the candidate; removed or archived sources must not remain active Memory.';
