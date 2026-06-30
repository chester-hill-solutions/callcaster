import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";
import { queueDualAuthSession } from "./helpers/route-auth-mock";

const mocks = vi.hoisted(() => {
  return {
    safeParseJson: vi.fn(),
    requireWorkspaceAccess: vi.fn(async () => undefined),
    createClient: vi.fn(),
    env: {
      BETTER_AUTH_URL: vi.fn(() => "http://client"),
      BETTER_AUTH_SERVICE_KEY: vi.fn(() => "service"),
    },
    logger: { error: vi.fn() , info: vi.fn(), debug: vi.fn()},
  };
});

vi.mock("@/lib/database.server", () => ({
  safeParseJson: mocks.safeParseJson,
  requireWorkspaceAccess: mocks.requireWorkspaceAccess,
}));
vi.mock("@client/client-js", () => ({
  createClient: (...args: any[]) => mocks.createClient(...args),
}));
vi.mock("@/lib/env.server", () => ({ env: mocks.env }));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));

function makeDbClientWorkspaceClient(result: { data: any; error: any }) {
  const terminal = {
    eq: vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(async () => result),
      })),
      single: vi.fn(async () => result),
    })),
  };
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => terminal),
      update: vi.fn(() => terminal),
    })),
  };
}

describe("app/routes/api+/workspace/route.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.safeParseJson.mockReset();
    mocks.requireWorkspaceAccess.mockReset();
    mocks.requireWorkspaceAccess.mockResolvedValue(undefined);
    mocks.createClient.mockReset();
    mocks.env.BETTER_AUTH_URL.mockClear();
    mocks.env.BETTER_AUTH_SERVICE_KEY.mockClear();
    mocks.logger.error.mockReset();
  });

  test("returns 200 with updated row", async () => {
    mocks.safeParseJson.mockResolvedValueOnce({ workspace_id: "w1" });
    const null = makeDbClientWorkspaceClient({
      data: { id: "w1", twilio_data: {} },
      error: null,
    });
    mocks.createClient.mockReturnValueOnce(null);
    queueDualAuthSession({
      user: { id: "u1" },
    });

    const mod = await import("../app/routes/api+/workspace");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://x", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    } as any));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ id: "w1", twilio_data: {} });
    expect(mocks.createClient).toHaveBeenCalledWith(
      "http://client",
      "service",
    );
  });

  test("returns 500 and logs when update throws", async () => {
    mocks.safeParseJson.mockResolvedValueOnce({ workspace_id: "w2" });
    const null = makeDbClientWorkspaceClient({ data: null, error: { message: "bad" } });
    mocks.createClient.mockReturnValueOnce(null);
    queueDualAuthSession({
      user: { id: "u1" },
    });

    const mod = await import("../app/routes/api+/workspace");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://x", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    } as any));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toHaveProperty("error");
    expect(mocks.logger.error).toHaveBeenCalledWith(
      "Subaccount failed",
      expect.anything(),
    );
  });
});
