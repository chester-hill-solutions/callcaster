-- Keep provider-time customer membership before assembling shared room media.
create table public.workspace_voice_recording_customer_event (
  id uuid primary key,
  workspace uuid not null references public.workspace(id) on delete cascade,
  reservation_id uuid not null,
  user_id text not null,
  logical_call_sid text not null check (logical_call_sid ~* '^CA[0-9a-f]{32}$'),
  customer_call_sid text not null check (customer_call_sid ~* '^CA[0-9a-f]{32}$'),
  account_sid text not null check (account_sid ~* '^AC[0-9a-f]{32}$'),
  conference_sid text not null check (conference_sid ~* '^CF[0-9a-f]{32}$'),
  conference_name text not null check (length(conference_name) > 0),
  event text not null check (event in ('participant-join', 'participant-leave')),
  sequence_number integer check (sequence_number >= 0),
  occurred_at timestamptz,
  event_key text not null check (event_key ~ '^[0-9a-f]{64}$'),
  received_at timestamptz not null default clock_timestamp(),
  unique (account_sid, conference_sid, event_key)
);
create unique index voice_recording_customer_sequence
  on public.workspace_voice_recording_customer_event(account_sid, conference_sid, sequence_number)
  where sequence_number is not null;
create index voice_recording_customer_timeline
  on public.workspace_voice_recording_customer_event(workspace, logical_call_sid, conference_sid, sequence_number);
