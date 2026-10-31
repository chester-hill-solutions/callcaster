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
  accountSid: "AC00000000000000000000000000002994", sid: "PN00000000000000000000000000002994",
  phone: "+16135552994", active: false, failRemove: false,
}));
vi.mock("twilio", async (importOriginal) => {
  const actual = await importOriginal<typeof import("twilio")>();
  const resource = () => ({ sid: provider.sid, accountSid: provider.accountSid, phoneNumber: provider.phone });
  class FixtureClient {
    accountSid = provider.accountSid;
    incomingPhoneNumbers = Object.assign(() => ({
      fetch: async () => resource(),
      remove: async () => {
        if (provider.failRemove) throw Object.assign(new Error("Owned release failure"), { status: 400, code: 21211 });
        provider.active = false;
        return true;
      },
    }), { list: async () => provider.active ? [resource()] : [] });
    outgoingCallerIds = { list: async () => [] };
  }
  return { ...actual, default: { ...actual.default, Twilio: FixtureClient } };
});

const databaseUrl = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
const workspace = randomUUID(), foreign = randomUUID();
const tag = randomUUID().replaceAll("-", "");
const baseUrl = "http://127.0.0.1:3038";
const actors = new Map<string, { id: string; cookie: string; email: string }>();
let sql: ReturnType<typeof postgres>;
let middleware: typeof import("@/lib/data-plane-middleware.server").dataPlaneMiddleware;
let resourceLoader: typeof import("@/routes/api+/workspaces+/$workspaceId.action.server").loader;
let resourceAction: typeof import("@/routes/api+/workspaces+/$workspaceId.action.server").action;
let archive: typeof import("@/lib/workspace-archive.server").archiveWorkspace;
let createKey: typeof import("@/lib/platform-members.server").createWorkspaceApiKey;
let verifyKey: typeof import("@/lib/api-auth.server").verifyApiKeyOrSession;
let key: string, spareKey: string, foreignKey: string;
let closePools: () => Promise<void>;
function actor(name: string) {
  const result = actors.get(name);
  if (!result) throw new Error("Owned archive-key actor missing");
  return result;
}
async function mint(id = workspace) {
  const result = await createKey(actor("owner").id, id, "Owned lifecycle key", ["campaigns.read"], 30);
  if (!result.ok) throw new Error("Owned fixture key creation failed");
  return result.key;
}
async function api(method = "GET", who = "owner", apiKey?: string) {
  const request = new Request(`${baseUrl}/api/workspaces/${workspace}`, {
    method, headers: apiKey ? { "X-API-Key": apiKey } : { Cookie: actor(who).cookie },
  });
  const args = { request, url: new URL(request.url), params: { workspaceId: workspace }, context: new RouterContextProvider() };
  return asRouteResponse(middleware(args, async () => (method === "GET" ? resourceLoader(args) : resourceAction(args))));
}
async function verify(raw: string) {
  return verifyKey(new Request(`${baseUrl}/api/workspaces/${workspace}`, { headers: { "X-API-Key": raw } }));
}
async function countKeys(id = workspace) {
  const [row] = await sql`select count(*)::int as count from workspace_api_key where workspace_id = ${id}`;
  return row.count;
}
async function archived() {
  const [row] = await sql`select archived_at from workspace where id = ${workspace}`;
  return row.archived_at !== null;
}
async function restore() {
  const { adminMiddleware } = await import("@/lib/admin-middleware.server");
  const { action } = await import("@/routes/admin+/route.action.server");
  const request = new Request(`${baseUrl}/admin`, { method: "POST", headers: { Cookie: actor("operator").cookie },
    body: new URLSearchParams({ _action: "restore_workspace", workspaceId: workspace, confirmRestore: "yes" }) });
  const args = { request, url: new URL(request.url), params: {}, context: new RouterContextProvider() };
  return asRouteResponse(adminMiddleware(args, async () => action(args)));
}
async function waitForLock(advisory: boolean, settled?: () => boolean) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const [row] = await sql`select count(*)::int as count from pg_stat_activity
      where datname = current_database() and wait_event_type = 'Lock'
      and ((wait_event = 'advisory') = ${advisory})`;
    if (row.count > 0 || settled?.()) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error("Owned archive concurrency barrier was not reached");
}

