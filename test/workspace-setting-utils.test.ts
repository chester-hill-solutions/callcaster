import { beforeEach, describe, expect, test, vi } from "vitest";
import { asRouteResponse } from "./helpers/route-result";
import { logger } from "@/lib/logger.server";

const getWorkspaceUsers = vi.fn(async () => ({ data: [] as Array<{ username: string }> }));
vi.mock("@/lib/database.server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/database.server")>("@/lib/database.server");
  return { ...actual, getWorkspaceUsers };
});

vi.mock("@/lib/env.server", () => ({
  env: {
    BASE_URL: () => "https://base.example",
  },
}));

const membersDbMocks = vi.hoisted(() => ({
  findUserIdByUsername: vi.fn(async () => null as string | null),
  findWorkspaceInviteForUser: vi.fn(async () => null as unknown),
  updateWorkspaceMemberRole: vi.fn(async () => ({ id: "u1" } as any)),
  removeWorkspaceMember: vi.fn(async () => ({ id: "u1" } as any)),
  transferWorkspaceOwnership: vi.fn(async () => ({ previousOwner: { id: "owner" } } as any)),
  deleteWorkspaceById: vi.fn(async () => ({ id: "w1" } as any)),
  removeWorkspaceInviteForUser: vi.fn(async () => [{ ok: 1 }] as any),
  upsertWorkspaceWebhookRow: vi.fn(async () => ({ id: 1 }) as any),
  getWorkspaceWebhookRow: vi.fn(async () => null as any),
}));

vi.mock("@/lib/workspace-members-db.server", () => ({ ...membersDbMocks }));
vi.mock("@/server/tenant-db", () => ({
  createTenantDb: () => ({
    execute: vi.fn(async () => []),
    workspace_invite: {
      insert: vi.fn(async () => [{ id: "inv1", user_id: "u1", role: "member", workspace: "w1", created_at: "2024-01-01T00:00:00Z" }]),
    },
  }),
}));

function resetMembersDbMocks() {
  membersDbMocks.findUserIdByUsername.mockReset();
  membersDbMocks.findWorkspaceInviteForUser.mockReset();
  membersDbMocks.updateWorkspaceMemberRole.mockReset();
  membersDbMocks.removeWorkspaceMember.mockReset();
  membersDbMocks.transferWorkspaceOwnership.mockReset();
  membersDbMocks.deleteWorkspaceById.mockReset();
  membersDbMocks.removeWorkspaceInviteForUser.mockReset();
  membersDbMocks.upsertWorkspaceWebhookRow.mockReset();
  membersDbMocks.getWorkspaceWebhookRow.mockReset();

  membersDbMocks.findUserIdByUsername.mockResolvedValue(null);
  membersDbMocks.findWorkspaceInviteForUser.mockResolvedValue(null);
  membersDbMocks.updateWorkspaceMemberRole.mockResolvedValue({ id: "u1" });
  membersDbMocks.removeWorkspaceMember.mockResolvedValue({ id: "u1" });
  membersDbMocks.transferWorkspaceOwnership.mockResolvedValue({ previousOwner: { id: "owner" } });
  membersDbMocks.deleteWorkspaceById.mockResolvedValue({ id: "w1" });
  membersDbMocks.removeWorkspaceInviteForUser.mockResolvedValue([{ ok: 1 }]);
  membersDbMocks.upsertWorkspaceWebhookRow.mockResolvedValue({ id: 1 });
  membersDbMocks.getWorkspaceWebhookRow.mockResolvedValue(null);
}

