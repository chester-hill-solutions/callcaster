-- A queue row survives explicit re-adds. Each new intent gets its own identity;
-- claims, releases and uncertain provider retries retain that identity.
alter table public.campaign_queue
  add column if not exists dispatch_generation uuid not null default gen_random_uuid();
alter table public.campaign_queue
  add column if not exists redial_requested_at timestamptz;
alter table public.campaign_queue
  add column if not exists voice_reservation_id uuid;

create table if not exists public.workspace_voice_reservation (
  id uuid primary key,
  workspace uuid not null references public.workspace(id) on delete cascade,
  kind text not null check (kind in ('ivr', 'staffed')),
  credits integer not null check (credits > 0),
  account_sid text not null,
  recipient text not null,
  caller_id text not null,
  campaign_id bigint,
  contact_id bigint,
  outreach_attempt_id bigint,
  requested_outreach_attempt_id bigint,
  queue_id bigint,
  queue_generation uuid,
  operation_key text,
  user_id text,
  setup_to text,
  setup_client_identity text,
  conference_id text,
  conference_sid text,
  predictive_operation_id uuid,
  setup_voice_url text,
  setup_status_callback text,
  recipient_instruction_issued_at timestamptz,
  recipient_refused_at timestamptz,
  setup_terminal_at timestamptz,
  setup_terminal_status text,
  terminal_status text,
  terminal_duration text,
  voice_url text,
  status_callback text,
  state text not null default 'reserved'
    check (state in ('reserved', 'creating', 'active', 'settled', 'released')),
  provider_sid text,
  setup_sid text,
  lease_token uuid not null,
  lease_expires_at timestamptz not null,
  send_started_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_voice_reservation_sdk_setup
    check (setup_client_identity is null or (setup_client_identity <> '' and kind = 'staffed' and setup_to is not null and setup_to = '' and user_id is not null and conference_id is null)),
  constraint workspace_voice_reservation_queue_generation
    check ((queue_id is null) = (queue_generation is null))
);

create unique index if not exists workspace_voice_reservation_provider_sid
  on public.workspace_voice_reservation(provider_sid) where provider_sid is not null;
create unique index if not exists workspace_voice_reservation_setup_sid
  on public.workspace_voice_reservation(setup_sid) where setup_sid is not null;
create index if not exists workspace_voice_reservation_funding
  on public.workspace_voice_reservation(workspace)
  where state in ('reserved', 'creating', 'active');
create unique index if not exists workspace_voice_reservation_active_queue
  on public.workspace_voice_reservation(workspace, queue_id)
  where queue_id is not null and state in ('reserved', 'creating', 'active');
create unique index if not exists workspace_voice_reservation_operation
  on public.workspace_voice_reservation(workspace, operation_key)
  where operation_key is not null and (state <> 'released' or setup_sid is not null or provider_sid is not null);
create index if not exists workspace_voice_reservation_recovery
  on public.workspace_voice_reservation(lease_expires_at)
  where state in ('reserved', 'creating', 'active');

-- Extend the existing concurrency RPC; no behavior trigger is introduced.
CREATE OR REPLACE FUNCTION public.handle_campaign_queue_entry(
  p_contact_id bigint,
  p_campaign_id bigint,
  p_queue_order bigint DEFAULT NULL::bigint,
  p_requeue boolean DEFAULT false
)
RETURNS bigint
LANGUAGE plpgsql
AS $function$
DECLARE
    v_existing_id bigint;
    v_existing_live boolean;
    v_new_order bigint;
