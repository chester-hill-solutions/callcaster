import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";

vi.hoisted(() => {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? "postgres://local:test@127.0.0.1:5432/test";
});

const mocks = vi.hoisted(() => {
  return {
    verifyAuth: vi.fn(),
    parseActionRequest: vi.fn(),
    updateCampaign: vi.fn(),
    fetchCampaignAudience: vi.fn(),
    fetchCampaignDetails: vi.fn(),
    fetchQueueCounts: vi.fn(),
    getSignedUrls: vi.fn(),
    getCampaignQueueContactIds: vi.fn(async () => []),
    enqueueContactsForCampaign: vi.fn(async () => undefined),
    logger: {
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    },
  };
});

vi.mock("@/lib/auth.server", () => ({
  getSession: () => ({ headers: new Headers(),
  }),
  verifyAuth: (...args: any[]) => mocks.verifyAuth(...args),
}));

vi.mock("@/lib/database.server", () => ({
  fetchCampaignAudience: (...args: any[]) => mocks.fetchCampaignAudience(...args),
  fetchCampaignDetails: (...args: any[]) => mocks.fetchCampaignDetails(...args),
  fetchQueueCounts: (...args: any[]) => mocks.fetchQueueCounts(...args),
  getSignedUrls: (...args: any[]) => mocks.getSignedUrls(...args),
  getWorkspacePhoneNumbers: vi.fn(async () => ({ data: [], error: null })),
  parseActionRequest: (...args: any[]) => mocks.parseActionRequest(...args),
  updateCampaign: (...args: any[]) => mocks.updateCampaign(...args),
}));

const campaignIvrMocks = vi.hoisted(() => ({
  findCampaignInWorkspace: vi.fn(),
  updateCampaignStatusInWorkspace: vi.fn(),
  insertCampaignForWorkspace: vi.fn(),
}));

vi.mock("@/lib/campaign-ivr.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/campaign-ivr.server")>();
  return {
    ...actual,
    findCampaignInWorkspace: (...args: unknown[]) =>
      campaignIvrMocks.findCampaignInWorkspace(...args),
    updateCampaignStatusInWorkspace: (...args: unknown[]) =>
      campaignIvrMocks.updateCampaignStatusInWorkspace(...args),
    insertCampaignForWorkspace: (...args: unknown[]) =>
      campaignIvrMocks.insertCampaignForWorkspace(...args),
  };
});

vi.mock("@/lib/survey-db.server", () => ({
  loadActiveSurveysForWorkspace: vi.fn(async () => []),
}));

vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));
vi.mock("@/lib/campaign-queue-db.server", () => ({
  getCampaignQueueContactIds: (...args: unknown[]) => mocks.getCampaignQueueContactIds(...args),
}));
vi.mock("@/lib/queue.server", () => ({
  enqueueContactsForCampaign: (...args: unknown[]) => mocks.enqueueContactsForCampaign(...args),
}));

function makeDbClientForSettingsRoute(options?: {
  campaign?: any;
  details?: any;
  statusUpdateError?: Error | null;
  duplicateInsertError?: Error | null;
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

  campaignIvrMocks.findCampaignInWorkspace.mockImplementation(async () => campaign);
  campaignIvrMocks.updateCampaignStatusInWorkspace.mockImplementation(async () => {
    if (options?.statusUpdateError) {
      throw options.statusUpdateError;
    }
    return campaign;
  });
  campaignIvrMocks.insertCampaignForWorkspace.mockImplementation(async () => {
    if (options?.duplicateInsertError) {
      throw options.duplicateInsertError;
    }
    return { id: 123 };
  });

  const null = {};

  return null;
}

describe("workspaces_.$id.campaigns.$selected_id.settings action", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.parseActionRequest.mockReset();
    mocks.updateCampaign.mockReset();
    mocks.fetchCampaignAudience.mockReset();
    mocks.fetchCampaignDetails.mockReset();
    mocks.fetchQueueCounts.mockReset();
    mocks.getSignedUrls.mockReset();
    mocks.getCampaignQueueContactIds.mockReset();
    mocks.enqueueContactsForCampaign.mockReset();
    campaignIvrMocks.findCampaignInWorkspace.mockReset();
    campaignIvrMocks.updateCampaignStatusInWorkspace.mockReset();
    campaignIvrMocks.insertCampaignForWorkspace.mockReset();
    mocks.logger.debug.mockReset();
    mocks.logger.error.mockReset();
    mocks.fetchCampaignDetails.mockResolvedValue({
      campaign_id: 99,
      body_text: "Hello",
      message_media: [],
    });
  });

  test("blocks invalid start requests with the shared readiness message", async () => {
    const null = makeDbClientForSettingsRoute();
    mocks.verifyAuth.mockResolvedValueOnce({
      user: { id: "u1" },
    });
    mocks.parseActionRequest.mockResolvedValueOnce({
      intent: "status",
      status: "running",
    });
    mocks.fetchQueueCounts.mockResolvedValueOnce({ queuedCount: 0, fullCount: 0 });

    const mod = await import("../app/routes/workspaces+/$id/campaigns/$selected_id/settings.route");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://x", { method: "POST" }),
      params: { id: "w1", selected_id: "99" },
    } as any));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      actionType: "status",
      error: "Add at least one contact before starting or scheduling",
    });
    expect(campaignIvrMocks.updateCampaignStatusInWorkspace).not.toHaveBeenCalled();
  });

  test("updates status when the campaign is ready", async () => {
    const null = makeDbClientForSettingsRoute();
    mocks.verifyAuth.mockResolvedValueOnce({
      user: { id: "u1" },
    });
    mocks.parseActionRequest.mockResolvedValueOnce({
      intent: "status",
      status: "running",
      is_active: "true",
    });
    mocks.fetchQueueCounts.mockResolvedValueOnce({ queuedCount: 2, fullCount: 2 });

    const mod = await import("../app/routes/workspaces+/$id/campaigns/$selected_id/settings.route");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://x", { method: "POST" }),
      params: { id: "w1", selected_id: "99" },
    } as any));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true, actionType: "status", status: "running" });
    expect(campaignIvrMocks.updateCampaignStatusInWorkspace).toHaveBeenCalled();
  });

  test("returns a save-specific error when save payload is incomplete", async () => {
    const null = makeDbClientForSettingsRoute();
    mocks.verifyAuth.mockResolvedValueOnce({
      user: { id: "u1" },
    });
    mocks.parseActionRequest.mockResolvedValueOnce({
      intent: "save",
      campaignData: JSON.stringify({ title: "Missing details" }),
    });

    const mod = await import("../app/routes/workspaces+/$id/campaigns/$selected_id/settings.route");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://x", { method: "POST" }),
      params: { id: "w1", selected_id: "99" },
    } as any));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      actionType: "save",
      error: "Campaign changes could not be saved",
    });
  });

  test("returns a duplicate-specific error when cloning fails", async () => {
    const null = makeDbClientForSettingsRoute({
      duplicateInsertError: new Error("duplicate failed"),
    });
    mocks.verifyAuth.mockResolvedValueOnce({
      user: { id: "u1" },
    });
    mocks.parseActionRequest.mockResolvedValueOnce({
      intent: "duplicate",
      campaignData: JSON.stringify({ title: "Copy me", type: "message" }),
    });

    const mod = await import("../app/routes/workspaces+/$id/campaigns/$selected_id/settings.route");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://x", { method: "POST" }),
      params: { id: "w1", selected_id: "99" },
    } as any));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      actionType: "duplicate",
      error: "duplicate failed",
    });
  });
});
