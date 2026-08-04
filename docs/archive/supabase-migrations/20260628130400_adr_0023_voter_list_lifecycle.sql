-- ADR-0023: Voter list lifecycle on contact.
-- Records where a voter record came from, when it was imported, and when the
-- list license expires. Optional dedicated `voter_lists` table is deferred.

do $$ begin
  create type public.voter_list_source as enum (
    'liberalist',
    'van',
    'elections_canada',
    'elections_ontario',
    'manual',
    'other'
  );
exception
  when duplicate_object then null;
end $$;

alter table public.contact
  add column if not exists voter_list_source public.voter_list_source;

alter table public.contact
  add column if not exists voter_list_imported_at timestamptz;

alter table public.contact
  add column if not exists voter_list_expires_at timestamptz;

alter table public.contact
  add column if not exists voter_id text;

create index if not exists contact_voter_list_expires_at_idx
  on public.contact (voter_list_expires_at)
  where voter_list_expires_at is not null;

create index if not exists contact_voter_id_idx
  on public.contact (voter_id)
  where voter_id is not null;
