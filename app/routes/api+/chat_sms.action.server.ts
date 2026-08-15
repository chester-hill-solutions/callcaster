import { env } from "@/lib/env.server";
import {
  getWorkspaceTwilioPortalConfig,
  requireWorkspaceAccess,
} from "@/lib/database/workspace.server";
import { logger } from "@/lib/logger.server";
import { normalizePhoneNumber, processTemplateTags } from "@/lib/utils";
import { parseOptionalString } from "@/lib/parse-utils.server";
import { sendMessage } from "@/lib/chat-sms.server";
import { verifyApiKeyOrSession } from "@/lib/api-auth.server";
import { parseJsonBodyOrResponse } from "@/lib/api-parse.server";
import { requireDualAuthCapability } from "@/lib/capability-guard.server";
import { chatSmsBodySchema } from "@/lib/schemas/api/chat-sms";
import { toUserMessage } from "@/lib/user-message";
import type { TwilioMessageIntent } from "@/lib/types";
import { eq } from "drizzle-orm";
import { contact as contactTable } from "@/db/schema";
import { createTenantDb } from "@/server/tenant-db";
import {
  OUTBOUND_CREDITS_BLOCKED_BODY,
  requireOutboundCredits,
} from "@/lib/outbound-credit-gate.server";
import {
  isOptedOutRecipient,
  isSmsIncapableRecipient,
} from "@/lib/chat-sms-guards.server";
import { defineAction } from "@/lib/handler.server";

export const action = defineAction({
  auth: async ({ request }) => {
    const authResult = await verifyApiKeyOrSession(request);

    if ("error" in authResult) {
      return new Response(JSON.stringify({ error: authResult.error }), {
        headers: { "Content-Type": "application/json" },
        status: authResult.status,
      });
    }

    return authResult;
  },
  sideEffects: ["db-write", "twilio"],
  handler: async ({ request, auth: authResult }) => {
  const parsed = await parseJsonBodyOrResponse(request, chatSmsBodySchema);
  if (parsed instanceof Response) {
    return parsed;
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
    send_at,
  } = parsed;

  if (authResult.authType === "api_key") {
    if (workspace_id !== authResult.workspaceId) {
      return new Response(
        JSON.stringify({ error: "workspace_id does not match API key" }),
        {
          headers: { "Content-Type": "application/json" },
          status: 403,
        },
      );
    }
  } else {
    await requireWorkspaceAccess({user: authResult.user,
      workspaceId: workspace_id,
    });
  }

  const capability = await requireDualAuthCapability({
    auth: authResult,
    workspaceId: workspace_id,
    capability: "messages.send",
  });
  if (capability instanceof Response) {
    return capability;
  }

  // Fail-closed credit gate: reject sends when the balance is unknown or
  // depleted rather than letting Twilio billing failures surface later.
  // Workspace existence is already guaranteed above (requireWorkspaceAccess /
  // API-key workspace match), so an unknown-workspace result is treated the
  // same as insufficient credits rather than surfacing a distinct 404.
  const credits = await requireOutboundCredits(workspace_id);
  if (!credits.ok) {
    return new Response(JSON.stringify(OUTBOUND_CREDITS_BLOCKED_BODY), {
      headers: { "Content-Type": "application/json" },
      status: 402,
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

  if (await isOptedOutRecipient(workspace_id, to, contact_id)) {
    return new Response(
      JSON.stringify({
        error: "This contact has opted out of messages.",
        optedOut: true,
      }),
      {
        headers: { "Content-Type": "application/json" },
        status: 403,
      },
    );
  }

  if (await isSmsIncapableRecipient(workspace_id, to, contact_id)) {
    return new Response(
      JSON.stringify({
        error: "This number is a landline and can't receive SMS.",
        landline: true,
      }),
      {
        headers: { "Content-Type": "application/json" },
        status: 400,
      },
    );
  }

  const user = authResult.authType === "session" ? authResult.user : null;
  const portalConfig = await getWorkspaceTwilioPortalConfig({workspaceId: workspace_id,
  });
  const messageIntent =
    typeof message_intent === "string" && message_intent.trim()
      ? (message_intent.trim() as TwilioMessageIntent)
      : null;
  const messagingServiceSid = parseOptionalString(messaging_service_sid);
  const sendAt = parseOptionalString(send_at);

  try {
    let processedBody = body || " ";
    if (contact_id && body) {
      const tdb = createTenantDb(workspace_id);
      const contact = await tdb.contact.findFirst({
        where: eq(contactTable.id, Number(contact_id)),
      });

      if (contact) {
        processedBody = processTemplateTags(body, contact);
      }
    }

    const { message, data } = await sendMessage({
      body: processedBody,
      media: media ?? "",
      to,
      from: caller_id,
      workspace: workspace_id,
      contact_id: contact_id ?? "",
      user,
      portalConfig,
      messageIntent,
      messagingServiceSid,
      sendAt,
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
        error: toUserMessage(error, "Failed to send message"),
      }),
      {
        headers: {
          "Content-Type": "application/json",
        },
        status: 500,
      },
    );
  }
  },
});
