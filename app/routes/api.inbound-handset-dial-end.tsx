import type { ActionFunctionArgs } from "@remix-run/node";
import Twilio from "twilio";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env.server";
import { buildInboundFallbackTwiml } from "@/lib/inbound-handler.server";
import type { Database } from "@/lib/database.types";

/**
 * Twilio calls this when the handset <Dial> ends (timeout, hang up, etc.).
 * On no-answer: fall through to workspace's typical inbound handler (forward to phone, voicemail, or default).
 * Otherwise: just hang up.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return new Response(null, { status: 405 });
  }
  const formData = await request.formData();
  const dialCallStatus = String(formData.get("DialCallStatus") ?? "").toLowerCase();
  const called = formData.get("Called") as string | null;

  if (dialCallStatus !== "no-answer" || !called) {
    const twiml = new Twilio.twiml.VoiceResponse();
    twiml.hangup();
    return new Response(twiml.toString(), {
      headers: { "Content-Type": "text/xml" },
    });
  }

  const supabase = createClient<Database>(
    env.SUPABASE_URL(),
    env.SUPABASE_SERVICE_KEY()
  );

  const { data: number, error: numberError } = await supabase
    .from("workspace_number")
    .select(
      `
      handset_enabled,
      inbound_action,
      inbound_audio,
      workspace,
      ...workspace!inner(id)`
    )
    .eq("phone_number", called)
    .single();

  if (numberError || !number) {
    const twiml = new Twilio.twiml.VoiceResponse();
    twiml.say(
      { voice: "alice" },
      "No one is available to take your call. Please try again later."
    );
    twiml.hangup();
    return new Response(twiml.toString(), {
      headers: { "Content-Type": "text/xml" },
    });
  }

  const workspaceId =
    number.workspace && typeof number.workspace === "object" && "id" in number.workspace
      ? (number.workspace as { id: string }).id
      : typeof number.workspace === "string"
        ? number.workspace
        : null;

  let voicemail: { signedUrl: string } | null = null;
  if (number?.inbound_audio && workspaceId) {
    const { data: signedByPath } = await supabase.storage
      .from("workspaceAudio")
      .createSignedUrl(`${workspaceId}/${number.inbound_audio}`, 3600);
    if (signedByPath?.signedUrl) {
      voicemail = { signedUrl: signedByPath.signedUrl };
    } else {
      const { data: files } = await supabase.storage
        .from("workspaceAudio")
        .list(workspaceId, {
          search: number.inbound_audio,
          limit: 20,
          offset: 0,
        });
      const file = files?.find(
        (f) =>
          String(f.id) === String(number.inbound_audio) ||
          f.name === number.inbound_audio
      );
      if (file) {
        const { data: signed } = await supabase.storage
          .from("workspaceAudio")
          .createSignedUrl(`${workspaceId}/${file.name}`, 3600);
        if (signed?.signedUrl) voicemail = { signedUrl: signed.signedUrl };
      }
    }
  }

  const twiml = buildInboundFallbackTwiml({
    number: {
      handset_enabled: number.handset_enabled,
      inbound_action: number.inbound_action,
      inbound_audio: number.inbound_audio,
    },
    voicemail,
    called,
  });

  return new Response(twiml, {
    headers: { "Content-Type": "text/xml" },
  });
};
