import { requireTwilioSignature } from "../app/lib/twilio-webhook.server.ts";
import { logger } from "../app/lib/logger.server.ts";
import { isTwilioWebhookPath } from "./twilio-webhook-paths.ts";

const MAX_RAW_BODY_BYTES = 1 * 1024 * 1024;

const HANGUP_TWIML =
  '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>';

/**
 * Parse the raw body into the same param set Twilio signature validation
 * needs. Twilio webhooks are always `application/x-www-form-urlencoded`, so
 * `URLSearchParams` over the raw body text is equivalent to (and cheaper
 * than) `Request#formData()` here — see `requireTwilioSignature`'s `params`
 * option, which is threaded through so it doesn't re-parse the same body.
 */
function buildTwilioWebhookParams(
  request: Request,
  bodyText: string,
): URLSearchParams {
  return request.method === "GET" || request.method === "HEAD"
    ? new URL(request.url).searchParams
    : new URLSearchParams(bodyText);
}

function resolveTwilioWebhookOptions(
  request: Request,
  params: URLSearchParams,
): Parameters<typeof requireTwilioSignature>[1] {
  const pathname = new URL(request.url).pathname;

  if (
    pathname === "/api/caller-id/status" ||
    pathname === "/api/inbound" ||
    pathname === "/api/inbound-handset" ||
    pathname === "/api/inbound-handset-dial-end" ||
    pathname === "/api/inbound-sms"
  ) {
    const phone = params.get("Called") || params.get("To") || "";
    if (phone) return { phoneNumber: phone };
  }

  if (pathname.startsWith("/api/sms/status")) {
    const sid = params.get("SmsSid") || params.get("MessageSid") || "";
    if (sid) return { messageSid: sid };
  }

  const callSid = params.get("CallSid") || "";
  if (callSid) return { callSid };

  return {};
}

// Returns a freshly allocated buffer, so the view is over a real ArrayBuffer —
// stated explicitly because `BodyInit` will not accept `ArrayBufferLike`.
async function readRawBody(request: Request): Promise<Uint8Array<ArrayBuffer>> {
  if (request.method === "GET" || request.method === "HEAD") {
    return new Uint8Array(0);
  }

  const reader = request.body?.getReader();
  if (!reader) {
    return new Uint8Array(0);
  }

  const chunks: Uint8Array[] = [];
  let size = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    size += value.byteLength;
    if (size > MAX_RAW_BODY_BYTES) {
      throw new Error("Request body too large");
    }
    chunks.push(value);
  }

  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return body;
}

function requestWithBody(request: Request, body: Uint8Array<ArrayBuffer>): Request {
  return new Request(request.url, {
    method: request.method,
    headers: request.headers,
    // No `duplex` — that is only required for a ReadableStream body, and this
    // always passes a fully-buffered Uint8Array.
    body: body.byteLength > 0 ? body : undefined,
  });
}

function twilioWebhookErrorResponse(): Response {
  return new Response(HANGUP_TWIML, {
    status: 403,
    headers: { "Content-Type": "text/xml" },
  });
}

/**
 * Validates Twilio webhook signatures and returns a fresh Request for the RR handler.
 * Returns a Response when validation fails or the path is not a Twilio webhook.
 */
export async function handleTwilioWebhookRequest(
  request: Request,
): Promise<
  | { kind: "continue" }
  | { kind: "validated"; request: Request }
  | { kind: "response"; response: Response }
> {
  const pathname = new URL(request.url).pathname;

  if (!isTwilioWebhookPath(pathname) || pathname.startsWith("/api/docs")) {
    return { kind: "continue" };
  }

  if (
    request.method !== "GET" &&
    request.method !== "POST" &&
    request.method !== "HEAD"
  ) {
    return { kind: "continue" };
  }

  try {
    const body = await readRawBody(request);
    const bodyText = new TextDecoder().decode(body);
    const validatedRequest = requestWithBody(request, body);
    const params = buildTwilioWebhookParams(validatedRequest, bodyText);
    const options = resolveTwilioWebhookOptions(validatedRequest, params);
    const forbidden = await requireTwilioSignature(validatedRequest, {
      ...options,
      // Already parsed above from the same raw body bytes — pass it through
      // so requireTwilioSignature doesn't parse the body a second time via
      // request.clone().formData(). The signature-verification inputs
      // (param set + URL) are unchanged; only how the params were parsed.
      params: Object.fromEntries(params.entries()),
    });

    if (forbidden) {
      return { kind: "response", response: forbidden };
    }

    return { kind: "validated", request: validatedRequest };
  } catch (error) {
    logger.error("twilio.webhook.prehandler_error", {
      error: error instanceof Error ? error.message : String(error),
      path: new URL(request.url).pathname,
    });
    return { kind: "response", response: twilioWebhookErrorResponse() };
  }
}
