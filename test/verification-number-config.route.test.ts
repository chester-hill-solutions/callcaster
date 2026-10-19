import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { RouterContextProvider } from "react-router";
import { asRouteResponse, withRouteUrl } from "./helpers/route-result";
import { setJsonAuthSession } from "./helpers/route-auth-mock";
import type { insertVerificationSession } from "@/lib/verification-db.server";

vi.hoisted(() => { process.env.TZ = "UTC"; });
const mocks = vi.hoisted(() => ({ insert: vi.fn(), active: vi.fn() }));
vi.mock("@/lib/auth.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth.server")>()),
  getSession: vi.fn(async () => ({ headers: new Headers({ "x-session-fixture": "retained" }) })),
}));
vi.mock("@/lib/verification-db.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/verification-db.server")>()),
  insertVerificationSession: (...args: unknown[]) => mocks.insert(...args),
}));
vi.mock("@/lib/verification-number.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/verification-number.server")>()),
  getActiveVerificationNumber: (...args: unknown[]) => mocks.active(...args),
}));

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-03T13:00:00Z"));
  mocks.insert.mockReset();
  mocks.insert.mockImplementation(async (args: Parameters<typeof insertVerificationSession>[0]) => ({ id: args.id }));
  mocks.active.mockReset();
  mocks.active.mockResolvedValue("+18005550199");
  setJsonAuthSession({ user: { id: "verification-user" }, headers: new Headers() });
});
afterEach(() => {
  vi.useRealTimers();
});
async function load(phoneNumber: string | null = "+15551234567") {
  const { loader } = await import("../app/routes/api+/verify-call-in-session.loader.server");
  const url = new URL("http://localhost/api/verify-call-in-session");
  if (phoneNumber !== null) url.searchParams.set("phoneNumber", phoneNumber);
  return asRouteResponse(loader(withRouteUrl({
    request: new Request(url), params: {}, context: new RouterContextProvider(),
  })));
}

describe("call-in verification reads the active registered number (#2519)", () => {
  test("no active number returns 503 without a session write", async () => {
    mocks.active.mockResolvedValue(null);
    const response = await load();
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Call-in verification is not configured" });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  test("the active number keeps the session, caller and expiry contract", async () => {
    const response = await load();
    expect(response.status).toBe(200);
    expect(response.headers.get("x-session-fixture")).toBe("retained");
    const payload = await response.json();
    expect(payload).toEqual({
      success: true, verificationId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      phoneNumber: "+18005550199", expiresAt: "2026-10-03T13:10:00.000Z",
    });
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(mocks.insert).toHaveBeenCalledWith({
      id: payload.verificationId, userId: "verification-user", expectedCaller: "+15551234567",
      createdAt: "2026-10-03T13:00:00.000Z", expiresAt: "2026-10-03T13:10:00.000Z",
    });
  });

  test.each([null, "123"])("an active number refuses invalid caller %s without a write", async (phoneNumber) => {
    const response = await load(phoneNumber);
    expect(response.status).toBe(400);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  test("unauthenticated request remains 401 before the configuration read", async () => {
    mocks.active.mockResolvedValue(null);
    setJsonAuthSession({ user: null, headers: new Headers() });
    const response = await load();
    expect(response.status).toBe(401);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  test("an active number returns an error if the session writer fails", async () => {
    mocks.insert.mockRejectedValueOnce(new Error("fixture write failed"));
    const response = await load();
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "fixture write failed" });
  });
});
