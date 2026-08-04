import { and, asc, count, desc, eq } from "drizzle-orm";
import { buildContactSearchWhere } from "@/lib/contacts/search.server";
import type { ContactListRow } from "@/lib/contacts-loader.types";
import { logger } from "@/lib/logger.server";
import { parsePagination, type PaginationMeta } from "@/lib/pagination.server";
import {
  audience as audienceTable,
  audience_upload as audienceUploadTable,
  contact as contactTable,
  contact_audience as contactAudienceTable,
} from "@/db/schema";
import { db } from "@/server/db";
import { createTenantDb } from "@/server/tenant-db";

const AUDIENCE_CONTACT_SORT_KEYS = [
  "id",
  "firstname",
  "surname",
  "phone",
  "email",
  "created_at",
] as const;

type AudienceContactSortKey = (typeof AUDIENCE_CONTACT_SORT_KEYS)[number];

function audienceContactSortColumn(sortKey: string) {
  if (AUDIENCE_CONTACT_SORT_KEYS.includes(sortKey as AudienceContactSortKey)) {
    return contactTable[sortKey as AudienceContactSortKey];
  }
  return contactTable.id;
}

type LatestUploadSummary = {
  id: number;
  status: string;
  progress: number;
  total_contacts: number;
  processed_contacts: number;
  error_message?: string | null;
};

async function loadAudienceContactsPage(args: {
  workspaceId: string;
  audienceIdNum: number;
  searchQuery: string;
  sortDirection: "asc" | "desc";
  sortColumn: ReturnType<typeof audienceContactSortColumn>;
  pageSize: number;
  offset: number;
}): Promise<
  | { ok: true; contacts: Array<{ contact: ContactListRow }>; totalCount: number }
  | { ok: false; error: string }
> {
  const audienceContactFilter = and(
    eq(contactAudienceTable.audience_id, args.audienceIdNum),
    eq(contactTable.workspace, args.workspaceId),
    args.searchQuery ? buildContactSearchWhere(args.searchQuery) : undefined,
  );

  try {
    // Select only columns the detail table needs — avoids SELECT * failing when
    // the review/prod DB lags schema (extra contact columns in Drizzle).
    const [contactRows, countRows] = await Promise.all([
      db
        .select({
          id: contactTable.id,
          firstname: contactTable.firstname,
          surname: contactTable.surname,
          phone: contactTable.phone,
          email: contactTable.email,
          address: contactTable.address,
          city: contactTable.city,
          other_data: contactTable.other_data,
          created_at: contactTable.created_at,
        })
        .from(contactAudienceTable)
        .innerJoin(contactTable, eq(contactAudienceTable.contact_id, contactTable.id))
        .where(audienceContactFilter)
        .orderBy(
          args.sortDirection === "asc" ? asc(args.sortColumn) : desc(args.sortColumn),
        )
        .limit(args.pageSize)
        .offset(args.offset),
      db
        .select({ value: count() })
        .from(contactAudienceTable)
        .innerJoin(contactTable, eq(contactAudienceTable.contact_id, contactTable.id))
        .where(audienceContactFilter),
    ]);

    return {
      ok: true,
      contacts: contactRows.map((row) => ({ contact: row })),
      totalCount: countRows[0]?.value ?? 0,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to load contacts",
    };
  }
}

async function loadLatestAudienceUpload(
  workspaceId: string,
  audienceIdNum: number,
): Promise<LatestUploadSummary | null> {
  const tdb = createTenantDb(workspaceId);
  try {
    const upload = await tdb.audience_upload.findFirst({
      where: eq(audienceUploadTable.audience_id, audienceIdNum),
      orderBy: (row, { desc: descFn }) => [descFn(row.created_at)],
    });
    if (!upload) return null;
    return {
      id: upload.id,
      status: upload.status ?? "unknown",
      progress:
        upload.processed_contacts && upload.total_contacts
          ? Math.round((upload.processed_contacts / upload.total_contacts) * 100)
          : 0,
      total_contacts: upload.total_contacts ?? 0,
      processed_contacts: upload.processed_contacts ?? 0,
      error_message: upload.error_message,
    };
  } catch (error) {
    logger.warn("getAudienceDetailApi latest upload lookup failed", {
      workspaceId,
      audienceId: audienceIdNum,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function getAudienceDetailApi(
  workspaceId: string,
  audienceId: string,
  searchParams: URLSearchParams,
) {
  const { page, pageSize, offset } = parsePagination(searchParams, {
    defaultPageSize: 50,
  });
  const sortKey = searchParams.get("sort_key") || "id";
  const sortDirection = searchParams.get("sort_direction") === "desc" ? "desc" : "asc";
  const searchQuery = (searchParams.get("q") ?? "").trim().replaceAll(",", " ");
  const audienceIdNum = Number(audienceId);
  const sortColumn = audienceContactSortColumn(sortKey);
  const tdb = createTenantDb(workspaceId);

  let audience: typeof audienceTable.$inferSelect;
  try {
    const found = await tdb.audience.findFirst({
      where: eq(audienceTable.id, audienceIdNum),
    });
    if (!found) {
      return { ok: false as const, error: "Audience not found", status: 404 };
    }
    audience = found;
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Failed to load audience",
      status: 500,
    };
  }

  // Contacts / upload metadata are best-effort after the audience row loads.
  // A contact join failure must not wipe the audience name (#1080).
  const [contactsResult, latestUpload] = await Promise.all([
    loadAudienceContactsPage({
      workspaceId,
      audienceIdNum,
      searchQuery,
      sortDirection,
      sortColumn,
      pageSize,
      offset,
    }),
    loadLatestAudienceUpload(workspaceId, audienceIdNum),
  ]);

  let contacts: Array<{ contact: ContactListRow }> = [];
  let totalCount = 0;
  let contactsError: string | null = null;

  if (contactsResult.ok) {
    contacts = contactsResult.contacts;
    totalCount = contactsResult.totalCount;
  } else {
    contactsError = contactsResult.error;
    logger.error("getAudienceDetailApi contacts query failed", {
      workspaceId,
      audienceId,
      error: contactsError,
    });
  }

  return {
    ok: true as const,
    audience,
    contacts,
    pagination: {
      page,
      page_size: pageSize,
      total_count: totalCount,
    } satisfies PaginationMeta,
    sorting: { sort_key: sortKey, sort_direction: sortDirection },
    search_query: searchQuery || null,
    latest_upload: latestUpload,
    contacts_error: contactsError,
  };
}
