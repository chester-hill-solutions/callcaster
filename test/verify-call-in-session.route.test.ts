import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse, withRouteUrl } from "./helpers/route-result";
import { queueJsonAuthSession } from "./helpers/route-auth-mock";

const mocks = vi.hoisted(() => ({
  env: {
    VERIFICATION_PHONE_NUMBER: vi.fn(),
  },
  insertVerificationSession: vi.fn(),
}));

vi.mock("@/lib/env.server", () => ({ env: mocks.env }));
vi.mock("@/lib/verification-db.server", () => ({
  insertVerificationSession: (...args: unknown[]) => mocks.insertVerificationSession(...args),
}));
vi.mock("@/lib/auth.server", () => ({
  getSession: () => ({ headers: new Headers() }),
}));

describe("app/routes/api+/verify-call-in-session/route.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.env.VERIFICATION_PHONE_NUMBER.mockReset();
    mocks.insertVerificationSession.mockReset();
  });

  test("loader returns 401 when user missing", async () => {
    queueJsonAuthSession({
      headers: new Headers(),
      user: null,
    });
    mocks.env.VERIFICATION_PHONE_NUMBER.mockReturnValue("+15550001111");

    const mod = await import("../app/routes/api+/verify-call-in-session");
    const res = await asRouteResponse(await mod.loader(withRouteUrl({
      request: new Request(
        "http://x/api/verify-call-in-session?phoneNumber=+15551234567"
      ),
    } as never)));
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  test("loader returns 503 when VERIFICATION_PHONE_NUMBER not configured", async () => {
    queueJsonAuthSession({
      headers: new Headers(),
      user: { id: "u1" },
    });
    mocks.env.VERIFICATION_PHONE_NUMBER.mockReturnValue(undefined);

    const mod = await import("../app/routes/api+/verify-call-in-session");
    const res = await asRouteResponse(await mod.loader(withRouteUrl({
      request: new Request(
        "http://x/api/verify-call-in-session?phoneNumber=+15551234567"
      ),
    } as never)));
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({
      error: "Call-in verification is not configured",
    });
  });

  test("loader returns 400 when phoneNumber missing", async () => {
    queueJsonAuthSession({
      headers: new Headers(),
      user: { id: "u1" },
    });
    mocks.env.VERIFICATION_PHONE_NUMBER.mockReturnValue("+15550001111");

    const mod = await import("../app/routes/api+/verify-call-in-session");
    const res = await asRouteResponse(await mod.loader(withRouteUrl({
      request: new Request("http://x/api/verify-call-in-session"),
    } as never)));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Valid phone number is required",
    });
  });

  test("loader returns 400 when phoneNumber invalid", async () => {
    queueJsonAuthSession({
      headers: new Headers(),
      user: { id: "u1" },
    });
    mocks.env.VERIFICATION_PHONE_NUMBER.mockReturnValue("+15550001111");

    const mod = await import("../app/routes/api+/verify-call-in-session");
    const res = await asRouteResponse(await mod.loader(withRouteUrl({
      request: new Request(
        "http://x/api/verify-call-in-session?phoneNumber=123"
      ),
    } as never)));
    expect(res.status).toBe(400);
  });

  test("loader success creates session and returns phone number", async () => {
    queueJsonAuthSession({
      headers: new Headers(),
      user: { id: "u1" },
    });
    mocks.env.VERIFICATION_PHONE_NUMBER.mockReturnValue("+15550001111");
    mocks.insertVerificationSession.mockResolvedValueOnce({
      id: "vs-abc",
      userId: "u1",
      expectedCaller: "+15551234567",
      status: "pending",
      expiresAt: "2025-03-11T12:00:00Z",
      createdAt: "2025-03-11T11:50:00Z",
    });

    const mod = await import("../app/routes/api+/verify-call-in-session");
    const res = await asRouteResponse(await mod.loader(withRouteUrl({
      request: new Request(
        "http://x/api/verify-call-in-session?phoneNumber=%2B15551234567"
      ),
    } as never)));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({
      success: true,
      verificationId: "vs-abc",
      phoneNumber: "+15550001111",
    });
    expect(data.expiresAt).toBeDefined();
    expect(mocks.insertVerificationSession).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u1",
        expectedCaller: "+15551234567",
      }),
    );
  });

  test("loader returns 500 when insert fails", async () => {
    queueJsonAuthSession({
      headers: new Headers(),
      user: { id: "u1" },
    });
    mocks.env.VERIFICATION_PHONE_NUMBER.mockReturnValue("+15550001111");
    mocks.insertVerificationSession.mockRejectedValueOnce(new Error("db error"));

    const mod = await import("../app/routes/api+/verify-call-in-session");
    const res = await asRouteResponse(await mod.loader(withRouteUrl({
      request: new Request(
        "http://x/api/verify-call-in-session?phoneNumber=%2B15551234567"
      ),
    } as never)));

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "db error" });
  });
});
