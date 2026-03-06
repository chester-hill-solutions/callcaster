import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    verifyAuth: vi.fn(),
    requireWorkspaceAccess: vi.fn(),
    logger: { error: vi.fn() },
    hashApiKeyForStorage: vi.fn((k: string) => `hash:${k}`),
    API_KEY_PREFIX_LENGTH: 8,
    randomBytes: vi.fn((len: number) => Buffer.alloc(len, 1)),
  };
});

vi.mock("@/lib/supabase.server", () => ({
  verifyAuth: (...args: any[]) => mocks.verifyAuth(...args),
}));
vi.mock("@/lib/database.server", () => ({
  requireWorkspaceAccess: (...args: any[]) => mocks.requireWorkspaceAccess(...args),
}));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));
vi.mock("@/lib/api-auth.server", () => ({
  hashApiKeyForStorage: (...args: any[]) => mocks.hashApiKeyForStorage(...args),
  API_KEY_PREFIX_LENGTH: mocks.API_KEY_PREFIX_LENGTH,
}));
vi.mock("crypto", () => ({
  randomBytes: (...args: any[]) => mocks.randomBytes(...args),
}));

function makeSupabase(opts: {
  list?: { data: any; error: any };
  insert?: { data: any; error: any };
  deleteError?: any;
}) {
  return {
    from: vi.fn((table: string) => {
      if (table === "workspace_api_key") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(async () => opts.list ?? { data: [], error: null }),
            })),
          })),
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => opts.insert ?? { data: { id: "k1", name: "N", key_prefix: "cc_live_", created_at: "t" }, error: null }),
            })),
          })),
          delete: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(async () => ({ error: opts.deleteError ?? null })),
            })),
          })),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    }),
  };
}

describe("app/routes/api.workspace-api-keys.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.verifyAuth.mockReset();
    mocks.requireWorkspaceAccess.mockReset();
    mocks.logger.error.mockReset();
    mocks.hashApiKeyForStorage.mockClear();
    mocks.randomBytes.mockClear();
  });

  test("loader 400s when workspace_id missing", async () => {
    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient: makeSupabase({}),
      user: { id: "u1" },
    });
    const mod = await import("../app/routes/api.workspace-api-keys");
    const res = await mod.loader({ request: new Request("http://x/api/workspace-api-keys") } as any);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "workspace_id is required" });
  });

  test("loader 500s when select errors; success returns keys ?? []", async () => {
    const mod = await import("../app/routes/api.workspace-api-keys");

    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient: makeSupabase({ list: { data: null, error: { message: "bad" } } }),
      user: { id: "u1" },
    });
    mocks.requireWorkspaceAccess.mockResolvedValueOnce(undefined);
    const r1 = await mod.loader({
      request: new Request("http://x/api/workspace-api-keys?workspace_id=w1"),
    } as any);
    expect(r1.status).toBe(500);
    await expect(r1.json()).resolves.toEqual({ error: "bad" });
    expect(mocks.logger.error).toHaveBeenCalledWith("Error listing API keys:", expect.anything());

    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient: makeSupabase({ list: { data: null, error: null } }),
      user: { id: "u1" },
    });
    mocks.requireWorkspaceAccess.mockResolvedValueOnce(undefined);
    const r2 = await mod.loader({
      request: new Request("http://x/api/workspace-api-keys?workspace_id=w1"),
    } as any);
    expect(r2.status).toBe(200);
    await expect(r2.json()).resolves.toEqual({ keys: [] });
  });

  test("action POST validates body (including json catch) and creates key; errors 500", async () => {
    const mod = await import("../app/routes/api.workspace-api-keys");

    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient: makeSupabase({}), user: { id: "u1" } });
    const badJson = new Request("http://x", { method: "POST", body: "nope", headers: { "Content-Type": "application/json" } });
    const r0 = await mod.action({ request: badJson } as any);
    expect(r0.status).toBe(400);

    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient: makeSupabase({}), user: { id: "u1" } });
    const r1 = await mod.action({
      request: new Request("http://x", { method: "POST", body: JSON.stringify({ workspace_id: "w1", name: "  " }) }),
    } as any);
    expect(r1.status).toBe(400);

    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient: makeSupabase({
        insert: { data: { id: "id1", name: "Name", key_prefix: "cc_live_", created_at: "t" }, error: null },
      }),
      user: { id: "u1" },
    });
    mocks.requireWorkspaceAccess.mockResolvedValueOnce(undefined);
    const r2 = await mod.action({
      request: new Request("http://x", { method: "POST", body: JSON.stringify({ workspace_id: "w1", name: " Name " }) }),
    } as any);
    expect(r2.status).toBe(201);
    const b2 = await r2.json();
    expect(b2.key).toMatch(/^cc_live_/);
    expect(b2).toMatchObject({ id: "id1", name: "Name", key_prefix: "cc_live_", created_at: "t" });

    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient: makeSupabase({
        insert: { data: null, error: { message: "ins" } },
      }),
      user: { id: "u1" },
    });
    mocks.requireWorkspaceAccess.mockResolvedValueOnce(undefined);
    const r3 = await mod.action({
      request: new Request("http://x", { method: "POST", body: JSON.stringify({ workspace_id: "w1", name: "Name" }) }),
    } as any);
    expect(r3.status).toBe(500);
    await expect(r3.json()).resolves.toEqual({ error: "ins" });
  });

  test("action DELETE validates body and deletes; errors 500; other method 405", async () => {
    const mod = await import("../app/routes/api.workspace-api-keys");

    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient: makeSupabase({}), user: { id: "u1" } });
    const r0 = await mod.action({
      request: new Request("http://x", { method: "DELETE", body: JSON.stringify({}) }),
    } as any);
    expect(r0.status).toBe(400);

    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient: makeSupabase({}), user: { id: "u1" } });
    const badJson = new Request("http://x", {
      method: "DELETE",
      body: "nope",
      headers: { "Content-Type": "application/json" },
    });
    const r0b = await mod.action({ request: badJson } as any);
    expect(r0b.status).toBe(400);

    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient: makeSupabase({ deleteError: { message: "del" } }),
      user: { id: "u1" },
    });
    mocks.requireWorkspaceAccess.mockResolvedValueOnce(undefined);
    const r1 = await mod.action({
      request: new Request("http://x", { method: "DELETE", body: JSON.stringify({ id: "k1", workspace_id: "w1" }) }),
    } as any);
    expect(r1.status).toBe(500);
    await expect(r1.json()).resolves.toEqual({ error: "del" });

    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient: makeSupabase({ deleteError: null }),
      user: { id: "u1" },
    });
    mocks.requireWorkspaceAccess.mockResolvedValueOnce(undefined);
    const r2 = await mod.action({
      request: new Request("http://x", { method: "DELETE", body: JSON.stringify({ id: "k1", workspace_id: "w1" }) }),
    } as any);
    expect(r2.status).toBe(200);
    await expect(r2.json()).resolves.toEqual({ success: true });

    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient: makeSupabase({}), user: { id: "u1" } });
    const r3 = await mod.action({ request: new Request("http://x", { method: "PUT" }) } as any);
    expect(r3.status).toBe(405);
  });
});

