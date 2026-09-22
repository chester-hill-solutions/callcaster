import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

/**
 * The #1728 completion gate, exercised against a REAL database.
 *
 * The unit tier mocks the db client, so the plpgsql body never runs there;
 * only a real Postgres can prove try_complete_campaign_if_drained keeps a
 * campaign 'running' while one of its calls is still in flight (status NULL
 * between dial and the first status callback, then ringing/in-progress) and
 * completes it once the last call settles.
 *
 * Requires the migrations to be applied (client db push / bootstrap) —
 * 20260922120000_gate_campaign_completion_on_settled_calls.sql must be live
 * or the last function def is the pre-#1728 one.
 */
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

const WORKSPACE_ID = "11111111-2222-4333-8444-666666666666";
const CALL_SID = "CAintegration_completion_gate_01";
const CAMPAIGN_ID = 1728001;
const OUTREACH_ATTEMPT_ID = 1728001;
const CONTACT_ID = 1728001;

suite("campaign completion gate against a real database (#1728)", () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let sqlClient: any;
  let updateCallBySid: any;
  /* eslint-enable @typescript-eslint/no-explicit-any */

  async function cleanup() {
    await sqlClient`delete from call where sid = ${CALL_SID}`;
    await sqlClient`delete from outreach_attempt where id = ${OUTREACH_ATTEMPT_ID}`;
    await sqlClient`delete from contact where id = ${CONTACT_ID}`;
    await sqlClient`delete from campaign where id = ${CAMPAIGN_ID}`;
  }

  async function insertCall(status: string | null) {
    // status is inlined as a SQL literal (fixed constant, never a parameter):
    // call.status is a Postgres ENUM and parameterized text does not coerce.
    await sqlClient.unsafe(
      `insert into call (sid, workspace, campaign_id, outreach_attempt_id, status, date_created, is_last)
       values ('${CALL_SID}', '${WORKSPACE_ID}', ${CAMPAIGN_ID}, ${OUTREACH_ATTEMPT_ID}, ${
         status === null ? "null" : `'${status}'`
       }, now(), true)`,
    );
  }

  async function settleCall(status: string) {
    const row = await updateCallBySid(WORKSPACE_ID, CALL_SID, { status });
    expect(row?.status).toBe(status);
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    const postgres = (await import("postgres")).default;
    sqlClient = postgres(DATABASE_URL as string, { max: 1 });
    ({ updateCallBySid } = await import("@/lib/telephony-db.server"));
    await sqlClient`
      insert into workspace (id, name, credits)
      values (${WORKSPACE_ID}, 'Completion Gate Integration Workspace', 0)
      on conflict (id) do nothing
    `;
  });

  beforeEach(async () => {
    await cleanup();
    await sqlClient`
      insert into workspace (id, name, credits)
      values (${WORKSPACE_ID}, 'Completion Gate Integration Workspace', 0)
      on conflict (id) do nothing
    `;
    await sqlClient`
      insert into campaign (
        id, created_at, dial_ratio, group_household_queue,
        next_queue_order, title, workspace, status
      ) values (
        ${CAMPAIGN_ID}, ${new Date().toISOString()}, 1, false,
        1, 'Completion Gate Integration Campaign', ${WORKSPACE_ID}, 'running'
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
  });

  afterAll(async () => {
    if (!sqlClient) return;
    await cleanup();
    await sqlClient.end();
  });

  async function completeIfDrained(): Promise<boolean> {
    const [row] = await sqlClient`
      select try_complete_campaign_if_drained(${CAMPAIGN_ID}) as completed
    `;
    return row.completed;
  }

  async function campaignStatus(): Promise<string> {
    const [row] = await sqlClient`
      select status::text as status from campaign where id = ${CAMPAIGN_ID}
    `;
    return row.status;
  }

  test("drains to complete when there are no calls (SMS-like campaign)", async () => {
    expect(await completeIfDrained()).toBe(true);
    expect(await campaignStatus()).toBe("complete");
  });

  test("stays running while a call is in flight, then completes when it settles", async () => {
    await insertCall(null);

    // NULL status = dialed but no status callback yet — must count as unsettled.
    expect(await completeIfDrained()).toBe(false);
    expect(await campaignStatus()).toBe("running");

    // A ringing call is also unsettled.
    await settleCall("ringing");
    expect(await completeIfDrained()).toBe(false);
    expect(await campaignStatus()).toBe("running");

    // The terminal callback settles the last call — the gate opens.
    await settleCall("completed");
    expect(await completeIfDrained()).toBe(true);
    expect(await campaignStatus()).toBe("complete");

    // Re-running is idempotent (status no longer in running/waiting).
    expect(await completeIfDrained()).toBe(true);
  });

  test.each(["busy", "no-answer", "failed", "canceled"])(
    "%s also settles a call and lets the campaign drain",
    async (terminal) => {
      await insertCall("in-progress");
      await settleCall(terminal);
      expect(await completeIfDrained()).toBe(true);
      expect(await campaignStatus()).toBe("complete");
    },
  );
});
