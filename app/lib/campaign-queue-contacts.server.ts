import { inArray } from "drizzle-orm";

import { contact as contactTable } from "@/db/schema";
import { db } from "@/server/db";

/**
 * Shared queue-row → contact join (#1892).
 *
 * The same "load the contacts for these queue rows, key them by id" block was
 * copied across campaign-queue-search and campaign-queue-db. It lives here once.
 */

export type QueueContactRow = typeof contactTable.$inferSelect;

/** Loads the contacts referenced by the queue rows, keyed by contact id. */
export async function loadContactsByQueueRows<T extends { contact_id: number }>(
  queueRows: T[],
): Promise<Map<number, QueueContactRow>> {
  const contactIds = [...new Set(queueRows.map((row) => row.contact_id))];
  const contacts = await db
    .select()
    .from(contactTable)
    .where(inArray(contactTable.id, contactIds));
  return new Map(contacts.map((contact) => [contact.id, contact]));
}

/** The contact for a queue row, or a hard error if it is missing. */
export function requireContactForQueueRow<T extends { contact_id: number; id: number }>(
  queueRow: T,
  contactById: Map<number, QueueContactRow>,
): QueueContactRow {
  const contact = contactById.get(queueRow.contact_id);
  if (!contact) {
    throw new Error(
      `Missing contact ${queueRow.contact_id} for queue row ${queueRow.id}`,
    );
  }
  return contact;
}

/** Queue rows with their contact attached; throws if a contact is missing. */
export function attachContactsToQueueRows<
  T extends { contact_id: number; id: number },
>(
  queueRows: T[],
  contactById: Map<number, QueueContactRow>,
): Array<T & { contact: QueueContactRow }> {
  return queueRows.map((queueRow) => ({
    ...queueRow,
    contact: requireContactForQueueRow(queueRow, contactById),
  }));
}
