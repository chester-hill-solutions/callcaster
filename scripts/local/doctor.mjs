#!/usr/bin/env node
/* eslint-env node */
/**
 * Workspace diagnostic — answers "why isn't this working for this customer?"
 * from a terminal instead of a sudo-admin browser session.
 *
 * Incident response previously required logging into the admin UI as a sudo
 * admin and clicking through five screens, which is slow, needs a browser
 * pointed at production, and shows no cross-checks: nothing in the UI compares
 * `workspace.credits` against the ledger, or notices that the job worker
 * stopped claiming.
 *
 * Read-only. Every statement here is a SELECT; the script never writes.
 *
 * Usage:
 *   npm run doctor -- <workspaceId>
 *   npm run doctor -- <workspaceId> --json
 *   DATABASE_URL=postgresql://... npm run doctor -- <workspaceId>
 */
import postgres from "postgres";

const args = process.argv.slice(2).filter((a) => a !== "--");
const asJson = args.includes("--json");
const workspaceId = args.find((a) => !a.startsWith("--"));

if (!workspaceId) {
  console.error(
    "Usage: npm run doctor -- <workspaceId> [--json]\n" +
      "  workspaceId is the uuid in /workspaces/<id>.",
  );
  process.exit(2);
}
if (!/^[0-9a-f-]{36}$/i.test(workspaceId)) {
  console.error(`Not a workspace uuid: ${workspaceId}`);
  process.exit(2);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set. Point it at the environment you are debugging.");
  process.exit(2);
}

const sql = postgres(connectionString, { max: 1, onnotice: () => {} });

/** Findings ranked so the first line of output is the thing to act on. */
const findings = [];
const problem = (msg, detail) => findings.push({ level: "problem", msg, detail });
const warn = (msg, detail) => findings.push({ level: "warning", msg, detail });

