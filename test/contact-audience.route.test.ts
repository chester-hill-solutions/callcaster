import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";
import { queueDualAuthSession } from "./helpers/route-auth-mock";

vi.hoisted(() => {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? "postgres://local:test@127.0.0.1:5432/test";
});

const postgresServerMocks = vi.hoisted(() => ({ headers: new Headers() }));
const mocks = vi.hoisted(() => {
  return {
    parseActionRequest: vi.fn(),
    removeContactFromAudience: vi.fn(),
    findAudienceWorkspaceById: vi.fn(),
    requireWorkspaceAccess: vi.fn(),
    createErrorResponse: vi.fn((e: unknown) =>
      new Response(String(e instanceof Error ? e.message : e), { status: 500 }),
    ),
  };
});

vi.mock("@/lib/auth.server", () => ({
  getSession: () => ({ headers: postgresServerMocks.headers }),
}));

vi.mock("@/lib/audience-upload-db.server", () => ({
  findAudienceWorkspaceById: (...args: unknown[]) => mocks.findAudienceWorkspaceById(...args),
}));

vi.mock("../app/lib/database/contact-audience.server", () => ({
  removeContactFromAudience: (...args: unknown[]) =>
    mocks.removeContactFromAudience(...args),
}));
vi.mock("../app/lib/database/workspace.server", () => ({
  requireWorkspaceAccess: (...args: unknown[]) =>
    mocks.requireWorkspaceAccess(...args),
}));
vi.mock("../app/lib/request-utils.server", () => ({
  parseActionRequest: (...args: unknown[]) => mocks.parseActionRequest(...args),
}));

vi.mock("@/lib/errors.server", () => ({
  createErrorResponse: (...args: unknown[]) => mocks.createErrorResponse(...args),
}));

describe("app/routes/api+/contact-audience/route.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.parseActionRequest.mockReset();
    mocks.removeContactFromAudience.mockReset();
    mocks.findAudienceWorkspaceById.mockReset();
    mocks.requireWorkspaceAccess.mockReset();
    mocks.createErrorResponse.mockClear();
  });

  test("DELETE returns 400 when ids missing", async () => {
    queueDualAuthSession({ user: { id: "test-user" } });
    postgresServerMocks.headers = new Headers({ "X-Test": "1" });
    mocks.parseActionRequest.mockResolvedValueOnce({ contact_id: "", audience_id: "" });
    const mod = await import("../app/routes/api+/contact-audience");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/contact-audience", { method: "DELETE" }),
    } as any));
    expect(res.status).toBe(400);
    expect(res.headers.get("X-Test")).toBe("1");
  });

  test("DELETE removes contact from audience", async () => {
    const headers = new Headers({ "Set-Cookie": "a=1" });
    postgresServerMocks.headers = headers;
    queueDualAuthSession({ user: { id: "test-user" } });
    mocks.parseActionRequest.mockResolvedValueOnce({ contact_id: "2", audience_id: "3" });
    mocks.findAudienceWorkspaceById.mockResolvedValueOnce("test-workspace-id");
    mocks.removeContactFromAudience.mockResolvedValueOnce({ ok: true });

    const mod = await import("../app/routes/api+/contact-audience");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/contact-audience", { method: "DELETE" }),
    } as any));
    expect(res.status).toBe(200);
    expect(res.headers.get("Set-Cookie")).toBe("a=1");
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(mocks.removeContactFromAudience).toHaveBeenCalledWith(2, 3);
  });

  test("DELETE error uses createErrorResponse", async () => {
    postgresServerMocks.headers = new Headers();
    queueDualAuthSession({ user: { id: "test-user" } });
    mocks.parseActionRequest.mockResolvedValueOnce({ contact_id: "2", audience_id: "3" });
    mocks.findAudienceWorkspaceById.mockResolvedValueOnce("test-workspace-id");
    mocks.removeContactFromAudience.mockRejectedValueOnce(new Error("nope"));

    const mod = await import("../app/routes/api+/contact-audience");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/contact-audience", { method: "DELETE" }),
    } as any));
    expect(res.status).toBe(500);
    expect(mocks.createErrorResponse).toHaveBeenCalled();
  });

  test("non-DELETE returns json(undefined) with headers", async () => {
    postgresServerMocks.headers = new Headers({ "X": "1" });
    queueDualAuthSession({ user: { id: "test-user" } });
    const mod = await import("../app/routes/api+/contact-audience");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/contact-audience", { method: "POST" }),
    } as any));
    expect(res.status).toBe(200);
    expect(res.headers.get("X")).toBe("1");
    await expect(res.text()).resolves.toBe("");
  });
});

