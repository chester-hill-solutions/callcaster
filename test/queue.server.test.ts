import { beforeEach, describe, expect, test, vi } from "vitest";

import { enqueueContactsForCampaign } from "../app/lib/queue.server";

const rpcMocks = vi.hoisted(() => ({
  rpcReserveCampaignQueueOrderRange: vi.fn(),
  rpcHandleCampaignQueueEntry: vi.fn(),
}));

vi.mock("@/lib/db-rpc.server", () => ({
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

  test("reserves startOrder in DB when not provided", async () => {
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

  test("uses provided startOrder and batches >100 contacts", async () => {
    const ids = Array.from({ length: 101 }, (_, i) => i + 1);
    await enqueueContactsForCampaign(9, ids, { startOrder: 5 });

    expect(rpcMocks.rpcReserveCampaignQueueOrderRange).not.toHaveBeenCalled();
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

  test("accepts string startOrder values from parsed forms", async () => {
    await enqueueContactsForCampaign(9, [1, 2], { startOrder: "5" });
    expect(rpcMocks.rpcReserveCampaignQueueOrderRange).not.toHaveBeenCalled();
    expect(rpcMocks.rpcHandleCampaignQueueEntry).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      { contactId: 1, campaignId: 9, queueOrder: 5, requeue: false },
    );
    expect(rpcMocks.rpcHandleCampaignQueueEntry).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      { contactId: 2, campaignId: 9, queueOrder: 6, requeue: false },
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

  test("falls back to reservation when startOrder is non-numeric string", async () => {
    rpcMocks.rpcReserveCampaignQueueOrderRange.mockResolvedValueOnce(4);
    await enqueueContactsForCampaign(8, [11], { startOrder: "abc" });
    expect(rpcMocks.rpcReserveCampaignQueueOrderRange).toHaveBeenCalledWith(
      expect.anything(),
      { campaignId: 8, count: 1 },
    );
    expect(rpcMocks.rpcHandleCampaignQueueEntry).toHaveBeenCalledWith(
      expect.anything(),
      { contactId: 11, campaignId: 8, queueOrder: 4, requeue: false },
    );
  });
});
