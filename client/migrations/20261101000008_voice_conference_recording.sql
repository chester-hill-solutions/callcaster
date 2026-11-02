-- Keep the Conference source separate from its physical instruction Call.
begin;
alter table public.workspace_voice_recording_operation
  drop constraint workspace_voice_recording_operation_kind_check,
  add constraint workspace_voice_recording_operation_kind_check
    check (kind in ('dial', 'parent', 'customer', 'conference')),
  add column source_conference_name text,
  add column source_conference_sid text;
alter table public.workspace_voice_recording_operation
  add constraint voice_recording_conference_source check (
    (kind = 'conference' and source_conference_name is not null and length(source_conference_name) > 0
      and source_parent_sid is null)
    or (kind <> 'conference' and source_conference_name is null and source_conference_sid is null)),
  add constraint voice_recording_conference_sid check (source_conference_sid ~* '^CF[0-9a-f]{32}$');
commit;
