
import type { Database, Tables, TablesInsert } from "@/lib/db-types";
import {
  findCallBySid,
  upsertCallBySid,
  updateCallBySid,
  updateOutreachAttemptForWorkspace,
  findCampaignTypeByCampaignId,
} from "@/lib/telephony-db.server";
import {
  voiceBillingKindFromCampaignType,
  voiceCreditsFromDurationSeconds,
  TERMINAL_BILLABLE_CALL_STATUSES,
  type VoiceBillingKind,
} from "../../shared/pricing";
import { insertTransactionHistoryIdempotent } from "@/lib/transaction-history.server";
import { callKey } from "@/lib/billing-keys";
import { debitAmountFromCredits } from "@/lib/pricing";
import { logger } from "@/lib/logger.server";

export {
  voiceBillingKindFromCampaignType,
  type VoiceBillingKind,
} from "../../shared/pricing";
export {
  TERMINAL_BILLABLE_CALL_STATUSES,
  TERMINAL_BILLABLE_SMS_STATUSES,
} from "../../shared/pricing";

export function twilioParamToUnderCase(str: string): string {
  return str.replace(/(?!^)([A-Z])/g, "_$1").toLowerCase();
}

export function twilioParamsToUnderCase(
  obj: Record<string, string>,
): Record<string, unknown> {
  const newObj: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    newObj[twilioParamToUnderCase(key)] = value;
  }
  return newObj;
}

function getString(v: unknown): string | null {
  if (typeof v === "string") return v;
  return v == null ? null : String(v);
}

