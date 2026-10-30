-- Persistent agent audio has its own identity; it is never a customer setup SID.
begin;
alter table public.workspace_voice_reservation
  add column audio_connection_id uuid,
  add column audio_generation integer,
  add column audio_destination text,
  add column audio_agent_sid text,
  add column audio_conference_callback text,
  add column audio_mode text;

-- Keep immutable send provenance even after an audio operation is removed.
-- As with source_connection_id in the audio journal, this is not a cascading FK.
alter table public.workspace_voice_reservation
  add constraint voice_customer_audio_source check (
    (audio_connection_id is null and audio_generation is null and audio_destination is null
      and audio_agent_sid is null and audio_conference_callback is null and audio_mode is null)
    or (audio_connection_id is not null and audio_generation is not null and audio_generation > 0
      and audio_destination is not null and audio_destination ~ '^\+[1-9][0-9]{7,14}$'
      and audio_agent_sid is not null and audio_agent_sid ~ '^CA[0-9a-fA-F]{32}$'
      and audio_conference_callback is not null and audio_mode is not null and audio_mode in ('manual', 'predictive')
      and kind = 'staffed' and user_id is not null and campaign_id is not null
      and conference_id is not null and conference_sid is not null and conference_sid ~ '^CF[0-9a-fA-F]{32}$'
      and setup_to is null and setup_client_identity is null and setup_sid is null)
  );

create index voice_customer_audio_active
  on public.workspace_voice_reservation(workspace, audio_connection_id)
  where state in ('reserved', 'creating', 'active');
commit;
