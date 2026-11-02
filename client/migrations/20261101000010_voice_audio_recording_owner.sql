-- Sharing a room must not let an old instruction select a successor's capture.
alter table public.workspace_voice_audio_connection
  add column recording_operation_id uuid,
  add constraint voice_audio_recording_target check (recording_operation_id is null or target_kind = 'direct');
