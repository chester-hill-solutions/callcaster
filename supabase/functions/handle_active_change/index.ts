//import * as Deno from "https://deno.land/std@0.203.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@^2.39.6";
import Twilio from "npm:twilio@5.3.0";
import { crypto } from "https://deno.land/std@0.177.0/crypto/mod.ts";
import { encode } from "https://deno.land/std@0.177.0/encoding/base64.ts";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { SupabaseClient } from "@supabase/supabase-js";
const baseUrl = 'https://nolrdvpusfcsjihzhnlp.supabase.co/functions/v1';

const initSupabaseClient = () => {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
};
function toFormUrlEncodedParam(
  paramName: string,
  paramValue: string | Array<string>,
): string {
  if (paramValue instanceof Array) {
    return Array.from(new Set(paramValue))
      .sort()
      .map((val) => toFormUrlEncodedParam(paramName, val))
      .reduce((acc, val) => acc + val, "");
  }
  return paramName + paramValue;
}
export async function getExpectedTwilioSignature(
  authToken: string,
  url: string,
  params: Record<string, any>,
): Promise<string> {
  if (url.indexOf("bodySHA256") !== -1 && params === null) {
    params = {};
  }

  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + toFormUrlEncodedParam(key, params[key]), url);

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(data)
  );

  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}
export async function createWorkspaceTwilioInstance(
  supabase: SupabaseClient,
  workspace_id: string,
) {
  const { data, error } = await supabase
    .from("workspace")
    .select("twilio_data, key, token")
    .eq("id", workspace_id)
    .single();
  if (error) throw error;

  const twilio = new Twilio(
    data.twilio_data.sid,
    data.twilio_data.authToken,
  );
  return twilio;
}

const handlePauseCampaign = async (
  supabase: SupabaseClient,
  id: number,
  twilio: typeof Twilio.Twilio,
) => {
  const { data, error } = await supabase
    .from("campaign")
    .update({ status: "pending" })
    .eq("id", id)
    .select("type")
    .single();
  if (error) throw error;

  if (data.type === "robocall") {
    try {
      const { data: calls, error: callsError } = await supabase
        .from('call')
        .select(
          "sid, queue_id"
        )
        .eq('campaign_id', id)
        .eq('status', 'queued')
      if (callsError) console.error(callsError)
      if (calls && calls.length) {
        calls.map(async (call: any) => {
          // Cancel the calls with twilio (has to be done individually)
          await twilio.calls(call.sid).update({ status: "canceled" })
        })
        // Mark the call as cancelled in the database
        const { error: callUpdateError } = await supabase
          .from('call')
          .update({ status: 'canceled' })
          .in('sid', calls.map((call) => call.sid))
        if (callUpdateError) console.error('Error marking calls as cancelled', callUpdateError);
        // Re-queue any which did not get sent for the next run.
        const { error: queueUpdateError } = await supabase
          .from("campaign_queue")
          .update({ status: "queued" })
          .in("id", calls.map((call) => call.queue_id));
        if (queueUpdateError) console.error('Error re-queuing delayed calls', queueUpdateError);

      }
    } catch (error) {
      console.error('Error triggering IVR cleanup:', error);
    }
  } else if (data.type === "message") {
    try {
      const { data: messages, error: messagesError } = await supabase
        .from('messages')
        .select(
          "sid, queue_id"
        )
        .eq('campaign_id', id)
        .eq('status', 'queued')
      if (messagesError) throw messagesError;
      if (messages && messages.length) {
        messages.map(async (message: any) => {
          // Cancel messages with twilio
          await twilio.messages(message.sid).remove()
        })
        const { error: messageUpdateError } = await supabase
          .from('message')
          .update({ status: 'canceled' })
          .in('sid', messages.map((message) => message.sid))
        if (messageUpdateError) console.error('Error marking messages as cancelled', messageUpdateError);
        // Re-queue any which did not get sent for the next run.
        const { error: queueUpdateError } = await supabase
          .from("campaign_queue")
          .update({ status: "queued" })
          .in("id", messages.map((message) => message.queue_id));
        if (queueUpdateError) console.error('Error re-queuing delayed messages', queueUpdateError);
      }
    } catch (error) {
      console.error('Error triggering SMS cleanup:', error);
    }
  }
};

