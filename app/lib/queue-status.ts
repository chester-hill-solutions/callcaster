import type { Database } from "@/lib/database.types";

/**
 * Queue status semantics for campaign_queue.status.
 *
 * Legacy rows overload `status` to mean queue lifecycle, user assignment, or
 * provider/call state. Normalized rows split those into `queue_state`,
 * `assigned_to_user_id`, and `provider_status`.
 *
 * Prefer the entry-based helpers below so readers and writers can support both
 * shapes during the staged rollout.
 */

export const QUEUE_STATUS_QUEUED = "queued" as const;
export const QUEUE_STATUS_DEQUEUED = "dequeued" as const;
export const QUEUE_LIFECYCLE_ASSIGNED = "assigned" as const;
export const QUEUE_LIFECYCLE_CANCELED = "canceled" as const;
export const QUEUE_STATUS_FILTERS = [
  QUEUE_STATUS_QUEUED,
  "assigned",
  "active",
  "completed",
] as const;

export type QueueStatusFilter = (typeof QUEUE_STATUS_FILTERS)[number];
export type QueueDisplayState = QueueStatusFilter;
export type QueueLifecycle =
  | typeof QUEUE_STATUS_QUEUED
  | typeof QUEUE_STATUS_DEQUEUED
  | typeof QUEUE_LIFECYCLE_ASSIGNED
  | typeof QUEUE_LIFECYCLE_CANCELED;

export type QueueStateLike = {
  status?: string | null;
  dequeued_at?: string | null;
  dequeued_by?: string | null;
  dequeued_reason?: string | null;
  assigned_to_user_id?: string | null;
  provider_status?: string | null;
  queue_state?: string | null;
};

const UUID_STATUS_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const LEGACY_QUEUE_ASSIGNMENT_LIKE_PATTERN =
  "________-____-____-____-____________";

/**
 * Supabase OR filter for rows that should count as "completed" in queue progress.
 * `status` is not reliable on its own because Twilio/webhook updates can overwrite it,
 * while `dequeued_at` remains the durable marker that queue work is finished.
 */
export const COMPLETED_QUEUE_COUNT_FILTER =
  `status.eq.${QUEUE_STATUS_DEQUEUED},dequeued_at.not.is.null`;

function toQueueStateLike(
  value: QueueStateLike | string | null | undefined,
  dequeuedAt?: string | null | undefined,
): QueueStateLike {
  if (typeof value === "object" && value !== null) {
    return value;
  }

  return {
    assigned_to_user_id: null,
    dequeued_at: dequeuedAt ?? null,
    dequeued_by: null,
    dequeued_reason: null,
    provider_status: null,
    queue_state: null,
    status: value ?? undefined,
  };
}

/**
 * True when status looks like a UUID (user assignment) rather than a Twilio state.
 */
export function isUserAssignment(status: string | null | undefined): boolean {
  if (!status || status === QUEUE_STATUS_QUEUED) return false;
  return UUID_STATUS_PATTERN.test(status);
}

export function getAssignedUserId(
  value: QueueStateLike | string | null | undefined,
): string | null {
  const queue = toQueueStateLike(value);
  if (queue.assigned_to_user_id) {
    return queue.assigned_to_user_id;
  }

  return isUserAssignment(queue.status) ? (queue.status ?? null) : null;
}

export function getProviderStatus(
  value: QueueStateLike | string | null | undefined,
): string | null {
  const queue = toQueueStateLike(value);
  if (queue.provider_status) {
    return queue.provider_status;
  }

  if (
    queue.status &&
    queue.status !== QUEUE_STATUS_QUEUED &&
    queue.status !== QUEUE_STATUS_DEQUEUED &&
    !isUserAssignment(queue.status)
  ) {
    return queue.status;
  }

  return null;
}

/**
 * True when status indicates the contact is waiting to be called.
 */
export function isQueued(
  value: QueueStateLike | string | null | undefined,
): boolean {
  const queue = toQueueStateLike(value);
  if (queue.queue_state) {
    return (
      queue.queue_state === QUEUE_STATUS_QUEUED &&
      !Boolean(queue.dequeued_at)
    );
  }

  return queue.status === QUEUE_STATUS_QUEUED && !Boolean(queue.dequeued_at);
}

/**
 * True when the queue entry has been fully dequeued, regardless of why it finished.
 */
export function isDequeued(
  value: QueueStateLike | string | null | undefined,
  dequeuedAt?: string | null | undefined,
): boolean {
  const queue = toQueueStateLike(value, dequeuedAt);
  return (
    queue.queue_state === QUEUE_STATUS_DEQUEUED ||
    queue.status === QUEUE_STATUS_DEQUEUED ||
    Boolean(queue.dequeued_at)
  );
}

/**
 * True when status indicates the contact is assigned to a specific user (manual dial).
 */
export function isAssignedToUser(
  value: QueueStateLike | string | null | undefined,
  userId: string,
): boolean {
  const queue = toQueueStateLike(value);
  return getAssignedUserId(queue) === userId || queue.status === userId;
}

