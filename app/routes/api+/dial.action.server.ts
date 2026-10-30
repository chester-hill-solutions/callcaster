import { data as routeData } from "react-router";
import { createWorkspaceTwilioInstance, requireWorkspaceAccess } from "@/lib/database/workspace.server";
import { parseActionRequest } from "@/lib/request-utils.server";
import { AppError, ErrorCode } from "@/lib/errors.server";
import { rpcClaimQueueEntryForDial, rpcCreateOutreachAttempt } from "@/lib/db-rpc.server";
import { createTenantDb } from "@/server/tenant-db";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import { createVoiceResponse } from "@/lib/twilio-twiml.server";
import { requireJsonAuth } from "@/lib/api-auth.server";
import { defineAction } from "@/lib/handler.server";
import { recipientCallingWindowStatus } from "@/lib/recipient-calling-window";
import { apiWriteRateLimitResponse } from "@/lib/api-write-rate-limit.server";
import { manualDialIdentity, parseManualDialRequest, validateManualDialRequest } from "@/lib/manual-dial-request.server";
import { dispatchManualVoiceCall } from "@/lib/manual-voice-dispatch.server";
import { dispatchPhoneCustomerVoiceCall } from "@/lib/phone-customer-dispatch.server";
import { verifyVoiceAudioCustomerSource } from "@/lib/voice-audio-customer-source.server";
import { voiceDispatchBlockedResponse, VoiceDispatchUncertainError } from "@/lib/voice-credit-dispatch.server";

import { replayVoiceOperation, type VoiceReservationInput } from "@/server/voice-credit-reservation.server";
import type { VoiceBridgeUrls } from "@/server/voice-bridge-reservation.server";

const CLAIM_MESSAGES = {
  claimed_by_other: "This contact is being dialed by another agent.",
  active_call: "This contact already has a call in progress.",
  not_queued: "This contact is no longer queued.",
  unavailable: "This contact is not available to dial.",
};

export const action = defineAction({
  auth: ({ request }) => requireJsonAuth(request),
  sideEffects: ["db-write", "twilio"],
  handler: async ({ request, auth }) => {
    const rateLimited = await apiWriteRateLimitResponse(auth, "api-voice");
    if (rateLimited) return rateLimited;
    const input = parseManualDialRequest(await parseActionRequest(request));
    await requireWorkspaceAccess({ user: auth.user, workspaceId: input.workspace_id });
    const identity = manualDialIdentity(input, auth.user.id);
    if (input.dial_intent_id) {
      const replay = await replayVoiceOperation({ workspaceId: input.workspace_id, to: identity.to, from: identity.from,
        campaignId: input.campaign_id, contactId: input.contact_id, queueId: input.queue_id, userId: auth.user.id,
        setupTo: identity.setupTo, audioSource: identity.audioSource, outreachAttemptId: input.outreach_id,
        operationKey: `manual:${auth.user.id}:${input.dial_intent_id}` });
      if (replay?.reason === "already_dispatched") return identity.audioSource ? Response.json({ success: true, callSid: replay.callSid })
        : new Response(createVoiceResponse().toString(), { headers: { "Content-Type": "text/xml" } });
      if (replay) return voiceDispatchBlockedResponse(replay);
    }
    const dial = await validateManualDialRequest(input, auth.user.id);
    const windowStatus = recipientCallingWindowStatus(dial.to);
    if (!windowStatus.allowed) {
      logger.warn("dial.recipient_window_closed", { campaignId: dial.campaign_id, contactId: dial.contact_id,
        queueId: dial.queue_id, workspaceId: dial.workspace_id, userId: auth.user.id,
        timezone: windowStatus.timezone, reason: windowStatus.reason });
      return routeData({ error: "Outside recipient's local calling window (8:00 a.m.–9:00 p.m.). Try again during their local daytime.",
        reason: "recipient_window_closed", timezone: windowStatus.timezone }, { status: 409 });
    }
    const twilio = await createWorkspaceTwilioInstance({ workspace_id: dial.workspace_id });
    const twiml = createVoiceResponse();
    try {
      const common: VoiceReservationInput & VoiceBridgeUrls = {
        workspaceId: dial.workspace_id, kind: "staffed", accountSid: twilio.accountSid,
        to: dial.to, from: dial.from, campaignId: dial.campaign_id,
        contactId: dial.contact_id, queueId: dial.queue_id, outreachAttemptId: dial.outreach_id, userId: auth.user.id,
        operationKey: `manual:${auth.user.id}:${dial.intentId}`, expectedQueueGeneration: dial.expected_queue_generation,
        voiceUrl: `${env.BASE_URL()}/api/dial/${encodeURIComponent(dial.to)}`,
        statusCallback: `${env.BASE_URL()}/api/call-status/`, recipientStatusCallback: `${env.BASE_URL()}/api/call-status/`,
        prepareOutreach: async (tx) => {
          const tdb = createTenantDb(dial.workspace_id, tx);
          const claim = await rpcClaimQueueEntryForDial(tdb, { queueId: dial.queue_id, campaignId: dial.campaign_id,
            workspaceId: dial.workspace_id, userId: auth.user.id });
          if (claim !== "claimed") {
            logger.warn("Dial claim refused", { claim, queueId: dial.queue_id, campaignId: dial.campaign_id,
              contactId: dial.contact_id, workspaceId: dial.workspace_id, userId: auth.user.id });
            throw new AppError(CLAIM_MESSAGES[claim], 409, ErrorCode.CONFLICT);
          }
          return dial.outreach_id ?? rpcCreateOutreachAttempt(tdb, { queueId: dial.queue_id, contactId: dial.contact_id,
            campaignId: dial.campaign_id, workspaceId: dial.workspace_id, userId: auth.user.id });
        },
      };
      if (dial.audioSource) {
        const source = await verifyVoiceAudioCustomerSource({ workspaceId: dial.workspace_id, userId: auth.user.id,
          campaignId: dial.campaign_id, connectionId: dial.audioSource.connectionId, generation: dial.audioSource.generation,
          phoneNumber: dial.audioSource.destination });
        if (!source.ok) return voiceDispatchBlockedResponse({ ok: false, reason: "audio_source_unavailable" });
        const voice = new URL(common.voiceUrl); voice.searchParams.set("credit_leg", "recipient");
        const result = await dispatchPhoneCustomerVoiceCall({ ...common, voiceUrl: voice.href,
          audioSource: { ...dial.audioSource, proof: source.proof }, client: twilio });
        return result.ok ? Response.json({ success: true, callSid: result.callSid }) : voiceDispatchBlockedResponse(result);
      }
      const setupTo = dial.setupTo;
      if (!setupTo) throw new AppError("Selected device is invalid", 400, ErrorCode.VALIDATION_ERROR);
      const result = await dispatchManualVoiceCall({ ...common, setupTo,
        create: ({ voiceUrl, statusCallback }) => twilio.calls.create({ to: setupTo, from: dial.from,
          url: voiceUrl, statusCallback, statusCallbackEvent: ["initiated", "ringing", "answered", "completed"] }),
      });
      if (!result.ok) return voiceDispatchBlockedResponse(result);
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error("Error placing call:", error);
      if (error instanceof VoiceDispatchUncertainError) {
        return routeData({ error: "The call is awaiting provider verification. Wait for recovery before dialing again.",
          reason: "voice_dispatch_pending" }, { status: 409 });
      }
      return routeData({ error: "There was an error placing your call. Please try again later." }, { status: 502 });
    }
    return new Response(twiml.toString(), { headers: { "Content-Type": "text/xml" } });
  },
});
