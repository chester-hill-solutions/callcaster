
import type { Database, Tables, TablesInsert } from "@/lib/db-types";
import {
  findCallBySid,
  updateCallBySid,
  updateOutreachAttemptForWorkspace,
} from "@/lib/telephony-db.server";
import {
  voiceBillingKindFromCampaignType,
  voiceCreditsFromDurationSeconds,
  TERMINAL_BILLABLE_CALL_STATUSES,
  type VoiceBillingKind,
} from "../../shared/pricing";

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
