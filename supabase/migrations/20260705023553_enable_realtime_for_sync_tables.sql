do $$
declare t text;
begin
  foreach t in array array[
    'projects','buildings','floors','units','crew_members','assignments','issues',
    'photo_notes','daily_logs','training_questions','activity_logs','draft_actions',
    'memories','memory_candidates','follow_up_tasks'
  ] loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
