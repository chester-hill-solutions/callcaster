import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";
import { queueDualAuthSession, setDualAuthSession, queueJsonAuthSession, setJsonAuthSession, queueSudoAuth, setSudoAuth } from "./helpers/route-auth-mock";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  verifyAuth: vi.fn(),
  safeParseJson: vi.fn(),
  requireWorkspaceAccess: vi.fn(),
  createErrorResponse: vi.fn(
    (error: unknown, message: string) =>
      new Response(JSON.stringify({ error: String(error), message }), {
        status: 500,
      }),
  ),
  logger: { error: vi.fn() , info: vi.fn(), debug: vi.fn()},
  env: {
    BETTER_AUTH_URL: () => "https://sb.example",
    BETTER_AUTH_SERVICE_KEY: () => "svc",
  },
}));

vi.mock("@client/client-js", () => ({
  createClient: mocks.createClient,
}));
vi.mock("@/lib/auth.server", () => ({
  verifyAuth: mocks.verifyAuth,
}));
vi.mock("@/lib/database.server", () => ({
  safeParseJson: mocks.safeParseJson,
  requireWorkspaceAccess: mocks.requireWorkspaceAccess,
}));
vi.mock("@/lib/errors.server", () => ({
  createErrorResponse: mocks.createErrorResponse,
}));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));
vi.mock("@/lib/env.server", () => ({ env: mocks.env }));

describe("app/routes/api+/workspace/route.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createClient.mockReset();
    mocks.safeParseJson.mockReset();
    mocks.requireWorkspaceAccess.mockReset();
    mocks.createErrorResponse.mockClear();
    mocks.logger.error.mockReset();

    setDualAuthSession({ user: { id: "u1" },
    });
    mocks.requireWorkspaceAccess.mockResolvedValue(undefined);
  });

  test("does not wipe twilio_data when update object is empty", async () => {
    const selectSingle = vi.fn(async () => ({
      data: { id: "w1", twilio_data: { authToken: "token" } },
      error: null,
    }));
    const updateSpy = vi.fn();

    mocks.createClient.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({ single: selectSingle }),
        }),
        update: updateSpy,
      }),
    });
    mocks.safeParseJson.mockResolvedValue({ workspace_id: "w1", update: {} });

    const mod = await import("../app/routes/api+/workspace");
    const response = await asRouteResponse(await mod.action({
      request: new Request("http://x", { method: "POST" }),
    } as any));

    expect(updateSpy).not.toHaveBeenCalled();
    expect(response.status).toEqual(expect.any(Number));
    await expect(response.json()).resolves.toMatchObject({
      id: "w1",
      twilio_data: { authToken: "token" },
    });
  });

  test("merges update fields into existing twilio_data", async () => {
    const selectSingle = vi.fn(async () => ({
      data: {
        id: "w1",
        twilio_data: { authToken: "token", accountSid: "AC1" },
      },
      error: null,
    }));
    const updatePayloads: unknown[] = [];
    const updateSingle = vi.fn(async () => ({
      data: {
        id: "w1",
        twilio_data: {
          authToken: "token",
          accountSid: "AC1",
          onboardingStatus: "enabled",
        },
      },
      error: null,
    }));

    mocks.createClient.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({ single: selectSingle }),
        }),
        update: (payload: unknown) => {
          updatePayloads.push(payload);
          return {
            eq: () => ({
              select: () => ({ single: updateSingle }),
            }),
          };
        },
      }),
    });
    mocks.safeParseJson.mockResolvedValue({
      workspace_id: "w1",
      update: { onboardingStatus: "enabled" },
    });

    const mod = await import("../app/routes/api+/workspace");
    await mod.action({
      request: new Request("http://x", { method: "POST" }),
    } as any);

    expect(updatePayloads).toHaveLength(1);
    expect(updatePayloads[0]).toEqual({
      twilio_data: {
        authToken: "token",
        accountSid: "AC1",
        onboardingStatus: "enabled",
      },
    });
  });
});
