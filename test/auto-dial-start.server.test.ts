import { beforeEach, describe, expect, test, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

import { startAutoDialConference } from "@/lib/auto-dial-start.server";

const autoDialMocks = vi.hoisted(() => ({
  creditsBalance: 5 as number | null,
  creditsError: null as Error | null,
  insertCalls: [] as unknown[],
  insertCallResults: [] as Array<Record<string, unknown> | null>,
  updateCallCalls: [] as unknown[],
  deleteCallCalls: [] as unknown[],
  verifiedNumbers: ["+15550001111"] as string[] | null,
}));

vi.mock("@/lib/workspace-credits.server", () => ({
  getWorkspaceCreditsBalance: vi.fn(async () => {
    if (autoDialMocks.creditsError) {
      throw autoDialMocks.creditsError;
    }
    return autoDialMocks.creditsBalance;
  }),
}));

vi.mock("@/lib/user-audio.server", () => ({
  getUserVerifiedAudioNumbers: vi.fn(async () => autoDialMocks.verifiedNumbers),
}));

vi.mock("@/lib/campaign-ivr.server", () => ({
  findCampaignInWorkspace: vi.fn(async () => ({
    id: 1,
    schedule: { monday: { active: true, intervals: [{ start: "00:00", end: "23:59" }] } },
    start_date: new Date(Date.now() - 86400000).toISOString(),
    end_date: new Date(Date.now() + 86400000).toISOString(),
  })),
}));

vi.mock("@/lib/telephony-db.server", () => ({
  insertCallForWorkspace: vi.fn(async (_workspaceId: string, payload: unknown) => {
    autoDialMocks.insertCalls.push(payload);
    if (autoDialMocks.insertCallResults.length > 0) {
      return autoDialMocks.insertCallResults.shift() ?? null;
    }
    return payload as Record<string, unknown>;
  }),
  updateCallBySid: vi.fn(async (...args: unknown[]) => {
    autoDialMocks.updateCallCalls.push(args);
    return {};
  }),
}));

vi.mock("@/lib/database/campaign.server", () => ({
  checkSchedule: async () => true,
}));
vi.mock("@/lib/database/workspace.server", () => ({
  createWorkspaceTwilioInstance: async () => ({
    calls: {
      create: async () => ({
        sid: "CA1",
        accountSid: "AC",
        from: "+1555",
        to: "client:u1",
        status: "queued",
      }),
    },
  }),
}));

vi.mock("@/server/tenant-db", () => ({
  createTenantDb: vi.fn(() => ({
    call: {
      delete: vi.fn(async (opts: unknown) => {
        autoDialMocks.deleteCallCalls.push(opts);
      }),
    },
  })),
}));

vi.mock("@/lib/env.server", () => ({
  env: { BASE_URL: () => "https://base.example" },
}));

function resetAutoDialMocks() {
  autoDialMocks.creditsBalance = 5;
  autoDialMocks.creditsError = null;
  autoDialMocks.insertCalls = [];
  autoDialMocks.insertCallResults = [{ sid: "pending" }, { sid: "CA1" }];
  autoDialMocks.updateCallCalls = [];
  autoDialMocks.deleteCallCalls = [];
  autoDialMocks.verifiedNumbers = ["+15550001111"];
}

describe("startAutoDialConference", () => {
  beforeEach(() => {
    resetAutoDialMocks();
    vi.resetModules();
  });

  test("returns creditsError when workspace has no credits", async () => {
    autoDialMocks.creditsBalance = 0;

    const result = await startAutoDialConference({
      userId: "u1",
      workspaceId: "w1",
      campaignId: 1,
      callerId: "+1555",
      selectedDevice: "computer",
    });

    expect(result).toEqual({
      ok: false,
      status: 402,
      error: "Insufficient credits",
      creditsError: true,
    });
  });

  test("starts conference and returns conferenceName", async () => {
    const result = await startAutoDialConference({
      userId: "u1",
      workspaceId: "w1",
      campaignId: 1,
      callerId: "+1555",
      selectedDevice: "computer",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.conferenceName).toMatch(/^u1~/);
    }
  });

  test("rejects an unverified phone device before creating call state", async () => {
    const result = await startAutoDialConference({
      userId: "u1",
      workspaceId: "w1",
      campaignId: 1,
      callerId: "+1555",
      selectedDevice: "+15559999999",
    });

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "Selected device is not a verified phone number",
    });
    expect(autoDialMocks.insertCalls).toEqual([]);
  });
});
