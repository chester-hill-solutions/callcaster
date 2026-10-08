import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { RouterContextProvider } from "react-router";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { asRouteResponse } from "../helpers/route-result";

const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/server/auth-instance", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/server/auth-instance")>();
  return { ...original, auth: { ...original.auth, api: { ...original.auth.api,
    getSession: vi.fn(async () => ({ headers: new Headers({ "Set-Cookie": "history-session=retained; HttpOnly" }), response: session.userId ? {
      user: { id: session.userId, email: "history@example.test", name: "History reader" },
      session: { token: "history-fixture-session", userId: session.userId, expiresAt: new Date("2030-01-01") },
    } : null })),
  } } };
});

const databaseUrl = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const workspaceId = randomUUID();
const foreignId = randomUUID();
const actorId = randomUUID();
const outsiderId = randomUUID();
suite("audience history route uses authorized tenant rows (#2288)", () => {
  let client: postgres.Sql;
  let pools: Pick<typeof import("@/server/db"), "pool" | "directPool"> | undefined;
  let route: typeof import("../../app/routes/workspaces+/$id/audiences/$audience_id.loader.server");
  let queries: typeof import("@/lib/audience-upload-db.server");
  let ownedAudience: number;
  let secondAudience: number;
  let foreignAudience: number;
  let ownedUpload: number;
  beforeAll(async () => {
    if (!databaseUrl) throw new Error("History tests require a real database");
    vi.stubEnv("DATABASE_URL", databaseUrl); vi.stubEnv("DATABASE_DIRECT_URL", databaseUrl);
    vi.stubEnv("BETTER_AUTH_SECRET", "owned-history-fixture-secret-with-32-characters");
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost");
    client = postgres(databaseUrl, { max: 1 });
    for (const id of [workspaceId, foreignId]) await client`insert into workspace (id, name, twilio_data) values (${id}::uuid, 'History fixture', '{}'::jsonb)`;
    for (const id of [actorId, outsiderId]) await client`insert into public."user" (id, username, created_at) values (${id}::uuid, ${`history-${id}@example.test`}, now())`;
    await client`insert into workspace_member (id, workspace_id, user_id, role_id) values (${`history:${workspaceId}:${actorId}`}, ${workspaceId}, ${actorId}, 'owner')`;
    const [owned] = await client`insert into audience (workspace, name, status) values (${workspaceId}::uuid, 'Owned history', 'completed') returning id`;
    const [second] = await client`insert into audience (workspace, name, status) values (${workspaceId}::uuid, 'Other audience', 'completed') returning id`;
    const [foreign] = await client`insert into audience (workspace, name, status) values (${foreignId}::uuid, 'Foreign audience', 'completed') returning id`;
    ownedAudience = Number(owned.id); secondAudience = Number(second.id); foreignAudience = Number(foreign.id);
    const [upload] = await client`insert into audience_upload (audience_id, workspace, created_by, status, file_name, file_size, total_contacts, processed_contacts, created_at, header_mapping)
      values (${ownedAudience}, ${workspaceId}::uuid, ${actorId}::uuid, 'completed', 'owned.csv', 1024, 10, 10, '2026-10-01T12:00:00Z', '{"private":"mapping"}'::jsonb) returning id`;
    ownedUpload = Number(upload.id);
    await client`insert into audience_upload (audience_id, workspace, status, file_name, total_contacts, processed_contacts)
      values (${secondAudience}, ${workspaceId}::uuid, 'pending', 'other-audience.csv', 1, 0),
             (${foreignAudience}, ${foreignId}::uuid, 'pending', 'foreign.csv', 1, 0),
             (${ownedAudience}, ${foreignId}::uuid, 'pending', 'wrong-workspace.csv', 1, 0)`;
    pools = await import("@/server/db");
    queries = await import("@/lib/audience-upload-db.server");
    route = await import("../../app/routes/workspaces+/$id/audiences/$audience_id.loader.server");
  });
  beforeEach(() => { session.userId = actorId; });
  afterAll(async () => {
    try {
      if (client) {
        await client`delete from audience_upload where workspace in (${workspaceId}::uuid, ${foreignId}::uuid)`;
        await client`delete from audience where workspace in (${workspaceId}::uuid, ${foreignId}::uuid)`;
        await client`delete from workspace_member where workspace_id = ${workspaceId}`;
        await client`delete from workspace where id in (${workspaceId}::uuid, ${foreignId}::uuid)`;
        await client`delete from public."user" where id in (${actorId}::uuid, ${outsiderId}::uuid)`;
      }
    } finally { await Promise.all([client?.end(), pools?.pool.end(), pools?.directPool.end()]); vi.unstubAllEnvs(); }
  });
  async function load(workspace = workspaceId, audience: string | number | undefined = ownedAudience) {
    const request = new Request(`http://localhost/workspaces/${workspace}/audiences/${audience ?? ""}`);
    return asRouteResponse(route.loader({ request, url: new URL(request.url), params: { id: workspace, audience_id: audience == null ? undefined : String(audience) }, context: new RouterContextProvider() }));
  }
  test("the real loader returns only display fields for the owned audience and preserves auth headers", async () => {
    const response = await load(); const body = await response.json() as { uploadHistory: Array<{ created_at: string }>; uploadHistoryError: unknown; audience: { name: string } };
    expect(response.status).toBe(200); expect(response.headers.get("Set-Cookie")).toBe("history-session=retained; HttpOnly");
    expect(body.audience.name).toBe("Owned history");
    expect(body.uploadHistory).toEqual([{ id: ownedUpload, audience_id: ownedAudience, created_at: expect.any(String), status: "completed", file_name: "owned.csv", file_size: 1024, total_contacts: 10, processed_contacts: 10, processed_at: null, error_message: null }]);
    expect(new Date(body.uploadHistory[0].created_at).toISOString()).toBe("2026-10-01T12:00:00.000Z");
    expect(body.uploadHistoryError).toBeNull();
    expect(JSON.stringify(body.uploadHistory)).not.toMatch(/private|mapping|created_by|workspace/);
  });
  test("the real query excludes the other audience and a same-audience foreign-workspace row", async () => {
    const rows = await queries.listAudienceUploadsByAudienceId(workspaceId, ownedAudience);
    expect(rows.map(row => row.file_name)).toEqual(["owned.csv"]);
    expect((await queries.listAudienceUploadsByAudienceId(workspaceId, secondAudience)).map(row => row.file_name)).toEqual(["other-audience.csv"]);
  });
  test("a member requesting a foreign audience gets 404 and no history read", async () => {
    const read = vi.spyOn(queries, "listAudienceUploadsByAudienceId");
    try {
      const response = await load(workspaceId, foreignAudience); expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ audience: null, uploadHistory: null, uploadHistoryError: null, error: "Audience not found" }); expect(read).not.toHaveBeenCalled();
    } finally { read.mockRestore(); }
  });
  test("a nonmember requesting an existing workspace gets the uniform 404 and no history", async () => {
    session.userId = outsiderId; const response = await load(); expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Workspace not found" });
  });
  test("a member of another workspace gets the same 404", async () => {
    const response = await load(foreignId, foreignAudience); expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Workspace not found" });
  });
  test("a missing audience stays distinct from an empty upload history", async () => {
    const response = await load(workspaceId, -1); expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ audience: null, uploadHistory: null, uploadHistoryError: null });
    const [empty] = await client`insert into audience (workspace, name, status) values (${workspaceId}::uuid, 'Empty history', 'completed') returning id`;
    const emptyResponse = await load(workspaceId, Number(empty.id)); expect(emptyResponse.status).toBe(200);
    expect(await emptyResponse.json()).toMatchObject({ uploadHistory: [], uploadHistoryError: null });
  });
  test("a read failure preserves the audience, hides internal errors, and a later load recovers", async () => {
    const read = vi.spyOn(queries, "listAudienceUploadsByAudienceId").mockRejectedValueOnce(new Error("private database connection detail"));
    try {
      const response = await load(); expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ audience: { name: "Owned history" }, uploadHistory: null, uploadHistoryError: "Upload history could not be loaded. Try again." });
      expect((await response.text())).not.toContain("private database connection detail");
      const retry = await load(); expect(await retry.json()).toMatchObject({ uploadHistory: [{ file_name: "owned.csv" }], uploadHistoryError: null });
    } finally { read.mockRestore(); }
  });
  test("an anonymous request retains the sign-in redirect", async () => {
    session.userId = null; const response = await load(); expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toMatch(/^\/signin/);
  });
});