function getNumber(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Build a call row upsert from Twilio status callback form params (PascalCase keys). */
export function buildCallUpsertFromTwilioParams(
  params: Record<string, string>,
): TablesInsert<"call"> {
  const underCaseData = twilioParamsToUnderCase(params);
  return {
    sid: getString(underCaseData.call_sid) ?? "",
    date_created:
      getString(underCaseData.timestamp) ?? new Date().toISOString(),
    date_updated: new Date().toISOString(),
    parent_call_sid: getString(underCaseData.parent_call_sid),
    account_sid: getString(underCaseData.account_sid),
    to: getString(underCaseData.to),
    from: getString(underCaseData.from),
    status: (getString(underCaseData.call_status) ??
      getString(underCaseData.status)) as Database["public"]["Enums"]["call_status"] | null,
    start_time: getString(underCaseData.start_time),
    end_time: getString(underCaseData.end_time),
    duration: String(
      Math.max(
        getNumber(underCaseData.duration) ?? 0,
        getNumber(underCaseData.call_duration) ?? 0,
      ),
    ),
    direction: getString(underCaseData.direction),
    api_version: getString(underCaseData.api_version),
    forwarded_from: getString(underCaseData.forwarded_from),
    caller_name: getString(underCaseData.caller_name),
    price: getString(underCaseData.price),
    campaign_id: getNumber(underCaseData.campaign_id) ?? undefined,
    contact_id: getNumber(underCaseData.contact_id) ?? undefined,
    call_duration: getNumber(underCaseData.call_duration),
    recording_duration: getString(underCaseData.recording_duration),
    recording_sid: getString(underCaseData.recording_sid),
    recording_url: getString(underCaseData.recording_url),
    user_id: getString(underCaseData.user_id) ?? undefined,
    is_last: false,
  };
}

export type CallOutreachContext = {
  outreachAttemptId: number | undefined;
  workspaceId: string | undefined;
};

/** Resolve outreach attempt + workspace from call row, falling back to parent call leg. */
export async function resolveCallOutreachContext(
    callRow: {
    outreach_attempt_id?: number | null;
    workspace?: string | null;
    parent_call_sid?: string | null;
  },
): Promise<CallOutreachContext> {
  let outreachAttemptId = callRow.outreach_attempt_id ?? undefined;
  let workspaceId = callRow.workspace ?? undefined;

  if (outreachAttemptId == null && callRow.parent_call_sid) {
    const parentCall = await findCallBySid(callRow.parent_call_sid);
    if (parentCall) {
      workspaceId = parentCall.workspace ?? undefined;
      outreachAttemptId = parentCall.outreach_attempt_id ?? undefined;
    }
  }

  return { outreachAttemptId, workspaceId };
}

export function billingUnitsFromCallDurationSeconds(
  duration: number,
  kind: VoiceBillingKind,
): number {
  return voiceCreditsFromDurationSeconds(duration, kind);
}

export const TERMINAL_CALL_STATUSES = TERMINAL_BILLABLE_CALL_STATUSES;

type ProcessCallStatusOptions = {
  campaignType?: string | null;
  workspaceId?: string;
  campaignId?: number | null;
  contactId?: number | null;
  outreachAttemptId?: number | null;
  userId?: string | null;
  note?: string;
};

/**
 * Single source of truth for call status persistence and billing.
 *
 * - Upserts the call row from Twilio status-callback params.
 * - Enriches missing workspace/campaign/user from the parent call leg so
 *   status callbacks for child legs (manual dial, handset dial) can resolve
 *   the workspace.
 * - Guards against regressing a terminal status to a non-terminal status.
 * - Debits credits only for terminal statuses with a non-zero duration, using
 *   the billing kind derived from the campaign type.
 */
export async function processCallStatusWebhook(
  updateData: TablesInsert<"call">,
  options: ProcessCallStatusOptions = {},
): Promise<{
  call: Tables<"call">;
  billingResult: { inserted: boolean; existingId?: number } | null;
}> {
  if (!updateData.sid) {
    throw new Error("Missing CallSid in processCallStatusWebhook");
  }

  const update: Partial<TablesInsert<"call">> = { ...updateData };

  // Enrich from explicit options if the webhook payload is missing them.
  if (options.workspaceId && !update.workspace) {
    update.workspace = options.workspaceId;
  }
  if (options.campaignId != null && update.campaign_id == null) {
    update.campaign_id = options.campaignId;
  }
  if (options.contactId != null && update.contact_id == null) {
    update.contact_id = options.contactId;
  }
  if (options.outreachAttemptId != null && update.outreach_attempt_id == null) {
    update.outreach_attempt_id = options.outreachAttemptId;
  }
  if (options.userId != null && update.user_id == null) {
    update.user_id = options.userId;
  }

  // If we still do not know the workspace, try to inherit it from the parent
  // call leg. This is the normal path for manual dial child legs whose parent
  // was created by /api/dial, and for handset dial child legs whose parent
  // was created by /api/call.
  if (!update.workspace && update.parent_call_sid) {
    const parent = await findCallBySid(update.parent_call_sid);
    if (parent) {
      if (!update.workspace) update.workspace = parent.workspace ?? undefined;
      if (update.campaign_id == null && parent.campaign_id != null) {
        update.campaign_id = parent.campaign_id;
      }
      if (update.contact_id == null && parent.contact_id != null) {
        update.contact_id = parent.contact_id;
      }
      if (update.outreach_attempt_id == null && parent.outreach_attempt_id != null) {
        update.outreach_attempt_id = parent.outreach_attempt_id;
      }
      if (update.user_id == null && parent.user_id != null) {
        update.user_id = parent.user_id;
      }
    }
  }

  const newStatus = update.status ? String(update.status).toLowerCase() : null;

  const call = await upsertCallBySid(update as Partial<Tables<"call">> & { sid: string });
  if (!call) {
    throw new Error(`Failed to upsert call ${updateData.sid}`);
  }

  const status = String(update.status ?? "").toLowerCase();
  const duration = Math.max(
    Number(update.duration) || 0,
    Number(update.call_duration) || 0,
  );
  const isTerminal = TERMINAL_BILLABLE_CALL_STATUSES.includes(
    status as (typeof TERMINAL_BILLABLE_CALL_STATUSES)[number],
  );

  let billingResult: { inserted: boolean; existingId?: number } | null = null;

  if (call.workspace && isTerminal && duration > 0) {
    let campaignType = options.campaignType ?? null;
    if (campaignType == null && call.campaign_id != null) {
      try {
        campaignType = await findCampaignTypeByCampaignId(call.campaign_id, call.workspace);
      } catch (e) {
        logger.error("Failed to resolve campaign type for billing", e);
      }
    }
    const billingKind = voiceBillingKindFromCampaignType(campaignType);
    const credits = billingUnitsFromCallDurationSeconds(duration, billingKind);
    const note =
      options.note ??
      (call.contact_id
        ? `Call ${call.sid}, Contact ${call.contact_id}, Outreach Attempt ${call.outreach_attempt_id}`
        : `Call ${call.sid} (API/staffed dial)`);

    billingResult = await insertTransactionHistoryIdempotent({
      workspaceId: call.workspace,
      type: "DEBIT",
      amount: debitAmountFromCredits(credits),
      note,
      idempotencyKey: callKey(call.sid, billingKind),
      callSid: call.sid,
      campaignId: call.campaign_id ?? null,
    });
  }

  return { call, billingResult };
}

/**
 * Persist a call status update from Twilio status-callback form params.
 * Routes `ivr/status` and `auto-dial/status` (and any future status callback
 * route) should route through this so that persistence + disposition use the
 * same canonical path as `call-status` (fixes the double-debit hazard from
 * issue #1004 by ensuring all status routes use `twilioParamsToUnderCase`).
 *
 * Behavior:
 * - Updates `call.end_time` / `call.status` / `call.duration` for `callSid`.
 * - Optionally updates `outreach_attempt.disposition` when provided.
 *
 * Returns the row from the call update (so callers can read
 * `outreach_attempt_id` / `workspace` for billing) when `selectResult` is true.
 */
export async function persistCallStatusFromParams(args: {
  params: Record<string, string>;
  disposition?: string | null;
  outreachAttemptId?: number | null;
  selectResult?: boolean;
}): Promise<Tables<"call"> | null> {
  const underCase = twilioParamsToUnderCase(args.params);
  const callSid =
    typeof underCase.call_sid === "string" ? underCase.call_sid : null;
  if (!callSid) {
    throw new Error("Missing CallSid in status params");
  }
  const timestamp =
    typeof underCase.timestamp === "string" ? underCase.timestamp : null;
  const status = args.disposition
    ? String(args.disposition).toLowerCase()
    : typeof underCase.call_status === "string"
      ? String(underCase.call_status).toLowerCase()
      : null;

  const update: Record<string, unknown> = {};
  if (timestamp) {
    update.end_time = new Date(timestamp).toISOString();
  }
  if (status) {
    update.status = status;
  }
  const duration = Math.max(
    Number(underCase.duration) || 0,
    Number(underCase.call_duration) || 0,
  );
  if (duration > 0) {
    update.duration = String(duration);
  }

  if (Object.keys(update).length === 0) {
    return null;
  }

  const existing = await findCallBySid(callSid);
  if (!existing?.workspace) {
    throw new Error(`Call ${callSid} not found or missing workspace`);
  }

  let data: Tables<"call"> | null = null;
  if (args.selectResult) {
    data = (await updateCallBySid(
      existing.workspace,
      callSid,
      update as Partial<Tables<"call">>,
    )) as Tables<"call"> | null;
  } else {
    await updateCallBySid(
      existing.workspace,
      callSid,
      update as Partial<Tables<"call">>,
    );
  }

  const outreachAttemptId =
    args.outreachAttemptId != null
      ? args.outreachAttemptId
      : (data as { outreach_attempt_id?: number | null } | null)?.outreach_attempt_id ??
        existing.outreach_attempt_id ??
        null;

  if (args.disposition && outreachAttemptId != null && existing.workspace) {
    const result = await updateOutreachAttemptForWorkspace(
      existing.workspace,
      outreachAttemptId,
      { disposition: args.disposition },
    );
    if (result instanceof Response) {
      throw new Error("Failed to update outreach disposition");
    }
  }

  return data ?? (existing as Tables<"call">);
}
