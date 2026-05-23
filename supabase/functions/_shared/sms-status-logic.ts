import { canTransitionOutreachDisposition } from "./ivr-status-logic.ts";

export type TwilioSmsStatus =
  | "accepted"
  | "scheduled"
  | "canceled"
  | "queued"
  | "sending"
  | "sent"
  | "failed"
  | "delivered"
  | "undelivered"
  | "receiving"
  | "received"
  | "read";

const VALID_SMS_STATUSES = new Set<TwilioSmsStatus>([
  "accepted",
  "scheduled",
  "canceled",
  "queued",
  "sending",
  "sent",
  "failed",
  "delivered",
  "undelivered",
  "receiving",
  "received",
  "read",
]);

export function pickRawTwilioSmsStatus(payload: {
  SmsStatus?: string | null;
  MessageStatus?: string | null;
}): string | null {
  return (payload.SmsStatus || payload.MessageStatus || null) as string | null;
}

export function normalizeTwilioSmsStatus(raw: string): TwilioSmsStatus {
  const s = String(raw || "").trim().toLowerCase();
  return (VALID_SMS_STATUSES.has(s as TwilioSmsStatus)
    ? (s as TwilioSmsStatus)
    : "failed") as TwilioSmsStatus;
}

export function shouldUpdateOutreachDisposition(args: {
  currentDisposition: string | null | undefined;
  nextDisposition: string | null | undefined;
}): boolean {
  const current = args.currentDisposition ?? null;
  const next = String(args.nextDisposition ?? "").toLowerCase();
  if (!next) return false;
  return canTransitionOutreachDisposition(current, next);
}

import {
  buildCanceledQueueUpdate,
} from "./queue-writes.ts";

export type OutboundSmsWebhookMessage = {
  sid: string;
  from?: string;
  to?: string;
  body?: string;
  num_media?: string | number | null;
  status?: string | null;
  date_updated?: string | null;
};

export function buildOutboundSmsWebhookBody(args: {
  workspaceId: string;
  message: OutboundSmsWebhookMessage;
}) {
  return {
    event_category: "outbound_sms",
    event_type: "UPDATE",
    workspace_id: args.workspaceId,
    payload: {
      type: "outbound_sms",
      record: {
        message_sid: args.message.sid,
        from: args.message.from,
        to: args.message.to,
        body: args.message.body,
        num_media: args.message.num_media,
        status: args.message.status,
        date_updated: args.message.date_updated,
      },
      old_record: { message_sid: args.message.sid },
    },
  };
}

export function coerceWebhookHeaders(
  customHeaders: Record<string, unknown> | null | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!customHeaders || typeof customHeaders !== "object") return out;
  for (const [k, v] of Object.entries(customHeaders)) {
    out[k] = String(v);
  }
  return out;
}

export async function cancelQueuedMessages(args: {
  supabase: { from: (table: string) => any };
  campaignId: string | number;
}) {
  if (!args.campaignId) return;

  const { data: queuedMessages, error: queueError } = await args.supabase
    .from("campaign_queue")
    .select("id")
    .eq("status", "queued")
    .eq("campaign_id", args.campaignId);
  if (queueError) return;
  if (!queuedMessages?.length) return;
  await args.supabase
    .from("campaign_queue")
    .update(buildCanceledQueueUpdate())
    .eq("status", "queued")
    .eq("campaign_id", args.campaignId);
}

export async function sendOutboundSmsWebhookIfConfigured(args: {
  supabase: { from: (table: string) => any };
  workspaceId: string;
  message: OutboundSmsWebhookMessage;
  fetchImpl?: typeof fetch;
}) {
  const fetchImpl = args.fetchImpl ?? fetch;
  const { data: webhook, error: webhookError } = await args.supabase
    .from("webhook")
    .select("*")
    .eq("workspace", args.workspaceId)
    .filter("events", "cs", '[{"category":"outbound_sms", "type":"UPDATE"}]');
  if (webhookError) return;
  if (!webhook || webhook.length === 0) return;

  const webhookData = webhook[0] as {
    destination_url?: string;
    custom_headers?: Record<string, unknown> | null;
  };
  if (!webhookData?.destination_url) return;

  const response = await fetchImpl(webhookData.destination_url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...coerceWebhookHeaders(webhookData.custom_headers),
    },
    body: JSON.stringify(
      buildOutboundSmsWebhookBody({
        workspaceId: args.workspaceId,
        message: args.message,
      }),
    ),
  });

  if (!response.ok) {
    throw new Error(`Webhook request failed with status ${response.status}`);
  }
}

