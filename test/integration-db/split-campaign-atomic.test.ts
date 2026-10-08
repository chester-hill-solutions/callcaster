import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

/**
 * #2154: `splitMessageCampaign` cloned the campaign, distributed the queued
 * contacts across the clones, and dequeued them from the source in three
 * separate steps. A failure in the middle left a partial split: some contacts
 * cloned into new campaigns, some still on the original, dequeue not done — so
 * the same contact could be dialled twice.
 *
 * This is the **integration-db** tier because the whole claim is about
 * rollback. A unit test with a mocked client cannot observe that a transaction
 * rolled back, and cannot distinguish "wrapped in a transaction" from "wrote a
 * comment saying it is transactional". The other tier mocks the db client
 * wholesale, so nothing there would notice if the `withAppCurrentUser` call
 * were deleted — which is why the kill-check below deletes it.
 *
 * Run with:
 *   docker compose -f docker-compose.dev.yml up -d postgres
 *   DATABASE_URL=... node scripts/e2e/bootstrap-compose-db.mjs
 *   DATABASE_URL=... npm run test:integration-db
 */

const DATABASE_URL = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;

if (!DATABASE_URL) {
  process.stderr.write(
    [
      "",
      "!".repeat(72),
      "!! integration-db SKIPPED: no INTEGRATION_DB_URL / DATABASE_URL set.",
      "!!",
      "!! The atomicity of splitMessageCampaign (#2154) is UNGUARDED in this run.",
      "!! Nothing else can check it: the unit tier mocks the db client, so",
      "!! removing the transaction there would still pass.",
      "!!",
      "!".repeat(72),
      "",
    ].join("\n"),
  );
}

const describeDb = DATABASE_URL ? describe : describe.skip;

const WORKSPACE = "3b6f0a52-6f5e-4b2d-9d55-0000000000a1";
const OTHER_WORKSPACE = "3b6f0a52-6f5e-4b2d-9d55-0000000000b2";
const USER_ID = "3b6f0a52-6f5e-4b2d-9d55-0000000000c3";
const SEGMENT_COUNT = 3;
const CONTACT_COUNT = 7;

const mocks = vi.hoisted(() => ({
  // Every workspace-event publish is captured rather than sent, so the test can
  // assert *when* it happens. An SSE emit issued before commit tells a
  // subscriber about rows a rollback erases.
  published: [] as string[],
}));

vi.mock("@/lib/workspace-events.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/workspace-events.server")>()),
  emitQueueEvent: async (workspaceId: string, kind: string) => {
    mocks.published.push(`${kind}:${workspaceId}`);
  },
  emitQueueEventById: async (workspaceId: string, kind: string) => {
    mocks.published.push(`${kind}:${workspaceId}`);
  },
}));

type Sql = ReturnType<typeof postgres>;

