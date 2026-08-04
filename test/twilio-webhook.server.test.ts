import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  validateTwilioWebhookParams: vi.fn(() => true),
  shouldValidateTwilioWebhooks: vi.fn(() => true),
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
  env: {
    BASE_URL: () => "http://localhost:3000",
    TWILIO_AUTH_TOKEN: () => "main-account-token",
  },
  findCallBySid: vi.fn(),
  findMessageBySid: vi.fn(),
  findWorkspaceNumberByPhoneNumber: vi.fn(),
  getWorkspaceById: vi.fn(),
  loadWorkspaceTwilioData: vi.fn(),
  findWorkspaceIdByTwilioAccountSid: vi.fn(),
  readTwilioWorkspaceCredentials: vi.fn(),
  resolveTwilioWebhookAuthToken: vi.fn(),
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
vi.mock("@/lib/message-db.server", () => ({
  findMessageBySid: (...args: unknown[]) => mocks.findMessageBySid(...args),
}));
vi.mock("@/lib/inbound-call-db.server", () => ({
  findWorkspaceNumberByPhoneNumber: (...args: unknown[]) =>
    mocks.findWorkspaceNumberByPhoneNumber(...args),
}));
vi.mock("@/lib/workspace-members-db.server", () => ({
  getWorkspaceById: (...args: unknown[]) => mocks.getWorkspaceById(...args),
}));
vi.mock("@/lib/merge-workspace-twilio-data.server", () => ({
  loadWorkspaceTwilioData: (...args: unknown[]) =>
    mocks.loadWorkspaceTwilioData(...args),
  findWorkspaceIdByTwilioAccountSid: (...args: unknown[]) =>
    mocks.findWorkspaceIdByTwilioAccountSid(...args),
}));
vi.mock("@/lib/twilio-workspace-credentials", () => ({
  readTwilioWorkspaceCredentials: (...args: unknown[]) =>
    mocks.readTwilioWorkspaceCredentials(...args),
  resolveTwilioWebhookAuthToken: (...args: unknown[]) =>
    mocks.resolveTwilioWebhookAuthToken(...args),
}));

import {
  resolveCanonicalTwilioWebhookUrl,
  requireTwilioSignature,
  twilioWebhookForbidden,
  twilioWebhookForbiddenHangup,
} from "@/lib/twilio-webhook.server";

