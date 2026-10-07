import { and, eq, inArray, sql } from "drizzle-orm";
import { contact as contactTable, contact_audience as members, households as householdsTable } from "@/db/schema";
import type { Database } from "@/server/db";
import { createTenantDb } from "@/server/tenant-db";
import { householdKeyFor } from "@/lib/household-key";
import { parsePhoneNumber } from "@/lib/phone";
import { mapAudienceImportRow, type PreparedAudienceImport } from "@/lib/audience-import-map";
import type { audience_import_row, audience_import_run } from "@/db/schema";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Run = typeof audience_import_run.$inferSelect;

export async function commitAudienceImportRows(tx: Transaction, run: Run, rows: PreparedAudienceImport["contacts"]) {
  const tdb = createTenantDb(run.workspace, tx);
  const mapped = rows.map(row => ({ ...row, ...mapAudienceImportRow(row.data, run.mapping, run.created_by, run.imported_at) }));
  const phones = mapped.flatMap(row => row.contact.phone ? [row.contact.phone] : []);
  const existing = phones.length ? await tx.select({ phone: contactTable.phone }).from(members)
    .innerJoin(contactTable, eq(contactTable.id, members.contact_id))
    .where(and(eq(members.audience_id, run.audience_id), eq(contactTable.workspace, run.workspace))) : [];
  const seen = new Set(existing.flatMap(row => { const phone = parsePhoneNumber(row.phone); return phone ? [phone] : []; }));
  const outcomes: Array<typeof audience_import_row.$inferInsert> = [];
  const accepted: typeof mapped = [];
  let invalid = 0; let duplicates = 0;
  for (const row of mapped) {
    const duplicate = !row.invalid && row.contact.phone && seen.has(row.contact.phone);
    const outcome = row.invalid ? "invalid" : duplicate ? "duplicate" : "imported";
    outcomes.push({ run_id: run.id, workspace: run.workspace, record_number: row.source.recordNumber, source: row.source,
      outcome, reason: row.invalid ? "invalid-phone" : duplicate ? "duplicate-phone" : null, warnings: row.warnings });
    if (row.invalid) invalid += 1;
    else if (duplicate) duplicates += 1;
    else { accepted.push(row); if (row.contact.phone) seen.add(row.contact.phone); }
  }
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
    await tx.insert(members).values(accepted.map((_, index) => ({ contact_id: contactIds[index], audience_id: run.audience_id })));
    accepted.forEach((row, index) => {
      const receipt = outcomes.find(outcome => outcome.record_number === row.source.recordNumber);
      if (!receipt) throw new Error("Source receipt not found");
      receipt.contact_id = contactIds[index]; receipt.household_id = row.contact.household_id ?? null;
    });
  }
  if (outcomes.length) await tdb.audience_import_row.insertMany(outcomes);
  return { imported: accepted.length, invalid, duplicates };
}

function sqlContactIds(count: number) {
  return sql`select nextval(pg_get_serial_sequence('contact', 'id'))::text as id from generate_series(1, ${count})`;
}
