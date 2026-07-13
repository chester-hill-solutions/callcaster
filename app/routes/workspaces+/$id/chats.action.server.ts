import { workspaceRouteAuth } from "@/lib/workspace-route.server";
import {
  getConversationParticipantPhones,
  getChatSortOption,
  isInboundMessageDirection,
  normalizeConversationPhone,
  sortConversationSummaries,
  type ConversationSummary,
} from "@/lib/chat-conversation-sort";
import { data as routeData, redirect } from "react-router";
import { formatMessageTimestamp, normalizePhoneNumber } from "@/lib/utils";
import { cancelScheduledMessage, sendMessage } from "@/lib/chat-sms.server";
import { linkContactToConversation } from "@/lib/database/chat-contact-link.server";
import { eq } from "drizzle-orm";
import { contact as contactTable } from "@/db/schema";
import { createTenantDb } from "@/server/tenant-db";
import { logger } from "@/lib/logger.server";
import { getOrLookupLineType, isSmsIncapableLineType } from "@/lib/twilio-lookup.server";
import type {
  User,
  Contact,
  Workspace,
  BaseUser,
  WorkspaceNumber,
} from "@/lib/types";
import type { Database, Tables } from "@/lib/db-types";
import { defineAction } from "@/lib/handler.server";

export const action = defineAction({
  auth: workspaceRouteAuth,
  sideEffects: ["db-write", "twilio"],
  handler: async ({ request, params, auth }) => {
  const { headers, user, workspaceId, userRole } = auth;
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

  const contact_number = normalizePhoneNumber(
    params["contact_number"] || (data["contact_number"] as string),
  );

  const contactId = data.contact_id as string;
  if (workspaceId && contactId) {
    try {
      const tdb = createTenantDb(workspaceId);
      const contact = await tdb.contact.findFirst({
        where: eq(contactTable.id, Number(contactId)),
      });
      if (contact?.opt_out) {
        return routeData(
          {
            error: "This contact has opted out of messages.",
            optedOut: true,
          },
          { status: 403 },
        );
      }

      if (contact) {
        const lineType = await getOrLookupLineType({
          workspaceId,
          contactId: Number(contactId),
          phone: contact_number,
          tdb,
        });
        if (isSmsIncapableLineType(lineType)) {
          return routeData(
            {
              error: "This number is a landline and can't receive SMS.",
              landline: true,
            },
            { status: 400 },
          );
        }
      }
    } catch (error) {
      logger.error("Error checking contact opt-out status:", error);
    }
  }

  const sendAt = typeof data["send_at"] === "string" ? data["send_at"] : undefined;

  try {
    const responseData = await sendMessage({
      body: data["body"] as string,
      to: contact_number as string,
      from: data["from"] as string,
      media: data["media"] as string,
      workspace: workspaceId as string,
      contact_id: data.contact_id as string,
      user: user as unknown as BaseUser,
      sendAt: sendAt || null,
    });
    if (!params.contact_number) return redirect(contact_number);
    return routeData({ responseData });
  } catch (error) {
    logger.error("Error sending chat message:", error);
    return routeData(
      {
        error:
          error instanceof Error ? error.message : "Failed to send message",
      },
      { status: 400 },
    );
  }
  },
});
