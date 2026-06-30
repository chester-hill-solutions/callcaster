import {
  and,
  asc,
  count,
  eq,
  exists,
  ilike,
  inArray,
  isNotNull,
  isNull,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { escapeIlikeTerm } from "@/lib/contacts/search.server";
import {
  QUEUE_LIFECYCLE_ASSIGNED,
  QUEUE_STATUS_DEQUEUED,
  QUEUE_STATUS_QUEUED,
  type QueueStatusFilter,
} from "@/lib/queue-status";
import {
  audience as audienceTable,
  campaign_queue as campaignQueueTable,
  contact as contactTable,
  contact_audience as contactAudienceTable,
  outreach_attempt as outreachAttemptTable,
} from "@/db/schema";
import { db } from "@/server/db";

export type QueueSearchFilters = {
  name: string;
  phone: string;
  email: string;
  address: string;
  audiences: string;
  disposition: string;
  queueStatus: string;
};

function queueStatusWhere(queueStatus: QueueStatusFilter): SQL {
  if (queueStatus === "queued") {
    return and(
      eq(campaignQueueTable.queue_state, QUEUE_STATUS_QUEUED),
      isNull(campaignQueueTable.dequeued_at),
    )!;
  }

  if (queueStatus === "completed") {
    return or(
      eq(campaignQueueTable.queue_state, QUEUE_STATUS_DEQUEUED),
      isNotNull(campaignQueueTable.dequeued_at),
    )!;
  }

  if (queueStatus === "assigned") {
    return and(
      eq(campaignQueueTable.queue_state, QUEUE_LIFECYCLE_ASSIGNED),
      isNull(campaignQueueTable.dequeued_at),
    )!;
  }

  return and(
    isNotNull(campaignQueueTable.provider_status),
    isNull(campaignQueueTable.dequeued_at),
  )!;
}

export function buildCampaignQueueSearchWhere(
  campaignId: number,
  filters: QueueSearchFilters,
  query = "",
): SQL {
  const conditions: SQL[] = [eq(campaignQueueTable.campaign_id, campaignId)];

  const nameTerm = escapeIlikeTerm(filters.name || query);
  if (nameTerm) {
    const pattern = `%${nameTerm}%`;
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(contactTable)
          .where(
            and(
              eq(contactTable.id, campaignQueueTable.contact_id),
              or(
                ilike(contactTable.firstname, pattern),
                ilike(contactTable.surname, pattern),
              ),
            ),
          ),
      ),
    );
  }

  if (filters.phone) {
    const pattern = `%${escapeIlikeTerm(filters.phone)}%`;
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(contactTable)
          .where(
            and(
              eq(contactTable.id, campaignQueueTable.contact_id),
              ilike(contactTable.phone, pattern),
            ),
          ),
      ),
    );
  }

  if (filters.email) {
    const pattern = `%${escapeIlikeTerm(filters.email)}%`;
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(contactTable)
          .where(
            and(
              eq(contactTable.id, campaignQueueTable.contact_id),
              ilike(contactTable.email, pattern),
            ),
          ),
      ),
    );
  }

  if (filters.address) {
    const pattern = `%${escapeIlikeTerm(filters.address)}%`;
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(contactTable)
          .where(
            and(
              eq(contactTable.id, campaignQueueTable.contact_id),
              ilike(contactTable.address, pattern),
            ),
          ),
      ),
    );
  }

  if (filters.disposition) {
    if (filters.disposition === "unknown") {
      conditions.push(
        exists(
          db
            .select({ one: sql`1` })
            .from(outreachAttemptTable)
            .where(
              and(
                eq(outreachAttemptTable.contact_id, campaignQueueTable.contact_id),
                isNull(outreachAttemptTable.disposition),
              ),
            ),
        ),
      );
    } else {
      conditions.push(
        exists(
          db
            .select({ one: sql`1` })
            .from(outreachAttemptTable)
            .where(
              and(
                eq(outreachAttemptTable.contact_id, campaignQueueTable.contact_id),
                eq(outreachAttemptTable.disposition, filters.disposition),
              ),
            ),
        ),
      );
    }
  }

  if (filters.queueStatus) {
    conditions.push(queueStatusWhere(filters.queueStatus as QueueStatusFilter));
  }

  if (filters.audiences) {
    const audienceId = Number(filters.audiences);
    if (Number.isFinite(audienceId)) {
      conditions.push(
        exists(
          db
            .select({ one: sql`1` })
            .from(contactAudienceTable)
            .where(
              and(
                eq(contactAudienceTable.contact_id, campaignQueueTable.contact_id),
                eq(contactAudienceTable.audience_id, audienceId),
              ),
            ),
        ),
      );
    }
  }

  return and(...conditions)!;
}