describe.skipIf(!databaseUrl)("archive credentials with real sessions and PostgreSQL (#2994)", () => {
  beforeAll(async () => {
    if (!databaseUrl) throw new Error("Owned database required");
    for (const [name, value] of Object.entries({ DATABASE_URL: databaseUrl, DATABASE_DIRECT_URL: databaseUrl,
      BASE_URL: baseUrl, BETTER_AUTH_URL: `${baseUrl}/api/auth`, BETTER_AUTH_SECRET: "owned-archive-keys-2994-fixture-secret",
      TWO_FACTOR_ENABLED: "true", DISABLE_2FA_ENFORCEMENT: "0", E2E_DISABLE_2FA_ENFORCEMENT: "0", TZ: "UTC" })) vi.stubEnv(name, value);
    sql = postgres(databaseUrl, { max: 3 });
    const { pool, directPool } = await import("@/server/db");
    closePools = async () => { await Promise.all([pool.end(), directPool.end()]); };
    const { auth } = await import("@/server/auth-instance");
    const context = await auth.$context;
    for (const name of ["owner", "caller", "operator"]) {
      const email = `owned-2994-${name}-${randomUUID()}@example.test`, password = "OwnedArchive2994Password!";
      await auth.api.signUpEmail({ body: { name: `Owned ${name}`, email, password }, headers: new Headers({ Origin: baseUrl }) });
      await sql`update auth_user set email_verified = true where email = ${email}`;
      const signed = await auth.api.signInEmail({ body: { email, password }, headers: new Headers({ Origin: baseUrl }), returnHeaders: true });
      const cookie = signed.headers.getSetCookie().find(value => value.startsWith(context.authCookies.sessionToken.name + "="));
      if (!cookie) throw new Error("Real archive-key cookie missing");
      actors.set(name, { id: signed.response.user.id, email, cookie: cookie.split(";")[0] });
      await sql`update auth_user set two_factor_enabled = true where id = ${signed.response.user.id}`;
      if (name === "operator") await sql`update "user" set access_level = 'sudo' where id = ${signed.response.user.id}`;
    }
    ({ dataPlaneMiddleware: middleware } = await import("@/lib/data-plane-middleware.server"));
    ({ loader: resourceLoader, action: resourceAction } = await import("@/routes/api+/workspaces+/$workspaceId.action.server"));
    ({ archiveWorkspace: archive } = await import("@/lib/workspace-archive.server"));
    ({ createWorkspaceApiKey: createKey } = await import("@/lib/platform-members.server"));
    ({ verifyApiKeyOrSession: verifyKey } = await import("@/lib/api-auth.server"));
  });
  beforeEach(async () => {
    await sql`delete from workspace where id in (${workspace}, ${foreign})`;
    await sql`insert into workspace (id, name) values (${workspace}, 'Owned archive credentials'), (${foreign}, 'Owned foreign credentials')`;
    for (const id of [workspace, foreign]) await sql`insert into workspace_member (id, workspace_id, user_id, role_id)
      values (${randomUUID()}, ${id}, ${actor("owner").id}, 'owner')`;
    await sql`insert into workspace_member (id, workspace_id, user_id, role_id)
      values (${randomUUID()}, ${workspace}, ${actor("caller").id}, 'caller')`;
    key = await mint(); spareKey = await mint(); foreignKey = await mint(foreign);
    provider.active = false; provider.failRemove = false;
  });
  afterAll(async () => {
    try {
      if (sql) {
        await sql`delete from workspace where id in (${workspace}, ${foreign})`;
        for (const person of actors.values()) await sql`delete from auth_user where id = ${person.id}`;
      }
    } finally { await closePools?.(); await sql?.end(); vi.unstubAllEnvs(); }
  });

  test("active keys and sessions remain valid and a caller cannot archive", async () => {
    expect((await api("GET", "owner", key)).status).toBe(200);
    expect((await api()).status).toBe(200);
    expect((await api("DELETE", "caller")).status).toBe(403);
    expect(await countKeys()).toBe(2);
    expect(await archived()).toBe(false);
  });
  test("the real archive API reports the exact key count and preserves foreign keys", async () => {
    const response = await api("DELETE");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, revoked_api_keys: 2 });
    expect(await countKeys()).toBe(0);
    expect(await countKeys(foreign)).toBe(1);
    expect(await verify(foreignKey)).toMatchObject({ authType: "api_key" });
  });
  test("archive reports zero when the workspace has no API keys", async () => {
    await sql`delete from workspace_api_key where workspace_id = ${workspace}`;
    const response = await api("DELETE");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, revoked_api_keys: 0 });
    expect(await archived()).toBe(true);
  });
  test("keys minted before archive cannot authenticate after it", async () => {
    await archive(workspace);
    for (const raw of [key, spareKey]) expect(await verify(raw)).toMatchObject({ error: "Invalid API key", status: 401 });
    expect((await api("GET", "owner", key)).status).toBe(401);
  });
  test("owner and caller sessions cannot reach archived data", async () => {
    await archive(workspace);
    for (const name of ["owner", "caller"]) {
      const result = await api("GET", name);
      expect(result.status).toBe(404);
      expect(await result.json()).toMatchObject({ error: "Workspace not found" });
    }
  });
  test("the legacy audience API refuses an archived session", async () => {
    const { loader } = await import("@/routes/api+/audiences.loader.server");
    async function audiences() {
      const request = new Request(`${baseUrl}/api/audiences?workspaceId=${workspace}`, {
        headers: { Cookie: actor("owner").cookie },
      });
      return asRouteResponse(loader({ request, params: {}, context: new RouterContextProvider() }));
    }
    expect((await audiences()).status).toBe(200);
    await archive(workspace);
    expect((await audiences()).status).toBe(404);
  });
  test("legacy archived keys are refused and restore does not resurrect them", async () => {
    await sql`update workspace set archived_at = now() where id = ${workspace}`;
    expect(await verify(key)).toMatchObject({ status: 401 });
    expect((await api()).status).toBe(404);
    expect((await restore()).status).toBe(200);
    expect(await countKeys()).toBe(0);
    expect(await verify(key)).toMatchObject({ status: 401 });
    expect((await api()).status).toBe(200);
  });
  test("a restore audit failure rolls back legacy key deletion and access", async () => {
    await sql`update workspace set archived_at = now() where id = ${workspace}`;
    const fault = `owned_restore_key_fault_${tag}`;
    await sql.unsafe(`create function ${fault}() returns trigger language plpgsql as $$ begin raise exception 'owned restore failure'; end $$`);
    await sql.unsafe(`create trigger ${fault} before insert on workspace_audit_event for each row when (new.workspace_id = '${workspace}'::uuid and new.action = 'workspace.restore') execute function ${fault}()`);
    try {
      expect((await restore()).status).toBe(500);
      expect(await archived()).toBe(true);
      expect(await countKeys()).toBe(2);
      expect(await verify(key)).toMatchObject({ status: 401 });
    } finally { await sql.unsafe(`drop trigger ${fault} on workspace_audit_event`); await sql.unsafe(`drop function ${fault}()`); }
    expect((await restore()).status).toBe(200);
    expect(await countKeys()).toBe(0);
  });
  test("restore permits a new key while old keys remain revoked; a repeated restore keeps the new key", async () => {
    await archive(workspace);
    expect((await restore()).status).toBe(200);
    expect(await verify(key)).toMatchObject({ status: 401 });
    const newKey = await mint();
    expect(await verify(newKey)).toMatchObject({ authType: "api_key" });
    expect((await restore()).status).toBe(200);
    expect(await verify(newKey)).toMatchObject({ authType: "api_key" });
    expect(await countKeys()).toBe(1);
  });
  test("a provider release failure keeps the active workspace and its keys usable", async () => {
    await sql`update workspace set twilio_data = ${sql.json({ sid: provider.accountSid, authToken: "owned-provider-token" })} where id = ${workspace}`;
    await sql`insert into workspace_number (workspace, type, phone_number, friendly_name, twilio_phone_number_sid)
      values (${workspace}, 'local', ${provider.phone}, 'Owned release failure', ${provider.sid})`;
    provider.active = true; provider.failRemove = true;
    const response = await api("DELETE");
    expect(response.status).toBe(400);
    expect(await archived()).toBe(false);
    expect(await countKeys()).toBe(2);
    expect(await verify(key)).toMatchObject({ authType: "api_key" });
  });
  test("a database archive failure rolls key revocation back", async () => {
    const fault = `owned_archive_fault_${tag}`;
    await sql.unsafe(`create function ${fault}() returns trigger language plpgsql as $$ begin raise exception 'owned archive failure'; end $$`);
    await sql.unsafe(`create trigger ${fault} before update on workspace for each row when (new.id = '${workspace}'::uuid and new.archived_at is not null) execute function ${fault}()`);
    try {
      expect((await api("DELETE")).status).toBe(500);
      expect(await archived()).toBe(false);
      expect(await countKeys()).toBe(2);
      expect(await verify(key)).toMatchObject({ authType: "api_key" });
    } finally { await sql.unsafe(`drop trigger ${fault} on workspace`); await sql.unsafe(`drop function ${fault}()`); }
  });
  test("a key request overlapping archive cannot leave an active credential", async () => {
    if (!databaseUrl) throw new Error("Owned database required");
    const control = postgres(databaseUrl, { max: 1 });
    const lock = BigInt(`0x${tag.slice(0, 12)}`).toString(), barrier = `owned_archive_barrier_${tag}`;
    await control`select pg_advisory_lock(${lock}::bigint)`;
    await sql.unsafe(`create function ${barrier}() returns trigger language plpgsql as $$ begin perform pg_advisory_xact_lock(${lock}::bigint); return new; end $$`);
    await sql.unsafe(`create trigger ${barrier} before update on workspace for each row when (new.id = '${workspace}'::uuid and new.archived_at is not null) execute function ${barrier}()`);
    let archiving: ReturnType<typeof api> | undefined;
    let minting: ReturnType<typeof createKey> | undefined;
    try {
      archiving = api("DELETE");
      await waitForLock(true);
      let settled = false;
      minting = createKey(actor("owner").id, workspace, "Owned concurrent key", ["campaigns.read"], 30);
      void minting.then(() => { settled = true; });
      await waitForLock(false, () => settled);
      await control`select pg_advisory_unlock(${lock}::bigint)`;
      const [response, created] = await Promise.all([archiving, minting]);
      expect(response.status).toBe(200);
      expect(await countKeys()).toBe(0);
      if (created.ok) expect(await verify(created.key)).toMatchObject({ status: 401 });
      else expect(created).toMatchObject({ status: 404 });
    } finally {
      await control`select pg_advisory_unlock(${lock}::bigint)`;
      await Promise.allSettled([archiving, minting].filter(Boolean));
      await sql.unsafe(`drop trigger ${barrier} on workspace`);
      await sql.unsafe(`drop function ${barrier}()`);
      await control.end();
    }
  });
});
