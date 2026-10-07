import { describe, expect, test } from "vitest";
import { csvRow } from "@/lib/csv";
import { mapAudienceImportRow, prepareAudienceImport } from "@/lib/audience-import-map";

const mapping = {
  "first name": "firstname",
  phone: "phone",
  "opt out": "opt_out",
  source: "other_data",
};

function upload(value: string, headerMapping = mapping) {
  const csv = ["First Name,Phone,Opt Out,Source", csvRow(["Ada", "(416) 555-1234", value, "Customer CRM"])].join("\n");
  const prepared = prepareAudienceImport(Buffer.from(csv), headerMapping, null, null);
  return mapAudienceImportRow(prepared.contacts[0].data, prepared.effective, "user-fixture", new Date("2026-01-01"));
}

describe("actual audience upload opt-out mapping", () => {
  test.each([
    { value: "unsubscribe", expected: true },
    { value: "opted out", expected: true },
    { value: "opted-out", expected: true },
    { value: "opted_out", expected: true },
    { value: "  UnSuBsCrIbE  ", expected: true },
    { value: "do   not\tcontact", expected: true },
    { value: "yes", expected: true },
    { value: "true", expected: true },
    { value: "1", expected: true },
    { value: "no", expected: false },
    { value: "n", expected: false },
    { value: "false", expected: false },
    { value: "0", expected: false },
    { value: "opted in", expected: false },
    { value: "opted-in", expected: false },
    { value: "subscribed", expected: false },
    { value: "active", expected: false },
    { value: "pending", expected: false },
    { value: "  NO  ", expected: false },
    { value: "", expected: false },
    { value: "   ", expected: false },
    { value: "pending review", expected: true },
    { value: "maybe", expected: true },
    { value: "definitely-not-a-consent-value", expected: true },
  ])("writes $value as boolean $expected", async ({ value, expected }) => {
    const { contact } = upload(value);
    expect(contact).toMatchObject({
      firstname: "Ada",
      phone: "+14165551234",
      opt_out: expected,
      other_data: [{ Source: "Customer CRM" }],
    });
  });

  test("an unmapped opt-out cell stays outside the contact write", async () => {
    const { contact } = upload("unsubscribe", { ...mapping, "opt out": "ignore" });
    expect(contact).not.toHaveProperty("opt_out");
    expect(contact).toMatchObject({
      firstname: "Ada",
      phone: "+14165551234",
      other_data: [{ Source: "Customer CRM" }],
    });
  });
});
