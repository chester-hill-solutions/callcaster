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

const rpcMocks = vi.hoisted(() => ({
  rpcGetAudiencesByCampaign: vi.fn(async () => ({ data: [], error: null })),
}));

vi.mock("@/lib/db-rpc.server", () => ({
  rpcGetAudiencesByCampaign: (...args: unknown[]) => rpcMocks.rpcGetAudiencesByCampaign(...args),
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
    rpcMocks.rpcGetAudiencesByCampaign.mockReset();
    rpcMocks.rpcGetAudiencesByCampaign.mockResolvedValue({ data: [], error: null });
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

  test("getInitialRecentCall returns the latest call row for the current recipient", () => {
    const nextRecipient = { contact_id: 2 } as never;
    const attempts = [
      {
        contact_id: 1,
        created_at: "2026-04-01T00:00:00.000Z",
        call: [{ sid: "CA-WRONG", date_created: "2026-04-01T00:00:00.000Z" }],
      },
      {
        contact_id: 2,
        created_at: "2026-03-01T00:00:00.000Z",
        call: [
          { sid: "CA-OLD", date_created: "2026-03-01T00:00:00.000Z" },
          { sid: "CA-NEW", date_created: "2026-03-02T00:00:00.000Z" },
        ],
      },
    ] as never;
    expect(getInitialRecentCall(attempts, nextRecipient)?.sid).toBe("CA-NEW");
  });

  test("getInitialRecentAttempt is scoped to the current recipient", () => {
    const nextRecipient = { contact_id: 2 } as never;
    const attempts = [
      { id: 1, contact_id: 1, created_at: "2026-03-01T00:00:00.000Z" },
      { id: 2, contact_id: 2, created_at: "2026-02-01T00:00:00.000Z" },
      { id: 3, contact_id: 2, created_at: "2026-01-01T00:00:00.000Z" },
    ] as never;
    expect(getInitialRecentAttempt(attempts, nextRecipient)?.id).toBe(2);
    expect(getInitialRecentAttempt(attempts, null)).toBeNull();
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
    await expect(getQueueByDialType("1", "invalid", "user-1")).rejects.toThrow(
      "Invalid dial type",
    );
  });

  test("getQueueByDialType (call) includes unassigned queued rows and this operator's own rows, but not other operators' (#1099)", async () => {
    // Manual enqueue never assigns a user, so a fresh manual campaign has only
    // unassigned queued rows. Those must be dialable, or the Dial button is
    // permanently disabled while the header still shows contacts remaining.
    queueSearchMocks.fetchActiveCampaignQueueWithContacts.mockResolvedValue([
      { id: 1, queue_state: "queued", assigned_to_user_id: null, dequeued_at: null },
      { id: 2, queue_state: "queued", assigned_to_user_id: "user-1", dequeued_at: null },
      { id: 3, queue_state: "queued", assigned_to_user_id: "user-2", dequeued_at: null },
    ] as never);

    const queue = await getQueueByDialType("1", "call", "user-1");
    expect(queue.map((row) => (row as { id: number }).id)).toEqual([1, 2]);
  });

  test("getQueueByDialType (call) excludes unassigned rows that are not queued", async () => {
    queueSearchMocks.fetchActiveCampaignQueueWithContacts.mockResolvedValue([
      { id: 1, queue_state: "assigned", assigned_to_user_id: null, dequeued_at: null },
      { id: 2, queue_state: "queued", assigned_to_user_id: null, dequeued_at: null },
    ] as never);

    const queue = await getQueueByDialType("1", "call", "user-1");
    expect(queue.map((row) => (row as { id: number }).id)).toEqual([2]);
  });

  test("getCallScreenData throws when any query errors", async () => {
    tenantDbMocks.fetchCampaignWithScriptForWorkspace.mockRejectedValue(new Error("boom"));
    tenantDbMocks.outreachFindMany.mockResolvedValue([]);
    rpcMocks.rpcGetAudiencesByCampaign.mockResolvedValue({ data: [], error: null });
    await expect(getCallScreenData("1", "ws-1", "user-1")).rejects.toThrow(
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
    rpcMocks.rpcGetAudiencesByCampaign.mockResolvedValue({ data: [{ id: "aud-1" }], error: null });

    const result = await getCallScreenData("1", "ws-1", "user-1");
    expect(result.workspaceData).toEqual({ id: "ws-1" });
    expect(result.campaign).toEqual({ id: 1, script: null });
    expect(result.audiences).toEqual([{ id: "aud-1" }]);
    expect(result.queueCount).toBe(10);
    expect(result.completedCount).toBe(4);
  });

  test("getCallScreenData defaults null disposition_options to the DNC-only list", async () => {
    tenantDbMocks.fetchCampaignWithScriptForWorkspace.mockResolvedValue({
      id: 1,
      script: null,
      disposition_options: null,
    });
    tenantDbMocks.outreachFindMany.mockResolvedValue([]);
    tenantDbMocks.callFindMany.mockResolvedValue([]);

    const result = await getCallScreenData("1", "ws-1", "user-1");
    // "do_not_call" is always offered, even for unconfigured campaigns.
    expect(result.campaignDetails.disposition_options).toEqual(["do_not_call"]);
    // The call screen maps over this directly — it must never be null.
    expect(() => result.campaignDetails.disposition_options.map((o) => o)).not.toThrow();
  });

  test("getCallScreenData narrows non-string disposition_options entries and appends do_not_call", async () => {
    tenantDbMocks.fetchCampaignWithScriptForWorkspace.mockResolvedValue({
      id: 1,
      script: null,
      disposition_options: ["answered", 7, null, "busy"],
    });
    tenantDbMocks.outreachFindMany.mockResolvedValue([]);
    tenantDbMocks.callFindMany.mockResolvedValue([]);

    const result = await getCallScreenData("1", "ws-1", "user-1");
    expect(result.campaignDetails.disposition_options).toEqual([
      "answered",
      "busy",
      "do_not_call",
    ]);
  });
});
