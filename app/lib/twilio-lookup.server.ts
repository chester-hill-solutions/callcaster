import { eq } from "drizzle-orm";
import { contact as contactTable } from "@/db/schema";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import { createTenantDb, type TenantDb } from "@/server/tenant-db";

// The platform Twilio client is imported lazily inside the lookup call:
// importing it at module scope constructs the client eagerly, which breaks
// every consumer of this module (e.g. the SMS status webhook using only
// markContactLineType) in environments without real Twilio credentials.

/** Returns true when the (opt-in, cost-incurring) Twilio Lookup gate is enabled. */
function isTwilioLookupEnabled(): boolean {
  const value = env.TWILIO_LOOKUP_ENABLED();
  return value === "true" || value === "1";
}

/** Line types that cannot receive SMS — the send gates skip these. */
export function isSmsIncapableLineType(lineType: string | null | undefined): boolean {
  return lineType === "landline" || lineType === "fax";
}

/**
 * Stamp a contact's line type from a free delivery signal (no Lookup spend):
 * SMS error 30006 = "Landline or unreachable carrier", AMD `AnsweredBy: fax`.
 * Fail-open: errors are logged and swallowed.
 */
export async function markContactLineType({
  workspaceId,
  contactId,
  lineType,
  tdb,
}: {
  workspaceId: string;
  contactId: number | string;
  lineType: string;
  tdb?: TenantDb;
}): Promise<void> {
  try {
    const tenantDb = tdb ?? createTenantDb(workspaceId);
    await tenantDb.contact.update({
      set: {
        line_type: lineType,
        line_type_checked_at: new Date().toISOString(),
      },
      where: eq(contactTable.id, Number(contactId)),
    });
  } catch (error) {
    logger.warn("Failed to stamp contact line type from delivery signal", {
      workspaceId,
      contactId,
      lineType,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export interface GetOrLookupLineTypeParams {
  workspaceId: string;
  contactId: number | string;
  phone: string;
  /** Reuse an existing tenant-scoped Drizzle facade instead of creating a new one. */
  tdb?: TenantDb;
}

/**
 * Lazily resolves a contact's Twilio line type, caching the result on the
 * contact row forever (line type essentially never changes for a number).
 *
 * - Cache hit (`contact.line_type` already set): returns it, no Twilio spend.
 * - Cache miss + `TWILIO_LOOKUP_ENABLED` off: returns null without calling Twilio.
 * - Cache miss + enabled: calls Twilio Lookup v2 (line_type_intelligence),
 *   persists the result, and returns it.
 * - FAIL OPEN: any lookup/read error is logged and swallowed — a lookup
 *   failure must never block an SMS send. Returns null on any error.
 */
export async function getOrLookupLineType({
  workspaceId,
  contactId,
  phone,
  tdb,
}: GetOrLookupLineTypeParams): Promise<string | null> {
  const tenantDb = tdb ?? createTenantDb(workspaceId);
  const numericContactId = Number(contactId);

  try {
    const contact = await tenantDb.contact.findFirst({
      where: eq(contactTable.id, numericContactId),
    });
    if (contact?.line_type) {
      return contact.line_type;
    }
  } catch (error) {
    logger.error("Error reading contact line-type cache:", error, {
      workspaceId,
      contactId,
    });
    return null;
  }

  if (!isTwilioLookupEnabled()) {
    return null;
  }

  try {
    const { twilio } = await import("@/twilio.server");
    const result = await twilio.lookups.v2
      .phoneNumbers(phone)
      .fetch({ fields: "line_type_intelligence" });

    const lineType =
      (result.lineTypeIntelligence as { type?: string } | null | undefined)
        ?.type ?? null;

    if (lineType) {
      await tenantDb.contact.update({
        set: {
          line_type: lineType,
          line_type_checked_at: new Date().toISOString(),
        },
        where: eq(contactTable.id, numericContactId),
      });
    }

    return lineType;
  } catch (error) {
    logger.error("Error looking up Twilio line type:", error, {
      workspaceId,
      contactId,
    });
    return null;
  }
}
