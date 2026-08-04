-- Slice 4: Billing correctness — credits sync via app-layer RPC, drop trigger.
-- ADR-0006 (no DB-side behavior logic): the trigger becomes a plpgsql concurrency
-- RPC (allowed by ADR-0003) that does atomic insert + credits update.

-- Enrich the ledger for better reconciliation / linkage to source entities.
alter table public.transaction_history
  add column if not exists campaign_id bigint;
alter table public.transaction_history
  add column if not exists call_sid text;
alter table public.transaction_history
  add column if not exists message_sid text;

-- Drop the banned trigger + function (ADR-0006). Credits sync moves to the RPC below.
drop trigger if exists transaction_history_update_credits on public.transaction_history;
drop function if exists public.transaction_history_update_credits();

-- Atomic ledger insert + workspace.credits sync.
-- ON CONFLICT (idempotency_key) DO NOTHING + xmax check lets the caller know
-- whether this call was the winner. Only the winner applies the credits delta.
create or replace function public.apply_ledger_entry_and_sync_credits(
  p_workspace_id uuid,
  p_type text,
  p_amount integer,
  p_idempotency_key text,
  p_description text default null,
  p_campaign_id bigint default null,
  p_call_sid text default null,
  p_message_sid text default null
)
returns table (
  id bigint,
  inserted boolean,
  amount integer,
  type text,
  idempotency_key text,
  workspace uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
begin
  insert into public.transaction_history (
    workspace,
    type,
    amount,
    note,
    idempotency_key,
    campaign_id,
    call_sid,
    message_sid
  )
  values (
    p_workspace_id,
    p_type,
    p_amount,
    p_description,
    nullif(trim(p_idempotency_key), ''),
    p_campaign_id,
    p_call_sid,
    p_message_sid
  )
  on conflict (workspace, type, idempotency_key) where idempotency_key is not null do nothing
  returning
    id,
    amount,
    type,
    idempotency_key,
    workspace
  into v_row;

  if v_row.id is not null then
    -- Winner of the idempotency race: apply the credits delta.
    update public.workspace
      set credits = coalesce(credits, 0) + p_amount
      where id = p_workspace_id;

    return query select
      v_row.id,
      true as inserted,
      v_row.amount,
      v_row.type,
      v_row.idempotency_key,
      v_row.workspace;
  else
    -- Conflict: a prior insert already won. Return the existing row.
    select
      th.id,
      th.amount,
      th.type,
      th.idempotency_key,
      th.workspace
    into v_row
    from public.transaction_history th
    where th.workspace = p_workspace_id
      and th.idempotency_key = p_idempotency_key
    order by th.created_at desc
    limit 1;

    return query select
      v_row.id,
      false as inserted,
      v_row.amount,
      v_row.type,
      v_row.idempotency_key,
      v_row.workspace;
  end if;
end;
$$;

comment on function public.apply_ledger_entry_and_sync_credits(
  uuid, text, integer, text, text, bigint, text, text
) is
  'Atomic idempotent ledger insert + workspace.credits sync. Replaces the banned trigger (ADR-0006). Concurrency RPC per ADR-0003.';
