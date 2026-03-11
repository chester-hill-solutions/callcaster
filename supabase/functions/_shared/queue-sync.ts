export type QueueSyncEventType = "INSERT" | "DELETE";

export type QueueSyncRecord = {
  audience_id: number;
  campaign_id: number;
};

type SupabaseQueryResult<T> = Promise<{ data: T | null; error: unknown | null }>;

export type SupabaseLike = {
  rpc: (
    fn: string,
    args: {
      p_contact_id: number;
      p_campaign_id: number;
      p_requeue?: boolean;
    },
  ) => SupabaseQueryResult<number>;
  from: (table: string) => {
    select: (columns?: string) => {
      eq: (col: string, val: unknown) => any;
      in: (col: string, values: unknown[]) => SupabaseQueryResult<any[]>;
    };
    insert: (rows: any[]) => { select: () => SupabaseQueryResult<any[]> };
    delete: () => {
      eq: (col: string, val: unknown) => {
        in: (col: string, values: unknown[]) => SupabaseQueryResult<any[]>;
      };
    };
  };
};

async function getContactsForAudience(
  supabase: SupabaseLike,
  audienceId: number,
): Promise<number[]> {
  const { data, error } = await supabase
    .from("contact_audience")
    .select("contact_id")
    .eq("audience_id", audienceId);
  if (error) throw error;
  const rows = (data ?? []) as Array<{ contact_id: number }>;
  return rows.map((r) => r.contact_id);
}

async function handleQueueInsert(
  supabase: SupabaseLike,
  contactIds: number[],
  campaignId: number,
) {
  const queuedEntries: number[] = [];
  for (const contactId of contactIds) {
    const { data, error } = await supabase.rpc("handle_campaign_queue_entry", {
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
  supabase: SupabaseLike,
  contactIds: number[],
  campaignId: number,
) {
  const { data, error } = await supabase
    .from("campaign_queue")
    .delete()
    .eq("campaign_id", campaignId)
    .in("contact_id", contactIds);
  if (error) throw error;
  return data ?? [];
}

export async function handleQueueSyncEvent(args: {
  supabase: SupabaseLike;
  type: QueueSyncEventType;
  record?: QueueSyncRecord | null;
  old_record?: QueueSyncRecord | null;
}) {
  const { supabase, type } = args;

  if (type === "INSERT") {
    if (!args.record) return null;
    const contactIds = await getContactsForAudience(supabase, args.record.audience_id);
    if (contactIds.length === 0) return [];
    return await handleQueueInsert(supabase, contactIds, args.record.campaign_id);
  }

  if (type === "DELETE") {
    if (!args.old_record) return null;
    const contactIds = await getContactsForAudience(
      supabase,
      args.old_record.audience_id,
    );
    if (contactIds.length === 0) return [];
    return await handleQueueDelete(supabase, contactIds, args.old_record.campaign_id);
  }

  return null;
}

