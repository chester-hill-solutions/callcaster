import { beforeEach, describe, expect, test, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { asRouteResponse } from "./helpers/route-result";
import { withWorkspaceRouteArgs } from "./helpers/route-context-mock";
import { TEST_WORKSPACE_ID } from "./helpers/public-api-fixtures";

const state = vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
  return {
    rows: [] as {
      id: number;
      phone: string;
      firstname: string;
      opt_out: boolean;
      line_type: string | null;
    }[],
    lookupError: false,
    cacheReadError: false,
    send: vi.fn(),
    lookupFetch: vi.fn(),
  };
});
vi.mock("@/server/tenant-db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/tenant-db")>()),
  createTenantDb: () => ({
    contact: {
      findMany: async () => {
        if (state.lookupError) throw new Error("Database unavailable");
        return state.rows;
      },
      findFirst: async ({ where }: { where: SQL }) => {
        if (state.lookupError || state.cacheReadError)
          throw new Error("Database unavailable");
        const id = new PgDialect().sqlToQuery(where).params[0];
        return state.rows.find((row) => row.id === id) ?? null;
      },
      update: async () => [],
    },
    workspace_number: {
      findMany: async () => [{ phone_number: "+15550000000" }],
    },
  }),
}));
vi.mock("@/lib/inbound-sms-context.server", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/inbound-sms-context.server")
  >()),
  findMatchingContactIds: async () => {
    if (state.lookupError) throw new Error("Database unavailable");
    return state.rows.map((row) => row.id);
  },
}));
vi.mock("@/lib/api-auth.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-auth.server")>()),
  verifyApiKeyOrSession: async () => ({
    authType: "api_key",
    workspaceId: TEST_WORKSPACE_ID,
    apiKeyId: "key",
    capabilities: ["messages.send"],
  }),
}));
vi.mock("@/lib/api-write-rate-limit.server", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/api-write-rate-limit.server")
  >()),
  apiWriteRateLimitResponse: async () => null,
}));
vi.mock("@/lib/capability-guard.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/capability-guard.server")>()),
  requireDualAuthCapability: async () => ({ type: "ok" }),
}));
vi.mock("@/lib/database/workspace.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/database/workspace.server")>()),
  getWorkspaceTwilioPortalConfig: async () => ({}),
  getEffectiveWorkspaceTwilioPortalConfigForWorkspace: async () => ({
    sendMode: "from_number",
    messagingServiceSid: null,
  }),
}));
vi.mock("@/lib/outbound-credit-gate.server", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/outbound-credit-gate.server")
  >()),
  requireOutboundCredits: async () => ({ ok: true, balance: 100 }),
}));
vi.mock("@/lib/chat-sms.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/chat-sms.server")>()),
  sendMessage: (...args: unknown[]) => state.send(...args),
}));
vi.mock("@/lib/env.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env.server")>();
  return {
    ...actual,
    env: { ...actual.env, TWILIO_LOOKUP_ENABLED: () => "true" },
  };
});
vi.mock("@/twilio.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/twilio.server")>()),
  twilio: {
    lookups: {
      v2: {
        phoneNumbers: () => ({
          fetch: (...args: unknown[]) => state.lookupFetch(...args),
        }),
      },
    },
  },
}));
vi.mock("@/lib/sms-campaign-db.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/sms-campaign-db.server")>()),
  loadCampaignSmsDispatchData: async () => ({
    body_text: "Hi {{firstname}}",
    message_media: [],
    campaign: {
      caller_id: "+15550000000",
      sms_send_mode: "from_number",
      sms_messaging_service_sid: null,
    },
  }),
}));

