import { workspaceRouteAuth } from "@/lib/workspace-route.server";
import { getConversationPhoneKey } from "@/lib/chat-conversation-sort";
import { data as routeData, redirect } from "react-router";
import { normalizePhoneNumber } from "@/lib/utils";
import { cancelScheduledMessage, sendMessage } from "@/lib/chat-sms.server";
import { linkContactToConversation } from "@/lib/database/chat-contact-link.server";
import { getEffectiveWorkspaceTwilioPortalConfigForWorkspace } from "@/lib/database/workspace.server";
import { parseChatSenderSelection } from "@/lib/sms-campaign-send-mode";
import { eq } from "drizzle-orm";
import {
  contact as contactTable,
  workspace_number as workspaceNumberTable,
} from "@/db/schema";
import { createTenantDb, type TenantDb } from "@/server/tenant-db";
import { findMatchingContactIds } from "@/lib/inbound-sms-context.server";
import { hasTemplateSyntax, processTemplateTags } from "@/lib/message-templates";
import { logger } from "@/lib/logger.server";
import {
  isOptedOutRecipient,
  isSmsIncapableRecipient,
} from "@/lib/chat-sms-guards.server";
import {
  outboundCreditsBlockedResponse,
  requireOutboundCredits,
} from "@/lib/outbound-credit-gate.server";
import { estimateMessageCredits } from "@/lib/pricing";
import { OUTBOUND_CREDIT_FLOOR } from "../../../../shared/credit-floor";
import type { BaseUser, WorkspaceTwilioOpsConfig, Contact } from "@/lib/types";
import { defineAction } from "@/lib/handler.server";
import { toUserMessage } from "@/lib/user-message";