/** Rows with a non-empty contact phone (matches legacy `contact!inner` queue counts). */
export function buildDialableCampaignQueueWhere(campaignId: number, extra?: SQL): SQL {
  const dialableContact = exists(
    db
      .select({ one: sql`1` })
      .from(contactTable)
      .where(
        and(
          eq(contactTable.id, campaignQueueTable.contact_id),
          isNotNull(contactTable.phone),
          ne(contactTable.phone, ""),
        ),
      ),
  );

  return and(
    eq(campaignQueueTable.campaign_id, campaignId),
    dialableContact,
    extra,
  )!;
}

export function buildCompletedCampaignQueueWhere(campaignId: number): SQL {
  return buildDialableCampaignQueueWhere(campaignId, queueStatusWhere("completed"));
}

export async function fetchCampaignQueueWithContacts(args: {
  campaignId: number;
  onlyQueued?: boolean;
}) {
  const where = args.onlyQueued
    ? and(
        eq(campaignQueueTable.campaign_id, args.campaignId),
        queueStatusWhere("queued"),
      )
    : eq(campaignQueueTable.campaign_id, args.campaignId);

  const queueRows = await db.select().from(campaignQueueTable).where(where);
  if (queueRows.length === 0) {
    return [];
  }

  const contactIds = [...new Set(queueRows.map((row) => row.contact_id))];
  const contacts = await db
    .select()
    .from(contactTable)
    .where(inArray(contactTable.id, contactIds));
  const contactById = new Map(contacts.map((contact) => [contact.id, contact]));

  return queueRows.map((queueRow) => {
    const contact = contactById.get(queueRow.contact_id);
    if (!contact) {
      throw new Error(`Missing contact ${queueRow.contact_id} for queue row ${queueRow.id}`);
    }
    return { ...queueRow, contact };
  });
}

export async function countCompletedCampaignQueueRows(campaignId: number): Promise<number> {
  return countCampaignQueueRows(
    campaignId,
    and(eq(campaignQueueTable.campaign_id, campaignId), queueStatusWhere("completed")),
  );
}

export async function fetchActiveCampaignQueueWithContacts(args: {
  campaignId: number;
  limit: number;
}) {
  const queueRows = await db
    .select()
    .from(campaignQueueTable)
    .where(
      and(
        eq(campaignQueueTable.campaign_id, args.campaignId),
        isNull(campaignQueueTable.dequeued_at),
      ),
    )
    .orderBy(asc(campaignQueueTable.attempts), asc(campaignQueueTable.queue_order))
    .limit(args.limit);

  if (queueRows.length === 0) {
    return [];
  }

  const contactIds = [...new Set(queueRows.map((row) => row.contact_id))];
  const contacts = await db
    .select()
    .from(contactTable)
    .where(inArray(contactTable.id, contactIds));
  const contactById = new Map(contacts.map((contact) => [contact.id, contact]));

  return queueRows.map((queueRow) => {
    const contact = contactById.get(queueRow.contact_id);
    if (!contact) {
      throw new Error(`Missing contact ${queueRow.contact_id} for queue row ${queueRow.id}`);
    }
    return { ...queueRow, contact };
  });
}

export async function countDialableCampaignQueueRows(campaignId: number): Promise<number> {
  return countCampaignQueueRows(
    campaignId,
    buildDialableCampaignQueueWhere(campaignId),
  );
}

