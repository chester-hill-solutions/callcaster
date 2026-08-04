/**
 * Shared auth guards for the IVR Twilio webhook routes (outbound `/api/ivr/*`
 * and inbound `/api/inbound-ivr/*`), used as the `auth` strategy of their
 * `defineAction` handlers.
 *
 * Each guard preserves the exact pre-factory check order of its route pair:
 * missing-parameter 400s, then the Twilio signature check via
 * `requireTwilioSignature`. On success it returns the parsed webhook values the
 * handler needs (`callSid`, and `userInput` for response routes) so the body
 * is only parsed once.
 */
import { requireTwilioSignature } from "@/lib/twilio-webhook.server";

async function readWebhookFormParams(request: Request): Promise<Record<string, string>> {
  const formData = await request.clone().formData();
  return Object.fromEntries(formData.entries()) as Record<string, string>;
}

/** Page routes: parse the body first, then one combined missing-params 400. */
export async function requireTwilioSignatureForIvrPage(
  request: Request,
  routeIds: Array<string | undefined>,
): Promise<Response | { callSid: string }> {
  const paramsObj = await readWebhookFormParams(request);
  const callSid = paramsObj.CallSid ?? null;

  if (!callSid || routeIds.some((id) => !id)) {
    return new Response("Missing required parameters", { status: 400 });
  }

  const forbidden = await requireTwilioSignature(request, { callSid });
  return forbidden ?? { callSid };
}

/** Block routes: missing route params 400 first, then missing CallSid 400. */
export async function requireTwilioSignatureForIvrBlock(
  request: Request,
  routeIds: Array<string | undefined>,
): Promise<Response | { callSid: string }> {
  if (routeIds.some((id) => !id)) {
    return new Response("Missing required parameters", { status: 400 });
  }

  const formParams = await readWebhookFormParams(request);
  const callSid = formParams.CallSid ?? null;

  if (!callSid) {
    return new Response("Missing CallSid parameter", { status: 400 });
  }

  const forbidden = await requireTwilioSignature(request, { callSid });
  return forbidden ?? { callSid };
}

/** Response routes: block-route checks plus the Digits/SpeechResult input. */
export async function requireTwilioSignatureForIvrResponse(
  request: Request,
  routeIds: Array<string | undefined>,
): Promise<Response | { callSid: string; userInput: string | null }> {
  if (routeIds.some((id) => !id)) {
    return new Response("Missing required parameters", { status: 400 });
  }

  const formParams = await readWebhookFormParams(request);
  const digitsValue = formParams.Digits;
  const speechResultValue = formParams.SpeechResult;
  const callSidValue = formParams.CallSid;

  const userInput =
    typeof digitsValue === "string"
      ? digitsValue
      : typeof speechResultValue === "string"
        ? speechResultValue
        : null;
  const callSid = typeof callSidValue === "string" ? callSidValue : null;

  if (!callSid) {
    return new Response("Missing CallSid parameter", { status: 400 });
  }

  const forbidden = await requireTwilioSignature(request, { callSid });
  return forbidden ?? { callSid, userInput };
}
