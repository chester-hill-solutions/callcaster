-- Inbound queue routing RPC integration tests.
-- Run against local Supabase: psql "$DATABASE_URL" -f supabase/tests/inbound_queue_routing.sql
-- Requires migration 20260610215000_inbound_queue_routing.sql applied.

begin;

do $$
declare
  v_workspace uuid := gen_random_uuid();
  v_user uuid := gen_random_uuid();
  v_queue_id bigint;
  v_entry_id bigint;
  v_result record;
  v_now timestamptz := now();
begin
  -- Create test workspace
  insert into public.workspace (id, name)
  values (v_workspace, 'Test Queue Workspace');

  -- Create test agent
  insert into public."user" (id, email)
  values (v_user, 'test_agent@example.com');

  -- Create inbound queue
  insert into public.inbound_queue (workspace_id, name)
  values (v_workspace, 'Test Queue')
  returning id into v_queue_id;

  -- Add agent as queue member
  insert into public.inbound_queue_member (queue_id, user_id, workspace_id)
  values (v_queue_id, v_user, v_workspace);

  -- Set agent as available (with recent heartbeat)
  insert into public.agent_status (workspace_id, user_id, status, last_heartbeat_at)
  values (v_workspace, v_user, 'available', v_now);

  -- Test 1: Claim agent for inbound queue entry
  select agent_user_id, entry_id
  into v_result
  from public.claim_inbound_queue_entry(v_queue_id, v_workspace, 'CA-test-call-sid', '+15551234567');

  if v_result.agent_user_id is null then
    raise exception 'FAIL: claim_inbound_queue_entry returned null agent_user_id';
  end if;

  if v_result.entry_id is null then
    raise exception 'FAIL: claim_inbound_queue_entry returned null entry_id';
  end if;

  v_entry_id := v_result.entry_id;

  -- Verify agent status updated to busy
  if not exists (
    select 1 from public.agent_status
    where workspace_id = v_workspace
      and user_id = v_user
      and status = 'busy'
      and current_queue_entry_id = v_entry_id
      and status_reason = 'inbound_offer'
  ) then
    raise exception 'FAIL: agent_status not updated correctly after claim';
  end if;

  -- Verify queue entry created
  if not exists (
    select 1 from public.inbound_queue_entry
    where id = v_entry_id
      and queue_id = v_queue_id
      and status = 'offered'
      and offered_to_user_id = v_user
      and call_sid = 'CA-test-call-sid'
      and caller_number = '+15551234567'
  ) then
    raise exception 'FAIL: inbound_queue_entry not created correctly';
  end if;

  -- Test 2: Accept the offer
  perform public.accept_inbound_offer(v_entry_id);

  if not exists (
    select 1 from public.inbound_queue_entry
    where id = v_entry_id and status = 'accepted'
  ) then
    raise exception 'FAIL: accept_inbound_offer did not update status';
  end if;

  -- Test 3: Complete the entry
  perform public.complete_inbound_queue_entry(v_entry_id);

  if not exists (
    select 1 from public.inbound_queue_entry
    where id = v_entry_id and status = 'completed'
  ) then
    raise exception 'FAIL: complete_inbound_queue_entry did not set completed';
  end if;

  if not exists (
    select 1 from public.agent_status
    where workspace_id = v_workspace
      and user_id = v_user
      and status = 'wrap_up'
      and current_queue_entry_id is null
  ) then
    raise exception 'FAIL: agent not released to wrap_up after completion';
  end if;

  -- Reset for release test
  update public.agent_status set status = 'available', current_queue_entry_id = null where workspace_id = v_workspace and user_id = v_user;

  -- Test 4: Release agent from offer (timed_out)
  select agent_user_id, entry_id
  into v_result
  from public.claim_inbound_queue_entry(v_queue_id, v_workspace, 'CA-test-2', '+15559876543');

  perform public.release_inbound_offer(v_result.entry_id, 'timed_out');

  if not exists (
    select 1 from public.inbound_queue_entry
    where id = v_result.entry_id and status = 'timed_out'
  ) then
    raise exception 'FAIL: release_inbound_offer did not set timed_out';
  end if;

  if not exists (
    select 1 from public.agent_status
    where workspace_id = v_workspace and user_id = v_user and status = 'available'
  ) then
    raise exception 'FAIL: agent not released to available after timeout';
  end if;

  -- Test 5: Abandon
  insert into public.inbound_queue_entry (queue_id, workspace_id, call_sid, caller_number, status)
  values (v_queue_id, v_workspace, 'CA-test-3', '+15551112222', 'queued')
  returning id into v_entry_id;

  perform public.abandon_inbound_queue_entry(v_entry_id);

  if not exists (
    select 1 from public.inbound_queue_entry
    where id = v_entry_id and status = 'abandoned'
  ) then
    raise exception 'FAIL: abandon_inbound_queue_entry did not set abandoned';
  end if;

  -- Test 6: Second claim should fail (agent already busy from test 4 release)
  select agent_user_id, entry_id
  into v_result
  from public.claim_inbound_queue_entry(v_queue_id, v_workspace, 'CA-test-4', '+15550000000');

  if v_result.agent_user_id is not null then
    raise exception 'FAIL: claim should return null when agent is available (already released)';
  end if;

  raise notice 'All inbound queue routing tests passed';
end $$;

rollback;
