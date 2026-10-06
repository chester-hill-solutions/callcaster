create table if not exists public.workspace_number_purchase (
  id uuid primary key,
  workspace uuid not null references public.workspace(id) on delete cascade,
  actor_user_id text not null,
  phone_number text not null,
  account_sid text not null,
  credits integer not null check (credits > 0),
  state text not null default 'reserved'
    check (state in ('reserved', 'creating', 'provisioned', 'completed', 'cancelled')),
  provider_sid text,
  last_error text,
  lease_token uuid not null,
  lease_expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists workspace_number_purchase_active_phone
  on public.workspace_number_purchase(workspace, phone_number)
  where state not in ('completed', 'cancelled');

create index if not exists workspace_number_purchase_recovery
  on public.workspace_number_purchase(lease_expires_at)
  where state not in ('completed', 'cancelled');
