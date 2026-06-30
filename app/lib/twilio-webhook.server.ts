/**
 * Twilio webhook validation helpers.
 *
 * Auth policy asymmetry (callSid vs messageSid):
 * - validateTwilioWebhookForCallSid: when no `call` row exists yet, validation falls
 *   back to resolveTwilioWebhookAuthToken(null), which uses the main-account
 *   TWILIO_AUTH_TOKEN in non-production. This supports early lifecycle callbacks
 *   (e.g. first status before upsert) during local/dev testing.
 * - validateTwilioWebhookForMessageSid: when no `message` row exists, validation
 *   fails closed (403). Inbound SMS must attribute workspace before persisting the
 *   message, so there is no dev fallback for unknown MessageSid.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
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

/** Reject before DB when signature header is required but absent. */
export function rejectMissingTwilioSignatureHeader(request: Request): Response | null {
  if (!shouldValidateTwilioWebhooks()) {
    return null;
  }
  if (!request.headers.get("x-twilio-signature")) {
    return twilioWebhookForbidden("Missing Twilio signature");
  }
  return null;
}

export async function resolveWorkspaceTwilioData(
  supabase: SupabaseClient<Database>,
  workspaceId: string | null,
  joinedTwilioData: unknown,
  logger?: { info: (message: string, ...args: unknown[]) => void },
): Promise<unknown> {
  if (!workspaceId) {
    return joinedTwilioData;
  }

  const joinedRecord =
    joinedTwilioData && typeof joinedTwilioData === "object" && !Array.isArray(joinedTwilioData)
      ? (joinedTwilioData as Record<string, unknown>)
      : null;
  const joinedHasToken =
    typeof joinedRecord?.authToken === "string" ||
    typeof joinedRecord?.auth_token === "string";

  if (joinedHasToken) {
    return joinedTwilioData;
  }

  const workspace = await getWorkspaceById(workspaceId);
  const fetched = workspace?.twilio_data ?? null;
  const fetchedRecord =
    fetched && typeof fetched === "object" && !Array.isArray(fetched)
      ? (fetched as Record<string, unknown>)
      : null;
  const fetchedHasToken =
    typeof fetchedRecord?.authToken === "string" ||
    typeof fetchedRecord?.auth_token === "string";

  if (fetchedHasToken) {
    logger?.info("Fetched workspace twilio_data (join did not include it)", {
      workspaceId,
    });
    return fetched;
  }

  return joinedTwilioData;
}

export function validateWorkspaceTwilioWebhook(args: {
  request: Request;
  params: Record<string, string>;
  twilioData: unknown;
}): TwilioWebhookValidationResult {
  const authToken = resolveWorkspaceWebhookAuthToken(args.twilioData);
  return validateParamsWithToken({
    request: args.request,
    params: args.params,
    authToken,
    missingCredentialsResponse: twilioWebhookMissingCredentials,
  });
}

export function validateTwilioWebhookForPhoneCandidates(args: {
  request: Request;
  params: Record<string, string>;
  candidates: Array<{ twilioData: unknown }>;
}): boolean {
  const signature = args.request.headers.get("x-twilio-signature");
  const url = resolveTwilioWebhookRequestUrl(args.request);

  return args.candidates.some((row) => {
    const authToken = resolveWorkspaceWebhookAuthToken(row.twilioData);
    return (
      authToken != null &&
      validateTwilioWebhookParams(args.params, signature, url, authToken)
    );
  });
}

export async function validateTwilioWebhookForWorkspace(args: {
  request: Request;
  supabase: SupabaseClient<Database>;
  workspaceId: string;
}): Promise<
  | ({ ok: true; params: Record<string, string>; authToken: string } & { workspaceId: string })
  | { ok: false; response: Response }
> {
  const missingHeader = rejectMissingTwilioSignatureHeader(args.request);
  if (missingHeader) {
    return { ok: false, response: missingHeader };
  }

  const url = new URL(args.request.url);
  const params = Object.fromEntries(url.searchParams.entries());

  const twilioData = await loadWorkspaceTwilioData(args.supabase, args.workspaceId);

  const validation = validateWorkspaceTwilioWebhook({
    request: args.request,
    params,
    twilioData,
  });
  if (!validation.ok) {
    return validation;
  }

  return { ...validation, workspaceId: args.workspaceId };
}

