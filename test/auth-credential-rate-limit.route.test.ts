import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { RouterContextProvider } from "react-router";
import { resetRateLimitsForTests } from "@/lib/platform-rate-limit.server";
import { asRouteResponse, withRouteUrl } from "./helpers/route-result";

const mocks = vi.hoisted(() => {
  process.env.TZ = "UTC";
  return {
    loginWithPassword: vi.fn(async () => ({
      ok: false,
      error: "Invalid credentials",
      status: 401,
    })),
    tokenLogin: vi.fn(async () => ({
      ok: false,
      error: "Invalid credentials",
      status: 401,
    })),
    registerUser: vi.fn(async () => ({
      ok: true,
      data: { user: { id: "fixture-user" } },
    })),
    forgotPassword: vi.fn(async () => ({ ok: true })),
    authHandler: vi.fn(async () =>
      Response.json({ error: "Invalid credentials" }, { status: 401 }),
    ),
  };
});

vi.mock("@/lib/platform-auth.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/platform-auth.server")>()),
  tokenLogin: mocks.tokenLogin,
  loginWithPassword: mocks.loginWithPassword,
  registerUser: mocks.registerUser,
  forgotPassword: mocks.forgotPassword,
}));
vi.mock("@/server/auth-instance", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/auth-instance")>()),
  auth: { handler: mocks.authHandler },
}));

async function post(path: string, ip = "203.0.113.17") {
  const request = new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({
      email: "rate-limit-proof@example.invalid",
      password: "fixture-only-password",
      name: "Rate limit fixture",
      token: "fixture-only-reset-token",
      otp: "123456",
      currentPassword: "fixture-only-password",
      newPassword: "fixture-only-new-password",
    }),
  });
  if (path === "/signin") {
    const formRequest = new Request(request.url, {
      method: "POST",
      headers: { "x-forwarded-for": ip },
      body: new URLSearchParams({
        email: "rate-limit-proof@example.invalid",
        password: "fixture-only-password",
      }),
    });
    const { action } = await import("../app/routes/signin.action.server");
    return asRouteResponse(
      action(
        withRouteUrl({
          request: formRequest,
          params: {},
          context: new RouterContextProvider(),
        }),
      ),
    );
  }
  const args = withRouteUrl({
    request,
    params: {},
    context: new RouterContextProvider(),
  });
  if (path === "/api/auth/token") {
    const { action } =
      await import("../app/routes/api+/auth/token.action.server");
    return asRouteResponse(action(args));
  }
  if (path === "/api/auth/register") {
    const { action } =
      await import("../app/routes/api+/auth/register.action.server");
    return asRouteResponse(action(args));
  }
  if (path === "/api/auth/forgot-password") {
    const { action } =
      await import("../app/routes/api+/auth/forgot-password.action.server");
    return asRouteResponse(action(args));
  }
  const { action } = await import("../app/routes/api+/auth/$.loader.server");
  return asRouteResponse(action(args));
}

async function admitTen(paths: string[]) {
  const acceptedStatus = new Map([
    ["/api/auth/register", 201],
    ["/api/auth/forgot-password", 200],
    ["/signin", 200],
  ]);
  for (let i = 0; i < 10; i++) {
    const response = await post(paths[i % paths.length]);
    expect(response.status).toBe(
      acceptedStatus.get(paths[i % paths.length]) ?? 401,
    );
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimitsForTests();
  vi.stubEnv("SIGNUP_OPEN", "true");
  vi.stubEnv("E2E_DISABLE_AUTH_RATE_LIMIT", "0");
  vi.stubEnv("DISABLE_AUTH_RATE_LIMIT", "0");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-29T00:00:00Z"));
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Unexpected external request in rate-limit test");
    }),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("credential operation rate budgets (#2867)", () => {
  test("token sign-in stops before the eleventh credential check", async () => {
    await admitTen(["/api/auth/token"]);
    const rejected = await post("/api/auth/token");
    expect(rejected.status).toBe(429);
    expect(rejected.headers.get("Retry-After")).toBe("60");
    expect(mocks.tokenLogin).toHaveBeenCalledTimes(10);
  });

  test("browser, token and Better Auth sign-in share one ten-request budget", async () => {
    await admitTen(["/signin", "/api/auth/token", "/api/auth/sign-in/email"]);
    expect((await post("/api/auth/token")).status).toBe(429);
    expect(mocks.loginWithPassword).toHaveBeenCalledTimes(4);
    expect(mocks.tokenLogin).toHaveBeenCalledTimes(3);
    expect(mocks.authHandler).toHaveBeenCalledTimes(3);
  });

  test.each([
    "/api/auth/sign-up/email",
    "/api/auth/request-password-reset",
    "/api/auth/reset-password",
    "/api/auth/email-otp/verify-email",
    "/api/auth/change-password",
    "/api/auth/new-credential-plugin",
    "/api/auth/sign-out/new-credential-plugin",
  ])("%s stops before forwarding request eleven", async (path) => {
    await admitTen([path]);
    expect((await post(path)).status).toBe(429);
    expect(mocks.authHandler).toHaveBeenCalledTimes(10);
  });

  test.each([
    ["/api/auth/register", "/api/auth/sign-up/email"],
    ["/api/auth/forgot-password", "/api/auth/request-password-reset"],
  ])("%s shares its budget with %s", async (direct, alias) => {
    await admitTen([direct, alias]);
    expect((await post(alias)).status).toBe(429);
    expect(mocks.authHandler).toHaveBeenCalledTimes(5);
  });

  test("ordinary sign-out keeps its thirty-request budget", async () => {
    for (let i = 0; i < 30; i++)
      expect((await post("/api/auth/sign-out")).status).toBe(401);
    expect((await post("/api/auth/sign-out")).status).toBe(429);
    expect(mocks.authHandler).toHaveBeenCalledTimes(30);
  });

  test("a different client address keeps its own credential budget", async () => {
    await admitTen(["/api/auth/token"]);
    expect((await post("/api/auth/token", "203.0.113.18")).status).toBe(401);
    expect(mocks.tokenLogin).toHaveBeenCalledTimes(11);
  });

  test("GET and HEAD do not consume or require a POST credential budget", async () => {
    await admitTen(["/api/auth/sign-in/email"]);
    const { loader } = await import("../app/routes/api+/auth/$.loader.server");
    for (const method of ["GET", "HEAD"]) {
      const request = new Request("http://localhost/api/auth/get-session", {
        method,
        headers: { "x-forwarded-for": "203.0.113.17" },
      });
      const response = await asRouteResponse(
        loader(
          withRouteUrl({
            request,
            params: {},
            context: new RouterContextProvider(),
          }),
        ),
      );
      expect(response.status).toBe(401);
    }
    expect((await post("/api/auth/sign-in/email")).status).toBe(429);
    expect(mocks.authHandler).toHaveBeenCalledTimes(12);
  });

  test("an existing strict sign-in bucket resets after one minute", async () => {
    await admitTen(["/api/auth/sign-in/email"]);
    expect((await post("/api/auth/sign-in/email")).status).toBe(429);
    vi.setSystemTime(new Date("2026-10-29T00:01:01Z"));
    expect((await post("/api/auth/sign-in/email")).status).toBe(401);
    expect(mocks.authHandler).toHaveBeenCalledTimes(11);
  });
});
