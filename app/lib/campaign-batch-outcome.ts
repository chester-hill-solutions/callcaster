/**
 * What one campaign batch did, as the two adapters see it.
 *
 * These types live in their own module for a structural reason, not a tidiness
 * one. `campaign-sms-dispatch.server.ts` calls `resolvePreDispatchGate`, and
 * the gate has to return an outcome — so if the outcome type lived in the
 * dispatch loop, the gate would import the module that imports it. Types only,
 * no runtime and no imports, so nothing here can close that loop.
 *
 * The asymmetry is deliberate and worth leaving alone: the SMS outcome lives
 * here because the gate builds one, while `campaign-ivr-dispatch.server.ts`
 * declares its own next to the code that produces it. IVR's outcome differs —
 * no per-contact `responses`, optional `progress` — and merging the two would
 * mean hiding that behind type parameters. What genuinely is shared is
 * `CampaignDeferralCause`, which all three files reference.
 */

export type ContactDispatchResult = Record<
  string | number,
  {
    success: boolean;
    skipped?: boolean;
    deferred?: boolean;
    reason?: string;
    error?: string;
    [key: string]: unknown;
  }
>;

export type CampaignSmsDispatchCounts = {
  sent: number;
  failed: number;
  /** Dequeued without a send: opt-out, landline, duplicate. */
  dequeued: number;
  /** Left queued for a later tick (recipient quiet hours). */
  deferred: number;
  /** Left queued because the remaining balance could not cover the estimated cost. */
  unaffordable: number;
  /** Dead-lettered by the exhaustion sweep: failed rows at the attempt maximum. */
  exhausted: number;
};

/**
 * What held a batch back, and that cause's payload.
 *
 * This is the part every blocked outcome shares, and it is declared once here
 * because the SMS outcome, the IVR outcome and the worker adapter's parameter
 * all used to spell it out. The payloads around it genuinely differ — SMS
 * reports per-contact `responses` and a guaranteed `progress`, IVR has neither
 * — so each keeps its own; only the cause is common, and only the cause is
 * shared.
 */
export type CampaignDeferralCause =
  | {
      because: "send_window";
      /**
       * The exact next instant sending is allowed, so the durable adapter
       * schedules its successor on the boundary rather than polling.
       */
      nextOpenAt: Date;
    }
  | {
      /**
       * The workspace is not cleared to send SMS: A2P 10DLC, sender pool sync,
       * toll-free verification, or Messaging Service provisioning (#2081).
       * Operator-facing, so the block is never reported as a dead-lettered
       * queue.
       */
      because: "workspace_not_ready";
      reasons: string[];
    };

export type CampaignSmsBatchOutcome =
  | { kind: "insufficient_credits" }
  | { kind: "caller_id_required" }
  | {
      /**
       * The batch stopped without finishing because a workspace- or
       * campaign-level condition says now is not the time to send.
       *
       * This is the honest counterpart to a per-contact failure, and an adapter
       * must not confuse the two: nothing was dequeued, no attempt was
       * recorded, and no recipient is at fault. The audience is exactly as it
       * was. Treating this as a failure is what burned whole audiences when a
       * workspace's A2P registration was not approved yet (#2081).
       *
       * `because` names the condition, and only that condition's payload is
       * present.
       */
      kind: "deferred";
      /** Empty when a gate stopped the batch; otherwise the rows that finished first. */
      responses: ContactDispatchResult[];
      /** Aggregate work completed before the batch deferred. */
      progress: { counts: CampaignSmsDispatchCounts; queuedRemaining: number };
    } & CampaignDeferralCause
  | {
      kind: "dispatched";
      responses: ContactDispatchResult[];
      counts: CampaignSmsDispatchCounts;
      /**
       * Rows still queued after this batch: quiet-hours deferrals, failed
       * sends that still have attempts left, unaffordable rows, and contacts
       * beyond `maxContacts`.
       */
      queuedRemaining: number;
      /**
       * The balance ran out part-way through the batch and cannot cover
       * another send: adapters treat this like the entry-level
       * `insufficient_credits` outcome instead of scheduling a successor.
       */
      creditsExhausted: boolean;
    };
