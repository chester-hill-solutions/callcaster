import { beforeEach, describe, expect, test, vi } from "vitest";

const tdbMocks = vi.hoisted(() => ({
  campaign: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
  },
  script: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
  message: {
    findMany: vi.fn(),
  },
  outreach_attempt: {
    findMany: vi.fn(),
    count: vi.fn(),
  },
}));

const dbMocks = vi.hoisted(() => ({
  select: vi.fn(),
}));

const rpcMocks = vi.hoisted(() => ({
  rpcGetCampaignStats: vi.fn(),
}));

const queueSearchMocks = vi.hoisted(() => ({
  countCampaignQueueRows: vi.fn(),
  countQueuedCampaignQueueRows: vi.fn(),
  countDialableCampaignQueueRows: vi.fn(),
  countDialableCompletedCampaignQueueRows: vi.fn(),
  countDialableQueuedCampaignQueueRows: vi.fn(),
  fetchCampaignQueueWithContacts: vi.fn(),
  fetchDialableCampaignQueueWithContacts: vi.fn(),
}));

describe("app/lib/database/campaign.server.ts", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const table of Object.values(tdbMocks)) {
      for (const fn of Object.values(table)) {
        (fn as ReturnType<typeof vi.fn>).mockReset();
      }
    }
    dbMocks.select.mockReset();
    vi.doMock("@/server/tenant-db", () => ({
      createTenantDb: vi.fn(() => tdbMocks),
    }));
    vi.doMock("@/server/db", () => ({
      db: {
        select: dbMocks.select,
      },
    }));
    vi.doMock("../app/lib/logger.server", () => ({
      logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    }));
    vi.doMock("../app/lib/database/workspace.server", () => ({
      getSignedUrls: vi.fn(async () => ["signed-1"]),
    }));
    vi.doMock("../app/lib/db-rpc.server", () => ({
      rpcGetCampaignStats: rpcMocks.rpcGetCampaignStats,
    }));
    vi.doMock("../app/lib/campaign-queue-search.server", () => ({
      countCampaignQueueRows: queueSearchMocks.countCampaignQueueRows,
      countQueuedCampaignQueueRows: queueSearchMocks.countQueuedCampaignQueueRows,
      countDialableCampaignQueueRows: queueSearchMocks.countDialableCampaignQueueRows,
      countDialableCompletedCampaignQueueRows: queueSearchMocks.countDialableCompletedCampaignQueueRows,
      countDialableQueuedCampaignQueueRows: queueSearchMocks.countDialableQueuedCampaignQueueRows,
      fetchCampaignQueueWithContacts: queueSearchMocks.fetchCampaignQueueWithContacts,
      fetchDialableCampaignQueueWithContacts: queueSearchMocks.fetchDialableCampaignQueueWithContacts,
    }));
    rpcMocks.rpcGetCampaignStats.mockReset();
    for (const fn of Object.values(queueSearchMocks)) {
      fn.mockReset();
    }
    queueSearchMocks.countCampaignQueueRows.mockResolvedValue(0);
    queueSearchMocks.countQueuedCampaignQueueRows.mockResolvedValue(0);
    queueSearchMocks.countDialableCampaignQueueRows.mockResolvedValue(0);
    queueSearchMocks.countDialableCompletedCampaignQueueRows.mockResolvedValue(0);
    queueSearchMocks.countDialableQueuedCampaignQueueRows.mockResolvedValue(0);
    queueSearchMocks.fetchCampaignQueueWithContacts.mockResolvedValue([]);
    queueSearchMocks.fetchDialableCampaignQueueWithContacts.mockResolvedValue([]);
  });

  test("getCampaignTableKey maps types and throws for invalid", async () => {
    const mod = await import("../app/lib/database/campaign.server");
    expect(mod.getCampaignTableKey("live_call")).toBe("live_campaign");
    expect(mod.getCampaignTableKey("message")).toBe("message_campaign");
    expect(mod.getCampaignTableKey("robocall")).toBe("ivr_campaign");
    expect(mod.getCampaignTableKey("simple_ivr")).toBe("ivr_campaign");
    expect(mod.getCampaignTableKey("complex_ivr")).toBe("ivr_campaign");
    expect(() => mod.getCampaignTableKey("nope" as any)).toThrow("Invalid campaign type");
  });

  test("getWorkspaceCampaigns logs on error and returns {data,error}", async () => {
    const { logger } = await import("../app/lib/logger.server");
    const mod = await import("../app/lib/database/campaign.server");

    tdbMocks.campaign.findMany.mockRejectedValueOnce(new Error("x"));
    const res = await mod.getWorkspaceCampaigns({ workspaceId: "w1" });
    expect(res.data).toBeNull();
    expect(res.error).toBeInstanceOf(Error);
    expect(logger.error).toHaveBeenCalled();
  });

  test("getWorkspaceCampaigns success path does not log", async () => {
    const { logger } = await import("../app/lib/logger.server");
    const mod = await import("../app/lib/database/campaign.server");

    tdbMocks.campaign.findMany.mockResolvedValueOnce([{ id: 1 }]);
    const res = await mod.getWorkspaceCampaigns({ workspaceId: "w1" });
    expect(res).toEqual({ data: [{ id: 1 }], error: null });
    expect(logger.error).not.toHaveBeenCalled();
  });

  test("updateCampaign updates unified campaign row", async () => {
    const mod = await import("../app/lib/database/campaign.server");

    tdbMocks.campaign.update.mockResolvedValueOnce([
      { id: 1, type: "message", script_id: 123, body_text: "hi" },
    ]);

    const r1 = await mod.updateCampaign({
      campaignData: {
        campaign_id: "1",
        workspace: "w1",
        title: "T",
        type: "message",
        script_id: 123,
        body_text: "hi",
        message_media: [],
        voicedrop_audio: null,
        is_active: 1,
      } as any,
      campaignDetails: { campaign_id: "1" },
    });
    expect(r1).toMatchObject({
      campaign: { id: 1 },
      campaignDetails: { campaign_id: 1, script_id: 123 },
    });
  });

  test("updateCampaign covers ivr type detail fields on unified row", async () => {
    const mod = await import("../app/lib/database/campaign.server");

    tdbMocks.campaign.update.mockResolvedValueOnce([{ id: 1, type: "robocall", script_id: 2 }]);

    const res = await mod.updateCampaign({
      campaignData: {
        campaign_id: "1",
        workspace: "w1",
        title: "T",
        type: "robocall",
        is_active: true,
      } as any,
      campaignDetails: { campaign_id: "1", script_id: "2" },
    });
    expect(res.campaignDetails).toMatchObject({ campaign_id: 1, script_id: 2 });
  });

  test("updateCampaign persists an explicitly cleared script as SQL null", async () => {
    const mod = await import("../app/lib/database/campaign.server");
    tdbMocks.campaign.update.mockResolvedValueOnce([
      { id: 1, type: "live_call", script_id: null },
    ]);

    await mod.updateCampaign({
      campaignData: {
        campaign_id: "1",
        workspace: "w1",
        title: "T",
        type: "live_call",
        script_id: null,
      },
      campaignDetails: { campaign_id: "1", script_id: null },
    });

    expect(tdbMocks.campaign.update).toHaveBeenCalledWith(
      expect.objectContaining({
        set: expect.objectContaining({ script_id: null }),
      }),
    );
  });

  test("updateCampaign covers live_call detail fields on unified row", async () => {
    const mod = await import("../app/lib/database/campaign.server");

    tdbMocks.campaign.update.mockResolvedValueOnce([
      { id: 1, type: "live_call", live_questions: [{ q: 1 }] },
    ]);

    const res = await mod.updateCampaign({
      campaignData: {
        campaign_id: "1",
        workspace: "w1",
        title: "T",
        type: "live_call",
        is_active: true,
      } as any,
      campaignDetails: { campaign_id: "1", questions: [{ q: 1 }] },
    });
    expect(res.campaignDetails).toMatchObject({ questions: [{ q: 1 }] });
  });

  test("updateCampaign throws when row not found", async () => {
    const mod = await import("../app/lib/database/campaign.server");

    tdbMocks.campaign.update.mockResolvedValueOnce([]);

    await expect(
      mod.updateCampaign({
        campaignData: { campaign_id: "1", workspace: "w1", title: "T", type: "message" } as any,
        campaignDetails: { campaign_id: "1" },
      }),
    ).rejects.toThrow("Error updating campaign: row not found");
  });

  test("updateCampaign requires campaign_id", async () => {
    const mod = await import("../app/lib/database/campaign.server");
    await expect(
      mod.updateCampaign({
        client: {} as any,
        campaignData: { workspace: "w1", title: "T", type: "message" } as any,
        campaignDetails: { campaign_id: "" },
      }),
    ).rejects.toThrow("Campaign ID is required");
  });

  // Regression for P0-5: the script editor's PATCH /api/campaigns request
  // sends campaignData with a top-level `id` (e.g. "910004") and no
  // `campaign_id`. updateCampaign must accept that shape instead of
  // throwing "Campaign ID is required".
  test("updateCampaign succeeds when campaignData only has `id` (no campaign_id)", async () => {
    const mod = await import("../app/lib/database/campaign.server");

    tdbMocks.campaign.update.mockResolvedValueOnce([
      { id: 910004, type: "message", script_id: null, body_text: "hi" },
    ]);

    const res = await mod.updateCampaign({
      campaignData: {
        id: "910004",
        workspace: "w1",
        title: "T",
        type: "message",
        body_text: "hi",
      } as any,
      campaignDetails: { campaign_id: "910004" },
    });

    expect(res.campaign).toMatchObject({ id: 910004 });
    // `id` must not leak into the row update as a stray column.
    expect(tdbMocks.campaign.update).toHaveBeenCalledWith(
      expect.objectContaining({
        set: expect.not.objectContaining({ id: expect.anything() }),
      }),
    );
  });

  test("updateCampaign prefers campaign_id over id when both are present", async () => {
    const mod = await import("../app/lib/database/campaign.server");

    tdbMocks.campaign.update.mockResolvedValueOnce([{ id: 1, type: "message" }]);

    await mod.updateCampaign({
      campaignData: {
        id: "999",
        campaign_id: "1",
        workspace: "w1",
        title: "T",
        type: "message",
      } as any,
      campaignDetails: { campaign_id: "1" },
    });

    const call = tdbMocks.campaign.update.mock.calls[0][0];
    // eq(campaignTable.id, Number(id)) — the bound param is queryChunks[3].
    const targetedId = (call.where as any).queryChunks[3].value;
    expect(targetedId).toBe(1);
  });

  test("deleteCampaign throws on error; otherwise completes", async () => {
    const mod = await import("../app/lib/database/campaign.server");
    tdbMocks.campaign.delete.mockResolvedValueOnce(undefined);
    await expect(mod.deleteCampaign({ workspaceId: "w1", campaignId: "1" })).resolves.toBeUndefined();

    tdbMocks.campaign.delete.mockRejectedValueOnce(new Error("x"));
    await expect(mod.deleteCampaign({ workspaceId: "w1", campaignId: "1" })).rejects.toThrow("x");
  });

  test("createCampaign: happy path (message) returns unified row", async () => {
    const mod = await import("../app/lib/database/campaign.server");

    tdbMocks.campaign.insert.mockResolvedValueOnce([
      { id: "c1", type: "message", title: "T", body_text: "" },
    ]);

    const ok = await mod.createCampaign({
      campaignData: { workspace: "w1", title: "T", type: "message" } as any,
    });
    expect(ok).toMatchObject({
      campaign: { id: "c1" },
      campaignDetails: { campaign_id: "c1" },
    });
  });

  test("createCampaign: live_call branch and script_id conversion", async () => {
    const mod = await import("../app/lib/database/campaign.server");

    tdbMocks.campaign.insert.mockResolvedValueOnce([
      { id: "c1", type: "live_call", script_id: 5, title: "T" },
    ]);

    const res = await mod.createCampaign({
      campaignData: {
        workspace: "w1",
        title: "T",
        type: "live_call",
        script_id: "5",
      } as any,
    });
    expect(res.campaignDetails.script_id).toBe(5);
  });

  test("createCampaign: duplicate title retries; non-duplicate errors wrap; missing type throws", async () => {
    const mod = await import("../app/lib/database/campaign.server");

    let insertCall = 0;
    tdbMocks.campaign.insert.mockImplementation(async (data: any) => {
      insertCall++;
      if (insertCall === 1) {
        throw { code: "23505" };
      }
      return [{ id: "c2", ...data, title: `${data.title} (Copy)` }];
    });

    const res = await mod.createCampaign({
      campaignData: { workspace: "w1", title: "T", type: "robocall" } as any,
    });
    expect(res.campaign.title).toContain("(Copy)");

    tdbMocks.campaign.insert.mockRejectedValueOnce({ code: "X", message: "no" });
    await expect(
      mod.createCampaign({
        campaignData: { workspace: "w1", title: "T", type: "message" } as any,
      }),
    ).rejects.toThrow("Error creating campaign: Unknown error");

    await expect(
      mod.createCampaign({
        campaignData: { workspace: "w1", title: "T" } as any,
      }),
    ).rejects.toThrow("Campaign type is required");
  });

  test("createCampaign: duplicate retry can fail and is wrapped", async () => {
    const mod = await import("../app/lib/database/campaign.server");

    let call = 0;
    tdbMocks.campaign.insert.mockImplementation(async () => {
      call++;
      if (call === 1) throw { code: "23505" };
      throw new Error("retry");
    });

    await expect(
      mod.createCampaign({
        campaignData: { workspace: "w1", title: "T", type: "robocall" } as any,
      }),
    ).rejects.toThrow("Error creating campaign: retry");
  });

  test("updateOrCopyScript covers insert/update, copy naming, and duplicate name error", async () => {
    const { logger } = await import("../app/lib/logger.server");
    const mod = await import("../app/lib/database/campaign.server");

    tdbMocks.script.findFirst.mockResolvedValue({ id: 1, name: "S" });

    tdbMocks.script.insert.mockResolvedValueOnce([{ id: 2, name: "S (Copy)" }]);
    const copy = await mod.updateOrCopyScript({
      workspaceId: "w1",
      scriptData: { id: 1, name: "S" } as any,
      saveAsCopy: true,
      campaignData: { id: 1 } as any,
      created_by: "u1",
      created_at: "t",
    });
    expect(copy?.name).toContain("(Copy)");

    tdbMocks.script.update.mockResolvedValueOnce([{ id: 1, name: "S2" }]);
    const updated = await mod.updateOrCopyScript({
      workspaceId: "w1",
      scriptData: { id: 1, name: "S2" } as any,
      saveAsCopy: false,
      campaignData: { id: 1 } as any,
      created_by: "u1",
      created_at: "t",
    });
    expect(updated?.name).toBe("S2");

    tdbMocks.script.update.mockRejectedValueOnce({ code: "23505" });
    await expect(
      mod.updateOrCopyScript({
        workspaceId: "w1",
        scriptData: { id: 1, name: "S2" } as any,
        saveAsCopy: false,
        campaignData: { id: 1 } as any,
        created_by: "u1",
        created_at: "t",
      }),
    ).rejects.toThrow("already exists");
    expect(logger.error).toHaveBeenCalled();

    tdbMocks.script.update.mockRejectedValueOnce(new Error("x"));
    await expect(
      mod.updateOrCopyScript({
        workspaceId: "w1",
        scriptData: { id: 1, name: "S2" } as any,
        saveAsCopy: false,
        campaignData: { id: 1 } as any,
        created_by: "u1",
        created_at: "t",
      }),
    ).rejects.toThrow("x");
  });

  test("updateOrCopyScript covers no-id (new script) branch", async () => {
    const mod = await import("../app/lib/database/campaign.server");

    tdbMocks.script.insert.mockResolvedValueOnce([{ id: 1, name: "New" }]);
    const out = await mod.updateOrCopyScript({
      workspaceId: "w1",
      scriptData: { name: "New" } as any,
      saveAsCopy: false,
      campaignData: { id: 1 } as any,
      created_by: "u1",
      created_at: "t",
    });
    expect(out).toMatchObject({ id: 1, name: "New" });
  });

  test("updateCampaignScript updates script_id on unified campaign row", async () => {
    const mod = await import("../app/lib/database/campaign.server");

    tdbMocks.campaign.update.mockResolvedValueOnce([{ id: 1, script_id: 1 }]);
    await expect(
      mod.updateCampaignScript({ workspaceId: "w1", campaignId: "1", scriptId: 1 }),
    ).resolves.toBeUndefined();

    tdbMocks.campaign.update.mockRejectedValueOnce(new Error("bad"));
    await expect(
      mod.updateCampaignScript({ workspaceId: "w1", campaignId: "1", scriptId: 1 }),
    ).rejects.toBeInstanceOf(Error);
  });

  test("fetchBasicResults logs on error and returns []", async () => {
    const { logger } = await import("../app/lib/logger.server");
    const mod = await import("../app/lib/database/campaign.server");
    rpcMocks.rpcGetCampaignStats.mockRejectedValueOnce(new Error("x"));
    tdbMocks.campaign.findFirst.mockResolvedValueOnce({ type: "live_call" });
    const out = await mod.fetchBasicResults({
      workspaceId: "w1",
      campaignId: "1",
    });
    expect(out).toEqual([]);
    expect(logger.error).toHaveBeenCalled();
  });

  test("fetchBasicResults success returns data", async () => {
    const { logger } = await import("../app/lib/logger.server");
    const mod = await import("../app/lib/database/campaign.server");
    rpcMocks.rpcGetCampaignStats.mockResolvedValueOnce([{ ok: 1 }]);
    tdbMocks.campaign.findFirst.mockResolvedValueOnce({ type: "live_call" });
    const out = await mod.fetchBasicResults({
      workspaceId: "w1",
      campaignId: "1",
    });
    expect(out).toEqual([{ ok: 1 }]);
    expect(logger.error).not.toHaveBeenCalled();
  });

  test("fetchCampaignCounts logs errors and returns counts", async () => {
    const { logger } = await import("../app/lib/logger.server");
    const mod = await import("../app/lib/database/campaign.server");

    queueSearchMocks.countCampaignQueueRows.mockRejectedValueOnce(new Error("a"));
    tdbMocks.outreach_attempt.count.mockRejectedValueOnce(new Error("b"));
    const res = await mod.fetchCampaignCounts({
      workspaceId: "w1",
      campaignId: "1",
    });
    expect(res).toEqual({ callCount: null, completedCount: null });
    expect(logger.error).toHaveBeenCalledTimes(2);
  });

  test("fetchCampaignCounts success does not log", async () => {
    const { logger } = await import("../app/lib/logger.server");
    const mod = await import("../app/lib/database/campaign.server");
    queueSearchMocks.countCampaignQueueRows.mockResolvedValueOnce(1);
    tdbMocks.outreach_attempt.count.mockResolvedValueOnce(2);
    const res = await mod.fetchCampaignCounts({
      workspaceId: "w1",
      campaignId: "1",
    });
    expect(res).toEqual({ callCount: 1, completedCount: 2 });
    expect(logger.error).not.toHaveBeenCalled();
  });

  test("fetchCampaignData logs error and returns data", async () => {
    const { logger } = await import("../app/lib/logger.server");
    const mod = await import("../app/lib/database/campaign.server");
    tdbMocks.campaign.findFirst.mockRejectedValueOnce(new Error("x"));
    const data = await mod.fetchCampaignData({ workspaceId: "w1", campaignId: "1" });
    expect(data).toBeNull();
    expect(logger.error).toHaveBeenCalled();
  });

  test("fetchCampaignData success does not log", async () => {
    const { logger } = await import("../app/lib/logger.server");
    const mod = await import("../app/lib/database/campaign.server");
    tdbMocks.campaign.findFirst.mockResolvedValueOnce({ id: 1 });
    dbMocks.select.mockReturnValueOnce({
      from: () => ({
        where: async () => [],
      }),
    });
    const data = await mod.fetchCampaignData({ workspaceId: "w1", campaignId: "1" });
    expect(data).toEqual({ id: 1, campaign_audience: [] });
    expect(logger.error).not.toHaveBeenCalled();
  });

  test("fetchCampaignDetails handles errors and success from unified campaign row", async () => {
    const { logger } = await import("../app/lib/logger.server");
    const mod = await import("../app/lib/database/campaign.server");

    tdbMocks.campaign.findFirst.mockResolvedValueOnce(null);
    await expect(
      mod.fetchCampaignDetails({ workspaceId: "w1", campaignId: 1 }),
    ).resolves.toBeNull();

    tdbMocks.campaign.findFirst.mockRejectedValueOnce(new Error("x"));
    await expect(
      mod.fetchCampaignDetails({ workspaceId: "w1", campaignId: 1 }),
    ).resolves.toBeNull();
    expect(logger.error).toHaveBeenCalled();

    tdbMocks.campaign.findFirst.mockResolvedValueOnce({
      id: 1,
      script_id: 2,
      body_text: "hi",
      message_media: [],
      voicedrop_audio: null,
      disposition_options: null,
      live_questions: null,
      workspace: "w1",
    });
    await expect(
      mod.fetchCampaignDetails({ workspaceId: "w1", campaignId: 1 }),
    ).resolves.toMatchObject({ campaign_id: 1, script_id: 2, body_text: "hi" });
  });

  test("fetchQueueCounts propagates queue count helper errors and returns counts on success", async () => {
    const mod = await import("../app/lib/database/campaign.server");

    queueSearchMocks.countDialableCampaignQueueRows.mockRejectedValueOnce(
      new Error("full"),
    );
    await expect(
      mod.fetchQueueCounts({ workspaceId: "w1", campaignId: "1" }),
    ).rejects.toThrow("full");

    queueSearchMocks.countDialableCampaignQueueRows.mockResolvedValueOnce(10);
    queueSearchMocks.countDialableQueuedCampaignQueueRows.mockRejectedValueOnce(
      new Error("queued"),
    );
    await expect(
      mod.fetchQueueCounts({ workspaceId: "w1", campaignId: "1" }),
    ).rejects.toThrow("queued");

    queueSearchMocks.countDialableCampaignQueueRows.mockResolvedValueOnce(10);
    queueSearchMocks.countDialableQueuedCampaignQueueRows.mockResolvedValueOnce(3);
    const ok = await mod.fetchQueueCounts({ workspaceId: "w1", campaignId: "1" });
    expect(ok).toEqual({ fullCount: 10, queuedCount: 3 });
  });

  test("fetchCampaignAudience returns data and throws for any query error", async () => {
    const mod = await import("../app/lib/database/campaign.server");

    queueSearchMocks.fetchDialableCampaignQueueWithContacts.mockResolvedValueOnce([
      { id: 1 },
    ]);
    queueSearchMocks.countDialableQueuedCampaignQueueRows.mockResolvedValueOnce(1);
    queueSearchMocks.countDialableCompletedCampaignQueueRows.mockResolvedValueOnce(2);
    queueSearchMocks.countDialableCampaignQueueRows.mockResolvedValueOnce(25);
    tdbMocks.script.findMany.mockResolvedValueOnce([{ id: 1 }]);
    const ok = await mod.fetchCampaignAudience({
      workspaceId: "w1",
      campaignId: "1",
    });
    expect(ok).toMatchObject({
      campaign_queue: [{ id: 1 }],
      queue_count: 1,
      dequeued_count: 2,
      total_count: 25,
      scripts: [{ id: 1 }],
    });

    queueSearchMocks.fetchDialableCampaignQueueWithContacts.mockRejectedValueOnce(
      new Error("q"),
    );
    await expect(
      mod.fetchCampaignAudience({
        workspaceId: "w1",
        campaignId: "1",
      }),
    ).rejects.toThrow("q");

    queueSearchMocks.fetchDialableCampaignQueueWithContacts.mockResolvedValueOnce([]);
    queueSearchMocks.countDialableQueuedCampaignQueueRows.mockRejectedValueOnce(
      new Error("qc"),
    );
    await expect(
      mod.fetchCampaignAudience({
        workspaceId: "w1",
        campaignId: "1",
      }),
    ).rejects.toThrow("qc");

    queueSearchMocks.countDialableQueuedCampaignQueueRows.mockResolvedValueOnce(1);
    queueSearchMocks.countDialableCompletedCampaignQueueRows.mockRejectedValueOnce(
      new Error("dc"),
    );
    await expect(
      mod.fetchCampaignAudience({
        workspaceId: "w1",
        campaignId: "1",
      }),
    ).rejects.toThrow("dc");
  });

  test("fetchAdvancedCampaignDetails handles unified campaign row and message media signed urls", async () => {
    const { getSignedUrls } = await import("../app/lib/database/workspace.server");
    const mod = await import("../app/lib/database/campaign.server");

    const client: any = {};

    tdbMocks.campaign.findFirst.mockResolvedValueOnce({
      id: 1,
      script_id: 1,
      live_questions: [],
    });
    tdbMocks.script.findFirst.mockResolvedValueOnce({ id: 1 });
    await expect(
      mod.fetchAdvancedCampaignDetails({
        workspaceId: "w1",
        campaignId: 1,
        campaignType: "live_call",
        null: client,
      }),
    ).resolves.toMatchObject({ campaign_id: 1, script: { id: 1 } });

    tdbMocks.campaign.findFirst.mockResolvedValueOnce({ id: 1, message_media: ["a.png"] });
    const msg = await mod.fetchAdvancedCampaignDetails({
      workspaceId: "w1",
      campaignId: 1,
      campaignType: "message",
      null: client,
    });
    expect(msg.mediaLinks).toEqual(["signed-1"]);
    expect(getSignedUrls).toHaveBeenCalled();

    tdbMocks.campaign.findFirst.mockResolvedValueOnce({ id: 1, script_id: 2 });
    tdbMocks.script.findFirst.mockResolvedValueOnce({ id: 2 });
    await expect(
      mod.fetchAdvancedCampaignDetails({
        workspaceId: "w1",
        campaignId: 1,
        campaignType: "robocall",
        null: client,
      }),
    ).resolves.toMatchObject({ campaign_id: 1, script: { id: 2 } });

    tdbMocks.campaign.findFirst.mockRejectedValueOnce(new Error("x"));
    await expect(
      mod.fetchAdvancedCampaignDetails({
        workspaceId: "w1",
        campaignId: 1,
        campaignType: "message",
        null: client,
      }),
    ).rejects.toThrow("Error fetching campaign details: x");
  });

  test("fetchCampaignsByType logs error and returns null", async () => {
    const { logger } = await import("../app/lib/logger.server");
    const mod = await import("../app/lib/database/campaign.server");

    tdbMocks.campaign.findMany.mockRejectedValueOnce(new Error("x"));
    const res = await mod.fetchCampaignsByType({
      workspaceId: "w1",
      type: "message_campaign",
    });
    expect(res).toBeNull();
    expect(logger.error).toHaveBeenCalled();
  });

  test("fetchCampaignsByType success returns mapped rows without logging", async () => {
    const { logger } = await import("../app/lib/logger.server");
    const mod = await import("../app/lib/database/campaign.server");

    tdbMocks.campaign.findMany.mockResolvedValueOnce([{ id: 1, title: "T" }]);
    const res = await mod.fetchCampaignsByType({
      workspaceId: "w1",
      type: "message_campaign",
    });
    expect(res).toEqual([{ campaign_id: 1, campaign: { id: 1, title: "T" } }]);
    expect(logger.error).not.toHaveBeenCalled();
  });

  test("getCampaignQueueById returns data and throws on error", async () => {
    const mod = await import("../app/lib/database/campaign.server");

    queueSearchMocks.fetchCampaignQueueWithContacts.mockResolvedValueOnce([
      { id: 1 },
    ]);
    await expect(
      mod.getCampaignQueueById({ campaign_id: "1" }),
    ).resolves.toEqual([{ id: 1 }]);

    queueSearchMocks.fetchCampaignQueueWithContacts.mockRejectedValueOnce(
      new Error("x"),
    );
    await expect(
      mod.getCampaignQueueById({ campaign_id: "1" }),
    ).rejects.toThrow("x");
  });

  test("checkSchedule covers falsey cases and interval matching (including overnight)", async () => {
    const mod = await import("../app/lib/database/campaign.server");

    expect(mod.checkSchedule(null as any)).toBe(false);
    expect(mod.checkSchedule({} as any)).toBe(false);
    expect(mod.checkSchedule({ schedule: null } as any)).toBe(false);

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2020-01-06T10:30:00.000Z")); // Monday
    const scheduleObj: any = {
      monday: { active: true, intervals: [{ start: "10:00", end: "11:00" }] },
      tuesday: { active: false, intervals: [] },
      wednesday: { active: false, intervals: [] },
      thursday: { active: false, intervals: [] },
      friday: { active: false, intervals: [] },
      saturday: { active: false, intervals: [] },
      sunday: { active: false, intervals: [] },
    };

    expect(
      mod.checkSchedule({
        start_date: "2020-01-01T00:00:00.000Z",
        end_date: "2020-01-02T00:00:00.000Z",
        schedule: scheduleObj,
      } as any),
    ).toBe(false);

    expect(
      mod.checkSchedule({
        start_date: "2020-01-01T00:00:00.000Z",
        end_date: "2020-02-01T00:00:00.000Z",
        schedule: JSON.stringify(scheduleObj),
      } as any),
    ).toBe(true);

    vi.setSystemTime(new Date("2020-01-07T10:30:00.000Z")); // Tuesday
    expect(
      mod.checkSchedule({
        start_date: "2020-01-01T00:00:00.000Z",
        end_date: "2020-02-01T00:00:00.000Z",
        schedule: scheduleObj,
      } as any),
    ).toBe(false);

    const overnight: any = {
      ...scheduleObj,
      monday: { active: true, intervals: [{ start: "23:00", end: "02:00" }] },
    };
    vi.setSystemTime(new Date("2020-01-06T23:30:00.000Z"));
    expect(
      mod.checkSchedule({
        start_date: "2020-01-01T00:00:00.000Z",
        end_date: "2020-02-01T00:00:00.000Z",
        schedule: overnight,
      } as any),
    ).toBe(true);

    // Covers the `currentTime < interval.end` side of the overnight OR.
    vi.setSystemTime(new Date("2020-01-06T01:00:00.000Z"));
    expect(
      mod.checkSchedule({
        start_date: "2020-01-01T00:00:00.000Z",
        end_date: "2020-02-01T00:00:00.000Z",
        schedule: overnight,
      } as any),
    ).toBe(true);
  });
});
