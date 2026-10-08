import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

/**
 * The #1728 and #2048 completion gates, exercised against a REAL database.
 *
 * The unit tier mocks the db client, so the plpgsql body never runs there;
 * only a real Postgres can prove try_complete_campaign_if_drained keeps a
 * campaign 'running' while one of its calls is still in flight (status NULL
 * between dial and the first status callback, then ringing/in-progress) and
 * while one of its messages is still unsettled at the provider, and completes
 * it once the last one settles.
 *
 * Requires the migrations to be applied (client db push / bootstrap) —
 * 20260922120000_gate_campaign_completion_on_settled_calls.sql and
 * 20260925120000_gate_campaign_completion_on_settled_messages.sql must be live
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
const OTHER_CAMPAIGN_ID = 1728002;
const OUTREACH_ATTEMPT_ID = 1728001;
const CONTACT_ID = 1728001;
const MESSAGE_SID_PREFIX = "SMintegration_completion_gate_";

suite("campaign completion gate against a real database (#1728, #2048)", () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let sqlClient: any;
  let updateCallBySid: any;
  /* eslint-enable @typescript-eslint/no-explicit-any */

  async function cleanup() {
    await sqlClient`delete from call where sid = ${CALL_SID}`;
    await sqlClient`delete from message where sid like ${`${MESSAGE_SID_PREFIX}%`}`;
    await sqlClient`delete from outreach_attempt where id = ${OUTREACH_ATTEMPT_ID}`;
    await sqlClient`delete from contact where id = ${CONTACT_ID}`;
    await sqlClient`delete from campaign where id in (${CAMPAIGN_ID}, ${OTHER_CAMPAIGN_ID})`;
  }

  let messageCounter = 0;

  async function insertMessage(input: {
    status: string | null;
    campaignId?: number | null;
    direction?: string;
  }) {
    messageCounter += 1;
    const sid = `${MESSAGE_SID_PREFIX}${messageCounter}`;
    // message.status is a Postgres ENUM and parameterized text does not coerce,
    // same reason as insertCall. campaign_id is bigint.
    await sqlClient.unsafe(
      `insert into message (sid, workspace, campaign_id, direction, status, date_created)
       values ('${sid}', '${WORKSPACE_ID}', ${
         input.campaignId === undefined ? CAMPAIGN_ID : input.campaignId
       }, '${input.direction ?? "outbound-api"}', ${
         input.status === null ? "null" : `'${input.status}'`
       }, now())`,
    );
    return sid;
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

  // ── #2048: message settlement ────────────────────────────────────────────
  //
  // Production shape, measured on the Eric Lombardi blast (2026-09-24): the
  // campaign read `complete` at 6:29pm EDT while Twilio still held 5,382
  // messages and released them between 11:59pm and 1:46am EDT. The dequeue that
  // freed the local queue only means "handed to Twilio", so the gate must also
  // wait for provider settlement.

  test.each(["accepted", "scheduled", "queued", "sending", "sent"])(
    "stays running while a message is %s",
    async (openStatus) => {
      await insertMessage({ status: openStatus });
      expect(await completeIfDrained()).toBe(false);
      expect(await campaignStatus()).toBe("running");
    },
  );

  test("stays running while a message has no status yet", async () => {
    // The intent row exists but the provider has not reported a state. This is
    // the exact hole that let the Lombardi campaign complete early.
    await insertMessage({ status: null });
    expect(await completeIfDrained()).toBe(false);
    expect(await campaignStatus()).toBe("running");
  });

  test.each(["delivered", "read", "canceled", "failed", "undelivered"])(
    "%s settles a message and lets the campaign drain",
    async (settled) => {
      await insertMessage({ status: settled });
      expect(await completeIfDrained()).toBe(true);
      expect(await campaignStatus()).toBe("complete");
    },
  );

  test("read and canceled settle a message even though they are not billable", async () => {
    // The billing-terminal set is delivered/failed/undelivered. If the gate had
    // reused it, a canceled message (STOP, or campaign end-date cancellation)
    // would hold the campaign open forever.
    await insertMessage({ status: "canceled" });
    await insertMessage({ status: "read" });
    expect(await completeIfDrained()).toBe(true);
    expect(await campaignStatus()).toBe("complete");
  });

  test("an unsettled message for another campaign does not block this one", async () => {
    await sqlClient`
      insert into campaign (
        id, created_at, dial_ratio, group_household_queue,
        next_queue_order, title, workspace, status
      ) values (
        ${OTHER_CAMPAIGN_ID}, ${new Date().toISOString()}, 1, false,
        1, 'Other Campaign', ${WORKSPACE_ID}, 'running'
      )
    `;
    await insertMessage({ status: "queued", campaignId: OTHER_CAMPAIGN_ID });
    expect(await completeIfDrained()).toBe(true);
    expect(await campaignStatus()).toBe("complete");
  });

  test("an inbound reply does not block this campaign", async () => {
    // The inbound write path leaves message.campaign_id NULL (#2046), so a
    // reply can never hold a campaign open.
    await insertMessage({ status: "received", campaignId: null, direction: "inbound" });
    expect(await completeIfDrained()).toBe(true);
    expect(await campaignStatus()).toBe("complete");
  });

  test("pending queue work still short-circuits before the message gate", async () => {
    // Inserting directly avoids the claim RPC, but the invariant is the point:
    // the queue check runs first, so an empty-looking message set cannot mask
    // real pending work.
    await insertMessage({ status: "delivered" });
    await sqlClient`
      insert into campaign_queue (
        id, created_at, contact_id, campaign_id, workspace,
        attempts, attempt_count, queue_state
      ) values (
        1728010, ${new Date().toISOString()}, ${CONTACT_ID}, ${CAMPAIGN_ID},
        ${WORKSPACE_ID}, 0, 0, 'queued'
      )
    `;
    try {
      expect(await completeIfDrained()).toBe(false);
      expect(await campaignStatus()).toBe("running");
    } finally {
      await sqlClient`delete from campaign_queue where id = 1728010`;
    }
  });

  // ── #2048 recovery sweep ─────────────────────────────────────────────────
  //
  // These are the regressions from the first version of the sweep, which
  // re-implemented the unsettled filter in Drizzle. Both were verified against
  // a real database before they were fixed.
  //
  //   1. `status NOT IN (...)` is NULL when status is NULL, so a bare
  //      notInArray dropped every NULL-status row. The gate blocks on NULL
  //      (it coalesces to ''), so a campaign whose messages had no provider
  //      callback was blocked forever and the sweep could never unblock it.
  //   2. The limit applied to message ROWS with no ORDER BY, so a campaign
  //      holding 23,504 unsettled rows consumed the whole budget and starved
  //      every other campaign, non-deterministically.

  async function unsettledCampaignIds(limit = 200): Promise<number[]> {
    const rows = await sqlClient<{ campaign_id: number }[]>`
      select campaign_id
      from campaign_ids_with_unsettled_messages(
        ${WORKSPACE_ID}::uuid, ${limit}
      )
    `;
    return rows.map((row) => Number(row.campaign_id));
  }

  test("the sweep returns a campaign whose message has no status yet (#2048)", async () => {
    // The exact regression. The gate blocks this campaign and the sweep must be
    // able to see it, or it is stranded at `running` forever.
    await insertMessage({ status: null });

    expect(await completeIfDrained()).toBe(false);
    expect(await unsettledCampaignIds()).toContain(CAMPAIGN_ID);
  });

  test("the sweep returns campaigns for every unsettled status (#2048)", async () => {
    for (const openStatus of ["accepted", "queued", "sending", "sent"]) {
      await insertMessage({ status: openStatus });
    }

    expect(await unsettledCampaignIds()).toContain(CAMPAIGN_ID);
  });

  test("the sweep omits a campaign whose messages have all settled (#2048)", async () => {
    for (const settled of ["delivered", "read", "canceled", "failed", "undelivered"]) {
      await insertMessage({ status: settled });
    }

    // The gate is open, so the sweep has no reason to re-check it.
    expect(await completeIfDrained()).toBe(true);
    expect(await unsettledCampaignIds()).not.toContain(CAMPAIGN_ID);
  });

  test("the sweep omits an inbound reply with no campaign (#2048)", async () => {
    await insertMessage({ status: "received", campaignId: null, direction: "inbound" });

    expect(await unsettledCampaignIds()).not.toContain(null as never);
  });

  test("one campaign with many unsettled rows does not hide another (#2048)", async () => {
    // Behavioural smoke test for the second regression. The RELIABLE guard is
    // the contract test's `group by` / `order by` assertions, which fail on
    // every mutation of this SQL; this test only proves the behaviour holds
    // against a live planner.
    //
    // Do not treat it as a kill-check. It was measured as plan-dependent: with
    // the row-level limit reintroduced, this still passed at 5,000 and at
    // 25,000 rows, because the planner chose the
    // idx_message_workspace_campaign_date index scan whose campaign_id
    // ordering happened to put the small campaign inside the 200-row window.
    // A standalone probe with different physical row order did starve it. So
    // this test can pass with the bug, and the contract test is what must fail.
    await sqlClient`
      insert into campaign (
        id, created_at, dial_ratio, group_household_queue,
        next_queue_order, title, workspace, status, type
      ) values (
        ${OTHER_CAMPAIGN_ID}, ${new Date().toISOString()}, 1, false,
        1, 'Bulk Unsettled Campaign', ${WORKSPACE_ID}, 'running', 'message'
      )
    `;
    // A bulk of unsettled rows on the other campaign, one on this one. The
    // count is deliberately far above the 200-campaign cap. The SIDs must
    // carry MESSAGE_SID_PREFIX so cleanup() in beforeEach/afterAll removes
    // them; bulk rows that survive leak into the next run and collide on the
    // message primary key.
    await sqlClient`
      insert into message (sid, workspace, campaign_id, direction, status, date_created)
      select ${MESSAGE_SID_PREFIX} || md5(g::text), ${WORKSPACE_ID}::uuid,
             ${OTHER_CAMPAIGN_ID}, 'outbound-api', 'sent', now()
      from generate_series(1, 25000) g
    `;
    await insertMessage({ status: "sent" });

    const ids = await unsettledCampaignIds();
    expect(ids).toContain(CAMPAIGN_ID);
    expect(ids).toContain(OTHER_CAMPAIGN_ID);
  });

  test("the sweep caps the number of campaigns it returns (#2048)", async () => {
    await insertMessage({ status: "sent" });

    expect(await unsettledCampaignIds(1)).toHaveLength(1);
  });

  test("a blast-scale campaign completes once every message has settled (#2048)", async () => {
    // The Lombardi shape: thousands of settled messages alongside thousands of
    // failures. Only the unsettled ones must hold the gate.
    const settled = 2_500;
    const failedCount = 2_200;
    const rows = [];
    for (let i = 0; i < settled + failedCount; i += 1) {
      messageCounter += 1;
      rows.push([
        `${MESSAGE_SID_PREFIX}${messageCounter}`,
        WORKSPACE_ID,
        CAMPAIGN_ID,
        i < failedCount ? "failed" : "delivered",
      ]);
    }
    for (const [sid, , , status] of rows) {
      await sqlClient.unsafe(
        `insert into message (sid, workspace, campaign_id, direction, status, date_created)
         values ('${sid}', '${WORKSPACE_ID}', ${CAMPAIGN_ID}, 'outbound-api', '${status}', now())`,
      );
    }

    expect(await completeIfDrained()).toBe(true);
    expect(await campaignStatus()).toBe("complete");
  });
});
