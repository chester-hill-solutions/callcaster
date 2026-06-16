import type { Call } from "@twilio/voice-sdk";

type CallWithMute = Call & { mute?: (muted: boolean) => void };

type CallWithInputStream = Call & {
  _setInputTracksFromStream?: (stream: MediaStream) => Promise<void>;
};

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

export function setCallMuted(call: Call | null | undefined, muted: boolean): void {
  if (!call) return;
  const withMute = call as CallWithMute;
  if (typeof withMute.mute === "function") {
    withMute.mute(muted);
  }
}

export async function replaceCallInputStream(
  call: Call | null | undefined,
  stream: MediaStream,
): Promise<void> {
  if (!call) return;
  const withStream = call as CallWithInputStream;
  if (typeof withStream._setInputTracksFromStream === "function") {
    await withStream._setInputTracksFromStream(stream);
  }
}

export function sendCallDigits(
  call: Call | null | undefined,
  key: string,
): void {
  call?.sendDigits(key);
}

export function getHeldCallKey(call: Call, fallbackFrom: string): string {
  return getCallSid(call) ?? `held-${fallbackFrom}`;
}
