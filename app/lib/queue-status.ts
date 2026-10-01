import type { Database } from "@/lib/db-types";

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
export const QUEUE_LIFECYCLE_FAILED = "failed" as const;
export const QUEUE_STATUS_FILTERS = [
  QUEUE_STATUS_QUEUED,
  "assigned",
  "active",
  "completed",
] as const;

/**
 * Raw `campaign_queue.status` values that can be written back via the queue
 * UI (re-queue or dequeue). Distinct from {@link QUEUE_STATUS_FILTERS}, which
 * are derived display/filter states (assigned/active/completed are not writable
 * status values).
 */
export const QUEUE_SETTABLE_STATUSES = [
  QUEUE_STATUS_QUEUED,
  QUEUE_STATUS_DEQUEUED,
] as const;

export type QueueSettableStatus = (typeof QUEUE_SETTABLE_STATUSES)[number];

export type QueueStatusFilter = (typeof QUEUE_STATUS_FILTERS)[number];
export type QueueDisplayState = QueueStatusFilter;
export type QueueLifecycle =
  | typeof QUEUE_STATUS_QUEUED
  | typeof QUEUE_STATUS_DEQUEUED
  | typeof QUEUE_LIFECYCLE_ASSIGNED
  | typeof QUEUE_LIFECYCLE_CANCELED;

export type QueueStateLike = {
  status?: string | null;
  /**
   * A real `timestamptz`, so a server-side Drizzle row hands back a `Date`
   * (#2213) — and a `string`, because these helpers also run in the browser.
   *
   * `useQueue.ts` is a client hook and calls `isQueued` / `isDequeued` on
   * payloads that arrived over JSON, where a `Date` is re-stringified on the
   * wire. So both arms are live: `Date` from the model, `string` from a loader
   * or realtime payload. The field is only ever tested for presence, never
   * compared or sorted, so the union costs nothing.
   *
   * The earlier comment on this field claimed the string arm was for "raw sql
   * projections and RPC payloads". That was wrong, and wrong in a way that
   * mattered: it would have led the next reader to delete the arm, breaking
   * every client-side caller.
   */
  dequeued_at?: Date | string | null;
  dequeued_by?: string | null;
  dequeued_reason?: string | null;
  assigned_to_user_id?: string | null;
  provider_status?: string | null;
  queue_state?: string | null;
};

const UUID_STATUS_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toQueueStateLike(
  value: QueueStateLike | string | null | undefined,
  dequeuedAt?: Date | string | null,
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

  return isUserAssignment(queue.status) && queue.status != null ? queue.status : null;
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
  return queue.queue_state === QUEUE_STATUS_QUEUED && !queue.dequeued_at;
}

/**
 * True when the queue entry has been fully dequeued, regardless of why it finished.
 */
