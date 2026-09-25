import { beforeEach, describe, expect, test, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

const mocks = vi.hoisted(() => ({
  rpcTryCompleteCampaignIfDrained: vi.fn(async () => false),
  rpcCampaignIdsWithUnsettledMessages: vi.fn(async (): Promise<number[]> => []),
  createTenantDb: vi.fn(() => ({ kind: "tenant-db" })),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/server/tenant-db", () => ({
  createTenantDb: (...args: unknown[]) => mocks.createTenantDb(...args),
}));

// Spread importOriginal so a future export from these modules does not break
// this test with a missing-export error (see AGENTS.md: a literal vi.mock
// factory freezes the module surface).
vi.mock("@/lib/db-rpc.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db-rpc.server")>()),
  rpcTryCompleteCampaignIfDrained: (...args: unknown[]) =>
    mocks.rpcTryCompleteCampaignIfDrained(...args),
  rpcCampaignIdsWithUnsettledMessages: (...args: unknown[]) =>
    mocks.rpcCampaignIdsWithUnsettledMessages(...args),
}));

vi.mock("@/lib/logger.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/logger.server")>()),
  logger: mocks.logger,
}));

/**
 * #2048 — the completion re-check that makes the settled-message gate usable.
 *
 * The gate alone is a trap: the dispatch chain stops when the local queue
 * empties, so if nothing asks again once messages settle, every message
 * campaign is stranded at `running` forever. This module is that "ask again".
 *
 * Two contracts are asserted here:
 *
 *  1. It must never throw. It is called from the Twilio status webhook and the
 *     open-sync sweep; a throw there would fail a webhook that must return 200
 *     (Twilio retries, and billing side effects re-run) or fail a cron job.
 *  2. It must delegate candidate selection to SQL and never re-derive the
 *     unsettled filter in TypeScript. A first version filtered messages with
 *     Drizzle `notInArray` and shipped two bugs that no test caught: NULL rows
 *     were dropped (`NULL NOT IN (...)` is NULL), so a campaign whose messages
 *     had no provider callback was blocked by the gate and invisible to the
 *     sweep; and the row-level limit starved whole campaigns at blast scale.
 *     The behavioural half of that regression is pinned in
 *     test/integration-db/campaign-completion-gate.test.ts. What is asserted
 *     here is that this module asks the database, not itself.
 */
describe("campaign settle re-check (#2048)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpcTryCompleteCampaignIfDrained.mockResolvedValue(false);
    mocks.rpcCampaignIdsWithUnsettledMessages.mockResolvedValue([]);
    mocks.createTenantDb.mockReturnValue({ kind: "tenant-db" });
  });

  describe("recheckCampaignCompletion", () => {
    test("asks the gate about a campaign and reports completion", async () => {
      mocks.rpcTryCompleteCampaignIfDrained.mockResolvedValue(true);
      const { recheckCampaignCompletion } = await import(
        "@/lib/campaign-settle-recheck.server"
      );

      const completed = await recheckCampaignCompletion({
        workspaceId: "w1",
        campaignId: 42,
        reason: "sms_status:delivered",
      });

      expect(completed).toBe(true);
      expect(mocks.rpcTryCompleteCampaignIfDrained).toHaveBeenCalledWith(
        expect.anything(),
        42,
      );
    });

    test("does not ask the gate when there is no campaign", async () => {
      // Inbound replies have campaign_id NULL (#2046). There is nothing to ask
      // about and no RPC call to make.
      const { recheckCampaignCompletion } = await import(
        "@/lib/campaign-settle-recheck.server"
      );

      const completed = await recheckCampaignCompletion({
        workspaceId: "w1",
        campaignId: null,
        reason: "sms_status:received",
      });

      expect(completed).toBe(false);
      expect(mocks.rpcTryCompleteCampaignIfDrained).not.toHaveBeenCalled();
    });

    test("swallows a gate failure instead of throwing (#2048)", async () => {
      // Contract: a Twilio status webhook must still return 200 when this
      // check fails, or Twilio retries the callback and billing runs twice.
      mocks.rpcTryCompleteCampaignIfDrained.mockRejectedValue(
        new Error("completion rpc unavailable"),
      );
      const { recheckCampaignCompletion } = await import(
        "@/lib/campaign-settle-recheck.server"
      );

      await expect(
        recheckCampaignCompletion({
          workspaceId: "w1",
          campaignId: 42,
          reason: "sms_status:delivered",
        }),
      ).resolves.toBe(false);
      expect(mocks.logger.warn).toHaveBeenCalled();
    });
  });

  describe("recheckCampaignsWithUnsettledMessages", () => {
    test("asks SQL for the candidates instead of filtering messages itself", async () => {
      // The regression guard for the two shipped bugs. Candidate selection and
      // the cap belong to campaign_ids_with_unsettled_messages so the NULL and
      // distinct-limit rules are expressed once, in one language, next to the
      // gate they must agree with.
      mocks.rpcCampaignIdsWithUnsettledMessages.mockResolvedValue([7]);
      const { recheckCampaignsWithUnsettledMessages } = await import(
        "@/lib/campaign-settle-recheck.server"
      );

      await recheckCampaignsWithUnsettledMessages({
        workspaceId: "w1",
        reason: "twilio_open_sync",
      });

      expect(mocks.rpcCampaignIdsWithUnsettledMessages).toHaveBeenCalledWith(
        expect.anything(),
        "w1",
      );
    });

    test("asks the gate once per candidate and counts completions", async () => {
      mocks.rpcCampaignIdsWithUnsettledMessages.mockResolvedValue([7, 9]);
      mocks.rpcTryCompleteCampaignIfDrained
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);
      const { recheckCampaignsWithUnsettledMessages } = await import(
        "@/lib/campaign-settle-recheck.server"
      );

      const completed = await recheckCampaignsWithUnsettledMessages({
        workspaceId: "w1",
        reason: "twilio_open_sync",
      });

      expect(mocks.rpcTryCompleteCampaignIfDrained).toHaveBeenCalledTimes(2);
      expect(mocks.rpcTryCompleteCampaignIfDrained).toHaveBeenNthCalledWith(
        1,
        expect.anything(),
        7,
      );
      expect(mocks.rpcTryCompleteCampaignIfDrained).toHaveBeenNthCalledWith(
        2,
        expect.anything(),
        9,
      );
      expect(completed).toBe(1);
    });

    test("does no RPC work when nothing is unsettled", async () => {
      const { recheckCampaignsWithUnsettledMessages } = await import(
        "@/lib/campaign-settle-recheck.server"
      );

      const completed = await recheckCampaignsWithUnsettledMessages({
        workspaceId: "w1",
        reason: "twilio_open_sync",
      });

      expect(completed).toBe(0);
      expect(mocks.rpcTryCompleteCampaignIfDrained).not.toHaveBeenCalled();
    });

    test("swallows a candidate-lookup failure instead of failing the cron job", async () => {
      mocks.rpcCampaignIdsWithUnsettledMessages.mockRejectedValue(
        new Error("db unavailable"),
      );
      const { recheckCampaignsWithUnsettledMessages } = await import(
        "@/lib/campaign-settle-recheck.server"
      );

      await expect(
        recheckCampaignsWithUnsettledMessages({
          workspaceId: "w1",
          reason: "twilio_open_sync",
        }),
      ).resolves.toBe(0);
      expect(mocks.logger.warn).toHaveBeenCalled();
    });
  });
});
