--
-- PostgreSQL database dump
--

\restrict bccokPI7OvvrPkMdohT3gbVgTTAGPqUb1FZjh5FgduglnA4Ka9AfCq3ddY6zDTc

-- Dumped from database version 18.4 (Debian 18.4-1.pgdg13+1)
-- Dumped by pg_dump version 18.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: app_auth; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA app_auth;


--
-- Name: auth; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA auth;


--
-- Name: AUTH_migrations; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA AUTH_migrations;


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: answered_by; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.answered_by AS ENUM (
    'human',
    'machine',
    'unknown'
);


--
-- Name: audience_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.audience_status AS ENUM (
    'pending',
    'processing',
    'completed',
    'error'
);


--
-- Name: call_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.call_status AS ENUM (
    'queued',
    'ringing',
    'in-progress',
    'canceled',
    'completed',
    'failed',
    'busy',
    'no-answer',
    'initiated'
);


--
-- Name: campaign_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.campaign_status AS ENUM (
    'pending',
    'scheduled',
    'running',
    'complete',
    'paused',
    'draft',
    'archived'
);


--
-- Name: campaign_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.campaign_type AS ENUM (
    'message',
    'robocall',
    'simple_ivr',
    'complex_ivr',
    'live_call',
    'email'
);


--
-- Name: campaigndata; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.campaigndata AS (
	campaign_id bigint,
	audience_id bigint,
	contact_id bigint,
	firstname text,
	surname text
);


--
-- Name: dial_types; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.dial_types AS ENUM (
    'call',
    'predictive'
);


--
-- Name: message_direction; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.message_direction AS ENUM (
    'inbound',
    'outbound-api',
    'outbound-call',
    'outbound-reply'
);


--
-- Name: message_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.message_status AS ENUM (
    'accepted',
    'scheduled',
    'canceled',
    'queued',
    'sending',
    'sent',
    'failed',
    'delivered',
    'undelivered',
    'receiving',
    'received',
    'read'
);


--
-- Name: pgmq_message; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.pgmq_message AS (
	msg_id bigint,
	message jsonb
);


--
-- Name: queue_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.queue_status AS ENUM (
    'queued',
    'dequeued'
);


--
-- Name: transaction_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.transaction_type AS ENUM (
    'DEBIT',
    'CREDIT'
);


--
-- Name: workspace_permission; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.workspace_permission AS ENUM (
    'workspace.delete',
    'workspace.addUser',
    'workspace.removeUser',
    'workspace.call',
    'workspace.addCampaign',
    'workspace.addAudience',
    'workspace.addContact',
    'workspace.editUser',
    'workspace.editCampaign',
    'workspace.startCampaign',
    'workspace.stopCampaign',
    'workspace.removeCampaign',
    'workspace.inviteCaller',
    'workspace.manageCredits',
    'workspace.pauseCampaign',
    'workspace.editContact',
    'workspace.removeContact',
    'workspace.editAudience',
    'workspace.removeAudience',
    'workspace.transferOwnership',
    'workspace.removeCaller',
    'workspace.initializeMedia',
    'workspace.addMedia',
    'workspace.removeMedia'
);


--
-- Name: TYPE workspace_permission; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TYPE public.workspace_permission IS 'Permissions the member of a workspace has based on their roles';


--
-- Name: workspace_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.workspace_role AS ENUM (
    'owner',
    'member',
    'caller',
    'admin'
);


--
-- Name: TYPE workspace_role; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TYPE public.workspace_role IS 'The roles a user can hold in a workspace';


--
-- Name: is_sudo_user(); Type: FUNCTION; Schema: app_auth; Owner: -
--

CREATE FUNCTION app_auth.is_sudo_user() RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  user_access_level TEXT;
BEGIN
  SELECT access_level INTO user_access_level
  FROM public.user
  WHERE id = auth.uid();
  
  RETURN user_access_level = 'sudo';
END;
$$;


