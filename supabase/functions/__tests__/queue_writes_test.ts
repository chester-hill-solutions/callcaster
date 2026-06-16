import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  QUEUE_STATUS_CANCELED,
  QUEUE_STATUS_QUEUED,
  buildCanceledQueueUpdate,
  buildQueuedQueueUpdate,
} from "../_shared/queue-writes.ts";

Deno.test("buildQueuedQueueUpdate clears dequeue metadata", () => {
  assertEquals(buildQueuedQueueUpdate(), {
    status: QUEUE_STATUS_QUEUED,
    dequeued_at: null,
    dequeued_by: null,
    dequeued_reason: null,
  });
});

Deno.test("buildCanceledQueueUpdate sets canceled status", () => {
  assertEquals(buildCanceledQueueUpdate(), {
    status: QUEUE_STATUS_CANCELED,
  });
});
