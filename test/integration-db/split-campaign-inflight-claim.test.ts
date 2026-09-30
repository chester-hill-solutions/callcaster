import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import { SMS_CLAIM_LEASE_MS } from "@/lib/campaign-queue-claim";

/**
 * #2208: splitting a campaign double-sent any contact whose SMS was already in
 * flight at Twilio.
 *
 * The row stays `queued` until AFTER the provider call returns — that ordering
 * is deliberate crash-safety, so a process death after Twilio accepted the
 * message still leaves a queued row to retry rather than silently dropping the
 * send. The consequence is that an in-flight row is indistinguishable from an
 * untouched one, and the split copied it into a new segment while the original
 * send completed. The contact got two texts and was billed for both.
 *
 * The fix is an in-flight claim marker (`campaign_queue.claimed_at`) taken
 * before the provider call. This file is the **integration-db** tier because
 * the claim under test is a conditional UPDATE whose WHERE clause carries the
 * whole invariant; a mocked client would let the guard be deleted and the suite
 * would stay green, since the mock cannot tell a real lease check from a stub.
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
      "!! The split-vs-in-flight-send double-send (#2208) is UNGUARDED in this",
      "!! run. The unit tier mocks the db client, so removing the claim filter",
      "!! there would still pass.",
      "!!",
      "!".repeat(72),
      "",
    ].join("\n"),
  );
}

const describeDb = DATABASE_URL ? describe : describe.skip;

const WORKSPACE = "3b6f0a52-6f5e-4b2d-9d55-0000000000d1";
const USER_ID = "3b6f0a52-6f5e-4b2d-9d55-0000000000d3";

vi.mock("@/lib/workspace-events.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/workspace-events.server")>()),
  emitQueueEvent: vi.fn(async () => undefined),
  emitQueueEventById: vi.fn(async () => undefined),
}));

type Sql = ReturnType<typeof postgres>;

describeDb("splitMessageCampaign and in-flight SMS claims (#2208)", () => {
  let sql: Sql;

  beforeAll(async () => {
    if (!DATABASE_URL) {
      throw new Error("unreachable: describeDb is skipped without one");
    }
    sql = postgres(DATABASE_URL, { max: 4 });
    await sql`select 1`;
  });

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
  });

  beforeEach(async () => {
    await sql`delete from campaign_queue where workspace = ${WORKSPACE}`;
    await sql`delete from contact where workspace = ${WORKSPACE}`;
    await sql`delete from "user" where id = ${USER_ID}`;
    await sql`delete from campaign where workspace = ${WORKSPACE}`;
    await sql`
      insert into "user" (id, username, created_at)
      values (${USER_ID}, 'split-2208@example.com', now())
      on conflict (id) do nothing
    `;
    await sql`
      insert into workspace (id, name, twilio_data, disabled, feature_flags, credits, created_at)
      values (${WORKSPACE}, 'Split 2208', '{}'::jsonb, false, '{}'::jsonb, 1000, now())
      on conflict (id) do nothing
    `;
  });

  /**
   * A message campaign with `count` queued contacts. `claimedAtMs` stamps a
   * live claim on the first contact's queue row, standing in for a dispatcher
   * that is mid-send.
   */
  async function seedCampaign(count: number, opts: { claimFirstMsAgo?: number } = {}) {
    const [campaign] = await sql`
      insert into campaign (workspace, title, type, status, created_at,
                            group_household_queue, next_queue_order, dial_ratio,
                            allow_bulk_local_send, is_sample, voicemail_drop_enabled)
      values (${WORKSPACE}, 'Split 2208 Source', 'message', 'draft', now(), false, 0, 1,
              false, false, false)
      returning id
    `;
    const contactIds: number[] = [];
    for (let i = 0; i < count; i++) {
      const contactId = 910_000 + i;
      contactIds.push(contactId);
      await sql`
        insert into contact (id, workspace, created_at, other_data, firstname)
        values (${contactId}, ${WORKSPACE}, now(), '{}'::jsonb, ${`Contact ${i}`})
        on conflict (id) do nothing
      `;
      const claimedAt =
        i === 0 && opts.claimFirstMsAgo !== undefined
          ? new Date(Date.now() - opts.claimFirstMsAgo).toISOString()
          : null;
      await sql`
        insert into campaign_queue (workspace, campaign_id, contact_id, attempts,
                                    attempt_count, queue_state, created_at, claimed_at)
        values (${WORKSPACE}, ${campaign.id}, ${contactId}, 0, 0, 'queued', now(), ${claimedAt})
      `;
    }
    return { campaignId: Number(campaign.id), contactIds };
  }

  async function split(campaignId: number) {
    const { splitMessageCampaign } = await import(
      "@/lib/database/campaign.server"
    );
    return splitMessageCampaign({
      workspaceId: WORKSPACE,
      sourceCampaignId: campaignId,
      segmentCount: 2,
      userId: USER_ID,
    });
  }

  /** Where each contact's still-queued row now lives. */
  async function queuedCampaignIdByContact(contactId: number) {
    const [row] = await sql`
      select campaign_id from campaign_queue
      where contact_id = ${contactId} and workspace = ${WORKSPACE}
        and dequeued_at is null
    `;
    return row ? Number(row.campaign_id) : null;
  }

  // The regression. Before the fix, the claimed contact's row was copied into a
  // segment AND dequeued from the source, so it was queued in one campaign
  // while the in-flight send completed it in the other.
  test("a contact mid-SMS-send is not moved into a segment", async () => {
    const { campaignId, contactIds } = await seedCampaign(4, {
      claimFirstMsAgo: 2_000,
    });
    const claimedContact = contactIds[0]!;

    const result = await split(campaignId);

    expect(result.heldBackInFlightCount).toBe(1);
    expect(result.movedContactCount).toBe(3);
    // Still queued on the SOURCE campaign, so the in-flight send's own
    // dequeue lands on a real row and the contact is not re-sent by a segment.
    expect(await queuedCampaignIdByContact(claimedContact)).toBe(campaignId);
  });

  // The held-back contact must be left sendable, not stranded: the campaign it
  // already belongs to still owns the row.
  test("the held-back contact stays queued on the source campaign", async () => {
    const { campaignId, contactIds } = await seedCampaign(2, {
      claimFirstMsAgo: 1_000,
    });

    await split(campaignId);

    const rows = await sql`
      select campaign_id, dequeued_at from campaign_queue
      where contact_id = ${contactIds[0]} and workspace = ${WORKSPACE}
    `;
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]!.campaign_id)).toBe(campaignId);
    expect(rows[0]!.dequeued_at).toBeNull();
  });

  // A dispatcher that dies mid-send leaves a claim behind. If an expired claim
  // still blocked, one crash would permanently shrink every future split.
  test("a row whose claim has expired moves normally", async () => {
    const { campaignId } = await seedCampaign(3, {
      claimFirstMsAgo: SMS_CLAIM_LEASE_MS + 60_000,
    });

    const result = await split(campaignId);

    expect(result.heldBackInFlightCount).toBe(0);
    expect(result.movedContactCount).toBe(3);
  });

  // Pre-existing behaviour pinned: untouched rows still all move. The fix is a
  // narrowing, not a rewrite of the split.
  test("untouched rows all move across the segments", async () => {
    const { campaignId } = await seedCampaign(4);

    const result = await split(campaignId);

    expect(result.heldBackInFlightCount).toBe(0);
    expect(result.movedContactCount).toBe(4);
    expect(result.segments).toHaveLength(2);
  });
});