function parseMediaList(raw: FormDataEntryValue | undefined): unknown[] {
  if (typeof raw !== "string" || !raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}

/**
 * Fill template tags from the conversation's contact: the linked contact when
 * the composer sent one, otherwise the single contact that matches the phone
 * number. Text with no tags, or no matching contact, is sent as typed.
 */
async function renderChatBody(args: {
  body: string;
  workspaceId: string;
  contactId: string | undefined;
  phone: string;
}): Promise<string> {
  const { body, workspaceId, contactId, phone } = args;
  if (!hasTemplateSyntax(body)) return body;
  const contact = await resolveTemplateContact(
    createTenantDb(workspaceId),
    workspaceId,
    contactId,
    phone,
  );
  return contact ? processTemplateTags(body, contact) : body;
}

async function resolveTemplateContact(
  tdb: TenantDb,
  workspaceId: string,
  contactId: string | undefined,
  phone: string,
): Promise<Contact | null> {
  let id = Number(contactId);
  if (!Number.isFinite(id) || id <= 0) {
    const matches = await findMatchingContactIds(workspaceId, phone);
    if (matches.length !== 1) return null;
    id = matches[0] as number;
  }
  const row = await tdb.contact.findFirst({ where: eq(contactTable.id, id) });
  return (row as Contact | undefined) ?? null;
}

export const action = defineAction({
  auth: workspaceRouteAuth,
  sideEffects: ["db-write", "twilio"],
  handler: async ({ request, params, auth }) => {
  const { headers, user, workspaceId } = auth;
  const formData = await request.formData();
  const data = Object.fromEntries(formData);

  if (data.intent === "link_contact") {
    if (!workspaceId) {
      return routeData({ error: "Workspace is required" }, { status: 400 });
    }

    const contactId = Number(data.contact_id);
    if (!Number.isFinite(contactId) || contactId <= 0) {
      return routeData(
        { error: "A valid contact_id is required" },
        { status: 400 },
      );
    }

    const rawContactNumber = String(
      params["contact_number"] || data["contact_number"] || "",
    );
    let contactPhone = rawContactNumber;
    try {
      contactPhone = normalizePhoneNumber(rawContactNumber);
    } catch {
      // fall back to the raw value; candidate-building tolerates loose formatting
    }

    if (!contactPhone) {
      return routeData({ error: "contact_number is required" }, { status: 400 });
    }

    const { linkedCount } = await linkContactToConversation({
      workspaceId,
      contactId,
      contactPhone,
    });

    return routeData({ linkedCount, contactId }, { headers });
  }

  if (data.intent === "cancel_scheduled_message") {
    if (!workspaceId) {
      return routeData({ error: "Workspace is required" }, { status: 400 });
    }

    const sid = String(data["sid"] || "");
    if (!sid) {
      return routeData({ error: "A message sid is required" }, { status: 400 });
    }

    try {
      const { message } = await cancelScheduledMessage({
        sid,
        workspace: workspaceId,
      });
      return routeData({ message }, { headers });
    } catch (error) {
      logger.error("Error canceling scheduled message:", error);
      return routeData(
        {
          error:
            error instanceof Error
              ? error.message
              : "Failed to cancel scheduled message",
        },
        { status: 400 },
      );
    }
  }

  if (!workspaceId) {
    return routeData({ error: "Workspace is required" }, { status: 400 });
  }

  // Fail-closed credit gate (mirrors api+/chat_sms). Without this the UI
  // composer bypasses the credit floor the API enforces, letting a depleted
  // workspace rack up unmetered Twilio spend. workspaceRouteAuth already
  // guarantees the workspace exists, so an unknown-workspace result is
  // treated the same as insufficient credits here too.
  const credits = await requireOutboundCredits(workspaceId);
  if (!credits.ok) return outboundCreditsBlockedResponse();

  let contact_number: string;
  try {
    contact_number = normalizePhoneNumber(
      params["contact_number"] || (data["contact_number"] as string),
    );
  } catch (error) {
    logger.error("Error normalizing chat send destination number:", error);
    return routeData(
      { error: "A valid destination phone number is required." },
      { status: 400 },
    );
  }

  let portalConfig: WorkspaceTwilioOpsConfig;
  try {
    portalConfig = await getEffectiveWorkspaceTwilioPortalConfigForWorkspace({
      workspaceId,
    });
  } catch (error) {
    logger.error("Error resolving chat sender configuration:", error);
    return routeData(
      { error: "Unable to resolve the workspace sending configuration." },
      { status: 400 },
    );
  }

  const workspaceMessagingServiceSid =
    portalConfig.sendMode === "messaging_service"
      ? portalConfig.messagingServiceSid?.trim() || null
      : null;
  // The composer chooses per message: the Messaging Service is one option among
  // the workspace's numbers, so an explicitly picked number must win over the
  // workspace default rather than being silently replaced by it.
  const senderSelection = parseChatSenderSelection({
    rawFrom: typeof data["from"] === "string" ? data["from"] : null,
    messagingServiceAvailable: Boolean(workspaceMessagingServiceSid),
  });
  const messagingServiceSid =
    senderSelection.mode === "messaging_service"
      ? workspaceMessagingServiceSid
      : null;
  const fromNumber = senderSelection.fromNumber;

  if (!messagingServiceSid) {
    if (!fromNumber) {
      return routeData(
        { error: "A workspace sending number is required." },
        { status: 400 },
      );
    }

    try {
      const tdb = createTenantDb(workspaceId);
      const workspaceNumbers = await tdb.workspace_number.findMany({
        where: eq(workspaceNumberTable.type, "rented"),
        columns: { phone_number: true },
      });
      const fromKey = getConversationPhoneKey(fromNumber);
      const isOwnedSender = workspaceNumbers.some((row) => {
        if (!row.phone_number) return false;
        return getConversationPhoneKey(row.phone_number) === fromKey;
      });
      if (!isOwnedSender) {
        return routeData(
          {
            error:
              "from must be a rented phone number that belongs to this workspace",
          },
          { status: 400 },
        );
      }
    } catch (error) {
      logger.error("Error validating chat sender number:", error);
      return routeData(
        { error: "Unable to validate the selected sending number." },
        { status: 400 },
      );
    }
  }

  // Resolve the recipient by explicit contact_id, else by an unambiguous phone
  // match (shared with api+/chat_sms). Previously these gates ran only when a
  // contact_id was present, so the "new number" composer could text an
  // opted-out contact or a landline that was not linked by id.
  const contactId =
    typeof data.contact_id === "string" && data.contact_id.length > 0
      ? data.contact_id
      : undefined;

  if (await isOptedOutRecipient(workspaceId, contact_number, contactId)) {
    return routeData(
      { error: "This contact has opted out of messages.", optedOut: true },
      { status: 403 },
    );
  }

  if (await isSmsIncapableRecipient(workspaceId, contact_number, contactId)) {
    return routeData(
      { error: "This number is a landline and can't receive SMS.", landline: true },
      { status: 400 },
    );
  }

  const sendAt = typeof data["send_at"] === "string" ? data["send_at"] : undefined;

  const body = await renderChatBody({
    body: String(data["body"] ?? ""),
    workspaceId,
    contactId,
    phone: contact_number,
  });

  try {
    const responseData = await sendMessage({
      body,
      to: contact_number as string,
      from: fromNumber,
      media: data["media"] as string,
      workspace: workspaceId as string,
      contact_id: data.contact_id as string,
      user: user as unknown as BaseUser,
      portalConfig,
      messagingServiceSid,
      // Without this a `from_number` send would fall back to the workspace's
      // portal Messaging Service and ignore the number the user picked.
      sendMode: senderSelection.mode,
      sendAt: sendAt || null,
    });
    if (!params.contact_number) return redirect(contact_number);
    const mediaList = parseMediaList(data["media"]);
    const estimatedCredits = estimateMessageCredits({
      body,
      hasMedia: mediaList.length > 0,
    }).credits;
    return routeData({
      responseData,
      billing: {
        balanceBefore: credits.balance,
        estimatedCredits,
        nextSendBlocked:
          credits.balance - estimatedCredits <= OUTBOUND_CREDIT_FLOOR,
      },
    });
  } catch (error) {
    logger.error("Error sending chat message:", error);
    return routeData(
      {
        error:
          toUserMessage(error, "Failed to send message"),
      },
      { status: 400 },
    );
  }
  },
});
