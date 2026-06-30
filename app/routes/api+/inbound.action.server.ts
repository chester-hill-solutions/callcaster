import {
  resolveWorkspaceTwilioData,
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
import {
  findInboundIvrScriptSteps,
  findWorkspaceNumberByPhoneNumber,
  upsertInboundCallRecord,
  workspaceWebhookHasInboundCallInsert,
} from "@/lib/inbound-call-db.server";
import { findActiveHandsetSessionClientIdentity } from "@/lib/handset/handset-session.server";
import { getWorkspaceWebhookRow } from "@/lib/workspace-members-db.server";
import Twilio from "twilio";
import { inboundRingCountToDialTimeoutSeconds } from "../../../shared/inbound-rings";
import type { TwilioInboundCallWebhook } from "@/lib/twilio.types";
import type { ActionFunctionArgs } from "react-router";
import type { Database } from "@/lib/database.types";

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

  const number = await findWorkspaceNumberByPhoneNumber(data.Called);
  if (!number) {
    return twilioWebhookNotFound();
  }

  const workspaceId = number.workspaceId;

  const twilioData = (await resolveWorkspaceTwilioData(
    supabase,
    workspaceId,
    null,
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
    workspaceId,
    authTokenSource,
    hasSignature: Boolean(request.headers.get("x-twilio-signature")),
    requestUrl: new URL(request.url).href,
  });

  if (!validation.ok) {
    logger.warn("api.inbound Twilio signature validation failed", {
      Called: data.Called,
      CallSid: data.CallSid,
      workspaceId,
    });
    return validation.response;
  }

  const dialTimeout = inboundRingCountToDialTimeoutSeconds(
    number.inbound_ring_count ?? null,
  );
  const voicemail = await resolveInboundVoicemailAudio({
    supabase,
    workspaceId,
    inboundAudio: number.inbound_audio ?? null,
  });

  if (!data.CallSid || typeof data.CallSid !== "string") {
    return twilioWebhookBadRequest("Missing CallSid");
  }

  const call = await upsertInboundCallRecord({
    workspaceId,
    sid: data.CallSid,
    values: {
      account_sid: data.AccountSid || null,
      to: data.To || null,
      from: data.From || null,
      status: "completed",
      start_time: new Date().toISOString(),
      direction: data.Direction || null,
      api_version: data.ApiVersion || null,
      workspace: workspaceId,
      duration: String(
        Math.max(Number(data.Duration || 0), Number(data.CallDuration || 0)),
      ),
    },
  });

  if (!call) {
    logger.error("Error on function insert call", { sid: data.CallSid, workspaceId });
    return twilioWebhookInternalError();
  }

  const webhookRow = await getWorkspaceWebhookRow(workspaceId);
  if (workspaceWebhookHasInboundCallInsert(webhookRow)) {
    dispatchInboundCallWebhookNotification({
      workspaceId,
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

  if (number.inbound_script_id) {
    const steps = await findInboundIvrScriptSteps({
      workspaceId,
      scriptId: number.inbound_script_id,
    });
    const pages = steps?.pages as Record<string, { blocks: string[] }> | undefined;
    if (pages) {
      const pageIds = Object.keys(pages);
      const firstPageId = pageIds[0];
      const firstPage = firstPageId ? pages[firstPageId] : undefined;
      const firstBlockId = firstPage?.blocks[0];
      if (firstPageId && firstBlockId) {
        logger.info("api.inbound routing to IVR script", {
          workspaceId,
          CallSid: data.CallSid,
          scriptId: number.inbound_script_id,
        });
        twiml.redirect(
          `/api/inbound-ivr/${number.id}/${firstPageId}/${firstBlockId}`,
        );
        return new Response(twiml.toString(), {
          headers: { "Content-Type": "text/xml" },
        });
      }
    }
    logger.warn("api.inbound IVR script found but has no valid pages/blocks, falling through", {
      workspaceId,
      scriptId: number.inbound_script_id,
    });
  }

  if (number.inbound_queue_id) {
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

  if (number.handset_enabled) {
    const clientIdentity = await findActiveHandsetSessionClientIdentity(workspaceId);
    if (!clientIdentity) {
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

  if (typeof number.inbound_action === "string" && isPhoneNumber(number.inbound_action)) {
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
  }

  if (typeof number.inbound_action === "string" && isEmail(number.inbound_action)) {
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
  }

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
};
