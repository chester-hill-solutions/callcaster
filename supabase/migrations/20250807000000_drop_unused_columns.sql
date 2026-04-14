-- Drop columns identified as unused in the application codebase

-- CALL table: drop columns not read or written by the app
alter table if exists public.call drop column if exists from_formatted;
alter table if exists public.call drop column if exists to_formatted;
alter table if exists public.call drop column if exists queue_time;
alter table if exists public.call drop column if exists subresource_uris;
alter table if exists public.call drop column if exists trunk_sid;
alter table if exists public.call drop column if exists msg_id;
alter table if exists public.call drop column if exists price_unit;

-- CAMPAIGN table: legacy fields no longer used
alter table if exists public.campaign drop column if exists call_questions;
alter table if exists public.campaign drop column if exists dial_ratio;

-- WORKSPACE table: unused metadata
alter table if exists public.workspace drop column if exists cutoff_time;
-- workspace.users may still be referenced by policies (e.g. on message); skip if not droppable.
do $drop_users$
begin
  alter table if exists public.workspace drop column if exists users;
exception
  when others then
    if sqlstate = '2BP01' then
      raise notice 'Skipping workspace.users drop: %', sqlerrm;
    else
      raise;
    end if;
end
$drop_users$;

-- USER table: unused fields
alter table if exists public."user" drop column if exists organization;
alter table if exists public."user" drop column if exists activity;

-- Note:
-- After applying this migration, regenerate Supabase types to reflect the schema changes.
-- Example: supabase gen types typescript --project-id <your-project-ref> > app/lib/database.types.ts

