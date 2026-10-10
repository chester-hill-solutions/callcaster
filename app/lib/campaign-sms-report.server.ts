import { asc, eq, inArray, sql } from "drizzle-orm";
import PDFDocument from "pdfkit";
import {
  campaign as campaignTable,
  contact as contactTable,
  message as messageTable,
} from "@/db/schema";
import { createTenantDb } from "@/server/tenant-db";

const TWILIO_ERROR_DESCRIPTIONS: Record<number, string> = {
  30002: "Account suspended",
  30003: "Unreachable destination handset",
  30005: "Unknown destination handset",
  30006: "Landline or unreachable carrier",
  30008: "Unknown error (generic carrier delivery failure)",
  30034: "US A2P 10DLC - Message from an Unregistered Number",
};

type ReportMessage = {
  sid: string;
  status: string | null;
  from: string | null;
  to: string | null;
  body: string | null;
  direction?: string | null;
  num_segments: string | null;
  error_code: number | null;
  date_created: Date | null;
  date_sent: Date | null;
  contact_id: number | null;
  firstname?: string | null;
  surname?: string | null;
  phone?: string | null;
};

type CampaignReportRow = {
  id: number;
  title: string;
  type: string | null;
  status: string | null;
  start_date: string | null;
  caller_id: string | null;
  body_text: string | null;
  is_sample: boolean;
};

export type CampaignSmsReportFile = {
  filename: string;
  label: string;
  contentType: string;
  body: string | Uint8Array;
};

const digits = (value: string | null | undefined) =>
  (value ?? "").replace(/\D/g, "");
const isStop = (body: string | null | undefined) =>
  /^\s*stop\b/i.test(body ?? "");
const contactName = (message: ReportMessage) =>
  [message.firstname, message.surname].filter(Boolean).join(" ").trim() ||
  "Unknown";
const errorDescription = (code: number | null) =>
  code == null ? "" : (TWILIO_ERROR_DESCRIPTIONS[code] ?? `Unknown (${code})`);
const iso = (date: Date | null) => date?.toISOString() ?? "";
const et = (date: Date | null) =>
  date
    ? new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Toronto",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(date)
    : "";
