import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";
import { setDualAuthSession } from "./helpers/route-auth-mock";

const mocks = vi.hoisted(() => ({
  requireWorkspaceAccess: vi.fn(async () => undefined),
  findCampaignExportMeta: vi.fn(),
  campaignFindFirst: vi.fn(),
  processCallCampaignExport: vi.fn(async () => undefined),
  processMessageCampaignExport: vi.fn(async () => undefined),
  trackBackgroundFailure: vi.fn(),
  generateCampaignExportId: vi.fn(() => "export-1"),
  isMachineDispatchedVoiceCampaignType: vi.fn(
    (type: string | null | undefined) =>
      type === "robocall" || type === "simple_ivr" || type === "complex_ivr",
  ),
}));

vi.mock("@/lib/database/workspace.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/database/workspace.server")>()),
  getUserRole: vi.fn(async () => null),
  requireWorkspaceAccess: (...args: unknown[]) =>
    mocks.requireWorkspaceAccess(...args),
}));
vi.mock("@/lib/database/campaign.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/database/campaign.server")>()),
  fetchBasicResults: vi.fn(async () => []),
  fetchQueueCounts: vi.fn(async () => ({})),
}));
vi.mock("@/lib/campaign-ivr.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/campaign-ivr.server")>()),
  findCampaignExportMeta: (...args: unknown[]) =>
    mocks.findCampaignExportMeta(...args),
}));
vi.mock("@/lib/campaign-export.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/campaign-export.server")>()),
  generateCampaignExportId: (...args: unknown[]) =>
    mocks.generateCampaignExportId(...args),
  processCallCampaignExport: (...args: unknown[]) =>
    mocks.processCallCampaignExport(...args),
  processMessageCampaignExport: (...args: unknown[]) =>
    mocks.processMessageCampaignExport(...args),
}));
vi.mock("@/lib/background-task.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/background-task.server")>()),
  trackBackgroundFailure: (...args: unknown[]) =>
    mocks.trackBackgroundFailure(...args),
}));
vi.mock("@/lib/campaign-execution.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/campaign-execution.server")>()),
  isMachineDispatchedVoiceCampaignType: (...args: unknown[]) =>
    mocks.isMachineDispatchedVoiceCampaignType(...args),
}));
vi.mock("@/server/tenant-db", () => ({
  createTenantDb: vi.fn(() => ({
    campaign: { findFirst: (...args: unknown[]) => mocks.campaignFindFirst(...args) },
  })),
}));
vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/lib/workspace-analytics.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/workspace-analytics.server")>()),
  loadWorkspaceAnalytics: vi.fn(),
}));
vi.mock("@/lib/survey-db.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/survey-db.server")>()),
  buildSurveyResponsesCsv: vi.fn(),
}));
vi.mock("@/lib/object-storage.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/object-storage.server")>()),
  downloadObject: vi.fn(),
  listObjects: vi.fn(),
}));
vi.mock("@/lib/logger.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/logger.server")>()),
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

describe("campaign export voice adapters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findCampaignExportMeta.mockResolvedValue({
      id: 7,
      workspace: "ws-1",
      title: "Voice campaign",
      type: "simple_ivr",
    });
    mocks.campaignFindFirst.mockResolvedValue({
      id: 7,
      workspace: "ws-1",
      title: "Voice campaign",
      type: "complex_ivr",
    });
    setDualAuthSession({ user: { id: "user-1" } });
  });

  test.each(["simple_ivr", "complex_ivr"])(
    "legacy form export accepts %s",
    async (type) => {
      mocks.findCampaignExportMeta.mockResolvedValueOnce({
        id: 7,
        workspace: "ws-1",
        title: "Voice campaign",
        type,
      });
      const mod = await import("../app/routes/api+/campaign-export");
      const form = new FormData();
      form.set("campaignId", "7");
      form.set("workspaceId", "ws-1");

      const response = await asRouteResponse(
        mod.action({
          request: new Request("http://localhost/api/campaign-export", {
            method: "POST",
            body: form,
          }),
        } as any),
      );

      expect(response.status).toBe(200);
      expect(mocks.processCallCampaignExport).toHaveBeenCalledWith(
        7,
        "ws-1",
        "export-1",
        "Voice campaign",
      );
      expect(mocks.processMessageCampaignExport).not.toHaveBeenCalled();
    },
  );

  test.each(["simple_ivr", "complex_ivr"])(
    "workspace export API accepts %s",
    async (type) => {
      mocks.campaignFindFirst.mockResolvedValueOnce({
        id: 7,
        workspace: "ws-1",
        title: "Voice campaign",
        type,
      });
      const { startCampaignExportApi } = await import(
        "@/lib/platform-analytics.server"
      );

      const result = await startCampaignExportApi("user-1", "ws-1", 7);

      expect(result.ok).toBe(true);
      expect(mocks.processCallCampaignExport).toHaveBeenCalledWith(
        7,
        "ws-1",
        "export-1",
        "Voice campaign",
      );
    },
  );

  test.each(["simple_ivr", "complex_ivr"])(
    "worker export accepts %s",
    async (campaignType) => {
      const { campaignExportHandler } = await import(
        "@/lib/worker/handlers/campaign.server"
      );

      const result = await campaignExportHandler(
        {
          id: 1,
          workspace_id: "ws-1",
          user_id: "user-1",
        } as any,
        {
          campaignId: 7,
          exportId: "export-1",
          campaignName: "Voice campaign",
          campaignType,
          workspaceId: "ws-1",
        },
      );

      expect(result).toEqual({ ok: true, exportId: "export-1", campaignId: 7 });
      expect(mocks.processCallCampaignExport).toHaveBeenCalledWith(
        7,
        "ws-1",
        "export-1",
        "Voice campaign",
      );
    },
  );
});
