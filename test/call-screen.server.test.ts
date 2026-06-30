import { beforeEach, describe, expect, test, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? "postgres://test:test@localhost:5432/test";
});

vi.mock("@/server/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/lib/logger.server", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const tenantDbMocks = vi.hoisted(() => ({
  fetchCampaignWithScriptForWorkspace: vi.fn(),
  outreachFindMany: vi.fn(),
  callFindMany: vi.fn(),
}));

const adminDbMocks = vi.hoisted(() => ({
  workspaceRows: [{ id: "ws-1" }] as unknown[],
  workspaceError: null as Error | null,
}));

vi.mock("@/server/admin-db", () => ({
  adminDb: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => {
            if (adminDbMocks.workspaceError) {
              throw adminDbMocks.workspaceError;
            }
            return adminDbMocks.workspaceRows;
          }),
        })),
      })),
    })),
  },
}));

vi.mock("@/lib/campaign-ivr.server", () => ({
  fetchCampaignWithScriptForWorkspace: (...args: unknown[]) =>
    tenantDbMocks.fetchCampaignWithScriptForWorkspace(...args),
}));

const queueSearchMocks = vi.hoisted(() => ({
  countCampaignQueueRows: vi.fn(async () => 10),
  countCompletedCampaignQueueRows: vi.fn(async () => 4),
  fetchActiveCampaignQueueWithContacts: vi.fn(async () => []),
}));

vi.mock("@/lib/campaign-queue-search.server", () => ({
  countCampaignQueueRows: (...args: unknown[]) => queueSearchMocks.countCampaignQueueRows(...args),
  countCompletedCampaignQueueRows: (...args: unknown[]) =>
    queueSearchMocks.countCompletedCampaignQueueRows(...args),
  fetchActiveCampaignQueueWithContacts: (...args: unknown[]) =>
    queueSearchMocks.fetchActiveCampaignQueueWithContacts(...args),
}));

vi.mock("@/server/tenant-db", () => ({
  createTenantDb: vi.fn(() => ({
    outreach_attempt: {
      findMany: (...args: unknown[]) => tenantDbMocks.outreachFindMany(...args),
    },
    call: {
      findMany: (...args: unknown[]) => tenantDbMocks.callFindMany(...args),
    },
  })),
}));

const workspaceMembersMocks = vi.hoisted(() => ({
  getUserById: vi.fn(),
}));

vi.mock("@/lib/workspace-members-db.server", () => ({
  getUserById: (...args: unknown[]) => workspaceMembersMocks.getUserById(...args),
}));

import {
  getCallScreenData,
  getInitialCallsList,
  getInitialRecentAttempt,
  getInitialRecentCall,
  getNextRecipient,
  getQueueByDialType,
  getVerifiedNumbers,
} from "../app/lib/call-screen.server";

describe("call-screen.server", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adminDbMocks.workspaceRows = [{ id: "ws-1" }];
    adminDbMocks.workspaceError = null;
    workspaceMembersMocks.getUserById.mockReset();
    queueSearchMocks.countCampaignQueueRows.mockResolvedValue(10);
    queueSearchMocks.countCompletedCampaignQueueRows.mockResolvedValue(4);
    queueSearchMocks.fetchActiveCampaignQueueWithContacts.mockResolvedValue([]);
  });

  test("getNextRecipient returns null for predictive dial type", () => {
    expect(getNextRecipient([{ id: 1 } as never], "predictive", "user-1")).toBeNull();
  });

  test("getNextRecipient returns first queue item for call dial type", () => {
    const item = { id: 1 } as never;
    expect(getNextRecipient([item], "call", "user-1")).toBe(item);
  });

  test("getNextRecipient returns null for unknown dial type", () => {
    expect(getNextRecipient([], "other", "user-1")).toBeNull();
  });

  test("getInitialCallsList flattens attempt calls", () => {
    expect(
      getInitialCallsList([
        { call: [{ sid: "CA1" }, { sid: "CA2" }] },
        { call: [{ sid: "CA3" }] },
      ] as never),
    ).toEqual([{ sid: "CA1" }, { sid: "CA2" }, { sid: "CA3" }]);
  });

  test("getInitialRecentCall sorts attempts by created_at desc", () => {
    const attempts = [
      { created_at: "2026-01-01T00:00:00.000Z", call: [] },
      { created_at: "2026-03-01T00:00:00.000Z", call: [] },
    ] as never;
    expect(getInitialRecentCall(attempts)?.created_at).toBe("2026-03-01T00:00:00.000Z");
  });

  test("getInitialRecentAttempt sorts attempts by created_at desc", () => {
    const attempts = [
      { created_at: "2026-02-01T00:00:00.000Z" },
      { created_at: "2026-01-01T00:00:00.000Z" },
    ] as never;
    expect(getInitialRecentAttempt(attempts)?.created_at).toBe("2026-02-01T00:00:00.000Z");
  });

  test("getVerifiedNumbers returns verified numbers", async () => {
    workspaceMembersMocks.getUserById.mockResolvedValueOnce({
      verified_audio_numbers: ["+15551234567"],
    });
    await expect(getVerifiedNumbers({} as never, "user-1")).resolves.toEqual([
      "+15551234567",
    ]);
  });

  test("getVerifiedNumbers throws on error", async () => {
    workspaceMembersMocks.getUserById.mockResolvedValueOnce(null);
    await expect(getVerifiedNumbers({} as never, "user-1")).rejects.toThrow("User not found");
  });

  test("getQueueByDialType throws for invalid dial type", async () => {
    await expect(getQueueByDialType({} as never, "1", "invalid", "user-1")).rejects.toThrow(
      "Invalid dial type",
    );
  });

  test("getCallScreenData throws when any query errors", async () => {
    tenantDbMocks.fetchCampaignWithScriptForWorkspace.mockRejectedValue(new Error("boom"));
    tenantDbMocks.outreachFindMany.mockResolvedValue([]);
    const client = {
      rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    await expect(getCallScreenData(client as never, "1", "ws-1", "user-1")).rejects.toThrow(
      "Error fetching campaign data",
    );
  });

  test("getCallScreenData returns aggregated loader data", async () => {
    adminDbMocks.workspaceRows = [{ id: "ws-1" }];
    tenantDbMocks.fetchCampaignWithScriptForWorkspace.mockResolvedValue({
      id: 1,
      script: null,
    });
    tenantDbMocks.outreachFindMany.mockResolvedValue([]);
    tenantDbMocks.callFindMany.mockResolvedValue([]);
    queueSearchMocks.countCampaignQueueRows.mockResolvedValue(10);
    queueSearchMocks.countCompletedCampaignQueueRows.mockResolvedValue(4);

    const client = {
      rpc: vi.fn().mockResolvedValue({ data: [{ id: "aud-1" }], error: null }),
    };

    const result = await getCallScreenData(client as never, "1", "ws-1", "user-1");
    expect(result.workspaceData).toEqual({ id: "ws-1" });
    expect(result.campaign).toEqual({ id: 1, script: null });
    expect(result.audiences).toEqual([{ id: "aud-1" }]);
    expect(result.queueCount).toBe(10);
    expect(result.completedCount).toBe(4);
  });
});
