import type Twilio from "twilio";
import { isObject } from "@/lib/type-safety-utils";

export function isTwilioCallHistoryReady(endedAt: Date | null) {
  return endedAt != null && Number.isFinite(endedAt.getTime()) &&
    endedAt.getTime() + 15 * 60_000 + 30_000 <= Date.now();
}

export async function hasTwilioCallRequestHistory(args: {
  twilio: Twilio.Twilio;
  callSid: string;
  accountSid: string;
  voiceUrl: string;
  statusCallback?: string;
}) {
  const events = await args.twilio.calls(args.callSid).events.list({ limit: 1000 });
  return events.some((event) => {
    const request = isObject(event.request) ? event.request : null;
    const parameters = isObject(request?.parameters) ? request.parameters : null;
    if (request?.method !== "POST" || !parameters) return false;
    if (request.url === args.voiceUrl && parameters.call_sid === args.callSid) return true;
    // A call that never answers has no TwiML fetch. Its original API request
    // can still prove both URLs, through this call's provider-owned history.
    const callsUrl = `https://api.twilio.com/2010-04-01/Accounts/${args.accountSid}/Calls`;
    return Boolean(args.statusCallback) &&
      (request.url === `${callsUrl}.json` || request.url === `${callsUrl}/${args.callSid}.json`) &&
      parameters.url === args.voiceUrl && parameters.status_callback === args.statusCallback;
  });
}
