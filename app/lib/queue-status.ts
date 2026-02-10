/**
 * Queue status semantics for campaign_queue.status
 *
 * NOTE: The status field is overloaded for historical reasons:
 * - "queued" = contact waiting to be called
 * - userId (UUID string) = contact assigned to that user for manual dialing
 * - Twilio call status ("ringing", "in-progress", etc.) = written by webhooks during calls
 *
 * Prefer using these helpers when reading. Schema normalization (e.g. assigned_to_user_id,
 * call_status) would clarify semantics in a future migration.
 */

export const QUEUE_STATUS_QUEUED = "queued" as const;

/**
 * True when status indicates the contact is waiting to be called.
 */
export function isQueued(status: string | null | undefined): boolean {
  return status === QUEUE_STATUS_QUEUED;
}

/**
 * True when status indicates the contact is assigned to a specific user (manual dial).
 * In call mode, status is set to the user's ID when they "take" the contact.
 */
export function isAssignedToUser(
  status: string | null | undefined,
  userId: string
): boolean {
  return status === userId;
}

/**
 * True when status looks like a UUID (user assignment) rather than a Twilio state.
 */
export function isUserAssignment(status: string | null | undefined): boolean {
  if (!status || status === QUEUE_STATUS_QUEUED) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    status
  );
}