function makeRequest(url = "http://localhost:3000/api/test", headers?: Record<string, string>) {
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
    mocks.shouldValidateTwilioWebhooks.mockReset();
    mocks.shouldValidateTwilioWebhooks.mockReturnValue(true);
    mocks.findCallBySid.mockReset();
    mocks.findMessageBySid.mockReset();
    mocks.findWorkspaceNumberByPhoneNumber.mockReset();
    mocks.getWorkspaceById.mockReset();
    mocks.loadWorkspaceTwilioData.mockReset();
    mocks.findWorkspaceIdByTwilioAccountSid.mockReset();
    mocks.readTwilioWorkspaceCredentials.mockReset();
    mocks.resolveTwilioWebhookAuthToken.mockReset();
    mocks.logger.warn.mockReset();
    mocks.logger.info.mockReset();
    mocks.logger.error.mockReset();
  });

  test("twilioWebhookForbidden returns 403 JSON response", async () => {
    const res = twilioWebhookForbidden("Nope");
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "Nope" });
  });

  test("twilioWebhookForbiddenHangup returns 403 TwiML", () => {
    const res = twilioWebhookForbiddenHangup();
    expect(res.status).toBe(403);
    expect(res.headers.get("Content-Type")).toBe("text/xml");
  });

  test("resolveCanonicalTwilioWebhookUrl uses BASE_URL and pathname", () => {
    const req = makeRequest("http://wrong-host/api/test?x=1");
    expect(resolveCanonicalTwilioWebhookUrl(req)).toBe("http://localhost:3000/api/test");
  });

  test("returns null when webhook validation is disabled", async () => {
    mocks.shouldValidateTwilioWebhooks.mockReturnValue(false);
    const result = await requireTwilioSignature(makeRequest());
    expect(result).toBeNull();
  });

  test("returns hangup TwiML when signature header is missing", async () => {
    const req = makeRequest(undefined, { "x-twilio-signature": "" });
    const result = await requireTwilioSignature(req);
    expect(result?.status).toBe(403);
    expect(result?.headers.get("Content-Type")).toBe("text/xml");
  });

  test("returns hangup TwiML when signature validation fails", async () => {
    mocks.validateTwilioWebhookParams.mockReturnValue(false);
    const result = await requireTwilioSignature(makeRequest(), { callSid: "CA1" });
    expect(result?.status).toBe(403);
    expect(result?.headers.get("Content-Type")).toBe("text/xml");
  });

  test("validates with main account token when no workspace option is given", async () => {
    mocks.resolveTwilioWebhookAuthToken.mockReturnValue("main-account-token");
    const result = await requireTwilioSignature(makeRequest());
    expect(result).toBeNull();
    expect(mocks.validateTwilioWebhookParams).toHaveBeenCalledWith(
      expect.any(Object),
      "sig",
      "http://localhost:3000/api/test",
      "main-account-token",
    );
  });

  test("validates with workspace token when workspaceId is provided", async () => {
    mocks.loadWorkspaceTwilioData.mockResolvedValueOnce({ workspace: "w1", twilio_data: { authToken: "ws-token" } });
    mocks.readTwilioWorkspaceCredentials.mockReturnValueOnce({ authToken: "ws-token" });
    mocks.resolveTwilioWebhookAuthToken.mockReturnValueOnce("ws-token");
    const result = await requireTwilioSignature(makeRequest(), { workspaceId: "w1" });
    expect(result).toBeNull();
    expect(mocks.loadWorkspaceTwilioData).toHaveBeenCalledWith("w1");
    expect(mocks.validateTwilioWebhookParams).toHaveBeenCalledWith(
      expect.any(Object),
      "sig",
      "http://localhost:3000/api/test",
      "ws-token",
    );
  });

  test("validates with workspace token when callSid is provided", async () => {
    mocks.findCallBySid.mockResolvedValueOnce({ workspace: "w1" });
    mocks.loadWorkspaceTwilioData.mockResolvedValueOnce({ workspace: "w1", twilio_data: { authToken: "ws-token" } });
    mocks.readTwilioWorkspaceCredentials.mockReturnValueOnce({ authToken: "ws-token" });
    mocks.resolveTwilioWebhookAuthToken.mockReturnValueOnce("ws-token");
    const result = await requireTwilioSignature(makeRequest(), { callSid: "CA1" });
    expect(result).toBeNull();
    expect(mocks.findCallBySid).toHaveBeenCalledWith("CA1");
    expect(mocks.loadWorkspaceTwilioData).toHaveBeenCalledWith("w1");
  });

  test("returns hangup TwiML when callSid workspace cannot be resolved", async () => {
    mocks.findCallBySid.mockResolvedValueOnce(null);
    mocks.resolveTwilioWebhookAuthToken.mockReturnValue(null);
    const result = await requireTwilioSignature(makeRequest(), { callSid: "CA_UNKNOWN" });
    expect(result?.status).toBe(403);
    expect(mocks.logger.warn).toHaveBeenCalledWith(
      "twilio.webhook.auth_failed",
      expect.objectContaining({ reason: "missing_credentials" }),
    );
  });

  test("falls back to AccountSid workspace lookup when call row is missing", async () => {
    mocks.findCallBySid.mockResolvedValueOnce(null);
    mocks.findWorkspaceIdByTwilioAccountSid.mockResolvedValueOnce("w1");
    mocks.loadWorkspaceTwilioData.mockResolvedValueOnce({ sid: "AC1", authToken: "ws-token" });
    mocks.readTwilioWorkspaceCredentials.mockImplementation((data: unknown) => {
      if (data && typeof data === "object" && "authToken" in data) {
        return data as { sid: string; authToken: string };
      }
      return null;
    });
    mocks.resolveTwilioWebhookAuthToken.mockImplementation(
      (creds: { authToken?: string } | null) => creds?.authToken ?? null,
    );

    const result = await requireTwilioSignature(
      makeRequest("http://localhost:3000/api/ivr/status"),
      {
        callSid: "CA_RACE",
        params: { CallSid: "CA_RACE", AccountSid: "AC1" },
      },
    );
    expect(result).toBeNull();
    expect(mocks.findWorkspaceIdByTwilioAccountSid).toHaveBeenCalledWith("AC1");
    expect(mocks.loadWorkspaceTwilioData).toHaveBeenCalledWith("w1");
    expect(mocks.logger.info).toHaveBeenCalledWith(
      "twilio.webhook.auth_account_sid_fallback",
      expect.objectContaining({ callSid: "CA_RACE", accountSid: "AC1", workspaceId: "w1" }),
    );
  });

  test("logs invalid_signature when token resolves but signature check fails", async () => {
    mocks.findCallBySid.mockResolvedValueOnce({ workspace: "w1" });
    mocks.loadWorkspaceTwilioData.mockResolvedValueOnce({ authToken: "ws-token" });
    mocks.readTwilioWorkspaceCredentials.mockReturnValueOnce({
      sid: "AC1",
      authToken: "ws-token",
    });
    mocks.resolveTwilioWebhookAuthToken.mockReturnValueOnce("ws-token");
    mocks.validateTwilioWebhookParams.mockReturnValueOnce(false);

    const result = await requireTwilioSignature(makeRequest(), { callSid: "CA1" });
    expect(result?.status).toBe(403);
    expect(mocks.logger.warn).toHaveBeenCalledWith(
      "twilio.webhook.auth_failed",
      expect.objectContaining({ reason: "invalid_signature" }),
    );
  });

  test("validates with workspace token when messageSid is provided", async () => {
    mocks.findMessageBySid.mockResolvedValueOnce({ workspace: "w1" });
    mocks.loadWorkspaceTwilioData.mockResolvedValueOnce({ workspace: "w1", twilio_data: { authToken: "ws-token" } });
    mocks.readTwilioWorkspaceCredentials.mockReturnValueOnce({ authToken: "ws-token" });
    mocks.resolveTwilioWebhookAuthToken.mockReturnValueOnce("ws-token");
    const result = await requireTwilioSignature(makeRequest(), { messageSid: "SM1" });
    expect(result).toBeNull();
    expect(mocks.findMessageBySid).toHaveBeenCalledWith("SM1");
    expect(mocks.loadWorkspaceTwilioData).toHaveBeenCalledWith("w1");
  });

  test("returns hangup TwiML when messageSid workspace cannot be resolved", async () => {
    mocks.findMessageBySid.mockResolvedValueOnce(null);
    mocks.resolveTwilioWebhookAuthToken.mockReturnValue(null);
    const result = await requireTwilioSignature(makeRequest(), { messageSid: "SM_UNKNOWN" });
    expect(result?.status).toBe(403);
  });

  test("falls back to AccountSid when message row is missing", async () => {
    mocks.findMessageBySid.mockResolvedValueOnce(null);
    mocks.findWorkspaceIdByTwilioAccountSid.mockResolvedValueOnce("w1");
    mocks.loadWorkspaceTwilioData.mockResolvedValueOnce({ sid: "AC1", authToken: "ws-token" });
    mocks.readTwilioWorkspaceCredentials.mockImplementation((data: unknown) => {
      if (data && typeof data === "object" && "authToken" in data) {
        return data as { sid: string; authToken: string };
      }
      return null;
    });
    mocks.resolveTwilioWebhookAuthToken.mockImplementation(
      (creds: { authToken?: string } | null) => creds?.authToken ?? null,
    );

    const result = await requireTwilioSignature(makeRequest(), {
      messageSid: "SM_RACE",
      params: { MessageSid: "SM_RACE", AccountSid: "AC1" },
    });
    expect(result).toBeNull();
    expect(mocks.findWorkspaceIdByTwilioAccountSid).toHaveBeenCalledWith("AC1");
  });

  test("validates with workspace token when phoneNumber is provided", async () => {
    mocks.findWorkspaceNumberByPhoneNumber.mockResolvedValueOnce({ workspace: "w1" });
    mocks.getWorkspaceById.mockResolvedValueOnce({ twilio_data: { authToken: "ws-token" } });
    mocks.readTwilioWorkspaceCredentials.mockReturnValueOnce({ authToken: "ws-token" });
    mocks.resolveTwilioWebhookAuthToken.mockReturnValueOnce("ws-token");
    const result = await requireTwilioSignature(makeRequest("http://localhost:3000/api/inbound-handset"), { phoneNumber: "+15551234567" });
    expect(result).toBeNull();
    expect(mocks.findWorkspaceNumberByPhoneNumber).toHaveBeenCalledWith("+15551234567");
    expect(mocks.validateTwilioWebhookParams).toHaveBeenCalledWith(
      expect.any(Object),
      "sig",
      "http://localhost:3000/api/inbound-handset",
      "ws-token",
    );
  });

  test("returns hangup TwiML when workspace credentials are missing", async () => {
    mocks.loadWorkspaceTwilioData.mockResolvedValueOnce({ workspace: "w1", twilio_data: {} });
    mocks.readTwilioWorkspaceCredentials.mockReturnValueOnce({ authToken: null });
    mocks.resolveTwilioWebhookAuthToken.mockReturnValueOnce(null);
    const result = await requireTwilioSignature(makeRequest(), { workspaceId: "w1" });
    expect(result?.status).toBe(403);
    expect(result?.headers.get("Content-Type")).toBe("text/xml");
  });
});
