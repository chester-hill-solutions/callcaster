import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import postgres from "postgres";
import { getExpectedTwilioSignature } from "twilio/lib/webhooks/webhooks.js";
import { normalizeRouteResult, routeArgs } from "../helpers/route-result";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";

const fixture = vi.hoisted(() => ({
  url: process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL,
  probe: process.env.PREDICTIVE_RECOVERY_PROBE,
  previous: Object.fromEntries(
    [
      "DATABASE_URL",
      "DATABASE_DIRECT_URL",
      "E2E_TEST",
      "TZ",
      "BASE_URL",
      "TWILIO_VALIDATE_WEBHOOKS",
    ].map((key) => [key, process.env[key]]),
  ),
}));
const provider = vi.hoisted(() => ({
  create: vi.fn(),
  list: vi.fn(),
  update: vi.fn(),
  fetch: vi.fn(),
  events: vi.fn(),
  callList: vi.fn(),
}));
vi.mock("@/lib/database/workspace.server", async (importOriginal) => {
  const conferences = Object.assign(() => ({ update: provider.update }), {
    list: provider.list,
  });
  return {
    ...(await importOriginal<
      typeof import("@/lib/database/workspace.server")
    >()),
    createWorkspaceTwilioInstance: vi.fn(async () => ({
      calls: Object.assign(
        () => ({ fetch: provider.fetch, events: { list: provider.events } }),
        { create: provider.create, list: provider.callList },
      ),
      conferences,
      messages: { list: vi.fn(async () => []) },
    })),
  };
});

