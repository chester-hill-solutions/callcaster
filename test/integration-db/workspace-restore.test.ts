import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { RouterContextProvider } from "react-router";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { asRouteResponse } from "../helpers/route-result";

vi.mock("@/lib/transactional-email.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/transactional-email.server")>()),
  sendTransactionalEmail: vi.fn(async () => undefined),
}));

const provider = vi.hoisted(() => ({
  accountSid: "AC00000000000000000000000000002992", sid: "PN00000000000000000000000000002992",
  phone: "+16135552992", active: false, released: 0, rented: 0,
}));
// Keep the real release service and database writes. Only the provider is fake.
vi.mock("twilio", async (importOriginal) => {
  const actual = await importOriginal<typeof import("twilio")>();
  function absent() { return Object.assign(new Error("Owned number is absent"), { status: 404, code: 20404 }); }
  function resource() { return { sid: provider.sid, accountSid: provider.accountSid, phoneNumber: provider.phone }; }
  class FixtureClient {
    accountSid = provider.accountSid;
    incomingPhoneNumbers = Object.assign((sid: string) => ({
      fetch: async () => { if (!provider.active || sid !== provider.sid) throw absent(); return resource(); },
      remove: async () => { if (!provider.active || sid !== provider.sid) throw absent(); provider.active = false; provider.released++; return true; },
    }), {
      list: async () => provider.active ? [resource()] : [],
      create: async () => { provider.rented++; throw new Error("Restore must never rent a number"); },
    });
    outgoingCallerIds = { list: async () => [] };
  }
  return { ...actual, default: { ...actual.default, Twilio: FixtureClient } };
});

const databaseUrl = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
const workspace = randomUUID(), foreign = randomUUID();
const baseUrl = "http://127.0.0.1:3038";
const identities = new Map<string, { id: string; cookie: string; email: string }>();
let sql: ReturnType<typeof postgres>;
let middleware: typeof import("@/lib/admin-middleware.server").adminMiddleware;
let action: typeof import("@/routes/admin+/route.action.server").action;
let closeAppPools: () => Promise<void>;
function actor(name: string) {
  const value = identities.get(name);
  if (!value) throw new Error("Owned restore actor missing");
  return value;
}
async function post(who = "admin", fields: Record<string, string> = {}) {
  const body = new URLSearchParams({ _action: "restore_workspace", workspaceId: workspace, confirmRestore: "yes", ...fields });
  const request = new Request(`${baseUrl}/admin`, {
    method: "POST", headers: who === "anonymous" ? {} : { Cookie: actor(who).cookie }, body,
  });
  const args = { request, url: new URL(request.url), params: {}, context: new RouterContextProvider() };
  return asRouteResponse(middleware(args, async () => action(args)));
}
async function state() {
  const [result] = await sql`select archived_at, disabled, credits from workspace where id = ${workspace}`;
  return result;
}
async function audits() {
  return sql`select action, actor_id, actor_type, outcome, metadata from workspace_audit_event where workspace_id = ${workspace} order by id`;
}
async function clean() {
  await sql`delete from workspace where id in (${workspace}, ${foreign})`;
}

