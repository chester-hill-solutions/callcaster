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
import { chatSmsBodySchema } from "@/lib/schemas/api/chat-sms";
import type { TwilioMessageIntent } from "@/lib/types";
import { eq } from "drizzle-orm";
import { contact as contactTable } from "@/db/schema";
import { createTenantDb } from "@/server/tenant-db";
import { findMatchingContactIds } from "@/lib/inbound-sms-context.server";
import { getWorkspaceCreditsBalance } from "@/lib/workspace-credits.server";
import { getOrLookupLineType, isSmsIncapableLineType } from "@/lib/twilio-lookup.server";
import { defineAction } from "@/lib/handler.server";

/**
 * Fail-open contact-level opt-out lookup: resolves by contact_id when known,
 * otherwise by a single unambiguous match on the destination number. Lookup
 * errors are logged and swallowed so a transient DB issue never blocks
 * delivery — this is a compliance guard, not the source of truth.
 */
async function findOptedOutContact(
  workspaceId: string,
  to: string,
  contactId: string | undefined,
): Promise<boolean> {
  try {
    const tdb = createTenantDb(workspaceId);
    if (contactId) {
      const contact = await tdb.contact.findFirst({
        where: eq(contactTable.id, Number(contactId)),
      });
      return Boolean(contact?.opt_out);
    }

    const matchingIds = await findMatchingContactIds(workspaceId, to);
    const [singleMatchId] = matchingIds;
    if (matchingIds.length !== 1 || singleMatchId == null) {
      return false;
    }
    const contact = await tdb.contact.findFirst({
      where: eq(contactTable.id, singleMatchId),
    });
    return Boolean(contact?.opt_out);
  } catch (error) {
    logger.error("Error checking contact opt-out status for chat_sms:", error);
    return false;
  }
}

/**
 * Fail-open landline gate: resolves the destination contact the same way as
 * {@link findOptedOutContact} (explicit contact_id, or a single unambiguous
 * match on the destination number), then looks up/caches its Twilio line
 * type. Errors are logged and swallowed — a lookup failure must never block
 * delivery.
 */
async function findLandlineContact(
  workspaceId: string,
  to: string,
  contactId: string | undefined,
): Promise<boolean> {
  try {
    let resolvedContactId: number | null = null;

    if (contactId) {
      resolvedContactId = Number(contactId);
    } else {
      const matchingIds = await findMatchingContactIds(workspaceId, to);
      const [singleMatchId] = matchingIds;
      if (matchingIds.length === 1 && singleMatchId != null) {
        resolvedContactId = singleMatchId;
      }
    }

    if (resolvedContactId == null) {
      return false;
    }

    const lineType = await getOrLookupLineType({
      workspaceId,
      contactId: resolvedContactId,
      phone: to,
    });
    return isSmsIncapableLineType(lineType);
  } catch (error) {
    logger.error("Error checking contact line type for chat_sms:", error);
    return false;
  }
}

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
  sideEffects: ["db-write", "credit", "twilio"],
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

  // Fail-closed credit gate: reject sends when the balance is unknown or
  // depleted rather than letting Twilio billing failures surface later.
  const creditsBalance = await getWorkspaceCreditsBalance(workspace_id);
  if (creditsBalance === null || creditsBalance <= 0) {
    return new Response(
      JSON.stringify({ creditsError: true, error: "Insufficient credits" }),
      {
        headers: { "Content-Type": "application/json" },
        status: 402,
      },
    );
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

  if (await findOptedOutContact(workspace_id, to, contact_id)) {
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

  if (await findLandlineContact(workspace_id, to, contact_id)) {
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
        error:
          error instanceof Error ? error.message : "Failed to send message",
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
