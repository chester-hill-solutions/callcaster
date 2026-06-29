import {
  messageCampaignRequiresCallerId,
  resolveTwilioSmsMessagingServiceSid,
} from "@/lib/sms-send-resolve";
import { buildTwilioOutboundSmsCreateParams } from "@/lib/twilio-outbound-sms.server";
import { buildDequeuedQueueUpdate } from "@/lib/queue-status";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { createWorkspaceTwilioInstance, getCampaignQueueById, getWorkspaceTwilioPortalConfig, requireWorkspaceAccess } from "@/lib/database.server";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import { normalizePhoneNumber, processTemplateTags } from "@/lib/utils";
import { bodyHasUrls } from "@/lib/sms.server";
import { verifyApiKeyOrSession } from "@/lib/api-auth.server";
import { parseJsonBodyOrResponse } from "@/lib/api-parse.server";
import { campaignSmsDispatchBodySchema } from "@/lib/schemas/api/sms";
import type { TwilioMessageIntent, WorkspaceTwilioOpsConfig } from "@/lib/types";
import { assertWorkspaceCanSendSms } from "@/lib/twilio-readiness.server";
import { withTwilioRetry } from "@/lib/twilio-client.server";
import {
  persistMessageRecord,
  twilioMessageToPersistFields,
} from "@/lib/sms-send.server";
import {
  claimBatchSizeForRate,
  configuredDispatcherSmsMps,
} from "@/lib/throughput-config.server";

interface CampaignData {
  body_text: string;
  message_media?: string[];
  campaign: {
    end_time: string;
    sms_send_mode?: string | null;
    sms_messaging_service_sid?: string | null;
    caller_id?: string | null;
  };
}

const getCampaignData = async ({ 
  supabase, 
  campaign_id 
}: { 
  supabase: SupabaseClient; 
  campaign_id: string 
}): Promise<CampaignData> => {
  const { data, error } = await supabase
    .from("message_campaign")
    .select(
      `*, campaign(end_time, sms_send_mode, sms_messaging_service_sid, caller_id)`,
    )
    .eq("campaign_id", campaign_id)
    .single();

  if (error) throw new Error(`Campaign fetch failed: ${error.message}`);
  return data;
};

interface SendMessageParams {
  body: string;
  to: string;
  from: string;
  media: string[];
  supabase: SupabaseClient;
  campaign_id: string;
  workspace: string;
  contact_id: string | number;
  queue_id: number | string;
  user_id: string;
  portalConfig: WorkspaceTwilioOpsConfig;
  messageIntent?: TwilioMessageIntent | null;
  messagingServiceSidFromRequest: string | null;
  campaignSmsRow?: CampaignData["campaign"];
}

const DUPLICATE_SMS_DEQUEUED_REASON = "Duplicate SMS prevented";

import { parseOptionalString } from "@/lib/parse-utils.server";

async function hasDuplicateCampaignSms(args: {
  supabase: SupabaseClient;
  campaignId: string;
  to: string;
}): Promise<boolean> {
  const { count, error } = await args.supabase
    .from("message")
    .select("sid", { head: true, count: "exact" })
    .eq("campaign_id", Number(args.campaignId))
    .eq("to", args.to);
  if (error) throw error;
  return (count ?? 0) > 0;
}

