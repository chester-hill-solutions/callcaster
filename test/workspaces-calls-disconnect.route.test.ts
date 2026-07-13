import { beforeEach, describe, expect, test, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

import { asRouteResponse } from "./helpers/route-result";
import { withDataPlaneRouteArgs } from "./helpers/route-context-mock";

const mocks = vi.hoisted(() => ({
  createWorkspaceTwilioInstance: vi.fn(),
  callUpdate: vi.fn(),
  logger: { error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/database/workspace.server", () => ({
  createWorkspaceTwilioInstance: (...args: unknown[]) =>
    mocks.createWorkspaceTwilioInstance(...args),
}));

vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));

vi.mock("@/lib/twilio-twiml.server", () => ({
  pauseTwiml: (seconds: number) => `<Pause length="${seconds}"/>`,
}));

vi.mock("@/lib/telephony-db.server", () => ({
  findCallBySid: vi.fn(),
}));

import { findCallBySid } from "@/lib/telephony-db.server";

describe("workspaces calls disconnect route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.callUpdate.mockResolvedValue({});
    mocks.createWorkspaceTwilioInstance.mockResolvedValue({
      calls: (_sid: string) => ({ update: mocks.callUpdate }),
    });
  });

  test("returns 404 when call is outside workspace", async () => {
    vi.mocked(findCallBySid).mockResolvedValueOnce({
      workspace: "other",
      sid: "CA1",
    } as never);

    const mod = await import(
      "../app/routes/api+/workspaces+/$workspaceId/calls/$callSid/disconnect.route"
    );
    const res = await asRouteResponse(mod.action(
        await withDataPlaneRouteArgs({
          request: new Request(
            "http://localhost/api/workspaces/w1/calls/CA1/disconnect",
            { method: "POST" },
          ),
          params: { workspaceId: "w1", callSid: "CA1" },
        }),
      ),
    );

    expect(res.status).toBe(404);
  });

  test("disconnects call in workspace", async () => {
    vi.mocked(findCallBySid).mockResolvedValueOnce({
      workspace: "w1",
      sid: "CA1",
    } as never);

    const mod = await import(
      "../app/routes/api+/workspaces+/$workspaceId/calls/$callSid/disconnect.route"
    );
    const res = await asRouteResponse(mod.action(
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
    await expect(res.json()).resolves.toEqual({ success: true });
    expect(mocks.callUpdate).toHaveBeenCalled();
  });
});
