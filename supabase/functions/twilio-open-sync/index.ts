import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@^2.39.6";
import Twilio from "npm:twilio@^5.3.0";
import {
  CALL_STATUSES_BILLABLE_ON_COMPLETION,
  normalizeProviderStatus,
} from "../_shared/call-provider-status.ts";
import {
  billingUnitsFromDurationSeconds,
  canTransitionOutreachDisposition,
  insertTransactionHistoryIdempotent,
} from "../_shared/ivr-status-logic.ts";
import {
  cancelQueuedMessages,
  normalizeTwilioSmsStatus,
  sendOutboundSmsWebhookIfConfigured,
  shouldUpdateOutreachDisposition,
  type TwilioSmsStatus,
} from "../_shared/sms-status-logic.ts";
import {
  OPEN_MESSAGE_STATUS_LIST,
  parseTwilioOpenSyncBody,
  staleBeforeIso,
  TWILIO_OPEN_SYNC_MIN_DATE_CREATED,
} from "../_shared/twilio-open-sync-candidates.ts";
import { readTwilioWorkspaceCredentials } from "../_shared/twilio-workspace-credentials.ts";

function clipDiag(s: string, max = 280): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}

async function sleepMs(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function getOrCreateTwilioClient(
  supabase: SupabaseClient,
  workspaceId: string,
  cache: Map<string, Twilio.Twilio>,
): Promise<Twilio.Twilio | null> {
  const hit = cache.get(workspaceId);
  if (hit) return hit;
  const { data, error } = await supabase
    .from("workspace")
    .select("twilio_data")
    .eq("id", workspaceId)
    .single();
  if (error || !data) return null;
  const creds = readTwilioWorkspaceCredentials(data.twilio_data);
  if (!creds) return null;
  const client = new Twilio(creds.sid, creds.authToken);
  cache.set(workspaceId, client);
  return client;
}

/** Twilio REST credentials always come from the row's `workspace` (tenant FK). `account_sid` is metadata only. */
function credentialWorkspaceId(
  workspace: string | null | undefined,
): string | null {
  const w =
    typeof workspace === "string" && workspace.trim() ? workspace.trim() : "";
  return w || null;
}

type CallRow = {
  sid: string;
  workspace: string | null;
  account_sid: string | null;
  outreach_attempt_id: number | null;
  parent_call_sid: string | null;
  status: string | null;
};

async function resolveCallOutreachContext(
  supabase: SupabaseClient,
  row: CallRow,
): Promise<{ outreachAttemptId: number | null; workspaceId: string | null }> {
  let outreachAttemptId = row.outreach_attempt_id;
  let workspaceId = row.workspace;
  if (outreachAttemptId == null && row.parent_call_sid) {
    const { data: parent } = await supabase
      .from("call")
      .select("workspace, outreach_attempt_id")
      .eq("sid", row.parent_call_sid)
      .maybeSingle();
    if (parent) {
      workspaceId = parent.workspace ?? workspaceId;
      outreachAttemptId = parent.outreach_attempt_id ?? null;
    }
  }
  return { outreachAttemptId, workspaceId };
}

async function syncCallRow(
  supabase: SupabaseClient,
  row: CallRow,
  twilio: Twilio.Twilio,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const twilioCall = await twilio.calls(row.sid).fetch();
    const rawStatus = twilioCall.status ?? null;
    const normalized = normalizeProviderStatus(rawStatus);
    if (normalized == null) {
      return { ok: false, error: `unsupported_status:${rawStatus}` };
    }

    const now = new Date().toISOString();
    const durationSeconds = Number(twilioCall.duration ?? 0) || 0;
    const dbStatus = String(row.status ?? "").toLowerCase();
    const statusChanged = dbStatus !== normalized;

    const patch: Record<string, unknown> = { date_updated: now };
    if (statusChanged) {
      patch.status = normalized;
    }
    if (twilioCall.endTime) {
      patch.end_time = new Date(twilioCall.endTime).toISOString();
    }
    if (twilioCall.duration != null) {
      patch.duration = String(twilioCall.duration);
    }
    const callAccountSid =
      typeof (twilioCall as { accountSid?: unknown }).accountSid === "string"
        ? String((twilioCall as { accountSid: string }).accountSid).trim()
        : "";
    if (callAccountSid && callAccountSid !== String(row.account_sid ?? "")) {
      patch.account_sid = callAccountSid;
    }

    const { error: updateCallError } = await supabase
      .from("call")
      .update(patch)
      .eq("sid", row.sid);

    if (updateCallError) {
      return { ok: false, error: updateCallError.message };
    }

    const { outreachAttemptId, workspaceId } = await resolveCallOutreachContext(
      supabase,
      row,
    );

    const { data: attempt } = outreachAttemptId != null
      ? await supabase
        .from("outreach_attempt")
        .select("disposition, contact_id, workspace")
        .eq("id", outreachAttemptId)
        .maybeSingle()
      : { data: null };

    if (outreachAttemptId != null && statusChanged) {
      const currentDisposition = attempt?.disposition ?? null;
      const nextDisposition = normalized;
      if (
        nextDisposition &&
        canTransitionOutreachDisposition(currentDisposition, nextDisposition)
      ) {
        const { error: dispErr } = await supabase
          .from("outreach_attempt")
          .update({ disposition: nextDisposition })
          .eq("id", outreachAttemptId);
        if (dispErr) {
          console.error("twilio-open-sync outreach disposition", dispErr);
        }
      }
    }

    const billingWorkspace = attempt?.workspace ?? workspaceId;

    // Match api.call-status: debit only on transition into a billable terminal status,
    // same idempotency key, same note shape (marker appended by insertTransactionHistoryIdempotent).
    if (
      statusChanged &&
      billingWorkspace &&
      CALL_STATUSES_BILLABLE_ON_COMPLETION.has(normalized)
    ) {
      const amount = billingUnitsFromDurationSeconds(
        Number.isFinite(durationSeconds) ? durationSeconds : 0,
      );
      const contactId = attempt?.contact_id;
      const note =
        outreachAttemptId != null && contactId != null
          ? `Call ${row.sid}, Contact ${contactId}, Outreach Attempt ${outreachAttemptId}`
          : outreachAttemptId != null
          ? `Call ${row.sid}, Outreach Attempt ${outreachAttemptId}`
          : `Call ${row.sid} (API/staffed dial)`;
      await insertTransactionHistoryIdempotent({
        supabase: supabase as never,
        workspaceId: billingWorkspace,
        type: "DEBIT",
        amount,
        note,
        idempotencyKey: `call:${row.sid}`,
      });
    }

    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("twilio-open-sync call", row.sid, msg);
    return { ok: false, error: msg };
  }
}

