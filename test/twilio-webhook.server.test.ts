import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  validateTwilioWebhookParams: vi.fn(() => true),
  shouldValidateTwilioWebhooks: vi.fn(() => true),
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
  env: {
    TWILIO_AUTH_TOKEN: () => "main-dev-token",
  },
}));

vi.mock("@/lib/env.server", () => ({ env: mocks.env }));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));
vi.mock("@/twilio.server", () => ({
  validateTwilioWebhookParams: (...args: unknown[]) =>
    mocks.validateTwilioWebhookParams(...args),
  shouldValidateTwilioWebhooks: () => mocks.shouldValidateTwilioWebhooks(),
}));

import {
  resolveWorkspaceTwilioData,
  twilioWebhookForbidden,
  validateTwilioWebhookForCallSid,
  validateTwilioWebhookForPhoneNumber,
} from "@/lib/twilio-webhook.server";

function makeSupabase(opts?: {
  callWorkspace?: string | null;
  workspaceTwilioData?: unknown;
  numberRow?: {
    workspace: string | { id: string; twilio_data?: unknown };
    handset_enabled?: boolean;
  } | null;
  numberError?: unknown;
}) {
  return {
    from: (table: string) => {
      if (table === "call") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: opts?.callWorkspace
                  ? { workspace: opts.callWorkspace }
                  : null,
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "workspace") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { twilio_data: opts?.workspaceTwilioData ?? null },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "workspace_number") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: opts?.numberRow ?? null,
                error: opts?.numberError ?? null,
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

function makeRequest(url = "http://localhost/api/test", headers?: Record<string, string>) {
  const fd = new FormData();
  fd.set("CallSid", "CA1");
  return new Request(url, {
    method: "POST",
    headers: { "x-twilio-signature": "sig", ...headers },
    body: fd,
  });
}

describe("twilio-webhook.server", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.validateTwilioWebhookParams.mockReset();
    mocks.validateTwilioWebhookParams.mockReturnValue(true);
    mocks.shouldValidateTwilioWebhooks.mockReturnValue(true);
    mocks.logger.info.mockReset();
    vi.stubEnv("NODE_ENV", "development");
  });

  test("twilioWebhookForbidden returns 403 JSON response", async () => {
    const res = twilioWebhookForbidden("Nope");
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "Nope" });
  });

  test("resolveWorkspaceTwilioData fetches workspace twilio_data when join lacks token", async () => {
    const supabase = makeSupabase({
      workspaceTwilioData: { sid: "AC1", authToken: "fetched-token" },
    });

    const result = await resolveWorkspaceTwilioData(
      supabase as never,
      "w1",
      { sid: "AC1" },
      mocks.logger,
    );

    expect(result).toEqual({ sid: "AC1", authToken: "fetched-token" });
    expect(mocks.logger.info).toHaveBeenCalledWith(
      "Fetched workspace twilio_data (join did not include it)",
      { workspaceId: "w1" },
    );
  });

  test("validateTwilioWebhookForPhoneNumber rejects empty phone", async () => {
    const supabase = makeSupabase();
    const result = await validateTwilioWebhookForPhoneNumber({
      request: makeRequest(),
      supabase: supabase as never,
      phoneNumber: "   ",
      params: { Called: "   " },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
      await expect(result.response.json()).resolves.toEqual({
        error: "Missing phone number",
      });
    }
  });

  test("validateTwilioWebhookForCallSid uses dev auth token when call row missing", async () => {
    const supabase = makeSupabase({ callWorkspace: null });
    mocks.validateTwilioWebhookParams.mockImplementation(
      (_params, _sig, _url, token: string) => token === "main-dev-token",
    );

    const result = await validateTwilioWebhookForCallSid({
      request: makeRequest(),
      supabase: supabase as never,
      callSid: "CA_UNKNOWN",
      params: { CallSid: "CA_UNKNOWN" },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.authToken).toBe("main-dev-token");
    }
  });

  test("validateTwilioWebhookForCallSid rejects unknown call in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const supabase = makeSupabase({ callWorkspace: null });

    const result = await validateTwilioWebhookForCallSid({
      request: makeRequest(),
      supabase: supabase as never,
      callSid: "CA_UNKNOWN",
      params: { CallSid: "CA_UNKNOWN" },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
    }
  });

  test("validateTwilioWebhookForPhoneNumber returns numberRow with handset_enabled", async () => {
    const supabase = makeSupabase({
      numberRow: {
        workspace: { id: "w1", twilio_data: { sid: "AC1", authToken: "tok" } },
        handset_enabled: true,
      },
    });

    const result = await validateTwilioWebhookForPhoneNumber({
      request: makeRequest("http://localhost/api/inbound-handset"),
      supabase: supabase as never,
      phoneNumber: "+15551234567",
      params: { Called: "+15551234567" },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.numberRow).toEqual({ workspace: "w1", handset_enabled: true });
      expect(result.workspaceId).toBe("w1");
    }
  });
});
