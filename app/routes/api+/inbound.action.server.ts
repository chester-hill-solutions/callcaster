import {
  loadWorkspaceTwilioData,
  twilioWebhookBadRequest,
  twilioWebhookInternalError,
  twilioWebhookNotFound,
  validateWorkspaceTwilioWebhook,
} from "@/lib/twilio-webhook.server";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env.server";
import { isEmail, isPhoneNumber } from "@/lib/utils";
import { logger } from "@/lib/logger.server";
import { sendWebhookNotification } from "@/lib/workspace-settings/WorkspaceSettingUtils.server";
import {
  appendInboundVoicemailTwiml,
  resolveInboundVoicemailAudio,
} from "@/lib/inbound-voicemail-twiml.server";
import Twilio from "twilio";
import { inboundRingCountToDialTimeoutSeconds } from "../../../shared/inbound-rings";
import type {
  TwilioInboundCallWebhook,
  WebhookEvent,
} from "@/lib/twilio.types";
import type { ActionFunctionArgs } from "react-router";
import type { Database } from "@/lib/database.types";

interface WorkspaceNumberData {
  handset_enabled: boolean | null;
  inbound_action: string | null;
  inbound_audio: string | null;
  inbound_queue_id: number | null;
  inbound_ring_count: number | null;
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
  sendWebhookNotification: typeof sendWebhookNotification;
  logger: Pick<typeof logger, "warn">;
}) {
  void Promise.resolve(
    args.sendWebhookNotification({
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
    args.logger.warn("Failed to send inbound call webhook notification", {
      workspaceId: args.workspaceId,
      callSid: args.call.sid,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const twiml = new Twilio.twiml.VoiceResponse();
  const supabase = createClient<Database>(
    env.SUPABASE_URL(),
    env.SUPABASE_SERVICE_KEY(),
  );
  const formData = await request.formData();
  const data = Object.fromEntries(
    formData,
  ) as Partial<TwilioInboundCallWebhook>;

  if (!data.Called) {
    return twilioWebhookBadRequest("Missing Called parameter");
  }

  const { data: number, error: numberError } = (await supabase
    .from("workspace_number")
    .select(
      `
      handset_enabled,
      inbound_action,
      inbound_audio,
      inbound_queue_id,
      inbound_ring_count,
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
    return twilioWebhookNotFound();
  }
  if (numberError) {
    logger.error("Error on function getWorkspacePhoneNumbers", numberError);
    return twilioWebhookInternalError();
  }

  let twilioData = number.workspace?.twilio_data as
    | Record<string, unknown>
    | null
    | undefined;

  const workspaceIdFromNumber =
    number.workspace && typeof number.workspace === "object" && "id" in number.workspace
      ? (number.workspace as { id: string }).id
      : typeof number.workspace === "string"
        ? number.workspace
        : null;

  twilioData = (await loadWorkspaceTwilioData(
    supabase,
    workspaceIdFromNumber,
    twilioData,
    logger,
  )) as Record<string, unknown> | null | undefined;

  const params = data as Record<string, string>;
  const validation = validateWorkspaceTwilioWebhook({
    request,
    params,
    twilioData,
  });
  const authTokenSource = validation.ok ? "validated" : "missing";

  logger.info("api.inbound webhook received", {
    Called: data.Called,
    CallSid: data.CallSid,
    workspaceId: workspaceIdFromNumber,
    authTokenSource,
    hasSignature: Boolean(request.headers.get("x-twilio-signature")),
    requestUrl: new URL(request.url).href,
  });

  if (!validation.ok) {
    logger.warn("api.inbound Twilio signature validation failed", {
      Called: data.Called,
      CallSid: data.CallSid,
      workspaceId: workspaceIdFromNumber,
    });
    return validation.response;
  }

  const workspaceId = workspaceIdFromNumber ?? null;
  const dialTimeout = inboundRingCountToDialTimeoutSeconds(
    number?.inbound_ring_count ?? null,
  );
  const voicemail = workspaceId
    ? await resolveInboundVoicemailAudio({
        supabase,
        workspaceId,
        inboundAudio: number?.inbound_audio ?? null,
      })
    : null;

  // Insert call record
  if (!data.CallSid || typeof data.CallSid !== "string") {
    return twilioWebhookBadRequest("Missing CallSid");
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
    return twilioWebhookInternalError();
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
      sendWebhookNotification,
      logger,
    });
  }

  // Priority 1: Queue routing (if number is assigned to an inbound queue)
  if (number?.inbound_queue_id && workspaceId) {
    const supabaseUrl = env.SUPABASE_URL().replace(/\/$/, "");
    const acdUrl = `${supabaseUrl}/functions/v1/acd-router`;
    const queueName = `inbound_q_${number.inbound_queue_id}`;
    logger.info("api.inbound routing to queue", {
      workspaceId,
      CallSid: data.CallSid,
      queueId: number.inbound_queue_id,
    });
    const enqueue = twiml.enqueue({
      waitUrl: `${acdUrl}?queue_id=${number.inbound_queue_id}&CallSid=${data.CallSid}&From=${data.From || ""}`,
      action: `${acdUrl}/complete?entry_id=0&queue_name=${queueName}`,
    });
    enqueue.queue(queueName);
    return new Response(twiml.toString(), {
      headers: { "Content-Type": "text/xml" },
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
      const baseUrl = env.BASE_URL();
      const handsetTwiml = new Twilio.twiml.VoiceResponse();
      const dial = handsetTwiml.dial({
        timeout: dialTimeout,
        action: `${baseUrl}/api/inbound-handset-dial-end`,
      });
      dial.client(clientIdentity);
      return new Response(handsetTwiml.toString(), {
        headers: { "Content-Type": "text/xml" },
      });
    }
  }

  if (
    typeof number?.inbound_action === "string" &&
    isPhoneNumber(number.inbound_action)
  ) {
    logger.info("api.inbound routing to phone", {
      workspaceId,
      CallSid: data.CallSid,
      inbound_action: number.inbound_action,
    });
    twiml.pause({ length: 1 });
    const dial = twiml.dial({ timeout: dialTimeout });
    dial.number(number.inbound_action || "");
    return new Response(twiml.toString(), {
      headers: {
        "Content-Type": "text/xml",
      },
    });
  } else if (
    typeof number?.inbound_action === "string" &&
    isEmail(number.inbound_action)
  ) {
    logger.info("api.inbound routing to voicemail", {
      workspaceId,
      CallSid: data.CallSid,
      inbound_action: number.inbound_action,
    });
    appendInboundVoicemailTwiml({
      twiml,
      phoneNumber: data.Called,
      voicemailAudioUrl: voicemail?.signedUrl ?? null,
    });
    return new Response(twiml.toString(), {
      headers: {
        "Content-Type": "text/xml",
      },
    });
  } else {
    logger.info("api.inbound default fallback (say + hangup)", {
      workspaceId,
      CallSid: data.CallSid,
    });
    const phoneNumber = data.Called;
    twiml.say(
      `Thank you for calling ${phoneNumber}, we're unable to answer your call at the moment. Please try again later.`,
    );
    return new Response(twiml.toString(), {
      headers: {
        "Content-Type": "text/xml",
      },
    });
  }
};
