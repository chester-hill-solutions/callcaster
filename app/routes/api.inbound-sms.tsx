import { json, ActionFunctionArgs } from "@remix-run/node";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { sendWebhookNotification } from "@/lib/workspace-settings/WorkspaceSettingUtils";
import { findPotentialContacts } from "@/lib/database.server";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import { validateTwilioWebhook } from "@/twilio.server";
import { normalizePhoneNumber } from "@/lib/utils";
import { readTwilioWorkspaceCredentials } from "@/lib/twilio-workspace-credentials";

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

function parseTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeInboundToNumber(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
  }

  try {
    return normalizePhoneNumber(trimmed);
  } catch {
    return trimmed;
  }
}

type InboundWorkspaceContext = {
  workspace: string;
  twilio_data: { sid: string; authToken: string } | null;
  webhook: Array<{ events?: Array<{ category: string }> }>;
};

async function lookupWorkspaceNumberByPhone(
  supabase: SupabaseClient<Database>,
  phone: string,
): Promise<
  | { ok: true; ctx: InboundWorkspaceContext }
  | { ok: false; error: unknown }
  | { ok: false; notFound: true }
> {
  if (!phone) {
    return { ok: false, notFound: true };
  }

  const { data, error } = await supabase
    .from("workspace_number")
    .select(
      `
        workspace,
        ...workspace!inner(twilio_data, webhook(*))`,
    )
    .eq("phone_number", phone)
    .maybeSingle();

  if (error) {
    return { ok: false, error };
  }

  if (!data) {
    return { ok: false, notFound: true };
  }

  return { ok: true, ctx: data as unknown as InboundWorkspaceContext };
}

async function resolveInboundWorkspaceContext(
  supabase: SupabaseClient<Database>,
  args: { toRaw: string; messagingServiceSid: string },
): Promise<
  | { ok: true; ctx: InboundWorkspaceContext; attributionPath: string }
  | { ok: false; response: ReturnType<typeof json> }
> {
  const normalizedTo = normalizeInboundToNumber(args.toRaw);
  const rawTrimmed = args.toRaw.trim();

  for (const candidate of new Set(
    [normalizedTo, rawTrimmed].filter((value) => Boolean(value)),
  )) {
    const result = await lookupWorkspaceNumberByPhone(supabase, candidate);
    if (result.ok) {
      return {
        ok: true,
        ctx: result.ctx,
        attributionPath:
          candidate === normalizedTo ? "matched_by_to_number" : "matched_by_to_number_raw",
      };
    }
    if ("error" in result && result.error) {
      logger.error("Inbound SMS workspace_number lookup error", {
        message:
          result.error &&
          typeof result.error === "object" &&
          "message" in result.error
            ? String((result.error as { message?: string }).message)
            : String(result.error),
        code:
          result.error &&
          typeof result.error === "object" &&
          "code" in result.error
            ? (result.error as { code?: string }).code
            : undefined,
        phone: candidate,
      });
      return { ok: false, response: json({ error: "Number lookup failed" }, { status: 500 }) };
    }
  }

  const msSid = args.messagingServiceSid.trim();
  if (!msSid.startsWith("MG")) {
    logger.warn("Inbound SMS number not found and no Messaging Service SID to fall back on", {
      toRaw: args.toRaw,
      normalizedTo,
    });
    return { ok: false, response: json({ error: "Number not found" }, { status: 404 }) };
  }

  const { data: workspaces, error: workspaceError } = await supabase
    .from("workspace")
    .select("id, twilio_data, webhook(*)")
    .or(
      `twilio_data->portalConfig->>messagingServiceSid.eq.${msSid},twilio_data->onboarding->messagingService->>serviceSid.eq.${msSid}`,
    );

  if (workspaceError) {
    logger.error("Inbound SMS workspace lookup by Messaging Service SID failed", workspaceError);
    return {
      ok: false,
      response: json({ error: "Messaging service lookup failed" }, { status: 500 }),
    };
  }

  if (!workspaces?.length) {
    logger.warn(
      "Inbound SMS number not found; Messaging Service SID did not match any workspace",
      {
        messagingServiceSid: msSid,
        toRaw: args.toRaw,
        normalizedTo,
      },
    );
    return { ok: false, response: json({ error: "Number not found" }, { status: 404 }) };
  }

  if (workspaces.length > 1) {
    logger.error("Inbound SMS Messaging Service SID matched multiple workspaces", {
      messagingServiceSid: msSid,
      workspaceCount: workspaces.length,
    });
    return {
      ok: false,
      response: json(
        { error: "Messaging service matches multiple workspaces" },
        { status: 409 },
      ),
    };
  }

  const row = workspaces[0] as {
    id: string;
    twilio_data: InboundWorkspaceContext["twilio_data"];
    webhook?: InboundWorkspaceContext["webhook"];
  };

  return {
    ok: true,
    ctx: {
      workspace: row.id,
      twilio_data: row.twilio_data,
      webhook: row.webhook ?? [],
    },
    attributionPath: "matched_by_messaging_service_sid",
  };
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const supabase = createClient<Database>(
    env.SUPABASE_URL(),
    env.SUPABASE_SERVICE_KEY(),
  );
  const validation = await validateTwilioWebhook(request, env.TWILIO_AUTH_TOKEN());
  if (validation instanceof Response) return validation;
  const data = validation.params as Record<string, unknown>;
  const toNumber = parseTrimmedString(data.To);
  const fromNumber = parseTrimmedString(data.From);
  const messageSid = parseTrimmedString(data.MessageSid);
  const accountSid = parseTrimmedString(data.AccountSid);
  const body = typeof data.Body === "string" ? data.Body : "";
  const status = parseTrimmedString(data.Status);
  const messagingServiceSid = parseTrimmedString(data.MessagingServiceSid);
  const numMedia = Number.parseInt(typeof data.NumMedia === "string" ? data.NumMedia : "0", 10) || 0;
  const numSegments =
    Number.parseInt(typeof data.NumSegments === "string" ? data.NumSegments : "0", 10) || 0;

  const resolved = await resolveInboundWorkspaceContext(supabase, {
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
  if (!inboundTwilioCreds) {
    logger.error("Workspace missing Twilio credentials for inbound SMS", {
      workspace: workspaceNumber.workspace,
      attributionPath: resolved.attributionPath,
    });
    return json({ error: "Workspace Twilio credentials missing" }, 500);
  }

  const media: string[] = [];
  const now = new Date();
  const nowIso = now.toISOString();
  for (let i = 0; i < numMedia; i++) {
    try {
      const mediaResponse = await fetch(data[`MediaUrl${i}`] as string, {
        headers: {
          Authorization: `Basic ${Buffer.from(`${inboundTwilioCreds.sid}:${inboundTwilioCreds.authToken}`).toString("base64")}`,
        },
      });

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
    ...(messagingServiceSid ? { messaging_service_sid: messagingServiceSid } : {}),
    ...(media.length > 0 ? { inbound_media: media } : {}),
    ...(matchedContactId != null ? { contact_id: matchedContactId } : {}),
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
    logger.error("Message insert error:", messageError);
    return json({ messageError }, 400);
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
      supabaseClient: supabase,
    });
  }

  return json({ message }, 201);
};
