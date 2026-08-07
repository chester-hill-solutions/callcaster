/**
 * Shared SMS-status type.
 *
 * The runtime logic that used to live here (status normalization, outbound SMS
 * webhook delivery, queued-message cancellation) was a drifted, dead duplicate
 * of the live implementations in `app/lib/sms-status.ts` and the webhook/queue
 * modules — no runtime code imported it, and it had diverged (querying a
 * dropped column, mapping unknown statuses differently, and POSTing to a
 * workspace-supplied URL without the SSRF guard the live sender uses). Only the
 * type below is still referenced (by `shared/twilio-open-sync-candidates.ts`),
 * so the logic has been removed to prevent it being wired up by accident.
 */
export type TwilioSmsStatus =
  | "accepted"
  | "scheduled"
  | "canceled"
  | "queued"
  | "sending"
  | "sent"
  | "failed"
  | "delivered"
  | "undelivered"
  | "receiving"
  | "received"
  | "read";
