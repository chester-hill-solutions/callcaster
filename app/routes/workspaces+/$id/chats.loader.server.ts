import {
  getChatSortOption,
} from "@/lib/chat-conversation-sort";
import {
  SupabaseClient,
} from "@supabase/supabase-js";
import { data as routeData, redirect } from "react-router";
import { fetchCampaignsByType, fetchContactData, fetchConversationSummary, getUserRole } from "@/lib/database.server";
import { getWorkspaceMessagingOnboardingState } from "@/lib/messaging-onboarding.server";
import { parseOptOutKeywords } from "@/lib/chat-opt-out";
import { verifyAuth } from "@/lib/supabase.server";
import type { LoaderFunctionArgs } from "react-router";
import type { User } from "@/lib/types";

export async function loader({ request, params }: LoaderFunctionArgs) {

  const { supabaseClient, headers, user } = await verifyAuth(request);
  const { id: workspaceId } = params;
  const url = new URL(request.url);
  const contact_id = url.searchParams.get("contact_id");
  const campaign_id = url.searchParams.get("campaign_id");
  const sortBy = getChatSortOption(url.searchParams.get("sort"));
  const page = Math.max(
    1,
    Number.parseInt(url.searchParams.get("page") || "1", 10) || 1,
  );
  const pageSize = Math.min(
    100,
    Math.max(
      10,
      Number.parseInt(url.searchParams.get("pageSize") || "20", 10) || 20,
    ),
  );
  const offset = (page - 1) * pageSize;
  const contact_number = params["contact_number"];

  if (!workspaceId) {
    throw redirect("/workspaces");
  }
  const userRole = await getUserRole({
    supabaseClient: supabaseClient as SupabaseClient,
    user: user,
    workspaceId: workspaceId as string,
  });

  let optOutKeywords = parseOptOutKeywords(null);
  try {
    const onboarding = await getWorkspaceMessagingOnboardingState({
      supabaseClient,
      workspaceId: workspaceId as string,
    });
    optOutKeywords = parseOptOutKeywords(
      onboarding.businessProfile.optOutKeywords,
    );
  } catch {
    // use default keywords if onboarding not available
  }

  const [workspaceNumbers, contactData, smsCampaigns] = await Promise.all([
    supabaseClient
      .from("workspace_number")
      .select("*")
      .eq("workspace", workspaceId)
      .eq("type", "rented"),
    contact_number
      ? fetchContactData(
          supabaseClient,
          workspaceId,
          contact_id,
          contact_number,
        )
      : null,
    fetchCampaignsByType({
      supabaseClient,
      workspaceId,
      type: "message_campaign",
    }),
  ]);
  const { contact, potentialContacts, contactError } = contactData || {
    contact: null,
    potentialContacts: [],
    contactError: null,
  };
  if (contactError) {
    const contactErrorMessage =
      typeof contactError === "object" &&
      contactError !== null &&
      "message" in contactError &&
      typeof contactError.message === "string"
        ? contactError.message
        : "Failed to load contact";
    return routeData(
      {
        campaigns: smsCampaigns,
        chats: [],
        chatsError: null,
        contact: null,
        error: contactErrorMessage,
        optOutKeywords,
        pagination: {
          page,
          pageSize,
          hasMore: false,
        },
        potentialContacts: [],
        userRole,
        workspaceNumbers: workspaceNumbers?.data ?? [],
        contact_number,
      },
      { headers },
    );
  }

  const { chats, chatsError, hasMore } = await fetchConversationSummary(
    supabaseClient,
    workspaceId,
    campaign_id,
    {
      limit: pageSize,
      offset,
      sort: sortBy,
    },
  );

  return routeData(
    {
      campaigns: smsCampaigns,
      workspaceNumbers: workspaceNumbers?.data ?? [],
      chats: chats ?? [],
      chatsError:
        chatsError && typeof chatsError === "object" && "message" in chatsError
          ? String(chatsError.message)
          : null,
      potentialContacts,
      contact,
      error: null,
      optOutKeywords,
      userRole,
      contact_number,
      pagination: {
        page,
        pageSize,
        hasMore,
      },
    },
    { headers },
  );
}
