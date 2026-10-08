import { afterAll, describe, expect, test, vi } from "vitest";
import { sql } from "drizzle-orm";
import type { Database } from "@/server/db";

const adapters = vi.hoisted(() => ({
  callsCreate: vi.fn(async () => ({ sid: "CA2093" })),
  insertCall: vi.fn(async () => ({ sid: "CA2093" })),
  dequeue: vi.fn(async () => ({ dequeuedPrimary: true })),
}));

vi.mock("@/lib/database/workspace.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/database/workspace.server")>()),
  getWorkspaceTwilioPortalConfig: async () => ({ parallelDispatchEnabled: false }),
  createWorkspaceTwilioInstance: async () => ({ calls: { create: adapters.callsCreate } }),
}));
vi.mock("@/lib/database/campaign.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/database/campaign.server")>()),
  getCampaignQueueById: async () => [{
    id: 501, contact_id: 9001, campaign_id: 42, queue_state: "queued",
    contact: { id: 9001, phone: "+16135550199", opt_out: false },
  }],
}));
vi.mock("@/lib/campaign-ivr.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/campaign-ivr.server")>()),
  findCampaignInWorkspace: async () => ({
    id: 42, type: "simple_ivr", status: "running", caller_id: "+16135550000",
    end_date: null, schedule: Object.fromEntries(
      ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
        .map((day) => [day, { active: true, intervals: [{ start: "00:00", end: "23:59" }] }]),
    ),
  }),
}));
vi.mock("@/lib/campaign-queue-db.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/campaign-queue-db.server")>()),
  dequeueQueueEntry: adapters.dequeue,
}));
vi.mock("@/lib/db-rpc.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db-rpc.server")>()),
  rpcCreateOutreachAttempt: async () => 777,
  rpcFailExhaustedCampaignQueueContacts: async () => 0,
}));
vi.mock("@/lib/outbound-credit-gate.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/outbound-credit-gate.server")>()),
  requireOutboundCredits: async () => ({ ok: true, credits: 100 }),
}));
vi.mock("@/lib/recipient-calling-window", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/recipient-calling-window")>()),
  recipientCallingWindowStatus: () => ({ allowed: true }),
}));
vi.mock("@/lib/twilio-ivr-runtime.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/twilio-ivr-runtime.server")>()),
  resolveIvrCallUrls: () => ({
    flowUrl: "https://base.test/api/ivr/42/page_1/",
    statusCallback: "https://base.test/api/ivr/status", runtime: "remix",
  }),
}));
vi.mock("@/lib/twilio-client.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/twilio-client.server")>()),
  withTwilioRetry: (fn: () => unknown, options?: { beforeAttempt?: () => void }) => {
    options?.beforeAttempt?.();
    return fn();
  },
}));
vi.mock("@/lib/telephony-db.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/telephony-db.server")>()),
  insertCallForWorkspace: adapters.insertCall,
}));

const databaseUrl = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const workspaceId = "11111111-2222-4333-8444-555555555555";
const to = "+16135550199";

suite("campaign duplicate history against Postgres (#2093)", () => {
  afterAll(async () => {
    const { pool, directPool } = await import("@/server/db");
    await Promise.all([pool.end(), directPool.end()]);
  });

  async function withHistory(run: (tdb: ReturnType<typeof import("@/server/tenant-db").createTenantDb>, tx: Database) => Promise<void>) {
    process.env.DATABASE_URL = databaseUrl;
    const { db } = await import("@/server/db");
    const tenantModule = await import("@/server/tenant-db");
    await db.transaction(async (transaction) => {
      // A session-local table shadows call without touching the app's rows or schema.
      await transaction.execute(sql`create temporary table "call" (
        workspace uuid, campaign_id bigint, "to" text, outreach_attempt_id bigint
      ) on commit drop`);
      const tx = transaction as unknown as Database;
      const tdb = tenantModule.createTenantDb(workspaceId, tx);
      const tenantSpy = vi.spyOn(tenantModule, "createTenantDb").mockReturnValue(tdb);
      try {
        await run(tdb, tx);
      } finally {
        tenantSpy.mockRestore();
      }
    });
  }

  test("test calls and other workspace, campaign or phone rows do not count", async () => {
    await withHistory(async (tdb, tx) => {
      await tx.execute(sql`insert into "call" values
        (${workspaceId}, 42, ${to}, null),
        ('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', 42, ${to}, 11),
        (${workspaceId}, 43, ${to}, 12),
        (${workspaceId}, 42, '+16135550198', 13)`);
      const { countCampaignCallsToPhone, hasDuplicateCampaignCall } = await import("@/lib/telephony-db.server");
      expect(await countCampaignCallsToPhone(workspaceId, 42, to, { tdb })).toBe(0);
      expect(await hasDuplicateCampaignCall({ workspaceId, campaignId: "42", to, tdb })).toBe(false);

      const { dispatchCampaignIvrBatch } = await import("@/lib/campaign-ivr-dispatch.server");
      const result = await dispatchCampaignIvrBatch({ workspaceId, campaignId: "42", userId: "u1" });
      expect(result).toMatchObject({ kind: "dispatched", counts: { called: 1, dequeued: 0, failed: 0 } });
      expect(adapters.callsCreate).toHaveBeenCalledWith(expect.objectContaining({ to }));
      expect(adapters.insertCall).toHaveBeenCalledWith(workspaceId, expect.objectContaining({ outreach_attempt_id: 777 }));
      expect(adapters.dequeue).toHaveBeenCalledWith({ by: { id: 501 }, userId: "u1", reason: "IVR dial dispatched" });
    });
  });

  test("real outreach calls count and prevent the next dispatch", async () => {
    await withHistory(async (tdb, tx) => {
      await tx.execute(sql`insert into "call" values
        (${workspaceId}, 42, ${to}, null),
        (${workspaceId}, 42, ${to}, null),
        (${workspaceId}, 42, ${to}, 21)`);
      const { countCampaignCallsToPhone, hasDuplicateCampaignCall } = await import("@/lib/telephony-db.server");
      expect(await countCampaignCallsToPhone(workspaceId, "42", to, { tdb })).toBe(1);
      expect(await hasDuplicateCampaignCall({ workspaceId, campaignId: 42, to, tdb })).toBe(true);

      const { dispatchCampaignIvrBatch } = await import("@/lib/campaign-ivr-dispatch.server");
      const result = await dispatchCampaignIvrBatch({ workspaceId, campaignId: "42", userId: "u1" });
      expect(result).toMatchObject({ kind: "dispatched", counts: { called: 0, dequeued: 1, failed: 0 } });
      expect(adapters.callsCreate).not.toHaveBeenCalled();
      expect(adapters.dequeue).toHaveBeenCalledWith({ by: { id: 501 }, userId: "u1", reason: "Duplicate IVR call prevented" });
    });
  });

  test("real-call-only history retains duplicate protection", async () => {
    await withHistory(async (tdb, tx) => {
      await tx.execute(sql`insert into "call" values
        (${workspaceId}, 42, ${to}, 31),
        (${workspaceId}, 42, ${to}, 32)`);
      const { countCampaignCallsToPhone, hasDuplicateCampaignCall } = await import("@/lib/telephony-db.server");
      expect(await countCampaignCallsToPhone(workspaceId, 42, to, { tdb })).toBe(2);
      expect(await hasDuplicateCampaignCall({ workspaceId, campaignId: 42, to, tdb })).toBe(true);
    });
  });
});
