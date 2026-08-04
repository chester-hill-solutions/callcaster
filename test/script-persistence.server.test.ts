import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  tdb: {
    script: {
      findFirst: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    },
    campaign: {
      count: vi.fn(),
      update: vi.fn(),
    },
    workspace_number: {
      count: vi.fn(),
    },
  },
  transaction: vi.fn(),
  createTenantDb: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  db: {
    transaction: mocks.transaction,
  },
}));

vi.mock("@/server/tenant-db", () => ({
  createTenantDb: mocks.createTenantDb,
}));

describe("script persistence", () => {
  beforeEach(() => {
    for (const table of Object.values(mocks.tdb)) {
      for (const fn of Object.values(table)) {
        fn.mockReset();
      }
    }
    mocks.transaction.mockReset();
    mocks.createTenantDb.mockReset();
    mocks.createTenantDb.mockReturnValue(mocks.tdb);
    mocks.transaction.mockImplementation(async (callback) => callback({ transaction: true }));
    mocks.tdb.campaign.count.mockResolvedValue(0);
    mocks.tdb.workspace_number.count.mockResolvedValue(0);
  });

  test("updates a workspace script with update metadata only", async () => {
    const { persistWorkspaceScript } = await import("@/lib/script-persistence.server");
    mocks.tdb.script.update.mockResolvedValueOnce([{ id: 4, name: "Revised" }]);

    await persistWorkspaceScript({
      mode: "update",
      workspaceId: "w1",
      actorId: "u1",
      timestamp: "2026-07-17T00:00:00.000Z",
      scriptId: 4,
      content: { name: "Revised", steps: { pages: {} }, type: "script" },
    });

    expect(mocks.tdb.script.update).toHaveBeenCalledWith(
      expect.objectContaining({
        set: {
          name: "Revised",
          steps: { pages: {} },
          type: "script",
          updated_by: "u1",
          updated_at: "2026-07-17T00:00:00.000Z",
        },
      }),
    );
    expect(mocks.tdb.script.update.mock.calls[0][0].set).not.toHaveProperty("created_by");
  });

  test("creates an explicit copy with aligned creation and update metadata", async () => {
    const { persistWorkspaceScript } = await import("@/lib/script-persistence.server");
    mocks.tdb.script.findFirst.mockResolvedValueOnce({ id: 4 });
    mocks.tdb.script.insert.mockResolvedValueOnce([{ id: 5, name: "Survey (Copy)" }]);

    const result = await persistWorkspaceScript({
      mode: "copy",
      workspaceId: "w1",
      actorId: "u1",
      timestamp: "now",
      sourceScriptId: 4,
      content: { name: "Survey", steps: {} },
    });

    expect(result).toMatchObject({ id: 5, name: "Survey (Copy)" });
    expect(mocks.tdb.script.insert).toHaveBeenCalledWith({
      name: "Survey (Copy)",
      steps: {},
      created_by: "u1",
      created_at: "now",
      updated_by: "u1",
      updated_at: "now",
    });
  });

  test("counts campaign and inbound-number references", async () => {
    const { getScriptUsage } = await import("@/lib/script-persistence.server");
    mocks.tdb.campaign.count.mockResolvedValueOnce(2);
    mocks.tdb.workspace_number.count.mockResolvedValueOnce(3);

    await expect(
      getScriptUsage({
        workspaceId: "w1",
        scriptId: 4,
        excludeCampaignId: 9,
      }),
    ).resolves.toEqual({
      campaignCount: 2,
      inboundNumberCount: 3,
      totalCount: 5,
    });
  });

  test("updates a campaign-exclusive script in place and relinks in one transaction", async () => {
    const { persistCampaignScript } = await import("@/lib/script-persistence.server");
    mocks.tdb.script.findFirst.mockResolvedValueOnce({ id: 4, name: "Survey" });
    mocks.tdb.script.update.mockResolvedValueOnce([{ id: 4, name: "Revised" }]);
    mocks.tdb.campaign.update.mockResolvedValueOnce([{ id: 9, script_id: 4 }]);

    const result = await persistCampaignScript({
      workspaceId: "w1",
      campaignId: 9,
      scriptId: 4,
      actorId: "u1",
      saveAsCopy: false,
      timestamp: "now",
      content: { name: "Revised", steps: {} },
    });

    expect(result).toMatchObject({ id: 4, name: "Revised" });
    expect(mocks.tdb.script.update).toHaveBeenCalledOnce();
    expect(mocks.tdb.script.insert).not.toHaveBeenCalled();
    expect(mocks.tdb.campaign.update).toHaveBeenCalledWith(
      expect.objectContaining({ set: { script_id: 4 } }),
    );
    expect(mocks.transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: "serializable" },
    );
  });

  test("updates in-place when another campaign references the script and saveAsCopy is false", async () => {
    const { persistCampaignScript } = await import("@/lib/script-persistence.server");
    mocks.tdb.script.findFirst.mockResolvedValueOnce({ id: 4, name: "Survey" });
    mocks.tdb.campaign.count.mockResolvedValueOnce(1);
    mocks.tdb.script.update.mockResolvedValueOnce([{ id: 4, name: "Survey" }]);
    mocks.tdb.campaign.update.mockResolvedValueOnce([{ id: 9, script_id: 4 }]);

    const result = await persistCampaignScript({
      workspaceId: "w1",
      campaignId: 9,
      scriptId: 4,
      actorId: "u1",
      saveAsCopy: false,
      timestamp: "now",
      content: { name: "Survey", steps: {} },
    });

    expect(result).toMatchObject({ id: 4, name: "Survey" });
    expect(mocks.tdb.script.update).toHaveBeenCalledOnce();
    expect(mocks.tdb.script.insert).not.toHaveBeenCalled();
  });

  test("updates in-place when an inbound number references the script and saveAsCopy is false", async () => {
    const { persistCampaignScript } = await import("@/lib/script-persistence.server");
    mocks.tdb.script.findFirst.mockResolvedValueOnce({ id: 4, name: "Survey" });
    mocks.tdb.workspace_number.count.mockResolvedValueOnce(1);
    mocks.tdb.script.update.mockResolvedValueOnce([{ id: 4, name: "Survey" }]);
    mocks.tdb.campaign.update.mockResolvedValueOnce([{ id: 9, script_id: 4 }]);

    const result = await persistCampaignScript({
      workspaceId: "w1",
      campaignId: 9,
      scriptId: 4,
      actorId: "u1",
      saveAsCopy: false,
      content: { name: "Survey", steps: {} },
    });

    expect(result).toMatchObject({ id: 4, name: "Survey" });
    expect(mocks.tdb.script.update).toHaveBeenCalledOnce();
    expect(mocks.tdb.script.insert).not.toHaveBeenCalled();
  });

  test("explicit campaign copy remains compatible when the script is exclusive", async () => {
    const { persistCampaignScript } = await import("@/lib/script-persistence.server");
    mocks.tdb.script.findFirst.mockResolvedValueOnce({ id: 4, name: "Survey" });
    mocks.tdb.script.insert.mockResolvedValueOnce([{ id: 8, name: "Renamed" }]);
    mocks.tdb.campaign.update.mockResolvedValueOnce([{ id: 9, script_id: 8 }]);

    await persistCampaignScript({
      workspaceId: "w1",
      campaignId: 9,
      scriptId: 4,
      actorId: "u1",
      saveAsCopy: true,
      content: { name: "Renamed", steps: {} },
    });

    expect(mocks.tdb.script.insert).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Renamed" }),
    );
    expect(mocks.tdb.script.update).not.toHaveBeenCalled();
  });

  test("fails safely when the campaign script is outside the tenant scope", async () => {
    const { persistCampaignScript } = await import("@/lib/script-persistence.server");
    mocks.tdb.script.findFirst.mockResolvedValueOnce(undefined);

    await expect(
      persistCampaignScript({
        workspaceId: "w1",
        campaignId: 9,
        scriptId: 404,
        actorId: "u1",
        saveAsCopy: false,
        content: { name: "Missing", steps: {} },
      }),
    ).rejects.toThrow("Script not found");
    expect(mocks.tdb.script.insert).not.toHaveBeenCalled();
    expect(mocks.tdb.script.update).not.toHaveBeenCalled();
    expect(mocks.tdb.campaign.update).not.toHaveBeenCalled();
  });

  test("fails the transaction when campaign relinking fails", async () => {
    const { persistCampaignScript } = await import("@/lib/script-persistence.server");
    mocks.tdb.script.findFirst.mockResolvedValueOnce({ id: 4, name: "Survey" });
    mocks.tdb.script.insert.mockResolvedValueOnce([{ id: 8, name: "Survey (Copy)" }]);
    mocks.tdb.campaign.update.mockResolvedValueOnce([]);

    await expect(
      persistCampaignScript({
        workspaceId: "w1",
        campaignId: 999,
        scriptId: 4,
        actorId: "u1",
        saveAsCopy: true,
        content: { name: "Survey", steps: {} },
      }),
    ).rejects.toThrow("Campaign not found");
    expect(mocks.transaction).toHaveBeenCalledOnce();
  });
});
