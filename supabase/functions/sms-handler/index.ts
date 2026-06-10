// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@^2.39.6";
import Twilio from "npm:twilio@^5.3.0";
import { getFunctionsBaseUrl } from "../_shared/getFunctionsBaseUrl.ts";
import { readTwilioWorkspaceCredentials } from "../_shared/twilio-workspace-credentials.ts";
import { resolveTwilioSmsMessagingServiceSid } from "../_shared/sms-send-resolve.ts";
import {
  completeQueueContact,
  dequeueDuplicateQueueContact,
  failQueueContact,
  requeueContact,
} from "../_shared/campaign-dispatch.ts";
import { jsonHandlerResponse } from "../_shared/handler-response.ts";
import {
  normalizePortalOpsConfig,
  type WorkspaceTwilioOpsConfig,
} from "../_shared/portal-config.ts";
import {
  isRetryableSmsTwilioError,
  withTwilioRetry,
} from "../_shared/twilio-retry.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Twilio Link Shortening is preferred when sending via Messaging Service. */
function bodyHasUrls(text: string): boolean {
  return /https?:\/\/[^\s]+/.test(text);
}

function resolveContactField(field: string, contact: ContactData): string {
  switch (field) {
    case "firstname":
      return contact.firstname || "";
    case "surname":
      return contact.surname || "";
    case "fullname":
      return contact.fullname || `${contact.firstname || ""} ${contact.surname || ""}`.trim();
    case "phone":
      return contact.phone || "";
    case "email":
      return contact.email || "";
    case "address":
      return contact.address || "";
    case "city":
      return contact.city || "";
    case "province":
      return contact.province || "";
    case "postal":
      return contact.postal || "";
    case "country":
      return contact.country || "";
    case "external_id":
      return contact.external_id || "";
    case "contact_id":
      return contact.id?.toString() || "";
    default:
      return "";
  }
}

interface ContactData {
  id?: number;
  firstname?: string | null;
  surname?: string | null;
  fullname?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  province?: string | null;
  postal?: string | null;
  country?: string | null;
  external_id?: string | null;
  [key: string]: unknown;
}

function processTemplateTags(text: string, contact: ContactData): string {
  if (!text || !contact) return text;

  const processBraces = (input: string): string => {
    let result = input.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\|\s*"([^"]+)"\s*\}\}/g, (_match, field, fallback) => {
      const value = resolveContactField(field, contact);
      if (!value && typeof fallback === "string") {
        return fallback.trim();
      }
      return value || "";
    });

    result = result.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, field) =>
      resolveContactField(field, contact),
    );

    return result;
  };

  const processFunctions = (input: string): string => {
    let result = input.replace(/btoa\(([^)]*)\)/g, (_match, inner) => {
      const processed = processBraces(inner);
      try {
        return btoa(processed);
      } catch {
        return "";
      }
    });

    result = result.replace(/survey\(([^)]*)\)/g, (_match, inner) => {
      const processed = processBraces(inner);
      const parts = processed.split(",").map((part) => part.trim());
      if (parts.length >= 2) {
        const contactId = parts[0];
        const surveyId = parts[1].replace(/"/g, "");
        if (contactId && surveyId) {
          const encoded = btoa(`${contactId}:${surveyId}`);
          const surveyBaseUrl = "https://callcaster.com";
          return `${surveyBaseUrl}/?q=${encoded}`;
        }
      }
      return "";
    });

    return result;
  };

  let result = processFunctions(text);
  result = processBraces(result);
  return result;
}

const baseUrl = `${getFunctionsBaseUrl()}/`;
interface SendMessageParams {
  body: string;
  to: string;
  from: string;
  media: string[];
  supabase: SupabaseClient;
  campaign_id: string;
  workspace: string;
  contact_id: string | number;
  queue_id: number | string;
  user_id: string;
  messageIntent?: string | null;
  requestMessagingServiceSid?: string | null;
  campaignSmsSendMode?: string | null;
  campaignSmsMessagingServiceSid?: string | null;
}
const DUPLICATE_SMS_DEQUEUED_REASON = "Duplicate SMS prevented";

const normalizePhoneNumber = (input: string): string => {
  if (!input || typeof input !== "string") {
    throw new Error("Phone number input must be a non-empty string");
  }

  // Keep this behavior aligned with app/lib/utils/phone.ts.
  let cleaned = input.replace(/[^0-9+]/g, "");

  if (cleaned.indexOf("+") > 0) {
    cleaned = cleaned.replace(/\+/g, "");
  }

  if (!cleaned.startsWith("+")) {
    cleaned = `+${cleaned}`;
  }

  if (cleaned.length < 12) {
    cleaned = `+1${cleaned.replace("+", "")}`;
  }

  if (cleaned.length !== 12) { // +1 plus 10 digits
    throw new Error("Invalid phone number length");
  }

  return cleaned;
};

