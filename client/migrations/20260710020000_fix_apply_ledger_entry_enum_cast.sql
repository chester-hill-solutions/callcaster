-- Migration: Fix apply_ledger_entry_and_sync_credits enum casts (ADR-0006 follow-up)
-- The 20260704000004 version inserted the text parameter p_type straight into
-- transaction_history.type (enum transaction_type), so every call failed with
-- 42804 ("column \"type\" is of type transaction_type but expression is of type
-- text"). Cast on insert, and cast the returned enum/numeric columns back to
-- the declared text/integer RETURNS TABLE contract (transaction_history.amount
-- is numeric in the database but integer in the app schema and this RPC).

BEGIN;

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
#variable_conflict use_column
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
    p_type::public.transaction_type,
    p_amount,
    p_description,
    nullif(trim(p_idempotency_key), ''),
    p_campaign_id,
    p_call_sid,
    p_message_sid
  )
  on conflict (workspace, type, idempotency_key) where idempotency_key is not null do nothing
  returning
    transaction_history.id,
    transaction_history.amount::integer,
    transaction_history.type::text,
    transaction_history.idempotency_key,
    transaction_history.workspace
  into v_row;

  if v_row.id is not null then
    -- Winner of the idempotency race: apply the credits delta.
    update public.workspace
      set credits = coalesce(credits, 0) + p_amount
      where public.workspace.id = p_workspace_id;

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
      th.amount::integer,
      th.type::text,
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
  'Atomic idempotent ledger insert + workspace.credits sync. Replaces the banned trigger (ADR-0006). Concurrency RPC per ADR-0003. Enum casts fixed 2026-07-10.';

COMMIT;
