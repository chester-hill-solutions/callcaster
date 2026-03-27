import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  createWorkspaceTwilioInstance,
  getCampaignQueueById,
  getWorkspaceTwilioPortalConfig,
  requireWorkspaceAccess,
  safeParseJson,
} from "../../lib/database.server";
import { verifyApiKeyOrSession } from "@/lib/api-auth.server";
import { normalizePhoneNumber, processTemplateTags } from "@/lib/utils";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import { buildDequeuedQueueUpdate } from "@/lib/queue-status";
import { processUrls } from "@/lib/sms.server";
import type { TwilioMessageIntent, WorkspaceTwilioOpsConfig } from "@/lib/types";

interface CampaignData {
  body_text: string;
  message_media?: string[];
  campaign: { end_time: string };
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
    .select(`*, campaign(end_time)`)
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
  messagingServiceSid?: string | null;
}

function parseOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function resolveSmsRequest({
  body,
  to,
  from,
  media,
  portalConfig,
  messageIntent,
  messagingServiceSid,
}: {
  body: string;
  to: string;
  from: string;
  media: string[];
  portalConfig: WorkspaceTwilioOpsConfig;
  messageIntent?: TwilioMessageIntent | null;
  messagingServiceSid?: string | null;
}) {
  const resolvedMessagingServiceSid =
    messagingServiceSid ??
    (portalConfig.sendMode === "messaging_service"
      ? portalConfig.messagingServiceSid
      : null);
  const resolvedMessageIntent = messageIntent ?? portalConfig.defaultMessageIntent;

  return {
    body,
    to,
    statusCallback: `${env.SUPABASE_URL()}/functions/v1/sms-status`,
    ...(media?.length && { mediaUrl: media }),
    ...(resolvedMessagingServiceSid
      ? { messagingServiceSid: resolvedMessagingServiceSid }
      : { from }),
    ...(resolvedMessageIntent ? { messageIntent: resolvedMessageIntent } : {}),
  };
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
  messagingServiceSid,
}: SendMessageParams) => {
  
  const twilio = await createWorkspaceTwilioInstance({
    supabase,
    workspace_id: workspace,
  });

  // Process URLs in the message body to shorten them
  const processedBody = await processUrls(body);

  const [message, outreachAttempt] = await Promise.all([
    twilio.messages
      .create(
        resolveSmsRequest({
          body: processedBody,
          to,
          from,
          media,
          portalConfig,
          messageIntent,
          messagingServiceSid,
        }),
      )
      .catch(e => ({ error: e })),
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

  await Promise.all([
    supabase
      .from("message")
      .insert({
        sid: message.sid || `failed-${to}-${Date.now()}`,
        body: message.body,
        num_segments: message.numSegments,
        direction: message.direction,
        from: message.from,
        to: message.to,
        date_updated: message.dateUpdated,
        price: message.price,
        error_message: message.errorMessage,
        account_sid: message.accountSid,
        uri: message.uri,
        num_media: message.numMedia,
        status: message.status,
        messaging_service_sid: message.messagingServiceSid,
        date_sent: message.dateSent,
        error_code: message.errorCode,
        price_unit: message.priceUnit,
        api_version: message.apiVersion,
        subresource_uris: message.subresourceUris,
        campaign_id,
        workspace,
        contact_id,
      })
      .select(),
    
    updateOutreach({
      supabase,
      id: outreachAttempt,
      status: 'completed'
    }),

    supabase
      .from("campaign_queue")
      .update(buildDequeuedQueueUpdate(user_id, "SMS message sent"))
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
    const {
      campaign_id,
      workspace_id,
      caller_id,
      message_intent,
      messaging_service_sid,
      user_id,
    } = await safeParseJson<Record<string, unknown>>(request);
    if (
      typeof campaign_id !== "string" ||
      typeof workspace_id !== "string" ||
      typeof caller_id !== "string" ||
      (authResult.authType === "api_key" && typeof user_id !== "string")
    ) {
      return new Response(JSON.stringify({ error: "Invalid SMS payload" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const effectiveUserId =
      authResult.authType === "api_key" ? user_id : authResult.user.id;

    const messageIntent =
      typeof message_intent === "string" && message_intent.trim()
        ? (message_intent.trim() as TwilioMessageIntent)
        : null;
    const messagingServiceSid = parseOptionalString(messaging_service_sid);

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
      }),
      getWorkspaceTwilioPortalConfig({
        supabaseClient: supabase,
        workspaceId: workspace_id,
      }),
    ]);

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

    const BATCH_SIZE = 25;
    const results = [];
    
    for (let i = 0; i < audience.length; i += BATCH_SIZE) {
      const batch = audience.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async member => {
          // Process template tags for this specific contact
          let processedBody = campaign.body_text;
          if (member.contact && campaign.body_text) {
            processedBody = processTemplateTags(campaign.body_text, member.contact);
          }
          
          return sendMessage({
            body: processedBody,
            media: media.filter(Boolean) as string[],
            to: normalizePhoneNumber(member.contact?.phone || ''),
            from: caller_id,
            supabase,
            campaign_id,
            workspace: workspace_id,
            contact_id: member.contact_id,
            queue_id: member.id,
            user_id: effectiveUserId as string,
            portalConfig,
            messageIntent,
            messagingServiceSid,
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
};
