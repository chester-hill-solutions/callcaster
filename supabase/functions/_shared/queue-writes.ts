export const QUEUE_STATUS_QUEUED = "queued";
export const QUEUE_STATUS_CANCELED = "canceled";

export function buildQueuedQueueUpdate() {
  return {
    status: QUEUE_STATUS_QUEUED,
    dequeued_at: null,
    dequeued_by: null,
    dequeued_reason: null,
  };
}

export function buildCanceledQueueUpdate() {
  return {
    status: QUEUE_STATUS_CANCELED,
  };
}
