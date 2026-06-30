import {
  findMatchingContactIds,
  parseTrimmedString,
  resolveInboundWorkspaceContext,
} from "@/lib/inbound-sms-context.server";
import {
  rejectMissingTwilioSignatureHeader,
  validateWorkspaceTwilioWebhook,
} from "@/lib/twilio-webhook.server";
import { data as routeData } from "react-router";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import { readTwilioWorkspaceCredentials } from "@/lib/twilio-workspace-credentials";
import { sendWebhookNotification } from "@/lib/workspace-settings/WorkspaceSettingUtils.server";
import { inArray } from "drizzle-orm";
import { contact as contactTable } from "@/db/schema";
import { createTenantDb } from "@/server/tenant-db";
import type { ActionFunctionArgs } from "react-router";
import type { ActionFunctionArgs } from "react-router";

export const action = async ({ request }: ActionFunctionArgs) => {
  const missingHeader = rejectMissingTwilioSignatureHeader(request);
  if (missingHeader) {
    return missingHeader;
  }

  const client = createClient<Database>(
    env.BASE_URL(),
    env.BASE_URL(),
  );

  const formData = await request.formData();
  const params = Object.fromEntries(formData.entries()) as Record<string, string>;
  const toNumber = parseTrimmedString(params.To);
  const messagingServiceSid = parseTrimmedString(params.MessagingServiceSid);

  const resolved = await resolveInboundWorkspaceContext({
    toRaw: toNumber,
    messagingServiceSid,
  });

  if (!resolved.ok) {
    return resolved.response;
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
  const validation = validateWorkspaceTwilioWebhook({
    request,
    params,
    twilioData: workspaceNumber.twilio_data,
  });
  if (!validation.ok) {
    if (validation.response.status === 500) {
      logger.error("Workspace missing Twilio credentials for inbound SMS", {
        workspace: workspaceNumber.workspace,
        attributionPath: resolved.attributionPath,
      });
    }
    return validation.response;
  }
  const authToken = validation.authToken;

  const data = params as Record<string, unknown>;
  const fromNumber = parseTrimmedString(data.From);
  const messageSid = parseTrimmedString(data.MessageSid);
  const accountSid = parseTrimmedString(data.AccountSid);
  const body = typeof data.Body === "string" ? data.Body : "";
  const status = parseTrimmedString(data.Status);
  const numMedia = Number.parseInt(typeof data.NumMedia === "string" ? data.NumMedia : "0", 10) || 0;
  const numSegments =
    Number.parseInt(typeof data.NumSegments === "string" ? data.NumSegments : "0", 10) || 0;

  const credsForRest =
    inboundTwilioCreds ??
    (authToken && process.env.NODE_ENV !== "production"
      ? { sid: env.TWILIO_SID(), authToken }
      : null);

  const media: string[] = [];
  const now = new Date();
  const nowIso = now.toISOString();
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
      const { data: uploadData, error: uploadError } = await adminDb.storage
        .from("messageMedia")
        .upload(fileName, newMedia, {
          cacheControl: "60",
          upsert: false,
          contentType: data[`MediaContentType${i}`] as string,
        });

      if (uploadError) {
        logger.error("Upload error:", uploadError);
        continue;
      }
      if (uploadData?.path) {
        media.push(uploadData.path);
      }
    } catch (error) {
      logger.error(`Error processing media ${i}:`, error);
    }
  }

  const matchingContactIds = await findMatchingContactIds(
    client,
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

  const tdb = createTenantDb(workspaceNumber.workspace);
  let message: unknown[] | null = null;
  let messageError: { message: string } | null = null;
  try {
    message = await tdb.message.insert(messagePayload);
  } catch (error) {
    messageError = { message: error instanceof Error ? error.message : String(error) };
  }

  if (body.toLowerCase() === "stop" || body.toLowerCase() === '"stop"') {
    if (matchingContactIds.length > 0) {
      await tdb.contact.update({
        set: { opt_out: true },
        where: inArray(contactTable.id, matchingContactIds),
      });
    }
  } else if (body.toLowerCase() === "start" || body.toLowerCase() === '"start"') {
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
};
