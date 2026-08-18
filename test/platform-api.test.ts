import { describe, expect, test, beforeEach, vi } from "vitest";
import {
  registerBodySchema,
  tokenBodySchema,
  createWorkspaceBodySchema,
} from "../app/lib/schemas/api/platform-auth";
import { API_SURFACE } from "../app/lib/api-surface";
import { enforceAuthRateLimit } from "../app/lib/platform-auth-rate-limit.server";
import {
  getIdempotentResponse,
  readIdempotencyKey,
  resetIdempotencyForTests,
  storeIdempotentResponse,
  withIdempotency,
} from "../app/lib/platform-idempotency.server";
import { resetRateLimitsForTests } from "../app/lib/platform-rate-limit.server";
import { openApiSpec } from "../app/lib/openapi";

describe("platform auth schemas", () => {
  test("registerBodySchema validates email and password", () => {
    const result = registerBodySchema.safeParse({
      email: "agent@example.com",
      password: "password123",
    });
    expect(result.success).toBe(true);
  });

  test("registerBodySchema rejects short password", () => {
    const result = registerBodySchema.safeParse({
      email: "agent@example.com",
      password: "short",
    });
    expect(result.success).toBe(false);
  });

  test("tokenBodySchema requires email and password", () => {
    expect(tokenBodySchema.safeParse({ email: "a@b.com", password: "x" }).success).toBe(
      true,
    );
    expect(tokenBodySchema.safeParse({ email: "a@b.com" }).success).toBe(false);
  });

  test("createWorkspaceBodySchema requires name", () => {
    expect(createWorkspaceBodySchema.safeParse({ name: "Acme" }).success).toBe(true);
    expect(createWorkspaceBodySchema.safeParse({ name: "" }).success).toBe(false);
  });
});

/**
 * These used to iterate `PLATFORM_API_SURFACE`, one of the four positional
 * chunks the inventory literal was split into for the app file-size gate.
 * #1242 D4 replaced that split with a generated core, and the chunk boundary
 * turned out to carry no meaning — so the assertion is now pinned to the
 * platform routes by name, which is what it was really protecting.
 */
describe("platform api surface inventory", () => {
  const PLATFORM_PATHS = [
    "/api/auth/register",
    "/api/auth/token",
    "/api/workspaces",
    "/api/workspaces/:workspaceId/billing/checkout-session",
    "/api/workspaces/:workspaceId/onboarding/actions",
    "/api/admin/dashboard",
  ];

  test("includes core platform routes", () => {
    const paths = API_SURFACE.map((e) => e.path);
    for (const platformPath of PLATFORM_PATHS) {
      expect(paths).toContain(platformPath);
    }
  });

  test("platform routes target publicOpenApi", () => {
    for (const platformPath of PLATFORM_PATHS) {
      const entry = API_SURFACE.find((e) => e.path === platformPath);
      expect(entry, `no inventory entry for ${platformPath}`).toBeDefined();
      expect(entry?.specTarget).toBe("publicOpenApi");
      expect(entry?.supported).toBe(true);
    }
  });
});

describe("platform auth rate limits", () => {
  beforeEach(() => {
    resetRateLimitsForTests();
  });

  test("returns 429 after limit exceeded", async () => {
    const request = new Request("http://localhost/api/auth/token", {
      headers: { "x-forwarded-for": "203.0.113.1" },
    });

    for (let i = 0; i < 30; i += 1) {
      expect(await enforceAuthRateLimit(request, "auth:token")).toBeNull();
    }

    const limited = await enforceAuthRateLimit(request, "auth:token");
    expect(limited?.status).toBe(429);
    expect(limited?.headers.get("Retry-After")).toBeTruthy();
  });
});

describe("platform idempotency", () => {
  beforeEach(() => {
    resetIdempotencyForTests();
  });

  test("stores and replays successful responses", async () => {
    const request = new Request("http://localhost/api/workspaces", {
      method: "POST",
      headers: { "Idempotency-Key": "ws-create-1" },
    });
    expect(readIdempotencyKey(request)).toBe("ws-create-1");

    const response = Response.json({ id: "w1", name: "Acme" }, { status: 201 });
    await storeIdempotentResponse("workspaces:create", "ws-create-1", response, {
      id: "w1",
      name: "Acme",
    });

    const replay = await getIdempotentResponse("workspaces:create", "ws-create-1");
    expect(replay?.status).toBe(201);
    expect(replay?.headers.get("Idempotency-Replayed")).toBe("true");
    await expect(replay?.json()).resolves.toEqual({ id: "w1", name: "Acme" });
  });

  test("concurrent same-key requests: only one runs the handler, the other 409s", async () => {
    resetIdempotencyForTests();
    const makeRequest = () =>
      new Request("http://localhost/api/workspaces", {
        method: "POST",
        headers: { "Idempotency-Key": "concurrent-1" },
      });

    let releaseFirst: () => void = () => {};
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const handler1 = vi.fn(async () => {
      await firstGate;
      return { response: Response.json({ id: "w1" }, { status: 201 }), body: { id: "w1" } };
    });
    const handler2 = vi.fn(async () => ({
      response: Response.json({ id: "w2" }, { status: 201 }),
      body: { id: "w2" },
    }));

    // Start the first request and let it reserve the key + block inside the handler.
    const first = withIdempotency(makeRequest(), "workspaces:create", handler1);
    await new Promise((resolve) => setTimeout(resolve, 0));

    // The second request must not run its handler — the key is reserved.
    const secondResponse = await withIdempotency(makeRequest(), "workspaces:create", handler2);
    expect(secondResponse.status).toBe(409);
    expect(handler2).not.toHaveBeenCalled();

    releaseFirst();
    const firstResponse = await first;
    expect(firstResponse.status).toBe(201);
    expect(handler1).toHaveBeenCalledTimes(1);
  });

  test("a failed handler releases the reservation so a retry can run", async () => {
    resetIdempotencyForTests();
    const makeRequest = () =>
      new Request("http://localhost/api/workspaces", {
        method: "POST",
        headers: { "Idempotency-Key": "retry-1" },
      });

    const failing = await withIdempotency(makeRequest(), "workspaces:create", async () => ({
      response: Response.json({ error: "boom" }, { status: 500 }),
      body: { error: "boom" },
    }));
    expect(failing.status).toBe(500);

    // The reservation was released, so a retry runs the handler again.
    const retryHandler = vi.fn(async () => ({
      response: Response.json({ id: "w1" }, { status: 201 }),
      body: { id: "w1" },
    }));
    const retry = await withIdempotency(makeRequest(), "workspaces:create", retryHandler);
    expect(retry.status).toBe(201);
    expect(retryHandler).toHaveBeenCalledTimes(1);
  });
});

describe("platform openapi schemas", () => {
  test("includes detailed auth register schema", () => {
    const register = openApiSpec.paths["/api/auth/register"]?.post as {
      requestBody?: { content?: { "application/json"?: { schema?: { $ref?: string } } } };
    };
    expect(register?.requestBody?.content?.["application/json"]?.schema?.$ref).toBe(
      "#/components/schemas/RegisterRequest",
    );
    expect(openApiSpec.components.schemas.RegisterRequest).toBeDefined();
  });
});
