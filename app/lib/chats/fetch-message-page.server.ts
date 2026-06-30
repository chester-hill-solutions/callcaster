import {
  fetchMessagePageForContact,
} from "@/lib/message-db.server";
import { logger } from "@/lib/logger.server";
import type { Message } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TenantDb } from "@/server/tenant-db";

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
  tdb,
}: {
  supabaseClient?: SupabaseClient | null;
  workspaceId: string;
  contactFilter: string;
  before?: string | null;
  tdb?: TenantDb;
}): Promise<{ messages: Message[]; hasMore: boolean }> {
  try {
    const { messages: rows, hasMore } = await fetchMessagePageForContact(
      workspaceId,
      contactFilter,
      before,
      { tdb, pageSize: MESSAGES_PAGE_SIZE },
    );
    const chronological = [...rows].reverse() as Message[];
    if (!supabaseClient) {
      return {
        messages: chronological.map((message) => ({ ...message, signedUrls: [] })),
        hasMore,
      };
    }
    const withMedia = await getMessageMedia({
      messages: chronological,
      supabaseClient,
    });
    return { messages: withMedia, hasMore };
  } catch (error) {
    logger.error("Error fetching messages:", error);
    return { messages: [], hasMore: false };
  }
}
