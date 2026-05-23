#!/usr/bin/env node
/* eslint-env node */
/**
 * Backfill inbound SMS from Twilio (workspace subaccount) into `message`.
 * Inserts only rows whose `sid` is not already present (safe re-runs).
 *
 * Usage:
 *   node scripts/one-off/sync-inbound-sms-from-twilio.mjs <workspace-uuid> [--dry-run] [--max=N] [--date-sent-after=ISO] [--merge] [--patch-contacts]
 *
 * --merge: upsert on sid (overwrites columns for existing rows; default is insert-new-only)
 * --patch-contacts: only DB pass — set contact_id on inbound rows where null and find_contact_by_phone returns exactly one row
 *
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_KEY, and workspace.twilio_data with sid + authToken.
 */
import "dotenv/config";

import { createClient } from "@supabase/supabase-js";
import Twilio from "twilio";

const VALID_SMS_STATUSES = new Set([
  "accepted",
  "scheduled",
  "canceled",
  "queued",
  "sending",
  "sent",
  "failed",
  "delivered",
  "undelivered",
  "receiving",
  "received",
  "read",
]);

function normalizeTwilioSmsStatus(raw) {
  const s = String(raw || "").trim().toLowerCase();
  return VALID_SMS_STATUSES.has(s) ? s : "failed";
}

function readTwilioWorkspaceCredentials(twilioData) {
  if (!twilioData || typeof twilioData !== "object" || Array.isArray(twilioData)) {
    return null;
  }
  const sid =
    (typeof twilioData.sid === "string" && twilioData.sid.trim()) ||
    (typeof twilioData.account_sid === "string" && twilioData.account_sid.trim()) ||
    (typeof twilioData.accountSid === "string" && twilioData.accountSid.trim()) ||
    "";
  const authToken =
    (typeof twilioData.authToken === "string" && twilioData.authToken.trim()) ||
    (typeof twilioData.auth_token === "string" && twilioData.auth_token.trim()) ||
    "";
  if (!sid || !authToken) return null;
  return { sid, authToken };
}

function parseArgs(argv) {
  const out = {
    workspaceId: null,
    dryRun: false,
    merge: false,
    patchContacts: false,
    maxInbound: Infinity,
    dateSentAfter: undefined,
  };
  for (const a of argv) {
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--merge") out.merge = true;
    else if (a === "--patch-contacts") out.patchContacts = true;
    else if (a.startsWith("--max=")) {
      const n = Number(a.slice("--max=".length));
      if (Number.isFinite(n) && n > 0) out.maxInbound = n;
    } else if (a.startsWith("--date-sent-after=")) {
      out.dateSentAfter = new Date(a.slice("--date-sent-after=".length));
      if (Number.isNaN(out.dateSentAfter.getTime())) {
        throw new Error(`Invalid --date-sent-after: ${a}`);
      }
    } else if (!a.startsWith("--") && !out.workspaceId) {
      out.workspaceId = a;
    }
  }
  return out;
}

function toIso(d) {
  if (d == null) return new Date().toISOString();
  try {
    return new Date(d).toISOString();
  } catch {
    return new Date().toISOString();
  }
}

