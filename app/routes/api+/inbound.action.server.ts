import { resolveIvrEntryPageId } from "@/lib/ivr-page-order";
import type { IvrScript } from "@/lib/ivr-block-runtime.server";
import {
  requireTwilioSignature,
  twilioWebhookBadRequest,
  twilioWebhookInternalError,
  twilioWebhookNotFound,
} from "@/lib/twilio-webhook.server";
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
import { findActiveHandsetSession, findActiveHandsetSessionClientIdentity } from "@/lib/handset/handset-session.server";
import { appendLiveTranscriptionStreamTwiml } from "@/lib/media-stream-twiml.server";
import { getWorkspaceById, getWorkspaceWebhookRow } from "@/lib/workspace-members-db.server";
import { createVoiceResponse, sayHangupTwiml } from "@/lib/twilio-twiml.server";
import { inboundRingCountToDialTimeoutSeconds } from "../../../shared/inbound-rings";
import { defineAction } from "@/lib/handler.server";
import { appendInboundQueueTwiml } from "@/lib/inbound-queue-twiml.server";
import type { TwilioInboundCallWebhook } from "@/lib/twilio.types";
import type { ActionFunctionArgs } from "react-router";

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
    }),
  ).catch((error: unknown) => {
    args.logger.warn("Failed to send inbound call webhook notification", {
      workspaceId: args.workspaceId,
      callSid: args.call.sid,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

/** Fallback TwiML returned when the handler throws unexpectedly, so Twilio
 * hears a graceful message instead of an HTML error page. */
function inboundUnavailableTwiml(): Response {
  return new Response(
    sayHangupTwiml("We're unable to take your call right now. Please try again later."),
    {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    },
  );
}

export const action = defineAction({
  auth: async ({ request }) => {
    try {
      const formData = await request.clone().formData();
      const data = Object.fromEntries(
        formData,
      ) as Partial<TwilioInboundCallWebhook>;

      if (!data.Called) {
        return twilioWebhookBadRequest("Missing Called parameter");
      }

      const forbidden = await requireTwilioSignature(request, { phoneNumber: data.Called });
      return forbidden ?? null;
    } catch (error) {
      logger.error("Unhandled error in api.inbound", {
        error: error instanceof Error ? error.message : String(error),
      });
      return inboundUnavailableTwiml();
    }
  },
  sideEffects: ["db-write", "twilio", "external"],
  handler: async ({ request, url }) => {
    try {
      return await handleInboundAction(request, url);
    } catch (error) {
      logger.error("Unhandled error in api.inbound", {
        error: error instanceof Error ? error.message : String(error),
      });
      return inboundUnavailableTwiml();
    }
  },
});

async function handleInboundAction(
  request: ActionFunctionArgs["request"],
  url: URL,
) {
  const twiml = createVoiceResponse();
  const formData = await request.clone().formData();
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

  logger.info("api.inbound webhook received", {
    Called: data.Called,
    CallSid: data.CallSid,
    workspaceId,
    authTokenSource: "validated",
    hasSignature: Boolean(request.headers.get("x-twilio-signature")),
    url: url.href,
  });

  const dialTimeout = inboundRingCountToDialTimeoutSeconds(
    number.inbound_ring_count ?? null,
  );
  const voicemail = await resolveInboundVoicemailAudio({
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
      start_time: new Date(),
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
        // Integrator-facing webhook payload: `timestamp` is a string on the wire and
        // this contract must not change shape, so the row's Date is rendered
        // back to ISO here rather than sent as a Date.
        start_time: call.start_time?.toISOString() ?? null,
      },
      sendWebhookNotification,
      logger,
    });
  }

  if (number.inbound_script_id) {
    const steps = await findInboundIvrScriptSteps({
      workspaceId,
      scriptId: number.inbound_script_id,
    });
    const script = steps as IvrScript | null | undefined;
    const pages = script?.pages;
    if (pages && script) {
      const firstPageId = resolveIvrEntryPageId(script);
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
    logger.info("api.inbound routing to queue", {
      workspaceId,
      CallSid: data.CallSid,
      queueId: number.inbound_queue_id,
    });
    await appendInboundQueueTwiml({
      twiml, workspaceId, queueId: number.inbound_queue_id,
      callSid: data.CallSid, callerNumber: data.From ?? "", baseUrl: env.BASE_URL(),
    });
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
      const handsetTwiml = createVoiceResponse();
      const session = await findActiveHandsetSession({ workspaceId, clientIdentity });
      const workspace = await getWorkspaceById(workspaceId);
      appendLiveTranscriptionStreamTwiml({
        twiml: handsetTwiml,
        featureFlags: workspace?.feature_flags as Record<string, unknown> | undefined,
        params: {
          workspaceId,
          userId: session?.user_id ?? "",
          direction: "inbound",
          callSid: data.CallSid,
          streamName: `inbound-${data.CallSid}`,
        },
      });
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
}
