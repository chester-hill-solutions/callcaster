import Twilio from "twilio";
import { isEmail, isPhoneNumber } from "@/lib/utils";

export interface InboundNumberConfig {
  handset_enabled: boolean | null;
  inbound_action: string | null;
  inbound_audio: string | null;
}

export interface InboundFallbackParams {
  number: InboundNumberConfig;
  voicemail: { signedUrl: string } | null;
  called: string;
}

/**
 * Builds TwiML for workspace inbound fallback (forward to phone, voicemail, or default).
 * Used when handset doesn't answer or when no handset session is active.
 */
export function buildInboundFallbackTwiml(
  params: InboundFallbackParams
): string {
  const twiml = new Twilio.twiml.VoiceResponse();
  const { number, voicemail, called } = params;

  if (
    typeof number.inbound_action === "string" &&
    isPhoneNumber(number.inbound_action)
  ) {
    twiml.pause({ length: 1 });
    twiml.dial(number.inbound_action || "");
  } else if (
    typeof number.inbound_action === "string" &&
    isEmail(number.inbound_action)
  ) {
    if (voicemail?.signedUrl) {
      twiml.play(voicemail.signedUrl);
    } else {
      twiml.say(
        `Thank you for calling ${called}, we're unable to answer your call at the moment. Please leave us a message and we'll get back to you as soon as possible.`
      );
    }
    twiml.pause({ length: 1 });
    twiml.record({
      transcribe: true,
      timeout: 10,
      playBeep: true,
      recordingStatusCallback: "/api/email-vm",
    });
  } else {
    twiml.say(
      `Thank you for calling ${called}, we're unable to answer your call at the moment. Please try again later.`
    );
  }

  return twiml.toString();
}
