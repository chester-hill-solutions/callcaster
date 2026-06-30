import { eq } from "drizzle-orm";
import Twilio from "twilio";
import {
  buildAgentBridgeTwiml,
  buildHoldMusicTwiml,
  makeQueueName,
  parseQueueIdFromName,
  type QueueRecord,
  type TwilioCredentials,
} from "../../../shared/acd-utils.ts";
import {
  inbound_queue as inboundQueueTable,
  inbound_queue_entry as inboundQueueEntryTable,
  workspace as workspaceTable,
} from "@/db/schema";
import {
  rpcAcceptInboundOffer,
  rpcAbandonInboundQueueEntry,
  rpcClaimInboundQueueEntry,
  rpcCompleteInboundQueueEntry,
  rpcReleaseInboundOffer,
} from "@/lib/db-rpc.server";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import {
  readTwilioWorkspaceCredentials,
  resolveTwilioWebhookAuthToken,
} from "@/lib/twilio-workspace-credentials";
import { validateTwilioWebhookParams } from "@/twilio.server";
import { adminDb } from "@/server/admin-db";
import { db } from "@/server/db";
import { isObject } from "@/lib/type-safety-utils";

export type { QueueRecord, TwilioCredentials };
export {
  buildAgentBridgeTwiml,
  buildHoldMusicTwiml,
  makeQueueName,
  parseQueueIdFromName,
} from "../../../shared/acd-utils.ts";

export const INBOUND_OFFER_TIMEOUT_SECONDS = 25;
export const POLL_INTERVAL_MS = 3000;

