import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { getExpectedTwilioSignature } from "twilio/lib/webhooks/webhooks.js";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { asRouteResponse, routeArgs } from "../helpers/route-result";

const fixture = vi.hoisted(() => {
  const previous = Object.fromEntries(
    [
      "DATABASE_URL",
      "DATABASE_DIRECT_URL",
      "BASE_URL",
      "TWILIO_VALIDATE_WEBHOOKS",
      "TZ",
    ].map((key) => [key, process.env[key]]),
  );
  const url = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
  return {
    url,
    previous,
    origin: "https://predictive-fixture.example",
    token: "fixture-subaccount-token",
  };
});
const boundary = vi.hoisted(() => ({
  update: vi.fn(),
  next: vi.fn(),
  conferences: vi.fn(),
  signedAudio: vi.fn(),
  devices: vi.fn(),
  fetch: vi.fn(),
  events: vi.fn(),
  dequeue: vi.fn(),
}));
vi.mock("@/lib/database/workspace.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/database/workspace.server")>()),
  createWorkspaceTwilioInstance: vi.fn(async () => ({
    calls: () => ({
      update: boundary.update,
      fetch: boundary.fetch,
      events: { list: boundary.events },
    }),
    conferences: { list: boundary.conferences },
  })),
}));
vi.mock("@/lib/campaign-queue-db.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/campaign-queue-db.server")>()),
  dequeueQueueEntry: boundary.dequeue,
}));
vi.mock("@/lib/auto-dial.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auto-dial.server")>()),
  runAutoDialerTurn: boundary.next,
}));
vi.mock("@/lib/object-storage.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/object-storage.server")>()),
  createSignedObjectUrl: boundary.signedAudio,
}));
vi.mock("@/lib/user-audio.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/user-audio.server")>()),
  getUserVerifiedAudioNumbers: boundary.devices,
}));

