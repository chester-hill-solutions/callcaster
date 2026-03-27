import { describe, expect, test, vi } from "vitest";

// Mocks must be declared before importing the modules under test.
const requireWorkspaceAccess = vi.fn(async () => undefined);

// Avoid env validation noise when importing server modules in tests.
vi.mock("@/lib/env.server", () => {
  const handler = {
    get: () => () => "test",
  };
  return { env: new Proxy({}, handler) };
});

vi.mock("@/lib/database.server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/database.server")>(
    "@/lib/database.server",
  );
  return {
    ...actual,
    requireWorkspaceAccess,
  };
});

vi.mock("@/lib/supabase.server", () => {
  return {
    verifyAuth: vi.fn(async () => {
      const supabaseClient: any = {
        storage: {
          from: () => ({
            download: async () => ({
              data: new Blob([JSON.stringify({ status: "processing" })], {
                type: "application/json",
              }),
              error: null,
            }),
          }),
        },
      };

      supabaseClient.from = (table: string) => {
        if (table === "audience") {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: { workspace: "w1" },
                  error: null,
                }),
              }),
            }),
          };
        }

        if (table === "contact_audience") {
          const builder: any = {};
          builder.select = () => builder;
          builder.eq = () => builder;
          builder.or = () => builder;
          builder.order = () => builder;
          // make the query awaitable (thenable)
          builder.then = (resolve: any, reject: any) =>
            Promise.resolve({
              data: [{ id: 1, other_data: null }],
              error: null,
            }).then(resolve, reject);
          return builder;
        }

        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: null, error: null }),
            }),
          }),
        };
      };
      return {
        supabaseClient,
        headers: new Headers(),
        user: { id: "u1" },
      };
    }),
  };
});

describe("export endpoints authz", () => {
  test("campaign-export-status enforces workspace access", async () => {
    requireWorkspaceAccess.mockClear();
    const mod = await import("../app/routing/api/api.campaign-export-status");
    const request = new Request(
      "http://localhost/api/campaign-export-status?exportId=e1&workspaceId=w1",
    );
    const res = await mod.loader({ request } as any);
    expect(res.status).toBe(200);
    expect(requireWorkspaceAccess).toHaveBeenCalledTimes(1);
    expect(requireWorkspaceAccess).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "w1" }),
    );
  });

  test("api.audiences CSV export enforces workspace access via audience workspace", async () => {
    requireWorkspaceAccess.mockClear();
    const mod = await import("../app/routing/api/api.audiences");
    const request = new Request(
      "http://localhost/api/audiences?returnType=csv&audienceId=123",
    );
    const res = await mod.loader({ request } as any);
    // loader returns a Response for CSV downloads
    expect(res.status).toBe(200);
    expect(requireWorkspaceAccess).toHaveBeenCalled();
  });

  test("api.campaign-export enforces workspace access for requested workspaceId", async () => {
    requireWorkspaceAccess.mockClear();
    const mod = await import("../app/routing/api/api.campaign-export");
    const fd = new FormData();
    fd.set("campaignId", "123");
    fd.set("workspaceId", "w1");
    const request = new Request("http://localhost/api/campaign-export", {
      method: "POST",
      body: fd,
    });
    const res = await mod.action({ request } as any);
    // our mock supabase returns campaign not found -> 404, but authz must still run
    expect(res.status).toBe(404);
    expect(requireWorkspaceAccess).toHaveBeenCalledTimes(1);
    expect(requireWorkspaceAccess).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "w1" }),
    );
  });
});

