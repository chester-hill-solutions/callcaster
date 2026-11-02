/** This label identifies saved authority; it is not provider idempotency. */
export function voiceCustomerPhaseLabel(reservationId: string, phaseId: string) {
  return `customer:v1:${reservationId}:${phaseId}`;
}

export type VoiceCustomerPhaseInstruction = { id: string; digest: string };