const csvCell = (value: unknown) => {
  let result = value == null ? "" : String(value);
  if (/^[\s]*[=+\-@]/.test(result)) result = `'${result}`;
  return /[",\r\n]/.test(result) ? `"${result.replace(/"/g, '""')}"` : result;
};
const csv = (headers: string[], rows: unknown[][]) =>
  `\uFEFF${[headers.join(","), ...rows.map((row) => row.map(csvCell).join(","))].join("\r\n")}\r\n`;
const formatNumber = (value: number) => value.toLocaleString("en-US");
const percent = (value: number, total: number) =>
  total ? ((value / total) * 100).toFixed(1) : "0.0";
const markdownCell = (value: unknown) =>
  String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ");

function reportPdf(markdown: string): Promise<Buffer> {
  const document = new PDFDocument({
    size: "LETTER",
    margins: { top: 48, right: 48, bottom: 48, left: 48 },
  });
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    document.on("error", reject);
    document.on("end", () => resolve(Buffer.concat(chunks)));
    const plainText = (value: string) =>
      Array.from(value, (character) => {
        if (character === "—" || character === "–") return "-";
        if (character === "“" || character === "”") return '"';
        if (character === "‘" || character === "’") return "'";
        const codePoint = character.codePointAt(0) ?? 0;
        return codePoint === 9 || codePoint === 10 || codePoint === 13 ||
          (codePoint >= 32 && codePoint <= 255)
          ? character
          : "?";
      }).join("");

    for (const rawLine of markdown.split("\n")) {
      if (
        rawLine.startsWith('<div style="page-break-before: always;"></div>')
      ) {
        document.addPage();
        continue;
      }
      const line = rawLine.trim();
      if (!line) {
        document.moveDown(0.35);
        continue;
      }
      if (/^\|[-| :]+\|$/.test(line)) continue;
      if (line.startsWith("# ")) {
        document
          .font("Helvetica-Bold")
          .fontSize(18)
          .fillColor("#111827")
          .text(plainText(line.slice(2)), { paragraphGap: 8 });
      } else if (line.startsWith("## ")) {
        document
          .moveDown(0.4)
          .font("Helvetica-Bold")
          .fontSize(14)
          .fillColor("#111827")
          .text(plainText(line.slice(3)), { paragraphGap: 5 });
      } else if (line.startsWith("### ")) {
        document
          .moveDown(0.25)
          .font("Helvetica-Bold")
          .fontSize(11)
          .fillColor("#111827")
          .text(plainText(line.slice(4)), { paragraphGap: 3 });
      } else if (line.startsWith("|")) {
        const cells = line
          .split("|")
          .slice(1, -1)
          .map((cell) => cell.trim())
          .filter(Boolean);
        document
          .font("Helvetica")
          .fontSize(8)
          .fillColor("#111827")
          .text(plainText(cells.join("   |   ")), { paragraphGap: 2 });
      } else if (line.startsWith("> ")) {
        document
          .font("Helvetica")
          .fontSize(9)
          .fillColor("#374151")
          .text(plainText(line.slice(2)), { indent: 14, paragraphGap: 3 });
      } else if (line.startsWith("- ")) {
        document
          .font("Helvetica")
          .fontSize(9)
          .fillColor("#111827")
          .text(`• ${plainText(line.slice(2))}`, { paragraphGap: 3 });
      } else {
        document
          .font("Helvetica")
          .fontSize(9)
          .fillColor("#111827")
          .text(plainText(line), { paragraphGap: 3 });
      }
    }
    document.end();
  });
}

function replyTheme(body: string | null) {
  const text = (body ?? "").trim().toLowerCase();
  if (isStop(body)) return "Opt-out";
  if (
    /\b(register|registration|registered|vote|voting|polling|where do i vote)\b/.test(
      text,
    )
  )
    return "Registration problem";
  if (/\b(yes|support|positive|agree|absolutely|great|good)\b/.test(text))
    return "Positive";
  if (/\b(policy|candidate|party|election|campaign|politic)\b/.test(text))
    return "Political";
  return "Other";
}

/**
 * Build the SMS report from rows scoped to one workspace. The campaign id is
 * never treated as a global identifier at this boundary.
 */
export async function buildCampaignSmsReport(
  workspaceId: string,
  campaignId: number,
): Promise<CampaignSmsReportFile[]> {
  const tdb = createTenantDb(workspaceId);
  const campaign = (await tdb.campaign.findFirst({
    where: eq(campaignTable.id, campaignId),
    columns: {
      id: true,
      title: true,
      type: true,
      status: true,
      start_date: true,
      caller_id: true,
      body_text: true,
      is_sample: true,
    },
  })) as CampaignReportRow | undefined;

  if (!campaign) throw new Error("Campaign not found");
  if (campaign.type !== "message")
    throw new Error("This report is for message campaigns");
  if (campaign.status !== "complete")
    throw new Error("The campaign must be complete before it can be exported");
  if (
    campaign.is_sample ||
    /(^|[^a-z0-9])test([^a-z0-9]|$)/i.test(campaign.title)
  ) {
    throw new Error("Test campaigns cannot be exported");
  }

  const outboundRows = (await tdb.message.findMany({
    where: eq(messageTable.campaign_id, campaignId),
    orderBy: asc(messageTable.date_created),
  })) as ReportMessage[];
  const outbound = outboundRows.filter(
    (message) => message.direction !== "inbound",
  );
  const contactIds = [
    ...new Set(
      outbound.flatMap((message) =>
        message.contact_id == null ? [] : [message.contact_id],
      ),
    ),
  ];
  const contacts = contactIds.length
    ? await tdb.contact.findMany({
        where: inArray(contactTable.id, contactIds),
      })
    : [];
  const contactById = new Map(
    contacts.map((contact) => [Number(contact.id), contact] as const),
  );
  const outboundWithContacts = outbound.map((message) => ({
    ...message,
    ...(contactById.get(Number(message.contact_id)) ?? {}),
  }));

  const recipientPhones = [
    ...new Set(outbound.map((message) => digits(message.to)).filter(Boolean)),
  ];
  const sinceDate = campaign.start_date
    ? new Date(campaign.start_date)
    : new Date(0);
  const since = Number.isNaN(sinceDate.getTime()) ? new Date(0) : sinceDate;
  const inbound: ReportMessage[] = [];
  for (let offset = 0; offset < recipientPhones.length; offset += 500) {
    const phoneBatch = recipientPhones.slice(offset, offset + 500);
    const inboundBatch = (await tdb.execute(sql`
        select m.sid, m.status, m."from", m."to", m.body, m.num_segments,
               m.error_code, m.date_created, m.date_sent, m.contact_id,
               c.firstname, c.surname, c.phone
        from ${messageTable} as m
        left join ${contactTable} as c
          on c.id = m.contact_id and c.workspace = ${workspaceId}
        where m.workspace = ${workspaceId}
          and m.direction = 'inbound'
          and m.date_created >= ${since}
          and regexp_replace(coalesce(m."from", ''), '[^0-9]', '', 'g') in
            (${sql.join(
              phoneBatch.map((phone) => sql`${phone}`),
              sql`, `,
            )})
        order by m.date_created, m.sid
      `)) as ReportMessage[];
    inbound.push(...inboundBatch);
  }

  const outboundPhones = new Map<string, string>();
  for (const message of outboundWithContacts) {
    const phone = digits(message.to);
    if (phone && !outboundPhones.has(phone)) {
      outboundPhones.set(
        phone,
        [message.firstname, message.surname].filter(Boolean).join(" ").trim() ||
          "Unknown",
      );
    }
  }
  const inboundWithContacts = inbound.map((message) => {
    if (message.firstname || message.surname) return message;
    return {
      ...message,
      firstname: outboundPhones.get(digits(message.from)) ?? "Unknown",
    };
  });
  const optouts = inboundWithContacts.filter((message) => isStop(message.body));
  const recipients = new Set(
    outbound.map((message) => digits(message.to)).filter(Boolean),
  );
  const statusCounts = new Map<string, number>();
  const errorCounts = new Map<number, number>();
  const replyCounts = new Map<string, number>();
  for (const message of outbound) {
    if (message.status)
      statusCounts.set(
        message.status,
        (statusCounts.get(message.status) ?? 0) + 1,
      );
    if (message.error_code != null)
      errorCounts.set(
        message.error_code,
        (errorCounts.get(message.error_code) ?? 0) + 1,
      );
  }
  for (const message of inboundWithContacts) {
    const theme = replyTheme(message.body);
    replyCounts.set(theme, (replyCounts.get(theme) ?? 0) + 1);
  }
  const sent = statusCounts.get("sent") ?? 0;
  const delivered = statusCounts.get("delivered") ?? 0;
  const undelivered = statusCounts.get("undelivered") ?? 0;
  const dailyVolume = new Map<string, number>();
  for (const message of [...outbound, ...inboundWithContacts]) {
    if (!message.date_created) continue;
    const day = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Toronto",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(message.date_created);
    dailyVolume.set(day, (dailyVolume.get(day) ?? 0) + 1);
  }
  const allMessages = [
    ...outboundWithContacts.map((message) => [
      "outbound",
      message.sid,
      message.status,
      message.from,
      message.to,
      contactName(message),
      iso(message.date_created),
      iso(message.date_sent),
      message.num_segments,
      message.error_code,
      errorDescription(message.error_code),
      message.body,
    ]),
    ...inboundWithContacts.map((message) => [
      "inbound",
      message.sid,
      message.status,
      message.from,
      message.to,
      contactName(message),
      iso(message.date_created),
      iso(message.date_sent),
      message.num_segments,
      message.error_code,
      errorDescription(message.error_code),
      message.body,
    ]),
  ].sort((left, right) => String(left[6]).localeCompare(String(right[6])));

  const csvHeaders = [
    "direction",
    "sid",
    "status",
    "from",
    "to",
    "contact_name",
    "date_created",
    "date_sent",
    "num_segments",
    "error_code",
    "error_description",
    "body",
  ];
  const markdown: string[] = [
    `# ${campaign.title} — SMS Report`,
    "",
    `**Campaign:** ${campaign.title} (id ${campaign.id})`,
    `**Report date:** ${new Date().toISOString().slice(0, 10)}`,
    `**Sender number:** ${campaign.caller_id ?? ""}`,
    "",
    "## Executive summary",
    "",
    "| Metric | Value |",
    "|---|---|",
    `| Unique recipients | ${formatNumber(recipients.size)} |`,
    `| Sent | ${formatNumber(sent)} |`,
    `| Delivered | ${formatNumber(delivered)} |`,
    `| Undelivered | ${formatNumber(undelivered)} |`,
    `| Delivery rate | ${percent(delivered, outbound.length)}% |`,
    `| Inbound replies | ${formatNumber(inboundWithContacts.length)} |`,
    `| Opt-outs (STOP) | ${formatNumber(optouts.length)} |`,
    `| Active window | ${et(outbound[0]?.date_created ?? null)} – ${et(outbound[outbound.length - 1]?.date_created ?? null)} ET |`,
    "",
    "## Outbound",
    "",
    "### Send run",
    "",
    "| Campaign | Status | Recipients | Sent | Delivered | Undelivered |",
    "|---|---|---|---|---|---|",
    `| ${markdownCell(campaign.title)} | ${campaign.status ?? ""} | ${formatNumber(recipients.size)} | ${formatNumber(sent)} | ${formatNumber(delivered)} | ${formatNumber(undelivered)} |`,
    "",
    "### Blast body",
    "",
    ...(campaign.body_text ?? "").split(/\r?\n/).map((line) => `> ${line}`),
    "",
    "### Delivery errors",
    "",
    "| Code | Description | Count |",
    "|---|---|---|",
    ...[...errorCounts].map(
      ([code, count]) =>
        `| ${code} | ${errorDescription(code)} | ${formatNumber(count)} |`,
    ),
    "",
    "### Daily volume",
    "",
    "| Date (ET) | Messages |",
    "|---|---|",
    ...[...dailyVolume]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([day, count]) => `| ${day} | ${formatNumber(count)} |`),
    "",
    "## Inbound",
    "",
    "### Replies by theme",
    "",
    "| Theme | Count | Share |",
    "|---|---|---|",
    ...[...replyCounts].map(
      ([theme, count]) =>
        `| ${theme} | ${formatNumber(count)} | ${percent(count, inboundWithContacts.length)}% |`,
    ),
    "",
    "### Verbatim reply text",
    "",
    "| Reply text | Count |",
    "|---|---|",
    ...[
      ...inboundWithContacts.reduce((counts, message) => {
        const body = message.body?.trim() || "(empty)";
        counts.set(body, (counts.get(body) ?? 0) + 1);
        return counts;
      }, new Map<string, number>()),
    ].map(
      ([body, count]) => `| ${markdownCell(body)} | ${formatNumber(count)} |`,
    ),
    "",
    "## Campaign health",
    "",
    `- Delivery rate: ${percent(delivered, outbound.length)}% (${delivered} of ${outbound.length}).`,
    `- Opt-out rate: ${((optouts.length / (outbound.length || 1)) * 100).toFixed(2)}% (${optouts.length} of ${outbound.length}).`,
    `- Replies per recipient: ${percent(inboundWithContacts.length, recipients.size)}%.`,
    "",
    `## Appendix A — Conversations (${[...new Set(inboundWithContacts.filter((message) => !isStop(message.body)).map((message) => digits(message.from)))].length})`,
    "",
  ];
  const threadGroups = new Map<string, ReportMessage[]>();
  for (const message of inboundWithContacts) {
    const phone = digits(message.from);
    if (!threadGroups.has(phone)) threadGroups.set(phone, []);
    threadGroups.get(phone)?.push(message);
  }
  for (const [phone, messages] of threadGroups) {
    if (messages.every((message) => isStop(message.body))) continue;
    const firstMessage = messages[0];
    if (!firstMessage) continue;
    markdown.push(
      '<div style="page-break-before: always;"></div>',
      `### ${contactName(firstMessage)} — ${phone}`,
      "",
    );
    const sentMessage = outboundWithContacts.find(
      (message) => digits(message.to) === phone,
    );
    if (sentMessage)
      markdown.push(
        `> **Outbound** (${et(sentMessage.date_created)} ET) — ${markdownCell(sentMessage.body)}`,
        "",
      );
    for (const message of messages)
      markdown.push(
        `> **Reply** (${et(message.date_created)} ET) — ${markdownCell(message.body)}`,
        "",
      );
  }
  markdown.push(
    `## Appendix B — Opt-out threads (${[...threadGroups.values()].filter((messages) => messages.every((message) => isStop(message.body))).length})`,
    "",
  );
  for (const [phone, messages] of threadGroups) {
    if (messages.some((message) => !isStop(message.body))) continue;
    const firstMessage = messages[0];
    if (!firstMessage) continue;
    markdown.push(
      '<div style="page-break-before: always;"></div>',
      `### ${contactName(firstMessage)} — ${phone}`,
      "",
    );
    for (const message of messages)
      markdown.push(
        `> **${markdownCell(message.body)}** (${et(message.date_created)} ET)`,
        "",
      );
  }

  const prefix = `campaign-${campaignId}`;
  const reportMarkdown = markdown.join("\n");
  const replyBreakdown = [
    ...[...replyCounts].map(([theme, count]) => [theme, theme, count]),
  ];
  return [
    {
      filename: `${prefix}-report.pdf`,
      label: "Report (PDF)",
      contentType: "application/pdf",
      body: await reportPdf(reportMarkdown),
    },
    {
      filename: `${prefix}-report.md`,
      label: "Report (Markdown)",
      contentType: "text/markdown; charset=utf-8",
      body: reportMarkdown,
    },
    {
      filename: `${prefix}-all-messages.csv`,
      label: "All messages (CSV)",
      contentType: "text/csv; charset=utf-8",
      body: csv(csvHeaders, allMessages),
    },
    {
      filename: `${prefix}-opt-outs.csv`,
      label: "Opt-outs (CSV)",
      contentType: "text/csv; charset=utf-8",
      body: csv(
        ["contact_name", "phone", "body", "date_created"],
        optouts.map((message) => [
          contactName(message),
          message.from,
          message.body,
          iso(message.date_created),
        ]),
      ),
    },
    {
      filename: `${prefix}-reply-breakdown.csv`,
      label: "Reply breakdown (CSV)",
      contentType: "text/csv; charset=utf-8",
      body: csv(["theme", "detail", "count"], replyBreakdown),
    },
  ];
}
