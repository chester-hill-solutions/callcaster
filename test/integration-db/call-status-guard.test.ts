import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";

/**
 * The guarded status writes, exercised against a REAL database.
 *
 * `call.status` and `message.status` are Postgres ENUMs in every real
 * database lineage, and `lower(<enum>)` does not exist — the un-cast
 * `LOWER(${callTable.status})` guards in `updateCallBySid`,
 * `claimTerminalCallStatus`, and `updateMessageBySid` therefore THREW on
 * every status-bearing write instead of guarding. Every Twilio status
 * callback and every open-sync repair failed, so call rows accumulated in
 * 'queued' forever (19 of 50 rows on the dev environment when found).
 *
 * The unit tier mocks the db client and can never see a type-resolution
 * error; this real-Postgres tier is the only place the guards' SQL actually
 * runs. If someone later "simplifies" the `::text` casts away, these go red.
 */

// The realtime side channel is non-fatal in production and covered elsewhere;
// stubbing keeps this suite to one subject (the guarded UPDATE statements).
vi.mock("@/lib/workspace-events.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/workspace-events.server")>()),
  emitQueueEvent: vi.fn(async () => undefined),
  emitPostgresChangeEvent: vi.fn(async () => undefined),
  emitChatMessageEvent: vi.fn(async () => undefined),
}));

const DATABASE_URL = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;

if (!DATABASE_URL) {
  process.stderr.write(
    [
      "",
      "!".repeat(72),
      "!! integration-db SKIPPED: no INTEGRATION_DB_URL / DATABASE_URL set.",
      "!".repeat(72),
      "",
    ].join("\n"),
  );
}

const suite = DATABASE_URL ? describe : describe.skip;

const WORKSPACE_ID = "11111111-2222-4333-8444-555555555555";
const CALL_SID = "CAintegration_status_guard_01";
const MESSAGE_SID = "SMintegration_status_guard_01";
const CAMPAIGN_ID = 1889001;
const CONTACT_ID = 1889001;
const OUTREACH_ATTEMPT_ID = 1889001;

