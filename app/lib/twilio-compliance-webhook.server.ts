/**
 * Shared helpers for the Twilio compliance webhook receivers (Trust Hub status
 * callbacks and A2P Event Streams events).
 *
 * The runtime column is JSONB; its text cast also permits the legacy text
 * declaration's empty-value guard.
 */

import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import { logger } from "@/lib/logger.server";

/**
 * Resolve the workspace whose onboarding state references `sid` as its Trust Hub
 * customer profile bundle, Messaging Profile, brand, or campaign SID. Returns null when no
 * workspace matches.
 */
export async function findWorkspaceIdByComplianceSid(
  sid: string,
): Promise<string | null> {
  if (!sid) return null;
  try {
    const rows = (await db.execute(sql`
      SELECT id
      FROM workspace
      WHERE twilio_data IS NOT NULL
        AND twilio_data::text <> ''
        AND jsonb_typeof(twilio_data::jsonb) = 'object'
        AND (
          (twilio_data::jsonb #>> '{onboarding,a2p10dlc,customerProfileBundleSid}') = ${sid}
          OR (twilio_data::jsonb #>> '{onboarding,a2p10dlc,trustProductSid}') = ${sid}
          OR (twilio_data::jsonb #>> '{onboarding,a2p10dlc,brandSid}') = ${sid}
          OR (twilio_data::jsonb #>> '{onboarding,a2p10dlc,campaignSid}') = ${sid}
        )
      LIMIT 1
    `)) as Array<{ id: string }>;
    return rows[0]?.id ?? null;
  } catch (error) {
    logger.error("twilio.compliance.webhook.resolve_failed", {
      sid,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/** Extract the first present value among candidate keys (case-insensitive). */
export function pickWebhookField(
  payload: Record<string, string>,
  keys: string[],
): string | null {
  const lowerMap = new Map(
    Object.entries(payload).map(([key, value]) => [key.toLowerCase(), value]),
  );
  for (const key of keys) {
    const value = lowerMap.get(key.toLowerCase());
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}
