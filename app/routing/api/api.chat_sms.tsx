import {
  getWorkspaceTwilioPortalConfig,
  requireWorkspaceAccess,
  safeParseJson,
} from "@/lib/database.server";
import { verifyApiKeyOrSession } from "@/lib/api-auth.server";
import { normalizePhoneNumber, processTemplateTags } from "@/lib/utils";
import { logger } from "@/lib/logger.server";
import {
  parseOptionalString,
  sendMessage,
} from "@/lib/api-chat-sms.server";
import type { TwilioMessageIntent } from "@/lib/types";

export const action = async ({ request }: { request: Request }) => {
  const authResult = await verifyApiKeyOrSession(request);

  if ("error" in authResult) {
    return new Response(JSON.stringify({ error: authResult.error }), {
      headers: { "Content-Type": "application/json" },
      status: authResult.status,
    });
  }

  const {
    to_number,
    workspace_id,
    contact_id,
    caller_id,
    body,
    media,
    message_intent,
    messaging_service_sid,
  } = await safeParseJson<{
    to_number: string;
    workspace_id: string;
    contact_id: string;
    caller_id: string;
    body: string;
    media: string;
    message_intent?: string;
    messaging_service_sid?: string;
  }>(request);

  if (authResult.authType === "api_key") {
    if (workspace_id !== authResult.workspaceId) {
      return new Response(JSON.stringify({ error: "workspace_id does not match API key" }), {
        headers: { "Content-Type": "application/json" },
        status: 403,
      });
    }
  } else {
    await requireWorkspaceAccess({
      supabaseClient: authResult.supabaseClient,
      user: authResult.user,
      workspaceId: workspace_id,
    });
  }

  let to;
  try {
    to = normalizePhoneNumber(to_number);
  } catch (error) {
    logger.error("Invalid phone number:", error);
    return new Response(JSON.stringify({ error }), {
      headers: {
        "Content-Type": "application/json",
      },
      status: 404,
    });
  }

  const supabase = authResult.authType === "api_key" ? authResult.supabase : authResult.supabaseClient;
  const user = authResult.authType === "session" ? authResult.user : null;
  const portalConfig = await getWorkspaceTwilioPortalConfig({
    supabaseClient: supabase,
    workspaceId: workspace_id,
  });
  const messageIntent =
    typeof message_intent === "string" && message_intent.trim()
      ? (message_intent.trim() as TwilioMessageIntent)
      : null;
  const messagingServiceSid = parseOptionalString(messaging_service_sid);

  try {
    let processedBody = body || " ";
    if (contact_id && body) {
      const { data: contact, error: contactError } = await supabase
        .from("contact")
        .select("*")
        .eq("id", Number(contact_id))
        .single();

      if (!contactError && contact) {
        processedBody = processTemplateTags(body, contact);
      }
    }

    const { message, data } = await sendMessage({
      body: processedBody,
      media,
      to,
      from: caller_id,
      supabase,
      workspace: workspace_id,
      contact_id,
      user,
      portalConfig,
      messageIntent,
      messagingServiceSid,
    });
    return new Response(JSON.stringify({ data, message }), {
      headers: {
        "Content-Type": "application/json",
      },
      status: 201,
    });
  } catch (error) {
    logger.error("Error in chat_sms action:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Failed to send message",
      }),
      {
        headers: {
          "Content-Type": "application/json",
        },
        status: 500,
      },
    );
  }
};
