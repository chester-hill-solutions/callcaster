-- Scope create_outreach_attempt and get_campaign_attempts to the workspace.
--
-- Found in the 2026-10-21 security audit (issue #2885), reproduced end to end
-- against a real Postgres 18.
--
-- create_outreach_attempt stores the caller-supplied contact id and campaign
-- id in an outreach_attempt row stamped with the caller's OWN wks_id, with no
-- check that the contact or the campaign belong to that workspace.
-- get_campaign_attempts then reads those rows back filtered only on
-- oa.campaign_id, joining contact and campaign with no workspace predicate,
-- and returns that contact's name, phone, email, address and opt-out flag.
--
-- So a member of workspace A could post an arbitrary contact_id to
-- /api/questions under workspace A's own id, and then read workspace B's
-- contact record out of workspace A's own campaign export. The same unchecked
-- campaign_id let them store a row under workspace B's campaign, so the
-- injected row also rendered inside workspace B's export.
--
-- Both functions are dropped and recreated rather than edited in place: the
-- 20260722110000 / 20260807120000 bodies are already applied on deployed
-- databases, and there the version prefix decides whether a file runs at all
-- (AUTH_migrations.schema_migrations, public.client_migration_bootstrap).
--
-- create_outreach_attempt already receives wks_id, so it needs no new
-- parameter: it now refuses the insert unless the contact AND the campaign are
-- owned by that workspace. get_campaign_attempts gains the workspace, and
-- filters the attempt row and both joined tables on it, so a row that already
-- exists with a foreign contact can never be rendered.

-- The old one-argument signature would otherwise remain as a callable overload.
DROP FUNCTION IF EXISTS public.get_campaign_attempts(integer);

CREATE OR REPLACE FUNCTION public.create_outreach_attempt(con_id bigint, cam_id bigint, usr_id uuid, wks_id uuid, queue_id bigint) RETURNS bigint
    LANGUAGE plpgsql
    AS $$
DECLARE
  new_outreach_attempt_id bigint;
BEGIN
  -- The contact id is client-supplied and the export renders the joined
  -- contact. Stamping the row with wks_id is not enough on its own: the id
  -- itself has to belong to that workspace.
  IF NOT EXISTS (
    SELECT 1 FROM public.contact
    WHERE id = con_id
      AND workspace = wks_id
  ) THEN
    RAISE EXCEPTION 'create_outreach_attempt: contact % is not in workspace %', con_id, wks_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.campaign
    WHERE id = cam_id
      AND workspace = wks_id
  ) THEN
    RAISE EXCEPTION 'create_outreach_attempt: campaign % is not in workspace %', cam_id, wks_id
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO outreach_attempt (contact_id, campaign_id, user_id, workspace)
  VALUES (con_id, cam_id, usr_id, wks_id)
  RETURNING id INTO new_outreach_attempt_id;

  UPDATE campaign_queue
  SET attempts = attempts + 1
  WHERE id = queue_id
    AND workspace = wks_id;

  RETURN new_outreach_attempt_id;
END;
$$;

CREATE FUNCTION public.get_campaign_attempts(prop_workspace_id uuid, p_campaign_id integer) RETURNS TABLE(attempt_id bigint, disposition text, attempt_result jsonb, attempt_start timestamp with time zone, call_sid text, duration_seconds bigint, answered_by text, call_start timestamp with time zone, call_end timestamp with time zone, contact_id bigint, firstname text, surname text, phone text, email text, address text, city text, opt_out boolean, created_at timestamp with time zone, workspace uuid, postal text, other_data jsonb, province text, country text, campaign_name text, campaign_start_date timestamp with time zone, campaign_end_date timestamp with time zone, campaign_type text, campaign_status text, credits_used bigint)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        oa.id as attempt_id,
        COALESCE(oa.disposition, c.status::text) as disposition,
        oa.result as attempt_result,
        oa.created_at as attempt_start,
        c.sid as call_sid,
        COALESCE(NULLIF(c.duration, '')::bigint, 0) as duration_seconds,
        c.answered_by::text,
        COALESCE(c.start_time, c.date_created)::timestamptz as call_start,
        COALESCE(c.end_time, c.date_updated)::timestamptz as call_end,
        con.id as contact_id,
        con.firstname,
        con.surname,
        con.phone,
        con.email,
        con.address,
        con.city,
        con.opt_out,
        con.created_at,
        con.workspace,
        con.postal,
        con.other_data,
        con.province,
        con.country,
        camp.title as campaign_name,
        camp.start_date as campaign_start_date,
        camp.end_date as campaign_end_date,
        camp.type::text as campaign_type,
        camp.status::text as campaign_status,
        GREATEST(1, CEIL(COALESCE(NULLIF(c.duration, '')::numeric, 0) / 60))::bigint as credits_used
    FROM public.outreach_attempt oa
    JOIN contact con ON con.id = oa.contact_id
    JOIN campaign camp ON camp.id = oa.campaign_id
    LEFT JOIN public.call c ON c.outreach_attempt_id = oa.id
    WHERE oa.campaign_id = p_campaign_id
        -- Every side of the join is pinned to the caller's workspace, so an
        -- attempt row that already carries a foreign contact id is invisible
        -- here rather than rendered into the caller's own export.
        AND oa.workspace = prop_workspace_id
        AND con.workspace = prop_workspace_id
        AND camp.workspace = prop_workspace_id
        AND (camp.type != 'live_call' OR c.parent_call_sid is not null)
    ORDER BY attempt_start ASC;
END;
$$;
