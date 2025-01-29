// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import { SupabaseClient } from "@supabase/supabase-js";
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@^2.39.6";
import Twilio from "npm:twilio@^5.3.0";
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

async function processNextMessage(user_id, campaign_id) {
  try {
    await new Promise(resolve => setTimeout(resolve, 200));
    await fetch(
      `${baseUrl}/queue-next`,
      {
        method: 'POST',
        headers: functionHeaders,
        body: JSON.stringify({
          user_id: user_id,
          campaign_id: campaign_id,
        })
      }
    );

  } catch (error) {
    console.error(`Error initiating next call for campaign ${campaign_id}:`, {
      error: error.message,
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

    const [message, outreachAttempt] = await Promise.all([
      twilio.messages.create({
        body,
        to,
        from,
        statusCallback: `${baseUrl}/sms-status`,
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

    ]);

    return { message };
  } catch (error) {
    console.error("Error in SMS handler:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        headers: { "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
};

const updateOutreach = async ({
  supabase,
  id,
  status
}: {
  supabase: SupabaseClient;
  id: string;
  status: string;
}) => {
  const { data, error } = await supabase
    .from("outreach_attempt")
    .update({ disposition: status })
    .eq("id", id);
  if (error) throw error;
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
    const { data: campaignDetails, error: detailsError } = await supabase
      .from("message_campaign")
      .select()
      .eq('campaign_id', campaign_id)
      .single()
    if (detailsError) throw detailsError;
    const media = campaignDetails.message_media?.length
      ? await Promise.all(
        campaignDetails.message_media.map((mediaItem: string) =>
          supabase.storage
            .from("messageMedia")
            .createSignedUrl(`${workspace_id}/${mediaItem}`, 3600)
            .then(({ data }) => data?.signedUrl)
        )
      )
      : [];
    const result = await sendMessage({
      body: campaignDetails.body_text,
      media: media.filter(Boolean) as string[],
      to: normalizePhoneNumber(to_number),
      from: caller_id,
      supabase,
      campaign_id,
      workspace: workspace_id,
      contact_id,
      queue_id,
      user_id,
    })
    await processNextMessage(user_id, campaign_id);
    return new Response(
      JSON.stringify({ result }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );

  } catch (error) {
    console.error("Error in SMS handler:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        headers: { "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});