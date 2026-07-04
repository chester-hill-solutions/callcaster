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
 * Requires: DATABASE_URL env var, and workspace.twilio_data with sid + authToken.
 */
import "dotenv/config";

import postgres from "postgres";
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
 */
async function resolveContactIdForFrom(sql, workspaceId, fromPhone, cache) {
  if (!fromPhone) return null;
  if (cache.has(fromPhone)) return cache.get(fromPhone);

  const rows = await sql`select * from find_contact_by_phone(${fromPhone} ::text, ${workspaceId} ::uuid)`;

  let id = null;
  if (rows.length === 1 && rows[0].id != null) {
    id = rows[0].id;
  }
  cache.set(fromPhone, id);
  return id;
}

const MESSAGE_COLUMNS = [
  "sid",
  "account_sid",
  "body",
  "from",
  "to",
  "direction",
  "status",
  "workspace",
  "date_created",
  "date_sent",
  "date_updated",
  "num_media",
  "num_segments",
  "messaging_service_sid",
  "api_version",
  "uri",
  "subresource_uris",
  "error_code",
  "error_message",
  "contact_id",
];

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.workspaceId) {
    console.error(
      "Usage: node scripts/one-off/sync-inbound-sms-from-twilio.mjs <workspace-uuid> [--dry-run] [--max=N] [--date-sent-after=ISO] [--merge] [--patch-contacts]",
    );
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("Missing DATABASE_URL in environment.");
    process.exit(1);
  }

  const sql = postgres(databaseUrl);

  let ws;
  try {
    [ws] = await sql`select id, twilio_data from workspace where id = ${args.workspaceId}`;
  } catch (error) {
    console.error("Workspace load failed:", error.message);
    await sql.end();
    process.exit(1);
  }

  if (!ws) {
    console.error("Workspace load failed: not found");
    await sql.end();
    process.exit(1);
  }

  const workspaceId = ws.id;
  const contactCache = new Map();

  if (args.patchContacts) {
    const MAX_ROWS = 10_000;
    let patched = 0;
    let examined = 0;
    let rows;
    try {
      rows = await sql`
        select sid, "from"
        from message
        where workspace = ${workspaceId}
          and direction = 'inbound'
          and contact_id is null
          and "from" is not null
        order by sid
        limit ${MAX_ROWS}
      `;
    } catch (error) {
      console.error(JSON.stringify({ workspaceId, error: error.message }, null, 2));
      await sql.end();
      process.exit(1);
    }
    for (const row of rows) {
      examined++;
      const cid = await resolveContactIdForFrom(
        sql,
        workspaceId,
        row.from,
        contactCache,
      );
      if (cid == null || args.dryRun) continue;
      try {
        await sql`update message set contact_id = ${cid} where sid = ${row.sid}`;
      } catch (error) {
        console.error(JSON.stringify({ workspaceId, error: error.message }, null, 2));
        await sql.end();
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
    await sql.end();
    return;
  }

  const creds = readTwilioWorkspaceCredentials(ws.twilio_data);
  if (!creds) {
    console.error("Workspace has no usable Twilio credentials in twilio_data.");
    await sql.end();
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

    try {
      if (!args.merge) {
        const sids = chunk.map((r) => r.sid);
        const existingRows = await sql`select sid from message where sid in ${sql(sids)}`;
        const have = new Set((existingRows ?? []).map((r) => r.sid));
        toWrite = chunk.filter((r) => !have.has(r.sid));
        const skippedExisting = chunk.length - toWrite.length;
        if (toWrite.length === 0) {
          return { inserted: 0, skippedExisting, error: null };
        }

        for (const row of toWrite) {
          const cid = await resolveContactIdForFrom(
            sql,
            workspaceId,
            row.from,
            contactCache,
          );
          if (cid != null) row.contact_id = cid;
        }

        await sql`insert into message ${sql(toWrite, ...MESSAGE_COLUMNS)}`;
        return { inserted: toWrite.length, skippedExisting, error: null };
      }

      for (const row of toWrite) {
        const cid = await resolveContactIdForFrom(
          sql,
          workspaceId,
          row.from,
          contactCache,
        );
        if (cid != null) row.contact_id = cid;
      }

      await sql`
        insert into message ${sql(toWrite, ...MESSAGE_COLUMNS)}
        on conflict (sid) do update set
          account_sid = excluded.account_sid,
          body = excluded.body,
          "from" = excluded."from",
          to = excluded.to,
          direction = excluded.direction,
          status = excluded.status,
          workspace = excluded.workspace,
          date_created = excluded.date_created,
          date_sent = excluded.date_sent,
          date_updated = excluded.date_updated,
          num_media = excluded.num_media,
          num_segments = excluded.num_segments,
          messaging_service_sid = excluded.messaging_service_sid,
          api_version = excluded.api_version,
          uri = excluded.uri,
          subresource_uris = excluded.subresource_uris,
          error_code = excluded.error_code,
          error_message = excluded.error_message,
          contact_id = excluded.contact_id
      `;
      return { inserted: toWrite.length, skippedExisting: 0, error: null };
    } catch (error) {
      return { inserted: 0, skippedExisting: 0, error };
    }
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

  await sql.end();
  if (lastError) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
