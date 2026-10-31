import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { z } from "zod";
import { RouterContextProvider } from "react-router";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { makePortalConfig } from "../fixtures/workspace-twilio-portal-config";
import { asRouteResponse } from "../helpers/route-result";

// The session and application database are real. Mail is the external boundary.
vi.mock("@/lib/transactional-email.server", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/transactional-email.server")>();
  return { ...actual, sendTransactionalEmail: vi.fn(async () => undefined) };
});

const databaseUrl = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
const workspace = randomUUID();
const foreign = randomUUID();
const baseUrl = "http://127.0.0.1:3038";
const actors = new Map<string, { id: string; email: string; cookie: string }>();
let sql: ReturnType<typeof postgres>;
let middleware: typeof import("@/lib/workspace-middleware.server").workspaceMiddleware;
let loader: typeof import("@/routes/workspaces+/$id/contacts/$contactId.loader.server").loader;
let action: typeof import("@/routes/workspaces+/$id/contacts/$contactId.action.server").action;
let closeAppPools: (() => Promise<void>) | undefined;
let retainedId: number;
let duplicateId: number;
let foreignId: number;

function actor(name: string) {
  const identity = actors.get(name);
  if (!identity) throw new Error("Owned merge identity missing");
  return identity;
}

async function clean() {
  await sql`delete from job where workspace_id in (${workspace}, ${foreign})`;
  await sql`delete from workspace where id in (${workspace}, ${foreign})`;
}

async function post(fields: Record<string, string>, who = "member") {
  const body = new FormData();
  // These profile fields make an ordinary save a valid control on the old route.
  body.set("firstname", "Ada");
  body.set("phone", "+14165550123");
  for (const [key, value] of Object.entries(fields)) body.set(key, value);
  const request = new Request(
    `${baseUrl}/workspaces/${workspace}/contacts/${retainedId}`,
    {
      method: "POST",
      headers: { Cookie: actor(who).cookie },
      body,
    },
  );
  const args = {
    request,
    url: new URL(request.url),
    params: { id: workspace, contactId: String(retainedId) },
    context: new RouterContextProvider(),
  };
  return asRouteResponse(middleware(args, async () => action(args)));
}

async function confirmation() {
  const response = await post({
    intent: "preview-contact-merge",
    merge_contact_ids: JSON.stringify([retainedId, duplicateId]),
  });
  expect(response.status).toBe(200);
  const { mergeReview } = z
    .object({
      mergeReview: z.object({ version: z.string(), requestId: z.string() }),
    })
    .parse(await response.json());
  return {
    intent: "merge-contacts",
    merge_contact_ids: JSON.stringify([retainedId, duplicateId]),
    merge_version: mergeReview.version,
    merge_request_id: mergeReview.requestId,
    confirm_same_person: "yes",
  };
}

async function history() {
  const [campaign] =
    await sql`insert into campaign (workspace, title, status) values (${workspace}, 'Owned paused merge campaign', 'paused') returning id`;
  const queues =
    await sql`insert into campaign_queue (workspace, campaign_id, contact_id, queue_state, attempt_count, attempts, dequeued_at, dequeued_reason)
    values (${workspace}, ${campaign.id}, ${retainedId}, 'queued', 1, 1, null, null),
    (${workspace}, ${campaign.id}, ${duplicateId}, 'dequeued', 2, 2, '2026-10-01T12:00:00Z', 'Completed before merge') returning id`;
  const [attempt] =
    await sql`insert into outreach_attempt (workspace, campaign_id, contact_id, disposition, ended_at, result)
    values (${workspace}, ${campaign.id}, ${duplicateId}, 'completed', now(), '{"answer":"saved"}'::jsonb) returning id`;
  await sql`insert into call (workspace, sid, contact_id, campaign_id, queue_id, outreach_attempt_id, status, recording_url)
    values (${workspace}, ${"CA-owned-" + randomUUID()}, ${duplicateId}, ${campaign.id}, ${queues[1].id}, ${attempt.id}, 'completed', 'https://example.test/recording')`;
  await sql`insert into message (workspace, sid, contact_id, campaign_id, queue_id, status, body)
    values (${workspace}, ${"SM-owned-" + randomUUID()}, ${duplicateId}, ${campaign.id}, ${queues[1].id}, 'delivered', 'Preserve this message')`;
  const [survey] =
    await sql`insert into survey (workspace, survey_id, title) values (${workspace}, ${randomUUID()}, 'Owned survey') returning id`;
  await sql`insert into survey_response (survey_id, result_id, contact_id) values (${survey.id}, ${randomUUID()}, ${duplicateId})`;
  const lists =
    await sql`insert into audience (workspace, name) values (${workspace}, 'First list'), (${workspace}, 'Second list') returning id`;
  await sql`insert into contact_audience (contact_id, audience_id) values
    (${retainedId}, ${lists[0].id}), (${duplicateId}, ${lists[0].id}), (${duplicateId}, ${lists[1].id})`;
  return {
    campaignId: campaign.id,
    queues: queues.map((row) => Number(row.id)),
    audienceIds: lists.map((row) => Number(row.id)),
  };
}

