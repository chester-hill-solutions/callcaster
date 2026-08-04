-- Dequeue metadata on campaign_queue (flattened from nested migration; idempotent for replay).
-- Previously lived at 20240326000000_add_dequeue_fields/migration.sql (ignored by Supabase CLI).

alter table public.campaign_queue add column if not exists dequeued_by uuid null;
alter table public.campaign_queue add column if not exists dequeued_at timestamptz null;
alter table public.campaign_queue add column if not exists dequeued_reason text null;

alter table public.campaign_queue
  drop constraint if exists campaign_queue_dequeued_by_fkey;

alter table public.campaign_queue
  add constraint campaign_queue_dequeued_by_fkey
  foreign key (dequeued_by)
  references public.user (id);

create index if not exists idx_campaign_queue_dequeued_at
  on public.campaign_queue (dequeued_at);

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
    dequeued_by = dequeued_by_id,
    dequeued_at = now(),
    dequeued_reason = dequeued_reason_text
  where contact_id = passed_contact_id;

  if group_on_household then
    update public.campaign_queue cq
    set
      status = 'dequeued',
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
      and cq.status = 'queued';
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
    status = 'dequeued',
    dequeued_by = dequeued_by_id,
    dequeued_at = now(),
    dequeued_reason = dequeued_reason_text
  from public.contact c1
  join public.contact c2
    on c1.address_id = c2.address_id
    and c1.address_id is not null
  where
    c1.id = contact_id_variable
    and cq.contact_id = c2.id
    and cq.status = 'queued';
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
    and contact.phone is not null
    and contact.phone != ''
    and (contact.opt_out is null or contact.opt_out = false)
  order by
    contact.phone,
    campaign_queue.id
  limit 5;
end;
$function$;
