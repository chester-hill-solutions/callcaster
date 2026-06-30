import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";

vi.hoisted(() => {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? "postgres://local:test@127.0.0.1:5432/test";
});

const postgresServerMocks = vi.hoisted(() => ({ headers: new Headers() }));
const mocks = vi.hoisted(() => {
  return {
    requireDualAuth: vi.fn(),
    getDualAuthPostgres: vi.fn(() => ({})),
    parseActionRequest: vi.fn(),
    removeContactFromAudience: vi.fn(),
    createErrorResponse: vi.fn((e: unknown) =>
      new Response(String(e instanceof Error ? e.message : e), { status: 500 }),
    ),
  };
});

vi.mock("@/lib/api-auth.server", () => ({
  requireDualAuth: (...args: unknown[]) => mocks.requireDualAuth(...args),
  getDualAuthPostgres: (...args: unknown[]) => mocks.null /* removed */ (...args),
  getDualAuthUser: vi.fn(),
}));

vi.mock("../app/lib/adminDb.server", () => ({
  getSession: () => ({ headers: postgresServerMocks.headers,
  }),
}));
vi.mock("../app/lib/database.server", () => ({
  parseActionRequest: (...args: unknown[]) => mocks.parseActionRequest(...args),
  removeContactFromAudience: (...args: unknown[]) => mocks.removeContactFromAudience(...args),
}));
vi.mock("@/lib/errors.server", () => ({
  createErrorResponse: (...args: unknown[]) => mocks.createErrorResponse(...args),
}));

describe("app/routes/api+/contact-audience/route.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.requireDualAuth.mockReset();
    mocks.parseActionRequest.mockReset();
    mocks.removeContactFromAudience.mockReset();
    mocks.createErrorResponse.mockClear();
  });

  test("DELETE returns 400 when ids missing", async () => {
    postgresServerMocks.headers = new Headers({ "X-Test": "1" });
    mocks.requireDualAuth.mockResolvedValueOnce({ authType: "session" });
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
    mocks.requireDualAuth.mockResolvedValueOnce({ authType: "session" });
    mocks.parseActionRequest.mockResolvedValueOnce({ contact_id: "2", audience_id: "3" });
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
    mocks.requireDualAuth.mockResolvedValueOnce({ authType: "session" });
    mocks.parseActionRequest.mockResolvedValueOnce({ contact_id: "2", audience_id: "3" });
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
    mocks.requireDualAuth.mockResolvedValueOnce({ authType: "session" });
    const mod = await import("../app/routes/api+/contact-audience");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/contact-audience", { method: "POST" }),
    } as any));
    expect(res.status).toBe(200);
    expect(res.headers.get("X")).toBe("1");
    await expect(res.text()).resolves.toBe("");
  });
});