async function savedState() {
  return {
    profiles: await contacts(),
    queues:
      await sql`select * from campaign_queue where workspace = ${workspace} order by id`,
    calls:
      await sql`select * from call where workspace = ${workspace} order by sid`,
    messages:
      await sql`select * from message where workspace = ${workspace} order by sid`,
    attempts:
      await sql`select * from outreach_attempt where workspace = ${workspace} order by id`,
    audiences:
      await sql`select * from contact_audience where contact_id in (${retainedId}, ${duplicateId}) order by contact_id, audience_id`,
    responses:
      await sql`select * from survey_response where contact_id in (${retainedId}, ${duplicateId}) order by id`,
    receipts:
      await sql`select * from contact_merge_receipt where workspace = ${workspace} order by id`,
  };
}

async function contacts() {
  return sql`select id, firstname, phone, opt_out, external_id, other_data, date_updated
    from contact where workspace = ${workspace} order by id`;
}

describe.skipIf(!databaseUrl)(
  "reviewed contact repair through real sessions and PostgreSQL (#3091)",
  () => {
    beforeAll(async () => {
      if (!databaseUrl) throw new Error("Owned database required");
      for (const [name, value] of Object.entries({
        DATABASE_URL: databaseUrl,
        DATABASE_DIRECT_URL: databaseUrl,
        BASE_URL: baseUrl,
        BETTER_AUTH_URL: `${baseUrl}/api/auth`,
        BETTER_AUTH_SECRET: "owned-contact-merge-3091-fixture-secret",
        TZ: "UTC",
      }))
        vi.stubEnv(name, value);
      sql = postgres(databaseUrl, { max: 2 });
      const { pool, directPool } = await import("@/server/db");
      closeAppPools = async () => {
        await Promise.all([pool.end(), directPool.end()]);
      };
      const { auth } = await import("@/server/auth-instance");
      const context = await auth.$context;
      for (const name of ["member", "caller", "outsider"]) {
        const email = `owned-3091-${name}-${randomUUID()}@example.test`;
        const password = "OwnedContact3091Password!";
        await auth.api.signUpEmail({
          body: { name: `Owned ${name}`, email, password },
          headers: new Headers({ Origin: baseUrl }),
        });
        await sql`update auth_user set email_verified = true where email = ${email}`;
        const result = await auth.api.signInEmail({
          body: { email, password },
          headers: new Headers({ Origin: baseUrl }),
          returnHeaders: true,
        });
        const cookie = result.headers
          .getSetCookie()
          .find((value) =>
            value.startsWith(`${context.authCookies.sessionToken.name}=`),
          );
        if (!cookie) throw new Error("Real merge session cookie missing");
        actors.set(name, {
          id: result.response.user.id,
          email,
          cookie: cookie.split(";")[0],
        });
      }
      ({ workspaceMiddleware: middleware } =
        await import("@/lib/workspace-middleware.server"));
      ({ loader } =
        await import("@/routes/workspaces+/$id/contacts/$contactId.loader.server"));
      ({ action } =
        await import("@/routes/workspaces+/$id/contacts/$contactId.action.server"));
    });

    beforeEach(async () => {
      await clean();
      await sql`insert into workspace (id, name) values
      (${workspace}, 'Owned merge workspace'), (${foreign}, 'Owned foreign merge workspace')`;
      for (const name of ["member", "caller"]) {
        await sql`insert into workspace_member (id, workspace_id, user_id, role_id)
        values (${randomUUID()}, ${workspace}, ${actor(name).id}, ${name})`;
      }
      const rows =
        await sql`insert into contact (workspace, firstname, phone, opt_out, line_type, external_id, other_data)
      values
      (${workspace}, 'Ada', '+14165550123', false, 'mobile', 'person-3091', '[{"notes":"keep"}]'::jsonb),
      (${workspace}, 'Ada imported', '(416) 555-0123', false, 'mobile', 'person-3091', '[{"source":"old import"}]'::jsonb),
      (${foreign}, 'Other workspace', '+14165550123', true, 'landline', 'foreign-person', '[]'::jsonb)
      returning id`;
      [retainedId, duplicateId, foreignId] = rows.map((row) => Number(row.id));
    });

    afterAll(async () => {
      const failures: unknown[] = [];
      try {
        if (sql) {
          await clean();
          for (const identity of actors.values()) {
            await sql`delete from "user" where id = ${identity.id}`;
            await sql`delete from auth_user where id = ${identity.id}`;
          }
        }
      } catch (error) {
        failures.push(error);
      }
      for (const result of await Promise.allSettled([
        sql?.end(),
        closeAppPools?.(),
      ])) {
        if (result.status === "rejected") failures.push(result.reason);
      }
      vi.unstubAllEnvs();
      if (failures.length)
        throw new AggregateError(
          failures,
          "Owned merge fixture cleanup failed",
        );
    });

    test("offers a read-only review of confirmed duplicate-person records instead of silently saving a profile", async () => {
      const { verifySmsRecipient } =
        await import("@/lib/chat-sms-guards.server");
      expect(
        await verifySmsRecipient(workspace, "+14165550123", String(retainedId)),
      ).toMatchObject({
        ok: false,
        reason: "recipient_unverified",
      });
      const before = await contacts();
      const response = await post({
        intent: "preview-contact-merge",
        merge_contact_ids: JSON.stringify([retainedId, duplicateId]),
      });
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toMatchObject({
        mergeReview: {
          retainedContactId: retainedId,
          contacts: expect.arrayContaining([
            expect.objectContaining({ id: retainedId, firstname: "Ada" }),
            expect.objectContaining({
              id: duplicateId,
              firstname: "Ada imported",
            }),
          ]),
          optedOut: false,
        },
      });
      expect(await contacts()).toEqual(before);
    });

    test("refuses confirmation without the reviewed version and explicit same-person confirmation", async () => {
      const before = await contacts();
      const response = await post({
        intent: "merge-contacts",
        merge_contact_ids: JSON.stringify([retainedId, duplicateId]),
        merge_request_id: randomUUID(),
      });
      expect(response.status).toBe(400);
      expect(await contacts()).toEqual(before);
    });

    test("the review carries the most restrictive opt-out without changing either profile", async () => {
      await sql`update contact set opt_out = true where id = ${duplicateId}`;
      const before = await contacts();
      const response = await post({
        intent: "preview-contact-merge",
        merge_contact_ids: JSON.stringify([retainedId, duplicateId]),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        mergeReview: { optedOut: true },
      });
      expect(await contacts()).toEqual(before);
    });

    test("a shared phone cannot merge distinct external identities", async () => {
      await sql`update contact set external_id = 'a-different-person' where id = ${duplicateId}`;
      const before = await contacts();
      const response = await post({
        intent: "preview-contact-merge",
        merge_contact_ids: JSON.stringify([retainedId, duplicateId]),
      });
      expect(response.status).toBe(409);
      expect(await contacts()).toEqual(before);
    });

    test("a shared phone cannot merge distinct voter identities", async () => {
      await sql`update contact set voter_id = 'voter-one' where id = ${retainedId}`;
      await sql`update contact set voter_id = 'voter-two' where id = ${duplicateId}`;
      const before = await contacts();
      const response = await post({
        intent: "preview-contact-merge",
        merge_contact_ids: JSON.stringify([retainedId, duplicateId]),
      });
      expect(response.status).toBe(409);
      expect(await contacts()).toEqual(before);
    });

    test("different phone numbers cannot enter one review", async () => {
      await sql`update contact set phone = '+14165550124' where id = ${duplicateId}`;
      const before = await contacts();
      const response = await post({
        intent: "preview-contact-merge",
        merge_contact_ids: JSON.stringify([retainedId, duplicateId]),
      });
      expect(response.status).toBe(400);
      expect(await contacts()).toEqual(before);
    });

    test("the review reports the union of audience memberships, including overlapping lists", async () => {
      const lists =
        await sql`insert into audience (workspace, name) values (${workspace}, 'First list'), (${workspace}, 'Second list') returning id`;
      await sql`insert into contact_audience (contact_id, audience_id) values
      (${retainedId}, ${lists[0].id}), (${duplicateId}, ${lists[0].id}), (${duplicateId}, ${lists[1].id})`;
      const response = await post({
        intent: "preview-contact-merge",
        merge_contact_ids: JSON.stringify([retainedId, duplicateId]),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        mergeReview: { effects: { audiences: 2 } },
      });
      const memberships =
        await sql`select * from contact_audience where contact_id in (${retainedId}, ${duplicateId})`;
      expect(memberships).toHaveLength(3);
    });

    test("a confirmed repair preserves history, unions memberships and never requeues completed work", async () => {
      const fixture = await history();
      const fields = await confirmation();
      const response = await post(fields);
      expect(response.status).toBe(303);
      const location = `/workspaces/${workspace}/contacts/${retainedId}?merge_receipt=${fields.merge_request_id}`;
      expect(response.headers.get("Location")).toBe(location);
      const request = new Request(baseUrl + location, {
        headers: { Cookie: actor("member").cookie },
      });
      const args = {
        request,
        url: new URL(request.url),
        params: { id: workspace, contactId: String(retainedId) },
        context: new RouterContextProvider(),
      };
      const loaded = await asRouteResponse(
        middleware(args, async () => loader(args)),
      );
      expect(loaded.status).toBe(200);
      expect(await loaded.json()).toMatchObject({
        mergeResult: {
          retainedContactId: retainedId,
          mergedCount: 1,
          requestId: fields.merge_request_id,
        },
      });
      const profiles = await contacts();
      expect(profiles).toHaveLength(1);
      expect(profiles[0]).toMatchObject({
        firstname: "Ada",
        other_data: [{ notes: "keep" }],
      });
      const queues =
        await sql`select id, contact_id, queue_state, attempt_count, attempts, dequeued_reason, dequeued_at from campaign_queue where workspace = ${workspace}`;
      expect(queues).toHaveLength(1);
      expect(Number(queues[0].contact_id)).toBe(retainedId);
      expect(queues[0]).toMatchObject({
        queue_state: "dequeued",
        attempt_count: 3,
        dequeued_reason: "Completed before merge",
      });
      expect(Number(queues[0].attempts)).toBe(3);
      expect(queues[0].dequeued_at).not.toBeNull();
      const calls =
        await sql`select contact_id, queue_id, recording_url from call where workspace = ${workspace}`;
      expect(calls).toHaveLength(1);
      expect(Number(calls[0].contact_id)).toBe(retainedId);
      expect(Number(calls[0].queue_id)).toBe(Number(queues[0].id));
      expect(calls[0].recording_url).toBe("https://example.test/recording");
      const messages =
        await sql`select contact_id, queue_id, body from message where workspace = ${workspace}`;
      expect(messages).toHaveLength(1);
      expect(Number(messages[0].contact_id)).toBe(retainedId);
      expect(Number(messages[0].queue_id)).toBe(Number(queues[0].id));
      expect(messages[0].body).toBe("Preserve this message");
      const attempts =
        await sql`select contact_id, result from outreach_attempt where workspace = ${workspace}`;
      expect(attempts).toHaveLength(1);
      expect(Number(attempts[0].contact_id)).toBe(retainedId);
      expect(attempts[0].result).toEqual({ answer: "saved" });
      const responses =
        await sql`select contact_id from survey_response where survey_id in (select id from survey where workspace = ${workspace})`;
      expect(responses).toHaveLength(1);
      expect(Number(responses[0].contact_id)).toBe(retainedId);
      const memberships =
        await sql`select audience_id from contact_audience where contact_id = ${retainedId} order by audience_id`;
      expect(memberships.map((row) => Number(row.audience_id))).toEqual(
        fixture.audienceIds,
      );
      const receipts =
        await sql`select source_profiles, actor_id from contact_merge_receipt where workspace = ${workspace}`;
      expect(receipts).toHaveLength(1);
      expect(receipts[0].actor_id).toBe(actor("member").id);
      expect(receipts[0].source_profiles).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: duplicateId,
            firstname: "Ada imported",
            other_data: [{ source: "old import" }],
          }),
          expect.objectContaining({ id: retainedId, firstname: "Ada" }),
        ]),
      );
      expect((await post(fields)).status).toBe(303);
      expect(
        await sql`select id from contact_merge_receipt where workspace = ${workspace}`,
      ).toHaveLength(1);
      const { verifySmsRecipient } =
        await import("@/lib/chat-sms-guards.server");
      expect(
        await verifySmsRecipient(workspace, "+14165550123", String(retainedId)),
      ).toMatchObject({
        ok: true,
        contact: { id: retainedId, firstname: "Ada" },
      });
    });

    test("a confirmed repair retains every saved opt-out", async () => {
      await sql`update contact set opt_out = true where id = ${duplicateId}`;
      const response = await post(await confirmation());
      expect(response.status).toBe(303);
      const { verifySmsRecipient } =
        await import("@/lib/chat-sms-guards.server");
      expect(
        await verifySmsRecipient(workspace, "+14165550123", String(retainedId)),
      ).toMatchObject({ ok: false, reason: "opted_out" });
    });

    test("a changed profile makes an earlier review stale without any merge writes", async () => {
      const fields = await confirmation();
      await sql`update contact set surname = 'Updated during review' where id = ${duplicateId}`;
      const before = await contacts();
      expect((await post(fields)).status).toBe(409);
      expect(await contacts()).toEqual(before);
    });

    test("active calls block repair with no lost profiles or history", async () => {
      await sql`insert into call (workspace, sid, contact_id, status) values (${workspace}, ${"CA-active-" + randomUUID()}, ${duplicateId}, 'in-progress')`;
      const before = await contacts();
      const response = await post({
        intent: "preview-contact-merge",
        merge_contact_ids: JSON.stringify([retainedId, duplicateId]),
      });
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({
        error: expect.stringMatching(/finish|pause|active/i),
      });
      expect(await contacts()).toEqual(before);
    });

    test("a late receipt failure rolls back every profile, queue and history change", async () => {
      await history();
      const fields = await confirmation();
      const before = await savedState();
      const name = `owned_merge_${randomUUID().replaceAll("-", "")}`;
      await sql.unsafe(
        `create function ${name}() returns trigger language plpgsql as $$ begin if new.workspace = '${workspace}'::uuid then raise exception 'Owned merge receipt failure'; end if; return new; end; $$`,
      );
      try {
        await sql.unsafe(
          `create trigger ${name} before insert on contact_merge_receipt for each row execute function ${name}()`,
        );
        expect((await post(fields)).status).toBe(500);
        expect(await savedState()).toEqual(before);
      } finally {
        await sql.unsafe(
          `drop trigger if exists ${name} on contact_merge_receipt`,
        );
        await sql.unsafe(`drop function ${name}()`);
      }
    });

    test("simultaneous confirmations apply the same request once", async () => {
      await history();
      const fields = await confirmation();
      const responses = await Promise.all([post(fields), post(fields)]);
      expect(responses.map((response) => response.status)).toEqual([303, 303]);
      expect(await contacts()).toHaveLength(1);
      expect(
        await sql`select id from contact_merge_receipt where workspace = ${workspace}`,
      ).toHaveLength(1);
      expect(
        await sql`select sid from call where workspace = ${workspace}`,
      ).toHaveLength(1);
    });

    test("an in-flight SMS intent blocks review before any record is removed", async () => {
      await sql`insert into message (workspace, sid, contact_id, status) values (${workspace}, ${"pending:" + randomUUID()}, ${duplicateId}, 'queued')`;
      const before = await savedState();
      expect(
        (
          await post({
            intent: "preview-contact-merge",
            merge_contact_ids: JSON.stringify([retainedId, duplicateId]),
          })
        ).status,
      ).toBe(409);
      expect(await savedState()).toEqual(before);
    });

    test("campaign activity after the review blocks confirmation", async () => {
      const fixture = await history();
      const fields = await confirmation();
      await sql`update campaign set status = 'running' where id = ${fixture.campaignId}`;
      const before = await savedState();
      expect((await post(fields)).status).toBe(409);
      expect(await savedState()).toEqual(before);
    });

    test("a foreign history reference causes a safe refusal, never a cascade delete", async () => {
      await sql`insert into call (workspace, sid, contact_id, status) values (${foreign}, ${"CA-inconsistent-" + randomUUID()}, ${duplicateId}, 'completed')`;
      const before = await savedState();
      expect(
        (
          await post({
            intent: "preview-contact-merge",
            merge_contact_ids: JSON.stringify([retainedId, duplicateId]),
          })
        ).status,
      ).toBe(409);
      expect(await savedState()).toEqual(before);
      expect(
        await sql`select sid from call where workspace = ${foreign}`,
      ).toHaveLength(1);
    });

    test("conflicting line caches require a fresh lookup and cannot authorize SMS", async () => {
      await sql`update contact set line_type = 'landline' where id = ${duplicateId}`;
      expect((await post(await confirmation())).status).toBe(303);
      const [profile] =
        await sql`select line_type, line_type_checked_at from contact where id = ${retainedId}`;
      expect(profile).toMatchObject({
        line_type: null,
        line_type_checked_at: null,
      });
      const lookup = await import("@/lib/twilio-lookup.server");
      const spy = vi
        .spyOn(lookup, "getOrLookupLineType")
        .mockResolvedValue("landline");
      try {
        const { verifySmsRecipient } =
          await import("@/lib/chat-sms-guards.server");
        expect(
          await verifySmsRecipient(
            workspace,
            "+14165550123",
            String(retainedId),
          ),
        ).toMatchObject({ ok: false, reason: "sms_incapable" });
      } finally {
        spy.mockRestore();
      }
    });

    test("unselected people with the same phone remain separate and keep SMS ambiguous", async () => {
      await sql`insert into contact (workspace, phone, external_id, firstname) values (${workspace}, '+14165550123', 'different-person', 'Household member')`;
      expect((await post(await confirmation())).status).toBe(303);
      expect(await contacts()).toHaveLength(2);
      const { verifySmsRecipient } =
        await import("@/lib/chat-sms-guards.server");
      expect(
        await verifySmsRecipient(workspace, "+14165550123", String(retainedId)),
      ).toMatchObject({ ok: false, reason: "recipient_unverified" });
    });

    test("a concurrent import waits for repair and preserves source receipt identity", async () => {
      const fixture = await history();
      const { db } = await import("@/server/db");
      const { prepareAudienceImport } =
        await import("@/lib/audience-import-map.server");
      const protocol = await import("@/server/audience-import-recovery.server");
      const prepared = prepareAudienceImport(
        Buffer.from("Name,Phone\nNew name,4165550123\n"),
        { Name: "firstname", Phone: "phone" },
        null,
        null,
      );
      const [upload] =
        await sql`insert into audience_upload (workspace, audience_id, created_by, status, total_contacts, processed_contacts)
      values (${workspace}, ${fixture.audienceIds[0]}, ${actor("member").id}, 'pending', 0, 0) returning id`;
      const [job] =
        await sql`insert into job (type, workspace_id, user_id, params, status, attempt_count, claimed_by, claimed_until)
      values ('audience_upload', ${workspace}, ${actor("member").id}, ${sql.json({ uploadId: Number(upload.id), audienceId: fixture.audienceIds[0] })}, 'running', 1, 'owned-merge', now() + interval '5 minutes') returning id`;
      const ctx = {
        workspaceId: workspace,
        audienceId: fixture.audienceIds[0],
        uploadId: Number(upload.id),
        userId: actor("member").id,
        claim: {
          jobId: Number(job.id),
          attemptCount: 1,
          claimedBy: "owned-merge",
        },
      };
      const run = await protocol.startAudienceImport(ctx, prepared);
      // This completed legacy import receipt remains provenance, even after its contact is removed.
      const historicalRun = randomUUID();
      await sql`insert into audience_import_run (id, workspace, audience_id, identity, file_sha256, mapping, created_by, source_rows, next_index, imported, state)
      values (${historicalRun}, ${workspace}, ${fixture.audienceIds[0]}, ${randomUUID()}, 'owned-historical-file', ${sql.json(prepared.effective)}, ${actor("member").id}, 1, 1, 1, 'completed')`;
      await sql`insert into audience_import_row (run_id, workspace, record_number, source, outcome, contact_id)
      values (${historicalRun}, ${workspace}, 2, '{"recordNumber":2,"byteStart":11,"byteEnd":31,"startLine":2,"endLine":2}'::jsonb, 'imported', ${duplicateId})`;
      const historical =
        await sql`select * from audience_import_row where run_id = ${historicalRun}`;
      const fields = await confirmation();
      let release: (() => void) | undefined;
      let locked: (() => void) | undefined;
      const ready = new Promise<void>((resolve) => {
        locked = resolve;
      });
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const held = sql.begin(async (tx) => {
        await tx`select id from contact where id = ${duplicateId} for update`;
        locked?.();
        await gate;
      });
      await ready;
      const merge = post(fields);
      let imported: Promise<unknown> | undefined;
      try {
        await vi.waitFor(
          async () => {
            const waiting = await db.execute<{ waiting: boolean }>(
              (await import("drizzle-orm"))
                .sql`select exists(select 1 from pg_stat_activity where wait_event_type = 'Lock' and datname = current_database() and query like ${`%from contact%`} and pid <> pg_backend_pid()) as waiting`,
            );
            expect(waiting[0]?.waiting).toBe(true);
          },
          { timeout: 2000 },
        );
        imported = protocol.advanceAudienceImport(ctx, run.id, prepared);
        await vi.waitFor(
          async () => {
            const waiting = await db.execute<{ count: number }>(
              (await import("drizzle-orm"))
                .sql`select count(*)::integer as count from pg_stat_activity where wait_event_type = 'Lock' and datname = current_database() and pid <> pg_backend_pid()`,
            );
            expect(waiting[0]?.count).toBeGreaterThanOrEqual(2);
          },
          { timeout: 2000 },
        );
      } finally {
        release?.();
        await held;
        await Promise.allSettled([merge, imported]);
      }
      const results = await Promise.allSettled([merge, imported]);
      expect(results.map((result) => result.status)).toEqual([
        "fulfilled",
        "fulfilled",
      ]);
      expect((await merge).status).toBe(303);
      expect(await contacts()).toHaveLength(1);
      expect(
        await sql`select * from audience_import_row where run_id = ${historicalRun}`,
      ).toEqual(historical);
      expect(
        await sql`select outcome from audience_import_row where run_id = ${run.id}`,
      ).toEqual([{ outcome: "duplicate" }]);
      expect(await protocol.finishAudienceImport(ctx, run.id)).toMatchObject({
        state: "completed",
        duplicates: 1,
      });
    }, 15000);

    test.each(["merge_version", "merge_request_id", "confirm_same_person"])(
      "confirmation requires %s even when the other fields are valid",
      async (field) => {
        const fields: Record<string, string> = await confirmation();
        delete fields[field];
        const before = await savedState();
        expect((await post(fields)).status).toBe(400);
        expect(await savedState()).toEqual(before);
      },
    );

    test("the operator can retain the imported profile instead of the original", async () => {
      [retainedId, duplicateId] = [duplicateId, retainedId];
      expect((await post(await confirmation())).status).toBe(303);
      const saved = await contacts();
      expect(saved).toHaveLength(1);
      expect(saved[0]).toMatchObject({
        firstname: "Ada imported",
        other_data: [{ source: "old import" }],
      });
    });

    test("the manual SMS route resumes with the chosen profile and keeps an opted-out result blocked", async () => {
      const workspaceDb = await import("@/lib/database/workspace.server");
      const sms = await import("@/lib/chat-sms.server");
      const config = vi
        .spyOn(
          workspaceDb,
          "getEffectiveWorkspaceTwilioPortalConfigForWorkspace",
        )
        .mockResolvedValue({
          ...makePortalConfig(),
          sendMode: "messaging_service",
          messagingServiceSid: "MG-owned-3091",
        });
      const send = vi
        .spyOn(sms, "sendMessage")
        .mockResolvedValue({ message: { sid: "SM-owned-3091" }, data: [] });
      await sql`update workspace set credits = 100 where id = ${workspace}`;
      const { action: chatAction } =
        await import("@/routes/workspaces+/$id/chats.action.server");
      const attempt = async () => {
        const body = new FormData();
        body.set("body", "Hello {{firstname}}");
        body.set("from", "__messaging_service__");
        body.set("contact_id", String(retainedId));
        const request = new Request(
          `${baseUrl}/workspaces/${workspace}/chats/+14165550123`,
          { method: "POST", headers: { Cookie: actor("member").cookie }, body },
        );
        const args = {
          request,
          url: new URL(request.url),
          params: { id: workspace, contact_number: "+14165550123" },
          context: new RouterContextProvider(),
        };
        return asRouteResponse(middleware(args, async () => chatAction(args)));
      };
      try {
        expect((await attempt()).status).toBe(400);
        expect(send).not.toHaveBeenCalled();
        expect((await post(await confirmation())).status).toBe(303);
        expect((await attempt()).status).toBe(200);
        expect(send).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({
            body: "Hello Ada",
            contact_id: String(retainedId),
            workspace,
            to: "+14165550123",
            user: expect.objectContaining({ id: actor("member").id }),
          }),
        );
        await sql`update contact set opt_out = true where id = ${retainedId}`;
        expect((await attempt()).status).toBe(403);
        expect(send).toHaveBeenCalledOnce();
      } finally {
        send.mockRestore();
        config.mockRestore();
      }
    });

    test("an ordinary contact edit still persists only the selected profile", async () => {
      expect((await post({ firstname: "Edited Ada" })).status).toBe(200);
      const saved = await contacts();
      expect(saved).toHaveLength(2);
      expect(
        saved.find((row) => Number(row.id) === retainedId)?.firstname,
      ).toBe("Edited Ada");
      expect(
        saved.find((row) => Number(row.id) === duplicateId)?.firstname,
      ).toBe("Ada imported");
    });

    test("a caller cannot begin a merge or change any profile", async () => {
      const before = await contacts();
      expect(
        (
          await post(
            {
              intent: "preview-contact-merge",
              merge_contact_ids: JSON.stringify([retainedId, duplicateId]),
            },
            "caller",
          )
        ).status,
      ).toBe(403);
      expect(await contacts()).toEqual(before);
    });

    test("a member cannot include a foreign contact in the review", async () => {
      const before = await contacts();
      const response = await post({
        intent: "preview-contact-merge",
        merge_contact_ids: JSON.stringify([retainedId, foreignId]),
      });
      expect(response.status).toBe(404);
      expect(await contacts()).toEqual(before);
    });

    test("a non-member is returned to the workspace picker before the contact action", async () => {
      const before = await contacts();
      const response = await post(
        {
          intent: "preview-contact-merge",
          merge_contact_ids: JSON.stringify([retainedId, foreignId]),
        },
        "outsider",
      );
      // The product layout's RBAC-17 contract uses a non-disclosing redirect.
      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe("/workspaces");
      expect(await contacts()).toEqual(before);
    });
  },
);
