-- Audio transport does not change the original customer call's billing identity.
alter table public.workspace_voice_reservation
  add column if not exists setup_continuation_url text;

create table if not exists public.workspace_voice_audio_connection (
  id uuid primary key,
  workspace uuid not null references public.workspace(id) on delete cascade,
  user_id text not null,
  intent_id uuid not null,
  target_kind text not null check (target_kind in ('idle', 'direct', 'conference')),
  target_key text not null,
  requested_call_sid text,
  reservation_id uuid,
  campaign_id bigint,
  customer_sid text,
  original_agent_sid text,
  source_agent_sid text,
  source_connection_id uuid,
  generation integer not null check (generation > 0),
  transport text not null check (transport in ('phone', 'computer')),
  destination text not null,
  account_sid text not null,
  caller_id text not null,
  conference_id text not null,
  conference_sid text,
  voice_url text not null,
  status_callback text not null,
  conference_callback text not null,
  state text not null default 'prepared'
    check (state in ('prepared', 'creating', 'joining', 'ready', 'switching', 'active', 'retired', 'failed', 'canceled')),
  provider_sid text,
  send_started_at timestamptz,
  voice_issued_at timestamptz,
  joined_at timestamptz,
  customer_joined_at timestamptz,
  parent_joined_at timestamptz,
  promotion_requested_at timestamptz,
  committed_at timestamptz,
  retired_at timestamptz,
  cancel_requested_at timestamptz,
  terminal_at timestamptz,
  terminal_status text,
  lease_token uuid not null,
  lease_expires_at timestamptz not null,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint voice_audio_destination check (
    (transport = 'phone' and destination ~ '^\+[1-9][0-9]{1,14}$') or
    (transport = 'computer' and destination like 'client:%' and length(destination) > 7)
  ),
  constraint voice_audio_live_owner check (
    target_kind = 'idle' or (reservation_id is not null and requested_call_sid is not null and original_agent_sid is not null)
  ),
  constraint voice_audio_accepted_checkpoint check (provider_sid is null or send_started_at is not null),
  constraint voice_audio_join_identity check (joined_at is null or (provider_sid is not null and conference_sid is not null))
);

create unique index if not exists voice_audio_intent
  on public.workspace_voice_audio_connection(workspace, user_id, intent_id);
create unique index if not exists voice_audio_provider_sid
  on public.workspace_voice_audio_connection(provider_sid) where provider_sid is not null;
create unique index if not exists voice_audio_generation
  on public.workspace_voice_audio_connection(workspace, user_id, generation);
create unique index if not exists voice_audio_pending_actor
  on public.workspace_voice_audio_connection(workspace, user_id)
  where state in ('prepared', 'creating', 'joining', 'ready', 'switching');
create unique index if not exists voice_audio_active_actor
  on public.workspace_voice_audio_connection(workspace, user_id) where state = 'active';
create index if not exists voice_audio_conference
  on public.workspace_voice_audio_connection(workspace, account_sid, conference_id);
create index if not exists voice_audio_recovery
  on public.workspace_voice_audio_connection(lease_expires_at)
  where state in ('prepared', 'creating', 'joining', 'ready', 'switching', 'active');