const to = "+15551234567";
const recipient = (overrides = {}) => ({
  id: 9,
  phone: to,
  firstname: "Ada",
  opt_out: false,
  line_type: "mobile",
  ...overrides,
});
type Surface = "api" | "form" | "campaign";
async function send(surface: Surface, contactId?: string) {
  if (surface === "campaign") {
    const { sendCampaignTestSms } =
      await import("@/lib/campaign-test-send.server");
    return sendCampaignTestSms({
      workspaceId: TEST_WORKSPACE_ID,
      campaignId: 1,
      userId: "u1",
      to,
    });
  }
  const fields = {
    workspace_id: TEST_WORKSPACE_ID,
    to_number: to,
    caller_id: "+15550000000",
    from: "+15550000000",
    body: "Hi {{firstname}}",
    ...(contactId === undefined ? {} : { contact_id: contactId }),
  };
  if (surface === "api") {
    const { action } = await import("@/routes/api+/chat_sms.action.server");
    const response = await asRouteResponse(
      action({
        request: new Request("http://x/api/chat_sms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(fields),
        }),
        params: {},
        context: await import("react-router").then(
          ({ RouterContextProvider }) => new RouterContextProvider(),
        ),
      }),
    );
    return { status: response.status, body: await response.json() };
  }
  const { action } =
    await import("@/routes/workspaces+/$id/chats.action.server");
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  const response = await asRouteResponse(
    action(
      await withWorkspaceRouteArgs({
        request: new Request("http://x/chats", { method: "POST", body: form }),
        params: { id: TEST_WORKSPACE_ID, contact_number: to },
      }),
    ),
  );
  return { status: response.status, body: await response.json() };
}

beforeEach(() => {
  state.rows = [];
  state.lookupError = false;
  state.cacheReadError = false;
  state.send
    .mockReset()
    .mockResolvedValue({ message: { sid: "SM1" }, data: [] });
  state.lookupFetch
    .mockReset()
    .mockResolvedValue({ lineTypeIntelligence: { type: "mobile" } });
});

describe.each(["api", "form"] as const)("%s recipient identity", (surface) => {
  test.each(["10", "999", "101", "foreign-id", "NaN", "0", "-9", "9.5"])(
    "rejects supplied ID %s before sending to an opted-out destination",
    async (id) => {
      state.rows = [
        recipient({ opt_out: true }),
        recipient({ id: 10, phone: "+15557654321", firstname: "Other" }),
      ];
      const result = await send(surface, id);
      expect(result).toMatchObject({
        status: 400,
        body: { recipientVerificationError: true },
      });
      expect(state.send).not.toHaveBeenCalled();
    },
  );
  test.each([undefined, "9"])(
    "blocks ambiguous contacts with ID %s",
    async (id) => {
      state.rows = [recipient(), recipient({ id: 10, opt_out: true })];
      expect(await send(surface, id)).toMatchObject({
        status: 400,
        body: { recipientVerificationError: true },
      });
      expect(state.send).not.toHaveBeenCalled();
    },
  );
  test("rejects a mismatched ID before sending to a landline", async () => {
    state.rows = [
      recipient({ line_type: "landline" }),
      recipient({ id: 10, phone: "+15557654321" }),
    ];
    expect(await send(surface, "10")).toMatchObject({
      status: 400,
      body: { recipientVerificationError: true },
    });
    expect(state.send).not.toHaveBeenCalled();
  });
  test.each([undefined, "9"])(
    "blocks failed recipient verification with ID %s",
    async (id) => {
      state.lookupError = true;
      expect(await send(surface, id)).toMatchObject({
        status: 400,
        body: { recipientVerificationError: true },
      });
      expect(state.send).not.toHaveBeenCalled();
    },
  );
  test.each([undefined, "9"])(
    "uses the single normalized recipient for tags and attribution with ID %s",
    async (id) => {
      state.rows = [recipient({ phone: "(555) 123-4567" })];
      expect(await send(surface, id)).toMatchObject({
        status: surface === "api" ? 201 : 200,
      });
      expect(state.send).toHaveBeenCalledWith(
        expect.objectContaining({ body: "Hi Ada", contact_id: "9", to }),
      );
    },
  );
  test("keeps a real opt-out separate from verification failure", async () => {
    state.rows = [recipient({ opt_out: true })];
    expect(await send(surface, "9")).toMatchObject({
      status: 403,
      body: { optedOut: true },
    });
    expect(state.send).not.toHaveBeenCalled();
  });
  test("keeps a known landline separate from verification failure", async () => {
    state.rows = [recipient({ line_type: "landline" })];
    expect(await send(surface, "9")).toMatchObject({
      status: 400,
      body: { landline: true },
    });
    expect(state.send).not.toHaveBeenCalled();
  });
  test("allows a new number after a successful lookup", async () => {
    expect(await send(surface)).toMatchObject({
      status: surface === "api" ? 201 : 200,
    });
    expect(state.send).toHaveBeenCalledWith(
      expect.objectContaining({ contact_id: "", to }),
    );
  });
  test("rejects a different contact ID even when the destination is eligible", async () => {
    state.rows = [recipient(), recipient({ id: 10, phone: "+15557654321" })];
    expect(await send(surface, "10")).toMatchObject({
      status: 400,
      body: { recipientVerificationError: true },
    });
    expect(state.send).not.toHaveBeenCalled();
  });
  test("blocks an actual provider lookup failure", async () => {
    state.rows = [recipient({ line_type: null })];
    state.lookupFetch.mockRejectedValue(new Error("Lookup unavailable"));
    expect(await send(surface, "9")).toMatchObject({
      status: 400,
      body: { recipientVerificationError: true },
    });
    expect(state.send).not.toHaveBeenCalled();
  });
  test("blocks an actual line-type cache read failure", async () => {
    state.rows = [recipient({ line_type: null })];
    state.cacheReadError = true;
    expect(await send(surface, "9")).toMatchObject({
      status: 400,
      body: { recipientVerificationError: true },
    });
    expect(state.lookupFetch).not.toHaveBeenCalled();
    expect(state.send).not.toHaveBeenCalled();
  });
  test("permits a verified mobile provider lookup", async () => {
    state.rows = [recipient({ line_type: null })];
    expect(await send(surface, "9")).toMatchObject({
      status: surface === "api" ? 201 : 200,
    });
    expect(state.lookupFetch).toHaveBeenCalledOnce();
    expect(state.send).toHaveBeenCalledWith(
      expect.objectContaining({ contact_id: "9", body: "Hi Ada" }),
    );
  });
  test("rejects a prefix contact ID", async () => {
    state.rows = [recipient({ phone: "+155512345670" })];
    expect(await send(surface, "9")).toMatchObject({
      status: 400,
      body: { recipientVerificationError: true },
    });
    expect(state.send).not.toHaveBeenCalled();
  });
  test("does not use prefix contact data for a new number", async () => {
    state.rows = [
      recipient({ phone: "+155512345670", firstname: "Wrong", opt_out: true }),
    ];
    expect(await send(surface)).toMatchObject({
      status: surface === "api" ? 201 : 200,
    });
    expect(state.send).toHaveBeenCalledWith(
      expect.objectContaining({ body: "Hi {{firstname}}", contact_id: "", to }),
    );
  });
});

