import { describe, expect, test } from "vitest";
import { mapAudienceImportRow, prepareAudienceImport } from "@/lib/audience-import-map.server";

describe("audience import effective identity and mapping", () => {
  const csv = Buffer.from('Name,Phone,Consent,Extra\r\n"Doe, Jane",4165551234,maybe,custom');
  const mapping = { Name: "name", Phone: "phone", Consent: "opt_out", Extra: "other_data" };
  test("retains quoted parser source and maps names, custom values and consent review", () => {
    const run = prepareAudienceImport(csv, mapping, "name", "manual");
    const row = run.contacts[0];
    expect(row.source).toEqual({ recordNumber: 2, byteStart: 26, byteEnd: 61, startLine: 2, endLine: 2 });
    expect(mapAudienceImportRow(row.data, run.effective, "actor", new Date("2026-01-01"))).toEqual({
      contact: { created_by: "actor", firstname: "Jane", surname: "Doe", phone: "+14165551234", opt_out: true,
        other_data: [{ Extra: "custom" }], voter_list_source: "manual", voter_list_imported_at: "2026-01-01T00:00:00.000Z" },
      warnings: [{ code: "unknown-opt-out", header: "Consent", value: "maybe" }], invalid: false,
    });
  });
  test("uses effective fields rather than mapping key order, case or ignored cells", () => {
    const first = prepareAudienceImport(csv, { Name: "firstname", Phone: "phone" }, null, null);
    const equivalent = prepareAudienceImport(csv, { extra: "ignore", phone: "phone", name: "firstname" }, null, null);
    expect(equivalent.identity).toBe(first.identity);
    expect(prepareAudienceImport(csv, { Name: "surname", Phone: "phone" }, null, null).identity).not.toBe(first.identity);
    expect(prepareAudienceImport(Buffer.concat([csv, Buffer.from("\n")]), { Name: "firstname", Phone: "phone" }, null, null).identity).not.toBe(first.identity);
    expect(prepareAudienceImport(csv, { Name: "firstname", Phone: "phone" }, null, "manual").identity).not.toBe(first.identity);
  });
  test.each([
    { fields: { Missing: "phone" }, error: "Missing headers" },
    { fields: { Name: "firstname", Extra: "firstname" }, error: "assigned to more than one" },
    { fields: { Name: "workspace" }, error: "Invalid import target" },
  ])("rejects invalid mapping $fields before a write", ({ fields, error }) => {
    expect(() => prepareAudienceImport(csv, fields, null, null)).toThrow(error);
  });
  test("rejects invalid UTF-8 rather than attaching replacement-character coordinates to original bytes", () => {
    expect(() => prepareAudienceImport(Buffer.from([78,97,109,101,10,255]), { Name:"firstname" }, null,null)).toThrow("valid UTF-8");
  });
});
