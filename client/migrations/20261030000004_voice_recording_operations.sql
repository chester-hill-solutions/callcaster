-- A recording part has one immutable physical source and logical customer owner.
create table if not exists public.workspace_voice_recording_operation (
  id uuid primary key,
  workspace uuid not null references public.workspace(id) on delete cascade,
  reservation_id uuid not null,
  user_id text not null,
  kind text not null check (kind in ('dial', 'parent', 'customer')),
  intent_id uuid not null,
  logical_call_sid text not null check (logical_call_sid ~* '^CA[0-9a-f]{32}$'),
  source_call_sid text not null check (source_call_sid ~* '^CA[0-9a-f]{32}$'),
  source_to text not null,
  source_from text not null,
  source_direction text not null,
  source_parent_sid text check (source_parent_sid ~* '^CA[0-9a-f]{32}$'),
  account_sid text not null check (account_sid ~* '^AC[0-9a-f]{32}$'),
  callback_url text not null,
  state text not null default 'prepared' check (state in ('prepared', 'creating', 'accepted', 'failed')),
  provider_sid text check (provider_sid ~* '^RE[0-9a-f]{32}$'),
  provider_status text check (provider_status in ('in-progress', 'completed', 'absent')),
  send_started_at timestamptz,
  recording_started_at timestamptz,
  recording_duration_seconds integer check (recording_duration_seconds >= 0),
  channels integer check (channels in (1, 2)),
  terminal_at timestamptz,
  audio_url text,
  lease_token uuid not null,
  lease_expires_at timestamptz not null,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint voice_recording_acceptance_checkpoint check (provider_sid is null or send_started_at is not null),
  constraint voice_recording_send_state check ((state = 'prepared' and send_started_at is null) or
    (state <> 'prepared' and send_started_at is not null)),
  constraint voice_recording_accepted_identity check (state <> 'accepted' or provider_sid is not null),
  constraint voice_recording_status_identity check (provider_status is null or provider_sid is not null),
  constraint voice_recording_terminal_status check (coalesce(provider_status in ('completed', 'absent'), false) = (terminal_at is not null)),
  constraint voice_recording_stored_part check (audio_url is null or
    (provider_sid is not null and provider_status is not null and provider_status = 'completed'))
);

create unique index if not exists voice_recording_intent
  on public.workspace_voice_recording_operation(workspace, reservation_id, kind, intent_id);
create unique index if not exists voice_recording_primary_phase
  on public.workspace_voice_recording_operation(workspace, reservation_id, kind) where state <> 'failed';
create unique index if not exists voice_recording_provider_sid
  on public.workspace_voice_recording_operation(provider_sid) where provider_sid is not null;
create index if not exists voice_recording_logical_call
  on public.workspace_voice_recording_operation(workspace, logical_call_sid, created_at);
create index if not exists voice_recording_physical_call
  on public.workspace_voice_recording_operation(workspace, source_call_sid);
create index if not exists voice_recording_recovery
  on public.workspace_voice_recording_operation(lease_expires_at)
  where state in ('prepared', 'creating') or
    (provider_sid is not null and (provider_status is null or provider_status = 'in-progress' or
      (provider_status = 'completed' and audio_url is null)));
