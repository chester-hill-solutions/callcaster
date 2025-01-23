//import * as Deno from "https://deno.land/std@0.203.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@^2.39.6";
import { Twilio } from "npm:twilio@5.3.0";
import { crypto } from "https://deno.land/std@0.177.0/crypto/mod.ts";
import { encode } from "https://deno.land/std@0.177.0/encoding/base64.ts";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

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

const handleTriggerStart = async (
  contacts: any[],
  campaign_id: string,
  user_id: string,
  type: "live_call" | "message" | "robocall",
  supabase: SupabaseClient,
) => {
  const lastContactIndex = contacts.length - 1;
  const batchSize = 100;
  
  // Split contacts into batches and queue them
  for (let i = 0; i < contacts.length; i += batchSize) {
    const batch = contacts.slice(i, i + batchSize);
    const tasks = batch.map((contact, batchIndex) => ({
      to_number: contact.phone,
      user_id: user_id,
      campaign_id: Number(campaign_id),
      workspace_id: contact.workspace,
      queue_id: Number(contact.id),
      contact_id: Number(contact.contact_id),
      caller_id: contact.caller_id,
      index: i + batchIndex,
      total: contacts.length,
      isLastContact: (i + batchIndex) === lastContactIndex,
      type
    }));

    // Queue the batch using PGMQ
    if (type === "robocall") {
      const { error } = await supabase.rpc('enqueue_ivr_batch', {
        p_tasks: tasks
      });
      if (error) throw error;
    } else if (type === "message") {
      const { error } = await supabase.rpc('enqueue_sms_batch', {
        p_tasks: tasks
      });
      if (error) throw error;
    }
  }

  // Fire and forget task processing
  if (type === "robocall") {
    try {
      await supabase.rpc('process_ivr_tasks');
      console.log('IVR task processing triggered');
    } catch (error: unknown) {
      console.error('Error triggering IVR processing:', error);
    }
  } else if (type === "message") {
    try {
      await supabase.rpc('process_sms_tasks');
      console.log('SMS task processing triggered');
    } catch (error: unknown) {
      console.error('Error triggering SMS processing:', error);
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
  id: string,
  type: "live_call" | "message" | "robocall",
) => {
  const { data, error } = await supabase.rpc("get_campaign_queue", {
    campaign_id_pro: id,
  });
  if (error || !data.length) throw error || new Error("No queue found");
  const owner = await getWorkspaceOwner(supabase, data[0].workspace);
  await handleTriggerStart(data, id, owner.id, type, supabase);
};

const handlePauseCampaign = async (
  supabase: SupabaseClient,
  id: string,
  twilio: typeof Twilio.Twilio,
) => {
  // Update campaign status to pending - this will cause queue processors to skip remaining messages
  const { data, error } = await supabase
    .from("campaign")
    .update({ status: "pending" })
    .eq("id", id)
    .select("type")
    .single();
  if (error) throw error;

  // Trigger queue processing to clean up remaining messages
  if (data.type === "robocall") {
    try {
      await supabase.rpc('process_ivr_tasks');
    } catch (error) {
      console.error('Error triggering IVR cleanup:', error);
    }
  } else if (data.type === "message") {
    try {
      await supabase.rpc('process_sms_tasks');
    } catch (error) {
      console.error('Error triggering SMS cleanup:', error);
    }
  }
};

serve(async (req: Request) => {
  const { record } = await req.json();
  const supabase = initSupabaseClient();
  const now = new Date();
  console.log("Start Time", now);
  console.log("record", record);
  
  try {
    if (
      record.is_active &&
      new Date(record.end_date) > now &&
      new Date(record.start_date) < now
    ) {
      // Update campaign status immediately
      const { error } = await supabase
        .from("campaign")
        .update({ status: "running" })
        .eq("id", record.id);
      if (error) throw error;

      if (record.type === "live_call") {
        return new Response(JSON.stringify({ status: "success" }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      // Fire and forget campaign initiation
      void handleInitiateCampaign(supabase, record.id, record.type)
        .catch(e => console.error('Error initiating campaign:', e));

      return new Response(JSON.stringify({ status: "queued" }), {
        headers: { "Content-Type": "application/json" },
      });

    } else if (
      (!record.is_active || new Date(record.end_date) <= now) && 
      record.status === "running"
    ) {
      const twilio = await createWorkspaceTwilioInstance(supabase, record.workspace);
      // Fire and forget pause operation
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