describe.skipIf(!databaseUrl)("admin workspace restore with real sessions and PostgreSQL (#2992)", () => {
  beforeAll(async () => {
    if (!databaseUrl) throw new Error("Owned database required");
    for (const [key, value] of Object.entries({ DATABASE_URL: databaseUrl, DATABASE_DIRECT_URL: databaseUrl,
      BASE_URL: baseUrl, BETTER_AUTH_URL: `${baseUrl}/api/auth`,
      BETTER_AUTH_SECRET: "owned-workspace-restore-2992-fixture-secret", TWO_FACTOR_ENABLED: "true",
      DISABLE_2FA_ENFORCEMENT: "0", E2E_DISABLE_2FA_ENFORCEMENT: "0", TZ: "UTC" })) vi.stubEnv(key, value);
    sql = postgres(databaseUrl, { max: 3 });
    const { pool, directPool } = await import("@/server/db");
    closeAppPools = async () => { await Promise.all([pool.end(), directPool.end()]); };
    const { auth } = await import("@/server/auth-instance");
    const context = await auth.$context;
    for (const name of ["admin", "owner"]) {
      const email = `owned-2992-${name}-${randomUUID()}@example.test`;
      const password = "OwnedRestore2992Password!";
      await auth.api.signUpEmail({ body: { name: `Owned ${name}`, email, password }, headers: new Headers({ Origin: baseUrl }) });
      await sql`update auth_user set email_verified = true where email = ${email}`;
      const signed = await auth.api.signInEmail({ body: { email, password }, headers: new Headers({ Origin: baseUrl }), returnHeaders: true });
      const cookie = signed.headers.getSetCookie().find(value => value.startsWith(context.authCookies.sessionToken.name + "="));
      if (!cookie) throw new Error("Real restore session cookie missing");
      identities.set(name, { id: signed.response.user.id, email, cookie: cookie.split(";")[0] });
      await sql`update "user" set access_level = ${name === "admin" ? "sudo" : "standard"} where id = ${signed.response.user.id}`;
      await sql`update auth_user set two_factor_enabled = true where id = ${signed.response.user.id}`;
    }
    ({ adminMiddleware: middleware } = await import("@/lib/admin-middleware.server"));
    ({ action } = await import("@/routes/admin+/route.action.server"));
  });
  beforeEach(async () => {
    await clean();
    provider.active = false; provider.released = 0; provider.rented = 0;
    await sql`insert into workspace (id, name, archived_at, credits) values
      (${workspace}, 'Owned restore target', '2026-10-25T12:00:00Z', 123),
      (${foreign}, 'Owned other archived workspace', '2026-10-24T12:00:00Z', 7)`;
    await sql`insert into workspace_member (id, workspace_id, user_id, role_id) values
      (${randomUUID()}, ${workspace}, ${actor('owner').id}, 'owner'),
      (${randomUUID()}, ${foreign}, ${actor('owner').id}, 'owner')`;
  });
  afterAll(async () => {
    try {
      if (sql) {
        await clean();
        for (const identity of identities.values()) await sql`delete from auth_user where id = ${identity.id}`;
      }
    } finally {
      await closeAppPools?.();
      await sql?.end();
      vi.unstubAllEnvs();
    }
  });

  test("restores access and records the real operator without changing credits or other workspaces", async () => {
    const result = await post("admin", { actorId: actor("owner").id });
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ success: expect.stringContaining("restored") });
    expect(await state()).toMatchObject({ archived_at: null, disabled: false, credits: 123 });
    const [other] = await sql`select archived_at, credits from workspace where id = ${foreign}`;
    expect(other.archived_at).not.toBeNull();
    expect(other.credits).toBe(7);
    expect(await audits()).toEqual([expect.objectContaining({ action: "workspace.restore", actor_type: "support", actor_id: actor("admin").id, outcome: "success" })]);
  });

  test("the admin projection and filters distinguish archive state from disabled state", async () => {
    const { getAdminDashboard } = await import("@/lib/platform-admin.server");
    const { filterWorkspaceAdminRows } = await import("@/lib/admin-workspaces");
    await sql`update workspace set archived_at = null, disabled = true where id = ${foreign}`;
    const dashboard = await getAdminDashboard();
    const rows = dashboard.workspaceRows.filter(row => row.id === workspace || row.id === foreign);
    expect(rows.find(row => row.id === workspace)?.archivedAt).toBe("2026-10-25T12:00:00.000Z");
    expect(rows.find(row => row.id === foreign)?.archivedAt).toBeNull();
    const filtered = (status: "active" | "archived" | "disabled") => filterWorkspaceAdminRows(rows, { search: "", status, owner: "all", opsState: "all" }).map(row => row.id);
    expect(filtered("archived")).toEqual([workspace]);
    expect(filtered("disabled")).toEqual([foreign]);
    expect(filtered("active")).toEqual([]);
  });

  test("a retry or two concurrent submissions produce one restore audit event", async () => {
    const results = await Promise.all([post(), post()]);
    for (const result of results) {
      expect(result.status).toBe(200);
      expect(await result.json()).toMatchObject({ success: expect.any(String) });
    }
    expect((await audits()).filter(row => row.action === "workspace.restore")).toHaveLength(1);
    expect((await state()).archived_at).toBeNull();
  });

  test("an active workspace is a no-op and keeps disabled state", async () => {
    await sql`update workspace set archived_at = null, disabled = true where id = ${workspace}`;
    const result = await post();
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ success: expect.stringContaining("already") });
    expect(await state()).toMatchObject({ archived_at: null, disabled: true });
    expect(await audits()).toHaveLength(0);
  });

  test.each(["owner", "anonymous"])("%s cannot restore through the admin boundary", async (who) => {
    const result = await post(who);
    expect(result.status).toBe(302);
    expect(result.headers.get("location")).toBe("/signin");
    expect((await state()).archived_at).not.toBeNull();
    expect(await audits()).toHaveLength(0);
  });

  test("an unenrolled operator cannot use restore to bypass the admin MFA gate", async () => {
    await sql`update auth_user set two_factor_enabled = false where id = ${actor("admin").id}`;
    try {
      const result = await post();
      expect(result.status).toBe(302);
      expect(result.headers.get("location")).toBe("/account?enroll=1&next=%2Fadmin");
      expect((await state()).archived_at).not.toBeNull();
      expect(await audits()).toHaveLength(0);
    } finally {
      await sql`update auth_user set two_factor_enabled = true where id = ${actor("admin").id}`;
    }
  });

  test("requires confirmation and a valid workspace id before any write", async () => {
    for (const fields of [{ confirmRestore: "" }, { workspaceId: "not-a-workspace" }, { workspaceId: "" }]) {
      const result = await post("admin", fields);
      expect(result.status).toBe(400);
    }
    expect((await state()).archived_at).not.toBeNull();
    expect(await audits()).toHaveLength(0);
  });

  test("reports a missing workspace without claiming success", async () => {
    const result = await post("admin", { workspaceId: randomUUID() });
    expect(result.status).toBe(404);
    expect(await result.json()).toMatchObject({ error: "Workspace not found." });
  });

  test("an archive followed by restore changes the real owner picker and keeps history", async () => {
    const { listUserWorkspaces, deleteWorkspaceApi } = await import("@/lib/platform-workspace.server");
    const { recordWorkspaceAuditEvent } = await import("@/lib/audit-event.server");
    await sql`update workspace set archived_at = null, twilio_data = ${sql.json({ sid: provider.accountSid, authToken: "owned-restore-provider-token" })} where id = ${workspace}`;
    await sql`insert into workspace_number (workspace, type, phone_number, friendly_name, twilio_phone_number_sid)
      values (${workspace}, 'local', ${provider.phone}, 'Owned release control', ${provider.sid})`;
    provider.active = true;
    await recordWorkspaceAuditEvent({ workspaceId: workspace, actorType: "session", actorId: actor("owner").id, action: "owned.history", outcome: "success" });
    expect(await listUserWorkspaces(actor("owner").id)).toMatchObject({ workspaces: [expect.objectContaining({ workspace: expect.objectContaining({ id: workspace }) })] });
    expect(await deleteWorkspaceApi(actor("owner").id, workspace, new Headers())).toMatchObject({ ok: true });
    expect(await listUserWorkspaces(actor("owner").id)).toMatchObject({ workspaces: [] });
    expect((await state()).archived_at).not.toBeNull();
    expect(provider.active).toBe(false);
    expect(provider.released).toBe(1);
    expect((await post()).status).toBe(200);
    expect(await listUserWorkspaces(actor("owner").id)).toMatchObject({ workspaces: [expect.objectContaining({ workspace: expect.objectContaining({ id: workspace }) })] });
    expect((await audits()).map(row => row.action)).toEqual(["owned.history", "workspace.archive", "workspace.restore"]);
    const [numbers] = await sql`select count(*)::int as count from workspace_number where workspace = ${workspace}`;
    expect(numbers.count).toBe(0);
    expect(provider.active).toBe(false);
    expect(provider.rented).toBe(0);
    const [receipt] = await sql`select state from workspace_number_release where workspace = ${workspace}`;
    expect(receipt.state).toBe("completed");
  });

  test("a failed audit insert rolls back restoration", async () => {
    const trigger = `owned_restore_${workspace.replaceAll('-', '')}`;
    await sql.unsafe(`create function ${trigger}() returns trigger language plpgsql as $$ begin raise exception 'owned restore audit failure'; end $$`);
    await sql.unsafe(`create trigger ${trigger} before insert on workspace_audit_event for each row when (new.workspace_id = '${workspace}'::uuid and new.action = 'workspace.restore') execute function ${trigger}()`);
    try {
      expect((await post()).status).toBe(500);
      expect((await state()).archived_at).not.toBeNull();
      expect(await audits()).toHaveLength(0);
    } finally {
      await sql.unsafe(`drop trigger ${trigger} on workspace_audit_event`);
      await sql.unsafe(`drop function ${trigger}()`);
    }
  });
});
