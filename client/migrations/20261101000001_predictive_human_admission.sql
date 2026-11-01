-- A customer owns the agent before Conference TwiML can be returned.
-- Existing calls remain unknown until a verified customer event establishes ownership.
begin;
alter table public.workspace_voice_reservation
  add column human_state text,
  add column human_conference_sequence bigint,
  add constraint voice_human_state check (
    human_state is null or (human_state in ('pending', 'joined', 'left', 'ended', 'refused')
      and kind = 'staffed' and user_id is not null and provider_sid is not null and conference_id is not null)
  ),
  add constraint voice_human_sequence check (human_conference_sequence is null or human_conference_sequence >= 0);

create unique index voice_one_human_per_agent
  on public.workspace_voice_reservation(workspace, user_id)
  where human_state in ('pending', 'joined');
commit;
