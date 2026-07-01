import { createCampaign, requireWorkspaceAccess } from "@/lib/database.server";
import {
  createScriptForCampaign,
  linkAudiencesToNewCampaign,
  validateCreateWithScriptPreflight,
} from "@/lib/create-with-script.server";
import { logger } from "@/lib/logger.server";
import { verifyApiKeyOrSession } from "@/lib/api-auth.server";
import { parseJsonBodyOrResponse } from "@/lib/api-parse.server";
import {
  createWithScriptBodySchema,
  type CreateWithScriptBody,
} from "@/lib/schemas/api/create-with-script";
import type { ActionFunctionArgs } from "react-router";
import type { CampaignData } from "@/lib/database/campaign.server";

function jsonResponse(data: unknown, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const authResult = await verifyApiKeyOrSession(request);
  if ("error" in authResult) {
    return jsonResponse({ error: authResult.error }, authResult.status);
  }

  const parsed = await parseJsonBodyOrResponse(request, createWithScriptBodySchema);
  if (parsed instanceof Response) {
    return parsed;
  }
  const body: CreateWithScriptBody = parsed;

  const {
    workspace_id: bodyWorkspaceId,
    title,
    type,
    caller_id,
    script: scriptPayload,
    script_id: existingScriptId,
    audience_ids = [],
    status = "draft",
    enqueue_audience_contacts = true,
    is_active,
    start_date,
    end_date,
    schedule,
  } = body;

  let workspaceId: string;

  if (authResult.authType === "api_key") {
    workspaceId = authResult.workspaceId;
    if (bodyWorkspaceId && bodyWorkspaceId !== workspaceId) {
      return jsonResponse({ error: "workspace_id does not match API key" }, 403);
    }
  } else {
    if (!bodyWorkspaceId) {
      return jsonResponse(
        { error: "workspace_id is required when using session auth" },
        400,
      );
    }
    await requireWorkspaceAccess({
      user: authResult.user,
      workspaceId: bodyWorkspaceId,
    });
    workspaceId = bodyWorkspaceId;
  }

  const preflight = await validateCreateWithScriptPreflight({
    workspaceId,
    callerId: caller_id,
    audienceIds: audience_ids,
    existingScriptId,
  });
  if (!preflight.ok) {
    return jsonResponse({ error: preflight.error }, preflight.status);
  }

  const scriptResult = await createScriptForCampaign({
    workspaceId,
    campaignType: type,
    scriptPayload,
    existingScriptId,
    createdBy: authResult.authType === "session" ? authResult.user?.id ?? null : null,
  });
  if (!scriptResult.ok) {
    return jsonResponse({ error: scriptResult.error }, scriptResult.status);
  }

  const campaignData: CampaignData = {
    workspace: workspaceId,
    title,
    type,
    caller_id,
    script_id: scriptResult.scriptId,
    status,
    is_active: Boolean(is_active),
    start_date: start_date ?? undefined,
    end_date: end_date ?? undefined,
    schedule: schedule ?? undefined,
  };

  let campaign: { id: number; [key: string]: unknown };
  let campaignDetails: { campaign_id: number; [key: string]: unknown };

  try {
    const result = await createCampaign({ campaignData });
    campaign = result.campaign as { id: number; [key: string]: unknown };
    campaignDetails = result.campaignDetails as {
      campaign_id: number;
      [key: string]: unknown;
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("Error creating campaign", err);
    return jsonResponse({ error: `Failed to create campaign: ${message}` }, 400);
  }

  const { audiencesLinked, contactsEnqueued } = await linkAudiencesToNewCampaign({
    campaignId: campaign.id,
    audienceIds: audience_ids,
    enqueueAudienceContacts: enqueue_audience_contacts,
  });

  return jsonResponse(
    {
      campaign,
      campaignDetails,
      ...(scriptResult.createdScript && { script: scriptResult.createdScript }),
      audiences_linked: audiencesLinked,
      contacts_enqueued: contactsEnqueued,
    },
    201,
  );
};
