import { and, eq, inArray, sql } from "drizzle-orm";
import { contact_audience as members, households as householdsTable } from "@/db/schema";
import type { Database } from "@/server/db";
import { createTenantDb } from "@/server/tenant-db";
import { lockWorkspaceContactIdentity } from "./contact-identity-lock.server";
import { householdKeyFor } from "@/lib/household-key";
import { getConversationPhoneKey } from "@/lib/chat-conversation-sort";
import { findSmsRecipientContactsForPhones } from "@/lib/database/contact.server";
import { mapAudienceImportRow, type PreparedAudienceImport } from "@/lib/audience-import-map.server";
import type { audience_import_row, audience_import_run } from "@/db/schema";
import type { Contact } from "@/lib/types";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Run = typeof audience_import_run.$inferSelect;
type MappedRow = PreparedAudienceImport["contacts"][number] & ReturnType<typeof mapAudienceImportRow>;

export async function commitAudienceImportRows(tx: Transaction, run: Run, rows: PreparedAudienceImport["contacts"]) {
  const tdb = createTenantDb(run.workspace, tx);
  const mapped = rows.map(row => ({ ...row, ...mapAudienceImportRow(row.data, run.mapping, run.created_by, run.imported_at) }));
  const phones = mapped.flatMap(row => row.contact.phone ? [row.contact.phone] : []);
  // Different audiences hold different row locks. This transaction lock makes
  // their workspace lookup and insertion one ordered import operation (#3085).
  await lockWorkspaceContactIdentity(tx, run.workspace);
  const existing = await findSmsRecipientContactsForPhones(run.workspace, phones, tdb);
  const currentMembers = existing.length ? await tx.select({ contact_id: members.contact_id }).from(members)
    .where(and(eq(members.audience_id, run.audience_id), inArray(members.contact_id, existing.map(contact => contact.id)))) : [];
  const { outcomes, accepted, imported, invalid, duplicates } = planRows(run, mapped, existing, new Set(currentMembers.map(row => row.contact_id)));
  const householdEntries = new Map<string, { household_key: string; address: string; postal: string; city: string | null; province: string | null }>();
  const keys = accepted.map(row => {
    const { address, postal, city, province } = row.contact;
    const key = householdKeyFor(typeof address === "string" ? address : null, typeof postal === "string" ? postal : null);
    if (key && !householdEntries.has(key)) householdEntries.set(key, { household_key: key, address: String(address), postal: String(postal), city: typeof city === "string" ? city : null, province: typeof province === "string" ? province : null });
    return key;
  });
  if (householdEntries.size) {
    await tx.insert(householdsTable).values([...householdEntries.values()].map(entry => ({ ...entry, workspace_id: run.workspace })))
      .onConflictDoNothing({ target: [householdsTable.workspace_id, householdsTable.household_key] });
    const households = await tdb.households.findMany({ where: inArray(householdsTable.household_key, [...householdEntries.keys()]) });
    const byKey = new Map(households.map(row => [row.household_key, row.id]));
    accepted.forEach((row, index) => { const key = keys[index]; if (key) row.contact.household_id = byKey.get(key); });
  }
  if (accepted.length) {
    // Explicit IDs pair each RETURNING row with its source, without relying on
    // Postgres returning an INSERT batch in its input order.
    const ids = await tx.execute<{ id: string }>(sqlContactIds(accepted.length));
    const contactIds = ids.map(row => Number(row.id));
    if (contactIds.length !== accepted.length || contactIds.some(id => !Number.isSafeInteger(id))) throw new Error("Invalid allocated contact IDs");
    const contacts = await tdb.contact.insertMany(accepted.map((row, index) => ({ ...row.contact, id: contactIds[index] })));

    const returned = new Set(contacts.map(row => Number(row.id)));
    if (returned.size !== accepted.length || contactIds.some(id => !returned.has(id))) throw new Error("Incomplete contact insert");
    accepted.forEach((row, index) => {
      const receipt = outcomes.find(outcome => outcome.record_number === row.source.recordNumber);
      if (!receipt) throw new Error("Source receipt not found");
      receipt.contact_id = contactIds[index]; receipt.household_id = row.contact.household_id ?? null;
    });
  }
  const links = outcomes.filter(row => row.outcome === "imported").map(row => {
    if (!row.contact_id) throw new Error("Imported row has no contact identity");
    return { contact_id: row.contact_id, audience_id: run.audience_id };
  });
  if (links.length) await tx.insert(members).values(links).onConflictDoNothing();
  if (outcomes.length) await tdb.audience_import_row.insertMany(outcomes);
  return { imported, invalid, duplicates };
}

function classifyRow(row: MappedRow, matches: Contact[], alreadyMember: boolean) {
  if (row.invalid) return { outcome: "invalid" as const, reason: "invalid-phone", contact: null };
  if (alreadyMember) return { outcome: "duplicate" as const, reason: "duplicate-phone", contact: null };
  if (matches.length > 1) return { outcome: "invalid" as const, reason: "ambiguous-workspace-phone", contact: null };
  const contact = matches[0] ?? null;
  return { outcome: "imported" as const, reason: contact ? "reused-workspace-contact" : null, contact };
}

function planRows(run: Run, rows: MappedRow[], existing: Contact[], memberIds: Set<number>) {
  const byPhone = new Map<string, Contact[]>(), seen = new Set<string>();
  for (const contact of existing) {
    const key = getConversationPhoneKey(contact.phone);
    if (!key) continue;
    byPhone.set(key, [...(byPhone.get(key) ?? []), contact]);
    if (memberIds.has(contact.id)) seen.add(key);
  }
  const outcomes: Array<typeof audience_import_row.$inferInsert> = [], accepted: MappedRow[] = [];
  const counts = { imported: 0, invalid: 0, duplicate: 0 };
  for (const row of rows) {
    const key = getConversationPhoneKey(row.contact.phone ?? null);
    const decision = classifyRow(row, key ? byPhone.get(key) ?? [] : [], key !== null && seen.has(key));
    counts[decision.outcome]++;
    outcomes.push({ run_id: run.id, workspace: run.workspace, record_number: row.source.recordNumber, source: row.source,
      outcome: decision.outcome, reason: decision.reason, warnings: row.warnings,
      contact_id: decision.contact?.id, household_id: decision.contact?.household_id });
    if (decision.outcome !== "imported") continue;
    if (!decision.contact) accepted.push(row);
    if (key) seen.add(key);
  }
  return { outcomes, accepted, imported: counts.imported, invalid: counts.invalid, duplicates: counts.duplicate };
}

function sqlContactIds(count: number) {
  return sql`select nextval(pg_get_serial_sequence('contact', 'id'))::text as id from generate_series(1, ${count})`;
}