--
-- Name: uid(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$SELECT NULL::uuid$$;


--
-- Name: add_contact_to_all_campaign_queues(bigint, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.add_contact_to_all_campaign_queues(contact_id_param bigint, audience_id_param bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    campaign RECORD;
    last_order BIGINT;
BEGIN
    FOR campaign IN
        SELECT campaign_id
        FROM public.campaign_audience
        WHERE audience_id = audience_id_param
    LOOP
        SELECT COALESCE(MAX(queue_order), 0) INTO last_order
        FROM public.campaign_queue
        WHERE campaign_id = campaign.campaign_id;

        INSERT INTO public.campaign_queue (contact_id, campaign_id, queue_order, attempts)
        VALUES (contact_id_param, campaign.campaign_id, last_order + 1, 0);
    END LOOP;
END;
$$;


--
-- Name: add_invited_caller_to_workspace(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.add_invited_caller_to_workspace() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  insert into public.workspace_users(workspace_id, user_id, role)
  values(
    coalesce(new.raw_user_meta_data->>'add_to_workspace', ''),
    new.id,
    coalesce(new.raw_user_meta_data->>'user_workspace_role', '')
  );
  return new;
end;
$$;


--
-- Name: authorize(uuid, public.workspace_permission); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.authorize(selected_workspace_id uuid, requested_permission public.workspace_permission) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  bind_permissions int;
  user_workspace_roles record;
  data jsonb;
begin
  -- Fetch user role once and store it to reduce number of calls
  -- RAISE exception 'selected_workspace_id: %', selected_workspace_id; 
  select (auth.jwt() ->> 'user_workspace_roles') into data;
  -- RAISE EXCEPTION 'DATA: %', data;
  select * from jsonb_to_recordset(data) as x(workspace_id uuid, role public.workspace_role) into user_workspace_roles
  where workspace_id = selected_workspace_id::uuid;

  -- RAISE EXCEPTION 'User_workspace_roles: %', user_workspace_roles;

  select count(*)
  into bind_permissions
  from public.workspace_permissions
  where workspace_permissions.permission = requested_permission
    and workspace_permissions.role = user_workspace_roles.role;

  return bind_permissions > 0;
end;
$$;


--
-- Name: auto_dial_queue(integer, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auto_dial_queue(campaign_id_variable integer, user_id_variable uuid) RETURNS TABLE(contact_id integer, queue_id integer, caller_id text, contact_phone text)
    LANGUAGE plpgsql
    AS $$DECLARE
    v_contact_id INT;
    v_queue_id INT;
    v_caller_id TEXT;
    v_contact_phone TEXT;
BEGIN
    SELECT cq.contact_id, cq.id AS queue_id, ca.caller_id, c.phone
    INTO v_contact_id, v_queue_id, v_caller_id, v_contact_phone
    FROM campaign_queue cq
    JOIN contact c ON cq.contact_id = c.id
    JOIN campaign ca ON cq.campaign_id = ca.id
    WHERE cq.status = 'queued' AND ca.id = campaign_id_variable
        AND c.phone IS NOT NULL
        AND c.phone != ''
    ORDER BY cq.queue_order ASC, cq.id ASC, cq.attempts DESC
    LIMIT 1;

    IF v_queue_id IS NOT NULL THEN
        UPDATE campaign_queue
        SET status = user_id_variable, attempts = attempts + 1
        WHERE id = v_queue_id;
    END IF;

    RETURN QUERY SELECT v_contact_id, v_queue_id, v_caller_id, v_contact_phone;
END;$$;


--
-- Name: batch_delete_contacts(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.batch_delete_contacts() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  batch_size INT := 500;
  deleted INT;
  total_deleted INT := 0;
BEGIN 
  LOOP
    WITH to_delete AS (
      SELECT id FROM public.contact 
      WHERE workspace = '80bb3cbc-09a6-4d24-965b-7b89f0f5cb5f'
      LIMIT batch_size
    ),
    deleted_rows AS (
      DELETE FROM public.contact 
      WHERE id IN (SELECT id FROM to_delete)
      RETURNING 1
    )
    SELECT COUNT(*) INTO deleted FROM deleted_rows;
    
    total_deleted := total_deleted + deleted;
    
    EXIT WHEN deleted = 0;
    RAISE NOTICE 'Deleted % rows (total: %)', deleted, total_deleted;
    PERFORM pg_sleep(0.1);
  END LOOP;
END;
$$;


--
-- Name: call_edge_function(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.call_edge_function() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
declare
  edge_function_url text := 'https://nolrdvpusfcsjihzhnlp.client.co/functions/v1/dequeue_contacts';
  api_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vbHJkdnB1c2Zjc2ppaHpobmxwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcxNTE4NDAwMCwiZXhwIjoyMDMwNzYwMDAwfQ.r346il-1piEsHSS8ji-Iy9gvtEk_IHZlj2oeqV23iaY';
begin
  perform net.http_post(
    url := edge_function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', concat('Bearer ', api_key)
    ),
    body := '{}'
  );
end;
$$;


--
-- Name: call_outreach_webhook(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.call_outreach_webhook() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$DECLARE
  payload jsonb;
  edge_function_url text := 'https://nolrdvpusfcsjihzhnlp.client.co/functions/v1/outreach-attempt-hook';
  api_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vbHJkdnB1c2Zjc2ppaHpobmxwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcxNTE4NDAwMCwiZXhwIjoyMDMwNzYwMDAwfQ.r346il-1piEsHSS8ji-Iy9gvtEk_IHZlj2oeqV23iaY';
  
BEGIN
  payload := jsonb_build_object(
    'type', TG_OP,
    'record', row_to_json(NEW),
    'old_record', CASE WHEN TG_OP = 'UPDATE' THEN row_to_json(OLD) ELSE NULL END
  );
  perform net.http_post(
      url := edge_function_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', concat('Bearer ', api_key)
      ),
      body := payload
  );
    RETURN NEW;
END;$$;


--
-- Name: campaign_is_active_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.campaign_is_active_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$DECLARE
  payload jsonb;
  edge_function_url text := 'https://nolrdvpusfcsjihzhnlp.client.co/functions/v1/handle_active_change';
  api_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vbHJkdnB1c2Zjc2ppaHpobmxwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcxNTE4NDAwMCwiZXhwIjoyMDMwNzYwMDAwfQ.r346il-1piEsHSS8ji-Iy9gvtEk_IHZlj2oeqV23iaY';
BEGIN
    IF OLD.is_active IS DISTINCT FROM NEW.is_active THEN
      payload := jsonb_build_object(
    'type', TG_OP,
    'record', row_to_json(NEW),
    'old_record', CASE WHEN TG_OP = 'UPDATE' THEN row_to_json(OLD) ELSE NULL END
  );

PERFORM net.http_post(
    url := edge_function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', concat('Bearer ', api_key)
    ),
    body := payload
  );
  
    END IF;
    RETURN NEW;
END;$$;


--
-- Name: campaign_queue_has_pending_work(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.campaign_queue_has_pending_work(campaign_id_pro integer) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
declare
  pending_count integer;
begin
  perform public.fail_exhausted_campaign_queue_contacts(campaign_id_pro);

  select count(*)::integer
  into pending_count
  from public.campaign_queue cq
  where cq.campaign_id = campaign_id_pro
    and cq.dequeued_at is null
    and (
      cq.queue_state = 'queued'
      or cq.status = 'queued'
      or (
        cq.queue_state = 'assigned'
        and cq.claimed_at is not null
        and cq.claimed_at >= now() - interval '10 minutes'
        and cq.attempt_count < 5
      )
    );

  return pending_count > 0;
end;
$$;


--
-- Name: campaign_queue_has_pending_work(integer, interval); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.campaign_queue_has_pending_work(campaign_id_pro integer, stale_after interval DEFAULT NULL::interval) RETURNS boolean
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

  return pending_count > 0;
end;
$$;


--
-- Name: campaign_queue_policy(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.campaign_queue_policy() RETURNS TABLE(max_attempts integer, stale_after interval)
    LANGUAGE sql STABLE
    AS $$
  select 5::integer, interval '10 minutes';
$$;


--
-- Name: cancel_messages(uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_messages(message_ids uuid[]) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Update outreach_attempt
    UPDATE outreach_attempt
    SET disposition = 'canceled'
    WHERE id IN (
        SELECT outreach_attempt_id
        FROM message
        WHERE id = ANY(message_ids)
    );

    -- Update campaign_queue
    UPDATE campaign_queue
    SET 
        attempts = attempts - 1,
        status = 'queued'
    WHERE id IN (
        SELECT cq.id
        FROM campaign_queue cq
        JOIN outreach_attempt oa ON oa.campaign_queue_id = cq.id
        JOIN message m ON m.outreach_attempt_id = oa.id
        WHERE m.id = ANY(message_ids)
    );
END;
$$;


--
-- Name: cancel_outreach_attempts(bigint[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_outreach_attempts(call_ids bigint[]) RETURNS void
    LANGUAGE plpgsql
    AS $$BEGIN
    -- Update outreach_attempt
    UPDATE outreach_attempt
    SET disposition = 'canceled'
    WHERE id IN (
        SELECT outreach_attempt_id
        FROM call
        WHERE id = ANY(call_ids)
    );

    -- Update campaign_queue
    UPDATE campaign_queue
    SET 
        attempts = attempts - 1,
        status = 'queued'
    WHERE id IN (
        SELECT cq.id
        FROM campaign_queue cq
        JOIN outreach_attempt oa ON oa.campaign_queue_id = cq.id
        JOIN call c ON c.outreach_attempt_id = oa.id
        WHERE c.id = ANY(call_ids)
    );
END;$$;


--
-- Name: claim_campaign_queue_contacts(integer, uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_campaign_queue_contacts(campaign_id_pro integer, claimed_by_user_id uuid, claim_limit integer DEFAULT 1) RETURNS TABLE(id integer, contact_id integer, phone text, workspace text, caller_id text)
    LANGUAGE plpgsql
    AS $$
begin
  return query
  with candidates as (
    select cq.id
    from public.campaign_queue cq
    where cq.campaign_id = campaign_id_pro
      and cq.status = 'queued'
      and cq.dequeued_at is null
      and (cq.queue_state is null or cq.queue_state = 'queued')
    order by cq.id
    for update skip locked
    limit greatest(claim_limit, 1)
  ),
  claimed as (
    update public.campaign_queue cq
    set
      status = claimed_by_user_id::text,
      queue_state = 'assigned',
      assigned_to_user_id = claimed_by_user_id,
      provider_status = null
    from candidates c
    where cq.id = c.id
    returning cq.id, cq.contact_id, cq.campaign_id
  )
  select distinct on (contact.phone)
    claimed.id,
    contact.id as contact_id,
    contact.phone,
    contact.workspace,
    campaign.caller_id
  from claimed
  join public.contact on claimed.contact_id = contact.id
  join public.campaign on claimed.campaign_id = campaign.id
  where contact.phone is not null
    and contact.phone != ''
  order by contact.phone, claimed.id;
end;
$$;


--
-- Name: claim_campaign_queue_contacts(integer, uuid, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_campaign_queue_contacts(campaign_id_pro integer, claimed_by_user_id uuid, claim_limit integer DEFAULT 1, max_inflight integer DEFAULT NULL::integer) RETURNS TABLE(id integer, contact_id integer, phone text, workspace text, caller_id text)
    LANGUAGE plpgsql
    AS $$
declare
  effective_limit integer;
  policy record;
begin
  select * into policy from public.campaign_queue_policy();
  perform public.fail_exhausted_campaign_queue_contacts(campaign_id_pro);

  effective_limit := greatest(claim_limit, 1);
  if max_inflight is not null then
    if max_inflight <= 0 then
      return;
    end if;
    effective_limit := least(effective_limit, max_inflight);
  end if;

  return query
  with candidates as (
    select cq.id
    from public.campaign_queue cq
    where cq.campaign_id = campaign_id_pro
      and cq.dequeued_at is null
      and (cq.queue_state is null or cq.queue_state = 'queued')
      and cq.attempt_count < policy.max_attempts
    order by cq.id
    for update skip locked
    limit effective_limit
  ),
  claimed as (
    update public.campaign_queue cq
    set
      queue_state = 'assigned',
      assigned_to_user_id = claimed_by_user_id,
      provider_status = null,
      claimed_at = now(),
      attempt_count = cq.attempt_count + 1,
      last_attempt_at = now()
    from candidates c
    where cq.id = c.id
    returning cq.id, cq.contact_id, cq.campaign_id
  )
  select distinct on (contact.phone)
    claimed.id,
    contact.id as contact_id,
    contact.phone,
    contact.workspace,
    campaign.caller_id
  from claimed
  join public.contact contact on contact.id = claimed.contact_id
  join public.campaign campaign on campaign.id = claimed.campaign_id;
end;
$$;


--
-- Name: complete_campaign_queue_contact(integer, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.complete_campaign_queue_contact(queue_id_pro integer, dequeued_by_id uuid DEFAULT NULL::uuid, reason_text text DEFAULT 'Dispatched'::text) RETURNS void
    LANGUAGE plpgsql
    AS $$
begin
  update public.campaign_queue cq
  set
    queue_state = 'dequeued',
    assigned_to_user_id = null,
    provider_status = null,
    claimed_at = null,
    dequeued_by = dequeued_by_id,
    dequeued_at = now(),
    dequeued_reason = coalesce(reason_text, 'Dispatched'),
    last_attempt_at = now(),
    last_attempt_error = null
  where cq.id = queue_id_pro
    and cq.dequeued_at is null;
end;
$$;


--
-- Name: count_active_ivr_campaign_calls(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.count_active_ivr_campaign_calls(campaign_id_pro integer) RETURNS integer
    LANGUAGE sql STABLE
    AS $$
  select count(*)::integer
  from public.call c
  where c.campaign_id = campaign_id_pro
    and c.end_time is null
    and (
      c.status is null
      or c.status not in (
        'completed',
        'failed',
        'busy',
        'no-answer',
        'canceled'
      )
    );
$$;


--
-- Name: create_cron_job(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_cron_job(p_job_name text, p_schedule text, p_command text) RETURNS TABLE(job_id bigint, job_name text, schedule text, command text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_job_id bigint;
BEGIN
    SELECT cron.schedule(p_job_name, p_schedule, p_command) INTO v_job_id;
    
    IF v_job_id IS NULL THEN
        RAISE EXCEPTION 'Failed to create cron job';
    END IF;
    
    -- Log the result for debugging
    RAISE NOTICE 'Cron job created with ID: %', v_job_id;
    
    -- Return the job details
    RETURN QUERY SELECT v_job_id, p_job_name, p_schedule, p_command;
END;
$$;


--
-- Name: create_new_workspace(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_new_workspace(new_workspace_name text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  new_workspace_id uuid;
begin
  INSERT INTO public.workspace (name) values
  (new_workspace_name) RETURNING id INTO new_workspace_id;

  INSERT INTO public.workspace_users (workspace_id, user_id, role) values
  (new_workspace_id, auth.uid(), 'owner'::public.workspace_role);

  RETURN new_workspace_id;
end;
$$;


--
-- Name: create_new_workspace(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_new_workspace(new_workspace_name text, user_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  new_workspace_id uuid;
BEGIN
  INSERT INTO public.workspace (name)
  VALUES (new_workspace_name)
  RETURNING id INTO new_workspace_id;

  -- Insert into workspace_users table
  INSERT INTO public.workspace_users (workspace_id, user_id, role)
  VALUES (new_workspace_id, user_id, 'owner'::public.workspace_role);

  RETURN new_workspace_id;
EXCEPTION
  WHEN others THEN
    RAISE EXCEPTION 'Error creating workspace: %', SQLERRM;
END;
$$;


--
-- Name: create_outreach_attempt(bigint, bigint, uuid, uuid, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_outreach_attempt(con_id bigint, cam_id bigint, usr_id uuid, wks_id uuid, queue_id bigint) RETURNS bigint
    LANGUAGE plpgsql
    AS $$
DECLARE
  new_outreach_attempt_id bigint;
BEGIN
  INSERT INTO outreach_attempt (contact_id, campaign_id, user_id, workspace)
  VALUES (con_id, cam_id, usr_id, wks_id)
  RETURNING id INTO new_outreach_attempt_id;

  UPDATE campaign_queue
  SET attempts = attempts + 1
  WHERE id = queue_id;

  RETURN new_outreach_attempt_id;
END;
$$;


--
-- Name: custom_access_token_hook(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.custom_access_token_hook(event jsonb) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    AS $$
  declare
    claims jsonb;
    user_workspace_roles jsonb;
  begin
    -- Check if the user is marked as admin in the profiles table
    select jsonb_agg(jsonb_build_object('workspace_id', workspace_id, 'role', role)) into user_workspace_roles from public.workspace_users where user_id = (event->>'user_id')::uuid;

    claims := event->'claims';

    if user_workspace_roles is not null then
      -- Set the claim
      claims := jsonb_set(claims, '{user_workspace_roles}', user_workspace_roles);

    else
      claims := jsonb_set(claims, '{user_workspace_roles}', 'null');
    end if;

    -- Update the 'claims' object in the original event
    event := jsonb_set(event, '{claims}', claims);

    -- Return the modified or original event
    return event;
  end;
$$;


--
-- Name: dequeue_contact(integer, boolean, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.dequeue_contact(passed_contact_id integer, group_on_household boolean, dequeued_by_id uuid DEFAULT NULL::uuid, dequeued_reason_text text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql
    AS $$
begin
  update public.campaign_queue
  set
    queue_state = 'dequeued',
    assigned_to_user_id = null,
    provider_status = null,
    dequeued_by = dequeued_by_id,
    dequeued_at = now(),
    dequeued_reason = dequeued_reason_text
  where contact_id = passed_contact_id
    and (queue_state is null or queue_state = 'queued');

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
      and cq.contact_id = c2.id
      and (cq.queue_state is null or cq.queue_state = 'queued');
  end if;
end;
$$;


--
-- Name: dequeue_duplicate_campaign_queue_contact(integer, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.dequeue_duplicate_campaign_queue_contact(queue_id_pro integer, dequeued_by_id uuid DEFAULT NULL::uuid, reason_text text DEFAULT 'Duplicate SMS prevented'::text) RETURNS void
    LANGUAGE plpgsql
    AS $$
begin
  update public.campaign_queue cq
  set
    queue_state = 'dequeued',
    assigned_to_user_id = null,
    provider_status = null,
    claimed_at = null,
    dequeued_by = dequeued_by_id,
    dequeued_at = now(),
    dequeued_reason = coalesce(reason_text, 'Duplicate SMS prevented'),
    last_attempt_at = now(),
    last_attempt_error = null
  where cq.id = queue_id_pro
    and cq.dequeued_at is null;
end;
$$;


--
-- Name: dequeue_household(integer, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.dequeue_household(contact_id_variable integer, dequeued_by_id uuid DEFAULT NULL::uuid, dequeued_reason_text text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql
    AS $$
begin
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
    c1.id = contact_id_variable
    and cq.contact_id = c2.id
    and (cq.queue_state is null or cq.queue_state = 'queued');
end;
$$;


--
-- Name: enqueue_ivr_batch(jsonb[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enqueue_ivr_batch(p_tasks jsonb[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
declare
  task jsonb;
begin
  foreach task in array p_tasks
  loop
    perform pgmq.send('ivr_tasks', task);
  end loop;
end;
$$;


--
-- Name: enqueue_ivr_task(text, uuid, bigint, uuid, bigint, bigint, text, integer, integer, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enqueue_ivr_task(p_to_number text, p_user_id uuid, p_campaign_id bigint, p_workspace_id uuid, p_queue_id bigint, p_contact_id bigint, p_caller_id text, p_index integer, p_total integer, p_is_last_contact boolean) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
declare
  msg_id text;
begin
  select pgmq.send(
    'ivr_tasks',
    jsonb_build_object(
      'to_number', p_to_number,
      'user_id', p_user_id,
      'campaign_id', p_campaign_id,
      'workspace_id', p_workspace_id,
      'queue_id', p_queue_id,
      'contact_id', p_contact_id,
      'caller_id', p_caller_id,
      'index', p_index,
      'total', p_total,
      'isLastContact', p_is_last_contact
    )
  ) into msg_id;
  
  return msg_id;
end;
$$;


--
-- Name: enqueue_sms_batch(jsonb[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enqueue_sms_batch(p_tasks jsonb[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
declare
  task jsonb;
begin
  foreach task in array p_tasks
  loop
    perform pgmq.send('sms_tasks', task);
  end loop;
end;
$$;


--
-- Name: ensure_twilio_open_sync_cron_job(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_twilio_open_sync_cron_job(p_edge_base_url text DEFAULT NULL::text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'cron', 'extensions'
    AS $$
declare
  job_exists boolean;
  edge_base_url text;
  function_url text;
  cron_command text;
  service_jwt text;
  headers jsonb;
  default_edge constant text := 'https://nolrdvpusfcsjihzhnlp.client.co/functions/v1';
begin
  select exists(
    select 1 from cron.job j where j.jobname = 'twilio_open_sync_every_5m'
  ) into job_exists;

  if job_exists then
    return 'already_exists';
  end if;

  edge_base_url := nullif(trim(both from coalesce(
    nullif(trim(both from p_edge_base_url), ''),
    nullif(trim(both from current_setting('app.settings.edge_functions_base_url', true)), ''),
    nullif(trim(both from current_setting('app.settings.AUTH_functions_url', true)), ''),
    default_edge
  )), '');

  if edge_base_url is null then
    return 'missing_edge_url';
  end if;

  service_jwt := nullif(trim(both from current_setting('app.settings.AUTH_service_role_jwt', true)), '');
  if service_jwt is null or service_jwt = '' then
    return 'missing_service_role_jwt';
  end if;

  function_url := rtrim(edge_base_url, '/') || '/twilio-open-sync';

  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || service_jwt
  );

  cron_command :=
    'select net.http_post('
    || 'url := ' || quote_literal(function_url)
    || ', headers := ' || quote_literal(headers::text) || '::jsonb'
    || ', body := ''{}''::jsonb'
    || ');';

  perform public.create_cron_job(
    p_job_name := 'twilio_open_sync_every_5m',
    p_schedule := '*/5 * * * *',
    p_command := cron_command
  );

  return 'created';
exception
  when others then
    return 'error:' || sqlerrm;
end
$$;


--
-- Name: execute_jsonb_columns(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.execute_jsonb_columns(data jsonb) RETURNS SETOF json
    LANGUAGE plpgsql
    AS $$
DECLARE 
  sql text;
  data_type text;
BEGIN
  data_type := jsonb_typeof(data);
  
  IF data_type = 'object' THEN
    -- First try to find any "pages" structure
    IF data ? 'pages' THEN
      sql := (
        WITH RECURSIVE page_keys AS (
          SELECT DISTINCT jsonb_object_keys(data) as page_key
        ),
        all_response_keys AS (
          SELECT DISTINCT 
            pk.page_key,
            jsonb_object_keys(data -> pk.page_key) as response_key,
            NULL as nested_key
          FROM page_keys pk
          
          UNION
          
          SELECT DISTINCT 
            pk.page_key,
            response_key,
            jsonb_object_keys(data -> pk.page_key -> response_key) as nested_key
          FROM page_keys pk
          CROSS JOIN LATERAL jsonb_object_keys(data -> pk.page_key) as response_key
          WHERE jsonb_typeof(data -> pk.page_key -> response_key) = 'object'
        ),
        columns AS (
          SELECT 
            string_agg(
              CASE 
                WHEN nested_key IS NULL THEN
                  format(
                    '%L, data -> %L ->> %L',
                    lower(page_key || '_' || response_key),
                    page_key,
                    response_key
                  )
                ELSE
                  format(
                    '%L, data -> %L -> %L ->> %L',
                    lower(page_key || '_' || response_key || '_' || nested_key),
                    page_key,
                    response_key,
                    nested_key
                  )
              END,
              ', '
            ) as column_definitions
          FROM all_response_keys
        )
        SELECT format('SELECT json_build_object(%s) FROM jsonb_array_elements(%L::jsonb) as data',
          column_definitions,
          json_build_array(data)
        ) 
        FROM columns
      );
    ELSE
      -- Handle flat JSON objects
      WITH key_names AS (
        SELECT 
          jsonb_object_keys(data) as key,
          data -> jsonb_object_keys(data) as value
      )
      SELECT string_agg(
        format(
          '%L, data ->> %L',
          key,
          key
        ),
        ', '
      ) INTO sql
      FROM key_names;

      sql := format(
        'SELECT json_build_object(%s) FROM jsonb_array_elements(%L::jsonb) as data',
        sql,
        json_build_array(data)
      );
    END IF;
    
    RETURN QUERY EXECUTE sql;
  ELSE
    RETURN QUERY SELECT json_build_object('value', data);
  END IF;
END;
$$;


--
-- Name: fail_campaign_queue_contact(integer, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fail_campaign_queue_contact(queue_id_pro integer, error_text text DEFAULT NULL::text, dequeued_by_id uuid DEFAULT NULL::uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
begin
  update public.campaign_queue cq
  set
    queue_state = 'dequeued',
    assigned_to_user_id = null,
    provider_status = 'failed',
    claimed_at = null,
    dequeued_by = dequeued_by_id,
    dequeued_at = now(),
    dequeued_reason = coalesce(error_text, 'Permanent dispatch failure'),
    last_attempt_at = now(),
    last_attempt_error = error_text
  where cq.id = queue_id_pro
    and cq.dequeued_at is null;
end;
$$;


--
-- Name: fail_exhausted_campaign_queue_contacts(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fail_exhausted_campaign_queue_contacts(campaign_id_pro integer) RETURNS integer
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
    and cq.queue_state in ('queued', 'assigned', 'failed');

  get diagnostics failed_count = row_count;
  return failed_count;
end;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: contact; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact (
    id bigint NOT NULL,
    firstname text,
    surname text,
    phone text,
    email text,
    address text,
    city text,
    opt_out boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    workspace uuid,
    external_id text,
    postal text,
    other_data jsonb[] DEFAULT '{}'::jsonb[] NOT NULL,
    date_updated timestamp with time zone,
    province text,
    country text,
    created_by uuid,
    upload_id bigint,
    household_id uuid
);


--
-- Name: find_contact_by_phone(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.find_contact_by_phone(p_phone_number text, p_workspace_id uuid) RETURNS SETOF public.contact
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  WITH phone_formats AS (
    SELECT 
      regexp_replace(p_phone_number, '\D', '', 'g') AS full_number,
      RIGHT(regexp_replace(p_phone_number, '\D', '', 'g'), 10) AS last_10,
      RIGHT(regexp_replace(p_phone_number, '\D', '', 'g'), 7) AS last_7,
      LEFT(RIGHT(regexp_replace(p_phone_number, '\D', '', 'g'), 10), 3) AS area_code
  )
  SELECT c.*
  FROM contact c, phone_formats pf
  WHERE c.workspace = p_workspace_id
    AND (
      c.phone = pf.full_number
      OR c.phone = '+' || pf.full_number
      OR c.phone = '+1' || pf.full_number
      OR c.phone = '1' || pf.full_number
      OR c.phone = '(' || pf.area_code || ') ' || pf.last_7
      OR c.phone = '(' || pf.area_code || ')' || pf.last_7
      OR c.phone = pf.area_code || '-' || pf.last_7
      OR c.phone = pf.area_code || '.' || pf.last_7
      OR c.phone = '(' || pf.area_code || ') ' || SUBSTRING(pf.last_7, 1, 3) || '-' || SUBSTRING(pf.last_7, 4, 4)
      OR c.phone LIKE '%' || pf.full_number
      OR c.phone LIKE '%+' || pf.full_number
      OR c.phone LIKE '%+1' || pf.full_number
      OR c.phone LIKE '%1' || pf.full_number
      OR c.phone LIKE '%(' || pf.area_code || ')%' || pf.last_7
      OR c.phone LIKE '%' || pf.area_code || '-%' || pf.last_7
      OR c.phone LIKE '%' || pf.area_code || '.%' || pf.last_7
      OR c.phone LIKE '%(' || pf.area_code || ') ' || SUBSTRING(pf.last_7, 1, 3) || '-' || SUBSTRING(pf.last_7, 4, 4) || '%'
      OR c.phone LIKE pf.last_10 || '%'
      OR REPLACE(REPLACE(REPLACE(REPLACE(c.phone, '(', ''), ')', ''), ' ', ''), '-', '') = pf.full_number
    );
END;
$$;


--
-- Name: find_contacts_by_phones(uuid, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.find_contacts_by_phones(p_workspace_id uuid, p_phone_numbers text[]) RETURNS SETOF public.contact
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  with input_phones as (
    select unnest(p_phone_numbers) as raw
  ),
  search_keys as (
    select distinct normalise_phone_key(raw) as key
    from input_phones
    where normalise_phone_key(raw) is not null
  )
  select c.*
  from public.contact c
  join search_keys s on normalise_phone_key(c.phone) = s.key
  where c.workspace = p_workspace_id;
$$;


--
-- Name: FUNCTION find_contacts_by_phones(p_workspace_id uuid, p_phone_numbers text[]); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.find_contacts_by_phones(p_workspace_id uuid, p_phone_numbers text[]) IS 'Returns contacts in the workspace whose phone matches any of the given numbers (batch version of find_contact_by_phone).';


--
-- Name: fullname(public.contact); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fullname(public.contact) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $_$
  select $1.firstname || ' ' || $1.surname;
$_$;


--
-- Name: generate_cron_expressions(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_cron_expressions(schedule jsonb) RETURNS TABLE(start_cron text, end_cron text)
    LANGUAGE plpgsql
    AS $$
DECLARE
    day text;
    day_schedule jsonb;
    day_number int;
    next_day_number int;
    interval_data jsonb;
    start_times text[] := '{}';
    end_times text[] := '{}';
BEGIN
    FOR day, day_schedule IN SELECT * FROM jsonb_each(schedule)
    LOOP
        IF (day_schedule->>'active')::boolean THEN
            day_number := CASE day
                WHEN 'sunday' THEN 0
                WHEN 'monday' THEN 1
                WHEN 'tuesday' THEN 2
                WHEN 'wednesday' THEN 3
                WHEN 'thursday' THEN 4
                WHEN 'friday' THEN 5
                WHEN 'saturday' THEN 6
            END;
            next_day_number := (day_number + 1) % 7;

            FOR interval_data IN SELECT * FROM jsonb_array_elements(day_schedule->'intervals')
            LOOP
                -- Handle start time
                start_times := array_append(start_times, 
                    format('%s %s * * %s', 
                        substring((interval_data->>'start')::time::text, 4, 2),  -- Minutes
                        substring((interval_data->>'start')::time::text, 1, 2),  -- Hours
                        day_number
                    )
                );
                
                -- Handle end time, considering it might be on the next day
                IF (interval_data->>'end')::time < (interval_data->>'start')::time THEN
                    end_times := array_append(end_times, 
                        format('%s %s * * %s', 
                            substring((interval_data->>'end')::time::text, 4, 2),  -- Minutes
                            substring((interval_data->>'end')::time::text, 1, 2),  -- Hours
                            next_day_number
                        )
                    );
                ELSE
                    end_times := array_append(end_times, 
                        format('%s %s * * %s', 
                            substring((interval_data->>'end')::time::text, 4, 2),  -- Minutes
                            substring((interval_data->>'end')::time::text, 1, 2),  -- Hours
                            day_number
                        )
                    );
                END IF;
            END LOOP;
        END IF;
    END LOOP;

    start_cron := array_to_string(start_times, ' | ');
    end_cron := array_to_string(end_times, ' | ');

    RETURN QUERY SELECT start_cron, end_cron;
END;
$$;


--
-- Name: generate_jsonb_columns(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_jsonb_columns(data jsonb) RETURNS text
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN (
    WITH RECURSIVE page_keys AS (
      SELECT DISTINCT jsonb_object_keys(data) as page_key
    ),
    all_response_keys AS (
      SELECT DISTINCT 
        pk.page_key,
        jsonb_object_keys(data -> pk.page_key) as response_key,
        NULL as nested_key
      FROM page_keys pk
      
      UNION
      
      SELECT DISTINCT 
        pk.page_key,
        response_key,
        jsonb_object_keys(data -> pk.page_key -> response_key) as nested_key
      FROM page_keys pk
      CROSS JOIN LATERAL jsonb_object_keys(data -> pk.page_key) as response_key
      WHERE jsonb_typeof(data -> pk.page_key -> response_key) = 'object'
    ),
    columns AS (
      SELECT 
        string_agg(
          CASE 
            WHEN nested_key IS NULL THEN
              format(
                'data -> %L ->> %L as %I',
                page_key,
                response_key,
                lower(regexp_replace(concat(page_key, '_', response_key), '\s+', '_', 'g'))
              )
            ELSE
              format(
                'data -> %L -> %L ->> %L as %I',
                page_key,
                response_key,
                nested_key,
                lower(regexp_replace(concat(page_key, '_', response_key, '_', nested_key), '\s+', '_', 'g'))
              )
          END,
          ', '
        ) as column_definitions
      FROM all_response_keys
    )
    SELECT format('SELECT %s FROM jsonb_array_elements(%L::jsonb) as data',
      column_definitions,
      json_build_array(data)
    ) 
    FROM columns
  );
END;
$$;


--
-- Name: get_active_cron_jobs(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_active_cron_jobs() RETURNS TABLE(jobid bigint, jobname text, schedule text, command text, nodename text, nodeport integer, database name, username name, active boolean, last_run_time timestamp with time zone, next_run_time timestamp with time zone)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        job.jobid,
        job.jobname,
        job.schedule,
        job.command,
        job.nodename,
        job.nodeport,
        job.database,
        job.username,
        job.active,
        job.last_run_time,
        job.next_run_time
    FROM 
        cron.job
    WHERE 
        job.active = true
    ORDER BY 
        job.next_run_time;
END;
$$;


--
-- Name: audience; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audience (
    id bigint NOT NULL,
    name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    workspace uuid,
    is_conditional boolean DEFAULT false NOT NULL,
    status public.audience_status DEFAULT 'pending'::public.audience_status NOT NULL,
    total_contacts numeric,
    processed_contacts numeric,
    processed_at timestamp with time zone,
    error_message text
);


--
-- Name: TABLE audience; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.audience IS 'Groups of Contacts which can be included in a Campaign.';


--
-- Name: COLUMN audience.workspace; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audience.workspace IS 'Workspace from which the contact was created';


--
-- Name: COLUMN audience.is_conditional; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audience.is_conditional IS 'Does this audience use rules detailed in `audience_rule`?';


--
-- Name: COLUMN audience.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audience.status IS 'Status of audience upload: pending, processing, completed, error';


--
-- Name: COLUMN audience.total_contacts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audience.total_contacts IS 'Total number of contacts in the audience';


--
-- Name: COLUMN audience.processed_contacts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audience.processed_contacts IS 'Number of contacts processed during upload';


--
-- Name: COLUMN audience.processed_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audience.processed_at IS 'Timestamp when processing was completed';


--
-- Name: COLUMN audience.error_message; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audience.error_message IS 'Error message if upload failed';


--
-- Name: get_audiences_by_campaign(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_audiences_by_campaign(selected_campaign_id integer) RETURNS SETOF public.audience
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT a.*
  FROM audience a
  JOIN campaign_audience cpa ON a.id = cpa.audience_id
  WHERE cpa.campaign_id = selected_campaign_id;
END;
$$;


--
-- Name: get_basic_results(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_basic_results(campaign_id_param bigint) RETURNS TABLE(disposition text, count bigint, average_call_duration interval, expected_total bigint)
    LANGUAGE plpgsql
    AS $$BEGIN
    RETURN QUERY
    WITH campaign_info AS (
        SELECT 
            id,
            dial_ratio,
            type,
            (SELECT COUNT(*) FROM campaign_queue WHERE campaign_id = cm.id) * cm.dial_ratio AS expected_total
        FROM campaign cm
        WHERE cm.id = campaign_id_param
    )
    SELECT 
        cq.disposition,
        COUNT(*) as count,
        CASE 
            WHEN ci.type <> 'message' THEN AVG(cq.ended_at - cq.created_at)
            WHEN ci.type = 'message' THEN interval '0 seconds'
            ELSE NULL
        END as average_duration,
        ci.expected_total
    FROM outreach_attempt cq
    JOIN contact c ON cq.contact_id = c.id
    CROSS JOIN campaign_info ci
    LEFT JOIN call ca ON ca.outreach_attempt_id = cq.id AND ci.type <> 'message'
    LEFT JOIN message m ON m.outreach_attempt_id = cq.id AND ci.type = 'message'
    WHERE cq.campaign_id = campaign_id_param
    GROUP BY cq.disposition, ci.expected_total, ci.type
    ORDER BY count DESC;
END;$$;


--
-- Name: call; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.call (
    sid text NOT NULL,
    date_created timestamp with time zone DEFAULT now() NOT NULL,
    date_updated timestamp with time zone,
    parent_call_sid text,
    account_sid text,
    "to" text,
    "from" text,
    phone_number_sid text,
    status public.call_status,
    start_time timestamp with time zone,
    end_time timestamp with time zone,
    duration text,
    price text,
    direction text,
    answered_by public.answered_by,
    api_version text,
    forwarded_from text,
    group_sid text,
    caller_name text,
    uri text,
    campaign_id bigint,
    contact_id bigint,
    call_duration bigint,
    recording_duration text,
    recording_sid text,
    recording_url text,
    answers jsonb DEFAULT '{}'::jsonb,
    workspace uuid,
    outreach_attempt_id bigint,
    conference_id text,
    queue_id bigint,
    is_last boolean DEFAULT false NOT NULL
);


--
-- Name: TABLE call; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.call IS 'A Call is an object that represents a connection between a telephone and Call Caster.';


--
-- Name: COLUMN call.sid; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.call.sid IS 'The unique string that created to identify this Call resource.';


--
-- Name: COLUMN call.parent_call_sid; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.call.parent_call_sid IS 'The SID that identifies the call that created this leg.';


--
-- Name: COLUMN call.account_sid; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.call.account_sid IS 'The SID of the Account   that created this Call resource';


--
-- Name: COLUMN call."to"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.call."to" IS 'The phone number, SIP address, Client identifier or SIM SID that received this call.';


--
-- Name: COLUMN call."from"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.call."from" IS 'The phone number, SIP address, Client identifier or SIM SID that made this call. ';


--
-- Name: COLUMN call.phone_number_sid; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.call.phone_number_sid IS 'If the call was inbound, this is the SID of the IncomingPhoneNumber resource that received the call. If the call was outbound, it is the SID of the OutgoingCallerId resource from which the call was placed.';


--
-- Name: COLUMN call.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.call.status IS 'The status of this call. Can be one of: queued, ringing, in-progress, canceled, completed, failed, busy, no-answer, initiated';


--
-- Name: COLUMN call.duration; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.call.duration IS 'The length of the call in seconds. This value is empty for busy, failed, unanswered, or ongoing calls.';


--
-- Name: COLUMN call.price; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.call.price IS 'The charge for this call from Twilio, in the currency associated with the account. Populated after the call is completed. May not be immediately available.';


--
-- Name: COLUMN call.direction; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.call.direction IS 'A string describing the direction of the call. Can be: inbound for inbound calls, outbound-api for calls initiated via the REST API or outbound-dial for calls initiated by a <Dial> verb. ';


--
-- Name: COLUMN call.answered_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.call.answered_by IS 'Either human or machine if this call was initiated with answering machine detection. Empty otherwise.';


--
-- Name: COLUMN call.forwarded_from; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.call.forwarded_from IS 'The forwarding phone number if this call was an incoming call forwarded from another number (depends on carrier supporting forwarding). Otherwise, empty.';


--
-- Name: COLUMN call.group_sid; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.call.group_sid IS 'The Group SID associated with this call. If no Group is associated with the call, the field is empty.';


--
-- Name: COLUMN call.caller_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.call.caller_name IS 'The caller''s name if this call was an incoming call to a phone number with caller ID Lookup enabled. Otherwise, empty.';


--
-- Name: COLUMN call.uri; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.call.uri IS 'The URI of this resource, relative to https://api.twilio.com.';


--
-- Name: COLUMN call.campaign_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.call.campaign_id IS 'The Campaign from which this call was created.';


--
-- Name: COLUMN call.contact_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.call.contact_id IS 'A unique identifier for the contact associated with this call.';


--
-- Name: COLUMN call.recording_duration; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.call.recording_duration IS 'The length of the recorded call in seconds. This value is empty for busy, failed, unanswered, or ongoing calls.';


--
-- Name: COLUMN call.recording_sid; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.call.recording_sid IS 'The unique string that is created to identify this call Recording resource.';


--
-- Name: COLUMN call.recording_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.call.recording_url IS 'The URI of this recording.';


--
-- Name: COLUMN call.workspace; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.call.workspace IS 'The Workspace to which this call is associated.';


--
-- Name: COLUMN call.is_last; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.call.is_last IS 'Designates a call as the last of it''s campaign for the purposes of marking for completion';


--
-- Name: get_calls_by_campaign(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_calls_by_campaign(selected_campaign_id bigint) RETURNS SETOF public.call
    LANGUAGE plpgsql
    AS $$
begin
  return query
  select * from call
  where campaign_id = selected_campaign_id
  or parent_call_sid in (select sid from call where campaign_id = selected_campaign_id);
end;
$$;


--
-- Name: get_campaign_attempts(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_campaign_attempts(p_campaign_id integer) RETURNS TABLE(attempt_id bigint, disposition text, attempt_result jsonb, attempt_start timestamp with time zone, call_sid text, duration_seconds bigint, answered_by text, call_start timestamp with time zone, call_end timestamp with time zone, contact_id bigint, firstname text, surname text, phone text, email text, address text, city text, opt_out boolean, created_at timestamp with time zone, workspace uuid, postal text, other_data jsonb[], province text, country text, campaign_name text, campaign_start_date timestamp with time zone, campaign_end_date timestamp with time zone, campaign_type text, campaign_status text, credits_used bigint)
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


--
-- Name: get_campaign_attempts_chunk(integer, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_campaign_attempts_chunk(p_campaign_id integer, p_limit integer, p_offset integer) RETURNS TABLE(attempt_id text, disposition text, attempt_result text, attempt_start timestamp with time zone, call_sid text, duration_seconds bigint, answered_by text, call_start timestamp with time zone, call_end timestamp with time zone, contact_id text, firstname text, surname text, phone text, email text, address text, city text, opt_out boolean, created_at timestamp with time zone, workspace text, postal text, other_data jsonb, province text, country text, campaign_name text, campaign_start_date timestamp with time zone, campaign_end_date timestamp with time zone, campaign_type text, campaign_status text, credits_used bigint)
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Set a longer timeout for this specific function call
    SET LOCAL statement_timeout = '60s';
    
    RETURN QUERY
    WITH limited_attempts AS (
        SELECT oa.*
        FROM public.outreach_attempt oa
        WHERE oa.campaign_id = p_campaign_id
        ORDER BY oa.created_at ASC
        LIMIT p_limit OFFSET p_offset
    )
    SELECT 
        la.id::TEXT as attempt_id,
        COALESCE(la.disposition, c.status::text) as disposition,
        la.result as attempt_result,
        la.created_at as attempt_start,
        c.sid as call_sid,
        COALESCE(NULLIF(c.duration, '')::bigint, 0) as duration_seconds,
        c.answered_by::text,
        COALESCE(c.start_time, c.date_created)::timestamptz as call_start,
        COALESCE(c.end_time, c.date_updated)::timestamptz as call_end,
        con.id::TEXT as contact_id,
        con.firstname,
        con.surname,
        con.phone,
        con.email,
        con.address,
        con.city,
        con.opt_out,
        con.created_at,
        con.workspace::TEXT,
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
    FROM limited_attempts la
    JOIN contact con ON con.id = la.contact_id
    JOIN campaign camp ON camp.id = la.campaign_id
    LEFT JOIN public.call c ON c.outreach_attempt_id = la.id
    ORDER BY attempt_start ASC;
END;
$$;


--
-- Name: get_campaign_attempts_count(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_campaign_attempts_count(p_campaign_id integer) RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
    total_count INTEGER;
BEGIN
    -- Set a longer timeout for this specific function call
    SET LOCAL statement_timeout = '60s';
    
    SELECT 
        COUNT(*)
    INTO total_count
    FROM public.outreach_attempt oa
    WHERE oa.campaign_id = p_campaign_id;
    
    RETURN COALESCE(total_count, 0);
END;
$$;


--
-- Name: get_campaign_audience_contacts(integer[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_campaign_audience_contacts(selected_campaign_ids integer[]) RETURNS SETOF public.campaigndata
    LANGUAGE plpgsql
    AS $$
begin
  RETURN QUERY
  select ca.campaign_id, ca.audience_id, conAud.contact_id, con.firstname, con.surname from public.campaign_audience ca
  JOIN audience aud on (ca.audience_id = aud.id)
  JOIN contact_audience conAud on (conAud.audience_id = aud.id)
  JOIN contact con on (con.id = conAud.contact_id)
  WHERE (ca.campaign_id = ANY(selected_campaign_ids));
end
$$;


--
-- Name: get_campaign_calls(uuid, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_campaign_calls(prop_workspace_id uuid, prop_campaign_id bigint) RETURNS TABLE(call_sid text, call_status public.call_status, call_direction text, call_duration integer, answered_by public.answered_by, recording_url text, call_start timestamp with time zone, call_end timestamp with time zone, attempt_id bigint, disposition text, attempt_result jsonb, current_step text, contact_id bigint, firstname text, surname text, phone text, email text, address text, city text, opt_out boolean, created_at timestamp with time zone, workspace text, postal text, other_data jsonb[], province text, country text, campaign_name text, campaign_start_date timestamp with time zone, campaign_end_date timestamp with time zone, campaign_type public.campaign_type, campaign_status public.campaign_status)
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


--
-- Name: get_campaign_messages(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_campaign_messages(prop_workspace_id uuid, prop_campaign_id integer) RETURNS TABLE(body text, direction text, status text, message_date timestamp without time zone, id integer, firstname text, surname text, phone text, email text, address text, city text, opt_out boolean, created_at timestamp without time zone, workspace text, external_id text, address_id text, postal text, other_data jsonb[], date_updated timestamp without time zone, carrier text, province text, country text, created_by text, contact_phone text, campaign_name text, campaign_start_date timestamp without time zone, campaign_end_date timestamp without time zone)
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
        cc.address_id::text,
        cc.postal,
        cc.other_data,
        cc.date_updated,
        cc.carrier,
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


--
-- Name: get_campaign_messages_chunk(integer, uuid, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_campaign_messages_chunk(prop_campaign_id integer, prop_workspace_id uuid, prop_limit integer, prop_offset integer) RETURNS TABLE(body text, direction text, status text, message_date timestamp with time zone, id text, firstname text, surname text, phone text, email text, address text, city text, opt_out boolean, created_at timestamp with time zone, workspace text, external_id text, address_id text, postal text, other_data jsonb, date_updated timestamp with time zone, carrier text, province text, country text, created_by text, contact_phone text, campaign_name text, campaign_start_date timestamp with time zone, campaign_end_date timestamp with time zone)
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Set a longer timeout for this specific function call
    SET LOCAL statement_timeout = '60s';
    
    RETURN QUERY
    WITH campaign_info AS (
        SELECT 
            id, 
            title, 
            start_date, 
            end_date + INTERVAL '5 days' AS extended_end_date,
            end_date
        FROM public.campaign 
        WHERE id = prop_campaign_id
        LIMIT 1
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
    -- Get messages with phone number patterns
    messages_with_phones AS (
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
        ORDER BY COALESCE(m.date_sent, m.date_created) ASC
        LIMIT prop_limit OFFSET prop_offset
    )
    SELECT 
        m.body,
        m.direction,
        m.status,
        m.message_date,
        cc.id::TEXT,
        cc.firstname,
        cc.surname,
        cc.phone,
        cc.email,
        cc.address,
        cc.city,
        cc.opt_out,
        cc.created_at,
        cc.workspace::TEXT,
        cc.external_id,
        cc.address_id::text,
        cc.postal,
        cc.other_data,
        cc.date_updated,
        cc.carrier,
        cc.province,
        cc.country,
        cc.created_by,
        cc.clean_phone as contact_phone,
        ci.title as campaign_name,
        ci.start_date as campaign_start_date,
        ci.end_date as campaign_end_date
    FROM messages_with_phones m
    JOIN campaign_info ci ON 1=1
    JOIN campaign_contacts cc ON (
        cc.clean_phone = m.clean_from
        OR cc.clean_phone = m.clean_to
        OR cc.clean_phone_no_country = m.clean_from
        OR cc.clean_phone_no_country = m.clean_to
        OR cc.clean_phone_with_country = m.clean_from
        OR cc.clean_phone_with_country = m.clean_to
    )
    ORDER BY m.message_date ASC
    LIMIT prop_limit;
END;
$$;


--
-- Name: get_campaign_messages_count(integer, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_campaign_messages_count(prop_campaign_id integer, prop_workspace_id uuid) RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
    total_count INTEGER;
BEGIN
    -- Set a longer timeout for this specific function call
    SET LOCAL statement_timeout = '60s';
    
    -- Get campaign dates once to avoid repeated lookups
    WITH campaign_info AS (
        SELECT 
            id, 
            start_date, 
            end_date + INTERVAL '5 days' AS extended_end_date
        FROM public.campaign 
        WHERE id = prop_campaign_id
        LIMIT 1
    ),
    -- Get relevant contacts from campaign queue first (much smaller subset)
    campaign_contacts AS (
        SELECT DISTINCT
            REGEXP_REPLACE(c.phone, '[^0-9]', '', 'g') AS clean_phone,
            SUBSTR(REGEXP_REPLACE(c.phone, '[^0-9]', '', 'g'), 2) AS clean_phone_no_country,
            CONCAT('1', REGEXP_REPLACE(c.phone, '[^0-9]', '', 'g')) AS clean_phone_with_country
        FROM public.contact c
        JOIN public.campaign_queue cq ON c.id = cq.contact_id AND cq.campaign_id = prop_campaign_id
        WHERE c.workspace = prop_workspace_id
    ),
    -- Count matching messages
    message_count AS (
        SELECT 
            COUNT(*) as total
        FROM public.message m
        JOIN campaign_info ci ON 1=1
        WHERE 
            m.workspace = prop_workspace_id
            AND m.date_created >= ci.start_date
            AND m.date_created <= ci.extended_end_date
            AND EXISTS (
                SELECT 1 
                FROM campaign_contacts cc 
                WHERE 
                    cc.clean_phone = REGEXP_REPLACE(m."from", '[^0-9]', '', 'g')
                    OR cc.clean_phone = REGEXP_REPLACE(m."to", '[^0-9]', '', 'g')
                    OR cc.clean_phone_no_country = REGEXP_REPLACE(m."from", '[^0-9]', '', 'g')
                    OR cc.clean_phone_no_country = REGEXP_REPLACE(m."to", '[^0-9]', '', 'g')
                    OR cc.clean_phone_with_country = REGEXP_REPLACE(m."from", '[^0-9]', '', 'g')
                    OR cc.clean_phone_with_country = REGEXP_REPLACE(m."to", '[^0-9]', '', 'g')
            )
    )
    SELECT total INTO total_count FROM message_count;
    
    RETURN COALESCE(total_count, 0);
END;
$$;


--
-- Name: get_campaign_queue(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_campaign_queue(campaign_id_pro integer) RETURNS TABLE(id integer, contact_id integer, phone text, workspace text, caller_id text)
    LANGUAGE plpgsql
    AS $$
begin
  update public.campaign_queue
  set
    queue_state = 'dequeued',
    assigned_to_user_id = null,
    provider_status = null,
    dequeued_at = now(),
    dequeued_reason = 'Contact opted out'
  from public.contact
  where
    campaign_queue.contact_id = contact.id
    and campaign_queue.campaign_id = campaign_id_pro
    and (campaign_queue.queue_state is null or campaign_queue.queue_state = 'queued')
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
    and campaign_queue.dequeued_at is null
    and (campaign_queue.queue_state is null or campaign_queue.queue_state = 'queued')
    and contact.phone is not null
    and contact.phone != ''
    and (contact.opt_out is null or contact.opt_out = false)
  order by
    contact.phone,
    campaign_queue.id
  limit 5;
end;
$$;


--
-- Name: get_campaign_queue(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_campaign_queue(campaign_id_pro bigint) RETURNS TABLE(id bigint, contact_id bigint, phone text, workspace text, caller_id text)
    LANGUAGE sql SECURITY DEFINER
    AS $$SELECT DISTINCT ON (contact.phone)
    campaign_queue.id,
    contact.id AS contact_id,
    contact.phone,
    contact.workspace,
    campaign.caller_id
FROM 
    campaign_queue
    JOIN contact ON campaign_queue.contact_id = contact.id
    JOIN campaign ON campaign_queue.campaign_id = campaign.id
WHERE 
    campaign_queue.campaign_id = campaign_id_pro
    AND campaign_queue.status = 'queued'
    AND contact.phone IS NOT NULL
    AND contact.phone != ''
ORDER BY 
    contact.phone, campaign_queue.id
LIMIT 5;$$;


--
-- Name: get_campaign_stats(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_campaign_stats(campaign_id_param integer) RETURNS TABLE(disposition text, count bigint, average_call_duration interval, average_wait_time interval, expected_total numeric)
    LANGUAGE plpgsql
    AS $_$DECLARE
    campaign_type TEXT;
    dial_ratio NUMERIC;
    queue_count INTEGER;
BEGIN
    -- Fetch campaign info once
    SELECT cm.type, cm.dial_ratio, COUNT(cq.id)
    INTO campaign_type, dial_ratio, queue_count
    FROM campaign cm
    LEFT JOIN campaign_queue cq ON cm.id = cq.campaign_id
    WHERE cm.id = campaign_id_param
    GROUP BY cm.id, cm.type, cm.dial_ratio;

    -- Handle case where campaign doesn't exist
    IF campaign_type IS NULL THEN
        RETURN;
    END IF;

    IF campaign_type = 'message' THEN
        RETURN QUERY
        SELECT 
            COALESCE(m.status::text, 'Unknown') as disposition,
            COUNT(*) as count,
            interval '0 seconds' as average_call_duration,
            interval '0 seconds' as average_wait_time,
            (queue_count * dial_ratio)::numeric AS expected_total
        FROM message m
        WHERE m.campaign_id = campaign_id_param
          AND m.status IS NOT NULL
        GROUP BY m.status
        ORDER BY count DESC;
    ELSE 
        RETURN QUERY
        WITH valid_durations AS (
            SELECT 
                oa.disposition,
                c.duration::numeric as duration_seconds
            FROM outreach_attempt oa
            LEFT JOIN call c ON oa.id = c.outreach_attempt_id 
            WHERE oa.campaign_id = campaign_id_param
                AND oa.disposition IS NOT NULL
                AND oa.disposition != ''
                AND c.duration IS NOT NULL
                AND c.duration != ''
                AND c.duration != '0'
                AND c.duration ~ '^[0-9]+$'
        )
        SELECT 
            COALESCE(oa.disposition, 'Unknown') as disposition,
            COUNT(*) as count,
            COALESCE(
                make_interval(
                    secs => (
                        SELECT AVG(duration_seconds)
                        FROM valid_durations vd
                        WHERE vd.disposition = oa.disposition
                    )
                ),
                interval '0 seconds'
            ) as average_call_duration,
            COALESCE(
                AVG(
                    CASE 
                        WHEN oa.answered_at IS NOT NULL AND oa.created_at IS NOT NULL AND oa.answered_at > oa.created_at 
                        THEN oa.answered_at - oa.created_at
                        ELSE NULL::interval
                    END
                ),
                interval '0 seconds'
            ) as average_wait_time,
            (queue_count * dial_ratio)::numeric AS expected_total
        FROM outreach_attempt oa
        LEFT JOIN call c ON oa.id = c.outreach_attempt_id 
        WHERE oa.campaign_id = campaign_id_param
          AND oa.disposition IS NOT NULL
          AND oa.disposition != ''
        GROUP BY oa.disposition
        ORDER BY count DESC;
    END IF;
END;$_$;


--
-- Name: campaign; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign (
    id bigint NOT NULL,
    title text DEFAULT 'unnamed campaign'::text NOT NULL,
    status public.campaign_status,
    type public.campaign_type,
    start_date timestamp with time zone DEFAULT now(),
    end_date timestamp with time zone DEFAULT (now() + '30 days'::interval),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    voicemail_file text,
    workspace uuid,
    caller_id text DEFAULT ''::text,
    group_household_queue boolean DEFAULT true NOT NULL,
    dial_type public.dial_types DEFAULT 'call'::public.dial_types,
    schedule jsonb DEFAULT '{"friday": {"active": true, "intervals": [{"end": "01:00", "start": "13:00"}]}, "monday": {"active": true, "intervals": [{"end": "01:00", "start": "13:00"}]}, "sunday": {"active": true, "intervals": [{"end": "01:00", "start": "13:00"}]}, "tuesday": {"active": true, "intervals": [{"end": "01:00", "start": "13:00"}]}, "saturday": {"active": true, "intervals": [{"end": "01:00", "start": "13:00"}]}, "thursday": {"active": true, "intervals": [{"end": "01:00", "start": "13:00"}]}, "wednesday": {"active": true, "intervals": [{"end": "01:00", "start": "13:00"}]}}'::jsonb,
    is_active boolean DEFAULT false NOT NULL,
    next_queue_order integer DEFAULT 1 NOT NULL,
    sms_send_mode text,
    sms_messaging_service_sid text,
    dial_ratio numeric DEFAULT 1 NOT NULL,
    script_id integer,
    disposition_options jsonb,
    live_questions jsonb,
    voicedrop_audio text,
    body_text text,
    message_media text[],
    CONSTRAINT campaign_sms_send_mode_check CHECK (((sms_send_mode IS NULL) OR (sms_send_mode = ANY (ARRAY['messaging_service'::text, 'from_number'::text]))))
);


--
-- Name: COLUMN campaign.group_household_queue; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.campaign.group_household_queue IS 'If `TRUE`, contacts will be grouped by their household. Households will be queued and dequeued together.';


--
-- Name: COLUMN campaign.sms_send_mode; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.campaign.sms_send_mode IS 'SMS campaigns: messaging_service vs from_number; null = legacy / follow workspace portal defaults.';


--
-- Name: COLUMN campaign.sms_messaging_service_sid; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.campaign.sms_messaging_service_sid IS 'Twilio Messaging Service SID when sms_send_mode is messaging_service.';


--
-- Name: COLUMN campaign.dial_ratio; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.campaign.dial_ratio IS 'Legacy predictive-dial setting; retained for DB RPC compatibility. Default 1.';


--
-- Name: get_campaigns_by_workspace(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_campaigns_by_workspace(workspace_id uuid) RETURNS SETOF public.campaign
    LANGUAGE plpgsql
    AS $$
begin
  RETURN QUERY
  select * from public.campaign
  WHERE (campaign.workspace = workspace_id);
end
$$;


--
-- Name: get_contacts_by_audience(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_contacts_by_audience(selected_audience_id bigint) RETURNS SETOF public.contact
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT c.*
  FROM contact c
  JOIN contact_audience ca ON c.id = ca.contact_id
  WHERE ca.audience_id = selected_audience_id;
END;
$$;


--
-- Name: get_contacts_by_campaign(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_contacts_by_campaign(selected_campaign_id integer) RETURNS SETOF public.contact
    LANGUAGE plpgsql
    AS $$BEGIN
  RETURN QUERY
  SELECT c.*
  FROM contact c
  JOIN contact_audience ca ON c.id = ca.contact_id
  JOIN campaign_audience cpa ON ca.audience_id = cpa.audience_id
  LEFT JOIN campaign_queue cq ON c.id = cq.contact_id
    AND cpa.campaign_id = cq.campaign_id
  WHERE cpa.campaign_id = selected_campaign_id
  ORDER BY 
    CASE
      WHEN cq.status IS NULL THEN 3
      WHEN cq.status = 'queued' THEN 1
      WHEN cq.status = 'dequeued' THEN 2
      ELSE 0
    END,
    COALESCE(cq.attempts, 0),
    COALESCE(cq.queue_order, 2147483647)
  LIMIT 30;
END;$$;


--
-- Name: get_contacts_by_households(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_contacts_by_households(selected_campaign_id integer, households_limit integer) RETURNS TABLE(id integer, firstname character varying, surname character varying, phone character varying, email character varying, address character varying, city character varying, carrier character varying, opt_out boolean, created_at timestamp with time zone, workspace character varying, queue_id integer, queue_order integer, attempts integer)
    LANGUAGE plpgsql
    AS $_$DECLARE
  temp_table_name TEXT := 'temp_selected_contacts_' || substring(md5(random()::text), 1, 8);
BEGIN
  -- Temporary table to store selected contacts
  EXECUTE format('CREATE TEMP TABLE %I AS
    WITH household_cte AS (
      SELECT c.id::INT AS contact_id, c.firstname::VARCHAR AS contact_firstname, c.surname::VARCHAR AS contact_surname, c.phone::VARCHAR AS contact_phone, c.email::VARCHAR AS contact_email, 
             c.address::VARCHAR AS contact_address, c.city::VARCHAR AS contact_city, c.carrier::VARCHAR AS contact_carrier, c.opt_out AS contact_opt_out, c.created_at AS contact_created_at, 
             c.workspace::VARCHAR AS contact_workspace, cq.id::INT AS cq_id, cq.queue_order::INT AS cq_queue_order, cq.attempts::INT AS cq_attempts,
             ROW_NUMBER() OVER (PARTITION BY c.address ORDER BY c.id) AS rn,
             DENSE_RANK() OVER (ORDER BY c.address) AS household_rank
      FROM contact c
      JOIN campaign_queue cq ON c.id = cq.contact_id
      JOIN contact_audience ca ON c.id = ca.contact_id
      JOIN campaign_audience cpa ON ca.audience_id = cpa.audience_id
      WHERE cq.campaign_id = $1
        AND cpa.campaign_id = $1
        AND cq.status = ''queued''
    )
    SELECT DISTINCT ON (contact_id) * FROM household_cte WHERE household_rank <= $2;', temp_table_name)
  USING selected_campaign_id, households_limit;

  -- Return the selected contacts
  RETURN QUERY EXECUTE format('
    SELECT 
      t.contact_id AS id, 
      t.contact_firstname AS firstname, 
      t.contact_surname AS surname, 
      t.contact_phone AS phone, 
      t.contact_email AS email, 
      t.contact_address AS address, 
      t.contact_city AS city, 
      t.contact_carrier AS carrier, 
      t.contact_opt_out AS opt_out, 
      t.contact_created_at AS created_at, 
      t.contact_workspace AS workspace, 
      t.cq_id AS queue_id, 
      t.cq_queue_order AS queue_order, 
      t.cq_attempts AS attempts
    FROM %I t
    ORDER BY t.contact_address, t.rn;', temp_table_name);

  -- Update the statuses to auth.uid()
  EXECUTE format('UPDATE campaign_queue
  SET status = auth.uid()
  WHERE id IN (SELECT t.cq_id FROM %I t);', temp_table_name);

  -- Drop the temporary table
  EXECUTE format('DROP TABLE %I;', temp_table_name);

END;$_$;


--
-- Name: get_conversation_summary(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_conversation_summary(p_workspace uuid) RETURNS TABLE(contact_phone text, user_phone text, conversation_start timestamp with time zone, conversation_last_update timestamp with time zone, message_count bigint, unread_count bigint, contact_firstname text, contact_surname text)
    LANGUAGE plpgsql
    AS $$BEGIN
    RETURN QUERY
    WITH conversation_summary AS (
        SELECT 
            CASE 
                WHEN m.direction = 'inbound' THEN m."from" 
                ELSE m."to" 
            END AS contact_phone,
            CASE 
                WHEN m.direction = 'inbound' THEN m."to" 
                ELSE m."from"
            END AS user_phone,
            MIN(m.date_created) AS conversation_start,
            MAX(m.date_created) AS conversation_last_update,
            COUNT(DISTINCT m.sid) AS message_count,
            SUM(CASE 
                WHEN m.direction = 'inbound' AND m.status = 'received' THEN 1 
                ELSE 0 
            END) AS unread_count
        FROM public.message m
        WHERE m.workspace = p_workspace
        GROUP BY 
            CASE WHEN m.direction = 'inbound' THEN m."from" ELSE m."to" END,
            CASE WHEN m.direction = 'inbound' THEN m."to" ELSE m."from" END
    )
    SELECT 
        cs.contact_phone,
        cs.user_phone,
        cs.conversation_start,
        cs.conversation_last_update,
        cs.message_count,
        cs.unread_count,
        c.firstname AS contact_firstname,
        c.surname AS contact_surname
    FROM conversation_summary cs
    LEFT JOIN LATERAL (
        SELECT firstname, surname 
        FROM public.contact 
        WHERE workspace = p_workspace 
        AND (phone = cs.contact_phone OR 
             phone = '+' || cs.contact_phone OR 
             phone = '+1' || cs.contact_phone)
        LIMIT 1
    ) c ON true
    ORDER BY 
        cs.unread_count DESC,
        cs.conversation_last_update DESC
        LIMIT 100;
END;$$;


--
-- Name: get_conversation_summary_by_campaign(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_conversation_summary_by_campaign(p_workspace uuid, campaign_id_prop integer) RETURNS TABLE(contact_phone text, user_phone text, conversation_start timestamp with time zone, conversation_last_update timestamp with time zone, message_count bigint, unread_count bigint, contact_firstname text, contact_surname text)
    LANGUAGE plpgsql
    AS $$begin RETURN QUERY
WITH RECURSIVE normalized_phone AS (
    SELECT id,
           workspace,
           firstname,
           surname,
           REGEXP_REPLACE(phone, '[^0-9]', '', 'g') as clean_phone
    FROM public.contact
    WHERE workspace = p_workspace  -- Add workspace filter here
),
conversation_summary AS (
    SELECT COALESCE(m.contact_id, np.id) as contact_id,
           CASE WHEN m.direction = 'inbound'::message_direction 
                THEN REGEXP_REPLACE(m."from", '[^0-9]', '', 'g')
                ELSE REGEXP_REPLACE(m."to", '[^0-9]', '', 'g')
           END as contact_phone,
           CASE WHEN m.direction = 'inbound'::message_direction 
                THEN REGEXP_REPLACE(m."to", '[^0-9]', '', 'g')
                ELSE REGEXP_REPLACE(m."from", '[^0-9]', '', 'g')
           END as user_phone,
           MIN(m.date_created) as conversation_start,
           MAX(m.date_created) as conversation_last_update,
           COUNT(*) as message_count,
           COUNT(CASE WHEN m.status = 'received' THEN 1 END) as unread_count,
           COUNT(CASE WHEN m.status = 'received' AND direction = 'inbound'::message_direction THEN 1 END) as unread_inbound_count
    FROM (
        SELECT *
        FROM public.message
        WHERE workspace = p_workspace
        AND (campaign_id = campaign_id_prop
             OR contact_id IN (
                SELECT contact_id 
                FROM public.campaign_queue 
                WHERE campaign_id = campaign_id_prop
             ))
    ) m
    LEFT JOIN normalized_phone np ON (
        np.clean_phone = REGEXP_REPLACE(m."from", '[^0-9]', '', 'g')
        OR np.clean_phone = REGEXP_REPLACE(m."to", '[^0-9]', '', 'g')
    )
    GROUP BY 1, 2, 3
)
SELECT cs.contact_phone,
       cs.user_phone,
       cs.conversation_start,
       cs.conversation_last_update,
       cs.message_count,
       cs.unread_count,
       MAX(np.firstname) as contact_firstname,
       MAX(np.surname) as contact_surname
FROM conversation_summary cs
LEFT JOIN normalized_phone np ON np.workspace = p_workspace AND np.id = cs.contact_id
GROUP BY cs.contact_id,
         cs.contact_phone,
         cs.user_phone,
         cs.conversation_start,
         cs.conversation_last_update,
         cs.message_count,
         cs.unread_count,
         cs.unread_inbound_count
ORDER BY cs.unread_inbound_count DESC,
         cs.conversation_last_update DESC
LIMIT 100;
end;$$;


--
-- Name: get_dynamic_outreach_results(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_dynamic_outreach_results(campaign_id_param integer) RETURNS TABLE(external_id text, disposition text, call_duration interval, firstname text, surname text, phone text, username text, created_at timestamp with time zone, full_result jsonb, dynamic_columns jsonb)
    LANGUAGE plpgsql
    AS $$
DECLARE
    dynamic_sql TEXT;
    column_list TEXT;
BEGIN
    -- Get the list of all unique keys from the result column
    SELECT string_agg(DISTINCT format('%L, result->>%L', key, key), ', ')
    INTO column_list
    FROM (
        SELECT jsonb_object_keys(result) AS key
        FROM outreach_attempt
        WHERE campaign_id = campaign_id_param
          AND result IS NOT NULL
          AND result != '{}'::jsonb
    ) subquery;

    -- Construct the dynamic SQL
    IF column_list IS NULL OR column_list = '' THEN
        dynamic_sql := format('
            SELECT
                c.external_id,
                oa.disposition,
                oa.ended_at - oa.created_at AS call_duration,
                c.firstname,
                c.surname,
                c.phone,
                u.username,
                oa.created_at,
                oa.result AS full_result,
                NULL::jsonb AS dynamic_columns
            FROM outreach_attempt oa
            LEFT JOIN contact c ON oa.contact_id = c.id
            LEFT JOIN public.user u ON oa.user_id = u.id::uuid
            WHERE oa.campaign_id = %s',
            campaign_id_param
        );
    ELSE
        dynamic_sql := format('
            SELECT
                c.external_id,
                oa.disposition,
                oa.ended_at - oa.created_at AS call_duration,
                c.firstname,
                c.surname,
                c.phone,
                u.username,
                oa.created_at,
                oa.result AS full_result,
                jsonb_build_object(%s) AS dynamic_columns
            FROM outreach_attempt oa
            LEFT JOIN contact c ON oa.contact_id = c.id
            LEFT JOIN public.user u ON oa.user_id = u.id::uuid
            WHERE oa.campaign_id = %s',
            column_list,
            campaign_id_param
        );
    END IF;

    -- Execute the dynamic SQL
    RETURN QUERY EXECUTE dynamic_sql;
END;
$$;


--
-- Name: get_last_online(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_last_online() RETURNS TABLE(campaign_id bigint, status text, dial_type public.dial_types, last_online text)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT ON (cq.status, cq.campaign_id)
    cq.campaign_id, 
    cq.status, 
    c.dial_type, 
    (SELECT ua.activity->'campaigns'->cq.campaign_id::text->>'last_online'
     FROM "user" ua
     WHERE ua.id = u.id AND ua.activity->'campaigns' ? cq.campaign_id::text) AS last_online
  FROM 
    campaign_queue cq
  JOIN 
    campaign c ON c.id = cq.campaign_id
  JOIN 
    "user" u ON u.id::text = cq.status
  WHERE 
    cq.status <> 'queued' 
    AND cq.status <> 'dequeued'
  ORDER BY 
    cq.status, cq.campaign_id;
END;
$$;


--
-- Name: get_outreach_attempts(integer, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_outreach_attempts(campaign_id_param integer, workspace_id_param uuid) RETURNS TABLE(id integer, disposition text, created_at timestamp without time zone, firstname text, surname text, phone text, sid integer)
    LANGUAGE plpgsql
    AS $$
DECLARE
    bind_permissions INT;
    user_workspace_roles RECORD;
    data JSONB;
    selected_workspace_id UUID := workspace_id_param; 
    requested_permission TEXT := 'workspace.call'; 
BEGIN
    -- Fetch user role once and store it to reduce number of calls
    SELECT (auth.jwt() ->> 'user_workspace_roles')::jsonb INTO data;

    -- Extract the role for the given workspace_id
    SELECT * 
    INTO user_workspace_roles
    FROM jsonb_to_recordset(data) AS x(workspace_id UUID, role public.workspace_role)
    WHERE x.workspace_id = selected_workspace_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'User role not found for the given workspace_id';
    END IF;

    -- Check permissions
    SELECT COUNT(*)
    INTO bind_permissions
    FROM public.workspace_permissions
    WHERE workspace_permissions.permission = requested_permission::public.workspace_permission
    AND workspace_permissions.role = user_workspace_roles.role;

    IF bind_permissions > 0 THEN
        RETURN QUERY
        SELECT cq.id, cq.disposition, cq.created_at, c.firstname, c.surname, c.phone, ca.sid
        FROM outreach_attempt cq
        JOIN contact c ON cq.contact_id = c.id
        JOIN call ca ON ca.outreach_attempt_id = cq.id
        WHERE cq.campaign_id = campaign_id_param;
    ELSE
        RAISE EXCEPTION 'Unauthorized';
    END IF;
END;
$$;


--
-- Name: get_outreach_data_column_definitions(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_outreach_data_column_definitions(campaign_id_param integer) RETURNS text
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
        LEFT JOIN LATERAL unnest(c.other_data) AS unnested_data ON TRUE
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


--
-- Name: get_outreach_data_column_names(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_outreach_data_column_names(campaign_id_param integer) RETURNS text
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
        LEFT JOIN LATERAL unnest(c.other_data) AS unnested_data ON TRUE
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


--
-- Name: get_outreach_data_column_structure(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_outreach_data_column_structure(campaign_id_param integer) RETURNS text
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
        LEFT JOIN LATERAL unnest(c.other_data) AS unnested_data ON TRUE
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


--
-- Name: get_outreach_results(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_outreach_results(campaign_id_param integer) RETURNS TABLE(external_id text, disposition text, call_duration interval, firstname text, surname text, phone text, full_result jsonb, dynamic_columns jsonb)
    LANGUAGE plpgsql
    AS $$
DECLARE
    dynamic_sql TEXT;
    column_list TEXT;
BEGIN
    -- Get the list of all unique keys from the result column
    SELECT string_agg(DISTINCT format('result->>%L AS %I', key, regexp_replace(key, '\W', '_', 'g')), ', ')
    INTO column_list
    FROM (
        SELECT jsonb_object_keys(result) AS key
        FROM outreach_attempt
        WHERE campaign_id = campaign_id_param
          AND result IS NOT NULL
          AND result != '{}'::jsonb
    ) subquery;

    -- Construct the dynamic SQL
    dynamic_sql := format('
        SELECT
            c.external_id,
            oa.disposition,
            oa.ended_at - oa.created_at AS call_duration,
            c.firstname,
            c.surname,
            c.phone,
            oa.result AS full_result,
            CASE WHEN %s IS NOT NULL THEN jsonb_build_object(%s) ELSE NULL END AS dynamic_columns
        FROM outreach_attempt oa
        LEFT JOIN contact c ON oa.contact_id = c.id
        WHERE oa.campaign_id = %s',
        column_list,
        CASE WHEN column_list IS NOT NULL AND column_list != '' 
             THEN regexp_replace(column_list, ' AS ', ', ', 'g')
             ELSE '' END,
        campaign_id_param
    );

    -- Execute the dynamic SQL
    RETURN QUERY EXECUTE dynamic_sql;
END;
$$;


--
-- Name: get_pivoted_outreach_data(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_pivoted_outreach_data(campaign_id_param integer) RETURNS SETOF record
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
        LEFT JOIN LATERAL unnest(c.other_data) AS unnested_data ON TRUE
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
                LEFT JOIN LATERAL unnest(c.other_data) AS unnested_data ON TRUE
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


--
-- Name: get_queued_contacts(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_queued_contacts(selected_campaign_id bigint) RETURNS TABLE(id bigint, firstname text, surname text, phone text, email text, address text, city text, carrier text, opt_out boolean, created_at timestamp with time zone, workspace uuid, queue_id bigint, queue_order bigint, attempts bigint)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT c.id, c.firstname, c.surname, c.phone, c.email, c.address, c.city, c.carrier, c.opt_out, c.created_at, c.workspace, cq.id AS queue_id, cq.queue_order as queue_order, cq.attempts as attempts
  FROM contact c
  JOIN campaign_queue cq ON c.id = cq.contact_id
  JOIN contact_audience ca ON c.id = ca.contact_id
  JOIN campaign_audience cpa ON ca.audience_id = cpa.audience_id
  WHERE cq.campaign_id = selected_campaign_id
    AND cpa.campaign_id = selected_campaign_id
    AND cq.status = 'queued';
END;
$$;


--
-- Name: get_response_version_history(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_response_version_history(response_id_param uuid) RETURNS TABLE(id uuid, prompt_id uuid, job_id uuid, provider_id uuid, content_short text, content text, content_hash text, tokens_used integer, processing_time_ms integer, created_at timestamp with time zone, created_by uuid, raw_metadata jsonb, version_number integer, changes_summary jsonb)
    LANGUAGE plpgsql
    AS $$
DECLARE
  current_id UUID := response_id_param;
  result_row RECORD;
BEGIN
  -- Start with the requested response
  LOOP
    -- Find the current response
    SELECT 
      r.id, 
      r.prompt_id, 
      r.job_id, 
      r.provider_id, 
      r.content_short, 
      r.content,
      r.content_hash, 
      r.tokens_used, 
      r.processing_time_ms, 
      r.created_at, 
      r.created_by, 
      r.raw_metadata, 
      r.version_number, 
      r.changes_summary,
      r.previous_version_id
    INTO result_row
    FROM responses r
    WHERE r.id = current_id;
    
    -- Return this row
    id := result_row.id;
    prompt_id := result_row.prompt_id;
    job_id := result_row.job_id;
    provider_id := result_row.provider_id;
    content_short := result_row.content_short;
    content := result_row.content;
    content_hash := result_row.content_hash;
    tokens_used := result_row.tokens_used;
    processing_time_ms := result_row.processing_time_ms;
    created_at := result_row.created_at;
    created_by := result_row.created_by;
    raw_metadata := result_row.raw_metadata;
    version_number := result_row.version_number;
    changes_summary := result_row.changes_summary;
    
    RETURN NEXT;
    
    -- If there's no previous version, we're done
    IF result_row.previous_version_id IS NULL THEN
      EXIT;
    END IF;
    
    -- Move to the previous version
    current_id := result_row.previous_version_id;
  END LOOP;
END;
$$;


--
-- Name: get_survey_results(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_survey_results(campaign_id_prop integer) RETURNS TABLE(outreach_attempt_id integer, contact_id integer, question_data jsonb)
    LANGUAGE plpgsql
    AS $$
DECLARE
  dynamic_sql text;
BEGIN
  WITH RankedCalls AS (
    SELECT 
      outreach_attempt.id as outreach_attempt_id,
      outreach_attempt.contact_id,
      outreach_attempt.result,
      ROW_NUMBER() OVER (
        PARTITION BY contact.id 
        ORDER BY call.duration DESC
      ) as rn
    FROM outreach_attempt
    JOIN contact ON outreach_attempt.contact_id = contact.id
    JOIN call ON call.outreach_attempt_id = outreach_attempt.id
    WHERE outreach_attempt.campaign_id = campaign_id_prop
  ),
  Unpacked AS (
    SELECT 
      rc.outreach_attempt_id,
      rc.contact_id,
      jsonb_build_object(
        'question_' || ROW_NUMBER() OVER (PARTITION BY rc.outreach_attempt_id ORDER BY page.key),
        jsonb_build_object('question', page.key, 'answer', page.value)
      ) as q_data
    FROM RankedCalls rc,
      jsonb_each_text(rc.result->'page_1') as page
    WHERE rn = 1
  )
  SELECT 
    outreach_attempt_id,
    contact_id,
    jsonb_object_agg(key, value) as question_data
  FROM (
    SELECT 
      outreach_attempt_id,
      contact_id,
      q_data
    FROM Unpacked
  ) t, jsonb_each(q_data)
  GROUP BY outreach_attempt_id, contact_id;

END;
$$;


--
-- Name: get_workspace_users(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_workspace_users(selected_workspace_id uuid) RETURNS TABLE(id uuid, username text, first_name text, last_name text, user_workspace_role public.workspace_role)
    LANGUAGE plpgsql
    AS $$
begin
  RETURN QUERY
  select U.id, U.username, U.first_name, U.last_name, WU.role from public.workspace_users WU
  JOIN public.user U on (WU.user_id = U.id)
  WHERE (WU.workspace_id = selected_workspace_id);
end
$$;


--
-- Name: handle_campaign_queue_entry(bigint, bigint, bigint, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_campaign_queue_entry(p_contact_id bigint, p_campaign_id bigint, p_queue_order bigint DEFAULT NULL::bigint, p_requeue boolean DEFAULT false) RETURNS bigint
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_existing_id bigint;
    v_new_order bigint;
BEGIN
    -- Check for existing entry
    SELECT id, queue_order INTO v_existing_id, v_new_order
    FROM campaign_queue
    WHERE contact_id = p_contact_id 
    AND campaign_id = p_campaign_id
    AND status NOT IN ('completed', 'cancelled', 'failed');

    -- If exists and not requeueing, return existing
    IF v_existing_id IS NOT NULL AND NOT p_requeue THEN
        RETURN v_existing_id;
    END IF;

    -- Get new queue order if not provided
    IF p_queue_order IS NULL THEN
        SELECT COALESCE(MAX(queue_order), 0) + 1 INTO v_new_order
        FROM campaign_queue
        WHERE campaign_id = p_campaign_id;
    ELSE
        v_new_order := p_queue_order;
    END IF;

    -- If requeueing, update existing
    IF v_existing_id IS NOT NULL AND p_requeue THEN
        UPDATE campaign_queue
        SET status = 'queued',
            queue_order = v_new_order,
            attempts = CASE WHEN p_requeue THEN attempts ELSE 0 END
        WHERE id = v_existing_id
        RETURNING id INTO v_existing_id;
        
        RETURN v_existing_id;
    END IF;

    -- Insert new entry
    INSERT INTO campaign_queue 
        (contact_id, campaign_id, queue_order, attempts, status)
    VALUES 
        (p_contact_id, p_campaign_id, v_new_order, 0, 'queued')
    RETURNING id INTO v_existing_id;

    RETURN v_existing_id;
END;
$$;


--
-- Name: inherit_parent_call_data(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.inherit_parent_call_data() RETURNS trigger
    LANGUAGE plpgsql
    AS $$DECLARE
    parent_campaign_id bigint;
    parent_workspace uuid;
    parent_contact_id bigint;
    parent_outreach_attempt_id bigint;    
BEGIN
  -- Only proceed if parent_call_sid is not NULL and not equal to the current sid (to prevent self-reference)
  IF NEW.parent_call_sid IS NOT NULL AND NEW.parent_call_sid <> NEW.sid THEN
    -- Fetch parent call data
    SELECT campaign_id, workspace, contact_id, outreach_attempt_id
    INTO parent_campaign_id, parent_workspace, parent_contact_id, parent_outreach_attempt_id
    FROM call
    WHERE sid = NEW.parent_call_sid;
    
    -- Prevent circular references by checking if the parent SID is already the current SID
    IF parent_campaign_id IS NULL AND parent_workspace IS NULL AND parent_contact_id IS NULL THEN
      RAISE EXCEPTION 'Circular reference detected';
    END IF;

    -- Inherit campaign_id if it's NULL
    IF NEW.campaign_id IS NULL THEN
      NEW.campaign_id := parent_campaign_id;
    END IF;

    -- Inherit workspace if it's NULL
    IF NEW.workspace IS NULL THEN
      NEW.workspace := parent_workspace;
    END IF;

    -- Inherit contact_id if it's NULL
    IF NEW.contact_id IS NULL THEN
      NEW.contact_id := parent_contact_id;
    END IF;

        -- Inherit outgoing_attempt_id if it's NULL
    IF NEW.outreach_attempt_id IS NULL THEN
      NEW.outreach_attempt_id := parent_outreach_attempt_id;
    END IF;

  END IF;

  RETURN NEW;
END;$$;


--
-- Name: insert_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.insert_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  insert into public.user(id, username, first_name, last_name)
  values(
    new.id,
    coalesce(new.email, new.raw_user_meta_data->>'username', ''),
    coalesce(new.raw_user_meta_data->>'first_name', ''),
    coalesce(new.raw_user_meta_data->>'last_name', '')
  );
  return new;
end;
$$;


--
-- Name: normalise_phone_key(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.normalise_phone_key(phone text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  select case
    when phone is null or trim(phone) = '' then null
    else (
      with d as (
        select regexp_replace(trim(phone), '\D', '', 'g') as digits
      )
      select case
        when length(d.digits) = 10 then '1' || d.digits
        when length(d.digits) = 11 and left(d.digits, 1) = '1' then d.digits
        else d.digits
      end
      from d
    )
  end;
$$;


--
-- Name: notify_campaign_active(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_campaign_active() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  payload jsonb;
  edge_function_url text := 'https://nolrdvpusfcsjihzhnlp.client.co/functions/v1/handle_active_change';
  api_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vbHJkdnB1c2Zjc2ppaHpobmxwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcxNTE4NDAwMCwiZXhwIjoyMDMwNzYwMDAwfQ.r346il-1piEsHSS8ji-Iy9gvtEk_IHZlj2oeqV23iaY';
BEGIN
  payload := jsonb_build_object(
    'type', TG_OP,
    'record', row_to_json(NEW),
    'old_record', CASE WHEN TG_OP = 'UPDATE' THEN row_to_json(OLD) ELSE NULL END
  );
  
  PERFORM net.http_post(
    url := edge_function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', concat('Bearer ', api_key)
    ),
    body := payload
  );
  
  RETURN NEW;
END;
$$;


--
-- Name: notify_schedule_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_schedule_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  payload jsonb;
  edge_function_url text := 'https://nolrdvpusfcsjihzhnlp.client.co/functions/v1/create_schedule_jobs';
  api_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vbHJkdnB1c2Zjc2ppaHpobmxwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcxNTE4NDAwMCwiZXhwIjoyMDMwNzYwMDAwfQ.r346il-1piEsHSS8ji-Iy9gvtEk_IHZlj2oeqV23iaY';
BEGIN
  payload := jsonb_build_object(
    'type', TG_OP,
    'record', row_to_json(NEW),
    'old_record', CASE WHEN TG_OP = 'UPDATE' THEN row_to_json(OLD) ELSE NULL END
  );
  
  PERFORM net.http_post(
    url := edge_function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', concat('Bearer ', api_key)
    ),
    body := payload
  );
  
  RETURN NEW;
END;
$$;


--
-- Name: process_existing_contacts(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.process_existing_contacts() RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    contact_aud RECORD;
BEGIN
    -- Loop through each contact-audience association
    FOR contact_aud IN
        SELECT contact_id, audience_id
        FROM public.contact_audience
    LOOP
        -- Call the function to add the contact to all relevant campaign queues
        PERFORM add_contact_to_all_campaign_queues(contact_aud.contact_id, contact_aud.audience_id);
    END LOOP;
END;
$$;


--
-- Name: process_ivr_tasks(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.process_ivr_tasks() RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
declare
queue_msgs pgmq_message[];
msg pgmq_message;
max_retries constant int := 3;
visibility_timeout constant int := 60; -- 1 minute
batch_size constant int := 10;
edge_function_url text := 'https://nolrdvpusfcsjihzhnlp.client.co/functions/v1';
api_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vbHJkdnB1c2Zjc2ppaHpobmxwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcxNTE4NDAwMCwiZXhwIjoyMDMwNzYwMDAwfQ.r346il-1piEsHSS8ji-Iy9gvtEk_IHZlj2oeqV23iaY';
retry_count int;
has_more boolean := true;
total_processed int := 0;
error_count int := 0;
requeued_count int := 0;
campaign_status text;
campaign_id numeric;

begin
  select array_agg((m.msg_id, m.message)::pgmq_message) into queue_msgs
  from pgmq.read('ivr_tasks'::text, batch_size, visibility_timeout) m;
    
  if queue_msgs is null or queue_msgs = array[]::pgmq_message[] then
    return jsonb_build_object(
      'status', 'empty',
      'processed', 0
    );
  end if;

    -- Process each message in the batch
    foreach msg in array queue_msgs
    loop
      begin
        -- Validate message
        if msg.message is null then
          raise notice 'Skipping null message for msg_id: %', msg.msg_id;
          perform pgmq.delete('ivr_tasks'::text, msg.msg_id);
          continue;
        end if;

        -- Check campaign status
        campaign_id := (msg.message->>'campaign_id')::numeric;
        select status into campaign_status
        from campaign
        where id = campaign_id;

        if campaign_status != 'running' then
          perform pgmq.delete('ivr_tasks'::text, msg.msg_id);
          continue;
        end if;

        retry_count := coalesce((msg.message->>'retry_count')::int, 0);
        
        raise notice 'Processing message: % with msg_id: %', msg.message, msg.msg_id;
        
        -- Fire and forget the Edge function call
        perform net.http_post(
          url := edge_function_url || '/ivr-handler',
          headers := jsonb_build_object(
            'Authorization', 'Bearer ' || api_key,
            'Content-Type', 'application/json'
          ),
          body := msg.message
        );
        
        perform pgmq.delete('ivr_tasks'::text, msg.msg_id);
        total_processed := total_processed + 1;

      exception when others then
        raise notice 'Error processing message: %, Error: %', msg.message, SQLERRM;
        
        if retry_count >= max_retries then
          perform pgmq.delete('ivr_tasks'::text, msg.msg_id);
          
          insert into pgmq_failed_tasks (
            queue_name,
            message_id,
            payload,
            error,
            failed_at
          ) values (
            'ivr_tasks',
            msg.msg_id::text,
            msg.message,
            SQLERRM,
            now()
          );
          
        else
          msg.message := msg.message || jsonb_build_object('retry_count', retry_count + 1);
          perform pgmq.send('ivr_tasks', msg.message);
          perform pgmq.delete('ivr_tasks'::text, msg.msg_id);
          requeued_count := requeued_count + 1;
        end if;
      end;
    end loop;

    if exists (
      select 1 
      from pgmq.messages m
      join campaign c on (m.message->>'campaign_id')::numeric = c.id
      where m.queue_name = 'ivr_tasks'
      and c.status = 'running'
    ) then
      perform net.http_post(
      url := edge_function_url || '/process-ivr',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || api_key,
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
  end if;
  return jsonb_build_object(
    'status', 'processed',
    'processed', total_processed,
    'errors', error_count,
    'requeued', requeued_count,
    'has_more', exists (
      select 1 
      from pgmq.messages m
      join campaign c on (m.message->>'campaign_id')::numeric = c.id
      where m.queue_name = 'ivr_tasks'
      and c.status = 'running'
    )
  );
end;
$$;


--
-- Name: process_ivr_tasks(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.process_ivr_tasks(batch_size integer DEFAULT 10) RETURNS SETOF jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
declare
  queue_msgs pgmq_message[];
  msg pgmq_message;
  max_retries constant int := 3;
  visibility_timeout constant int := 300; -- 5 minutes
  edge_function_url text := 'https://nolrdvpusfcsjihzhnlp.client.co/functions/v1/ivr-handler';
  api_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vbHJkdnB1c2Zjc2ppaHpobmxwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcxNTE4NDAwMCwiZXhwIjoyMDMwNzYwMDAwfQ.r346il-1piEsHSS8ji-Iy9gvtEk_IHZlj2oeqV23iaY';
  retry_count int;
  has_more boolean := true;
  total_processed int := 0;
  max_total_messages constant int := 1000; -- Safety limit to prevent infinite loops
  campaign_status text;
  campaign_id numeric;
begin
  -- Process messages in batches until queue is empty or max limit reached
  while has_more and total_processed < max_total_messages loop
    -- Read messages with visibility timeout
    select array_agg((m.msg_id, m.message)::pgmq_message) into queue_msgs
    from pgmq.read('ivr_tasks'::text, batch_size, visibility_timeout) m;
    
    if queue_msgs is null or queue_msgs = array[]::pgmq_message[] then
      has_more := false;
      raise notice 'No more messages to process after % messages', total_processed;
      return;
    end if;
    
    -- Process each message in the batch
    foreach msg in array queue_msgs
    loop
      begin
        -- Validate message
        if msg.message is null then
          raise notice 'Skipping null message for msg_id: %', msg.msg_id;
          perform pgmq.delete('ivr_tasks'::text, msg.msg_id);
          continue;
        end if;

        -- Check campaign status
        campaign_id := (msg.message->>'campaign_id')::numeric;
        select status into campaign_status
        from campaign
        where id = campaign_id;

        if campaign_status != 'running' then
          -- Campaign is no longer running, skip this message
          perform pgmq.delete('ivr_tasks'::text, msg.msg_id);
          return next jsonb_build_object(
            'status', 'skipped',
            'message', msg.message,
            'reason', 'campaign_' || campaign_status
          );
          continue;
        end if;

        -- Get or initialize retry count
        retry_count := coalesce((msg.message->>'retry_count')::int, 0);
        
        raise notice 'Processing message: % with msg_id: %', msg.message, msg.msg_id;
        
        -- Fire and forget the Edge function call
        perform net.http_post(
          url := edge_function_url,
          headers := jsonb_build_object(
            'Authorization', 'Bearer ' || api_key,
            'Content-Type', 'application/json'
          ),
          body := msg.message
        );
        
        -- Delete the message since we've sent it
        perform pgmq.delete('ivr_tasks'::text, msg.msg_id);
        total_processed := total_processed + 1;
        return next jsonb_build_object(
          'status', 'sent',
          'message', msg.message
        );
        
      exception when others then
        -- Log the error details
        raise notice 'Error processing message: %, Error: %', msg.message, SQLERRM;
        
        if retry_count >= max_retries then
          perform pgmq.delete('ivr_tasks'::text, msg.msg_id);
          
          insert into pgmq_failed_tasks (
            queue_name,
            message_id,
            payload,
            error,
            failed_at
          ) values (
            'ivr_tasks',
            msg.msg_id::text,
            msg.message,
            SQLERRM,
            now()
          );
          
          return next jsonb_build_object(
            'status', 'error',
            'message', msg.message,
            'error', SQLERRM,
            'retry_count', retry_count
          );
        else
          msg.message := msg.message || jsonb_build_object('retry_count', retry_count + 1);
          perform pgmq.send('ivr_tasks', msg.message);
          perform pgmq.delete('ivr_tasks'::text, msg.msg_id);
          
          return next jsonb_build_object(
            'status', 'requeued_after_error',
            'message', msg.message,
            'error', SQLERRM,
            'retry_count', retry_count + 1
          );
        end if;
      end;
    end loop;
  end loop;

  if total_processed >= max_total_messages then
    raise notice 'Reached maximum message limit of %. Remaining messages will be processed in next run.', max_total_messages;
  end if;
end;
$$;


--
-- Name: process_sms_tasks(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.process_sms_tasks(batch_size integer DEFAULT 10) RETURNS SETOF jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
declare
  queue_msgs pgmq_message[];
  msg pgmq_message;
  max_retries constant int := 3;
  visibility_timeout constant int := 300; -- 5 minutes
  edge_function_url text := 'https://nolrdvpusfcsjihzhnlp.client.co/functions/v1/sms-handler';
  api_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vbHJkdnB1c2Zjc2ppaHpobmxwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcxNTE4NDAwMCwiZXhwIjoyMDMwNzYwMDAwfQ.r346il-1piEsHSS8ji-Iy9gvtEk_IHZlj2oeqV23iaY';
  retry_count int;
  has_more boolean := true;
  total_processed int := 0;
  max_total_messages constant int := 1000; -- Safety limit to prevent infinite loops
  campaign_status text;
  campaign_id numeric;
begin
  -- Process messages in batches until queue is empty or max limit reached
  while has_more and total_processed < max_total_messages loop
    -- Read messages with visibility timeout
    select array_agg((m.msg_id, m.message)::pgmq_message) into queue_msgs
    from pgmq.read('sms_tasks'::text, batch_size, visibility_timeout) m;
    
    if queue_msgs is null or queue_msgs = array[]::pgmq_message[] then
      has_more := false;
      raise notice 'No more messages to process after % messages', total_processed;
      return;
    end if;
    
    -- Process each message in the batch
    foreach msg in array queue_msgs
    loop
      begin
        -- Validate message
        if msg.message is null then
          raise notice 'Skipping null message for msg_id: %', msg.msg_id;
          perform pgmq.delete('sms_tasks'::text, msg.msg_id);
          continue;
        end if;

        -- Check campaign status
        campaign_id := (msg.message->>'campaign_id')::numeric;
        select status into campaign_status
        from campaign
        where id = campaign_id;

        if campaign_status != 'running' then
          -- Campaign is no longer running, skip this message
          perform pgmq.delete('sms_tasks'::text, msg.msg_id);
          return next jsonb_build_object(
            'status', 'skipped',
            'message', msg.message,
            'reason', 'campaign_' || campaign_status
          );
          continue;
        end if;

        -- Get or initialize retry count
        retry_count := coalesce((msg.message->>'retry_count')::int, 0);
        
        raise notice 'Processing message: % with msg_id: %', msg.message, msg.msg_id;
        
        -- Fire and forget the Edge function call
        perform net.http_post(
          url := edge_function_url,
          headers := jsonb_build_object(
            'Authorization', 'Bearer ' || api_key,
            'Content-Type', 'application/json'
          ),
          body := msg.message
        );
        
        -- Delete the message since we've sent it
        perform pgmq.delete('sms_tasks'::text, msg.msg_id);
        total_processed := total_processed + 1;
        return next jsonb_build_object(
          'status', 'sent',
          'message', msg.message
        );
        
      exception when others then
        -- Log the error details
        raise notice 'Error processing message: %, Error: %', msg.message, SQLERRM;
        
        if retry_count >= max_retries then
          perform pgmq.delete('sms_tasks'::text, msg.msg_id);
          
          insert into pgmq_failed_tasks (
            queue_name,
            message_id,
            payload,
            error,
            failed_at
          ) values (
            'sms_tasks',
            msg.msg_id::text,
            msg.message,
            SQLERRM,
            now()
          );
          
          return next jsonb_build_object(
            'status', 'error',
            'message', msg.message,
            'error', SQLERRM,
            'retry_count', retry_count
          );
        else
          msg.message := msg.message || jsonb_build_object('retry_count', retry_count + 1);
          perform pgmq.send('sms_tasks', msg.message);
          perform pgmq.delete('sms_tasks'::text, msg.msg_id);
          
          return next jsonb_build_object(
            'status', 'requeued_after_error',
            'message', msg.message,
            'error', SQLERRM,
            'retry_count', retry_count + 1
          );
        end if;
      end;
    end loop;
  end loop;

  if total_processed >= max_total_messages then
    raise notice 'Reached maximum message limit of %. Remaining messages will be processed in next run.', max_total_messages;
  end if;
end;
$$;


--
-- Name: requeue_campaign_queue_contact(integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.requeue_campaign_queue_contact(queue_id_pro integer, error_text text DEFAULT NULL::text) RETURNS text
    LANGUAGE plpgsql
    AS $$
declare
  current_attempts integer;
  policy record;
begin
  select * into policy from public.campaign_queue_policy();

  select cq.attempt_count
  into current_attempts
  from public.campaign_queue cq
  where cq.id = queue_id_pro
    and cq.dequeued_at is null;

  if not found then
    return 'not_found';
  end if;

  if current_attempts >= policy.max_attempts then
    perform public.fail_campaign_queue_contact(
      queue_id_pro,
      coalesce(error_text, 'Max dispatch attempts reached'),
      null
    );
    return 'failed_max_attempts';
  end if;

  update public.campaign_queue cq
  set
    queue_state = 'queued',
    assigned_to_user_id = null,
    provider_status = null,
    claimed_at = null,
    last_attempt_at = now(),
    last_attempt_error = error_text
  where cq.id = queue_id_pro
    and cq.dequeued_at is null;

  return 'requeued';
end;
$$;


--
-- Name: reserve_campaign_queue_order_range(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reserve_campaign_queue_order_range(p_campaign_id integer, p_count integer) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: FUNCTION reserve_campaign_queue_order_range(p_campaign_id integer, p_count integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.reserve_campaign_queue_order_range(p_campaign_id integer, p_count integer) IS 'Atomically reserves and returns the first queue_order in a contiguous range for a campaign.';


--
-- Name: reset_campaign(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reset_campaign(campaign_id_prop integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
    -- Update campaign status
    UPDATE campaign 
    SET is_active = false, status = 'paused' 
    WHERE id = campaign_id_prop;
    
    -- Update campaign queue status
    UPDATE campaign_queue 
    SET status = 'queued' 
    WHERE campaign_id = campaign_id_prop;

    -- Delete outreach attempts related to the campaign
    DELETE FROM outreach_attempt 
    WHERE campaign_id = campaign_id_prop;
END;
$$;


--
-- Name: reset_stale_campaign_queue_claims(integer, interval); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reset_stale_campaign_queue_claims(campaign_id_pro integer, stale_after interval DEFAULT NULL::interval) RETURNS integer
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
    and cq.attempt_count < policy.max_attempts;

  get diagnostics reset_count = row_count;
  return reset_count;
end;
$$;


--
-- Name: seed_ontario_survey(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.seed_ontario_survey(workspace_uuid uuid) RETURNS bigint
    LANGUAGE plpgsql
    AS $_$
DECLARE
    survey_bigint_id bigint;
    page_bigint_id bigint;
    question_bigint_id bigint;
BEGIN
    -- Insert the main survey
    INSERT INTO public.survey (survey_id, title, workspace, is_active) 
    VALUES ('ontario-political-2025', 'Ontario 2025 Political Survey', workspace_uuid, true)
    RETURNING id INTO survey_bigint_id;

    -- Insert pages
    INSERT INTO public.survey_page (survey_id, page_id, title, page_order) VALUES
        (survey_bigint_id, 'support', 'Election Support', 1),
        (survey_bigint_id, 'bonnie-crombie', 'Leadership', 2),
        (survey_bigint_id, 'membership', 'Membership', 3),
        (survey_bigint_id, 'demographics', 'Demographics', 4);

    -- Insert questions for "support" page
    INSERT INTO public.survey_question (page_id, question_id, question_text, question_type, is_required, question_order)
    SELECT sp.id, 'supported-party', 'Who did you support in the 2025 election?', 'radio', true, 1
    FROM public.survey_page sp 
    WHERE sp.survey_id = survey_bigint_id AND sp.page_id = 'support';

    -- Insert options for supported-party question
    INSERT INTO public.question_option (question_id, option_value, option_label, option_order)
    SELECT sq.id, opt.value, opt.label, opt.order_num
    FROM public.survey_question sq
    CROSS JOIN (VALUES 
        ('liberal', 'Ontario Liberal Party', 1),
        ('pc', 'Progressive Conservative Party', 2),
        ('ndp', 'New Democratic Party of Ontario', 3),
        ('green', 'Green Party of Ontario', 4),
        ('didnt-vote', 'Didn''t Vote', 5),
        ('other', 'Other', 6),
        ('prefer-not', 'Prefer Not To Say', 7)
    ) AS opt(value, label, order_num)
    WHERE sq.question_id = 'supported-party' AND sq.page_id IN (
        SELECT id FROM public.survey_page WHERE survey_id = survey_bigint_id AND page_id = 'support'
    );

    -- Insert questions for "bonnie-crombie" page
    INSERT INTO public.survey_question (page_id, question_id, question_text, question_type, is_required, question_order)
    SELECT sp.id, question_id, question_text, question_type, is_required, question_order
    FROM public.survey_page sp 
    CROSS JOIN (VALUES 
        ('bonnie-job', 'Do you believe Bonnie Crombie is doing a good job as leader of the Ontario Liberal Party?', 'radio', true, 1),
        ('crombie-replacement', 'Who would you like to see replace Bonnie Crombie in a potential leadership race?', 'radio', true, 2)
    ) AS q(question_id, question_text, question_type, is_required, question_order)
    WHERE sp.survey_id = survey_bigint_id AND sp.page_id = 'bonnie-crombie';

    -- Insert options for bonnie-job question
    INSERT INTO public.question_option (question_id, option_value, option_label, option_order)
    SELECT sq.id, opt.value, opt.label, opt.order_num
    FROM public.survey_question sq
    CROSS JOIN (VALUES 
        ('yes', 'Yes', 1),
        ('no', 'No', 2),
        ('unsure', 'Unsure', 3)
    ) AS opt(value, label, order_num)
    WHERE sq.question_id = 'bonnie-job' AND sq.page_id IN (
        SELECT id FROM public.survey_page WHERE survey_id = survey_bigint_id AND page_id = 'bonnie-crombie'
    );

    -- Insert options for crombie-replacement question
    INSERT INTO public.question_option (question_id, option_value, option_label, option_order)
    SELECT sq.id, opt.value, opt.label, opt.order_num
    FROM public.survey_question sq
    CROSS JOIN (VALUES 
        ('nate-erskine-smith', 'Nate Erskine-Smith', 1),
        ('karina-gould', 'Karina Gould', 2),
        ('ana-bailao', 'Ana Bailao', 3),
        ('navdeep-bains', 'Navdeep Bains', 4),
        ('prefer-not', 'Prefer Not To Say', 5),
        ('other', 'Other (write in)', 6)
    ) AS opt(value, label, order_num)
    WHERE sq.question_id = 'crombie-replacement' AND sq.page_id IN (
        SELECT id FROM public.survey_page WHERE survey_id = survey_bigint_id AND page_id = 'bonnie-crombie'
    );

    -- Insert questions for "membership" page
    INSERT INTO public.survey_question (page_id, question_id, question_text, question_type, is_required, question_order)
    SELECT sp.id, question_id, question_text, question_type, is_required, question_order
    FROM public.survey_page sp 
    CROSS JOIN (VALUES 
        ('liberal-member', 'Are you a member of the Ontario Liberal Party?', 'radio', true, 1),
        ('attend-agm', 'If yes, do you plan to attend the upcoming AGM?', 'radio', false, 2)
    ) AS q(question_id, question_text, question_type, is_required, question_order)
    WHERE sp.survey_id = survey_bigint_id AND sp.page_id = 'membership';

    -- Insert options for liberal-member question
    INSERT INTO public.question_option (question_id, option_value, option_label, option_order)
    SELECT sq.id, opt.value, opt.label, opt.order_num
    FROM public.survey_question sq
    CROSS JOIN (VALUES 
        ('yes', 'Yes', 1),
        ('no', 'No', 2)
    ) AS opt(value, label, order_num)
    WHERE sq.question_id = 'liberal-member' AND sq.page_id IN (
        SELECT id FROM public.survey_page WHERE survey_id = survey_bigint_id AND page_id = 'membership'
    );

    -- Insert options for attend-agm question
    INSERT INTO public.question_option (question_id, option_value, option_label, option_order)
    SELECT sq.id, opt.value, opt.label, opt.order_num
    FROM public.survey_question sq
    CROSS JOIN (VALUES 
        ('yes', 'Yes', 1),
        ('no', 'No', 2),
        ('unsure', 'Unsure', 3)
    ) AS opt(value, label, order_num)
    WHERE sq.question_id = 'attend-agm' AND sq.page_id IN (
        SELECT id FROM public.survey_page WHERE survey_id = survey_bigint_id AND page_id = 'membership'
    );

    -- Insert questions for "demographics" page
    INSERT INTO public.survey_question (page_id, question_id, question_text, question_type, is_required, question_order)
    SELECT sp.id, question_id, question_text, question_type, is_required, question_order
    FROM public.survey_page sp 
    CROSS JOIN (VALUES 
        ('postal-code', 'What is your postal code?', 'text', false, 1),
        ('age-group', 'What is your age group?', 'radio', false, 2),
        ('income', 'What is your annual household income?', 'radio', false, 3),
        ('marital-status', 'What is your marital status?', 'radio', false, 4),
        ('education', 'What is your highest level of education?', 'radio', false, 5),
        ('gender-identity', 'What is your gender identity?', 'radio', false, 6)
    ) AS q(question_id, question_text, question_type, is_required, question_order)
    WHERE sp.survey_id = survey_bigint_id AND sp.page_id = 'demographics';

    -- Insert options for age-group question
    INSERT INTO public.question_option (question_id, option_value, option_label, option_order)
    SELECT sq.id, opt.value, opt.label, opt.order_num
    FROM public.survey_question sq
    CROSS JOIN (VALUES 
        ('18-24', '18-24', 1),
        ('25-34', '25-34', 2),
        ('35-44', '35-44', 3),
        ('45-54', '45-54', 4),
        ('55-64', '55-64', 5),
        ('65-plus', '65+', 6),
        ('prefer-not', 'Prefer not to say', 7)
    ) AS opt(value, label, order_num)
    WHERE sq.question_id = 'age-group' AND sq.page_id IN (
        SELECT id FROM public.survey_page WHERE survey_id = survey_bigint_id AND page_id = 'demographics'
    );

    -- Insert options for income question
    INSERT INTO public.question_option (question_id, option_value, option_label, option_order)
    SELECT sq.id, opt.value, opt.label, opt.order_num
    FROM public.survey_question sq
    CROSS JOIN (VALUES 
        ('under-30k', 'Under $30,000', 1),
        ('30k-50k', '$30,000 - $49,999', 2),
        ('50k-75k', '$50,000 - $74,999', 3),
        ('75k-100k', '$75,000 - $99,999', 4),
        ('100k-150k', '$100,000 - $149,999', 5),
        ('150k-plus', '$150,000+', 6),
        ('prefer-not', 'Prefer not to say', 7)
    ) AS opt(value, label, order_num)
    WHERE sq.question_id = 'income' AND sq.page_id IN (
        SELECT id FROM public.survey_page WHERE survey_id = survey_bigint_id AND page_id = 'demographics'
    );

    -- Insert options for marital-status question
    INSERT INTO public.question_option (question_id, option_value, option_label, option_order)
    SELECT sq.id, opt.value, opt.label, opt.order_num
    FROM public.survey_question sq
    CROSS JOIN (VALUES 
        ('single', 'Single', 1),
        ('married', 'Married', 2),
        ('common-law', 'Common-law', 3),
        ('divorced', 'Divorced', 4),
        ('widowed', 'Widowed', 5),
        ('prefer-not', 'Prefer not to say', 6)
    ) AS opt(value, label, order_num)
    WHERE sq.question_id = 'marital-status' AND sq.page_id IN (
        SELECT id FROM public.survey_page WHERE survey_id = survey_bigint_id AND page_id = 'demographics'
    );

    -- Insert options for education question
    INSERT INTO public.question_option (question_id, option_value, option_label, option_order)
    SELECT sq.id, opt.value, opt.label, opt.order_num
    FROM public.survey_question sq
    CROSS JOIN (VALUES 
        ('high-school', 'High school or less', 1),
        ('some-college', 'Some college/university', 2),
        ('college-diploma', 'College diploma', 3),
        ('bachelors', 'Bachelor''s degree', 4),
        ('masters', 'Master''s degree', 5),
        ('doctorate', 'Doctorate', 6),
        ('prefer-not', 'Prefer not to say', 7)
    ) AS opt(value, label, order_num)
    WHERE sq.question_id = 'education' AND sq.page_id IN (
        SELECT id FROM public.survey_page WHERE survey_id = survey_bigint_id AND page_id = 'demographics'
    );

    -- Insert options for gender-identity question
    INSERT INTO public.question_option (question_id, option_value, option_label, option_order)
    SELECT sq.id, opt.value, opt.label, opt.order_num
    FROM public.survey_question sq
    CROSS JOIN (VALUES 
        ('male', 'Male', 1),
        ('female', 'Female', 2),
        ('non-binary', 'Non-binary', 3),
        ('transgender', 'Transgender', 4),
        ('other', 'Other', 5),
        ('prefer-not', 'Prefer not to say', 6)
    ) AS opt(value, label, order_num)
    WHERE sq.question_id = 'gender-identity' AND sq.page_id IN (
        SELECT id FROM public.survey_page WHERE survey_id = survey_bigint_id AND page_id = 'demographics'
    );

    RETURN survey_bigint_id;
END;
$_$;


--
-- Name: select_and_update_campaign_contacts(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.select_and_update_campaign_contacts(p_campaign_id integer, p_initial_limit integer) RETURNS TABLE(queue_id integer, contact_id integer)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_user_id TEXT;
BEGIN
    -- Get the current user ID
    v_user_id := auth.uid();
    
    -- Return empty result if no valid user
    IF v_user_id IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    WITH base_contacts AS (
        SELECT
            cq.id::INTEGER AS queue_id,
            c.id::INTEGER AS contact_id,
            CASE 
                WHEN c.address IS NULL OR c.address = '' THEN 'NO_ADDRESS_' || c.id::TEXT
                ELSE c.address 
            END AS effective_address,
            ROW_NUMBER() OVER (
                ORDER BY cq.attempts ASC, cq.queue_order ASC, c.id
            ) AS overall_rank,
            CASE 
                WHEN c.address IS NULL OR c.address = '' THEN 1
                ELSE 0
            END as is_no_address
        FROM
            campaign_queue cq
            JOIN contact c ON c.id = cq.contact_id
        WHERE
            cq.campaign_id = p_campaign_id
            AND cq.status = 'queued'
            AND c.phone IS NOT NULL
            AND c.phone != ''
    ),
    address_groups AS (
        SELECT 
            effective_address,
            MIN(overall_rank) as first_rank,
            COUNT(*) as address_count,
            MAX(is_no_address) as is_no_address
        FROM base_contacts
        GROUP BY effective_address
    ),
    running_totals AS (
        SELECT 
            effective_address,
            first_rank,
            address_count,
            is_no_address,
            SUM(CASE WHEN is_no_address = 1 THEN 1 ELSE address_count END) OVER (
                ORDER BY first_rank
                ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
            ) as running_total
        FROM address_groups
    )
    UPDATE campaign_queue cq
    SET status = v_user_id
    FROM base_contacts bc
    JOIN running_totals rt ON bc.effective_address = rt.effective_address
    WHERE cq.id = bc.queue_id
    AND (
        -- For addresses with no address, take only if within limit
        (rt.is_no_address = 1 AND bc.overall_rank <= p_initial_limit)
        OR
        -- For real addresses, take the whole household if it starts within limit
        (rt.is_no_address = 0 AND rt.running_total <= p_initial_limit)
    )
    RETURNING bc.queue_id::INTEGER, bc.contact_id::INTEGER;

END;$$;


--
-- Name: test_authorize(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.test_authorize() RETURNS boolean
    LANGUAGE plpgsql
    AS $$
declare
  get_workspace_id uuid;
begin
  select ca.workspace into get_workspace_id from campaign ca
  WHERE (ca.id = 1);

  -- RAISE EXCEPTION 'workspace_id: %', get_workspace_id;
  -- return false;
  return authorize(selected_workspace_id => get_workspace_id::uuid, requested_permission => 'workspace.call'::public.workspace_permission);
end
$$;


--
-- Name: transaction_history_update_credits(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.transaction_history_update_credits() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  update public.workspace
  set credits = coalesce(credits, 0) + new.amount
  where id = new.workspace;
  return new;
end;
$$;


--
-- Name: trigger_add_contact_to_queues(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trigger_add_contact_to_queues() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    PERFORM add_contact_to_all_campaign_queues(NEW.contact_id, NEW.audience_id);
    RETURN NEW;
END;
$$;


--
-- Name: try_complete_campaign_if_drained(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.try_complete_campaign_if_drained(campaign_id_pro integer) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
declare
  pending boolean;
begin
  select public.campaign_queue_has_pending_work(campaign_id_pro)
  into pending;

  if pending then
    return false;
  end if;

  update public.campaign
  set status = 'complete'
  where id = campaign_id_pro
    and is_active = true;

  return true;
end;
$$;


--
-- Name: update_column_value(text, text, integer, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_column_value(p_table_name text, p_column_name text, p_id integer, p_increment boolean) RETURNS void
    LANGUAGE plpgsql
    AS $_$
DECLARE
    sql_query text;
BEGIN
    IF p_increment THEN
        sql_query := format('UPDATE %I SET %I = %I + 1 WHERE id = $1', p_table_name, p_column_name, p_column_name);
    ELSE
        sql_query := format('UPDATE %I SET %I = %I - 1 WHERE id = $1', p_table_name, p_column_name, p_column_name);
    END IF;

    EXECUTE sql_query USING p_id;
END;
$_$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: update_user_workspace_last_access_time(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_user_workspace_last_access_time(selected_workspace_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  UPDATE public.workspace_users SET last_accessed = NOW()
  WHERE workspace_users.user_id = auth.uid() AND workspace_users.workspace_id = selected_workspace_id;
end;
$$;


--
-- Name: update_workspace_credits(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_workspace_credits() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$BEGIN
    UPDATE public.workspace
    SET credits = credits + NEW.amount
    WHERE id = NEW.workspace;
    
    IF (SELECT credits FROM public.workspace WHERE id = NEW.workspace) <= 0 THEN
        UPDATE public.campaign
        SET is_active = false
        WHERE workspace_id = NEW.workspace;
    END IF;
    
    RETURN NEW;
END;$$;


--
-- Name: audience_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.audience ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.audience_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: audience_upload; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audience_upload (
    id bigint NOT NULL,
    audience_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    status text,
    file_name text,
    file_size bigint,
    total_contacts bigint,
    processed_contacts bigint,
    processed_at timestamp with time zone,
    error_message text,
    created_by uuid,
    header_mapping jsonb DEFAULT '{}'::jsonb NOT NULL,
    split_name_column text,
    workspace uuid NOT NULL
);


--
-- Name: audience_upload_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.audience_upload ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.audience_upload_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: campaign_audience; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_audience (
    campaign_id bigint NOT NULL,
    audience_id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: campaign_audiences_campaign_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.campaign_audience ALTER COLUMN campaign_id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.campaign_audiences_campaign_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: campaign_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_queue (
    id bigint NOT NULL,
    contact_id bigint NOT NULL,
    campaign_id bigint NOT NULL,
    queue_order bigint,
    attempts bigint DEFAULT '0'::bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    dequeued_by uuid,
    dequeued_at timestamp with time zone,
    dequeued_reason text,
    queue_state text,
    assigned_to_user_id uuid,
    provider_status text,
    claimed_at timestamp with time zone,
    attempt_count integer DEFAULT 0 NOT NULL,
    last_attempt_at timestamp with time zone,
    last_attempt_error text
);


--
-- Name: campaign_queue_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.campaign_queue ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.campaign_queue_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: campaigns_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.campaign ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.campaigns_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: contact_audience; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_audience (
    contact_id bigint NOT NULL,
    audience_id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: contact_audiences_contact_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.contact_audience ALTER COLUMN contact_id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.contact_audiences_contact_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: contacts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.contact ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.contacts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: handset_session; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.handset_session (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    client_identity text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    CONSTRAINT handset_session_status_check CHECK ((status = ANY (ARRAY['active'::text, 'ended'::text])))
);


--
-- Name: households; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.households (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    household_key text NOT NULL,
    workspace_id uuid,
    address text,
    city text,
    province text,
    postal text,
    do_not_knock boolean DEFAULT false NOT NULL,
    last_contacted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: message; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message (
    body text,
    num_segments text,
    direction public.message_direction,
    "from" text,
    "to" text,
    date_updated timestamp with time zone,
    price text,
    error_message text,
    uri text,
    account_sid text,
    num_media text,
    status public.message_status,
    messaging_service_sid text,
    date_sent timestamp with time zone,
    date_created timestamp with time zone DEFAULT now(),
    error_code bigint,
    price_unit text,
    api_version text,
    subresource_uris jsonb,
    campaign_id bigint,
    workspace uuid NOT NULL,
    contact_id bigint,
    sid text NOT NULL,
    outreach_attempt_id bigint,
    inbound_media text[],
    outbound_media text[],
    queue_id bigint
);


--
-- Name: outreach_attempt; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outreach_attempt (
    id bigint NOT NULL,
    contact_id bigint NOT NULL,
    campaign_id bigint NOT NULL,
    result jsonb DEFAULT '{}'::jsonb NOT NULL,
    disposition text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid,
    ended_at timestamp with time zone,
    answered_at timestamp with time zone,
    workspace uuid DEFAULT gen_random_uuid() NOT NULL,
    current_step text
);


--
-- Name: outreach_attempt_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.outreach_attempt ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.outreach_attempt_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: pgmq_failed_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pgmq_failed_tasks (
    id bigint NOT NULL,
    queue_name text NOT NULL,
    message_id text NOT NULL,
    payload jsonb NOT NULL,
    error text,
    failed_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: pgmq_failed_tasks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pgmq_failed_tasks_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pgmq_failed_tasks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pgmq_failed_tasks_id_seq OWNED BY public.pgmq_failed_tasks.id;


--
-- Name: question_option; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.question_option (
    id bigint NOT NULL,
    question_id bigint NOT NULL,
    option_value character varying(255) NOT NULL,
    option_label text NOT NULL,
    option_order integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: question_option_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.question_option ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.question_option_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: response_answer; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.response_answer (
    id bigint NOT NULL,
    response_id bigint NOT NULL,
    question_id bigint NOT NULL,
    answer_value text NOT NULL,
    answered_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: response_answer_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.response_answer ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.response_answer_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: script; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.script (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    workspace uuid,
    created_by uuid,
    updated_at timestamp with time zone,
    updated_by uuid,
    type text,
    steps jsonb,
    name text DEFAULT '""'::text NOT NULL
);


--
-- Name: script_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.script ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.script_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: survey; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.survey (
    id bigint NOT NULL,
    survey_id character varying(255) NOT NULL,
    title text DEFAULT 'unnamed survey'::text NOT NULL,
    workspace uuid NOT NULL,
    is_active boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: survey_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.survey ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.survey_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: survey_page; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.survey_page (
    id bigint NOT NULL,
    survey_id bigint NOT NULL,
    page_id character varying(255) NOT NULL,
    title text NOT NULL,
    page_order integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: survey_page_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.survey_page ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.survey_page_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: survey_question; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.survey_question (
    id bigint NOT NULL,
    page_id bigint NOT NULL,
    question_id character varying(255) NOT NULL,
    question_text text NOT NULL,
    question_type character varying(50) NOT NULL,
    is_required boolean DEFAULT false NOT NULL,
    question_order integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT survey_question_question_type_check CHECK (((question_type)::text = ANY (ARRAY[('text'::character varying)::text, ('radio'::character varying)::text, ('checkbox'::character varying)::text, ('textarea'::character varying)::text])))
);


--
-- Name: survey_question_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.survey_question ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.survey_question_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: survey_response; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.survey_response (
    id bigint NOT NULL,
    survey_id bigint NOT NULL,
    result_id character varying(255) NOT NULL,
    contact_id bigint,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    last_page_completed character varying(255),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: survey_response_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.survey_response ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.survey_response_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: transaction_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transaction_history (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    workspace uuid NOT NULL,
    type public.transaction_type NOT NULL,
    amount numeric DEFAULT '0'::numeric NOT NULL,
    note text,
    idempotency_key text
);


--
-- Name: transaction_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.transaction_history ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.transaction_history_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: user; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."user" (
    access_level text DEFAULT 'standard'::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    id uuid NOT NULL,
    username text DEFAULT ''::text NOT NULL,
    first_name text,
    last_name text,
    verified_audio_numbers text[] DEFAULT '{}'::text[]
);


--
-- Name: COLUMN "user".username; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."user".username IS 'The user''s display name';


--
-- Name: COLUMN "user".first_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."user".first_name IS 'The user''s first name';


--
-- Name: COLUMN "user".last_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."user".last_name IS 'The user''s last name';


--
-- Name: verification_session; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.verification_session (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    expected_caller text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT verification_session_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'verified'::text, 'expired'::text])))
);


--
-- Name: webhook; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook (
    id bigint NOT NULL,
    workspace uuid NOT NULL,
    type text DEFAULT 'outreach_attempt'::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    destination_url text NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone,
    custom_headers jsonb DEFAULT '{}'::jsonb NOT NULL,
    events jsonb DEFAULT '{}'::jsonb
);


--
-- Name: webhooks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.webhook ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.webhooks_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: workspace; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspace (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    owner uuid,
    users uuid[],
    name text DEFAULT '''Test Workspace''::text'::text NOT NULL,
    twilio_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    key text,
    token text,
    stripe_id text,
    disabled boolean DEFAULT false NOT NULL,
    feature_flags jsonb DEFAULT '{"ivr": {"campaign": true}, "sms": {"chat": true, "campaign": true}, "call": {"dial": true, "campaign": true}, "webhooks": {"campaign": true, "workspace": true}}'::jsonb NOT NULL,
    credits numeric DEFAULT '0'::numeric NOT NULL
);


--
-- Name: TABLE workspace; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.workspace IS 'The organization unit connecting users to their audiences, campaigns, contacts, etc.';


--
-- Name: COLUMN workspace.users; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.workspace.users IS 'Users who can access this workspace';


--
-- Name: COLUMN workspace.name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.workspace.name IS 'The name of this workspace';


--
-- Name: workspace_api_key; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspace_api_key (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    key_prefix text NOT NULL,
    key_hash text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone
);


--
-- Name: workspace_invite; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspace_invite (
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    workspace uuid DEFAULT gen_random_uuid() NOT NULL,
    role public.workspace_role DEFAULT 'member'::public.workspace_role NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    "isNew" boolean DEFAULT true NOT NULL
);


--
-- Name: TABLE workspace_invite; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.workspace_invite IS 'Table for holding workspace invites. All invites are NONCEs and  should be deleted after an expiry period or upon use';


--
-- Name: workspace_number; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspace_number (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    workspace uuid NOT NULL,
    friendly_name text,
    phone_number text,
    capabilities jsonb,
    type text NOT NULL,
    inbound_action text,
    inbound_audio text,
    handset_enabled boolean DEFAULT false NOT NULL,
    inbound_ring_count integer DEFAULT 4 NOT NULL,
    CONSTRAINT workspace_number_inbound_ring_count_check CHECK (((inbound_ring_count >= 1) AND (inbound_ring_count <= 10)))
);


--
-- Name: TABLE workspace_number; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.workspace_number IS 'The phone # and related info associated with each workspace';


--
-- Name: workspace_number_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.workspace_number ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.workspace_number_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: workspace_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspace_users (
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    role public.workspace_role DEFAULT 'caller'::public.workspace_role NOT NULL,
    id bigint NOT NULL,
    last_accessed timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE workspace_users; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.workspace_users IS 'Describes which users belong to which workspaces and what their roles are';


--
-- Name: COLUMN workspace_users.role; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.workspace_users.role IS 'The users role in this workspace that determines their permissions';


--
-- Name: COLUMN workspace_users.last_accessed; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.workspace_users.last_accessed IS 'The last date the user accessed this workspace on';


--
-- Name: workspace_users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.workspace_users ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.workspace_users_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: schema_migrations; Type: TABLE; Schema: AUTH_migrations; Owner: -
--

CREATE TABLE AUTH_migrations.schema_migrations (
    version text NOT NULL
);


--
-- Name: pgmq_failed_tasks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pgmq_failed_tasks ALTER COLUMN id SET DEFAULT nextval('public.pgmq_failed_tasks_id_seq'::regclass);


--
-- Name: audience audience_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audience
    ADD CONSTRAINT audience_pkey PRIMARY KEY (id);


--
-- Name: audience_upload audience_upload_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audience_upload
    ADD CONSTRAINT audience_upload_pkey PRIMARY KEY (id);


--
-- Name: call calls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call
    ADD CONSTRAINT calls_pkey PRIMARY KEY (sid);


--
-- Name: campaign_audience campaign_audience_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_audience
    ADD CONSTRAINT campaign_audience_pkey PRIMARY KEY (campaign_id, audience_id);


--
-- Name: campaign_queue campaign_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_queue
    ADD CONSTRAINT campaign_queue_pkey PRIMARY KEY (id);


--
-- Name: campaign campaign_unique_name_by_workspace; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign
    ADD CONSTRAINT campaign_unique_name_by_workspace UNIQUE (title, workspace);


--
-- Name: campaign campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign
    ADD CONSTRAINT campaigns_pkey PRIMARY KEY (id);


--
-- Name: contact_audience contact_audiences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_audience
    ADD CONSTRAINT contact_audiences_pkey PRIMARY KEY (contact_id, audience_id);


--
-- Name: contact contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact
    ADD CONSTRAINT contacts_pkey PRIMARY KEY (id);


--
-- Name: handset_session handset_session_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.handset_session
    ADD CONSTRAINT handset_session_pkey PRIMARY KEY (id);


--
-- Name: households households_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.households
    ADD CONSTRAINT households_pkey PRIMARY KEY (id);


--
-- Name: message message_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message
    ADD CONSTRAINT message_pkey PRIMARY KEY (sid);


--
-- Name: message message_sid_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message
    ADD CONSTRAINT message_sid_key UNIQUE (sid);


--
-- Name: outreach_attempt outreach_attempt_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_attempt
    ADD CONSTRAINT outreach_attempt_pkey PRIMARY KEY (id);


--
-- Name: pgmq_failed_tasks pgmq_failed_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pgmq_failed_tasks
    ADD CONSTRAINT pgmq_failed_tasks_pkey PRIMARY KEY (id);


--
-- Name: question_option question_option_unique_value_by_question; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.question_option
    ADD CONSTRAINT question_option_unique_value_by_question UNIQUE (question_id, option_value);


--
-- Name: question_option question_options_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.question_option
    ADD CONSTRAINT question_options_pkey PRIMARY KEY (id);


--
-- Name: response_answer response_answer_unique_question_by_response; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.response_answer
    ADD CONSTRAINT response_answer_unique_question_by_response UNIQUE (response_id, question_id);


--
-- Name: response_answer response_answers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.response_answer
    ADD CONSTRAINT response_answers_pkey PRIMARY KEY (id);


--
-- Name: script script_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.script
    ADD CONSTRAINT script_pkey PRIMARY KEY (id);


--
-- Name: survey_page survey_page_unique_page_by_survey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_page
    ADD CONSTRAINT survey_page_unique_page_by_survey UNIQUE (survey_id, page_id);


--
-- Name: survey_page survey_pages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_page
    ADD CONSTRAINT survey_pages_pkey PRIMARY KEY (id);


--
-- Name: survey_question survey_question_unique_question_by_page; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_question
    ADD CONSTRAINT survey_question_unique_question_by_page UNIQUE (page_id, question_id);


--
-- Name: survey_question survey_questions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_question
    ADD CONSTRAINT survey_questions_pkey PRIMARY KEY (id);


--
-- Name: survey_response survey_response_unique_result_by_survey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_response
    ADD CONSTRAINT survey_response_unique_result_by_survey UNIQUE (survey_id, result_id);


--
-- Name: survey_response survey_responses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_response
    ADD CONSTRAINT survey_responses_pkey PRIMARY KEY (id);


--
-- Name: survey survey_unique_id_by_workspace; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey
    ADD CONSTRAINT survey_unique_id_by_workspace UNIQUE (survey_id, workspace);


--
-- Name: survey surveys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey
    ADD CONSTRAINT surveys_pkey PRIMARY KEY (id);


--
-- Name: transaction_history transaction_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transaction_history
    ADD CONSTRAINT transaction_history_pkey PRIMARY KEY (id);


--
-- Name: workspace_number unique_workspace_phone_number; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_number
    ADD CONSTRAINT unique_workspace_phone_number UNIQUE (workspace, phone_number);


--
-- Name: user user_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."user"
    ADD CONSTRAINT user_pkey PRIMARY KEY (id);


--
-- Name: user user_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."user"
    ADD CONSTRAINT user_username_key UNIQUE (username);


--
-- Name: verification_session verification_session_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verification_session
    ADD CONSTRAINT verification_session_pkey PRIMARY KEY (id);


--
-- Name: webhook webhooks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook
    ADD CONSTRAINT webhooks_pkey PRIMARY KEY (id);


--
-- Name: workspace_api_key workspace_api_key_key_prefix_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_api_key
    ADD CONSTRAINT workspace_api_key_key_prefix_unique UNIQUE (key_prefix);


--
-- Name: workspace_api_key workspace_api_key_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_api_key
    ADD CONSTRAINT workspace_api_key_pkey PRIMARY KEY (id);


--
-- Name: workspace_invite workspace_invite_nonce_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_invite
    ADD CONSTRAINT workspace_invite_nonce_key UNIQUE (id);


--
-- Name: workspace_invite workspace_invite_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_invite
    ADD CONSTRAINT workspace_invite_pkey PRIMARY KEY (id);


--
-- Name: workspace_invite workspace_invite_user_workspace_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_invite
    ADD CONSTRAINT workspace_invite_user_workspace_unique UNIQUE (user_id, workspace);


--
-- Name: workspace workspace_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace
    ADD CONSTRAINT workspace_key_key UNIQUE (key);


--
-- Name: workspace_number workspace_number_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_number
    ADD CONSTRAINT workspace_number_pkey PRIMARY KEY (id);


--
-- Name: workspace workspace_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace
    ADD CONSTRAINT workspace_pkey PRIMARY KEY (id);


--
-- Name: workspace workspace_stripe_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace
    ADD CONSTRAINT workspace_stripe_id_key UNIQUE (stripe_id);


--
-- Name: workspace workspace_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace
    ADD CONSTRAINT workspace_token_key UNIQUE (token);


--
-- Name: workspace_users workspace_user_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_users
    ADD CONSTRAINT workspace_user_unique UNIQUE (workspace_id, user_id);


--
-- Name: workspace_users workspace_users_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_users
    ADD CONSTRAINT workspace_users_id_key UNIQUE (id);


--
-- Name: workspace_users workspace_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_users
    ADD CONSTRAINT workspace_users_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: AUTH_migrations; Owner: -
--

ALTER TABLE ONLY AUTH_migrations.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: audience_upload_audience_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audience_upload_audience_id_idx ON public.audience_upload USING btree (audience_id);


--
-- Name: audience_upload_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audience_upload_status_idx ON public.audience_upload USING btree (status);


--
-- Name: audience_upload_workspace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audience_upload_workspace_idx ON public.audience_upload USING btree (workspace);


--
-- Name: audience_workspace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audience_workspace_idx ON public.audience USING btree (workspace);


--
-- Name: call_outreach_attempt_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX call_outreach_attempt_id_idx ON public.call USING btree (outreach_attempt_id);


--
-- Name: campaign_queue_campaign_assigned_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX campaign_queue_campaign_assigned_user_idx ON public.campaign_queue USING btree (campaign_id, assigned_to_user_id) WHERE (assigned_to_user_id IS NOT NULL);


--
-- Name: campaign_queue_campaign_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX campaign_queue_campaign_id_idx ON public.campaign_queue USING btree (campaign_id);


--
-- Name: campaign_queue_campaign_state_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX campaign_queue_campaign_state_idx ON public.campaign_queue USING btree (campaign_id, queue_state);


--
-- Name: campaign_workspace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX campaign_workspace_idx ON public.campaign USING btree (workspace);


--
-- Name: contact_audience_audience_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contact_audience_audience_id_idx ON public.contact_audience USING btree (audience_id);


--
-- Name: contact_audience_contact_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contact_audience_contact_id_idx ON public.contact_audience USING btree (contact_id);


--
-- Name: contact_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contact_created_at_idx ON public.contact USING btree (created_at);


--
-- Name: contact_firstname_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contact_firstname_idx ON public.contact USING btree (firstname);


--
-- Name: contact_workspace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contact_workspace_idx ON public.contact USING btree (workspace);


--
-- Name: handset_session_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX handset_session_expires_at_idx ON public.handset_session USING btree (expires_at) WHERE (status = 'active'::text);


--
-- Name: handset_session_workspace_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX handset_session_workspace_active_idx ON public.handset_session USING btree (workspace_id, status) WHERE (status = 'active'::text);


--
-- Name: households_workspace_key_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX households_workspace_key_idx ON public.households USING btree (workspace_id, household_key);


--
-- Name: households_workspace_key_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX households_workspace_key_uniq ON public.households USING btree (workspace_id, household_key);


--
-- Name: idx_campaign_queue_campaign_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_queue_campaign_id ON public.campaign_queue USING btree (campaign_id);


--
-- Name: idx_campaign_queue_dequeued_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_queue_dequeued_at ON public.campaign_queue USING btree (dequeued_at);


--
-- Name: idx_contact_clean_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_clean_phone ON public.contact USING btree (workspace, regexp_replace(phone, '[^0-9]'::text, ''::text, 'g'::text));


--
-- Name: idx_contact_id_workspace; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_id_workspace ON public.contact USING btree (id, workspace);


--
-- Name: idx_contact_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_phone ON public.contact USING btree (phone text_pattern_ops);


--
-- Name: idx_contact_workspace_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_workspace_id ON public.contact USING btree (workspace, id);


--
-- Name: idx_contact_workspace_normalised_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_workspace_normalised_phone ON public.contact USING btree (workspace, public.normalise_phone_key(phone));


--
-- Name: idx_message_workspace_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_workspace_date ON public.message USING btree (workspace, date_created);


--
-- Name: idx_transaction_history_workspace_type_idempotency_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_transaction_history_workspace_type_idempotency_key ON public.transaction_history USING btree (workspace, type, idempotency_key) WHERE (idempotency_key IS NOT NULL);


--
-- Name: idx_workspace_api_key_prefix; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workspace_api_key_prefix ON public.workspace_api_key USING btree (key_prefix);


--
-- Name: outreach_attempt_campaign_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outreach_attempt_campaign_id_idx ON public.outreach_attempt USING btree (campaign_id);


--
-- Name: outreach_attempt_contact_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outreach_attempt_contact_id_idx ON public.outreach_attempt USING btree (contact_id);


--
-- Name: outreach_attempt_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outreach_attempt_user_id_idx ON public.outreach_attempt USING btree (user_id);


--
-- Name: question_option_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX question_option_order_idx ON public.question_option USING btree (question_id, option_order);


--
-- Name: question_option_question_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX question_option_question_idx ON public.question_option USING btree (question_id);


--
-- Name: response_answer_answered_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX response_answer_answered_idx ON public.response_answer USING btree (answered_at);


--
-- Name: response_answer_question_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX response_answer_question_idx ON public.response_answer USING btree (question_id);


--
-- Name: response_answer_response_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX response_answer_response_idx ON public.response_answer USING btree (response_id);


--
-- Name: script_workspace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX script_workspace_idx ON public.script USING btree (workspace);


--
-- Name: survey_is_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX survey_is_active_idx ON public.survey USING btree (is_active);


--
-- Name: survey_page_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX survey_page_order_idx ON public.survey_page USING btree (survey_id, page_order);


--
-- Name: survey_page_survey_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX survey_page_survey_idx ON public.survey_page USING btree (survey_id);


--
-- Name: survey_question_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX survey_question_order_idx ON public.survey_question USING btree (page_id, question_order);


--
-- Name: survey_question_page_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX survey_question_page_idx ON public.survey_question USING btree (page_id);


--
-- Name: survey_question_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX survey_question_type_idx ON public.survey_question USING btree (question_type);


--
-- Name: survey_response_completed_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX survey_response_completed_idx ON public.survey_response USING btree (completed_at);


--
-- Name: survey_response_contact_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX survey_response_contact_idx ON public.survey_response USING btree (contact_id);


--
-- Name: survey_response_result_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX survey_response_result_idx ON public.survey_response USING btree (result_id);


--
-- Name: survey_response_started_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX survey_response_started_idx ON public.survey_response USING btree (started_at);


--
-- Name: survey_response_survey_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX survey_response_survey_idx ON public.survey_response USING btree (survey_id);


--
-- Name: survey_survey_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX survey_survey_id_idx ON public.survey USING btree (survey_id);


--
-- Name: survey_workspace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX survey_workspace_idx ON public.survey USING btree (workspace);


--
-- Name: verification_session_expected_caller_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX verification_session_expected_caller_idx ON public.verification_session USING btree (expected_caller) WHERE (status = 'pending'::text);


--
-- Name: verification_session_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX verification_session_expires_at_idx ON public.verification_session USING btree (expires_at) WHERE (status = 'pending'::text);


--
-- Name: workspace_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workspace_created_at_idx ON public.workspace USING btree (created_at);


--
-- Name: contact_audience add_contact_to_queues_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER add_contact_to_queues_trigger AFTER INSERT ON public.contact_audience FOR EACH ROW EXECUTE FUNCTION public.trigger_add_contact_to_queues();


--
-- Name: campaign campaign_is_active_change_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER campaign_is_active_change_trigger AFTER UPDATE ON public.campaign FOR EACH ROW EXECUTE FUNCTION public.campaign_is_active_change();


--
-- Name: campaign campaign_schedule_change_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER campaign_schedule_change_trigger AFTER INSERT OR UPDATE OF schedule ON public.campaign FOR EACH ROW EXECUTE FUNCTION public.notify_schedule_change();


--
-- Name: outreach_attempt outreach_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER outreach_trigger AFTER INSERT OR DELETE OR UPDATE ON public.outreach_attempt FOR EACH ROW EXECUTE FUNCTION public.call_outreach_webhook();


--
-- Name: survey_page survey_page_updated_at_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER survey_page_updated_at_trigger AFTER UPDATE ON public.survey_page FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: survey_question survey_question_updated_at_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER survey_question_updated_at_trigger AFTER UPDATE ON public.survey_question FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: survey_response survey_response_updated_at_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER survey_response_updated_at_trigger AFTER UPDATE ON public.survey_response FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: survey survey_updated_at_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER survey_updated_at_trigger AFTER UPDATE ON public.survey FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: transaction_history transaction_history_update_credits; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER transaction_history_update_credits AFTER INSERT ON public.transaction_history FOR EACH ROW EXECUTE FUNCTION public.transaction_history_update_credits();


--
-- Name: call trigger_inherit_parent_call_data; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_inherit_parent_call_data BEFORE INSERT OR UPDATE ON public.call FOR EACH ROW EXECUTE FUNCTION public.inherit_parent_call_data();


--
-- Name: audience_upload audience_upload_audience_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audience_upload
    ADD CONSTRAINT audience_upload_audience_id_fkey FOREIGN KEY (audience_id) REFERENCES public.audience(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: audience_upload audience_upload_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audience_upload
    ADD CONSTRAINT audience_upload_created_by_fkey FOREIGN KEY (created_by) REFERENCES public."user"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: audience_upload audience_upload_workspace_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audience_upload
    ADD CONSTRAINT audience_upload_workspace_fkey FOREIGN KEY (workspace) REFERENCES public.workspace(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: audience audience_workspace_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audience
    ADD CONSTRAINT audience_workspace_fkey FOREIGN KEY (workspace) REFERENCES public.workspace(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: call call_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call
    ADD CONSTRAINT call_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contact(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: call call_outreach_attempt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call
    ADD CONSTRAINT call_outreach_attempt_id_fkey FOREIGN KEY (outreach_attempt_id) REFERENCES public.outreach_attempt(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: call call_parent_call_sid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call
    ADD CONSTRAINT call_parent_call_sid_fkey FOREIGN KEY (parent_call_sid) REFERENCES public.call(sid) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: call call_queue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call
    ADD CONSTRAINT call_queue_id_fkey FOREIGN KEY (queue_id) REFERENCES public.campaign_queue(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: call call_workspace_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call
    ADD CONSTRAINT call_workspace_fkey FOREIGN KEY (workspace) REFERENCES public.workspace(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: call calls_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call
    ADD CONSTRAINT calls_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaign(id) ON UPDATE CASCADE ON DELETE SET DEFAULT;


--
-- Name: campaign_audience campaign_audiences_audience_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_audience
    ADD CONSTRAINT campaign_audiences_audience_id_fkey FOREIGN KEY (audience_id) REFERENCES public.audience(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: campaign_audience campaign_audiences_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_audience
    ADD CONSTRAINT campaign_audiences_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaign(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: campaign_queue campaign_queue_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_queue
    ADD CONSTRAINT campaign_queue_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaign(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: campaign_queue campaign_queue_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_queue
    ADD CONSTRAINT campaign_queue_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contact(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: campaign_queue campaign_queue_dequeued_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_queue
    ADD CONSTRAINT campaign_queue_dequeued_by_fkey FOREIGN KEY (dequeued_by) REFERENCES public."user"(id);


--
-- Name: campaign campaign_workspace_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign
    ADD CONSTRAINT campaign_workspace_fkey FOREIGN KEY (workspace) REFERENCES public.workspace(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: contact_audience contact_audiences_audience_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_audience
    ADD CONSTRAINT contact_audiences_audience_id_fkey FOREIGN KEY (audience_id) REFERENCES public.audience(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: contact_audience contact_audiences_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_audience
    ADD CONSTRAINT contact_audiences_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contact(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: contact contact_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact
    ADD CONSTRAINT contact_created_by_fkey FOREIGN KEY (created_by) REFERENCES public."user"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: contact contact_household_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact
    ADD CONSTRAINT contact_household_id_fkey FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE SET NULL;


--
-- Name: contact contact_upload_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact
    ADD CONSTRAINT contact_upload_id_fkey FOREIGN KEY (upload_id) REFERENCES public.audience_upload(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: contact contact_workspace_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact
    ADD CONSTRAINT contact_workspace_fkey FOREIGN KEY (workspace) REFERENCES public.workspace(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: handset_session handset_session_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.handset_session
    ADD CONSTRAINT handset_session_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: handset_session handset_session_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.handset_session
    ADD CONSTRAINT handset_session_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspace(id) ON DELETE CASCADE;


--
-- Name: households households_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.households
    ADD CONSTRAINT households_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspace(id) ON DELETE CASCADE;


--
-- Name: message message_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message
    ADD CONSTRAINT message_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contact(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: message message_outreach_attempt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message
    ADD CONSTRAINT message_outreach_attempt_id_fkey FOREIGN KEY (outreach_attempt_id) REFERENCES public.outreach_attempt(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: message message_queue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message
    ADD CONSTRAINT message_queue_id_fkey FOREIGN KEY (queue_id) REFERENCES public.campaign_queue(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: message message_workspace_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message
    ADD CONSTRAINT message_workspace_fkey FOREIGN KEY (workspace) REFERENCES public.workspace(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: message messages_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message
    ADD CONSTRAINT messages_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaign(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: outreach_attempt outreach_attempt_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_attempt
    ADD CONSTRAINT outreach_attempt_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaign(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: outreach_attempt outreach_attempt_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_attempt
    ADD CONSTRAINT outreach_attempt_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contact(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: outreach_attempt outreach_attempt_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_attempt
    ADD CONSTRAINT outreach_attempt_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: question_option question_option_question_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.question_option
    ADD CONSTRAINT question_option_question_fkey FOREIGN KEY (question_id) REFERENCES public.survey_question(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: response_answer response_answer_question_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.response_answer
    ADD CONSTRAINT response_answer_question_fkey FOREIGN KEY (question_id) REFERENCES public.survey_question(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: response_answer response_answer_response_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.response_answer
    ADD CONSTRAINT response_answer_response_fkey FOREIGN KEY (response_id) REFERENCES public.survey_response(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: script script_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.script
    ADD CONSTRAINT script_created_by_fkey FOREIGN KEY (created_by) REFERENCES public."user"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: script script_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.script
    ADD CONSTRAINT script_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public."user"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: script script_workspace_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.script
    ADD CONSTRAINT script_workspace_fkey FOREIGN KEY (workspace) REFERENCES public.workspace(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: survey_page survey_page_survey_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_page
    ADD CONSTRAINT survey_page_survey_fkey FOREIGN KEY (survey_id) REFERENCES public.survey(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: survey_question survey_question_page_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_question
    ADD CONSTRAINT survey_question_page_fkey FOREIGN KEY (page_id) REFERENCES public.survey_page(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: survey_response survey_response_contact_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_response
    ADD CONSTRAINT survey_response_contact_fkey FOREIGN KEY (contact_id) REFERENCES public.contact(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: survey_response survey_response_survey_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_response
    ADD CONSTRAINT survey_response_survey_fkey FOREIGN KEY (survey_id) REFERENCES public.survey(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: survey survey_workspace_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey
    ADD CONSTRAINT survey_workspace_fkey FOREIGN KEY (workspace) REFERENCES public.workspace(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: transaction_history transaction_history_workspace_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transaction_history
    ADD CONSTRAINT transaction_history_workspace_fkey FOREIGN KEY (workspace) REFERENCES public.workspace(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: verification_session verification_session_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verification_session
    ADD CONSTRAINT verification_session_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: webhook webhook_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook
    ADD CONSTRAINT webhook_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public."user"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: webhook webhooks_workspace_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook
    ADD CONSTRAINT webhooks_workspace_fkey FOREIGN KEY (workspace) REFERENCES public.workspace(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: workspace_api_key workspace_api_key_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_api_key
    ADD CONSTRAINT workspace_api_key_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspace(id) ON DELETE CASCADE;


--
-- Name: workspace_invite workspace_invite_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_invite
    ADD CONSTRAINT workspace_invite_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: workspace_invite workspace_invite_workspace_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_invite
    ADD CONSTRAINT workspace_invite_workspace_fkey FOREIGN KEY (workspace) REFERENCES public.workspace(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: workspace_number workspace_number_workspace_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_number
    ADD CONSTRAINT workspace_number_workspace_fkey FOREIGN KEY (workspace) REFERENCES public.workspace(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: workspace workspace_owner_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace
    ADD CONSTRAINT workspace_owner_fkey FOREIGN KEY (owner) REFERENCES public."user"(id);


--
-- Name: workspace_users workspace_users_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_users
    ADD CONSTRAINT workspace_users_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: workspace_users workspace_users_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_users
    ADD CONSTRAINT workspace_users_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspace(id) ON DELETE CASCADE;


--
-- Name: user Allow Auth  Users to get other users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow Auth  Users to get other users" ON public."user" FOR SELECT USING (true);


--
-- Name: campaign Sudo users have full access to campaigns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Sudo users have full access to campaigns" ON public.campaign USING (app_auth.is_sudo_user()) WITH CHECK (app_auth.is_sudo_user());


--
-- Name: user Sudo users have full access to users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Sudo users have full access to users" ON public."user" USING (app_auth.is_sudo_user()) WITH CHECK (app_auth.is_sudo_user());


--
-- Name: audience Sudo users have full access to workspaces; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Sudo users have full access to workspaces" ON public.audience USING (app_auth.is_sudo_user()) WITH CHECK (app_auth.is_sudo_user());


--
-- Name: campaign Sudo users have full access to workspaces; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Sudo users have full access to workspaces" ON public.campaign USING (app_auth.is_sudo_user()) WITH CHECK (app_auth.is_sudo_user());


--
-- Name: contact Sudo users have full access to workspaces; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Sudo users have full access to workspaces" ON public.contact USING (app_auth.is_sudo_user()) WITH CHECK (app_auth.is_sudo_user());


--
-- Name: workspace Sudo users have full access to workspaces; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Sudo users have full access to workspaces" ON public.workspace USING (app_auth.is_sudo_user()) WITH CHECK (app_auth.is_sudo_user());


--
-- Name: workspace_users Sudo users have full access to workspaces; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Sudo users have full access to workspaces" ON public.workspace_users USING (app_auth.is_sudo_user()) WITH CHECK (app_auth.is_sudo_user());


--
-- Name: audience; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audience ENABLE ROW LEVEL SECURITY;

--
-- Name: audience_upload; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audience_upload ENABLE ROW LEVEL SECURITY;

--
-- Name: call; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.call ENABLE ROW LEVEL SECURITY;

--
-- Name: campaign; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campaign ENABLE ROW LEVEL SECURITY;

--
-- Name: campaign_audience; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campaign_audience ENABLE ROW LEVEL SECURITY;

--
-- Name: campaign_queue; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campaign_queue ENABLE ROW LEVEL SECURITY;

--
-- Name: contact; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contact ENABLE ROW LEVEL SECURITY;

--
-- Name: contact_audience; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contact_audience ENABLE ROW LEVEL SECURITY;

--
-- Name: handset_session; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.handset_session ENABLE ROW LEVEL SECURITY;

--
-- Name: message; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.message ENABLE ROW LEVEL SECURITY;

--
-- Name: outreach_attempt; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.outreach_attempt ENABLE ROW LEVEL SECURITY;

--
-- Name: script; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.script ENABLE ROW LEVEL SECURITY;

--
-- Name: transaction_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.transaction_history ENABLE ROW LEVEL SECURITY;

--
-- Name: user; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."user" ENABLE ROW LEVEL SECURITY;

--
-- Name: verification_session; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.verification_session ENABLE ROW LEVEL SECURITY;

--
-- Name: webhook; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.webhook ENABLE ROW LEVEL SECURITY;

--
-- Name: workspace; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workspace ENABLE ROW LEVEL SECURITY;

--
-- Name: workspace_api_key; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workspace_api_key ENABLE ROW LEVEL SECURITY;

--
-- Name: workspace_invite; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workspace_invite ENABLE ROW LEVEL SECURITY;

--
-- Name: workspace_number; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workspace_number ENABLE ROW LEVEL SECURITY;

--
-- Name: workspace_users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workspace_users ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict bccokPI7OvvrPkMdohT3gbVgTTAGPqUb1FZjh5FgduglnA4Ka9AfCq3ddY6zDTc

