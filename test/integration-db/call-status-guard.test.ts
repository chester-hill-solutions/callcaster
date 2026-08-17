import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";

/**
 * The guarded status writes, exercised against a REAL database (#1289).
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
vi.mock("@/lib/workspace-events.server", () => ({
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

suite("guarded status writes against a real database (#1289)", () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let sqlClient: any;
  let updateCallBySid: any;
  let claimTerminalCallStatus: any;
  let updateMessageBySid: any;
  /* eslint-enable @typescript-eslint/no-explicit-any */

  beforeEach(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    const postgres = (await import("postgres")).default;
    sqlClient ??= postgres(DATABASE_URL as string, { max: 1 });
    ({ updateCallBySid, claimTerminalCallStatus } = await import(
      "@/lib/telephony-db.server"
    ));
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

  test("updateMessageBySid moves an open message to a terminal status on the enum column", async () => {
    const row = await updateMessageBySid(WORKSPACE_ID, MESSAGE_SID, {
      status: "delivered",
    });
    expect(row?.status).toBe("delivered");
  });
});
