/** Save this URL before issuing the customer's one Dial instruction. */
export function voiceContinuationUrl(baseUrl: string, reservationId: string) {
  const url = new URL("/api/voice-continuation", baseUrl);
  url.searchParams.set("credit_reservation", reservationId);
  return url.href;
}