BEGIN
    -- Any existing entry for this contact/campaign (the UNIQUE constraint means
    -- there is at most one), plus whether it is currently live.
    SELECT id, ((queue_state IS NULL OR queue_state IN ('queued', 'assigned')) AND dequeued_at IS NULL)
      INTO v_existing_id, v_existing_live
    FROM campaign_queue
    WHERE contact_id = p_contact_id
      AND campaign_id = p_campaign_id
    FOR NO KEY UPDATE;

    -- Live entry and not requeueing: reuse it as-is.
    IF v_existing_id IS NOT NULL AND v_existing_live AND NOT p_requeue THEN
        RETURN v_existing_id;
    END IF;

    -- Next queue order if not supplied.
    IF p_queue_order IS NULL THEN
        SELECT COALESCE(MAX(queue_order), 0) + 1 INTO v_new_order
        FROM campaign_queue
        WHERE campaign_id = p_campaign_id;
    ELSE
        v_new_order := p_queue_order;
    END IF;

    -- Existing row that is terminal, or an explicit requeue: reactivate it in
    -- place. INSERT is impossible here — UNIQUE (campaign_id, contact_id) would
    -- reject it — so this branch is what makes re-adding a dequeued contact work.
    IF v_existing_id IS NOT NULL THEN
        UPDATE campaign_queue
        SET queue_state = 'queued',
            dispatch_generation = gen_random_uuid(),
            redial_requested_at = clock_timestamp(),
            queue_order = v_new_order::integer,
            attempts = 0,
            -- A row going back into the pool is held by nobody. Without this,
            -- findActiveAssignedQueueForUser keeps handing the previous holder
            -- a contact anyone can now claim. `claimed_at` is the SMS-side
            -- equivalent of the same fact (#2208): a requeued row is not in
            -- flight, so a live claim on it would be a lie.
            assigned_to_user_id = NULL,
            provider_status = NULL,
            claimed_at = NULL,
            dequeued_at = NULL,
            dequeued_by = NULL,
            dequeued_reason = NULL
        WHERE id = v_existing_id
        RETURNING id INTO v_existing_id;

        RETURN v_existing_id;
    END IF;

    -- No existing row: insert a fresh one (workspace set by the BEFORE trigger).
    INSERT INTO campaign_queue
        (contact_id, campaign_id, queue_order, attempts, queue_state)
    VALUES
        (p_contact_id, p_campaign_id, v_new_order, 0, 'queued')
    RETURNING id INTO v_existing_id;

    RETURN v_existing_id;
END;
$function$;


-- Explicit campaign reset creates new intents without deleting funded owners.
CREATE OR REPLACE FUNCTION public.reset_campaign(campaign_id_prop integer)
 RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER
AS $function$
BEGIN
    UPDATE public.campaign
    SET status = 'paused'
    WHERE id = campaign_id_prop;

    UPDATE public.campaign_queue cq
    SET queue_state = 'queued',
        dispatch_generation = gen_random_uuid(),
        redial_requested_at = clock_timestamp(),
        assigned_to_user_id = NULL,
        provider_status = NULL,
        claimed_at = NULL,
        attempts = 0,
        attempt_count = 0,
        last_attempt_at = NULL,
        last_attempt_error = NULL,
        dequeued_at = NULL,
        dequeued_by = NULL,
        dequeued_reason = NULL
    WHERE cq.campaign_id = campaign_id_prop
      AND cq.workspace = (SELECT workspace FROM public.campaign WHERE id = campaign_id_prop);

    -- A funded call can still deliver a status callback after reset. Keep its
    -- outreach/call context, including settled SID idempotency evidence.
    DELETE FROM public.outreach_attempt oa
    WHERE oa.campaign_id = campaign_id_prop
      AND oa.workspace = (SELECT workspace FROM public.campaign WHERE id = campaign_id_prop)
      AND NOT EXISTS (
        SELECT 1 FROM public.workspace_voice_reservation r
        WHERE r.workspace = oa.workspace AND r.outreach_attempt_id = oa.id
          AND r.state <> 'released'
      );
END;
$function$;

-- Funded terminal outcomes extend the canonical household operation. Legacy
-- callers keep the six-argument/default contract and its assigned-agent guard.
DROP FUNCTION IF EXISTS public.dequeue_contact(bigint, bigint, boolean, uuid, uuid, text);
CREATE OR REPLACE FUNCTION public.dequeue_contact(
  passed_contact_id bigint,
  p_campaign_id bigint,
  group_on_household boolean,
  p_workspace uuid,
  dequeued_by_id uuid DEFAULT NULL::uuid,
  dequeued_reason_text text DEFAULT NULL::text,
  p_voice_reservation_id uuid DEFAULT NULL::uuid
)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
declare
  primary_rows integer;
  funded public.workspace_voice_reservation%rowtype;
  locked_queue_ids bigint[];
begin
  if p_voice_reservation_id is not null then
    -- Match admission's workspace-first lock order. Concurrent new funded
    -- intents cannot enter a household while its terminal update runs.
    perform 1 from public.workspace where id = p_workspace for no key update;
    select * into funded from public.workspace_voice_reservation
    where id = p_voice_reservation_id and workspace = p_workspace
      and campaign_id = p_campaign_id and contact_id = passed_contact_id;
    if not found or funded.queue_id is null or funded.queue_generation is null then return 0; end if;

    -- Lock the full candidate set in a stable order. A later insert is not
    -- in this set; a concurrent re-add is checked again after its row lock.
    select array_agg(candidate.id) into locked_queue_ids from (
      select cq.id from public.campaign_queue cq
      join public.contact c on c.id = cq.contact_id and c.workspace = p_workspace
      where cq.workspace = p_workspace and cq.campaign_id = p_campaign_id
        and (c.id = passed_contact_id or (group_on_household and c.household_id = (
          select household_id from public.contact where id = passed_contact_id and workspace = p_workspace
        )))
      order by cq.id for no key update of cq
    ) candidate;
    select assigned_to_user_id into dequeued_by_id from public.campaign_queue
    where id = funded.queue_id and workspace = p_workspace;
  end if;
  update public.campaign_queue
  set
    queue_state = 'dequeued',
    assigned_to_user_id = null,
    provider_status = null,
    dequeued_by = dequeued_by_id,
    dequeued_at = now(),
    dequeued_reason = dequeued_reason_text
  where contact_id = passed_contact_id
    and workspace = p_workspace
    and campaign_id = p_campaign_id
    and (p_voice_reservation_id is null or (
      id = funded.queue_id and id = any(locked_queue_ids)
      and dispatch_generation = funded.queue_generation
      and voice_reservation_id = funded.id and dequeued_at is null
    ))
    and (
      queue_state is null
      or queue_state = 'queued'
      or (
        queue_state = 'assigned'
        and dequeued_by_id is not null
        and assigned_to_user_id = dequeued_by_id
      )
    );

  get diagnostics primary_rows = row_count;

  if p_voice_reservation_id is not null and primary_rows = 0 then return 0; end if;

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
      and c1.workspace = p_workspace
      and c2.workspace = p_workspace
      and cq.contact_id = c2.id
      and cq.workspace = p_workspace
      and cq.campaign_id = p_campaign_id
      and (p_voice_reservation_id is null or (
        cq.id = any(locked_queue_ids) and cq.dequeued_at is null
        and cq.created_at <= funded.created_at
        and coalesce(cq.redial_requested_at, cq.created_at) <= funded.created_at
        and (cq.voice_reservation_id is null or exists (
          select 1 from public.workspace_voice_reservation sibling
          where sibling.id = cq.voice_reservation_id and sibling.workspace = p_workspace
            and sibling.created_at <= funded.created_at and sibling.state in ('settled', 'released')
        ))
      ))
      -- A wrong campaign must not dequeue siblings of an absent primary row.
      and exists (
        select 1 from public.campaign_queue source_queue
        where source_queue.contact_id = passed_contact_id
          and source_queue.workspace = p_workspace
          and source_queue.campaign_id = p_campaign_id
      )
      and (
        cq.queue_state is null
        or cq.queue_state = 'queued'
        or (
          cq.queue_state = 'assigned'
          and dequeued_by_id is not null
          and cq.assigned_to_user_id = dequeued_by_id
        )
      );
  end if;

  return primary_rows;
end;
$function$;


-- A funded or uncertain provider send remains pending after its queue lease ages.
CREATE OR REPLACE FUNCTION public.fail_exhausted_campaign_queue_contacts(campaign_id_pro integer) RETURNS integer
    LANGUAGE plpgsql
    AS $$
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
    and cq.queue_state in ('queued', 'assigned', 'failed')
    and not exists (
      select 1 from public.workspace_voice_reservation r
      where r.workspace = cq.workspace and r.queue_id = cq.id
        and r.state in ('reserved', 'creating', 'active')
    );

  get diagnostics failed_count = row_count;
  return failed_count;
end;
$$;

CREATE OR REPLACE FUNCTION public.campaign_queue_has_pending_work(campaign_id_pro integer, stale_after interval DEFAULT NULL::interval) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
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

  return pending_count > 0 or exists (
    select 1 from public.workspace_voice_reservation r
    where r.campaign_id = campaign_id_pro
      and r.workspace = (select workspace from public.campaign where id = campaign_id_pro)
      and r.state in ('reserved', 'creating', 'active')
  );
end;
$$;

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
      select 1 from public.workspace_voice_reservation r
      where r.workspace = cq.workspace and r.queue_id = cq.id
        and r.state in ('reserved', 'creating', 'active')
    )
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
