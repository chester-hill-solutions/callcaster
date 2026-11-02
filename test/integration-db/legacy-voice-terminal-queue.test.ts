import twilio from "twilio";
import postgres from "postgres";
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, test } from "vitest";
import { accountSid, actor, baseUrl, callerId, clearFault, customer, fault, foreignId, otherActor, sid, sql, useOwnedAudioFixture, workspaceId } from "../helpers/voice-audio-fixture";
import { parseTwilioVoiceCallback } from "@/lib/twilio/voice-callback";
import { asRouteResponse, routeArgs } from "../helpers/route-result";
import { runCallStatusSideEffects } from "@/lib/worker/webhook-side-effects.server";
import { enqueueContactsForCampaign } from "@/lib/queue.server";

async function legacyAttempt(household = false) {
  const [campaign] = await sql`insert into public.campaign (workspace, title, type, dial_type, status, group_household_queue)
    values (${workspaceId}::uuid, ${'Owned legacy outcome ' + randomUUID()}, 'live_call', 'call', 'running', ${household}) returning id`;
  const [contact] = await sql`insert into public.contact (workspace, firstname, phone)
    values (${workspaceId}::uuid, 'Legacy customer', ${customer}) returning id`;
  const [queue] = await sql`insert into public.campaign_queue (workspace, campaign_id, contact_id, queue_state, assigned_to_user_id)
    values (${workspaceId}::uuid, ${campaign.id}, ${contact.id}, 'assigned', ${actor}) returning *`;
  let sibling: { contact: number; queue: number; generation: string } | undefined;
  if (household) {
    const [home] = await sql`insert into public.households (workspace_id, household_key) values (${workspaceId}::uuid, ${randomUUID()}) returning id`;
    await sql`update public.contact set household_id = ${home.id}::uuid where id = ${contact.id}`;
    const [other] = await sql`insert into public.contact (workspace, firstname, phone, household_id)
      values (${workspaceId}::uuid, 'Legacy household member', '+16135550888', ${home.id}::uuid) returning id`;
    const [row] = await sql`insert into public.campaign_queue (workspace, campaign_id, contact_id, queue_state)
      values (${workspaceId}::uuid, ${campaign.id}, ${other.id}, 'queued') returning id, dispatch_generation`;
    sibling = { contact: Number(other.id), queue: Number(row.id), generation: row.dispatch_generation };
  }
  const [attempt] = await sql`insert into public.outreach_attempt (workspace, campaign_id, contact_id, user_id, disposition)
    values (${workspaceId}::uuid, ${campaign.id}, ${contact.id}, ${actor}, 'in-progress') returning id`;
  const callSid = sid();
  await sql`insert into public.call (sid, workspace, account_sid, user_id, campaign_id, contact_id, outreach_attempt_id,
    queue_id, "to", "from", status, duration, direction)
    values (${callSid}, ${workspaceId}::uuid, ${accountSid}, ${actor}::uuid, ${campaign.id}, ${contact.id}, ${attempt.id},
      ${queue.id}, ${customer}, ${callerId}, 'completed', '42', 'outbound-api')`;
  return { campaign: Number(campaign.id), contact: Number(contact.id), queue, attempt: Number(attempt.id), callSid, sibling };
}

type Fixture = Awaited<ReturnType<typeof legacyAttempt>>;
async function finish(f: Fixture, status = "completed") {
  return runCallStatusSideEffects({ callSid: f.callSid, event: parseTwilioVoiceCallback({ AccountSid: accountSid,
    CallSid: f.callSid, CallStatus: status, CallDuration: status === 'completed' ? '42' : '0', To: customer, From: callerId }) });
}

async function resultRows(f: Fixture, amount = -4) {
  const [attempt] = await sql`select disposition from public.outreach_attempt where id = ${f.attempt}`;
  const ledger = await sql`select amount, call_sid, idempotency_key from public.transaction_history where workspace = ${workspaceId}::uuid`;
  expect(attempt.disposition).toBe('completed');
  expect(ledger).toEqual([{ amount, call_sid: f.callSid, idempotency_key: 'call:' + f.callSid }]);
}

