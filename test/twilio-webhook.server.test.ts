import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  validateTwilioWebhookParams: vi.fn(() => true),
  shouldValidateTwilioWebhooks: vi.fn(() => true),
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
  env: {
    TWILIO_AUTH_TOKEN: () => "main-dev-token",
  },
  findCallBySid: vi.fn(),
  findWorkspaceNumberByPhoneNumber: vi.fn(),
  getWorkspaceById: vi.fn(),
  loadWorkspaceTwilioData: vi.fn(),
}));

vi.mock("@/lib/env.server", () => ({ env: mocks.env }));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));
vi.mock("@/twilio.server", () => ({
  validateTwilioWebhookParams: (...args: unknown[]) =>
    mocks.validateTwilioWebhookParams(...args),
  shouldValidateTwilioWebhooks: () => mocks.shouldValidateTwilioWebhooks(),
}));
vi.mock("@/lib/telephony-db.server", () => ({
  findCallBySid: (...args: unknown[]) => mocks.findCallBySid(...args),
}));
vi.mock("@/lib/inbound-call-db.server", () => ({
  findWorkspaceNumberByPhoneNumber: (...args: unknown[]) =>
    mocks.findWorkspaceNumberByPhoneNumber(...args),
}));
vi.mock("@/lib/workspace-members-db.server", () => ({
  getWorkspaceById: (...args: unknown[]) => mocks.getWorkspaceById(...args),
}));
vi.mock("@/lib/merge-workspace-twilio-data.server", () => ({
  loadWorkspaceTwilioData: (...args: unknown[]) => mocks.loadWorkspaceTwilioData(...args),
}));

import {
  resolveWorkspaceTwilioData,
  twilioWebhookForbidden,
  validateTwilioWebhookForCallSid,
  validateTwilioWebhookForPhoneNumber,
} from "@/lib/twilio-webhook.server";

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
    mocks.findCallBySid.mockReset();
    mocks.findWorkspaceNumberByPhoneNumber.mockReset();
    mocks.getWorkspaceById.mockReset();
    mocks.loadWorkspaceTwilioData.mockReset();
    vi.stubEnv("NODE_ENV", "development");
  });

  test("twilioWebhookForbidden returns 403 JSON response", async () => {
    const res = twilioWebhookForbidden("Nope");
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "Nope" });
  });

  test("resolveWorkspaceTwilioData fetches workspace twilio_data when join lacks token", async () => {
    mocks.getWorkspaceById.mockResolvedValueOnce({
      twilio_data: { sid: "AC1", authToken: "fetched-token" },
    });

    const result = await resolveWorkspaceTwilioData(
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
    const result = await validateTwilioWebhookForPhoneNumber({
      request: makeRequest(),
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
    mocks.findCallBySid.mockResolvedValueOnce(null);
    mocks.validateTwilioWebhookParams.mockImplementation(
      (_params, _sig, _url, token: string) => token === "main-dev-token",
    );

    const result = await validateTwilioWebhookForCallSid({
      request: makeRequest(),
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
    mocks.findCallBySid.mockResolvedValueOnce(null);

    const result = await validateTwilioWebhookForCallSid({
      request: makeRequest(),
      callSid: "CA_UNKNOWN",
      params: { CallSid: "CA_UNKNOWN" },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
    }
  });

  test("validateTwilioWebhookForPhoneNumber returns numberRow with handset_enabled", async () => {
    mocks.findWorkspaceNumberByPhoneNumber.mockResolvedValueOnce({
      workspaceId: "w1",
      handset_enabled: true,
    });
    mocks.getWorkspaceById.mockResolvedValueOnce({
      twilio_data: { sid: "AC1", authToken: "tok" },
    });

    const result = await validateTwilioWebhookForPhoneNumber({
      request: makeRequest("http://localhost/api/inbound-handset"),
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