export function getQueueLifecycle(
  value: QueueStateLike | string | null | undefined,
  dequeuedAt?: string | null | undefined,
): QueueLifecycle {
  const queue = toQueueStateLike(value, dequeuedAt);

  if (isDequeued(queue)) {
    return QUEUE_STATUS_DEQUEUED;
  }

  if (queue.queue_state === QUEUE_LIFECYCLE_CANCELED) {
    return QUEUE_LIFECYCLE_CANCELED;
  }

  if (queue.queue_state === QUEUE_LIFECYCLE_ASSIGNED) {
    return QUEUE_LIFECYCLE_ASSIGNED;
  }

  if (isQueued(queue)) {
    return QUEUE_STATUS_QUEUED;
  }

  if (getAssignedUserId(queue)) {
    return QUEUE_LIFECYCLE_ASSIGNED;
  }

  return QUEUE_LIFECYCLE_ASSIGNED;
}

export function getQueueDisplayState(
  value: QueueStateLike | string | null | undefined,
  dequeuedAt?: string | null | undefined,
): QueueDisplayState {
  const queue = toQueueStateLike(value, dequeuedAt);
  if (isDequeued(queue)) {
    return "completed";
  }

  if (getProviderStatus(queue)) {
    return "active";
  }

  if (isQueued(queue)) {
    return QUEUE_STATUS_QUEUED;
  }

  if (getAssignedUserId(queue)) {
    return "assigned";
  }

  return "active";
}

export function getQueueDisplayLabel(
  value: QueueStateLike | string | null | undefined,
  dequeuedAt?: string | null | undefined,
): string {
  const queue = toQueueStateLike(value, dequeuedAt);
  const displayState = getQueueDisplayState(queue);
  const providerStatus = getProviderStatus(queue);

  if (displayState === "active" && providerStatus) {
    return providerStatus.replace(/-/g, " ");
  }

  return displayState;
}

export function matchesQueueStatusFilter(
  value: QueueStateLike | string | null | undefined,
  queueStatus: QueueStatusFilter,
): boolean {
  return getQueueDisplayState(value) === queueStatus;
}

export function applyQueueStatusFilter(
  query: any,
  queueStatus: QueueStatusFilter,
): any {
  if (queueStatus === "queued") {
    return query.eq("status", QUEUE_STATUS_QUEUED).is("dequeued_at", null);
  }

  if (queueStatus === "completed") {
    return query.or(COMPLETED_QUEUE_COUNT_FILTER);
  }

  if (queueStatus === "assigned") {
    return query
      .like("status", LEGACY_QUEUE_ASSIGNMENT_LIKE_PATTERN)
      .is("dequeued_at", null);
  }

  return query
    .not("status", "in", `("${QUEUE_STATUS_QUEUED}","${QUEUE_STATUS_DEQUEUED}")`)
    .not("status", "like", LEGACY_QUEUE_ASSIGNMENT_LIKE_PATTERN)
    .is("dequeued_at", null);
}

export function buildQueuedQueueUpdate(
  options?: { includeNormalizedFields?: boolean },
): Database["public"]["Tables"]["campaign_queue"]["Update"] {
  const baseUpdate: Database["public"]["Tables"]["campaign_queue"]["Update"] = {
    status: QUEUE_STATUS_QUEUED,
    dequeued_at: null,
    dequeued_by: null,
    dequeued_reason: null,
  };

  if (!options?.includeNormalizedFields) {
    return baseUpdate;
  }

  return {
    ...baseUpdate,
    assigned_to_user_id: null,
    provider_status: null,
    queue_state: QUEUE_STATUS_QUEUED,
  };
}

export function buildAssignedQueueUpdate(
  assignedToUserId: string,
  options?: { includeNormalizedFields?: boolean },
): Database["public"]["Tables"]["campaign_queue"]["Update"] {
  const baseUpdate: Database["public"]["Tables"]["campaign_queue"]["Update"] = {
    status: assignedToUserId,
    dequeued_at: null,
    dequeued_by: null,
    dequeued_reason: null,
  };

  if (!options?.includeNormalizedFields) {
    return baseUpdate;
  }

  return {
    ...baseUpdate,
    assigned_to_user_id: assignedToUserId,
    provider_status: null,
    queue_state: QUEUE_LIFECYCLE_ASSIGNED,
  };
}

export function buildProviderStatusQueueUpdate(
  providerStatus: string,
  options?: { includeNormalizedFields?: boolean },
): Database["public"]["Tables"]["campaign_queue"]["Update"] {
  const baseUpdate: Database["public"]["Tables"]["campaign_queue"]["Update"] = {
    status: providerStatus,
  };

  if (!options?.includeNormalizedFields) {
    return baseUpdate;
  }

  return {
    ...baseUpdate,
    provider_status: providerStatus,
    queue_state: QUEUE_LIFECYCLE_ASSIGNED,
  };
}

export function buildDequeuedQueueUpdate(
  dequeuedBy: string | null,
  dequeuedReason: string,
  options?: { includeNormalizedFields?: boolean },
): Database["public"]["Tables"]["campaign_queue"]["Update"] {
  const baseUpdate: Database["public"]["Tables"]["campaign_queue"]["Update"] = {
    status: QUEUE_STATUS_DEQUEUED,
    dequeued_at: new Date().toISOString(),
    dequeued_by: dequeuedBy,
    dequeued_reason: dequeuedReason,
  };

  if (!options?.includeNormalizedFields) {
    return baseUpdate;
  }

  return {
    ...baseUpdate,
    assigned_to_user_id: null,
    provider_status: null,
    queue_state: QUEUE_STATUS_DEQUEUED,
  };
}
