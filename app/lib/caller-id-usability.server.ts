import { eq } from "drizzle-orm";
import { workspace_number as workspaceNumberTable } from "@/db/schema";
import { createTenantDb } from "@/server/tenant-db";
import { canSpendFromNumber } from "@/lib/number-rental-lifecycle";

/**
 * Fail closed when a caller supplies a `from` number this workspace cannot send from.
 *
 * ## The hole this closes
 *
 * `from` reaches Twilio as the sending number, and nothing between the request
 * and the provider call ever checked whether the workspace could use it:
 *
 *   POST /api/sms              caller_id  → dispatchCampaignSmsBatch → … → from
 *   POST /api/chat_sms         caller_id  → sendMessage({ from })
 *   POST /workspaces/:id/chats from_number → parseChatSenderSelection → sendMessage
 *
 * `resolvePreDispatchGate` checked that a caller id was **present**
 * (`if (requiresCallerId && !callerIdForGate)`) and never that it was **usable**.
 * `parseChatSenderSelection` returns its `rawFrom` verbatim. And
 * `buildTwilioOutboundSmsCreateParams` puts the value straight into the provider
 * payload as `from`.
 *
 * So any authenticated member of any workspace could send SMS appearing to come
 * from another tenant's number — spending the victim's A2P registration and
 * messaging consent without their knowledge, and billing their number.
 *
 * ## Not a new rule: this is the existing one, applied everywhere
 *
 * `create-with-script.server.ts` already refuses a `caller_id` this workspace
 * cannot send from, including a number suspended for an unpaid rental, and
 * distinguishes "suspended" from "not yours" in its error. That rule existed on
 * exactly one of the three send paths, which is why the other two were open.
 *
 * This helper is the same rule expressed once, on top of the existing
 * {@link canSpendFromNumber} predicate, so there is a single answer to "may this
 * workspace send from this number" rather than three that can drift.
 */
export type CallerIdUsability =
  | { kind: "ok" }
  /** No caller id supplied — a Messaging Service supplies the sender. Not an error. */
  | { kind: "not_provided" }
  /** The number is not registered to this workspace at all. */
  | { kind: "not_owned"; callerId: string }
  /** The workspace owns the number, but it is suspended for an unpaid rental. */
  | { kind: "suspended"; callerId: string };

/**
 * Whether `callerId` is a number this workspace can send from.
 *
 * Scoped through `createTenantDb`, so the tenancy predicate is not something a
 * caller can forget — the same reason `create-with-script.server.ts` reads its
 * numbers that way.
 */
export async function resolveCallerIdUsability(
  workspaceId: string,
  callerId: string | null | undefined,
): Promise<CallerIdUsability> {
  const wanted = String(callerId ?? "").trim();
  if (!wanted) return { kind: "not_provided" };

  const tdb = createTenantDb(workspaceId);
  const owned = await tdb.workspace_number.findFirst({
    where: eq(workspaceNumberTable.phone_number, wanted),
    columns: { id: true, suspended_at: true },
  });

  if (!owned) return { kind: "not_owned", callerId: wanted };
  if (!canSpendFromNumber(owned)) return { kind: "suspended", callerId: wanted };

  return { kind: "ok" };
}

export class CallerIdNotUsableError extends Error {
  readonly callerId: string;
  readonly reason: "not_owned" | "suspended";

  constructor(callerId: string, reason: "not_owned" | "suspended") {
    super(
      reason === "suspended"
        ? `caller_id is suspended for an unpaid rental: ${callerId}`
        : `caller_id is not a number owned by this workspace: ${callerId}`,
    );
    this.name = "CallerIdNotUsableError";
    this.callerId = callerId;
    this.reason = reason;
  }
}

/** Throwing form for callers that cannot return a structured outcome. */
export async function assertCallerIdUsable(
  workspaceId: string,
  callerId: string | null | undefined,
): Promise<void> {
  const usability = await resolveCallerIdUsability(workspaceId, callerId);
  if (usability.kind === "not_owned" || usability.kind === "suspended") {
    throw new CallerIdNotUsableError(usability.callerId, usability.kind);
  }
}

/**
 * The refusal message for an unusable caller id, or `null` when it is fine.
 *
 * Every send path needs the same two-line guard, and the wording is what keeps
 * the paths consistent — "suspended for an unpaid rental" needs a different remedy
 * from "not a number this workspace owns", and `create-with-script.server.ts`
 * already draws that distinction. Folding the decision *and* the message in here
 * is what stops each route from growing its own copy of the block.
 */
export function callerIdRefusalMessage(usability: CallerIdUsability): string | null {
  if (usability.kind === "not_owned") {
    return "Caller ID must be a phone number that belongs to this workspace.";
  }
  if (usability.kind === "suspended") {
    return "Caller ID is suspended for an unpaid rental — add credits to restore it.";
  }
  return null;
}