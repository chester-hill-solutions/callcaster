// SMS campaign report generator — the "Lee Fairclough report" format (issue #1752).
//
// Produces, for one message campaign:
//   - <outdir>/campaign-<id>-report.md   (then convert to PDF with scripts/md2pdf.py)
//   - <repo>/campaign-<id>-all-messages.csv
//   - <repo>/campaign-<id>-opt-outs.csv
//   - <repo>/campaign-<id>-reply-breakdown.csv
//
// The report follows the reference format: executive summary, outbound detail,
// inbound replies by theme, campaign health, Appendix A (conversations), and
// Appendix B (opt-out-only threads). Twilio error codes carry their official
// descriptions; unknown codes render as "Unknown (<code>)".
//
// Read-only. Run against a LINKED Railway Postgres via the wrapper:
//   .opencode/tools/campaign-sms-report.sh <campaignId>
//
// Or directly:
//   DATABASE_URL="$DATABASE_PUBLIC_URL" node .opencode/tools/campaign-sms-report.mjs <campaignId> [--outdir DIR] [--repo DIR] [--since ISO]
import postgres from "postgres";
import fs from "node:fs";

const argv = process.argv.slice(2);
const positional = argv.filter((a) => !a.startsWith("--"));
const flag = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const CAMPAIGN = Number(positional[0] || process.env.CAMPAIGN_ID);
if (!CAMPAIGN) {
  console.error("usage: campaign-sms-report.mjs <campaignId> [--outdir DIR] [--repo DIR] [--since ISO]");
  process.exit(2);
}
const OUTDIR = flag("--outdir", "/tmp/opencode");
const REPO = flag("--repo", process.cwd());
const SINCE = flag("--since", null);

const ERROR_DESCRIPTIONS = {
  30002: "Account suspended",
  30003: "Unreachable destination handset",
  30005: "Unknown destination handset",
  30006: "Landline or unreachable carrier",
  30008: "Unknown error (generic carrier delivery failure)",
  30034: "US A2P 10DLC - Message from an Unregistered Number",
};
const errorDescription = (code) =>
  code == null ? "" : ERROR_DESCRIPTIONS[code] || `Unknown (${code})`;

const normPhone = (p) => (p || "").replace(/[^\d+]/g, "");
const isStop = (body) => /^\s*stop/i.test(body || "");
const BALLOT = { 1: "Bains", 2: "Bowman", 3: "Fairclough", 4: "Marando" };
const ballotPick = (body) => {
  const t = (body || "").trim();
  return BALLOT[t] ? t : null;
};
const themeOf = (body) => {
  if (isStop(body)) return "Opt-out (STOP)";
  if (ballotPick(body)) return "Ballot ranking";
  return "Other";
};

function csvCell(value) {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (/^[\s]*[=+\-@]/.test(s)) s = "'" + s;
  if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}
function toCsv(headers, rows) {
  const lines = [headers.join(",")];
  for (const row of rows) lines.push(row.map(csvCell).join(","));
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}
const iso = (d) => (d ? new Date(d).toISOString() : "");
const et = (d) =>
  d
    ? new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Toronto",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
        .format(new Date(d))
        .replace(",", "")
    : "";
const mdEscape = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
const fmt = (n) => Number(n).toLocaleString("en-US");
const pct = (n, d) => (d ? ((n / d) * 100).toFixed(1) : "0.0");

const url = process.env.DATABASE_URL || process.env.DATABASE_PUBLIC_URL;
if (!url) {
  console.error("DATABASE_URL / DATABASE_PUBLIC_URL is not set");
  process.exit(2);
}
const sql = postgres(url, { max: 1 });

const [camp] = await sql`select * from campaign where id = ${CAMPAIGN}`;
if (!camp) {
  console.error(`campaign ${CAMPAIGN} not found`);
  process.exit(1);
}
if (camp.type !== "message") {
  console.error(`warning: campaign ${CAMPAIGN} is type '${camp.type}', not 'message' — report may be empty`);
}
const since = SINCE || camp.start_date || new Date(0);
const outbound = await sql`
  select m.sid, m.status, m."from", m."to", m.body, m.num_segments, m.error_code,
         m.date_created, m.date_sent, m.contact_id,
         c.firstname, c.surname, c.phone
  from message m left join contact c on c.id = m.contact_id
  where m.campaign_id = ${CAMPAIGN}
  order by m.date_created, m.sid`;
const inboundRaw = await sql`
  select m.sid, m.status, m."from", m."to", m.body, m.num_segments, m.error_code,
         m.date_created, m.date_sent, m.contact_id,
         c.firstname, c.surname, c.phone
  from message m left join contact c on c.id = m.contact_id
  where m.workspace = ${camp.workspace} and m.direction = 'inbound' and m.date_created >= ${since}
  order by m.date_created, m.sid`;
await sql.end();

