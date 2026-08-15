import { createWorkspaceTwilioInstance } from "@/lib/database/workspace.server";
import { fetchCampaignByIdForWorkspace } from "@/lib/campaign-ivr.server";
import { data as routeData } from "react-router";
import { requireTwilioSignature } from "@/lib/twilio-webhook.server";
import { markContactLineType } from "@/lib/twilio-lookup.server";
import { pausePlayTwiml } from "@/lib/twilio-twiml.server";
import { createSignedObjectUrl } from "@/lib/object-storage.server";
import {
  findCallBySid,
  updateCallBySid,
  updateOutreachAttemptForWorkspace,
} from "@/lib/telephony-db.server";
import { defineAction } from "@/lib/handler.server";
import type { ActionFunctionArgs } from "react-router";
import {
  parseTwilioVoiceCallback,
  type TwilioVoiceCallback,
} from "@/lib/twilio/voice-callback";

type DialStatusAuth = {
  event: TwilioVoiceCallback;
};

export const action = defineAction({
  auth: async ({ request }: ActionFunctionArgs): Promise<DialStatusAuth | Response> => {
    // Clone before reading — Bun yields empty params on re-read after consume.
    const formData = await request.clone().formData();
    const params = Object.fromEntries(formData.entries()) as Record<string, string>;
    // Parsed once here (#1243 E2) instead of each field being re-narrowed with
    // `typeof x === "string"` below.
    const event = parseTwilioVoiceCallback(params);

    // Validate the Twilio signature unconditionally (fail closed). Previously
    // this ran only when CallSid was present, so a request without CallSid
    // skipped the webhook auth boundary entirely.
    const forbidden = await requireTwilioSignature(request, {
      callSid: event.callSid ?? undefined,
      params,
    });
    if (forbidden) return forbidden;

    return { event };
  },
  sideEffects: ["twilio", "db-write"],
  handler: async ({ auth }) => {
    const { event } = auth;
    const callSid = event.callSid;
    const answeredBy = event.answeredBy;
    const callStatus = event.callStatus || null;

    if (!callSid) {
      return routeData({ success: false, error: "CallSid is required and must be a string" });
    }

  try {
    const dbCall = await findCallBySid(callSid);
    if (!dbCall?.workspace) {
      return routeData({ success: false, error: "Call not found" });
    }

    // Free line-type signal: AMD identifying a fax machine means this number
    // can never receive SMS — stamp it so the send gates skip it.
    if (answeredBy === "fax" && dbCall.contact_id) {
      await markContactLineType({
        workspaceId: dbCall.workspace,
        contactId: dbCall.contact_id,
        lineType: "fax",
      });
    }

    const twilio = await createWorkspaceTwilioInstance({
      workspace_id: dbCall.workspace,
    });
    const campaign = await fetchCampaignByIdForWorkspace(
      dbCall.workspace,
      dbCall.campaign_id ?? 0,
    );

    let voicemailData: { signedUrl: string } | null = null;
    if (campaign.voicemail_file) {
      const signedUrl = await createSignedObjectUrl(
        "workspaceAudio",
        `${dbCall.workspace}/${campaign.voicemail_file}`,
        3600,
      );
      voicemailData = { signedUrl };
    }

    const call = twilio.calls(callSid);

    if (
      answeredBy &&
      answeredBy.includes("machine") &&
      !answeredBy.includes("other") &&
      callStatus !== "completed" &&
      voicemailData?.signedUrl
    ) {
      try {
        if (dbCall.outreach_attempt_id) {
          const outreachResult = await updateOutreachAttemptForWorkspace(dbCall.workspace, dbCall.outreach_attempt_id, {
            disposition: "voicemail",
          });
          if (outreachResult instanceof Response) {
            throw new Error(await outreachResult.text());
          }
        }
        await call.update({
          twiml: pausePlayTwiml(voicemailData.signedUrl, 5),
        });
        return routeData({ success: true });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to handle voicemail";
        return routeData({ success: false, error: errorMessage });
      }
    }
    // A detected machine with no voicemail-drop audio configured for this
    // campaign falls through to the same path as a human answer: the call
    // is never auto-hung-up on AMD alone, only when there's an actual
    // message to leave. Product decision (issue #1143) — the previous
    // behavior hung up silently with nothing left behind, which read to
    // agents as "the call just died" rather than "voicemail wasn't set up."

    await updateCallBySid(dbCall.workspace, callSid, { answered_by: answeredBy });
    if (dbCall.outreach_attempt_id) {
      const attempt = await updateOutreachAttemptForWorkspace(
        dbCall.workspace,
        dbCall.outreach_attempt_id,
        { answered_at: new Date().toISOString() },
      );
      if (attempt instanceof Response) {
        throw new Error(await attempt.text());
      }
      return routeData({ success: true, attempt });
    }
    return routeData({ success: true });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "An unexpected error occurred";
    return routeData({ success: false, error: errorMessage });
  }
  },
});
