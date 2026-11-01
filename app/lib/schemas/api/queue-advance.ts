import { z } from "zod";

const numericId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const positiveId = z.union([z.number(), z.string().regex(/^[1-9]\d*$/).transform(Number)]).pipe(numericId);
export const queueAdvanceEntrySchema = z.object({
  queue_id: positiveId, contact_id: positiveId, dispatch_generation: z.uuid(), voice_reservation_id: z.uuid().nullable(),
}).strict();
export const queueHouseholdSnapshotSchema = z.object({
  household_id: z.uuid().nullable(), entries: z.array(queueAdvanceEntrySchema).max(1000),
}).strict();
export type QueueHouseholdSnapshot = z.infer<typeof queueHouseholdSnapshotSchema>;
export type QueueAdvanceEntry = z.infer<typeof queueAdvanceEntrySchema>;
export const queueRemovedEntrySchema = queueAdvanceEntrySchema;
export type QueueRemovedEntry = z.infer<typeof queueRemovedEntrySchema>;

export const queueAdvanceRequestSchema = queueAdvanceEntrySchema.extend({
  workspace_id: z.string().min(1), campaign_id: positiveId, household: z.boolean(),
  household_snapshot: queueHouseholdSnapshotSchema.optional(),
  call_sid: z.string().regex(/^CA[0-9a-f]{32}$/i).optional(),
}).superRefine((value, context) => {
  const snapshot = value.household_snapshot;
  if (value.household !== (snapshot !== undefined)) context.addIssue({ code: "custom", message: "Capture the household before advancing", path: ["household_snapshot"] });
  if (!snapshot) return;
  const ids = new Set<number>([value.queue_id]), contacts = new Set<number>([value.contact_id]);
  for (const entry of snapshot.entries) {
    if (ids.has(entry.queue_id) || contacts.has(entry.contact_id)) context.addIssue({ code: "custom", message: "Queue entries must be unique", path: ["household_snapshot"] });
    ids.add(entry.queue_id); contacts.add(entry.contact_id);
  }
  if (snapshot.household_id === null && snapshot.entries.length) context.addIssue({ code: "custom", message: "A household is required for siblings", path: ["household_snapshot"] });
});
export type QueueAdvanceRequest = z.infer<typeof queueAdvanceRequestSchema>;

export const queueAdvanceResponseSchema = queueAdvanceRequestSchema.safeExtend({
  contact_id: numericId, campaign_id: numericId, queue_id: numericId,
  success: z.literal(true), dequeued: z.boolean(),
  advance_state: z.enum(["dequeued", "already_dequeued", "superseded"]), user_id: z.string().min(1),
  removed_entries: z.array(queueRemovedEntrySchema).max(1001),
}).superRefine((value, context) => {
  const removed = value.removed_entries;
  const same = (entry: QueueRemovedEntry, expected: QueueRemovedEntry) => entry.queue_id === expected.queue_id &&
    entry.contact_id === expected.contact_id && entry.dispatch_generation === expected.dispatch_generation &&
    entry.voice_reservation_id === expected.voice_reservation_id;
  const allowed = [value, ...(value.household_snapshot?.entries ?? [])];
  const invalidState = value.dequeued !== (value.advance_state === "dequeued") ||
    (value.advance_state === "superseded" && (!value.call_sid || removed.length !== 0));
  if (invalidState || removed.some(entry => !allowed.some(expected => same(entry, expected))) ||
    (value.advance_state !== "superseded" && !removed.some(entry => same(entry, value))))
    context.addIssue({ code: "custom", message: "Queue acknowledgement does not match its captured entries" });
});
