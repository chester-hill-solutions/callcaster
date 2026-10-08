import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { RouterContextProvider } from "react-router";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { asRouteResponse } from "../helpers/route-result";

const databaseUrl = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
const workspace = randomUUID(), foreign = randomUUID();
const actors = ["sudo", "owner", "target", "caller"] as const;
type Actor = (typeof actors)[number];
type Surface = "tab" | "api" | "user-form";
type Identity = { id: string; cookie: string; email: string };
const identities = new Map<Actor, Identity>();
const ownedEmails: string[] = [];
const closePools: (() => Promise<unknown>)[] = [];
let sql: ReturnType<typeof postgres>;
let middleware: typeof import("@/lib/admin-middleware.server").adminMiddleware;
let tabLoader: typeof import("@/routes/admin+/workspaces/$workspaceId/invite.loader.server").loader;
let tabAction: typeof import("@/routes/admin+/workspaces/$workspaceId/invite.action.server").action;
let apiAction: typeof import("@/routes/api+/admin+/users+/$userId/workspaces.action.server").action;
let userFormAction: typeof import("@/routes/admin+/users/$userId/workspaces.action.server").action;

function identity(actor: Actor) {
  const result = identities.get(actor);
  if (!result) throw new Error("Owned auth identity was not created");
  return result;
}
async function member(actor: Actor, role: string, id = workspace) {
  await sql`insert into workspace_member (id, workspace_id, user_id, role_id)
    values (${randomUUID()}, ${id}, ${identity(actor).id}, ${role})`;
}
async function role(actor: Actor, id = workspace) {
  const rows = await sql`select role_id from workspace_member
    where workspace_id = ${id} and user_id = ${identity(actor).id}`;
  return rows[0]?.role_id ?? null;
}
async function waitForMembershipWriters(count: number, barrierPid: number) {
  const deadline = Date.now() + 5_000;
  let blocked = 0;
  while (blocked < count && Date.now() < deadline) {
    const [row] = await sql`with recursive owned_waiters(pid) as (
      select pid from pg_stat_activity
      where datname = current_database() and ${barrierPid} = any(pg_blocking_pids(pid))
      union
      select activity.pid from pg_stat_activity activity
      join owned_waiters on owned_waiters.pid = any(pg_blocking_pids(activity.pid))
      where activity.datname = current_database()
    ) select count(*)::int as blocked from owned_waiters`;
    blocked = row.blocked;
    if (blocked < count) await new Promise(resolve => setTimeout(resolve, 10));
  }
  expect(blocked).toBeGreaterThanOrEqual(count);
}
async function cleanupWorkspaces() {
  await sql`delete from workspace_member where workspace_id in (${workspace}, ${foreign})`;
  await sql`delete from workspace where id in (${workspace}, ${foreign})`;
}
async function load(actor: Actor) {
  const request = new Request(`http://127.0.0.1:3038/admin/workspaces/${workspace}/invite`, {
    headers: { Cookie: identity(actor).cookie },
  });
  const args = { request, url: new URL(request.url), params: { workspaceId: workspace }, context: new RouterContextProvider() };
  return asRouteResponse(middleware(args, async () => tabLoader(args)));
}
async function mutate(surface: Surface, operation: "update" | "remove" | "add", options: {
  actor?: Actor; target?: Actor; role?: string;
} = {}) {
  const actor = identity(options.actor ?? "sudo"), target = identity(options.target ?? "target");
  if (surface === "api") {
    const request = new Request(`http://127.0.0.1:3038/api/admin/users/${target.id}/workspaces`, {
      method: "POST", headers: { Cookie: actor.cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ action: operation === "update" ? "update_role" : operation === "remove" ? "remove_from_workspace" : "add_to_workspace", workspace_id: workspace, role: options.role }),
    });
    return asRouteResponse(apiAction({ request, url: new URL(request.url), params: { userId: target.id }, context: new RouterContextProvider() }));
  }
  if (surface === "user-form") {
    const body = new FormData();
    body.set("_action", operation === "update" ? "update_role" : operation === "remove" ? "remove_from_workspace" : "add_to_workspace");
    body.set("workspaceId", workspace);
    if (options.role) body.set("role", options.role);
    const request = new Request(`http://127.0.0.1:3038/admin/users/${target.id}/workspaces`, {
      method: "POST", headers: { Cookie: actor.cookie }, body,
    });
    const args = { request, url: new URL(request.url), params: { userId: target.id }, context: new RouterContextProvider() };
    return asRouteResponse(middleware(args, async () => userFormAction(args)));
  }
  const body = new FormData();
  body.set("formName", operation === "update" ? "updateUser" : "deleteUser");
  body.set("user_id", target.id);
  if (options.role) body.set("updated_workspace_role", options.role);
  const request = new Request(`http://127.0.0.1:3038/admin/workspaces/${workspace}/invite`, {
    method: "POST", headers: { Cookie: actor.cookie }, body,
  });
  const args = { request, url: new URL(request.url), params: { workspaceId: workspace }, context: new RouterContextProvider() };
  return asRouteResponse(middleware(args, async () => tabAction(args)));
}
async function denied(result: Awaited<ReturnType<typeof mutate>>, message: string) {
  expect(result.status).toBe(403);
  expect(await result.json()).toMatchObject({ error: expect.stringContaining(message) });
}
async function succeeded(result: Awaited<ReturnType<typeof mutate>>) {
  expect(result.status).toBe(200);
  expect(await result.json()).not.toMatchObject({ error: expect.any(String) });
}

