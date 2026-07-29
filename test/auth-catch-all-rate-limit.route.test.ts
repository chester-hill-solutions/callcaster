import { beforeEach, describe, expect, test, vi } from "vitest";

import { resetRateLimitsForTests } from "@/lib/platform-rate-limit.server";

const mocks = vi.hoisted(() => ({
  authHandler: vi.fn(async () => new Response(JSON.stringify({ ok: true }))),
}));

vi.mock("@/server/auth-instance", () => ({
  auth: { handler: (request: Request) => mocks.authHandler(request) },
}));

async function callAction(path: string, ip: string) {
  const { action } = await import("../app/routes/api+/auth/$.loader.server");
  const request = new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify({ email: "a@b.c", password: "nope" }),
  });
  const result = await (action as (args: unknown) => Promise<unknown>)({
    request,
    url: new URL(request.url),
    params: {},
    context: {},
  });
  return result as Response;
}

describe("Better Auth catch-all rate limiting", () => {
  beforeEach(() => {
    resetRateLimitsForTests();
    mocks.authHandler.mockClear();
  });

  test("sign-in POSTs hit 429 after the strict bucket empties", async () => {
    let lastStatus = 0;
    for (let i = 0; i < 11; i++) {
      const response = await callAction("/api/auth/sign-in/email", "10.0.0.1");
      lastStatus = response.status;
    }
    expect(lastStatus).toBe(429);
    expect(mocks.authHandler).toHaveBeenCalledTimes(10);
  });

  test("two-factor POSTs share the strict bucket", async () => {
    let lastStatus = 0;
    for (let i = 0; i < 11; i++) {
      const response = await callAction(
        "/api/auth/two-factor/verify-totp",
        "10.0.0.2",
      );
      lastStatus = response.status;
    }
    expect(lastStatus).toBe(429);
  });

  test("other POSTs use the loose bucket (30/min)", async () => {
    let status = 0;
    for (let i = 0; i < 31; i++) {
      const response = await callAction("/api/auth/sign-out", "10.0.0.3");
      status = response.status;
    }
    expect(status).toBe(429);
  });

  test("clients on distinct IPs do not share buckets", async () => {
    for (let i = 0; i < 10; i++) {
      await callAction("/api/auth/sign-in/email", "10.0.0.4");
    }
    const other = await callAction("/api/auth/sign-in/email", "10.0.0.5");
    expect(other.status).not.toBe(429);
  });
});
