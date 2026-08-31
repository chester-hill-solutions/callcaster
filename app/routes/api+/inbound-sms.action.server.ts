import {
  findMatchingContactIds,
  parseTrimmedString,
  resolveInboundWorkspaceContext,
} from "@/lib/inbound-sms-context.server";
import { requireTwilioSignature } from "@/lib/twilio-webhook.server";
import { data as routeData } from "react-router";
import { logger } from "@/lib/logger.server";
import { readTwilioWorkspaceCredentials } from "@/lib/twilio-workspace-credentials";
import { sendWebhookNotification } from "@/lib/workspace-settings/WorkspaceSettingUtils.server";
import { inArray } from "drizzle-orm";
import { contact as contactTable } from "@/db/schema";
import { createTenantDb } from "@/server/tenant-db";
import { uploadObject } from "@/lib/object-storage.server";
import { getWorkspaceMessagingOnboardingState } from "@/lib/messaging-onboarding.server";
import { isOptOutMessage, parseOptOutKeywords } from "@/lib/chat-opt-out";
import { dequeueQueueEntry } from "@/lib/campaign-queue-db.server";
import { defineAction } from "@/lib/handler.server";
import { emitChatMessageEvent } from "@/lib/workspace-events.server";
import { inboundSmsRateVerdict } from "@/lib/inbound-sms-rate-limit.server";

