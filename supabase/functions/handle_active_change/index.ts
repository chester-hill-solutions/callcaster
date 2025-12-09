//import * as Deno from "https://deno.land/std@0.203.0/http/server.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@^2.39.6";
import Twilio from "npm:twilio@5.3.0";
import { crypto } from "https://deno.land/std@0.177.0/crypto/mod.ts";
import { encode } from "https://deno.land/std@0.177.0/encoding/base64.ts";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
const baseUrl = 'https://nolrdvpusfcsjihzhnlp.supabase.co/functions/v1';

// Timeout wrapper for async operations
const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, operationName: string): Promise<T> => {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`${operationName} timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  
  return Promise.race([promise, timeoutPromise]);
};

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

const handleCancelCampaign = async (
  supabase: SupabaseClient,
  id: number,
  twilio: typeof Twilio.Twilio,
) => {
  const { data, error } = await supabase
    .from("campaign")
    .select("type")
    .eq("id", id)
    .single();
  if (error) throw error;

  if (data.type === "robocall") {
    try {
      // Process cancellations in batches to avoid timeouts
      let offset = 0;
      const batchSize = 50;
      let hasMore = true;
      
      while (hasMore) {
        const { data: calls, error: callsError } = await supabase
          .from('call')
          .select("sid, queue_id")
          .eq('campaign_id', id)
          .in('status', ['queued', 'ringing', 'initiated'])
          .range(offset, offset + batchSize - 1);
          
        if (callsError) {
          console.error('Error fetching calls for cancellation:', callsError);
          break;
        }
        
        if (!calls || calls.length === 0) {
          hasMore = false;
          break;
        }
        
        // Process Twilio call cancellations in parallel with proper error handling
        const twilioPromises = calls.map(async (call: { sid: string }) => {
          try {
            await withTimeout(
              twilio.calls(call.sid).update({ status: "canceled" }),
              10000, // 10 second timeout per call
              `Cancel call ${call.sid}`
            );
            return { success: true, sid: call.sid };
          } catch (error) {
            console.error(`Failed to cancel call ${call.sid}:`, error);
            return { success: false, sid: call.sid, error };
          }
        });
        
        // Wait for all Twilio operations to complete
        await Promise.allSettled(twilioPromises);
        
        // Mark the calls as cancelled in the database
        const { error: callUpdateError } = await supabase
          .from('call')
          .update({ status: 'canceled' })
          .in('sid', calls.map((call) => call.sid));
        if (callUpdateError) console.error('Error marking calls as cancelled', callUpdateError);
        
        // Remove from queue
        const { error: queueUpdateError } = await supabase
          .from("campaign_queue")
          .update({ status: "canceled" })
          .in("id", calls.map((call) => call.queue_id).filter(Boolean));
        if (queueUpdateError) console.error('Error updating queue for cancelled calls', queueUpdateError);
        
        offset += batchSize;
        hasMore = calls.length === batchSize;
      }
    } catch (error) {
      console.error('Error processing call cancellations:', error);
      throw error;
    }
  } else if (data.type === "message") {
    try {
      // Process message cancellations in batches to avoid timeouts
      let offset = 0;
      const batchSize = 50;
      let hasMore = true;
      
      while (hasMore) {
        const { data: messages, error: messagesError } = await supabase
          .from('messages')
          .select("sid, queue_id")
          .eq('campaign_id', id)
          .in('status', ['queued', 'sending'])
          .range(offset, offset + batchSize - 1);
          
        if (messagesError) {
          console.error('Error fetching messages for cancellation:', messagesError);
          break;
        }
        
        if (!messages || messages.length === 0) {
          hasMore = false;
          break;
        }
        
        // Process Twilio message cancellations in parallel with proper error handling
        const twilioPromises = messages.map(async (message: { sid: string }) => {
          try {
            await withTimeout(
              twilio.messages(message.sid).remove(),
              10000, // 10 second timeout per message
              `Remove message ${message.sid}`
            );
            return { success: true, sid: message.sid };
          } catch (error) {
            console.error(`Failed to remove message ${message.sid}:`, error);
            return { success: false, sid: message.sid, error };
          }
        });
        
        // Wait for all Twilio operations to complete
        await Promise.allSettled(twilioPromises);
        
        // Mark the messages as cancelled in the database
        const { error: messageUpdateError } = await supabase
          .from('messages')
          .update({ status: 'canceled' })
          .in('sid', messages.map((message) => message.sid));
        if (messageUpdateError) console.error('Error marking messages as cancelled', messageUpdateError);
        
        // Remove from queue
        const { error: queueUpdateError } = await supabase
          .from("campaign_queue")
          .update({ status: "canceled" })
          .in("id", messages.map((message) => message.queue_id).filter(Boolean));
        if (queueUpdateError) console.error('Error updating queue for cancelled messages', queueUpdateError);
        
        offset += batchSize;
        hasMore = messages.length === batchSize;
      }
    } catch (error) {
      console.error('Error processing message cancellations:', error);
      throw error;
    }
  }
};

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
      // Process calls in batches to avoid timeouts
      let offset = 0;
      const batchSize = 50;
      let hasMore = true;
      
      while (hasMore) {
        const { data: calls, error: callsError } = await supabase
          .from('call')
          .select("sid, queue_id")
          .eq('campaign_id', id)
          .eq('status', 'queued')
          .range(offset, offset + batchSize - 1);
          
        if (callsError) {
          console.error(callsError);
          break;
        }
        
        if (!calls || calls.length === 0) {
          hasMore = false;
          break;
        }
        
        // Process Twilio calls in parallel with proper error handling
        const twilioPromises = calls.map(async (call: { sid: string }) => {
          try {
            await withTimeout(
              twilio.calls(call.sid).update({ status: "canceled" }),
              10000, // 10 second timeout per call
              `Cancel call ${call.sid}`
            );
            return { success: true, sid: call.sid };
          } catch (error) {
            console.error(`Failed to cancel call ${call.sid}:`, error);
            return { success: false, sid: call.sid, error };
          }
        });
        
        // Wait for all Twilio operations to complete
        await Promise.allSettled(twilioPromises);
        
        // Mark the calls as cancelled in the database
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
        
        offset += batchSize;
        hasMore = calls.length === batchSize;
      }
    } catch (error) {
      console.error('Error triggering IVR cleanup:', error);
    }
  } else if (data.type === "message") {
    try {
      // Process messages in batches to avoid timeouts
      let offset = 0;
      const batchSize = 50;
      let hasMore = true;
      
      while (hasMore) {
        const { data: messages, error: messagesError } = await supabase
          .from('messages')
          .select("sid, queue_id")
          .eq('campaign_id', id)
          .eq('status', 'queued')
          .range(offset, offset + batchSize - 1);
          
        if (messagesError) {
          console.error(messagesError);
          break;
        }
        
        if (!messages || messages.length === 0) {
          hasMore = false;
          break;
        }
        
        // Process Twilio messages in parallel with proper error handling
        const twilioPromises = messages.map(async (message: { sid: string }) => {
          try {
            await withTimeout(
              twilio.messages(message.sid).remove(),
              10000, // 10 second timeout per message
              `Remove message ${message.sid}`
            );
            return { success: true, sid: message.sid };
          } catch (error) {
            console.error(`Failed to remove message ${message.sid}:`, error);
            return { success: false, sid: message.sid, error };
          }
        });
        
        // Wait for all Twilio operations to complete
        await Promise.allSettled(twilioPromises);
        
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
        
        offset += batchSize;
        hasMore = messages.length === batchSize;
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
  return data.find((contact: { user_workspace_role: string }) => contact.user_workspace_role === "owner");
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
    
    const response = await withTimeout(
      fetch(
        `${baseUrl}/queue-next`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`
          },
          body: JSON.stringify({ campaign_id: id, owner: owner.id })
        }
      ),
      15000, // 15 second timeout for queue-next call
      'Queue next call'
    );
    
    if (!response.ok) throw new Error('Failed to queue initial call.');
  } catch (error) {
    console.error(error);
    throw error
  }
};

