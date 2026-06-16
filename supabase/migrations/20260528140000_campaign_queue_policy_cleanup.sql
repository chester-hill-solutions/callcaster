-- Centralize campaign queue policy constants (keep in sync with
-- supabase/functions/_shared/queue-policy.ts and app/lib/throughput-config.ts).

create or replace function public.campaign_queue_policy()
returns table(max_attempts integer, stale_after interval)
language sql
stable
as $$
  select 5::integer, interval '10 minutes';
$$;

create or replace function public.campaign_queue_has_pending_work(
  campaign_id_pro integer,
  stale_after interval default null
)
returns boolean
language plpgsql
as $function$
declare
  pending_count integer;
  policy record;
begin
  select * into policy from public.campaign_queue_policy();

  select count(*)::integer
  into pending_count
  from public.campaign_queue cq
  where cq.campaign_id = campaign_id_pro
    and cq.dequeued_at is null
    and (
      cq.queue_state = 'queued'
      or cq.status = 'queued'
      or (
        cq.queue_state = 'assigned'
        and cq.claimed_at is not null
        and cq.claimed_at >= now() - coalesce(stale_after, policy.stale_after)
        and cq.attempt_count < policy.max_attempts
      )
    );

  return pending_count > 0;
end;
$function$;

create or replace function public.fail_exhausted_campaign_queue_contacts(
  campaign_id_pro integer
)
returns integer
language plpgsql
as $function$
declare
  failed_count integer;
  policy record;
begin
  select * into policy from public.campaign_queue_policy();

  update public.campaign_queue cq
  set
    status = 'failed',
    queue_state = 'failed',
    dequeued_at = now(),
    dequeued_by_id = null,
    dequeue_reason = coalesce(cq.dequeue_reason, 'Max queue attempts exceeded')
  where cq.campaign_id = campaign_id_pro
    and cq.dequeued_at is null
    and cq.attempt_count >= policy.max_attempts
    and cq.queue_state in ('queued', 'assigned', 'failed');

  get diagnostics failed_count = row_count;
  return failed_count;
end;
$function$;

create or replace function public.reset_stale_campaign_queue_claims(
  campaign_id_pro integer,
  stale_after interval default null
)
returns integer
language plpgsql
as $function$
declare
  reset_count integer;
  policy record;
begin
  select * into policy from public.campaign_queue_policy();

  perform public.fail_exhausted_campaign_queue_contacts(campaign_id_pro);

  update public.campaign_queue cq
  set
    status = 'queued',
    queue_state = 'queued',
    assigned_to_user_id = null,
    claimed_at = null,
    provider_status = null
  where cq.campaign_id = campaign_id_pro
    and cq.dequeued_at is null
    and cq.queue_state = 'assigned'
    and cq.claimed_at is not null
    and cq.claimed_at < now() - coalesce(stale_after, policy.stale_after)
    and cq.attempt_count < policy.max_attempts;

  get diagnostics reset_count = row_count;
  return reset_count;
end;
$function$;

create or replace function public.claim_campaign_queue_contacts(
  campaign_id_pro integer,
  claimed_by_user_id uuid,
  claim_limit integer default 1,
  max_inflight integer default null
)
returns table (
  id integer,
  contact_id integer,
  phone text,
  workspace text,
  caller_id text
)
language plpgsql
as $function$
declare
  effective_limit integer;
  policy record;
begin
  select * into policy from public.campaign_queue_policy();
  perform public.fail_exhausted_campaign_queue_contacts(campaign_id_pro);

  effective_limit := greatest(claim_limit, 1);
  if max_inflight is not null then
    if max_inflight <= 0 then
      return;
    end if;
    effective_limit := least(effective_limit, max_inflight);
  end if;

  return query
  with candidates as (
    select cq.id
    from public.campaign_queue cq
    where cq.campaign_id = campaign_id_pro
      and cq.status = 'queued'
      and cq.dequeued_at is null
      and (cq.queue_state is null or cq.queue_state = 'queued')
      and cq.attempt_count < policy.max_attempts
    order by cq.id
    for update skip locked
    limit effective_limit
  ),
  claimed as (
    update public.campaign_queue cq
    set
      status = claimed_by_user_id::text,
      queue_state = 'assigned',
      assigned_to_user_id = claimed_by_user_id,
      provider_status = null,
      claimed_at = now(),
      attempt_count = cq.attempt_count + 1,
      last_attempt_at = now()
    from candidates c
    where cq.id = c.id
    returning cq.id, cq.contact_id, cq.campaign_id
  )
  select distinct on (contact.phone)
    claimed.id,
    contact.id as contact_id,
    contact.phone,
    contact.workspace,
    campaign.caller_id
  from claimed
  join public.contact contact on contact.id = claimed.contact_id
  join public.campaign campaign on campaign.id = claimed.campaign_id;
end;
$function$;
