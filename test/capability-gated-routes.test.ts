import { beforeEach, describe, expect, test, vi } from "vitest";
import { asRouteResponse } from "./helpers/route-result";
import { withDataPlaneRouteArgs } from "./helpers/route-context-mock";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

const mocks = vi.hoisted(() => ({
  getUserRole: vi.fn(),
  listWorkspaceAuditEventsApi: vi.fn(),
  findCallBySid: vi.fn(),
  createWorkspaceTwilioInstance: vi.fn(),
  safeRecordWorkspaceAuditEvent: vi.fn(),
}));

vi.mock("@/lib/database/workspace.server", () => ({
  getUserRole: (...args: unknown[]) => mocks.getUserRole(...args),
  createWorkspaceTwilioInstance: (...args: unknown[]) =>
    mocks.createWorkspaceTwilioInstance(...args),
}));

vi.mock("@/lib/platform-audit.server", () => ({
  listWorkspaceAuditEventsApi: (...args: unknown[]) =>
    mocks.listWorkspaceAuditEventsApi(...args),
}));

vi.mock("@/lib/telephony-db.server", () => ({
  findCallBySid: (...args: unknown[]) => mocks.findCallBySid(...args),
}));

vi.mock("@/lib/audit-event.server", () => ({
  safeRecordWorkspaceAuditEvent: (...args: unknown[]) =>
    mocks.safeRecordWorkspaceAuditEvent(...args),
}));

vi.mock("@/lib/twilio-twiml.server", () => ({
  pauseTwiml: () => "<Response><Pause/></Response>",
}));

describe("capability-gated data-plane routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.safeRecordWorkspaceAuditEvent.mockResolvedValue(undefined);
  });

  test("audit-events rejects caller session (missing audit.read)", async () => {
    mocks.getUserRole.mockResolvedValue({ role: "caller" });

    const mod = await import(
      "../app/routes/api+/workspaces+/$workspaceId/audit-events.route"
    );
    const res = await asRouteResponse(
      mod.loader(
        await withDataPlaneRouteArgs({
          request: new Request(
            "http://localhost/api/workspaces/w1/audit-events",
          ),
          params: { workspaceId: "w1" },
        }),
      ),
    );

    expect(res.status).toBe(403);
    expect(mocks.listWorkspaceAuditEventsApi).not.toHaveBeenCalled();
  });

  test("audit-events allows owner session", async () => {
    mocks.getUserRole.mockResolvedValue({ role: "owner" });
    mocks.listWorkspaceAuditEventsApi.mockResolvedValue({
      ok: true,
      events: [],
      next_cursor: null,
    });

    const mod = await import(
      "../app/routes/api+/workspaces+/$workspaceId/audit-events.route"
    );
    const res = await asRouteResponse(
      mod.loader(
        await withDataPlaneRouteArgs({
          request: new Request(
            "http://localhost/api/workspaces/w1/audit-events",
          ),
          params: { workspaceId: "w1" },
        }),
      ),
    );

    expect(res.status).toBe(200);
    expect(mocks.listWorkspaceAuditEventsApi).toHaveBeenCalled();
  });

  test("audit-events allows API key with audit.read only", async () => {
    mocks.listWorkspaceAuditEventsApi.mockResolvedValue({
      ok: true,
      events: [],
      next_cursor: null,
    });

    const mod = await import(
      "../app/routes/api+/workspaces+/$workspaceId/audit-events.route"
    );
    const res = await asRouteResponse(
      mod.loader(
        await withDataPlaneRouteArgs(
          {
            request: new Request(
              "http://localhost/api/workspaces/w1/audit-events",
            ),
            params: { workspaceId: "w1" },
          },
          {
            userId: null,
            apiKey: { keyId: "k1", scopes: ["audit.read"] },
          },
        ),
      ),
    );

    expect(res.status).toBe(200);
  });

  test("disconnect rejects API key missing calls.control", async () => {
    const mod = await import(
      "../app/routes/api+/workspaces+/$workspaceId/calls/$callSid/disconnect.route"
    );
    const res = await asRouteResponse(
      mod.action(
        await withDataPlaneRouteArgs(
          {
            request: new Request(
              "http://localhost/api/workspaces/w1/calls/CA1/disconnect",
              { method: "POST" },
            ),
            params: { workspaceId: "w1", callSid: "CA1" },
          },
          {
            userId: null,
            apiKey: { keyId: "k1", scopes: ["calls.start"] },
          },
        ),
      ),
    );

    expect(res.status).toBe(403);
    expect(mocks.findCallBySid).not.toHaveBeenCalled();
  });

  test("disconnect allows session with calls.control", async () => {
    mocks.getUserRole.mockResolvedValue({ role: "caller" });
    mocks.findCallBySid.mockResolvedValue({
      sid: "CA1",
      workspace: "w1",
    });
    mocks.createWorkspaceTwilioInstance.mockResolvedValue({
      calls: () => ({
        update: vi.fn().mockResolvedValue({}),
      }),
    });

    const mod = await import(
      "../app/routes/api+/workspaces+/$workspaceId/calls/$callSid/disconnect.route"
    );
    const res = await asRouteResponse(
      mod.action(
        await withDataPlaneRouteArgs({
          request: new Request(
            "http://localhost/api/workspaces/w1/calls/CA1/disconnect",
            { method: "POST" },
          ),
          params: { workspaceId: "w1", callSid: "CA1" },
        }),
      ),
    );

    expect(res.status).toBe(200);
  });

  test("campaigns list rejects API key missing campaigns.read", async () => {
    const mod = await import(
      "../app/routes/api+/workspaces+/$workspaceId/campaigns.route"
    );
    const res = await asRouteResponse(
      mod.loader(
        await withDataPlaneRouteArgs(
          {
            request: new Request(
              "http://localhost/api/workspaces/w1/campaigns",
            ),
            params: { workspaceId: "w1" },
          },
          {
            userId: null,
            apiKey: { keyId: "k1", scopes: ["messages.send"] },
          },
        ),
      ),
    );

    expect(res.status).toBe(403);
  });

  test("members invite rejects API key missing members.invite", async () => {
    const mod = await import(
      "../app/routes/api+/workspaces+/$workspaceId/members.route"
    );
    const res = await asRouteResponse(
      mod.action(
        await withDataPlaneRouteArgs(
          {
            request: new Request(
              "http://localhost/api/workspaces/w1/members",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  email: "a@example.com",
                  role: "caller",
                }),
              },
            ),
            params: { workspaceId: "w1" },
          },
          {
            userId: null,
            apiKey: { keyId: "k1", scopes: ["campaigns.read"] },
          },
        ),
      ),
    );

    expect(res.status).toBe(403);
  });
});
