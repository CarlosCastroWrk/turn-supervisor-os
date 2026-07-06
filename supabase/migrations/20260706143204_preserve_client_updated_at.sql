create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- The browser is the offline source of truth for this personal field app.
  -- Preserve client-supplied edit timestamps during sync upserts; only fill
  -- updated_at when a caller leaves it null.
  if new.updated_at is null then
    new.updated_at = now();
  end if;

  return new;
end;
$$;
