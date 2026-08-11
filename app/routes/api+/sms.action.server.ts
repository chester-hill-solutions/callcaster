import {
  messageCampaignRequiresCallerId,
} from "@/lib/sms-send-resolve";
import { dequeueCampaignQueueById } from "@/lib/campaign-queue-db.server";
import { loadCampaignSmsDispatchData } from "@/lib/sms-campaign-db.server";
import { getCampaignQueueById } from "@/lib/database/campaign.server";
import {
  getWorkspaceTwilioPortalConfig,
  requireWorkspaceAccess,
} from "@/lib/database/workspace.server";
import { logger } from "@/lib/logger.server";
import { normalizePhoneNumber, processTemplateTags } from "@/lib/utils";
import { verifyApiKeyOrSession } from "@/lib/api-auth.server";
import { requireDualAuthCapability } from "@/lib/capability-guard.server";
import { parseJsonBodyOrResponse } from "@/lib/api-parse.server";
import { campaignSmsDispatchBodySchema } from "@/lib/schemas/api/sms";
import type { TwilioMessageIntent } from "@/lib/types";
import {
  claimBatchSizeForRate,
  configuredDispatcherSmsMps,
} from "@/lib/throughput-config.server";
import { parseOptionalString } from "@/lib/parse-utils.server";
import { isWithinSendWindow, parseSendWindow } from "@/lib/campaign-send-window";
import { recipientCallingWindowStatus } from "@/lib/recipient-calling-window";
import { getOrLookupLineType, isSmsIncapableLineType } from "@/lib/twilio-lookup.server";
import { createSignedObjectUrl } from "@/lib/object-storage.server";
import { getWorkspaceCreditsBalance } from "@/lib/workspace-credits.server";
import { hasInsufficientCreditsForOutbound } from "../../../shared/credit-floor";
import { defineAction } from "@/lib/handler.server";
import {
  sendSingleCampaignSms,
  hasDuplicateCampaignSms,
  OPTED_OUT_SMS_DEQUEUED_REASON,
  LANDLINE_SMS_DEQUEUED_REASON,
  DUPLICATE_SMS_DEQUEUED_REASON,
} from "@/lib/campaign-sms-send.server";

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
    const callerIdStr =
      typeof caller_id === "string" ? caller_id.trim() : "";

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

    // Fail-closed credit gate: check once at entry for the whole batch
    // rather than per contact, so a mid-campaign depletion doesn't burn
    // through the audience one Twilio failure at a time.
    const creditsBalance = await getWorkspaceCreditsBalance(workspace_id);
    if (hasInsufficientCreditsForOutbound(creditsBalance)) {
      return new Response(
        JSON.stringify({ creditsError: true, error: "Insufficient credits" }),
        {
          status: 402,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const [campaign, audience, portalConfig] = await Promise.all([
      loadCampaignSmsDispatchData(workspace_id, campaign_id),
      getCampaignQueueById({campaign_id,
        onlyQueued: true,
      }),
      getWorkspaceTwilioPortalConfig({workspaceId: workspace_id,
      }),
    ]);

    const requiresCallerId = messageCampaignRequiresCallerId(
      campaign.campaign?.sms_send_mode,
    );
    if (requiresCallerId && !callerIdStr) {
      return new Response(
        JSON.stringify({ error: "caller_id is required for this campaign" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Campaign send-window / CASL quiet-hours gate. This is the authoritative
    // Send-Now SMS path and is campaign-only — 1:1 chat sends use a different
    // route (chat_sms) and are never gated here. When the current tick falls
    // outside the campaign's send window we DEFER the whole batch: nothing is
    // dispatched and nothing is dequeued, so contacts remain queued for a
    // later in-window tick. A `null` window is unrestricted.
    if (!isWithinSendWindow(parseSendWindow(campaign.campaign?.sms_send_window ?? null))) {
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
    }

    const media = campaign.message_media?.length
      ? await Promise.all(
          campaign.message_media.map(mediaItem =>
            createSignedObjectUrl("messageMedia", `${workspace_id}/${mediaItem}`, 3600)
          )
        )
      : [];

    // Legacy direct-send path: bypasses queue-next dispatcher. When parallel dispatch
    // is enabled, cap batch concurrency using portal throughput settings.
    const LEGACY_MAX_BATCH = 25;
    const BATCH_SIZE = portalConfig.parallelDispatchEnabled
      ? Math.min(
          LEGACY_MAX_BATCH,
          claimBatchSizeForRate(
            configuredDispatcherSmsMps(portalConfig),
            1000,
          ),
        )
      : LEGACY_MAX_BATCH;
    const results = [];
    const queueMembers = audience ?? [];
    
    for (let i = 0; i < queueMembers.length; i += BATCH_SIZE) {
      const batch = queueMembers.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async member => {
          const normalizedPhone = normalizePhoneNumber(member.contact?.phone || "");

          // Recipient-local quiet hours (CASL/TCPA — 8am–9pm recipient
          // time). Unlike opt-out/landline/duplicate below, this is
          // temporary: leave the row queued (no dequeue) so a later
          // in-window dispatch picks it up.
          const windowStatus = recipientCallingWindowStatus(normalizedPhone);
          if (!windowStatus.allowed) {
            return {
              [member.contact_id]: {
                success: true,
                skipped: true,
                deferred: true,
                reason: "Outside recipient quiet-hours window",
              },
            };
          }

          if (member.contact?.opt_out) {
            await dequeueCampaignQueueById({
              queueId: member.id,
              userId: effectiveUserId as string,
              reason: OPTED_OUT_SMS_DEQUEUED_REASON,
            });
            return {
              [member.contact_id]: {
                success: true,
                skipped: true,
                reason: OPTED_OUT_SMS_DEQUEUED_REASON,
              },
            };
          }

          const lineType = member.contact
            ? await getOrLookupLineType({
                workspaceId: workspace_id,
                contactId: member.contact_id,
                phone: normalizedPhone,
              })
            : null;

          if (isSmsIncapableLineType(lineType)) {
            await dequeueCampaignQueueById({
              queueId: member.id,
              userId: effectiveUserId as string,
              reason: LANDLINE_SMS_DEQUEUED_REASON,
            });
            return {
              [member.contact_id]: {
                success: true,
                skipped: true,
                reason: LANDLINE_SMS_DEQUEUED_REASON,
              },
            };
          }

          const duplicateExists = await hasDuplicateCampaignSms({
            workspaceId: workspace_id,
            campaignId: campaign_id,
            to: normalizedPhone,
          });

          if (duplicateExists) {
            await dequeueCampaignQueueById({
              queueId: member.id,
              userId: effectiveUserId as string,
              reason: DUPLICATE_SMS_DEQUEUED_REASON,
            });
            return {
              [member.contact_id]: {
                success: true,
                skipped: true,
                reason: DUPLICATE_SMS_DEQUEUED_REASON,
              },
            };
          }

          // Process template tags for this specific contact
          let processedBody = campaign.body_text;
          if (member.contact && campaign.body_text) {
            processedBody = processTemplateTags(campaign.body_text, member.contact);
          }
          
          return sendSingleCampaignSms({
            body: processedBody,
            media: media.filter(Boolean) as string[],
            to: normalizedPhone,
            from:
              callerIdStr ||
              String(campaign.campaign?.caller_id ?? "").trim(),
                        campaign_id,
            workspace: workspace_id,
            contact_id: member.contact_id,
            queue_id: member.id,
            user_id: effectiveUserId as string,
            portalConfig,
            messageIntent,
            messagingServiceSidFromRequest,
            campaignSmsRow: campaign.campaign,
          }).then(
            result => ({ [member.contact_id]: { success: true, ...result }}),
            error => ({ [member.contact_id]: { success: false, error: error.message }})
          );
        })
      );
      results.push(...batchResults);
    }

    return new Response(JSON.stringify({ responses: results }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
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