const describeDb = fixture.url ? describe : describe.skip;
if (!fixture.probe)
  describeDb(
    "predictive continuation with real dialer and queue RPCs (#2396)",
    () => {
      const workspace = randomUUID();
      const user = randomUUID();
      const room = `${user}~${randomUUID()}`;
      const parentSid = `CA${randomUUID().replaceAll("-", "")}`;
      const childSid = `CA${randomUUID().replaceAll("-", "")}`;
      let sql: postgres.Sql;
      let pools: typeof import("@/server/db");
      let repository: typeof import("@/server/predictive-machine-operation.server");
      let service: typeof import("@/lib/predictive-machine.server");
      let worker: typeof import("@/lib/worker/handlers.server");
      let jobs: typeof import("@/lib/worker/job-params.server");
      let statusAction: typeof import("@/routes/api+/auto-dial/status.action.server").action;
      let campaign: number;
      let parentContact: number;
      let successorContact: number;
      let controlContact: number;
      let queueId: number;
      let operationId: string;
      const binding = {
        workspaceId: workspace,
        callSid: parentSid,
        conferenceId: room,
      };
      const params = () => ({ workspaceId: workspace, operationId });
      async function operation() {
        const row = await repository.getPredictiveMachineOperation(
          binding,
          operationId,
        );
        if (!row) throw new Error("Operation fixture missing");
        return row;
      }
      async function queue() {
        const [row] =
          await sql`select * from public.campaign_queue where id=${queueId} and workspace=${workspace}`;
        return row;
      }
      async function freshProcess(
        expected: "continued" | "uncertain",
        recoveryJobId?: number,
      ) {
        const run = promisify(execFile);
        const result = await run(
          process.execPath,
          [
            "node_modules/vitest/vitest.mjs",
            "run",
            "-c",
            "vitest.integration-db.config.ts",
            "test/integration-db/predictive-machine-continuation.test.ts",
            "--reporter=json",
          ],
          {
            cwd: process.cwd(),
            timeout: 45000,
            maxBuffer: 2 * 1024 * 1024,
            env: {
              ...process.env,
              DATABASE_URL: fixture.url,
              INTEGRATION_DB_URL: fixture.url,
              PREDICTIVE_RECOVERY_PROBE: JSON.stringify({
                binding,
                operationId,
                expected,
                recoveryJobId,
                childSid,
              }),
            },
          },
        );
        const report = JSON.parse(result.stdout);
        expect(report.numPassedTests).toBe(1);
        expect(report.numFailedTests).toBe(0);
        expect(report.numPendingTests).toBe(0);
      }
      const createdCall = () => ({
        sid: childSid,
        accountSid: "ACfixture",
        from: "+15559876543",
        status: "queued",
        dateUpdated: new Date(),
        startTime: null,
        endTime: null,
      });
      beforeAll(async () => {
        if (!fixture.url) throw new Error("Database URL required");
        process.env.DATABASE_URL = process.env.DATABASE_DIRECT_URL =
          fixture.url;
        process.env.E2E_TEST = "1";
        process.env.BASE_URL = "https://fixture.example";
        process.env.TWILIO_VALIDATE_WEBHOOKS = "true";
        process.env.TZ = "UTC";
        sql = postgres(fixture.url, { max: 4 });
        const [table] =
          await sql`select to_regclass('public.predictive_machine_operation') as name`;
        expect(table.name).toBeTruthy();
        await sql`insert into public."user" (id,username) values (${user}, ${`predictive-${user}`})`;
        await sql`insert into public.workspace (id,name,credits,twilio_data) values (${workspace}, 'Predictive continuation fixture', 10000, ${sql.json({ sid: "ACfixture", authToken: "fixture-token" })})`;
        const [row] =
          await sql`insert into public.campaign (workspace,title,type,status,caller_id,voicemail_drop_enabled,voicemail_file)
      values (${workspace}, 'Predictive continuation fixture', 'live_call', 'running', '+15559876543', true, 'fixture.mp3') returning id`;
        campaign = Number(row.id);
        const contacts =
          await sql`insert into public.contact (workspace,phone) values
      (${workspace}, '+15551230001'), (${workspace}, '+15551230002'), (${workspace}, '+15551230003') returning id`;
        [parentContact, successorContact, controlContact] = contacts.map(
          (row) => Number(row.id),
        );
        pools = await import("@/server/db");
        repository =
          await import("@/server/predictive-machine-operation.server");
        service = await import("@/lib/predictive-machine.server");
        worker = await import("@/lib/worker/handlers.server");
        jobs = await import("@/lib/worker/job-params.server");
        ({ action: statusAction } =
          await import("@/routes/api+/auto-dial/status.action.server"));
      });
      beforeEach(async () => {
        await sql`delete from public.predictive_machine_operation where workspace=${workspace}`;
        await sql`delete from public.job where workspace_id=${workspace}`;
        await sql`delete from public.call where workspace=${workspace}`;
        await sql`delete from public.outreach_attempt where workspace=${workspace}`;
        await sql`delete from public.campaign_queue where workspace=${workspace}`;
        await sql`update public.campaign set status='running' where id=${campaign}`;
        const [attempt] =
          await sql`insert into public.outreach_attempt (workspace,campaign_id,contact_id,user_id)
      values (${workspace},${campaign},${parentContact},${user}) returning id`;
        await sql`insert into public.call (sid,account_sid,workspace,campaign_id,contact_id,outreach_attempt_id,conference_id,status)
      values (${parentSid},'ACfixture',${workspace},${campaign},${parentContact},${attempt.id},${room},'in-progress')`;
        const [queued] =
          await sql`insert into public.campaign_queue (workspace,campaign_id,contact_id,queue_state,queue_order,attempt_count,attempts)
      values (${workspace},${campaign},${successorContact},'queued',1,0,0) returning id`;
        queueId = Number(queued.id);
        provider.create.mockResolvedValue(createdCall());
        provider.list.mockResolvedValue([{ sid: "CFfixture" }]);
        provider.update.mockResolvedValue({});
        const reserved = await repository.preparePredictiveMachineOperation(
          binding,
          (id) =>
            `https://fixture.example/api/auto-dial/${room}?machine=complete&operation=${id}`,
        );
        operationId = reserved.operation.id;
        expect(
          await repository.issuePredictivePlayback(reserved.operation),
        ).toMatchObject({ state: "issued" });
        await repository.acknowledgePredictivePlayback(binding, operationId);
      });
      afterAll(async () => {
        try {
          if (sql) {
            await sql`delete from public.predictive_machine_operation where workspace=${workspace}`;
            await sql`delete from public.job where workspace_id=${workspace}`;
            await sql`delete from public.call where workspace=${workspace}`;
            await sql`delete from public.outreach_attempt where workspace=${workspace}`;
            await sql`delete from public.campaign_queue where workspace=${workspace}`;
            await sql`delete from public.contact where workspace=${workspace}`;
            await sql`delete from public.campaign where workspace=${workspace}`;
            await sql`delete from public.workspace_events where workspace_id=${workspace}`;
            await sql`delete from public.workspace where id=${workspace}`;
            await sql`delete from public."user" where id=${user}`;
          }
        } finally {
          if (pools)
            await Promise.all([pools.pool.end(), pools.directPool.end()]);
          if (sql) await sql.end();
          for (const [key, value] of Object.entries(fixture.previous)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
          }
        }
      });
      async function recoverInWorker(inFreshProcess = false) {
        await jobs.enqueueRegisteredJob({
          type: "predictive_machine_reconcile",
          params: { ...params(), successorCallSid: childSid },
          workspaceId: workspace,
          userId: user,
          dedupe: {
            kind: "idempotency",
            key: `fixture-recovery:${randomUUID()}`,
          },
        });
        const [job] =
          await sql`select * from public.job where workspace_id=${workspace} and type='predictive_machine_reconcile' order by id desc limit 1`;
        if (inFreshProcess) {
          await freshProcess("uncertain", Number(job.id));
          return;
        }
        const handler = worker.jobHandlers[job.type];
        if (!handler) throw new Error("Recovery worker missing");
        return handler(job);
      }
      async function loseSuccessor() {
        provider.create.mockRejectedValueOnce(
          new Error("Lost create response"),
        );
        await expect(
          service.runPredictiveMachineContinuation(params()),
        ).rejects.toThrow("uncertain");
        const row = await operation();
        provider.fetch.mockResolvedValue({
          ...createdCall(),
          direction: "outbound-api",
          status: "completed",
          endTime: new Date(Date.now() - 20 * 60_000),
        });
        provider.events.mockResolvedValue([
          {
            request: {
              method: "POST",
              url: row.successor_voice_url,
              parameters: { call_sid: childSid },
            },
          },
        ]);
        return row;
      }
      test("verified operator recovery adopts a lost successor through the registered worker without redial", async () => {
        const pending = await loseSuccessor();
        const request = provider.create.mock.calls[0]?.[0];
        expect(request.url).toBe(pending.successor_voice_url);
        expect(request.statusCallback).toBe(pending.successor_status_url);
        const url = new URL(request.url);
        expect(url.searchParams.get("continuation")).toBe(operationId);
        expect(url.searchParams.get("attempt")).toBe(
          String(pending.successor_attempt_id),
        );
        expect(url.searchParams.get("workspace")).toBe(workspace);
        await recoverInWorker(true);
        const adopted = await operation();
        expect(adopted.state).toBe("continued");
        expect(adopted.successor_call_sid).toBe(childSid);
        const [child] =
          await sql`select * from public.call where workspace=${workspace} and sid=${childSid}`;
        expect(Number(child.outreach_attempt_id)).toBe(
          pending.successor_attempt_id,
        );
        expect(child.status).toBe("queued");
        expect(Number(child.queue_id)).toBe(queueId);
        expect(child.account_sid).toBe("ACfixture");
        expect(
          await sql`select id from public.job where workspace_id=${workspace} and type='twilio_open_sync'`,
        ).toHaveLength(1);
        await recoverInWorker();
        await freshProcess("continued");
        expect(provider.create).toHaveBeenCalledTimes(1);
        expect(provider.events).not.toHaveBeenCalled();
      });
      test.each([
        "foreign account",
        "wrong SID",
        "wrong direction",
        "live call",
        "recent end",
        "wrong method",
        "wrong URL",
        "wrong event SID",
        "missing events",
        "foreign attempt",
      ])("%s cannot adopt an uncertain successor", async (mode) => {
        const pending = await loseSuccessor();
        const completed = {
          ...createdCall(),
          status: "completed",
          direction: "outbound-api",
          endTime: new Date(Date.now() - 20 * 60_000),
        };
        if (mode === "foreign account")
          provider.fetch.mockResolvedValue({
            ...completed,
            accountSid: "ACforeign",
            direction: "outbound-api",
          });
        if (mode === "wrong SID")
          provider.fetch.mockResolvedValue({
            ...completed,
            sid: parentSid,
            direction: "outbound-api",
          });
        if (mode === "wrong direction")
          provider.fetch.mockResolvedValue({
            ...completed,
            direction: "inbound",
          });
        if (mode === "live call")
          provider.fetch.mockResolvedValue({
            ...completed,
            endTime: null,
          });
        if (mode === "recent end")
          provider.fetch.mockResolvedValue({
            ...completed,
            direction: "outbound-api",
            endTime: new Date(),
          });
        if (mode === "missing events") provider.events.mockResolvedValue([]);
        if (["wrong method", "wrong URL", "wrong event SID"].includes(mode))
          provider.events.mockResolvedValue([
            {
              request: {
                method: mode === "wrong method" ? "GET" : "POST",
                url:
                  mode === "wrong URL"
                    ? `https://other.example/${operationId}`
                    : pending.successor_voice_url,
                parameters: {
                  call_sid: mode === "wrong event SID" ? parentSid : childSid,
                },
              },
            },
          ]);
        if (mode === "foreign attempt")
          await sql`update public.outreach_attempt set contact_id=${parentContact} where id=${pending.successor_attempt_id}`;
        await expect(recoverInWorker()).rejects.toThrow();
        expect((await operation()).state).toBe("uncertain");
        expect((await operation()).successor_call_sid).toBeNull();
        expect(
          await sql`select sid from public.call where workspace=${workspace} and sid=${childSid}`,
        ).toHaveLength(0);
        expect(
          await sql`select id from public.job where workspace_id=${workspace} and type='twilio_open_sync'`,
        ).toHaveLength(0);
        expect(provider.create).toHaveBeenCalledTimes(1);
        if (
          [
            "foreign account",
            "wrong SID",
            "wrong direction",
            "live call",
            "recent end",
          ].includes(mode)
        )
          expect(provider.events).not.toHaveBeenCalled();
      });
      test.each(["paused", "waiting"])(
        "%s campaign defers continuation and resumes once running",
        async (status) => {
          await sql`update public.campaign set status=${status} where id=${campaign}`;
          await expect(
            service.runPredictiveMachineContinuation(params(), 123),
          ).resolves.toMatchObject({ pending: true });
          expect(provider.create).not.toHaveBeenCalled();
          expect((await operation()).state).toBe("acknowledged");
          const [scheduled] =
            await sql`select retry_at from public.job where workspace_id=${workspace} and idempotency_key like 'predictive-campaign-wait:%'`;
          expect(new Date(scheduled.retry_at).getTime()).toBeGreaterThan(
            Date.now(),
          );
          const [unchanged] =
            await sql`select status from public.campaign where id=${campaign}`;
          expect(unchanged.status).toBe(status);
          await sql`update public.campaign set status='running' where id=${campaign}`;
          await service.runPredictiveMachineContinuation(params(), 124);
          expect(provider.create).toHaveBeenCalledTimes(1);
          expect((await operation()).state).toBe("continued");
        },
      );
      async function signedStatus(
        status: string,
        overrides: {
          url?: string;
          payload?: Record<string, string>;
          token?: string;
        } = {},
      ) {
        const row = await operation();
        const url =
          overrides.url ??
          row.successor_status_url ??
          "https://fixture.example/api/auto-dial/status";
        const payload = {
          CallSid: childSid,
          AccountSid: "ACfixture",
          CallStatus: status,
          Direction: "outbound-api",
          ...overrides.payload,
          From: "+15559876543",
          To: "+15551230002",
          CallDuration: "0",
        };
        return normalizeRouteResult(
          await statusAction(
            routeArgs(
              new Request(url, {
                method: "POST",
                body: new URLSearchParams(payload),
                headers: {
                  "x-twilio-signature": getExpectedTwilioSignature(
                    overrides.token ?? "fixture-token",
                    url,
                    payload,
                  ),
                },
              }),
            ),
          ),
        );
      }
      test.each(
        ["failed", "busy", "no-answer"].flatMap((status) => [
          { status, callbackFirst: true },
          { status, callbackFirst: false },
        ]),
      )(
        "lost $status terminal callback recovers one next turn (callback first: $callbackFirst)",
        async ({ status, callbackFirst }) => {
          const pending = await loseSuccessor();
          expect((await signedStatus(status)).body).toMatchObject({
            resolved: false,
          });
          const candidate = {
            ...createdCall(),
            status,
            direction: "outbound-api",
            endTime: null,
            duration: "0",
          };
          provider.fetch.mockResolvedValue(candidate);
          provider.events.mockResolvedValue([]);
          await sql`insert into public.campaign_queue (workspace,campaign_id,contact_id,queue_state,queue_order,attempt_count,attempts)
          values (${workspace},${campaign},${controlContact},'queued',2,0,0)`;
          const callbackJobs =
            await sql`select * from public.job where workspace_id=${workspace} and idempotency_key like 'predictive-successor-callback:%'`;
          expect(callbackJobs).toHaveLength(1);
          if (callbackFirst)
            await worker.jobHandlers.predictive_machine_reconcile(
              callbackJobs[0],
            );
          else await freshProcess("uncertain", Number(callbackJobs[0].id));
          expect(provider.events).not.toHaveBeenCalled();
          const [childOperation] =
            await sql`select * from public.predictive_machine_operation where workspace=${workspace} and call_sid=${childSid}`;
          expect(childOperation.state).toBe("dropped");
          const childJobs =
            await sql`select * from public.job where workspace_id=${workspace} and type='predictive_machine_continue' and params->>'operationId'=${childOperation.id}`;
          expect(childJobs).toHaveLength(1);
          const [childJob] = childJobs;
          const [syncJob] =
            await sql`select * from public.job where workspace_id=${workspace} and type='twilio_open_sync'`;
          provider.callList.mockResolvedValue([
            { sid: parentSid, status: "in-progress" },
            candidate,
          ]);
          if (callbackFirst)
            expect((await signedStatus(status)).status).toBe(200);
          const sync = worker.jobHandlers.twilio_open_sync;
          if (!sync) throw new Error("Status sync worker missing");
          await sync(syncJob);
          expect((await signedStatus(status)).status).toBe(200);
          expect(provider.create).toHaveBeenCalledTimes(1);
          const nextSid = `CA${randomUUID().replaceAll("-", "")}`;
          provider.create.mockResolvedValue({ ...createdCall(), sid: nextSid });
          const next = worker.jobHandlers.predictive_machine_continue;
          if (!next) throw new Error("Continuation worker missing");
          await next(childJob);
          await next(childJob);
          await recoverInWorker();
          await signedStatus(status);
          expect(provider.create).toHaveBeenCalledTimes(2);
          expect(provider.create.mock.calls[1]?.[0]?.to).toBe("+15551230003");
          const [child] =
            await sql`select status from public.call where workspace=${workspace} and sid=${childSid}`;
          expect(child.status).toBe(status);
          expect((await operation()).successor_attempt_id).toBe(
            pending.successor_attempt_id,
          );
        },
      );
      test.each(["failed", "busy", "no-answer"])(
        "a signed %s callback during create survives a late successful save",
        async (status) => {
          provider.create.mockImplementationOnce(async () => {
            const result = await signedStatus(status);
            expect(result.status).toBe(200);
            expect(result.body).toMatchObject({ resolved: false });
            return createdCall();
          });
          await service.runPredictiveMachineContinuation(params());
          const parent = await operation();
          expect(parent.state).toBe("continued");
          expect(parent.successor_callback_sid).toBe(childSid);
          const [childOperation] =
            await sql`select * from public.predictive_machine_operation where workspace=${workspace} and call_sid=${childSid}`;
          expect(childOperation.state).toBe("dropped");
          const childJobs =
            await sql`select * from public.job where workspace_id=${workspace} and type='predictive_machine_continue' and params->>'operationId'=${childOperation.id}`;
          expect(childJobs).toHaveLength(1);
          await sql`insert into public.campaign_queue (workspace,campaign_id,contact_id,queue_state,queue_order,attempt_count,attempts)
            values (${workspace},${campaign},${controlContact},'queued',2,0,0)`;
          expect((await signedStatus(status)).status).toBe(200);
          expect(provider.create).toHaveBeenCalledTimes(1);
          const nextSid = `CA${randomUUID().replaceAll("-", "")}`;
          provider.create.mockResolvedValue({ ...createdCall(), sid: nextSid });
          await worker.jobHandlers.predictive_machine_continue(childJobs[0]);
          await worker.jobHandlers.predictive_machine_continue(childJobs[0]);
          await recoverInWorker();
          expect(provider.create).toHaveBeenCalledTimes(2);
          expect(provider.create.mock.calls[1]?.[0]?.to).toBe("+15551230003");
          expect(
            await sql`select id from public.job where workspace_id=${workspace} and type='twilio_open_sync'`,
          ).toHaveLength(1);
        },
      );
      test.each([
        "signature",
        "URL",
        "workspace",
        "operation",
        "attempt",
        "account",
        "direction",
        "conflicting SID",
      ])(
        "a wrong callback %s cannot supply recovery evidence",
        async (mode) => {
          const pending = await loseSuccessor();
          if (!pending.successor_status_url)
            throw new Error("Missing callback URL");
          const url = new URL(pending.successor_status_url);
          const payload: Record<string, string> = {};
          if (mode === "URL") url.searchParams.set("extra", "changed");
          if (mode === "workspace")
            url.searchParams.set("workspace", randomUUID());
          if (mode === "operation")
            url.searchParams.set("continuation", randomUUID());
          if (mode === "attempt") url.searchParams.set("attempt", "999999");
          if (mode === "account") payload.AccountSid = "ACforeign";
          if (mode === "direction") payload.Direction = "inbound";
          if (mode === "conflicting SID") {
            expect((await signedStatus("busy")).status).toBe(200);
            payload.CallSid = `CA${randomUUID().replaceAll("-", "")}`;
          }
          const response = await signedStatus("busy", {
            url: url.href,
            payload,
            token: mode === "signature" ? "bad-token" : undefined,
          });
          expect(response.status).toBeGreaterThanOrEqual(400);
          const saved = await operation();
          expect(saved.successor_callback_sid).toBe(
            mode === "conflicting SID" ? childSid : null,
          );
          expect(saved.successor_call_sid).toBeNull();
          expect(saved.state).toBe("uncertain");
          expect(
            await sql`select id from public.job where workspace_id=${workspace} and idempotency_key like 'predictive-successor-callback:%'`,
          ).toHaveLength(mode === "conflicting SID" ? 1 : 0);
          expect(provider.create).toHaveBeenCalledTimes(1);
        },
      );
      test("signed callback evidence rolls back when its recovery outbox fails", async () => {
        await loseSuccessor();
        const name = `reject_callback_${workspace.replaceAll("-", "")}`;
        try {
          await sql.unsafe(`create function public.${name}() returns trigger language plpgsql as $$ begin
            if NEW.workspace_id='${workspace}'::uuid and NEW.idempotency_key like 'predictive-successor-callback:%' then
              raise exception 'fixture callback outbox unavailable';
            end if; return NEW; end; $$`);
          await sql.unsafe(
            `create trigger ${name} before insert on public.job for each row execute function public.${name}()`,
          );
          expect((await signedStatus("busy")).status).toBe(500);
          expect((await operation()).successor_callback_sid).toBeNull();
          expect((await operation()).successor_callback_status).toBeNull();
          expect(
            await sql`select id from public.job where workspace_id=${workspace} and idempotency_key like 'predictive-successor-callback:%'`,
          ).toHaveLength(0);
        } finally {
          try {
            await sql.unsafe(`drop trigger if exists ${name} on public.job`);
          } finally {
            await sql.unsafe(`drop function if exists public.${name}()`);
          }
        }
        expect((await signedStatus("busy")).status).toBe(200);
        expect((await signedStatus("busy")).status).toBe(200);
        expect((await operation()).successor_callback_sid).toBe(childSid);
        expect(
          await sql`select id from public.job where workspace_id=${workspace} and idempotency_key like 'predictive-successor-callback:%'`,
        ).toHaveLength(1);
        expect(provider.create).toHaveBeenCalledTimes(1);
      });
      test.each(["encoded", "reordered"])(
        "a signed equivalent %s callback URL recovers an unanswered call",
        async (mode) => {
          const pending = await loseSuccessor();
          if (!pending.successor_status_url)
            throw new Error("Missing callback URL");
          const url = new URL(pending.successor_status_url);
          if (mode === "reordered")
            url.search = new URLSearchParams(
              [...url.searchParams.entries()].reverse(),
            ).toString();
          const target =
            mode === "encoded"
              ? url.href.replace(
                  /workspace=([a-f0-9])/,
                  (_, value) =>
                    `workspace=%${value.charCodeAt(0).toString(16)}`,
                )
              : url.href;
          expect((await signedStatus("busy", { url: target })).status).toBe(
            200,
          );
          provider.fetch.mockResolvedValue({
            ...createdCall(),
            status: "busy",
            direction: "outbound-api",
            endTime: null,
          });
          provider.events.mockResolvedValue([]);
          await recoverInWorker();
          expect((await operation()).state).toBe("continued");
          expect(provider.create).toHaveBeenCalledTimes(1);
          expect(provider.events).not.toHaveBeenCalled();
        },
      );
      test("a signed duplicate callback query field is rejected", async () => {
        const pending = await loseSuccessor();
        if (!pending.successor_status_url)
          throw new Error("Missing callback URL");
        const url = new URL(pending.successor_status_url);
        url.searchParams.append("workspace", workspace);
        expect((await signedStatus("busy", { url: url.href })).status).toBe(
          500,
        );
        expect((await operation()).successor_callback_sid).toBeNull();
        expect(
          await sql`select id from public.job where workspace_id=${workspace} and idempotency_key like 'predictive-successor-callback:%'`,
        ).toHaveLength(0);
      });
      test.each(["completed", "canceled"])(
        "recovered %s child keeps the existing stop policy",
        async (status) => {
          await loseSuccessor();
          provider.fetch.mockResolvedValue({
            ...createdCall(),
            status,
            direction: "outbound-api",
            endTime: new Date(Date.now() - 20 * 60_000),
          });
          await recoverInWorker();
          expect(
            await sql`select id from public.predictive_machine_operation where workspace=${workspace} and call_sid=${childSid}`,
          ).toHaveLength(0);
          expect(provider.create).toHaveBeenCalledTimes(1);
        },
      );
      test("actual queue claim and provider create run once for sequential worker retries", async () => {
        await service.runPredictiveMachineContinuation(params());
        await service.runPredictiveMachineContinuation(params());
        expect(provider.create).toHaveBeenCalledTimes(1);
        expect(provider.create).toHaveBeenCalledWith(
          expect.objectContaining({
            to: "+15551230002",
            machineDetection: "Enable",
            url: expect.stringContaining(room),
          }),
        );
        const op = await operation();
        expect(op.state).toBe("continued");
        expect(op.successor_call_sid).toBe(childSid);
        expect(op.successor_queue_id).toBe(queueId);
        const [call] =
          await sql`select * from public.call where sid=${childSid} and workspace=${workspace}`;
        expect(Number(call.outreach_attempt_id)).toBe(op.successor_attempt_id);
        expect(Number(call.contact_id)).toBe(successorContact);
        expect(call.conference_id).toBe(room);
        expect((await queue()).queue_state).toBe("dequeued");
        await freshProcess("continued");
      });
      test("concurrent worker cannot send while the provider acknowledgement is pending", async () => {
        let release!: () => void;
        const pending = new Promise<void>((resolve) => {
          release = resolve;
        });
        provider.create.mockImplementationOnce(async () => {
          await pending;
          return createdCall();
        });
        const first = service.runPredictiveMachineContinuation(params());
        try {
          await vi.waitFor(() =>
            expect(provider.create).toHaveBeenCalledTimes(1),
          );
          await expect(
            service.runPredictiveMachineContinuation(params()),
          ).rejects.toThrow("still running");
          expect((await operation()).successor_call_sid).toBeNull();
          expect((await operation()).send_started_at).toBeInstanceOf(Date);
        } finally {
          release();
          await first;
        }
        expect(provider.create).toHaveBeenCalledTimes(1);
      });
      test("definite 400 rejection releases the queue for a safe retry", async () => {
        provider.create.mockRejectedValueOnce(
          Object.assign(new Error("Rejected request"), { status: 400 }),
        );
        await expect(
          service.runPredictiveMachineContinuation(params()),
        ).rejects.toThrow("will retry");
        expect((await operation()).state).toBe("acknowledged");
        expect((await operation()).send_started_at).toBeNull();
        expect((await queue()).queue_state).toBe("queued");
        expect((await queue()).assigned_to_user_id).toBeNull();
        await service.runPredictiveMachineContinuation(params());
        expect(provider.create).toHaveBeenCalledTimes(2);
        expect((await operation()).state).toBe("continued");
        expect(
          await sql`select sid from public.call where workspace=${workspace} and sid=${childSid}`,
        ).toHaveLength(1);
      });
      test.each(["network loss", "server rejection"])(
        "%s parks the uncertain successor and refuses another send",
        async (mode) => {
          provider.create.mockRejectedValueOnce(
            mode === "network loss"
              ? new Error("Lost acknowledgement")
              : Object.assign(new Error("Server error"), { status: 503 }),
          );
          await expect(
            service.runPredictiveMachineContinuation(params()),
          ).rejects.toThrow("uncertain");
          expect((await operation()).state).toBe("uncertain");
          expect((await operation()).last_error).toBeTruthy();
          expect((await queue()).queue_state).toBe("dequeued");
          await expect(
            service.runPredictiveMachineContinuation(params()),
          ).rejects.toThrow("uncertain");
          expect(provider.create).toHaveBeenCalledTimes(1);
          await freshProcess("uncertain");
        },
      );
      test("a failed post-create save keeps the send fenced from stale recovery", async () => {
        const fn = `reject_child_${randomUUID().replaceAll("-", "")}`;
        const trigger = `trigger_${fn}`;
        try {
          await sql.unsafe(
            `create function public.${fn}() returns trigger language plpgsql as $$ begin if new.sid = '${childSid}' then raise exception 'fixture call save failure'; end if; return new; end $$`,
          );
          await sql.unsafe(
            `create trigger ${trigger} before insert on public.call for each row execute function public.${fn}()`,
          );
          await expect(
            service.runPredictiveMachineContinuation(params()),
          ).rejects.toThrow("uncertain");
          const op = await operation();
          expect(op.state).toBe("uncertain");
          expect(op.send_started_at).toBeTruthy();
          expect(op.successor_call_sid).toBeNull();
          expect((await queue()).queue_state).toBe("assigned");
          await sql`update public.campaign_queue set claimed_at=now()-interval '2 hours' where id=${queueId}`;
          await sql`insert into public.campaign_queue (workspace,campaign_id,contact_id,queue_state,assigned_to_user_id,claimed_at,queue_order,attempt_count,attempts)
        values (${workspace},${campaign},${controlContact},'assigned',${user},now()-interval '2 hours',2,1,1)`;
          const [reset] =
            await sql`select public.reset_stale_campaign_queue_claims(${campaign}::integer,interval '1 minute') as count`;
          expect(reset.count).toBe(1);
          expect((await queue()).queue_state).toBe("assigned");
          const [control] =
            await sql`select queue_state from public.campaign_queue where contact_id=${controlContact} and campaign_id=${campaign}`;
          expect(control.queue_state).toBe("queued");
          await expect(
            service.runPredictiveMachineContinuation(params()),
          ).rejects.toThrow("uncertain");
          expect(provider.create).toHaveBeenCalledTimes(1);
        } finally {
          try {
            await sql.unsafe(
              `drop trigger if exists ${trigger} on public.call`,
            );
          } finally {
            await sql.unsafe(`drop function if exists public.${fn}()`);
          }
        }
        const pending = await operation();
        provider.fetch.mockResolvedValue({
          ...createdCall(),
          status: "completed",
          direction: "outbound-api",
          endTime: new Date(Date.now() - 20 * 60_000),
        });
        provider.events.mockResolvedValue([
          {
            request: {
              method: "POST",
              url: pending.successor_voice_url,
              parameters: { call_sid: childSid },
            },
          },
        ]);
        await recoverInWorker();
        expect((await operation()).state).toBe("continued");
        expect((await operation()).successor_call_sid).toBe(childSid);
        expect(provider.create).toHaveBeenCalledTimes(1);
      });
    },
  );

