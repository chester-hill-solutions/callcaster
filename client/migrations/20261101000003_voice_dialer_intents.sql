begin;
create table public.workspace_voice_dialer_intent (
  workspace uuid not null references public.workspace(id) on delete cascade,
  user_id text not null,
  intent_id uuid not null,
  campaign_id bigint not null check (campaign_id > 0),
  request jsonb check (request is null or jsonb_typeof(request) = 'object'),
  account_sid text,
  conference_id text,
  reservation_id uuid references public.workspace_voice_reservation(id) on delete set null,
  stop_requested_at timestamptz,
  stopped_at timestamptz,
  retired_at timestamptz,
  lease_token uuid not null default gen_random_uuid(),
  lease_expires_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint voice_dialer_intent_pk primary key (workspace, user_id, intent_id),
  constraint voice_dialer_intent_request check (request is not null or stop_requested_at is not null),
  constraint voice_dialer_intent_account check ((account_sid is null) = (conference_id is null)),
  constraint voice_dialer_intent_stopped check (stopped_at is null or stop_requested_at is not null)
);
create unique index voice_dialer_intent_active_actor on public.workspace_voice_dialer_intent(workspace, user_id)
  where reservation_id is not null and stop_requested_at is null and retired_at is null;
create index voice_dialer_intent_pending_stop on public.workspace_voice_dialer_intent(lease_expires_at)
  where stop_requested_at is not null and stopped_at is null;
alter table public.workspace_voice_reservation add column dialer_intent_id uuid;
create index voice_reservation_dialer_intent on public.workspace_voice_reservation(workspace, user_id, dialer_intent_id)
  where dialer_intent_id is not null;
commit;
