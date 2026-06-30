import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";

const onboardingMocks = vi.hoisted(() => ({
  getWorkspaceMessagingOnboardingState: vi.fn(async () => ({
    messagingService: { attachedSenderPhoneNumbers: [] },
  })),
  updateWorkspaceMessagingOnboardingState: vi.fn(async () => ({})),
  updateMessagingServiceSenders: vi.fn((_state, phoneNumber) => ({
    messagingService: { attachedSenderPhoneNumbers: [phoneNumber] },
  })),
  applyOnboardingStepsWithWorkspaceNumbers: vi.fn((state) => state),
}));

const databaseMocks = vi.hoisted(() => ({
  getWorkspacePhoneNumbers: vi.fn(async () => ({
    data: [{ workspace: "w1", type: "caller_id", phone_number: "+15555550100" }],
  })),
}));

vi.mock("@/lib/messaging-onboarding.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/messaging-onboarding.server")>();
  return {
    ...actual,
    getWorkspaceMessagingOnboardingState: onboardingMocks.getWorkspaceMessagingOnboardingState,
    updateWorkspaceMessagingOnboardingState: onboardingMocks.updateWorkspaceMessagingOnboardingState,
    updateMessagingServiceSenders: onboardingMocks.updateMessagingServiceSenders,
    applyOnboardingStepsWithWorkspaceNumbers: onboardingMocks.applyOnboardingStepsWithWorkspaceNumbers,
  };
});

vi.mock("@/lib/database.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/database.server")>();
  return {
    ...actual,
    getWorkspacePhoneNumbers: databaseMocks.getWorkspacePhoneNumbers,
  };
});

vi.hoisted(() => {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? "postgres://test:test@localhost:5432/test";
});

const inboundMocks = vi.hoisted(() => ({
  listWorkspaceNumberTwilioCandidatesByPhone: vi.fn(),
  updateWorkspaceNumberCapabilitiesByPhone: vi.fn(),
}));

vi.mock("@/lib/inbound-call-db.server", () => ({
  listWorkspaceNumberTwilioCandidatesByPhone: (...args: unknown[]) =>
    inboundMocks.listWorkspaceNumberTwilioCandidatesByPhone(...args),
  updateWorkspaceNumberCapabilitiesByPhone: (...args: unknown[]) =>
    inboundMocks.updateWorkspaceNumberCapabilitiesByPhone(...args),
}));

const twilioMocks = vi.hoisted(() => ({
  validateTwilioWebhookParams: vi.fn(() => true),
}));

vi.mock("@client/client-js", () => ({
  createClient: vi.fn(() => ({})),
}));

vi.mock("@/lib/env.server", () => {
  return {
    env: new Proxy(
      {},
      {
        get: (_t, prop: string) => {
          if (prop === "BETTER_AUTH_URL") return () => "https://sb.example";
          if (prop === "BETTER_AUTH_SERVICE_KEY") return () => "svc";
          return () => "test";
        },
      },
    ),
  };
});

vi.mock("@/twilio.server", () => ({
  validateTwilioWebhookParams: (...args: any[]) =>
    (twilioMocks.validateTwilioWebhookParams as any)(...args),
  shouldValidateTwilioWebhooks: () => true,
}));

function makeCallerIdRequest(body: FormData) {
  return new Request("http://localhost/api/caller-id/status", {
    method: "POST",
    headers: { "x-twilio-signature": "sig" },
    body,
  });
}

