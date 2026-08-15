import { data as routeData } from "react-router";
import { createOutreachAttempt , saveCallToDatabase } from "@/lib/auto-dial.server";
import {
  createWorkspaceTwilioInstance,
  requireWorkspaceAccess,
} from "@/lib/database/workspace.server";
import { parseActionRequest } from "@/lib/request-utils.server";
import { rpcClaimQueueEntryForDial } from "@/lib/db-rpc.server";
import {
  outboundCreditsResponse,
  requireOutboundCredits,
} from "@/lib/outbound-credit-gate.server";
import { createTenantDb } from "@/server/tenant-db";
import { and, eq } from "drizzle-orm";
import { workspace_number as workspaceNumberTable } from "@/db/schema";
import { env } from "@/lib/env.server";
import { getWorkspaceMessagingOnboardingState } from "@/lib/messaging-onboarding.server";
import { logger } from "@/lib/logger.server";
import { withTwilioRetry } from "@/lib/twilio-client.server";
import { normalizePhoneNumber } from "@/lib/utils";
import { createVoiceResponse } from "@/lib/twilio-twiml.server";
import { requireJsonAuth } from "@/lib/api-auth.server";
import { defineAction } from "@/lib/handler.server";
import { getUserVerifiedAudioNumbers } from "@/lib/user-audio.server";

interface DialRequest {
  to_number: string;
  user_id: string;
  campaign_id: string;
  contact_id: string;
  workspace_id: string;
  queue_id: string;
  outreach_id?: string;
  caller_id: string;
  selected_device?: string;
}

