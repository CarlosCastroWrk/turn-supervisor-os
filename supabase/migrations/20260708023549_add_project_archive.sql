alter table public.projects
add column if not exists archived_at timestamptz;

comment on column public.projects.archived_at is
'Soft archive timestamp for hiding duplicate or test Real Turn projects without deleting records.';
