export const QUEUE_STATUS_QUEUED = "queued";
export const QUEUE_STATUS_CANCELED = "canceled";
export const QUEUE_LIFECYCLE_ASSIGNED = "assigned";

export function buildQueuedQueueUpdate() {
  return {
    assigned_to_user_id: null,
    dequeued_at: null,
    dequeued_by: null,
    dequeued_reason: null,
    provider_status: null,
    queue_state: QUEUE_STATUS_QUEUED,
  };
}

export function buildCanceledQueueUpdate() {
  return {
    queue_state: QUEUE_STATUS_CANCELED,
  };
}
