import { describe, expect, test, vi, beforeEach } from "vitest";

vi.mock("@/lib/database.server", () => ({
  createWorkspaceTwilioInstance: vi.fn(),
  requireWorkspaceAccess: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/env.server", () => ({
  env: {
    SUPABASE_URL: () => "https://example.supabase.co",
    SUPABASE_SERVICE_KEY: () => "service-key",
    BASE_URL: () => "https://app.example.com",
  },
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    rpc: vi.fn().mockResolvedValue({ data: 99, error: null }),
    from: vi.fn(() => ({
      update: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ error: null }),
      })),
    })),
  })),
}));

const twilioCreate = vi.fn().mockResolvedValue({ sid: "CA123" });

vi.mock("@/lib/database.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/database.server")>();
  return {
    ...actual,
    createWorkspaceTwilioInstance: vi.fn().mockResolvedValue({
      calls: { create: twilioCreate },
    }),
    requireWorkspaceAccess: vi.fn().mockResolvedValue(undefined),
  };
});

describe("initiateIvrCall", () => {
  beforeEach(() => {
    twilioCreate.mockClear();
  });

  test("returns call SID when Twilio and RPC succeed", async () => {
    const { initiateIvrCall } = await import("@/lib/ivr-initiate.server");
    const result = await initiateIvrCall({
      userSupabase: {} as never,
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
