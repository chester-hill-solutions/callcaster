import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    safeParseJson: vi.fn(),
    requireWorkspaceAccess: vi.fn(async () => undefined),
    createClient: vi.fn(),
    env: {
      SUPABASE_URL: vi.fn(() => "http://supabase"),
      SUPABASE_SERVICE_KEY: vi.fn(() => "service"),
    },
    logger: { error: vi.fn() },
  };
});

vi.mock("@/lib/database.server", () => ({
  safeParseJson: mocks.safeParseJson,
  requireWorkspaceAccess: mocks.requireWorkspaceAccess,
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: any[]) => mocks.createClient(...args),
}));
vi.mock("@/lib/env.server", () => ({ env: mocks.env }));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));
vi.mock("@/lib/supabase.server", () => ({
  verifyAuth: vi.fn(async () => ({
    supabaseClient: {},
    user: { id: "u1" },
    headers: new Headers(),
  })),
}));

function makeWorkspaceSupabase(args: {
  fetchRow: { data: any; error: any };
  updateResult: { data: any; error: any };
}) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(async () => args.fetchRow),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(async () => args.updateResult),
          })),
        })),
      })),
    })),
  };
}

describe("app/routes/api.workspace.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.safeParseJson.mockReset();
    mocks.requireWorkspaceAccess.mockReset();
    mocks.requireWorkspaceAccess.mockResolvedValue(undefined);
    mocks.createClient.mockReset();
    mocks.env.SUPABASE_URL.mockClear();
    mocks.env.SUPABASE_SERVICE_KEY.mockClear();
    mocks.logger.error.mockReset();
  });

  test("returns 200 with updated row", async () => {
    mocks.safeParseJson.mockResolvedValueOnce({
      workspace_id: "w1",
      update: { brand: "acme" },
    });
    mocks.createClient.mockReturnValueOnce(
      makeWorkspaceSupabase({
        fetchRow: {
          data: { id: "w1", twilio_data: { existing: true } },
          error: null,
        },
        updateResult: {
          data: { id: "w1", twilio_data: { existing: true, brand: "acme" } },
          error: null,
        },
      }),
    );

    const mod = await import("../app/routing/api/api.workspace");
    const res = await mod.action({
      request: new Request("http://x", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    } as any);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      id: "w1",
      twilio_data: { existing: true, brand: "acme" },
    });
    expect(mocks.createClient).toHaveBeenCalledWith(
      "http://supabase",
      "service",
    );
  });

  test("returns 500 and logs when update throws", async () => {
    mocks.safeParseJson.mockResolvedValueOnce({
      workspace_id: "w2",
      update: { name: "x" },
    });
    mocks.createClient.mockReturnValueOnce(
      makeWorkspaceSupabase({
        fetchRow: {
          data: { id: "w2", twilio_data: {} },
          error: null,
        },
        updateResult: { data: null, error: { message: "bad" } },
      }),
    );

    const mod = await import("../app/routing/api/api.workspace");
    const res = await mod.action({
      request: new Request("http://x", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    } as any);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toHaveProperty("error");
    expect(mocks.logger.error).toHaveBeenCalledWith(
      "Subaccount failed",
      expect.anything(),
    );
  });
});
