import {
  buildCallUpsertFromTwilioParams,
  processCallStatusWebhook,
} from "@/lib/twilio-call-status.server";
import {
  isParticipantHangup,
  isParticipantJoin,
  parseTwilioVoiceCallback,
  userIdFromConferenceName,
  type ParticipantJoinEvent,
  type ParticipantLeaveEvent,
  type TwilioVoiceCallback,
} from "@/lib/twilio/voice-callback";
import { buildProviderStatusQueueUpdate } from "@/lib/queue-status";
import {
  dequeueQueueEntry,
  updateCampaignQueueByContactAndCampaign,
} from "@/lib/campaign-queue-db.server";
import { createWorkspaceTwilioInstance } from "@/lib/database/workspace.server";
import { data as routeData } from "react-router";
import { runAutoDialerTurn } from "@/lib/auto-dial.server";
import { logger } from "@/lib/logger.server";
import { OutreachAttempt } from "@/lib/types";
import { Tables } from "@/lib/db-types";
import type Twilio from "twilio";
import {
  claimTerminalCallStatus,
  findCallBySid,
  findCampaignTypeByCampaignId,
  findOutreachAttemptById,
  updateCallBySid,
  updateOutreachAttemptForWorkspace,
} from "@/lib/telephony-db.server";
import { requireTwilioSignature } from "@/lib/twilio-webhook.server";
import { defineAction } from "@/lib/handler.server";
import { emitPredictiveBroadcast } from "@/lib/workspace-events.server";

type TwilioClient = Twilio.Twilio;

const updateCall = async (sid: string, workspaceId: string, update: Partial<Tables<"call">>) => {
  try {
    const data = await updateCallBySid(workspaceId, sid, update);
    if (!data) {
      throw new Error(`Call ${sid} not found`);
    }
    return data;
  } catch (error) {
    logger.error("Error updating call:", error);
    throw error;
  }
};

const requireValue = (
  value: string | null | undefined,
  fieldName: string,
): string => {
  if (!value) {
    throw new Error(`Missing required field: ${fieldName}`);
  }
  return value;
};

type OutreachAttemptUpdateResult =
  | Pick<Tables<"outreach_attempt">, "disposition" | "contact_id">
  | Tables<"outreach_attempt">
  | Response;

function resolveOutreachUpdate(
  result: OutreachAttemptUpdateResult,
): Pick<Tables<"outreach_attempt">, "disposition" | "contact_id"> | Tables<"outreach_attempt"> | null {
  if (result instanceof Response) {
    return null;
  }
  return result;
}

export const updateOutreachAttempt = async (
  id: string,
  workspaceId: string,
  update: Partial<OutreachAttempt>,
) => {
  return updateOutreachAttemptForWorkspace(workspaceId, id, update);
};

const updateCampaignQueue = async (
  contactId: number,
  campaignId: number,
  update: Record<string, unknown>,
) => {
  try {
    return await updateCampaignQueueByContactAndCampaign({
      contactId,
      campaignId,
      update,
    });
  } catch (error) {
    logger.error("Error updating campaign queue:", error);
    throw error;
  }
};

/**
 * The user id stored inside a `call.conference_id`, which is a conference NAME
 * (`${userId}~${uuid}`), not a SID. Webhook payloads get this parsed for them
 * as `conferenceUserId`; this wrapper is for the DB-derived value.
 *
 * The `?? conferenceId` fallback is deliberate legacy tolerance: a stored
 * conference id with no `~` predates the `${userId}~${uuid}` naming and was
 * always passed through whole.
 */
function resolveUserIdFromConferenceName(conferenceId: string | null): string {
  if (!conferenceId) return "";
  return userIdFromConferenceName(conferenceId) ?? conferenceId;
}

const triggerAutoDialer = async (callData: Tables<"call">) => {
  try {
    const userId = resolveUserIdFromConferenceName(callData.conference_id);
    // Call the dialer turn in-process rather than self-fetching
    // `/api/auto-dial/dialer`: that path is matched by the Twilio webhook
    // prefix `/api/auto-dial`, so an unsigned self-fetch would be rejected
    // with 403 by requireTwilioSignature (always enforced in production).
    const result = await runAutoDialerTurn({
      user_id: userId,
      campaign_id: callData.campaign_id ?? 0,
      workspace_id: callData.workspace ?? "",
      conference_id: callData.conference_id,
    });
    if (!result.success) {
      throw new Error(result.error);
    }
  } catch (error) {
    logger.error("Error triggering auto dialer:", error);
    throw error;
  }
};

