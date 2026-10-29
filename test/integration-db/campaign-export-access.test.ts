import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { RouterContextProvider } from "react-router";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { asRouteResponse } from "../helpers/route-result";

const io = vi.hoisted(() => ({
  objects: new Map<string, string>(), reads: [] as string[], writes: [] as string[],
  pending: [] as Promise<unknown>[],
}));
vi.mock("@/lib/send-verification-email.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/send-verification-email.server")>()),
  sendVerificationEmail: vi.fn(async () => undefined),
  sendAccountExistsEmail: vi.fn(async () => undefined),
}));
vi.mock("@/lib/object-storage.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/object-storage.server")>();
  return {
    ...actual,
    uploadObject: async (bucket: string, path: string, body: unknown) => {
      io.writes.push(path); io.objects.set(`${bucket}/${path}`, String(body));
    },
    downloadObject: async (bucket: string, path: string) => {
      io.reads.push(path);
      const text = io.objects.get(`${bucket}/${path}`);
      if (text === undefined) throw new actual.ObjectNotFoundError(bucket, path);
      return Buffer.from(text);
    },
    listObjects: async (bucket: string, prefix: string) => {
      io.reads.push(prefix);
      const start = `${bucket}/${prefix}/`;
      return [...io.objects.keys()].filter(key => key.startsWith(start)).map(key => ({
        name: key.slice(start.length), id: key, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }));
    },
    createSignedObjectUrl: async (_bucket: string, path: string) => `https://exports.example.test/${path}`,
  };
});
vi.mock("@/lib/background-task.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/background-task.server")>()),
  trackBackgroundFailure: (promise: Promise<unknown>) => { io.pending.push(promise); },
}));

const databaseUrl = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
const base = "http://127.0.0.1:3039";
const workspace = randomUUID(), foreign = randomUUID();
const roles = ["caller", "member", "admin", "owner", "outsider"] as const;
type Role = (typeof roles)[number];
type Surface = "legacy-start" | "status" | "api-start" | "api-list" | "page";
const identities = new Map<Role, { id: string; cookie: string; email: string }>();
const emails: string[] = [];
const closers: (() => Promise<unknown>)[] = [];
let sql: ReturnType<typeof postgres>;
let campaignId: number;
const callerAttemptIds: number[] = [];
const allAttemptIds: number[] = [];
let rpc: typeof import("@/lib/campaign-export-db.server");
let exportsModule: typeof import("@/lib/campaign-export.server");
let api: typeof import("@/routes/api+/workspaces+/$workspaceId/exports.action.server");
let legacy: typeof import("@/routes/api+/campaign-export.action.server");
let status: typeof import("@/routes/api+/campaign-export-status.loader.server");
let page: typeof import("@/routes/workspaces+/$id/exports.loader.server");
let dataPlane: typeof import("@/lib/data-plane-middleware.server").dataPlaneMiddleware;
let workspaceMiddleware: typeof import("@/lib/workspace-middleware.server").workspaceMiddleware;

function actor(role: Role) {
  const result = identities.get(role);
  if (!result) throw new Error("Owned identity missing");
  return result;
}
function storedStatus(exportId: string, exportType = "campaign-csv") {
  const text = JSON.stringify({ status: "completed", progress: 100, exportId, workspaceId: workspace,
    campaignId, campaignName: "Owned export", created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    downloadUrl: `https://exports.example.test/${exportId}.csv`, exportType });
  io.objects.set(`campaign-exports/${workspace}/${exportId}.json`, text);
}
async function invoke(surface: Surface, role: Role, sms = false) {
  const user = actor(role);
  const path = surface === "legacy-start" ? "/api/campaign-export"
    : surface === "status" ? `/api/campaign-export-status?workspaceId=${workspace}&exportId=${sms ? "sms" : "saved"}`
    : surface === "page" ? `/workspaces/${workspace}/exports` : `/api/workspaces/${workspace}/exports`;
  const headers = new Headers({ Cookie: user.cookie });
  let body: FormData | string | undefined;
  if (surface === "legacy-start") {
    body = new FormData(); body.set("campaignId", String(campaignId)); body.set("workspaceId", workspace);
    if (sms) body.set("exportType", "sms-report");
  } else if (surface === "api-start") {
    headers.set("Content-Type", "application/json"); body = JSON.stringify({ campaign_id: campaignId });
  }
  const request = new Request(base + path, { method: body ? "POST" : "GET", headers, body });
  const args = { request, url: new URL(request.url), params: { workspaceId: workspace, id: workspace }, context: new RouterContextProvider() };
  if (surface === "legacy-start") return asRouteResponse(legacy.action(args));
  if (surface === "status") return asRouteResponse(status.loader(args));
  if (surface === "page") return asRouteResponse(workspaceMiddleware(args, async () => page.loader(args)));
  return asRouteResponse(dataPlane(args, async () => surface === "api-start" ? api.action(args) : api.loader(args)));
}
async function finishBackground() {
  const tasks = io.pending.splice(0);
  const results = await Promise.allSettled(tasks);
  const failed = results.filter(result => result.status === "rejected");
  if (failed.length) throw new AggregateError(failed, "Owned export background failure");
}
function csv(exportId: string) {
  const text = io.objects.get(`campaign-exports/${workspace}/${exportId}.csv`);
  if (!text) throw new Error("Expected a real completed CSV");
  return text;
}

