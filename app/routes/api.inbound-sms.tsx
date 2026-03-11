import { json, ActionFunctionArgs } from "@remix-run/node";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { sendWebhookNotification } from "@/lib/workspace-settings/WorkspaceSettingUtils";
import { findPotentialContacts } from "@/lib/database.server";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import { validateTwilioWebhook } from "@/twilio.server";

async function findMatchingContactIds(
  supabase: SupabaseClient<Database>,
  workspaceId: string,
  phoneNumber: string,
): Promise<number[]> {
  const { data: contacts, error } = await findPotentialContacts(
    supabase,
    phoneNumber,
    workspaceId,
  );

  if (error) {
    logger.error("Contact lookup error:", error);
    return [];
  }

  return Array.from(
    new Set(
      (contacts ?? [])
        .map((contact) => contact?.id)
        .filter((contactId): contactId is number => typeof contactId === "number"),
    ),
  );
}

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const supabase = createClient<Database>(
    env.SUPABASE_URL(),
    env.SUPABASE_SERVICE_KEY(),
  );
  const validation = await validateTwilioWebhook(request, env.TWILIO_AUTH_TOKEN());
  if (validation instanceof Response) return validation;
  const data = validation.params as Record<string, unknown>;
  const toNumber = typeof data.To === "string" ? data.To : "";
  const fromNumber = typeof data.From === "string" ? data.From : "";
  const messageSid = typeof data.MessageSid === "string" ? data.MessageSid : "";
  const accountSid = typeof data.AccountSid === "string" ? data.AccountSid : "";
  const body = typeof data.Body === "string" ? data.Body : "";
  const status = typeof data.Status === "string" ? data.Status : "";
  const numMedia = Number.parseInt(typeof data.NumMedia === "string" ? data.NumMedia : "0", 10) || 0;
  const numSegments =
    Number.parseInt(typeof data.NumSegments === "string" ? data.NumSegments : "0", 10) || 0;
  const { data: number, error: numberError } = await supabase
    .from("workspace_number")
    .select(
      `
        workspace,
        ...workspace!inner(twilio_data, webhook(*))`,
    )
    .eq("phone_number", toNumber)
    .single();

  if (number) {
    const workspaceNumber = number as unknown as {
      workspace: string;
      twilio_data: { sid: string; authToken: string } | null;
      webhook: Array<{ events?: Array<{ category: string }> }>;
    };
    if (!workspaceNumber.twilio_data) {
      logger.error("Workspace missing Twilio credentials for inbound SMS");
      return json({ error: "Workspace Twilio credentials missing" }, 500);
    }
    const media = [];
    const now = new Date();
    const nowIso = now.toISOString();
    for (let i = 0; i < numMedia; i++) {
      try {
        const mediaResponse = await fetch(
          data[`MediaUrl${i}`] as string,
          {
            headers: {
              Authorization: `Basic ${Buffer.from(`${workspaceNumber.twilio_data.sid}:${workspaceNumber.twilio_data.authToken}`).toString("base64")}`,
            },
          },
        );

        if (!mediaResponse.ok) {
          throw new Error(`Failed to fetch media: ${mediaResponse.statusText}`);
        }

        const newMedia = await mediaResponse.blob();
        const fileName = `${workspaceNumber.workspace}/sms-${messageSid}-${i}-${now.toISOString()}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("messageMedia")
          .upload(fileName, newMedia, {
            cacheControl: "60",
            upsert: false,
            contentType: data[`MediaContentType${i}`] as string,
          });

        if (uploadError) {
          logger.error('Upload error:', uploadError);
          continue;
        }
        media.push(uploadData?.path);
      } catch (error) {
        logger.error(`Error processing media ${i}:`, error);
      }
    }

    const matchingContactIds = await findMatchingContactIds(
      supabase,
      workspaceNumber.workspace,
      fromNumber,
    );
    const matchedContactId =
      matchingContactIds.length === 1 ? matchingContactIds[0] : null;
    const messagePayload: Database["public"]["Tables"]["message"]["Insert"] = {
      sid: messageSid,
      account_sid: accountSid,
      body,
      from: fromNumber,
      to: toNumber,
      num_media: String(numMedia),
      num_segments: String(numSegments),
      workspace: workspaceNumber.workspace,
      direction: "inbound",
      date_created: nowIso,
      date_sent: nowIso,
      status: "received",
      ...(media.length > 0 && { inbound_media: media }),
      ...(matchedContactId != null && { contact_id: matchedContactId }),
    };

    const { data: message, error: messageError } = await supabase
      .from("message")
      .insert(messagePayload)
      .select();

    if (body.toLowerCase() === "stop" || body.toLowerCase() === '"stop"') {
      if (matchingContactIds.length > 0) {
        await supabase.from("contact").update({
          opt_out: true,
        }).in("id", matchingContactIds);
      }
    } else if (body.toLowerCase() === "start" || body.toLowerCase() === '"start"') {
      if (matchingContactIds.length > 0) {
        await supabase.from("contact").update({
          opt_out: false,
        }).in("id", matchingContactIds);
      }
    }

    if (messageError) {
      logger.error('Message insert error:', messageError);
      return json({ messageError }, 400);
    }
    const smsWebhook = workspaceNumber.webhook
      .map((webhook) => (webhook.events ?? []).filter((event) => event.category === "inbound_sms"))
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
        supabaseClient: supabase,
      });
    }

    return json({ message }, 201);
  } else {
    return json({ error: "Number not found" }, 404);
  }
};
