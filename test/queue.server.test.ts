import { beforeEach, describe, expect, test, vi } from "vitest";

import { enqueueContactsForCampaign } from "../app/lib/queue.server";

const rpcMocks = vi.hoisted(() => ({
  rpcReserveCampaignQueueOrderRange: vi.fn(),
  rpcHandleCampaignQueueEntry: vi.fn(),
}));

vi.mock("@/lib/db-rpc.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db-rpc.server")>()),
  rpcReserveCampaignQueueOrderRange: (...args: any[]) =>
    rpcMocks.rpcReserveCampaignQueueOrderRange(...args),
  rpcHandleCampaignQueueEntry: (...args: any[]) =>
    rpcMocks.rpcHandleCampaignQueueEntry(...args),
}));

describe("queue.server", () => {
  beforeEach(() => {
    rpcMocks.rpcReserveCampaignQueueOrderRange.mockReset();
    rpcMocks.rpcHandleCampaignQueueEntry.mockReset();
    rpcMocks.rpcReserveCampaignQueueOrderRange.mockResolvedValue(10);
    rpcMocks.rpcHandleCampaignQueueEntry.mockResolvedValue(undefined);
  });

  test("returns early when no contacts", async () => {
    await expect(enqueueContactsForCampaign(1, [])).resolves.toBeUndefined();
    expect(rpcMocks.rpcReserveCampaignQueueOrderRange).not.toHaveBeenCalled();
    expect(rpcMocks.rpcHandleCampaignQueueEntry).not.toHaveBeenCalled();
  });

  test("reserves a server range before writing queue entries", async () => {
    rpcMocks.rpcReserveCampaignQueueOrderRange.mockResolvedValueOnce(10);

    await enqueueContactsForCampaign(7, [1, 2], { requeue: true });

    expect(rpcMocks.rpcReserveCampaignQueueOrderRange).toHaveBeenCalledWith(
      expect.anything(),
      { campaignId: 7, count: 2 },
    );
    expect(rpcMocks.rpcHandleCampaignQueueEntry).toHaveBeenCalledTimes(2);
    expect(rpcMocks.rpcHandleCampaignQueueEntry).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      { contactId: 1, campaignId: 7, queueOrder: 10, requeue: true },
    );
    expect(rpcMocks.rpcHandleCampaignQueueEntry).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      { contactId: 2, campaignId: 7, queueOrder: 11, requeue: true },
    );
  });

  test("throws when startOrder reservation RPC fails", async () => {
    rpcMocks.rpcReserveCampaignQueueOrderRange.mockRejectedValueOnce(
      new Error("reserve failed"),
    );
    await expect(enqueueContactsForCampaign(1, [1])).rejects.toThrow(
      "reserve failed",
    );
  });

  test("reserves once for all batches of more than 100 contacts", async () => {
    const ids = Array.from({ length: 101 }, (_, i) => i + 1);
    rpcMocks.rpcReserveCampaignQueueOrderRange.mockResolvedValueOnce(5);
    await enqueueContactsForCampaign(9, ids);

    expect(rpcMocks.rpcReserveCampaignQueueOrderRange).toHaveBeenCalledTimes(1);
    expect(rpcMocks.rpcReserveCampaignQueueOrderRange).toHaveBeenCalledWith(
      expect.anything(), { campaignId: 9, count: 101 },
    );
    expect(rpcMocks.rpcHandleCampaignQueueEntry).toHaveBeenCalledTimes(101);
    expect(rpcMocks.rpcHandleCampaignQueueEntry).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      { contactId: 1, campaignId: 9, queueOrder: 5, requeue: false },
    );
    expect(rpcMocks.rpcHandleCampaignQueueEntry).toHaveBeenNthCalledWith(
      101,
      expect.anything(),
      { contactId: 101, campaignId: 9, queueOrder: 105, requeue: false },
    );
  });

  test("throws when queue-entry RPC returns error", async () => {
    rpcMocks.rpcReserveCampaignQueueOrderRange.mockResolvedValueOnce(1);
    rpcMocks.rpcHandleCampaignQueueEntry.mockRejectedValueOnce(
      new Error("rpc"),
    );
    await expect(enqueueContactsForCampaign(1, [1])).rejects.toThrow(
      "Failed to enqueue 1 contact(s) for campaign 1",
    );
  });

});
