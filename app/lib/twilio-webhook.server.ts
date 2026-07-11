/**
 * Twilio webhook validation helpers.
 *
 * Webhooks are validated against the workspace subaccount auth token. There is no
 * main-account fallback in any environment; credentials must be resolved from the
 * workspace's `twilio_data`.
 */

import type { Database } from "@/lib/db-types";
import { env } from "@/lib/env.server";
import { hangupTwiml } from "@/lib/twilio-twiml.server";
import { findMessageBySid } from "@/lib/message-db.server";
import { findCallBySid } from "@/lib/telephony-db.server";
import { findWorkspaceNumberByPhoneNumber } from "@/lib/inbound-call-db.server";
import { getWorkspaceById } from "@/lib/workspace-members-db.server";
import {
  readTwilioWorkspaceCredentials,
  resolveTwilioWebhookAuthToken,
} from "@/lib/twilio-workspace-credentials";
import {
  shouldValidateTwilioWebhooks,
  validateTwilioWebhookParams,
} from "@/twilio.server";
import { loadWorkspaceTwilioData } from "@/lib/merge-workspace-twilio-data.server";

export type TwilioWebhookValidationResult =
  | { ok: true; params: Record<string, string>; authToken: string }
  | { ok: false; response: Response };

export type TwilioWebhookNumberRow = Pick<
  Database["public"]["Tables"]["workspace_number"]["Row"],
  "workspace" | "handset_enabled"
>;

export function resolveTwilioWebhookRequestUrl(request: Request): string {
  return new URL(request.url).href;
}

export function resolveWorkspaceWebhookAuthToken(twilioData: unknown): string | null {
  return resolveTwilioWebhookAuthToken(readTwilioWorkspaceCredentials(twilioData));
}

function validateParamsWithToken(args: {
  request: Request;
  params: Record<string, string>;
  authToken: string | null;
  missingCredentialsResponse?: () => Response;
}): TwilioWebhookValidationResult {
  if (!args.authToken) {
    return {
      ok: false,
      response: (args.missingCredentialsResponse ?? twilioWebhookForbidden)(),
    };
  }

  const signature = args.request.headers.get("x-twilio-signature");
  const url = resolveTwilioWebhookRequestUrl(args.request);
  if (!validateTwilioWebhookParams(args.params, signature, url, args.authToken)) {
    return { ok: false, response: twilioWebhookForbidden() };
  }

  return { ok: true, params: args.params, authToken: args.authToken };
}

function twilioWebhookJsonResponse(
  error: string,
  status: number,
): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function twilioWebhookForbidden(message = "Invalid Twilio signature"): Response {
  return twilioWebhookJsonResponse(message, 403);
}

export function twilioWebhookBadRequest(message: string): Response {
  return twilioWebhookJsonResponse(message, 400);
}

export function twilioWebhookNotFound(message = "Not Found"): Response {
  return twilioWebhookJsonResponse(message, 404);
}

export function twilioWebhookInternalError(
  message = "Internal Server Error",
): Response {
  return twilioWebhookJsonResponse(message, 500);
}

export function twilioWebhookMissingCredentials(
  message = "Workspace Twilio credentials missing",
): Response {
  return twilioWebhookJsonResponse(message, 500);
}

/** 403 short-circuit response for Twilio-facing voice routes: hang up the call. */
export function twilioWebhookForbiddenHangup(): Response {
  return new Response(hangupTwiml(), {
    status: 403,
    headers: { "Content-Type": "text/xml" },
  });
}

/** Build the canonical validation URL from BASE_URL + request pathname. */
export function resolveCanonicalTwilioWebhookUrl(request: Request): string {
  const url = new URL(request.url);
  const baseUrl = env.BASE_URL().replace(/\/$/, "");
  return `${baseUrl}${url.pathname}`;
}