const describeDb = fixture.url ? describe : describe.skip;
describeDb(
  "predictive machine callback through real Postgres and signed route (#2396)",
  () => {
    const schema = `predictive_machine_${randomUUID().replaceAll("-", "")}`;
    const workspace = randomUUID();
    const foreignWorkspace = randomUUID();
    const user = randomUUID();
    const room = `${user}~${randomUUID()}`;
    const sid = `CA${randomUUID().replaceAll("-", "")}`;
    const account = `AC${randomUUID().replaceAll("-", "")}`;
    let setup: postgres.Sql;
    let sql: postgres.Sql;
    let campaignId: number;
    let attemptId: number;
    let action: typeof import("@/routes/api+/auto-dial/$roomId.action.server").action;
    let pools: typeof import("@/server/db");
    let repository: typeof import("@/server/predictive-machine-operation.server");
    let continuation: typeof import("@/server/predictive-machine-continuation.server");
    let service: typeof import("@/lib/predictive-machine.server");
    const binding = {
      workspaceId: workspace,
      callSid: sid,
      conferenceId: room,
    };
    async function operation() {
      const row = await repository.getPredictiveMachineOperation(binding);
      if (!row) throw new Error("Expected operation fixture");
      return row;
    }
    async function jobs(type: string) {
      return sql`select * from job where type = ${type}`;
    }
    async function complete() {
      const row = await operation();
      return callback({ query: new URL(row.ack_url).search });
    }
    async function advance() {
      return service.runPredictiveMachineContinuation({
        workspaceId: workspace,
        operationId: (await operation()).id,
      });
    }
    async function seedSuccessor() {
      const [queue] =
        await sql`insert into campaign_queue (workspace, campaign_id, contact_id, queue_state, assigned_to_user_id, claimed_at, attempt_count, attempts)
        values (${workspace}::uuid, ${campaignId}, 2, 'assigned', ${user}::uuid, now(), 1, 1) returning id`;
      const [attempt] =
        await sql`insert into outreach_attempt (workspace, campaign_id, contact_id, user_id)
        values (${workspace}::uuid, ${campaignId}, 2, ${user}::uuid) returning id`;
      return {
        queueId: Number(queue.id),
        attemptId: Number(attempt.id),
        contactId: 2,
      };
    }
    async function acknowledged() {
      await callback();
      expect((await complete()).status).toBe(200);
      return operation();
    }
    async function claimed() {
      const row = await acknowledged();
      return (await continuation.claimPredictiveContinuation(binding, row.id))
        .operation;
    }

    async function disposition() {
      const [row] =
        await sql`select disposition from outreach_attempt where id = ${attemptId}`;
      return row.disposition;
    }
    function callback(
      options: {
        answeredBy?: string;
        signature?: string;
        query?: string;
        called?: string;
        room?: string;
      } = {},
    ) {
      const requestRoom = options.room ?? room;
      const path = `/api/auto-dial/${requestRoom}${options.query ?? ""}`;
      const params = {
        CallSid: sid,
        AccountSid: account,
        AnsweredBy: options.answeredBy ?? "machine_start",
        CallStatus: "in-progress",
        Called: options.called ?? "+15551231234",
      };
      const signature =
        options.signature ??
        getExpectedTwilioSignature(
          fixture.token,
          fixture.origin + path,
          params,
        );
      const request = new Request("http://internal.invalid" + path, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-Twilio-Signature": signature,
        },
        body: new URLSearchParams(params),
      });
      return asRouteResponse(
        action(
          routeArgs(request, { roomId: requestRoom }) as Parameters<
            typeof action
          >[0],
        ),
      );
    }
    beforeAll(async () => {
      if (!fixture.url) throw new Error("Database URL required");
      setup = postgres(fixture.url, { max: 2 });
      await setup.unsafe(`create schema "${schema}"`);
      for (const table of [
        "workspace",
        "campaign",
        "outreach_attempt",
        "call",
        "job",
        "campaign_queue",
      ]) {
        await setup.unsafe(
          `create table "${schema}"."${table}" (like public."${table}" including all)`,
        );
      }
      // The fixture applies the actual table declaration in its owned schema.
      const migration = readFileSync(
        new URL(
          "../../client/migrations/20261006000002_predictive_machine_operation.sql",
          import.meta.url,
        ),
        "utf8",
      );
      const end = migration.indexOf("\n-- An uncertain successor");
      if (end < 0)
        throw new Error("Operation table declaration boundary missing");
      await setup.unsafe(
        migration.slice(0, end).replaceAll("public.", `"${schema}".`),
      );
      const url = new URL(fixture.url);
      url.searchParams.set("search_path", `${schema},public`);
      process.env.DATABASE_URL = process.env.DATABASE_DIRECT_URL =
        url.toString();
      process.env.BASE_URL = fixture.origin;
      process.env.TWILIO_VALIDATE_WEBHOOKS = "true";
      process.env.TZ = "UTC";
      sql = postgres(url.toString(), { max: 4 });
      await sql`insert into workspace (id, name, credits, twilio_data) values
      (${workspace}::uuid, 'Predictive fixture', 10000, ${sql.json({ sid: account, authToken: fixture.token })}),
      (${foreignWorkspace}::uuid, 'Foreign predictive fixture', 10000, ${sql.json({ sid: "ACforeign", authToken: "foreign-token" })})`;
      const [campaign] =
        await sql`insert into campaign (workspace, type, status, title, voicemail_drop_enabled, voicemail_file, caller_id)
      values (${workspace}::uuid, 'live_call', 'running', 'Predictive fixture', true, 'voicemail.mp3', '+15559876543') returning id`;
      campaignId = Number(campaign.id);
      pools = await import("@/server/db");
      for (const pool of [sql, pools.pool, pools.directPool]) {
        const [row] = await pool`select current_schema() as name`;
        expect(row.name).toBe(schema);
      }
      ({ action } =
        await import("@/routes/api+/auto-dial/$roomId.action.server"));
      repository = await import("@/server/predictive-machine-operation.server");
      continuation =
        await import("@/server/predictive-machine-continuation.server");
      service = await import("@/lib/predictive-machine.server");
    });
    beforeEach(async () => {
      await sql`delete from predictive_machine_operation`;
      await sql`delete from job`;
      await sql`delete from campaign_queue`;
      await sql`delete from call`;
      await sql`delete from outreach_attempt`;
      await sql`update campaign set voicemail_drop_enabled = true, voicemail_file = 'voicemail.mp3' where id = ${campaignId}`;
      const [attempt] =
        await sql`insert into outreach_attempt (workspace, campaign_id, contact_id, user_id, disposition)
      values (${workspace}::uuid, ${campaignId}, 1, ${user}::uuid, null) returning id`;
      attemptId = Number(attempt.id);
      await sql`insert into call (sid, account_sid, workspace, campaign_id, outreach_attempt_id, contact_id, conference_id, status)
      values (${sid}, ${account}, ${workspace}::uuid, ${campaignId}, ${attemptId}, 1, ${room}, 'in-progress')`;
      boundary.update.mockResolvedValue({ sid });
      boundary.fetch.mockResolvedValue({
        sid,
        accountSid: account,
        status: "completed",
        endTime: new Date(Date.now() - 16 * 60_000),
      });
      boundary.events.mockResolvedValue([]);
      boundary.dequeue.mockImplementation(
        async ({ by }: { by: { contactId: number } }) => {
          await sql`update campaign_queue set queue_state = 'dequeued', dequeued_at = now() where contact_id = ${by.contactId}`;
        },
      );
      boundary.next.mockResolvedValue({ success: true });
      boundary.conferences.mockResolvedValue([{ sid: "CFfixture" }]);
      boundary.signedAudio.mockResolvedValue(
        "https://audio-fixture.example/voicemail.mp3",
      );
      boundary.devices.mockResolvedValue([]);
    });
    afterEach(async () => {
      if (!sql) return;
      const [row] = await sql`select status from call where sid = ${sid}`;
      expect(row.status).toBe("in-progress");
    });
    afterAll(async () => {
      try {
        if (pools)
          await Promise.all([pools.pool.end(), pools.directPool.end()]);
        if (sql) await sql.end();
      } finally {
        try {
          if (setup) {
            await setup.unsafe(`drop schema if exists "${schema}" cascade`);
            await setup.end();
          }
        } finally {
          for (const [key, value] of Object.entries(fixture.previous)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
          }
        }
      }
    });

    test("concurrent callbacks emit one Play and no early continuation", async () => {
      const responses = await Promise.all([callback(), callback()]);
      expect(responses.map((r) => r.status)).toEqual([200, 200]);
      const bodies = await Promise.all(responses.map((r) => r.text()));
      expect(bodies.filter((body) => body.includes("<Play>"))).toHaveLength(1);
      expect(boundary.update).not.toHaveBeenCalled();
      expect(boundary.next).not.toHaveBeenCalled();
      expect(await disposition()).toBeNull();
      expect((await operation()).state).toBe("issued");
      expect(await jobs("predictive_machine_continue")).toHaveLength(0);
      expect(await jobs("predictive_machine_reconcile")).toHaveLength(1);
    });
    test("sequential redelivery polls without replaying audio", async () => {
      expect(await (await callback()).text()).toContain("<Play>");
      const retry = await callback();
      const body = await retry.text();
      expect(body).not.toContain("<Play>");
      expect(body).toContain("machine=wait");
      expect(await disposition()).toBeNull();
      expect(boundary.next).not.toHaveBeenCalled();
    });
    test("post-Play acknowledgement commits one continuation for concurrent replays", async () => {
      await callback();
      const responses = await Promise.all([complete(), complete()]);
      expect(responses.map((r) => r.status)).toEqual([200, 200]);
      expect(await disposition()).toBe("voicemail");
      expect(await jobs("predictive_machine_continue")).toHaveLength(1);
      expect(boundary.next).not.toHaveBeenCalled();
      await advance();
      await advance();
      expect(boundary.next).toHaveBeenCalledTimes(1);
      expect((await operation()).state).toBe("continued");
    });
    test("failed audio preparation is recorded and a signed retry can issue once", async () => {
      boundary.signedAudio.mockRejectedValueOnce(
        new Error("Object storage unavailable"),
      );
      expect((await callback()).status).toBe(500);
      const pending = await operation();
      expect(pending.state).toBe("prepared");
      expect(pending.last_error).toBeTruthy();
      expect(await disposition()).toBeNull();
      expect(boundary.next).not.toHaveBeenCalled();
      expect(await (await callback()).text()).toContain("<Play>");
      expect(await (await callback()).text()).not.toContain("<Play>");
    });
    test("lost issued response cannot claim voicemail or replay on retry", async () => {
      await callback();
      expect(await (await callback()).text()).not.toContain("<Play>");
      const row = await operation();
      await expect(
        service.reconcilePredictiveMachineOperation(
          { workspaceId: workspace, operationId: row.id },
          9001,
        ),
      ).rejects.toThrow("uncertain");
      expect((await operation()).state).toBe("uncertain");
      expect((await operation()).last_error).toBeTruthy();
      expect(await disposition()).toBeNull();
      expect(await jobs("predictive_machine_continue")).toHaveLength(0);
      expect(boundary.next).not.toHaveBeenCalled();
    });
    test.each(["disabled", "no audio"])(
      "%s drop-off queues and advances once",
      async (mode) => {
        if (mode === "disabled")
          await sql`update campaign set voicemail_drop_enabled = false where id = ${campaignId}`;
        else
          await sql`update campaign set voicemail_file = null where id = ${campaignId}`;
        const responses = await Promise.all([callback(), callback()]);
        for (const response of responses)
          expect(await response.text()).toContain("<Hangup/>");
        expect(boundary.update).not.toHaveBeenCalled();
        expect(boundary.next).not.toHaveBeenCalled();
        expect(await disposition()).toBe("no-answer");
        expect(await jobs("predictive_machine_continue")).toHaveLength(1);
        await advance();
        await advance();
        expect(boundary.next).toHaveBeenCalledTimes(1);
      },
    );
    test("human response joins the conference without playback or next turn", async () => {
      const response = await callback({ answeredBy: "human" });
      expect(await response.text()).toContain(room);
      expect(boundary.update).not.toHaveBeenCalled();
      expect(boundary.next).not.toHaveBeenCalled();
      const [attempt] =
        await sql`select answered_at from outreach_attempt where id = ${attemptId}`;
      expect(attempt.answered_at).toBeTruthy();
    });
    test("a verified device joins its conference and starts the dialer without playback", async () => {
      boundary.devices.mockResolvedValue(["+15551230000"]);
      await sql`update call set contact_id = null where sid = ${sid}`;
      const response = await callback({
        answeredBy: "human",
        called: "+15551230000",
      });
      expect(response.status).toBe(200);
      expect(await response.text()).toContain(room);
      expect(boundary.next).toHaveBeenCalledTimes(1);
      expect(boundary.update).not.toHaveBeenCalled();
      expect(await disposition()).toBeNull();
    });
    test("the full signed query is accepted with the real SDK validator", async () => {
      const response = await callback({
        query: "?operation=original&value=a%2Bb",
      });
      expect(response.status).toBe(200);
      expect(await response.text()).toContain("<Play>");
      expect(boundary.update).not.toHaveBeenCalled();
      expect(await disposition()).toBeNull();
    });
    test("changed signed query is rejected before any operation", async () => {
      const params = {
        CallSid: sid,
        AccountSid: account,
        AnsweredBy: "machine_start",
        CallStatus: "in-progress",
        Called: "+15551231234",
      };
      const signature = getExpectedTwilioSignature(
        fixture.token,
        `${fixture.origin}/api/auto-dial/${room}?operation=original`,
        params,
      );
      const response = await callback({
        signature,
        query: "?operation=changed",
      });
      expect(response.status).toBe(403);
      expect(boundary.update).not.toHaveBeenCalled();
      expect(boundary.next).not.toHaveBeenCalled();
      expect(await disposition()).toBeNull();
    });
    test("a different signed conference URL cannot authorize playback or continuation", async () => {
      await callback({ room: `${user}~${randomUUID()}` });
      expect(boundary.next).not.toHaveBeenCalled();
      expect(await disposition()).toBeNull();
      expect(boundary.update).not.toHaveBeenCalled();
    });
    test("continuation is refused before the post-Play callback", async () => {
      await callback();
      await expect(advance()).rejects.toThrow("not been acknowledged");
      expect(boundary.next).not.toHaveBeenCalled();
    });
    test("a waiting callback cannot issue another Play", async () => {
      await callback();
      const row = await operation();
      const response = await callback({
        query: `?machine=wait&operation=${row.id}`,
      });
      expect(await response.text()).not.toContain("<Play>");
      expect((await operation()).state).toBe("issued");
      expect(await disposition()).toBeNull();
    });
    test("a foreign signed room cannot acknowledge an issued operation", async () => {
      await callback();
      const row = await operation();
      expect(
        (
          await callback({
            room: `${user}~${randomUUID()}`,
            query: new URL(row.ack_url).search,
          })
        ).status,
      ).toBe(404);
      expect((await operation()).state).toBe("issued");
      expect(await jobs("predictive_machine_continue")).toHaveLength(0);
    });
    test("an acknowledgement with a different operation ID has no effects", async () => {
      await callback();
      expect(
        (
          await callback({
            query: `?machine=complete&operation=${randomUUID()}`,
          })
        ).status,
      ).toBe(404);
      expect(await disposition()).toBeNull();
      expect(await jobs("predictive_machine_continue")).toHaveLength(0);
    });
    test("acknowledgement and disposition roll back when the outbox fails", async () => {
      await callback();
      await sql.unsafe(
        `create function "${schema}".reject_continuation() returns trigger language plpgsql as $$ begin if new.type = 'predictive_machine_continue' then raise exception 'fixture outbox failure'; end if; return new; end $$`,
      );
      await sql.unsafe(
        `create trigger reject_continuation before insert on job for each row execute function "${schema}".reject_continuation()`,
      );
      try {
        expect((await complete()).status).toBe(500);
        expect((await operation()).state).toBe("issued");
        expect(await disposition()).toBeNull();
        expect(await jobs("predictive_machine_continue")).toHaveLength(0);
      } finally {
        await sql`drop trigger reject_continuation on job`;
        await sql.unsafe(`drop function "${schema}".reject_continuation()`);
      }
      expect((await complete()).status).toBe(200);
      expect(await disposition()).toBe("voicemail");
      expect(await jobs("predictive_machine_continue")).toHaveLength(1);
    });
    test("a newer operator outcome survives the acknowledgement", async () => {
      await callback();
      await sql`update outreach_attempt set disposition = 'completed' where id = ${attemptId}`;
      expect((await complete()).status).toBe(200);
      expect(await disposition()).toBe("completed");
      expect(await jobs("predictive_machine_continue")).toHaveLength(1);
    });
    test("late callback cannot renew prepared audio for a finished call", async () => {
      boundary.signedAudio.mockRejectedValueOnce(
        new Error("Object storage unavailable"),
      );
      await callback();
      await sql`update call set status = 'completed' where sid = ${sid}`;
      try {
        expect((await callback()).status).toBe(500);
        expect(boundary.signedAudio).toHaveBeenCalledTimes(1);
        expect((await operation()).issued_at).toBeNull();
        expect(await disposition()).toBeNull();
      } finally {
        await sql`update call set status = 'in-progress' where sid = ${sid}`;
      }
    });
    test("call completion while signing prevents issuance", async () => {
      boundary.signedAudio.mockImplementationOnce(async () => {
        await sql`update call set status = 'completed' where sid = ${sid}`;
        return "https://audio-fixture.example/voicemail.mp3";
      });
      try {
        expect(await (await callback()).text()).not.toContain("<Play>");
        expect((await operation()).issued_at).toBeNull();
      } finally {
        await sql`update call set status = 'in-progress' where sid = ${sid}`;
      }
    });
    test("expired preparation owner cannot issue after a renewed owner", async () => {
      const first = await repository.preparePredictiveMachineOperation(
        binding,
        (id) =>
          fixture.origin +
          `/api/auto-dial/${room}?machine=complete&operation=${id}`,
      );
      await sql`update predictive_machine_operation set lease_until = now() - interval '1 second'`;
      const second = await repository.preparePredictiveMachineOperation(
        binding,
        () => {
          throw new Error("Must reuse saved URL");
        },
      );
      expect(first.owned).toBe(true);
      expect(second.owned).toBe(true);
      expect(
        await repository.issuePredictivePlayback(first.operation),
      ).toBeUndefined();
      expect(
        await repository.issuePredictivePlayback(second.operation),
      ).toMatchObject({ state: "issued" });
    });
    test("provider history with the exact post-Play request recovers lost local acknowledgement", async () => {
      await callback();
      const row = await operation();
      boundary.events.mockResolvedValue([
        {
          request: {
            method: "POST",
            url: row.ack_url,
            parameters: { call_sid: sid },
          },
        },
      ]);
      await service.reconcilePredictiveMachineOperation(
        { workspaceId: workspace, operationId: row.id },
        9002,
      );
      expect(await disposition()).toBe("voicemail");
      expect((await operation()).state).toBe("continued");
      expect(boundary.next).toHaveBeenCalledTimes(1);
    });
    test.each(["different call", "different URL", "different method"])(
      "%s event cannot establish playback",
      async (mode) => {
        await callback();
        const row = await operation();
        boundary.events.mockResolvedValue([
          {
            request: {
              method: mode === "different method" ? "GET" : "POST",
              url:
                mode === "different URL"
                  ? row.ack_url + "&changed=1"
                  : row.ack_url,
              parameters: {
                call_sid: mode === "different call" ? "CAforeign" : sid,
              },
            },
          },
        ]);
        await expect(
          service.reconcilePredictiveMachineOperation(
            { workspaceId: workspace, operationId: row.id },
            9003,
          ),
        ).rejects.toThrow("uncertain");
        expect(await disposition()).toBeNull();
        expect(boundary.next).not.toHaveBeenCalled();
      },
    );
    test("an issued retry stops waiting after the response budget without advancing", async () => {
      await callback();
      const row = await operation();
      await sql`update predictive_machine_operation set issued_at=now()-interval '1 minute'`;
      const response = await callback({
        query: `?machine=wait&operation=${row.id}`,
      });
      const body = await response.text();
      expect(body).toContain("<Hangup/>");
      expect(body).not.toContain("<Play>");
      expect(body).not.toContain("<Redirect");
      expect((await operation()).state).toBe("uncertain");
      expect((await operation()).last_error).toBeTruthy();
      expect(await disposition()).toBeNull();
      expect(boundary.next).not.toHaveBeenCalled();
    });
    test.each(["different SID", "different account", "missing stored account"])(
      "%s cannot supply provider recovery evidence",
      async (mode) => {
        await callback();
        const row = await operation();
        if (mode === "missing stored account")
          await sql`update call set account_sid=null where sid=${sid}`;
        boundary.fetch.mockResolvedValue({
          sid: mode === "different SID" ? "CAforeign" : sid,
          accountSid: mode === "different account" ? "ACforeign" : account,
          status: "completed",
          endTime: new Date(Date.now() - 16 * 60_000),
        });
        boundary.events.mockResolvedValue([
          {
            request: {
              method: "POST",
              url: row.ack_url,
              parameters: { call_sid: sid },
            },
          },
        ]);
        await expect(
          service.reconcilePredictiveMachineOperation(
            { workspaceId: workspace, operationId: row.id },
            9010,
          ),
        ).rejects.toThrow("identity");
        expect((await operation()).state).toBe("uncertain");
        expect(boundary.events).not.toHaveBeenCalled();
        expect(boundary.next).not.toHaveBeenCalled();
        expect(await disposition()).toBeNull();
      },
    );
    test("a live provider call reschedules evidence collection without advancing", async () => {
      await callback();
      const row = await operation();
      boundary.fetch.mockResolvedValue({
        sid,
        accountSid: account,
        status: "in-progress",
        endTime: null,
      });
      await service.reconcilePredictiveMachineOperation(
        { workspaceId: workspace, operationId: row.id },
        9004,
      );
      expect(await jobs("predictive_machine_reconcile")).toHaveLength(2);
      expect(boundary.events).not.toHaveBeenCalled();
      expect(boundary.next).not.toHaveBeenCalled();
      expect(await disposition()).toBeNull();
    });
    test("provider history is deferred until its availability window", async () => {
      await callback();
      const row = await operation();
      boundary.fetch.mockResolvedValue({
        sid,
        accountSid: account,
        status: "completed",
        endTime: new Date(),
      });
      await service.reconcilePredictiveMachineOperation(
        { workspaceId: workspace, operationId: row.id },
        9005,
      );
      expect(boundary.events).not.toHaveBeenCalled();
      expect(boundary.next).not.toHaveBeenCalled();
      const rows = await jobs("predictive_machine_reconcile");
      expect(rows).toHaveLength(2);
      expect(new Date(rows[1].retry_at).getTime()).toBeGreaterThan(
        Date.now() + 14 * 60_000,
      );
    });
    test("a continuation with an active lease cannot be claimed twice", async () => {
      const first = await claimed();
      await expect(
        continuation.claimPredictiveContinuation(binding, first.id),
      ).rejects.toThrow("still running");
      expect(boundary.next).not.toHaveBeenCalled();
    });
    test("expired worker before send can be replaced but the old owner cannot send", async () => {
      const first = await claimed();
      const successor = await seedSuccessor();
      await sql`update predictive_machine_operation set lease_until = now() - interval '1 second'`;
      const second = (
        await continuation.claimPredictiveContinuation(binding, first.id)
      ).operation;
      await expect(
        continuation.recordPredictiveSuccessorAttempt(first, successor),
      ).rejects.toThrow("no longer owns");
      const saved = await continuation.recordPredictiveSuccessorAttempt(
        second,
        successor,
      );
      expect(saved.send_started_at).toBeInstanceOf(Date);
      await expect(
        continuation.recordPredictiveSuccessorAttempt(second, successor),
      ).rejects.toThrow("no longer owns");
    });
    test.each([
      "foreign queue",
      "foreign attempt",
      "other actor",
      "other contact",
      "released queue",
      "dequeued queue",
    ])("%s cannot reserve a successor send", async (mode) => {
      const row = await claimed();
      const successor = await seedSuccessor();
      if (mode === "foreign queue")
        await sql`update campaign_queue set workspace=${foreignWorkspace}::uuid where id=${successor.queueId}`;
      if (mode === "foreign attempt")
        await sql`update outreach_attempt set workspace=${foreignWorkspace}::uuid where id=${successor.attemptId}`;
      if (mode === "other actor")
        await sql`update campaign_queue set assigned_to_user_id=${randomUUID()}::uuid where id=${successor.queueId}`;
      if (mode === "other contact")
        await sql`update outreach_attempt set contact_id=3 where id=${successor.attemptId}`;
      if (mode === "released queue")
        await sql`update campaign_queue set queue_state='queued' where id=${successor.queueId}`;
      if (mode === "dequeued queue")
        await sql`update campaign_queue set dequeued_at=now() where id=${successor.queueId}`;
      await expect(
        continuation.recordPredictiveSuccessorAttempt(row, successor),
      ).rejects.toThrow("binding");
      expect((await operation()).send_started_at).toBeNull();
    });
    test("unknown successor acknowledgement remains fenced after a process lease expires", async () => {
      const row = await claimed();
      const successor = await seedSuccessor();
      await continuation.recordPredictiveSuccessorAttempt(row, successor);
      await sql`update predictive_machine_operation set lease_until = now() - interval '1 second'`;
      await expect(advance()).rejects.toThrow("uncertain");
      expect(boundary.next).not.toHaveBeenCalled();
      expect((await operation()).successor_queue_id).toBe(successor.queueId);
    });
    test("saved successor and journal share a transaction and recovery cannot dial again", async () => {
      const row = await claimed();
      const successor = await seedSuccessor();
      const reserved = await continuation.recordPredictiveSuccessorAttempt(
        row,
        successor,
      );
      const childSid = `CA${randomUUID().replaceAll("-", "")}`;
      await continuation.savePredictiveSuccessorCall(reserved, {
        sid: childSid,
        workspace,
        campaign_id: campaignId,
        contact_id: 2,
        outreach_attempt_id: successor.attemptId,
        conference_id: room,
        status: "queued",
      });
      const [saved] =
        await sql`select outreach_attempt_id from call where sid=${childSid}`;
      expect(Number(saved.outreach_attempt_id)).toBe(successor.attemptId);
      await sql`update predictive_machine_operation set lease_until = now() - interval '1 second'`;
      await advance();
      await advance();
      expect(boundary.next).not.toHaveBeenCalled();
      expect(boundary.dequeue).toHaveBeenCalledTimes(1);
      expect((await operation()).state).toBe("continued");
      expect((await operation()).successor_call_sid).toBe(childSid);
    });
    test("a saved successor SID cannot be replaced by a different call", async () => {
      const row = await claimed();
      const successor = await seedSuccessor();
      const reserved = await continuation.recordPredictiveSuccessorAttempt(
        row,
        successor,
      );
      const child = {
        sid: `CA${randomUUID().replaceAll("-", "")}`,
        workspace,
        campaign_id: campaignId,
        contact_id: 2,
        outreach_attempt_id: successor.attemptId,
        conference_id: room,
        status: "queued",
      };
      const saved = await continuation.savePredictiveSuccessorCall(
        reserved,
        child,
      );
      await expect(
        continuation.savePredictiveSuccessorCall(saved, {
          ...child,
          sid: "CAreplacement",
        }),
      ).rejects.toThrow("binding");
      expect((await operation()).successor_call_sid).toBe(child.sid);
      expect(
        await sql`select sid from call where sid='CAreplacement'`,
      ).toHaveLength(0);
    });
    test("a foreign attempt cannot authorize owned-call playback or continuation", async () => {
      await sql`update outreach_attempt set workspace = ${foreignWorkspace}::uuid where id = ${attemptId}`;
      await callback();
      expect(await disposition()).toBeNull();
      expect(boundary.update).not.toHaveBeenCalled();
      expect(boundary.next).not.toHaveBeenCalled();
    });
  },
);
