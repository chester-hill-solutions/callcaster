import type { Contact } from "@/lib/types";
import type { ConversationSummary } from "@/lib/chat-conversation-sort";
import type { Tables } from "@/lib/database.types";

type LatestMessage = Pick<
  Tables<"message">,
  "body" | "date_created" | "from" | "to" | "sid" | "status"
>;

type AudienceUploadRow = Tables<"audience_upload">;

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? `Request failed (${response.status})`);
  }
  return payload;
}

export async function fetchContactsByPhone(
  workspaceId: string,
  phone: string,
): Promise<Contact[]> {
  const params = new URLSearchParams({ phone });
  const response = await fetch(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/contacts?${params}`,
  );
  const payload = await parseJsonResponse<{ contacts: Contact[] }>(response);
  return payload.contacts ?? [];
}

export async function fetchLatestMessageForPhone(
  workspaceId: string,
  phone: string,
): Promise<LatestMessage | null> {
  const params = new URLSearchParams({ latest: "1" });
  const response = await fetch(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/conversations/${encodeURIComponent(phone)}?${params}`,
  );
  const payload = await parseJsonResponse<{ latest_message: LatestMessage | null }>(response);
  return payload.latest_message ?? null;
}

export async function markConversationRead(
  workspaceId: string,
  contactNumber: string,
  options?: { messageSid?: string },
): Promise<void> {
  const response = await fetch(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/conversations/${encodeURIComponent(contactNumber)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(options?.messageSid ? { sid: options.messageSid } : {}),
    },
  );
  await parseJsonResponse<{ ok: boolean }>(response);
}

export async function fetchConversationSummaries(
  workspaceId: string,
  searchParams?: URLSearchParams,
): Promise<ConversationSummary[]> {
  const params = searchParams ?? new URLSearchParams();
  const response = await fetch(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/conversations?${params}`,
  );
  const payload = await parseJsonResponse<{ conversations: ConversationSummary[] }>(response);
  return payload.conversations ?? [];
}

export async function fetchAudienceUploads(
  workspaceId: string,
  audienceId: number,
): Promise<AudienceUploadRow[]> {
  const response = await fetch(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/audiences/${audienceId}/uploads`,
  );
  const payload = await parseJsonResponse<{ uploads: AudienceUploadRow[] }>(response);
  return payload.uploads ?? [];
}

export async function fetchCampaignQueueItemWithContact(
  campaignId: string | number,
  queueId: number,
): Promise<(Tables<"campaign_queue"> & { contact: Contact }) | null> {
  const params = new URLSearchParams({ queue_id: String(queueId) });
  const response = await fetch(
    `/api/campaigns/${encodeURIComponent(String(campaignId))}/queue?${params}`,
  );
  const payload = await parseJsonResponse<{
    item: (Tables<"campaign_queue"> & { contact: Contact }) | null;
  }>(response);
  return payload.item ?? null;
}
