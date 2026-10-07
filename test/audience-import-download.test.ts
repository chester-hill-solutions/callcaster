import { describe, expect, test } from "vitest";
import { escapeImportReportCell } from "@/lib/audience-import-download.server";

describe("import report spreadsheet safety", () => {
  test.each(["=1+1", "+1+1", "-1+1", "@SUM(A1)", "  =HYPERLINK(\"x\")", "\tplain", "\rplain", "\nplain", "+14165551234"])(
    "neutralizes the user-controlled cell %j", value => {
      expect(escapeImportReportCell(value)).toBe(`'${value}`);
    },
  );
  test.each(["Ada", "4165551234", "Phone", "", " normal text"])("preserves ordinary cell %j", value => {
    expect(escapeImportReportCell(value)).toBe(value);
  });
});
