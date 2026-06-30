export type QueueSyncEventType = "INSERT" | "DELETE";

export type QueueSyncRecord = {
  audience_id: number;
  campaign_id: number;
};

type DbQueryResult<T> = Promise<{ data: T | null; error: unknown | null }>;

export type DbClientLike = {
  rpc: (
    fn: string,
    args: {
      p_contact_id: number;
      p_campaign_id: number;
      p_requeue?: boolean;
    },
  ) => DbQueryResult<number>;
  from: (table: string) => {
    select: (columns?: string) => {
      eq: (col: string, val: unknown) => DbQueryResult<Array<{ contact_id: number }>>;
      in: (col: string, values: unknown[]) => DbQueryResult<unknown[]>;
    };
    insert: (rows: unknown[]) => { select: () => DbQueryResult<unknown[]> };
    delete: () => {
      eq: (col: string, val: unknown) => {
        in: (col: string, values: unknown[]) => DbQueryResult<unknown[]>;
      };
    };
  };
};

async function getContactsForAudience(
  client: DbClientLike,
  audienceId: number,
): Promise<number[]> {
  const { data, error } = await client
    .from("contact_audience")
    .select("contact_id")
    .eq("audience_id", audienceId);
  if (error) throw error;
  const rows = (data ?? []) as Array<{ contact_id: number }>;
  return rows.map((r) => r.contact_id);
}

async function handleQueueInsert(
  client: DbClientLike,
  contactIds: number[],
  campaignId: number,
) {
  const queuedEntries: number[] = [];
  for (const contactId of contactIds) {
    const { data, error } = await adminDb.rpc("handle_campaign_queue_entry", {
      p_contact_id: contactId,
      p_campaign_id: campaignId,
      p_requeue: true,
    });
    if (error) throw error;
    if (typeof data === "number") {
      queuedEntries.push(data);
    }
  }
  return queuedEntries;
}

async function handleQueueDelete(
  client: DbClientLike,
  contactIds: number[],
  campaignId: number,
) {
  const { data, error } = await client
    .from("campaign_queue")
    .delete()
    .eq("campaign_id", campaignId)
    .in("contact_id", contactIds);
  if (error) throw error;
  return data ?? [];
}

export async function handleQueueSyncEvent(args: {
  client: DbClientLike;
  type: QueueSyncEventType;
  record?: QueueSyncRecord | null;
  old_record?: QueueSyncRecord | null;
}) {
  const { client, type } = args;

  if (type === "INSERT") {
    if (!args.record) return null;
    const contactIds = await getContactsForAudience(client, args.record.audience_id);
    if (contactIds.length === 0) return [];
    return await handleQueueInsert(client, contactIds, args.record.campaign_id);
  }

  if (type === "DELETE") {
    if (!args.old_record) return null;
    const contactIds = await getContactsForAudience(
      client,
      args.old_record.audience_id,
    );
    if (contactIds.length === 0) return [];
    return await handleQueueDelete(client, contactIds, args.old_record.campaign_id);
  }

  return null;
}