export const action = defineAction({
  auth: ({ request }) => requireJsonAuth(request),
  sideEffects: ["db-write", "twilio"],
  handler: async ({ request, auth }) => {
    const user = auth.user;
    const raw = await parseActionRequest(request) as Partial<DialRequest>;
    const {
        to_number,
        user_id,
        campaign_id,
        contact_id,
        workspace_id,
        queue_id,
        outreach_id,
        caller_id,
        selected_device,
    } = raw;
    if (
        typeof to_number !== "string" ||
        typeof user_id !== "string" ||
        typeof campaign_id !== "string" ||
        typeof contact_id !== "string" ||
        typeof workspace_id !== "string" ||
        typeof queue_id !== "string" ||
        typeof caller_id !== "string" ||
        (selected_device !== undefined && typeof selected_device !== "string")
    ) {
        throw new Response("Invalid dial payload", { status: 400 });
    }
    await requireWorkspaceAccess({ user, workspaceId: workspace_id });
    if (selected_device && selected_device !== "computer") {
        const verifiedNumbers = await getUserVerifiedAudioNumbers(user.id);
        if (!verifiedNumbers?.includes(selected_device)) {
            throw new Response("Selected device is not a verified phone number", { status: 400 });
        }
    }

    const credits = await requireOutboundCredits(workspace_id);
    if (!credits.ok) return outboundCreditsResponse(credits);
    // NOTE: this credit gate is check-then-act — N concurrent dials can all
    // read the same pre-debit balance (the debit lands at call completion).
    // Overdraw is bounded by concurrency × per-call cost; an atomic pre-dial
    // hold via apply_ledger_entry_and_sync_credits is the follow-up if that
    // bound ever matters.
    const tdb = createTenantDb(workspace_id);

    // Atomically claim the queue row before placing a real call. This is the
    // server-side guard the client's callState check cannot provide: without
    // it a double-click, a second tab, or two agents holding the same
    // unclaimed row each dialed a real person. Refusals are 409s the call
    // screen surfaces as a failed dial rather than a stuck "Dialing…".
    const claim = await rpcClaimQueueEntryForDial(tdb, {
        queueId: Number(queue_id),
        campaignId: Number(campaign_id),
        workspaceId: workspace_id,
        userId: user.id,
    });
    if (claim !== "claimed") {
        const messages: Record<string, string> = {
            claimed_by_other: "This contact is being dialed by another agent.",
            active_call: "This contact already has a call in progress.",
            not_queued: "This contact is no longer queued.",
            unavailable: "This contact is not available to dial.",
        };
        return routeData(
            { error: messages[claim] ?? messages.unavailable, claim },
            { status: 409 },
        );
    }
    const [callerIdRecord, onboarding] = await Promise.all([
        tdb.workspace_number.findFirst({
            where: eq(workspaceNumberTable.phone_number, caller_id),
        }),
        getWorkspaceMessagingOnboardingState({
            workspaceId: workspace_id,
        }),
    ]);
    if (onboarding.selectedChannels?.includes("voice_compliance") && onboarding.emergencyVoice.enabled) {
        if (!callerIdRecord) {
            throw new Response("Caller ID must be a workspace number for emergency-compliant voice.", { status: 400 });
        }
        if (!onboarding.emergencyVoice.allowedCallerIdTypes.includes(callerIdRecord.type ?? "")) {
            throw new Response("Selected caller ID is not eligible for emergency-compliant voice.", { status: 400 });
        }
        if (
            callerIdRecord.phone_number &&
            !onboarding.emergencyVoice.emergencyEligiblePhoneNumbers.includes(callerIdRecord.phone_number)
        ) {
            throw new Response("Selected caller ID is not marked as emergency-ready.", { status: 400 });
        }
    }
    const to = normalizePhoneNumber(to_number)
    const twilio = await createWorkspaceTwilioInstance({ workspace_id });
    const twiml = createVoiceResponse();
    // Track the placed SID outside the try: if the call is created but we then
    // fail to persist its row, the active_call redial guard can't see it and a
    // retry would double-dial the same contact. Hang it up in that case — a
    // killed call the agent retries is far safer than a duplicate live call to a
    // real person plus a duplicate completion charge.
    let placedCallSid: string | null = null;
    const hangUpUntrackedCall = async (reason: string) => {
        if (!placedCallSid) return;
        try {
            await twilio.calls(placedCallSid).update({ status: "completed" });
        } catch (hangupError) {
            logger.error(`Failed to hang up untracked call (${reason}):`, hangupError);
        }
    };
    try {
        const call = await withTwilioRetry(
          () =>
            twilio.calls.create({
              to:
                selected_device && selected_device !== "computer"
                  ? selected_device
                  : `client:${user_id}`,
              from: caller_id,
              url: `${env.BASE_URL()}/api/dial/${encodeURIComponent(to)}`,
            }),
          { workspaceId: workspace_id, operation: "calls.create" },
        );
        placedCallSid = call.sid ?? null;
        let outreach_attempt_id;
        const campaignId = parseInt(campaign_id, 10);
        const contactId = parseInt(contact_id, 10);
        const queueId = parseInt(queue_id, 10);
        if (!outreach_id) {
            outreach_attempt_id = await createOutreachAttempt(
                {
                    queue_id: queueId,
                    contact_id: contactId,
                    contact_phone: to_number,
                },
                campaignId,
                workspace_id,
                user_id,
            );
        } else {
            outreach_attempt_id = Number(outreach_id)
        }

        const callSaved = await saveCallToDatabase(workspace_id, {
            sid: call.sid,
            date_updated: call.dateUpdated?.toISOString() ?? new Date().toISOString(),
            parent_call_sid: call.parentCallSid ?? null,
            account_sid: call.accountSid ?? null,
            to: to_number,
            from: call.from ?? null,
            phone_number_sid: call.phoneNumberSid ?? null,
            status: call.status ?? null,
            start_time: call.startTime?.toISOString() ?? null,
            end_time: call.endTime?.toISOString() ?? null,
            duration: call.duration != null ? String(call.duration) : null,
            price: call.price ?? null,
            direction: call.direction ?? null,
            answered_by: call.answeredBy ?? null,
            api_version: call.apiVersion ?? null,
            forwarded_from: call.forwardedFrom ?? null,
            group_sid: call.groupSid ?? null,
            caller_name: call.callerName ?? null,
            uri: call.uri ?? null,
            campaign_id: campaignId,
            contact_id: contactId,
            workspace: workspace_id,
            user_id: user_id,
            outreach_attempt_id: Number.isFinite(outreach_attempt_id) ? outreach_attempt_id : undefined,
            queue_id: queueId,
        });

        // saveCallToDatabase swallows its own DB errors (returns false) so a
        // status callback can't be blocked by a transient write failure; here on
        // the dial path a failed write means the redial guard is blind, so hang up.
        if (!callSaved) {
            logger.error('Call placed but its row was not persisted; hanging up to avoid an untracked live call.');
            await hangUpUntrackedCall('save failed');
        }
    } catch (error) {
        logger.error('Error placing call:', error);
        await hangUpUntrackedCall('error placing call');
        twiml.say('There was an error placing your call. Please try again later.');
    }

    return new Response(twiml.toString(), {
        headers: {
            'Content-Type': 'text/xml'
        }
    });
  },
});
