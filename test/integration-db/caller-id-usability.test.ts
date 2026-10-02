import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/db/schema";
import * as authSchema from "@/db/auth-schema";

/**
 * #2129 P0 — a caller-supplied `from` number was never checked for ownership.
 *
 * `from` reaches Twilio as the sending number, and nothing between the request
 * and the provider call asked whether the workspace owns it:
 *
 *   POST /api/sms              caller_id  → dispatchCampaignSmsBatch → … → from
 *   POST /api/chat_sms         caller_id  → sendMessage({ from })
 *   POST /workspaces/:id/chats from_number → parseChatSenderSelection → sendMessage
 *
 * `resolvePreDispatchGate` checked that a caller id was **present**
 * (`if (requiresCallerId && !callerIdForGate)`) and never that it was **owned**,
 * and `buildTwilioOutboundSmsCreateParams` put it straight into the provider
 * payload. `parseChatSenderSelection` returns its `rawFrom` verbatim.
 *
 * So any authenticated member of any workspace could send SMS appearing to come
 * from another tenant's number — spending the victim's A2P registration and
 * messaging consent without their knowledge.
 *
 * ## Why the integration tier
 *
 * The claim is about *which number reaches the provider*. A mocked
 * `workspace_number.findFirst` returns whatever the mock says, so a test could
 * assert "the helper was called" without proving any tenant boundary — and a
 * tenant boundary is the entire content of this defect. Two workspaces with
 * disjoint numbers are created here, and the assertion is on the number the send
 * was allowed to use.
 */

const DATABASE_URL = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;

if (!DATABASE_URL) {
  process.stderr.write(
    [
      "",
      "!".repeat(72),
      "!! integration-db SKIPPED: no INTEGRATION_DB_URL / DATABASE_URL set.",
      "!!",
      "!! test/integration-db/caller-id-usability.test.ts is the ONLY test that",
      "!! proves a workspace cannot send SMS from a number it does not own.",
      "!! Skipping it leaves the cross-tenant sender spoofing path UNVERIFIED.",
      "!".repeat(72),
      "",
    ].join("\n"),
  );
}

// Hoisted so `@/server/db` and the tenant client resolve this suite's connection.
const { clientRef } = vi.hoisted(() => ({ clientRef: { current: null as unknown } }));

vi.mock("@/server/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/db")>()),
  get db() {
    // The schema must be passed: `createTenantDb`'s read methods delegate to
    // Drizzle's *relational* API (`db.query.<table>`), and a schema-less
    // drizzle instance has no `query` at all — so `findFirst` would be undefined.
    return drizzle(clientRef.current as never, {
      schema: { ...schema, ...authSchema },
    });
  },
}));

vi.mock("@/lib/logger.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/logger.server")>()),
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const describeDb = DATABASE_URL ? describe : describe.skip;

const WS_A = "11111111-1111-4111-8111-111111111111";
const WS_B = "22222222-2222-4222-8222-222222222222";
const NUMBER_A = "+15550000001";
const NUMBER_B = "+15550000002";
const NUMBER_A_SUSPENDED = "+15550000003";

