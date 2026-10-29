create table if not exists public.workspace_voice_reservation (
  id uuid primary key,
  workspace uuid not null references public.workspace(id) on delete cascade,
  kind text not null check (kind in ('ivr', 'staffed')),
  credits integer not null check (credits > 0),
  account_sid text not null,
  recipient text not null,
  caller_id text not null,
  campaign_id bigint,
  contact_id bigint,
  outreach_attempt_id bigint,
  user_id text,
  state text not null default 'reserved'
    check (state in ('reserved', 'creating', 'active', 'settled', 'released')),
  provider_sid text,
  setup_sid text,
  lease_token uuid not null,
  lease_expires_at timestamptz not null,
  send_started_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists workspace_voice_reservation_provider_sid
  on public.workspace_voice_reservation(provider_sid) where provider_sid is not null;
create unique index if not exists workspace_voice_reservation_setup_sid
  on public.workspace_voice_reservation(setup_sid) where setup_sid is not null;
create index if not exists workspace_voice_reservation_funding
  on public.workspace_voice_reservation(workspace)
  where state in ('reserved', 'creating', 'active');
create index if not exists workspace_voice_reservation_recovery
  on public.workspace_voice_reservation(lease_expires_at)
  where state in ('reserved', 'creating', 'active');
