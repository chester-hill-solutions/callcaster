import { and, eq, inArray, sql } from "drizzle-orm";
import { contact, contact_audience, audience } from "@/db/schema";
import { AppError, ErrorCode } from "@/lib/errors.server";
import type { Json } from "@/lib/db-types";
import { db } from "./db";
import { createTenantDb } from "./tenant-db";

type EditorFields = Pick<
  typeof contact.$inferInsert,
  | "firstname"
  | "surname"
  | "phone"
  | "email"
  | "address"
  | "city"
  | "province"
  | "postal"
  | "country"
  | "external_id"
>;
export type ContactEditorData = { audienceIds?: number[]; otherData?: Json[] };

function readArray(formData: FormData, name: string): unknown[] | undefined {
  const raw = formData.get(name);
  if (raw == null) return undefined;
  try {
    if (typeof raw !== "string") throw new Error("Expected text");
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("Expected an array");
    return parsed;
  } catch {
    throw new AppError(
      `Invalid ${name === "audience_ids" ? "call lists" : "Other Data"}`,
      400,
      ErrorCode.INVALID_INPUT,
    );
  }
}

export function parseContactEditorData(formData: FormData): ContactEditorData {
  const ids = readArray(formData, "audience_ids");
  if (
    ids?.some(
      (id) => typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0,
    )
  )
    throw new AppError("Invalid call lists", 400, ErrorCode.INVALID_INPUT);
  return {
    audienceIds: ids ? [...new Set(ids as number[])] : undefined,
    otherData: readArray(formData, "other_data") as Json[] | undefined,
  };
}

export async function saveContactEditor(
  workspaceId: string,
  contactId: number | null,
  fields: EditorFields,
  editor: ContactEditorData,
) {
  return db.transaction(async (tx) => {
    const tdb = createTenantDb(workspaceId, tx);
    // The join table has no workspace column. Lock and verify its contact before any join write.
    if (contactId !== null) {
      await tx.execute(
        sql`select id from contact where workspace = ${workspaceId}::uuid and id = ${contactId} for update`,
      );
      if (!(await tdb.contact.findFirst({ where: eq(contact.id, contactId) })))
        throw new AppError("Contact not found", 404, ErrorCode.NOT_FOUND);
    }
    const ids = editor.audienceIds;
    if (ids?.length) {
      const owned = await tdb.audience.findMany({
        where: inArray(audience.id, ids),
        columns: { id: true },
      });
      if (owned.length !== ids.length)
        throw new AppError("Call list not found", 404, ErrorCode.NOT_FOUND);
    }
    const values = {
      ...fields,
      ...(editor.otherData === undefined
        ? {}
        : { other_data: editor.otherData }),
      date_updated: new Date().toISOString(),
    };
    const [saved] =
      contactId === null
        ? await tdb.contact.insert(values)
        : await tdb.contact.update({
            set: values,
            where: eq(contact.id, contactId),
          });
    if (!saved) throw new Error("Contact write returned no row");
    if (ids !== undefined) {
      const previous = await tx.query.contact_audience.findMany({
        where: eq(contact_audience.contact_id, saved.id),
      });
      const removed = previous
        .filter((row) => !ids.includes(row.audience_id))
        .map((row) => row.audience_id);
      const added = ids.filter(
        (id) => !previous.some((row) => row.audience_id === id),
      );
      if (removed.length)
        await tx
          .delete(contact_audience)
          .where(
            and(
              eq(contact_audience.contact_id, saved.id),
              inArray(contact_audience.audience_id, removed),
            ),
          );
      if (added.length)
        await tx
          .insert(contact_audience)
          .values(
            added.map((audience_id) => ({ contact_id: saved.id, audience_id })),
          );
    }
    return saved;
  });
}
