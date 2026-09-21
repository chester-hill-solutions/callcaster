import {
  hangupTwiml,
  pausePlayTwiml,
} from "@/lib/twilio-twiml.server";
import { createSignedObjectUrl } from "@/lib/object-storage.server";
import { updateOutreachAttemptForWorkspace } from "@/lib/telephony-db.server";

/**
 * The IVR answering-machine policy, in one place.
 *
 * The flow-entry route acts on the synchronous AMD verdict before any IVR audio
 * plays; the status callback records the same disposition as a safety net. Both
 * ask this module what "machine" means, how to answer it, and what to record, so
 * the rule cannot drift between them. The recorded disposition follows the drop:
 * `voicemail` when it plays, otherwise `no-answer`.
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
 * What a detected machine should be recorded as. A machine only counts as
 * `voicemail` when the drop actually plays; with the drop off (or no audio) the
 * caller heard nothing, so the operator sees `no-answer`.
 */
export function machineAnswerDisposition(
  campaign: IvrMachineCampaign,
): "voicemail" | "no-answer" {
  return campaign?.voicemail_drop_enabled && campaign.voicemail_file
    ? "voicemail"
    : "no-answer";
}

/**
 * Records the machine disposition. Idempotent — the flow entry and the status
 * callback both call it for the same machine event, and it writes the same
 * values each time. Test calls have no outreach attempt and are
 * skipped.
 *
 * `answered_at` is stamped only for a voicemail: `isConnectedAttempt` treats a
 * present `answered_at` as a connection, so stamping it on a `no-answer` would
 * count a machine hangup as a connected call in analytics.
 */
export async function recordMachineAnswer(
  call: IvrMachineCall,
  campaign: IvrMachineCampaign,
): Promise<void> {
  if (!call.outreach_attempt_id || !call.workspace) return;
  const disposition = machineAnswerDisposition(campaign);
  const updated = await updateOutreachAttemptForWorkspace(
    String(call.workspace),
    call.outreach_attempt_id,
    disposition === "voicemail"
      ? { disposition, answered_at: new Date().toISOString() }
      : { disposition },
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
  await recordMachineAnswer(call, campaign);
  return machineAnswerResponse(campaign, call.workspace);
}
