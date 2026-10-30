-- A confirmed terminal parent part remains accepted history, not a live capture.
begin;
drop index if exists public.voice_recording_primary_phase;
create unique index voice_recording_primary_phase
  on public.workspace_voice_recording_operation(workspace, reservation_id, kind)
  where state <> 'failed' and (kind <> 'parent' or terminal_at is null);
commit;
