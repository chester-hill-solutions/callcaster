import { csvRow } from "@/lib/csv";
import { getAudienceImportReport } from "@/lib/audience-import-report.server";

type Report = NonNullable<Awaited<ReturnType<typeof getAudienceImportReport>>>;

/** The general CSV helper allows numeric phone prefixes; reports allow none. */
export function escapeImportReportCell(value: string): string {
  return /^[=+\-@]/.test(value.trimStart()) || /^[\t\r\n]/.test(value)
    ? `'${value}`
    : value;
}

function reportLines(report: Report, row: Report["rows"][number]): string[] {
  const phoneField = report.run.mapping.fields.find(([, target]) => target === "phone")?.[0] ?? "";
  const coordinates = [row.record_number, row.source.startLine, row.source.endLine,
    row.source.byteStart, row.source.byteEnd, row.outcome];
  const receipt = [row.contact_id ?? "", row.household_id ?? "", report.uploadStatus, report.run.next_index, report.run.source_rows];
  const reason = row.reason === "invalid-phone" ? "Invalid phone number"
    : row.reason === "duplicate-phone" ? "Duplicate phone number" : "Imported";
  const lines = [csvRow([...coordinates, escapeImportReportCell(row.reason ? phoneField : ""), "", reason, ...receipt])];
  for (const warning of row.warnings) {
    lines.push(csvRow([...coordinates, escapeImportReportCell(warning.header),
      escapeImportReportCell(warning.value), "Unknown opt-out value; contact is opted out and needs review", ...receipt]));
  }
  return lines;
}

/** Stream a captured committed prefix. A later batch is for the next download. */
export async function downloadAudienceImportReport(workspaceId: string, uploadId: number) {
  const first = await getAudienceImportReport(workspaceId, uploadId, 0, 100);
  if (!first) return null;
  const encoder = new TextEncoder();
  const capturedRows = first.run.next_index;
  let page = first;
  let written = 0;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(csvRow(["Record", "Start line", "End line", "Byte start", "Byte end",
        "Outcome", "Field", "Value", "Reason", "Contact ID", "Household ID", "Upload status", "Captured rows", "Source rows"]) + "\r\n"));
    },
    async pull(controller) {
      try {
        if (written === capturedRows) { controller.close(); return; }
        if (written > 0) {
          const last = page.rows.at(-1);
          if (!last) throw new Error("Import report page is empty");
          const next = await getAudienceImportReport(workspaceId, uploadId, last.record_number, 100);
          if (!next || next.run.id !== first.run.id) throw new Error("Import report changed during download");
          page = next;
        }
        const rows = page.rows.slice(0, capturedRows - written);
        if (!rows.length) throw new Error("Import report evidence is incomplete");
        controller.enqueue(encoder.encode(rows.flatMap(row => reportLines(first, row)).join("\r\n") + "\r\n"));
        written += rows.length;
      } catch (error) { controller.error(error); }
    },
  });
  return new Response(body, { headers: {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="call-list-import-${uploadId}.csv"`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  } });
}
