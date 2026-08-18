/**
 * Contact–audience relationship operations
 */
import { and, asc, count, desc, eq, inArray, type SQL } from "drizzle-orm";
import { audience, contact as contactTable, contact_audience, contact_audience as contactAudienceTable } from "@/db/schema";
import { buildContactSearchWhere } from "@/lib/contacts/search.server";
import { db } from "@/server/db";
import { adminDb } from "@/server/admin-db";
import { createTenantDb, type TenantDb } from "@/server/tenant-db";

const AUDIENCE_CONTACT_SORT_KEYS = [
  "id",
  "firstname",
  "surname",
  "phone",
  "email",
  "address",
  "city",
  "province",
  "postal",
  "country",
  "created_at",
] as const;

type AudienceContactSortKey = (typeof AUDIENCE_CONTACT_SORT_KEYS)[number];

function audienceContactSortColumn(sortKey: string) {
  if (AUDIENCE_CONTACT_SORT_KEYS.includes(sortKey as AudienceContactSortKey)) {
    return contactTable[sortKey as AudienceContactSortKey];
  }
  return contactTable.id;
}

export type AudienceContactExportRow = Record<string, unknown> & {
  contact?: typeof contactTable.$inferSelect;
  other_data?: unknown;
};

/**
 * Shared query for the audience-contact export rows. Every caller MUST pass a
 * workspace-scoping filter (an unscoped call leaks cross-tenant PII).
 */
async function queryAudienceContactRows(
  filters: SQL[],
  order?: { column: ReturnType<typeof audienceContactSortColumn>; direction: "asc" | "desc" },
): Promise<AudienceContactExportRow[]> {
  const base = db
    .select({
      link: contactAudienceTable,
      contact: contactTable,
    })
    .from(contactAudienceTable)
    .innerJoin(contactTable, eq(contactAudienceTable.contact_id, contactTable.id))
    .where(and(...filters));

  const rows = order
    ? await base.orderBy(order.direction === "asc" ? asc(order.column) : desc(order.column))
    : await base;

  return rows.map(({ link, contact }) => ({
    ...link,
    ...contact,
    contact,
  }));
}

export async function listAudienceContactsForExport(
  workspaceId: string,
  audienceId: number,
  options?: {
    q?: string;
    sortKey?: string;
    sortDirection?: "asc" | "desc";
  },
): Promise<AudienceContactExportRow[]> {
  const sortKey = options?.sortKey ?? "id";
  const sortDirection = options?.sortDirection ?? "asc";
  const searchWhere = options?.q ? buildContactSearchWhere(options.q) : undefined;

  const filters: SQL[] = [
    eq(contactAudienceTable.audience_id, audienceId),
    eq(contactTable.workspace, workspaceId),
  ];
  if (searchWhere) {
    filters.push(searchWhere);
  }

  return queryAudienceContactRows(filters, {
    column: audienceContactSortColumn(sortKey),
    direction: sortDirection,
  });
}

export async function listAudienceContactsJson(
  workspaceId: string,
  audienceId?: number,
): Promise<AudienceContactExportRow[]> {
  // Always scope to the workspace. Without this, an omitted audienceId left the
  // WHERE empty and dumped every tenant's audience-linked contacts (PII) to any
  // authenticated caller with access to a single workspace.
  const filters: SQL[] = [eq(contactTable.workspace, workspaceId)];
  if (audienceId != null) {
    filters.push(eq(contactAudienceTable.audience_id, audienceId));
  }

  return queryAudienceContactRows(filters);
}

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
