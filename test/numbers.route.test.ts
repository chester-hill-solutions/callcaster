import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";
import { queueDualAuthSession, queueJsonAuthSession, setDualAuthSession, setJsonAuthSession } from "./helpers/route-auth-mock";

const listMock = vi.fn();
const twilioCtor = vi.fn(function (this: any) {
  return {
    availablePhoneNumbers: () => ({ local: { list: listMock } }),
  };
});

const mocks = vi.hoisted(() => {
  return {
    purchaseWorkspaceNumber: vi.fn(),
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
vi.mock("@/lib/platform-workspace-numbers.server", () => ({
  purchaseWorkspaceNumber: (...args: unknown[]) =>
    mocks.purchaseWorkspaceNumber(...args),
}));
vi.mock("../app/lib/database.server", () => ({
  parseActionRequest: async (request: Request) =>
    Object.fromEntries((await request.formData()).entries()),
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
  createSupabaseServerClient: () => ({
    supabaseClient: {},
    headers: new Headers(),
  }),
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

    mocks.purchaseWorkspaceNumber.mockReset();
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
    setDualAuthSession({ supabaseClient: {}, user: { id: "u1" } });
    setJsonAuthSession({ supabaseClient: {}, user: { id: "u1" } });
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
    queueDualAuthSession({ supabaseClient: {}, user: { id: "u1" } });
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
    queueDualAuthSession({ supabaseClient: {}, user: { id: "u1" } });
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
    queueDualAuthSession({ supabaseClient: {}, user: { id: "u1" } });
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
    queueJsonAuthSession({ supabaseClient: {}, user: { id: "u1" } });
    mocks.purchaseWorkspaceNumber.mockResolvedValueOnce({
      ok: false,
      error: "No users found for workspace",
      status: 404,
    });

    const fd = new FormData();
    fd.set("phoneNumber", "+1555");
    fd.set("workspace_id", "00000000-0000-4000-8000-000000000001");
    const mod = await import("../app/routes/api+/numbers");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/numbers", {
        method: "POST",
        body: fd,
      }),
    } as any));

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({
      error: "No users found for workspace",
    });
  });

  test("action returns 400 creditsError when credits too low", async () => {
    queueJsonAuthSession({ supabaseClient: {}, user: { id: "u1" } });
    mocks.purchaseWorkspaceNumber.mockResolvedValueOnce({
      ok: false,
      error: "Insufficient credits for number rental",
      status: 400,
      creditsError: true,
    });

    const fd = new FormData();
    fd.set("phoneNumber", "+1555");
    fd.set("workspace_id", "00000000-0000-4000-8000-000000000001");
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
    queueJsonAuthSession({ supabaseClient: {}, user: { id: "u1" } });
    mocks.purchaseWorkspaceNumber.mockResolvedValueOnce({
      ok: true,
      number: { id: 9, phone_number: "+1555" },
      messagingServiceAttached: true,
      status: 201,
    });

    const fd = new FormData();
    fd.set("phoneNumber", "+1555");
    fd.set("workspace_id", "00000000-0000-4000-8000-000000000001");
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
  });

  test("action covers pending verification_status and inbound_action null", async () => {
    queueJsonAuthSession({ supabaseClient: {}, user: { id: "u1" } });
    mocks.purchaseWorkspaceNumber.mockResolvedValueOnce({
      ok: true,
      number: { id: 10 },
      messagingServiceAttached: true,
      status: 201,
    });

    const fd = new FormData();
    fd.set("phoneNumber", "+1666");
    fd.set("workspace_id", "00000000-0000-4000-8000-000000000002");
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
    queueJsonAuthSession({ supabaseClient: {}, user: { id: "u1" } });
    mocks.purchaseWorkspaceNumber.mockResolvedValueOnce({
      ok: true,
      number: { id: 11, phone_number: "+1999" },
      messagingServiceAttached: true,
      status: 201,
    });

    const fd = new FormData();
    fd.set("phoneNumber", "+1999");
    fd.set("workspace_id", "00000000-0000-4000-8000-000000000003");
    const mod = await import("../app/routes/api+/numbers");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/numbers", {
        method: "POST",
        body: fd,
      }),
    } as any));

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toMatchObject({
      newNumber: { id: 11, phone_number: "+1999" },
      messagingServiceAttached: true,
    });
  });

  test("action returns 500 when getWorkspaceUsers returns error", async () => {
    queueJsonAuthSession({ supabaseClient: {}, user: { id: "u1" } });
    mocks.purchaseWorkspaceNumber.mockResolvedValueOnce({
      ok: false,
      error: "users",
      status: 500,
    });

    const fd = new FormData();
    fd.set("phoneNumber", "+1777");
    fd.set("workspace_id", "00000000-0000-4000-8000-000000000001");
    const mod = await import("../app/routes/api+/numbers");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/numbers", {
        method: "POST",
        body: fd,
      }),
    } as any));

    expect(res.status).toBe(500);
    expect(mocks.logger.error).toHaveBeenCalledWith(
      "Error response:",
      expect.anything(),
      expect.any(Error),
    );
  });

  test("action returns 500 when workspace credits query errors", async () => {
    queueJsonAuthSession({ supabaseClient: {}, user: { id: "u1" } });
    mocks.purchaseWorkspaceNumber.mockResolvedValueOnce({
      ok: false,
      error: "credits",
      status: 500,
    });

    const fd = new FormData();
    fd.set("phoneNumber", "+1888");
    fd.set("workspace_id", "00000000-0000-4000-8000-000000000001");
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
    queueJsonAuthSession({ supabaseClient: {}, user: { id: "u1" } });
    mocks.purchaseWorkspaceNumber.mockResolvedValueOnce({
      ok: false,
      error: "twilio",
      status: 500,
    });

    const fd = new FormData();
    fd.set("phoneNumber", "+1999");
    fd.set("workspace_id", "00000000-0000-4000-8000-000000000001");
    const mod = await import("../app/routes/api+/numbers");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/numbers", {
        method: "POST",
        body: fd,
      }),
    } as any));

    expect(res.status).toBe(500);
    expect(mocks.logger.error).toHaveBeenCalledWith(
      "Error response:",
      expect.anything(),
      expect.any(Error),
    );
  });

  test("action returns 500 when workspace_number insert errors", async () => {
    queueJsonAuthSession({ supabaseClient: {}, user: { id: "u1" } });
    mocks.purchaseWorkspaceNumber.mockResolvedValueOnce({
      ok: false,
      error: "insert",
      status: 500,
    });

    const fd = new FormData();
    fd.set("phoneNumber", "+1");
    fd.set("workspace_id", "00000000-0000-4000-8000-000000000001");
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
    queueJsonAuthSession({ supabaseClient: {}, user: { id: "u1" } });
    mocks.purchaseWorkspaceNumber.mockResolvedValueOnce({
      ok: false,
      error: "tx",
      status: 500,
    });

    const fd = new FormData();
    fd.set("phoneNumber", "+1");
    fd.set("workspace_id", "00000000-0000-4000-8000-000000000001");
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
