/**
 * campaign.is_active is derived from status (#1216): the column is gone, the
 * public API keeps serializing a derived boolean, and writes that still send
 * it are accepted but ignored.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

import { isCampaignActive } from "@/lib/campaign-status";

const mocks = vi.hoisted(() => ({
  fetchCampaignData: vi.fn(),
  fetchCampaignDetails: vi.fn(async () => null),
  fetchQueueCounts: vi.fn(async () => ({ queuedCount: 1, fullCount: 1 })),
  getCampaignReadiness: vi.fn(() => ({
    issues: [],
    startDisabledReason: null,
    scheduleDisabledReason: null,
  })),
  getWorkspaceCampaigns: vi.fn(),
  campaignUpdate: vi.fn(async () => undefined),
}));

vi.mock("@/lib/database/campaign-stats.server", () => ({
  fetchCampaignData: mocks.fetchCampaignData,
  fetchCampaignDetails: mocks.fetchCampaignDetails,
  fetchQueueCounts: mocks.fetchQueueCounts,
}));
vi.mock("@/lib/campaign-readiness", () => ({
  getCampaignReadiness: mocks.getCampaignReadiness,
}));
vi.mock("@/lib/database/campaign.server", () => ({
  getWorkspaceCampaigns: mocks.getWorkspaceCampaigns,
}));
vi.mock("@/server/tenant-db", () => ({
  createTenantDb: vi.fn(() => ({
    campaign: { update: mocks.campaignUpdate },
  })),
}));
vi.mock("@/lib/logger.server", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  listWorkspaceCampaignsApi,
  transitionCampaignStatusApi,
} from "@/lib/platform-data.server";

const WORKSPACE_ID = "3b6f0a52-6f5e-4b2d-9d55-000000000001";

describe("isCampaignActive", () => {
  test("only running and waiting are active", () => {
    expect(isCampaignActive("running")).toBe(true);
    expect(isCampaignActive("waiting")).toBe(true);
    for (const status of ["draft", "pending", "scheduled", "paused", "complete", "archived", null, undefined]) {
      expect(isCampaignActive(status)).toBe(false);
    }
  });
});

describe("transitionCampaignStatusApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchCampaignData.mockResolvedValue({
      id: 42,
      workspace: WORKSPACE_ID,
      type: "message",
      status: "running",
    });
  });

  test("ignores is_active in the body and never writes it", async () => {
    const result = await transitionCampaignStatusApi("42", WORKSPACE_ID, {
      status: "paused",
      is_active: true,
    });

    expect(result).toMatchObject({ ok: true, status: "paused", is_active: false });
    expect(mocks.campaignUpdate).toHaveBeenCalledTimes(1);
    const updateArg = mocks.campaignUpdate.mock.calls[0]?.[0] as { set: Record<string, unknown> };
    expect(updateArg.set).toEqual({ status: "paused" });
    expect("is_active" in updateArg.set).toBe(false);
  });

  test("derives is_active true for running", async () => {
    const result = await transitionCampaignStatusApi("42", WORKSPACE_ID, {
      status: "running",
    });
    expect(result).toMatchObject({ ok: true, status: "running", is_active: true });
  });
});

describe("listWorkspaceCampaignsApi", () => {
  test("serializes derived is_active per row", async () => {
    mocks.getWorkspaceCampaigns.mockResolvedValue({
      data: [
        { id: 1, status: "running" },
        { id: 2, status: "waiting" },
        { id: 3, status: "paused" },
      ],
      error: null,
    });

    const result = await listWorkspaceCampaignsApi(WORKSPACE_ID);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.campaigns.map((c: { is_active: boolean }) => c.is_active)).toEqual([
        true,
        true,
        false,
      ]);
    }
  });
});
