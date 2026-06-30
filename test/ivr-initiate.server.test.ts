import { beforeEach, describe, expect, test, vi } from "vitest";

const twilioCreate = vi.hoisted(() => vi.fn().mockResolvedValue({ sid: "CA123" }));

vi.mock("@/lib/database.server", () => ({
  createWorkspaceTwilioInstance: vi.fn().mockResolvedValue({
    calls: { create: twilioCreate },
  }),
  requireWorkspaceAccess: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/env.server", () => ({
  env: {
    BETTER_AUTH_URL: () => "https://example.adminDb.co",
    BETTER_AUTH_SERVICE_KEY: () => "service-key",
    BASE_URL: () => "https://app.example.com",
  },
}));
vi.mock("@/lib/twilio-client.server", () => ({
  withTwilioRetry: vi.fn(async (fn: () => Promise<unknown>) => fn()),
}));
vi.mock("@/lib/twilio-ivr-runtime.server", () => ({
  resolveIvrCallUrls: vi.fn(() => ({
    url: "https://app.example.com/api/ivr/1/page_1/b1",
    statusCallback: "https://app.example.com/api/ivr/status",
  })),
}));

vi.mock("@client/client-js", () => ({
  createClient: vi.fn(() => ({
    rpc: vi.fn().mockResolvedValue({ data: 99, error: null }),
    from: vi.fn((table: string) => {
      if (table === "call") {
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
      if (table === "campaign_queue") {
        return {
          update: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ error: null }),
          })),
        };
      }
      throw new Error(`unexpected table ${table}`);
    }),
  })),
}));

describe("initiateIvrCall", () => {
  beforeEach(() => {
    twilioCreate.mockClear();
    twilioCreate.mockResolvedValue({ sid: "CA123" });
  });

  test("returns call SID when Twilio and RPC succeed", async () => {
    const { initiateIvrCall } = await import("@/lib/ivr-initiate.server");
    const result = await initiateIvrCall({
      userPostgres: {} as never,
      user: { id: "user-1" },
      workspace_id: "ws-1",
      campaign_id: 1,
      contact: {
        id: 10,
        contact_id: 20,
        phone: "+15551234567",
        caller_id: "+15559876543",
      },
      user_id: "user-1",
    });
    expect(result).toEqual({ success: true, callSid: "CA123" });
    expect(twilioCreate).toHaveBeenCalledOnce();
  });
});
