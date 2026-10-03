import { beforeEach, describe, expect, test, vi } from "vitest";
import { RouterContextProvider } from "react-router";
import type { getSession } from "@/lib/auth.server";
import type { createWorkspaceForUser } from "@/lib/platform-auth.server";
import {
  resetIdempotencyForTests,
  storeIdempotentResponse,
} from "@/lib/platform-idempotency.server";
import { asRouteResponse } from "./helpers/route-result";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn<typeof getSession>(),
  createWorkspaceForUser: vi.fn<typeof createWorkspaceForUser>(),
}));

// Exercise real session auth instead of the suite's default route-auth mock.
vi.unmock("@/lib/api-auth.server");

vi.mock("@/lib/auth.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth.server")>()),
  getSession: mocks.getSession,
}));
vi.mock("@/lib/platform-auth.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/platform-auth.server")>()),
  createWorkspaceForUser: mocks.createWorkspaceForUser,
}));

async function create(
  userId: string | null,
  name = "Campaign",
  key: string | null = "create",
) {
  const { action } =
    await import("../app/routes/api+/workspaces.action.server");
  const request = new Request("http://localhost/api/workspaces", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(userId === null ? {} : { "X-Test-Session-User": userId }),
      ...(key === null ? {} : { "Idempotency-Key": key }),
    },
    body: JSON.stringify({ name }),
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
  resetIdempotencyForTests();
  mocks.getSession.mockReset();
  mocks.createWorkspaceForUser.mockReset();
  mocks.getSession.mockImplementation(async (request) => {
    const userId = request.headers.get("X-Test-Session-User");
    return {
      session: null,
      user: userId ? { id: userId } : null,
      headers: new Headers(),
    };
  });
  mocks.createWorkspaceForUser.mockImplementation(async (userId) => ({
    data: `workspace:${userId}`,
    error: null,
    provisioningWarning: null,
  }));
});

describe("workspace creation retry keys belong to the verified user", () => {
  test("two users with one key each get their own workspace", async () => {
    const first = await create("first-user", "First campaign");
    expect(first.status).toBe(201);
    const second = await create("second-user", "Second campaign");
    expect(second.status).toBe(201);
    expect(await second.json()).toMatchObject({
      id: "workspace:second-user",
      name: "Second campaign",
    });
    expect(second.headers.has("Idempotency-Replayed")).toBe(false);
    expect(mocks.createWorkspaceForUser).toHaveBeenCalledTimes(2);
  });

  test("one user's retry replays their original result without creating again", async () => {
    const first = await create("first-user", "Original campaign");
    const original = await first.json();
    const retry = await create("first-user", "Changed request");
    expect(retry.status).toBe(201);
    expect(await retry.json()).toEqual(original);
    expect(retry.headers.get("Idempotency-Replayed")).toBe("true");
    expect(mocks.createWorkspaceForUser).toHaveBeenCalledOnce();
  });

  test("legacy global cached responses cannot be read through this route", async () => {
    const legacy = { id: "victim-workspace", name: "Victim campaign" };
    await storeIdempotentResponse(
      "workspaces:create",
      "create",
      Response.json(legacy, { status: 201 }),
      legacy,
    );
    const response = await create("second-user");
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      id: "workspace:second-user",
    });
    expect(response.headers.has("Idempotency-Replayed")).toBe(false);
  });

  test("a pending key blocks the same user but does not block another user", async () => {
    let releaseFirst: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    mocks.createWorkspaceForUser.mockImplementation(async (userId) => {
      if (userId === "first-user") await gate;
      return {
        data: `workspace:${userId}`,
        error: null,
        provisioningWarning: null,
      };
    });
    const first = create("first-user");
    try {
      await vi.waitFor(() =>
        expect(mocks.createWorkspaceForUser).toHaveBeenCalledOnce(),
      );
      const retry = await create("first-user");
      expect(retry.status).toBe(409);
      const second = await create("second-user");
      expect(second.status).toBe(201);
      expect(await second.json()).toMatchObject({
        id: "workspace:second-user",
      });
    } finally {
      releaseFirst();
      await first;
    }
  });

  test("a known cached key cannot bypass authentication", async () => {
    await create("first-user");
    const response = await create(null);
    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain("workspace:first-user");
    expect(mocks.createWorkspaceForUser).toHaveBeenCalledOnce();
  });

  test("a known cached key cannot bypass input validation", async () => {
    await create("first-user");
    const response = await create("first-user", "");
    expect(response.status).toBe(400);
    expect(mocks.createWorkspaceForUser).toHaveBeenCalledOnce();
  });

  test("requests without a retry key still create separate workspaces", async () => {
    const first = await create("first-user", "First", null);
    const second = await create("first-user", "Second", null);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.headers.has("Idempotency-Replayed")).toBe(false);
    expect(mocks.createWorkspaceForUser).toHaveBeenCalledTimes(2);
  });
});
