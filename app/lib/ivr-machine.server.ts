import {
  hangupTwiml,
  pausePlayTwiml,
} from "@/lib/twilio-twiml.server";
import { createSignedObjectUrl } from "@/lib/object-storage.server";
import { updateOutreachAttemptForWorkspace } from "@/lib/telephony-db.server";

/**
 * The IVR answering-machine policy (#1864), in one place.
 *
 * The flow-entry route acts on the synchronous AMD verdict before any IVR audio
 * plays; the status callback records the same disposition as a safety net. Both
 * ask this module what "machine" means and how to answer it, so the rule cannot
 * drift between them.
 */

export type IvrMachineCall = {
  workspace: string | null;
  outreach_attempt_id: number | null;
};

export type IvrMachineCampaign =
  | {
      voicemail_drop_enabled: boolean | null;
      voicemail_file: string | null;
    }
  | null
  | undefined;

const TWIML_HEADERS = { "Content-Type": "text/xml" };

/**
 * Twilio's `AnsweredBy` says a machine answered. `other` is excluded (fax and
 * unknown answers are not voicemail). The status callback also passes the call
 * status: a `completed` event carrying a machine verdict is the call ending,
 * not the answer, and the flow entry has already acted on it.
 */
export function isMachineAnswered(
  answeredBy: string | null | undefined,
  callStatus?: string | null,
): boolean {
  const value = answeredBy ?? "";
  return (
    value.includes("machine") &&
    !value.includes("other") &&
    (!callStatus || callStatus !== "completed")
  );
}

/**
 * Marks the attempt as a voicemail answer. Idempotent — the flow entry and the
 * status callback both call it for the same machine event, and it writes the
 * same values each time. Test calls (#1653) have no outreach attempt and are
 * skipped.
 */
export async function recordVoicemailAnswer(
  call: IvrMachineCall,
): Promise<void> {
  if (!call.outreach_attempt_id || !call.workspace) return;
  const updated = await updateOutreachAttemptForWorkspace(
    String(call.workspace),
    call.outreach_attempt_id,
    { disposition: "voicemail", answered_at: new Date().toISOString() },
  );
  if (updated instanceof Response) {
    throw new Error(await updated.text());
  }
}

/**
 * What a machine hears: the configured drop when it is switched on, otherwise
 * a hangup. Never the IVR script.
 */
export async function machineAnswerResponse(
  campaign: IvrMachineCampaign,
  workspace: string | null,
): Promise<Response> {
  if (campaign?.voicemail_drop_enabled && campaign.voicemail_file) {
    const signedUrl = await createSignedObjectUrl(
      "workspaceAudio",
      `${workspace}/${campaign.voicemail_file}`,
      3600,
    );
    return new Response(pausePlayTwiml(signedUrl), { headers: TWIML_HEADERS });
  }
  return new Response(hangupTwiml(), { headers: TWIML_HEADERS });
}

/** Record the disposition and answer the machine, in that order. */
export async function handleMachineAnswer(
  call: IvrMachineCall,
  campaign: IvrMachineCampaign,
): Promise<Response> {
  await recordVoicemailAnswer(call);
  return machineAnswerResponse(campaign, call.workspace);
}
