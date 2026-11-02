-- Neutral room events prove sequence coverage between customer visits.
alter table public.workspace_voice_recording_customer_event
  add column participant_call_sid text check (participant_call_sid ~* '^CA[0-9a-f]{32}$');
update public.workspace_voice_recording_customer_event set participant_call_sid = customer_call_sid;
alter table public.workspace_voice_recording_customer_event
  drop constraint workspace_voice_recording_customer_event_event_check,
  add constraint workspace_voice_recording_customer_event_event_check check (event in (
    'conference-start', 'conference-end', 'participant-join', 'participant-leave',
    'participant-modify', 'participant-speech-start', 'participant-speech-stop',
    'participant-mute', 'participant-unmute', 'participant-hold', 'participant-unhold',
    'announcement-start', 'announcement-end', 'announcement-fail'
  ));