function parseTwilioData(raw: unknown): Record<string, unknown> | null {
  if (isObject(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return isObject(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

export async function lookupQueue(queueId: number): Promise<QueueRecord | null> {
  const [row] = await adminDb
    .select({
      id: inboundQueueTable.id,
      workspace_id: inboundQueueTable.workspace_id,
      name: inboundQueueTable.name,
      hold_audio: inboundQueueTable.hold_audio,
    })
    .from(inboundQueueTable)
    .where(eq(inboundQueueTable.id, queueId))
    .limit(1);
  return row ?? null;
}

export async function loadWorkspaceTwilioCredentialsForAcd(
  workspaceId: string,
): Promise<TwilioCredentials | null> {
  const [row] = await adminDb
    .select({ twilio_data: workspaceTable.twilio_data })
    .from(workspaceTable)
    .where(eq(workspaceTable.id, workspaceId))
    .limit(1);

  const creds = readTwilioWorkspaceCredentials(parseTwilioData(row?.twilio_data));
  if (!creds) return null;
  return { accountSid: creds.sid, authToken: creds.authToken };
}

export async function claimAgentForQueue(args: {
  queueId: number;
  workspaceId: string;
  callSid: string;
  callerNumber: string;
}): Promise<{ agentUserId: string; entryId: number } | null> {
  try {
    const row = await rpcClaimInboundQueueEntry(db, {
      queueId: args.queueId,
      workspaceId: args.workspaceId,
      callSid: args.callSid,
      callerNumber: args.callerNumber,
    });
    if (!row) return null;
    return { agentUserId: row.agent_user_id, entryId: row.entry_id };
  } catch (error) {
    logger.error("claim_inbound_queue_entry RPC error", error);
    return null;
  }
}

export async function dialAgent(args: {
  twilioCredentials: TwilioCredentials;
  agentUserId: string;
  queueId: number;
  entryId: number;
  baseUrl: string;
  callerNumber: string;
}): Promise<void> {
  const client = Twilio(args.twilioCredentials.accountSid, args.twilioCredentials.authToken);
  const queueName = makeQueueName(args.queueId);
  const agentBridgeUrl = `${args.baseUrl}/api/acd-router/agent-bridge?queue_name=${queueName}&entry_id=${args.entryId}`;
  const agentStatusUrl = `${args.baseUrl}/api/acd-router/agent-status?entry_id=${args.entryId}&queue_id=${args.queueId}`;

  try {
    await client.calls.create({
      to: `client:agent_${args.agentUserId.replace(/-/g, "_")}`,
      from: args.callerNumber,
      url: agentBridgeUrl,
      statusCallback: agentStatusUrl,
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
      statusCallbackMethod: "POST",
      timeout: INBOUND_OFFER_TIMEOUT_SECONDS,
    });
  } catch (error) {
    logger.error("Failed to dial agent", {
      agentUserId: args.agentUserId,
      entryId: args.entryId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function releaseAgent(
  entryId: number,
  outcome: "timed_out" | "declined" = "timed_out",
): Promise<void> {
  try {
    await rpcReleaseInboundOffer(db, { entryId, outcome });
  } catch (error) {
    logger.error("release_inbound_offer RPC error", error);
  }
}

function getBaseUrl(): string {
  return env.BASE_URL().replace(/\/$/, "");
}

function buildValidationUrl(requestUrl: string, pathSuffix: string): string {
  const url = new URL(requestUrl);
  url.pathname = pathSuffix.startsWith("/api/")
    ? pathSuffix
    : `/api/acd-router${pathSuffix === "/" ? "" : pathSuffix}`;
  return url.href;
}

async function resolveWorkspaceId(
  url: URL,
  formData: FormData,
): Promise<string | null> {
  const queueIdRaw =
    url.searchParams.get("queue_id") || String(formData.get("queue_id") || "");
  const queueId = queueIdRaw ? parseInt(queueIdRaw, 10) : 0;
  if (queueId) {
    const queue = await lookupQueue(queueId);
    if (queue) return queue.workspace_id;
  }

  const queueName =
    url.searchParams.get("queue_name") || String(formData.get("queue_name") || "");
  const parsedQueueId = parseQueueIdFromName(queueName);
  if (parsedQueueId) {
    const queue = await lookupQueue(parsedQueueId);
    if (queue) return queue.workspace_id;
  }

  const entryIdRaw =
    url.searchParams.get("entry_id") || String(formData.get("entry_id") || "");
  const entryId = entryIdRaw ? parseInt(entryIdRaw, 10) : 0;
  if (entryId) {
    const [row] = await adminDb
      .select({ workspace_id: inboundQueueEntryTable.workspace_id })
      .from(inboundQueueEntryTable)
      .where(eq(inboundQueueEntryTable.id, entryId))
      .limit(1);
    if (row?.workspace_id) return row.workspace_id;
  }

  return null;
}

async function validateAcdSignature(args: {
  request: Request;
  pathSuffix: string;
  formData: FormData;
  workspaceId: string;
}): Promise<boolean> {
  const creds = await loadWorkspaceTwilioCredentialsForAcd(args.workspaceId);
  const authToken = resolveTwilioWebhookAuthToken(
    creds ? { sid: creds.accountSid, authToken: creds.authToken } : null,
  );
  if (!authToken) return false;
  const signature = args.request.headers.get("x-twilio-signature") || "";
  const params = Object.fromEntries(args.formData.entries()) as Record<string, string>;
  const validationUrl = buildValidationUrl(args.request.url, args.pathSuffix);
  return validateTwilioWebhookParams(params, signature, validationUrl, authToken);
}

const invalidSignature = (): Response =>
  new Response("Invalid Twilio signature", { status: 403 });

export type AcdRouterPath = "wait" | "agent-bridge" | "agent-status" | "complete";

export async function handleAcdRouterRequest(
  request: Request,
  path: AcdRouterPath,
): Promise<Response> {
  const url = new URL(request.url);
  const pathSuffix =
    path === "wait"
      ? "/api/acd-router"
      : path === "complete"
        ? "/api/acd-router/complete"
        : `/api/acd-router/${path}`;

  try {
    if (path === "agent-bridge") {
      return await handleAgentBridge(request, url, pathSuffix);
    }
    if (path === "agent-status") {
      return await handleAgentStatus(request, url, pathSuffix);
    }
    if (path === "complete") {
      return await handleComplete(request, url, pathSuffix);
    }
    return await handleWaitUrl(request, url, pathSuffix);
  } catch (error) {
    logger.error("acd-router error", error);
    if (path === "wait") {
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

async function handleWaitUrl(
  request: Request,
  url: URL,
  pathSuffix: string,
): Promise<Response> {
  const queueId = parseInt(url.searchParams.get("queue_id") || "0", 10);
  if (!queueId) {
    return new Response(buildHoldMusicTwiml({ holdAudio: null, queueName: "" }), {
      headers: { "Content-Type": "text/xml" },
    });
  }

  const formData = await request.formData().catch(() => new FormData());
  const callSid = String(formData.get("CallSid") || url.searchParams.get("CallSid") || "");
  const callerNumber = String(formData.get("From") || url.searchParams.get("From") || "");
  const queueTime = String(formData.get("QueueTime") || "0");

  const queue = await lookupQueue(queueId);
  if (!queue) {
    return new Response(buildHoldMusicTwiml({ holdAudio: null, queueName: "" }), {
      headers: { "Content-Type": "text/xml" },
    });
  }

  const isValid = await validateAcdSignature({
    request,
    pathSuffix,
    formData,
    workspaceId: queue.workspace_id,
  });
  if (!isValid) return invalidSignature();

  const queueName = makeQueueName(queueId);
  const parsedQueueTime = parseInt(queueTime, 10);
  if (parsedQueueTime >= 0) {
    const claimed = await claimAgentForQueue({
      queueId,
      workspaceId: queue.workspace_id,
      callSid,
      callerNumber,
    });

    if (claimed) {
      const credentials = await loadWorkspaceTwilioCredentialsForAcd(queue.workspace_id);
      if (credentials) {
        await dialAgent({
          twilioCredentials: credentials,
          agentUserId: claimed.agentUserId,
          queueId,
          entryId: claimed.entryId,
          baseUrl: getBaseUrl(),
          callerNumber,
        });
      }
    }
  }

  return new Response(
    buildHoldMusicTwiml({
      holdAudio: queue.hold_audio,
      queueName,
    }),
    { headers: { "Content-Type": "text/xml" } },
  );
}

async function handleAgentBridge(
  request: Request,
  url: URL,
  pathSuffix: string,
): Promise<Response> {
  const queueName = url.searchParams.get("queue_name") || "";
  const entryId = parseInt(url.searchParams.get("entry_id") || "0", 10);

  if (!entryId && !queueName) {
    return new Response(buildAgentBridgeTwiml(queueName), {
      headers: { "Content-Type": "text/xml" },
    });
  }

  const formData = await request.formData().catch(() => new FormData());
  const workspaceId = await resolveWorkspaceId(url, formData);
  if (workspaceId) {
    const isValid = await validateAcdSignature({
      request,
      pathSuffix,
      formData,
      workspaceId,
    });
    if (!isValid) return invalidSignature();
  } else if (entryId) {
    return invalidSignature();
  }

  if (entryId) {
    try {
      await rpcAcceptInboundOffer(db, entryId);
    } catch {
      // best-effort
    }
  }

  return new Response(buildAgentBridgeTwiml(queueName), {
    headers: { "Content-Type": "text/xml" },
  });
}

async function handleAgentStatus(
  request: Request,
  url: URL,
  pathSuffix: string,
): Promise<Response> {
  const entryId = parseInt(url.searchParams.get("entry_id") || "0", 10);
  const formData = await request.formData().catch(() => new FormData());
  const callStatus = String(formData.get("CallStatus") || "").toLowerCase();

  if (!entryId) {
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const workspaceId = await resolveWorkspaceId(url, formData);
  if (workspaceId) {
    const isValid = await validateAcdSignature({
      request,
      pathSuffix,
      formData,
      workspaceId,
    });
    if (!isValid) return invalidSignature();
  } else {
    return invalidSignature();
  }

  if (
    callStatus === "no-answer" ||
    callStatus === "busy" ||
    callStatus === "failed" ||
    callStatus === "canceled"
  ) {
    await releaseAgent(entryId, "timed_out");
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
}

async function handleComplete(
  request: Request,
  url: URL,
  pathSuffix: string,
): Promise<Response> {
  const formData = await request.formData().catch(() => new FormData());
  const queueResult = String(formData.get("QueueResult") || "").toLowerCase();
  const entryId = parseInt(url.searchParams.get("entry_id") || "0", 10);

  const workspaceId = await resolveWorkspaceId(url, formData);
  if (workspaceId) {
    const isValid = await validateAcdSignature({
      request,
      pathSuffix,
      formData,
      workspaceId,
    });
    if (!isValid) return invalidSignature();
  }

  if (entryId) {
    try {
      if (queueResult === "bridged" || queueResult === "completed") {
        await rpcCompleteInboundQueueEntry(db, entryId);
      } else if (queueResult === "hangup" || queueResult === "leaving") {
        await rpcAbandonInboundQueueEntry(db, entryId);
      }
    } catch {
      // best-effort
    }
  }

  return new Response("", { status: 200 });
}
