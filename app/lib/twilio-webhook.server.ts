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
import {
  readTwilioWorkspaceCredentials,
  resolveTwilioWebhookAuthToken,
} from "@/lib/twilio-workspace-credentials";
import {
  shouldValidateTwilioWebhooks,
  validateTwilioWebhookParams,
} from "@/twilio.server";

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

export async function loadWorkspaceTwilioData(
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

  const { data: workspaceRow } = await supabase
    .from("workspace")
    .select("twilio_data")
    .eq("id", workspaceId)
    .single();

  const fetched = workspaceRow?.twilio_data ?? null;
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

  const { data: existingCall } = await args.supabase
    .from("call")
    .select("workspace")
    .eq("sid", args.callSid)
    .single();

  if (!existingCall?.workspace) {
    const authToken = resolveWorkspaceWebhookAuthToken(null);
    return validateParamsWithToken({
      request: args.request,
      params,
      authToken,
    });
  }

  const { data: workspace } = await args.supabase
    .from("workspace")
    .select("twilio_data")
    .eq("id", existingCall.workspace)
    .single();

  return validateParamsWithToken({
    request: args.request,
    params,
    authToken: resolveWorkspaceWebhookAuthToken(workspace?.twilio_data),
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

  const { data: messageRow } = await args.supabase
    .from("message")
    .select("workspace")
    .eq("sid", args.smsSid)
    .single();

  if (!messageRow?.workspace) {
    return { ok: false, response: twilioWebhookForbidden() };
  }

  const { data: workspace } = await args.supabase
    .from("workspace")
    .select("twilio_data")
    .eq("id", messageRow.workspace)
    .single();

  return validateParamsWithToken({
    request: args.request,
    params,
    authToken: resolveWorkspaceWebhookAuthToken(workspace?.twilio_data),
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
  const { data: numberRow, error } = await supabase
    .from("workspace_number")
    .select(
      `
        workspace,
        handset_enabled,
        ...workspace!inner(id, twilio_data)`,
    )
    .eq("phone_number", phoneNumber)
    .maybeSingle();

  if (error || !numberRow) {
    return null;
  }

  const row = numberRow as {
    workspace?: string | { id: string; twilio_data?: unknown };
    handset_enabled?: boolean;
  };
  const workspaceId =
    row.workspace && typeof row.workspace === "object" && "id" in row.workspace
      ? row.workspace.id
      : typeof row.workspace === "string"
        ? row.workspace
        : null;

  const joinedTwilioData =
    row.workspace && typeof row.workspace === "object" && "twilio_data" in row.workspace
      ? row.workspace.twilio_data
      : null;

  const twilioData = await loadWorkspaceTwilioData(
    supabase,
    workspaceId,
    joinedTwilioData,
    logger,
  );

  if (!workspaceId) {
    return null;
  }

  return {
    workspaceId,
    twilioData,
    numberRow: {
      workspace: workspaceId,
      handset_enabled: Boolean(row.handset_enabled),
    },
  };
}
