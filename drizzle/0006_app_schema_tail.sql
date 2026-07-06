-- Post-baseline app schema: columns/tables referenced by Drizzle but absent from 0000.
-- Idempotent; safe to re-run on compose bootstrap.

-- ADR-0019: support_level on contact + outreach_attempt
ALTER TABLE public.outreach_attempt
  ADD COLUMN IF NOT EXISTS support_level smallint
  CHECK (support_level IS NULL OR support_level BETWEEN 1 AND 5);

ALTER TABLE public.contact
  ADD COLUMN IF NOT EXISTS support_level smallint
  CHECK (support_level IS NULL OR support_level BETWEEN 1 AND 5);

CREATE INDEX IF NOT EXISTS contact_support_level_idx
  ON public.contact (support_level)
  WHERE support_level IS NOT NULL;

-- ADR-0023: voter list lifecycle on contact
DO $$ BEGIN
  CREATE TYPE public.voter_list_source AS ENUM (
    'liberalist',
    'van',
    'elections_canada',
    'elections_ontario',
    'manual',
    'other'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.contact
  ADD COLUMN IF NOT EXISTS voter_list_source public.voter_list_source;

ALTER TABLE public.contact
  ADD COLUMN IF NOT EXISTS voter_list_imported_at timestamptz;

ALTER TABLE public.contact
  ADD COLUMN IF NOT EXISTS voter_list_expires_at timestamptz;

ALTER TABLE public.contact
  ADD COLUMN IF NOT EXISTS voter_id text;

CREATE INDEX IF NOT EXISTS contact_voter_list_expires_at_idx
  ON public.contact (voter_list_expires_at)
  WHERE voter_list_expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS contact_voter_id_idx
  ON public.contact (voter_id)
  WHERE voter_id IS NOT NULL;

-- ADR-0004: workspace tenancy on campaign_queue
ALTER TABLE public.campaign_queue
  ADD COLUMN IF NOT EXISTS workspace uuid;

UPDATE public.campaign_queue cq
SET workspace = c.workspace
FROM public.campaign c
WHERE cq.campaign_id = c.id
  AND cq.workspace IS NULL;

DELETE FROM public.campaign_queue
WHERE id IN (
  SELECT id
  FROM (
    SELECT
      id,
      row_number() OVER (
        PARTITION BY campaign_id, contact_id
        ORDER BY id ASC
      ) AS rn
    FROM public.campaign_queue
  ) ranked
  WHERE rn > 1
);

DO $$ BEGIN
  ALTER TABLE public.campaign_queue
    ALTER COLUMN workspace SET NOT NULL;
EXCEPTION
  WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.campaign_queue
    ADD CONSTRAINT campaign_queue_workspace_fkey
    FOREIGN KEY (workspace) REFERENCES public.workspace(id)
    ON UPDATE CASCADE ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.campaign_queue
    ADD CONSTRAINT campaign_queue_campaign_contact_unique
    UNIQUE (campaign_id, contact_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN duplicate_table THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.set_campaign_queue_workspace()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF new.workspace IS NULL OR (tg_op = 'UPDATE' AND new.campaign_id IS DISTINCT FROM old.campaign_id) THEN
    SELECT workspace INTO new.workspace
    FROM public.campaign
    WHERE id = new.campaign_id;
  END IF;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS campaign_queue_set_workspace ON public.campaign_queue;

CREATE TRIGGER campaign_queue_set_workspace
  BEFORE INSERT OR UPDATE ON public.campaign_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.set_campaign_queue_workspace();

-- Inbound queue routing (RLS omitted — ADR-0004 app-layer tenancy)
DO $$ BEGIN
  CREATE TYPE public.queue_entry_state AS ENUM (
    'queued', 'offered', 'accepted', 'declined', 'timed_out', 'abandoned', 'completed'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.inbound_queue (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspace(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  hold_audio text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inbound_queue_workspace_idx
  ON public.inbound_queue(workspace_id);

CREATE TABLE IF NOT EXISTS public.inbound_queue_member (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  queue_id bigint NOT NULL REFERENCES public.inbound_queue(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspace(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (queue_id, user_id)
);

CREATE INDEX IF NOT EXISTS inbound_queue_member_queue_idx
  ON public.inbound_queue_member(queue_id);

CREATE INDEX IF NOT EXISTS inbound_queue_member_user_idx
  ON public.inbound_queue_member(user_id);

CREATE TABLE IF NOT EXISTS public.inbound_queue_entry (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  queue_id bigint NOT NULL REFERENCES public.inbound_queue(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspace(id) ON DELETE CASCADE,
  call_sid text,
  caller_number text,
  status public.queue_entry_state NOT NULL DEFAULT 'queued',
  offered_to_user_id uuid REFERENCES public."user"(id) ON DELETE SET NULL,
  offered_at timestamptz,
  accepted_at timestamptz,
  completed_at timestamptz,
  abandoned_at timestamptz,
  twilio_queue_sid text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inbound_queue_entry_queue_status_idx
  ON public.inbound_queue_entry(queue_id, status)
  WHERE status IN ('queued', 'offered');

CREATE INDEX IF NOT EXISTS inbound_queue_entry_workspace_idx
  ON public.inbound_queue_entry(workspace_id);

ALTER TABLE public.workspace_number
  ADD COLUMN IF NOT EXISTS inbound_queue_id bigint
  REFERENCES public.inbound_queue(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS workspace_number_inbound_queue_idx
  ON public.workspace_number(inbound_queue_id)
  WHERE inbound_queue_id IS NOT NULL;

ALTER TABLE public.workspace_number
  ADD COLUMN IF NOT EXISTS inbound_script_id bigint
  REFERENCES public.script(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS workspace_number_inbound_script_id_idx
  ON public.workspace_number(inbound_script_id);

-- Queue claim RPC uses normalized queue_state (no legacy status column)
CREATE OR REPLACE FUNCTION public.claim_next_queue_contact(
  campaign_id_variable integer,
  user_id_variable uuid
) RETURNS TABLE(contact_id integer, queue_id integer, caller_id text, contact_phone text)
LANGUAGE plpgsql
AS $$
DECLARE
  v_contact_id INT;
  v_queue_id INT;
  v_caller_id TEXT;
  v_contact_phone TEXT;
  v_lock_key BIGINT;
BEGIN
  v_lock_key := hashtext('claim_queue:' || campaign_id_variable::text);
  PERFORM pg_advisory_lock(v_lock_key);

  SELECT cq.contact_id, cq.id AS queue_id, ca.caller_id, c.phone
  INTO v_contact_id, v_queue_id, v_caller_id, v_contact_phone
  FROM campaign_queue cq
  JOIN contact c ON cq.contact_id = c.id
  JOIN campaign ca ON cq.campaign_id = ca.id
  WHERE cq.queue_state = 'queued'
    AND cq.dequeued_at IS NULL
    AND cq.campaign_id = campaign_id_variable
    AND c.phone IS NOT NULL
    AND c.phone != ''
  ORDER BY cq.queue_order ASC, cq.id ASC, cq.attempts DESC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_queue_id IS NOT NULL THEN
    UPDATE campaign_queue
    SET assigned_to_user_id = user_id_variable,
        claimed_at = now(),
        attempts = attempts + 1,
        queue_state = 'assigned'
    WHERE id = v_queue_id
      AND queue_state = 'queued'
      AND dequeued_at IS NULL;
  END IF;

  PERFORM pg_advisory_unlock(v_lock_key);

  RETURN QUERY SELECT v_contact_id, v_queue_id, v_caller_id, v_contact_phone;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS campaign_queue_unique_assigned_contact
  ON public.campaign_queue (campaign_id, contact_id)
  WHERE queue_state = 'assigned';

-- ADR-0022: typed voter contact results on outreach_attempt
ALTER TABLE public.outreach_attempt
  ADD COLUMN IF NOT EXISTS volunteer_interest text;

ALTER TABLE public.outreach_attempt
  ADD COLUMN IF NOT EXISTS lawn_sign boolean;

ALTER TABLE public.outreach_attempt
  ADD COLUMN IF NOT EXISTS vote_by_mail boolean;

ALTER TABLE public.outreach_attempt
  ADD COLUMN IF NOT EXISTS issue_tags text[];

ALTER TABLE public.outreach_attempt
  ADD COLUMN IF NOT EXISTS membership_sold boolean;

ALTER TABLE public.outreach_attempt
  ADD COLUMN IF NOT EXISTS callback_audit boolean;

CREATE INDEX IF NOT EXISTS outreach_attempt_issue_tags_idx
  ON public.outreach_attempt USING gin (issue_tags)
  WHERE issue_tags IS NOT NULL;
