import {
  fetchMessagePageForContact,
} from "@/lib/message-db.server";
import { logger } from "@/lib/logger.server";
import { createSignedObjectUrls } from "@/lib/object-storage.server";
import type { Message } from "@/lib/types";
import type { TenantDb } from "@/server/tenant-db";

const MESSAGES_PAGE_SIZE = 50;
const SIGNED_URL_TTL_SECONDS = 3600;

type MessageRow = Message & { inbound_media?: string[] | null };

/**
 * Inbound MMS attachments live in the `messageMedia` bucket under the keys in
 * `inbound_media`; the chat UI renders `signedUrls`, so a page with no signing
 * step shows the text and silently drops the image. Sign the whole page's keys
 * in one pass and hand each message its own URLs in stored order.
 */
async function signInboundMedia(rows: MessageRow[]): Promise<Map<string, string>> {
  const keys = [...new Set(rows.flatMap((row) => row.inbound_media ?? []))];
  if (keys.length === 0) return new Map();
  const signed = await createSignedObjectUrls("messageMedia", keys, SIGNED_URL_TTL_SECONDS);
  const byKey = new Map<string, string>();
  for (const entry of signed) {
    if (entry.signedUrl) {
      byKey.set(entry.path, entry.signedUrl);
    } else {
      logger.warn("chat inbound media could not be signed", { key: entry.path, error: entry.error });
    }
  }
  return byKey;
}

export async function fetchMessagePage({
  workspaceId,
  contactFilter,
  before,
  tdb,
}: {
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
    const chronological = [...rows].reverse() as MessageRow[];
    const signedByKey = await signInboundMedia(chronological);
    return {
      messages: chronological.map((message) => ({
        ...message,
        signedUrls: (message.inbound_media ?? [])
          .map((key) => signedByKey.get(key))
          .filter((url): url is string => Boolean(url)),
      })) as unknown as Message[],
      hasMore,
    };
  } catch (error) {
    logger.error("Error fetching messages:", error);
    return { messages: [], hasMore: false };
  }
}
