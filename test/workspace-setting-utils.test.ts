import { beforeEach, describe, expect, test, vi } from "vitest";
import { asRouteResponse } from "./helpers/route-result";
import { logger } from "@/lib/logger.server";

const getWorkspaceUsers = vi.fn(async () => ({ data: [] as Array<{ username: string }> }));
vi.mock("@/lib/database/workspace.server", () => ({
  getWorkspaceUsers,
  requireWorkspaceAccess: vi.fn(async () => undefined),
}));

vi.mock("@/lib/env.server", () => ({
  env: {
    BASE_URL: () => "https://base.example",
  },
}));

// testWebhook now routes outbound calls through the SSRF-safe helper (pins the
// validated IP). Mock it so the test drives the response without real DNS/HTTP;
// assertSafeOutboundUrl stays a no-op for the pre-check.
const safeOutboundMocks = vi.hoisted(() => ({
  assertSafeOutboundUrl: vi.fn(async () => new URL("https://example.com")),
  safeOutboundFetch: vi.fn(),
}));
vi.mock("@/lib/safe-outbound-url.server", () => ({
  assertSafeOutboundUrl: (...args: unknown[]) =>
    safeOutboundMocks.assertSafeOutboundUrl(...args),
  safeOutboundFetch: (...args: unknown[]) =>
    safeOutboundMocks.safeOutboundFetch(...args),
}));

const membersDbMocks = vi.hoisted(() => ({
  findUserIdByUsername: vi.fn(async () => null as string | null),
  findWorkspaceInviteForUser: vi.fn(async () => null as unknown),
  updateWorkspaceMemberRole: vi.fn(async () => ({ ok: true, member: { id: "u1" } } as any)),
  removeWorkspaceMember: vi.fn(async () => ({ ok: true, member: { id: "u1" } } as any)),
  transferWorkspaceOwnership: vi.fn(async () => ({ previousOwner: { id: "owner" } } as any)),
  deleteWorkspaceById: vi.fn(async () => ({ id: "w1" } as any)),
  removeWorkspaceInviteForUser: vi.fn(async () => [{ ok: 1 }] as any),
  upsertWorkspaceWebhookRow: vi.fn(async () => ({ id: 1 }) as any),
  getWorkspaceWebhookRow: vi.fn(async () => null as any),
  requireMemberManager: vi.fn(async () => ({ role: "owner" })),
  inviteWorkspaceMember: vi.fn(async () => ({ ok: true, invite: { id: "inv1" } } as any)),
  inviteWorkspaceMemberAsPlatformAdmin: vi.fn(async () => ({ ok: true, invite: { id: "inv1" } } as any)),
}));