serve(async (req: Request) => {
  const startTime = Date.now();
  const TIMEOUT_THRESHOLD = 25000; // 25 seconds to leave buffer for response
  
  try {
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
        schedule: Record<string, unknown> | null,
        is_active: boolean,
      }
    } = await req.json();
    
    const supabase = initSupabaseClient();
    const now = new Date();
    console.log("Start Time", now);
    console.log("record", record);
    
    // Check for timeout threshold
    if (Date.now() - startTime > TIMEOUT_THRESHOLD) {
      console.warn("Function approaching timeout, returning early");
      return new Response(JSON.stringify({ status: "timeout_warning", message: "Function approaching timeout limit" }), {
        headers: { "Content-Type": "application/json" },
      });
    }
    
    // Cron cleanup: Archive campaigns that have expired (end_date < now)
    if (new Date(record.end_date) <= now && record.status !== "archived" && record.status !== "complete") {
      console.log(`Archiving expired campaign ${record.id}`);
      const { error: archiveError } = await supabase
        .from("campaign")
        .update({ 
          status: "archived",
          is_active: false
        })
        .eq("id", record.id);
      
      if (archiveError) {
        console.error(`Error archiving campaign ${record.id}:`, archiveError);
        throw archiveError;
      }
      
      return new Response(JSON.stringify({ status: "archived", message: `Campaign ${record.id} has been archived` }), {
        headers: { "Content-Type": "application/json" },
      });
    }
    
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
      // Fire and forget pause operation with timeout protection
      void handlePauseCampaign(supabase, record.id, twilio)
        .catch(e => console.error('Error pausing campaign:', e));

      return new Response(JSON.stringify({ status: "pausing" }), {
        headers: { "Content-Type": "application/json" },
      });
    } else if (record.status === "canceled" || record.status === "cancelled") {
      // Process cancellations using dedicated cancellation handler
      const twilio = await createWorkspaceTwilioInstance(supabase, record.workspace);
      void handleCancelCampaign(supabase, record.id, twilio)
        .catch(e => console.error('Error canceling campaign:', e));

      return new Response(JSON.stringify({ status: "canceling" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ status: "no_action_needed" }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    console.error("Error:", error);
    const executionTime = Date.now() - startTime;
    console.log(`Function execution time: ${executionTime}ms`);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorDetails = error && typeof error === 'object' && 'details' in error ? error.details : undefined;
    
    return new Response(
      JSON.stringify({ 
        error: errorMessage, 
        details: errorDetails,
        execution_time_ms: executionTime
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
