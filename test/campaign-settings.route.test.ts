import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    verifyAuth: vi.fn(),
    parseActionRequest: vi.fn(),
    updateCampaign: vi.fn(),
    fetchCampaignAudience: vi.fn(),
    fetchQueueCounts: vi.fn(),
    getCampaignTableKey: vi.fn(),
    getSignedUrls: vi.fn(),
    logger: {
      debug: vi.fn(),
      error: vi.fn(),
    },
  };
});

vi.mock("@/lib/supabase.server", () => ({
  verifyAuth: (...args: any[]) => mocks.verifyAuth(...args),
}));

vi.mock("@/lib/database.server", () => ({
  fetchCampaignAudience: (...args: any[]) => mocks.fetchCampaignAudience(...args),
  fetchQueueCounts: (...args: any[]) => mocks.fetchQueueCounts(...args),
  getCampaignTableKey: (...args: any[]) => mocks.getCampaignTableKey(...args),
  getSignedUrls: (...args: any[]) => mocks.getSignedUrls(...args),
  parseActionRequest: (...args: any[]) => mocks.parseActionRequest(...args),
  updateCampaign: (...args: any[]) => mocks.updateCampaign(...args),
}));

vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));

function makeSupabaseForSettingsRoute(options?: {
  campaign?: any;
  details?: any;
  statusUpdateError?: any;
  duplicateInsertError?: any;
}) {
  const campaign =
    options?.campaign ??
    ({
      id: 99,
      workspace: "w1",
      type: "message",
      caller_id: "+15555550100",
      start_date: "2026-03-10T10:00:00.000Z",
      end_date: "2026-03-11T10:00:00.000Z",
      schedule: {
        monday: {
          active: true,
          intervals: [{ start: "13:00", end: "21:00" }],
        },
      },
    } as any);
  const details = options?.details ?? ({ body_text: "Hello there", message_media: [] } as any);
  const statusUpdate = vi.fn(async () => ({ error: options?.statusUpdateError ?? null }));
  const duplicateInsertSingle = vi.fn(async () => ({
    data: options?.duplicateInsertError ? null : { id: 123 },
    error: options?.duplicateInsertError ?? null,
  }));

  const supabaseClient = {
    from: vi.fn((table: string) => {
      if (table === "campaign") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: async () => ({ data: campaign, error: null }),
              }),
            }),
          }),
          update: () => ({
            eq: () => ({
              eq: statusUpdate,
            }),
          }),
          insert: () => ({
            select: () => ({
              single: duplicateInsertSingle,
            }),
          }),
        };
      }

      if (table === "message_campaign") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: details, error: null }),
              }),
            }),
          }),
          insert: async () => ({ data: null, error: null }),
        };
      }

      if (table === "campaign_queue") {
        return {
          select: () => ({
            eq: async () => ({ data: [], error: null }),
          }),
        };
      }

      throw new Error(`unexpected table ${table}`);
    }),
    statusUpdate,
    duplicateInsertSingle,
  };

  return supabaseClient;
}

describe("workspaces_.$id.campaigns.$selected_id.settings action", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.verifyAuth.mockReset();
    mocks.parseActionRequest.mockReset();
    mocks.updateCampaign.mockReset();
    mocks.fetchCampaignAudience.mockReset();
    mocks.fetchQueueCounts.mockReset();
    mocks.getCampaignTableKey.mockReset();
    mocks.getSignedUrls.mockReset();
    mocks.logger.debug.mockReset();
    mocks.logger.error.mockReset();
    mocks.getCampaignTableKey.mockReturnValue("message_campaign");
  });

  test("blocks invalid start requests with the shared readiness message", async () => {
    const supabaseClient = makeSupabaseForSettingsRoute();
    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient,
      user: { id: "u1" },
    });
    mocks.parseActionRequest.mockResolvedValueOnce({
      intent: "status",
      status: "running",
    });
    mocks.fetchQueueCounts.mockResolvedValueOnce({ queuedCount: 0, fullCount: 0 });

    const mod = await import("../app/routes/workspaces_.$id.campaigns.$selected_id.settings");
    const res = await mod.action({
      request: new Request("http://x", { method: "POST" }),
      params: { id: "w1", selected_id: "99" },
    } as any);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      actionType: "status",
      error: "Add at least one contact before starting or scheduling",
    });
    expect(supabaseClient.statusUpdate).not.toHaveBeenCalled();
  });

  test("updates status when the campaign is ready", async () => {
    const supabaseClient = makeSupabaseForSettingsRoute();
    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient,
      user: { id: "u1" },
    });
    mocks.parseActionRequest.mockResolvedValueOnce({
      intent: "status",
      status: "running",
      is_active: "true",
    });
    mocks.fetchQueueCounts.mockResolvedValueOnce({ queuedCount: 2, fullCount: 2 });

    const mod = await import("../app/routes/workspaces_.$id.campaigns.$selected_id.settings");
    const res = await mod.action({
      request: new Request("http://x", { method: "POST" }),
      params: { id: "w1", selected_id: "99" },
    } as any);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true, actionType: "status" });
    expect(supabaseClient.statusUpdate).toHaveBeenCalled();
  });

  test("returns a save-specific error when save payload is incomplete", async () => {
    const supabaseClient = makeSupabaseForSettingsRoute();
    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient,
      user: { id: "u1" },
    });
    mocks.parseActionRequest.mockResolvedValueOnce({
      intent: "save",
      campaignData: JSON.stringify({ title: "Missing details" }),
    });

    const mod = await import("../app/routes/workspaces_.$id.campaigns.$selected_id.settings");
    const res = await mod.action({
      request: new Request("http://x", { method: "POST" }),
      params: { id: "w1", selected_id: "99" },
    } as any);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      actionType: "save",
      error: "Campaign changes could not be saved",
    });
  });

  test("returns a duplicate-specific error when cloning fails", async () => {
    const supabaseClient = makeSupabaseForSettingsRoute({
      duplicateInsertError: new Error("duplicate failed"),
    });
    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient,
      user: { id: "u1" },
    });
    mocks.parseActionRequest.mockResolvedValueOnce({
      intent: "duplicate",
      campaignData: JSON.stringify({ title: "Copy me", type: "message" }),
    });

    const mod = await import("../app/routes/workspaces_.$id.campaigns.$selected_id.settings");
    const res = await mod.action({
      request: new Request("http://x", { method: "POST" }),
      params: { id: "w1", selected_id: "99" },
    } as any);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      actionType: "duplicate",
      error: "duplicate failed",
    });
  });
});
