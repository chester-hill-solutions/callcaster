import { LoaderFunctionArgs } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import Twilio from "twilio";
import { isEmail, isPhoneNumber } from "@/lib/utils";
import { sendWebhookNotification } from "@/lib/workspace-settings/WorkspaceSettingUtils";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import type {
  TwilioInboundCallWebhook,
  WebhookEvent,
} from "@/lib/twilio.types";
import type { Database } from "@/lib/database.types";
import { validateTwilioWebhookParams } from "@/twilio.server";
import { extendHandsetSessionExpiry } from "@/lib/handset.server";
import { buildInboundFallbackTwiml } from "@/lib/inbound-handler.server";

interface WorkspaceNumberData {
  handset_enabled: boolean | null;
  inbound_action: string | null;
  inbound_audio: string | null;
  type: string | null;
  workspace: {
    id: string;
    twilio_data: {
      account_sid: string;
      auth_token: string;
    } | null;
    webhook: Array<{
      events: WebhookEvent[];
    }>;
  } | null;
}

function dispatchInboundCallWebhookNotification(args: {
  workspaceId: string;
  call: {
    sid: string;
    from: string | null;
    to: string | null;
    status: string | null;
    direction: string | null;
    start_time: string | null;
  };
  supabaseClient: ReturnType<typeof createClient<Database>>;
}) {
  void Promise.resolve(
    sendWebhookNotification({
      eventCategory: "inbound_call",
      eventType: "INSERT",
      workspaceId: args.workspaceId,
      payload: {
        call_sid: args.call.sid,
        from: args.call.from,
        to: args.call.to,
        status: args.call.status,
        direction: args.call.direction,
        timestamp: args.call.start_time,
      },
      supabaseClient: args.supabaseClient,
    }),
  ).catch((error: unknown) => {
    logger.warn("Failed to send inbound call webhook notification", {
      workspaceId: args.workspaceId,
      callSid: args.call.sid,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

export const action = async ({ request }: LoaderFunctionArgs) => {
  const supabase = createClient<Database>(
    env.SUPABASE_URL(),
    env.SUPABASE_SERVICE_KEY(),
  );
  const formData = await request.formData();
  const data = Object.fromEntries(
    formData,
  ) as Partial<TwilioInboundCallWebhook>;

  if (!data.Called) {
    throw { status: 400, statusText: "Missing Called parameter" };
  }

  const { data: number, error: numberError } = (await supabase
    .from("workspace_number")
    .select(
      `
      handset_enabled,
      inbound_action,
      inbound_audio,
      type,
      workspace,
      ...workspace!inner(id, twilio_data, webhook(*))`,
    )
    .eq("phone_number", data.Called)
    .single()) as {
    data: WorkspaceNumberData | null;
    error: Error | null;
  };
  if (!number) {
    throw { status: 404, statusText: "Not Found" };
  }
  if (numberError) {
    logger.error("Error on function getWorkspacePhoneNumbers", numberError);
    throw { status: 500, statusText: "Internal Server Error" };
  }

  let twilioData = number.workspace?.twilio_data as
    | Record<string, unknown>
    | null
    | undefined;

  // Fallback: when join returns workspace as UUID string, twilio_data is missing; fetch from workspace table
  const workspaceIdFromNumber =
    number.workspace && typeof number.workspace === "object" && "id" in number.workspace
      ? (number.workspace as { id: string }).id
      : typeof number.workspace === "string"
        ? number.workspace
        : null;
  if (
    workspaceIdFromNumber &&
    (!twilioData ||
      (typeof twilioData?.authToken !== "string" && typeof twilioData?.auth_token !== "string"))
  ) {
    const { data: workspaceRow } = await supabase
      .from("workspace")
      .select("twilio_data")
      .eq("id", workspaceIdFromNumber)
      .single();
    const fetched = (workspaceRow?.twilio_data ?? null) as Record<string, unknown> | null;
    if (fetched && (typeof fetched.authToken === "string" || typeof fetched.auth_token === "string")) {
      twilioData = fetched;
      logger.info("api.inbound fetched workspace twilio_data (join did not include it)", {
        workspaceId: workspaceIdFromNumber,
      });
    }
  }

  const authTokenSource =
    typeof twilioData?.authToken === "string"
      ? "workspace.twilio_data.authToken"
      : typeof twilioData?.auth_token === "string"
        ? "workspace.twilio_data.auth_token"
        : "env.TWILIO_AUTH_TOKEN";
  if (authTokenSource === "env.TWILIO_AUTH_TOKEN" && twilioData) {
    logger.debug("api.inbound using env fallback; twilio_data keys", {
      twilioDataKeys: Object.keys(twilioData),
      hasAuthToken: "authToken" in twilioData,
      hasAuth_token: "auth_token" in twilioData,
    });
  }
  const authToken =
    typeof twilioData?.authToken === "string"
      ? twilioData.authToken
      : typeof twilioData?.auth_token === "string"
        ? twilioData.auth_token
        : env.TWILIO_AUTH_TOKEN(); // fallback for local dev when workspace twilio_data missing
  const signature = request.headers.get("x-twilio-signature");
  const requestUrl = new URL(request.url).href;

  logger.info("api.inbound webhook received", {
    Called: data.Called,
    CallSid: data.CallSid,
    workspaceId: workspaceIdFromNumber,
    authTokenSource,
    hasSignature: Boolean(signature),
    requestUrl,
  });

  if (
    !validateTwilioWebhookParams(
      data as Record<string, string>,
      signature,
      requestUrl,
      authToken,
    )
  ) {
    logger.warn("api.inbound Twilio signature validation failed", {
      Called: data.Called,
      CallSid: data.CallSid,
      workspaceId: workspaceIdFromNumber,
      authTokenSource,
      hasSignature: Boolean(signature),
      requestUrl,
    });
    throw { status: 403, statusText: "Invalid Twilio signature" };
  }

  const workspaceId = workspaceIdFromNumber ?? null;

  let voicemail: { signedUrl: string } | null = null;
  if (number?.inbound_audio && workspaceId) {
    // Prefer treating inbound_audio as storage path; fallback to constrained lookup by search.
    const { data: signedByPath } = await supabase.storage
      .from("workspaceAudio")
      .createSignedUrl(`${workspaceId}/${number.inbound_audio}`, 3600);
    if (signedByPath?.signedUrl) {
      voicemail = { signedUrl: signedByPath.signedUrl };
    } else {
      const { data: files } = await supabase.storage
        .from("workspaceAudio")
        .list(workspaceId, {
          search: number.inbound_audio,
          limit: 20,
          offset: 0,
        });
      const file = files?.find(
        (f) =>
          String(f.id) === String(number.inbound_audio) ||
          f.name === number.inbound_audio,
      );
      if (file) {
        const { data: signed } = await supabase.storage
          .from("workspaceAudio")
          .createSignedUrl(`${workspaceId}/${file.name}`, 3600);
        if (signed?.signedUrl) voicemail = { signedUrl: signed.signedUrl };
      }
    }
  }

  // Insert call record
  if (!data.CallSid || typeof data.CallSid !== "string") {
    throw { status: 400, statusText: "Missing CallSid" };
  }

  const { data: call, error: callError } = await supabase
    .from("call")
    .upsert({
      sid: data.CallSid,
      account_sid: data.AccountSid || null,
      to: data.To || null,
      from: data.From || null,
      status: "completed" as const,
      start_time: new Date().toISOString(),
      direction: data.Direction || null,
      api_version: data.ApiVersion || null,
      workspace: number.workspace?.id || null,
      duration: String(
        Math.max(Number(data.Duration || 0), Number(data.CallDuration || 0)),
      ),
    } as Database["public"]["Tables"]["call"]["Insert"])
    .select()
    .single();

  if (callError) {
    logger.error("Error on function insert call", callError);
    throw { status: 500, statusText: "Internal Server Error" };
  }

  // Send webhook notification for inbound call
  const callWebhook =
    number.workspace?.webhook?.flatMap((webhook) =>
      webhook.events.filter((event) => event.category === "inbound_call"),
    ) || [];
  if (callWebhook.length > 0) {
    dispatchInboundCallWebhookNotification({
      workspaceId: number.workspace?.id || "",
      call: {
        sid: call.sid,
        from: call.from,
        to: call.to,
        status: call.status,
        direction: call.direction,
        start_time: call.start_time,
      },
      supabaseClient: supabase,
    });
  }

  if (number?.handset_enabled && workspaceId) {
    const now = new Date().toISOString();
    const { data: session, error: sessionError } = await (
      supabase as import("@supabase/supabase-js").SupabaseClient<
        Record<string, unknown>
      >
    )
      .from("handset_session")
      .select("client_identity")
      .eq("workspace_id", workspaceId)
      .eq("status", "active")
      .gt("expires_at", now)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sessionError) {
      logger.warn("Handset session lookup failed", {
        workspaceId,
        error: sessionError.message,
      });
    }
    const clientIdentity =
      session && typeof session === "object" && "client_identity" in session
        ? (session as { client_identity: string }).client_identity
        : null;
    if (!clientIdentity && number.handset_enabled) {
      logger.debug("Handset enabled but no active session", {
        workspaceId,
        Called: data.Called,
      });
    }
    if (clientIdentity) {
      logger.info("api.inbound routing to handset", {
        workspaceId,
        CallSid: data.CallSid,
        clientIdentity,
      });
      await supabase
        .from("handset_session")
        .update({ expires_at: extendHandsetSessionExpiry() })
        .eq("workspace_id", workspaceId)
        .eq("client_identity", clientIdentity)
        .eq("status", "active");
      const baseUrl = env.BASE_URL();
      const handsetTwiml = new Twilio.twiml.VoiceResponse();
      const dial = handsetTwiml.dial({
        timeout: 18, // ~3 rings (6s per ring cycle)
        action: `${baseUrl}/api/inbound-handset-dial-end`,
      });
      dial.client(clientIdentity);
      return new Response(handsetTwiml.toString(), {
        headers: { "Content-Type": "text/xml" },
      });
    }
  }

  const inboundAction = number?.inbound_action;
  const isPhone = typeof inboundAction === "string" && isPhoneNumber(inboundAction);
  const isVoicemail = typeof inboundAction === "string" && isEmail(inboundAction);
  logger.info("api.inbound routing to fallback", {
    workspaceId,
    CallSid: data.CallSid,
    inbound_action: inboundAction,
    fallbackType: isPhone ? "phone" : isVoicemail ? "voicemail" : "default",
  });
  const fallbackTwiml = buildInboundFallbackTwiml({
    number: {
      handset_enabled: number?.handset_enabled ?? null,
      inbound_action: number?.inbound_action ?? null,
      inbound_audio: number?.inbound_audio ?? null,
    },
    voicemail,
    called: data.Called ?? "",
  });
  return new Response(fallbackTwiml, {
    headers: { "Content-Type": "text/xml" },
  });
};