vi.mock("@/lib/platform-members.server", () => ({
  updateWorkspaceMemberRole: (...args: unknown[]) => membersDbMocks.updateWorkspaceMemberRole(...args),
  removeWorkspaceMember: (...args: unknown[]) => membersDbMocks.removeWorkspaceMember(...args),
  inviteWorkspaceMember: (...args: unknown[]) => membersDbMocks.inviteWorkspaceMember(...args),
  inviteWorkspaceMemberAsPlatformAdmin: (...args: unknown[]) =>
    membersDbMocks.inviteWorkspaceMemberAsPlatformAdmin(...args),
}));
vi.mock("@/lib/workspace-members-db.server", () => ({
  findUserIdByUsername: (...args: unknown[]) => membersDbMocks.findUserIdByUsername(...args),
  findWorkspaceInviteForUser: (...args: unknown[]) => membersDbMocks.findWorkspaceInviteForUser(...args),
  transferWorkspaceOwnership: (...args: unknown[]) => membersDbMocks.transferWorkspaceOwnership(...args),
  deleteWorkspaceById: (...args: unknown[]) => membersDbMocks.deleteWorkspaceById(...args),
  removeWorkspaceInviteForUser: (...args: unknown[]) => membersDbMocks.removeWorkspaceInviteForUser(...args),
  upsertWorkspaceWebhookRow: (...args: unknown[]) => membersDbMocks.upsertWorkspaceWebhookRow(...args),
  getWorkspaceWebhookRow: (...args: unknown[]) => membersDbMocks.getWorkspaceWebhookRow(...args),
  requireMemberManager: (...args: unknown[]) => membersDbMocks.requireMemberManager(...args),
}));
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
  membersDbMocks.inviteWorkspaceMember.mockReset();
  membersDbMocks.inviteWorkspaceMemberAsPlatformAdmin.mockReset();
  membersDbMocks.inviteWorkspaceMember.mockResolvedValue({ ok: true, invite: { id: "inv1" } });
  membersDbMocks.inviteWorkspaceMemberAsPlatformAdmin.mockResolvedValue({ ok: true, invite: { id: "inv1" } });

  membersDbMocks.findUserIdByUsername.mockResolvedValue(null);
  membersDbMocks.findWorkspaceInviteForUser.mockResolvedValue(null);
  membersDbMocks.updateWorkspaceMemberRole.mockResolvedValue({ ok: true, member: { id: "u1" } });
  membersDbMocks.removeWorkspaceMember.mockResolvedValue({ ok: true, member: { id: "u1" } });
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
    vi.spyOn(logger, "error").mockImplementation(() => undefined);
    vi.spyOn(logger, "warn").mockImplementation(() => undefined);
  });

  const memberActor = { kind: "member", userId: "actor-1" } as const;

  test("handleAddUser rejects a missing email and an unknown role before inviting", async () => {
    const mod = await import("../app/lib/workspace-settings/WorkspaceSettingUtils.server");
    const headers = new Headers();

    const fdMissing = new FormData();
    const resMissing = await asRouteResponse(mod.handleAddUser(fdMissing, "w1", headers, memberActor));
    expect(resMissing.status).toBe(400);

    const fdBadRole = new FormData();
    fdBadRole.set("username", "a@b.com");
    fdBadRole.set("new_user_workspace_role", "superuser");
    const resBadRole = await asRouteResponse(mod.handleAddUser(fdBadRole, "w1", headers, memberActor));
    expect(resBadRole.status).toBe(400);
    expect(await resBadRole.json()).toMatchObject({ error: "Invalid workspace role" });

    expect(membersDbMocks.inviteWorkspaceMember).not.toHaveBeenCalled();
    expect(membersDbMocks.inviteWorkspaceMemberAsPlatformAdmin).not.toHaveBeenCalled();
  });

  test("handleAddUser invites through the actor-aware path and surfaces its refusal", async () => {
    const mod = await import("../app/lib/workspace-settings/WorkspaceSettingUtils.server");
    const headers = new Headers();

    const fd = new FormData();
    fd.set("username", " New@Example.COM ");
    fd.set("new_user_workspace_role", "owner");

    membersDbMocks.inviteWorkspaceMember.mockResolvedValueOnce({
      ok: false,
      status: 403,
      error: "You cannot grant a role higher than your own.",
    });
    const resDenied = await asRouteResponse(mod.handleAddUser(fd, "w1", headers, memberActor));
    expect(resDenied.status).toBe(403);
    expect(await resDenied.json()).toMatchObject({
      user: null,
      error: "You cannot grant a role higher than your own.",
    });
    expect(membersDbMocks.inviteWorkspaceMember).toHaveBeenCalledWith(
      "actor-1",
      "w1",
      "new@example.com",
      "owner",
    );

    membersDbMocks.inviteWorkspaceMember.mockResolvedValueOnce({
      ok: true,
      warning: "An invite is already pending for this email.",
    });
    const resPending = await asRouteResponse(mod.handleAddUser(fd, "w1", headers, memberActor));
    expect(await resPending.json()).toMatchObject({
      success: true,
      warning: "An invite is already pending for this email.",
    });

    const resOk = await asRouteResponse(mod.handleAddUser(fd, "w1", headers, memberActor));
    expect(await resOk.json()).toMatchObject({ error: null, success: true, data: { id: "inv1" } });
  });

  test("handleAddUser uses the platform-admin path for the admin console", async () => {
    const mod = await import("../app/lib/workspace-settings/WorkspaceSettingUtils.server");
    const fd = new FormData();
    fd.set("username", "new@example.com");
    fd.set("new_user_workspace_role", "admin");

    await asRouteResponse(mod.handleAddUser(fd, "w1", new Headers(), { kind: "platform-admin" }));

    expect(membersDbMocks.inviteWorkspaceMemberAsPlatformAdmin).toHaveBeenCalledWith(
      "w1",
      "new@example.com",
      "admin",
    );
    expect(membersDbMocks.inviteWorkspaceMember).not.toHaveBeenCalled();
  });

  test("handleUpdateUser and handleDeleteUser return json with error message when present", async () => {
    const mod = await import("../app/lib/workspace-settings/WorkspaceSettingUtils.server");
    const headers = new Headers();

    const fd = new FormData();
    fd.set("user_id", "u1");
    fd.set("updated_workspace_role", "admin");

    const resUpdateOk = await asRouteResponse(mod.handleUpdateUser(fd, "w1", headers, "u1"));
    expect(await resUpdateOk.json()).toEqual({ data: { id: "u1" }, error: null });

    membersDbMocks.updateWorkspaceMemberRole.mockRejectedValueOnce(new Error("nope"));
    const resUpdateErr = await asRouteResponse(mod.handleUpdateUser(fd, "w1", headers, "u1"));
    expect(await resUpdateErr.json()).toEqual({ data: null, error: "nope" });

    const resDeleteOk = await asRouteResponse(mod.handleDeleteUser(fd, "w1", headers, "u1"));
    expect(await resDeleteOk.json()).toEqual({ data: { id: "u1" }, error: null });
  });

  test("handleDeleteSelf returns json when missing userId; returns object error on delete error; redirects on success", async () => {
    const mod = await import("../app/lib/workspace-settings/WorkspaceSettingUtils.server");
    const headers = new Headers();

    const fdMissing = new FormData();
    const resMissing = await asRouteResponse(mod.handleDeleteSelf(fdMissing, "w1", headers, "u1"));
    expect(resMissing.status).toBe(200);

    const fd = new FormData();
    fd.set("user_id", "u1");

    membersDbMocks.removeWorkspaceMember.mockRejectedValueOnce(new Error("del"));
    const errObj = await mod.handleDeleteSelf(fd, "w1", headers, "u1");
    expect(errObj).toEqual({ data: null, error: "del" });

    membersDbMocks.removeWorkspaceMember.mockResolvedValueOnce({ ok: 1 });
    const res = await asRouteResponse(mod.handleDeleteSelf(fd, "w1", headers, "u1"));
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
    const res1 = await asRouteResponse(mod.handleTransferWorkspace(fd, "w1", headers, "owner"));
    expect(await res1.json()).toEqual({ error: "new owner failed" });

    membersDbMocks.transferWorkspaceOwnership.mockRejectedValueOnce(new Error("current failed"));
    const res2 = await asRouteResponse(mod.handleTransferWorkspace(fd, "w1", headers, "owner"));
    expect(await res2.json()).toEqual({ error: "current failed" });

    membersDbMocks.transferWorkspaceOwnership.mockResolvedValueOnce({ previousOwner: { id: "owner" } });
    const res3 = await asRouteResponse(mod.handleTransferWorkspace(fd, "w1", headers, "owner"));
    expect(await res3.json()).toEqual({ data: { id: "owner" }, error: null });
  });

  test("handleDeleteWorkspace returns error object on failure and redirects on success", async () => {
    const mod = await import("../app/lib/workspace-settings/WorkspaceSettingUtils.server");
    const headers = new Headers();

    membersDbMocks.deleteWorkspaceById.mockRejectedValueOnce(new Error("del ws"));
    const err = await mod.handleDeleteWorkspace({ workspaceId: "w1", headers });
    expect(err).toEqual({ data: null, error: "del ws" });

    membersDbMocks.deleteWorkspaceById.mockResolvedValueOnce([{ id: "w1" }]);
    const res = await asRouteResponse(mod.handleDeleteWorkspace({ workspaceId: "w1", headers }));
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
    const resErr = await asRouteResponse(mod.handleUpdateWebhook(fd, "w1", headers));
    expect(await resErr.json()).toEqual({ data: null, error: "bad" });

    membersDbMocks.upsertWorkspaceWebhookRow.mockResolvedValueOnce({ id: 1 });
    const resOk = await asRouteResponse(mod.handleUpdateWebhook(fd, "w1", headers));
    expect(await resOk.json()).toEqual({ data: [{ id: 1 }], error: null });
  });

  test("testWebhook handles json vs text responses and catches errors", async () => {
    const mod = await import("../app/lib/workspace-settings/WorkspaceSettingUtils.server");

    const safeFetch = safeOutboundMocks.safeOutboundFetch;
    safeFetch.mockReset();
    safeFetch.mockResolvedValueOnce(
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

    safeFetch.mockResolvedValueOnce(
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
    expect(safeFetch).toHaveBeenLastCalledWith(
      "https://example.com",
      expect.objectContaining({
        headers: expect.objectContaining({ "Content-Type": "application/json", "X-Yes": "1" }),
      }),
    );

    safeFetch.mockResolvedValueOnce(
      new Response("ok", {
        status: 200,
        headers: { "content-type": "text/plain" },
        statusText: "OK",
      }),
    );
    const r2 = await mod.testWebhook({ a: 1 }, "https://example.com", { X: "1" });
    expect(r2).toMatchObject({ data: "ok", status: 200, error: null });

    safeFetch.mockRejectedValueOnce(new Error("nope"));
    const r3 = await mod.testWebhook({ a: 1 }, "https://example.com", {});
    expect(r3).toMatchObject({ data: null, status: 500, error: "nope" });

    safeFetch.mockRejectedValueOnce("boom");
    const r4 = await mod.testWebhook({ a: 1 }, "https://example.com", {});
    expect(r4).toMatchObject({ data: null, status: 500, error: "boom" });
  });

  test("sendWebhookNotification handles missing webhook, disabled events, delivery failure, success, and catch", async () => {
    const mod = await import("../app/lib/workspace-settings/WorkspaceSettingUtils.server");

    const safeFetch = safeOutboundMocks.safeOutboundFetch;

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
    safeFetch.mockResolvedValueOnce(new Response("fail", { status: 500, statusText: "Nope" }));
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
    safeFetch.mockResolvedValueOnce(new Response("ok", { status: 200, statusText: "OK" }));
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
    safeFetch.mockResolvedValueOnce(new Response("ok", { status: 200, statusText: "OK" }));
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
