import {
  isDispatchAllowedAt,
  nextDispatchOpenAt,
  type DispatchPolicy,
} from "@/lib/campaign-dispatch-policy";
import type {
  CampaignDeferralCause,
  CampaignSmsBatchOutcome,
  CampaignSmsDispatchCounts,
} from "@/lib/campaign-batch-outcome";
import { messageCampaignRequiresCallerId } from "@/lib/sms-send-resolve";
import {
  assertWorkspaceCanSendSms,
  WorkspaceSmsNotReadyError,
} from "@/lib/twilio-readiness.server";
import type { loadCampaignSmsDispatchData } from "@/lib/sms-campaign-db.server";

/** The campaign row the gates below read. */
type CampaignRow = Awaited<ReturnType<typeof loadCampaignSmsDispatchData>>["campaign"];

type PreDispatchGateInput = {
  workspaceId: string;
  campaign: CampaignRow;
  /** The request's own caller id, if it supplied one. */
  callerId: string;
  /**
   * Public-API contract (`/api/sms`): when the campaign's send mode requires a
   * from number, the request must supply `callerId` explicitly — the campaign's
   * stored caller-id does not satisfy the gate (it still feeds the `from`
   * fallback). Worker dispatch omits this and uses the campaign's configured
   * caller-id.
   */
  requireExplicitCallerId: boolean;
  /** Rows still queued for this campaign, reported back as `queuedRemaining`. */
  queuedRemaining: number;
  /**
   * The campaign's send policy. Passed in rather than derived here because the
   * dispatch loop reuses it for per-recipient quiet hours after this returns.
   */
  sendPolicy: DispatchPolicy;
};

/**
 * Counts for an outcome that returns before a single row is touched. Spelling
 * the six zeros out at each gate is how one of them quietly drifts.
 */
function noWorkCounts(): CampaignSmsDispatchCounts {
  return {
    sent: 0,
    failed: 0,
    dequeued: 0,
    deferred: 0,
    unaffordable: 0,
    exhausted: 0,
  };
}

/**
 * A deferral raised before any row was selected, so nothing to report and
 * nothing done: no responses, and the whole audience still queued.
 *
 * Both gates in this module return that shape, and everything that makes it a
 * deferral rather than a dispatch — empty `responses`, zeroed counts, the
 * audience intact — is identical whichever condition held the batch. Only the
 * cause and its payload differ, so only those are passed in.
 */
function deferredBeforeAnyRow(
  cause: CampaignDeferralCause,
  queuedRemaining: number,
): CampaignSmsBatchOutcome {
  return {
    kind: "deferred",
    ...cause,
    responses: [],
    progress: { counts: noWorkCounts(), queuedRemaining },
  };
}

/**
 * The gates that decide whether this batch may send at all, asked once, before
 * a single row is selected.
 *
 * Every one of them is a workspace- or campaign-level condition, so every one
 * resolves for the whole batch. That is the point: none of them says anything
 * about a recipient, and none of them may leave a row marked as tried. Each
 * returns the outcome to hand back, or `null` when the batch may proceed.
 */
export async function resolvePreDispatchGate(
  input: PreDispatchGateInput,
): Promise<CampaignSmsBatchOutcome | null> {
  const { workspaceId, campaign, callerId, requireExplicitCallerId, sendPolicy } = input;

  const requiresCallerId = messageCampaignRequiresCallerId(campaign?.sms_send_mode);
  const effectiveCallerId = callerId || String(campaign?.caller_id ?? "").trim();
  const callerIdForGate = requireExplicitCallerId ? callerId : effectiveCallerId;
  if (requiresCallerId && !callerIdForGate) {
    return { kind: "caller_id_required" };
  }

  // Workspace compliance / readiness (#2081).
  //
  // This used to be the first statement of `sendSingleCampaignSms`, so it ran
  // once per CONTACT and threw a workspace-scoped error into the per-member
  // rejection handler. That handler is a per-recipient channel: it recorded an
  // attempt failure against the row, incrementing `attempt_count`. The same
  // tick then runs the dead-letter sweep at `max_attempts = 5`, so five ticks
  // of a non-ready workspace flipped the ENTIRE audience to `failed` with
  // "Max queue attempts exceeded". Nothing had been sent and no contact was ever
  // at fault — A2P not approved, a sender pool out of sync, or an unverified
  // toll-free number is a workspace condition, identical for every recipient,
  // and re-approving compliance did not bring anyone back because the rows were
  // already `dequeued_at = now()`.
  //
  // So it is asked here, once, and the answer becomes a deferral. A
  // `WorkspaceSmsNotReadyError` is a verdict and is returned as one. Anything
  // else is a real fault — a database that is down, say — and is rethrown, so a
  // broken precondition cannot be absorbed into a deferral that looks healthy.
  try {
    await assertWorkspaceCanSendSms({ workspaceId });
  } catch (error) {
    if (error instanceof WorkspaceSmsNotReadyError) {
      return deferredBeforeAnyRow(
        { because: "workspace_not_ready", reasons: error.reasons },
        input.queuedRemaining,
      );
    }
    throw error;
  }

  // Campaign send-window / CASL quiet-hours gate. This is the authoritative
  // campaign SMS path and is campaign-only — 1:1 chat sends use a different
  // route (chat_sms) and are never gated here. When the current tick falls
  // outside the campaign's send window we DEFER the whole batch: nothing is
  // dispatched and nothing is dequeued, so contacts remain queued for a later
  // in-window tick. A `null` window is unrestricted. The outcome carries the
  // exact next open so the durable adapter can schedule its successor at the
  // window boundary instead of a fixed poll interval.
  if (!isDispatchAllowedAt(sendPolicy)) {
    return deferredBeforeAnyRow(
      {
        because: "send_window",
        // Defensive fallback: a parsed window with active intervals always has
        // an open instant within the week, but never hot-loop if that
        // invariant is somehow violated.
        nextOpenAt: nextDispatchOpenAt(sendPolicy) ?? new Date(Date.now() + 15 * 60 * 1000),
      },
      input.queuedRemaining,
    );
  }

  return null;
}
