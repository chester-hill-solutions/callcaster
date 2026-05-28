-- Campaign queue throughput RPC integration tests.
-- Run against local Supabase: psql "$DATABASE_URL" -f supabase/tests/campaign_queue_throughput.sql
-- Requires migration 20260527180000_campaign_queue_throughput.sql applied.

begin;

do $$
declare
  v_workspace uuid;
  v_campaign integer;
  v_contact_a integer;
  v_contact_b integer;
  v_queue_a integer;
  v_queue_b integer;
  v_queue_c integer;
  v_user uuid := '11111111-1111-1111-1111-111111111111';
  v_claimed_count integer;
  v_result text;
  v_failed_count integer;
  v_reset_count integer;
  v_pending boolean;
  v_completed boolean;
begin
  insert into public.workspace (id, name, owner)
  values (gen_random_uuid(), 'queue-throughput-test', null)
  returning id into v_workspace;

  insert into public.campaign (title, workspace, type, status, is_active, caller_id)
  values ('throughput test', v_workspace, 'message', 'running', true, '+15551234567')
  returning id into v_campaign;

  insert into public.contact (firstname, surname, phone, workspace)
  values ('Test', 'One', '+15551111111', v_workspace)
  returning id into v_contact_a;

  insert into public.contact (firstname, surname, phone, workspace)
  values ('Test', 'Two', '+15552222222', v_workspace)
  returning id into v_contact_b;

  insert into public.campaign_queue (campaign_id, contact_id, status, queue_state, attempt_count)
  values (v_campaign, v_contact_a, 'queued', 'queued', 0)
  returning id into v_queue_a;

  insert into public.campaign_queue (campaign_id, contact_id, status, queue_state, attempt_count)
  values (v_campaign, v_contact_b, 'queued', 'queued', 0)
  returning id into v_queue_b;

  select count(*)::integer
  into v_claimed_count
  from public.claim_campaign_queue_contacts(v_campaign, v_user, 2, null);

  if v_claimed_count <> 2 then
    raise exception 'claim_campaign_queue_contacts expected 2 rows, got %', v_claimed_count;
  end if;

  if not exists (
    select 1 from public.campaign_queue
    where id = v_queue_a and queue_state = 'assigned' and attempt_count = 1
  ) then
    raise exception 'claim did not assign queue_a with attempt_count=1';
  end if;

  select count(*)::integer
  into v_claimed_count
  from public.claim_campaign_queue_contacts(v_campaign, v_user, 5, 1);

  if v_claimed_count <> 0 then
    raise exception 'max_inflight=1 should block additional claims, got %', v_claimed_count;
  end if;

  v_result := public.requeue_campaign_queue_contact(v_queue_a, 'transient failure');
  if v_result <> 'requeued' then
    raise exception 'requeue expected requeued, got %', v_result;
  end if;

  update public.campaign_queue
  set attempt_count = 4, queue_state = 'assigned', status = v_user::text, claimed_at = now()
  where id = v_queue_a;

  v_result := public.requeue_campaign_queue_contact(v_queue_a, 'final failure');
  if v_result <> 'failed_max_attempts' then
    raise exception 'requeue at attempt 4 expected failed_max_attempts, got %', v_result;
  end if;

  insert into public.campaign_queue (campaign_id, contact_id, status, queue_state, attempt_count)
  values (v_campaign, v_contact_a, 'queued', 'queued', 5)
  returning id into v_queue_c;

  v_failed_count := public.fail_exhausted_campaign_queue_contacts(v_campaign);
  if v_failed_count < 1 then
    raise exception 'fail_exhausted expected at least 1 row, got %', v_failed_count;
  end if;

  update public.campaign_queue
  set
    status = v_user::text,
    queue_state = 'assigned',
    claimed_at = now() - interval '15 minutes',
    attempt_count = 2,
    dequeued_at = null
  where id = v_queue_b;

  v_reset_count := public.reset_stale_campaign_queue_claims(v_campaign);
  if v_reset_count <> 1 then
    raise exception 'reset_stale expected 1 row, got %', v_reset_count;
  end if;

  update public.campaign_queue
  set status = 'queued', queue_state = 'queued', attempt_count = 0, dequeued_at = null, claimed_at = null
  where id = v_queue_b;

  v_pending := public.campaign_queue_has_pending_work(v_campaign);
  if not v_pending then
    raise exception 'campaign_queue_has_pending_work expected true';
  end if;

  perform public.complete_campaign_queue_contact(v_queue_b, v_user, 'test complete');

  v_pending := public.campaign_queue_has_pending_work(v_campaign);
  if v_pending then
    raise exception 'campaign_queue_has_pending_work expected false after drain';
  end if;

  v_completed := public.try_complete_campaign_if_drained(v_campaign);
  if not v_completed then
    raise exception 'try_complete_campaign_if_drained expected true';
  end if;

  if not exists (
    select 1 from public.campaign where id = v_campaign and status = 'complete'
  ) then
    raise exception 'campaign should be marked complete';
  end if;
end $$;

rollback;