const handleCallStatus = async (
  event: TwilioVoiceCallback,
  dbCall: Tables<"call">,
  twilio: TwilioClient,
  status: Tables<"call">["status"],
) => {
  try {
    const updateData = buildCallUpsertFromTwilioParams(event.raw);
    if (status) {
      updateData.status = status;
    }

    const workspace = requireValue(dbCall.workspace, "workspace");
    const campaignType = dbCall.campaign_id
      ? await findCampaignTypeByCampaignId(dbCall.campaign_id, workspace)
      : null;

    const { call: callUpdate } = await processCallStatusWebhook(updateData, {
      campaignType,
      workspaceId: workspace,
      campaignId: dbCall.campaign_id ?? null,
      contactId: dbCall.contact_id ?? null,
      outreachAttemptId: dbCall.outreach_attempt_id ?? null,
    });

    if (!callUpdate.outreach_attempt_id) {
      throw new Error("Missing outreach_attempt_id for auto-dial status update");
    }
    const outreachStatus = await findOutreachAttemptById(
      workspace,
      callUpdate.outreach_attempt_id,
    );
    if (!outreachStatus) {
      return;
    }

    await dequeueQueueEntry({
      by: { contactId: outreachStatus.contact_id },
      workspaceId: workspace,
      household: true,
      // A conference name is `${userId}~${uuid}`, and this argument is bound
      // as ::uuid — passing the raw name raised 22P02 on every terminal call,
      // so the contact was never dequeued and the dialer stopped after one.
      userId: resolveUserIdFromConferenceName(callUpdate.conference_id) || null,
      reason: `Call ${status?.toLowerCase()}`,
    });
    const conferences = await twilio.conferences.list({
      friendlyName: callUpdate.conference_id ?? "",
      status: "in-progress",
    });
    if (conferences.length && status !== "completed") {
      await triggerAutoDialer(dbCall);
    }
  } catch (error) {
    logger.error("Error in handleCallStatus:", error);
    throw error;
  }
};

const handleParticipantLeave = async (
  event: ParticipantLeaveEvent,
  twilio: TwilioClient,
) => {
  try {
    const callSid = requireValue(event.callSid, "CallSid");
    const timestamp = requireValue(event.timestamp, "Timestamp");
    const existingCall = await findCallBySid(callSid);
    if (!existingCall?.workspace) {
      throw new Error("Call not found for participant leave");
    }
    const dbCall = await updateCall(callSid, existingCall.workspace, {
      end_time: new Date(timestamp).toISOString(),
      duration: String(event.durationSeconds ?? 0),
      status: event.callStatus.toLowerCase() as Tables<"call">["status"],
    });
    if (!dbCall.outreach_attempt_id) {
      throw new Error("Missing outreach_attempt_id for participant leave");
    }
    const outreachStatus = await findOutreachAttemptById(
      existingCall.workspace,
      dbCall.outreach_attempt_id,
    );
    if (!outreachStatus) {
      throw new Error("Outreach attempt not found for participant leave");
    }

    const conferences = await twilio.conferences.list({
      friendlyName: event.conferenceRef ?? "",
      status: "in-progress",
    });
    await Promise.all(
      conferences.map(({ sid }: { sid: string }) =>
        twilio.conferences(sid).update({ status: "completed" }),
      ),
    );
  } catch (error) {
    logger.error("Error in handleParticipantLeave:", error);
    throw error;
  }
};

const handleParticipantJoin = async (
  event: ParticipantJoinEvent,
  dbCall: Tables<"call">,
) => {
  try {
    const workspaceId = requireValue(dbCall.workspace, "workspace");
    if (!dbCall.conference_id) {
      await updateCall(requireValue(event.callSid, "CallSid"), workspaceId, {
        // `conferenceRef`, not `conferenceUserId`: `call.conference_id` holds
        // the conference NAME. Reading the user id back out of it is
        // `resolveUserIdFromConferenceName`'s job, at the point of use.
        conference_id: requireValue(event.conferenceRef, "ConferenceSid"),
        start_time: new Date(
          requireValue(event.timestamp, "Timestamp"),
        ).toISOString(),
      });
    }
    if (dbCall.outreach_attempt_id) {
      if (!dbCall.campaign_id) {
        throw new Error("Missing campaign_id for participant join");
      }
      // Replayed join callbacks must not restamp answered_at — it feeds
      // answer-time metrics, and each redelivery was overwriting it with
      // the replay's clock instead of the actual answer moment.
      const existingAttempt = await findOutreachAttemptById(
        workspaceId,
        dbCall.outreach_attempt_id,
      );
      if (existingAttempt && (existingAttempt as { answered_at?: string | null }).answered_at) {
        return;
      }
      const outreachStatus = resolveOutreachUpdate(
        await updateOutreachAttempt(
          `${dbCall.outreach_attempt_id}`,
          workspaceId,
          { answered_at: new Date().toISOString() },
        ),
      );
      if (!outreachStatus) {
        return;
      }
      await updateCampaignQueue(outreachStatus.contact_id, dbCall.campaign_id, {
        ...buildProviderStatusQueueUpdate(event.conferenceRef ?? "in-progress"),
      });
    }
  } catch (error) {
    logger.error("Error in handleParticipantJoin:", error);
    throw error;
  }
};

