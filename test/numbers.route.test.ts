import { beforeEach, describe, expect, test, vi } from "vitest";

const listMock = vi.fn();
const twilioCtor = vi.fn(function (this: any) {
  return {
    availablePhoneNumbers: () => ({ local: { list: listMock } }),
  };
});

const mocks = vi.hoisted(() => {
  return {
    createClient: vi.fn(),
    createWorkspaceTwilioInstance: vi.fn(),
    getWorkspaceUsers: vi.fn(),
    getWorkspaceMessagingOnboardingState: vi.fn(),
    updateWorkspaceMessagingOnboardingState: vi.fn(),
    env: {
      SUPABASE_URL: vi.fn(() => "http://supabase"),
      SUPABASE_SERVICE_KEY: vi.fn(() => "service"),
      BASE_URL: vi.fn(() => "http://base"),
    },
    logger: { error: vi.fn() },
  };
});

vi.mock("twilio", () => ({
  default: { Twilio: twilioCtor },
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: any[]) => mocks.createClient(...args),
}));
vi.mock("../app/lib/database.server", () => ({
  createWorkspaceTwilioInstance: (...args: any[]) => mocks.createWorkspaceTwilioInstance(...args),
  getWorkspaceUsers: (...args: any[]) => mocks.getWorkspaceUsers(...args),
}));
vi.mock("../app/lib/messaging-onboarding.server", () => ({
  getWorkspaceMessagingOnboardingState: (...args: any[]) => mocks.getWorkspaceMessagingOnboardingState(...args),
  updateWorkspaceMessagingOnboardingState: (...args: any[]) => mocks.updateWorkspaceMessagingOnboardingState(...args),
  mergeWorkspaceMessagingOnboardingState: (current: any, updates: any) => ({ ...current, ...updates }),
  buildOnboardingStepsForState: () => [],
}));
vi.mock("@/lib/env.server", () => ({ env: mocks.env }));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));

function makeSupabaseStub(opts: {
  credits?: number;
  creditsError?: any;
  workspaceNumberInsertError?: any;
  transactionInsertError?: any;
  newNumber?: any;
}) {
  const credits = opts.credits ?? 2000;
  const newNumber = opts.newNumber ?? { id: 1 };

  const from = vi.fn((table: string) => {
    if (table === "workspace") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(async () => ({
              data: { credits },
              error: opts.creditsError ?? null,
            })),
          })),
        })),
      };
    }

    if (table === "workspace_number") {
      return {
        insert: vi.fn((row: any) => ({
          _row: row,
          select: vi.fn(() => ({
            single: vi.fn(async () => ({
              data: newNumber,
              error: opts.workspaceNumberInsertError ?? null,
            })),
          })),
        })),
      };
    }

    if (table === "transaction_history") {
      return {
        insert: vi.fn(async () => ({
          error: opts.transactionInsertError ?? null,
        })),
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  });

  return { from };
}

