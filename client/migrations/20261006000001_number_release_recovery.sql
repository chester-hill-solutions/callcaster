create table if not exists public.workspace_number_release (
  id uuid primary key,
  workspace uuid not null references public.workspace(id) on delete cascade,
  number_id bigint not null,
  number_created_at text not null,
  number_type text not null,
  phone_number text not null,
  friendly_name text,
  provider_sid text,
  account_sid text not null,
  incoming_sids jsonb,
  outgoing_sids jsonb,
  messaging_service_sids jsonb not null default '[]'::jsonb,
  state text not null default 'prepared'
    check (state in ('prepared', 'releasing', 'released', 'completed')),
  last_error text,
  lease_token uuid not null,
  lease_expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace, number_id),
  check (incoming_sids is null or jsonb_typeof(incoming_sids) = 'array'),
  check (outgoing_sids is null or jsonb_typeof(outgoing_sids) = 'array'),
  check (jsonb_typeof(messaging_service_sids) = 'array')
);

create index if not exists workspace_number_release_recovery
  on public.workspace_number_release(lease_expires_at)
  where state <> 'completed';
