begin;
-- The clock records human-state changes, independently of delayed event delivery.
-- Keep values exact in the application's existing bigint-number mapping.
create sequence public.voice_human_revision_seq as bigint maxvalue 9007199254740991 no cycle;
alter table public.workspace_voice_reservation add column human_revision bigint;
alter sequence public.voice_human_revision_seq owned by public.workspace_voice_reservation.human_revision;

do $$
declare saved record;
begin
  for saved in select id from public.workspace_voice_reservation where human_state is not null order by id loop
    update public.workspace_voice_reservation set human_revision = nextval('public.voice_human_revision_seq') where id = saved.id;
  end loop;
end $$;

create function public.advance_voice_human_revision() returns trigger language plpgsql as $$
begin
  if new.human_state is null then
    new.human_revision := null;
  elsif tg_op = 'INSERT' then
    new.human_revision := nextval('public.voice_human_revision_seq');
  elsif old.human_state is distinct from new.human_state
      or old.human_conference_sequence is distinct from new.human_conference_sequence
      or old.human_revision is null then
    new.human_revision := nextval('public.voice_human_revision_seq');
  else
    new.human_revision := old.human_revision;
  end if;
  return new;
end $$;

create trigger voice_human_revision
  before insert or update of human_state, human_conference_sequence, human_revision
  on public.workspace_voice_reservation for each row execute function public.advance_voice_human_revision();

alter table public.workspace_voice_reservation add constraint voice_human_revision_state check (
  (human_state is null) = (human_revision is null)
  and (human_revision is null or human_revision between 1 and 9007199254740991)
);
create index voice_human_actor_revision on public.workspace_voice_reservation(workspace, user_id, human_revision desc)
  where human_revision is not null;
commit;
