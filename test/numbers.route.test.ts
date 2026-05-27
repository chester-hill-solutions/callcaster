import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";

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
    getWorkspacePhoneNumbers: vi.fn(),
    requireWorkspaceAccess: vi.fn(),
    getWorkspaceMessagingOnboardingState: vi.fn(),
    updateWorkspaceMessagingOnboardingState: vi.fn(),
    insertTransactionHistoryIdempotent: vi.fn(),
    attachPhoneNumberToMessagingService: vi.fn(async () => ({})),
    env: {
      SUPABASE_URL: vi.fn(() => "http://supabase"),
      SUPABASE_SERVICE_KEY: vi.fn(() => "service"),
      SUPABASE_PUBLISHABLE_KEY: vi.fn(() => "publishable"),
      BASE_URL: vi.fn(() => "http://base"),
      TWILIO_SID: vi.fn(() => process.env.TWILIO_SID ?? "sid"),
      TWILIO_AUTH_TOKEN: vi.fn(() => process.env.TWILIO_AUTH_TOKEN ?? "token"),
    },
    logger: { error: vi.fn() , info: vi.fn(), debug: vi.fn()},
  };
});

vi.mock("twilio", () => ({
  default: { Twilio: twilioCtor },
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: any[]) => mocks.createClient(...args),
}));
vi.mock("../app/lib/database.server", () => ({
  createWorkspaceTwilioInstance: (...args: any[]) =>
    mocks.createWorkspaceTwilioInstance(...args),
  getWorkspaceUsers: (...args: any[]) => mocks.getWorkspaceUsers(...args),
  getWorkspacePhoneNumbers: (...args: any[]) =>
    mocks.getWorkspacePhoneNumbers(...args),
  requireWorkspaceAccess: (...args: any[]) =>
    mocks.requireWorkspaceAccess(...args),
}));
vi.mock("../app/lib/messaging-onboarding.server", () => ({
  getWorkspaceMessagingOnboardingState: (...args: any[]) =>
    mocks.getWorkspaceMessagingOnboardingState(...args),
  updateWorkspaceMessagingOnboardingState: (...args: any[]) =>
    mocks.updateWorkspaceMessagingOnboardingState(...args),
  mergeWorkspaceMessagingOnboardingState: (current: any, updates: any) => ({
    ...current,
    ...updates,
  }),
  buildOnboardingStepsForState: () => [],
  applyOnboardingStepsWithWorkspaceNumbers: (current: unknown) => current,
}));
vi.mock("@/lib/env.server", () => ({ env: mocks.env }));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));
vi.mock("@/lib/twilio-client.server", () => ({
  withTwilioRetry: vi.fn(async (fn: () => Promise<unknown>) => fn()),
}));
vi.mock("@/lib/twilio-bootstrap.server", () => ({
  attachPhoneNumberToMessagingService: (...args: unknown[]) =>
    mocks.attachPhoneNumberToMessagingService(...args),
}));
vi.mock("@/lib/transaction-history.server", () => ({
  insertTransactionHistoryIdempotent: (...args: any[]) =>
    mocks.insertTransactionHistoryIdempotent(...args),
}));
vi.mock("@/lib/supabase.server", () => ({
  verifyAuth: vi.fn(async () => ({
    supabaseClient: {},
    user: { id: "u1" },
    headers: new Headers(),
  })),
}));

function makeSupabaseStub(opts: {
  credits?: number;
  creditsError?: any;
  workspaceNumberInsertError?: any;
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

    throw new Error(`Unexpected table: ${table}`);
  });

  return { from };
}

