import { data as routeData } from "react-router";
import { getWorkspaceMessagingOnboardingState } from "@/lib/messaging-onboarding.server";
import { logger } from "@/lib/logger.server";
import { Message, Workspace, WorkspaceNumber } from "@/lib/types";
import { normalizePhoneNumber } from "@/lib/utils";
import { parseOptOutKeywords } from "@/lib/chat-opt-out";
import { SupabaseClient } from "@supabase/supabase-js";
import { useInfiniteScroll } from "@/hooks";
import { verifyAuth } from "@/lib/supabase.server";
import type { LoaderFunctionArgs } from "react-router";

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