describe("app/routes/api.numbers.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    listMock.mockReset();
    twilioCtor.mockClear();

    mocks.createClient.mockReset();
    mocks.createWorkspaceTwilioInstance.mockReset();
    mocks.getWorkspaceUsers.mockReset();
    mocks.getWorkspaceMessagingOnboardingState.mockReset();
    mocks.updateWorkspaceMessagingOnboardingState.mockReset();
    mocks.env.SUPABASE_URL.mockClear();
    mocks.env.SUPABASE_SERVICE_KEY.mockClear();
    mocks.env.BASE_URL.mockClear();
    mocks.logger.error.mockReset();
    mocks.getWorkspaceMessagingOnboardingState.mockResolvedValue({
      messagingService: {
        serviceSid: null,
        attachedSenderPhoneNumbers: [],
      },
      emergencyVoice: {
        address: { status: "not_started", addressSid: null },
        status: "not_started",
        emergencyEligiblePhoneNumbers: [],
      },
    });
    mocks.updateWorkspaceMessagingOnboardingState.mockResolvedValue(undefined);
  });

  test("loader lists local numbers with default params", async () => {
    listMock.mockResolvedValueOnce([{ phoneNumber: "+1" }]);
    const prevSid = process.env.TWILIO_SID;
    const prevToken = process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    const mod = await import("../app/routes/api.numbers");
    const res = await mod.loader({ request: new Request("http://localhost/api/numbers") } as any);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual([{ phoneNumber: "+1" }]);
    expect(listMock).toHaveBeenCalledWith({ limit: 10 });
    expect(twilioCtor).toHaveBeenCalledWith("", "");
    process.env.TWILIO_SID = prevSid;
    process.env.TWILIO_AUTH_TOKEN = prevToken;
  });

  test("loader uses areaCode when provided", async () => {
    listMock.mockResolvedValueOnce([{ phoneNumber: "+2" }]);
    const prevSid = process.env.TWILIO_SID;
    const prevToken = process.env.TWILIO_AUTH_TOKEN;
    process.env.TWILIO_SID = "sid";
    process.env.TWILIO_AUTH_TOKEN = "token";
    const mod = await import("../app/routes/api.numbers");
    const res = await mod.loader({ request: new Request("http://localhost/api/numbers?areaCode=415") } as any);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual([{ phoneNumber: "+2" }]);
    expect(listMock).toHaveBeenCalledWith({ areaCode: 415, limit: 10 });
    expect(twilioCtor).toHaveBeenCalledWith("sid", "token");
    process.env.TWILIO_SID = prevSid;
    process.env.TWILIO_AUTH_TOKEN = prevToken;
  });

  test("loader returns 500 and logs on Twilio error", async () => {
    listMock.mockRejectedValueOnce(new Error("boom"));
    const mod = await import("../app/routes/api.numbers");
    const res = await mod.loader({ request: new Request("http://localhost/api/numbers") } as any);
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: expect.anything() });
    expect(mocks.logger.error).toHaveBeenCalledWith("Fetching numbers failed", expect.anything());
  });

  test("action returns 404 when no users found", async () => {
    const supabase = makeSupabaseStub({ credits: 2000 });
    mocks.createClient.mockReturnValueOnce(supabase);
    mocks.getWorkspaceUsers.mockResolvedValueOnce({ data: null, error: null });

    const fd = new FormData();
    fd.set("phoneNumber", "+1555");
    fd.set("workspace_id", "w1");
    const mod = await import("../app/routes/api.numbers");
    const res = await mod.action({ request: new Request("http://localhost/api/numbers", { method: "POST", body: fd }) } as any);

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "No users found for workspace" });
  });

  test("action returns 400 creditsError when credits too low", async () => {
    const supabase = makeSupabaseStub({ credits: 1000 });
    mocks.createClient.mockReturnValueOnce(supabase);
    mocks.getWorkspaceUsers.mockResolvedValueOnce({ data: [{ user_workspace_role: "owner", username: "alice" }], error: null });

    const fd = new FormData();
    fd.set("phoneNumber", "+1555");
    fd.set("workspace_id", "w1");
    const mod = await import("../app/routes/api.numbers");
    const res = await mod.action({ request: new Request("http://localhost/api/numbers", { method: "POST", body: fd }) } as any);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ creditsError: true });
  });

  test("action returns 201 on success (verification_status success, inbound_action owner)", async () => {
    const supabase = makeSupabaseStub({
      credits: 2000,
      newNumber: { id: 9, phone_number: "+1555" },
    });
    mocks.createClient.mockReturnValueOnce(supabase);
    mocks.getWorkspaceUsers.mockResolvedValueOnce({
      data: [{ user_workspace_role: "owner", username: "alice" }],
      error: null,
    });
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      incomingPhoneNumbers: {
        create: vi.fn().mockResolvedValueOnce({
          sid: "PN123",
          friendlyName: "FN",
          phoneNumber: "+1555",
          capabilities: { voice: true, sms: true, mms: true },
        }),
      },
    });

    const fd = new FormData();
    fd.set("phoneNumber", "+1555");
    fd.set("workspace_id", "w1");
    const mod = await import("../app/routes/api.numbers");
    const res = await mod.action({ request: new Request("http://localhost/api/numbers", { method: "POST", body: fd }) } as any);

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ newNumber: { id: 9, phone_number: "+1555" } });

    const workspaceNumberInsert = supabase.from.mock.results
      .find((r) => r.value && r.value.insert)?.value.insert as any;
    expect(workspaceNumberInsert).toBeTruthy();
    expect(mocks.updateWorkspaceMessagingOnboardingState).toHaveBeenCalled();
  });

  test("action covers pending verification_status and inbound_action null", async () => {
    const supabase = makeSupabaseStub({
      credits: 2000,
      newNumber: { id: 10 },
    });
    mocks.createClient.mockReturnValueOnce(supabase);
    mocks.getWorkspaceUsers.mockResolvedValueOnce({
      data: [{ user_workspace_role: "member", username: "bob" }],
      error: null,
    });
    const create = vi.fn().mockResolvedValueOnce({
      sid: "PN456",
      friendlyName: "FN2",
      phoneNumber: "+1666",
      capabilities: { voice: true, sms: false, mms: true },
    });
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      incomingPhoneNumbers: { create },
    });

    const fd = new FormData();
    fd.set("phoneNumber", "+1666");
    fd.set("workspace_id", "w2");
    const mod = await import("../app/routes/api.numbers");
    const res = await mod.action({ request: new Request("http://localhost/api/numbers", { method: "POST", body: fd }) } as any);

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ newNumber: { id: 10 } });
  });

  test("action attaches purchased number to Messaging Service when workspace has one", async () => {
    const supabase = makeSupabaseStub({
      credits: 2000,
      newNumber: { id: 11, phone_number: "+1999" },
    });
    mocks.createClient.mockReturnValueOnce(supabase);
    mocks.getWorkspaceUsers.mockResolvedValueOnce({
      data: [{ user_workspace_role: "owner", username: "alice" }],
      error: null,
    });
    mocks.getWorkspaceMessagingOnboardingState.mockResolvedValueOnce({
      messagingService: {
        serviceSid: "MG123",
        attachedSenderPhoneNumbers: [],
      },
      emergencyVoice: {
        address: { status: "validated", addressSid: "AD123" },
        status: "collecting_business",
        emergencyEligiblePhoneNumbers: [],
      },
    });
    const attach = vi.fn().mockResolvedValueOnce({});
    const create = vi.fn().mockResolvedValueOnce({
      sid: "PN789",
      friendlyName: "FN3",
      phoneNumber: "+1999",
      capabilities: { voice: true, sms: true, mms: true },
    });
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      incomingPhoneNumbers: { create },
      messaging: {
        v1: {
          services: () => ({
            phoneNumbers: {
              create: attach,
            },
          }),
        },
      },
    });

    const fd = new FormData();
    fd.set("phoneNumber", "+1999");
    fd.set("workspace_id", "w3");
    const mod = await import("../app/routes/api.numbers");
    const res = await mod.action({ request: new Request("http://localhost/api/numbers", { method: "POST", body: fd }) } as any);

    expect(res.status).toBe(201);
    expect(attach).toHaveBeenCalledWith({ phoneNumberSid: "PN789" });
  });

  test("action returns 500 when getWorkspaceUsers returns error", async () => {
    const supabase = makeSupabaseStub({ credits: 2000 });
    mocks.createClient.mockReturnValueOnce(supabase);
    mocks.getWorkspaceUsers.mockResolvedValueOnce({ data: null, error: new Error("users") });

    const fd = new FormData();
    fd.set("phoneNumber", "+1777");
    fd.set("workspace_id", "w1");
    const mod = await import("../app/routes/api.numbers");
    const res = await mod.action({ request: new Request("http://localhost/api/numbers", { method: "POST", body: fd }) } as any);

    expect(res.status).toBe(500);
    expect(mocks.logger.error).toHaveBeenCalledWith("Failed to register number", expect.anything());
  });

  test("action returns 500 when workspace credits query errors", async () => {
    const supabase = makeSupabaseStub({ creditsError: { message: "credits" } });
    mocks.createClient.mockReturnValueOnce(supabase);
    mocks.getWorkspaceUsers.mockResolvedValueOnce({ data: [{ user_workspace_role: "owner", username: "alice" }], error: null });

    const fd = new FormData();
    fd.set("phoneNumber", "+1888");
    fd.set("workspace_id", "w1");
    const mod = await import("../app/routes/api.numbers");
    const res = await mod.action({ request: new Request("http://localhost/api/numbers", { method: "POST", body: fd }) } as any);

    expect(res.status).toBe(500);
  });

  test("action returns 500 when Twilio create rejects (logs both error sites)", async () => {
    const supabase = makeSupabaseStub({ credits: 2000 });
    mocks.createClient.mockReturnValueOnce(supabase);
    mocks.getWorkspaceUsers.mockResolvedValueOnce({ data: [{ user_workspace_role: "owner", username: "alice" }], error: null });
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      incomingPhoneNumbers: {
        create: vi.fn().mockRejectedValueOnce(new Error("twilio")),
      },
    });

    const fd = new FormData();
    fd.set("phoneNumber", "+1999");
    fd.set("workspace_id", "w1");
    const mod = await import("../app/routes/api.numbers");
    const res = await mod.action({ request: new Request("http://localhost/api/numbers", { method: "POST", body: fd }) } as any);

    expect(res.status).toBe(500);
    expect(mocks.logger.error).toHaveBeenCalledWith("Error creating Twilio number:", expect.anything());
    expect(mocks.logger.error).toHaveBeenCalledWith("Failed to register number", expect.anything());
  });

  test("action returns 500 when workspace_number insert errors", async () => {
    const supabase = makeSupabaseStub({ workspaceNumberInsertError: { message: "insert" } });
    mocks.createClient.mockReturnValueOnce(supabase);
    mocks.getWorkspaceUsers.mockResolvedValueOnce({ data: [{ user_workspace_role: "owner", username: "alice" }], error: null });
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      incomingPhoneNumbers: {
        create: vi.fn().mockResolvedValueOnce({
          friendlyName: "FN",
          phoneNumber: "+1",
          capabilities: { voice: true, sms: true, mms: true },
        }),
      },
    });

    const fd = new FormData();
    fd.set("phoneNumber", "+1");
    fd.set("workspace_id", "w1");
    const mod = await import("../app/routes/api.numbers");
    const res = await mod.action({ request: new Request("http://localhost/api/numbers", { method: "POST", body: fd }) } as any);

    expect(res.status).toBe(500);
  });

  test("action returns 500 when transaction_history insert errors", async () => {
    const supabase = makeSupabaseStub({ transactionInsertError: { message: "tx" } });
    mocks.createClient.mockReturnValueOnce(supabase);
    mocks.getWorkspaceUsers.mockResolvedValueOnce({ data: [{ user_workspace_role: "owner", username: "alice" }], error: null });
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      incomingPhoneNumbers: {
        create: vi.fn().mockResolvedValueOnce({
          friendlyName: "FN",
          phoneNumber: "+1",
          capabilities: { voice: true, sms: true, mms: true },
        }),
      },
    });

    const fd = new FormData();
    fd.set("phoneNumber", "+1");
    fd.set("workspace_id", "w1");
    const mod = await import("../app/routes/api.numbers");
    const res = await mod.action({ request: new Request("http://localhost/api/numbers", { method: "POST", body: fd }) } as any);

    expect(res.status).toBe(500);
  });
});

