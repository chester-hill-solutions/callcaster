-- A terminal callback owner can still own an unfinished customer-room stop.
alter table public.workspace_voice_audio_connection
  add column if not exists conference_stop_requested_at timestamptz,
  add column if not exists conference_stop_call_sid text,
  add column if not exists conference_stopped_at timestamptz;

alter table public.workspace_voice_audio_connection
  add constraint voice_audio_conference_stop_identity check (
    (conference_stop_requested_at is null and conference_stop_call_sid is null and conference_stopped_at is null)
    or (conference_stop_requested_at is not null and conference_stop_call_sid is not null
      and conference_stop_call_sid ~ '^CA[0-9a-fA-F]{32}$' and conference_sid is not null
      and conference_sid ~ '^CF[0-9a-fA-F]{32}$')
  );

create index if not exists voice_audio_stop_recovery
  on public.workspace_voice_audio_connection(lease_expires_at)
  where conference_stop_requested_at is not null and conference_stopped_at is null;
create index if not exists voice_audio_stop_actor
  on public.workspace_voice_audio_connection(workspace, user_id)
  where conference_stop_requested_at is not null and conference_stopped_at is null;
