import { data as routeData } from "react-router";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import {
  readTwilioWorkspaceCredentials,
  resolveTwilioWebhookAuthToken,
} from "@/lib/twilio-workspace-credentials";
import {
  validateTwilioWebhookParams,
} from "@/twilio.server";

function shouldValidateTwilioWebhooks(): boolean {
  const value = process.env.TWILIO_VALIDATE_WEBHOOKS;
  if (value === undefined || value === "") {
    return true;
  }
  return value !== "false" && value !== "0";
}

export type TwilioWebhookValidationResult =
  | { ok: true; params: Record<string, string>; authToken: string }
  | { ok: false; response: Response };

export function resolveTwilioWebhookRequestUrl(request: Request): string {
  return new URL(request.url).href;
}

export function resolveWorkspaceWebhookAuthToken(twilioData: unknown): string | null {
  return resolveTwilioWebhookAuthToken(readTwilioWorkspaceCredentials(twilioData));
}

export function twilioWebhookForbidden(message = "Invalid Twilio signature"): Response {
  return routeData({ error: message }, { status: 403 }) as unknown as Response;
}

export function twilioWebhookMissingCredentials(
  message = "Workspace Twilio credentials missing",
): Response {
  return routeData({ error: message }, { status: 500 }) as unknown as Response;
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
  logger?: { info: (...args: unknown[]) => void },
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
  if (!authToken) {
    return { ok: false, response: twilioWebhookMissingCredentials() };
  }

  const signature = args.request.headers.get("x-twilio-signature");
  const url = resolveTwilioWebhookRequestUrl(args.request);
  if (!validateTwilioWebhookParams(args.params, signature, url, authToken)) {
    return { ok: false, response: twilioWebhookForbidden() };
  }

  return { ok: true, params: args.params, authToken };
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
    const signature = args.request.headers.get("x-twilio-signature");
    const url = resolveTwilioWebhookRequestUrl(args.request);
    if (!authToken || !validateTwilioWebhookParams(params, signature, url, authToken)) {
      return { ok: false, response: twilioWebhookForbidden() };
    }
    return { ok: true, params, authToken };
  }

  const { data: workspace } = await args.supabase
    .from("workspace")
    .select("twilio_data")
    .eq("id", existingCall.workspace)
    .single();

  const authToken = resolveWorkspaceWebhookAuthToken(workspace?.twilio_data);
  const signature = args.request.headers.get("x-twilio-signature");
  const url = resolveTwilioWebhookRequestUrl(args.request);

  if (!authToken || !validateTwilioWebhookParams(params, signature, url, authToken)) {
    return { ok: false, response: twilioWebhookForbidden() };
  }

  return { ok: true, params, authToken };
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

  const authToken = resolveWorkspaceWebhookAuthToken(workspace?.twilio_data);
  const signature = args.request.headers.get("x-twilio-signature");
  const url = resolveTwilioWebhookRequestUrl(args.request);

  if (!authToken || !validateTwilioWebhookParams(params, signature, url, authToken)) {
    return { ok: false, response: twilioWebhookForbidden() };
  }

  return { ok: true, params, authToken };
}

export async function resolveTwilioDataForPhoneNumber(
  supabase: SupabaseClient<Database>,
  phoneNumber: string,
  logger?: { info: (...args: unknown[]) => void },
): Promise<{ workspaceId: string; twilioData: unknown } | null> {
  const { data: numberRow, error } = await supabase
    .from("workspace_number")
    .select(
      `
        workspace,
        ...workspace!inner(id, twilio_data)`,
    )
    .eq("phone_number", phoneNumber)
    .maybeSingle();

  if (error || !numberRow) {
    return null;
  }

  const row = numberRow as {
    workspace?: string | { id: string; twilio_data?: unknown };
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

  return { workspaceId, twilioData };
}