// Attribute inbound to the campaign via the contact-vs-outbound phone join (#2046).
const nameByPhone = new Map();
for (const m of outbound) {
  const key = normPhone(m.to);
  if (!nameByPhone.has(key)) {
    const nm = [m.firstname, m.surname].filter(Boolean).join(" ").trim();
    nameByPhone.set(key, nm || null);
  }
}
const inbound = inboundRaw.filter((m) => nameByPhone.has(normPhone(m.from)));
const contactName = (m) => {
  const nm = [m.firstname, m.surname].filter(Boolean).join(" ").trim();
  return nm || nameByPhone.get(normPhone(m.from)) || "Unknown";
};

const statusCounts = {};
for (const m of outbound) statusCounts[m.status] = (statusCounts[m.status] || 0) + 1;
const errorCounts = {};
for (const m of outbound) if (m.error_code != null) errorCounts[m.error_code] = (errorCounts[m.error_code] || 0) + 1;
const uniqueRecipients = new Set(outbound.map((m) => normPhone(m.to))).size;
const sent = statusCounts.sent || 0;
const delivered = statusCounts.delivered || 0;
const undelivered = statusCounts.undelivered || 0;
const times = outbound.map((m) => new Date(m.date_created)).sort((a, b) => a - b);
const windowStart = times[0];
const windowEnd = times[times.length - 1];

const themeCounts = {};
const bodyCounts = {};
for (const m of inbound) {
  themeCounts[themeOf(m.body)] = (themeCounts[themeOf(m.body)] || 0) + 1;
  const b = (m.body || "").trim();
  bodyCounts[b] = (bodyCounts[b] || 0) + 1;
}
const optouts = inbound.filter((m) => isStop(m.body));
const ballotReplies = inbound.filter((m) => ballotPick(m.body));
const ballotByPick = {};
for (const m of ballotReplies) ballotByPick[ballotPick(m.body)] = (ballotByPick[ballotPick(m.body)] || 0) + 1;

const threads = new Map();
for (const m of inbound) {
  const key = normPhone(m.from);
  if (!threads.has(key)) threads.set(key, { phone: key, name: contactName(m), messages: [] });
  const t = threads.get(key);
  t.messages.push(m);
  if (t.name === "Unknown") t.name = contactName(m);
}
const conversations = [];
const optoutThreads = [];
for (const t of threads.values()) {
  const out = outbound.find((o) => normPhone(o.to) === t.phone) || null;
  const rec = { ...t, outbound: out };
  (t.messages.some((m) => !isStop(m.body)) ? conversations : optoutThreads).push(rec);
}
const byDate = (a, b) => new Date(a.messages[0].date_created) - new Date(b.messages[0].date_created);
conversations.sort(byDate);
optoutThreads.sort(byDate);

const prefix = `campaign-${CAMPAIGN}`;
const allRows = [];
for (const m of outbound) {
  allRows.push(["outbound", m.sid, m.status, m.from, m.to, [m.firstname, m.surname].filter(Boolean).join(" "), iso(m.date_created), iso(m.date_sent), m.num_segments, m.error_code, errorDescription(m.error_code), m.body]);
}
for (const m of inbound) {
  allRows.push(["inbound", m.sid, m.status, m.from, m.to, contactName(m), iso(m.date_created), iso(m.date_sent), m.num_segments, m.error_code, errorDescription(m.error_code), m.body]);
}
allRows.sort((a, b) => String(a[6]).localeCompare(String(b[6])));
fs.writeFileSync(`${REPO}/${prefix}-all-messages.csv`, toCsv(["direction", "sid", "status", "from", "to", "contact_name", "date_created", "date_sent", "num_segments", "error_code", "error_description", "body"], allRows));
fs.writeFileSync(`${REPO}/${prefix}-opt-outs.csv`, toCsv(["contact_name", "phone", "body", "date_created"], optouts.map((m) => [contactName(m), m.from, m.body, iso(m.date_created)])));
fs.writeFileSync(`${REPO}/${prefix}-reply-breakdown.csv`, toCsv(["theme", "detail", "count"], [
  ["Ballot ranking", "1 — Bains", ballotByPick["1"] || 0],
  ["Ballot ranking", "2 — Bowman", ballotByPick["2"] || 0],
  ["Ballot ranking", "3 — Fairclough", ballotByPick["3"] || 0],
  ["Ballot ranking", "4 — Marando", ballotByPick["4"] || 0],
  ["Opt-out", "STOP", optouts.length],
  ["Other", "Other", inbound.length - ballotReplies.length - optouts.length],
]));