export async function countDialableQueuedCampaignQueueRows(campaignId: number): Promise<number> {
  return countCampaignQueueRows(
    campaignId,
    buildDialableCampaignQueueWhere(campaignId, queueStatusWhere("queued")),
  );
}

export async function countDialableCompletedCampaignQueueRows(
  campaignId: number,
): Promise<number> {
  return countCampaignQueueRows(campaignId, buildCompletedCampaignQueueWhere(campaignId));
}

export async function fetchDialableCampaignQueueWithContacts(args: {
  campaignId: number;
  limit: number;
}) {
  const where = buildDialableCampaignQueueWhere(args.campaignId);
  const queueRows = await db
    .select()
    .from(campaignQueueTable)
    .where(where)
    .orderBy(asc(campaignQueueTable.queue_order), asc(campaignQueueTable.id))
    .limit(args.limit);

  if (queueRows.length === 0) {
    return [];
  }

  const contactIds = [...new Set(queueRows.map((row) => row.contact_id))];
  const contacts = await db
    .select()
    .from(contactTable)
    .where(inArray(contactTable.id, contactIds));
  const contactById = new Map(contacts.map((contact) => [contact.id, contact]));

  return queueRows.map((queueRow) => {
    const contact = contactById.get(queueRow.contact_id);
    if (!contact) {
      throw new Error(`Missing contact ${queueRow.contact_id} for queue row ${queueRow.id}`);
    }
    return { ...queueRow, contact };
  });
}

export async function countCampaignQueueRows(
  campaignId: number,
  where?: SQL,
): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(campaignQueueTable)
    .where(where ?? eq(campaignQueueTable.campaign_id, campaignId));
  return row?.value ?? 0;
}

export async function countQueuedCampaignQueueRows(campaignId: number): Promise<number> {
  return countCampaignQueueRows(
    campaignId,
    and(
      eq(campaignQueueTable.campaign_id, campaignId),
      queueStatusWhere("queued"),
    ),
  );
}

export async function searchCampaignQueueIds(args: {
  campaignId: number;
  filters: QueueSearchFilters;
}): Promise<number[]> {
  const rows = await db
    .select({ id: campaignQueueTable.id })
    .from(campaignQueueTable)
    .where(buildCampaignQueueSearchWhere(args.campaignId, args.filters));
  return rows.map((row) => row.id);
}

export type CampaignQueueApiItem = typeof campaignQueueTable.$inferSelect & {
  contact: typeof contactTable.$inferSelect & {
    outreach_attempt: Array<{
      id: number;
      disposition: string | null;
      campaign_id: number;
    }>;
    contact_audience: Array<{ audience: { name: string | null } | null }>;
  };
};

