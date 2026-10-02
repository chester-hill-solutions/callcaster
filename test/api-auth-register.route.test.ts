import { beforeEach, describe, expect, test, vi } from "vitest";
import { RouterContextProvider } from "react-router";
import {
  getIdempotentResponse,
  resetIdempotencyForTests,
  storeIdempotentResponse,
} from "@/lib/platform-idempotency.server";
import { resetRateLimitsForTests } from "@/lib/platform-rate-limit.server";
import type { registerUser } from "@/lib/platform-auth.server";
import { asRouteResponse } from "./helpers/route-result";

const mocks = vi.hoisted(() => ({
  registerUser: vi.fn<typeof registerUser>(),
}));

vi.mock("@/lib/platform-auth.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/platform-auth.server")>()),
  registerUser: mocks.registerUser,
}));

function sessionFor(email: string) {
  return {
    access_token: `access:${email}`,
    refresh_token: `refresh:${email}`,
    expires_in: 3600,
    token_type: "bearer" as const,
    user: { id: email, email },
  };
}

async function register(
  email: string,
  key: string | null = "signup",
  password = "password123",
) {
  const { action } =
    await import("../app/routes/api+/auth/register.action.server");
  const request = new Request("http://localhost/api/auth/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(key === null ? {} : { "Idempotency-Key": key }),
    },
    body: JSON.stringify({ email, password }),
  });
  return asRouteResponse(
    action({
      request,
      url: new URL(request.url),
      params: {},
      context: new RouterContextProvider(),
    }),
  );
}

beforeEach(() => {
  mocks.registerUser.mockReset();
  resetIdempotencyForTests();
  resetRateLimitsForTests();
});

describe("registration does not replay unauthenticated session responses", () => {
  test("a shared key cannot return the first user's tokens to another user", async () => {
    mocks.registerUser.mockImplementation(async (_request, body) => ({
      ok: true,
      data: sessionFor(body.email),
    }));

    const first = await register("first@example.test");
    expect(first.status).toBe(201);
    const second = await register("second@example.test");
    expect(second.status).toBe(201);
    const body = await second.text();
    expect(body).not.toContain("first@example.test");
    expect(JSON.parse(body).user.email).toBe("second@example.test");
    expect(second.headers.has("Idempotency-Replayed")).toBe(false);
    expect(await getIdempotentResponse("auth:register", "signup")).toBeNull();
  });

  test("same-email retries use account validation rather than replaying credentials", async () => {
    mocks.registerUser.mockResolvedValueOnce({
      ok: true,
      data: sessionFor("first@example.test"),
    });
    mocks.registerUser.mockResolvedValueOnce({
      ok: false,
      status: 400,
      error: "Account already exists",
    });
    await register("first@example.test");

    const retry = await register(
      "first@example.test",
      "signup",
      "different-password",
    );
    expect(retry.status).toBe(400);
    const body = await retry.text();
    expect(body).not.toContain("access:");
    expect(body).not.toContain("refresh:");
    expect(retry.headers.has("Idempotency-Replayed")).toBe(false);
  });

  test("a legacy cached signup response and cookie are never served", async () => {
    const legacy = sessionFor("victim@example.test");
    await storeIdempotentResponse(
      "auth:register",
      "signup",
      Response.json(legacy, {
        status: 201,
        headers: { "Set-Cookie": "session=victim-session; HttpOnly" },
      }),
      legacy,
    );
    mocks.registerUser.mockResolvedValueOnce({
      ok: false,
      status: 403,
      error: "Registration is closed.",
    });

    const response = await register("victim@example.test");
    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain("victim");
    expect(response.headers.has("Set-Cookie")).toBe(false);
    expect(response.headers.has("Idempotency-Replayed")).toBe(false);
  });

  test("an in-flight signup does not reserve another user's shared key", async () => {
    let releaseFirst: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    mocks.registerUser.mockImplementation(async (_request, body) => {
      if (body.email === "first@example.test") await gate;
      return { ok: true, data: sessionFor(body.email) };
    });

    const first = register("first@example.test");
    try {
      await vi.waitFor(() => expect(mocks.registerUser).toHaveBeenCalledOnce());
      const second = await register("second@example.test");
      expect(second.status).toBe(201);
      expect(await second.text()).not.toContain("first@example.test");
    } finally {
      releaseFirst();
      await first;
    }
  });

  test("invalid input cannot bypass validation through a known replay key", async () => {
    const response = await register("first@example.test", "signup", "short");
    expect(response.status).toBe(400);
    expect(mocks.registerUser).not.toHaveBeenCalled();
  });

  test("the normal no-key signup flow remains available", async () => {
    mocks.registerUser.mockResolvedValueOnce({
      ok: true,
      data: sessionFor("first@example.test"),
    });
    const response = await register("first@example.test", null);
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      user: { email: "first@example.test" },
    });
  });

  test("registration still enforces its rate limit before account creation", async () => {
    mocks.registerUser.mockResolvedValue({
      ok: false,
      status: 400,
      error: "Account already exists",
    });
    for (let index = 0; index < 10; index += 1) {
      await register("first@example.test");
    }
    const response = await register("first@example.test");
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBeTruthy();
    expect(mocks.registerUser).toHaveBeenCalledTimes(10);
  });
});
