import type { Call } from "@twilio/voice-sdk";
import { logger } from "@/lib/logger.client";

export {
  getCallFrom,
  getCallParameters,
  getCallSid,
  getHeldCallKey,
} from "@/lib/twilio/twilio-call-params";

type CallWithMute = Call & { mute?: (muted: boolean) => void };

type CallWithInputStream = Call & {
  _setInputTracksFromStream?: (stream: MediaStream) => Promise<void>;
};

/** Result of an adapter operation against optional Twilio Voice SDK capabilities. */
export type TwilioAdapterResult =
  | { status: "ok" }
  | { status: "invalid_call" }
  | { status: "unsupported" }
  | { status: "error"; error: unknown };

/**
 * Twilio Voice SDK client mute — silences the agent leg locally.
 * This is NOT Twilio Conference participant hold (`hold=true` on a conference participant).
 */
export function setCallMuted(
  call: Call | null | undefined,
  muted: boolean,
): TwilioAdapterResult {
  if (!call) return { status: "invalid_call" };
  const withMute = call as CallWithMute;
  if (typeof withMute.mute !== "function") {
    return { status: "unsupported" };
  }
  try {
    withMute.mute(muted);
    return { status: "ok" };
  } catch (error) {
    return { status: "error", error };
  }
}

export async function replaceCallInputStream(
  call: Call | null | undefined,
  stream: MediaStream,
): Promise<TwilioAdapterResult> {
  if (!call) return { status: "invalid_call" };
  const withStream = call as CallWithInputStream;
  if (typeof withStream._setInputTracksFromStream !== "function") {
    return { status: "unsupported" };
  }
  try {
    await withStream._setInputTracksFromStream(stream);
    return { status: "ok" };
  } catch (error) {
    return { status: "error", error };
  }
}

export function sendCallDigits(
  call: Call | null | undefined,
  key: string,
): TwilioAdapterResult {
  if (!call) return { status: "invalid_call" };
  if (typeof call.sendDigits !== "function") {
    return { status: "unsupported" };
  }
  try {
    call.sendDigits(key);
    return { status: "ok" };
  } catch (error) {
    return { status: "error", error };
  }
}

/** Log adapter failures; no-op for ok / invalid_call. */
export function logTwilioAdapterResult(
  result: TwilioAdapterResult,
  context: string,
): void {
  if (result.status === "unsupported") {
    logger.debug(`Twilio adapter unsupported: ${context}`);
  } else if (result.status === "error") {
    logger.error(`Twilio adapter error: ${context}`, result.error);
  }
}
