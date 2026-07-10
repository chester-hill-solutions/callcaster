/**
 * Backfill contact_id on historical SMS message rows that belong to a
 * conversation but were never linked to a contact.
 *
 * Inbound SMS attribution (see app/lib/inbound-sms-context.server.ts:
 * findMatchingContactIds) only sets `message.contact_id` when exactly one
 * contact matches the sender's phone number at delivery time. 0-or-many
 * matches leave `contact_id` permanently null, including on messages
 * exchanged after a matching contact is later created or found. This module
 * lets the UI (see ChatHeader "Assign to contact") retroactively link an
 * existing contact to every unlinked message in that conversation.
 */
import { and, inArray, isNull, or } from "drizzle-orm";
import { message as messageTable } from "@/db/schema";
import { createTenantDb, type TenantDb } from "@/server/tenant-db";
import { buildExactPhoneCandidates } from "./contact.server";

export type LinkContactToConversationArgs = {
  workspaceId: string;
  contactId: number;
  /** The conversation's phone number (the phone whose unlinked messages should be backfilled). */
  contactPhone: string;
  tdb?: TenantDb;
};

export type LinkContactToConversationResult = {
  /** Number of previously-unlinked message rows that were backfilled. */
  linkedCount: number;
};

/**
 * UPDATE message SET contact_id = :contactId WHERE workspace = :workspaceId
 * AND contact_id IS NULL AND (from/to matches the conversation's phone
 * candidates). Matching reuses the same exact-candidate phone normalization
 * as contact lookups (see buildExactPhoneCandidates in contact.server.ts) so
 * historically-varied phone formatting on message rows still resolves to
 * this conversation.
 */
export async function linkContactToConversation({
  workspaceId,
  contactId,
  contactPhone,
  tdb,
}: LinkContactToConversationArgs): Promise<LinkContactToConversationResult> {
  if (!workspaceId || !contactId) {
    return { linkedCount: 0 };
  }

  const fullNumber = (contactPhone || "").replace(/\D/g, "");
  const candidates = buildExactPhoneCandidates(fullNumber);

  if (candidates.length === 0) {
    return { linkedCount: 0 };
  }

  const tenantDb = tdb ?? createTenantDb(workspaceId);

  const updated = await tenantDb.message.update({
    set: { contact_id: contactId },
    where: and(
      isNull(messageTable.contact_id),
      or(
        inArray(messageTable.from, candidates),
        inArray(messageTable.to, candidates),
      ),
    ),
  });

  return { linkedCount: updated.length };
}
