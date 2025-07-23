// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@^2.39.6";
import Twilio from "npm:twilio@^5.3.0";

// Link shortening function using TinyURL API
async function shortenUrl(url: string): Promise<string> {
  try {
    const response = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`);
    if (response.ok) {
      const shortenedUrl = await response.text();
      return shortenedUrl;
    }
  } catch (error) {
    console.error('Error shortening URL:', error);
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

function processTemplateTags(text: string, contact: any): string {
  if (!text || !contact) return text;

  const processBraces = (input: string): string => {
    // First, handle {{field|"fallback"}} pattern with quoted fallback
    let result = input.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\|\s*"([^"]+)"\s*\}\}/g, (match, field, fallback) => {
      let value = '';
      switch (field) {
        case 'firstname':
          value = contact.firstname || '';
          break;
        case 'surname':
          value = contact.surname || '';
          break;
        case 'fullname':
          value = contact.fullname || `${contact.firstname || ''} ${contact.surname || ''}`.trim();
          break;
        case 'phone':
          value = contact.phone || '';
          break;
        case 'email':
          value = contact.email || '';
          break;
        case 'address':
          value = contact.address || '';
          break;
        case 'city':
          value = contact.city || '';
          break;
        case 'province':
          value = contact.province || '';
          break;
        case 'postal':
          value = contact.postal || '';
          break;
        case 'country':
          value = contact.country || '';
          break;
        case 'external_id':
          value = contact.external_id || '';
          break;
        case 'contact_id':
          value = contact.id?.toString() || '';
          break;
        default:
          value = '';
      }
      if (!value && typeof fallback === 'string') {
        return fallback.trim();
      }
      return value || '';
    });
    
    // Then, handle {{field}} pattern (without fallback)
    result = result.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, field) => {
      let value = '';
      switch (field) {
        case 'firstname':
          value = contact.firstname || '';
          break;
        case 'surname':
          value = contact.surname || '';
          break;
        case 'fullname':
          value = contact.fullname || `${contact.firstname || ''} ${contact.surname || ''}`.trim();
          break;
        case 'phone':
          value = contact.phone || '';
          break;
        case 'email':
          value = contact.email || '';
          break;
        case 'address':
          value = contact.address || '';
          break;
        case 'city':
          value = contact.city || '';
          break;
        case 'province':
          value = contact.province || '';
          break;
        case 'postal':
          value = contact.postal || '';
          break;
        case 'country':
          value = contact.country || '';
          break;
        case 'external_id':
          value = contact.external_id || '';
          break;
        case 'contact_id':
          value = contact.id?.toString() || '';
          break;
        default:
          value = '';
      }
      return value || '';
    });
    
    return result;
  };

  const processFunctions = (input: string): string => {
    // Process btoa functions
    let result = input.replace(/btoa\(([^)]*)\)/g, (match, inner) => {
      const processed = processBraces(inner);
      try {
        return btoa(processed);
      } catch (e) {
        return '';
      }
    });
    
    // Process survey functions
    result = result.replace(/survey\(([^)]*)\)/g, (match, inner) => {
      const processed = processBraces(inner);
      // Expected format: contact_id, "survey_id"
      const parts = processed.split(',').map(part => part.trim());
      if (parts.length >= 2) {
        const contactId = parts[0];
        const surveyId = parts[1].replace(/"/g, ''); // Remove quotes
        
        if (contactId && surveyId) {
          // Generate the survey link
          const encoded = btoa(`${contactId}:${surveyId}`);
          const baseUrl = "https://callcaster.com";
          return `${baseUrl}/?q=${encoded}`;
        }
      }
      return ''; // Return empty string if parsing fails
    });
    
    return result;
  };
  let result = processFunctions(text);
  result = processBraces(result);
  return result;
}
const baseUrl = 'https://nolrdvpusfcsjihzhnlp.supabase.co/functions/v1/';
const functionHeaders = {
  Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
  "Content-Type": "application/json"
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
const normalizePhoneNumber = (input: string): string => {
  const cleaned = (input.replace(/[^0-9+]/g, ""))
    .replace(/^\+?1?(\+|\d{10})$/, "+1$1")
    .replace(/\+1\+/, "+1");

  if (cleaned.length !== 12) { // +1 plus 10 digits
    throw new Error("Invalid phone number length");
  }

  return cleaned;
};

async function processNextMessage(user_id: string, campaign_id: string) {
  try {
    await new Promise(resolve => setTimeout(resolve, 300));
    await fetch(
      `${baseUrl}/queue-next`,
      {
        method: 'POST',
        headers: functionHeaders,
        body: JSON.stringify({
          owner: user_id,
          campaign_id: campaign_id,
        })
      }
    );
  } catch (error) {
    console.error(`Error initiating next message for campaign ${campaign_id}:`, {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}


const createWorkspaceTwilioInstance = async ({
  supabase,
  workspace_id
}: {
  supabase: SupabaseClient;
  workspace_id: string;
}) => {
  const { data: workspace, error } = await supabase
    .from("workspace")
    .select("twilio_data, credits")
    .eq("id", workspace_id)
    .single();

  if (error || !workspace?.twilio_data) {
    throw new Error("Failed to get workspace Twilio credentials");
  }

  return {
    twilio: new Twilio(
      workspace.twilio_data.sid,
      workspace.twilio_data.authToken
    ), credits: workspace.credits
  };
};

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
  let outreachAttemptId: string | null = null;
  try {
    // Check workspace credits before sending
    const { data: workspaceData, error: workspaceError } = await supabase
      .from("workspace")
      .select("credits")
      .eq("id", workspace)
      .single();

    if (workspaceError || !workspaceData) {
      throw new Error("Failed to check workspace credits");
    }

    if (workspaceData.credits <= 0) {
      throw new Error("Insufficient credits to send message");
    }

    const { twilio } = await createWorkspaceTwilioInstance({
      supabase,
      workspace_id: workspace,
    });

    outreachAttemptId = await createOutreachAttempt({
      supabase,
      contact_id,
      campaign_id,
      queue_id,
      workspace,
      user_id,
    });

    if (!outreachAttemptId) {
      throw new Error("Failed to create outreach attempt");
    }

    // Process URLs in the message body to shorten them
    const processedBody = await processUrls(body);

    const message = await twilio.messages.create({
      body: processedBody,
      to,
      from,
      statusCallback: `${baseUrl}sms-status`,
      ...(media?.length && { mediaUrl: media }),
    }).catch((e: Error) => ({ error: e }));

    if ('error' in message) {
      // Update outreach attempt as failed
      await supabase
        .from("outreach_attempt")
        .update({ 
          disposition: "failed",
          ended_at: new Date().toISOString()
        })
        .eq("id", outreachAttemptId);
      throw message.error;
    }

    const { error: messageInsertError } = await supabase
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
        queue_id,
        outreach_attempt_id: outreachAttemptId,
      });

    if (messageInsertError) {
      // Update outreach attempt as failed if message insert fails
      await supabase
        .from("outreach_attempt")
        .update({ 
          disposition: "failed",
          ended_at: new Date().toISOString()
        })
        .eq("id", outreachAttemptId);
      throw messageInsertError;
    }

    return { message, outreachAttemptId };
  } catch (error) {
    if (outreachAttemptId) {
      await supabase
        .from("outreach_attempt")
        .update({ 
          disposition: "failed",
          ended_at: new Date().toISOString()
        })
        .eq("id", outreachAttemptId);
    }
    console.error("Error in SMS handler:", error);
    return { error: error instanceof Error ? error.message : 'Unknown error' };
  }
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
  const { data, error } = await supabase.rpc(
    "create_outreach_attempt",
    {
      con_id: contact_id,
      cam_id: campaign_id,
      queue_id,
      wks_id: workspace,
      usr_id: user_id,
    },
  );
  if (error) throw error;
  return data;
};

Deno.serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { to_number, campaign_id, workspace_id, contact_id, caller_id, queue_id, user_id } = await req.json();

    // Check if campaign is still active
    const { data: campaign, error: campaignError } = await supabase
      .from("campaign")
      .select("is_active")
      .eq("id", campaign_id)
      .single();

    if (campaignError || !campaign?.is_active) {
      return new Response(
        JSON.stringify({ status: "campaign_completed" }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    const { data: campaignDetails, error: detailsError } = await supabase
      .from("message_campaign")
      .select()
      .eq('campaign_id', campaign_id)
      .single();

    if (detailsError) throw detailsError;

    // Fetch contact data for template tag processing
    const { data: contact, error: contactError } = await supabase
      .from("contact")
      .select("*")
      .eq("id", contact_id)
      .single();

    if (contactError) {
      console.error("Error fetching contact:", contactError);
      // Continue without template processing if contact fetch fails
    }

    // Process template tags in the message body
    let processedBody = campaignDetails.body_text;
    if (contact && campaignDetails.body_text) {
      processedBody = processTemplateTags(campaignDetails.body_text, contact);
    }

    const media = campaignDetails.message_media?.length
      ? await Promise.all(
        campaignDetails.message_media.map((mediaItem: string) =>
          supabase.storage
            .from("messageMedia")
            .createSignedUrl(`${workspace_id}/${mediaItem}`, 3600)
            .then(({ data }: { data: { signedUrl: string } | null }) => data?.signedUrl)
        )
      )
      : [];

    const result = await sendMessage({
      body: processedBody,
      media: media.filter(Boolean) as string[],
      to: normalizePhoneNumber(to_number),
      from: caller_id,
      supabase,
      campaign_id,
      workspace: workspace_id,
      contact_id,
      queue_id,
      user_id,
    });

    if ('error' in result) {
      await processNextMessage(user_id, campaign_id);
      return new Response(
        JSON.stringify({ success: false, error: result.error }),
        {
          headers: { "Content-Type": "application/json" },
          status: 500,
        }
      );
    }

    await processNextMessage(user_id, campaign_id);
    return new Response(
      JSON.stringify({ success: true, result }),
      { headers: { "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in SMS handler:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        headers: { "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});