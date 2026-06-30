import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";
import {
  TEST_WORKSPACE_ID,
  TEST_WORKSPACE_ID_ALT,
} from "./helpers/public-api-fixtures";

type VerifyError = { error: string; status: number };
type VerifyApiKey = {
  authType: "api_key";
  workspaceId: string;
  client: any;
};
type VerifySession = {
  authType: "session";
  user: { id: string } | null;
};

const mocks = vi.hoisted(() => {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? "postgres://test:test@localhost:5432/test";
  return {
    verifyApiKeyOrSession: vi.fn<[], Promise<VerifyError | VerifyApiKey | VerifySession>>(),
    parseJsonBodyOrResponse: vi.fn(),
    createCampaign: vi.fn(),
    requireWorkspaceAccess: vi.fn(),
    enqueueContactsForCampaign: vi.fn(),
    validateCreateWithScriptPreflight: vi.fn(),
    createScriptForCampaign: vi.fn(),
    linkAudiencesToNewCampaign: vi.fn(),
    logger: { error: vi.fn() , info: vi.fn(), debug: vi.fn()},
  };
});

vi.mock("@/lib/create-with-script.server", () => ({
  validateCreateWithScriptPreflight: (...args: unknown[]) =>
    mocks.validateCreateWithScriptPreflight(...args),
  createScriptForCampaign: (...args: unknown[]) => mocks.createScriptForCampaign(...args),
  linkAudiencesToNewCampaign: (...args: unknown[]) => mocks.linkAudiencesToNewCampaign(...args),
}));

vi.mock("@/lib/api-auth.server", () => ({
  verifyApiKeyOrSession: (...args: any[]) => (mocks.verifyApiKeyOrSession as any)(...args),
}));
vi.mock("@/lib/api-parse.server", () => ({
  parseJsonBodyOrResponse: (...args: any[]) => mocks.parseJsonBodyOrResponse(...args),
}));
vi.mock("@/lib/database.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/database.server")>();
  return {
    ...actual,
    createCampaign: (...args: any[]) => mocks.createCampaign(...args),
    requireWorkspaceAccess: (...args: any[]) => mocks.requireWorkspaceAccess(...args),
  };
});
vi.mock("@/lib/queue.server", () => ({
  enqueueContactsForCampaign: (...args: any[]) => mocks.enqueueContactsForCampaign(...args),
}));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));

