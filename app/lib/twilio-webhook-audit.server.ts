import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { env } from "@/lib/env.server";
import {
  getWorkspaceMessagingOnboardingFromTwilioData,
} from "@/lib/messaging-onboarding.server";
import { createWorkspaceTwilioClient } from "@/lib/twilio-client.server";
import type { TwilioAccountData } from "@/lib/types";

export type TwilioWebhookDriftSeverity = "error" | "warning" | "info";

export type TwilioWebhookDriftEntry = {
  resourceType: "phone_number" | "messaging_service" | "ivr_call_pattern";
  resourceSid: string;
  field: string;
  expected: string;
  live: string | null;
  severity: TwilioWebhookDriftSeverity;
  message: string;
};

export type TwilioWebhookAuditResult = {
  workspaceId: string;
  driftMessages: string[];
  entries: TwilioWebhookDriftEntry[];
  ivrRuntimeHint: "remix" | "edge" | "mixed" | "unknown";
  smsStatusCanonical: "edge" | "remix_legacy" | "unknown";
};

function normalizeUrl(url: string | null | undefined): string | null {
  if (!url || !url.trim()) return null;
  return url.trim().replace(/\/$/, "");
}

function compareField(
  entries: TwilioWebhookDriftEntry[],
  driftMessages: string[],
  args: Omit<TwilioWebhookDriftEntry, "message">,
) {
  const expectedNorm = normalizeUrl(args.expected);
  const liveNorm = normalizeUrl(args.live);
  if (expectedNorm === liveNorm) return;

  const message = `${args.resourceType} ${args.resourceSid}: ${args.field} expected ${args.expected}, live ${args.live ?? "(unset)"}`;
  entries.push({ ...args, message });
  driftMessages.push(message);
}

export async function auditWorkspaceTwilioWebhooks({
  supabaseClient,
  workspaceId,
}: {
  supabaseClient: SupabaseClient<Database>;
  workspaceId: string;
}): Promise<TwilioWebhookAuditResult> {
  const baseUrl = env.BASE_URL().replace(/\/$/, "");
  const edgeSmsStatus = `${env.SUPABASE_URL().replace(/\/$/, "")}/functions/v1/sms-status`;

  const { data: workspace, error } = await supabaseClient
    .from("workspace")
    .select("twilio_data")
    .eq("id", workspaceId)
    .single();

  if (error) throw error;

  const twilioData = (workspace?.twilio_data ?? null) as TwilioAccountData;
  const onboarding = getWorkspaceMessagingOnboardingFromTwilioData(twilioData);
  const expected = {
    inboundVoice: `${baseUrl}/api/inbound`,
    inboundSms: `${baseUrl}/api/inbound-sms`,
    callerIdStatus: `${baseUrl}/api/caller-id/status`,
    ivrRemixStatus: `${baseUrl}/api/ivr/status`,
    ivrEdgeFlow: `${env.SUPABASE_URL().replace(/\/$/, "")}/functions/v1/ivr-flow`,
    ivrEdgeStatus: `${env.SUPABASE_URL().replace(/\/$/, "")}/functions/v1/ivr-status`,
  };

  const entries: TwilioWebhookDriftEntry[] = [];
  const driftMessages: string[] = [];

  const twilio = await createWorkspaceTwilioClient({
    supabase: supabaseClient,
    workspaceId,
  });

  const numbers = await twilio.incomingPhoneNumbers.list({ limit: 200 });
  for (const number of numbers) {
    if (!number.sid) continue;
    compareField(entries, driftMessages, {
      resourceType: "phone_number",
      resourceSid: number.sid,
      field: "voiceUrl",
      expected: expected.inboundVoice,
      live: number.voiceUrl ?? null,
      severity: "error",
    });
    compareField(entries, driftMessages, {
      resourceType: "phone_number",
      resourceSid: number.sid,
      field: "smsUrl",
      expected: expected.inboundSms,
      live: number.smsUrl ?? null,
      severity: "error",
    });
    compareField(entries, driftMessages, {
      resourceType: "phone_number",
      resourceSid: number.sid,
      field: "statusCallback",
      expected: expected.callerIdStatus,
      live: number.statusCallback ?? null,
      severity: "warning",
    });
  }

  const serviceSid = onboarding.messagingService.serviceSid;
  if (serviceSid) {
    const service = await twilio.messaging.v1.services(serviceSid).fetch();
    compareField(entries, driftMessages, {
      resourceType: "messaging_service",
      resourceSid: serviceSid,
      field: "statusCallback",
      expected: expected.callerIdStatus,
      live: service.statusCallback ?? null,
      severity: "warning",
    });
  }

  let remixIvrSignals = 0;
  let edgeIvrSignals = 0;

  for (const number of numbers) {
    const voice = normalizeUrl(number.voiceUrl) ?? "";
    if (voice.includes("/api/ivr")) remixIvrSignals++;
    if (voice.includes("ivr-flow")) edgeIvrSignals++;
  }

  let ivrRuntimeHint: TwilioWebhookAuditResult["ivrRuntimeHint"] = "unknown";
  if (remixIvrSignals > 0 && edgeIvrSignals > 0) ivrRuntimeHint = "mixed";
  else if (remixIvrSignals > 0) ivrRuntimeHint = "remix";
  else if (edgeIvrSignals > 0) ivrRuntimeHint = "edge";

  return {
    workspaceId,
    driftMessages,
    entries,
    ivrRuntimeHint,
    smsStatusCanonical: "edge",
  };
}

export function formatTwilioWebhookAuditSummary(
  audit: TwilioWebhookAuditResult,
): string {
  if (audit.driftMessages.length === 0) {
    return `No webhook drift detected. IVR hint: ${audit.ivrRuntimeHint}. SMS status canonical: ${audit.smsStatusCanonical}.`;
  }
  return audit.driftMessages.join("\n");
}
