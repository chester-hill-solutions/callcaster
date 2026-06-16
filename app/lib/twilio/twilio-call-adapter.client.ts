import type { Call } from "@twilio/voice-sdk";
import { logger } from "@/lib/logger.client";

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

export function getCallParameters(
  call: Call | null | undefined,
): Record<string, string> | undefined {
  if (!call) return undefined;
  const params = (call as Call & { parameters?: Record<string, string> }).parameters;
  return typeof params === "object" && params !== null ? params : undefined;
}

export function getCallSid(call: Call | null | undefined): string | undefined {
  const sid = getCallParameters(call)?.CallSid;
  return typeof sid === "string" && sid.length > 0 ? sid : undefined;
}

export function getCallFrom(call: Call | null | undefined): string {
  const from = getCallParameters(call)?.From;
  return typeof from === "string" && from.length > 0 ? from : "Unknown";
}

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

export function getHeldCallKey(call: Call, fallbackFrom: string): string {
  return getCallSid(call) ?? `held-${fallbackFrom}`;
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