type MessageRow = {
  sid: string;
  workspace: string | null;
  account_sid: string | null;
  direction: string | null;
  status: string | null;
  outreach_attempt_id: number | null;
  campaign_id: number | null;
  from: string | null;
  to: string | null;
  body: string | null;
  num_media: string | null;
};

async function syncMessageRow(
  supabase: SupabaseClient,
  row: MessageRow,
  twilio: Twilio.Twilio,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const twilioMsg = await twilio.messages(row.sid).fetch();
    const raw = twilioMsg.status ?? "";
    const status = normalizeTwilioSmsStatus(String(raw));

    const dateUpdated =
      twilioMsg.dateUpdated != null
        ? new Date(twilioMsg.dateUpdated).toISOString()
        : new Date().toISOString();

    const errorCode =
      twilioMsg.errorCode != null ? Number(twilioMsg.errorCode) : null;
    const errorMessage =
      typeof twilioMsg.errorMessage === "string" && twilioMsg.errorMessage
        ? twilioMsg.errorMessage
        : null;

    const dbStatus = String(row.status ?? "").toLowerCase();
    const statusChanged = dbStatus !== status;

    const msgAccountSid =
      typeof (twilioMsg as { accountSid?: unknown }).accountSid === "string"
        ? String((twilioMsg as { accountSid: string }).accountSid).trim()
        : "";
    const accountPatch =
      msgAccountSid && msgAccountSid !== String(row.account_sid ?? "")
        ? { account_sid: msgAccountSid }
        : {};

    const { error: updateError } = await supabase
      .from("message")
      .update(
        statusChanged
          ? {
            status,
            date_updated: dateUpdated,
            ...accountPatch,
            ...(errorCode != null && Number.isFinite(errorCode)
              ? { error_code: errorCode }
              : {}),
            ...(errorMessage ? { error_message: errorMessage } : {}),
          }
          : { date_updated: new Date().toISOString(), ...accountPatch },
      )
      .eq("sid", row.sid);

    if (updateError) {
      return { ok: false, error: updateError.message };
    }

    const { data: messageData } = await supabase
      .from("message")
      .select("*, outreach_attempt(workspace)")
      .eq("sid", row.sid)
      .single();

    const workspaceId =
      (messageData as { outreach_attempt?: { workspace?: string } } | null)
        ?.outreach_attempt?.workspace ??
      (messageData as { workspace?: string } | null)?.workspace ??
      row.workspace;

    if (!workspaceId) {
      return { ok: false, error: "no_workspace" };
    }

    if (
      (status === "delivered" || status === "failed" || status === "undelivered")
    ) {
      await insertTransactionHistoryIdempotent({
        supabase: supabase as never,
        workspaceId,
        type: "DEBIT",
        amount: -1,
        note: `SMS ${row.sid} ${status} (twilio-open-sync)`,
        idempotencyKey: `sms:${row.sid}`,
      });
    }

    if (statusChanged) {
      await sendOutboundSmsWebhookIfConfigured({
        supabase: supabase as never,
        workspaceId,
        message: {
          sid: row.sid,
          from: (messageData as { from?: string })?.from ?? row.from ??
            undefined,
          to: (messageData as { to?: string })?.to ?? row.to ?? undefined,
          body: (messageData as { body?: string })?.body ?? row.body ??
            undefined,
          num_media:
            (messageData as { num_media?: string | number | null })?.num_media ??
              row.num_media,
          status,
          date_updated: dateUpdated,
        },
      });
    }

    const outreachAttemptId =
      (messageData as { outreach_attempt_id?: number })?.outreach_attempt_id ??
        row.outreach_attempt_id;

    if (outreachAttemptId && statusChanged) {
      const { data: currentAttempt } = await supabase
        .from("outreach_attempt")
        .select("disposition")
        .eq("id", outreachAttemptId)
        .single();

      let outreachData: Record<string, unknown> | null = null;
      let outreachError: { message?: string } | null = null;

      if (
        shouldUpdateOutreachDisposition({
          currentDisposition: currentAttempt?.disposition ?? null,
          nextDisposition: status as TwilioSmsStatus,
        })
      ) {
        const res = await supabase
          .from("outreach_attempt")
          .update({ disposition: status })
          .eq("id", outreachAttemptId)
          .select(`*, campaign(end_date)`)
          .single();
        outreachData = res.data as Record<string, unknown>;
        outreachError = res.error;
      } else {
        outreachData = currentAttempt as Record<string, unknown>;
      }

      if (outreachError) {
        console.error("twilio-open-sync sms outreach", outreachError);
      } else if (
        outreachData &&
        (outreachData as { campaign?: { end_date?: string } }).campaign?.end_date
      ) {
        const now = new Date();
        const endDate = new Date(
          String(
            (outreachData as { campaign?: { end_date?: string } }).campaign
              ?.end_date,
          ),
        );
        if (now > endDate) {
          const campaignId =
            (outreachData as { campaign_id?: number }).campaign_id ??
            (messageData as { campaign_id?: number })?.campaign_id;
          if (campaignId) {
            await cancelQueuedMessages({
              supabase: supabase as never,
              campaignId,
            });
          }
        }
      }
    }

    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("twilio-open-sync message", row.sid, msg);
    return { ok: false, error: msg };
  }
}

