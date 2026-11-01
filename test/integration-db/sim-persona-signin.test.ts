import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { resolveLocalProjectConfig } from "../../config/load";
import { resolveSimProfile } from "../../e2e/sim/personas";
import { asRouteResponse, routeArgs } from "../helpers/route-result";

const databaseUrl = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const runtime = resolveLocalProjectConfig({ devName: `proof-${randomUUID().replaceAll("-", "")}`, envName: "local" });
const profiles = ["person-a", "person-b"].map(personaKey => resolveSimProfile({ personaKey, config: runtime.config, localIdentity: runtime.identity }));
const owner = profiles[0];
const PASSWORD = "owned-sim-signin-fixture-2828";
const hostedKeys = ["RAILWAY_ENVIRONMENT", "RAILWAY_ENVIRONMENT_NAME", "RAILWAY_ENVIRONMENT_ID", "RAILWAY_SERVICE_ID", "RAILWAY_DEPLOYMENT_ID", "RAILWAY_PROJECT_ID", "K_SERVICE", "VERCEL", "FLY_APP_NAME"] as const;

suite("reconciled SIM personas can sign in through the real app (#2828)", () => {
  let client: postgres.Sql;
  let reconcile: typeof import("../../app/server/sim-profile-reconciliation.server").reconcileSimProfileInDatabase;
  let pools: Pick<typeof import("@/server/db"), "pool" | "directPool">;

  beforeAll(async () => {
    if (!databaseUrl) throw new Error("SIM sign-in needs an owned database");
    vi.stubEnv("DATABASE_URL", databaseUrl);
    vi.stubEnv("DATABASE_DIRECT_URL", databaseUrl);
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:8123/api/auth");
    vi.stubEnv("BETTER_AUTH_SECRET", "owned-sim-signin-fixture-secret-longer-than-32-characters");
    client = postgres(databaseUrl, { max: 1 });
    pools = await import("@/server/db");
    ({ reconcileSimProfileInDatabase: reconcile } = await import("../../app/server/sim-profile-reconciliation.server"));
  });
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "test");
    for (const key of hostedKeys) vi.stubEnv(key, undefined);
  });
  afterAll(async () => {
    const errors: unknown[] = [];
    try {
      if (client) {
        const users = await client`select id from public.auth_user where sim_marker = ${owner.workspaceMarker}`;
        const workspaces = await client`select id from public.workspace where sim_marker = ${owner.workspaceMarker}`;
        for (const row of workspaces) {
          await client`delete from public.workspace_audit_event where workspace_id = ${row.id}::uuid`;
          await client`delete from public.workspace_member where workspace_id = ${row.id}`;
          await client`delete from public.workspace where id = ${row.id}::uuid`;
        }
        for (const row of users) {
          await client`delete from public.auth_user where id = ${row.id}`;
          await client`delete from public."user" where id = ${row.id}::uuid`;
        }
      }
    } catch (error) { errors.push(error); }
    try { await client?.end(); } catch (error) { errors.push(error); }
    try { await pools?.pool.end(); } catch (error) { errors.push(error); }
    try { await pools?.directPool.end(); } catch (error) { errors.push(error); }
    finally { vi.unstubAllEnvs(); }
    if (errors.length) throw new AggregateError(errors, "SIM fixture cleanup failed");
  });

  async function signIn(email: string, password = PASSWORD) {
    const { action } = await import("../../app/routes/signin.action.server");
    return asRouteResponse(action(routeArgs(new Request("http://localhost:8123/signin", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ email, password }),
    })) as Parameters<typeof action>[0]));
  }
  async function credentialState(email: string) {
    return client`select u.id as user_id, a.id as account_id, a.password, wm.role_id, wm.workspace_id
      from public.auth_user u join public.auth_account a on a.user_id = u.id and a.provider_id = 'credential'
      join public.workspace_member wm on wm.user_id = u.id where u.email = ${email}`;
  }

  test.each(profiles)("$personaKey receives a working credential for its saved role", async profile => {
    await reconcile(profile, async () => PASSWORD);
    const rows = await credentialState(profile.email);
    expect(rows).toHaveLength(1);
    expect(rows[0].role_id).toBe(profile.expectedRole);
    expect(rows[0].password).not.toBe(PASSWORD);
    const result = await signIn(profile.email);
    expect(result.headers.get("Location")).toBe("/workspaces");
    const cookie = result.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
    const { verifyAuth } = await import("../../app/lib/auth.server");
    expect((await verifyAuth(new Request("http://localhost:8123/workspaces", { headers: { cookie } }))).user.id).toBe(rows[0].user_id);
  });

  test("rerun keeps the same user, workspace and credential account", async () => {
    const before = await credentialState(owner.email);
    expect((await reconcile(owner, async () => PASSWORD)).status).toBe("reused");
    const after = await credentialState(owner.email);
    expect(after.map(({ password: _password, ...row }) => row)).toEqual(before.map(({ password: _password, ...row }) => row));
    expect((await signIn(owner.email)).headers.get("Location")).toBe("/workspaces");
  });

  test("a marked legacy user without a credential account is repaired", async () => {
    const before = await credentialState(owner.email);
    await client`delete from public.auth_account where id = ${before[0].account_id}`;
    await reconcile(owner, async () => PASSWORD);
    const after = await credentialState(owner.email);
    expect(after).toHaveLength(1);
    expect(after[0].user_id).toBe(before[0].user_id);
    expect((await signIn(owner.email)).headers.get("Location")).toBe("/workspaces");
  });

  test("a changed resolved password replaces the credential on the same identity", async () => {
    const before = await credentialState(owner.email);
    const rotated = "owned-rotated-sim-fixture-2828";
    await reconcile(owner, async () => rotated);
    const after = await credentialState(owner.email);
    expect(after[0].account_id).toBe(before[0].account_id);
    expect((await signIn(owner.email, rotated)).headers.get("Location")).toBe("/workspaces");
    expect((await signIn(owner.email)).headers.get("Location")).toBeNull();
  });

  test("a foreign marker cannot replace the saved credential", async () => {
    const before = await credentialState(owner.email);
    await client`update public.auth_user set sim_marker = 'foreign-fixture-marker' where id = ${before[0].user_id}`;
    try {
      await expect(reconcile(owner, async () => "unwanted-replacement")).rejects.toThrow(/another marker/);
      expect((await credentialState(owner.email))[0].password).toBe(before[0].password);
    } finally {
      await client`update public.auth_user set sim_marker = ${owner.workspaceMarker} where id = ${before[0].user_id}`;
    }
  });

  test("a workspace collision rolls back the new user and credential", async () => {
    const third = resolveSimProfile({ personaKey: "person-c", config: runtime.config, localIdentity: runtime.identity });
    const collisionId = randomUUID();
    await client`insert into public.workspace (id, name, twilio_data) values (${collisionId}::uuid, ${third.workspaceName}, '{}'::jsonb)`;
    try {
      await expect(reconcile(third, async () => PASSWORD)).rejects.toThrow(/identity collision/);
      expect(await client`select id from public.auth_user where email = ${third.email}`).toHaveLength(0);
      expect(await credentialState(third.email)).toHaveLength(0);
      const [preserved] = await client`select name, sim_marker from public.workspace where id = ${collisionId}::uuid`;
      expect(preserved).toEqual({ name: third.workspaceName, sim_marker: null });
    } finally { await client`delete from public.workspace where id = ${collisionId}::uuid`; }
  });

  test.each(hostedKeys)("%s refuses before requesting the password", async key => {
    vi.stubEnv(key, "fixture-hosted-identity");
    const getPassword = vi.fn();
    await expect(reconcile(owner, getPassword)).rejects.toThrow(/only for local runtime/);
    expect(getPassword).not.toHaveBeenCalled();
  });
  test("production refuses before requesting the password", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const getPassword = vi.fn();
    await expect(reconcile(owner, getPassword)).rejects.toThrow(/only for local runtime/);
    expect(getPassword).not.toHaveBeenCalled();
  });
});
