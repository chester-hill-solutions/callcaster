/**
 * Shared compliance guards for outbound chat SMS, used by both the JSON API
 * route (api+/chat_sms) and the workspace chat UI route (workspaces+/$id/chats)
 * so the two entry points can never drift apart on opt-out / landline
 * enforcement — which is exactly what happened before this module existed.
 *
 * Both guards are FAIL-OPEN: a lookup error is logged and swallowed so a
 * transient DB/Twilio issue never blocks delivery. They resolve the recipient
 * by explicit contact_id when known, otherwise by a single unambiguous match
 * on the destination number.
 */
import { eq } from "drizzle-orm";
import { contact as contactTable } from "@/db/schema";
import { createTenantDb } from "@/server/tenant-db";
import { findMatchingContactIds } from "@/lib/inbound-sms-context.server";
import { getOrLookupLineType, isSmsIncapableLineType } from "@/lib/twilio-lookup.server";
import { logger } from "@/lib/logger.server";

/**
 * Resolve the destination contact id: the explicit `contactId` when provided,
 * otherwise a single unambiguous match on the destination number. Returns null
 * when the number is unknown or ambiguous (0 or >1 matches).
 */
async function resolveRecipientContactId(
  workspaceId: string,
  to: string,
  contactId: string | undefined,
): Promise<number | null> {
  if (contactId) {
    const numeric = Number(contactId);
    return Number.isFinite(numeric) ? numeric : null;
  }

  const matchingIds = await findMatchingContactIds(workspaceId, to);
  const [singleMatchId] = matchingIds;
  if (matchingIds.length === 1 && singleMatchId != null) {
    return singleMatchId;
  }
  return null;
}

/** True when the resolved recipient has opted out of messages. */
export async function isOptedOutRecipient(
  workspaceId: string,
  to: string,
  contactId: string | undefined,
): Promise<boolean> {
  try {
    const resolvedId = await resolveRecipientContactId(workspaceId, to, contactId);
    if (resolvedId == null) return false;
    const tdb = createTenantDb(workspaceId);
    const contact = await tdb.contact.findFirst({
      where: eq(contactTable.id, resolvedId),
    });
    return Boolean(contact?.opt_out);
  } catch (error) {
    logger.error("Error checking contact opt-out status:", error);
    return false;
  }
}

/** True when the resolved recipient's line type cannot receive SMS (e.g. landline). */
export async function isSmsIncapableRecipient(
  workspaceId: string,
  to: string,
  contactId: string | undefined,
): Promise<boolean> {
  try {
    const resolvedId = await resolveRecipientContactId(workspaceId, to, contactId);
    if (resolvedId == null) return false;
    const lineType = await getOrLookupLineType({
      workspaceId,
      contactId: resolvedId,
      phone: to,
    });
    return isSmsIncapableLineType(lineType);
  } catch (error) {
    logger.error("Error checking contact line type:", error);
    return false;
  }
}