async function getWorkspaceUsers(
  supabaseClient: SupabaseClient,
  workspaceId: string,
) {
  const { data, error } = await supabaseClient.rpc("get_workspace_users", {
    selected_workspace_id: workspaceId,
  });
  if (error) { console.error(error); throw error };
  return { data, error };
}

const getWorkspaceOwner = async (
  supabase: SupabaseClient,
  workspace_id: string,
) => {
  const { data, error } = await getWorkspaceUsers(supabase, workspace_id);
  if (error) throw error;
  return data.find((contact: any) => contact.user_workspace_role === "owner");
};

const handleInitiateCampaign = async (
  supabase: SupabaseClient,
  id: number,
) => {
  try {
    const { data, error: campaignQueueError } = await supabase.rpc("get_campaign_queue", {
      campaign_id_pro: id,
    });
    if (campaignQueueError) throw campaignQueueError;
    if (!data || !data.length) {
      console.log(`The queue is empty`)
      return new Response(JSON.stringify({ status: "empty_queue" }), {
        headers: { "Content-Type": "application/json" },
      });
    }
    const owner = await getWorkspaceOwner(supabase, data[0].workspace);
    const response = await fetch(
      `${baseUrl}/queue-next`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`
        },
        body: JSON.stringify({ campaign_id: id, owner: owner.id })
      }
    );
    if (!response.ok) throw new Error('Failed to queue initial call.');
  } catch (error) {
    console.error(error);
    throw error
  }
};

serve(async (req: Request) => {
  const { record }: {
    record: {
      id: number,
      title: string,
      status: string,
      type: "robocall" | "live_call" | "message",
      start_date: string,
      end_date: string,
      created_at: string,
      voicemail_file: string,
      call_questions: {},
      workspace: string,
      caller_id: string,
      group_household_queue: boolean,
      dial_type: "call" | "predictive" | null,
      dial_ratio: number,
      schedule: any,
      is_active: boolean,
    }
  } = await req.json();
  const supabase = initSupabaseClient();
  const now = new Date();
  console.log("Start Time", now);
  console.log("record", record);
  try {
    // Todo: build cron cleanup if record.end_date < now
    if (
      record.is_active &&
      new Date(record.end_date) > now &&
      new Date(record.start_date) < now
    ) {
      console.log(`Initiating campaign ${record.id}`)
      const { error: campaignUpdateError } = await supabase
        .from("campaign")
        .update({ status: "running" })
        .eq("id", record.id);
      if (campaignUpdateError) throw campaignUpdateError;

      if (record.type === "live_call") {
        // Return success if live campaign. Nothing to queue.
        return new Response(JSON.stringify({ status: "success" }), {
          headers: { "Content-Type": "application/json" },
        });
      }
      else if (record.type === "robocall" || record.type === "message") {

        await handleInitiateCampaign(supabase, record.id)
          .catch(e => console.error('Error initiating campaign:', e));

        return new Response(JSON.stringify({ status: "queued" }), {
          headers: { "Content-Type": "application/json" },
        });
      }
      else {
        throw new Error("Unknown campaign type");
      }

    } else if (
      (!record.is_active || new Date(record.end_date) <= now) &&
      record.status === "running"
    ) {
      const twilio = await createWorkspaceTwilioInstance(supabase, record.workspace);
      // Fire and forget pause operation
      // Todo: build a seperate and similar function to the queue to process cancellations.
      void handlePauseCampaign(supabase, record.id, twilio)
        .catch(e => console.error('Error pausing campaign:', e));

      return new Response(JSON.stringify({ status: "pausing" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ status: "no_action_needed" }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message, details: error.details }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