describe("legacy voice terminal queue ownership", () => {
  useOwnedAudioFixture();
  beforeEach(async () => {
    await sql`delete from public.outreach_attempt where workspace = ${workspaceId}::uuid`;
    await sql`delete from public.campaign_queue where workspace = ${workspaceId}::uuid`;
    await sql`delete from public.contact where workspace = ${workspaceId}::uuid`;
    await sql`delete from public.campaign where workspace = ${workspaceId}::uuid`;
    await sql`delete from public.households where workspace_id = ${workspaceId}::uuid`;
  });

  test.each([['live_call', -4], ['robocall', -2]])("the unchanged legacy %s attempt advances its current queue and bills once across retries", async (kind, amount) => {
    const f = await legacyAttempt();
    await sql`update public.campaign set type = ${kind} where id = ${f.campaign}`;
    await finish(f); await finish(f);
    expect((await sql`select queue_state from public.campaign_queue where id = ${f.queue.id}`)[0].queue_state).toBe('dequeued');
    await resultRows(f, Number(amount));
  });

  test.each([false, true])("an old completion preserves a canonically requeued primary, unbound %s", async unbound => {
    const f = await legacyAttempt();
    if (unbound) await sql`update public.call set queue_id = null where sid = ${f.callSid}`;
    await enqueueContactsForCampaign(f.campaign, [f.contact], { requeue: true });
    const [before] = await sql`select * from public.campaign_queue where id = ${f.queue.id}`;
    expect(before.dispatch_generation).not.toBe(f.queue.dispatch_generation);
    await finish(f);
    expect((await sql`select * from public.campaign_queue where id = ${f.queue.id}`)[0]).toEqual(before);
    await resultRows(f);
  });

  test("an unbound old completion cannot advance a rebuilt primary with the same generation", async () => {
    const f = await legacyAttempt();
    await sql`update public.call set queue_id = null where sid = ${f.callSid}`;
    await sql`delete from public.campaign_queue where id = ${f.queue.id}`;
    const [before] = await sql`insert into public.campaign_queue (workspace, campaign_id, contact_id, queue_state, dispatch_generation)
      values (${workspaceId}::uuid, ${f.campaign}, ${f.contact}, 'queued', ${f.queue.dispatch_generation}::uuid) returning *`;
    await finish(f);
    expect((await sql`select * from public.campaign_queue where id = ${before.id}`)[0]).toEqual(before);
    await resultRows(f);
  });

  test("an old completion cannot borrow the current assignee's authority", async () => {
    const f = await legacyAttempt();
    await sql`update public.campaign_queue set assigned_to_user_id = ${otherActor} where id = ${f.queue.id}`;
    const [before] = await sql`select * from public.campaign_queue where id = ${f.queue.id}`;
    await finish(f);
    expect((await sql`select * from public.campaign_queue where id = ${f.queue.id}`)[0]).toEqual(before);
    await resultRows(f);
  });

  test.each(['primary', 'household'])("a replacement %s inserted by an older transaction stays queued", async target => {
    const url = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
    if (!url) throw new Error('Owned fixture URL required');
    const rebuild = postgres(url, { max: 1 }); let fixture: Fixture | undefined; let replacement: Record<string, unknown> | undefined;
    try {
      await rebuild.begin(async tx => {
        await tx`select current_timestamp`;
        const f = fixture = await legacyAttempt(target === 'household');
        if (target === 'primary') await sql`update public.call set queue_id = null where sid = ${f.callSid}`;
        const contactId = target === 'primary' ? f.contact : f.sibling?.contact;
        if (!contactId) throw new Error('Owned replacement contact required');
        await tx`delete from public.campaign_queue where campaign_id = ${f.campaign} and contact_id = ${contactId}`;
        const [{ id }] = await tx`select public.handle_campaign_queue_entry(${contactId}, ${f.campaign}, null, false) id`;
        [replacement] = await tx`select * from public.campaign_queue where id = ${id}`;
      });
      if (!fixture || !replacement) throw new Error('Owned replacement required');
      await finish(fixture);
      expect((await sql`select * from public.campaign_queue where id = ${replacement.id}`)[0]).toEqual(replacement);
      if (target === 'household') expect((await sql`select queue_state from public.campaign_queue where id = ${fixture.queue.id}`)[0].queue_state).toBe('dequeued');
      await resultRows(fixture);
    } finally { await rebuild.end(); }
  });

  test("an unchanged original outreach completes a legacy Call without a saved queue ID", async () => {
    const f = await legacyAttempt();
    await sql`update public.call set queue_id = null where sid = ${f.callSid}`;
    await finish(f);
    expect((await sql`select queue_state from public.campaign_queue where id = ${f.queue.id}`)[0].queue_state).toBe('dequeued');
    await resultRows(f);
  });

  test.each(['primary', 'household'])("a historical %s without an intent timestamp keeps uncertain ownership queued", async target => {
    const f = await legacyAttempt(target === 'household');
    if (target === 'primary') await sql`update public.call set queue_id = null where sid = ${f.callSid}`;
    const queueId = target === 'primary' ? f.queue.id : f.sibling?.queue;
    if (!queueId) throw new Error('Owned historical queue required');
    await sql`update public.campaign_queue set inserted_at = null, redial_requested_at = null where id = ${queueId}`;
    const [before] = await sql`select * from public.campaign_queue where id = ${queueId}`;
    await finish(f);
    expect((await sql`select * from public.campaign_queue where id = ${queueId}`)[0]).toEqual(before);
    if (target === 'household') expect((await sql`select queue_state from public.campaign_queue where id = ${f.queue.id}`)[0].queue_state).toBe('dequeued');
    await resultRows(f);
  });

  test("a historical primary with its saved queue ID still completes without an intent timestamp", async () => {
    const f = await legacyAttempt();
    await sql`update public.campaign_queue set inserted_at = null, redial_requested_at = null where id = ${f.queue.id}`;
    await finish(f);
    expect((await sql`select queue_state from public.campaign_queue where id = ${f.queue.id}`)[0].queue_state).toBe('dequeued');
    await resultRows(f);
  });

  test("outreach inserted by an older transaction still completes earlier queue work", async () => {
    const url = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
    if (!url) throw new Error('Owned fixture URL required');
    const writer = postgres(url, { max: 1 }); let fixture: Fixture | undefined;
    try {
      await writer.begin(async tx => {
        await tx`select current_timestamp`;
        const f = fixture = await legacyAttempt();
        const [{ id }] = await tx`insert into public.outreach_attempt (workspace, campaign_id, contact_id, user_id, disposition)
          values (${workspaceId}::uuid, ${f.campaign}, ${f.contact}, ${actor}, 'in-progress') returning id`;
        await tx`update public.call set queue_id = null, outreach_attempt_id = ${id} where sid = ${f.callSid}`;
        await tx`delete from public.outreach_attempt where id = ${f.attempt}`;
        f.attempt = Number(id);
      });
      if (!fixture) throw new Error('Owned outreach required');
      await finish(fixture);
      expect((await sql`select queue_state from public.campaign_queue where id = ${fixture.queue.id}`)[0].queue_state).toBe('dequeued');
      await resultRows(fixture);
    } finally { await writer.end(); }
  });

  test("an unchanged legacy household still advances its eligible sibling", async () => {
    const f = await legacyAttempt(true); if (!f.sibling) throw new Error('Owned sibling required');
    await finish(f);
    expect((await sql`select queue_state from public.campaign_queue where id = ${f.queue.id}`)[0].queue_state).toBe('dequeued');
    expect((await sql`select queue_state from public.campaign_queue where id = ${f.sibling.queue}`)[0].queue_state).toBe('dequeued');
    await resultRows(f);
  });

  test.each([false, true])("an old household completion preserves newer sibling work, rebuilt %s", async rebuilt => {
    const f = await legacyAttempt(true); if (!f.sibling) throw new Error('Owned sibling required');
    let id = f.sibling.queue;
    if (rebuilt) {
      await sql`delete from public.campaign_queue where id = ${id}`;
      const [row] = await sql`insert into public.campaign_queue (workspace, campaign_id, contact_id, queue_state)
        values (${workspaceId}::uuid, ${f.campaign}, ${f.sibling.contact}, 'queued') returning id`;
      id = Number(row.id);
    } else await enqueueContactsForCampaign(f.campaign, [f.sibling.contact], { requeue: true });
    const [before] = await sql`select * from public.campaign_queue where id = ${id}`;
    await finish(f);
    expect((await sql`select queue_state from public.campaign_queue where id = ${f.queue.id}`)[0].queue_state).toBe('dequeued');
    expect((await sql`select * from public.campaign_queue where id = ${id}`)[0]).toEqual(before);
    await resultRows(f);
  });

  test("a live legacy household member stays queued", async () => {
    const f = await legacyAttempt(true); if (!f.sibling) throw new Error('Owned sibling required');
    await sql`insert into public.call (sid, workspace, account_sid, user_id, campaign_id, contact_id, queue_id, status)
      values (${sid()}, ${workspaceId}::uuid, ${accountSid}, ${actor}::uuid, ${f.campaign}, ${f.sibling.contact}, ${f.sibling.queue}, 'in-progress')`;
    const [before] = await sql`select * from public.campaign_queue where id = ${f.sibling.queue}`;
    await finish(f);
    expect((await sql`select queue_state from public.campaign_queue where id = ${f.queue.id}`)[0].queue_state).toBe('dequeued');
    expect((await sql`select * from public.campaign_queue where id = ${f.sibling.queue}`)[0]).toEqual(before);
    await resultRows(f);
  });

  test("a later completed outreach attempt keeps the queue even without a new reservation", async () => {
    const f = await legacyAttempt();
    await sql`insert into public.outreach_attempt (workspace, campaign_id, contact_id, user_id, disposition)
      values (${workspaceId}::uuid, ${f.campaign}, ${f.contact}, ${actor}, 'completed')`;
    await finish(f);
    expect((await sql`select * from public.campaign_queue where id = ${f.queue.id}`)[0]).toEqual(f.queue);
    await resultRows(f);
  });

  test.each([{ later: false, unbound: false }, { later: true, unbound: false }, { later: false, unbound: true }, { later: true, unbound: true }])("legacy intent cutoffs keep database microsecond precision %j", async ({ later, unbound }) => {
    const f = await legacyAttempt();
    if (unbound) await sql`update public.call set queue_id = null where sid = ${f.callSid}`;
    await sql`update public.outreach_attempt set created_at = '2026-10-31 12:00:00.000100+00'::timestamptz where id = ${f.attempt}`;
    await sql`update public.campaign_queue set created_at = '2026-10-30 12:00:00+00'::timestamptz,
      redial_requested_at = '2026-10-31 12:00:00+00'::timestamptz + ${later ? 200 : 0} * interval '1 microsecond' where id = ${f.queue.id}`;
    const [before] = await sql`select * from public.campaign_queue where id = ${f.queue.id}`;
    await finish(f);
    const [after] = await sql`select * from public.campaign_queue where id = ${f.queue.id}`;
    if (later) expect(after).toEqual(before); else expect(after.queue_state).toBe('dequeued');
    await resultRows(f);
  });

  test("a legacy child uses its saved parent queue without treating the agent parent as a live customer", async () => {
    const f = await legacyAttempt(), child = sid();
    await sql`update public.call set status = 'in-progress', duration = '0', "from" = ${'client:' + actor}, direction = 'inbound' where sid = ${f.callSid}`;
    await sql`insert into public.call (sid, parent_call_sid, workspace, account_sid, user_id, campaign_id, contact_id, outreach_attempt_id,
      "to", "from", status, duration, direction) values (${child}, ${f.callSid}, ${workspaceId}::uuid, ${accountSid}, ${actor}::uuid,
        null, null, null, ${customer}, ${callerId}, 'completed', '42', 'outbound-dial')`;
    await finish({ ...f, callSid: child });
    expect((await sql`select queue_state from public.campaign_queue where id = ${f.queue.id}`)[0].queue_state).toBe('dequeued');
    expect((await sql`select status from public.call where sid = ${f.callSid}`)[0].status).toBe('in-progress');
    await resultRows({ ...f, callSid: child });
  });

  test("a second household-write failure rolls back queue progress and the same outcome can retry", async () => {
    const f = await legacyAttempt(true); if (!f.sibling) throw new Error('Owned sibling required');
    const [before] = await sql`select * from public.campaign_queue where id = ${f.sibling.queue}`;
    await sql.unsafe(`create function public.${fault}() returns trigger language plpgsql as $$ begin if new.id = ${f.sibling.queue} then raise exception 'Owned legacy household fault'; end if; return new; end $$`);
    try {
      await sql.unsafe(`create trigger ${fault} before update on public.campaign_queue for each row execute function public.${fault}()`);
      await expect(finish(f)).rejects.toThrow();
      expect((await sql`select * from public.campaign_queue where id = ${f.queue.id}`)[0]).toEqual(f.queue);
      expect((await sql`select * from public.campaign_queue where id = ${f.sibling.queue}`)[0]).toEqual(before);
    } finally { await clearFault(); }
    await finish(f);
    expect((await sql`select queue_state from public.campaign_queue where id = ${f.sibling.queue}`)[0].queue_state).toBe('dequeued');
    await resultRows(f);
  });

  test.each(['/api/call-status', '/api/auto-dial/status'])("a real signed %s completion preserves a requeued contact and finishes its original result", async path => {
    const f = await legacyAttempt();
    await enqueueContactsForCampaign(f.campaign, [f.contact], { requeue: true });
    const [before] = await sql`select * from public.campaign_queue where id = ${f.queue.id}`;
    const params = { AccountSid: accountSid, CallSid: f.callSid, CallStatus: 'completed', CallDuration: '42', To: customer, From: callerId };
    await sql`update public.call set status = 'in-progress', duration = '0' where sid = ${f.callSid}`;
    const url = baseUrl + path;
    const request = new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded',
      'X-Twilio-Signature': twilio.getExpectedTwilioSignature('owned-audio-token', url, params) }, body: new URLSearchParams(params) });
    const { action } = path === '/api/call-status' ? await import('../../app/routes/api+/call-status.action.server')
      : await import('../../app/routes/api+/auto-dial/status.action.server');
    const response = await asRouteResponse(action(routeArgs(request)));
    expect(response.status).toBe(200);
    const { callStatusSideEffectsParams } = await import('@/lib/worker/job-params.server');
    const jobs = await sql`select params from public.job where workspace_id = ${workspaceId}::uuid and type = 'call_status_side_effects'`;
    expect(jobs).toHaveLength(1);
    for (const job of jobs) {
      const stored = callStatusSideEffectsParams.parse(job.params);
      await runCallStatusSideEffects({ callSid: stored.sid, event: stored.event });
    }
    expect((await sql`select * from public.campaign_queue where id = ${f.queue.id}`)[0]).toEqual(before);
    expect(await sql`select id from public.workspace_voice_reservation where workspace = ${workspaceId}::uuid`).toHaveLength(0);
    await resultRows(f);
  });

  test("a root Call without saved campaign metadata cannot guess queue ownership", async () => {
    const f = await legacyAttempt();
    await sql`update public.call set campaign_id = null where sid = ${f.callSid}`;
    await finish(f);
    expect((await sql`select * from public.campaign_queue where id = ${f.queue.id}`)[0]).toEqual(f.queue);
    await resultRows(f);
  });

  test.each(['requeue', 'assignee'])("completion rechecks %s after waiting for the workspace lock", async changed => {
    const f = await legacyAttempt(), url = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
    if (!url) throw new Error('Owned fixture URL required');
    const blocker = postgres(url, { max: 1 }); let pending: ReturnType<typeof finish> | undefined; let before: unknown;
    try {
      const [{ pid }] = await blocker`select pg_backend_pid() pid`;
      await blocker.begin(async tx => {
        await tx`select id from public.workspace where id = ${workspaceId}::uuid for no key update`;
        pending = finish(f);
        let waiting = false;
        for (const deadline = Date.now() + 3000; Date.now() < deadline;) {
          const [row] = await sql`select count(*)::int waiting from pg_stat_activity where datname = current_database() and ${pid} = any(pg_blocking_pids(pid))`;
          if (row.waiting > 0) { waiting = true; break; }
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        if (!waiting) throw new Error('Legacy completion did not reach the owned workspace lock');
        if (changed === 'requeue') await tx`select public.handle_campaign_queue_entry(${f.contact}, ${f.campaign}, null, true)`;
        else await tx`update public.campaign_queue set assigned_to_user_id = ${otherActor} where id = ${f.queue.id}`;
        [before] = await tx`select * from public.campaign_queue where id = ${f.queue.id}`;
      });
      expect(before).toBeDefined();
      await pending;
      expect((await sql`select * from public.campaign_queue where id = ${f.queue.id}`)[0]).toEqual(before);
      await resultRows(f);
    } finally { await pending?.catch(() => undefined); await blocker.end(); }
  });

  test("a legacy child cannot borrow a queue ID from a parent in another workspace", async () => {
    const f = await legacyAttempt(), parent = sid();
    await sql`insert into public.call (sid, workspace, account_sid, queue_id, user_id, campaign_id, contact_id, outreach_attempt_id, status)
      values (${parent}, ${foreignId}::uuid, ${accountSid}, ${f.queue.id}, ${actor}::uuid, ${f.campaign}, ${f.contact}, ${f.attempt}, 'in-progress')`;
    await sql`update public.call set queue_id = null, parent_call_sid = ${parent} where sid = ${f.callSid}`;
    await finish(f);
    expect((await sql`select * from public.campaign_queue where id = ${f.queue.id}`)[0]).toEqual(f.queue);
    expect((await sql`select workspace, status from public.call where sid = ${parent}`)[0]).toEqual({ workspace: foreignId, status: 'in-progress' });
    await resultRows(f);
  });

  test("a saved queue ID for another contact cannot authorize the current contact row", async () => {
    const f = await legacyAttempt(), other = await legacyAttempt();
    await sql`update public.call set queue_id = ${other.queue.id} where sid = ${f.callSid}`;
    await finish(f);
    expect((await sql`select * from public.campaign_queue where id = ${f.queue.id}`)[0]).toEqual(f.queue);
    expect((await sql`select * from public.campaign_queue where id = ${other.queue.id}`)[0]).toEqual(other.queue);
    await resultRows(f);
  });

  test("an unbound Call without its original outreach attempt cannot infer a current queue owner", async () => {
    const f = await legacyAttempt();
    await sql`update public.call set queue_id = null, outreach_attempt_id = null where sid = ${f.callSid}`;
    const { dequeueLegacyVoiceAttempt } = await import('@/server/legacy-voice-queue.server');
    expect(await dequeueLegacyVoiceAttempt(workspaceId, f.callSid)).toEqual({ ownedPrimary: false, removedCount: 0 });
    expect((await sql`select * from public.campaign_queue where id = ${f.queue.id}`)[0]).toEqual(f.queue);
  });

  test("a progress event cannot advance queue work", async () => {
    const f = await legacyAttempt();
    await sql`update public.call set status = 'in-progress', duration = '0' where sid = ${f.callSid}`;
    await finish(f, 'in-progress');
    expect((await sql`select * from public.campaign_queue where id = ${f.queue.id}`)[0]).toEqual(f.queue);
    expect(await sql`select id from public.transaction_history where workspace = ${workspaceId}::uuid`).toHaveLength(0);
  });
});
