import { beforeEach, describe, expect, test, vi } from "vitest";
import { asRouteResponse } from "./helpers/route-result";
import { TEST_WORKSPACE_ID } from "./helpers/public-api-fixtures";

const mocks = vi.hoisted(() => ({
  verifyApiKeyOrSession: vi.fn(),
  parseJsonBodyOrResponse: vi.fn(),
  getWorkspaceTwilioPortalConfig: vi.fn(),
  requireWorkspaceAccess: vi.fn(),
  getWorkspaceCreditsBalance: vi.fn(async () => 100),
  sendMessage: vi.fn(),
  findMatchingContactIds: vi.fn(async () => [] as number[]),
  getOrLookupLineType: vi.fn(async () => null as string | null),
  logger: { error: vi.fn() },
}));

const tenantDbMocks = vi.hoisted(() => ({
  contact: { findFirst: vi.fn(async () => null) },
}));

vi.mock("@/lib/api-auth.server", () => ({
  verifyApiKeyOrSession: (...args: unknown[]) => mocks.verifyApiKeyOrSession(...args),
}));
vi.mock("@/lib/api-parse.server", () => ({
  parseJsonBodyOrResponse: (...args: unknown[]) => mocks.parseJsonBodyOrResponse(...args),
}));
vi.mock("@/lib/database/workspace.server", () => ({
  getWorkspaceTwilioPortalConfig: (...args: unknown[]) =>
    mocks.getWorkspaceTwilioPortalConfig(...args),
  requireWorkspaceAccess: (...args: unknown[]) =>
    mocks.requireWorkspaceAccess(...args),
}));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));
vi.mock("@/lib/chat-sms.server", () => ({
  sendMessage: (...args: unknown[]) => mocks.sendMessage(...args),
}));
vi.mock("@/lib/inbound-sms-context.server", () => ({
  findMatchingContactIds: (...args: unknown[]) => mocks.findMatchingContactIds(...args),
}));
vi.mock("@/lib/twilio-lookup.server", () => ({
  getOrLookupLineType: (...args: unknown[]) => mocks.getOrLookupLineType(...args),
  isSmsIncapableLineType: (lineType: string | null | undefined) =>
    lineType === "landline" || lineType === "fax",
}));
vi.mock("@/server/tenant-db", () => ({
  createTenantDb: vi.fn(() => tenantDbMocks),
}));
vi.mock("@/lib/workspace-credits.server", () => ({
  getWorkspaceCreditsBalance: (...args: unknown[]) => mocks.getWorkspaceCreditsBalance(...args),
}));

function baseBody(overrides: Record<string, unknown> = {}) {
  return {
    to_number: "+15551234567",
    workspace_id: TEST_WORKSPACE_ID,
    contact_id: "",
    caller_id: "+15550000000",
    body: "hi",
    media: "[]",
    ...overrides,
  };
}

