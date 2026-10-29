-- A queue row survives explicit re-adds. Each new intent gets its own identity;
-- claims, releases and uncertain provider retries retain that identity.
alter table public.campaign_queue
  add column if not exists dispatch_generation uuid not null default gen_random_uuid();
alter table public.campaign_queue
  add column if not exists redial_requested_at timestamptz;

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
  queue_id bigint,
  queue_generation uuid,
  operation_key text,
  user_id text,
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
  where operation_key is not null and state <> 'released';
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