if (fixture.probe)
  describeDb("fresh process recovery probe", () => {
    test("persisted operation blocks a second provider create", async () => {
      if (!fixture.url || !fixture.probe)
        throw new Error("Probe fixture missing");
      const probe = JSON.parse(fixture.probe) as {
        binding: { workspaceId: string; callSid: string; conferenceId: string };
        operationId: string;
        expected: "continued" | "uncertain";
        recoveryJobId?: number;
        childSid: string;
      };
      process.env.DATABASE_URL = process.env.DATABASE_DIRECT_URL = fixture.url;
      provider.create.mockImplementation(() => {
        throw new Error("Fresh process must not send a second call");
      });
      const pools = await import("@/server/db");
      try {
        const repository =
          await import("@/server/predictive-machine-operation.server");
        const service = await import("@/lib/predictive-machine.server");
        const operation = await repository.getPredictiveMachineOperation(
          probe.binding,
          probe.operationId,
        );
        expect(operation?.state).toBe(probe.expected);
        if (probe.recoveryJobId) {
          provider.fetch.mockResolvedValue({
            sid: probe.childSid,
            accountSid: "ACfixture",
            direction: "outbound-api",
            status: operation?.successor_callback_status ?? "completed",
            to: "+15551230002",
            from: "+15559876543",
            endTime: operation?.successor_callback_sid
              ? null
              : new Date(Date.now() - 20 * 60_000),
          });
          provider.events.mockResolvedValue(
            operation?.successor_callback_sid
              ? []
              : [
                  {
                    request: {
                      method: "POST",
                      url: operation?.successor_voice_url,
                      parameters: { call_sid: probe.childSid },
                    },
                  },
                ],
          );
          const { jobHandlers } = await import("@/lib/worker/handlers.server");
          const [job] =
            await pools.pool`select * from public.job where id=${probe.recoveryJobId} and workspace_id=${probe.binding.workspaceId}`;
          const handler = job ? jobHandlers[job.type] : undefined;
          if (!handler || !job) throw new Error("Recovery job missing");
          await handler(job);
          expect(
            (
              await repository.getPredictiveMachineOperation(
                probe.binding,
                probe.operationId,
              )
            )?.state,
          ).toBe("continued");
          expect(provider.create).not.toHaveBeenCalled();
          return;
        }
        const run = service.runPredictiveMachineContinuation({
          workspaceId: probe.binding.workspaceId,
          operationId: probe.operationId,
        });
        if (probe.expected === "continued")
          await expect(run).resolves.toMatchObject({
            completed: true,
            replay: true,
          });
        else await expect(run).rejects.toThrow("uncertain");
        expect(provider.create).not.toHaveBeenCalled();
      } finally {
        await Promise.all([pools.pool.end(), pools.directPool.end()]);
      }
    });
  });
