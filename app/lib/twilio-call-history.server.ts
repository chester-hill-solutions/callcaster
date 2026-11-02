import type Twilio from "twilio";
import { isObject } from "@/lib/type-safety-utils";
import type { CallInstance } from "twilio/lib/rest/api/v2010/account/call";
import { isTerminalStatus, normalizeProviderStatus } from "@/lib/call-status";

export function isTwilioCallHistoryReady(call: Pick<CallInstance, "status" | "endTime" | "dateUpdated">) {
  const endedAt = call.endTime ?? (isTerminalStatus(normalizeProviderStatus(call.status)) ? call.dateUpdated : null);
  return endedAt != null && Number.isFinite(endedAt.getTime()) &&
    endedAt.getTime() + 15 * 60_000 + 30_000 <= Date.now();
}

export async function hasTwilioCallRequestHistory(args: {
  twilio: Twilio.Twilio;
  callSid: string;
  voiceUrl?: string | null;
  statusCallback?: string | null;
}) {
  const events = await args.twilio.calls(args.callSid).events.list({ limit: 1000 });
  return events.some((event) => {
    const request = isObject(event.request) ? event.request : null;
    const parameters = isObject(request?.parameters) ? request.parameters : null;
    if (request?.method !== "POST" || !parameters) return false;
    // Call Events contains Twilio's requests to the app, including an
    // unanswered call's status callback. It does not contain our REST POST.
    return parameters.call_sid === args.callSid &&
      ((Boolean(args.voiceUrl) && request.url === args.voiceUrl) ||
        (Boolean(args.statusCallback) && request.url === args.statusCallback));
  });
}