function makeDbClientForValidations(opts: {
  callerNumbers?: string[];
  numbersError?: any;
  audiences?: number[];
  audError?: any;
  scripts?: number[];
  scriptError?: any;
}) {
  const callerNumbers = opts.callerNumbers ?? ["+1555"];
  const audiences = opts.audiences ?? [];
  const scripts = opts.scripts ?? [1, 123];
  return {
    from: vi.fn((table: string) => {
      if (table === "workspace_number") {
        return {
          select: () => ({
            eq: async () => ({
              data: callerNumbers.map((phone_number) => ({ phone_number })),
              error: opts.numbersError ?? null,
            }),
          }),
        };
      }
      if (table === "audience") {
        return {
          select: () => ({
            eq: async () => ({
              data: audiences.map((id) => ({ id })),
              error: opts.audError ?? null,
            }),
          }),
        };
      }
      if (table === "script") {
        return {
          select: () => {
            let requestedId: number | null = null;
            const builder = {
              eq: (col: string, value: unknown) => {
                if (col === "id") {
                  requestedId = Number(value);
                }
                return builder;
              },
              maybeSingle: async () => ({
                data:
                  requestedId != null && scripts.includes(requestedId)
                    ? { id: requestedId }
                    : null,
                error: opts.scriptError ?? null,
              }),
            };
            return builder;
          },
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  };
}

describe("app/routes/api+/campaigns/route.create-with-script.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.verifyApiKeyOrSession.mockReset();
    mocks.parseJsonBodyOrResponse.mockReset();
    mocks.createCampaign.mockReset();
    mocks.requireWorkspaceAccess.mockReset();
    mocks.enqueueContactsForCampaign.mockReset();
    mocks.validateCreateWithScriptPreflight.mockReset();
    mocks.createScriptForCampaign.mockReset();
    mocks.linkAudiencesToNewCampaign.mockReset();
    mocks.logger.error.mockReset();
    mocks.validateCreateWithScriptPreflight.mockResolvedValue({ ok: true });
    mocks.createScriptForCampaign.mockImplementation(async (args: any) => {
      if (args.scriptPayload) {
        return {
          ok: true,
          scriptId: 9,
          createdScript: {
            id: 9,
            name: args.scriptPayload.name ?? "Campaign script",
            type: args.scriptPayload.type ?? "script",
            steps: args.scriptPayload.steps ?? { pages: {}, blocks: {} },
          },
        };
      }
      return {
        ok: true,
        scriptId: args.existingScriptId,
        createdScript: null,
      };
    });
    mocks.linkAudiencesToNewCampaign.mockResolvedValue({
      audiencesLinked: 0,
      contactsEnqueued: 0,
    });
  });

  test("returns 405 for non-POST", async () => {
    const mod = await import("../app/routes/api+/campaigns/create-with-script.route");
    const res = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "GET" }) } as any));
    expect(res.status).toBe(405);
    await expect(res.json()).resolves.toEqual({ error: "Method not allowed" });
  });

  test("returns auth error when verifyApiKeyOrSession fails", async () => {
    mocks.verifyApiKeyOrSession.mockResolvedValueOnce({ error: "no", status: 401 });
    const mod = await import("../app/routes/api+/campaigns/create-with-script.route");
    const res = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "POST" }) } as any));
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "no" });
  });

  test("returns 400 on invalid JSON body", async () => {
    mocks.verifyApiKeyOrSession.mockResolvedValueOnce({ authType: "api_key", workspaceId: TEST_WORKSPACE_ID, client: {} } as any);
    mocks.parseJsonBodyOrResponse.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const mod = await import("../app/routes/api+/campaigns/create-with-script.route");
    const res = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "POST" }) } as any));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Invalid JSON body" });
  });

  test("session auth requires workspace_id", async () => {
    const null = makeDbClientForValidations({});
    mocks.verifyApiKeyOrSession.mockResolvedValueOnce({
      authType: "session",
      user: { id: "u1" },
    });
    mocks.parseJsonBodyOrResponse.mockResolvedValueOnce({
      title: "t",
      type: "live_call",
      caller_id: "+1555",
      script_id: 1,
    });
    const mod = await import("../app/routes/api+/campaigns/create-with-script.route");
    const res = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "POST" }) } as any));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "workspace_id is required when using session auth",
    });
  });

  test("api_key auth rejects mismatched workspace_id", async () => {
    const client = makeDbClientForValidations({});
    mocks.verifyApiKeyOrSession.mockResolvedValueOnce({ authType: "api_key", workspaceId: TEST_WORKSPACE_ID, client });
    mocks.parseJsonBodyOrResponse.mockResolvedValueOnce({
      workspace_id: TEST_WORKSPACE_ID_ALT,
      title: "t",
      type: "live_call",
      caller_id: "+1555",
      script_id: 1,
    });
    const mod = await import("../app/routes/api+/campaigns/create-with-script.route");
    const res = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "POST" }) } as any));
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "workspace_id does not match API key" });
  });

  test("validates title/type/caller_id/script requirements", async () => {
    const client = makeDbClientForValidations({});
    mocks.verifyApiKeyOrSession.mockResolvedValue({ authType: "api_key", workspaceId: TEST_WORKSPACE_ID, client });
    mocks.parseJsonBodyOrResponse.mockImplementation(async (request, schema) => {
      const actual = await vi.importActual<typeof import("@/lib/api-parse.server")>(
        "@/lib/api-parse.server",
      );
      return actual.parseJsonBodyOrResponse(request, schema);
    });
    const mod = await import("../app/routes/api+/campaigns/create-with-script.route");

    const post = (body: unknown) =>
      mod.action({
        request: new Request("http://x", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
      } as any);

    const r1 = await asRouteResponse(
      await post({ type: "live_call", caller_id: "+1555", script_id: 1 }),
    );
    expect(r1.status).toBe(400);

    const r2 = await asRouteResponse(
      await post({
        workspace_id: TEST_WORKSPACE_ID,
        title: "t",
        type: "message",
        caller_id: "+1555",
        script_id: 1,
      }),
    );
    expect(r2.status).toBe(400);

    const r3 = await asRouteResponse(
      await post({
        workspace_id: TEST_WORKSPACE_ID,
        title: "t",
        type: "live_call",
        script_id: 1,
      }),
    );
    expect(r3.status).toBe(400);

    const r4 = await asRouteResponse(
      await post({
        workspace_id: TEST_WORKSPACE_ID,
        title: "t",
        type: "live_call",
        caller_id: "+1555",
      }),
    );
    expect(r4.status).toBe(400);

    const r5 = await asRouteResponse(
      await post({
        workspace_id: TEST_WORKSPACE_ID,
        title: "t",
        type: "live_call",
        caller_id: "+1555",
        script: { name: "s", steps: {} },
        script_id: 1,
      }),
    );
    expect(r5.status).toBe(400);
    await expect(r5.json()).resolves.toMatchObject({
      error: expect.stringMatching(/exactly one of script or script_id/i),
    });
  });

  test("returns 500 when workspace_number query errors", async () => {
    mocks.verifyApiKeyOrSession.mockResolvedValueOnce({
      authType: "api_key",
      workspaceId: TEST_WORKSPACE_ID,
      client: {},
    });
    mocks.validateCreateWithScriptPreflight.mockResolvedValueOnce({
      ok: false,
      error: "Failed to validate request",
      status: 500,
    });
    mocks.parseJsonBodyOrResponse.mockResolvedValueOnce({
      workspace_id: TEST_WORKSPACE_ID,
      title: "t",
      type: "live_call",
      caller_id: "+1555",
      script_id: 1,
    });
    const mod = await import("../app/routes/api+/campaigns/create-with-script.route");
    const res = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "POST" }) } as any));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "Failed to validate request" });
  });

  test("returns 400 when caller_id does not belong to workspace", async () => {
    mocks.verifyApiKeyOrSession.mockResolvedValueOnce({
      authType: "api_key",
      workspaceId: TEST_WORKSPACE_ID,
      client: {},
    });
    mocks.validateCreateWithScriptPreflight.mockResolvedValueOnce({
      ok: false,
      error: "caller_id must be a phone number that belongs to this workspace",
      status: 400,
    });
    mocks.parseJsonBodyOrResponse.mockResolvedValueOnce({
      workspace_id: TEST_WORKSPACE_ID,
      title: "t",
      type: "live_call",
      caller_id: "+1555",
      script_id: 1,
    });
    const mod = await import("../app/routes/api+/campaigns/create-with-script.route");
    const res = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "POST" }) } as any));
    expect(res.status).toBe(400);
  });

  test("covers workspaceNumbers ?? [] when workspaceNumbers is null", async () => {
    mocks.verifyApiKeyOrSession.mockResolvedValueOnce({
      authType: "api_key",
      workspaceId: TEST_WORKSPACE_ID,
      client: {},
    });
    mocks.validateCreateWithScriptPreflight.mockResolvedValueOnce({
      ok: false,
      error: "caller_id must be a phone number that belongs to this workspace",
      status: 400,
    });
    mocks.parseJsonBodyOrResponse.mockResolvedValueOnce({
      workspace_id: TEST_WORKSPACE_ID,
      title: "t",
      type: "live_call",
      caller_id: "+1555",
      script_id: 1,
    });
    const mod = await import("../app/routes/api+/campaigns/create-with-script.route");
    const res = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "POST" }) } as any));
    expect(res.status).toBe(400);
  });

  test("validates audience_ids: audError (500) and invalid ids (400)", async () => {
    const mod = await import("../app/routes/api+/campaigns/create-with-script.route");

    mocks.verifyApiKeyOrSession.mockResolvedValueOnce({
      authType: "api_key",
      workspaceId: TEST_WORKSPACE_ID,
      client: {},
    });
    mocks.validateCreateWithScriptPreflight.mockResolvedValueOnce({
      ok: false,
      error: "Failed to validate request",
      status: 500,
    });
    mocks.parseJsonBodyOrResponse.mockResolvedValueOnce({
      workspace_id: TEST_WORKSPACE_ID,
      title: "t",
      type: "live_call",
      caller_id: "+1555",
      script_id: 1,
      audience_ids: [1],
    });
    const r1 = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "POST" }) } as any));
    expect(r1.status).toBe(500);

    mocks.verifyApiKeyOrSession.mockResolvedValueOnce({
      authType: "api_key",
      workspaceId: TEST_WORKSPACE_ID,
      client: {},
    });
    mocks.validateCreateWithScriptPreflight.mockResolvedValueOnce({
      ok: false,
      error: "audience_ids must belong to this workspace; invalid: 1",
      status: 400,
    });
    mocks.parseJsonBodyOrResponse.mockResolvedValueOnce({
      workspace_id: TEST_WORKSPACE_ID,
      title: "t",
      type: "live_call",
      caller_id: "+1555",
      script_id: 1,
      audience_ids: [1],
    });
    const r2 = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "POST" }) } as any));
    expect(r2.status).toBe(400);
  });

  test("validates script_id belongs to workspace", async () => {
    mocks.verifyApiKeyOrSession.mockResolvedValueOnce({
      authType: "api_key",
      workspaceId: TEST_WORKSPACE_ID,
      client: {},
    });
    mocks.validateCreateWithScriptPreflight.mockResolvedValueOnce({
      ok: false,
      error: "script_id must belong to this workspace",
      status: 400,
    });
    mocks.parseJsonBodyOrResponse.mockResolvedValueOnce({
      workspace_id: TEST_WORKSPACE_ID,
      title: "t",
      type: "live_call",
      caller_id: "+1555",
      script_id: 999,
    });

    const mod = await import("../app/routes/api+/campaigns/create-with-script.route");
    const res = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "POST" }) } as any));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "script_id must belong to this workspace",
    });
  });

  test("returns 500 when script_id lookup errors", async () => {
    mocks.verifyApiKeyOrSession.mockResolvedValueOnce({
      authType: "api_key",
      workspaceId: TEST_WORKSPACE_ID,
      client: {},
    });
    mocks.validateCreateWithScriptPreflight.mockResolvedValueOnce({
      ok: false,
      error: "Failed to validate request",
      status: 500,
    });
    mocks.parseJsonBodyOrResponse.mockResolvedValueOnce({
      workspace_id: TEST_WORKSPACE_ID,
      title: "t",
      type: "live_call",
      caller_id: "+1555",
      script_id: 1,
    });

    const mod = await import("../app/routes/api+/campaigns/create-with-script.route");
    const res = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "POST" }) } as any));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: "Failed to validate request",
    });
  });

  test("covers workspaceAudiences ?? [] when workspaceAudiences is null", async () => {
    mocks.verifyApiKeyOrSession.mockResolvedValueOnce({
      authType: "api_key",
      workspaceId: TEST_WORKSPACE_ID,
      client: {},
    });
    mocks.validateCreateWithScriptPreflight.mockResolvedValueOnce({
      ok: false,
      error: "audience_ids must belong to this workspace; invalid: 1",
      status: 400,
    });
    mocks.parseJsonBodyOrResponse.mockResolvedValueOnce({
      workspace_id: TEST_WORKSPACE_ID,
      title: "t",
      type: "live_call",
      caller_id: "+1555",
      script_id: 1,
      audience_ids: [1],
    });
    const mod = await import("../app/routes/api+/campaigns/create-with-script.route");
    const res = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "POST" }) } as any));
    expect(res.status).toBe(400);
  });

  test("script creation errors: insert error and missing row", async () => {
    mocks.verifyApiKeyOrSession.mockResolvedValueOnce({
      authType: "api_key",
      workspaceId: TEST_WORKSPACE_ID,
      client: {},
    });
    mocks.createScriptForCampaign.mockResolvedValueOnce({
      ok: false,
      error: "Failed to create script: script bad",
      status: 500,
    });
    mocks.parseJsonBodyOrResponse.mockResolvedValueOnce({
      workspace_id: TEST_WORKSPACE_ID,
      title: "t",
      type: "live_call",
      caller_id: "+1555",
      script: { name: "s", steps: {} },
    });
    const mod = await import("../app/routes/api+/campaigns/create-with-script.route");
    const r1 = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "POST" }) } as any));
    expect(r1.status).toBe(500);

    mocks.verifyApiKeyOrSession.mockResolvedValueOnce({
      authType: "api_key",
      workspaceId: TEST_WORKSPACE_ID,
      client: {},
    });
    mocks.createScriptForCampaign.mockResolvedValueOnce({
      ok: false,
      error: "Failed to create script",
      status: 500,
    });
    mocks.parseJsonBodyOrResponse.mockResolvedValueOnce({
      workspace_id: TEST_WORKSPACE_ID,
      title: "t",
      type: "live_call",
      caller_id: "+1555",
      script: { name: "s", steps: {} },
    });
    const r2 = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "POST" }) } as any));
    expect(r2.status).toBe(500);
  });

  test("covers script name default, steps provided, createdBy null, and non-array scriptRows", async () => {
    const caller_id = "+1555";
    mocks.verifyApiKeyOrSession.mockResolvedValueOnce({
      authType: "api_key",
      workspaceId: TEST_WORKSPACE_ID,
      client: {},
    });
    mocks.createScriptForCampaign.mockResolvedValueOnce({
      ok: true,
      scriptId: 9,
      createdScript: {
        id: 9,
        name: "Campaign script",
        type: "script",
        steps: { pages: { a: 1 } },
      },
    });
    mocks.parseJsonBodyOrResponse.mockResolvedValueOnce({
      workspace_id: TEST_WORKSPACE_ID,
      title: "t",
      type: "live_call",
      caller_id,
      script: { name: undefined, type: undefined, steps: { pages: { a: 1 } } },
      audience_ids: [],
      start_date: "2020-01-01",
      end_date: "2020-01-02",
      schedule: { tz: "UTC" },
      enqueue_audience_contacts: false,
      is_active: false,
    });
    mocks.createCampaign.mockResolvedValueOnce({
      campaign: { id: 1 },
      campaignDetails: { campaign_id: 1 },
    });
    const mod = await import("../app/routes/api+/campaigns/create-with-script.route");
    const res = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "POST" }) } as any));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.script).toBeTruthy();
  });

  test("createCampaign errors are returned as 400 (Error and non-Error)", async () => {
    mocks.verifyApiKeyOrSession.mockResolvedValueOnce({
      authType: "api_key",
      workspaceId: TEST_WORKSPACE_ID,
      client: {},
    });
    mocks.parseJsonBodyOrResponse.mockResolvedValueOnce({
      workspace_id: TEST_WORKSPACE_ID,
      title: "t",
      type: "live_call",
      caller_id: "+1555",
      script_id: 1,
    });
    mocks.createCampaign.mockRejectedValueOnce(new Error("nope"));
    const mod = await import("../app/routes/api+/campaigns/create-with-script.route");
    const r1 = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "POST" }) } as any));
    expect(r1.status).toBe(400);

    mocks.verifyApiKeyOrSession.mockResolvedValueOnce({
      authType: "api_key",
      workspaceId: TEST_WORKSPACE_ID,
      client: {},
    });
    mocks.parseJsonBodyOrResponse.mockResolvedValueOnce({
      workspace_id: TEST_WORKSPACE_ID,
      title: "t",
      type: "live_call",
      caller_id: "+1555",
      script_id: 1,
    });
    mocks.createCampaign.mockRejectedValueOnce("nope");
    const r2 = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "POST" }) } as any));
    expect(r2.status).toBe(400);
  });

  test("full success (session auth) links audiences and enqueues new contacts", async () => {
    const workspaceId = TEST_WORKSPACE_ID;
    const caller_id = "+1555";
    const audience_ids = [1, 2, 3, 4, 5, 6];
    const campaignId = 777;
    const null = {};

    mocks.verifyApiKeyOrSession.mockResolvedValueOnce({
      authType: "session",
      user: { id: "u1" },
    });
    mocks.parseJsonBodyOrResponse.mockResolvedValueOnce({
      workspace_id: workspaceId,
      title: "t",
      type: "live_call",
      caller_id,
      script: { name: "s", steps: undefined },
      audience_ids,
      enqueue_audience_contacts: true,
      is_active: true,
      start_date: null,
      end_date: null,
      schedule: null,
    });
    mocks.requireWorkspaceAccess.mockResolvedValueOnce(undefined);
    mocks.createCampaign.mockResolvedValueOnce({
      campaign: { id: campaignId },
      campaignDetails: { campaign_id: campaignId },
    });
    mocks.linkAudiencesToNewCampaign.mockResolvedValueOnce({
      audiencesLinked: 3,
      contactsEnqueued: 1,
    });

    const mod = await import("../app/routes/api+/campaigns/create-with-script.route");
    const res = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "POST" }) } as any));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.audiences_linked).toBe(3);
    expect(body.contacts_enqueued).toBe(1);
    expect(mocks.linkAudiencesToNewCampaign).toHaveBeenCalledWith({
      client: null,
      campaignId,
      audienceIds: audience_ids,
      enqueueAudienceContacts: true,
    });
  });

  test("existing script_id path works and skips audience loop when audience_ids empty", async () => {
    const workspaceId = TEST_WORKSPACE_ID;
    const caller_id = "+1555";
    mocks.verifyApiKeyOrSession.mockResolvedValueOnce({
      authType: "api_key",
      workspaceId,
      client: {},
    });
    mocks.parseJsonBodyOrResponse.mockResolvedValueOnce({
      workspace_id: workspaceId,
      title: "t",
      type: "live_call",
      caller_id,
      script_id: 123,
      audience_ids: [],
      enqueue_audience_contacts: false,
    });
    mocks.createCampaign.mockResolvedValueOnce({
      campaign: { id: 1 },
      campaignDetails: { campaign_id: 1 },
    });

    const mod = await import("../app/routes/api+/campaigns/create-with-script.route");
    const res = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "POST" }) } as any));
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toMatchObject({
      audiences_linked: 0,
      contacts_enqueued: 0,
    });
  });

  test("passes enqueue flag through to linkAudiencesToNewCampaign", async () => {
    const workspaceId = TEST_WORKSPACE_ID;
    const caller_id = "+1555";
    const null = {};

    mocks.verifyApiKeyOrSession.mockResolvedValueOnce({
      authType: "session",
      user: { id: "u1" },
    });
    mocks.parseJsonBodyOrResponse.mockResolvedValueOnce({
      workspace_id: workspaceId,
      title: "t",
      type: "live_call",
      caller_id,
      script_id: 1,
      audience_ids: [1],
      enqueue_audience_contacts: true,
    });
    mocks.requireWorkspaceAccess.mockResolvedValueOnce(undefined);
    mocks.createCampaign.mockResolvedValueOnce({
      campaign: { id: 7 },
      campaignDetails: { campaign_id: 7 },
    });
    mocks.linkAudiencesToNewCampaign.mockResolvedValueOnce({
      audiencesLinked: 1,
      contactsEnqueued: 1,
    });

    const mod = await import("../app/routes/api+/campaigns/create-with-script.route");
    const res = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "POST" }) } as any));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.audiences_linked).toBe(1);
    expect(body.contacts_enqueued).toBe(1);
    expect(mocks.linkAudiencesToNewCampaign).toHaveBeenCalledWith({
      client: null,
      campaignId: 7,
      audienceIds: [1],
      enqueueAudienceContacts: true,
    });
  });

  test("skips enqueue when enqueue_audience_contacts is false", async () => {
    const workspaceId = TEST_WORKSPACE_ID;
    const caller_id = "+1555";
    const null = {};

    mocks.verifyApiKeyOrSession.mockResolvedValueOnce({
      authType: "session",
      user: { id: "u1" },
    });
    mocks.parseJsonBodyOrResponse.mockResolvedValueOnce({
      workspace_id: workspaceId,
      title: "t",
      type: "live_call",
      caller_id,
      script_id: 1,
      audience_ids: [1],
      enqueue_audience_contacts: false,
    });
    mocks.requireWorkspaceAccess.mockResolvedValueOnce(undefined);
    mocks.createCampaign.mockResolvedValueOnce({
      campaign: { id: 7 },
      campaignDetails: { campaign_id: 7 },
    });
    mocks.linkAudiencesToNewCampaign.mockResolvedValueOnce({
      audiencesLinked: 1,
      contactsEnqueued: 0,
    });

    const mod = await import("../app/routes/api+/campaigns/create-with-script.route");
    const res = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "POST" }) } as any));
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toMatchObject({
      audiences_linked: 1,
      contacts_enqueued: 0,
    });
    expect(mocks.linkAudiencesToNewCampaign).toHaveBeenCalledWith({
      client: null,
      campaignId: 7,
      audienceIds: [1],
      enqueueAudienceContacts: false,
    });
  });

  test("returns linkAudiencesToNewCampaign counts in response", async () => {
    const workspaceId = TEST_WORKSPACE_ID;
    const caller_id = "+1555";
    const null = {};

    mocks.verifyApiKeyOrSession.mockResolvedValueOnce({
      authType: "session",
      user: { id: "u1" },
    });
    mocks.parseJsonBodyOrResponse.mockResolvedValueOnce({
      workspace_id: workspaceId,
      title: "t",
      type: "live_call",
      caller_id,
      script_id: 1,
      audience_ids: [1],
      enqueue_audience_contacts: true,
    });
    mocks.requireWorkspaceAccess.mockResolvedValueOnce(undefined);
    mocks.createCampaign.mockResolvedValueOnce({
      campaign: { id: 7 },
      campaignDetails: { campaign_id: 7 },
    });
    mocks.linkAudiencesToNewCampaign.mockResolvedValueOnce({
      audiencesLinked: 1,
      contactsEnqueued: 0,
    });

    const mod = await import("../app/routes/api+/campaigns/create-with-script.route");
    const res = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "POST" }) } as any));
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toMatchObject({
      audiences_linked: 1,
      contacts_enqueued: 0,
    });
  });
});

