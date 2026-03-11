import { beforeEach, describe, expect, test, vi } from "vitest";
import { logger } from "@/lib/logger.server";

const getWorkspaceUsers = vi.fn(async () => ({ data: [] as Array<{ username: string }> }));
vi.mock("@/lib/database.server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/database.server")>("@/lib/database.server");
  return { ...actual, getWorkspaceUsers };
});

describe("WorkspaceSettingUtils", () => {
  beforeEach(() => {
    getWorkspaceUsers.mockReset();
    vi.stubGlobal("fetch", vi.fn());
    (logger.error as any).mockClear?.();
    (logger.warn as any).mockClear?.();
  });

  test("handleAddUser validates username and detects existing user", async () => {
    const mod = await import("../app/lib/workspace-settings/WorkspaceSettingUtils");
    const headers = new Headers();

    const fdMissing = new FormData();
    const resMissing = await mod.handleAddUser(fdMissing, "w1", {} as any, headers);
    expect(resMissing.status).toBe(400);

    getWorkspaceUsers.mockResolvedValueOnce({ data: [{ username: "a@b.com" }] });
    const fd = new FormData();
    fd.set("username", "A@B.COM ");
    fd.set("new_user_workspace_role", "caller");
    const resDup = await mod.handleAddUser(fd, "w1", {} as any, headers);
    expect(resDup.status).toBe(403);
  });

  test("handleAddUser returns error on invite invoke error, and success otherwise", async () => {
    const mod = await import("../app/lib/workspace-settings/WorkspaceSettingUtils");
    const headers = new Headers();
    getWorkspaceUsers.mockResolvedValueOnce({ data: [] });

    const invoke = vi.fn();
    const supabaseClient: any = { functions: { invoke } };

    const fd = new FormData();
    fd.set("username", "USER@EXAMPLE.COM ");
    fd.set("new_user_workspace_role", "member");

    invoke.mockResolvedValueOnce({ data: null, error: new Error("invite failed") });
    const resErr = await mod.handleAddUser(fd, "w1", supabaseClient, headers);
    expect(await resErr.json()).toMatchObject({ user: null, error: "invite failed" });

    invoke.mockResolvedValueOnce({ data: { ok: 1 }, error: null });
    const resOk = await mod.handleAddUser(fd, "w1", supabaseClient, headers);
    expect(await resOk.json()).toEqual({ data: { ok: 1 }, error: null, success: true });
  });

  test("handleUpdateUser and handleDeleteUser return json with error message when present", async () => {
    const mod = await import("../app/lib/workspace-settings/WorkspaceSettingUtils");
    const headers = new Headers();
    const single = vi.fn();
    const supabaseClient: any = {
      from: () => ({
        update: () => ({
          eq: () => ({
            eq: () => ({
              select: () => ({ single }),
            }),
          }),
        }),
        delete: () => ({
          eq: () => ({
            eq: () => ({
              select: () => ({ single }),
            }),
          }),
        }),
      }),
    };

    const fd = new FormData();
    fd.set("user_id", "u1");
    fd.set("updated_workspace_role", "admin");

    single.mockResolvedValueOnce({ data: { id: "u1" }, error: null });
    const resUpdateOk = await mod.handleUpdateUser(fd, "w1", supabaseClient, headers);
    expect(await resUpdateOk.json()).toEqual({ data: { id: "u1" }, error: undefined });

    single.mockResolvedValueOnce({ data: null, error: new Error("nope") });
    const resUpdateErr = await mod.handleUpdateUser(fd, "w1", supabaseClient, headers);
    expect(await resUpdateErr.json()).toEqual({ data: null, error: "nope" });

    single.mockResolvedValueOnce({ data: { id: "u1" }, error: null });
    const resDeleteOk = await mod.handleDeleteUser(fd, "w1", supabaseClient, headers);
    expect(await resDeleteOk.json()).toEqual({ data: { id: "u1" }, error: undefined });
  });

  test("handleDeleteSelf returns json when missing userId; returns object error on delete error; redirects on success", async () => {
    const mod = await import("../app/lib/workspace-settings/WorkspaceSettingUtils");
    const headers = new Headers();

    const fdMissing = new FormData();
    const resMissing = await mod.handleDeleteSelf(fdMissing, "w1", {} as any, headers);
    expect(resMissing.status).toBe(200);

    const single = vi.fn();
    const supabaseClient: any = {
      from: () => ({
        delete: () => ({
          eq: () => ({
            eq: () => ({
              select: () => ({ single }),
            }),
          }),
        }),
      }),
    };

    const fd = new FormData();
    fd.set("user_id", "u1");

    single.mockResolvedValueOnce({ data: null, error: new Error("del") });
    const errObj = await mod.handleDeleteSelf(fd, "w1", supabaseClient, headers);
    expect(errObj).toEqual({ data: null, error: "del" });
    expect(logger.error).toHaveBeenCalled();

    single.mockResolvedValueOnce({ data: { ok: 1 }, error: null });
    const res = await mod.handleDeleteSelf(fd, "w1", supabaseClient, headers);
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/workspaces");
  });

  test("handleTransferWorkspace handles errors for each update and returns json on success", async () => {
    const mod = await import("../app/lib/workspace-settings/WorkspaceSettingUtils");
    const headers = new Headers();
    const single = vi.fn();
    const supabaseClient: any = {
      from: () => ({
        update: () => ({
          eq: () => ({
            eq: () => ({
              select: () => ({ single }),
            }),
          }),
        }),
      }),
    };

    const fd = new FormData();
    fd.set("workspace_owner_id", "owner");
    fd.set("user_id", "new");

    single.mockResolvedValueOnce({ data: null, error: new Error("new owner failed") });
    const res1 = await mod.handleTransferWorkspace(fd, "w1", supabaseClient, headers);
    expect(await res1.json()).toEqual({ error: "new owner failed" });

    single.mockResolvedValueOnce({ data: { id: "new" }, error: null });
    single.mockResolvedValueOnce({ data: null, error: new Error("current failed") });
    const res2 = await mod.handleTransferWorkspace(fd, "w1", supabaseClient, headers);
    expect(await res2.json()).toEqual({ error: "current failed" });

    single.mockResolvedValueOnce({ data: { id: "new" }, error: null });
    single.mockResolvedValueOnce({ data: { id: "owner" }, error: null });
    const res3 = await mod.handleTransferWorkspace(fd, "w1", supabaseClient, headers);
    expect(await res3.json()).toEqual({ data: { id: "owner" }, error: null });
  });

  test("handleDeleteWorkspace returns error object on failure and redirects on success", async () => {
    const mod = await import("../app/lib/workspace-settings/WorkspaceSettingUtils");
    const headers = new Headers();

    const supabaseClientErr: any = {
      from: () => ({
        delete: () => ({
          eq: () => ({
            select: async () => ({ data: null, error: new Error("del ws") }),
          }),
        }),
      }),
    };
    const err = await mod.handleDeleteWorkspace({ workspaceId: "w1", supabaseClient: supabaseClientErr, headers });
    expect(err).toEqual({ data: null, error: new Error("del ws") });

    const supabaseClientOk: any = {
      from: () => ({
        delete: () => ({
          eq: () => ({
            select: async () => ({ data: [{ id: "w1" }], error: null }),
          }),
        }),
      }),
    };
    const res = await mod.handleDeleteWorkspace({ workspaceId: "w1", supabaseClient: supabaseClientOk, headers });
    expect(res.status).toBe(302);
  });

  test("removeInvite returns error object or success", async () => {
    const mod = await import("../app/lib/workspace-settings/WorkspaceSettingUtils");
    const headers = new Headers();
    const fd = new FormData();
    fd.set("userId", "u1");

    const supabaseClientErr: any = {
      from: () => ({
        delete: () => ({
          eq: () => ({
            eq: async () => ({ data: null, error: new Error("x") }),
          }),
        }),
      }),
    };
    const r1 = await mod.removeInvite({ workspaceId: "w1", supabaseClient: supabaseClientErr, formData: fd, headers });
    expect(r1.error).toBeTruthy();

    const supabaseClientOk: any = {
      from: () => ({
        delete: () => ({
          eq: () => ({
            eq: async () => ({ data: [{ ok: 1 }], error: null }),
          }),
        }),
      }),
    };
    const r2 = await mod.removeInvite({ workspaceId: "w1", supabaseClient: supabaseClientOk, formData: fd, headers });
    expect(r2).toEqual({ data: [{ ok: 1 }], error: null });
  });

  test("handleUpdateWebhook upserts and returns json (error or success)", async () => {
    const mod = await import("../app/lib/workspace-settings/WorkspaceSettingUtils");
    const headers = new Headers();
    const select = vi.fn();
    const supabaseClient: any = {
      from: () => ({
        upsert: () => ({ select }),
      }),
    };

    const fd = new FormData();
    fd.set("webhookId", "1");
    fd.set("destinationUrl", "https://example.com");
    fd.set("userId", "u1");
    fd.set("customHeaders", JSON.stringify([["X-Test", "1"]]));
    fd.set("events", JSON.stringify([{ category: "a", type: "INSERT" }]));

    select.mockResolvedValueOnce({ data: null, error: new Error("bad") });
    const resErr = await mod.handleUpdateWebhook(fd, "w1", supabaseClient, headers);
    expect(await resErr.json()).toEqual({ data: null, error: "bad" });

    select.mockResolvedValueOnce({ data: [{ id: 1 }], error: null });
    const resOk = await mod.handleUpdateWebhook(fd, "w1", supabaseClient, headers);
    expect(await resOk.json()).toEqual({ data: [{ id: 1 }], error: null });
  });

  test("testWebhook handles json vs text responses and catches errors", async () => {
    const mod = await import("../app/lib/workspace-settings/WorkspaceSettingUtils");

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
    const mod = await import("../app/lib/workspace-settings/WorkspaceSettingUtils");

    const single = vi.fn();
    const supabaseClient: any = {
      from: () => ({
        select: () => ({
          eq: () => ({ single }),
        }),
      }),
    };

    single.mockResolvedValueOnce({ data: null, error: new Error("none") });
    const r0 = await mod.sendWebhookNotification({
      eventCategory: "a",
      eventType: "INSERT",
      workspaceId: "w1",
      payload: { a: 1 },
      supabaseClient,
    });
    expect(r0.success).toBe(false);

    single.mockResolvedValueOnce({ data: null, error: null });
    const r0b = await mod.sendWebhookNotification({
      eventCategory: "a",
      eventType: "INSERT",
      workspaceId: "w1",
      payload: { a: 1 },
      supabaseClient,
    });
    expect(r0b).toEqual({ success: false, error: "No webhook configured" });

    single.mockResolvedValueOnce({
      data: { destination_url: "https://example.com", custom_headers: {}, events: [{ category: "x", type: "INSERT" }] },
      error: null,
    });
    const r1 = await mod.sendWebhookNotification({
      eventCategory: "a",
      eventType: "INSERT",
      workspaceId: "w1",
      payload: { a: 1 },
      supabaseClient,
    });
    expect(r1).toEqual({ success: false, error: "Event type not enabled for this webhook" });

    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    single.mockResolvedValueOnce({
      data: { destination_url: "https://example.com", custom_headers: "not-an-object", events: [{ category: "a", type: "INSERT" }] },
      error: null,
    });
    fetchMock.mockResolvedValueOnce(new Response("fail", { status: 500, statusText: "Nope" }));
    const r2 = await mod.sendWebhookNotification({
      eventCategory: "a",
      eventType: "INSERT",
      workspaceId: "w1",
      payload: { a: 1 },
      supabaseClient,
    });
    expect(r2.success).toBe(false);

    single.mockResolvedValueOnce({
      data: { destination_url: "https://example.com", custom_headers: null, events: [{ category: "a", type: "INSERT" }] },
      error: null,
    });
    fetchMock.mockResolvedValueOnce(new Response("ok", { status: 200, statusText: "OK" }));
    const r2b = await mod.sendWebhookNotification({
      eventCategory: "a",
      eventType: "INSERT",
      workspaceId: "w1",
      payload: { a: 1 },
      supabaseClient,
    });
    expect(r2b).toEqual({ success: true, error: null });

    single.mockResolvedValueOnce({
      data: { destination_url: "https://example.com", custom_headers: { X: "1" }, events: [{ category: "a", type: "UPDATE" }] },
      error: null,
    });
    fetchMock.mockResolvedValueOnce(new Response("ok", { status: 200, statusText: "OK" }));
    const r3 = await mod.sendWebhookNotification({
      eventCategory: "a",
      eventType: "UPDATE",
      workspaceId: "w1",
      payload: { a: 1 },
      supabaseClient,
    });
    expect(r3).toEqual({ success: true, error: null });

    single.mockRejectedValueOnce("boom");
    const r4 = await mod.sendWebhookNotification({
      eventCategory: "a",
      eventType: "INSERT",
      workspaceId: "w1",
      payload: { a: 1 },
      supabaseClient,
    });
    expect(r4.success).toBe(false);
    expect(r4.error).toBe("boom");

    single.mockRejectedValueOnce(new Error("err2"));
    const r5 = await mod.sendWebhookNotification({
      eventCategory: "a",
      eventType: "INSERT",
      workspaceId: "w1",
      payload: { a: 1 },
      supabaseClient,
    });
    expect(r5).toEqual({ success: false, error: "err2" });
  });
});