async function parseTwilioWebhookParams(request: Request): Promise<Record<string, string>> {
  if (request.method === "GET" || request.method === "HEAD") {
    const url = new URL(request.url);
    return Object.fromEntries(url.searchParams.entries());
  }

  const formData = await request.clone().formData();
  return Object.fromEntries(formData.entries()) as Record<string, string>;
}

/**
 * Route-level Twilio webhook signature check.
 *
 * Returns a 403 hangup TwiML Response on failure, or `null` on success.
 *
 * - If a workspace option is provided (`workspaceId`, `callSid`, `messageSid`, or
 *   `phoneNumber`), the request is validated against that workspace's subaccount auth
 *   token. If the workspace or its credentials cannot be resolved, validation fails.
 * - If no workspace option is provided, the request is treated as a global
 *   main-account webhook and validated against the main account token.
 *
 * There is no fallback to the main account token when a workspace is resolved but its
 * credentials are missing.
 */
export async function requireTwilioSignature(
  request: Request,
  options?: {
    callSid?: string;
    messageSid?: string;
    phoneNumber?: string;
    workspaceId?: string;
    /**
     * Pre-parsed webhook params, when the caller already read and parsed
     * the raw body (e.g. server/twilio-webhook.ts, which parses it once for
     * routing before validation). When omitted, the body is parsed here via
     * `parseTwilioWebhookParams` as before. Either way, this is exactly the
     * param set that gets signature-verified.
     */
    params?: Record<string, string>;
  },
): Promise<Response | null> {
  if (!shouldValidateTwilioWebhooks()) {
    return null;
  }

  if (!request.headers.get("x-twilio-signature")) {
    return twilioWebhookForbiddenHangup();
  }

  const params = options?.params ?? (await parseTwilioWebhookParams(request));
  const canonicalUrl = resolveCanonicalTwilioWebhookUrl(request);

  let attemptedWorkspace = false;
  let twilioData: unknown = null;

  if (options?.workspaceId) {
    attemptedWorkspace = true;
    twilioData = await loadWorkspaceTwilioData(options.workspaceId);
  } else if (options?.callSid) {
    attemptedWorkspace = true;
    const existingCall = await findCallBySid(options.callSid);
    if (existingCall?.workspace) {
      twilioData = await loadWorkspaceTwilioData(existingCall.workspace);
    }
  } else if (options?.messageSid) {
    attemptedWorkspace = true;
    const messageRow = await findMessageBySid(options.messageSid);
    if (messageRow?.workspace) {
      twilioData = await loadWorkspaceTwilioData(messageRow.workspace);
    }
  } else if (options?.phoneNumber) {
    attemptedWorkspace = true;
    const resolved = await resolveTwilioDataForPhoneNumber(options.phoneNumber);
    if (resolved) {
      twilioData = resolved.twilioData;
    }
  }

  const authToken = attemptedWorkspace
    ? resolveWorkspaceWebhookAuthToken(twilioData)
    : env.TWILIO_AUTH_TOKEN();

  if (!authToken) {
    return twilioWebhookForbiddenHangup();
  }

  const signature = request.headers.get("x-twilio-signature");
  if (!validateTwilioWebhookParams(params, signature, canonicalUrl, authToken)) {
    return twilioWebhookForbiddenHangup();
  }

  return null;
}

export async function resolveTwilioDataForPhoneNumber(
    phoneNumber: string,
): Promise<{ workspaceId: string; twilioData: unknown; numberRow: TwilioWebhookNumberRow } | null> {
  const numberRow = await findWorkspaceNumberByPhoneNumber(phoneNumber);
  if (!numberRow) {
    return null;
  }

  const workspaceId = numberRow.workspaceId;
  const workspace = await getWorkspaceById(workspaceId);
  const twilioData = workspace?.twilio_data ?? null;

  return {
    workspaceId,
    twilioData,
    numberRow: {
      workspace: workspaceId,
      handset_enabled: Boolean(numberRow.handset_enabled),
    },
  };
}
