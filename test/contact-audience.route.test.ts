import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";
import { queueDualAuthSession } from "./helpers/route-auth-mock";
const supabaseServerMocks = vi.hoisted(() => ({ headers: new Headers() }));
const mocks = vi.hoisted(() => {
  return {
    parseActionRequest: vi.fn(),
    removeContactFromAudience: vi.fn(),
    createErrorResponse: vi.fn((e: any) => new Response(String(e?.message ?? e), { status: 500 })),
  };
});

vi.mock("../app/lib/supabase.server", () => ({
  createSupabaseServerClient: () => ({
    supabaseClient: {},
    headers: supabaseServerMocks.headers,
  }),
}));
vi.mock("../app/lib/database.server", () => ({
  parseActionRequest: (...args: any[]) => mocks.parseActionRequest(...args),
  removeContactFromAudience: (...args: any[]) => mocks.removeContactFromAudience(...args),
}));
vi.mock("@/lib/errors.server", () => ({
  createErrorResponse: (...args: any[]) => mocks.createErrorResponse(...args),
}));

describe("app/routes/api+/contact-audience/route.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.parseActionRequest.mockReset();
    mocks.removeContactFromAudience.mockReset();
    mocks.createErrorResponse.mockClear();
  });

  test("DELETE returns 400 when ids missing", async () => {
    supabaseServerMocks.headers = new Headers({ "X-Test": "1" });
    queueDualAuthSession({
      supabaseClient: {},
      headers: supabaseServerMocks.headers,
    });
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
    supabaseServerMocks.headers = headers;
    const supabaseClient = {};
    queueDualAuthSession({ supabaseClient, headers });
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
    supabaseServerMocks.headers = new Headers();
    queueDualAuthSession({ supabaseClient: {}, headers: new Headers() });
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
    supabaseServerMocks.headers = new Headers({ "X": "1" });
    queueDualAuthSession({ supabaseClient: {}, headers: new Headers({ "X": "1" }) });
    const mod = await import("../app/routes/api+/contact-audience");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/contact-audience", { method: "POST" }),
    } as any));
    expect(res.status).toBe(200);
    expect(res.headers.get("X")).toBe("1");
    await expect(res.text()).resolves.toBe("");
  });
});