/**
 * Mirrors api.inbound-sms: single unambiguous contact only.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
async function resolveContactIdForFrom(supabase, workspaceId, fromPhone, cache) {
  if (!fromPhone) return null;
  if (cache.has(fromPhone)) return cache.get(fromPhone);

  const { data, error } = await supabase.rpc("find_contact_by_phone", {
    p_workspace_id: workspaceId,
    p_phone_number: fromPhone,
  });

  let id = null;
  if (!error && Array.isArray(data) && data.length === 1 && typeof data[0].id === "number") {
    id = data[0].id;
  }
  cache.set(fromPhone, id);
  return id;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.workspaceId) {
    console.error(
      "Usage: node scripts/one-off/sync-inbound-sms-from-twilio.mjs <workspace-uuid> [--dry-run] [--max=N] [--date-sent-after=ISO] [--merge] [--patch-contacts]",
    );
    process.exit(1);
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in environment.");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data: ws, error: wsErr } = await supabase
    .from("workspace")
    .select("id, twilio_data")
    .eq("id", args.workspaceId)
    .single();

  if (wsErr || !ws) {
    console.error("Workspace load failed:", wsErr?.message ?? wsErr);
    process.exit(1);
  }

  const workspaceId = ws.id;
  const contactCache = new Map();

  if (args.patchContacts) {
    const MAX_ROWS = 10_000;
    let patched = 0;
    let examined = 0;
    const { data: rows, error } = await supabase
      .from("message")
      .select("sid, from")
      .eq("workspace", workspaceId)
      .eq("direction", "inbound")
      .is("contact_id", null)
      .not("from", "is", null)
      .order("sid", { ascending: true })
      .limit(MAX_ROWS);
    if (error) {
      console.error(JSON.stringify({ workspaceId, error: error.message }, null, 2));
      process.exit(1);
    }
    for (const row of rows ?? []) {
      examined++;
      const cid = await resolveContactIdForFrom(
        supabase,
        workspaceId,
        row.from,
        contactCache,
      );
      if (cid == null || args.dryRun) continue;
      const { error: upErr } = await supabase
        .from("message")
        .update({ contact_id: cid })
        .eq("sid", row.sid);
      if (upErr) {
        console.error(JSON.stringify({ workspaceId, error: upErr.message }, null, 2));
        process.exit(1);
      }
      patched++;
    }
    console.log(
      JSON.stringify(
        {
          workspaceId,
          mode: "patch-contacts",
          dryRun: args.dryRun,
          rowsExamined: examined,
          rowsUpdated: args.dryRun ? 0 : patched,
        },
        null,
        2,
      ),
    );
    return;
  }

  const creds = readTwilioWorkspaceCredentials(ws.twilio_data);
  if (!creds) {
    console.error("Workspace has no usable Twilio credentials in twilio_data.");
    process.exit(1);
  }

  const twilio = new Twilio(creds.sid, creds.authToken);

  let page = await twilio.messages.page({
    pageSize: 100,
    ...(args.dateSentAfter ? { dateSentAfter: args.dateSentAfter } : {}),
  });

  let scanned = 0;
  let inboundSeen = 0;
  const batch = [];
  const BATCH = 40;

  async function flush() {
    if (args.dryRun || batch.length === 0) {
      return { inserted: 0, skippedExisting: 0, error: null };
    }

    const chunk = batch.splice(0, batch.length);
    let toWrite = chunk;

    if (!args.merge) {
      const sids = chunk.map((r) => r.sid);
      const { data: existing, error: exErr } = await supabase
        .from("message")
        .select("sid")
        .in("sid", sids);
      if (exErr) return { inserted: 0, skippedExisting: 0, error: exErr };
      const have = new Set((existing ?? []).map((r) => r.sid));
      toWrite = chunk.filter((r) => !have.has(r.sid));
      const skippedExisting = chunk.length - toWrite.length;
      if (toWrite.length === 0) {
        return { inserted: 0, skippedExisting, error: null };
      }

      for (const row of toWrite) {
        const cid = await resolveContactIdForFrom(
          supabase,
          workspaceId,
          row.from,
          contactCache,
        );
        if (cid != null) row.contact_id = cid;
      }

      const { error } = await supabase.from("message").insert(toWrite);
      if (error) return { inserted: 0, skippedExisting, error };
      return { inserted: toWrite.length, skippedExisting, error: null };
    }

    for (const row of toWrite) {
      const cid = await resolveContactIdForFrom(
        supabase,
        workspaceId,
        row.from,
        contactCache,
      );
      if (cid != null) row.contact_id = cid;
    }

    const { error } = await supabase.from("message").upsert(toWrite, {
      onConflict: "sid",
      ignoreDuplicates: false,
    });
    if (error) return { inserted: 0, skippedExisting: 0, error };
    return { inserted: toWrite.length, skippedExisting: 0, error: null };
  }

  let inserted = 0;
  let skippedExisting = 0;
  let lastError = null;

  while (page && inboundSeen < args.maxInbound) {
    for (const m of page.instances) {
      scanned++;
      if (m.direction !== "inbound") continue;
      inboundSeen++;
      if (inboundSeen > args.maxInbound) break;

      const status = normalizeTwilioSmsStatus(m.status);
      const row = {
        sid: m.sid,
        account_sid: m.accountSid ?? null,
        body: m.body ?? "",
        from: m.from ?? null,
        to: m.to ?? null,
        direction: "inbound",
        status,
        workspace: workspaceId,
        date_created: toIso(m.dateCreated),
        date_sent: toIso(m.dateSent ?? m.dateCreated),
        date_updated: toIso(m.dateUpdated ?? m.dateSent ?? m.dateCreated),
        num_media: String(m.numMedia ?? 0),
        num_segments: String(m.numSegments ?? 0),
        ...(m.messagingServiceSid
          ? { messaging_service_sid: m.messagingServiceSid }
          : {}),
        ...(m.apiVersion ? { api_version: m.apiVersion } : {}),
        ...(m.uri ? { uri: m.uri } : {}),
        ...(m.subresourceUris ? { subresource_uris: m.subresourceUris } : {}),
        ...(m.errorCode != null && Number.isFinite(Number(m.errorCode))
          ? { error_code: Number(m.errorCode) }
          : {}),
        ...(m.errorMessage ? { error_message: String(m.errorMessage) } : {}),
      };

      batch.push(row);
      if (batch.length >= BATCH) {
        const r = await flush();
        inserted += r.inserted;
        skippedExisting += r.skippedExisting;
        if (r.error) lastError = r.error;
      }
    }

    if (inboundSeen >= args.maxInbound) break;
    const next = await page.nextPage();
    if (!next) break;
    page = next;
  }

  const r = await flush();
  inserted += r.inserted;
  skippedExisting += r.skippedExisting;
  if (r.error) lastError = r.error;

  console.log(
    JSON.stringify(
      {
        workspaceId,
        dryRun: args.dryRun,
        merge: args.merge,
        scannedTwilioMessages: scanned,
        inboundMatched: Math.min(inboundSeen, args.maxInbound),
        rowsInserted: args.dryRun ? 0 : inserted,
        rowsSkippedAlreadyInDb: args.dryRun ? 0 : skippedExisting,
        error: lastError ? lastError.message : null,
      },
      null,
      2,
    ),
  );

  if (lastError) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
