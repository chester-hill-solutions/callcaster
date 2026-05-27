-- Campaign queue throughput: claim recovery, completion checks, bounded retries.

alter table public.campaign_queue
  add column if not exists claimed_at timestamptz null;

alter table public.campaign_queue
  add column if not exists attempt_count integer not null default 0;

alter table public.campaign_queue
  add column if not exists last_attempt_at timestamptz null;

alter table public.campaign_queue
  add column if not exists last_attempt_error text null;

create index if not exists campaign_queue_campaign_state_idx
  on public.campaign_queue (campaign_id, queue_state);

create index if not exists campaign_queue_campaign_assigned_user_idx
  on public.campaign_queue (campaign_id, assigned_to_user_id)
  where assigned_to_user_id is not null;

create or replace function public.reset_stale_campaign_queue_claims(
  campaign_id_pro integer,
  stale_after interval default interval '10 minutes'
)
returns integer
language plpgsql
as $function$
declare
  reset_count integer;
begin
  update public.campaign_queue cq
  set
    status = 'queued',
    queue_state = 'queued',
    assigned_to_user_id = null,
    provider_status = null,
    claimed_at = null,
    last_attempt_error = coalesce(cq.last_attempt_error, 'Stale claim reset')
  where cq.campaign_id = campaign_id_pro
    and cq.dequeued_at is null
    and cq.queue_state = 'assigned'
    and cq.claimed_at is not null
    and cq.claimed_at < now() - stale_after
    and cq.attempt_count < 5;

  get diagnostics reset_count = row_count;
  return reset_count;
end;
$function$;

create or replace function public.campaign_queue_has_pending_work(
  campaign_id_pro integer
)
returns boolean
language plpgsql
as $function$
declare
  pending_count integer;
begin
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
        and cq.claimed_at >= now() - interval '10 minutes'
      )
    );

  return pending_count > 0;
end;
$function$;

create or replace function public.claim_campaign_queue_contacts(
  campaign_id_pro integer,
  claimed_by_user_id uuid,
  claim_limit integer default 1
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
begin
  return query
  with candidates as (
    select cq.id
    from public.campaign_queue cq
    where cq.campaign_id = campaign_id_pro
      and cq.status = 'queued'
      and cq.dequeued_at is null
      and (cq.queue_state is null or cq.queue_state = 'queued')
      and cq.attempt_count < 5
    order by cq.id
    for update skip locked
    limit greatest(claim_limit, 1)
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
  join public.contact on claimed.contact_id = contact.id
  join public.campaign on claimed.campaign_id = campaign.id
  where contact.phone is not null
    and contact.phone != ''
  order by contact.phone, claimed.id;
end;
$function$;

create or replace function public.requeue_campaign_queue_contact(
  queue_id_pro integer,
  error_text text default null
)
returns void
language plpgsql
as $function$
begin
  update public.campaign_queue cq
  set
    status = 'queued',
    queue_state = 'queued',
    assigned_to_user_id = null,
    provider_status = null,
    claimed_at = null,
    last_attempt_at = now(),
    last_attempt_error = error_text
  where cq.id = queue_id_pro
    and cq.dequeued_at is null
    and cq.attempt_count < 5;
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
    status = 'dequeued',
    queue_state = 'dequeued',
    assigned_to_user_id = null,
    provider_status = 'failed',
    dequeued_by = dequeued_by_id,
    dequeued_at = now(),
    dequeued_reason = coalesce(error_text, 'Permanent dispatch failure'),
    last_attempt_at = now(),
    last_attempt_error = error_text
  where cq.id = queue_id_pro
    and cq.dequeued_at is null;
end;
$function$;

create or replace function public.count_active_ivr_campaign_calls(
  campaign_id_pro integer
)
returns integer
language sql
stable
as $$
  select count(*)::integer
  from public.call c
  where c.campaign_id = campaign_id_pro
    and c.end_time is null
    and coalesce(c.status, '') not in ('completed', 'failed', 'busy', 'no-answer', 'canceled', 'cancelled');
$$;