describe("campaign test recipient identity", () => {
  test.each(["ambiguous", "lookup failure"])(
    "blocks %s before provider calls",
    async (kind) => {
      state.rows = [recipient(), recipient({ id: 10 })];
      state.lookupError = kind === "lookup failure";
      expect(await send("campaign")).toMatchObject({
        ok: false,
        reason: "recipient_unverified",
      });
      expect(state.send).not.toHaveBeenCalled();
    },
  );
  test("blocks an opted-out contact", async () => {
    state.rows = [recipient({ opt_out: true })];
    expect(await send("campaign")).toMatchObject({
      ok: false,
      reason: "opted_out",
    });
    expect(state.send).not.toHaveBeenCalled();
  });
  test("uses the verified contact without changing the test-send line-type policy", async () => {
    state.rows = [recipient({ phone: "555-123-4567", line_type: "landline" })];
    expect(await send("campaign")).toMatchObject({
      ok: true,
      body: "Hi Ada",
      usedSampleContact: false,
    });
    expect(state.send).toHaveBeenCalledWith(
      expect.objectContaining({ contact_id: "9", body: "Hi Ada" }),
    );
  });
  test("uses sample data for a prefix match", async () => {
    state.rows = [
      recipient({ phone: "+155512345670", firstname: "Wrong", opt_out: true }),
    ];
    expect(await send("campaign")).toMatchObject({
      ok: true,
      body: "Hi Jordan",
      usedSampleContact: true,
    });
    expect(state.send).toHaveBeenCalledWith(
      expect.objectContaining({ contact_id: "" }),
    );
  });
});
