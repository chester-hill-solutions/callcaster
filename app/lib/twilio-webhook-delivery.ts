/** Twilio strips delivery overrides before sending and signing the request. */
export function voiceWebhookDeliveryUrl(savedUrl: string) {
  const url = new URL(savedUrl);
  url.hash = "ct=1000&rt=3000&tt=15000&rc=2&rp=ct,rt,5xx";
  return url.href;
}
