import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";
import { queueJsonAuthSession } from "./helpers/route-auth-mock";

const mocks = vi.hoisted(() => ({
  verifyWorkspaceCallerId: vi.fn(),
}));

vi.mock("@/lib/platform-workspace-numbers.server", () => ({
  verifyWorkspaceCallerId: (...args: unknown[]) =>
    mocks.verifyWorkspaceCallerId(...args),
}));

function makeReq(body: Record<string, unknown>) {
  return new Request("http://localhost/api/caller-id", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("app/routes/api+/call/routeer-id.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.verifyWorkspaceCallerId.mockReset();
  });

  test("returns 500 on workspace query error / missing data / missing twilio_data", async () => {
    queueJsonAuthSession({ supabaseClient: {}, user: { id: "u1" } });
    mocks.verifyWorkspaceCallerId.mockResolvedValueOnce({
      ok: false,
      error: "Supabase query error: q",
      status: 500,
    });
    queueJsonAuthSession({ supabaseClient: {}, user: { id: "u1" } });
    mocks.verifyWorkspaceCallerId.mockResolvedValueOnce({
      ok: false,
      error: "No workspace data found",
      status: 500,
    });
    queueJsonAuthSession({ supabaseClient: {}, user: { id: "u1" } });
    mocks.verifyWorkspaceCallerId.mockResolvedValueOnce({
      ok: false,
      error: "Workspace twilio_data not found",
      status: 500,
    });

    const mod = await import("../app/routes/api+/caller-id");
    const body = {
      phoneNumber: "5555550100",
      workspace_id: "00000000-0000-4000-8000-000000000001",
      friendlyName: "n",
    };

    const r1 = await asRouteResponse(await mod.action({ request: makeReq(body) } as any));
    expect(r1.status).toBe(500);
    await expect(r1.json()).resolves.toMatchObject({ error: "Supabase query error: q" });

    const r2 = await asRouteResponse(await mod.action({ request: makeReq(body) } as any));
    expect(r2.status).toBe(500);
    await expect(r2.json()).resolves.toMatchObject({ error: "No workspace data found" });

    const r3 = await asRouteResponse(await mod.action({ request: makeReq(body) } as any));
    expect(r3.status).toBe(500);
    await expect(r3.json()).resolves.toMatchObject({ error: "Workspace twilio_data not found" });
  });

  test("returns 500 on invalid phone number length", async () => {
    queueJsonAuthSession({ supabaseClient: {}, user: { id: "u1" } });
    mocks.verifyWorkspaceCallerId.mockResolvedValueOnce({
      ok: false,
      error: "Invalid phone number length",
      status: 500,
    });

    const mod = await import("../app/routes/api+/caller-id");
    const res = await asRouteResponse(await mod.action({
      request: makeReq({
        phoneNumber: "+123",
        workspace_id: "00000000-0000-4000-8000-000000000001",
        friendlyName: "n",
      }),
    } as any));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({
      error: "Invalid phone number length",
    });
  });

  test("returns 500 when Twilio validation request rejects", async () => {
    queueJsonAuthSession({ supabaseClient: {}, user: { id: "u1" } });
    mocks.verifyWorkspaceCallerId.mockResolvedValueOnce({
      ok: false,
      error: "twilio down",
      status: 500,
    });

    const mod = await import("../app/routes/api+/caller-id");
    const res = await asRouteResponse(await mod.action({
      request: makeReq({
        phoneNumber: "5555550100",
        workspace_id: "00000000-0000-4000-8000-000000000001",
        friendlyName: "n",
      }),
    } as any));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: "twilio down" });
  });

  test("returns 500 on workspace_number upsert error", async () => {
    queueJsonAuthSession({ supabaseClient: {}, user: { id: "u1" } });
    mocks.verifyWorkspaceCallerId.mockResolvedValueOnce({
      ok: false,
      error: "Error inserting workspace number: ins",
      status: 500,
    });

    const mod = await import("../app/routes/api+/caller-id");
    const res = await asRouteResponse(await mod.action({
      request: makeReq({
        phoneNumber: "5555550100",
        workspace_id: "00000000-0000-4000-8000-000000000001",
        friendlyName: "n",
      }),
    } as any));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({
      error: "Error inserting workspace number: ins",
    });
  });

  test("happy path returns validationRequest + numberRequest (covers + in middle normalization)", async () => {
    queueJsonAuthSession({ supabaseClient: {}, user: { id: "u1" } });
    mocks.verifyWorkspaceCallerId.mockResolvedValueOnce({
      ok: true,
      validationRequest: { sid: "VR1" },
      numberRequest: [{ id: 1 }],
    });

    const mod = await import("../app/routes/api+/caller-id");
    const res = await asRouteResponse(await mod.action({
      request: makeReq({
        phoneNumber: "1+5555550100",
        workspace_id: "00000000-0000-4000-8000-000000000001",
        friendlyName: "n",
      }),
    } as any));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.validationRequest).toMatchObject({ sid: "VR1" });
    expect(body.numberRequest).toEqual([{ id: 1 }]);
    expect(mocks.verifyWorkspaceCallerId).toHaveBeenCalledWith(
      {},
      "u1",
      "00000000-0000-4000-8000-000000000001",
      "1+5555550100",
      "n",
    );
  });
});
