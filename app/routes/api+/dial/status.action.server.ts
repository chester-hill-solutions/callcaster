import { createWorkspaceTwilioInstance } from "@/lib/database.server";
import { fetchCampaignByIdForWorkspace } from "@/lib/campaign-ivr.server";
import { data as routeData } from "react-router";
import { env } from "@/lib/env.server";
import { validateTwilioWebhookForCallSid } from "@/lib/twilio-webhook.server";
import { hangupTwiml, pausePlayTwiml } from "@/lib/twilio-twiml.server";
import {
  findCallBySid,
  updateCallBySid,
  updateOutreachAttemptForWorkspace,
} from "@/lib/telephony-db.server";
import type { ActionFunctionArgs } from "react-router";

export const action = async ({ request }: ActionFunctionArgs) => {
  const client = createClient(
    env.BASE_URL(),
    env.BASE_URL(),
  );
  const formData = await request.formData();
  const params = Object.fromEntries(formData.entries()) as Record<string, string>;
  const callSidValue = formData.get("CallSid");
  const answeredByValue = formData.get("AnsweredBy");
  const callStatusValue = formData.get("CallStatus");

  if (!callSidValue || typeof callSidValue !== "string") {
    return routeData({ success: false, error: "CallSid is required and must be a string" });
  }

  const callSid = callSidValue;
  const answeredBy = typeof answeredByValue === "string" ? answeredByValue : null;
  const callStatus = typeof callStatusValue === "string" ? callStatusValue : null;

  try {
    const validation = await validateTwilioWebhookForCallSid({
      request,
      client,
      callSid,
      params,
    });
    if (!validation.ok) {
      return validation.response;
    }

    const dbCall = await findCallBySid(callSid);
    if (!dbCall?.workspace) {
      return routeData({ success: false, error: "Call not found" });
    }

    const twilio = await createWorkspaceTwilioInstance({
      client,
      workspace_id: dbCall.workspace,
    });
    const campaign = await fetchCampaignByIdForWorkspace(
      dbCall.workspace,
      dbCall.campaign_id ?? 0,
    );

    const { data: voicemailData, error: voicemailError } = campaign.voicemail_file
      ? await adminDb.storage
          .from(`workspaceAudio`)
          .createSignedUrl(`${dbCall.workspace}/${campaign.voicemail_file}`, 3600)
      : { data: null, error: null };
    if (voicemailError) throw voicemailError;

    const call = twilio.calls(callSid);

    if (
      answeredBy &&
      answeredBy.includes("machine") &&
      !answeredBy.includes("other") &&
      callStatus !== "completed"
    ) {
      try {
        if (voicemailData && voicemailData.signedUrl) {
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
        }

        if (dbCall.outreach_attempt_id) {
          const outreachResult = await updateOutreachAttemptForWorkspace(dbCall.workspace, dbCall.outreach_attempt_id, {
            disposition: "no-answer",
          });
          if (outreachResult instanceof Response) {
            throw new Error(await outreachResult.text());
          }
        }
        await call.update({
          twiml: hangupTwiml(),
        });
        return routeData({ success: true });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to handle voicemail";
        return routeData({ success: false, error: errorMessage });
      }
    }

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
};
