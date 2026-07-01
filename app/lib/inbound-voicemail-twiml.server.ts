import Twilio from "twilio";
import { env } from "@/lib/env.server";
import { createSignedObjectUrl, listObjects } from "@/lib/object-storage.server";

export async function resolveInboundVoicemailAudio(args: {
  workspaceId: string;
  inboundAudio: string | null;
}): Promise<{ signedUrl: string } | null> {
  if (!args.inboundAudio) {
    return null;
  }

  try {
    const signedUrl = await createSignedObjectUrl(
      "workspaceAudio",
      `${args.workspaceId}/${args.inboundAudio}`,
      3600,
    );
    return { signedUrl };
  } catch {
    // fall through to search
  }

  try {
    const objects = await listObjects("workspaceAudio", args.workspaceId);
    const file = objects.find(
      (entry) =>
        String(entry.id) === String(args.inboundAudio) ||
        entry.name === args.inboundAudio,
    );

    if (!file) {
      return null;
    }

    const signedUrl = await createSignedObjectUrl(
      "workspaceAudio",
      `${args.workspaceId}/${file.name}`,
      3600,
    );
    return { signedUrl };
  } catch {
    return null;
  }
}

export function appendInboundVoicemailTwiml(args: {
  twiml: Twilio.twiml.VoiceResponse;
  phoneNumber: string;
  voicemailAudioUrl: string | null;
}): void {
  if (args.voicemailAudioUrl) {
    args.twiml.play(args.voicemailAudioUrl);
  } else {
    args.twiml.say(
      `Thank you for calling ${args.phoneNumber}, we're unable to answer your call at the moment. Please leave us a message and we'll get back to you as soon as possible.`,
    );
  }

  args.twiml.pause({ length: 1 });
  args.twiml.record({
    transcribe: true,
    timeout: 10,
    playBeep: true,
    recordingStatusCallback: `${env.BASE_URL()}/api/email-vm`,
  });
}