export const action = defineAction({
  auth: async ({ request }) => {
    // Clone before reading — Bun yields empty params on re-read after consume.
    const formData = await request.clone().formData();
    const params = Object.fromEntries(formData.entries()) as Record<string, string>;
    // Parse the payload ONCE, here, into a discriminated union. Everything
    // downstream takes a typed event instead of re-narrowing the same form
    // fields with `typeof x === "string"` — see @/lib/twilio/voice-callback.
    const event = parseTwilioVoiceCallback(params);

    const callSidValue = event.callSid;
    if (!callSidValue) {
      throw new Error("Missing CallSid");
    }

    const forbidden = await requireTwilioSignature(request, {
      callSid: callSidValue,
      params,
    });
    if (forbidden) return forbidden;

    return { event, callSidValue };
  },
  sideEffects: ["db-write", "credit", "twilio"],
  handler: async ({ auth }) => {
    const { event, callSidValue } = auth;
    try {
    const dbCall = await findCallBySid(callSidValue);
    if (!dbCall?.workspace) {
      // Unattributable callback (unknown CallSid, or a call row that never
      // got a workspace). Throwing here yields a 500, and Twilio retries 5xx
      // — forever, for a call that will never exist. Ack instead.
      logger.warn("auto-dial status: no call row for CallSid; acking to stop retries", {
        callSid: callSidValue,
      });
      return routeData({ success: true, resolved: false });
    }

    const twilio = await createWorkspaceTwilioInstance({ workspace_id: requireValue(dbCall.workspace, "workspace"),
    });
    // `""` when Twilio sent no CallStatus, on every union member — conference
    // participant callbacks carry one too, and this switch runs before the
    // event kind is ever consulted.
    const callStatusValue = event.callStatus;

    // Predictive contact calls send their status callbacks HERE, not to
    // /api/call-status — so this route is the only place that can push
    // dialer-room state (predictive_broadcast) to waiting agents. Emit for
    // contact legs on every status update, before the heavier handling below,
    // so agents see dialing/connected/outcome even if that handling errors.
    // Best-effort by design: emitPredictiveBroadcast never throws.
    if (dbCall.contact_id && callStatusValue) {
      await emitPredictiveBroadcast(requireValue(dbCall.workspace, "workspace"), {
        contact_id: dbCall.contact_id,
        status: callStatusValue.toLowerCase(),
      });
    }
    switch (callStatusValue) {
      case "failed":
      case "busy":
      case "no-answer":
      case "completed":
        // Replay guard, done atomically: claim the terminal-status transition
        // with a compare-and-set UPDATE. Only the delivery that actually moves
        // the row to this status proceeds; a Twilio retry or a CONCURRENT
        // duplicate of the SAME terminal status loses the claim and acks. The
        // old check-then-act (compare a pre-read snapshot) let two overlapping
        // deliveries both pass and each re-dequeue + place a NEW outbound call.
        {
          const claimed = await claimTerminalCallStatus(
            requireValue(dbCall.workspace, "workspace"),
            callSidValue,
            callStatusValue,
          );
          if (!claimed) {
            logger.info("auto-dial status: terminal status already applied; acking replay", {
              callSid: callSidValue,
              status: callStatusValue,
            });
            return routeData({ success: true, replay: true });
          }
        }
        await handleCallStatus(
          event,
          dbCall,
          twilio,
          callStatusValue?.toLowerCase() as Tables<"call">["status"],
        );
        break;
      default:
        if (isParticipantHangup(event)) {
          await handleParticipantLeave(event, twilio);
        } else if (isParticipantJoin(event)) {
          await handleParticipantJoin(event, dbCall);
        }
    }

    return routeData({ success: true });
  } catch (error: unknown) {
    logger.error("Error processing action:", error);
    return routeData(
      { error: "Failed to process action: " + (error instanceof Error ? error.message : "Unknown error") },
      { status: 500 },
    );
  }
  },
});
