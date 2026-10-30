import type { Tables } from "@/lib/db-types";
import type { ParticipantJoinEvent } from "@/lib/twilio/voice-callback";
import { findOutreachAttemptById, updateCallBySid, updateOutreachAttemptForWorkspace } from "@/lib/telephony-db.server";
import { updateCampaignQueueByContactAndCampaign } from "@/lib/campaign-queue-updates.server";
import { buildProviderStatusQueueUpdate } from "@/lib/queue-status";
import { logger } from "@/lib/logger.server";

/** Both legacy and first-phone callbacks use the same predictive join effects. */
export async function handlePredictiveParticipantJoin(event: ParticipantJoinEvent, call: Tables<"call">) {
  try {
    if (!call.workspace) throw new Error("Missing required field: workspace");
    if (!call.conference_id) {
      if (!event.callSid || !event.conferenceRef || !event.timestamp) throw new Error("Missing predictive participant identity");
      const saved = await updateCallBySid(call.workspace, event.callSid, {
        conference_id: event.conferenceRef, start_time: new Date(event.timestamp),
      });
      if (!saved) throw new Error(`Call ${event.callSid} not found`);
    }
    if (!call.outreach_attempt_id) return;
    if (!call.campaign_id) throw new Error("Missing campaign_id for participant join");
    const existing = await findOutreachAttemptById(call.workspace, call.outreach_attempt_id);
    if (existing?.answered_at) return;
    const attempt = await updateOutreachAttemptForWorkspace(call.workspace, String(call.outreach_attempt_id), {
      answered_at: new Date().toISOString(),
    });
    if (attempt instanceof Response) return;
    await updateCampaignQueueByContactAndCampaign({ contactId: attempt.contact_id, campaignId: call.campaign_id,
      update: { ...buildProviderStatusQueueUpdate("in-progress") } });
  } catch (error) {
    logger.error("Error in handleParticipantJoin:", error);
    throw error;
  }
}
