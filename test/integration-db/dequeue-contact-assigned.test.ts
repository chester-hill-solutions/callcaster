import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import type { RpcExecutor } from "@/lib/db-rpc.server";
import type { dequeueQueueEntry as DequeueFn } from "@/lib/campaign-queue-db.server";

/**
 * The real `dequeue_contact` plpgsql function, exercised through the app's
 * single caller-facing dequeue interface (`dequeueQueueEntry`, #1240 B3).
 *
 * Issue #1260: both UPDATEs in `dequeue_contact` were guarded with
 * `queue_state is null or queue_state = 'queued'`, but every RPC-mode call
 * site fires after the row has been claimed to `assigned`. The dequeue
 * silently no-oped on exactly the row it was called for — most damagingly on
 * auto-dial's ambiguous-dial park path, where the RPC is the only dequeue, so
 * a contact deliberately parked ("call may exist at Twilio; parked for
 * review, not redialed") was left `assigned` until
 * `reset_stale_campaign_queue_claims` requeued it for redial.
 *
 * `client/migrations/20260815120000_dequeue_contact_covers_assigned_rows.sql`
 * widens the predicate to also cover `assigned` rows whose
 * `assigned_to_user_id` equals the caller — the claim is a token, so a caller
 * who no longer holds it still no-ops. The race-guard tests below are the
 * half of that contract that must not regress if someone later "simplifies"
 * the predicate to an unconditional UPDATE.
 *
 * No other automated test runs this function against a real database: the
 * unit tier mocks the db client, and
 * test/scope-dequeue-and-outreach-attempt.integration.test.ts asserts on the
 * migration's SQL *text*, which a predicate bug like this one passes happily.
 */

// The realtime side channel is covered by test/queue-events*.test.ts and is
// explicitly non-fatal in production; stubbing it keeps this suite to one
// subject (the RPC + its TS wrapper's row selection).
vi.mock("@/lib/workspace-events.server", () => ({
  emitQueueEvent: vi.fn(async () => undefined),
  emitPostgresChangeEvent: vi.fn(async () => undefined),
}));

const DATABASE_URL = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;

if (!DATABASE_URL) {
  process.stderr.write(
    [
      "",
      "!".repeat(72),
      "!! integration-db SKIPPED: no INTEGRATION_DB_URL / DATABASE_URL set.",
      "!!",
      "!! test/integration-db/dequeue-contact-assigned.test.ts is the ONLY test",
      "!! that runs the real dequeue_contact plpgsql function. Skipping it means",
      "!! issue #1260 (dequeue silently no-ops on the claimed row) is UNGUARDED",
      "!! in this run.",
      "!!",
      "!! To run it:",
      "!!   docker compose -f docker-compose.dev.yml up -d postgres",
      "!!   export DATABASE_URL=postgresql://callcaster:callcaster@127.0.0.1:5433/callcaster",
      "!!   node scripts/e2e/bootstrap-compose-db.mjs",
      "!!   npm run test:integration-db",
      "!!",
      "!! CI runs it as part of `npm run test:e2e:compose`.",
      "!".repeat(72),
      "",
    ].join("\n"),
  );
}

const describeDb = DATABASE_URL ? describe : describe.skip;

const AGENT_A = "1d1e0000-0000-4000-8000-00000000000a";
const AGENT_B = "1d1e0000-0000-4000-8000-00000000000b";

type QueueRow = {
  id: string;
  contact_id: string;
  queue_state: string | null;
  assigned_to_user_id: string | null;
  dequeued_at: string | null;
  dequeued_by: string | null;
  dequeued_reason: string | null;
  provider_status: string | null;
};

