import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { accountSid, actor, baseUrl, callerId, clearFault, customer, fault, funded, otherActor, sid, sql, useOwnedAudioFixture, workspaceId } from "../helpers/voice-audio-fixture";
import { asRouteResponse, routeArgs } from "../helpers/route-result";
import { advanceQueueEntry } from "@/lib/queue-advance-client";

async function queuedContact() {
  const [campaign] = await sql`insert into public.campaign (workspace, title, type, dial_type, status)
    values (${workspaceId}::uuid, ${'Owned call-screen queue ' + randomUUID()}, 'live_call', 'call', 'running') returning id`;
  const [contact] = await sql`insert into public.contact (workspace, firstname, phone)
    values (${workspaceId}::uuid, 'Owned queue customer', ${customer}) returning *`;
  const [queue] = await sql`insert into public.campaign_queue (workspace, campaign_id, contact_id, queue_state)
    values (${workspaceId}::uuid, ${campaign.id}, ${contact.id}, 'queued') returning *`;
  return { campaign, contact, queue, request: { workspace_id: workspaceId, contact_id: Number(contact.id), campaign_id: Number(campaign.id),
    household: false, queue_id: Number(queue.id), dispatch_generation: queue.dispatch_generation, voice_reservation_id: null as string | null } };
}

function entry(request: { queue_id: number; contact_id: number; dispatch_generation: string; voice_reservation_id: string | null }) {
  const { queue_id, contact_id, dispatch_generation, voice_reservation_id } = request;
  return { queue_id, contact_id, dispatch_generation, voice_reservation_id };
}

async function advance(body: Record<string, unknown>, expectedActor = actor) {
  const { action } = await import("../../app/routes/api+/queues.action.server");
  return asRouteResponse(action(routeArgs(new Request(`${baseUrl}/api/queues`, { method: "POST",
    headers: { "Content-Type": "application/json", "X-Callcaster-Audio-Actor": expectedActor }, body: JSON.stringify(body) }))));
}

async function fundedContact() {
  const f = await queuedContact(), owner = await funded();
  await sql`update public.workspace_voice_reservation set campaign_id = ${f.campaign.id}, contact_id = ${f.contact.id},
    queue_id = ${f.queue.id}, queue_generation = ${f.queue.dispatch_generation}::uuid where id = ${owner.id}::uuid`;
  await sql`update public.call set campaign_id = ${f.campaign.id}, contact_id = ${f.contact.id} where sid = ${owner.child}`;
  await sql`update public.campaign_queue set voice_reservation_id = ${owner.id}::uuid, queue_state = 'assigned',
    assigned_to_user_id = ${actor}::uuid where id = ${f.queue.id}`;
  return { ...f, owner, request: { ...f.request, voice_reservation_id: owner.id, call_sid: owner.child } };
}

async function householdSibling(f: Awaited<ReturnType<typeof queuedContact>>) {
  const [home] = await sql`insert into public.households (workspace_id, household_key, address)
    values (${workspaceId}::uuid, ${randomUUID()}, 'Owned delayed household') returning id`;
  await sql`update public.contact set household_id = ${home.id}::uuid where id = ${f.contact.id}`;
  const [contact] = await sql`insert into public.contact (workspace, firstname, phone, household_id)
    values (${workspaceId}::uuid, 'Owned delayed sibling', '+16135550888', ${home.id}::uuid) returning id`;
  const [queue] = await sql`insert into public.campaign_queue (workspace, campaign_id, contact_id, queue_state)
    values (${workspaceId}::uuid, ${f.campaign.id}, ${contact.id}, 'queued') returning *`;
  return { contact, queue, snapshot: { household_id: home.id, entries: [{ queue_id: Number(queue.id), contact_id: Number(contact.id), dispatch_generation: queue.dispatch_generation, voice_reservation_id: null }] } };
}

async function waitForBlock(pid: number) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const [row] = await sql`select count(*)::int waiting from pg_stat_activity
      where datname = current_database() and ${pid} = any(pg_blocking_pids(pid))`;
    if (row.waiting > 0) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error("Owned queue command did not reach its workspace lock");
}

