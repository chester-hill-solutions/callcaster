import { afterAll, describe, expect, test, vi } from "vitest";
import { sql } from "drizzle-orm";
import type { Database } from "@/server/db";

const databaseUrl = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const workspace = "11111111-2222-4333-8444-555555555555";
const otherWorkspace = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const agent = "11111111-2222-4333-8444-666666666666";
const otherAgent = "aaaaaaaa-bbbb-4ccc-8ddd-ffffffffffff";

suite("ACD setup failure releases actual offered state (#2130)", () => {
  afterAll(async () => {
    const { pool, directPool } = await import("@/server/db");
    await Promise.all([pool.end(), directPool.end()]);
  });

  async function withOffers(run: (tx: Database, entryId: number) => Promise<void>) {
    const { db } = await import("@/server/db");
    const rollback = new Error("Roll back isolated ACD fixture");
    try {
      await db.transaction(async (transaction) => {
        const tx = transaction as unknown as Database;
        await tx.execute(sql`insert into public."user" (id, username, created_at) values
          (${agent}, 'acd-cleanup-agent@example.test', now()),
          (${otherAgent}, 'acd-cleanup-other@example.test', now())`);
        await tx.execute(sql`insert into public.workspace (id, name, twilio_data, disabled, feature_flags, credits) values
          (${workspace}, 'ACD cleanup', '{}'::jsonb, false, '{}'::jsonb, 1000),
          (${otherWorkspace}, 'ACD control', '{}'::jsonb, false, '{}'::jsonb, 1000)`);
        await tx.execute(sql`insert into public.inbound_queue (workspace_id, name) values
          (${workspace}, 'Cleanup'), (${otherWorkspace}, 'Control')`);
        const entries = await tx.execute<{ id: number; workspace_id: string }>(sql`
          insert into public.inbound_queue_entry (queue_id, workspace_id, call_sid, status, offered_to_user_id)
          select id, workspace_id, 'CA-cleanup-' || id, 'offered'::public.queue_entry_state,
            case when workspace_id = ${workspace}::uuid then ${agent}::uuid else ${otherAgent}::uuid end
          from public.inbound_queue where workspace_id in (${workspace}, ${otherWorkspace})
          returning id, workspace_id`);
        const entryId = Number(entries.find((entry) => entry.workspace_id === workspace)?.id);
        expect(Number.isSafeInteger(entryId)).toBe(true);
        await tx.execute(sql`insert into public.agent_status (workspace_id, user_id, status, current_queue_entry_id)
          select workspace_id, offered_to_user_id, 'busy'::public.agent_state, id
          from public.inbound_queue_entry where workspace_id in (${workspace}, ${otherWorkspace})`);
        // Route cleanup keeps its real RPC; only the connection is bound to this rollback transaction.
        const spy = vi.spyOn(db, "execute").mockImplementation((query) => tx.execute(query));
        try { await run(tx, entryId); } finally { spy.mockRestore(); }
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
  }

  async function failSdkSetup(entryId: number) {
    const { dialAgent } = await import("@/lib/acd/acd-router.server");
    // The real SDK rejects this SID during construction before any network call.
    return dialAgent({
      workspaceId: workspace, twilioCredentials: { accountSid: "invalid-account-sid", authToken: "test-token" },
      agentUserId: agent, queueId: 7, entryId, baseUrl: "https://base.example", callerNumber: "+15550001111",
    });
  }

  test("SDK construction failure releases the exact offered entry and makes its agent available", async () => {
    await withOffers(async (tx, entryId) => {
      await expect(failSdkSetup(entryId)).resolves.toBeUndefined();
      const [entry] = await tx.execute(sql`select status from public.inbound_queue_entry where id = ${entryId}`);
      const [state] = await tx.execute(sql`select status, current_queue_entry_id from public.agent_status where workspace_id = ${workspace}`);
      const [control] = await tx.execute(sql`select status, current_queue_entry_id from public.agent_status where workspace_id = ${otherWorkspace}`);
      expect(entry?.status).toBe("timed_out");
      expect(state).toMatchObject({ status: "available", current_queue_entry_id: null });
      expect(control?.status).toBe("busy");
      expect(control?.current_queue_entry_id).not.toBeNull();
      const events = await tx.execute(sql`select workspace_id, user_id, from_status, to_status, reason from public.agent_status_event where workspace_id in (${workspace}, ${otherWorkspace})`);
      expect(events).toEqual([expect.objectContaining({ workspace_id: workspace, user_id: agent, from_status: "busy", to_status: "available", reason: "offer_timed_out" })]);
    });
  });

  test("an accepted entry remains busy when stale cleanup is requested", async () => {
    await withOffers(async (tx, entryId) => {
      await tx.execute(sql`update public.inbound_queue_entry set status = 'accepted' where id = ${entryId}`);
      await expect(failSdkSetup(entryId)).resolves.toBeUndefined();
      const [entry] = await tx.execute(sql`select status from public.inbound_queue_entry where id = ${entryId}`);
      const [state] = await tx.execute(sql`select status from public.agent_status where workspace_id = ${workspace}`);
      expect(entry?.status).toBe("accepted");
      expect(state?.status).toBe("busy");
    });
  });

  test("a missing entry cannot release another active offer", async () => {
    await withOffers(async (tx) => {
      const { releaseAgent } = await import("@/lib/acd/acd-router.server");
      await releaseAgent(-1, "timed_out");
      const states = await tx.execute(sql`select status from public.agent_status where workspace_id in (${workspace}, ${otherWorkspace})`);
      expect(states).toHaveLength(2);
      expect(states.every((state) => state.status === "busy")).toBe(true);
    });
  });
});