export function isDequeued(
  value: QueueStateLike | string | null | undefined,
  dequeuedAt?: Date | string | null,
): boolean {
  const queue = toQueueStateLike(value, dequeuedAt);
  return queue.queue_state === QUEUE_STATUS_DEQUEUED || Boolean(queue.dequeued_at);
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
  dequeuedAt?: Date | string | null,
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
  dequeuedAt?: Date | string | null,
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
  dequeuedAt?: Date | string | null,
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

// ─── QueueEntry transition table ──────────────────────────────────────────
//
// This is the single source of truth for the QueueEntry lifecycle (queued →
// assigned → dequeued/canceled, per CONTEXT.md "Queue Entry") on the TS
// side. The plpgsql RPCs (claim_next_queue_contact and friends) implement
// the same lifecycle independently, which is why four repair migrations
// (20260716120000, 20260716130000, 20260722120000, 20260803120000) exist —
// the two drifted. Issue #1240 tracks fixing that class of bug in two
// parts: B1 (this table, TS-only) and B2 (generate/verify the RPCs'
// column vocabularies against this table — not yet built). Keep this
// section pure data + pure functions so B2 can import and consume it
// without pulling in any DB client.

/**
 * Writable `campaign_queue.queue_state` values. `canceled`
 * ({@link QUEUE_LIFECYCLE_CANCELED}) is intentionally excluded: it's a
 * read-only value `getQueueLifecycle()` can report, but as of this census
 * (2026-08, B1) no writer — TS or plpgsql RPC — ever sets queue_state to
 * "canceled". Add it here once a real writer exists.
 *
 * `failed` ({@link QUEUE_LIFECYCLE_FAILED}) IS included even though no TS
 * writer sets it: the plpgsql RPC `fail_exhausted_campaign_queue_contacts`
 * writes it on every auto-dialer turn (PERFORMed by
 * reset_stale_campaign_queue_claims) when a contact exhausts max attempts.
 * The same UPDATE stamps `dequeued_at`, so `isDequeued()` reports such rows
 * as finished — but the state exists in the data and readers switching on
 * queue_state directly must be able to represent it (#1252).
 */
export const QUEUE_ENTRY_STATES = [
  QUEUE_STATUS_QUEUED,
  QUEUE_LIFECYCLE_ASSIGNED,
  QUEUE_STATUS_DEQUEUED,
  QUEUE_LIFECYCLE_FAILED,
] as const;
export type QueueEntryState = (typeof QUEUE_ENTRY_STATES)[number];

/** campaign_queue columns a QueueEntry transition can write. */
export type QueueEntryColumn =
  | "queue_state"
  | "assigned_to_user_id"
  | "provider_status"
  | "dequeued_at"
  | "dequeued_by"
  | "dequeued_reason"
  | "claimed_at";

/**
 * Named QueueEntry transitions. `provider_status` is not a distinct
 * queue_state — it's a same-state update layering a Twilio/provider status
 * onto an already-assigned row (queue_state stays "assigned") without
 * touching assignment or dequeue columns.
 */
export type QueueEntryTransitionName =
  | "queued"
  | "assigned"
  | "provider_status"
  | "dequeued"
  | "failed";

export interface QueueEntryTransitionDef {
  /** The queue_state value this transition writes. */
  readonly queueState: QueueEntryState;
  /**
   * States a row must currently be in for this transition to be legal.
   * "any" means no precondition — the existing callers below are
   * context-free (they don't read current state before writing), so most
   * transitions are permissive today. Tightening this is a future gate,
   * not a B1 behavior change.
   */
  readonly legalFrom: readonly QueueEntryState[] | "any";
  /** Exact set of campaign_queue columns this transition writes, every time (including nulling-out columns not relevant to the target state). */
  readonly columns: readonly QueueEntryColumn[];
}

const QUEUE_ENTRY_FULL_COLUMN_SET: readonly QueueEntryColumn[] = [
  "assigned_to_user_id",
  "dequeued_at",
  "dequeued_by",
  "dequeued_reason",
  "provider_status",
  "queue_state",
];

// Exactly what fail_exhausted_campaign_queue_contacts writes — the full set
// minus `dequeued_by`, which that UPDATE never touches (its WHERE guard
// `dequeued_at IS NULL` means the column is still NULL on every row it hits).
const QUEUE_ENTRY_FAILED_COLUMN_SET: readonly QueueEntryColumn[] = [
  "assigned_to_user_id",
  "dequeued_at",
  "dequeued_reason",
  "provider_status",
  "queue_state",
];

/**
 * Requeue clears the in-flight claim marker (#2208). A requeued row is back in
 * the pool and held by nobody — the same argument the `assigned_to_user_id =
 * NULL` in that branch already makes — so a marker left on it would be a lie,
 * and `claimIsLive` would hold it out of every split for a whole lease.
 *
 * `dequeued` deliberately does NOT clear it, and that is a decision, not an
 * oversight. Every existing reader of `claimed_at`
 * (`campaign_queue_has_pending_work`, `reset_stale_campaign_queue_claims`,
 * and the split, which reads only `onlyQueued` rows) already guards on
 * `dequeued_at is null`, so a marker on a dequeued row is unreachable — and
 * the requeue transition above is the single place a row becomes visible again,
 * so it is the single place that has to clear it. Adding it to `dequeued` would
 * have meant rewriting two hot production functions (`dequeue_contact` with its
 * household fan-out and #1260 race guard, and `dequeue_household`) to null a
 * column nobody can read on those rows.
 *
 * `assigned` also does not clear it: the manual-dial claim path
 * (`select_and_update_campaign_contacts`) sets `claimed_at` and
 * `assigned_to_user_id` in one UPDATE, so nulling the marker on a later assign
 * would erase a live claim.
 */
const QUEUE_ENTRY_CLAIM_CLEARING_COLUMN_SET: readonly QueueEntryColumn[] = [
  "assigned_to_user_id",
  "claimed_at",
  "dequeued_at",
  "dequeued_by",
  "dequeued_reason",
  "provider_status",
  "queue_state",
];

export const QUEUE_ENTRY_TRANSITIONS: Record<
  QueueEntryTransitionName,
  QueueEntryTransitionDef
> = {
  queued: {
    queueState: QUEUE_STATUS_QUEUED,
    legalFrom: "any",
    columns: QUEUE_ENTRY_CLAIM_CLEARING_COLUMN_SET,
  },
  assigned: {
    queueState: QUEUE_LIFECYCLE_ASSIGNED,
    legalFrom: "any",
    columns: QUEUE_ENTRY_FULL_COLUMN_SET,
  },
  provider_status: {
    queueState: QUEUE_LIFECYCLE_ASSIGNED,
    legalFrom: [QUEUE_LIFECYCLE_ASSIGNED],
    columns: ["provider_status", "queue_state"],
  },
  dequeued: {
    queueState: QUEUE_STATUS_DEQUEUED,
    legalFrom: "any",
    columns: QUEUE_ENTRY_FULL_COLUMN_SET,
  },
  failed: {
    // plpgsql-only today: no build*QueueUpdate helper writes this transition.
    // It documents fail_exhausted_campaign_queue_contacts, whose UPDATE
    // filters on the queued/assigned/failed states mirrored by legalFrom.
    queueState: QUEUE_LIFECYCLE_FAILED,
    legalFrom: ["queued", "assigned", "failed"],
    columns: QUEUE_ENTRY_FAILED_COLUMN_SET,
  },
};

/**
 * True when `name` is a legal transition out of `fromState`. `fromState` of
 * `null`/`undefined` (unknown current state) is only legal for transitions
 * whose `legalFrom` is "any".
 */
export function isLegalQueueEntryTransition(
  name: QueueEntryTransitionName,
  fromState: QueueEntryState | null | undefined,
): boolean {
  const def = QUEUE_ENTRY_TRANSITIONS[name];
  if (def.legalFrom === "any") return true;
  if (fromState == null) return false;
  return def.legalFrom.includes(fromState);
}

/**
 * The real `campaign_queue` update shape, inferred from the schema.
 *
 * This was `Partial<Record<QueueEntryColumn, unknown>>`, which type-checked no
 * value at all: `dequeued_at` could be handed a string while the column is a
 * `timestamptz` and the compiler stayed quiet (#2213). Inferred, so it follows
 * the schema instead of restating it.
 */
type QueueEntryColumnValues = Database["public"]["Tables"]["campaign_queue"]["Update"];

/**
 * Build the campaign_queue UPDATE payload for a named transition. Every
 * column in the transition's {@link QueueEntryTransitionDef.columns} is
 * always present on the returned object — explicit values from `values`
 * win, everything else is nulled out except `queue_state`, which is always
 * the transition's fixed target value.
 */
function buildQueueEntryUpdate(
  name: QueueEntryTransitionName,
  values: QueueEntryColumnValues,
): Database["public"]["Tables"]["campaign_queue"]["Update"] {
  const def = QUEUE_ENTRY_TRANSITIONS[name];
  const update: QueueEntryColumnValues = {};
  for (const column of def.columns) {
    if (column === "queue_state") {
      update.queue_state = def.queueState;
    } else if (column in values) {
      // One cast, because TypeScript resolves a write through a union key to the
      // *intersection* of every column's type — `string & Date & null` — which
      // no value can satisfy. The values themselves are checked where it
      // matters: at each caller's `values` argument, which is typed. This cast
      // moves nothing across the boundary unchecked.
      (update as Record<string, unknown>)[column] = values[column];
    } else {
      (update as Record<string, unknown>)[column] = null;
    }
  }
  return update;
}

export function buildQueuedQueueUpdate(): Database["public"]["Tables"]["campaign_queue"]["Update"] {
  return buildQueueEntryUpdate("queued", {});
}

export function buildAssignedQueueUpdate(
  assignedToUserId: string,
): Database["public"]["Tables"]["campaign_queue"]["Update"] {
  return buildQueueEntryUpdate("assigned", {
    assigned_to_user_id: assignedToUserId,
  });
}

export function buildProviderStatusQueueUpdate(
  providerStatus: string,
): Database["public"]["Tables"]["campaign_queue"]["Update"] {
  return buildQueueEntryUpdate("provider_status", {
    provider_status: providerStatus,
  });
}

export function buildDequeuedQueueUpdate(
  dequeuedBy: string | null,
  dequeuedReason: string,
): Database["public"]["Tables"]["campaign_queue"]["Update"] {
  return buildQueueEntryUpdate("dequeued", {
    dequeued_at: new Date(),
    dequeued_by: dequeuedBy,
    dequeued_reason: dequeuedReason,
    // A dequeued row is never in flight, so the claim marker must go with it.
    // Clearing it here rather than at each dequeue call site is deliberate:
    // this builder is the single funnel for every dequeue path (SMS, manual
    // dial, API, workspace), so a marker left behind anywhere is impossible.
    // #2208 — a claim left set would make the next split hold the row back
    // forever instead of moving it.
    claimed_at: null,
  });
}

// NOTE: releaseAssignedQueueForUser lives in @/lib/campaign-queue-db.server —
// import it from there. Re-exporting it here dragged the entire server db
// graph into the client bundle (this file is imported by client components),
// which crashed client-side navigation with "DATABASE_URL is required".
