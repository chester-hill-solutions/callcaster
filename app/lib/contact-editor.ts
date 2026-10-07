import type { Contact, ContactAudience } from "@/lib/types";
import type { Json } from "@/lib/db-types";

export const CONTACT_EDITOR_FIELDS = [
  "firstname",
  "surname",
  "phone",
  "email",
  "address",
  "city",
  "province",
  "postal",
] as const;

export function buildContactEditorDraft(
  contact?: Contact & { contact_audience?: ContactAudience[] },
) {
  const fields: Record<string, string> = {};
  for (const name of CONTACT_EDITOR_FIELDS)
    fields[name] = contact?.[name] == null ? "" : String(contact[name]);
  const raw: unknown = contact?.other_data;
  let otherData: Json[] = [];
  if (Array.isArray(raw)) otherData = raw;
  else if (typeof raw === "string") {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) otherData = parsed;
    } catch {
      /* Old snapshots can contain invalid stringified data. */
    }
  }
  const audienceIds = [
    ...new Set(
      (contact?.contact_audience ?? []).flatMap((row) =>
        row ? [Number(row.audience_id)] : [],
      ),
    ),
  ];
  return { fields, audienceIds, otherData };
}

export function contactEditorSnapshot(
  contact?: Contact & { contact_audience?: ContactAudience[] },
) {
  const draft = buildContactEditorDraft(contact);
  return JSON.stringify({
    ...draft,
    audienceIds: [...draft.audienceIds].sort((a, b) => a - b),
    dateUpdated: contact?.date_updated,
  });
}
