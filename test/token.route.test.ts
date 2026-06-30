import { beforeEach, describe, expect, test, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? "postgres://test:test@localhost:5432/test";
});

import { asRouteResponse } from "./helpers/route-result";
import { queueJsonAuthSession } from "./helpers/route-auth-mock";

const mocks = vi.hoisted(() => ({
  requireWorkspaceAccess: vi.fn(),
  generateToken: vi.fn(),
  getWorkspaceById: vi.fn(),
  createErrorResponse: vi.fn((_error: unknown, message?: string, status = 500) =>
    Response.json({ error: message ?? "Unknown error" }, { status }),
  ),
  env: { TWILIO_APP_SID: vi.fn(() => "AP123") },
}));

vi.mock("@/lib/supabase.server", () => ({
  createSupabaseServerClient: () => ({
    supabaseClient: {},
    headers: new Headers(),
  }),
}));
vi.mock("@/lib/database.server", () => ({
  requireWorkspaceAccess: (...args: unknown[]) => mocks.requireWorkspaceAccess(...args),
}));
vi.mock("@/lib/twilio-token.server", () => ({
  generateToken: (...args: unknown[]) => mocks.generateToken(...args),
}));
vi.mock("@/lib/errors.server", () => ({
  createErrorResponse: (...args: unknown[]) => mocks.createErrorResponse(...args),
}));
vi.mock("@/lib/workspace-members-db.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/workspace-members-db.server")>();
  return {
    ...actual,
    getWorkspaceById: (...args: unknown[]) => mocks.getWorkspaceById(...args),
  };
});
vi.mock("@/lib/env.server", () => ({ env: mocks.env }));
vi.mock("@/lib/logger.server", () => ({
  logger: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

describe("app/routes/api+/token/route.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.requireWorkspaceAccess.mockReset();
    mocks.generateToken.mockReset();
    mocks.getWorkspaceById.mockReset();
    mocks.generateToken.mockResolvedValue("jwt-token");
    mocks.createErrorResponse.mockClear();
    mocks.env.TWILIO_APP_SID.mockClear();
  });

  test("loader returns 404 when workspace missing", async () => {
    mocks.getWorkspaceById.mockResolvedValueOnce(null);
    queueJsonAuthSession({
      supabaseClient: {},
      user: { id: "u1" },
    });
    const mod = await import("../app/routes/api+/token");
    const res = await asRouteResponse(await mod.loader({
      request: new Request("http://localhost/api/token?id=u1&workspace=w1"),
    } as any));
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "workspace not found" });
  });

  test("loader rejects missing workspace", async () => {
    queueJsonAuthSession({
      supabaseClient: {},
      user: { id: "u1" },
    });
    const mod = await import("../app/routes/api+/token");
    const res = await asRouteResponse(await mod.loader({
      request: new Request("http://localhost/api/token"),
    } as any));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "workspace is required" });
  });

  test("loader generates token with authenticated user identity and logs debug", async () => {
    mocks.getWorkspaceById.mockResolvedValueOnce({
      twilio_data: { sid: "AC1" },
      key: "K",
      token: "S",
    });
    queueJsonAuthSession({
      supabaseClient: {},
      user: { id: "u1" },
    });
    const mod = await import("../app/routes/api+/token");
    const res = await asRouteResponse(await mod.loader({
      request: new Request("http://localhost/api/token?id=other-user&workspace=w1"),
    } as any));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ token: "jwt-token" });
    expect(mocks.generateToken).toHaveBeenCalledWith({
      twilioAccountSid: "AC1",
      twilioApiKey: "K",
      twilioApiSecret: "S",
      identity: "u1",
    });
    expect(mocks.requireWorkspaceAccess).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "w1", user: { id: "u1" } }),
    );
  });

  test("loader handles non-string sid and null key/token", async () => {
    mocks.getWorkspaceById.mockResolvedValueOnce({
      twilio_data: { sid: 123 },
      key: null,
      token: undefined,
    });
    queueJsonAuthSession({
      supabaseClient: {},
      user: { id: "me" },
    });
    const mod = await import("../app/routes/api+/token");
    const res = await asRouteResponse(await mod.loader({
      request: new Request("http://localhost/api/token?workspace=w1"),
    } as any));
    expect(res.status).toBe(200);
    expect(mocks.generateToken).toHaveBeenCalledWith({
      twilioAccountSid: "",
      twilioApiKey: "",
      twilioApiSecret: "",
      identity: "me",
    });
  });

  test("loader returns error response when requireWorkspaceAccess throws", async () => {
    mocks.getWorkspaceById.mockResolvedValueOnce({
      twilio_data: { sid: "AC1" },
      key: "K",
      token: "S",
    });
    queueJsonAuthSession({
      supabaseClient: {},
      user: { id: "u1" },
    });
    mocks.requireWorkspaceAccess.mockRejectedValueOnce(new Error("denied"));
    const mod = await import("../app/routes/api+/token");
    const res = await asRouteResponse(await mod.loader({
      request: new Request("http://localhost/api/token?workspace=w1"),
    } as any));
    expect(res.status).toBe(500);
  });
});
