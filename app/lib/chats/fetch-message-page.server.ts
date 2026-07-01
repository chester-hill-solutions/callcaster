import {
  fetchMessagePageForContact,
} from "@/lib/message-db.server";
import { logger } from "@/lib/logger.server";
import type { Message } from "@/lib/types";
import type { TenantDb } from "@/server/tenant-db";

const MESSAGES_PAGE_SIZE = 50;

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
    const chronological = [...rows].reverse() as Message[];
    return {
      messages: chronological.map((message) => ({ ...message, signedUrls: [] })) as unknown as Message[],
      hasMore,
    };
  } catch (error) {
    logger.error("Error fetching messages:", error);
    return { messages: [], hasMore: false };
  }
}
