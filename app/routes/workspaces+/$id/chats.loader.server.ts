import { workspaceRouteAuth } from "@/lib/workspace-route.server";
import { getChatSortOption } from "@/lib/chat-conversation-sort";
import { data as routeData, redirect } from "react-router";
import { fetchCampaignsByType } from "@/lib/database/campaign.server";
import { fetchContactData } from "@/lib/database/contact.server";
import {
  fetchConversationSummary,
  getEffectiveWorkspaceTwilioPortalConfigForWorkspace,
  getUserRole,
} from "@/lib/database/workspace.server";
import { getWorkspaceMessagingOnboardingState } from "@/lib/messaging-onboarding.server";
import { parseOptOutKeywords } from "@/lib/chat-opt-out";
import { workspace_number as workspaceNumberTable } from "@/db/schema";
import { createTenantDb } from "@/server/tenant-db";
import { eq } from "drizzle-orm";
import { defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  auth: workspaceRouteAuth,
  sideEffects: ["db-read"],
  handler: async ({ params, url, auth }) => {
  const { headers, user, workspaceId, userRole } = auth;
  const contact_id = url.searchParams.get("contact_id");
  const campaign_id = url.searchParams.get("campaign_id");
  const search = url.searchParams.get("search") ?? undefined;
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

  const tdb = createTenantDb(workspaceId);

  let optOutKeywords = parseOptOutKeywords(null);
  try {
    const onboarding = await getWorkspaceMessagingOnboardingState({
      workspaceId,
    });
    optOutKeywords = parseOptOutKeywords(
      onboarding.businessProfile.optOutKeywords,
    );
  } catch {
    // use default keywords if onboarding not available
  }

  const [workspaceNumbers, contactData, smsCampaigns, portalConfig] =
    await Promise.all([
    tdb.workspace_number.findMany({
      where: eq(workspaceNumberTable.type, "rented"),
    }),
    contact_number
      ? fetchContactData(
          workspaceId,
          contact_id,
          contact_number,
          tdb,
        )
      : null,
    fetchCampaignsByType({
      workspaceId,
      type: "message_campaign",
      tdb,
    }),
    getEffectiveWorkspaceTwilioPortalConfigForWorkspace({ workspaceId }),
  ]);
  const messagingServiceReady =
    portalConfig.sendMode === "messaging_service" &&
    Boolean(portalConfig.messagingServiceSid?.trim());
  const senderSelection = {
    mode: messagingServiceReady
      ? ("messaging_service" as const)
      : ("from_number" as const),
    messagingServiceReady,
  };
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
        senderSelection,
        userRole,
        workspaceNumbers: workspaceNumbers ?? [],
        contact_number,
      },
      { headers },
    );
  }

  const { chats, chatsError, hasMore } = await fetchConversationSummary(
    workspaceId,
    campaign_id,
    {
      limit: pageSize,
      offset,
      sort: sortBy,
      search,
    },
  );

  return routeData(
    {
      campaigns: smsCampaigns,
      workspaceNumbers: workspaceNumbers ?? [],
      chats: chats ?? [],
      chatsError:
        chatsError && typeof chatsError === "object" && "message" in chatsError
          ? String(chatsError.message)
          : null,
      potentialContacts,
      contact,
      error: null,
      optOutKeywords,
      senderSelection,
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
  },
});
