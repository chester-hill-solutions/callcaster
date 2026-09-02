import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";
import { withWorkspaceRouteArgs } from "./helpers/route-context-mock";

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
    launchCampaign: vi.fn(async (args: { queueCount?: number }) => {
      if (args.queueCount != null && args.queueCount <= 0) {
        return { ok: false, error: "Add at least one contact before starting or scheduling" };
      }
      return {
        ok: true,
        status: "running" as const,
        job: { enqueued: true, jobId: 1 },
      };
    }),
    enqueueJob: vi.fn(async () => ({ enqueued: true, jobId: 1 })),
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

vi.mock("@/lib/database/campaign.server", () => ({
  fetchCampaignAudience: (...args: any[]) =>
    mocks.fetchCampaignAudience(...args),
  fetchCampaignDetails: (...args: any[]) => mocks.fetchCampaignDetails(...args),
  fetchQueueCounts: (...args: any[]) => mocks.fetchQueueCounts(...args),
  updateCampaign: (...args: any[]) => mocks.updateCampaign(...args),
}));
vi.mock("@/lib/database/workspace.server", () => ({
  getSignedUrls: (...args: any[]) => mocks.getSignedUrls(...args),
  getWorkspacePhoneNumbers: vi.fn(async () => ({
    data: [
      {
        phone_number: "+15555550100",
        capabilities: { sms: true, voice: true },
      },
    ],
    error: null,
  })),
}));
vi.mock("@/lib/platform-media.server", () => ({
  listWorkspaceAudiosApi: vi.fn(async () => ({ ok: true, audios: [] })),
}));
vi.mock("@/server/tenant-db", () => ({
  createTenantDb: vi.fn(() => ({
    script: { findMany: vi.fn(async () => [{ id: 7 }]) },
    campaign: { findMany: vi.fn(async () => [{ title: "Copy me" }]) },
  })),
}));
vi.mock("@/lib/campaign-audience-db.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/campaign-audience-db.server")>()),
  listCampaignAudienceIds: vi.fn(async () => []),
  insertCampaignAudienceLink: vi.fn(async () => undefined),
}));
vi.mock("@/lib/request-utils.server", () => ({
  parseActionRequest: (...args: any[]) => mocks.parseActionRequest(...args),
}));

const campaignIvrMocks = vi.hoisted(() => ({
  findCampaignInWorkspace: vi.fn(),
  updateCampaignStatusInWorkspace: vi.fn(),
  insertCampaignForWorkspace: vi.fn(),
}));

