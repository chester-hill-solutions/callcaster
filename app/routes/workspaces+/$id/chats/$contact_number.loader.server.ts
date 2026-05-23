import { data as routeData, LoaderFunctionArgs, useFetcher, useLoaderData, useLocation, useOutletContext, useParams } from "react-router";
import { SupabaseClient } from "@supabase/supabase-js";
import { Message, Workspace, WorkspaceNumber } from "@/lib/types";
import { normalizePhoneNumber } from "@/lib/utils";
import { parseOptOutKeywords } from "@/lib/chat-opt-out";
import { useInfiniteScroll } from "@/hooks";
import { data as routeData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { getWorkspaceMessagingOnboardingState } from "@/lib/messaging-onboarding.server";
import { verifyAuth } from "@/lib/supabase.server";

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
            const { data, error } = await supabaseClient.storage
              .from("messageMedia")
              .createSignedUrl(file, 3600);
            return data?.signedUrl;
          }),
        );
        return { ...message, signedUrls: urls } as Message;
      } else {
        return { ...message, signedUrls: [] } as Message;
      }
    }),
  );
};

async function fetchMessagePage({
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

export async function loader({ request, params }: LoaderFunctionArgs) {


  const { id, contact_number } = params;
  const { supabaseClient, headers } = await verifyAuth(request);
  const url = new URL(request.url);
  const before = url.searchParams.get("before");
  let messages: Message[] = [];
  let hasMore = false;
  let normalizedNumber: string | null = null;
  let optOutKeywords = parseOptOutKeywords(null);

  if (id) {
    try {
      const onboarding = await getWorkspaceMessagingOnboardingState({
        supabaseClient,
        workspaceId: id,
      });
      optOutKeywords = parseOptOutKeywords(
        onboarding.businessProfile.optOutKeywords,
      );
    } catch (error) {
      logger.error("Error loading workspace opt-out keywords:", error);
    }
  }

  if (contact_number !== "new") {
    try {
      normalizedNumber = normalizePhoneNumber(contact_number || "");
    } catch {
      // use raw number below
    }

    const contactFilter = normalizedNumber ?? contact_number ?? "";
    if (contactFilter) {
      const result = await fetchMessagePage({
        supabaseClient,
        workspaceId: id as string,
        contactFilter,
        before: before || null,
      });
      messages = result.messages;
      hasMore = result.hasMore;
    }

    // Mark messages as read on initial load (no "before" = first page)
    if (normalizedNumber && !before) {
      try {
        await supabaseClient
          .from("message")
          .update({ status: "delivered" })
          .eq("workspace", id as string)
          .eq("status", "received")
          .or(`from.eq.${normalizedNumber},to.eq.${normalizedNumber}`);
      } catch (error) {
        logger.error("Error marking messages as read:", error);
      }
    }
  }

  return routeData(
    {
      messages,
      hasMore,
      contact_number: normalizedNumber || contact_number,
      optOutKeywords,
    },
    { headers },
  );
}
