import { logger } from "@/lib/logger.server";
import type { Message } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

const MESSAGES_PAGE_SIZE = 50;

const getMessageMedia = async ({
  messages,
  supabaseClient,
}: {
  messages: Message[];
  supabaseClient: SupabaseClient;
}): Promise<Message[]> => {
  return Promise.all(
    (messages ?? []).map(async (message: Message) => {
      const inboundMedia = message?.inbound_media ?? [];
      if (inboundMedia.filter(Boolean).length > 0) {
        const urls = await Promise.all(
          inboundMedia.map(async (file) => {
            const { data } = await supabaseClient.storage
              .from("messageMedia")
              .createSignedUrl(file, 3600);
            return data?.signedUrl;
          }),
        );
        return { ...message, signedUrls: urls } as Message;
      }
      return { ...message, signedUrls: [] } as Message;
    }),
  );
};

export async function fetchMessagePage({
  supabaseClient,
  workspaceId,
  contactFilter,
  before,
}: {
  supabaseClient: SupabaseClient;
  workspaceId: string;
  contactFilter: string;
  before?: string | null;
}): Promise<{ messages: Message[]; hasMore: boolean }> {
  let query = supabaseClient
    .from("message")
    .select(`*, outreach_attempt(campaign_id)`)
    .or(`from.eq.${contactFilter},to.eq.${contactFilter}`)
    .eq("workspace", workspaceId)
    .not("date_created", "is", null)
    .neq("status", "failed")
    .order("date_created", { ascending: false })
    .limit(MESSAGES_PAGE_SIZE + 1);

  if (before) {
    query = query.lt("date_created", before);
  }

  const { data: rows, error } = await query;
  if (error) {
    logger.error("Error fetching messages:", error);
    return { messages: [], hasMore: false };
  }

  const hasMore = (rows?.length ?? 0) > MESSAGES_PAGE_SIZE;
  const slice = (rows ?? []).slice(0, MESSAGES_PAGE_SIZE) as Message[];
  const chronological = slice.reverse();
  const withMedia = await getMessageMedia({
    messages: chronological,
    supabaseClient,
  });
  return { messages: withMedia, hasMore };
}
