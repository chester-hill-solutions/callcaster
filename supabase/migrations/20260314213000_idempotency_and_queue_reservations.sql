-- Blocker fixes: transaction history idempotency and DB-safe campaign queue ordering.

alter table public.transaction_history
  add column if not exists idempotency_key text;

create unique index if not exists idx_transaction_history_workspace_type_idempotency_key
  on public.transaction_history (workspace, type, idempotency_key)
  where idempotency_key is not null;

alter table public.campaign
  add column if not exists next_queue_order integer not null default 1;

update public.campaign c
set next_queue_order = greatest(c.next_queue_order, coalesce(q.max_order, 0) + 1)
from (
  select campaign_id, max(coalesce(queue_order, 0)) as max_order
  from public.campaign_queue
  group by campaign_id
) q
where c.id = q.campaign_id;

create or replace function public.reserve_campaign_queue_order_range(
  p_campaign_id integer,
  p_count integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_start integer;
begin
  v_count := greatest(coalesce(p_count, 0), 1);

  update public.campaign
  set next_queue_order = greatest(next_queue_order, 1) + v_count
  where id = p_campaign_id
  returning next_queue_order - v_count into v_start;

  if v_start is null then
    raise exception 'Campaign % not found while reserving queue order range', p_campaign_id;
  end if;

  return v_start;
end;
$$;

comment on function public.reserve_campaign_queue_order_range(integer, integer) is
  'Atomically reserves and returns the first queue_order in a contiguous range for a campaign.';
