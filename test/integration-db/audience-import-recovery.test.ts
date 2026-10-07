import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

const storage = vi.hoisted(() => ({ mode: "ok", statuses: [] as Array<Record<string, unknown>> }));
vi.mock("@/lib/object-storage.server", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/object-storage.server")>(),
  uploadObject: vi.fn(async (_bucket: string, _path: string, content: string) => {
    const status = JSON.parse(content);
    if (storage.mode === "always" || (storage.mode === "final" && status.status === "completed") ||
      (storage.mode === "batch" && String(status.stage).startsWith("Processing contacts (40/"))) throw new Error("Fixture storage failure");
    storage.statuses.push(status);
  }),
}));
const url = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
const suite = url ? describe : describe.skip;
const actor = randomUUID(); const workspace = randomUUID(); const foreign = randomUUID();
const schema = `import_job_${randomUUID().replaceAll("-", "")}`;
suite("audience import durable source recovery (#2479)", () => {
  let native: postgres.Sql; let client: postgres.Sql;
  let pools: typeof import("@/server/db");
  let processor: typeof import("@/lib/audience-upload-process.server");
  let protocol: typeof import("@/lib/audience-import-recovery.server");
  let mapper: typeof import("@/lib/audience-import-map");
  let worker: typeof import("@/lib/worker/poll-jobs.server");
  let handlers: typeof import("@/lib/worker/handlers.server");
  let publicJob: number; let audience: number; let upload: number; let job: number;
  beforeAll(async () => {
    if (!url) throw new Error("Real PostgreSQL required");
    native = postgres(url, { max: 2 });
    await native.unsafe(`create schema "${schema}"`);
    await native.unsafe(`create table "${schema}".job (like public.job including all)`);
    const scoped = new URL(url); scoped.searchParams.set("search_path", `${schema},public`);
    vi.stubEnv("DATABASE_URL", scoped.toString()); vi.stubEnv("DATABASE_DIRECT_URL", scoped.toString());
    vi.stubEnv("BETTER_AUTH_SECRET", "owned-import-fixture-with-32-character-secret");
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost");
    client = postgres(scoped.toString(), { max: 2 });
    for (const id of [workspace, foreign]) await native`insert into workspace (id, name) values (${id}::uuid, 'Import recovery fixture')`;
    await native`insert into public."user" (id, username, created_at) values (${actor}::uuid, ${`import-${actor}@example.test`}, now())`;
    const [control] = await native`insert into public.job (type, status, workspace_id) values ('audience_upload', 'queued', ${foreign}::uuid) returning id`;
    publicJob = Number(control.id);
    pools = await import("@/server/db"); processor = await import("@/lib/audience-upload-process.server");
    protocol = await import("@/lib/audience-import-recovery.server"); mapper = await import("@/lib/audience-import-map");
    worker = await import("@/lib/worker/poll-jobs.server"); handlers = await import("@/lib/worker/handlers.server");
    expect((await pools.pool`select current_schema() as schema`)[0].schema).toBe(schema);
  });
  beforeEach(async () => {
    storage.mode = "ok"; storage.statuses.length = 0;
    const [a] = await native`insert into audience (workspace, name, status) values (${workspace}::uuid, 'Recovery audience', 'processing') returning id`;
    audience = Number(a.id); upload = await newUpload(audience); job = await newJob(upload, audience);
  });
  afterEach(async () => {
    await native.unsafe(`drop function if exists "${schema}".reject_import() cascade`);
    expect((await native`select status from public.job where id = ${publicJob}`)[0].status).toBe("queued");
    await client`delete from job`;
    await native`delete from audience_upload where workspace in (${workspace}::uuid, ${foreign}::uuid)`;
    await native`delete from contact_audience where audience_id in (select id from audience where workspace in (${workspace}::uuid, ${foreign}::uuid))`;
    await native`delete from audience where workspace in (${workspace}::uuid, ${foreign}::uuid)`;
    await native`delete from contact where workspace in (${workspace}::uuid, ${foreign}::uuid)`;
    await native`delete from households where workspace_id in (${workspace}::uuid, ${foreign}::uuid)`;
  });
  afterAll(async () => {
    const failures: unknown[] = [];
    for (const pool of [pools?.pool, pools?.directPool, client]) {
      try { await pool?.end(); } catch (error) { failures.push(error); }
    }
    try {
      if (native) {
        await native`delete from public.job where id = ${publicJob}`;
        await native`delete from audience_upload where workspace in (${workspace}::uuid, ${foreign}::uuid)`;
        await native`delete from contact_audience where audience_id in (select id from audience where workspace in (${workspace}::uuid, ${foreign}::uuid))`;
        await native`delete from audience where workspace in (${workspace}::uuid, ${foreign}::uuid)`;
        await native`delete from contact where workspace in (${workspace}::uuid, ${foreign}::uuid)`;
        await native`delete from households where workspace_id in (${workspace}::uuid, ${foreign}::uuid)`;
        await native`delete from workspace where id in (${workspace}::uuid, ${foreign}::uuid)`;
        await native`delete from public."user" where id = ${actor}::uuid`;
        await native.unsafe(`drop schema if exists "${schema}" cascade`);
      }
    } catch (error) { failures.push(error); }
    try { await native?.end(); } catch (error) { failures.push(error); }
    vi.unstubAllEnvs();
    if (failures.length) throw new AggregateError(failures, "Import fixture cleanup failed");
  });
  async function newUpload(audienceId: number, tenant = workspace) {
    const [row] = await native`insert into audience_upload (workspace, audience_id, created_by, status, total_contacts, processed_contacts)
      values (${tenant}::uuid, ${audienceId}, ${actor}::uuid, 'pending', 0, 0) returning id`;
    return Number(row.id);
  }
  async function newJob(uploadId: number, audienceId: number, tenant = workspace) {
    const [row] = await client`insert into job (type, workspace_id, user_id, params, status, attempt_count, claimed_by, claimed_until)
      values ('audience_upload', ${tenant}::uuid, ${actor}::uuid, ${client.json({ uploadId, audienceId })}, 'running', 1, 'fixture', now() + interval '5 minutes') returning id`;
    return Number(row.id);
  }
  const mapping = { Name: "firstname", Phone: "phone", Address: "address", Postal: "postal", Consent: "opt_out" };
  function csv(rows = 1, phone = true) {
    return "Name,Phone,Address,Postal,Consent\r\n" + Array.from({ length: rows }, (_, i) =>
      `Person ${i},${phone ? `416555${String(1000 + i).padStart(4, "0")}` : ""},${i} Main St,M5V 1A1,no`).join("\r\n");
  }
  function args(content = csv(), fields = mapping, uploadId = upload, jobId = job, audienceId = audience, tenant = workspace) {
    return { uploadId, audienceId, workspaceId: tenant, userId: actor, fileContent: Buffer.from(content).toString("base64"),
      headerMapping: fields, splitNameColumn: null, claim: { jobId, attemptCount: 1 } };
  }
  function ctx() { return { uploadId: upload, audienceId: audience, workspaceId: workspace, userId: actor, claim: { jobId: job, attemptCount: 1 } }; }
  async function evidence(audienceId = audience) {
    const contacts = await native`select c.id, c.firstname, c.opt_out, c.household_id from contact c join contact_audience ca on ca.contact_id=c.id where ca.audience_id=${audienceId} order by c.id`;
    const receipts = await native`select r.* from audience_import_row r join audience_import_run run on run.id=r.run_id where run.audience_id=${audienceId} order by record_number`;
    const orphans = await native`select c.id from contact c where c.workspace=${workspace}::uuid and not exists(select 1 from contact_audience ca where ca.contact_id=c.id)`;
    expect(orphans).toHaveLength(0);
    expect(receipts.filter(row => row.outcome === "imported").map(row => Number(row.contact_id)).sort((a,b) => a-b)).toEqual(contacts.map(row => Number(row.id)).sort((a,b) => a-b));
    return { contacts, receipts };
  }
  async function fault(table: string, condition: string, tenantColumn = "workspace") {
    const guard = tenantColumn === "audience_id" ? `new.audience_id = ${audience}` : `new.${tenantColumn} = '${workspace}'::uuid`;
    await native.unsafe(`create function "${schema}".reject_import() returns trigger language plpgsql as $$ begin if ${guard} and (${condition}) then raise exception 'Fixture ${table} fault'; end if; return new; end $$`);
    await native.unsafe(`create trigger reject_import before insert or update on public.${table} for each row execute function "${schema}".reject_import()`);
  }
  test.each([
    ["contact", "true", "workspace"], ["contact_audience", "true", "audience_id"], ["households", "true", "workspace_id"],
    ["audience_import_row", "true", "workspace"], ["audience_import_run", "new.next_index > 0", "workspace"],
    ["audience_upload", "new.processed_contacts > 0", "workspace"],
  ])("%s failure rolls back every effect in the batch and a retry recovers", async (table, condition, column) => {
    const householdsBefore = await native`select id from households where workspace_id=${workspace}::uuid order by id`;
    await fault(table, condition, column);
    await expect(processor.processAudienceUpload(args())).rejects.toThrow();
    expect((await evidence()).contacts).toHaveLength(0);
    expect(await native`select id from households where workspace_id=${workspace}::uuid order by id`).toEqual(householdsBefore);
    await native.unsafe(`drop function "${schema}".reject_import() cascade`);
    const result = await processor.processAudienceUpload(args()); expect(result.imported).toBe(1);
    expect((await evidence()).receipts).toHaveLength(1);
  });
  test("a later batch failure names exactly the first 40 landed source records; re-upload resumes without phone dedupe", async () => {
    storage.mode = "batch";
    const content = csv(45, false); const fields = { ...mapping, Phone: "ignore" };
    await expect(processor.processAudienceUpload(args(content, fields))).rejects.toThrow("Fixture storage failure");
    const landed = await evidence(); expect(landed.contacts).toHaveLength(40);
    expect(landed.receipts.map(row => row.record_number)).toEqual(Array.from({length:40}, (_,i)=>i+2));
    expect(landed.receipts[0].source).toEqual({ recordNumber: 2, byteStart: 35, byteEnd: 65, startLine: 2, endLine: 2 });
    storage.mode = "ok";
    const reupload = await newUpload(audience); const rejob = await newJob(reupload, audience);
    await processor.processAudienceUpload(args(content, fields, reupload, rejob));
    expect((await evidence()).contacts).toHaveLength(45);
    await processor.processAudienceUpload(args(content, fields)); expect((await evidence()).contacts).toHaveLength(45);
  });
  test.each(["final-status", "final-storage"])("%s failure preserves exact landed receipts and repairs completion without inserting", async kind => {
    if (kind === "final-status") await fault("audience_upload", "new.status = 'completed'"); else storage.mode = "final";
    await expect(processor.processAudienceUpload(args())).rejects.toThrow();
    const before = await evidence(); expect(before.contacts).toHaveLength(1); expect(before.receipts).toHaveLength(1);
    await native.unsafe(`drop function if exists "${schema}".reject_import() cascade`); storage.mode="ok";
    await processor.processAudienceUpload(args());
    expect((await evidence()).contacts).toEqual(before.contacts);
    expect((await native`select status,processed_contacts,total_contacts from audience_upload where id=${upload}`)[0]).toMatchObject({status:"completed",processed_contacts:"1",total_contacts:"1"});
  });
  test("expired and reclaimed claims cannot write, while the next real claim resumes", async () => {
    const prepared = mapper.prepareAudienceImport(Buffer.from(csv(45,false)), {...mapping, Phone:"ignore"}, null, null);
    const run = await protocol.startAudienceImport(ctx(), prepared); await protocol.advanceAudienceImport(ctx(),run.id,prepared);
    await client`update job set claimed_until=now()-interval '1 second' where id=${job}`;
    await expect(protocol.advanceAudienceImport(ctx(),run.id,prepared)).rejects.toThrow("claim lost");
    expect((await evidence()).contacts).toHaveLength(40);
    await worker.resetStaleClaims(); const claimed=await worker.claimNextJob("next-worker"); expect(claimed?.id).toBe(job);
    await expect(protocol.advanceAudienceImport(ctx(),run.id,prepared)).rejects.toThrow("claim lost");
    if (!claimed) throw new Error("Recovery claim missing");
    await processor.processAudienceUpload({...args(csv(45,false),{...mapping,Phone:"ignore"}),claim:{jobId:job,attemptCount:claimed.attempt_count}});
    expect((await evidence()).contacts).toHaveLength(45);
  });
  test("claim expiry during a batch rolls back contacts, links, households and receipts",async()=>{
    const prepared=mapper.prepareAudienceImport(Buffer.from(csv()),mapping,null,null);
    const run=await protocol.startAudienceImport(ctx(),prepared);
    const before=await native`select id from households where workspace_id=${workspace}::uuid order by id`;
    await native.unsafe(`create function "${schema}".reject_import() returns trigger language plpgsql as $$ begin if new.audience_id=${audience} then perform pg_sleep(0.3); end if; return new; end $$`);
    await native.unsafe(`create trigger reject_import before insert on public.contact_audience for each row execute function "${schema}".reject_import()`);
    await client`update job set claimed_until=clock_timestamp()+interval '0.15 seconds' where id=${job}`;
    await expect(protocol.advanceAudienceImport(ctx(),run.id,prepared)).rejects.toThrow("claim lost");
    expect((await evidence()).contacts).toHaveLength(0);
    expect(await native`select id from households where workspace_id=${workspace}::uuid order by id`).toEqual(before);
    await native.unsafe(`drop function "${schema}".reject_import() cascade`);
    await worker.resetStaleClaims();const claimed=await worker.claimNextJob("expiry-recovery");
    if(!claimed)throw new Error("Recovery claim missing");
    await processor.processAudienceUpload({...args(),claim:{jobId:job,attemptCount:claimed.attempt_count}});
    expect((await evidence()).contacts).toHaveLength(1);
  });
  test("legacy retries without receipts stop before contact writes",async()=>{
    await client`update job set attempt_count=2 where id=${job}`;
    await expect(processor.processAudienceUpload({...args(),claim:{jobId:job,attemptCount:2}})).rejects.toThrow("no recovery evidence");
    expect((await evidence()).contacts).toHaveLength(0);
    await client`update job set attempt_count=1 where id=${job}`;
    const [legacy] = await native`insert into contact (workspace,firstname) values (${workspace}::uuid,'Legacy preserved') returning id`;
    await native`insert into contact_audience (audience_id,contact_id) values (${audience},${legacy.id})`;
    await native`update audience_upload set processed_contacts=1 where id=${upload}`;
    await expect(processor.processAudienceUpload(args())).rejects.toThrow("no recovery evidence");
    expect(await native`select contact_id from contact_audience where audience_id=${audience}`).toEqual([{contact_id:legacy.id}]);
    expect(await native`select id from audience_import_run where audience_id=${audience}`).toHaveLength(0);
  });
  test("durable reports page source rows and exclude another workspace",async()=>{
    await processor.processAudienceUpload(args(csv(3,false),{...mapping,Phone:"ignore"}));
    const reports=await import("@/lib/audience-import-report.server");
    const first=await reports.getAudienceImportReport(workspace,upload,0,2);expect(first?.rows.map(row=>row.record_number)).toEqual([2,3]);
    expect((await reports.getAudienceImportReport(workspace,upload,3,2))?.rows.map(row=>row.record_number)).toEqual([4]);
    expect(await reports.getAudienceImportReport(foreign,upload)).toBeNull();
    await expect(reports.getAudienceImportReport(workspace,upload,-1)).rejects.toThrow("Invalid import report page");
  });
  test("stale sidecars cannot fail an active job or overwrite completed SQL",async()=>{
    const stale={updated_at:"2020-01-01T00:00:00Z"};
    await native`update audience_upload set status='processing' where id=${upload}`;
    expect((await processor.markAudienceUploadInterruptedIfStale({workspaceId:workspace,uploadId:upload,dbStatus:"processing",statusFileData:stale})).interrupted).toBe(false);
    await processor.processAudienceUpload(args());
    expect((await processor.markAudienceUploadInterruptedIfStale({workspaceId:workspace,uploadId:upload,dbStatus:"processing",statusFileData:stale})).interrupted).toBe(false);
    expect((await native`select status from audience_upload where id=${upload}`)[0].status).toBe("completed");
  });
  test("two concurrent uploads of the same unmapped-phone file share one run and one set of effects", async () => {
    const other = await newUpload(audience); const otherJob=await newJob(other,audience);
    const content=csv(45,false); const fields={...mapping,Phone:"ignore"};
    const results=await Promise.all([processor.processAudienceUpload(args(content,fields)),processor.processAudienceUpload(args(content,fields,other,otherJob))]);
    expect(results[0].runId).toBe(results[1].runId); expect((await evidence()).contacts).toHaveLength(45);
  });
  test("invalid, duplicate and unknown opt-out outcomes retain source identity and safe contact flags",async()=>{
    const content="Name,Phone,Consent\nAllowed,4165551234,no\nDuplicate,(416) 555-1234,no\nInvalid,123,no\nReview,4165551235,maybe\nRefused,4165551236,unsubscribe";
    const result=await processor.processAudienceUpload(args(content,{Name:"firstname",Phone:"phone",Consent:"opt_out"}));
    expect(result).toMatchObject({imported:3,skippedInvalid:1,skippedDuplicates:1});
    const proof=await evidence(); expect(proof.receipts.map(row=>row.outcome)).toEqual(["imported","duplicate","invalid","imported","imported"]);
    expect(proof.contacts.map(row=>row.opt_out)).toEqual([false,true,true]);
    expect(proof.receipts[3].warnings).toEqual([{code:"unknown-opt-out",header:"Consent",value:"maybe"}]); expect(proof.receipts[4].warnings).toEqual([]);
  });
  test("mapped-phone replay preserves cross-batch duplicate outcomes without adding contacts",async()=>{
    const content=csv(45)+"\r\nRepeated,4165551000,0 Main St,M5V 1A1,no";
    const original=await processor.processAudienceUpload(args(content));expect(original).toMatchObject({imported:45,skippedDuplicates:1});
    const first=await evidence();expect(first.contacts).toHaveLength(45);expect(first.receipts).toHaveLength(46);expect(first.receipts[45].outcome).toBe("duplicate");
    const u=await newUpload(audience);const j=await newJob(u,audience);
    expect((await processor.processAudienceUpload(args(content,mapping,u,j))).runId).toBe(original.runId);
    expect((await evidence()).contacts).toEqual(first.contacts);
  });
  test("existing formatted phones in this audience are preserved and skipped",async()=>{
    const [existing]=await native`insert into contact (workspace,firstname,phone) values (${workspace}::uuid,'Existing preserved','(416) 555-1000') returning id`;
    await native`insert into contact_audience (audience_id,contact_id) values (${audience},${existing.id})`;
    const result=await processor.processAudienceUpload(args());expect(result).toMatchObject({imported:0,skippedDuplicates:1});
    expect(await native`select c.id,c.firstname from contact c join contact_audience ca on ca.contact_id=c.id where ca.audience_id=${audience}`).toEqual([{id:existing.id,firstname:"Existing preserved"}]);
    const [receipt]=await native`select outcome,reason,contact_id from audience_import_row r join audience_import_run run on run.id=r.run_id where run.audience_id=${audience}`;
    expect(receipt).toEqual({outcome:"duplicate",reason:"duplicate-phone",contact_id:null});
  });
  test("same-file replay survives job pruning; a different audience intentionally imports again", async()=>{
    const fields={...mapping,Phone:"ignore"}; const content=csv(2,false);
    const original=await processor.processAudienceUpload(args(content,fields)); await client`delete from job where id=${job}`;
    const reupload=await newUpload(audience); const rejob=await newJob(reupload,audience);
    expect((await processor.processAudienceUpload(args(content,fields,reupload,rejob))).runId).toBe(original.runId); expect((await evidence()).contacts).toHaveLength(2);
    const [other]=await native`insert into audience (workspace,name) values (${workspace}::uuid,'Intentional second audience') returning id`;
    const id=Number(other.id); const u=await newUpload(id); const j=await newJob(u,id);
    expect((await processor.processAudienceUpload(args(content,fields,u,j,id))).runId).not.toBe(original.runId); expect((await evidence(id)).contacts).toHaveLength(2);
  });
  test("foreign upload or audience IDs cannot bind a run or change foreign rows",async()=>{
    const [a]=await native`insert into audience (workspace,name) values (${foreign}::uuid,'Foreign preserved') returning id`; const id=Number(a.id);
    const u=await newUpload(id,foreign); const j=await newJob(u,id);
    await expect(processor.processAudienceUpload(args(csv(),mapping,u,j,id))).rejects.toThrow("Audience not found");
    expect((await native`select status from audience_upload where id=${u}`)[0].status).toBe("pending");
    const badJob=await newJob(u,audience); await expect(processor.processAudienceUpload(args(csv(),mapping,u,badJob))).rejects.toThrow("Audience upload not found");
    expect((await evidence(id)).contacts).toHaveLength(0);
  });
  test("a killed worker restarts and resumes its exact committed source rows without a mapped phone",async()=>{
    const content=csv(45,false);const fields={...mapping,Phone:"ignore"};
    await client`update job set status='queued',attempt_count=0,params=${client.json({...args(content,fields),voterListSource:null})} where id=${job}`;
    let arrived: (()=>void)|undefined;const batchSeen=new Promise<void>(resolve=>{arrived=resolve;});let stall=true;
    const server=createServer(async(req,res)=>{
      let body="";for await(const chunk of req)body+=chunk.toString();
      const parsed=JSON.parse(body);
      if(stall&&String(parsed.stage).startsWith("Processing contacts (40/")){arrived?.();return;}
      res.writeHead(200);res.end();
    });
    server.listen(0,"127.0.0.1");await once(server,"listening");const address=server.address();
    if(!address||typeof address==="string")throw new Error("Fixture storage address missing");
    function start(){return spawn(process.env.BUN_BINARY??"bun",["test/fixtures/audience-import-worker.ts",String(job)],{cwd:process.cwd(),env:{...process.env,
      S3_ENDPOINT:`http://127.0.0.1:${address.port}`,S3_REGION:"us-east-1",S3_BUCKET:"owned-import-fixture",S3_ACCESS_KEY_ID:"fixture",S3_SECRET_ACCESS_KEY:"fixture"},stdio:["ignore","pipe","pipe"]});}
    let child=start();let output="";child.stderr.on("data",chunk=>{output+=chunk.toString();});
    try{
      const deadline=new Promise<never>((_,reject)=>{const timer=setTimeout(()=>reject(new Error(`First batch not reached: ${output}`)),10_000);timer.unref();});
      await Promise.race([batchSeen,deadline]);
      expect((await evidence()).contacts).toHaveLength(40);
      const exit=once(child,"exit");child.kill("SIGKILL");await exit;server.closeAllConnections();stall=false;
      expect((await client`select status from job where id=${job}`)[0].status).toBe("running");
      await client`update job set claimed_until=now()-interval '1 second' where id=${job}`;
      child=start();output="";child.stderr.on("data",chunk=>{output+=chunk.toString();});
      const [code]=await once(child,"exit");expect(code,output).toBe(0);
      expect((await evidence()).contacts).toHaveLength(45);expect((await evidence()).receipts).toHaveLength(45);
      const [completed]=await client`select status,attempt_count,result from job where id=${job}`;
      expect(completed).toMatchObject({status:"completed",attempt_count:2,result:{ok:true,imported:45}});
    }finally{if(child.exitCode===null&&child.signalCode===null){const exit=once(child,"exit");child.kill("SIGKILL");await exit;}server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
  });
  test("killing a worker inside the write transaction leaves zero effects and a restart completes",async()=>{
    await client`update job set status='queued',attempt_count=0,params=${client.json({...args(),voterListSource:null})} where id=${job}`;
    await native.unsafe(`create function "${schema}".reject_import() returns trigger language plpgsql as $$ begin if new.audience_id=${audience} then perform pg_sleep(2); end if; return new; end $$`);
    await native.unsafe(`create trigger reject_import before insert on public.contact_audience for each row execute function "${schema}".reject_import()`);
    const server=createServer((req,res)=>{req.resume();res.writeHead(200);res.end();});
    server.listen(0,"127.0.0.1");await once(server,"listening");const address=server.address();
    if(!address||typeof address==="string")throw new Error("Fixture address missing");
    const applicationName=`import_kill_${randomUUID().replaceAll("-", "")}`;
    const boundUrl = process.env.DATABASE_URL;
    if (!boundUrl) throw new Error("Bound fixture database URL missing");
    const scoped=new URL(boundUrl);scoped.searchParams.set("application_name",applicationName);
    function start(){return spawn(process.env.BUN_BINARY??"bun",["test/fixtures/audience-import-worker.ts",String(job)],{cwd:process.cwd(),env:{...process.env,
      DATABASE_URL:scoped.toString(),DATABASE_DIRECT_URL:scoped.toString(),S3_ENDPOINT:`http://127.0.0.1:${address.port}`,
      S3_REGION:"us-east-1",S3_BUCKET:"owned-import-fixture",S3_ACCESS_KEY_ID:"fixture",S3_SECRET_ACCESS_KEY:"fixture"},stdio:["ignore","pipe","pipe"]});}
    let child=start();let output="";child.stderr.on("data",chunk=>{output+=chunk.toString();});
    try{
      let reached=false;for(let i=0;i<300;i++){
        const active=await native`select pid from pg_stat_activity where application_name=${applicationName} and state='active' and query ilike '%insert into "contact_audience"%'`;
        if(active.length){reached=true;break;}await new Promise(resolve=>setTimeout(resolve,10));
      }
      expect(reached,output).toBe(true);const exited=once(child,"exit");child.kill("SIGKILL");await exited;
      for(let i=0;i<300;i++){const active=await native`select pid from pg_stat_activity where application_name=${applicationName}`;if(!active.length)break;await new Promise(resolve=>setTimeout(resolve,10));}
      expect(await native`select pid from pg_stat_activity where application_name=${applicationName}`).toHaveLength(0);
      expect((await evidence()).contacts).toHaveLength(0);expect((await evidence()).receipts).toHaveLength(0);
      await native.unsafe(`drop function "${schema}".reject_import() cascade`);
      await client`update job set claimed_until=now()-interval '1 second' where id=${job}`;
      child=start();output="";child.stderr.on("data",chunk=>{output+=chunk.toString();});const [code]=await once(child,"exit");expect(code,output).toBe(0);
      expect((await evidence()).contacts).toHaveLength(1);
    }finally{if(child.exitCode===null&&child.signalCode===null){const exit=once(child,"exit");child.kill("SIGKILL");await exit;}server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
  });
  test("mapping and provenance changes define a new import; equivalent mapping order or header case does not",async()=>{
    const fields={...mapping,Phone:"ignore"};const content=csv(1,false);
    const original=await processor.processAudienceUpload(args(content,fields));
    const u=await newUpload(audience);const j=await newJob(u,audience);
    const reordered={consent:"opt_out",postal:"postal",address:"address",phone:"ignore",name:"firstname"};
    expect((await processor.processAudienceUpload(args(content,reordered,u,j))).runId).toBe(original.runId);
    const u2=await newUpload(audience);const j2=await newJob(u2,audience);
    expect((await processor.processAudienceUpload(args(content,{...fields,Name:"surname"},u2,j2))).runId).not.toBe(original.runId);
    const u3=await newUpload(audience);const j3=await newJob(u3,audience);
    expect((await processor.processAudienceUpload({...args(content,fields,u3,j3),voterListSource:"manual"})).runId).not.toBe(original.runId);
    expect((await evidence()).contacts).toHaveLength(3);
  });
  async function runUntil(expected:string){
      const abort=new AbortController(); const timer=setTimeout(()=>abort.abort(),10_000);
      const running=worker.runWorkerPollLoop(abort.signal,handlers.jobHandlers,{pollIntervalMs:10,heartbeatIntervalMs:30});
      try {for(let i=0;i<300;i++){const [row]=await client`select status,attempt_count from job where id=${job}`;if(row.status===expected && (expected!=="queued" || Number(row.attempt_count)>0)){abort.abort();await running;return;}await new Promise(resolve=>setTimeout(resolve,10));}throw new Error(`Worker did not reach ${expected}`);}
      finally{abort.abort();clearTimeout(timer);await running;}
    }
  test("the actual worker retries a partial run safely through claim, fail and complete",async()=>{
    const content=csv(45,false);const fields={...mapping,Phone:"ignore"};
    await client`update job set status='queued',attempt_count=0,params=${client.json({...args(content,fields),voterListSource:null})} where id=${job}`;
    storage.mode="batch";await runUntil("queued");
    const [failed]=await client`select attempt_count,error_message,result,retry_at>now() as delayed from job where id=${job}`;
    expect(failed).toMatchObject({attempt_count:1,error_message:"Fixture storage failure",result:null,delayed:true});
    expect((await evidence()).contacts).toHaveLength(40);
    storage.mode="ok";await client`update job set retry_at=now()-interval '1 second' where id=${job}`;
    await runUntil("completed");expect((await evidence()).contacts).toHaveLength(45);
    expect((await client`select attempt_count,result from job where id=${job}`)[0]).toMatchObject({attempt_count:2,result:{ok:true,imported:45}});
  });
  test("the real poll loop fails and dead-letters storage failures, then completes only a repaired retry",async()=>{
    const params={...args(), voterListSource:null};
    await client`update job set status='queued', attempt_count=0, max_attempts=1, params=${client.json(params)} where id=${job}`;
    storage.mode="always";
    await runUntil("dead_letter"); expect((await evidence()).contacts).toHaveLength(0);
    expect((await client`select result,completed_at,error_message from job where id=${job}`)[0]).toMatchObject({result:null,completed_at:null,error_message:"Fixture storage failure"});
    storage.mode="ok";await client`update job set status='queued',attempt_count=0 where id=${job}`;await runUntil("completed");
    expect((await evidence()).contacts).toHaveLength(1);expect((await client`select result from job where id=${job}`)[0].result).toMatchObject({ok:true,imported:1});
  });
});
