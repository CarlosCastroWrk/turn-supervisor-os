set lock_timeout = '5s';

alter table public.projects
  add column if not exists ai_budget_usd numeric(10, 2) not null default 10
  check (ai_budget_usd >= 0 and ai_budget_usd <= 10000);

comment on column public.projects.ai_budget_usd is
  'TurnOS planning budget used for estimated in-app AI spend. It is not the official OpenAI credit balance.';

create table if not exists public.ai_usage_events (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id text not null references public.projects (id) on delete cascade,
  task text not null default 'capture' check (task in ('capture')),
  model text not null,
  model_class text not null check (model_class in ('fast', 'complex', 'override')),
  route_reason text not null default '',
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  cached_input_tokens bigint not null default 0 check (cached_input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  total_tokens bigint not null default 0 check (total_tokens >= 0),
  estimated_cost_usd numeric(16, 8) not null default 0 check (estimated_cost_usd >= 0),
  pricing_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_usage_events_user_project_created_idx
  on public.ai_usage_events (user_id, project_id, created_at desc);

drop trigger if exists ai_usage_events_updated_at on public.ai_usage_events;
create trigger ai_usage_events_updated_at
  before update on public.ai_usage_events
  for each row execute function public.set_updated_at();

alter table public.ai_usage_events enable row level security;

grant select, insert, update, delete on public.ai_usage_events to authenticated;

drop policy if exists ai_usage_events_owner on public.ai_usage_events;
create policy ai_usage_events_owner on public.ai_usage_events
  for all to authenticated
  using (
    user_id = (select auth.uid())
    and project_id in (
      select project.id
      from public.projects as project
      where project.user_id = (select auth.uid())
    )
  )
  with check (
    user_id = (select auth.uid())
    and project_id in (
      select project.id
      from public.projects as project
      where project.user_id = (select auth.uid())
    )
  );

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'ai_usage_events'
  ) then
    alter publication supabase_realtime add table public.ai_usage_events;
  end if;
end $$;

comment on table public.ai_usage_events is
  'Minimal token and estimated-cost telemetry for TurnOS model calls. Raw field notes and model output are intentionally excluded.';
