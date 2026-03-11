import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyAuth: vi.fn(),
  syncWorkspaceTwilioSnapshot: vi.fn(),
}));

vi.mock("@/lib/supabase.server", () => ({
  verifyAuth: (...args: any[]) => mocks.verifyAuth(...args),
}));

vi.mock("@/lib/database.server", async () => {
  const actual = await vi.importActual("../app/lib/database.server");
  return {
    ...actual,
    syncWorkspaceTwilioSnapshot: (...args: any[]) => mocks.syncWorkspaceTwilioSnapshot(...args),
  };
});

function makeSupabase() {
  const workspaceUpdateEq = vi.fn(async () => ({ error: null }));
  const workspaceUpdate = vi.fn(() => ({ eq: workspaceUpdateEq }));

  return {
    from: vi.fn((table: string) => {
      if (table === "user") {
        return {
          select: () => ({
            eq: () => ({
              single: vi.fn(async () => ({
                data: { id: "u1", access_level: "sudo", username: "sudo@example.com" },
                error: null,
              })),
            }),
          }),
        };
      }

      if (table === "workspace") {
        return {
          update: workspaceUpdate,
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
    _spies: { workspaceUpdateEq },
  };
}

describe("app/routes/admin.tsx action", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.verifyAuth.mockReset();
    mocks.syncWorkspaceTwilioSnapshot.mockReset();
  });

  test("sync_workspace_twilio runs direct sync helper", async () => {
    const supabaseClient = makeSupabase();
    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient,
      user: { id: "u1" },
    });
    mocks.syncWorkspaceTwilioSnapshot.mockResolvedValueOnce({});

    const mod = await import("../app/routes/admin");
    const formData = new FormData();
    formData.set("_action", "sync_workspace_twilio");
    formData.set("workspaceId", "w1");

    const res = await mod.action({
      request: new Request("http://x", { method: "POST", body: formData }),
    } as any);

    expect(res.status).toBe(200);
    expect(mocks.syncWorkspaceTwilioSnapshot).toHaveBeenCalledWith({
      supabaseClient,
      workspaceId: "w1",
    });
  });

  test("toggle_workspace_status updates workspace disabled flag", async () => {
    const supabaseClient = makeSupabase();
    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient,
      user: { id: "u1" },
    });

    const mod = await import("../app/routes/admin");
    const formData = new FormData();
    formData.set("_action", "toggle_workspace_status");
    formData.set("workspaceId", "w2");
    formData.set("currentStatus", "false");

    const res = await mod.action({
      request: new Request("http://x", { method: "POST", body: formData }),
    } as any);

    expect(res.status).toBe(200);
    expect(supabaseClient._spies.workspaceUpdateEq).toHaveBeenCalledWith("id", "w2");
  });
});
