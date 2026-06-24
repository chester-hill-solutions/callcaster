import { describe, expect, test, beforeEach } from "vitest";
import {
  registerBodySchema,
  tokenBodySchema,
  createWorkspaceBodySchema,
} from "../app/lib/schemas/api/platform-auth";
import { PLATFORM_API_SURFACE } from "../app/lib/api-surface-platform";
import { enforceAuthRateLimit } from "../app/lib/platform-auth-rate-limit.server";
import {
  getIdempotentResponse,
  readIdempotencyKey,
  resetIdempotencyForTests,
  storeIdempotentResponse,
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

describe("platform api surface inventory", () => {
  test("includes core platform routes", () => {
    const paths = PLATFORM_API_SURFACE.map((e) => e.path);
    expect(paths).toContain("/api/auth/register");
    expect(paths).toContain("/api/auth/token");
    expect(paths).toContain("/api/workspaces");
    expect(paths).toContain("/api/workspaces/:workspaceId/billing/checkout-session");
    expect(paths).toContain("/api/workspaces/:workspaceId/onboarding/actions");
    expect(paths).toContain("/api/admin/dashboard");
  });

  test("platform routes target publicOpenApi", () => {
    for (const entry of PLATFORM_API_SURFACE) {
      expect(entry.specTarget).toBe("publicOpenApi");
      expect(entry.supported).toBe(true);
    }
  });
});

describe("platform auth rate limits", () => {
  beforeEach(() => {
    resetRateLimitsForTests();
  });

  test("returns 429 after limit exceeded", () => {
    const request = new Request("http://localhost/api/auth/token", {
      headers: { "x-forwarded-for": "203.0.113.1" },
    });

    for (let i = 0; i < 30; i += 1) {
      expect(enforceAuthRateLimit(request, "auth:token")).toBeNull();
    }

    const limited = enforceAuthRateLimit(request, "auth:token");
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
    storeIdempotentResponse("workspaces:create", "ws-create-1", response, {
      id: "w1",
      name: "Acme",
    });

    const replay = getIdempotentResponse("workspaces:create", "ws-create-1");
    expect(replay?.status).toBe(201);
    expect(replay?.headers.get("Idempotency-Replayed")).toBe("true");
    await expect(replay?.json()).resolves.toEqual({ id: "w1", name: "Acme" });
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