describe("call-screen queue advance ownership", () => {
  useOwnedAudioFixture();
  afterEach(() => { vi.unstubAllGlobals(); });
  beforeEach(async () => {
    await sql`delete from public.outreach_attempt where workspace = ${workspaceId}::uuid`;
    await sql`delete from public.campaign_queue where workspace = ${workspaceId}::uuid`;
    await sql`delete from public.contact where workspace = ${workspaceId}::uuid`;
    await sql`delete from public.campaign where workspace = ${workspaceId}::uuid`;
    await sql`delete from public.households where workspace_id = ${workspaceId}::uuid`;
  });

  test("the current queue snapshot permits an idle manual skip", async () => {
    const f = await queuedContact();
    expect((await advance(f.request)).status).toBe(200);
    expect((await sql`select queue_state, dequeued_by from public.campaign_queue where id = ${f.queue.id}`)[0])
      .toEqual({ queue_state: "dequeued", dequeued_by: actor });
  });

  test("a delayed Save and Next cannot remove the contact after requeue", async () => {
    const f = await queuedContact();
    await sql`update public.campaign_queue set dispatch_generation = ${randomUUID()}::uuid,
      redial_requested_at = clock_timestamp() where id = ${f.queue.id}`;
    const [before] = await sql`select * from public.campaign_queue where id = ${f.queue.id}`;
    const response = await advance(f.request);
    expect((await sql`select * from public.campaign_queue where id = ${f.queue.id}`)[0]).toEqual(before);
    expect(response.status).toBe(409);
  });

  test("a captured queue ID cannot advance a rebuilt row even with the same generation", async () => {
    const f = await queuedContact();
    await sql`delete from public.campaign_queue where id = ${f.queue.id}`;
    const [rebuilt] = await sql`insert into public.campaign_queue (workspace, campaign_id, contact_id, queue_state, dispatch_generation)
      values (${workspaceId}::uuid, ${f.campaign.id}, ${f.contact.id}, 'queued', ${f.queue.dispatch_generation}::uuid) returning *`;
    const response = await advance(f.request);
    expect((await sql`select * from public.campaign_queue where id = ${rebuilt.id}`)[0]).toEqual(rebuilt);
    expect(response.status).toBe(409);
  });

  test("repeating the same committed skip returns an exact idempotent acknowledgement", async () => {
    const f = await queuedContact();
    expect((await advance(f.request)).status).toBe(200);
    const [before] = await sql`select * from public.campaign_queue where id = ${f.queue.id}`;
    const res = await advance(f.request);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ...f.request, success: true, dequeued: false, advance_state: "already_dequeued", user_id: actor, removed_entries: [entry(f.request)] });
    expect((await sql`select * from public.campaign_queue where id = ${f.queue.id}`)[0]).toEqual(before);
  });

  test("a changed signed-in actor cannot advance the captured row", async () => {
    const f = await queuedContact();
    expect((await advance(f.request, otherActor)).status).toBe(409);
    expect((await sql`select * from public.campaign_queue where id = ${f.queue.id}`)[0]).toEqual(f.queue);
  });

  test("an idle skip cannot remove another agent's assigned contact", async () => {
    const f = await queuedContact();
    await sql`update public.campaign_queue set queue_state = 'assigned', assigned_to_user_id = ${otherActor}::uuid where id = ${f.queue.id}`;
    const [before] = await sql`select * from public.campaign_queue where id = ${f.queue.id}`;
    expect((await advance(f.request)).status).toBe(409);
    expect((await sql`select * from public.campaign_queue where id = ${f.queue.id}`)[0]).toEqual(before);
  });

  test.each([false, true])("idle skip retains the household choice: %s", async household => {
    const f = await queuedContact();
    const [home] = await sql`insert into public.households (workspace_id, household_key, address)
      values (${workspaceId}::uuid, ${randomUUID()}, 'Owned queue household') returning id`;
    await sql`update public.contact set household_id = ${home.id}::uuid where id = ${f.contact.id}`;
    const [sibling] = await sql`insert into public.contact (workspace, firstname, phone, household_id)
      values (${workspaceId}::uuid, 'Owned sibling', '+16135550888', ${home.id}::uuid) returning id`;
    const [row] = await sql`insert into public.campaign_queue (workspace, campaign_id, contact_id, queue_state)
      values (${workspaceId}::uuid, ${f.campaign.id}, ${sibling.id}, 'queued') returning *`;
    const household_snapshot = { household_id: home.id, entries: [{ queue_id: Number(row.id), contact_id: Number(sibling.id), dispatch_generation: row.dispatch_generation, voice_reservation_id: null }] };
    expect((await advance({ ...f.request, household, ...(household ? { household_snapshot } : {}) })).status).toBe(200);
    expect((await sql`select queue_state from public.campaign_queue where id = ${row.id}`)[0].queue_state)
      .toBe(household ? 'dequeued' : 'queued');
  });

  test.each([false, true])("an idle household request preserves newer sibling work, rebuilt %s", async rebuilt => {
    const f = await queuedContact(), sibling = await householdSibling(f);
    let queueId = sibling.queue.id;
    if (rebuilt) {
      await sql`delete from public.campaign_queue where id = ${queueId}`;
      const [next] = await sql`insert into public.campaign_queue (workspace, campaign_id, contact_id, queue_state)
        values (${workspaceId}::uuid, ${f.campaign.id}, ${sibling.contact.id}, 'queued') returning id`;
      queueId = next.id;
    } else await sql`update public.campaign_queue set dispatch_generation = gen_random_uuid(), redial_requested_at = clock_timestamp()
      where id = ${queueId}`;
    const [before] = await sql`select * from public.campaign_queue where id = ${queueId}`;
    expect((await advance({ ...f.request, household: true, household_snapshot: sibling.snapshot })).status).toBe(200);
    expect((await sql`select * from public.campaign_queue where id = ${queueId}`)[0]).toEqual(before);
  });

  test.each([false, true])("an idle household skip preserves a live funded sibling, captured binding %s", async captured => {
    const f = await queuedContact(), sibling = await householdSibling(f), owner = await funded();
    await sql`update public.workspace_voice_reservation set campaign_id = ${f.campaign.id}, contact_id = ${sibling.contact.id},
      queue_id = ${sibling.queue.id}, queue_generation = ${sibling.queue.dispatch_generation}::uuid where id = ${owner.id}::uuid`;
    await sql`update public.call set campaign_id = ${f.campaign.id}, contact_id = ${sibling.contact.id} where sid = ${owner.child}`;
    await sql`update public.campaign_queue set voice_reservation_id = ${owner.id}::uuid, queue_state = 'assigned',
      assigned_to_user_id = ${actor}::uuid where id = ${sibling.queue.id}`;
    const [before] = await sql`select * from public.campaign_queue where id = ${sibling.queue.id}`;
    const household_snapshot = { ...sibling.snapshot, entries: sibling.snapshot.entries.map(entry => ({ ...entry, voice_reservation_id: captured ? owner.id : null })) };
    expect((await advance({ ...f.request, household: true, household_snapshot })).status).toBe(200);
    expect((await sql`select * from public.campaign_queue where id = ${sibling.queue.id}`)[0]).toEqual(before);
  });

  test("omitting the SID cannot bypass a live legacy customer without a reservation binding", async () => {
    const f = await queuedContact();
    await sql`insert into public.call (sid, workspace, user_id, campaign_id, contact_id, account_sid, "to", "from", status, queue_id)
      values (${sid()}, ${workspaceId}::uuid, ${actor}::uuid, ${f.campaign.id}, ${f.contact.id}, ${accountSid},
        ${customer}, ${callerId}, 'in-progress', ${f.queue.id})`;
    expect((await advance(f.request)).status).toBe(409);
    expect((await sql`select * from public.campaign_queue where id = ${f.queue.id}`)[0]).toEqual(f.queue);
  });

  test("a terminal legacy call does not block an idle queue action", async () => {
    const f = await queuedContact();
    await sql`insert into public.call (sid, workspace, user_id, campaign_id, contact_id, account_sid, "to", "from", status, queue_id)
      values (${sid()}, ${workspaceId}::uuid, ${actor}::uuid, ${f.campaign.id}, ${f.contact.id}, ${accountSid},
        ${customer}, ${callerId}, 'completed', ${f.queue.id})`;
    expect((await advance(f.request)).status).toBe(200);
    expect((await sql`select queue_state from public.campaign_queue where id = ${f.queue.id}`)[0].queue_state).toBe('dequeued');
  });

  test("the read-only snapshot includes off-page household members and confirms only captured rows", async () => {
    const f = await queuedContact(), sibling = await householdSibling(f);
    const { withQueueAdvanceSnapshots } = await import("@/server/queue-advance-snapshot.server");
    const [subject] = await withQueueAdvanceSnapshots([{ ...f.queue, id: Number(f.queue.id), campaign_id: Number(f.campaign.id),
      contact_id: Number(f.contact.id), contact: { ...f.contact, id: Number(f.contact.id), household_id: sibling.snapshot.household_id } }], workspaceId);
    expect(subject.advance_snapshot).toEqual(sibling.snapshot);
    expect((await sql`select * from public.campaign_queue where id = ${sibling.queue.id}`)[0]).toEqual(sibling.queue);
    const res = await advance({ ...f.request, household: true, household_snapshot: subject.advance_snapshot });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ removed_entries: [entry(f.request), sibling.snapshot.entries[0]] });
    expect((await sql`select queue_state from public.campaign_queue where id = ${sibling.queue.id}`)[0].queue_state).toBe('dequeued');
  });

  test("a live legacy sibling stays queued even when its exact snapshot is captured", async () => {
    const f = await queuedContact(), sibling = await householdSibling(f);
    await sql`insert into public.call (sid, workspace, user_id, campaign_id, contact_id, account_sid, "to", "from", status, queue_id)
      values (${sid()}, ${workspaceId}::uuid, ${actor}::uuid, ${f.campaign.id}, ${sibling.contact.id}, ${accountSid},
        ${customer}, ${callerId}, 'in-progress', ${sibling.queue.id})`;
    const res = await advance({ ...f.request, household: true, household_snapshot: sibling.snapshot });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ removed_entries: [entry(f.request)] });
    expect((await sql`select * from public.campaign_queue where id = ${sibling.queue.id}`)[0]).toEqual(sibling.queue);
  });

  test.each([false, true])("a funded household completion preserves a later redial: %s", async laterRedial => {
    const f = await fundedContact(), sibling = await householdSibling(f);
    await sql`update public.call set status = 'completed' where sid = ${f.owner.child}`;
    await sql`update public.campaign_queue set created_at = (select created_at - interval '1 second' from public.workspace_voice_reservation where id = ${f.owner.id}::uuid),
      redial_requested_at = ${laterRedial ? new Date() : null} where id = ${sibling.queue.id}`;
    const [before] = await sql`select * from public.campaign_queue where id = ${sibling.queue.id}`;
    const res = await advance({ ...f.request, household: true, household_snapshot: sibling.snapshot });
    expect(res.status).toBe(200);
    const ack = await res.json();
    expect(ack.removed_entries).toEqual(laterRedial ? [entry(f.request)] : [entry(f.request), sibling.snapshot.entries[0]]);
    const [after] = await sql`select * from public.campaign_queue where id = ${sibling.queue.id}`;
    if (laterRedial) expect(after).toEqual(before);
    else expect(after.queue_state).toBe('dequeued');
  });

  test("a contact from another campaign cannot be smuggled into a household snapshot", async () => {
    const f = await queuedContact(), sibling = await householdSibling(f), foreign = await queuedContact();
    const captured = { ...sibling.snapshot, entries: [entry(foreign.request)] };
    const res = await advance({ ...f.request, household: true, household_snapshot: captured });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ removed_entries: [entry(f.request)] });
    expect((await sql`select * from public.campaign_queue where id = ${foreign.queue.id}`)[0]).toEqual(foreign.queue);
  });

  test("disabling outbound calls still permits the current idle queue action", async () => {
    const f = await queuedContact();
    await sql`update public.workspace set disabled = true where id = ${workspaceId}::uuid`;
    expect((await advance(f.request)).status).toBe(200);
    expect((await sql`select queue_state from public.campaign_queue where id = ${f.queue.id}`)[0].queue_state).toBe('dequeued');
  });

  test("a failure on the second household write rolls back the primary too", async () => {
    const f = await queuedContact(), sibling = await householdSibling(f);
    const request = { ...f.request, household: true, household_snapshot: sibling.snapshot };
    await sql.unsafe(`create function public.${fault}() returns trigger language plpgsql as $$ begin if new.id = ${Number(sibling.queue.id)} then raise exception 'Owned household second-write fault'; end if; return new; end $$`);
    try {
      await sql.unsafe(`create trigger ${fault} before update on public.campaign_queue for each row execute function public.${fault}()`);
      expect((await advance(request)).status).toBe(500);
      expect((await sql`select * from public.campaign_queue where id = ${f.queue.id}`)[0]).toEqual(f.queue);
      expect((await sql`select * from public.campaign_queue where id = ${sibling.queue.id}`)[0]).toEqual(sibling.queue);
    } finally { await clearFault(); }
    const retry = await advance(request); expect(retry.status).toBe(200);
    await expect(retry.json()).resolves.toMatchObject({ removed_entries: [entry(f.request), sibling.snapshot.entries[0]] });
  });

  test("a live funded customer cannot be skipped by Save and Next", async () => {
    const f = await fundedContact();
    const [before] = await sql`select * from public.campaign_queue where id = ${f.queue.id}`;
    expect((await advance(f.request)).status).toBe(409);
    expect((await sql`select * from public.campaign_queue where id = ${f.queue.id}`)[0]).toEqual(before);
  });

  test("a terminal funded customer advances its exact row without settling its unknown hold", async () => {
    const f = await fundedContact();
    await sql`update public.call set status = 'completed' where sid = ${f.owner.child}`;
    const res = await advance(f.request); expect(res.status).toBe(200);
    expect((await sql`select queue_state from public.campaign_queue where id = ${f.queue.id}`)[0].queue_state).toBe('dequeued');
    expect((await sql`select state, terminal_duration from public.workspace_voice_reservation where id = ${f.owner.id}::uuid`)[0])
      .toEqual({ state: 'active', terminal_duration: null });
    expect(await sql`select id from public.transaction_history where workspace = ${workspaceId}::uuid`).toHaveLength(0);
  });

  test("omitting the customer SID cannot bypass a funded queue owner", async () => {
    const f = await fundedContact();
    await sql`update public.call set status = 'completed' where sid = ${f.owner.child}`;
    const [before] = await sql`select * from public.campaign_queue where id = ${f.queue.id}`;
    expect((await advance({ ...f.request, call_sid: undefined })).status).toBe(409);
    expect((await sql`select * from public.campaign_queue where id = ${f.queue.id}`)[0]).toEqual(before);
  });

  test.each([false, true])("a terminal customer can finish after its queue was requeued, rebuilt %s", async rebuilt => {
    const f = await fundedContact();
    await sql`update public.call set status = 'completed' where sid = ${f.owner.child}`;
    let queueId = f.queue.id;
    if (rebuilt) {
      await sql`delete from public.campaign_queue where id = ${f.queue.id}`;
      const [next] = await sql`insert into public.campaign_queue (workspace, campaign_id, contact_id, queue_state)
        values (${workspaceId}::uuid, ${f.campaign.id}, ${f.contact.id}, 'queued') returning id`;
      queueId = next.id;
    } else await sql`update public.campaign_queue set queue_state = 'queued', assigned_to_user_id = null,
      dispatch_generation = gen_random_uuid(), voice_reservation_id = null, redial_requested_at = clock_timestamp() where id = ${queueId}`;
    const [before] = await sql`select * from public.campaign_queue where id = ${queueId}`;
    const response = await advance(f.request);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ dequeued: false, advance_state: "superseded" });
    expect((await sql`select * from public.campaign_queue where id = ${queueId}`)[0]).toEqual(before);
  });

  test("an old terminal customer cannot advance a newer reservation in the same generation", async () => {
    const f = await fundedContact(), next = await funded();
    await sql`update public.call set status = 'completed' where sid = ${f.owner.child}`;
    await sql`update public.campaign_queue set voice_reservation_id = ${next.id}::uuid where id = ${f.queue.id}`;
    const [before] = await sql`select * from public.campaign_queue where id = ${f.queue.id}`;
    const response = await advance(f.request);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ dequeued: false, advance_state: "superseded" });
    expect((await sql`select * from public.campaign_queue where id = ${f.queue.id}`)[0]).toEqual(before);
  });

  test.each(["generation", "membership"])("the command rechecks %s after waiting for the workspace lock", async changed => {
    const f = await queuedContact(), url = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
    if (!url) throw new Error("Owned queue fixture URL is missing");
    const blocker = postgres(url, { max: 1 }); let pending: ReturnType<typeof advance> | undefined;
    const generation = randomUUID();
    try {
      const [{ pid }] = await blocker`select pg_backend_pid() pid`;
      await blocker.begin(async tx => {
        await tx`select id from public.workspace where id = ${workspaceId}::uuid for no key update`;
        pending = advance(f.request);
        await waitForBlock(pid);
        if (changed === "generation") await tx`update public.campaign_queue set dispatch_generation = ${generation}::uuid where id = ${f.queue.id}`;
        else await tx`delete from public.workspace_member where workspace_id = ${workspaceId} and user_id = ${actor}`;
      });
      if (!pending) throw new Error("Owned queue request did not start");
      expect((await pending).status).toBe(changed === "generation" ? 409 : 404);
      const [row] = await sql`select queue_state, dequeued_at, dispatch_generation from public.campaign_queue where id = ${f.queue.id}`;
      expect(row).toMatchObject({ queue_state: 'queued', dequeued_at: null,
        dispatch_generation: changed === "generation" ? generation : f.queue.dispatch_generation });
    } finally { await pending?.catch(() => undefined); await blocker.end(); }
  });

  test("a storage failure rolls back the skip and the same request can retry", async () => {
    const f = await queuedContact();
    await sql.unsafe(`create function public.${fault}() returns trigger language plpgsql as $$ begin raise exception 'Owned queue advance storage fault'; end $$`);
    try {
      await sql.unsafe(`create trigger ${fault} before update on public.campaign_queue for each row execute function public.${fault}()`);
      expect((await advance(f.request)).status).toBe(500);
      expect((await sql`select * from public.campaign_queue where id = ${f.queue.id}`)[0]).toEqual(f.queue);
    } finally { await clearFault(); }
    expect((await advance(f.request)).status).toBe(200);
  });

  test("a lost reply after commit retries the same real route without a second queue change", async () => {
    const f = await queuedContact(); let lost = true;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      const { action } = await import("../../app/routes/api+/queues.action.server");
      const response = await asRouteResponse(action(routeArgs(new Request(new URL(url, baseUrl), init))));
      const body = await response.json();
      if (lost) { lost = false; throw new TypeError("Owned queue reply lost after commit"); }
      return Response.json(body, { status: response.status });
    }));
    expect(await advanceQueueEntry(f.request, actor)).toMatchObject({ ok: false });
    const [committed] = await sql`select * from public.campaign_queue where id = ${f.queue.id}`;
    expect(committed.queue_state).toBe('dequeued');
    expect(await advanceQueueEntry(f.request, actor)).toEqual({ ok: true, advanceState: "already_dequeued", removedEntries: [entry(f.request)] });
    expect((await sql`select * from public.campaign_queue where id = ${f.queue.id}`)[0]).toEqual(committed);
  });
});