export async function validateTwilioWebhookForCallSid(args: {
  request: Request;
  supabase: SupabaseClient<Database>;
  callSid: string;
  params?: Record<string, string>;
}): Promise<TwilioWebhookValidationResult> {
  const missingHeader = rejectMissingTwilioSignatureHeader(args.request);
  if (missingHeader) {
    return { ok: false, response: missingHeader };
  }

  const params =
    args.params ??
    (Object.fromEntries((await args.request.formData()).entries()) as Record<string, string>);

  const existingCall = await findCallBySid(args.callSid);

  if (!existingCall?.workspace) {
    const authToken = resolveWorkspaceWebhookAuthToken(null);
    return validateParamsWithToken({
      request: args.request,
      params,
      authToken,
    });
  }

  const twilioData = await loadWorkspaceTwilioData(
    args.supabase,
    existingCall.workspace,
  );

  return validateParamsWithToken({
    request: args.request,
    params,
    authToken: resolveWorkspaceWebhookAuthToken(twilioData),
  });
}

export async function validateTwilioWebhookForMessageSid(args: {
  request: Request;
  supabase: SupabaseClient<Database>;
  smsSid: string;
  params?: Record<string, string>;
}): Promise<TwilioWebhookValidationResult> {
  const missingHeader = rejectMissingTwilioSignatureHeader(args.request);
  if (missingHeader) {
    return { ok: false, response: missingHeader };
  }

  const params =
    args.params ??
    (Object.fromEntries((await args.request.formData()).entries()) as Record<string, string>);

  const messageRow = await findMessageBySid(args.smsSid);

  if (!messageRow?.workspace) {
    return { ok: false, response: twilioWebhookForbidden() };
  }

  const twilioData = await loadWorkspaceTwilioData(
    args.supabase,
    messageRow.workspace,
  );

  return validateParamsWithToken({
    request: args.request,
    params,
    authToken: resolveWorkspaceWebhookAuthToken(twilioData),
  });
}

export type TwilioWebhookPhoneValidationResult =
  | {
      ok: true;
      params: Record<string, string>;
      authToken: string;
      workspaceId: string;
      twilioData: unknown;
      numberRow: TwilioWebhookNumberRow;
    }
  | { ok: false; response: Response };

export async function validateTwilioWebhookForPhoneNumber(args: {
  request: Request;
  supabase: SupabaseClient<Database>;
  phoneNumber: string;
  params: Record<string, string>;
  logger?: { info: (message: string, ...args: unknown[]) => void };
}): Promise<TwilioWebhookPhoneValidationResult> {
  const missingHeader = rejectMissingTwilioSignatureHeader(args.request);
  if (missingHeader) {
    return { ok: false, response: missingHeader };
  }

  const phoneNumber = args.phoneNumber.trim();
  if (!phoneNumber) {
    return { ok: false, response: twilioWebhookForbidden("Missing phone number") };
  }

  const resolved = await resolveTwilioDataForPhoneNumber(
    args.supabase,
    phoneNumber,
    args.logger,
  );
  if (!resolved) {
    return { ok: false, response: twilioWebhookForbidden() };
  }

  const validation = validateWorkspaceTwilioWebhook({
    request: args.request,
    params: args.params,
    twilioData: resolved.twilioData,
  });
  if (!validation.ok) {
    return validation;
  }

  return {
    ok: true,
    params: validation.params,
    authToken: validation.authToken,
    workspaceId: resolved.workspaceId,
    twilioData: resolved.twilioData,
    numberRow: resolved.numberRow,
  };
}

export async function resolveTwilioDataForPhoneNumber(
  supabase: SupabaseClient<Database>,
  phoneNumber: string,
  logger?: { info: (message: string, ...args: unknown[]) => void },
): Promise<{ workspaceId: string; twilioData: unknown; numberRow: TwilioWebhookNumberRow } | null> {
  const numberRow = await findWorkspaceNumberByPhoneNumber(phoneNumber);
  if (!numberRow) {
    return null;
  }

  const workspaceId = numberRow.workspaceId;
  const workspace = await getWorkspaceById(workspaceId);
  const joinedTwilioData = workspace?.twilio_data ?? null;

  const twilioData = await resolveWorkspaceTwilioData(
    supabase,
    workspaceId,
    joinedTwilioData,
    logger,
  );

  return {
    workspaceId,
    twilioData,
    numberRow: {
      workspace: workspaceId,
      handset_enabled: Boolean(numberRow.handset_enabled),
    },
  };
}