describeDb("dequeue_contact against real Postgres", () => {
  let client: postgres.Sql;
  let exec: RpcExecutor;
  let dequeueQueueEntry: typeof DequeueFn;
  let workspaceId: string;
  let campaignId: string;
  let householdId: string;
  let primaryContactId: string;
  let siblingContactId: string;
  let loneContactId: string;

  async function queueRow(contactId: string): Promise<QueueRow> {
    const rows = await client<QueueRow[]>`
      select
        id::text as id,
        contact_id::text as contact_id,
        queue_state,
        assigned_to_user_id::text as assigned_to_user_id,
        dequeued_at::text as dequeued_at,
        dequeued_by::text as dequeued_by,
        dequeued_reason,
        provider_status
      from public.campaign_queue
      where campaign_id = ${campaignId}::bigint
        and contact_id = ${contactId}::bigint
    `;
    return rows[0];
  }

  /** Put a queue row into exactly the state a claim RPC leaves behind. */
  async function setState(
    contactId: string,
    state: {
      queue_state: string | null;
      assigned_to_user_id?: string | null;
      provider_status?: string | null;
    },
  ) {
    await client`
      update public.campaign_queue
      set queue_state = ${state.queue_state},
          assigned_to_user_id = ${state.assigned_to_user_id ?? null}::uuid,
          provider_status = ${state.provider_status ?? null},
          claimed_at = ${state.queue_state === "assigned" ? client`now()` : null},
          dequeued_at = null,
          dequeued_by = null,
          dequeued_reason = null
      where campaign_id = ${campaignId}::bigint
        and contact_id = ${contactId}::bigint
    `;
  }

  beforeAll(async () => {
    client = postgres(DATABASE_URL as string, {
      max: 5,
      prepare: false,
      connect_timeout: 10,
      onnotice: () => {},
    });
    const database = drizzle(client);
    exec = {
      execute: (query) => database.execute(query) as unknown as Promise<unknown[]>,
    };

    ({ dequeueQueueEntry } = await import("@/lib/campaign-queue-db.server"));

    await client`
      insert into public."user" (id, username, first_name, last_name)
      values
        (${AGENT_A}::uuid, 'integration-db-dequeue-a@example.test', 'Agent', 'A'),
        (${AGENT_B}::uuid, 'integration-db-dequeue-b@example.test', 'Agent', 'B')
      on conflict (id) do nothing
    `;

    const workspaces = await client<{ id: string }[]>`
      insert into public.workspace (name, credits, twilio_data, feature_flags, disabled)
      values ('Integration DB Dequeue Fixture', 0, '{}'::jsonb, '{}'::jsonb, false)
      returning id::text as id
    `;
    workspaceId = workspaces[0].id;

    const campaigns = await client<{ id: string }[]>`
      insert into public.campaign (title, workspace, group_household_queue, dial_type)
      values ('Integration DB Dequeue Campaign', ${workspaceId}::uuid, true, 'call')
      returning id::text as id
    `;
    campaignId = campaigns[0].id;

    const households = await client<{ id: string }[]>`
      insert into public.households (household_key, workspace_id, address)
      values ('integration-db-dequeue', ${workspaceId}::uuid, '1 Integration Way')
      returning id::text as id
    `;
    householdId = households[0].id;

    const contacts = await client<{ id: string }[]>`
      insert into public.contact (firstname, surname, phone, address, workspace, household_id)
      values
        ('Primary', 'Household', '+15550100001', '1 Integration Way', ${workspaceId}::uuid, ${householdId}::uuid),
        ('Sibling', 'Household', '+15550100002', '1 Integration Way', ${workspaceId}::uuid, ${householdId}::uuid),
        ('Lone', 'Contact', '+15550100003', '2 Integration Way', ${workspaceId}::uuid, null)
      returning id::text as id
    `;
    [primaryContactId, siblingContactId, loneContactId] = contacts.map((row) => row.id);

    await client`
      insert into public.campaign_queue (contact_id, campaign_id, workspace, queue_state, queue_order)
      values
        (${primaryContactId}::bigint, ${campaignId}::bigint, ${workspaceId}::uuid, 'queued', 1),
        (${siblingContactId}::bigint, ${campaignId}::bigint, ${workspaceId}::uuid, 'queued', 2),
        (${loneContactId}::bigint, ${campaignId}::bigint, ${workspaceId}::uuid, 'queued', 3)
    `;
  });

  afterAll(async () => {
    if (!client) return;
    if (workspaceId) {
      // campaign_queue/contact/campaign/households all cascade from workspace.
      await client`delete from public.workspace where id = ${workspaceId}::uuid`;
    }
    await client`delete from public."user" where id in (${AGENT_A}::uuid, ${AGENT_B}::uuid)`;
    await client.end({ timeout: 5 });
  });

  beforeEach(async () => {
    await setState(primaryContactId, { queue_state: "queued" });
    await setState(siblingContactId, { queue_state: "queued" });
    await setState(loneContactId, { queue_state: "queued" });
  });

  test("the fixture starts with three queued rows", async () => {
    for (const contactId of [primaryContactId, siblingContactId, loneContactId]) {
      const row = await queueRow(contactId);
      expect(row.queue_state).toBe("queued");
      expect(row.dequeued_at).toBeNull();
    }
  });

  // ── #1260: the claimed row must actually dequeue ────────────────────────

  test("the park path dequeues a row the caller holds as 'assigned'", async () => {
    // Exactly what claim_next_queue_contact leaves behind before
    // auto-dial.server.ts's ambiguous-dial-failure park runs.
    await setState(loneContactId, {
      queue_state: "assigned",
      assigned_to_user_id: AGENT_A,
      provider_status: "initiated",
    });

    await dequeueQueueEntry({
      by: { contactId: Number(loneContactId) },
      workspaceId,
      // The park path: guarded RPC, no household fan-out.
      household: false,
      userId: AGENT_A,
      reason: "Ambiguous dial failure — parked for review",
      exec,
    });

    const row = await queueRow(loneContactId);
    expect(row.queue_state).toBe("dequeued");
    expect(row.dequeued_at).not.toBeNull();
    expect(row.dequeued_by).toBe(AGENT_A);
    expect(row.dequeued_reason).toBe("Ambiguous dial failure — parked for review");
    // The dequeue transition owns the whole column set: a parked row must not
    // keep a stale claim or a stale provider status.
    expect(row.assigned_to_user_id).toBeNull();
    expect(row.provider_status).toBeNull();
  });

  test("household fan-out dequeues both the caller's assigned row and its queued sibling", async () => {
    // The auto-dial happy path: primary claimed by the agent, sibling still
    // queued. Before #1260 only the SIBLING was dequeued.
    await setState(primaryContactId, {
      queue_state: "assigned",
      assigned_to_user_id: AGENT_A,
    });

    await dequeueQueueEntry({
      by: { contactId: Number(primaryContactId) },
      workspaceId,
      household: true,
      userId: AGENT_A,
      reason: "Predictive Dialer called contact",
      exec,
    });

    const primary = await queueRow(primaryContactId);
    const sibling = await queueRow(siblingContactId);
    expect(primary.queue_state).toBe("dequeued");
    expect(primary.dequeued_at).not.toBeNull();
    expect(sibling.queue_state).toBe("dequeued");
    expect(sibling.dequeued_at).not.toBeNull();
  });

  test("a queued row still dequeues (the pre-existing path is unchanged)", async () => {
    await dequeueQueueEntry({
      by: { contactId: Number(loneContactId) },
      workspaceId,
      household: false,
      userId: AGENT_A,
      reason: "Manually dequeued by user",
      exec,
    });

    const row = await queueRow(loneContactId);
    expect(row.queue_state).toBe("dequeued");
    expect(row.dequeued_by).toBe(AGENT_A);
  });

  test("a row with a null queue_state (legacy) still dequeues", async () => {
    await setState(loneContactId, { queue_state: null });

    await dequeueQueueEntry({
      by: { contactId: Number(loneContactId) },
      workspaceId,
      household: false,
      userId: AGENT_A,
      reason: "Legacy null state",
      exec,
    });

    expect((await queueRow(loneContactId)).queue_state).toBe("dequeued");
  });

  // ── the race guard the widened predicate must keep ──────────────────────

  test("a stale dequeue does NOT touch a row another agent now holds", async () => {
    // The race the original queued-only predicate existed to prevent: agent A
    // decides to dequeue, the row is reclaimed in the meantime (stale-claim
    // reset + a fresh claim), and A's dequeue arrives late. Killing agent B's
    // live call here is strictly worse than leaving the row alone.
    await setState(loneContactId, {
      queue_state: "assigned",
      assigned_to_user_id: AGENT_B,
      provider_status: "in-progress",
    });

    await dequeueQueueEntry({
      by: { contactId: Number(loneContactId) },
      workspaceId,
      household: false,
      userId: AGENT_A,
      reason: "Stale dequeue from agent A",
      exec,
    });

    const row = await queueRow(loneContactId);
    expect(row.queue_state).toBe("assigned");
    expect(row.assigned_to_user_id).toBe(AGENT_B);
    expect(row.provider_status).toBe("in-progress");
    expect(row.dequeued_at).toBeNull();
  });

  test("household fan-out does NOT reach a sibling another agent holds", async () => {
    await setState(primaryContactId, {
      queue_state: "assigned",
      assigned_to_user_id: AGENT_A,
    });
    await setState(siblingContactId, {
      queue_state: "assigned",
      assigned_to_user_id: AGENT_B,
      provider_status: "ringing",
    });

    await dequeueQueueEntry({
      by: { contactId: Number(primaryContactId) },
      workspaceId,
      household: true,
      userId: AGENT_A,
      reason: "Predictive Dialer called contact",
      exec,
    });

    expect((await queueRow(primaryContactId)).queue_state).toBe("dequeued");
    const sibling = await queueRow(siblingContactId);
    expect(sibling.queue_state).toBe("assigned");
    expect(sibling.assigned_to_user_id).toBe(AGENT_B);
    expect(sibling.dequeued_at).toBeNull();
  });

  test("a system dequeue with no user id does not gain an unguarded write", async () => {
    // status.action.server.ts passes `null` when a conference name does not
    // parse into a user id. `assigned_to_user_id = null` is never true, so
    // those callers keep the pre-#1260 behaviour rather than becoming able to
    // dequeue any agent's claimed row.
    await setState(loneContactId, {
      queue_state: "assigned",
      assigned_to_user_id: AGENT_A,
    });

    await dequeueQueueEntry({
      by: { contactId: Number(loneContactId) },
      workspaceId,
      household: false,
      userId: null,
      reason: "Call completed",
      exec,
    });

    const row = await queueRow(loneContactId);
    expect(row.queue_state).toBe("assigned");
    expect(row.assigned_to_user_id).toBe(AGENT_A);
  });

  test("the workspace predicate still scopes every write", async () => {
    // 20260807120000's cross-tenant fix, re-asserted at runtime now that the
    // state predicate next to it has changed.
    await setState(loneContactId, {
      queue_state: "assigned",
      assigned_to_user_id: AGENT_A,
    });

    const otherWorkspaces = await client<{ id: string }[]>`
      insert into public.workspace (name, credits, twilio_data, feature_flags, disabled)
      values ('Integration DB Dequeue Other Workspace', 0, '{}'::jsonb, '{}'::jsonb, false)
      returning id::text as id
    `;
    const otherWorkspaceId = otherWorkspaces[0].id;

    try {
      await dequeueQueueEntry({
        by: { contactId: Number(loneContactId) },
        workspaceId: otherWorkspaceId,
        household: false,
        userId: AGENT_A,
        reason: "Cross-tenant dequeue attempt",
        exec,
      });

      const row = await queueRow(loneContactId);
      expect(row.queue_state).toBe("assigned");
      expect(row.dequeued_at).toBeNull();
    } finally {
      await client`delete from public.workspace where id = ${otherWorkspaceId}::uuid`;
    }
  });
});