describe("app/routes/api+/call/routeer-id.status.tsx", () => {
  beforeEach(() => {
    twilioMocks.validateTwilioWebhookParams.mockReset();
    twilioMocks.validateTwilioWebhookParams.mockReturnValue(true);
    inboundMocks.listWorkspaceNumberTwilioCandidatesByPhone.mockReset();
    inboundMocks.updateWorkspaceNumberCapabilitiesByPhone.mockReset();
    inboundMocks.listWorkspaceNumberTwilioCandidatesByPhone.mockResolvedValue([
      { twilioData: { account_sid: "AC123", auth_token: "auth" } },
    ]);
    onboardingMocks.getWorkspaceMessagingOnboardingState.mockReset();
    onboardingMocks.updateWorkspaceMessagingOnboardingState.mockReset();
    onboardingMocks.updateMessagingServiceSenders.mockReset();
    onboardingMocks.applyOnboardingStepsWithWorkspaceNumbers.mockReset();
    onboardingMocks.getWorkspaceMessagingOnboardingState.mockResolvedValue({
      messagingService: { attachedSenderPhoneNumbers: [] },
    });
    onboardingMocks.updateMessagingServiceSenders.mockImplementation((_state, phoneNumber) => ({
      messagingService: { attachedSenderPhoneNumbers: [phoneNumber] },
    }));
    onboardingMocks.applyOnboardingStepsWithWorkspaceNumbers.mockImplementation((state) => state);
    databaseMocks.getWorkspacePhoneNumbers.mockReset();
    databaseMocks.getWorkspacePhoneNumbers.mockResolvedValue({
      data: [{ workspace: "w1", type: "caller_id", phone_number: "+15555550100" }],
    });
    vi.resetModules();
  });

  test("returns parsed body when VerificationStatus is neither success nor failed", async () => {
    const mod = await import("../app/routes/api+/caller-id/status.route");
    const fd = new FormData();
    fd.set("VerificationStatus", "pending");
    fd.set("To", "+15555550100");
    const res = await asRouteResponse(await mod.action({
      request: makeCallerIdRequest(fd),
    } as any));
    expect(await res.json()).toMatchObject({
      VerificationStatus: "pending",
      To: "+15555550100",
    });
  });

  test("updates capabilities on success and returns first row", async () => {
    inboundMocks.updateWorkspaceNumberCapabilitiesByPhone.mockResolvedValueOnce([
      { id: 1, workspace: "w1" },
    ]);

    const mod = await import("../app/routes/api+/caller-id/status.route");
    const fd = new FormData();
    fd.set("VerificationStatus", "success");
    fd.set("To", "+15555550100");
    const res = await asRouteResponse(await mod.action({
      request: makeCallerIdRequest(fd),
    } as any));
    expect(await res.json()).toEqual({ id: 1, workspace: "w1" });
    expect(inboundMocks.updateWorkspaceNumberCapabilitiesByPhone).toHaveBeenCalledWith(
      "+15555550100",
      expect.objectContaining({
        mms: true,
        sms: true,
        voice: true,
        verification_status: "success",
      }),
    );
    expect(onboardingMocks.updateMessagingServiceSenders).toHaveBeenCalledWith(
      expect.any(Object),
      "+15555550100",
    );
    expect(onboardingMocks.updateWorkspaceMessagingOnboardingState).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "w1" }),
    );
  });

  test("updates capabilities on failed and handles DB error + empty update", async () => {
    let mode: "dbErr" | "empty" | "ok" = "dbErr";
    inboundMocks.updateWorkspaceNumberCapabilitiesByPhone.mockImplementation(async () => {
      if (mode === "dbErr") throw new Error("db");
      if (mode === "empty") return [];
      return [{ id: 1 }];
    });

    const mod = await import("../app/routes/api+/caller-id/status.route");
    const makeReq = () => {
      const fd = new FormData();
      fd.set("VerificationStatus", "failed");
      fd.set("To", "+15555550100");
      return makeCallerIdRequest(fd);
    };

    const r1 = await asRouteResponse(await mod.action({ request: makeReq() } as any));
    expect(r1.status).toBe(500);

    mode = "empty";
    const r2 = await asRouteResponse(await mod.action({ request: makeReq() } as any));
    expect(r2.status).toBe(500);

    mode = "ok";
    const r3 = await asRouteResponse(await mod.action({ request: makeReq() } as any));
    expect(r3.status).toBe(200);
    expect(inboundMocks.updateWorkspaceNumberCapabilitiesByPhone).toHaveBeenCalledWith(
      "+15555550100",
      expect.objectContaining({
        mms: false,
        sms: false,
        voice: false,
        verification_status: "failed",
      }),
    );
  });

  test("returns 403 when Twilio signature does not validate", async () => {
    twilioMocks.validateTwilioWebhookParams.mockReturnValueOnce(false);

    const mod = await import("../app/routes/api+/caller-id/status.route");
    const fd = new FormData();
    fd.set("VerificationStatus", "pending");
    fd.set("To", "+15555550100");
    const res = await asRouteResponse(await mod.action({
      request: makeCallerIdRequest(fd),
    } as any));

    const response = res as Response;
    expect(response.status).toBe(403);
  });

  test("returns 500 when candidate lookup errors", async () => {
    inboundMocks.listWorkspaceNumberTwilioCandidatesByPhone.mockRejectedValueOnce(
      new Error("lookup failed"),
    );

    const mod = await import("../app/routes/api+/caller-id/status.route");
    const fd = new FormData();
    fd.set("VerificationStatus", "pending");
    fd.set("To", "+15555550100");
    const res = await asRouteResponse(await mod.action({
      request: makeCallerIdRequest(fd),
    } as any));

    const response = res as Response;
    expect(response.status).toBe(500);
  });

  test("returns 403 when candidate lookup returns null data", async () => {
    inboundMocks.listWorkspaceNumberTwilioCandidatesByPhone.mockResolvedValueOnce([]);

    const mod = await import("../app/routes/api+/caller-id/status.route");
    const fd = new FormData();
    fd.set("VerificationStatus", "pending");
    fd.set("To", "+15555550100");
    const res = await asRouteResponse(await mod.action({
      request: makeCallerIdRequest(fd),
    } as any));

    const response = res as Response;
    expect(response.status).toBe(403);
  });
});
