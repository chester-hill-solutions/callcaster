import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";
import { queueJsonAuthSession } from "./helpers/route-auth-mock";

const mocks = vi.hoisted(() => {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? "postgres://test:test@localhost:5432/test";
  return {
    safeParseJson: vi.fn(),
    authForOutreachAttempt: vi.fn(),
    updateOutreachAttemptForWorkspace: vi.fn(),
  };
});

vi.mock("@/lib/auth.server", () => ({
  getSession: () => ({ headers: new Headers({ "Set-Cookie": "x=1" }),
  }),
}));
vi.mock("@/lib/database.server", () => ({
  requireWorkspaceAccess: vi.fn(async () => undefined),
  safeParseJson: (...args: unknown[]) => mocks.safeParseJson(...args),
}));
vi.mock("@/lib/platform-data.server", () => ({
  authForOutreachAttempt: (...args: unknown[]) => mocks.authForOutreachAttempt(...args),
}));
vi.mock("@/lib/telephony-db.server", () => ({
  updateOutreachAttemptForWorkspace: (...args: unknown[]) =>
    mocks.updateOutreachAttemptForWorkspace(...args),
}));

describe("app/routes/api+/outreach_attempts/$id/route.js", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.safeParseJson.mockReset();
    mocks.authForOutreachAttempt.mockReset();
    mocks.updateOutreachAttemptForWorkspace.mockReset();
    mocks.authForOutreachAttempt.mockResolvedValue({
      client: {},
      user: { id: "u1" },
      workspaceId: "w1",
    });
  });

  test("returns json({ error }) when update errors", async () => {
    queueJsonAuthSession({ user: { id: "u1" } });
    mocks.safeParseJson.mockResolvedValueOnce({ update: { a: 1 } });
    mocks.updateOutreachAttemptForWorkspace.mockResolvedValueOnce(
      new Response("Error updating outreach attempt: bad", { status: 500 }),
    );

    const mod = await import("../app/routes/api+/outreach_attempts/$id.route");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/outreach_attempts/1", { method: "POST" }),
      params: { id: "1" },
    } as any));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "bad" });
  });

  test("returns data with headers on success", async () => {
    queueJsonAuthSession({ user: { id: "u1" } });
    mocks.safeParseJson.mockResolvedValueOnce({ update: { disposition: "completed" } });
    mocks.updateOutreachAttemptForWorkspace.mockResolvedValueOnce({ id: 1 });

    const mod = await import("../app/routes/api+/outreach_attempts/$id.route");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/outreach_attempts/2", { method: "POST" }),
      params: { id: "2" },
    } as any));

    expect(res.status).toBe(200);
    expect(res.headers.get("Set-Cookie")).toBe("x=1");
    await expect(res.json()).resolves.toEqual({ id: 1 });
  });
});
