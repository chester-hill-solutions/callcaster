import type { VoiceReservation } from "@/server/voice-credit-reservation.server";

export function hasVoiceSetup(row: Pick<VoiceReservation, "setup_to" | "setup_client_identity">) {
  return row.setup_to != null || row.setup_client_identity != null;
}

export type VoiceSetupRoot = {
  sid: string;
  accountSid: string;
  to: string;
  from: string;
  direction: string;
  parentCallSid: string | null;
};

/** SDK roots are incoming from a client and have no provider destination. */
export function matchesVoiceSetupRoot(row: VoiceReservation, root: VoiceSetupRoot) {
  if (!hasVoiceSetup(row) || row.account_sid !== root.accountSid || root.parentCallSid ||
      (row.setup_sid !== null && row.setup_sid !== root.sid)) return false;
  return row.setup_client_identity
    ? root.from === `client:${row.setup_client_identity}` && root.to === "" && root.direction === "inbound"
    : root.from === row.caller_id && root.to === row.setup_to && root.direction === "outbound-api";
}

export function voiceCallLegIdentity(row: VoiceReservation, purpose: "recipient" | "setup") {
  if (purpose === "setup") return {
    to: row.setup_to,
    from: row.setup_client_identity ? `client:${row.setup_client_identity}` : row.caller_id,
    parent_call_sid: null,
    direction: row.setup_client_identity ? "inbound" : "outbound-api",
  };
  return { to: row.recipient, from: row.caller_id,
    parent_call_sid: row.conference_id ? null : row.setup_sid,
    direction: row.setup_sid && !row.conference_id ? "outbound-dial" : "outbound-api",
  };
}

export function matchesVoiceRecipient(row: VoiceReservation, candidate: VoiceSetupRoot) {
  const expected = voiceCallLegIdentity(row, "recipient");
  return candidate.accountSid === row.account_sid && (!row.provider_sid || candidate.sid === row.provider_sid) &&
    candidate.to === expected.to && candidate.from === expected.from && candidate.direction === expected.direction &&
    (candidate.parentCallSid || null) === expected.parent_call_sid;
}