function parseJsonColumn(value) {
  if (value == null) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function fmtAge(iso) {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return String(iso);
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

const report = {};

try {
  // ── Workspace ────────────────────────────────────────────────────────
  const [ws] = await sql`
    select id, name, disabled, credits, owner, created_at, twilio_data
    from workspace where id = ${workspaceId}
  `;
  if (!ws) {
    console.error(`No workspace with id ${workspaceId} in this database.`);
    await sql.end();
    process.exit(1);
  }

  report.workspace = {
    id: ws.id,
    name: ws.name,
    disabled: ws.disabled,
    credits: ws.credits,
    created: ws.created_at,
  };
  if (ws.disabled) problem("Workspace is DISABLED — every surface will refuse it.");
  if (ws.credits <= 0) {
    problem(`No credits (${ws.credits}) — outbound calls and SMS will be refused.`);
  } else if (ws.credits < 100) {
    warn(`Low credits (${ws.credits}).`);
  }

  // ── Credits vs ledger ────────────────────────────────────────────────
  // The stored balance is a denormalised cache maintained by
  // apply_ledger_entry_and_sync_credits. If it has drifted from the sum of
  // ledger entries, something wrote credits outside the ledger — which is the
  // signature of a billing bug and is invisible in the admin UI.
  const [ledger] = await sql`
    select coalesce(sum(amount), 0)::int as total, count(*)::int as entries
    from transaction_history where workspace = ${workspaceId}
  `;
  report.ledger = { sum: ledger.total, entries: ledger.entries, stored: ws.credits };
  if (ledger.entries > 0 && ledger.total !== ws.credits) {
    problem(
      `Credit drift: workspace.credits = ${ws.credits} but the ledger sums to ${ledger.total} ` +
        `(difference ${ws.credits - ledger.total}). Something wrote credits outside ` +
        "apply_ledger_entry_and_sync_credits.",
    );
  }

  // ── Onboarding ───────────────────────────────────────────────────────
  // Lives in workspace.twilio_data->onboarding (see
  // app/lib/messaging-onboarding/persistence.server.ts).
  const twilioData = parseJsonColumn(ws.twilio_data) ?? {};
  const onboarding = twilioData.onboarding ?? null;
  const profile = onboarding?.businessProfile ?? {};
  report.onboarding = onboarding
    ? {
        status: onboarding.status,
        goal: onboarding.selectedGoal,
        currentStep: onboarding.currentStep,
        channels: onboarding.selectedChannels,
        legalBusinessName: profile.legalBusinessName || null,
        subaccount: onboarding.subaccountBootstrap?.status,
        subaccountError: onboarding.subaccountBootstrap?.lastError ?? null,
        messagingService: onboarding.messagingService?.provisioningStatus,
        messagingServiceError: onboarding.messagingService?.lastError ?? null,
      }
    : "no onboarding state recorded";

  // The intake gate is exactly BUSINESS_IDENTITY_REQUIRED_FIELDS
  // (predicates.ts). A blank legalBusinessName means owners are redirected
  // back into the wizard on every workspace page load.
  if (onboarding && !profile.legalBusinessName) {
    problem(
      "Intake incomplete: legalBusinessName is blank, so owners/admins are " +
        "redirected into the onboarding wizard on every workspace page.",
    );
  }
  if (onboarding?.subaccountBootstrap?.lastError) {
    problem(`Twilio subaccount bootstrap failed: ${onboarding.subaccountBootstrap.lastError}`);
  }
  if (onboarding?.messagingService?.lastError) {
    problem(`Messaging service provisioning failed: ${onboarding.messagingService.lastError}`);
  }

  // ── Numbers ──────────────────────────────────────────────────────────
  const numbers = await sql`
    select phone_number, type, twilio_phone_number_sid, capabilities, created_at
    from workspace_number where workspace = ${workspaceId} order by created_at
  `;
  report.numbers = numbers.map((n) => ({
    number: n.phone_number,
    type: n.type,
    sid: n.twilio_phone_number_sid,
    capabilities: n.capabilities,
  }));
  if (numbers.length === 0) {
    warn("No phone numbers — the workspace cannot place calls or send SMS.");
  }
  // A row without a SID was recorded locally but never provisioned at Twilio,
  // so every send against it fails at the provider with no local signal.
  const orphaned = numbers.filter((n) => !n.twilio_phone_number_sid);
  if (orphaned.length > 0) {
    problem(
      `${orphaned.length} number(s) have no Twilio SID — recorded locally but never ` +
        `provisioned: ${orphaned.map((n) => n.phone_number).join(", ")}`,
    );
  }

  // ── Rental affordability ─────────────────────────────────────────────
  // A rental that cannot be paid does not fail loudly: the number stays active
  // and keeps costing us while the customer is not charged. Auto-release is
  // deliberately not implemented, so this is the early warning.
  const RENTAL_MONTHLY_CREDITS = 100;
  const rentedCount = numbers.filter((n) => n.type === "rented").length;
  const nextRenewalCost = rentedCount * RENTAL_MONTHLY_CREDITS;
  report.rentals = { rented: rentedCount, nextRenewalCost, credits: ws.credits };
  if (rentedCount > 0 && ws.credits < nextRenewalCost) {
    warn(
      `Cannot afford the next rental cycle: ${rentedCount} rented number(s) need ` +
        `${nextRenewalCost} credits but the workspace has ${ws.credits}. The numbers ` +
        "stay active and unbilled until someone acts.",
    );
  }

  // ── Jobs ─────────────────────────────────────────────────────────────
  const jobStats = await sql`
    select status, count(*)::int as count, max(created_at) as newest
    from job where workspace_id = ${workspaceId} group by status order by status
  `;
  report.jobs = Object.fromEntries(jobStats.map((r) => [r.status, r.count]));

  const dead = await sql`
    select id, type, dead_letter_reason, error_message, failed_at
    from job where workspace_id = ${workspaceId} and status = 'dead_letter'
    order by failed_at desc limit 10
  `;
  report.deadLetters = dead.map((d) => ({
    id: d.id,
    type: d.type,
    reason: d.dead_letter_reason ?? d.error_message,
    when: d.failed_at,
  }));
  if (dead.length > 0) {
    problem(
      `${dead.length} dead-lettered job(s), newest ${fmtAge(dead[0].failed_at)}: ` +
        `${dead[0].type} — ${dead[0].dead_letter_reason ?? dead[0].error_message}`,
    );
  }

  // A job claimed past its TTL means the worker that took it died holding it.
  // resetStaleClaims should return it, so a persistent one means the worker is
  // not running at all.
  const [stale] = await sql`
    select count(*)::int as count from job
    where workspace_id = ${workspaceId} and status = 'running'
      and claimed_until is not null and claimed_until < now()
  `;
  if (stale.count > 0) {
    problem(
      `${stale.count} job(s) claimed past their TTL — the worker died holding them ` +
        "and has not restarted to reclaim them.",
    );
  }

  // ── Is the worker alive at all? ──────────────────────────────────────
  // Global, not workspace-scoped: a queue that never drains is almost always a
  // dead worker rather than anything about this workspace.
  const [oldestQueued] = await sql`
    select min(created_at) as oldest from job
    where status = 'queued' and (retry_at is null or retry_at < now())
  `;
  const [lastCompleted] = await sql`
    select max(completed_at) as last from job where status = 'completed'
  `;
  report.worker = {
    oldestRunnableQueuedJob: oldestQueued.oldest,
    lastCompletedAnywhere: lastCompleted.last,
  };
  if (oldestQueued.oldest && Date.now() - new Date(oldestQueued.oldest).getTime() > 600_000) {
    problem(
      `A runnable job has been queued since ${fmtAge(oldestQueued.oldest)} — the job ` +
        "worker is probably not running. Nothing billed, provisioned or dispatched " +
        "by a job will happen until it is.",
    );
  }

  // ── Campaigns ────────────────────────────────────────────────────────
  const isActiveStatus = (status) => status === "running" || status === "waiting";
  const campaigns = await sql`
    select c.id, c.title, c.type, c.status, c.caller_id,
           (select count(*)::int from campaign_queue q where q.campaign_id = c.id) as queued
    from campaign c where c.workspace = ${workspaceId}
    order by c.created_at desc limit 10
  `;
  report.campaigns = campaigns.map((c) => ({
    id: c.id,
    title: c.title,
    type: c.type,
    status: c.status,
    active: isActiveStatus(c.status),
    queueRows: c.queued,
  }));
  for (const c of campaigns.filter((c) => isActiveStatus(c.status) && c.queued === 0)) {
    warn(`Campaign "${c.title}" (#${c.id}) is active but its queue is empty — it will not dial.`);
  }
  for (const c of campaigns.filter((c) => isActiveStatus(c.status) && !c.caller_id)) {
    problem(`Campaign "${c.title}" (#${c.id}) is active with no caller_id — dials will fail.`);
  }

  // ── Webhooks ─────────────────────────────────────────────────────────
  const webhooks = await sql`
    select destination_url, type, events from webhook where workspace = ${workspaceId}
  `;
  report.webhooks = webhooks.map((w) => ({ url: w.destination_url, type: w.type }));

  // ── Members ──────────────────────────────────────────────────────────
  const [members] = await sql`
    select count(*)::int as count from workspace_users where workspace_id = ${workspaceId}
  `;
  report.members = members.count;
  if (members.count === 0) warn("No members — nobody can sign in to this workspace.");

  // ── Output ───────────────────────────────────────────────────────────
  if (asJson) {
    console.log(JSON.stringify({ findings, ...report }, null, 2));
  } else {
    const problems = findings.filter((f) => f.level === "problem");
    const warnings = findings.filter((f) => f.level === "warning");

    console.log(`\n  ${ws.name}  ${ws.id}`);
    console.log(
      `  ${ws.credits} credits · ${numbers.length} number(s) · ${members.count} member(s) · ` +
        `${campaigns.length} campaign(s)${ws.disabled ? " · DISABLED" : ""}\n`,
    );

    if (problems.length === 0 && warnings.length === 0) {
      console.log("  No problems found.\n");
    }
    for (const f of problems) console.log(`  PROBLEM  ${f.msg}`);
    for (const f of warnings) console.log(`  warning  ${f.msg}`);
    if (findings.length > 0) console.log("");

    console.log("  Onboarding");
    if (onboarding) {
      console.log(
        `    status=${onboarding.status} goal=${onboarding.selectedGoal ?? "none"} ` +
          `step=${onboarding.currentStep} channels=[${(onboarding.selectedChannels ?? []).join(", ")}]`,
      );
      console.log(
        `    subaccount=${onboarding.subaccountBootstrap?.status ?? "?"} ` +
          `messagingService=${onboarding.messagingService?.provisioningStatus ?? "?"}`,
      );
    } else {
      console.log("    no onboarding state recorded");
    }

    console.log("  Numbers");
    if (numbers.length === 0) console.log("    (none)");
    for (const n of numbers) {
      console.log(`    ${n.phone_number ?? "?"}  ${n.type}  ${n.twilio_phone_number_sid ?? "NO SID"}`);
    }

    console.log("  Jobs");
    console.log(
      `    ${jobStats.map((r) => `${r.status}=${r.count}`).join(" ") || "(none for this workspace)"}`,
    );
    console.log(
      `    worker: last completed job anywhere ${fmtAge(lastCompleted.last)}` +
        (oldestQueued.oldest ? `, oldest runnable queued ${fmtAge(oldestQueued.oldest)}` : ""),
    );
    for (const d of report.deadLetters) {
      console.log(`    dead-letter #${d.id} ${d.type}: ${d.reason ?? "(no reason recorded)"}`);
    }

    console.log("  Campaigns");
    if (campaigns.length === 0) console.log("    (none)");
    for (const c of campaigns) {
      console.log(
        `    #${c.id} ${c.title} — ${c.type ?? "?"} ${c.status ?? "?"}` +
          `${isActiveStatus(c.status) ? " active" : ""} ${c.queued} queue row(s)`,
      );
    }
    console.log("");
  }
} finally {
  await sql.end();
}

process.exit(findings.some((f) => f.level === "problem") ? 1 : 0);
