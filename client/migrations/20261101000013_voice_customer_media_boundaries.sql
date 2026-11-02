-- Provider event time and actual customer Call time have separate provenance.
alter table public.workspace_voice_reservation
  add column terminal_event_at timestamptz,
  add column terminal_event_sequence integer,
  add column media_call_started_at timestamptz,
  add column media_call_ended_at timestamptz,
  add column media_call_duration_seconds integer,
  add constraint voice_terminal_event_time check (terminal_event_at is null or isfinite(terminal_event_at)),
  add constraint voice_terminal_event_sequence check (terminal_event_sequence is null or
    (terminal_event_at is not null and terminal_event_sequence >= 0)),
  add constraint voice_media_call_clock check (
    (media_call_started_at is null and media_call_ended_at is null and media_call_duration_seconds is null)
    or (media_call_started_at is not null and media_call_ended_at is not null and media_call_duration_seconds is not null
      and isfinite(media_call_started_at) and isfinite(media_call_ended_at)
      and media_call_ended_at >= media_call_started_at and media_call_duration_seconds >= 0));
