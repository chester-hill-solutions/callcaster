import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";
import { queueJsonAuthSession } from "./helpers/route-auth-mock";

const supabaseServerMocks = vi.hoisted(() => ({ headers: new Headers() }));
const mocks = vi.hoisted(() => ({
  safeParseJson: vi.fn(),
}));

vi.mock("@/lib/supabase.server", () => ({
  createSupabaseServerClient: () => ({
    supabaseClient: {},
    headers: supabaseServerMocks.headers,
  }),
}));
vi.mock("@/lib/database.server", () => ({
  safeParseJson: (...args: unknown[]) => mocks.safeParseJson(...args),
}));

describe("app/routes/api+/outreach-attempts/route.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.safeParseJson.mockReset();
    supabaseServerMocks.headers = new Headers();
  });

  test("returns json({ error }) when rpc errors", async () => {
    supabaseServerMocks.headers = new Headers({ "Set-Cookie": "a=1" });
    const rpc = vi.fn().mockResolvedValueOnce({ data: null, error: { message: "nope" } });
    queueJsonAuthSession({
      supabaseClient: { rpc },
      headers: supabaseServerMocks.headers,
      user: { id: "u1" },
    });
    mocks.safeParseJson.mockResolvedValueOnce({ campaign_id: 1, contact_id: 2, queue_id: 3 });

    const mod = await import("../app/routes/api+/outreach-attempts");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/outreach-attempts", { method: "POST" }),
    } as any));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ error: { message: "nope" } });
    expect(rpc).toHaveBeenCalledWith("create_outreach_attempt", {
      con_id: 2,
      cam_id: 1,
      usr_id: "u1",
      wks_id: "",
      queue_id: 3,
    });
  });

  test("returns data with headers and handles missing user", async () => {
    supabaseServerMocks.headers = new Headers({ "Set-Cookie": "b=2" });
    const rpc = vi.fn().mockResolvedValueOnce({ data: 123, error: null });
    queueJsonAuthSession({
      supabaseClient: { rpc },
      headers: supabaseServerMocks.headers,
      user: { id: "" },
    });
    mocks.safeParseJson.mockResolvedValueOnce({ campaign_id: "10", contact_id: "20", queue_id: "30" });

    const mod = await import("../app/routes/api+/outreach-attempts");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/outreach-attempts", { method: "POST" }),
    } as any));

    expect(res.status).toBe(200);
    expect(res.headers.get("Set-Cookie")).toBe("b=2");
    await expect(res.json()).resolves.toEqual(123);
    expect(rpc).toHaveBeenCalledWith("create_outreach_attempt", {
      con_id: 20,
      cam_id: 10,
      usr_id: "",
      wks_id: "",
      queue_id: 30,
    });
  });
});
