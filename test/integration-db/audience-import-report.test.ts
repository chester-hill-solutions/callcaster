import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { parse } from "csv-parse/sync";
import { RouterContextProvider } from "react-router";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { resolveRouteResult } from "../helpers/route-result";

const session = vi.hoisted(() => ({ userId: "" }));
vi.mock("@/lib/auth.server", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/auth.server")>(),
  getSession: async () => ({ user: session.userId ? { id: session.userId, email: "report@example.test" } : null, headers: new Headers() }),
}));
const url = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
const suite = url ? describe : describe.skip;
const workspace = randomUUID(); const foreign = randomUUID(); const actor = randomUUID();
suite("audience report authenticated durable download (#2480)", () => {
  let native: postgres.Sql;
  let pools: typeof import("@/server/db");
  let middleware: typeof import("@/lib/workspace-middleware.server");
  let route: typeof import("../../app/routes/workspaces+/$id/audience-imports/$uploadId/report.loader.server");
  let runId: string; let uploadId: number;
  beforeAll(async () => {
    if (!url) throw new Error("Real database required");
    vi.stubEnv("DATABASE_URL", url); vi.stubEnv("DATABASE_DIRECT_URL", url);
    vi.stubEnv("BETTER_AUTH_SECRET", "owned-report-fixture-secret-with-32-characters");
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost"); vi.stubEnv("TWO_FACTOR_ENABLED", "0");
    native = postgres(url, { max: 2 });
    pools = await import("@/server/db");
    middleware = await import("@/lib/workspace-middleware.server");
    route = await import("../../app/routes/workspaces+/$id/audience-imports/$uploadId/report.loader.server");
    for (const id of [workspace, foreign]) await native`insert into workspace (id,name) values (${id}::uuid,'Report fixture')`;
    await native`insert into public."user" (id,username,created_at) values (${actor}::uuid,${`report-${actor}@example.test`},now())`;
    await native`insert into workspace_member (id,workspace_id,user_id,role_id) values (${`report-${actor}`},${workspace}::uuid,${actor},'member')`;
    const [audience] = await native`insert into audience (workspace,name,status) values (${workspace}::uuid,'Partial report','error') returning id`;
    const [run] = await native`insert into audience_import_run (workspace,audience_id,identity,file_sha256,mapping,created_by,source_rows,next_index,imported,invalid,duplicates)
      values (${workspace}::uuid,${audience.id},'owned-report','file',${native.json({fields:[["=Phone","phone"]],split:null,voterSource:null,version:1})},${actor}::uuid,250,201,199,1,1) returning id`;
    runId = run.id;
    const [upload] = await native`insert into audience_upload (workspace,audience_id,created_by,status,processed_contacts,total_contacts,import_run_id)
      values (${workspace}::uuid,${audience.id},${actor}::uuid,'error',200,249,${runId}::uuid) returning id`;
    uploadId = Number(upload.id);
    for (let i = 0; i < 201; i++) {
      const outcome = i === 1 ? "invalid" : i === 2 ? "duplicate" : "imported";
      await native`insert into audience_import_row (run_id,workspace,record_number,source,outcome,reason,contact_id,warnings)
        values (${runId}::uuid,${workspace}::uuid,${i+2},${native.json({recordNumber:i+2,startLine:i*2+2,endLine:i*2+3,byteStart:i*40+20,byteEnd:i*40+58})},
        ${outcome},${i===1 ? "invalid-phone" : i===2 ? "duplicate-phone" : null},${outcome==="imported" ? i+1000 : null},
        ${native.json(i===3 ? [{code:"unknown-opt-out",header:"@Consent",value:"+1+1"}] : [])})`;
    }
    const [job] = await native`insert into job (type,status,workspace_id,params) values ('audience_upload','completed',${workspace}::uuid,${native.json({uploadId})}) returning id`;
    await native`delete from job where id=${job.id}`;
    session.userId = actor;
  });
  afterAll(async () => {
    const failures: unknown[] = [];
    for (const pool of [pools?.pool, pools?.directPool]) {
      try { await pool?.end(); } catch (error) { failures.push(error); }
    }
    try {
      if (native) {
        await native`delete from audience_upload where workspace=${workspace}::uuid`;
        await native`delete from workspace where id in (${workspace}::uuid,${foreign}::uuid)`;
        await native`delete from public."user" where id=${actor}::uuid`;
      }
    } catch (error) { failures.push(error); }
    try { await native?.end(); } catch (error) { failures.push(error); }
    vi.unstubAllEnvs();
    if (failures.length) throw new AggregateError(failures,"Report fixture cleanup failed");
  });
  async function request(tenant = workspace, id = String(uploadId)) {
    const request = new Request(`http://localhost/workspaces/${tenant}/audience-imports/${id}/report`);
    const args = { request, url: new URL(request.url), params: { id: tenant, uploadId: id }, context: new RouterContextProvider() };
    const result = await resolveRouteResult(middleware.workspaceMiddleware(args, async () => route.loader(args)));
    if (!(result instanceof Response)) throw new Error("Report route did not return a raw Response");
    return result;
  }
  test("a real member can download exact partial outcomes after job pruning across pages", async () => {
    const response = await request(); expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Content-Disposition")).toContain(`call-list-import-${uploadId}.csv`);
    const rows = parse(await response.text(), { columns: true });
    expect(rows).toHaveLength(202);
    expect(rows[1]).toMatchObject({ Record:"3", "Start line":"4", "End line":"5", "Byte start":"60", "Byte end":"98",
      Outcome:"invalid", Field:"'=Phone", Reason:"Invalid phone number", "Contact ID":"", "Upload status":"error", "Captured rows":"201", "Source rows":"250" });
    expect(rows[2]).toMatchObject({ Record:"4", Outcome:"duplicate", Reason:"Duplicate phone number" });
    expect(rows[4]).toMatchObject({ Record:"5", Outcome:"imported", Field:"'@Consent", Value:"'+1+1",
      Reason:"Unknown opt-out value; contact is opted out and needs review", "Contact ID":"1003" });
    expect(rows.at(-1)).toMatchObject({ Record:"202", "Contact ID":"1200" });
  });
  test("foreign upload selection is denied and a non-member is stopped by real middleware", async () => {
    await native`insert into workspace_member (id,workspace_id,user_id,role_id) values (${`report-foreign-${actor}`},${foreign}::uuid,${actor},'member')`;
    expect((await request(foreign)).status).toBe(404);
    await native`delete from workspace_member where id=${`report-foreign-${actor}`}`;
    expect((await request(foreign)).headers.get("Location")).toBe("/workspaces");
    expect((await request(workspace,"1x")).status).toBe(400);
  });
  test("the download captures a committed prefix while another batch lands", async () => {
    const response = await request();
    await native`update audience_import_run set next_index=202,imported=200 where id=${runId}::uuid`;
    await native`insert into audience_import_row (run_id,workspace,record_number,source,outcome,contact_id)
      values (${runId}::uuid,${workspace}::uuid,203,${native.json({recordNumber:203,startLine:405,endLine:405,byteStart:9000,byteEnd:9020})},'imported',1201)`;
    const captured = parse(await response.text(),{columns:true});
    expect(captured).toHaveLength(202); expect(captured.at(-1).Record).toBe("202");
    const next = parse(await (await request()).text(),{columns:true});
    expect(next).toHaveLength(203); expect(next.at(-1).Record).toBe("203");
  });
});
