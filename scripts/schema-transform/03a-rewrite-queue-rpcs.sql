-- Phase 1 — step 03a: rewrite campaign_queue RPCs without legacy status column
-- Target: Railway review ONLY. Run after 03 backfill, before 03b-drop-queue-status.sql

BEGIN;

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
    queue_state = 'failed',
    dequeued_at = now(),
    assigned_to_user_id = null,
    provider_status = 'failed',
    claimed_at = null,
    dequeued_reason = coalesce(cq.dequeued_reason, 'Max queue attempts exceeded')
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

create or replace function public.get_campaign_queue(campaign_id_pro integer)
returns table (
  id integer,
  contact_id integer,
  phone text,
  workspace text,
  caller_id text
)
language plpgsql
as $function$
begin
  update public.campaign_queue
  set
    queue_state = 'dequeued',
    assigned_to_user_id = null,
    provider_status = null,
    dequeued_at = now(),
    dequeued_reason = 'Contact opted out'
  from public.contact
  where
    campaign_queue.contact_id = contact.id
    and campaign_queue.campaign_id = campaign_id_pro
    and (campaign_queue.queue_state is null or campaign_queue.queue_state = 'queued')
    and contact.opt_out = true;

  return query
  select distinct on (contact.phone)
    campaign_queue.id,
    contact.id as contact_id,
    contact.phone,
    contact.workspace,
    campaign.caller_id
  from public.campaign_queue
  join public.contact on campaign_queue.contact_id = contact.id
  join public.campaign on campaign_queue.campaign_id = campaign.id
  where
    campaign_queue.campaign_id = campaign_id_pro
    and campaign_queue.dequeued_at is null
    and (campaign_queue.queue_state is null or campaign_queue.queue_state = 'queued')
    and contact.phone is not null
    and contact.phone != ''
    and (contact.opt_out is null or contact.opt_out = false)
  order by
    contact.phone,
    campaign_queue.id
  limit 5;
end;
$function$;

create or replace function public.dequeue_contact(
  passed_contact_id integer,
  group_on_household boolean,
  dequeued_by_id uuid default null,
  dequeued_reason_text text default null
)
returns void
language plpgsql
as $function$
begin
  update public.campaign_queue
  set
    queue_state = 'dequeued',
    assigned_to_user_id = null,
    provider_status = null,
    dequeued_by = dequeued_by_id,
    dequeued_at = now(),
    dequeued_reason = dequeued_reason_text
  where contact_id = passed_contact_id
    and (queue_state is null or queue_state = 'queued');

  if group_on_household then
    update public.campaign_queue cq
    set
      queue_state = 'dequeued',
      assigned_to_user_id = null,
      provider_status = null,
      dequeued_by = dequeued_by_id,
      dequeued_at = now(),
      dequeued_reason = dequeued_reason_text
    from public.contact c1
    join public.contact c2 on c1.household_id is not null and c1.household_id = c2.household_id
    where
      c1.id = passed_contact_id
      and cq.contact_id = c2.id
      and (cq.queue_state is null or cq.queue_state = 'queued');
  end if;
end;
$function$;

create or replace function public.dequeue_household(
  contact_id_variable integer,
  dequeued_by_id uuid default null,
  dequeued_reason_text text default null
)
returns void
language plpgsql
as $function$
begin
  update public.campaign_queue cq
  set
    queue_state = 'dequeued',
    assigned_to_user_id = null,
    provider_status = null,
    dequeued_by = dequeued_by_id,
    dequeued_at = now(),
    dequeued_reason = dequeued_reason_text
  from public.contact c1
  join public.contact c2 on c1.household_id is not null and c1.household_id = c2.household_id
  where
    c1.id = contact_id_variable
    and cq.contact_id = c2.id
    and (cq.queue_state is null or cq.queue_state = 'queued');
end;
$function$;

create or replace function public.requeue_campaign_queue_contact(
  queue_id_pro integer,
  error_text text default null
)
returns text
language plpgsql
as $function$
declare
  current_attempts integer;
  policy record;
begin
  select * into policy from public.campaign_queue_policy();

  select cq.attempt_count
  into current_attempts
  from public.campaign_queue cq
  where cq.id = queue_id_pro
    and cq.dequeued_at is null;

  if not found then
    return 'not_found';
  end if;

  if current_attempts >= policy.max_attempts then
    perform public.fail_campaign_queue_contact(
      queue_id_pro,
      coalesce(error_text, 'Max dispatch attempts reached'),
      null
    );
    return 'failed_max_attempts';
  end if;

  update public.campaign_queue cq
  set
    queue_state = 'queued',
    assigned_to_user_id = null,
    provider_status = null,
    claimed_at = null,
    last_attempt_at = now(),
    last_attempt_error = error_text
  where cq.id = queue_id_pro
    and cq.dequeued_at is null;

  return 'requeued';
end;
$function$;

create or replace function public.fail_campaign_queue_contact(
  queue_id_pro integer,
  error_text text default null,
  dequeued_by_id uuid default null
)
returns void
language plpgsql
as $function$
begin
  update public.campaign_queue cq
  set
    queue_state = 'dequeued',
    assigned_to_user_id = null,
    provider_status = 'failed',
    claimed_at = null,
    dequeued_by = dequeued_by_id,
    dequeued_at = now(),
    dequeued_reason = coalesce(error_text, 'Permanent dispatch failure'),
    last_attempt_at = now(),
    last_attempt_error = error_text
  where cq.id = queue_id_pro
    and cq.dequeued_at is null;
end;
$function$;

create or replace function public.complete_campaign_queue_contact(
  queue_id_pro integer,
  dequeued_by_id uuid default null,
  reason_text text default 'Dispatched'
)
returns void
language plpgsql
as $function$
begin
  update public.campaign_queue cq
  set
    queue_state = 'dequeued',
    assigned_to_user_id = null,
    provider_status = null,
    claimed_at = null,
    dequeued_by = dequeued_by_id,
    dequeued_at = now(),
    dequeued_reason = coalesce(reason_text, 'Dispatched'),
    last_attempt_at = now(),
    last_attempt_error = null
  where cq.id = queue_id_pro
    and cq.dequeued_at is null;
end;
$function$;

create or replace function public.dequeue_duplicate_campaign_queue_contact(
  queue_id_pro integer,
  dequeued_by_id uuid default null,
  reason_text text default 'Duplicate SMS prevented'
)
returns void
language plpgsql
as $function$
begin
  update public.campaign_queue cq
  set
    queue_state = 'dequeued',
    assigned_to_user_id = null,
    provider_status = null,
    claimed_at = null,
    dequeued_by = dequeued_by_id,
    dequeued_at = now(),
    dequeued_reason = coalesce(reason_text, 'Duplicate SMS prevented'),
    last_attempt_at = now(),
    last_attempt_error = null
  where cq.id = queue_id_pro
    and cq.dequeued_at is null;
end;
$function$;

COMMIT;
