import type { Call } from "@twilio/voice-sdk";

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

export function getHeldCallKey(call: Call, fallbackFrom: string): string {
  return getCallSid(call) ?? `held-${fallbackFrom}`;
}
