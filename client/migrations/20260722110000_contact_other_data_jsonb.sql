-- contact.other_data → plain jsonb (a single JSON array).
--
-- Pre-state (0000_baseline): `other_data jsonb[] DEFAULT '{}'::jsonb[] NOT NULL`
-- — a Postgres ARRAY of jsonb values, not a JSON array. Note the app's
-- hand-synced app/db/schema.ts had drifted and declared it `text` (hand-
-- maintained-list drift); this migration is written to converge from any of
-- the three observed pre-states (jsonb[], text, or already-converted jsonb).
--
-- Why: every writer passes a raw JS array of single-key objects
-- (e.g. [{"Company": "Acme"}]) and every reader wants that array back.
-- The jsonb[] column made drizzle/pg round-trips inconsistent (readers that
-- JSON.parse got arrays-of-objects or strings depending on path), and the
-- `get_campaign_*_chunk` RPCs already declare `other_data jsonb` while
-- selecting the jsonb[] column — a latent runtime type mismatch that this
-- conversion fixes.
--
-- Consequences handled here:
--   * get_campaign_attempts / get_campaign_calls / get_campaign_messages
--     declared `other_data jsonb[]` in RETURNS TABLE; a changed return type
--     cannot be CREATE OR REPLACEd, so they are dropped and recreated with
--     `other_data jsonb` (bodies otherwise identical to baseline).
--   * get_outreach_data_column_definitions / _names / _structure and
--     get_pivoted_outreach_data used `unnest(c.other_data)` (array-only);
--     replaced with `jsonb_array_elements(...)` via CREATE OR REPLACE
--     (return types unchanged).
--   * Functions returning SETOF public.contact track the rowtype
--     automatically and need no changes.
--
-- Safety / idempotency:
--   * The type change is gated on information_schema so re-running against a
--     database where the column is already jsonb is a no-op.
--   * jsonb[] pre-state converts via to_jsonb(): '{}'::jsonb[] → '[]',
--     ARRAY['{"a":1}'::jsonb] → '[{"a":1}]'.
--   * text pre-state converts via a guarded cast helper that collapses
--     invalid-JSON / NULL / blank rows to '[]' instead of aborting.
--   * SET DEFAULT / SET NOT NULL and the function recreations are idempotent.

BEGIN;