const L = [];
L.push(`# ${camp.title} — SMS Report`);
L.push("");
L.push(`**Campaign:** ${camp.title} (${camp.type}, id ${camp.id})`);
L.push(`**Report date:** ${new Date().toISOString().slice(0, 10)}`);
L.push(`**Sender number:** ${camp.caller_id}`);
L.push(`**Send run:** ${et(windowStart)} – ${et(windowEnd)} ET`);
L.push("");
L.push("## Executive summary");
L.push("");
L.push("| Metric | Value |");
L.push("|---|---|");
L.push(`| Unique recipients | ${fmt(uniqueRecipients)} |`);
L.push(`| Sent | ${fmt(sent)} |`);
L.push(`| Delivered | ${fmt(delivered)} |`);
L.push(`| Undelivered | ${fmt(undelivered)} |`);
L.push(`| Delivery rate | ${pct(delivered, outbound.length)}% |`);
L.push(`| Inbound replies | ${fmt(inbound.length)} |`);
L.push(`| Opt-outs (STOP) | ${fmt(optouts.length)} |`);
L.push(`| Opt-out rate | ${((optouts.length / (outbound.length || 1)) * 100).toFixed(2)}% |`);
L.push(`| Active window | ${et(windowStart)} – ${et(windowEnd)} ET |`);
L.push("");
L.push("## Outbound");
L.push("");
L.push("### Blast body");
L.push("");
for (const line of String(camp.body_text || "").split(/\r?\n/)) L.push(`> ${line}`);
L.push("");
L.push("### Send run");
L.push("");
L.push("| Campaign | Status | Recipients | Sent | Delivered | Undelivered |");
L.push("|---|---|---|---|---|---|");
L.push(`| ${mdEscape(camp.title)} | ${camp.status} | ${fmt(uniqueRecipients)} | ${fmt(sent)} | ${fmt(delivered)} | ${fmt(undelivered)} |`);
L.push("");
L.push("### Delivery errors (Twilio)");
L.push("");
L.push("| Code | Description | Count |");
L.push("|---|---|---|");
for (const [code, n] of Object.entries(errorCounts).sort((a, b) => b[1] - a[1])) L.push(`| ${code} | ${errorDescription(Number(code))} | ${fmt(n)} |`);
L.push("");
L.push("## Inbound");
L.push("");
L.push("### Replies by theme");
L.push("");
L.push("| Theme | Count | Share |");
L.push("|---|---|---|");
for (const [theme, n] of Object.entries(themeCounts).sort((a, b) => b[1] - a[1])) L.push(`| ${theme} | ${fmt(n)} | ${pct(n, inbound.length)}% |`);
L.push("");
L.push("### Ballot ranking");
L.push("");
L.push("| Reply | Candidate | Count |");
L.push("|---|---|---|");
for (const k of ["1", "2", "3", "4"]) L.push(`| ${k} | ${BALLOT[k]} | ${fmt(ballotByPick[k] || 0)} |`);
L.push("");
L.push("### Verbatim reply text");
L.push("");
L.push("| Reply text | Count |");
L.push("|---|---|");
for (const [b, n] of Object.entries(bodyCounts).sort((a, b) => b[1] - a[1])) L.push(`| ${mdEscape(b) || "(empty)"} | ${fmt(n)} |`);
L.push("");
L.push("## Campaign health");
L.push("");
L.push(`- **Delivery rate** ${pct(delivered, outbound.length)}% (${fmt(delivered)} of ${fmt(outbound.length)}).`);
L.push(`- **Opt-out rate** ${((optouts.length / (outbound.length || 1)) * 100).toFixed(2)}% (${fmt(optouts.length)} of ${fmt(outbound.length)}).`);
L.push(`- **Ballot responses** ${fmt(ballotReplies.length)} (${pct(ballotReplies.length, inbound.length)}% of replies).`);
L.push(`- **Undelivered** ${fmt(undelivered)}: ${Object.entries(errorCounts).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} ${errorDescription(Number(c))} (${n})`).join("; ")}.`);
L.push("");
L.push(`## Appendix A — Conversations (${conversations.length})`);
L.push("");
for (const t of conversations) {
  L.push(`<div style="page-break-before: always;"></div>`, "");
  L.push(`### ${t.name} — ${t.phone}`, "");
  if (t.outbound) L.push(`> **Outbound** (${et(t.outbound.date_created)} ET) — ${mdEscape(t.outbound.body)}`, "");
  for (const m of t.messages) L.push(`> **Reply** (${et(m.date_created)} ET) — ${mdEscape(m.body)}`, "");
}
L.push(`## Appendix B — Opt-out threads (${optoutThreads.length})`);
L.push("");
for (const t of optoutThreads) {
  L.push(`<div style="page-break-before: always;"></div>`, "");
  L.push(`### ${t.name} — ${t.phone}`, "");
  for (const m of t.messages) L.push(`> **${mdEscape((m.body || "").trim())}** (${et(m.date_created)} ET)`, "");
}
fs.writeFileSync(`${OUTDIR}/${prefix}-report.md`, L.join("\n"));

console.log(JSON.stringify({ campaign: CAMPAIGN, outbound: outbound.length, inbound: inbound.length, uniqueRecipients, statusCounts, errorCounts, themeCounts, ballotByPick, conversations: conversations.length, optoutThreads: optoutThreads.length }, null, 2));
