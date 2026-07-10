import { getWorkspaceRouteContext } from "@/lib/workspace-route.server";
import { data as routeData } from "react-router";
import { getWorkspaceMessagingOnboardingState } from "@/lib/messaging-onboarding.server";
import { logger } from "@/lib/logger.server";
import {
  countDistinctNumbersForConversation,
  markReceivedMessagesAsDeliveredForPhone,
} from "@/lib/message-db.server";
import { normalizePhoneNumber } from "@/lib/utils";
import { parseOptOutKeywords } from "@/lib/chat-opt-out";
import { createTenantDb } from "@/server/tenant-db";
import type { LoaderFunctionArgs } from "react-router";
import type { Message } from "@/lib/types";
import { fetchMessagePage } from "./$contact_number.messages.server";

export async function loader({ request, params, context, url}: LoaderFunctionArgs) {
  const { id, contact_number } = params;
  const { headers, user, workspaceId } = getWorkspaceRouteContext(context);
  const before = url.searchParams.get("before");
  let messages: Message[] = [];
  let hasMore = false;
  let normalizedNumber: string | null = null;
  let optOutKeywords = parseOptOutKeywords(null);
  let multipleNumbersUsed = false;

  if (id) {
    try {
      const onboarding = await getWorkspaceMessagingOnboardingState({
        workspaceId: id,
      });
      optOutKeywords = parseOptOutKeywords(
        onboarding.businessProfile.optOutKeywords,
      );
    } catch (error) {
      logger.error("Error loading workspace opt-out keywords:", error);
    }
  }

  const tdb = id ? createTenantDb(id) : null;

  if (contact_number !== "new") {
    try {
      normalizedNumber = normalizePhoneNumber(contact_number || "");
    } catch {
      // use raw number below
    }

    const contactFilter = normalizedNumber ?? contact_number ?? "";
    if (contactFilter && id) {
      const result = await fetchMessagePage({
        workspaceId: id,
        contactFilter,
        before: before || null,
        tdb: tdb ?? undefined,
      });
      messages = result.messages;
      hasMore = result.hasMore;
    }

    // Mark messages as read on initial load (no "before" = first page)
    if (normalizedNumber && !before && id) {
      try {
        await markReceivedMessagesAsDeliveredForPhone(id, normalizedNumber, {
          tdb: tdb ?? undefined,
        });
      } catch (error) {
        logger.error("Error marking messages as read:", error);
      }
    }

    // Only computed on the initial page load (not on "load older" pagination
    // fetches) to keep this cheap.
    if (contactFilter && id && !before) {
      try {
        const distinctNumbers = await countDistinctNumbersForConversation(
          id,
          contactFilter,
          { tdb: tdb ?? undefined },
        );
        multipleNumbersUsed = distinctNumbers > 1;
      } catch (error) {
        logger.error("Error counting distinct numbers for conversation:", error);
      }
    }
  }

  return routeData(
    {
      messages,
      hasMore,
      contact_number: normalizedNumber || contact_number,
      optOutKeywords,
      multipleNumbersUsed,
    },
    { headers },
  );
}