CREATE OR REPLACE FUNCTION public.try_cast_jsonb(input text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF input IS NULL OR btrim(input) = '' THEN
    RETURN '[]'::jsonb;
  END IF;
  RETURN input::jsonb;
EXCEPTION WHEN others THEN
  RETURN '[]'::jsonb;
END;
$$;

DO $$
DECLARE
  v_type text;
BEGIN
  SELECT data_type INTO v_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'contact'
    AND column_name = 'other_data';

  IF v_type = 'ARRAY' THEN
    -- Real baseline pre-state: jsonb[]. The old '{}'::jsonb[] default cannot
    -- be auto-cast to jsonb, so drop it before the type change (the new
    -- default is set unconditionally below).
    ALTER TABLE public.contact ALTER COLUMN other_data DROP DEFAULT;
    ALTER TABLE public.contact
      ALTER COLUMN other_data TYPE jsonb
      USING to_jsonb(other_data);
  ELSIF v_type = 'text' THEN
    ALTER TABLE public.contact ALTER COLUMN other_data DROP DEFAULT;
    ALTER TABLE public.contact
      ALTER COLUMN other_data TYPE jsonb
      USING public.try_cast_jsonb(other_data);
  END IF;
  -- v_type = 'jsonb': already converted; nothing to do.
END;
$$;

DROP FUNCTION public.try_cast_jsonb(text);

ALTER TABLE public.contact
  ALTER COLUMN other_data SET DEFAULT '[]'::jsonb;

ALTER TABLE public.contact
  ALTER COLUMN other_data SET NOT NULL;

-- ─── RPCs whose RETURNS TABLE declared other_data jsonb[] ─────────────────
-- Return-type changes require DROP + CREATE (OR REPLACE refuses them).

DROP FUNCTION IF EXISTS public.get_campaign_attempts(integer);

CREATE FUNCTION public.get_campaign_attempts(p_campaign_id integer) RETURNS TABLE(attempt_id bigint, disposition text, attempt_result jsonb, attempt_start timestamp with time zone, call_sid text, duration_seconds bigint, answered_by text, call_start timestamp with time zone, call_end timestamp with time zone, contact_id bigint, firstname text, surname text, phone text, email text, address text, city text, opt_out boolean, created_at timestamp with time zone, workspace uuid, postal text, other_data jsonb, province text, country text, campaign_name text, campaign_start_date timestamp with time zone, campaign_end_date timestamp with time zone, campaign_type text, campaign_status text, credits_used bigint)
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
        AND (camp.type != 'live_call' OR c.parent_call_sid is not null)
    ORDER BY attempt_start ASC;
END;
$$;

DROP FUNCTION IF EXISTS public.get_campaign_calls(uuid, bigint);

CREATE FUNCTION public.get_campaign_calls(prop_workspace_id uuid, prop_campaign_id bigint) RETURNS TABLE(call_sid text, call_status public.call_status, call_direction text, call_duration integer, answered_by public.answered_by, recording_url text, call_start timestamp with time zone, call_end timestamp with time zone, attempt_id bigint, disposition text, attempt_result jsonb, current_step text, contact_id bigint, firstname text, surname text, phone text, email text, address text, city text, opt_out boolean, created_at timestamp with time zone, workspace text, postal text, other_data jsonb, province text, country text, campaign_name text, campaign_start_date timestamp with time zone, campaign_end_date timestamp with time zone, campaign_type public.campaign_type, campaign_status public.campaign_status)
    LANGUAGE sql STABLE
    AS $$
    SELECT
        c.sid as call_sid,
        c.status as call_status,
        c.direction as call_direction,
        c.call_duration,
        c.answered_by,
        c.recording_url,
        COALESCE(c.start_time, c.date_created)::timestamp with time zone as call_start,
        COALESCE(c.end_time, c.date_updated)::timestamp with time zone as call_end,
        oa.id as attempt_id,
        oa.disposition,
        oa.result as attempt_result,
        oa.current_step,
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
        camp.type as campaign_type,
        camp.status as campaign_status
        FROM public.call c
    JOIN campaign camp ON camp.id = c.campaign_id
        AND (camp.type != 'live_call' OR c.parent_call_sid is not null)
    JOIN outreach_attempt oa ON oa.id = c.outreach_attempt_id
    JOIN contact con ON con.id = c.contact_id
    WHERE c.workspace = prop_workspace_id
        AND c.campaign_id = prop_campaign_id
    ORDER BY call_start ASC;
$$;

DROP FUNCTION IF EXISTS public.get_campaign_messages(uuid, integer);

CREATE FUNCTION public.get_campaign_messages(prop_workspace_id uuid, prop_campaign_id integer) RETURNS TABLE(body text, direction text, status text, message_date timestamp without time zone, id integer, firstname text, surname text, phone text, email text, address text, city text, opt_out boolean, created_at timestamp without time zone, workspace text, external_id text, address_id text, postal text, other_data jsonb, date_updated timestamp without time zone, carrier text, province text, country text, created_by text, contact_phone text, campaign_name text, campaign_start_date timestamp without time zone, campaign_end_date timestamp without time zone)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    -- Get campaign dates once to avoid repeated lookups
    WITH campaign_info AS (
        SELECT
            id,
            title,
            start_date,
            end_date + INTERVAL '5 days' AS extended_end_date,
            end_date
        FROM public.campaign
        WHERE id = prop_campaign_id
    ),
    -- Get relevant contacts from campaign queue first (much smaller subset)
    campaign_contacts AS (
        SELECT
            c.*,
            REGEXP_REPLACE(c.phone, '[^0-9]', '', 'g') AS clean_phone,
            SUBSTR(REGEXP_REPLACE(c.phone, '[^0-9]', '', 'g'), 2) AS clean_phone_no_country,
            CONCAT('1', REGEXP_REPLACE(c.phone, '[^0-9]', '', 'g')) AS clean_phone_with_country
        FROM public.contact c
        JOIN public.campaign_queue cq ON c.id = cq.contact_id AND cq.campaign_id = prop_campaign_id
        WHERE c.workspace = prop_workspace_id
    ),
    -- Get pre-filtered messages using campaign dates
    filtered_messages AS (
        SELECT
            m.*,
            REGEXP_REPLACE(m."from", '[^0-9]', '', 'g') AS clean_from,
            REGEXP_REPLACE(m."to", '[^0-9]', '', 'g') AS clean_to,
            COALESCE(m.date_sent, m.date_created) as message_date
        FROM public.message m, campaign_info ci
        WHERE
            m.workspace = prop_workspace_id
            AND m.date_created >= ci.start_date
            AND m.date_created <= ci.extended_end_date
    )
    SELECT
        m.body,
        m.direction,
        m.status,
        m.message_date,
        cc.id,
        cc.firstname,
        cc.surname,
        cc.phone,
        cc.email,
        cc.address,
        cc.city,
        cc.opt_out,
        cc.created_at,
        cc.workspace,
        cc.external_id,
        -- contact.address_id / contact.carrier no longer exist; the baseline
        -- dump created this function unvalidated (check_function_bodies=false)
        -- so the stale references only blew up at call time. Keep the return
        -- shape, return NULLs.
        NULL::text AS address_id,
        cc.postal,
        cc.other_data,
        cc.date_updated,
        NULL::text AS carrier,
        cc.province,
        cc.country,
        cc.created_by,
        cc.clean_phone as contact_phone,
        ci.title as campaign_name,
        ci.start_date as campaign_start_date,
        ci.end_date as campaign_end_date
    FROM filtered_messages m
    JOIN campaign_info ci ON 1=1
    JOIN campaign_contacts cc ON (
        cc.clean_phone = m.clean_from
        OR cc.clean_phone = m.clean_to
        OR cc.clean_phone_no_country = m.clean_from
        OR cc.clean_phone_no_country = m.clean_to
        OR cc.clean_phone_with_country = m.clean_from
        OR cc.clean_phone_with_country = m.clean_to
    )
    ORDER BY m.message_date ASC;
$$;

-- ─── Legacy export helpers that unnest()ed the jsonb[] column ─────────────
-- unnest() only works on Postgres arrays; the jsonb equivalent is
-- jsonb_array_elements(). Return types are unchanged, so OR REPLACE is fine.

CREATE OR REPLACE FUNCTION public.get_outreach_data_column_definitions(campaign_id_param integer) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
    dynamic_columns TEXT;
    result_columns TEXT;
BEGIN
    -- Get all possible keys
    SELECT string_agg(
        format('%I TEXT', key),
        ', '
    ) INTO dynamic_columns
    FROM (
        SELECT DISTINCT jsonb_object_keys(unnested_data) AS key
        FROM outreach_attempt oa
        LEFT JOIN contact c ON oa.contact_id = c.id
        LEFT JOIN LATERAL jsonb_array_elements(c.other_data) AS unnested_data ON TRUE
        WHERE oa.campaign_id = campaign_id_param
    ) all_keys;

    -- Construct the result columns list
    result_columns := '
        outreach_attempt_id BIGINT,
        disposition TEXT,
        call_duration INTERVAL,
        firstname TEXT,
        surname TEXT,
        phone TEXT,
        username TEXT,
        created_at TIMESTAMP WITH TIME ZONE,
        full_result JSONB,
        ' || COALESCE(dynamic_columns, '');

    RETURN result_columns;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_outreach_data_column_names(campaign_id_param integer) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
    dynamic_columns TEXT;
    result_columns TEXT;
BEGIN
    -- Get all possible keys
    SELECT string_agg(
        format('%I', key),
        ', '
    ) INTO dynamic_columns
    FROM (
        SELECT DISTINCT jsonb_object_keys(unnested_data) AS key
        FROM outreach_attempt oa
        LEFT JOIN contact c ON oa.contact_id = c.id
        LEFT JOIN LATERAL jsonb_array_elements(c.other_data) AS unnested_data ON TRUE
        WHERE oa.campaign_id = campaign_id_param
    ) all_keys;

    -- Construct the result columns list
    result_columns := '
        outreach_attempt_id,
        disposition,
        call_duration,
        firstname,
        surname,
        phone,
        username,
        created_at,
        full_result,
        ' || COALESCE(dynamic_columns, '');

    RETURN result_columns;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_outreach_data_column_structure(campaign_id_param integer) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
    dynamic_columns TEXT;
    result_columns TEXT;
BEGIN
    -- Get all possible keys
    SELECT string_agg(
        format('%I TEXT', key),
        ', '
    ) INTO dynamic_columns
    FROM (
        SELECT DISTINCT jsonb_object_keys(unnested_data) AS key
        FROM outreach_attempt oa
        LEFT JOIN contact c ON oa.contact_id = c.id
        LEFT JOIN LATERAL jsonb_array_elements(c.other_data) AS unnested_data ON TRUE
        WHERE oa.campaign_id = campaign_id_param
    ) all_keys;

    -- Construct the result columns list
    result_columns := '
        outreach_attempt_id BIGINT,
        disposition TEXT,
        call_duration INTERVAL,
        firstname TEXT,
        surname TEXT,
        phone TEXT,
        username TEXT,
        created_at TIMESTAMP WITH TIME ZONE,
        full_result JSONB,
        ' || dynamic_columns;

    RETURN result_columns;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_pivoted_outreach_data(campaign_id_param integer) RETURNS SETOF record
    LANGUAGE plpgsql
    AS $$
DECLARE
    dynamic_columns TEXT;
    query TEXT;
    result_columns TEXT;
BEGIN
    -- Get all possible keys
    SELECT string_agg(
        format('MAX(CASE WHEN (ed.unnested_data->>%L) IS NOT NULL THEN ed.unnested_data->>%L END) AS %I', key, key, key),
        ', '
    ) INTO dynamic_columns
    FROM (
        SELECT DISTINCT jsonb_object_keys(unnested_data) AS key
        FROM outreach_attempt oa
        LEFT JOIN contact c ON oa.contact_id = c.id
        LEFT JOIN LATERAL jsonb_array_elements(c.other_data) AS unnested_data ON TRUE
        WHERE oa.campaign_id = campaign_id_param
    ) all_keys;

    -- Construct the result columns list
    result_columns := '
        outreach_attempt_id BIGINT,
        disposition TEXT,
        call_duration INTERVAL,
        firstname TEXT,
        surname TEXT,
        phone TEXT,
        username TEXT,
        created_at TIMESTAMP WITH TIME ZONE,
        full_result JSONB,
        ' || dynamic_columns;

    -- Construct the query
    query := format('
        WITH expanded_data AS (
            SELECT
                oa.id AS outreach_attempt_id,
                oa.disposition,
                oa.ended_at - oa.created_at AS call_duration,
                c.firstname,
                c.surname,
                c.phone,
                u.username,
                oa.created_at,
                oa.result AS full_result,
                unnested_data
            FROM
                outreach_attempt oa
                LEFT JOIN contact c ON oa.contact_id = c.id
                LEFT JOIN public.user u ON oa.user_id = u.id::uuid
                LEFT JOIN LATERAL jsonb_array_elements(c.other_data) AS unnested_data ON TRUE
            WHERE
                oa.campaign_id = %s
        )
        SELECT
            ed.outreach_attempt_id,
            ed.disposition,
            ed.call_duration,
            ed.firstname,
            ed.surname,
            ed.phone,
            ed.username,
            ed.created_at,
            ed.full_result,
            %s
        FROM
            expanded_data ed
        GROUP BY
            ed.outreach_attempt_id,
            ed.disposition,
            ed.call_duration,
            ed.firstname,
            ed.surname,
            ed.phone,
            ed.username,
            ed.created_at,
            ed.full_result
    ', campaign_id_param, dynamic_columns);

    -- Execute the query
    RETURN QUERY EXECUTE query;
END;
$$;

COMMIT;
