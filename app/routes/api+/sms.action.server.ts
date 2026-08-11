import { logger } from "@/lib/logger.server";
import { verifyApiKeyOrSession } from "@/lib/api-auth.server";
import { requireDualAuthCapability } from "@/lib/capability-guard.server";
import { parseJsonBodyOrResponse } from "@/lib/api-parse.server";
import { campaignSmsDispatchBodySchema } from "@/lib/schemas/api/sms";
import { requireWorkspaceAccess } from "@/lib/database/workspace.server";
import type { TwilioMessageIntent } from "@/lib/types";
import { parseOptionalString } from "@/lib/parse-utils.server";
import { defineAction } from "@/lib/handler.server";
import { dispatchCampaignSmsBatch } from "@/lib/campaign-sms-dispatch.server";

/**
 * HTTP adapter for campaign SMS dispatch. Auth, capability, and request
 * parsing live here; every send gate and the batch loop live in
 * `dispatchCampaignSmsBatch` so the worker dispatch path shares them.
 */
export const action = defineAction({
  auth: async ({ request }: { request: Request }) => {
    const authResult = await verifyApiKeyOrSession(request);
    if ("error" in authResult) {
      return new Response(JSON.stringify({ error: authResult.error }), {
        headers: { "Content-Type": "application/json" },
        status: authResult.status,
      });
    }
    return authResult;
  },
  sideEffects: ["db-write", "twilio"],
  handler: async ({ request, auth: authResult }) => {

  try {
    const parsed = await parseJsonBodyOrResponse(
      request,
      campaignSmsDispatchBodySchema,
    );
    if (parsed instanceof Response) {
      return parsed;
    }

    const {
      campaign_id,
      workspace_id,
      caller_id,
      message_intent,
      messaging_service_sid,
      user_id,
    } = parsed;

    if (authResult.authType === "api_key" && !user_id) {
      return new Response(
        JSON.stringify({ error: "user_id is required when using API key auth" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const effectiveUserId =
      authResult.authType === "api_key" ? user_id! : authResult.user.id;

    const messageIntent =
      typeof message_intent === "string" && message_intent.trim()
        ? (message_intent.trim() as TwilioMessageIntent)
        : null;
    const messagingServiceSidFromRequest = parseOptionalString(
      messaging_service_sid,
    );

    if (authResult.authType === "api_key") {
      if (workspace_id !== authResult.workspaceId) {
        return new Response(
          JSON.stringify({ error: "workspace_id does not match API key" }),
          {
            status: 403,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
    } else {
      await requireWorkspaceAccess({user: authResult.user,
        workspaceId: workspace_id,
      });
    }

    const capability = await requireDualAuthCapability({
      auth: authResult,
      workspaceId: workspace_id,
      capability: "campaigns.dispatch",
    });
    if (capability instanceof Response) {
      return capability;
    }

    const outcome = await dispatchCampaignSmsBatch({
      workspaceId: workspace_id,
      campaignId: campaign_id,
      userId: effectiveUserId as string,
      callerId: typeof caller_id === "string" ? caller_id : null,
      requireExplicitCallerId: true,
      messageIntent,
      messagingServiceSidFromRequest,
    });

    switch (outcome.kind) {
      case "insufficient_credits":
        return new Response(
          JSON.stringify({ creditsError: true, error: "Insufficient credits" }),
          {
            status: 402,
            headers: { "Content-Type": "application/json" },
          },
        );
      case "caller_id_required":
        return new Response(
          JSON.stringify({ error: "caller_id is required for this campaign" }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      case "deferred_send_window":
        return new Response(
          JSON.stringify({
            deferred: true,
            reason: "Outside campaign send window",
            responses: [],
          }),
          {
            headers: { "Content-Type": "application/json" },
            status: 200,
          },
        );
      case "dispatched":
        return new Response(JSON.stringify({ responses: outcome.responses }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
    }
  } catch (error) {
    logger.error("Error in action:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        headers: { "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
  },
});
