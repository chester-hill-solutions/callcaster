create table if not exists public.predictive_machine_operation (
  id uuid primary key,
  workspace uuid not null references public.workspace(id) on delete cascade,
  call_sid text not null,
  outreach_attempt_id bigint not null,
  campaign_id bigint not null,
  conference_id text not null,
  user_id uuid not null,
  audio_file text,
  ack_url text not null,
  state text not null check (state in (
    'prepared', 'issued', 'acknowledged', 'dropped', 'continuing', 'continued', 'uncertain'
  )),
  lease_token uuid not null,
  lease_until timestamptz not null,
  issued_at timestamptz,
  acknowledged_at timestamptz,
  send_started_at timestamptz,
  successor_queue_id bigint,
  successor_attempt_id bigint,
  successor_contact_id bigint,
  successor_call_sid text,
  successor_voice_url text,
  successor_status_url text,
  successor_callback_sid text,
  successor_callback_status text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace, outreach_attempt_id),
  unique (workspace, call_sid),
  check (state <> 'issued' or issued_at is not null),
  check (state <> 'acknowledged' or acknowledged_at is not null),
  check ((send_started_at is null and successor_attempt_id is null and successor_queue_id is null and successor_contact_id is null)
    or (send_started_at is not null and successor_attempt_id is not null and successor_queue_id is not null and successor_contact_id is not null)),
  check (successor_call_sid is null or successor_attempt_id is not null),
  check ((successor_callback_sid is null) = (successor_callback_status is null)),
  check (successor_callback_sid is null or send_started_at is not null)
);

-- An uncertain successor must not be redialled by a later stale-claim sweep.
CREATE OR REPLACE FUNCTION public.reset_stale_campaign_queue_claims(campaign_id_pro integer, stale_after interval DEFAULT NULL::interval) RETURNS integer
    LANGUAGE plpgsql
    AS $$
declare
  reset_count integer;
  policy record;
begin
  select * into policy from public.campaign_queue_policy();

  perform public.fail_exhausted_campaign_queue_contacts(campaign_id_pro);

  update public.campaign_queue cq
  set
    queue_state = 'queued',
    assigned_to_user_id = null,
    claimed_at = null,
    provider_status = null
  where cq.campaign_id = campaign_id_pro
    and cq.dequeued_at is null
    and cq.queue_state = 'assigned'
    and cq.claimed_at is not null
    and cq.claimed_at < now() - coalesce(stale_after, policy.stale_after)
    and cq.attempt_count < policy.max_attempts
    and not exists (
      select 1 from public.predictive_machine_operation op
      where op.workspace = cq.workspace
        and op.campaign_id = cq.campaign_id
        and op.successor_queue_id = cq.id
        and op.send_started_at is not null
        and op.state in ('continuing', 'uncertain')
    );

  get diagnostics reset_count = row_count;
  return reset_count;
end;
$$;
