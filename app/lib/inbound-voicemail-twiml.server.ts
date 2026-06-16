import Twilio from "twilio";
import { env } from "@/lib/env.server";
import type { Database } from "@/lib/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function resolveInboundVoicemailAudio(args: {
  supabase: SupabaseClient<Database>;
  workspaceId: string;
  inboundAudio: string | null;
}): Promise<{ signedUrl: string } | null> {
  if (!args.inboundAudio) {
    return null;
  }

  const { data: signedByPath } = await args.supabase.storage
    .from("workspaceAudio")
    .createSignedUrl(`${args.workspaceId}/${args.inboundAudio}`, 3600);

  if (signedByPath?.signedUrl) {
    return { signedUrl: signedByPath.signedUrl };
  }

  const { data: files } = await args.supabase.storage
    .from("workspaceAudio")
    .list(args.workspaceId, {
      search: args.inboundAudio,
      limit: 20,
      offset: 0,
    });

  const file = files?.find(
    (entry) =>
      String(entry.id) === String(args.inboundAudio) ||
      entry.name === args.inboundAudio,
  );

  if (!file) {
    return null;
  }

  const { data: signed } = await args.supabase.storage
    .from("workspaceAudio")
    .createSignedUrl(`${args.workspaceId}/${file.name}`, 3600);

  return signed?.signedUrl ? { signedUrl: signed.signedUrl } : null;
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
