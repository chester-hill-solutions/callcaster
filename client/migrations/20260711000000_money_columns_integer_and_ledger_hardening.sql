-- Migration: align integer-semantics columns with schema.ts, harden the ledger RPC
--
-- 1) The MONEY columns are declared integer() in app/db/schema.ts but were
--    created as `numeric` in the baseline. postgres.js returns numeric as a
--    STRING, and drizzle's integer() does no runtime re-parse, so app code
--    receives a string typed as number — `credits + delta` silently
--    string-concatenates. All existing values are whole (verified), so convert
--    to integer. Scoped to credits + amount here; the non-money count columns
--    (audience.total_contacts/processed_contacts = numeric,
--    audience_upload.* = bigint, campaign.dial_ratio = numeric-but-maybe-
--    fractional) carry the same string drift and are tracked as a separate
--    reconciliation — not bundled into a money migration.
--
-- 2) Harden apply_ledger_entry_and_sync_credits:
--    - reject a null/blank idempotency key (security definer + directly callable;
--      a blank key is not covered by the partial unique index, so every such call
--      would re-apply the credit delta).
--    - filter the conflict-loser lookup by `type` too, matching the unique key
--      (workspace, type, idempotency_key), so a key reused across types can't
--      return the wrong-type row.
--    No debit floor is added: post-paid call/SMS billing must record a debit even
--    when it drives the balance negative (service already rendered); the pre-paid
--    gates and the number-rental balance check handle affordability upstream.

BEGIN;

alter table public.workspace
  alter column credits type integer using round(credits)::integer;

alter table public.transaction_history
  alter column amount type integer using round(amount)::integer;

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
  v_key text := nullif(trim(p_idempotency_key), '');
begin
  -- A blank key would bypass the partial unique index and re-apply the delta on
  -- every call. All real callers pass a namespaced key; reject the rest.
  if v_key is null then
    raise exception 'apply_ledger_entry_and_sync_credits requires a non-empty idempotency_key';
  end if;

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
    v_key,
    p_campaign_id,
    p_call_sid,
    p_message_sid
  )
  on conflict (workspace, type, idempotency_key) where idempotency_key is not null do nothing
  returning
    transaction_history.id,
    transaction_history.amount,
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
    -- Conflict: a prior insert already won. Return the existing row, matching
    -- the full unique key (workspace, type, idempotency_key).
    select
      th.id,
      th.amount,
      th.type::text,
      th.idempotency_key,
      th.workspace
    into v_row
    from public.transaction_history th
    where th.workspace = p_workspace_id
      and th.type = p_type::public.transaction_type
      and th.idempotency_key = v_key
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
  'Atomic idempotent ledger insert + workspace.credits sync. Replaces the banned trigger (ADR-0006). Concurrency RPC per ADR-0003. Rejects blank keys; type-filtered loser lookup (2026-07-11).';

COMMIT;
