import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, TablesInsert } from "@/lib/database.types";

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
    campaign_id: getNumber(underCaseData.campaign_id),
    contact_id: getNumber(underCaseData.contact_id),
    call_duration: getNumber(underCaseData.call_duration),
    recording_duration: getString(underCaseData.recording_duration),
    recording_sid: getString(underCaseData.recording_sid),
    recording_url: getString(underCaseData.recording_url),
  };
}

export type CallOutreachContext = {
  outreachAttemptId: number | undefined;
  workspaceId: string | undefined;
};

/** Resolve outreach attempt + workspace from call row, falling back to parent call leg. */
export async function resolveCallOutreachContext(
  supabase: SupabaseClient<Database>,
  callRow: {
    outreach_attempt_id?: number | null;
    workspace?: string | null;
    parent_call_sid?: string | null;
  },
): Promise<CallOutreachContext> {
  let outreachAttemptId = callRow.outreach_attempt_id ?? undefined;
  let workspaceId = callRow.workspace ?? undefined;

  if (outreachAttemptId == null && callRow.parent_call_sid) {
    const { data: parentCall } = await supabase
      .from("call")
      .select("workspace, outreach_attempt_id")
      .eq("sid", callRow.parent_call_sid)
      .single();
    if (parentCall) {
      workspaceId = parentCall.workspace ?? undefined;
      outreachAttemptId = parentCall.outreach_attempt_id ?? undefined;
    }
  }

  return { outreachAttemptId, workspaceId };
}

export function billingUnitsFromCallDurationSeconds(duration: number): number {
  return Math.floor(duration / 60) + 1;
}

export const TERMINAL_CALL_STATUSES = [
  "completed",
  "failed",
  "no-answer",
  "busy",
] as const;
