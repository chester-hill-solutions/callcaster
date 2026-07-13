import { describe, expect, test, vi } from "vitest";
import { z } from "zod";

import { defineAction, defineLoader } from "../app/lib/handler.server";

function post(body: unknown) {
  return new Request("http://test/x", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}
const args = (request: Request) =>
  ({ request, params: {}, context: {} }) as unknown as Parameters<ReturnType<typeof defineAction>>[0];

describe("defineAction", () => {
  test("short-circuits when the auth strategy returns a Response (handler not called)", async () => {
    const handler = vi.fn();
    const action = defineAction({
      auth: () => new Response("nope", { status: 401 }),
      sideEffects: ["none"],
      handler,
    });
    await expect(action(args(post({})))).rejects.toMatchObject({ status: 401 });
    expect(handler).not.toHaveBeenCalled();
  });

  test("passes the resolved auth object + parsed input to the handler", async () => {
    const action = defineAction({
      auth: () => ({ workspaceId: "w1" }),
      input: z.object({ n: z.number() }),
      sideEffects: ["db-write"],
      handler: ({ auth, input }) =>
        new Response(JSON.stringify({ ws: auth.workspaceId, n: input.n }), { status: 200 }),
    });
    const res = await action(args(post({ n: 42 })));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ws: "w1", n: 42 });
  });

  test("returns 400 on invalid input without calling the handler", async () => {
    const handler = vi.fn();
    const action = defineAction({
      input: z.object({ n: z.number() }),
      sideEffects: ["none"],
      handler,
    });
    const res = await action(args(post({ n: "not-a-number" })));
    expect(res.status).toBe(400);
    expect(handler).not.toHaveBeenCalled();
  });

  test("rethrows a thrown Response (React Router semantics), not a mapped 500", async () => {
    const action = defineAction({
      sideEffects: ["none"],
      handler: () => {
        // e.g. resolveDualAuthSession throws a 401 Response on auth failure
        throw new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
      },
    });
    await expect(action(args(post({})))).rejects.toMatchObject({ status: 401 });
  });

  test("rethrows a Response thrown from the auth strategy", async () => {
    const handler = vi.fn();
    const action = defineAction({
      auth: () => {
        throw new Response("nope", { status: 403 });
      },
      sideEffects: ["none"],
      handler,
    });
    await expect(action(args(post({})))).rejects.toMatchObject({ status: 403 });
    expect(handler).not.toHaveBeenCalled();
  });

  test("maps a thrown error through createErrorResponse", async () => {
    const action = defineAction({
      sideEffects: ["none"],
      handler: () => {
        throw new Error("boom");
      },
    });
    const res = await action(args(post({})));
    // createErrorResponse returns RR's data() result (DataWithResponseInit),
    // not a raw Response — read the status off whichever shape came back.
    const status =
      res instanceof Response ? res.status : (res as { init?: { status?: number } }).init?.status;
    expect(status).toBeGreaterThanOrEqual(500);
  });
});

describe("defineLoader", () => {
  test("short-circuits on auth Response, else runs the handler", async () => {
    const denied = defineLoader({
      auth: () => new Response("no", { status: 403 }),
      sideEffects: ["db-read"],
      handler: () => new Response("ok"),
    });
    await expect(denied(args(new Request("http://test/x")) as never)).rejects.toMatchObject({
      status: 403,
    });

    const ok = defineLoader({
      auth: () => ({ userId: "u1" }),
      sideEffects: ["db-read"],
      handler: ({ auth }) => new Response(auth.userId),
    });
    expect(await (await ok(args(new Request("http://test/x")) as never)).text()).toBe("u1");
  });
});
