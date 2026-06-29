import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@^2.39.6";
import { validateRequest } from "npm:twilio@^5.3.0/lib/webhooks/webhooks.js";
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
import { parseQueueIdFromName } from "../_shared/acd-utils.ts";
import { getFunctionUrl } from "../_shared/getFunctionsBaseUrl.ts";
import { resolveTwilioWebhookAuthToken } from "../_shared/twilio-workspace-credentials.ts";

function getBaseUrl(): string {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!supabaseUrl) throw new Error("SUPABASE_URL not set");
  return supabaseUrl.replace(/\/$/, "");
}

function clientFromOptions(options?: { supabase?: SupabaseClient }): SupabaseClient {
  return (
    options?.supabase ??
    createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    )
  );
}

/** Build the exact URL Twilio signed: base + sub-path + original query string. */
function buildValidationUrl(path: string, search: string): string {
  const base = getFunctionUrl("acd-router");
  const suffix = path === "/" ? "" : path;
  return `${base}${suffix}${search}`;
}

/** Resolve the workspace id for an ACD request from any of the identifiers Twilio sends. */
async function resolveWorkspaceId(
  supabase: SupabaseClient,
  url: URL,
  formData: FormData,
): Promise<string | null> {
  const queueIdRaw =
    url.searchParams.get("queue_id") || String(formData.get("queue_id") || "");
  const queueId = queueIdRaw ? parseInt(queueIdRaw, 10) : 0;
  if (queueId) {
    const queue = await lookupQueue(supabase, queueId);
    if (queue) return queue.workspace_id;
  }

  const queueName =
    url.searchParams.get("queue_name") || String(formData.get("queue_name") || "");
  const parsedQueueId = parseQueueIdFromName(queueName);
  if (parsedQueueId) {
    const queue = await lookupQueue(supabase, parsedQueueId);
    if (queue) return queue.workspace_id;
  }

  const entryIdRaw =
    url.searchParams.get("entry_id") || String(formData.get("entry_id") || "");
  const entryId = entryIdRaw ? parseInt(entryIdRaw, 10) : 0;
  if (entryId) {
    const { data } = await supabase
      .from("inbound_queue_entry")
      .select("workspace_id")
      .eq("id", entryId)
      .maybeSingle();
    if (data?.workspace_id) return data.workspace_id;
  }

  return null;
}

/** Validate the Twilio webhook signature for an ACD request. Fail-closed. */
async function validateAcdSignature(
  req: Request,
  path: string,
  url: URL,
  formData: FormData,
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<boolean> {
  const creds = await loadWorkspaceTwilioCredentials(supabase, workspaceId);
  const authToken = resolveTwilioWebhookAuthToken(creds);
  if (!authToken) return false;
  const signature = req.headers.get("x-twilio-signature") || "";
  const params = Object.fromEntries(formData.entries());
  const validationUrl = buildValidationUrl(path, url.search);
  return validateRequest(authToken, signature, validationUrl, params);
}

const invalidSignature = (): Response => new Response("Invalid Twilio signature", { status: 403 });

async function handleWaitUrl(
  req: Request,
  url: URL,
  path: string,
  options?: { supabase?: SupabaseClient },
): Promise<Response> {
  const queueId = parseInt(url.searchParams.get("queue_id") || "0", 10);
  if (!queueId) {
    return new Response(buildHoldMusicTwiml({ holdAudio: null, queueName: "" }), {
      headers: { "Content-Type": "text/xml" },
    });
  }

  const supabase = clientFromOptions(options);
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

  const isValid = await validateAcdSignature(req, path, url, formData, supabase, queue.workspace_id);
  if (!isValid) return invalidSignature();

  const queueName = makeQueueName(queueId);

  const parsedQueueTime = parseInt(queueTime, 10);
  if (parsedQueueTime >= 0) {
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
    }
  }

  return new Response(buildHoldMusicTwiml({
    holdAudio: queue.hold_audio,
    queueName,
  }), {
    headers: { "Content-Type": "text/xml" },
  });
}

