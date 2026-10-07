import { createHash } from "node:crypto";
import { parseCSVWithSource } from "@/lib/csv";
import { parseOptOutCell } from "@/lib/csv-contacts";
import { parsePhoneNumber } from "@/lib/phone";
import type { ImportWarning } from "@/db/schema-audience-import";
import { CONTACT_IMPORT_TARGETS, splitContactFullName, validateContactImportMapping } from "../../shared/contact-import-headers";

export function prepareAudienceImport(bytes: Buffer, mapping: Record<string, string>, split: string | null, voterSource: string | null) {
  const csv = bytes.toString("utf8");
  if (!Buffer.from(csv).equals(bytes)) throw new Error("CSV must be valid UTF-8");
  const parsed = parseCSVWithSource(csv);
  const lookup = new Map(parsed.headers.map(header => [header.toLowerCase(), header]));
  const missing = Object.keys(mapping).filter(header => !lookup.has(header.toLowerCase()));
  if (missing.length) throw new Error(`Missing headers in CSV: ${missing.join(", ")}`);
  const duplicate = validateContactImportMapping(mapping).find(issue => issue.blocking && issue.code === "duplicate-target");
  if (duplicate) throw new Error(duplicate.message);
  const fields: Array<[string, string]> = Object.entries(mapping).flatMap<[string, string]>(([header, target]) => {
    if (!CONTACT_IMPORT_TARGETS.some(allowed => allowed === target)) throw new Error(`Invalid import target: ${target}`);
    const actual = lookup.get(header.toLowerCase());
    if (actual === undefined) throw new Error("Mapped header not found");
    return target === "ignore" || target === "name" ? [] : [[actual, target]];
  }).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  const effective = { fields, split: split ? lookup.get(split.toLowerCase()) ?? null : null, voterSource, version: 1 };
  const fileSha256 = createHash("sha256").update(bytes).digest("hex");
  const identity = createHash("sha256").update(JSON.stringify([fileSha256, effective])).digest("hex");
  return { ...parsed, effective, fileSha256, identity };
}
export type PreparedAudienceImport = ReturnType<typeof prepareAudienceImport>;
export type ImportedContact = { created_by: string; other_data: Array<Record<string, string>>; firstname?: string; surname?: string; phone?: string; opt_out?: boolean; household_id?: string; [key: string]: unknown };

export function mapAudienceImportRow(data: Record<string, string>, effective: PreparedAudienceImport["effective"], actor: string, importedAt: Date) {
  const contact: ImportedContact = { created_by: actor, other_data: [] };
  const warnings: ImportWarning[] = [];
  if (effective.split) Object.assign(contact, splitContactFullName(data[effective.split]));
  for (const [header, target] of effective.fields) {
    const value = data[header];
    if (value === undefined) continue;
    if (target === "other_data") contact.other_data.push({ [header]: value });
    else if (target === "phone") contact.phone = parsePhoneNumber(value) ?? undefined;
    else if (target === "opt_out") {
      const parsed = parseOptOutCell(value);
      contact.opt_out = parsed.optOut;
      if (parsed.needsReview) warnings.push({ code: "unknown-opt-out", header, value });
    } else contact[target] = value;
  }
  if (effective.voterSource) {
    contact.voter_list_source = effective.voterSource;
    contact.voter_list_imported_at = importedAt.toISOString();
  }
  return { contact, warnings, invalid: effective.fields.some(([, target]) => target === "phone") && !contact.phone };
}
