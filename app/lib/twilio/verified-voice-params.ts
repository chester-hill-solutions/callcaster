/** Normalize only after verifying the signature over the original form body. */
export function normalizeVerifiedVoiceParams(params: Record<string, string>) {
  const fields = [
    ["CallSid", "call_sid"], ["ParentCallSid", "parent_call_sid"], ["AccountSid", "account_sid"],
    ["CallStatus", "call_status"], ["CallDuration", "call_duration"], ["Duration", "duration"],
    ["To", "to"], ["From", "from"], ["Direction", "direction"],
  ] as const;
  for (const [canonical, alias] of fields) {
    if (params[canonical] !== undefined && params[alias] !== undefined && params[canonical] !== params[alias]) return false;
  }
  for (const [canonical, alias] of fields) {
    if (params[canonical] === undefined && params[alias] !== undefined) params[canonical] = params[alias];
  }
  return true;
}
