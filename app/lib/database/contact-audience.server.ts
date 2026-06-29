/**
 * Contact–audience relationship operations
 */
import { and, count, eq, inArray } from "drizzle-orm";
import type { SupabaseClient } from "@supabase/supabase-js";
import { audience, contact_audience } from "@/db/schema";
import { db } from "@/server/db";
import { adminDb } from "@/server/admin-db";
import { createTenantDb, type TenantDb } from "@/server/tenant-db";

async function resolveAudienceWorkspaceId(audienceId: number): Promise<string> {
  const row = await adminDb.query.audience.findFirst({
    where: eq(audience.id, audienceId),
    columns: { workspace: true },
  });
  if (!row?.workspace) {
    throw new Error("Audience not found");
  }
  return row.workspace;
}

/**
 * Remove a single contact from an audience
 */
export async function removeContactFromAudience(
  contactId: number,
  audienceId: number,
  opts?: {
    workspaceId?: string;
    tdb?: TenantDb;
    /** @deprecated ignored */
    supabaseClient?: SupabaseClient;
  },
) {
  const workspaceId = opts?.workspaceId ?? (await resolveAudienceWorkspaceId(audienceId));
  const tdb = opts?.tdb ?? createTenantDb(workspaceId);

  await tdb.audience.findFirst({
    where: eq(audience.id, audienceId),
  });

  await db
    .delete(contact_audience)
    .where(
      and(
        eq(contact_audience.contact_id, contactId),
        eq(contact_audience.audience_id, audienceId),
      ),
    );

  return { success: true };
}

/**
 * Remove multiple contacts from an audience and update audience total_contacts
 */
export async function removeContactsFromAudience(
  audienceId: number,
  contactIds: number[],
  opts?: {
    workspaceId?: string;
    tdb?: TenantDb;
    /** @deprecated ignored */
    supabaseClient?: SupabaseClient;
  },
) {
  const workspaceId = opts?.workspaceId ?? (await resolveAudienceWorkspaceId(audienceId));
  const tdb = opts?.tdb ?? createTenantDb(workspaceId);

  await tdb.audience.findFirst({
    where: eq(audience.id, audienceId),
  });

  await db
    .delete(contact_audience)
    .where(
      and(
        eq(contact_audience.audience_id, audienceId),
        inArray(contact_audience.contact_id, contactIds),
      ),
    );

  const [countRow] = await db
    .select({ value: count() })
    .from(contact_audience)
    .where(eq(contact_audience.audience_id, audienceId));

  const newCount = countRow?.value ?? 0;

  await tdb.audience.update({
    set: { total_contacts: newCount },
    where: eq(audience.id, audienceId),
  });

  return { removed_count: contactIds.length, new_total: newCount };
}
