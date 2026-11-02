import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";

const mocks = vi.hoisted(() => {
  return {
    logger: { error: vi.fn() , info: vi.fn(), debug: vi.fn()},
    env: new Proxy(
      { BASE_URL: () => "https://base.example" },
      { get: (target, prop: string) => (target as any)[prop] ?? (() => "test") },
    ),
  };
});

vi.mock("@/lib/env.server", () => ({ env: mocks.env }));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));
const requireTwilioSignatureMock = vi.fn(async () => null);
vi.mock("@/lib/twilio-webhook.server", () => ({
  requireTwilioSignature: (...args: unknown[]) => requireTwilioSignatureMock(...args),
  twilioWebhookForbiddenHangup: () =>
    new Response("<Response><Say/><Hangup/></Response>", {
      status: 403,
      headers: { "Content-Type": "text/xml" },
    }),
}));
const workspaceMock = vi.fn(async () => null);
vi.mock("@/server/voice-recording-operation.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/server/voice-recording-operation.server")>(),
  prepareVoiceDialRecording: async () => ({ id: "10000000-0000-4000-8000-000000000002",
    callback_url: "https://base.example/api/voice-recording?recording=10000000-0000-4000-8000-000000000002" }),
}));
vi.mock("@/lib/workspace-members-db.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/workspace-members-db.server")>(), getWorkspaceById: () => workspaceMock(),
}));
vi.mock("@/lib/voice-bridge-webhook.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/voice-bridge-webhook.server")>(),
  bindVerifiedVoiceSetupRequest: async () => ({ workspace: "w1", user_id: "actor", caller_id: "+1555", recipient: "+15550001111", status_callback: "https://base.example/api/call-status/" }),
  voiceBridgeCallbackArgs: () => ({}),
}));
vi.mock("@/server/voice-bridge-reservation.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/server/voice-bridge-reservation.server")>(), claimVoiceBridgeRecipient: async () => ({ issued: true }),
}));

describe("app/routes/api+/dial/route.$number.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.logger.error.mockReset();
    requireTwilioSignatureMock.mockClear();
    requireTwilioSignatureMock.mockResolvedValue(null);
    workspaceMock.mockReset();
    workspaceMock.mockResolvedValue(null);
  });

  // Regression: this route used to build the signature-check option as
  // `callSid ? { callSid } : {}` — omitting CallSid silently downgraded
  // validation to the main-account token instead of failing. Twilio always
  // supplies CallSid when fetching a call's TwiML action URL.
  test("rejects with 403 hangup when CallSid is missing, without calling requireTwilioSignature", async () => {
    const mod = await import("../app/routes/api+/dial/$number.route");
    const fd = new FormData();
    fd.set("From", "+1555");
    const res = await asRouteResponse(mod.action({
      request: new Request("http://localhost/api/dial/+1555", { method: "POST", body: fd }),
      params: { number: "+15550001111" },
    } as any));
    expect(res.status).toBe(403);
    expect(requireTwilioSignatureMock).not.toHaveBeenCalled();
  });

  test("returns xml with dial using absolute status callback", async () => {
    const mod = await import("../app/routes/api+/dial/$number.route");
    const fd = new FormData();
    fd.set("From", "+1555");
    fd.set("CallSid", "CA1");
    const res = await asRouteResponse(mod.action({
      request: new Request("http://localhost/api/dial/+1555", { method: "POST", body: fd }),
      params: { number: "+15550001111" },
    } as any));
    expect(res.headers.get("Content-Type")).toBe("text/xml");
    const body = await res.text();
    expect(body).toContain("<Dial");
    // Manual dials no longer wait on AMD.
    expect(body).not.toContain("machineDetection");
    expect(body).toContain('statusCallback="https://base.example/api/call-status/"');
    expect(body).toMatch(/<Dial[^>]*record="record-from-answer"/);
    expect(body).toContain('recordingStatusCallback="https://base.example/api/voice-recording?recording=10000000-0000-4000-8000-000000000002#');
    expect(body).toMatch(/<Dial[^>]*recordingStatusCallbackEvent="in-progress completed absent"/);
    expect(body).toMatch(/<Dial[^>]*recordingStatusCallbackMethod="POST"/);
    expect(body).toContain(">+15550001111</Number>");
  }, 30000);

  test("logs and returns fallback TwiML (not an HTML error page) when the handler throws", async () => {
    workspaceMock.mockRejectedValueOnce(new Error("dial"));
    const mod = await import("../app/routes/api+/dial/$number.route");
    const fd = new FormData();
    fd.set("From", "+1555");
    fd.set("CallSid", "CA1");
    const res = await asRouteResponse(mod.action({
        request: new Request("http://localhost/api/dial/+1555", { method: "POST", body: fd }),
        params: { number: "+15550001111" },
      } as any),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/xml");
    const body = await res.text();
    expect(body).toContain("<Say");
    expect(body).toContain("<Hangup");
    expect(mocks.logger.error).toHaveBeenCalledWith("Error in dial route:", expect.any(Error));
  }, 30000);
});