suite("guarded status writes against a real database (#1289)", () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let sqlClient: any;
  let updateCallBySid: any;
  let claimTerminalCallStatus: any;
  let claimTerminalOutreachDisposition: any;
  let updateMessageBySid: any;
  /* eslint-enable @typescript-eslint/no-explicit-any */

  async function deleteOutreachClaimFixture() {
    await sqlClient`delete from outreach_attempt where id = ${OUTREACH_ATTEMPT_ID}`;
    await sqlClient`delete from campaign where id = ${CAMPAIGN_ID}`;
    await sqlClient`delete from contact where id = ${CONTACT_ID}`;
  }

  async function insertOutreachClaimFixture() {
    await deleteOutreachClaimFixture();
    await sqlClient`
      insert into campaign (
        id, created_at, dial_ratio, group_household_queue,
        next_queue_order, title, workspace
      ) values (
        ${CAMPAIGN_ID}, ${new Date().toISOString()}, 1, false,
        1, 'Status Guard Integration Campaign', ${WORKSPACE_ID}
      )
    `;
    await sqlClient`
      insert into contact (id, created_at, workspace)
      values (${CONTACT_ID}, ${new Date().toISOString()}, ${WORKSPACE_ID})
    `;
    await sqlClient`
      insert into outreach_attempt (
        id, campaign_id, contact_id, created_at, disposition, result, workspace
      ) values (
        ${OUTREACH_ATTEMPT_ID}, ${CAMPAIGN_ID}, ${CONTACT_ID}, ${new Date().toISOString()},
        'in-progress', ${sqlClient.json({})}, ${WORKSPACE_ID}
      )
    `;
  }

  beforeEach(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    const postgres = (await import("postgres")).default;
    sqlClient ??= postgres(DATABASE_URL as string, { max: 1 });
    ({
      updateCallBySid,
      claimTerminalCallStatus,
      claimTerminalOutreachDisposition,
    } = await import("@/lib/telephony-db.server"));
    ({ updateMessageBySid } = await import("@/lib/message-db.server"));

    await sqlClient`
      insert into workspace (id, name, credits)
      values (${WORKSPACE_ID}, 'Status Guard Integration Workspace', 0)
      on conflict (id) do nothing
    `;
    await sqlClient`delete from call where sid = ${CALL_SID}`;
    await sqlClient`delete from message where sid = ${MESSAGE_SID}`;
    await sqlClient`
      insert into call (sid, workspace, status, date_created)
      values (${CALL_SID}, ${WORKSPACE_ID}, 'queued', now())
    `;
    await sqlClient`
      insert into message (sid, workspace, status, date_created)
      values (${MESSAGE_SID}, ${WORKSPACE_ID}, 'queued', now())
    `;
  });

  afterAll(async () => {
    if (!sqlClient) return;
    await sqlClient`delete from call where sid = ${CALL_SID}`;
    await sqlClient`delete from message where sid = ${MESSAGE_SID}`;
    await deleteOutreachClaimFixture();
    await sqlClient`delete from workspace where id = ${WORKSPACE_ID}`;
    await sqlClient.end();
  });

  test("updateCallBySid moves an open call to a terminal status on the enum column", async () => {
    const row = await updateCallBySid(WORKSPACE_ID, CALL_SID, {
      status: "completed",
      duration: "42",
    });
    expect(row?.status).toBe("completed");

    const [check] = await sqlClient`
      select status::text as status from call where sid = ${CALL_SID}
    `;
    expect(check.status).toBe("completed");
  });

  test("updateCallBySid keeps a terminal status when a non-terminal update races in late", async () => {
    await updateCallBySid(WORKSPACE_ID, CALL_SID, { status: "completed" });
    const row = await updateCallBySid(WORKSPACE_ID, CALL_SID, {
      status: "ringing",
    });
    expect(row?.status).toBe("completed");
  });

  test("claimTerminalCallStatus claims once and refuses the duplicate delivery", async () => {
    const first = await claimTerminalCallStatus(
      WORKSPACE_ID,
      CALL_SID,
      "completed",
    );
    const duplicate = await claimTerminalCallStatus(
      WORKSPACE_ID,
      CALL_SID,
      "completed",
    );
    expect(first).toBe(true);
    expect(duplicate).toBe(false);
  });

  test("claimTerminalOutreachDisposition has one winner across concurrent deliveries", async () => {
    await insertOutreachClaimFixture();
    try {
      const claims = await Promise.all([
        claimTerminalOutreachDisposition(
          WORKSPACE_ID,
          OUTREACH_ATTEMPT_ID,
          "no-answer",
        ),
        claimTerminalOutreachDisposition(
          WORKSPACE_ID,
          OUTREACH_ATTEMPT_ID,
          "no-answer",
        ),
      ]);

      expect(claims.filter(Boolean)).toHaveLength(1);
      const [persisted] = await sqlClient`
        select disposition from outreach_attempt where id = ${OUTREACH_ATTEMPT_ID}
      `;
      expect(persisted.disposition).toBe("no-answer");
      await expect(
        claimTerminalOutreachDisposition(
          WORKSPACE_ID,
          OUTREACH_ATTEMPT_ID,
          "no-answer",
        ),
      ).resolves.toBeNull();
    } finally {
      await deleteOutreachClaimFixture();
    }
  });

  test("updateMessageBySid moves an open message to a terminal status on the enum column", async () => {
    const row = await updateMessageBySid(WORKSPACE_ID, MESSAGE_SID, {
      status: "delivered",
    });
    expect(row?.status).toBe("delivered");
  });

  // ── #2049: the provider send-time guard ─────────────────────────────────
  //
  // Same class of bug as the status guard above, same reason it needs a real
  // database: `date_sent` is a timestamptz column that the schema models as
  // text, and the guard is a SQL fragment the mocked unit tier never
  // executes.
  //
  // The rule is first-write-wins, NOT terminal-wins. A send time, once the
  // provider has reported it, is the historical fact of when the carrier took
  // the message. Re-writing it from a later sweep would silently rewrite
  // history, which is the opposite of what an audit field is for.

  test("updateMessageBySid writes a send time onto a row that has none (#2049)", async () => {
    const sentAt = "2026-05-01T00:05:00.000Z";
    await updateMessageBySid(WORKSPACE_ID, MESSAGE_SID, {
      status: "delivered",
      date_sent: sentAt,
    });

    const [row] = await sqlClient`
      select date_sent from message where sid = ${MESSAGE_SID}
    `;
    expect(new Date(row.date_sent).toISOString()).toBe(sentAt);
  });

  test("updateMessageBySid never overwrites a send time the row already has (#2049)", async () => {
    const original = "2026-05-01T00:05:00.000Z";
    await updateMessageBySid(WORKSPACE_ID, MESSAGE_SID, {
      status: "delivered",
      date_sent: original,
    });
    // A later sweep, or a straggling callback, must not rewrite it.
    await updateMessageBySid(WORKSPACE_ID, MESSAGE_SID, {
      date_sent: "2026-05-01T09:00:00.000Z",
    });

    const [row] = await sqlClient`
      select date_sent from message where sid = ${MESSAGE_SID}
    `;
    expect(new Date(row.date_sent).toISOString()).toBe(original);
  });

  test("a later status write does not clear an existing send time (#2049)", async () => {
    const original = "2026-05-01T00:05:00.000Z";
    await updateMessageBySid(WORKSPACE_ID, MESSAGE_SID, {
      status: "delivered",
      date_sent: original,
    });
    // An update that says nothing about date_sent must leave it alone.
    await updateMessageBySid(WORKSPACE_ID, MESSAGE_SID, { status: "read" });

    const [row] = await sqlClient`
      select status::text as status, date_sent from message where sid = ${MESSAGE_SID}
    `;
    expect(row.status).toBe("read");
    expect(new Date(row.date_sent).toISOString()).toBe(original);
  });
});
