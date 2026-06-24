import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";
import { queueJsonAuthSession } from "./helpers/route-auth-mock";

const mocks = vi.hoisted(() => ({
  safeParseJson: vi.fn(),
}));

vi.mock("@/lib/supabase.server", () => ({
  createSupabaseServerClient: () => ({
    supabaseClient: {},
    headers: new Headers({ "Set-Cookie": "x=1" }),
  }),
}));
vi.mock("@/lib/database.server", () => ({
  requireWorkspaceAccess: vi.fn(async () => undefined),
  safeParseJson: (...args: unknown[]) => mocks.safeParseJson(...args),
}));

function makeSupabase(updateResult: { data: unknown; error: { message: string } | null }) {
  return {
    from: vi.fn((table: string) => {
      if (table === "outreach_attempt") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({ data: { workspace: "w1" }, error: null })),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(async () => updateResult),
              })),
            })),
          })),
        };
      }
      throw new Error(`unexpected table ${table}`);
    }),
  };
}

describe("app/routes/api+/outreach_attempts/$id/route.js", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.safeParseJson.mockReset();
  });

  test("returns json({ error }) when update errors", async () => {
    const supabase = makeSupabase({ data: null, error: { message: "bad" } });
    queueJsonAuthSession({ supabaseClient: supabase, user: { id: "u1" } });
    mocks.safeParseJson.mockResolvedValueOnce({ update: { a: 1 } });

    const mod = await import("../app/routes/api+/outreach_attempts/$id.route");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/outreach_attempts/1", { method: "POST" }),
      params: { id: "1" },
    } as any));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "bad" });
  });

  test("returns data with headers on success", async () => {
    const supabase = makeSupabase({ data: { id: 1 }, error: null });
    queueJsonAuthSession({ supabaseClient: supabase, user: { id: "u1" } });
    mocks.safeParseJson.mockResolvedValueOnce({ update: { disposition: "completed" } });

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