vi.mock("@/lib/campaign-execution.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/campaign-execution.server")>();
  return {
    ...actual,
    launchCampaign: (...args: any[]) => mocks.launchCampaign(...args),
  };
});
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

  const dbClient = {};

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
    const dbClient = makeDbClientForSettingsRoute();
    mocks.verifyAuth.mockResolvedValueOnce({
      user: { id: "u1" },
    });
    mocks.parseActionRequest.mockResolvedValueOnce({
      intent: "status",
      status: "running",
    });
    mocks.fetchQueueCounts.mockResolvedValueOnce({ queuedCount: 0, fullCount: 0 });

    const mod = await import("../app/routes/workspaces+/$id/campaigns/$selected_id/settings.route");
    const res = await asRouteResponse(mod.action(await withWorkspaceRouteArgs({
      request: new Request("http://x", { method: "POST" }),
      params: { id: "w1", selected_id: "99" },
    })));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      actionType: "status",
      error: "Add at least one contact before starting or scheduling",
    });
    expect(mocks.launchCampaign).toHaveBeenCalled();
  });

  test("updates status when the campaign is ready", async () => {
    const dbClient = makeDbClientForSettingsRoute();
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
    const res = await asRouteResponse(mod.action(await withWorkspaceRouteArgs({
      request: new Request("http://x", { method: "POST" }),
      params: { id: "w1", selected_id: "99" },
    })));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true, actionType: "status", status: "running" });
    // For message campaigns, launchCampaign is called instead of updateCampaignStatus,
    // attributed to the authenticated launching user.
    expect(mocks.launchCampaign).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1" }),
    );
  });

  test("blocks activation when the configured script is not in the workspace", async () => {
    makeDbClientForSettingsRoute({
      campaign: {
        id: 99,
        workspace: "w1",
        type: "live_call",
        caller_id: "+15555550100",
        start_date: "2026-03-10T10:00:00.000Z",
        end_date: "2026-03-11T10:00:00.000Z",
        schedule: {
          monday: {
            active: true,
            intervals: [{ start: "13:00", end: "21:00" }],
          },
        },
      },
    });
    mocks.fetchCampaignDetails.mockResolvedValueOnce({
      campaign_id: 99,
      script_id: 999,
    });
    mocks.parseActionRequest.mockResolvedValueOnce({
      intent: "status",
      status: "running",
    });
    mocks.fetchQueueCounts.mockResolvedValueOnce({ queuedCount: 2, fullCount: 2 });

    const mod = await import("../app/routes/workspaces+/$id/campaigns/$selected_id/settings.route");
    const res = await asRouteResponse(mod.action(await withWorkspaceRouteArgs({
      request: new Request("http://x", { method: "POST" }),
      params: { id: "w1", selected_id: "99" },
    })));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: "The configured script is unavailable in this workspace",
    });
    expect(campaignIvrMocks.updateCampaignStatusInWorkspace).not.toHaveBeenCalled();
  });

  test("returns a save-specific error when save payload is incomplete", async () => {
    const dbClient = makeDbClientForSettingsRoute();
    mocks.verifyAuth.mockResolvedValueOnce({
      user: { id: "u1" },
    });
    mocks.parseActionRequest.mockResolvedValueOnce({
      intent: "save",
      campaignData: JSON.stringify({ title: "Missing details" }),
    });

    const mod = await import("../app/routes/workspaces+/$id/campaigns/$selected_id/settings.route");
    const res = await asRouteResponse(mod.action(await withWorkspaceRouteArgs({
      request: new Request("http://x", { method: "POST" }),
      params: { id: "w1", selected_id: "99" },
    })));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      actionType: "save",
      error: "Campaign changes could not be saved",
    });
  });

  test("returns a duplicate-specific, non-technical error when cloning fails", async () => {
    const dbClient = makeDbClientForSettingsRoute({
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
    const res = await asRouteResponse(mod.action(await withWorkspaceRouteArgs({
      request: new Request("http://x", { method: "POST" }),
      params: { id: "w1", selected_id: "99" },
    })));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      actionType: "duplicate",
      error: "Campaign could not be duplicated",
    });
  });

  test("duplicate copies the source campaign's actual script_id, ignoring a mismatched client-supplied value", async () => {
    makeDbClientForSettingsRoute({
      campaign: {
        id: 99,
        workspace: "w1",
        type: "robocall",
        script_id: 42,
      },
    });
    mocks.verifyAuth.mockResolvedValueOnce({
      user: { id: "u1" },
    });
    mocks.parseActionRequest.mockResolvedValueOnce({
      intent: "duplicate",
      // Client sends a stale/tampered script_id that doesn't belong to this
      // campaign's script — the server must ignore it and use the source's.
      campaignData: JSON.stringify({
        title: "Copy me",
        type: "robocall",
        script_id: 950001,
      }),
    });

    const mod = await import("../app/routes/workspaces+/$id/campaigns/$selected_id/settings.route");
    const res = await asRouteResponse(mod.action(await withWorkspaceRouteArgs({
      request: new Request("http://x", { method: "POST" }),
      params: { id: "w1", selected_id: "99" },
    })));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      actionType: "duplicate",
    });
    expect(campaignIvrMocks.insertCampaignForWorkspace).toHaveBeenCalledWith(
      "w1",
      expect.objectContaining({ script_id: 42 }),
    );
  });

  test("duplicate nulls out script_id when the source campaign has none", async () => {
    makeDbClientForSettingsRoute({
      campaign: {
        id: 99,
        workspace: "w1",
        type: "message",
        script_id: null,
      },
    });
    mocks.verifyAuth.mockResolvedValueOnce({
      user: { id: "u1" },
    });
    mocks.parseActionRequest.mockResolvedValueOnce({
      intent: "duplicate",
      campaignData: JSON.stringify({ title: "Copy me", type: "message" }),
    });

    const mod = await import("../app/routes/workspaces+/$id/campaigns/$selected_id/settings.route");
    const res = await asRouteResponse(mod.action(await withWorkspaceRouteArgs({
      request: new Request("http://x", { method: "POST" }),
      params: { id: "w1", selected_id: "99" },
    })));

    expect(res.status).toBe(200);
    expect(campaignIvrMocks.insertCampaignForWorkspace).toHaveBeenCalledWith(
      "w1",
      expect.objectContaining({ script_id: null }),
    );
  });
});
