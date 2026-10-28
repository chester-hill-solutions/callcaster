import {
  loadCampaignReportData,
  type CampaignReportData,
  type CampaignReportRow,
  type ReportMessage,
} from "@/lib/campaign-sms-report-data.server";
import { reportPdf } from "@/lib/campaign-sms-report-pdf.server";

const TWILIO_ERROR_DESCRIPTIONS: Record<number, string> = {
  30002: "Account suspended",
  30003: "Unreachable destination handset",
  30005: "Unknown destination handset",
  30006: "Landline or unreachable carrier",
  30008: "Unknown error (generic carrier delivery failure)",
  30034: "US A2P 10DLC - Message from an Unregistered Number",
};

export type CampaignSmsReportFile = {
  filename: string;
  label: string;
  contentType: string;
  body: string | Uint8Array;
};

type CampaignReportSummary = {
  recipients: Set<string>;
  optouts: ReportMessage[];
  sent: number;
  delivered: number;
  undelivered: number;
  outboundCount: number;
  inboundCount: number;
  errorCounts: Map<number, number>;
  replyCounts: Map<string, number>;
  dailyVolume: Map<string, number>;
  allMessages: unknown[][];
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

function messageCsvRow(direction: string, message: ReportMessage) {
  return [
    direction,
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
    message.external_id,
  ];
}

function createReportSummary(data: CampaignReportData): CampaignReportSummary {
  const { outbound, outboundWithContacts, inboundWithContacts } = data;
  const recipients = new Set(
    outbound.map((message) => digits(message.to)).filter(Boolean),
  );
  const optouts = inboundWithContacts.filter((message) => isStop(message.body));
  const statusCounts = new Map<string, number>();
  const errorCounts = new Map<number, number>();
  const replyCounts = new Map<string, number>();
  for (const message of outbound) {
    if (message.status) {
      statusCounts.set(
        message.status,
        (statusCounts.get(message.status) ?? 0) + 1,
      );
    }
    if (message.error_code != null) {
      errorCounts.set(
        message.error_code,
        (errorCounts.get(message.error_code) ?? 0) + 1,
      );
    }
  }
  for (const message of inboundWithContacts) {
    const theme = replyTheme(message.body);
    replyCounts.set(theme, (replyCounts.get(theme) ?? 0) + 1);
  }
  const dailyVolume = new Map<string, number>();
  for (const message of [...outbound, ...inboundWithContacts]) {
    const timestamp =
      message.direction === "inbound"
        ? message.date_created
        : (message.date_sent ?? message.date_created);
    if (!timestamp) continue;
    const day = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Toronto",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(timestamp);
    dailyVolume.set(day, (dailyVolume.get(day) ?? 0) + 1);
  }
  const allMessages = [
    ...outboundWithContacts.map((message) =>
      messageCsvRow("outbound", message),
    ),
    ...inboundWithContacts.map((message) => messageCsvRow("inbound", message)),
    ...data.staff.map((message) => messageCsvRow("staff", message)),
  ].sort((left, right) => String(left[6]).localeCompare(String(right[6])));

  return {
    recipients,
    optouts,
    sent: statusCounts.get("sent") ?? 0,
    delivered: statusCounts.get("delivered") ?? 0,
    undelivered: statusCounts.get("undelivered") ?? 0,
    outboundCount: outbound.length,
    inboundCount: inboundWithContacts.length,
    errorCounts,
    replyCounts,
    dailyVolume,
    allMessages,
  };
}

function summaryOutboundDate(
  summary: CampaignReportSummary,
  edge: "first" | "last",
) {
  const outboundRows = summary.allMessages.filter(
    (row) => row[0] === "outbound",
  );
  const dates = outboundRows
    .map((row) => row[7] || row[6])
    .filter(Boolean)
    .map((value) => new Date(String(value)))
    .sort((left, right) => left.getTime() - right.getTime());
  return dates[edge === "first" ? 0 : dates.length - 1] ?? null;
}

function appendReportOverview(
  lines: string[],
  campaign: CampaignReportRow,
  summary: CampaignReportSummary,
) {
  const { recipients, sent, delivered, undelivered, inboundCount, optouts } =
    summary;
  lines.push(
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
    `| Delivery rate | ${percent(delivered, summary.outboundCount)}% |`,
    `| Inbound replies | ${formatNumber(inboundCount)} |`,
    `| Opt-outs (STOP) | ${formatNumber(optouts.length)} |`,
    `| Active window | ${et(summaryOutboundDate(summary, "first"))} – ${et(summaryOutboundDate(summary, "last"))} ET |`,
    "",
  );
}

function appendOutboundSections(
  lines: string[],
  campaign: CampaignReportRow,
  summary: CampaignReportSummary,
) {
  const { recipients, sent, delivered, undelivered, errorCounts, dailyVolume } =
    summary;
  lines.push(
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
  );
}

function appendInboundSections(
  lines: string[],
  inbound: ReportMessage[],
  summary: CampaignReportSummary,
) {
  const replyBodies = new Map<string, number>();
  for (const message of inbound) {
    const body = message.body?.trim() || "(empty)";
    replyBodies.set(body, (replyBodies.get(body) ?? 0) + 1);
  }
  lines.push(
    "## Inbound",
    "",
    "### Replies by theme",
    "",
    "| Theme | Count | Share |",
    "|---|---|---|",
    ...[...summary.replyCounts].map(
      ([theme, count]) =>
        `| ${theme} | ${formatNumber(count)} | ${percent(count, summary.inboundCount)}% |`,
    ),
    "",
    "### Verbatim reply text",
    "",
    "| Reply text | Count |",
    "|---|---|",
    ...[...replyBodies].map(
      ([body, count]) => `| ${markdownCell(body)} | ${formatNumber(count)} |`,
    ),
    "",
  );
}

function appendHealthSection(lines: string[], summary: CampaignReportSummary) {
  lines.push(
    "## Campaign health",
    "",
    `- Delivery rate: ${percent(summary.delivered, summary.outboundCount)}% (${summary.delivered} of ${summary.outboundCount}).`,
    `- Opt-out rate: ${((summary.optouts.length / (summary.outboundCount || 1)) * 100).toFixed(2)}% (${summary.optouts.length} of ${summary.outboundCount}).`,
    `- Replies per recipient: ${percent(summary.inboundCount, summary.recipients.size)}%.`,
    "",
  );
}

function groupInboundThreads(messages: ReportMessage[]) {
  const threadGroups = new Map<string, ReportMessage[]>();
  for (const message of messages) {
    const phone = digits(
      message.direction === "inbound" ? message.from : message.to,
    );
    const thread = threadGroups.get(phone) ?? [];
    thread.push(message);
    threadGroups.set(phone, thread);
  }
  return threadGroups;
}

function appendThreadPageHeader(
  lines: string[],
  messages: ReportMessage[],
  phone: string,
) {
  const firstMessage = messages[0];
  if (!firstMessage) return;
  lines.push(
    '<div style="page-break-before: always;"></div>',
    `### ${contactName(firstMessage)} — ${phone}`,
    "",
  );
}

function isConversationThread(messages: ReportMessage[]) {
  return messages.some(
    (message) => message.direction === "inbound" && !isStop(message.body),
  );
}

function hasOptOutReply(messages: ReportMessage[]) {
  return messages.some(
    (message) => message.direction === "inbound" && isStop(message.body),
  );
}

function appendConversationAppendix(
  lines: string[],
  data: CampaignReportData,
  threadGroups: Map<string, ReportMessage[]>,
) {
  const replyThreads = [...threadGroups.values()].filter((messages) =>
    isConversationThread(messages),
  );
  lines.push(`## Appendix A — Conversations (${replyThreads.length})`, "");
  for (const [phone, messages] of threadGroups) {
    if (!isConversationThread(messages)) continue;
    appendThreadPageHeader(lines, messages, phone);
    const sentMessages = data.outboundWithContacts.filter(
      (message) => digits(message.to) === phone,
    );
    for (const sentMessage of sentMessages) {
      lines.push(
        `> **Outbound** (${et(sentMessage.date_sent ?? sentMessage.date_created)} ET) — ${markdownCell(sentMessage.body)}`,
        "",
      );
    }
    for (const message of messages) {
      lines.push(
        `> **${message.direction === "inbound" ? "Reply" : "Staff reply"}** (${et(message.date_created)} ET) — ${markdownCell(message.body)}`,
        "",
      );
    }
  }
}

function appendOptOutAppendix(
  lines: string[],
  threadGroups: Map<string, ReportMessage[]>,
) {
  const optOutThreads = [...threadGroups.values()].filter(
    (messages) => hasOptOutReply(messages) && !isConversationThread(messages),
  );
  lines.push(`## Appendix B — Opt-out threads (${optOutThreads.length})`, "");
  for (const [phone, messages] of threadGroups) {
    if (!hasOptOutReply(messages) || isConversationThread(messages)) continue;
    appendThreadPageHeader(lines, messages, phone);
    for (const message of messages) {
      lines.push(
        `> **${markdownCell(message.body)}** (${et(message.date_created)} ET)`,
        "",
      );
    }
  }
}

function createReportMarkdown(
  data: CampaignReportData,
  summary: CampaignReportSummary,
) {
  const lines: string[] = [];
  appendReportOverview(lines, data.campaign, summary);
  appendOutboundSections(lines, data.campaign, summary);
  appendInboundSections(
    lines,
    [...data.inboundWithContacts, ...data.staff],
    summary,
  );
  appendHealthSection(lines, summary);
  const threads = groupInboundThreads(
    [...data.inboundWithContacts, ...data.staff].sort(
      (a, b) =>
        (a.date_created?.getTime() ?? 0) - (b.date_created?.getTime() ?? 0),
    ),
  );
  appendConversationAppendix(lines, data, threads);
  appendOptOutAppendix(lines, threads);
  return lines.join("\n");
}

/**
 * Build the SMS report from rows scoped to one workspace. The campaign id is
 * never treated as a global identifier at this boundary.
 */
export async function buildCampaignSmsReport(
  workspaceId: string,
  campaignId: number,
): Promise<CampaignSmsReportFile[]> {
  const data = await loadCampaignReportData(workspaceId, campaignId);
  const summary = createReportSummary(data);
  const markdown = createReportMarkdown(data, summary);
  const prefix = `campaign-${campaignId}`;
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
    "external_id",
  ];
  const replyBreakdown = [...summary.replyCounts].map(([theme, count]) => [
    theme,
    theme,
    count,
  ]);

  return [
    {
      filename: `${prefix}-report.pdf`,
      label: "Report (PDF)",
      contentType: "application/pdf",
      body: await reportPdf(markdown),
    },
    {
      filename: `${prefix}-report.md`,
      label: "Report (Markdown)",
      contentType: "text/markdown; charset=utf-8",
      body: markdown,
    },
    {
      filename: `${prefix}-all-messages.csv`,
      label: "All messages (CSV)",
      contentType: "text/csv; charset=utf-8",
      body: csv(csvHeaders, summary.allMessages),
    },
    {
      filename: `${prefix}-opt-outs.csv`,
      label: "Opt-outs (CSV)",
      contentType: "text/csv; charset=utf-8",
      body: csv(
        ["contact_name", "phone", "body", "date_created", "external_id"],
        summary.optouts.map((message) => [
          contactName(message),
          message.from,
          message.body,
          iso(message.date_created),
          message.external_id,
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