export async function fetchCampaignQueuePage(args: {
  campaignId: number;
  filters: QueueSearchFilters;
  offset: number;
  limit: number;
}): Promise<{ items: CampaignQueueApiItem[]; totalCount: number }> {
  const where = buildCampaignQueueSearchWhere(args.campaignId, args.filters);

  const [totalCount, queueRows] = await Promise.all([
    countCampaignQueueRows(args.campaignId, where),
    db
      .select()
      .from(campaignQueueTable)
      .where(where)
      .orderBy(asc(campaignQueueTable.queue_order), asc(campaignQueueTable.id))
      .limit(args.limit)
      .offset(args.offset),
  ]);

  if (queueRows.length === 0) {
    return { items: [], totalCount };
  }

  const contactIds = [...new Set(queueRows.map((row) => row.contact_id))];
  const campaignIdNum = args.campaignId;

  const [contacts, attempts, audienceLinks] = await Promise.all([
    db.select().from(contactTable).where(inArray(contactTable.id, contactIds)),
    db
      .select({
        id: outreachAttemptTable.id,
        disposition: outreachAttemptTable.disposition,
        campaign_id: outreachAttemptTable.campaign_id,
        contact_id: outreachAttemptTable.contact_id,
      })
      .from(outreachAttemptTable)
      .where(
        and(
          inArray(outreachAttemptTable.contact_id, contactIds),
          eq(outreachAttemptTable.campaign_id, campaignIdNum),
        ),
      ),
    db
      .select({
        contact_id: contactAudienceTable.contact_id,
        audience_id: contactAudienceTable.audience_id,
        name: audienceTable.name,
      })
      .from(contactAudienceTable)
      .leftJoin(audienceTable, eq(contactAudienceTable.audience_id, audienceTable.id))
      .where(inArray(contactAudienceTable.contact_id, contactIds)),
  ]);

  const contactById = new Map(contacts.map((contact) => [contact.id, contact]));
  const attemptsByContactId = new Map<number, typeof attempts>();
  for (const attempt of attempts) {
    const existing = attemptsByContactId.get(attempt.contact_id) ?? [];
    existing.push(attempt);
    attemptsByContactId.set(attempt.contact_id, existing);
  }

  const audiencesByContactId = new Map<
    number,
    Array<{ audience: { name: string | null } | null }>
  >();
  for (const link of audienceLinks) {
    const existing = audiencesByContactId.get(link.contact_id) ?? [];
    existing.push({ audience: { name: link.name } });
    audiencesByContactId.set(link.contact_id, existing);
  }

  const items: CampaignQueueApiItem[] = queueRows.map((queueRow) => {
    const contact = contactById.get(queueRow.contact_id);
    if (!contact) {
      throw new Error(`Missing contact ${queueRow.contact_id} for queue row ${queueRow.id}`);
    }

    return {
      ...queueRow,
      contact: {
        ...contact,
        outreach_attempt: attemptsByContactId.get(queueRow.contact_id) ?? [],
        contact_audience: audiencesByContactId.get(queueRow.contact_id) ?? [],
      },
    };
  });

  return { items, totalCount };
}

export async function fetchCampaignQueueItemWithContact(args: {
  campaignId: number;
  queueId: number;
}): Promise<CampaignQueueApiItem | null> {
  const queueRows = await db
    .select()
    .from(campaignQueueTable)
    .where(
      and(
        eq(campaignQueueTable.id, args.queueId),
        eq(campaignQueueTable.campaign_id, args.campaignId),
      ),
    )
    .limit(1);

  const queueRow = queueRows[0];
  if (!queueRow) {
    return null;
  }

  const contactIds = [queueRow.contact_id];
  const campaignIdNum = args.campaignId;

  const [contacts, attempts, audienceLinks] = await Promise.all([
    db.select().from(contactTable).where(inArray(contactTable.id, contactIds)),
    db
      .select({
        id: outreachAttemptTable.id,
        disposition: outreachAttemptTable.disposition,
        campaign_id: outreachAttemptTable.campaign_id,
        contact_id: outreachAttemptTable.contact_id,
      })
      .from(outreachAttemptTable)
      .where(
        and(
          inArray(outreachAttemptTable.contact_id, contactIds),
          eq(outreachAttemptTable.campaign_id, campaignIdNum),
        ),
      ),
    db
      .select({
        contact_id: contactAudienceTable.contact_id,
        audience_id: contactAudienceTable.audience_id,
        name: audienceTable.name,
      })
      .from(contactAudienceTable)
      .leftJoin(audienceTable, eq(contactAudienceTable.audience_id, audienceTable.id))
      .where(inArray(contactAudienceTable.contact_id, contactIds)),
  ]);

  const contact = contacts[0];
  if (!contact) {
    return null;
  }

  const attemptsForContact = attempts.filter((attempt) => attempt.contact_id === queueRow.contact_id);
  const audiencesForContact = audienceLinks
    .filter((link) => link.contact_id === queueRow.contact_id)
    .map((link) => ({ audience: { name: link.name } }));

  return {
    ...queueRow,
    contact: {
      ...contact,
      outreach_attempt: attemptsForContact,
      contact_audience: audiencesForContact,
    },
  };
}

/** Map Drizzle hydration shape to queue UI (`contact.audiences` from nested links). */
export function mapCampaignQueueItemForUi(item: CampaignQueueApiItem) {
  return {
    ...item,
    contact: {
      ...item.contact,
      audiences: item.contact.contact_audience
        .map((link) => link.audience)
        .filter((audience): audience is { name: string | null } => audience != null)
        .map((audience) => ({ name: audience.name ?? "" })),
    },
  };
}
