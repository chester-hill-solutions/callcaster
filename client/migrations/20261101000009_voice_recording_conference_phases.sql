-- Each physical room owns one live capture; terminal parts retain their identity.
begin;
drop index public.voice_recording_primary_phase;
create unique index voice_recording_primary_phase
  on public.workspace_voice_recording_operation(workspace, reservation_id, kind)
  where kind <> 'conference' and state <> 'failed' and (kind <> 'parent' or terminal_at is null);
create unique index voice_recording_conference_phase
  on public.workspace_voice_recording_operation(workspace, reservation_id, source_conference_name)
  where kind = 'conference' and state <> 'failed' and terminal_at is null;
commit;