const createWorkspaceTwilioInstance = async ({
  supabase,
  workspace_id
}: {
  supabase: SupabaseClient;
  workspace_id: string;
}) => {
  const { data: workspace, error } = await supabase
    .from("workspace")
    .select("twilio_data, credits")
    .eq("id", workspace_id)
    .single();

  if (error || !workspace?.twilio_data) {
    throw new Error("Failed to get workspace Twilio credentials");
  }

  const creds = readTwilioWorkspaceCredentials(workspace.twilio_data);
  if (!creds) {
    throw new Error("Failed to get workspace Twilio credentials");
  }

  return {
    twilio: new Twilio(creds.sid, creds.authToken),
    credits: workspace.credits,
    portalConfig: normalizePortalOpsConfig(
      isRecord(workspace.twilio_data) ? workspace.twilio_data.portalConfig : null,
    ),
  };
};

async function hasDuplicateCampaignSms(args: {
  supabase: SupabaseClient;
  campaignId: string;
  to: string;
}): Promise<boolean> {
  const { count, error } = await args.supabase
    .from("message")
    .select("sid", { head: true, count: "exact" })
    .eq("campaign_id", Number(args.campaignId))
    .eq("to", args.to);
  if (error) throw error;
  return (count ?? 0) > 0;
}

const sendMessage = async ({
  body,
  to,
  from,
  media,
  supabase,
  campaign_id,
  workspace,
  contact_id,
  queue_id,
  user_id,
  messageIntent,
  requestMessagingServiceSid,
  campaignSmsSendMode,
  campaignSmsMessagingServiceSid,
}: SendMessageParams) => {
  let outreachAttemptId: string | null = null;
  try {
    const duplicateExists = await hasDuplicateCampaignSms({
      supabase,
      campaignId: String(campaign_id),
      to,
    });
    if (duplicateExists) {
      await dequeueDuplicateQueueContact({
        supabase,
        queueId: Number(queue_id),
        dequeuedById: user_id ?? null,
        reason: DUPLICATE_SMS_DEQUEUED_REASON,
      });
      return {
        skipped: true,
        reason: DUPLICATE_SMS_DEQUEUED_REASON,
      };
    }

    // Check workspace credits before sending
    const { data: workspaceData, error: workspaceError } = await supabase
      .from("workspace")
      .select("credits")
      .eq("id", workspace)
      .single();

    if (workspaceError || !workspaceData) {
      throw new Error("Failed to check workspace credits");
    }

    if (workspaceData.credits <= 0) {
      throw new Error("Insufficient credits to send message");
    }

    const { twilio, portalConfig } = await createWorkspaceTwilioInstance({
      supabase,
      workspace_id: workspace,
    });

    outreachAttemptId = await createOutreachAttempt({
      supabase,
      contact_id,
      campaign_id,
      queue_id,
      workspace,
      user_id,
    });

    if (!outreachAttemptId) {
      throw new Error("Failed to create outreach attempt");
    }

    const resolvedMessagingServiceSid = resolveTwilioSmsMessagingServiceSid({
      explicitRequestSid: requestMessagingServiceSid ?? null,
      campaignSmsSendMode,
      campaignSmsMessagingServiceSid,
      portalConfig,
    });
    const resolvedMessageIntent = messageIntent ?? portalConfig.defaultMessageIntent;

    const effectiveFrom = String(from ?? "").trim();
    if (!resolvedMessagingServiceSid && !effectiveFrom) {
      throw new Error("Missing sender: set caller_id or Messaging Service on the campaign");
    }

    const useTwilioLinkShortening = Boolean(
      resolvedMessagingServiceSid && bodyHasUrls(body),
    );

    const message = await withTwilioRetry(
      () =>
        twilio.messages.create({
          body,
          to,
          statusCallback: `${baseUrl}sms-status`,
          ...(media?.length && { mediaUrl: media }),
          ...(resolvedMessagingServiceSid
            ? {
              messagingServiceSid: resolvedMessagingServiceSid,
              ...(useTwilioLinkShortening ? { shortenUrls: true } : {}),
            }
            : { from: effectiveFrom }),
          ...(resolvedMessageIntent ? { messageIntent: resolvedMessageIntent } : {}),
        }),
      {
        operation: "messages.create",
        isRetryable: isRetryableSmsTwilioError,
      },
    ).catch((e: Error) => ({ error: e }));

    if ('error' in message) {
      // Update outreach attempt as failed
      await supabase
        .from("outreach_attempt")
        .update({ disposition: "failed" })
        .eq("id", outreachAttemptId);
      throw message.error;
    }

    const { error: messageInsertError } = await supabase
      .from("message")
      .insert({
        sid: message.sid || `failed-${to}-${Date.now()}`,
        body: message.body,
        num_segments: message.numSegments,
        direction: message.direction,
        from: message.from,
        to: message.to,
        date_updated: message.dateUpdated,
        price: message.price,
        error_message: message.errorMessage,
        account_sid: message.accountSid,
        uri: message.uri,
        num_media: message.numMedia,
        status: message.status,
        messaging_service_sid: message.messagingServiceSid,
        date_sent: message.dateSent,
        error_code: message.errorCode,
        price_unit: message.priceUnit,
        api_version: message.apiVersion,
        subresource_uris: message.subresourceUris,
        campaign_id,
        workspace,
        contact_id,
        queue_id,
        outreach_attempt_id: outreachAttemptId,
      });

    if (messageInsertError) {
      // Update outreach attempt as failed if message insert fails
      await supabase
        .from("outreach_attempt")
        .update({ disposition: "failed" })
        .eq("id", outreachAttemptId);
      throw messageInsertError;
    }

    return { message, outreachAttemptId };
  } catch (error) {
    if (outreachAttemptId) {
      await supabase
        .from("outreach_attempt")
        .update({ disposition: "failed" })
        .eq("id", outreachAttemptId);
    }
    console.error("Error in SMS handler:", error);
    return { error: error instanceof Error ? error.message : 'Unknown error' };
  }
};