describeDb("splitMessageCampaign is atomic (#2154)", () => {
  let sql: Sql;

  beforeAll(async () => {
    if (!DATABASE_URL) throw new Error("unreachable: describeDb is skipped without one");
    sql = postgres(DATABASE_URL, { max: 4 });
    await sql`select 1`;
  });

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
  });

  beforeEach(async () => {
    mocks.published.length = 0;
    await sql`delete from campaign_queue where workspace in (${WORKSPACE}, ${OTHER_WORKSPACE})`;
    await sql`delete from contact where workspace = ${WORKSPACE}`;
    await sql`delete from "user" where id = ${USER_ID}`;
    await sql`delete from campaign where workspace = ${WORKSPACE}`;
    // `dequeued_by` has a real foreign key to `user`, so the operator the split
    // attributes the move to must exist.
    await sql`
      insert into "user" (id, username, created_at)
      values (${USER_ID}, 'split-agent@example.com', now())
      on conflict (id) do nothing
    `;
    // Only the columns the table actually has: id, name, twilio_data, disabled,
    // feature_flags and credits are NOT NULL; the rest default.
    await sql`
      insert into workspace (id, name, twilio_data, disabled, feature_flags, credits, created_at)
      values (${WORKSPACE}, 'Split Test', '{}'::jsonb, false, '{}'::jsonb, 1000, now())
      on conflict (id) do nothing
    `;
  });

  /** A message campaign with `count` queued contacts. */
  async function seedCampaign(count: number, title = "Split Source") {
    // Only the NOT NULL columns, named from the live schema: `is_active` does
    // not exist on this table, and the booleans that do (`allow_bulk_local_send`,
    // `is_sample`, `voicemail_drop_enabled`) plus `group_household_queue` are
    // required.
    const [campaign] = await sql`
      insert into campaign (workspace, title, type, status, created_at,
                            group_household_queue, next_queue_order, dial_ratio,
                            allow_bulk_local_send, is_sample, voicemail_drop_enabled)
      values (${WORKSPACE}, ${title}, 'message', 'draft', now(), false, 0, 1,
              false, false, false)
      returning id
    `;
    const ids: number[] = [];
    const contactIds: number[] = [];
    for (let i = 0; i < count; i++) {
      // campaign_queue has a real foreign key to contact, so the contacts have
      // to exist. `id` is supplied explicitly to keep the assertions readable.
      const contactId = 900_000 + i;
      contactIds.push(contactId);
      await sql`
        insert into contact (id, workspace, created_at, other_data, firstname)
        values (${contactId}, ${WORKSPACE}, now(), '{}'::jsonb, ${`Contact ${i}`})
        on conflict (id) do nothing
      `;
      const [row] = await sql`
        insert into campaign_queue (workspace, campaign_id, contact_id, attempts,
                                    attempt_count, queue_state, created_at)
        values (${WORKSPACE}, ${campaign.id}, ${contactId}, 0, 0, 'queued', now())
        returning id
      `;
      ids.push(Number(row.id));
    }
    return { campaignId: Number(campaign.id), queueIds: ids, contactIds };
  }

  /**
   * Make the dequeue phase fail for real, on the Nth dequeue of this reason.
   *
   * A `vi.spyOn` cannot do this: `splitMessageCampaign` holds a direct ESM
   * binding to `dequeueQueueEntry`, so replacing the module namespace does not
   * intercept the call and the test passes without ever failing. A trigger
   * raises inside the real transaction, which is the only thing that actually
   * exercises a rollback.
   *
   * The counter lives in a table inside the same transaction, so it is rolled
   * back with everything else — the count is per-attempt, not global.
   */
  async function failNthDequeue(nth: number) {
    await sql`
      create table if not exists t2154_counter (v integer)
    `;
    await sql`delete from t2154_counter`;
    // Built as text and run with `unsafe` on purpose. postgres.js binds every
    // `$n` it finds, including ones inside a dollar-quoted function body, and a
    // bound parameter in DDL position has no inferable type. The string is built
    // here from a single integer, so there is no untrusted input in it.
    const ddl = `
      create table if not exists t2154_counter (v integer);
      create or replace function t2154_fail_nth_dequeue() returns trigger as $body$
      declare seen integer;
      begin
        if new.dequeued_reason = 'Moved to parallel split segment' then
          insert into t2154_counter (v) values (1);
          select count(*) into seen from t2154_counter;
          if seen >= ${Number(nth)} then
            raise exception 'simulated dequeue failure';
          end if;
        end if;
        return new;
      end
      $body$ language plpgsql;
      drop trigger if exists t2154_fail_nth on campaign_queue;
      create trigger t2154_fail_nth
        before update on campaign_queue
        for each row execute function t2154_fail_nth_dequeue();
    `;
    await sql.unsafe(ddl);
  }

  async function removeDequeueFailure() {
    await sql`drop trigger if exists t2154_fail_nth on campaign_queue`;
    await sql`drop function if exists t2154_fail_nth_dequeue()`;
    await sql`drop table if exists t2154_counter`;
  }

  async function queueRows(campaignId: number) {
    return sql`
      select id, contact_id, dequeued_at, dequeued_reason
      from campaign_queue
      where campaign_id = ${campaignId} and workspace = ${WORKSPACE}
      order by id
    `;
  }

  test("distributes every contact across the segments and clears the source", async () => {
    const { campaignId } = await seedCampaign(CONTACT_COUNT);
    const { splitMessageCampaign } = await import("@/lib/database/campaign.server");

    const result = await splitMessageCampaign({
      workspaceId: WORKSPACE,
      sourceCampaignId: campaignId,
      segmentCount: SEGMENT_COUNT,
      userId: USER_ID,
    });

    expect(result.segments).toHaveLength(SEGMENT_COUNT);
    // 7 contacts over 3 segments: 3 + 2 + 2.
    expect(result.segments.map((s) => s.contactCount)).toEqual([3, 2, 2]);
    expect(result.movedContactCount).toBe(CONTACT_COUNT);

    // Every contact lands in exactly one segment, and none is left behind.
    const inSegments = await sql`
      select contact_id from campaign_queue
      where workspace = ${WORKSPACE} and campaign_id <> ${campaignId}
      order by contact_id
    `;
    const segmentContacts = inSegments.map((r) => Number(r.contact_id));
    expect(segmentContacts).toHaveLength(CONTACT_COUNT);
    expect(new Set(segmentContacts).size).toBe(CONTACT_COUNT);

    const source = await queueRows(campaignId);
    expect(source.every((row) => row.dequeued_at !== null)).toBe(true);
  });

  test("a failure in the dequeue phase leaves the campaign exactly as it was", async () => {
    // The kill-check for the transaction. Without it, the clones and their
    // contact rows are already committed by the time the dequeue fails, and the
    // source is left un-dequeued: the same contacts in two campaigns, which is
    // the double-dial.
    const { campaignId, queueIds } = await seedCampaign(CONTACT_COUNT);
    const { splitMessageCampaign } = await import("@/lib/database/campaign.server");

    // Two dequeues land, the third raises: a failure part-way through the
    // irreversible phase, which is the case that used to corrupt the split.
    await failNthDequeue(3);
    try {
      await expect(
        splitMessageCampaign({
          workspaceId: WORKSPACE,
          sourceCampaignId: campaignId,
          segmentCount: SEGMENT_COUNT,
          userId: USER_ID,
        }),
      ).rejects.toThrow();
    } finally {
      await removeDequeueFailure();
    }

    // The source is untouched: every row still queued, nothing dequeued.
    const source = await queueRows(campaignId);
    expect(source).toHaveLength(CONTACT_COUNT);
    expect(source.every((row) => row.dequeued_at === null)).toBe(true);
    expect(source.map((r) => Number(r.id)).sort()).toEqual([...queueIds].sort());

    // And the clones are gone. This is the assertion the transaction exists for:
    // without it, `campaign` has SEGMENT_COUNT extra rows and the contacts are
    // queued in both places.
    const [clones] = await sql`
      select count(*)::int as n from campaign
      where workspace = ${WORKSPACE} and id <> ${campaignId}
    `;
    expect(Number(clones.n)).toBe(0);

    const [duplicated] = await sql`
      select count(*)::int as n from campaign_queue
      where workspace = ${WORKSPACE} and campaign_id <> ${campaignId}
    `;
    expect(Number(duplicated.n)).toBe(0);
  });

  test("nothing is published to subscribers unless the split commits", async () => {
    // The other half of the deferral. Two dequeues succeed and are queued for
    // publication; the third fails. If the publish were issued inline, a
    // subscriber would be told about two dequeue events that the rollback then
    // erased, and would never be told they were undone.
    const { campaignId } = await seedCampaign(CONTACT_COUNT);
    const { splitMessageCampaign } = await import("@/lib/database/campaign.server");

    await failNthDequeue(3);
    try {
      await expect(
        splitMessageCampaign({
          workspaceId: WORKSPACE,
          sourceCampaignId: campaignId,
          segmentCount: SEGMENT_COUNT,
          userId: USER_ID,
        }),
      ).rejects.toThrow();
    } finally {
      await removeDequeueFailure();
    }

    expect(mocks.published).toEqual([]);
  });

  test("a successful split publishes after the commit", async () => {
    // The other half of the same contract: deferring must not swallow the
    // event, or the UI would never learn the contacts moved.
    const { campaignId } = await seedCampaign(CONTACT_COUNT);
    const { splitMessageCampaign } = await import("@/lib/database/campaign.server");

    await splitMessageCampaign({
      workspaceId: WORKSPACE,
      sourceCampaignId: campaignId,
      segmentCount: SEGMENT_COUNT,
      userId: USER_ID,
    });

    expect(mocks.published.length).toBeGreaterThan(0);
    expect(mocks.published.every((entry) => entry.endsWith(WORKSPACE))).toBe(true);
  });

  test("the clones are reachable and scoped to the source's workspace", async () => {
    const { campaignId } = await seedCampaign(CONTACT_COUNT);
    const { splitMessageCampaign } = await import("@/lib/database/campaign.server");

    const result = await splitMessageCampaign({
      workspaceId: WORKSPACE,
      sourceCampaignId: campaignId,
      segmentCount: SEGMENT_COUNT,
      userId: USER_ID,
    });

    const rows = await sql`
      select id, title, workspace, status, type
      from campaign
      where workspace = ${WORKSPACE} and id <> ${campaignId}
      order by id
    `;
    expect(rows).toHaveLength(SEGMENT_COUNT);
    for (const row of rows) {
      expect(row.workspace).toBe(WORKSPACE);
      // Draft, so an operator can vary copy per segment before launching.
      expect(row.status).toBe("draft");
      // Still a message campaign, or the split would produce a different type.
      expect(row.type).toBe("message");
    }
    expect(rows.map((r) => Number(r.id)).sort()).toEqual(
      result.segments.map((s) => s.campaignId).sort(),
    );
  });

  test("a split cannot read or clone from another workspace's campaign", async () => {
    const { campaignId } = await seedCampaign(CONTACT_COUNT);
    const { splitMessageCampaign } = await import("@/lib/database/campaign.server");

    // Same campaign id, a different workspace. The tenant client filters by
    // workspace, so this must not find it.
    await expect(
      splitMessageCampaign({
        workspaceId: OTHER_WORKSPACE,
        sourceCampaignId: campaignId,
        segmentCount: SEGMENT_COUNT,
        userId: USER_ID,
      }),
    ).rejects.toThrow("Source campaign not found");

    const [leaked] = await sql`
      select count(*)::int as n from campaign where workspace = ${OTHER_WORKSPACE}
    `;
    expect(Number(leaked.n)).toBe(0);
  });
});
