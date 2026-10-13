import { resolve } from "node:path";
import PDFDocument from "pdfkit";

function writeText(
  document: PDFKit.PDFDocument,
  text: string,
  options: PDFKit.Mixins.TextOptions,
  bold = false,
) {
  const runs: Array<{ font: string; text: string }> = [];
  for (const character of text) {
    const point = character.codePointAt(0) ?? 0;
    const primary = point <= 255 || (point >= 0x0e00 && point <= 0x0e7f);
    const font = primary
      ? bold
        ? "Report-Bold"
        : "Report"
      : point <= 0xffff
        ? "Fallback"
        : "Fallback-Upper";
    const previous = runs.at(-1);
    if (previous?.font === font) previous.text += character;
    else runs.push({ font, text: character });
  }
  for (const [index, run] of runs.entries()) {
    document.font(run.font).text(run.text, {
      ...options,
      continued: index < runs.length - 1,
    });
  }
}

export function reportPdf(markdown: string): Promise<Buffer> {
  const document = new PDFDocument({
    size: "LETTER",
    margins: { top: 48, right: 48, bottom: 48, left: 48 },
  });
  const chunks: Buffer[] = [];
  return new Promise((finish, reject) => {
    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    document.on("error", reject);
    document.on("end", () => finish(Buffer.concat(chunks)));
    document.registerFont(
      "Report",
      resolve("public/fonts/Sarabun-Regular.ttf"),
    );
    document.registerFont(
      "Report-Bold",
      resolve("public/fonts/Sarabun-Bold.ttf"),
    );
    document.registerFont(
      "Fallback",
      resolve("public/fonts/sms-report/unifont-18.0.01.otf"),
    );
    document.registerFont(
      "Fallback-Upper",
      resolve("public/fonts/sms-report/unifont_upper-18.0.01.otf"),
    );

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
      const headingLevel = /^(#{1,3}) /.exec(line)?.[1]?.length;
      if (headingLevel && document.y > document.page.height - 100)
        document.addPage();
      document.markContent("Span", { actual: rawLine });
      document.fillColor("#111827");
      if (headingLevel) {
        const level = headingLevel;
        document
          .moveDown(level === 1 ? 0 : 0.3)
          .fontSize(level === 1 ? 18 : level === 2 ? 14 : 11);
        writeText(document, line.slice(level + 1), { paragraphGap: 5 }, true);
      } else if (line.startsWith("|")) {
        const cells = line
          .split("|")
          .slice(1, -1)
          .map((cell) => cell.trim());
        document.fontSize(8);
        writeText(document, cells.join("   |   "), { paragraphGap: 2 });
      } else if (line.startsWith("> ")) {
        document.fontSize(9).fillColor("#374151");
        writeText(document, line.slice(2), { indent: 14, paragraphGap: 3 });
      } else {
        document.fontSize(9);
        writeText(
          document,
          line.startsWith("- ") ? `• ${line.slice(2)}` : line,
          { paragraphGap: 3 },
        );
      }
      document.endMarkedContent();
    }
    document.end();
  });
}
