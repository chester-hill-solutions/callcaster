import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  createWorkspaceTwilioInstance,
  getCampaignQueueById,
  safeParseJson,
} from "../lib/database.server";
import { processTemplateTags } from "@/lib/utils";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";

// Link shortening function using TinyURL API
async function shortenUrl(url: string): Promise<string> {
  try {
    const response = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`);
    if (response.ok) {
      const shortenedUrl = await response.text();
      return shortenedUrl;
    }
  } catch (error) {
    logger.error('Error shortening URL:', error);
  }
  return url; // Return original URL if shortening fails
}

// Process URLs in text and shorten them
async function processUrls(text: string): Promise<string> {
  // Regex to match URLs
  const urlRegex = /https?:\/\/[^\s]+/g;
  
  let processedText = text;
  const urlMatches = text.match(urlRegex);
  
  if (urlMatches) {
    for (const url of urlMatches) {
      const shortenedUrl = await shortenUrl(url);
      processedText = processedText.replace(url, shortenedUrl);
    }
  }
  
  return processedText;
}

const normalizePhoneNumber = (input: string): string => {
  const cleaned = (input.replace(/[^0-9+]/g, ""))
    .replace(/^\+?1?(\+|\d{10})$/, "+1$1")
    .replace(/\+1\+/, "+1");

  if (cleaned.length !== 12) { // +1 plus 10 digits
    throw new Error("Invalid phone number length");
  }

  return cleaned;
};

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
}: SendMessageParams) => {
  
  const twilio = await createWorkspaceTwilioInstance({
    supabase,
    workspace_id: workspace,
  });

  // Process URLs in the message body to shorten them
  const processedBody = await processUrls(body);

  const [message, outreachAttempt] = await Promise.all([
    twilio.messages.create({
      body: processedBody,
      to,
      from,
      statusCallback: `${env.BASE_URL()}/api/sms/status`,
      ...(media?.length && { mediaUrl: media }),
    }).catch(e => ({ error: e })),
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
      .update({ 
        status: "dequeued",
        dequeued_by: user_id,
        dequeued_at: new Date().toISOString(),
        dequeued_reason: "SMS message sent"
      })
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
  const supabase = createClient(
    env.SUPABASE_URL(),
    env.SUPABASE_SERVICE_KEY(),
  );

  try {
    const { campaign_id, workspace_id, caller_id, user_id } = await safeParseJson(request);
    
    const [campaign, audience] = await Promise.all([
      getCampaignData({ supabase, campaign_id }),
      getCampaignQueueById({
        supabaseClient: supabase,
        campaign_id,
      })
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
            user_id,
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
