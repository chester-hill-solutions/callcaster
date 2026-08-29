import { beforeEach, describe, expect, test, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? "postgres://test:test@localhost:5432/test";
});

vi.mock("@/server/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

import { asRouteResponse } from "./helpers/route-result";

const mocks = vi.hoisted(() => {
  return {
    createClient: vi.fn(),
    requireTwilioSignature: vi.fn(),
    sendWebhookNotification: vi.fn(),
    logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
    env: {
      BETTER_AUTH_URL: () => "https://sb.example",
      BETTER_AUTH_SERVICE_KEY: () => "svc",
      TWILIO_AUTH_TOKEN: () => "tok",
      TWILIO_SID: () => "AC_MAIN",
    },
    fetch: vi.fn(),
  };
});

vi.mock("@client/client-js", () => ({ createClient: (...a: any[]) => mocks.createClient(...a) }));
vi.mock("@/lib/twilio-webhook.server", () => ({
  requireTwilioSignature: (...a: any[]) => mocks.requireTwilioSignature(...a),
}));
vi.mock("@/lib/workspace-settings/WorkspaceSettingUtils.server", () => ({
  sendWebhookNotification: (...a: any[]) => mocks.sendWebhookNotification(...a),
}));
vi.mock("@/lib/env.server", () => ({ env: mocks.env }));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));
vi.mock("@/lib/object-storage.server", () => ({
  uploadObject: vi.fn(async () => undefined),
}));
vi.mock("@/lib/workspace-events.server", () => ({
  emitChatMessageEvent: vi.fn(async () => undefined),
}));

const queueDbMocks = vi.hoisted(() => ({
  dequeueQueueEntry: vi.fn(),
}));

vi.mock("@/lib/campaign-queue-db.server", () => ({
  dequeueQueueEntry: (...args: unknown[]) => queueDbMocks.dequeueQueueEntry(...args),
}));

const onboardingMocks = vi.hoisted(() => ({
  getWorkspaceMessagingOnboardingState: vi.fn(),
}));

vi.mock("@/lib/messaging-onboarding.server", () => ({
  getWorkspaceMessagingOnboardingState: (...args: unknown[]) =>
    onboardingMocks.getWorkspaceMessagingOnboardingState(...args),
}));

// #1394 rate-limit guard: default allow. Individual tests override to
// exercise the drop path. Real query logic is covered by the module's own
// unit tests in test/inbound-sms-rate-limit.server.test.ts.
const rateLimitMocks = vi.hoisted(() => ({
  inboundSmsRateVerdict: vi.fn(async () => ({ allowed: true }) as const),
}));
vi.mock("@/lib/inbound-sms-rate-limit.server", () => ({
  inboundSmsRateVerdict: (...args: unknown[]) =>
    rateLimitMocks.inboundSmsRateVerdict(...args),
}));

const inboundContextMocks = vi.hoisted(() => ({
  contacts: [] as Array<{ id: number }>,
  contactError: null as Error | null,
  resolveInboundWorkspaceContext: vi.fn(),
}));

vi.mock("@/lib/inbound-sms-context.server", () => ({
  parseTrimmedString: (value: unknown) => (typeof value === "string" ? value.trim() : ""),
  resolveInboundWorkspaceContext: (...args: unknown[]) =>
    inboundContextMocks.resolveInboundWorkspaceContext(...args),
  findMatchingContactIds: vi.fn(async () => {
    if (inboundContextMocks.contactError) {
      mocks.logger.error("Contact lookup error:", inboundContextMocks.contactError);
      return [];
    }
    return Array.from(
      new Set(
        inboundContextMocks.contacts
          .map((contact) => contact?.id)
          .filter((id): id is number => typeof id === "number"),
      ),
    );
  }),
}));

vi.mock("@/lib/database/contact.server", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/database/contact.server")>();
  return {
    ...actual,
    findPotentialContacts: vi.fn(async () => ({
      data: inboundContextMocks.contacts,
      error: inboundContextMocks.contactError,
    })),
  };
});

import { configureTenantDbStub, createTenantDbMock, tenantDbStubState } from "./helpers/tenant-db-stub";

vi.mock("@/server/tenant-db", () => ({
  createTenantDb: () => createTenantDbMock(),
}));

