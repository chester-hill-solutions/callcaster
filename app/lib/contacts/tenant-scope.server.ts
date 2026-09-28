import { inArray } from "drizzle-orm";
import { contact as contactTable } from "@/db/schema";
import { createTenantDb } from "@/server/tenant-db";

/**
 * The one place a caller-supplied contact id list is resolved against the
 * caller's workspace.
 *
 * Contact ids arrive in request bodies, so a list is only trustworthy after
 * this check. `enqueueContactsForCampaign` takes no workspace parameter and
 * the `BEFORE` trigger on `campaign_queue` stamps each row's workspace from the
 * CAMPAIGN — so an unvalidated id puts another tenant's contact in the
 * caller's workspace, where the queue read path returns its name, phone, email
 * and address verbatim.
 *
 * Before this module each call site hand-rolled the check, and they disagreed:
 * two used the unscoped client with a hand-written `eq(workspace, ...)` (which
 * ADR-0004 reserves `createTenantDb` for), the status codes were 400, 403 and
 * 404, and one of them did not dedupe. #2097 / #2176.
 */

export type ContactScopeResolution =
  | { ok: true; contactIds: number[] }
  /**
   * `foreignCount` is for the log and the operator's console only. It is never
   * returned to the caller: naming which ids exist elsewhere is the
   * workspace-id inference the data plane's uniform 404 exists to prevent.
   */
  | { ok: false; foreignCount: number };

/**
 * Resolve `contactIds` to the subset the workspace owns.
 *
 * All-or-nothing: a partial enqueue reports success while silently dropping the
 * ids the caller could not prove, so the caller cannot tell which contacts were
 * skipped. Reject the whole request instead.
 *
 * Deduped before the count comparison. The schemas do not exclude repeats, so
 * a naive `owned.length !== requested.length` compares one owned row against
 * two requested ids and rejects a legitimate `[7, 7]`.
 *
 * `contactIds` preserves the caller's order, which is the queue's dial order.
 */
export async function resolveContactsOwnedByWorkspace(
  workspaceId: string,
  contactIds: readonly number[],
): Promise<ContactScopeResolution> {
  const requested = [...new Set(contactIds)];
  if (requested.length === 0) {
    return { ok: true, contactIds: [] };
  }

  const owned = await createTenantDb(workspaceId).contact.findMany({
    where: inArray(contactTable.id, requested),
    columns: { id: true },
  });

  if (owned.length !== requested.length) {
    return { ok: false, foreignCount: requested.length - owned.length };
  }
  return { ok: true, contactIds: requested };
}
