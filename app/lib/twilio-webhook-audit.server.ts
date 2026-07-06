import type { Database } from "@/lib/db-types";
import { env } from "@/lib/env.server";
import {
  getWorkspaceMessagingOnboardingFromTwilioData,
} from "@/lib/messaging-onboarding.server";
import { createWorkspaceTwilioClient } from "@/lib/twilio-client.server";
import { loadWorkspaceTwilioData } from "@/lib/merge-workspace-twilio-data.server";
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
  smsStatusCanonical: "edge" | "remix" | "remix_legacy" | "unknown";
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
  workspaceId,
}: {
  workspaceId: string;
}): Promise<TwilioWebhookAuditResult> {
  const baseUrl = env.BASE_URL().replace(/\/$/, "");
  const expectedSmsStatus = `${baseUrl}/api/sms/status`;
  const legacyEdgeSmsStatus = `${baseUrl}/functions/v1/sms-status`;

  const twilioData = (await loadWorkspaceTwilioData(
    workspaceId,
  )) as unknown as TwilioAccountData;
  const onboarding = getWorkspaceMessagingOnboardingFromTwilioData(twilioData);
  const expected = {
    inboundVoice: `${baseUrl}/api/inbound`,
    inboundSms: `${baseUrl}/api/inbound-sms`,
    callerIdStatus: `${baseUrl}/api/caller-id/status`,
    ivrRemixStatus: `${baseUrl}/api/ivr/status`,
  };

  const entries: TwilioWebhookDriftEntry[] = [];
  const driftMessages: string[] = [];

  const twilio = await createWorkspaceTwilioClient({
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
      expected: expectedSmsStatus,
      live: service.statusCallback ?? null,
      severity: "error",
    });
  }

  for (const number of numbers) {
    if (!number.sid) continue;
    const liveStatus = normalizeUrl(number.statusCallback);
    if (liveStatus === legacyEdgeSmsStatus) {
      compareField(entries, driftMessages, {
        resourceType: "phone_number",
        resourceSid: number.sid,
        field: "statusCallback (sms)",
        expected: expectedSmsStatus,
        live: number.statusCallback ?? null,
        severity: "error",
      });
    }
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
    smsStatusCanonical: "remix",
  };
}

const LEGACY_EDGE_PATH_MARKERS = [
  "/functions/v1/sms-status",
  "/functions/v1/ivr-flow",
  "/functions/v1/ivr-status",
  "/functions/v1/ivr-recording",
  "/functions/v1/acd-router",
];

function isLegacyEdgeUrl(url: string | null | undefined): boolean {
  const normalized = normalizeUrl(url);
  if (!normalized) return false;
  return LEGACY_EDGE_PATH_MARKERS.some((marker) => normalized.includes(marker));
}

export type TwilioWebhookRepointResult = {
  workspaceId: string;
  updated: number;
  skipped: number;
  errors: string[];
};

/** Rewrite live Twilio webhook URLs from Supabase Edge paths to Remix `/api/*` routes. */
export async function repointWorkspaceTwilioWebhooks({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<TwilioWebhookRepointResult> {
  const baseUrl = env.BASE_URL().replace(/\/$/, "");
  const expected = {
    inboundVoice: `${baseUrl}/api/inbound`,
    inboundSms: `${baseUrl}/api/inbound-sms`,
    callerIdStatus: `${baseUrl}/api/caller-id/status`,
    smsStatus: `${baseUrl}/api/sms/status`,
  };

  const twilioData = (await loadWorkspaceTwilioData(
    workspaceId,
  )) as unknown as TwilioAccountData;
  const onboarding = getWorkspaceMessagingOnboardingFromTwilioData(twilioData);

  const twilio = await createWorkspaceTwilioClient({ workspaceId });
  const result: TwilioWebhookRepointResult = {
    workspaceId,
    updated: 0,
    skipped: 0,
    errors: [],
  };

  const numbers = await twilio.incomingPhoneNumbers.list({ limit: 200 });
  for (const number of numbers) {
    if (!number.sid) continue;

    const updates: Record<string, string> = {};
    if (isLegacyEdgeUrl(number.voiceUrl)) {
      updates.voiceUrl = expected.inboundVoice;
    }
    if (isLegacyEdgeUrl(number.smsUrl)) {
      updates.smsUrl = expected.inboundSms;
    }
    const statusNorm = normalizeUrl(number.statusCallback);
    if (statusNorm?.includes("/functions/v1/sms-status")) {
      updates.statusCallback = expected.smsStatus;
    } else if (statusNorm?.includes("/functions/v1/")) {
      updates.statusCallback = expected.callerIdStatus;
    }

    if (Object.keys(updates).length === 0) {
      result.skipped += 1;
      continue;
    }

    try {
      await twilio.incomingPhoneNumbers(number.sid).update(updates);
      result.updated += 1;
    } catch (error) {
      result.errors.push(
        `${number.sid}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const serviceSid = onboarding.messagingService.serviceSid;
  if (serviceSid) {
    try {
      const service = await twilio.messaging.v1.services(serviceSid).fetch();
      if (isLegacyEdgeUrl(service.statusCallback)) {
        await twilio.messaging.v1.services(serviceSid).update({
          statusCallback: expected.smsStatus,
        });
        result.updated += 1;
      } else {
        result.skipped += 1;
      }
    } catch (error) {
      result.errors.push(
        `messaging_service ${serviceSid}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return result;
}

export async function repointAllWorkspaceTwilioWebhooks(): Promise<{
  ok: true;
  results: TwilioWebhookRepointResult[];
} | {
  ok: false;
  error: string;
}> {
  try {
    const { listAllWorkspacesOrdered } = await import(
      "@/lib/workspace-members-db.server"
    );
    const workspaces = await listAllWorkspacesOrdered();
    const results: TwilioWebhookRepointResult[] = [];
    for (const ws of workspaces) {
      results.push(await repointWorkspaceTwilioWebhooks({ workspaceId: ws.id }));
    }
    return { ok: true, results };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to repoint webhooks",
    };
  }
}

export function formatTwilioWebhookAuditSummary(
  audit: TwilioWebhookAuditResult,
): string {
  if (audit.driftMessages.length === 0) {
    return `No webhook drift detected. IVR hint: ${audit.ivrRuntimeHint}. SMS status canonical: ${audit.smsStatusCanonical}.`;
  }
  return audit.driftMessages.join("\n");
}