describe.skipIf(!databaseUrl)("platform membership safety with real sessions and PostgreSQL (#2138)", () => {
  beforeAll(async () => {
    if (!databaseUrl) throw new Error("Database required");
    for (const [name, value] of Object.entries({ DATABASE_URL: databaseUrl, DATABASE_DIRECT_URL: databaseUrl,
      BASE_URL: "http://127.0.0.1:3038", BETTER_AUTH_URL: "http://127.0.0.1:3038/api/auth",
      BETTER_AUTH_SECRET: "owned-platform-membership-fixture-2138-secret", TWO_FACTOR_ENABLED: "true",
      DISABLE_2FA_ENFORCEMENT: "0", E2E_DISABLE_2FA_ENFORCEMENT: "0", TZ: "UTC" })) vi.stubEnv(name, value);
    sql = postgres(databaseUrl, { max: 2 });
    closePools.push(() => sql.end());
    const { pool, directPool } = await import("@/server/db");
    closePools.push(() => pool.end(), () => directPool.end());
    const { auth } = await import("@/server/auth-instance");
    const context = await auth.$context;
    for (const actor of actors) {
      const email = `owned-2138-${actor}-${randomUUID()}@example.test`;
      ownedEmails.push(email);
      const result = await auth.api.signUpEmail({ body: { name: `Owned ${actor}`, email, password: "OwnedFixture2138Password!" },
        headers: new Headers({ Origin: "http://127.0.0.1:3038" }), returnHeaders: true });
      const cookie = result.headers.getSetCookie().find(value => value.startsWith(context.authCookies.sessionToken.name + "="));
      if (!cookie) throw new Error("Real auth did not issue the fixture session cookie");
      identities.set(actor, { id: result.response.user.id, cookie: cookie.split(";")[0], email });
    }
    ({ adminMiddleware: middleware } = await import("@/lib/admin-middleware.server"));
    ({ loader: tabLoader } = await import("@/routes/admin+/workspaces/$workspaceId/invite.loader.server"));
    ({ action: tabAction } = await import("@/routes/admin+/workspaces/$workspaceId/invite.action.server"));
    ({ action: apiAction } = await import("@/routes/api+/admin+/users+/$userId/workspaces.action.server"));
    ({ action: userFormAction } = await import("@/routes/admin+/users/$userId/workspaces.action.server"));
  });
  beforeEach(async () => {
    await cleanupWorkspaces();
    await sql`insert into workspace (id, name) values (${workspace}, 'Owned platform access'), (${foreign}, 'Owned foreign membership')`;
    for (const actor of actors) {
      await sql`update "user" set access_level = ${actor === "sudo" ? "sudo" : "standard"} where id = ${identity(actor).id}`;
      await sql`update auth_user set two_factor_enabled = true where id = ${identity(actor).id}`;
    }
    await member("owner", "owner");
    await member("target", "member");
    await member("caller", "caller");
    await member("target", "member", foreign);
    vi.stubEnv("DISABLE_2FA_ENFORCEMENT", "0");
  });
  afterAll(async () => {
    try {
      const failures: unknown[] = [];
      try {
        if (sql) {
          await cleanupWorkspaces();
          for (const email of ownedEmails) {
            await sql`delete from "user" where username = ${email}`;
            await sql`delete from auth_user where email = ${email}`;
          }
        }
      } catch (error) { failures.push(error); }
      for (const result of await Promise.allSettled(closePools.map(async close => close())))
        if (result.status === "rejected") failures.push(result.reason);
      if (failures.length) throw new AggregateError(failures, "Owned membership fixture cleanup failed");
    } finally { vi.unstubAllEnvs(); }
  });

  test("a real non-member sudo session can open Access", async () => {
    const result = await load("sudo");
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ hasAccess: true, userRole: null });
    expect(await role("sudo")).toBeNull();
  });
  test.each(["caller", "owner"])("sudo access does not depend on a %s workspace role", async membershipRole => {
    await member("sudo", membershipRole);
    expect(await (await load("sudo")).json()).toMatchObject({ hasAccess: true, userRole: membershipRole });
  });
  test.each(["owner", "caller"] as const)("a non-sudo %s session cannot load Access", async actor => {
    expect((await load(actor)).status).toBe(302);
  });
  test.each(["owner", "caller"] as const)("a non-sudo %s session cannot use the JSON writer", async actor => {
    expect((await mutate("api", "update", { actor, role: "admin" })).status).toBe(403);
    expect(await role("target")).toBe("member");
  });

  describe.each(["tab", "api", "user-form"] as const)("%s boundary", surface => {
    test("cannot remove the sole owner", async () => {
      await denied(await mutate(surface, "remove", { target: "owner" }), "sole owner");
      expect(await role("owner")).toBe("owner");
    });
    test("cannot demote the sole owner", async () => {
      await denied(await mutate(surface, "update", { target: "owner", role: "admin" }), "sole owner");
      expect(await role("owner")).toBe("owner");
    });
    test.each(["owner", "admin"])("cannot grant %s without target enrollment", async nextRole => {
      await sql`update auth_user set two_factor_enabled = false where id = ${identity("target").id}`;
      await denied(await mutate(surface, "update", { role: nextRole }), "two-factor");
      expect(await role("target")).toBe("member");
    });
    test("permits an enrolled target admin grant", async () => {
      await succeeded(await mutate(surface, "update", { role: "admin" }));
      expect(await role("target")).toBe("admin");
    });
    test("can restore an ownerless workspace using an enrolled member", async () => {
      await sql`update workspace_member set role_id = 'admin' where workspace_id = ${workspace} and user_id = ${identity("owner").id}`;
      await succeeded(await mutate(surface, "update", { role: "owner" }));
      expect(await role("target")).toBe("owner");
      expect(await role("sudo")).toBeNull();
    });
    test("can remove one owner when another remains", async () => {
      await sql`update workspace_member set role_id = 'owner' where workspace_id = ${workspace} and user_id = ${identity("target").id}`;
      await succeeded(await mutate(surface, "remove", { target: "owner" }));
      expect(await role("owner")).toBeNull();
      expect(await role("target")).toBe("owner");
    });
    test("can demote one owner when another remains", async () => {
      await sql`update workspace_member set role_id = 'owner' where workspace_id = ${workspace} and user_id = ${identity("target").id}`;
      await succeeded(await mutate(surface, "update", { target: "owner", role: "member" }));
      expect(await role("owner")).toBe("member");
      expect(await role("target")).toBe("owner");
    });
    test("does not require enrollment for an ordinary role", async () => {
      await sql`update auth_user set two_factor_enabled = false where id = ${identity("target").id}`;
      await succeeded(await mutate(surface, "update", { role: "caller" }));
      expect(await role("target")).toBe("caller");
    });
    test("a missing target membership cannot remove its foreign membership", async () => {
      await sql`delete from workspace_member where workspace_id = ${workspace} and user_id = ${identity("target").id}`;
      expect((await mutate(surface, "remove")).status).toBe(404);
      expect(await role("target", foreign)).toBe("member");
    });
    test("honors the existing local enrollment override", async () => {
      vi.stubEnv("DISABLE_2FA_ENFORCEMENT", "1");
      await sql`update auth_user set two_factor_enabled = false where id = ${identity("target").id}`;
      await succeeded(await mutate(surface, "update", { role: "admin" }));
      expect(await role("target")).toBe("admin");
    });
    test("an enrolled sole owner can keep their current role", async () => {
      await succeeded(await mutate(surface, "update", { target: "owner", role: "owner" }));
      expect(await role("owner")).toBe("owner");
    });
  });
  test.each([
    ["tab", "api", "remove"], ["tab", "api", "update"],
    ["api", "user-form", "remove"], ["api", "user-form", "update"],
    ["tab", "member", "remove"], ["tab", "member", "update"],
  ] as const)("concurrent %s/%s %s changes retain an owner", async (first, second, operation) => {
    await sql`update workspace_member set role_id = 'owner'
      where workspace_id = ${workspace} and user_id = ${identity("target").id}`;
    const barrier = await sql.reserve();
    const pending: Promise<{ status: number }>[] = [];
    try {
      const [{ pid: barrierPid }] = await barrier`select pg_backend_pid() as pid`;
      await barrier`begin`;
      // Hold both target rows so both requests reach the write before release.
      await barrier`select id from workspace_member where workspace_id = ${workspace} for update`;
      pending.push(mutate(first, operation, { target: "owner", role: "member" }));
      if (second === "member") {
        const service = await import("@/lib/platform-members.server");
        pending.push((operation === "remove"
          ? service.removeWorkspaceMember(identity("owner").id, workspace, identity("target").id)
          : service.updateWorkspaceMemberRole(identity("owner").id, workspace, identity("target").id, "member"))
          .then(result => ({ status: result.ok ? 200 : result.status })));
      } else pending.push(mutate(second, operation, { role: "member" }));
      await waitForMembershipWriters(2, barrierPid);
    } finally {
      try {
        try { await barrier`rollback`; } finally { barrier.release(); }
      } finally { await Promise.allSettled(pending); }
    }
    const results = await Promise.all(pending);
    const [row] = await sql`select count(*)::int as owners from workspace_member
      where workspace_id = ${workspace} and role_id = 'owner'`;
    expect({ statuses: results.map(result => result.status).sort(), owners: row.owners })
      .toEqual({ statuses: [200, 403], owners: 1 });
  });
  test("ownership transfer and sudo removal cannot leave the workspace ownerless", async () => {
    const { transferWorkspaceOwnership } = await import("@/lib/workspace-members-db.server");
    const barrier = await sql.reserve();
    const pending: Promise<{ status: number }>[] = [];
    try {
      const [{ pid: barrierPid }] = await barrier`select pg_backend_pid() as pid`;
      await barrier`begin`;
      await barrier`select id from workspace_member where workspace_id = ${workspace} for update`;
      pending.push(transferWorkspaceOwnership({ workspaceId: workspace,
        currentOwnerUserId: identity("owner").id, newOwnerUserId: identity("target").id })
        .then(() => ({ status: 200 })));
      await waitForMembershipWriters(1, barrierPid);
      pending.push(mutate("tab", "remove"));
      await waitForMembershipWriters(2, barrierPid);
    } finally {
      try {
        try { await barrier`rollback`; } finally { barrier.release(); }
      } finally { await Promise.allSettled(pending); }
    }
    expect((await Promise.all(pending)).map(result => result.status)).toEqual([200, 403]);
    expect(await role("owner")).toBe("admin");
    expect(await role("target")).toBe("owner");
  });
  test.each(["owner", "admin"])("JSON membership creation requires enrollment for %s", async nextRole => {
    await sql`delete from workspace_member where workspace_id = ${workspace} and user_id = ${identity("target").id}`;
    await sql`update auth_user set two_factor_enabled = false where id = ${identity("target").id}`;
    await denied(await mutate("api", "add", { role: nextRole }), "two-factor");
    expect(await role("target")).toBeNull();
  });
  test("JSON membership creation permits an unenrolled ordinary member", async () => {
    await sql`delete from workspace_member where workspace_id = ${workspace} and user_id = ${identity("target").id}`;
    await sql`update auth_user set two_factor_enabled = false where id = ${identity("target").id}`;
    await succeeded(await mutate("api", "add", { role: "member" }));
    expect(await role("target")).toBe("member");
  });
  test("JSON can add an enrolled owner to an ownerless workspace", async () => {
    await sql`delete from workspace_member where workspace_id = ${workspace} and user_id in (${identity("target").id}, ${identity("owner").id})`;
    await succeeded(await mutate("api", "add", { role: "owner" }));
    expect(await role("target")).toBe("owner");
  });
  test("JSON membership creation honors the existing local enrollment override", async () => {
    vi.stubEnv("DISABLE_2FA_ENFORCEMENT", "1");
    await sql`delete from workspace_member where workspace_id = ${workspace} and user_id = ${identity("target").id}`;
    await sql`update auth_user set two_factor_enabled = false where id = ${identity("target").id}`;
    await succeeded(await mutate("api", "add", { role: "admin" }));
    expect(await role("target")).toBe("admin");
  });
  test("the tab refuses a forged role without changing membership", async () => {
    expect((await mutate("tab", "update", { role: "sudo" })).status).toBe(400);
    expect(await role("target")).toBe("member");
  });
  test("ordinary member path retains sole owner protection", async () => {
    const { updateWorkspaceMemberRole } = await import("@/lib/platform-members.server");
    expect(await updateWorkspaceMemberRole(identity("owner").id, workspace, identity("owner").id, "admin"))
      .toMatchObject({ ok: false, status: 403, error: expect.stringContaining("sole owner") });
    expect(await role("owner")).toBe("owner");
  });
  test("ordinary member path retains target enrollment protection", async () => {
    await sql`update auth_user set two_factor_enabled = false where id = ${identity("target").id}`;
    const { updateWorkspaceMemberRole } = await import("@/lib/platform-members.server");
    expect(await updateWorkspaceMemberRole(identity("owner").id, workspace, identity("target").id, "admin"))
      .toMatchObject({ ok: false, status: 403, error: expect.stringContaining("two-factor") });
    expect(await role("target")).toBe("member");
  });
  test("ordinary member path retains a permitted enrolled admin grant", async () => {
    const { updateWorkspaceMemberRole } = await import("@/lib/platform-members.server");
    expect(await updateWorkspaceMemberRole(identity("owner").id, workspace, identity("target").id, "admin"))
      .toMatchObject({ ok: true });
    expect(await role("target")).toBe("admin");
  });
});