function configureInboundWorkspaceContext(opts?: {
  number?: any;
  workspaceNumberError?: any;
  workspaceMsMatches?: any[];
  workspaceMsError?: any;
}) {
  if (opts?.workspaceNumberError) {
    inboundContextMocks.resolveInboundWorkspaceContext.mockResolvedValue({
      ok: false,
      response: Response.json({ error: "Number lookup failed" }, { status: 500 }),
    });
    return;
  }

  if (opts?.number) {
    inboundContextMocks.resolveInboundWorkspaceContext.mockResolvedValue({
      ok: true,
      ctx: {
        workspace: opts.number.workspace,
        twilio_data: opts.number.twilio_data,
        webhook: opts.number.webhook ?? [],
      },
      attributionPath: "matched_by_to_number",
    });
    return;
  }

  if (opts?.workspaceMsError) {
    inboundContextMocks.resolveInboundWorkspaceContext.mockResolvedValue({
      ok: false,
      response: Response.json({ error: "Messaging service lookup failed" }, { status: 500 }),
    });
    return;
  }

  const matches = opts?.workspaceMsMatches ?? [];
  if (matches.length === 1) {
    inboundContextMocks.resolveInboundWorkspaceContext.mockResolvedValue({
      ok: true,
      ctx: {
        workspace: matches[0].id,
        twilio_data: matches[0].twilio_data,
        webhook: matches[0].webhook ?? [],
      },
      attributionPath: "matched_by_messaging_service_sid",
    });
    return;
  }

  if (matches.length > 1) {
    inboundContextMocks.resolveInboundWorkspaceContext.mockResolvedValue({
      ok: false,
      response: Response.json(
        { error: "Messaging service matches multiple workspaces" },
        { status: 409 },
      ),
    });
    return;
  }

  inboundContextMocks.resolveInboundWorkspaceContext.mockResolvedValue({
    ok: false,
    response: Response.json({ error: "Number not found" }, { status: 404 }),
  });
}

function makeDbClient(opts?: {
  number?: any;
  workspaceNumberError?: any;
  workspaceMsMatches?: any[];
  workspaceMsError?: any;
  messageError?: any;
  contactError?: any;
  contacts?: any[];
  uploadError?: any;
  mediaOk?: boolean;
  smsWebhook?: boolean;
  insertedMessages?: Record<string, unknown>[];
}) {
  inboundContextMocks.contacts = (opts?.contacts ?? []) as Array<{ id: number }>;
  inboundContextMocks.contactError = opts?.contactError ?? null;
  configureInboundWorkspaceContext(opts);

  const client: any = {
    rpc: async () => ({
      data: [],
      error: { message: "stub rpc for tests", code: "stub" },
    }),
    storage: {
      from: () => ({
        upload: async (_name: string, _b: any, _opts: any) => ({
          data: opts?.uploadError ? null : { path: "m1" },
          error: opts?.uploadError ?? null,
        }),
      }),
    },
    from: (table: string) => {
      if (table === "contact") {
        const contactQuery: any = {
          select: () => contactQuery,
          eq: () => contactQuery,
          or: () => contactQuery,
          in: () => contactQuery,
          not: () => contactQuery,
          neq: async () => ({
            data: opts?.contacts ?? [],
            error: opts?.contactError ?? null,
          }),
          update: () => ({
            in: async () => ({ data: [], error: null }),
          }),
        };
        return {
          select: () => contactQuery,
          update: contactQuery.update,
        };
      }
      if (table === "message") {
        return {
          insert: (payload: Record<string, unknown>) => ({
            select: async () => ({
              data: (opts?.insertedMessages?.push(payload), [{ sid: "SM1" }]),
              error: opts?.messageError ?? null,
            }),
          }),
        };
      }
      throw new Error("unexpected table");
    },
  };
  return client;
}

function makeParams(overrides?: Partial<Record<string, unknown>>) {
  return {
    To: "+1555",
    From: "+1666",
    MessageSid: "SM1",
    AccountSid: "AC1",
    Body: "hello",
    Status: "received",
    NumMedia: "1",
    NumSegments: "1",
    MediaUrl0: "https://m/0",
    MediaContentType0: "image/png",
    ...overrides,
  };
}