describe("app/routes/api+/numbers/route.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    listMock.mockReset();
    twilioCtor.mockClear();

    mocks.createClient.mockReset();
    mocks.createWorkspaceTwilioInstance.mockReset();
    mocks.getWorkspaceUsers.mockReset();
    mocks.getWorkspacePhoneNumbers.mockReset();
    mocks.getWorkspacePhoneNumbers.mockResolvedValue({ data: [], error: null });
    mocks.attachPhoneNumberToMessagingService.mockReset();
    mocks.attachPhoneNumberToMessagingService.mockResolvedValue({});
    mocks.requireWorkspaceAccess.mockReset();
    mocks.requireWorkspaceAccess.mockResolvedValue(undefined);
    mocks.getWorkspaceMessagingOnboardingState.mockReset();
    mocks.updateWorkspaceMessagingOnboardingState.mockReset();
    mocks.env.SUPABASE_URL.mockClear();
    mocks.env.SUPABASE_SERVICE_KEY.mockClear();
    mocks.env.BASE_URL.mockClear();
    mocks.logger.error.mockReset();
    mocks.insertTransactionHistoryIdempotent.mockReset();
    mocks.insertTransactionHistoryIdempotent.mockResolvedValue({
      inserted: true,
      existingId: 1,
    });
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

  test("loader returns 400 when search query is missing", async () => {
    const mod = await import("../app/routes/api+/numbers");
    const res = await asRouteResponse(
      await mod.loader({
        request: new Request("http://localhost/api/numbers?searchMode=areaCode"),
      } as any),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      ok: false,
      error: "Enter a search value.",
    });
  });

  test("loader lists local numbers with searchMode and query", async () => {
    listMock.mockResolvedValueOnce([
      {
        phoneNumber: "+14165551234",
        friendlyName: "+14165551234",
        region: "ON",
        locality: "Toronto",
        capabilities: { voice: true, sms: true },
      },
    ]);
    mocks.env.TWILIO_SID.mockReturnValueOnce("sid");
    mocks.env.TWILIO_AUTH_TOKEN.mockReturnValueOnce("token");
    const mod = await import("../app/routes/api+/numbers");
    const res = await asRouteResponse(
      await mod.loader({
        request: new Request(
          "http://localhost/api/numbers?searchMode=areaCode&query=416",
        ),
      } as any),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      numbers: [
        {
          phoneNumber: "+14165551234",
          friendlyName: "+14165551234",
          region: "ON",
          locality: "Toronto",
          capabilities: { voice: true, sms: true },
        },
      ],
    });
    expect(listMock).toHaveBeenCalledWith({ areaCode: 416, limit: 20 });
    expect(twilioCtor).toHaveBeenCalledWith("sid", "token");
  });

  test("loader uses workspace Twilio when workspace_id is provided", async () => {
    listMock.mockResolvedValueOnce([
      { phoneNumber: "+1999", friendlyName: "+1999", capabilities: {} },
    ]);
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      availablePhoneNumbers: () => ({ local: { list: listMock } }),
    });
    const mod = await import("../app/routes/api+/numbers");
    const res = await asRouteResponse(
      await mod.loader({
        request: new Request(
          "http://localhost/api/numbers?searchMode=areaCode&query=613&workspace_id=w1",
        ),
      } as any),
    );
    expect(res.status).toBe(200);
    expect(mocks.requireWorkspaceAccess).toHaveBeenCalled();
    expect(mocks.createWorkspaceTwilioInstance).toHaveBeenCalledWith({
      supabase: {},
      workspace_id: "w1",
    });
    expect(twilioCtor).not.toHaveBeenCalled();
  });

  test("loader returns 500 and logs on Twilio error", async () => {
    listMock.mockRejectedValueOnce(new Error("boom"));
    const mod = await import("../app/routes/api+/numbers");
    const res = await asRouteResponse(
      await mod.loader({
        request: new Request(
          "http://localhost/api/numbers?searchMode=areaCode&query=416",
        ),
      } as any),
    );
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining("phone provider"),
    });
    expect(mocks.logger.error).toHaveBeenCalledWith(
      "Fetching numbers failed",
      expect.anything(),
    );
  });

  test("action returns 404 when no users found", async () => {
    const supabase = makeSupabaseStub({ credits: 2000 });
    mocks.createClient.mockReturnValueOnce(supabase);
    mocks.getWorkspaceUsers.mockResolvedValueOnce({ data: null, error: null });

    const fd = new FormData();
    fd.set("phoneNumber", "+1555");
    fd.set("workspace_id", "w1");
    const mod = await import("../app/routes/api+/numbers");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/numbers", {
        method: "POST",
        body: fd,
      }),
    } as any));

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      error: "No users found for workspace",
    });
  });

  test("action returns 400 creditsError when credits too low", async () => {
    const supabase = makeSupabaseStub({ credits: 1000 });
    mocks.createClient.mockReturnValueOnce(supabase);
    mocks.getWorkspaceUsers.mockResolvedValueOnce({
      data: [{ user_workspace_role: "owner", username: "alice" }],
      error: null,
    });

    const fd = new FormData();
    fd.set("phoneNumber", "+1555");
    fd.set("workspace_id", "w1");
    const mod = await import("../app/routes/api+/numbers");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/numbers", {
        method: "POST",
        body: fd,
      }),
    } as any));

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
    const mod = await import("../app/routes/api+/numbers");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/numbers", {
        method: "POST",
        body: fd,
      }),
    } as any));

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toMatchObject({
      newNumber: { id: 9, phone_number: "+1555" },
      messagingServiceAttached: true,
    });

    const workspaceNumberInsert = supabase.from.mock.results.find(
      (r) => r.value && r.value.insert,
    )?.value.insert as any;
    expect(workspaceNumberInsert).toBeTruthy();
    expect(mocks.updateWorkspaceMessagingOnboardingState).toHaveBeenCalled();
    expect(mocks.insertTransactionHistoryIdempotent).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "w1",
        type: "DEBIT",
        amount: -1000,
      }),
    );
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
    const mod = await import("../app/routes/api+/numbers");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/numbers", {
        method: "POST",
        body: fd,
      }),
    } as any));

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toMatchObject({ newNumber: { id: 10 } });
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
    const create = vi.fn().mockResolvedValueOnce({
      sid: "PN789",
      friendlyName: "FN3",
      phoneNumber: "+1999",
      capabilities: { voice: true, sms: true, mms: true },
    });
    mocks.attachPhoneNumberToMessagingService.mockResolvedValueOnce({});
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      incomingPhoneNumbers: { create },
    });

    const fd = new FormData();
    fd.set("phoneNumber", "+1999");
    fd.set("workspace_id", "w3");
    const mod = await import("../app/routes/api+/numbers");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/numbers", {
        method: "POST",
        body: fd,
      }),
    } as any));

    expect(res.status).toBe(201);
    expect(mocks.attachPhoneNumberToMessagingService).toHaveBeenCalledWith(
      expect.anything(),
      "MG123",
      "PN789",
      expect.objectContaining({ workspaceId: "w3" }),
    );
  });

  test("action returns 500 when getWorkspaceUsers returns error", async () => {
    const supabase = makeSupabaseStub({ credits: 2000 });
    mocks.createClient.mockReturnValueOnce(supabase);
    mocks.getWorkspaceUsers.mockResolvedValueOnce({
      data: null,
      error: new Error("users"),
    });

    const fd = new FormData();
    fd.set("phoneNumber", "+1777");
    fd.set("workspace_id", "w1");
    const mod = await import("../app/routes/api+/numbers");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/numbers", {
        method: "POST",
        body: fd,
      }),
    } as any));

    expect(res.status).toBe(500);
    expect(mocks.logger.error).toHaveBeenCalledWith(
      "Failed to register number",
      expect.anything(),
    );
  });

  test("action returns 500 when workspace credits query errors", async () => {
    const supabase = makeSupabaseStub({ creditsError: { message: "credits" } });
    mocks.createClient.mockReturnValueOnce(supabase);
    mocks.getWorkspaceUsers.mockResolvedValueOnce({
      data: [{ user_workspace_role: "owner", username: "alice" }],
      error: null,
    });

    const fd = new FormData();
    fd.set("phoneNumber", "+1888");
    fd.set("workspace_id", "w1");
    const mod = await import("../app/routes/api+/numbers");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/numbers", {
        method: "POST",
        body: fd,
      }),
    } as any));

    expect(res.status).toBe(500);
  });

  test("action returns 500 when Twilio create rejects (logs both error sites)", async () => {
    const supabase = makeSupabaseStub({ credits: 2000 });
    mocks.createClient.mockReturnValueOnce(supabase);
    mocks.getWorkspaceUsers.mockResolvedValueOnce({
      data: [{ user_workspace_role: "owner", username: "alice" }],
      error: null,
    });
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      incomingPhoneNumbers: {
        create: vi.fn().mockRejectedValueOnce(new Error("twilio")),
      },
    });

    const fd = new FormData();
    fd.set("phoneNumber", "+1999");
    fd.set("workspace_id", "w1");
    const mod = await import("../app/routes/api+/numbers");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/numbers", {
        method: "POST",
        body: fd,
      }),
    } as any));

    expect(res.status).toBe(500);
    expect(mocks.logger.error).toHaveBeenCalledWith(
      "Failed to register number",
      expect.anything(),
    );
  });

  test("action returns 500 when workspace_number insert errors", async () => {
    const supabase = makeSupabaseStub({
      workspaceNumberInsertError: { message: "insert" },
    });
    mocks.createClient.mockReturnValueOnce(supabase);
    mocks.getWorkspaceUsers.mockResolvedValueOnce({
      data: [{ user_workspace_role: "owner", username: "alice" }],
      error: null,
    });
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
    const mod = await import("../app/routes/api+/numbers");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/numbers", {
        method: "POST",
        body: fd,
      }),
    } as any));

    expect(res.status).toBe(500);
  });

  test("action returns 500 when idempotent transaction insert errors", async () => {
    const supabase = makeSupabaseStub({});
    mocks.createClient.mockReturnValueOnce(supabase);
    mocks.getWorkspaceUsers.mockResolvedValueOnce({
      data: [{ user_workspace_role: "owner", username: "alice" }],
      error: null,
    });
    mocks.insertTransactionHistoryIdempotent.mockRejectedValueOnce(
      new Error("tx"),
    );
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
    const mod = await import("../app/routes/api+/numbers");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/numbers", {
        method: "POST",
        body: fd,
      }),
    } as any));

    expect(res.status).toBe(500);
  });
});