export async function handleRequest(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST required" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const { callLimit, messageLimit, maxAgeMinutes } = parseTwilioOpenSyncBody(
    body,
  );
  const staleIso = staleBeforeIso(maxAgeMinutes);

  const twilioCache = new Map<string, Twilio.Twilio>();

  const { data: calls, error: callsErr } = await supabase
    .from("call")
    .select(
      "sid, workspace, account_sid, outreach_attempt_id, parent_call_sid, status, date_updated",
    )
    .gte("date_created", TWILIO_OPEN_SYNC_MIN_DATE_CREATED)
    .in("status", ["initiated", "queued", "ringing", "in-progress"])
    .not("workspace", "is", null)
    .or(`date_updated.is.null,date_updated.lt.${staleIso}`)
    .order("date_updated", { ascending: false, nullsFirst: false })
    .limit(callLimit);

  if (callsErr) {
    console.error("twilio-open-sync calls query", callsErr);
    return new Response(JSON.stringify({ error: callsErr.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const minD = TWILIO_OPEN_SYNC_MIN_DATE_CREATED;
  const { data: messages, error: msgErr } = await supabase
    .from("message")
    .select(
      "sid, workspace, account_sid, direction, status, date_updated, outreach_attempt_id, campaign_id, from, to, body, num_media",
    )
    .or(
      `date_created.gte.${minD},and(date_created.is.null,date_updated.gte.${minD})`,
    )
    .neq("direction", "inbound")
    .in("status", OPEN_MESSAGE_STATUS_LIST)
    .not("workspace", "is", null)
    .or(`date_updated.is.null,date_updated.lt.${staleIso}`)
    .order("date_updated", { ascending: false, nullsFirst: false })
    .limit(messageLimit);

  if (msgErr) {
    console.error("twilio-open-sync messages query", msgErr);
    return new Response(JSON.stringify({ error: msgErr.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const callResults = { ok: 0, fail: 0 };
  const messageResults = { ok: 0, fail: 0 };
  const hints: { lastCallError?: string; lastMessageError?: string } = {};

  for (const row of calls ?? []) {
    const r = row as CallRow;
    if (!r.workspace) continue;
    const credWorkspaceId = credentialWorkspaceId(r.workspace);
    if (!credWorkspaceId) continue;
    const client = await getOrCreateTwilioClient(
      supabase,
      credWorkspaceId,
      twilioCache,
    );
    if (!client) {
      callResults.fail++;
      hints.lastCallError = "missing_workspace_twilio_credentials";
      continue;
    }
    const res = await syncCallRow(supabase, r, client);
    if (res.ok) callResults.ok++;
    else {
      callResults.fail++;
      if (res.error) hints.lastCallError = clipDiag(res.error);
    }
    await sleepMs(50);
  }

  for (const row of messages ?? []) {
    const r = row as MessageRow;
    if (!r.workspace) continue;
    const credWorkspaceId = credentialWorkspaceId(r.workspace);
    if (!credWorkspaceId) continue;
    const client = await getOrCreateTwilioClient(
      supabase,
      credWorkspaceId,
      twilioCache,
    );
    if (!client) {
      messageResults.fail++;
      hints.lastMessageError = "missing_workspace_twilio_credentials";
      continue;
    }
    const res = await syncMessageRow(supabase, r, client);
    if (res.ok) messageResults.ok++;
    else {
      messageResults.fail++;
      if (res.error) hints.lastMessageError = clipDiag(res.error);
    }
    await sleepMs(50);
  }

  return new Response(
    JSON.stringify({
      notBefore: TWILIO_OPEN_SYNC_MIN_DATE_CREATED,
      calls: { scanned: (calls ?? []).length, ...callResults },
      messages: { scanned: (messages ?? []).length, ...messageResults },
      hints,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}
