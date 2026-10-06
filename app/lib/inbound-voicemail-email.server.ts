import { env } from "@/lib/env.server";
import { resolveTwilioRestBasicAuth } from "@/lib/twilio-workspace-credentials";
import { uploadObject, createSignedObjectUrl } from "@/lib/object-storage.server";
import { voicemailObjectPath } from "@/lib/voicemail-media.server";
import type { VoicemailEmailPayload } from "@/db/schema-inbound-voicemail";
import type { findWorkspaceNumberVoicemailContextByPhone } from "@/lib/inbound-call-db.server";
import type { findCallBySid } from "@/lib/telephony-db.server";

type NumberContext = NonNullable<Awaited<ReturnType<typeof findWorkspaceNumberVoicemailContextByPhone>>>;
type StoredCall = NonNullable<Awaited<ReturnType<typeof findCallBySid>>>;

export async function prepareVoicemailEmail(args: {
  number: NumberContext; call: StoredCall; recipient: string; accountSid: string; recordingSid: string;
}) {
  const { number, call, recipient, accountSid, recordingSid } = args;
  // API Key first, Auth Token fallback (ADR-0011). Fetching the media
  // with only the subaccount Auth Token meant a token that had gone
  // stale in twilio_data — the failure mode behind the workspace-wide
  // authentication errors in #1655 — silently killed every voicemail
  // email for that workspace while live calls, which auth with the
  // API Key, kept working (#1224).
  const restAuth = resolveTwilioRestBasicAuth(number.workspace);
  if (!restAuth) {
    throw new Error("Workspace twilio data not found");
  }

  const now = new Date();

  if (!accountSid || typeof accountSid !== "string") {
    throw new Error("Missing or invalid AccountSid");
  }
  if (!recordingSid || typeof recordingSid !== "string") {
    throw new Error("Missing or invalid RecordingSid");
  }

  const recordingResponse = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Recordings/${recordingSid}.mp3`,
    {
      headers: {
        Authorization: `Basic ${Buffer.from(`${restAuth.username}:${restAuth.password}`).toString("base64")}`,
      },
    },
  );

  if (!recordingResponse.ok) {
    throw new Error(
      `Failed to fetch recording (${recordingResponse.status} ${recordingResponse.statusText}) with ${restAuth.source} credentials for workspace ${number.workspace.id}`,
    );
  }

  const recording = await recordingResponse.blob();

  // Caller audio never lands in the library prefix: `voicemail/<ws>/…` is a
  // disjoint namespace, so library lists and prompts can never mix caller
  // messages in (see voicemail-media.server).
  const fileName = voicemailObjectPath(number.workspace.id, `voicemail-${call.sid}-${recordingSid}.mp3`);
  try {
    await uploadObject(
      "workspaceAudio",
      fileName,
      recording,
      {
        contentType: "audio/mpeg",
        cacheControl: "60",
      },
    );
  } catch (error) {
    throw new Error(`Error uploading to storage: ${error instanceof Error ? error.message : String(error)}`);
  }

  // SigV4 presigned URLs are capped at 7 days — the signer itself
  // rejects anything longer, which is what silently killed every
  // voicemail email after the S3 migration (#1224). The email also
  // links to the voicemails page, which mints fresh URLs on demand.
  const SIGNED_URL_TTL_SECONDS = 7 * 24 * 60 * 60;
  let signedUrl: string;
  try {
    signedUrl = await createSignedObjectUrl(
      "workspaceAudio",
      fileName,
      SIGNED_URL_TTL_SECONDS,
    );
  } catch (error) {
    throw new Error(`Error creating signed URL: ${error instanceof Error ? error.message : String(error)}`);
  }

  const payload: VoicemailEmailPayload = {
    from: "Callcaster <info@callcaster.ca>",
    to: [recipient],
    subject: `New Voicemail from ${call.from}`,
    html: `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>New Voicemail Received</h2>
      <p><strong>From:</strong> ${call.from}</p>
      <p><strong>To:</strong> ${call.to}</p>
      <p><strong>Workspace:</strong> ${number.workspace.name}</p>
      <p><strong>Date:</strong> ${now.toLocaleString()}</p>
      <p><a href="${signedUrl}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Listen to Voicemail</a></p>
      <p><a href="${env.BASE_URL()}/workspaces/${number.workspace.id}/voicemails" style="color: #007bff;">View in Workspace</a></p>
    </div>
  `,
    text: `
    New Voicemail Received

    From: ${call.from}
    To: ${call.to}
    Workspace: ${number.workspace.name}
    Date: ${now.toLocaleString()}

    Listen to voicemail: ${signedUrl}
    View in workspace: ${env.BASE_URL()}/workspaces/${number.workspace.id}/voicemails
  `,
  };
  return { signedUrl, payload };
}
