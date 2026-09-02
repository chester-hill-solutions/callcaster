import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  duplicateCampaign,
  nextCopyTitle,
} from "../app/lib/campaign-duplicate.server";

const mocks = vi.hoisted(() => ({
  findCampaignInWorkspace: vi.fn(),
  insertCampaignForWorkspace: vi.fn(),
  getCampaignQueueContactIds: vi.fn(async (): Promise<number[]> => []),
  enqueueContactsForCampaign: vi.fn(async () => undefined),
  listCampaignAudienceIds: vi.fn(async (): Promise<number[]> => []),
  insertCampaignAudienceLink: vi.fn(async () => undefined),
  campaignFindMany: vi.fn(async (): Promise<unknown[]> => []),
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock("@/lib/campaign-ivr.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/campaign-ivr.server")>()),
  findCampaignInWorkspace: (...args: unknown[]) => mocks.findCampaignInWorkspace(...args),
  insertCampaignForWorkspace: (...args: unknown[]) =>
    mocks.insertCampaignForWorkspace(...args),
}));
vi.mock("@/lib/campaign-queue-db.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/campaign-queue-db.server")>()),
  getCampaignQueueContactIds: (...args: unknown[]) =>
    mocks.getCampaignQueueContactIds(...args),
}));
vi.mock("@/lib/queue.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/queue.server")>()),
  enqueueContactsForCampaign: (...args: unknown[]) =>
    mocks.enqueueContactsForCampaign(...args),
}));
vi.mock("@/lib/campaign-audience-db.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/campaign-audience-db.server")>()),
  listCampaignAudienceIds: (...args: unknown[]) => mocks.listCampaignAudienceIds(...args),
  insertCampaignAudienceLink: (...args: unknown[]) =>
    mocks.insertCampaignAudienceLink(...args),
}));
vi.mock("@/server/tenant-db", () => ({
  createTenantDb: () => ({ campaign: { findMany: mocks.campaignFindMany } }),
}));
vi.mock("@/lib/logger.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/logger.server")>()),
  logger: mocks.logger,
}));

const source = {
  id: 99,
  workspace: "w1",
  title: "Fall outreach",
  status: "running",
  type: "message",
  created_at: "2026-08-01T00:00:00.000Z",
  script_id: 42,
  caller_id: "+15555550100",
};

describe("nextCopyTitle", () => {
  test.each([
    ["Fall outreach", [], "Fall outreach (Copy)"],
    ["Fall outreach", ["Fall outreach (Copy)"], "Fall outreach (Copy 2)"],
    [
      "Fall outreach",
      ["Fall outreach (Copy)", "Fall outreach (Copy 2)", "fall outreach (copy 3)"],
      "Fall outreach (Copy 4)",
    ],
    ["Fall outreach (Copy)", ["Fall outreach (Copy)"], "Fall outreach (Copy 2)"],
    ["Fall outreach (Copy 7)", [], "Fall outreach (Copy)"],
    ["", [], "Campaign (Copy)"],
    [null, ["Campaign (Copy)"], "Campaign (Copy 2)"],
  ])("%s with %j → %s", (title, existing, expected) => {
    expect(nextCopyTitle(title, existing)).toBe(expected);
  });
});

describe("duplicateCampaign", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findCampaignInWorkspace.mockResolvedValue(source);
    mocks.insertCampaignForWorkspace.mockResolvedValue({ id: 123 });
    mocks.campaignFindMany.mockResolvedValue([{ title: "Fall outreach" }]);
    mocks.getCampaignQueueContactIds.mockResolvedValue([]);
    mocks.listCampaignAudienceIds.mockResolvedValue([]);
  });

  test("copies the source row as a draft under a free title, then the queue and audiences", async () => {
    mocks.campaignFindMany.mockResolvedValue([
      { title: "Fall outreach" },
      { title: "Fall outreach (Copy)" },
    ]);
    mocks.getCampaignQueueContactIds.mockResolvedValue([5, 6]);
    mocks.listCampaignAudienceIds.mockResolvedValue([3]);

    const result = await duplicateCampaign({ workspaceId: "w1", campaignId: "99" });

    expect(result).toEqual({ ok: true, campaignId: 123, title: "Fall outreach (Copy 2)" });
    expect(mocks.insertCampaignForWorkspace).toHaveBeenCalledWith("w1", {
      workspace: "w1",
      title: "Fall outreach (Copy 2)",
      status: "draft",
      type: "message",
      script_id: 42,
      caller_id: "+15555550100",
    });
    expect(mocks.getCampaignQueueContactIds).toHaveBeenCalledWith(99, "w1");
    expect(mocks.enqueueContactsForCampaign).toHaveBeenCalledWith(123, [5, 6], {
      requeue: false,
    });
    expect(mocks.insertCampaignAudienceLink).toHaveBeenCalledWith(123, 3);
  });

  test("skips the queue copy when the source queue is empty", async () => {
    const result = await duplicateCampaign({ workspaceId: "w1", campaignId: 99 });
    expect(result.ok).toBe(true);
    expect(mocks.enqueueContactsForCampaign).not.toHaveBeenCalled();
  });

  test("returns 404 for a campaign outside the workspace", async () => {
    mocks.findCampaignInWorkspace.mockResolvedValue({ ...source, workspace: "other" });
    await expect(duplicateCampaign({ workspaceId: "w1", campaignId: 99 })).resolves.toEqual({
      ok: false,
      error: "Campaign not found",
      status: 404,
    });
    expect(mocks.insertCampaignForWorkspace).not.toHaveBeenCalled();
  });

  test("maps a unique-title race to a retryable conflict", async () => {
    mocks.insertCampaignForWorkspace.mockRejectedValue(
      Object.assign(new Error("Failed query"), { cause: { code: "23505" } }),
    );
    const result = await duplicateCampaign({ workspaceId: "w1", campaignId: 99 });
    expect(result).toEqual({
      ok: false,
      error: 'A campaign named "Fall outreach (Copy)" already exists. Try again.',
      status: 409,
    });
  });

  test("reports other insert failures generically and logs the detail", async () => {
    mocks.insertCampaignForWorkspace.mockRejectedValue(new Error("column x does not exist"));
    const result = await duplicateCampaign({ workspaceId: "w1", campaignId: 99 });
    expect(result).toEqual({
      ok: false,
      error: "Campaign could not be duplicated",
      status: 500,
    });
    expect(mocks.logger.error).toHaveBeenCalledWith(
      "campaign.duplicate.insert_failed",
      expect.objectContaining({ error: "column x does not exist" }),
    );
  });
});
