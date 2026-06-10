import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@^2.39.6";
import {
  buildAgentBridgeTwiml,
  buildHoldMusicTwiml,
  claimAgentForQueue,
  dialAgent,
  loadWorkspaceTwilioCredentials,
  lookupQueue,
  makeQueueName,
  releaseAgent,
  type QueueRecord,
  type TwilioCredentials,
} from "../_shared/acd-router.ts";

function getBaseUrl(): string {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!supabaseUrl) throw new Error("SUPABASE_URL not set");
  return supabaseUrl.replace(/\/$/, "");
}

async function handleWaitUrl(req: Request, url: URL): Promise<Response> {
  const queueId = parseInt(url.searchParams.get("queue_id") || "0", 10);
  if (!queueId) {
    return new Response(buildHoldMusicTwiml({ holdAudio: null, queueName: "" }), {
      headers: { "Content-Type": "text/xml" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const formData = await req.formData().catch(() => new FormData());
  const callSid = String(formData.get("CallSid") || url.searchParams.get("CallSid") || "");
  const callerNumber = String(formData.get("From") || url.searchParams.get("From") || "");
  const queueTime = String(formData.get("QueueTime") || "0");

  const queue = await lookupQueue(supabase, queueId);
  if (!queue) {
    return new Response(buildHoldMusicTwiml({ holdAudio: null, queueName: "" }), {
      headers: { "Content-Type": "text/xml" },
    });
  }

  const queueName = makeQueueName(queueId);

  // Only try to claim an agent if this is the initial entry or periodic check
  // Skip if caller has been waiting less than 2 seconds (initial entry, let them settle)
  const parsedQueueTime = parseInt(queueTime, 10);
  if (parsedQueueTime >= 0) {
    // Attempt to claim an available agent
    const claimed = await claimAgentForQueue({
      supabase,
      queueId,
      workspaceId: queue.workspace_id,
      callSid,
      callerNumber,
    });

    if (claimed) {
      const credentials = await loadWorkspaceTwilioCredentials(supabase, queue.workspace_id);
      if (credentials) {
        await dialAgent({
          twilioCredentials: credentials,
          agentUserId: claimed.agentUserId,
          queueId,
          entryId: claimed.entryId,
          baseUrl: getBaseUrl(),
          workspaceId: queue.workspace_id,
          callerNumber,
        });
      }

      return new Response(buildHoldMusicTwiml({
        holdAudio: queue.hold_audio,
        queueName,
      }), {
        headers: { "Content-Type": "text/xml" },
      });
    }
  }

  return new Response(buildHoldMusicTwiml({
    holdAudio: queue.hold_audio,
    queueName,
  }), {
    headers: { "Content-Type": "text/xml" },
  });
}

async function handleAgentBridge(req: Request, url: URL): Promise<Response> {
  const queueName = url.searchParams.get("queue_name") || "";
  const entryId = parseInt(url.searchParams.get("entry_id") || "0", 10);

  if (entryId) {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    await supabase.rpc("accept_inbound_offer", { p_entry_id: entryId }).catch(() => {});
  }

  return new Response(buildAgentBridgeTwiml(queueName), {
    headers: { "Content-Type": "text/xml" },
  });
}

async function handleAgentStatus(req: Request, url: URL): Promise<Response> {
  const entryId = parseInt(url.searchParams.get("entry_id") || "0", 10);
  const formData = await req.formData().catch(() => new FormData());
  const callStatus = String(formData.get("CallStatus") || "").toLowerCase();

  if (!entryId) {
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  if (callStatus === "no-answer" || callStatus === "busy" || callStatus === "failed" || callStatus === "canceled") {
    await releaseAgent(supabase, entryId, "timed_out");
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
}

async function handleComplete(req: Request, url: URL): Promise<Response> {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const formData = await req.formData().catch(() => new FormData());
  const queueResult = String(formData.get("QueueResult") || "").toLowerCase();

  // Extract entry_id from the queue_name query param if present
  const queueName = url.searchParams.get("queue_name") || "";
  const entryId = parseInt(url.searchParams.get("entry_id") || "0", 10);

  if (entryId) {
    if (queueResult === "bridged" || queueResult === "completed") {
      await supabase.rpc("complete_inbound_queue_entry", { p_entry_id: entryId }).catch(() => {});
    } else if (queueResult === "hangup" || queueResult === "leaving") {
      await supabase.rpc("abandon_inbound_queue_entry", { p_entry_id: entryId }).catch(() => {});
    }
  }

  return new Response("", { status: 200 });
}

export async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/functions\/v1\/acd-router/, "").replace(/\/$/, "") || "/";

  try {
    if (path === "/agent-bridge") {
      return await handleAgentBridge(req, url);
    }
    if (path === "/agent-status") {
      return await handleAgentStatus(req, url);
    }
    if (path === "/complete") {
      return await handleComplete(req, url);
    }
    // Default: wait URL handler
    return await handleWaitUrl(req, url);
  } catch (error) {
    console.error("acd-router error", error);
    // Always return valid TwiML for wait URL failures
    if (path === "/" || path === "/wait") {
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Please wait for the next available agent.</Say></Response>`,
        { headers: { "Content-Type": "text/xml" } },
      );
    }
    return new Response(JSON.stringify({ error: String(error) }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}