const createOutreachAttempt = async ({
  supabase,
  contact_id,
  campaign_id,
  queue_id,
  workspace,
  user_id,
}: {
  supabase: SupabaseClient;
  contact_id: string | number;
  campaign_id: string | number;
  queue_id: string | number;
  workspace: string;
  user_id: string;
}) => {
  const { data, error } = await supabase.rpc(
    "create_outreach_attempt",
    {
      con_id: contact_id,
      cam_id: campaign_id,
      queue_id,
      wks_id: workspace,
      usr_id: user_id,
    },
  );
  if (error) throw error;
  return data;
};

export async function handleRequest(
  req: Request,
  options?: { supabase?: SupabaseClient },
): Promise<Response> {
  try {
    const supabase =
      options?.supabase ??
      createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const {
      to_number,
      campaign_id,
      workspace_id,
      contact_id,
      caller_id,
      queue_id,
      user_id,
      message_intent,
      messaging_service_sid,
      dispatch_mode: _dispatchModeRaw,
    } = await req.json();

    // Check if campaign is still active
    const { data: campaignRow, error: campaignError } = await supabase
      .from("campaign")
      .select("is_active, sms_send_mode, sms_messaging_service_sid, caller_id")
      .eq("id", campaign_id)
      .single();

    if (campaignError || !campaignRow?.is_active) {
      return new Response(
        JSON.stringify({ status: "campaign_completed" }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    const { data: campaignDetails, error: detailsError } = await supabase
      .from("message_campaign")
      .select()
      .eq('campaign_id', campaign_id)
      .single();

    if (detailsError) throw detailsError;

    // Fetch contact data for template tag processing
    const { data: contact, error: contactError } = await supabase
      .from("contact")
      .select("*")
      .eq("id", contact_id)
      .single();

    if (contactError) {
      console.error("Error fetching contact:", contactError);
      // Continue without template processing if contact fetch fails
    }

    // Process template tags in the message body
    let processedBody = campaignDetails.body_text;
    if (contact && campaignDetails.body_text) {
      processedBody = processTemplateTags(campaignDetails.body_text, contact);
    }

    const media = campaignDetails.message_media?.length
      ? await Promise.all(
        campaignDetails.message_media.map((mediaItem: string) =>
          supabase.storage
            .from("messageMedia")
            .createSignedUrl(`${workspace_id}/${mediaItem}`, 3600)
            .then(({ data }: { data: { signedUrl: string } | null }) => data?.signedUrl)
        )
      )
      : [];

    const result = await sendMessage({
      body: processedBody,
      media: media.filter(Boolean) as string[],
      to: normalizePhoneNumber(to_number),
      from:
        String(caller_id ?? "").trim() ||
        String(campaignRow.caller_id ?? "").trim(),
      supabase,
      campaign_id,
      workspace: workspace_id,
      contact_id,
      queue_id,
      user_id,
      messageIntent: parseOptionalString(message_intent),
      requestMessagingServiceSid: parseOptionalString(messaging_service_sid),
      campaignSmsSendMode: campaignRow.sms_send_mode,
      campaignSmsMessagingServiceSid: campaignRow.sms_messaging_service_sid,
    });

    if ("skipped" in result && result.skipped) {
      return jsonHandlerResponse("skipped", {
        reason: result.reason ?? DUPLICATE_SMS_DEQUEUED_REASON,
      });
    }

    if ("error" in result) {
      const errorMessage = String(result.error);
      if (isRetryableSmsTwilioError(result.error)) {
        await requeueContact({
          supabase,
          queueId: queue_id,
          errorText: errorMessage.slice(0, 500),
        });
        return jsonHandlerResponse("retryable_failure", { error: errorMessage });
      }

      await failQueueContact({
        supabase,
        queueId: queue_id,
        errorText: errorMessage.slice(0, 500),
        dequeuedById: user_id ?? null,
      });
      return jsonHandlerResponse("permanent_failure", { error: errorMessage });
    }

    await completeQueueContact({
      supabase,
      queueId: queue_id,
      dequeuedById: user_id ?? null,
      reason: "SMS dispatched",
    });

    return jsonHandlerResponse("success", { extra: { result } });

  } catch (error) {
    console.error("Error in SMS handler:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return jsonHandlerResponse("permanent_failure", { error: errorMessage });
  }
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}