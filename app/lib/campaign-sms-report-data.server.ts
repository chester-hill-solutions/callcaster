import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import {
  campaign as campaignTable,
  contact as contactTable,
  message as messageTable,
} from "@/db/schema";
import { createTenantDb } from "@/server/tenant-db";

export type ReportMessage = {
  sid: string;
  status: string | null;
  from: string | null;
  to: string | null;
  body: string | null;
  direction?: string | null;
  num_segments: string | null;
  error_code: number | null;
  date_created: Date | null;
  date_sent: Date | null;
  contact_id: number | null;
  firstname?: string | null;
  surname?: string | null;
  phone?: string | null;
  external_id?: string | null;
};

export type CampaignReportRow = {
  id: number;
  title: string;
  type: string | null;
  status: string | null;
  start_date: string | null;
  caller_id: string | null;
  body_text: string | null;
  is_sample: boolean;
};

export type CampaignReportData = {
  campaign: CampaignReportRow;
  outbound: ReportMessage[];
  outboundWithContacts: ReportMessage[];
  inboundWithContacts: ReportMessage[];
  staff: ReportMessage[];
};

const digits = (value: string | null | undefined) =>
  (value ?? "").replace(/\D/g, "");
const contactName = (message: ReportMessage) =>
  [message.firstname, message.surname].filter(Boolean).join(" ").trim() ||
  "Unknown";
function validateCampaign(campaign: CampaignReportRow | undefined) {
  if (!campaign) throw new Error("Campaign not found");
  if (campaign.type !== "message")
    throw new Error("This report is for message campaigns");
  if (campaign.status !== "complete")
    throw new Error("The campaign must be complete before it can be exported");
  if (
    campaign.is_sample ||
    /(^|[^a-z0-9])test([^a-z0-9]|$)/i.test(campaign.title)
  ) {
    throw new Error("Test campaigns cannot be exported");
  }
  return campaign;
}

async function loadCampaignThreadMessages(
  tdb: ReturnType<typeof createTenantDb>,
  campaignId: number,
  workspaceId: string,
) {
  const recipient = sql`case when ${messageTable.direction} = 'inbound'
    then ${messageTable.from} else ${messageTable.to} end`;
  const sender = sql`case when ${messageTable.direction} = 'inbound'
    then ${messageTable.to} else ${messageTable.from} end`;
  // Attribute a reply to the last campaign send on this exact number pair.
  // A later campaign, including a test, starts a new attribution window.
  return tdb.message.findMany({
    where: and(
      or(
        isNull(messageTable.campaign_id),
        and(
          eq(messageTable.campaign_id, campaignId),
          eq(messageTable.direction, "inbound"),
        ),
      ),
      sql`exists (
        select 1 from ${messageTable} as blast
        where blast.workspace = ${workspaceId}
          and blast.campaign_id = ${campaignId}
          and blast.direction <> 'inbound'
          and coalesce(blast.date_sent, blast.date_created) <= ${messageTable.date_created}
          and (blast.date_sent is not null or blast.status in ('sent', 'delivered', 'read'))
          and regexp_replace(blast."to", '[^0-9]', '', 'g') = regexp_replace(${recipient}, '[^0-9]', '', 'g')
          and regexp_replace(blast."from", '[^0-9]', '', 'g') = regexp_replace(${sender}, '[^0-9]', '', 'g')
          and not exists (
            select 1 from ${messageTable} as next_blast
            where next_blast.workspace = ${workspaceId}
              and next_blast.campaign_id is not null
              and next_blast.campaign_id <> ${campaignId}
              and next_blast.direction <> 'inbound'
              and coalesce(next_blast.date_sent, next_blast.date_created) >= coalesce(blast.date_sent, blast.date_created)
              and coalesce(next_blast.date_sent, next_blast.date_created) <= ${messageTable.date_created}
              and (next_blast.date_sent is not null or next_blast.status in ('sent', 'delivered', 'read'))
              and regexp_replace(next_blast."to", '[^0-9]', '', 'g') = regexp_replace(blast."to", '[^0-9]', '', 'g')
              and regexp_replace(next_blast."from", '[^0-9]', '', 'g') = regexp_replace(blast."from", '[^0-9]', '', 'g')
          )
      )`,
    ),
    orderBy: [asc(messageTable.date_created), asc(messageTable.sid)],
  });
}

export async function loadCampaignReportData(
  workspaceId: string,
  campaignId: number,
): Promise<CampaignReportData> {
  const tdb = createTenantDb(workspaceId);
  const campaign = validateCampaign(
    (await tdb.campaign.findFirst({
      where: eq(campaignTable.id, campaignId),
      columns: {
        id: true,
        title: true,
        type: true,
        status: true,
        start_date: true,
        caller_id: true,
        body_text: true,
        is_sample: true,
      },
    })) as CampaignReportRow | undefined,
  );
  const messages = (await tdb.message.findMany({
    where: eq(messageTable.campaign_id, campaignId),
    orderBy: asc(messageTable.date_created),
  })) as ReportMessage[];
  const outbound = messages.filter(
    (message) => message.direction !== "inbound",
  );
  const threadMessages = await loadCampaignThreadMessages(
    tdb,
    campaignId,
    workspaceId,
  );
  const contactIds = [
    ...new Set(
      [...outbound, ...threadMessages].flatMap((message) =>
        message.contact_id == null ? [] : [message.contact_id],
      ),
    ),
  ];
  const contacts = contactIds.length
    ? await tdb.contact.findMany({
        where: inArray(contactTable.id, contactIds),
      })
    : [];
  const contactById = new Map(
    contacts.map((contact) => [Number(contact.id), contact] as const),
  );
  const outboundWithContacts = outbound.map((message) => ({
    ...message,
    ...(contactById.get(Number(message.contact_id)) ?? {}),
  }));
  const inbound = threadMessages.filter(
    (message) => message.direction === "inbound",
  );
  const outboundContacts = new Map<string, { name: string; externalId: string | null }>();
  for (const message of outboundWithContacts) {
    const phone = digits(message.to);
    if (!phone) continue;
    const existing = outboundContacts.get(phone);
    const externalId = message.external_id ?? null;
    if (!existing) {
      outboundContacts.set(phone, { name: contactName(message), externalId });
    } else if (existing.externalId !== externalId) {
      existing.externalId = null;
    }
  }

  function withRecipient(row: ReportMessage, phone: string | null) {
    const message = {
      ...row,
      ...(contactById.get(Number(row.contact_id)) ?? {}),
    };
    const fallback = outboundContacts.get(digits(phone));
    return {
      ...message,
      // Conflicting legacy contacts must not give a reply an arbitrary identity.
      external_id: row.contact_id == null
        ? fallback?.externalId ?? null
        : message.external_id ?? null,
    };
  }
  const inboundWithContacts = inbound.map(row => {
    const message = withRecipient(row, row.from);
    if (message.firstname || message.surname) return message;
    return { ...message, firstname: outboundContacts.get(digits(row.from))?.name ?? "Unknown" };
  });
  const staff = threadMessages
    .filter(message => message.direction !== "inbound")
    .map(row => withRecipient(row, row.to));
  return {
    campaign,
    outbound,
    outboundWithContacts,
    inboundWithContacts,
    staff,
  };
}
