-- Queue status normalization columns and atomic claim RPC (rollout phase 1).

alter table public.campaign_queue add column if not exists queue_state text null;
alter table public.campaign_queue add column if not exists assigned_to_user_id uuid null;
alter table public.campaign_queue add column if not exists provider_status text null;

update public.campaign_queue
set
  queue_state = case
    when dequeued_at is not null or status = 'dequeued' then 'dequeued'
    when status = 'queued' then 'queued'
    when status ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then 'assigned'
    else 'assigned'
  end,
  assigned_to_user_id = case
    when status ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then status::uuid
    else null
  end,
  provider_status = case
    when status in ('queued', 'dequeued') then null
    when status ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then null
    else status
  end
where queue_state is null
   or assigned_to_user_id is null
   or provider_status is null;

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
    status = 'dequeued',
    queue_state = 'dequeued',
    assigned_to_user_id = null,
    provider_status = null,
    dequeued_by = dequeued_by_id,
    dequeued_at = now(),
    dequeued_reason = dequeued_reason_text
  where contact_id = passed_contact_id
    and dequeued_at is null
    and status is distinct from 'dequeued';

  if group_on_household then
    update public.campaign_queue cq
    set
      status = 'dequeued',
      queue_state = 'dequeued',
      assigned_to_user_id = null,
      provider_status = null,
      dequeued_by = dequeued_by_id,
      dequeued_at = now(),
      dequeued_reason = dequeued_reason_text
    from public.contact c1
    join public.contact c2
      on c1.address_id = c2.address_id
      and c1.address_id is not null
    where
      c1.id = passed_contact_id
      and cq.contact_id = c2.id
      and cq.dequeued_at is null
      and cq.status = 'queued';
  end if;
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
      provider_status = null
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
    status = 'dequeued',
    queue_state = 'dequeued',
    assigned_to_user_id = null,
    provider_status = null,
    dequeued_at = now(),
    dequeued_reason = 'Contact opted out'
  from public.contact
  where
    campaign_queue.contact_id = contact.id
    and campaign_queue.campaign_id = campaign_id_pro
    and campaign_queue.status = 'queued'
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
    and campaign_queue.status = 'queued'
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