async function handleAgentBridge(
  req: Request,
  url: URL,
  path: string,
  options?: { supabase?: SupabaseClient },
): Promise<Response> {
  const queueName = url.searchParams.get("queue_name") || "";
  const entryId = parseInt(url.searchParams.get("entry_id") || "0", 10);

  if (!entryId && !queueName) {
    return new Response(buildAgentBridgeTwiml(queueName), {
      headers: { "Content-Type": "text/xml" },
    });
  }

  const supabase = clientFromOptions(options);
  const formData = await req.formData().catch(() => new FormData());

  const workspaceId = await resolveWorkspaceId(supabase, url, formData);
  if (workspaceId) {
    const isValid = await validateAcdSignature(req, path, url, formData, supabase, workspaceId);
    if (!isValid) return invalidSignature();
  } else if (entryId) {
    return invalidSignature();
  }

  if (entryId) {
    await supabase.rpc("accept_inbound_offer", { p_entry_id: entryId }).catch(() => {});
  }

  return new Response(buildAgentBridgeTwiml(queueName), {
    headers: { "Content-Type": "text/xml" },
  });
}

async function handleAgentStatus(
  req: Request,
  url: URL,
  path: string,
  options?: { supabase?: SupabaseClient },
): Promise<Response> {
  const entryId = parseInt(url.searchParams.get("entry_id") || "0", 10);
  const formData = await req.formData().catch(() => new FormData());
  const callStatus = String(formData.get("CallStatus") || "").toLowerCase();

  if (!entryId) {
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = clientFromOptions(options);

  const workspaceId = await resolveWorkspaceId(supabase, url, formData);
  if (workspaceId) {
    const isValid = await validateAcdSignature(req, path, url, formData, supabase, workspaceId);
    if (!isValid) return invalidSignature();
  } else {
    return invalidSignature();
  }

  if (callStatus === "no-answer" || callStatus === "busy" || callStatus === "failed" || callStatus === "canceled") {
    await releaseAgent(supabase, entryId, "timed_out");
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
}

async function handleComplete(
  req: Request,
  url: URL,
  path: string,
  options?: { supabase?: SupabaseClient },
): Promise<Response> {
  const supabase = clientFromOptions(options);
  const formData = await req.formData().catch(() => new FormData());
  const queueResult = String(formData.get("QueueResult") || "").toLowerCase();

  const queueName = url.searchParams.get("queue_name") || "";
  const entryId = parseInt(url.searchParams.get("entry_id") || "0", 10);

  const workspaceId = await resolveWorkspaceId(supabase, url, formData);
  if (workspaceId) {
    const isValid = await validateAcdSignature(req, path, url, formData, supabase, workspaceId);
    if (!isValid) return invalidSignature();
  }

  if (entryId) {
    if (queueResult === "bridged" || queueResult === "completed") {
      await supabase.rpc("complete_inbound_queue_entry", { p_entry_id: entryId }).catch(() => {});
    } else if (queueResult === "hangup" || queueResult === "leaving") {
      await supabase.rpc("abandon_inbound_queue_entry", { p_entry_id: entryId }).catch(() => {});
    }
  }

  return new Response("", { status: 200 });
}

export async function handleRequest(
  req: Request,
  options?: { supabase?: SupabaseClient },
): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/functions\/v1\/acd-router/, "").replace(/\/$/, "") || "/";

  try {
    if (path === "/agent-bridge") {
      return await handleAgentBridge(req, url, path, options);
    }
    if (path === "/agent-status") {
      return await handleAgentStatus(req, url, path, options);
    }
    if (path === "/complete") {
      return await handleComplete(req, url, path, options);
    }
    // Default: wait URL handler
    return await handleWaitUrl(req, url, path, options);
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