describe("app/routes/api+/chat_sms.action.server.ts opt-out gate", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.verifyApiKeyOrSession.mockReset();
    mocks.verifyApiKeyOrSession.mockResolvedValue({
      authType: "session",
      user: { id: "u1" },
    });
    mocks.parseJsonBodyOrResponse.mockReset();
    mocks.getWorkspaceTwilioPortalConfig.mockReset();
    mocks.getWorkspaceTwilioPortalConfig.mockResolvedValue({});
    mocks.requireWorkspaceAccess.mockReset();
    mocks.requireWorkspaceAccess.mockResolvedValue(undefined);
    mocks.getWorkspaceCreditsBalance.mockReset();
    mocks.getWorkspaceCreditsBalance.mockResolvedValue(100);
    mocks.sendMessage.mockReset();
    mocks.sendMessage.mockResolvedValue({ message: { sid: "SM1" }, data: [] });
    mocks.findMatchingContactIds.mockReset();
    mocks.findMatchingContactIds.mockResolvedValue([]);
    mocks.getOrLookupLineType.mockReset();
    mocks.getOrLookupLineType.mockResolvedValue(null);
    mocks.logger.error.mockReset();
    tenantDbMocks.contact.findFirst.mockReset();
    tenantDbMocks.contact.findFirst.mockResolvedValue(null);
  });

  test("rejects with 403 when contact_id resolves to an opted-out contact", async () => {
    tenantDbMocks.contact.findFirst.mockResolvedValueOnce({ id: 9, opt_out: true });
    mocks.parseJsonBodyOrResponse.mockResolvedValueOnce(baseBody({ contact_id: "9" }));

    const mod = await import("../app/routes/api+/chat_sms.action.server");
    const res = await asRouteResponse(mod.action({ request: new Request("http://x", { method: "POST" }) } as any),
    );

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({
      error: "This contact has opted out of messages.",
      optedOut: true,
    });
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  test("falls back to a phone lookup and rejects when exactly one match is opted out", async () => {
    mocks.findMatchingContactIds.mockResolvedValueOnce([9]);
    tenantDbMocks.contact.findFirst.mockResolvedValueOnce({ id: 9, opt_out: true });
    mocks.parseJsonBodyOrResponse.mockResolvedValueOnce(baseBody());

    const mod = await import("../app/routes/api+/chat_sms.action.server");
    const res = await asRouteResponse(mod.action({ request: new Request("http://x", { method: "POST" }) } as any),
    );

    expect(res.status).toBe(403);
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  test("sends normally when the phone lookup is ambiguous (skips the opt-out gate)", async () => {
    mocks.findMatchingContactIds.mockResolvedValueOnce([9, 10]);
    mocks.parseJsonBodyOrResponse.mockResolvedValueOnce(baseBody());

    const mod = await import("../app/routes/api+/chat_sms.action.server");
    const res = await asRouteResponse(mod.action({ request: new Request("http://x", { method: "POST" }) } as any),
    );

    expect(res.status).toBe(201);
    expect(tenantDbMocks.contact.findFirst).not.toHaveBeenCalled();
    expect(mocks.sendMessage).toHaveBeenCalled();
  });

  test("fails open (still sends) when the opt-out lookup throws", async () => {
    mocks.findMatchingContactIds.mockRejectedValueOnce(new Error("db down"));
    mocks.parseJsonBodyOrResponse.mockResolvedValueOnce(baseBody());

    const mod = await import("../app/routes/api+/chat_sms.action.server");
    const res = await asRouteResponse(mod.action({ request: new Request("http://x", { method: "POST" }) } as any),
    );

    expect(res.status).toBe(201);
    expect(mocks.logger.error).toHaveBeenCalledWith(
      "Error checking contact opt-out status for chat_sms:",
      expect.any(Error),
    );
    expect(mocks.sendMessage).toHaveBeenCalled();
  });

  test("rejects with 400 when the resolved contact is a landline", async () => {
    mocks.getOrLookupLineType.mockResolvedValueOnce("landline");
    mocks.parseJsonBodyOrResponse.mockResolvedValueOnce(baseBody({ contact_id: "9" }));

    const mod = await import("../app/routes/api+/chat_sms.action.server");
    const res = await asRouteResponse(mod.action({ request: new Request("http://x", { method: "POST" }) } as any),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "This number is a landline and can't receive SMS.",
      landline: true,
    });
    expect(mocks.sendMessage).not.toHaveBeenCalled();
    expect(mocks.getOrLookupLineType).toHaveBeenCalledWith(
      expect.objectContaining({ contactId: 9, phone: "+15551234567" }),
    );
  });

  test.each(["mobile", "voip", null])(
    "sends normally when the resolved contact's line type is %s (only landline blocks)",
    async (lineType) => {
      mocks.getOrLookupLineType.mockResolvedValueOnce(lineType);
      mocks.parseJsonBodyOrResponse.mockResolvedValueOnce(baseBody({ contact_id: "9" }));

      const mod = await import("../app/routes/api+/chat_sms.action.server");
      const res = await asRouteResponse(mod.action({ request: new Request("http://x", { method: "POST" }) } as any),
      );

      expect(res.status).toBe(201);
      expect(mocks.sendMessage).toHaveBeenCalled();
    },
  );

  test("skips the landline lookup entirely when the phone match is ambiguous", async () => {
    mocks.findMatchingContactIds.mockResolvedValue([9, 10]);
    mocks.parseJsonBodyOrResponse.mockResolvedValueOnce(baseBody());

    const mod = await import("../app/routes/api+/chat_sms.action.server");
    const res = await asRouteResponse(mod.action({ request: new Request("http://x", { method: "POST" }) } as any),
    );

    expect(res.status).toBe(201);
    expect(mocks.getOrLookupLineType).not.toHaveBeenCalled();
    expect(mocks.sendMessage).toHaveBeenCalled();
  });

  test("fails open (still sends) when the landline lookup throws", async () => {
    mocks.getOrLookupLineType.mockRejectedValueOnce(new Error("lookup down"));
    mocks.parseJsonBodyOrResponse.mockResolvedValueOnce(baseBody({ contact_id: "9" }));

    const mod = await import("../app/routes/api+/chat_sms.action.server");
    const res = await asRouteResponse(mod.action({ request: new Request("http://x", { method: "POST" }) } as any),
    );

    expect(res.status).toBe(201);
    expect(mocks.logger.error).toHaveBeenCalledWith(
      "Error checking contact line type for chat_sms:",
      expect.any(Error),
    );
    expect(mocks.sendMessage).toHaveBeenCalled();
  });

  test("passes send_at through to sendMessage", async () => {
    mocks.parseJsonBodyOrResponse.mockResolvedValueOnce(
      baseBody({ send_at: "2026-08-01T12:00:00.000Z" }),
    );

    const mod = await import("../app/routes/api+/chat_sms.action.server");
    const res = await asRouteResponse(mod.action({ request: new Request("http://x", { method: "POST" }) } as any),
    );

    expect(res.status).toBe(201);
    expect(mocks.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ sendAt: "2026-08-01T12:00:00.000Z" }),
    );
  });
});