export const action = defineAction({
  auth: async ({ request }) => {
    // Clone before reading: Bun returns an empty body from clone()/re-read after
    // the original is consumed, which makes Twilio signature validation fail
    // (403 → Twilio Error 11200) and drops inbound messages from chats.
    const formData = await request.clone().formData();
    const params = Object.fromEntries(formData.entries()) as Record<string, string>;
    const toNumber = parseTrimmedString(params.To);
    const messagingServiceSid = parseTrimmedString(params.MessagingServiceSid);

    const resolved = await resolveInboundWorkspaceContext({
      toRaw: toNumber,
      messagingServiceSid,
    });

    if (!resolved.ok) {
      return { kind: "early" as const, response: resolved.response };
    }

    const workspaceNumber = resolved.ctx;
    logger.info("Inbound SMS workspace attribution", {
      path: resolved.attributionPath,
      workspace: workspaceNumber.workspace,
      messagingServiceSid: messagingServiceSid || null,
    });

    const inboundTwilioCreds = readTwilioWorkspaceCredentials(
      workspaceNumber.twilio_data,
    );

    const forbidden = await requireTwilioSignature(request, {
      workspaceId: workspaceNumber.workspace,
      params,
    });
    if (forbidden) {
      if (forbidden.status === 500) {
        logger.error("Workspace missing Twilio credentials for inbound SMS", {
          workspace: workspaceNumber.workspace,
          attributionPath: resolved.attributionPath,
        });
      }
      return forbidden;
    }

    return {
      kind: "ok" as const,
      params,
      toNumber,
      messagingServiceSid,
      workspaceNumber,
      inboundTwilioCreds,
    };
  },
  sideEffects: ["db-write", "twilio", "external"],
  handler: async ({ auth }) => {
    if (auth.kind === "early") {
      return auth.response;
    }
    const { params, toNumber, messagingServiceSid, workspaceNumber, inboundTwilioCreds } = auth;

    const data = params as Record<string, unknown>;
    const fromNumber = parseTrimmedString(data.From);
    const messageSid = parseTrimmedString(data.MessageSid);
    const accountSid = parseTrimmedString(data.AccountSid);
    const body = typeof data.Body === "string" ? data.Body : "";
    const status = parseTrimmedString(data.Status);
    const numMedia = Number.parseInt(typeof data.NumMedia === "string" ? data.NumMedia : "0", 10) || 0;
    const numSegments =
      Number.parseInt(typeof data.NumSegments === "string" ? data.NumSegments : "0", 10) || 0;

    const credsForRest = inboundTwilioCreds;

    const now = new Date();
    const nowIso = now.toISOString();

    // #1394 billing-attack guard. Run BEFORE media fetch, message insert,
    // opt-out/dequeue lookups, and webhook fanout — anything that costs us
    // money per inbound event. Returning 200 keeps Twilio from retrying
    // (which would just re-run the attack).
    const tdb = createTenantDb(workspaceNumber.workspace);
    const rateVerdict = await inboundSmsRateVerdict(tdb, {
      workspaceId: workspaceNumber.workspace,
      fromNumber,
    });
    if (!rateVerdict.allowed) {
      logger.warn("inbound_sms.rate_limited", {
        workspace: workspaceNumber.workspace,
        from: fromNumber,
        messageSid,
        window: rateVerdict.window,
        count: rateVerdict.count,
        limit: rateVerdict.limit,
      });
      return routeData(
        {
          dropped: true,
          reason: "rate_limited",
          window: rateVerdict.window,
        },
        200,
      );
    }

    const media: string[] = [];
    if (numMedia > 0 && !credsForRest) {
      logger.warn("Skipping inbound SMS MMS fetch: no Twilio REST credentials", {
        workspace: workspaceNumber.workspace,
        messageSid,
      });
    }
    for (let i = 0; i < numMedia; i++) {
      if (!credsForRest) {
        continue;
      }
      try {
        const mediaResponse = await fetch(data[`MediaUrl${i}`] as string, {
          headers: {
            Authorization: `Basic ${Buffer.from(`${credsForRest.sid}:${credsForRest.authToken}`).toString("base64")}`,
          },
        });

        if (!mediaResponse.ok) {
          throw new Error(`Failed to fetch media: ${mediaResponse.statusText}`);
        }

        const newMedia = await mediaResponse.blob();
        const fileName = `${workspaceNumber.workspace}/sms-${messageSid}-${i}-${now.toISOString()}`;
        try {
          await uploadObject("messageMedia", fileName, newMedia, {
            cacheControl: "60",
            contentType: data[`MediaContentType${i}`] as string,
          });
          media.push(fileName);
        } catch (uploadError) {
          logger.error("Upload error:", uploadError);
          continue;
        }
      } catch (error) {
        logger.error(`Error processing media ${i}:`, error);
      }
    }

    const matchingContactIds = await findMatchingContactIds(
      workspaceNumber.workspace,
      fromNumber,
    );
    const matchedContactId =
      matchingContactIds.length === 1 ? matchingContactIds[0] : null;

    const messagePayload = {
      sid: messageSid,
      account_sid: accountSid,
      body,
      from: fromNumber,
      to: toNumber,
      num_media: String(numMedia),
      num_segments: String(numSegments),
      direction: "inbound" as const,
      date_created: nowIso,
      date_sent: nowIso,
      status: "received" as const,
      ...(messagingServiceSid ? { messaging_service_sid: messagingServiceSid } : {}),
      ...(media.length > 0 ? { inbound_media: media } : {}),
      ...(matchedContactId != null ? { contact_id: matchedContactId } : {}),
    };

    let message: unknown[] | null = null;
    let messageError: { message: string } | null = null;
    try {
      message = await tdb.message.insert(messagePayload);
    } catch (error) {
      messageError = { message: error instanceof Error ? error.message : String(error) };
    }

    let optOutKeywords = parseOptOutKeywords(null);
    try {
      const onboarding = await getWorkspaceMessagingOnboardingState({
        workspaceId: workspaceNumber.workspace,
      });
      optOutKeywords = parseOptOutKeywords(onboarding.businessProfile.optOutKeywords);
    } catch (error) {
      logger.error("Error loading workspace opt-out keywords for inbound SMS:", error);
    }

    if (isOptOutMessage(body, optOutKeywords)) {
      if (matchingContactIds.length > 0) {
        await tdb.contact.update({
          set: { opt_out: true },
          where: inArray(contactTable.id, matchingContactIds),
        });
        // Opted-out contacts must also leave every campaign queue in the
        // workspace; log-don't-throw so the inbound message is still recorded.
        try {
          for (const contactId of matchingContactIds) {
            await dequeueQueueEntry({
              by: { contactId },
              userId: null,
              reason: "Contact opted out via SMS",
              workspaceId: workspaceNumber.workspace,
            });
          }
        } catch (error) {
          logger.error(
            "Failed to dequeue opted-out contact from campaign queues:",
            error,
          );
        }
      }
    } else if (body.toLowerCase() === "start" || body.toLowerCase() === '"start"') {
      // Onboarding only configures opt-out keywords today (no configurable
      // opt-in list), so re-subscribe stays hardcoded to Twilio's "START".
      if (matchingContactIds.length > 0) {
        await tdb.contact.update({
          set: { opt_out: false },
          where: inArray(contactTable.id, matchingContactIds),
        });
      }
    }

    if (messageError) {
      logger.error("Message insert error:", messageError);
      return routeData({ messageError }, 400);
    }

    const insertedMessage = Array.isArray(message) ? message[0] : null;
    if (insertedMessage) {
      await emitChatMessageEvent(
        workspaceNumber.workspace,
        "INSERT",
        insertedMessage as Record<string, unknown>,
        null,
      );
    }

    const smsWebhook = workspaceNumber.webhook
      .map((webhook) =>
        (webhook.events ?? []).filter((event) => event.category === "inbound_sms"),
      )
      .flat();
    if (smsWebhook.length > 0) {
      await sendWebhookNotification({
        eventCategory: "inbound_sms",
        eventType: "INSERT",
        workspaceId: workspaceNumber.workspace,
        payload: {
          message_sid: messageSid,
          from: fromNumber,
          to: toNumber,
          body,
          status,
          num_media: numMedia,
          media_urls: media.length > 0 ? media : null,
          timestamp: now.toISOString(),
        },
      });
    }

    return routeData({ message }, 201);
  },
});