describeDb("caller id ownership (#2129 P0)", () => {
  let client: postgres.Sql;
  let resolveCallerIdUsability: typeof import("@/lib/caller-id-usability.server").resolveCallerIdUsability;

  beforeAll(async () => {
    client = postgres(DATABASE_URL as string, {
      max: 10,
      prepare: false,
      connect_timeout: 10,
      onnotice: () => {},
    });
    clientRef.current = client;

    ({ resolveCallerIdUsability } = await import("@/lib/caller-id-usability.server"));

    // Two workspaces with disjoint numbers, plus one suspended number on A so
    // the suspension rule has a row to bite on.
    await client`
      insert into public.workspace (id, name, credits, twilio_data, feature_flags, disabled)
      values
        (${WS_A}::uuid, 'Caller Id Scope A', 100, '{}'::jsonb, '{}'::jsonb, false),
        (${WS_B}::uuid, 'Caller Id Scope B', 100, '{}'::jsonb, '{}'::jsonb, false)
    `;

    await client`
      insert into public.workspace_number
        (workspace, phone_number, twilio_phone_number_sid, type, capabilities, suspended_at)
      values
        (${WS_A}::uuid, ${NUMBER_A}, 'SID-A', 'local', '{"sms": true}'::jsonb, null),
        (${WS_B}::uuid, ${NUMBER_B}, 'SID-B', 'local', '{"sms": true}'::jsonb, null),
        (${WS_A}::uuid, ${NUMBER_A_SUSPENDED}, 'SID-A-S', 'local', '{"sms": true}'::jsonb, now())
    `;
  }, 30_000);

  afterAll(async () => {
    if (!client) return;
    await client`delete from public.workspace where id in (${WS_A}::uuid, ${WS_B}::uuid)`;
    await client.end({ timeout: 5 });
  });

  describe("the fixture really does partition numbers between tenants", () => {
    test("each workspace owns exactly one of the two live numbers", async () => {
      // The precondition, asserted where the failure actually lives. Without it,
      // "workspace B was refused" could mean the numbers were never distinct.
      expect(await resolveCallerIdUsability(WS_A, NUMBER_A)).toEqual({ kind: "ok" });
      expect(await resolveCallerIdUsability(WS_B, NUMBER_B)).toEqual({ kind: "ok" });
      expect(await resolveCallerIdUsability(WS_A, NUMBER_B)).toEqual({
        kind: "not_owned",
        callerId: NUMBER_B,
      });
    });
  });

  describe("cross-tenant numbers are refused", () => {
    test("workspace B cannot send from workspace A's number", async () => {
      const outcome = await resolveCallerIdUsability(WS_B, NUMBER_A);
      expect(outcome.kind).toBe("not_owned");
    });

    test("workspace A cannot send from workspace B's number", async () => {
      const outcome = await resolveCallerIdUsability(WS_A, NUMBER_B);
      expect(outcome.kind).toBe("not_owned");
    });

    test("the refusal names the number so the caller can be told which one", async () => {
      const outcome = await resolveCallerIdUsability(WS_A, NUMBER_B);
      expect(outcome).toEqual({ kind: "not_owned", callerId: NUMBER_B });
    });
  });

  describe("numbers no workspace owns are refused", () => {
    test("an arbitrary number is not sendable by anyone", async () => {
      // Not "unknown to the database" being an error by accident — the same
      // verdict as a *known* foreign number, which is the case that matters.
      expect(await resolveCallerIdUsability(WS_A, "+19999999999")).toEqual({
        kind: "not_owned",
        callerId: "+19999999999",
      });
    });

    test("formatting variants do not bypass the lookup", async () => {
      // Whitespace is trimmed before matching, so a padded value resolves to the
      // same verdict rather than slipping past.
      expect(await resolveCallerIdUsability(WS_A, `  ${NUMBER_B}  `)).toEqual({
        kind: "not_owned",
        callerId: NUMBER_B,
      });
    });
  });

  describe("own numbers are accepted", () => {
    test("workspace A may send from its own number", async () => {
      expect(await resolveCallerIdUsability(WS_A, NUMBER_A)).toEqual({ kind: "ok" });
    });

    test("whitespace around an owned number is trimmed", async () => {
      expect(await resolveCallerIdUsability(WS_A, ` ${NUMBER_A} `)).toEqual({ kind: "ok" });
    });
  });

  describe("no caller id is not an error", () => {
    test.each([["", "empty"], ["   ", "whitespace"], [null, "null"], [undefined, "undefined"]])(
      "%s is reported as not_provided",
      async (value) => {
        // A Messaging Service supplies the sender on these paths, so an absent
        // caller id is normal. Only ownership is answered here.
        expect(await resolveCallerIdUsability(WS_A, value)).toEqual({ kind: "not_provided" });
      },
    );
  });

  describe("suspended numbers", () => {
    test("a suspended number is not selectable as a sender", async () => {
      // Recorded deliberately: suspension exists to block *outbound* use of a
      // number, and this is the outbound gate. A reader would not infer that from
      // a function called `resolveCallerIdUsability`.
      expect(await resolveCallerIdUsability(WS_A, NUMBER_A_SUSPENDED)).toEqual({
        kind: "suspended",
        callerId: NUMBER_A_SUSPENDED,
      });
    });
  });
});