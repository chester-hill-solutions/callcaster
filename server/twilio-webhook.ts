import { requireTwilioSignature } from "../app/lib/twilio-webhook.server.ts";
import { isTwilioWebhookPath } from "./twilio-webhook-paths.ts";

const MAX_RAW_BODY_BYTES = 1 * 1024 * 1024;

const HANGUP_TWIML =
  '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>';

function resolveTwilioWebhookOptions(
  request: Request,
  bodyText: string,
): Parameters<typeof requireTwilioSignature>[1] {
  const pathname = new URL(request.url).pathname;
  const params =
    request.method === "GET" || request.method === "HEAD"
      ? new URL(request.url).searchParams
      : new URLSearchParams(bodyText);

  if (
    pathname.startsWith("/api/caller-id/status") ||
    pathname.startsWith("/api/inbound")
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

async function readRawBody(request: Request): Promise<Uint8Array> {
  if (request.method === "GET" || request.method === "HEAD") {
    return new Uint8Array(0);
  }

  const reader = request.body?.getReader();
  if (!reader) {
    return new Uint8Array(0);
  }

  const chunks: Uint8Array[] = [];
  let size = 0;

  while (true) {
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

function requestWithBody(request: Request, body: Uint8Array): Request {
  return new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: body.byteLength > 0 ? body : undefined,
    duplex: "half",
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
    const options = resolveTwilioWebhookOptions(validatedRequest, bodyText);
    const forbidden = await requireTwilioSignature(validatedRequest, options);

    if (forbidden) {
      return { kind: "response", response: forbidden };
    }

    return { kind: "validated", request: validatedRequest };
  } catch {
    return { kind: "response", response: twilioWebhookErrorResponse() };
  }
}