function makeInboundSmsRequest(overrides?: Partial<Record<string, unknown>>) {
  const body = new FormData();
  for (const [key, value] of Object.entries(makeParams(overrides))) {
    body.append(key, String(value));
  }
  return new Request("http://x/inbound-sms", {
    method: "POST",
    headers: { "x-twilio-signature": "test-sig" },
    body,
  });
}

describe("app/routes/api+/inbound-sms", () => {
  beforeEach(() => {
    configureTenantDbStub();
    inboundContextMocks.contacts = [];
    inboundContextMocks.contactError = null;
    inboundContextMocks.resolveInboundWorkspaceContext.mockReset();
    mocks.createClient.mockReset();
    mocks.requireTwilioSignature.mockReset();
    mocks.requireTwilioSignature.mockResolvedValue(null);
    mocks.sendWebhookNotification.mockReset();
    mocks.logger.error.mockReset();
    mocks.logger.info.mockReset();
    mocks.logger.warn.mockReset();
    mocks.fetch.mockReset();
    queueDbMocks.dequeueQueueEntry.mockReset();
    queueDbMocks.dequeueQueueEntry.mockResolvedValue(undefined);
    rateLimitMocks.inboundSmsRateVerdict.mockReset();
    rateLimitMocks.inboundSmsRateVerdict.mockResolvedValue({ allowed: true });
    vi.stubGlobal("fetch", mocks.fetch);
    onboardingMocks.getWorkspaceMessagingOnboardingState.mockReset();
    onboardingMocks.getWorkspaceMessagingOnboardingState.mockResolvedValue({
      businessProfile: { optOutKeywords: "" },
    });
  });

  describe("inbound-SMS rate limit (#1394)", () => {
    test("drops the message with 200 when the rate-limit guard says the from-number is over the burst cap", async () => {
      rateLimitMocks.inboundSmsRateVerdict.mockResolvedValueOnce({
        allowed: false,
        window: "burst",
        count: 25,
        limit: 20,
      });
      const number = { workspace: "w1", twilio_data: { sid: "sid", authToken: "tok" }, webhook: [{ events: [{ category: "inbound_sms" }] }] };
      mocks.createClient.mockReturnValueOnce(makeDbClient({ number, contacts: [{ id: 9 }] }));

      const mod = await import("../app/routes/api+/inbound-sms");
      const res = await asRouteResponse(mod.action({
        request: makeInboundSmsRequest({ Body: "hello", NumMedia: "0" }),
      } as any));

      // 200 (NOT 5xx): Twilio would retry a 5xx and re-run the attack.
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toMatchObject({
        dropped: true,
        reason: "rate_limited",
        window: "burst",
      });
      // Not a single billable side effect must have fired.
      expect(tenantDbStubState.messageInsertCalls).toEqual([]);
      expect(mocks.sendWebhookNotification).not.toHaveBeenCalled();
      expect(tenantDbStubState.contactUpdateCalls).toEqual([]);
      expect(queueDbMocks.dequeueQueueEntry).not.toHaveBeenCalled();
      // The refusal is logged with the tripped-window shape for observability.
      expect(mocks.logger.warn).toHaveBeenCalledWith(
        "inbound_sms.rate_limited",
        expect.objectContaining({
          workspace: "w1",
          from: "+1666",
          window: "burst",
          count: 25,
          limit: 20,
        }),
      );
    });

    test("hour-window trip is reported through the same drop path", async () => {
      rateLimitMocks.inboundSmsRateVerdict.mockResolvedValueOnce({
        allowed: false,
        window: "hour",
        count: 101,
        limit: 100,
      });
      const number = { workspace: "w1", twilio_data: { sid: "sid", authToken: "tok" }, webhook: [] };
      mocks.createClient.mockReturnValueOnce(makeDbClient({ number, contacts: [] }));

      const mod = await import("../app/routes/api+/inbound-sms");
      const res = await asRouteResponse(mod.action({
        request: makeInboundSmsRequest({ Body: "hello", NumMedia: "0" }),
      } as any));

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toMatchObject({
        dropped: true,
        reason: "rate_limited",
        window: "hour",
      });
      expect(tenantDbStubState.messageInsertCalls).toEqual([]);
    });

    test("allowed verdict lets the message through to the normal insert path", async () => {
      // Sanity check: the guard is called and the pass-through still records
      // the row. Prevents an accidental default of allowed→false regressing
      // every workspace's inbound path.
      const number = { workspace: "w1", twilio_data: { sid: "sid", authToken: "tok" }, webhook: [] };
      mocks.createClient.mockReturnValueOnce(makeDbClient({ number, contacts: [] }));

      const mod = await import("../app/routes/api+/inbound-sms");
      const res = await asRouteResponse(mod.action({
        request: makeInboundSmsRequest({ Body: "hello", NumMedia: "0" }),
      } as any));

      expect(res.status).toBe(201);
      expect(rateLimitMocks.inboundSmsRateVerdict).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ workspaceId: "w1", fromNumber: "+1666" }),
      );
      expect(tenantDbStubState.messageInsertCalls.length).toBe(1);
    });
  });

  describe("workspace-configurable opt-out keywords", () => {
    test("marks contact opted out on a custom configured keyword", async () => {
      onboardingMocks.getWorkspaceMessagingOnboardingState.mockResolvedValueOnce({
        businessProfile: { optOutKeywords: "QUIT, LEAVE ME ALONE" },
      });
      const number = { workspace: "w1", twilio_data: { sid: "sid", authToken: "tok" }, webhook: [] };
      mocks.createClient.mockReturnValueOnce(
        makeDbClient({ number, contacts: [{ id: 9 }], mediaOk: true }),
      );
      const mod = await import("../app/routes/api+/inbound-sms");
      const res = await asRouteResponse(mod.action({
          request: makeInboundSmsRequest({ Body: "quit", NumMedia: "0" }),
        } as any),
      );
      expect(res.status).toBe(201);
      expect(tenantDbStubState.contactUpdateCalls).toContainEqual(
        expect.objectContaining({ set: { opt_out: true } }),
      );
    });

    test("does not opt out on default STOP keyword when a custom keyword list doesn't include it", async () => {
      onboardingMocks.getWorkspaceMessagingOnboardingState.mockResolvedValueOnce({
        businessProfile: { optOutKeywords: "QUIT" },
      });
      const number = { workspace: "w1", twilio_data: { sid: "sid", authToken: "tok" }, webhook: [] };
      mocks.createClient.mockReturnValueOnce(
        makeDbClient({ number, contacts: [{ id: 9 }], mediaOk: true }),
      );
      const mod = await import("../app/routes/api+/inbound-sms");
      const res = await asRouteResponse(mod.action({
          request: makeInboundSmsRequest({ Body: "stop", NumMedia: "0" }),
        } as any),
      );
      expect(res.status).toBe(201);
      expect(tenantDbStubState.contactUpdateCalls).toHaveLength(0);
    });

    test("falls back to default STOP/UNSUBSCRIBE keywords when onboarding lookup fails", async () => {
      onboardingMocks.getWorkspaceMessagingOnboardingState.mockRejectedValueOnce(
        new Error("onboarding unavailable"),
      );
      const number = { workspace: "w1", twilio_data: { sid: "sid", authToken: "tok" }, webhook: [] };
      mocks.createClient.mockReturnValueOnce(
        makeDbClient({ number, contacts: [{ id: 9 }], mediaOk: true }),
      );
      const mod = await import("../app/routes/api+/inbound-sms");
      const res = await asRouteResponse(mod.action({
          request: makeInboundSmsRequest({ Body: "stop", NumMedia: "0" }),
        } as any),
      );
      expect(res.status).toBe(201);
      expect(mocks.logger.error).toHaveBeenCalledWith(
        "Error loading workspace opt-out keywords for inbound SMS:",
        expect.any(Error),
      );
      expect(tenantDbStubState.contactUpdateCalls).toContainEqual(
        expect.objectContaining({ set: { opt_out: true } }),
      );
    });

    test("STOP also dequeues the contact from all campaign queues (workspace-scoped)", async () => {
      const number = { workspace: "w1", twilio_data: { sid: "sid", authToken: "tok" }, webhook: [] };
      mocks.createClient.mockReturnValueOnce(
        makeDbClient({ number, contacts: [{ id: 9 }], mediaOk: true }),
      );
      const mod = await import("../app/routes/api+/inbound-sms");
      const res = await asRouteResponse(mod.action({
          request: makeInboundSmsRequest({ Body: "stop", NumMedia: "0" }),
        } as any),
      );
      expect(res.status).toBe(201);
      expect(tenantDbStubState.contactUpdateCalls).toContainEqual(
        expect.objectContaining({ set: { opt_out: true } }),
      );
      expect(queueDbMocks.dequeueQueueEntry).toHaveBeenCalledWith({
        by: { contactId: 9 },
        userId: null,
        reason: "Contact opted out via SMS",
        workspaceId: "w1",
      });
    });

    test("STOP dequeue failure is logged but the message is still recorded", async () => {
      queueDbMocks.dequeueQueueEntry.mockRejectedValueOnce(
        new Error("queue down"),
      );
      const number = { workspace: "w1", twilio_data: { sid: "sid", authToken: "tok" }, webhook: [] };
      mocks.createClient.mockReturnValueOnce(
        makeDbClient({ number, contacts: [{ id: 9 }], mediaOk: true }),
      );
      const mod = await import("../app/routes/api+/inbound-sms");
      const res = await asRouteResponse(mod.action({
          request: makeInboundSmsRequest({ Body: "stop", NumMedia: "0" }),
        } as any),
      );
      expect(res.status).toBe(201);
      expect(mocks.logger.error).toHaveBeenCalledWith(
        "Failed to dequeue opted-out contact from campaign queues:",
        expect.any(Error),
      );
    });

    test("START re-subscribes regardless of configured opt-out keywords", async () => {
      onboardingMocks.getWorkspaceMessagingOnboardingState.mockResolvedValueOnce({
        businessProfile: { optOutKeywords: "QUIT" },
      });
      const number = { workspace: "w1", twilio_data: { sid: "sid", authToken: "tok" }, webhook: [] };
      mocks.createClient.mockReturnValueOnce(
        makeDbClient({ number, contacts: [{ id: 9 }], mediaOk: true }),
      );
      const mod = await import("../app/routes/api+/inbound-sms");
      const res = await asRouteResponse(mod.action({
          request: makeInboundSmsRequest({ Body: "start", NumMedia: "0" }),
        } as any),
      );
      expect(res.status).toBe(201);
      expect(tenantDbStubState.contactUpdateCalls).toContainEqual(
        expect.objectContaining({ set: { opt_out: false } }),
      );
      // Re-subscribe must NOT touch campaign queues (no re-queueing).
      expect(queueDbMocks.dequeueQueueEntry).not.toHaveBeenCalled();
    });
  });

  test("returns 403 when Twilio signature validation fails", async () => {
    mocks.requireTwilioSignature.mockResolvedValueOnce(new Response(JSON.stringify({ error: "Invalid Twilio signature" }), { status: 403 }));
    const number = {
      workspace: "w1",
      twilio_data: { sid: "sid", authToken: "workspace-tok" },
      webhook: [],
    };
    mocks.createClient.mockReturnValueOnce(makeDbClient({ number }));
    const mod = await import("../app/routes/api+/inbound-sms");
    const res = await asRouteResponse(mod.action({
        request: makeInboundSmsRequest(),
      } as any),
    );
    expect(res.status).toBe(403);
    expect(mocks.requireTwilioSignature).toHaveBeenCalledWith(
      expect.objectContaining({ url: "http://x/inbound-sms" }),
      expect.objectContaining({
        workspaceId: "w1",
        params: expect.objectContaining({
          MessageSid: "SM1",
          To: "+1555",
          From: "+1666",
          Body: "hello",
        }),
      }),
    );
  });

  test("passes parsed webhook params into signature validation (avoids Bun empty re-read)", async () => {
    const number = {
      workspace: "w1",
      twilio_data: { sid: "sid", authToken: "workspace-tok" },
      webhook: [],
    };
    mocks.createClient.mockReturnValueOnce(makeDbClient({ number, mediaOk: true }));
    const mod = await import("../app/routes/api+/inbound-sms");
    const res = await asRouteResponse(mod.action({
        request: makeInboundSmsRequest({ NumMedia: "0" }),
      } as any),
    );
    expect(res.status).toBe(201);
    expect(mocks.requireTwilioSignature).toHaveBeenCalledWith(
      expect.any(Request),
      expect.objectContaining({
        workspaceId: "w1",
        params: expect.objectContaining({
          MessageSid: "SM1",
          AccountSid: "AC1",
          Body: "hello",
        }),
      }),
    );
  });

  test("returns 403 when Twilio signature header is missing", async () => {
    mocks.requireTwilioSignature.mockResolvedValueOnce(new Response(JSON.stringify({ error: "Missing Twilio signature" }), { status: 403 }));
    const number = {
      workspace: "w1",
      twilio_data: { sid: "sid", authToken: "workspace-tok" },
      webhook: [],
    };
    mocks.createClient.mockReturnValueOnce(makeDbClient({ number }));
    const mod = await import("../app/routes/api+/inbound-sms");
    const body = new FormData();
    for (const [key, value] of Object.entries(makeParams())) {
      body.append(key, String(value));
    }
    const res = await asRouteResponse(mod.action({
        request: new Request("http://x/inbound-sms", { method: "POST", body }),
      } as never),
    );
    expect(res.status).toBe(403);
  });

  test("returns 404 when number not found", async () => {
    mocks.createClient.mockReturnValueOnce(makeDbClient({ number: null }));
    const mod = await import("../app/routes/api+/inbound-sms");
    const res = await asRouteResponse(mod.action({ request: makeInboundSmsRequest() } as any));
    expect(res.status).toBe(404);
  });

  test("resolves workspace by MessagingServiceSid when To number is unknown", async () => {
    mocks.createClient.mockReturnValueOnce(
      makeDbClient({
        number: null,
        workspaceMsMatches: [
          {
            id: "w-ms",
            twilio_data: { sid: "sid", authToken: "tok" },
            webhook: [],
          },
        ],
      }),
    );
    const mod = await import("../app/routes/api+/inbound-sms");
    const res = await asRouteResponse(mod.action({
        request: makeInboundSmsRequest({
          To: "+19998887777",
          MessagingServiceSid: "MG1234567890abcdef",
          NumMedia: "0",
        }),
      } as any),
    );
    expect(res.status).toBe(201);
    expect(tenantDbStubState.messageInsertCalls[0]).toMatchObject({
      messaging_service_sid: "MG1234567890abcdef",
      direction: "inbound",
    });
  });

  test("returns 409 when MessagingServiceSid matches multiple workspaces", async () => {
    mocks.createClient.mockReturnValueOnce(
      makeDbClient({
        number: null,
        workspaceMsMatches: [
          { id: "w1", twilio_data: { sid: "AC1", authToken: "tok1" }, webhook: [] },
          { id: "w2", twilio_data: { sid: "AC2", authToken: "tok2" }, webhook: [] },
        ],
      }),
    );
    const mod = await import("../app/routes/api+/inbound-sms");
    const res = await asRouteResponse(mod.action({
        request: makeInboundSmsRequest({
          To: "+19998887777",
          MessagingServiceSid: "MGdup",
          NumMedia: "0",
        }),
      } as any),
    );
    expect(res.status).toBe(409);
  });

  test("returns 500 when workspace Twilio credentials are missing", async () => {
    mocks.requireTwilioSignature.mockResolvedValueOnce(new Response(JSON.stringify({ error: "Workspace Twilio credentials missing" }), { status: 500 }));
    const number = { workspace: "w1", twilio_data: null, webhook: [] };
    mocks.createClient.mockReturnValueOnce(makeDbClient({ number }));
    const mod = await import("../app/routes/api+/inbound-sms");
    const res = await asRouteResponse(mod.action({ request: makeInboundSmsRequest({ NumMedia: "1" }) } as any),
    );
    expect(res.status).toBe(500);
  });

  test("processes media (handles fetch/upload failures), inserts message, opt-out stop/start, and sends webhook", async () => {
    mocks.fetch.mockResolvedValueOnce({ ok: false, statusText: "nope" } as any);
    const number = { workspace: "w1", twilio_data: { sid: "sid", authToken: "tok" }, webhook: [{ events: [{ category: "inbound_sms" }] }] };
    mocks.createClient.mockReturnValueOnce(makeDbClient({ number, contacts: [{ id: 9 }], smsWebhook: true }));
    const mod = await import("../app/routes/api+/inbound-sms");
    let res = await asRouteResponse(mod.action({ request: makeInboundSmsRequest() } as any));
    expect(res.status).toBe(201);
    expect(tenantDbStubState.messageInsertCalls[0]?.contact_id).toBe(9);
    expect(mocks.sendWebhookNotification).toHaveBeenCalled();

    // start branch with quoted start + upload error path
    mocks.fetch.mockResolvedValueOnce({ ok: true, statusText: "OK", blob: async () => new Blob(["x"]) } as any);
    mocks.createClient.mockReturnValueOnce(makeDbClient({ number, uploadError: { message: "up" }, contacts: [{ id: 9 }] }));
    res = await asRouteResponse(mod.action({ request: makeInboundSmsRequest() } as any));
    expect(res.status).toBe(201);
    expect(mocks.logger.error).toHaveBeenCalled();
  });

  test("covers media_urls branch, contact lookup error logging, and no-webhook path", async () => {
    mocks.fetch.mockResolvedValueOnce({ ok: true, statusText: "OK", blob: async () => new Blob(["x"]) } as any);
    const number = { workspace: "w1", twilio_data: { sid: "sid", authToken: "tok" }, webhook: [{ events: [{ category: "other" }] }] };
    mocks.createClient.mockReturnValueOnce(makeDbClient({ number, contactError: new Error("c") }));
    const mod = await import("../app/routes/api+/inbound-sms");
    const res = await asRouteResponse(mod.action({ request: makeInboundSmsRequest() } as any));
    expect(res.status).toBe(201);
    expect(mocks.logger.error).toHaveBeenCalledWith("Contact lookup error:", expect.any(Error));
    expect(mocks.sendWebhookNotification).not.toHaveBeenCalled();
  });

  test("covers stop/start contact empty (no update) + contactError logging branches", async () => {
    const number = { workspace: "w1", twilio_data: { sid: "sid", authToken: "tok" }, webhook: [] };
    const mod = await import("../app/routes/api+/inbound-sms");

    mocks.createClient.mockReturnValueOnce(makeDbClient({ number, contacts: [], contactError: new Error("c") }));
    let res = await asRouteResponse(mod.action({ request: makeInboundSmsRequest() } as any));
    expect(res.status).toBe(201);

    mocks.createClient.mockReturnValueOnce(makeDbClient({ number, contacts: [], contactError: new Error("c") }));
    res = await asRouteResponse(mod.action({ request: makeInboundSmsRequest() } as any));
    expect(res.status).toBe(201);
    expect(mocks.logger.error).toHaveBeenCalled();
  });

  test("covers webhook payload media_urls when media present", async () => {
    mocks.fetch.mockResolvedValueOnce({ ok: true, statusText: "OK", blob: async () => new Blob(["x"]) } as any);
    const number = { workspace: "w1", twilio_data: { sid: "sid", authToken: "tok" }, webhook: [{ events: [{ category: "inbound_sms" }] }] };
    mocks.createClient.mockReturnValueOnce(makeDbClient({ number }));
    const mod = await import("../app/routes/api+/inbound-sms");
    const res = await asRouteResponse(mod.action({ request: makeInboundSmsRequest() } as any));
    expect(res.status).toBe(201);
    expect(mocks.sendWebhookNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          media_urls: expect.arrayContaining([expect.stringContaining("sms-SM1-0-")]),
        }),
      }),
    );
  });

  test("does not stamp contact_id when phone lookup is ambiguous", async () => {
    const number = { workspace: "w1", twilio_data: { sid: "sid", authToken: "tok" }, webhook: [] };
    mocks.createClient.mockReturnValueOnce(
      makeDbClient({
        number,
        contacts: [{ id: 9 }, { id: 10 }],
      }),
    );
    const mod = await import("../app/routes/api+/inbound-sms");
    const res = await asRouteResponse(mod.action({ request: makeInboundSmsRequest() } as any));

    expect(res.status).toBe(201);
    expect(tenantDbStubState.messageInsertCalls[0]).not.toHaveProperty("contact_id");
  });

  test("message insert error returns 400", async () => {
    const number = { workspace: "w1", twilio_data: { sid: "sid", authToken: "tok" }, webhook: [] };
    mocks.fetch.mockResolvedValueOnce({ ok: true, statusText: "OK", blob: async () => new Blob(["x"]) } as any);
    configureTenantDbStub({ messageInsertError: new Error("msg") });
    mocks.createClient.mockReturnValueOnce(makeDbClient({ number }));
    const mod = await import("../app/routes/api+/inbound-sms");
    const res = await asRouteResponse(mod.action({ request: makeInboundSmsRequest() } as any));
    expect(res.status).toBe(400);
  });
});