describe("WorkspaceSettingUtils", () => {
  beforeEach(() => {
    vi.resetModules();
    getWorkspaceUsers.mockReset();
    getWorkspaceUsers.mockResolvedValue({ data: [] });
    resetMembersDbMocks();
    vi.stubGlobal("fetch", vi.fn());
    (logger.error as any).mockClear?.();
    (logger.warn as any).mockClear?.();
  });

  test("handleAddUser validates username and detects existing user", async () => {
    const mod = await import("../app/lib/workspace-settings/WorkspaceSettingUtils.server");
    const headers = new Headers();

    const fdMissing = new FormData();
    const resMissing = await asRouteResponse(await mod.handleAddUser(fdMissing, "w1", headers));
    expect(resMissing.status).toBe(400);

    getWorkspaceUsers.mockResolvedValueOnce({ data: [{ username: "a@b.com" }] });
    const fd = new FormData();
    fd.set("username", "A@B.COM ");
    fd.set("new_user_workspace_role", "caller");
    const resDup = await asRouteResponse(await mod.handleAddUser(fd, "w1", headers));
    expect(resDup.status).toBe(403);
  });

  test("handleAddUser returns error when user not found, and success when invite created", async () => {
    const mod = await import("../app/lib/workspace-settings/WorkspaceSettingUtils.server");
    const headers = new Headers();
    getWorkspaceUsers.mockResolvedValueOnce({ data: [] });

    const fd = new FormData();
    fd.set("username", "USER@EXAMPLE.COM ");
    fd.set("new_user_workspace_role", "member");

    // findUserIdByUsername returns null by default → inviteUserByEmail returns user-not-found error
    const resErr = await asRouteResponse(await mod.handleAddUser(fd, "w1", headers));
    expect(await resErr.json()).toMatchObject({
      user: null,
      error: "User not found. They must sign up before being invited to a workspace.",
    });

    // Success path: user exists, no pending invite
    membersDbMocks.findUserIdByUsername.mockResolvedValue("u1");
    membersDbMocks.findWorkspaceInviteForUser.mockResolvedValue(null);
    const resOk = await asRouteResponse(await mod.handleAddUser(fd, "w1", headers));
    expect(await resOk.json()).toMatchObject({ error: null, success: true });
  });

  test("handleUpdateUser and handleDeleteUser return json with error message when present", async () => {
    const mod = await import("../app/lib/workspace-settings/WorkspaceSettingUtils.server");
    const headers = new Headers();

    const fd = new FormData();
    fd.set("user_id", "u1");
    fd.set("updated_workspace_role", "admin");

    const resUpdateOk = await asRouteResponse(await mod.handleUpdateUser(fd, "w1", headers));
    expect(await resUpdateOk.json()).toEqual({ data: { id: "u1" }, error: null });

    membersDbMocks.updateWorkspaceMemberRole.mockRejectedValueOnce(new Error("nope"));
    const resUpdateErr = await asRouteResponse(await mod.handleUpdateUser(fd, "w1", headers));
    expect(await resUpdateErr.json()).toEqual({ data: null, error: "nope" });

    const resDeleteOk = await asRouteResponse(await mod.handleDeleteUser(fd, "w1", headers));
    expect(await resDeleteOk.json()).toEqual({ data: { id: "u1" }, error: null });
  });

  test("handleDeleteSelf returns json when missing userId; returns object error on delete error; redirects on success", async () => {
    const mod = await import("../app/lib/workspace-settings/WorkspaceSettingUtils.server");
    const headers = new Headers();

    const fdMissing = new FormData();
    const resMissing = await asRouteResponse(await mod.handleDeleteSelf(fdMissing, "w1", headers));
    expect(resMissing.status).toBe(200);

    const fd = new FormData();
    fd.set("user_id", "u1");

    membersDbMocks.removeWorkspaceMember.mockRejectedValueOnce(new Error("del"));
    const errObj = await mod.handleDeleteSelf(fd, "w1", headers);
    expect(errObj).toEqual({ data: null, error: "del" });
    expect(logger.error).toHaveBeenCalled();

    membersDbMocks.removeWorkspaceMember.mockResolvedValueOnce({ ok: 1 });
    const res = await asRouteResponse(await mod.handleDeleteSelf(fd, "w1", headers));
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/workspaces");
  });

  test("handleTransferWorkspace handles errors for each update and returns json on success", async () => {
    const mod = await import("../app/lib/workspace-settings/WorkspaceSettingUtils.server");
    const headers = new Headers();

    const fd = new FormData();
    fd.set("workspace_owner_id", "owner");
    fd.set("user_id", "new");

    membersDbMocks.transferWorkspaceOwnership.mockRejectedValueOnce(new Error("new owner failed"));
    const res1 = await asRouteResponse(await mod.handleTransferWorkspace(fd, "w1", headers));
    expect(await res1.json()).toEqual({ error: "new owner failed" });

    membersDbMocks.transferWorkspaceOwnership.mockRejectedValueOnce(new Error("current failed"));
    const res2 = await asRouteResponse(await mod.handleTransferWorkspace(fd, "w1", headers));
    expect(await res2.json()).toEqual({ error: "current failed" });

    membersDbMocks.transferWorkspaceOwnership.mockResolvedValueOnce({ previousOwner: { id: "owner" } });
    const res3 = await asRouteResponse(await mod.handleTransferWorkspace(fd, "w1", headers));
    expect(await res3.json()).toEqual({ data: { id: "owner" }, error: null });
  });

  test("handleDeleteWorkspace returns error object on failure and redirects on success", async () => {
    const mod = await import("../app/lib/workspace-settings/WorkspaceSettingUtils.server");
    const headers = new Headers();

    membersDbMocks.deleteWorkspaceById.mockRejectedValueOnce(new Error("del ws"));
    const err = await mod.handleDeleteWorkspace({ workspaceId: "w1", headers });
    expect(err).toEqual({ data: null, error: "del ws" });

    membersDbMocks.deleteWorkspaceById.mockResolvedValueOnce([{ id: "w1" }]);
    const res = await asRouteResponse(await mod.handleDeleteWorkspace({ workspaceId: "w1", headers }));
    expect(res.status).toBe(302);
  });

  test("removeInvite returns error object or success", async () => {
    const mod = await import("../app/lib/workspace-settings/WorkspaceSettingUtils.server");
    const headers = new Headers();
    const fd = new FormData();
    fd.set("userId", "u1");

    membersDbMocks.removeWorkspaceInviteForUser.mockRejectedValueOnce(new Error("x"));
    const r1 = await mod.removeInvite({ workspaceId: "w1", formData: fd, headers });
    expect(r1.error).toBeTruthy();

    membersDbMocks.removeWorkspaceInviteForUser.mockResolvedValueOnce([{ ok: 1 }]);
    const r2 = await mod.removeInvite({ workspaceId: "w1", formData: fd, headers });
    expect(r2).toEqual({ data: [{ ok: 1 }], error: null });
  });

  test("handleUpdateWebhook upserts and returns json (error or success)", async () => {
    const mod = await import("../app/lib/workspace-settings/WorkspaceSettingUtils.server");
    const headers = new Headers();

    const fd = new FormData();
    fd.set("webhookId", "1");
    fd.set("destinationUrl", "https://example.com");
    fd.set("userId", "u1");
    fd.set("customHeaders", JSON.stringify([["X-Test", "1"]]));
    fd.set("events", JSON.stringify([{ category: "a", type: "INSERT" }]));

    membersDbMocks.upsertWorkspaceWebhookRow.mockRejectedValueOnce(new Error("bad"));
    const resErr = await asRouteResponse(await mod.handleUpdateWebhook(fd, "w1", headers));
    expect(await resErr.json()).toEqual({ data: null, error: "bad" });

    membersDbMocks.upsertWorkspaceWebhookRow.mockResolvedValueOnce({ id: 1 });
    const resOk = await asRouteResponse(await mod.handleUpdateWebhook(fd, "w1", headers));
    expect(await resOk.json()).toEqual({ data: [{ id: 1 }], error: null });
  });

  test("testWebhook handles json vs text responses and catches errors", async () => {
    const mod = await import("../app/lib/workspace-settings/WorkspaceSettingUtils.server");

    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: 1 }), {
        status: 201,
        headers: { "content-type": "application/json" },
        statusText: "Created",
      }),
    );

    const r1 = await mod.testWebhook(
      JSON.stringify({ a: 1 }),
      "https://example.com",
      JSON.stringify([["X", "1"]]),
    );
    expect(r1).toMatchObject({ data: { ok: 1 }, status: 201, statusText: "Created", error: null });

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: 1 }), {
        status: 200,
        headers: { "content-type": "application/json" },
        statusText: "OK",
      }),
    );
    await mod.testWebhook(
      { a: 1 },
      "https://example.com",
      JSON.stringify([["", "ignored"], ["X-Yes", "1"]]),
    );
    expect(fetchMock).toHaveBeenLastCalledWith(
      "https://example.com",
      expect.objectContaining({
        headers: expect.objectContaining({ "Content-Type": "application/json", "X-Yes": "1" }),
      }),
    );

    fetchMock.mockResolvedValueOnce(
      new Response("ok", {
        status: 200,
        headers: { "content-type": "text/plain" },
        statusText: "OK",
      }),
    );
    const r2 = await mod.testWebhook({ a: 1 }, "https://example.com", { X: "1" });
    expect(r2).toMatchObject({ data: "ok", status: 200, error: null });

    fetchMock.mockRejectedValueOnce(new Error("nope"));
    const r3 = await mod.testWebhook({ a: 1 }, "https://example.com", {});
    expect(r3).toMatchObject({ data: null, status: 500, error: "nope" });

    fetchMock.mockRejectedValueOnce("boom");
    const r4 = await mod.testWebhook({ a: 1 }, "https://example.com", {});
    expect(r4).toMatchObject({ data: null, status: 500, error: "boom" });
  });

  test("sendWebhookNotification handles missing webhook, disabled events, delivery failure, success, and catch", async () => {
    const mod = await import("../app/lib/workspace-settings/WorkspaceSettingUtils.server");

    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;

    membersDbMocks.getWorkspaceWebhookRow.mockRejectedValueOnce(new Error("none"));
    const r0 = await mod.sendWebhookNotification({
      eventCategory: "a",
      eventType: "INSERT",
      workspaceId: "w1",
      payload: { a: 1 },
    });
    expect(r0.success).toBe(false);

    membersDbMocks.getWorkspaceWebhookRow.mockResolvedValueOnce(null);
    const r0b = await mod.sendWebhookNotification({
      eventCategory: "a",
      eventType: "INSERT",
      workspaceId: "w1",
      payload: { a: 1 },
    });
    expect(r0b).toEqual({ success: false, error: "No webhook configured" });

    membersDbMocks.getWorkspaceWebhookRow.mockResolvedValueOnce({
      destination_url: "https://example.com",
      custom_headers: {},
      events: [{ category: "x", type: "INSERT" }],
    });
    const r1 = await mod.sendWebhookNotification({
      eventCategory: "a",
      eventType: "INSERT",
      workspaceId: "w1",
      payload: { a: 1 },
    });
    expect(r1).toEqual({ success: false, error: "Event type not enabled for this webhook" });

    membersDbMocks.getWorkspaceWebhookRow.mockResolvedValueOnce({
      destination_url: "https://example.com",
      custom_headers: "not-an-object",
      events: [{ category: "a", type: "INSERT" }],
    });
    fetchMock.mockResolvedValueOnce(new Response("fail", { status: 500, statusText: "Nope" }));
    const r2 = await mod.sendWebhookNotification({
      eventCategory: "a",
      eventType: "INSERT",
      workspaceId: "w1",
      payload: { a: 1 },
    });
    expect(r2.success).toBe(false);

    membersDbMocks.getWorkspaceWebhookRow.mockResolvedValueOnce({
      destination_url: "https://example.com",
      custom_headers: null,
      events: [{ category: "a", type: "INSERT" }],
    });
    fetchMock.mockResolvedValueOnce(new Response("ok", { status: 200, statusText: "OK" }));
    const r2b = await mod.sendWebhookNotification({
      eventCategory: "a",
      eventType: "INSERT",
      workspaceId: "w1",
      payload: { a: 1 },
    });
    expect(r2b).toEqual({ success: true, error: null });

    membersDbMocks.getWorkspaceWebhookRow.mockResolvedValueOnce({
      destination_url: "https://example.com",
      custom_headers: { X: "1" },
      events: [{ category: "a", type: "UPDATE" }],
    });
    fetchMock.mockResolvedValueOnce(new Response("ok", { status: 200, statusText: "OK" }));
    const r3 = await mod.sendWebhookNotification({
      eventCategory: "a",
      eventType: "UPDATE",
      workspaceId: "w1",
      payload: { a: 1 },
    });
    expect(r3).toEqual({ success: true, error: null });

    membersDbMocks.getWorkspaceWebhookRow.mockRejectedValueOnce("boom");
    const r4 = await mod.sendWebhookNotification({
      eventCategory: "a",
      eventType: "INSERT",
      workspaceId: "w1",
      payload: { a: 1 },
    });
    expect(r4.success).toBe(false);
    expect(r4.error).toBe("boom");

    membersDbMocks.getWorkspaceWebhookRow.mockRejectedValueOnce(new Error("err2"));
    const r5 = await mod.sendWebhookNotification({
      eventCategory: "a",
      eventType: "INSERT",
      workspaceId: "w1",
      payload: { a: 1 },
    });
    expect(r5).toEqual({ success: false, error: "err2" });
  });
});
