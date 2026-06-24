import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";
import { queueJsonAuthSession } from "./helpers/route-auth-mock";

const mocks = vi.hoisted(() => ({
  listWorkspaceApiKeys: vi.fn(),
  createWorkspaceApiKey: vi.fn(),
  deleteWorkspaceApiKey: vi.fn(),
}));

vi.mock("@/lib/platform-members.server", () => ({
  listWorkspaceApiKeys: (...args: unknown[]) => mocks.listWorkspaceApiKeys(...args),
  createWorkspaceApiKey: (...args: unknown[]) => mocks.createWorkspaceApiKey(...args),
  deleteWorkspaceApiKey: (...args: unknown[]) => mocks.deleteWorkspaceApiKey(...args),
}));

describe("app/routes/api+/workspace/route-api-keys.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.listWorkspaceApiKeys.mockReset();
    mocks.createWorkspaceApiKey.mockReset();
    mocks.deleteWorkspaceApiKey.mockReset();
  });

  test("loader 400s when workspace_id missing", async () => {
    queueJsonAuthSession({ supabaseClient: {}, user: { id: "u1" } });
    const mod = await import("../app/routes/api+/workspace-api-keys");
    const res = await asRouteResponse(await mod.loader({ request: new Request("http://x/api/workspace-api-keys") } as any));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "workspace_id is required" });
  });

  test("loader 500s when select errors; success returns keys ?? []", async () => {
    const mod = await import("../app/routes/api+/workspace-api-keys");

    queueJsonAuthSession({ supabaseClient: {}, user: { id: "u1" } });
    mocks.listWorkspaceApiKeys.mockResolvedValueOnce({
      ok: false,
      error: "bad",
      status: 500,
    });
    const r1 = await asRouteResponse(await mod.loader({
      request: new Request("http://x/api/workspace-api-keys?workspace_id=w1"),
    } as any));
    expect(r1.status).toBe(500);
    await expect(r1.json()).resolves.toEqual({ error: "bad" });

    queueJsonAuthSession({ supabaseClient: {}, user: { id: "u1" } });
    mocks.listWorkspaceApiKeys.mockResolvedValueOnce({ ok: true, keys: [] });
    const r2 = await asRouteResponse(await mod.loader({
      request: new Request("http://x/api/workspace-api-keys?workspace_id=w1"),
    } as any));
    expect(r2.status).toBe(200);
    await expect(r2.json()).resolves.toEqual({ keys: [] });
  });

  test("action POST validates body (including json catch) and creates key; errors 500", async () => {
    const mod = await import("../app/routes/api+/workspace-api-keys");

    queueJsonAuthSession({ supabaseClient: {}, user: { id: "u1" } });
    const badJson = new Request("http://x", { method: "POST", body: "nope", headers: { "Content-Type": "application/json" } });
    const r0 = await asRouteResponse(await mod.action({ request: badJson } as any));
    expect(r0.status).toBe(400);

    queueJsonAuthSession({ supabaseClient: {}, user: { id: "u1" } });
    const r1 = await asRouteResponse(await mod.action({
      request: new Request("http://x", { method: "POST", body: JSON.stringify({ workspace_id: "00000000-0000-4000-8000-000000000001", name: "" }) }),
    } as any));
    expect(r1.status).toBe(400);

    queueJsonAuthSession({ supabaseClient: {}, user: { id: "u1" } });
    mocks.createWorkspaceApiKey.mockResolvedValueOnce({
      ok: true,
      key: "cc_live_secret",
      api_key: { id: "id1", name: "Name", key_prefix: "cc_live_", created_at: "t" },
    });
    const r2 = await asRouteResponse(await mod.action({
      request: new Request("http://x", { method: "POST", body: JSON.stringify({ workspace_id: "00000000-0000-4000-8000-000000000001", name: " Name " }) }),
    } as any));
    expect(r2.status).toBe(201);
    const b2 = await r2.json();
    expect(b2.key).toMatch(/^cc_live_/);
    expect(b2).toMatchObject({ id: "id1", name: "Name", key_prefix: "cc_live_", created_at: "t" });

    queueJsonAuthSession({ supabaseClient: {}, user: { id: "u1" } });
    mocks.createWorkspaceApiKey.mockResolvedValueOnce({
      ok: false,
      error: "ins",
      status: 500,
    });
    const r3 = await asRouteResponse(await mod.action({
      request: new Request("http://x", { method: "POST", body: JSON.stringify({ workspace_id: "00000000-0000-4000-8000-000000000001", name: "Name" }) }),
    } as any));
    expect(r3.status).toBe(500);
    await expect(r3.json()).resolves.toEqual({ error: "ins" });
  });

  test("action DELETE validates body and deletes; errors 500; other method 405", async () => {
    const mod = await import("../app/routes/api+/workspace-api-keys");

    queueJsonAuthSession({ supabaseClient: {}, user: { id: "u1" } });
    const r0 = await asRouteResponse(await mod.action({
      request: new Request("http://x", { method: "DELETE", body: JSON.stringify({}) }),
    } as any));
    expect(r0.status).toBe(400);

    queueJsonAuthSession({ supabaseClient: {}, user: { id: "u1" } });
    const badJson = new Request("http://x", {
      method: "DELETE",
      body: "nope",
      headers: { "Content-Type": "application/json" },
    });
    const r0b = await asRouteResponse(await mod.action({ request: badJson } as any));
    expect(r0b.status).toBe(400);

    queueJsonAuthSession({ supabaseClient: {}, user: { id: "u1" } });
    mocks.deleteWorkspaceApiKey.mockResolvedValueOnce({
      ok: false,
      error: "del",
      status: 500,
    });
    const r1 = await asRouteResponse(await mod.action({
      request: new Request("http://x", { method: "DELETE", body: JSON.stringify({ id: "00000000-0000-4000-8000-000000000002", workspace_id: "00000000-0000-4000-8000-000000000001" }) }),
    } as any));
    expect(r1.status).toBe(500);
    await expect(r1.json()).resolves.toEqual({ error: "del" });

    queueJsonAuthSession({ supabaseClient: {}, user: { id: "u1" } });
    mocks.deleteWorkspaceApiKey.mockResolvedValueOnce({ ok: true });
    const r2 = await asRouteResponse(await mod.action({
      request: new Request("http://x", { method: "DELETE", body: JSON.stringify({ id: "00000000-0000-4000-8000-000000000002", workspace_id: "00000000-0000-4000-8000-000000000001" }) }),
    } as any));
    expect(r2.status).toBe(200);
    await expect(r2.json()).resolves.toEqual({ success: true });

    queueJsonAuthSession({ supabaseClient: {}, user: { id: "u1" } });
    const r3 = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "PUT" }) } as any));
    expect(r3.status).toBe(405);
  });
});
