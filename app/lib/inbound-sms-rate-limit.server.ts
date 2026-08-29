import { and, eq, gt, inArray } from "drizzle-orm";
import type { TenantDb } from "@/server/tenant-db";
import { expandPhoneMatchVariants } from "@/lib/message-db.server";
import { message as messageTable } from "@/db/schema";

/**
 * Inbound-SMS billing-attack guard (issue #1394).
 *
 * A single contact can pound a workspace's inbound number with SMS and
 * burn workspace credits: Twilio bills CallCaster for every received
 * segment (and the outbound STOP ack we send back) and each webhook hit
 * also triggers media fetch + row inserts + webhook fanout on our side.
 * There's no way to make Twilio not-deliver these messages, but we can
 * refuse to spend any per-message money on a from-number that's already
 * blown a reasonable send rate.
 *
 * We enforce two rolling windows against the `message` table:
 *
 *   - burst: {@link INBOUND_SMS_BURST_MAX} messages per
 *     {@link INBOUND_SMS_BURST_WINDOW_MS}. Catches the pathological case
 *     — a script hammering the number.
 *   - hour: {@link INBOUND_SMS_HOUR_MAX} messages per
 *     {@link INBOUND_SMS_HOUR_WINDOW_MS}. Catches the slow-drip attack
 *     that pads the burst limit.
 *
 * Both bounds are permissive enough that a legitimate multi-segment
 * message (Twilio sometimes delivers the segments as separate webhooks)
 * or a normal conversation never gets caught. Once either bound is hit,
 * the inbound webhook still returns 200 (Twilio would retry 5xx forever
 * and re-run the attack) but the handler drops the message and skips
 * every downstream side effect.
 *
 * We match `from` via {@link expandPhoneMatchVariants} so an attacker
 * can't sidestep the guard by re-encoding the same E.164 number in a
 * different format across requests.
 */

/** Rolling window for the short-burst cap. */
export const INBOUND_SMS_BURST_WINDOW_MS = 60_000;
/** Max inbound events from a given contact within {@link INBOUND_SMS_BURST_WINDOW_MS}. */
export const INBOUND_SMS_BURST_MAX = 20;

/** Rolling window for the sustained cap. */
export const INBOUND_SMS_HOUR_WINDOW_MS = 60 * 60 * 1000;
/** Max inbound events from a given contact within {@link INBOUND_SMS_HOUR_WINDOW_MS}. */
export const INBOUND_SMS_HOUR_MAX = 100;

export type InboundSmsRateVerdict =
  | { allowed: true }
  | {
      allowed: false;
      window: "burst" | "hour";
      /** How many inbound rows we counted in the window that tripped. */
      count: number;
      /** The limit for the tripped window. */
      limit: number;
    };

/**
 * Check whether an inbound SMS from `fromNumber` to `workspaceId` should
 * be processed. Runs two `count` queries (burst first — if that trips we
 * skip the wider query) against the tenant-scoped message table, both
 * covered by `idx_message_workspace_date`.
 *
 * The `now` parameter is only for tests — production always passes `new
 * Date()` implicitly.
 */
export async function inboundSmsRateVerdict(
  tdb: TenantDb,
  args: { workspaceId: string; fromNumber: string; now?: Date },
): Promise<InboundSmsRateVerdict> {
  const trimmed = args.fromNumber.trim();
  if (!trimmed) {
    // A missing/blank From cannot be rate-limited (there's no bucket to
    // key against). The route treats an empty From as no attribution and
    // still records the message; we do the same.
    return { allowed: true };
  }
  const now = args.now ?? new Date();
  const burstSinceIso = new Date(now.getTime() - INBOUND_SMS_BURST_WINDOW_MS).toISOString();
  const hourSinceIso = new Date(now.getTime() - INBOUND_SMS_HOUR_WINDOW_MS).toISOString();
  const variants = expandPhoneMatchVariants(trimmed);

  const baseWhere = and(
    eq(messageTable.workspace, args.workspaceId),
    eq(messageTable.direction, "inbound"),
    inArray(messageTable.from, variants),
  );

  const burst = await tdb.message.count({
    where: and(baseWhere, gt(messageTable.date_created, burstSinceIso)),
  });
  if (burst >= INBOUND_SMS_BURST_MAX) {
    return { allowed: false, window: "burst", count: burst, limit: INBOUND_SMS_BURST_MAX };
  }

  const hour = await tdb.message.count({
    where: and(baseWhere, gt(messageTable.date_created, hourSinceIso)),
  });
  if (hour >= INBOUND_SMS_HOUR_MAX) {
    return { allowed: false, window: "hour", count: hour, limit: INBOUND_SMS_HOUR_MAX };
  }
  return { allowed: true };
}