// Session auth, role lookup, middleware, tenant SQL and CSV generation are real.
// Only email delivery, object storage and background scheduling are intercepted.
describe.skipIf(!databaseUrl)("campaign export access with real sessions and PostgreSQL (#2882)", () => {
  beforeAll(async () => {
    if (!databaseUrl) throw new Error("Owned database required");
    for (const [name, value] of Object.entries({ DATABASE_URL: databaseUrl, DATABASE_DIRECT_URL: databaseUrl,
      BASE_URL: base, BETTER_AUTH_URL: base + "/api/auth", BETTER_AUTH_SECRET: "owned-export-access-2882-secret",
      TWO_FACTOR_ENABLED: "true", DISABLE_2FA_ENFORCEMENT: "0", E2E_DISABLE_2FA_ENFORCEMENT: "0", TZ: "UTC" })) vi.stubEnv(name, value);
    sql = postgres(databaseUrl, { max: 3 }); closers.push(() => sql.end());
    const database = await import("@/server/db"); closers.push(() => database.pool.end(), () => database.directPool.end());
    const { auth } = await import("@/server/auth-instance");
    const context = await auth.$context;
    for (const role of roles) {
      const email = `owned-2882-${role}-${randomUUID()}@example.test`, password = "OwnedExport2882Password!";
      emails.push(email);
      await auth.api.signUpEmail({ body: { name: `Owned ${role}`, email, password }, headers: new Headers({ Origin: base }), returnHeaders: true });
      await sql`update auth_user set email_verified = true where email = ${email}`;
      const result = await auth.api.signInEmail({ body: { email, password }, headers: new Headers({ Origin: base }), returnHeaders: true });
      const cookie = result.headers.getSetCookie().find(value => value.startsWith(context.authCookies.sessionToken.name + "="));
      if (!cookie) throw new Error("Real session cookie missing");
      identities.set(role, { id: result.response.user.id, cookie: cookie.split(";")[0], email });
      await sql`update auth_user set two_factor_enabled = true where id = ${result.response.user.id}`;
    }
    await sql`insert into workspace (id, name) values (${workspace}, 'Owned export access'), (${foreign}, 'Owned foreign export')`;
    for (const role of roles.filter(role => role !== "outsider")) await sql`insert into workspace_member (id, workspace_id, user_id, role_id)
      values (${randomUUID()}, ${workspace}, ${actor(role).id}, ${role})`;
    const [campaign] = await sql`insert into campaign (workspace, title, type, status)
      values (${workspace}, 'Owned live export', 'live_call', 'complete') returning id`;
    if (!campaign) throw new Error("Owned campaign missing"); campaignId = Number(campaign.id);
    const cases = [
      { marker: "OwnedCallerOne", user: actor("caller").id, ws: workspace },
      { marker: "OtherAgentPrivate", user: actor("member").id, ws: workspace },
      { marker: "OwnedCallerTwo", user: actor("caller").id, ws: workspace },
      { marker: "ForeignWorkspacePrivate", user: actor("caller").id, ws: foreign },
    ];
    for (const [index, item] of cases.entries()) {
      const [contact] = await sql`insert into contact (workspace, firstname, phone) values (${item.ws}, ${item.marker}, '+15550001111') returning id`;
      if (!contact) throw new Error("Owned contact missing");
      const [attempt] = await sql`insert into outreach_attempt (workspace, campaign_id, contact_id, user_id, disposition, created_at)
        values (${item.ws}, ${campaignId}, ${contact.id}, ${item.user}, 'completed', ${new Date(Date.UTC(2026, 9, 26, 10, 0, index))}) returning id`;
      if (!attempt) throw new Error("Owned attempt missing");
      if (item.ws === workspace) allAttemptIds.push(Number(attempt.id));
      if (item.ws === workspace && item.user === actor("caller").id) callerAttemptIds.push(Number(attempt.id));
    }
    rpc = await import("@/lib/campaign-export-db.server"); exportsModule = await import("@/lib/campaign-export.server");
    api = await import("@/routes/api+/workspaces+/$workspaceId/exports.action.server");
    legacy = await import("@/routes/api+/campaign-export.action.server"); status = await import("@/routes/api+/campaign-export-status.loader.server");
    page = await import("@/routes/workspaces+/$id/exports.loader.server");
    ({ dataPlaneMiddleware: dataPlane } = await import("@/lib/data-plane-middleware.server"));
    ({ workspaceMiddleware } = await import("@/lib/workspace-middleware.server"));
  });
  beforeEach(() => {
    io.objects.clear(); io.reads.length = 0; io.writes.length = 0;
    storedStatus("saved"); storedStatus("sms", "sms-report");
  });
  afterEach(async () => { await finishBackground(); });
  afterAll(async () => {
    const failures: unknown[] = [];
    try {
      await finishBackground();
      if (sql) {
        await sql`delete from outreach_attempt where workspace in (${workspace}, ${foreign})`;
        await sql`delete from contact where workspace in (${workspace}, ${foreign})`;
        await sql`delete from campaign where workspace in (${workspace}, ${foreign})`;
        await sql`delete from workspace_member where workspace_id in (${workspace}, ${foreign})`;
        await sql`delete from workspace where id in (${workspace}, ${foreign})`;
        for (const email of emails) { await sql`delete from "user" where username = ${email}`; await sql`delete from auth_user where email = ${email}`; }
      }
    } catch (error) { failures.push(error); }
    const results = await Promise.allSettled(closers.map(async close => close()));
    for (const result of results) if (result.status === "rejected") failures.push(result.reason);
    vi.unstubAllEnvs();
    if (failures.length) throw new AggregateError(failures, "Owned export fixture cleanup failure");
  });

  test.each<Surface>(["legacy-start", "status", "api-start", "api-list", "page"])("caller cannot use %s or touch stored artifacts", async surface => {
    const response = await invoke(surface, "caller");
    expect(response.status).toBe(403);
    expect(io.reads).toEqual([]); expect(io.writes).toEqual([]);
  });
  test.each<Surface>(["status", "api-list", "page"])("member can use %s and receive the campaign export", async surface => {
    const response = await invoke(surface, "member"); expect(response.status).toBe(200);
    const text = await response.text(); expect(text).toContain("saved.csv"); expect(text).not.toContain("sms.csv");
  });
  test.each<Surface>(["legacy-start", "api-start"])("member can start a real export through %s", async surface => {
    const response = await invoke(surface, "member"); expect(response.status).toBe(surface === "api-start" ? 202 : 200);
    await finishBackground();
    const content = await response.json(); const id = content.exportId ?? content.export_id;
    expect(typeof id).toBe("string"); expect(csv(id)).toContain("OtherAgentPrivate"); expect(csv(id)).not.toContain("ForeignWorkspacePrivate");
  });
  test.each(["admin", "owner"] as const)("%s can read SMS report status", async role => {
    const response = await invoke("status", role, true); expect(response.status).toBe(200); expect(await response.text()).toContain("sms.csv");
  });
  test("member cannot read SMS report status", async () => { expect((await invoke("status", "member", true)).status).toBe(403); });
  test.each<Surface>(["legacy-start", "status", "api-start", "api-list"])("non-member receives404 from %s before artifact access", async surface => {
    expect((await invoke(surface, "outsider")).status).toBe(404); expect(io.reads).toEqual([]); expect(io.writes).toEqual([]);
  });
  test("the real count uses the caller scope", async () => { expect(await rpc.countExportOutreachAttempts(workspace, campaignId, actor("caller").id)).toBe(2); });
  test("the real page query filters before offset and limit", async () => {
    const rows = await rpc.listExportOutreachAttempts(workspace, campaignId, 1, 1, actor("caller").id);
    expect(rows.map(row => row.id)).toEqual([callerAttemptIds[1]]);
  });
  test("workspace scope keeps all local attempts and excludes a foreign-workspace row", async () => {
    expect(await rpc.countExportOutreachAttempts(workspace, campaignId, null)).toBe(3);
    expect((await rpc.listExportOutreachAttempts(workspace, campaignId, 0, 100, null)).map(row => row.id)).toEqual(allAttemptIds);
  });
  test("the real caller pipeline exports only that caller's rows", async () => {
    await exportsModule.processCallCampaignExport(campaignId, workspace, "caller-csv", "Owned live export", { kind: "user", userId: actor("caller").id });
    expect(csv("caller-csv")).toContain("OwnedCallerOne"); expect(csv("caller-csv")).toContain("OwnedCallerTwo");
    expect(csv("caller-csv")).not.toContain("OtherAgentPrivate"); expect(csv("caller-csv")).not.toContain("ForeignWorkspacePrivate");
  });
  test("the real member pipeline retains all local agents", async () => {
    await exportsModule.processCallCampaignExport(campaignId, workspace, "member-csv", "Owned live export", { kind: "user", userId: actor("member").id });
    expect(csv("member-csv")).toContain("OwnedCallerOne"); expect(csv("member-csv")).toContain("OtherAgentPrivate"); expect(csv("member-csv")).not.toContain("ForeignWorkspacePrivate");
  });
  test("a trusted system export retains all local agents", async () => {
    await exportsModule.processCallCampaignExport(campaignId, workspace, "system-csv", "Owned live export", { kind: "system" });
    expect(csv("system-csv")).toContain("OwnedCallerOne"); expect(csv("system-csv")).toContain("OtherAgentPrivate"); expect(csv("system-csv")).not.toContain("ForeignWorkspacePrivate");
  });
  test("the pipeline refuses a non-member actor before storage", async () => {
    await expect(exportsModule.processCallCampaignExport(campaignId, workspace, "outsider-csv", "Owned live export", { kind: "user", userId: actor("outsider").id })).rejects.toMatchObject({ statusCode: 404 });
    expect(io.reads).toEqual([]); expect(io.writes).toEqual([]);
  });
});