const sendMessage = async ({
  body,
  to,
  from,
  media,
  supabase,
  campaign_id,
  workspace,
  contact_id,
  queue_id,
  user_id,
  portalConfig,
  messageIntent,
  messagingServiceSidFromRequest,
  campaignSmsRow,
}: SendMessageParams) => {

  await assertWorkspaceCanSendSms({ supabaseClient: supabase, workspaceId: workspace });

  const twilio = await createWorkspaceTwilioInstance({ supabase: supabase,
    workspace_id: workspace,
  });

  // Process URLs in the message body to shorten them
  const processedBody = body;

  const resolvedMessagingServiceSid = resolveTwilioSmsMessagingServiceSid({
    explicitRequestSid: messagingServiceSidFromRequest,
    campaignSmsSendMode: campaignSmsRow?.sms_send_mode,
    campaignSmsMessagingServiceSid: campaignSmsRow?.sms_messaging_service_sid,
    portalConfig,
  });

  const [message, outreachAttempt] = await Promise.all([
    withTwilioRetry(
      () =>
        twilio.messages.create(
          buildTwilioOutboundSmsCreateParams({
            body: processedBody,
            to,
            from,
            media,
            statusCallback: `${env.SUPABASE_URL()}/functions/v1/sms-status`,
            portalConfig,
            messageIntent,
            explicitMessagingServiceSid: resolvedMessagingServiceSid,
            campaignSmsSendMode: campaignSmsRow?.sms_send_mode,
            campaignSmsMessagingServiceSid: campaignSmsRow?.sms_messaging_service_sid,
          }),
        ),
      { workspaceId: workspace, operation: "messages.create.campaign" },
    ).catch((e) => ({ error: e })),
    createOutreachAttempt({
      supabase,
      contact_id,
      campaign_id,
      queue_id,
      workspace,
      user_id,
    })
  ]);

  if ('error' in message) {
    throw message.error;
  }

  const messageFields = twilioMessageToPersistFields(
    { ...message, sid: message.sid || `failed-${to}-${Date.now()}` },
    { workspace, campaign_id, contact_id },
  );

  await Promise.all([
    persistMessageRecord(supabase, messageFields),

    updateOutreach({
      supabase,
      id: outreachAttempt,
      status: 'completed'
    }),

    supabase
      .from("campaign_queue")
      .update(buildDequeuedQueueUpdate(user_id, "SMS message sent", { includeNormalizedFields: true }))
      .eq("id", queue_id)
  ]);

  return { message };
};

const updateOutreach = async ({ supabase, id, status }: { supabase: SupabaseClient, id: string, status: string }) => {
  const { data, error } = await supabase
    .from("outreach_attempt")
    .update({ disposition: status })
    .eq("id", id);
  if (error) {
    logger.error("Error updating outreach attempt", error);
    throw error;
  }
  return data;
};

const createOutreachAttempt = async ({
  supabase,
  contact_id,
  campaign_id,
  queue_id,
  workspace,
  user_id,
}: {
  supabase: SupabaseClient;
  contact_id: string | number;
  campaign_id: string | number;
  queue_id: string | number;
  workspace: string;
  user_id: string;
}) => {
  const { data: outreachAttempt, error: outreachError } = await supabase.rpc(
    "create_outreach_attempt",
    {
      con_id: contact_id,
      cam_id: campaign_id,
      queue_id,
      wks_id: workspace,
      usr_id: user_id,
    },
  );
  if (outreachError) {
    logger.error("Error creating outreach attempt:", outreachError);
    throw outreachError;
  }
  return outreachAttempt;
};

export const action = async ({ request }: { request: Request }) => {

  const authResult = await verifyApiKeyOrSession(request);
  if ("error" in authResult) {
    return new Response(JSON.stringify({ error: authResult.error }), {
      headers: { "Content-Type": "application/json" },
      status: authResult.status,
    });
  }

  const supabase = createClient(
    env.SUPABASE_URL(),
    env.SUPABASE_SERVICE_KEY(),
  );

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
      await requireWorkspaceAccess({
        supabaseClient: authResult.supabaseClient,
        user: authResult.user,
        workspaceId: workspace_id,
      });
    }
    
    const [campaign, audience, portalConfig] = await Promise.all([
      getCampaignData({ supabase, campaign_id }),
      getCampaignQueueById({
        supabaseClient: supabase,
        campaign_id,
        onlyQueued: true,
      }),
      getWorkspaceTwilioPortalConfig({
        supabaseClient: supabase,
        workspaceId: workspace_id,
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

    const media = campaign.message_media?.length 
      ? await Promise.all(
          campaign.message_media.map(mediaItem =>
            supabase.storage
              .from("messageMedia")
              .createSignedUrl(`${workspace_id}/${mediaItem}`, 3600)
              .then(({ data }) => data?.signedUrl)
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
          const duplicateExists = await hasDuplicateCampaignSms({
            supabase,
            campaignId: campaign_id,
            to: normalizedPhone,
          });

          if (duplicateExists) {
            await supabase
              .from("campaign_queue")
              .update(
                buildDequeuedQueueUpdate(
                  effectiveUserId as string,
                  DUPLICATE_SMS_DEQUEUED_REASON,
                  { includeNormalizedFields: true },
                ),
              )
              .eq("id", member.id);
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
          
          return sendMessage({
            body: processedBody,
            media: media.filter(Boolean) as string[],
            to: normalizedPhone,
            from:
              callerIdStr ||
              String(campaign.campaign?.caller_id ?? "").trim(),
            supabase,
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
}
