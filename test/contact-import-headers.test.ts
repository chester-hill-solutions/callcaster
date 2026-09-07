import { describe, expect, test } from "vitest";
import {
  CONTACT_IMPORT_LABELS,
  matchContactImportHeader,
  splitContactFullName,
  suggestContactImportMapping,
  validateContactImportMapping,
} from "../shared/contact-import-headers";

describe("contact import headers", () => {
  test.each([
    ["First Name", "firstname"],
    ["contact_given_name", "firstname"],
    ["SURNAME", "surname"],
    ["Full-Name", "name"],
    ["Mobile Number", "phone"],
    ["contact_phone_number", "phone"],
    ["E-mail Address", "email"],
    ["Postal_Code", "postal"],
    ["VAN ID", "external_id"],
  ])("matches %s to %s", (header, target) => {
    expect(matchContactImportHeader(header)).toBe(target);
  });

  test("suggests canonical targets and keeps original header keys", () => {
    expect(suggestContactImportMapping(["Phone Number", "Favourite Colour"])).toEqual({
      "Phone Number": "phone",
      "Favourite Colour": "other_data",
    });
  });

  test("provides human-readable labels for canonical targets", () => {
    expect(CONTACT_IMPORT_LABELS.phone).toBe("Phone number");
    expect(CONTACT_IMPORT_LABELS.other_data).toBe("Custom field");
  });

  test("blocks a mapping with no phone target", () => {
    expect(validateContactImportMapping({ Email: "email" })).toContainEqual(
      expect.objectContaining({ code: "missing-phone", blocking: true }),
    );
  });

  test("blocks duplicate non-custom targets while allowing custom fields", () => {
    const issues = validateContactImportMapping({
      Mobile: "phone",
      Telephone: "phone",
      Notes: "other_data",
      Tags: "other_data",
    });
    expect(issues).toContainEqual(
      expect.objectContaining({
        code: "duplicate-target",
        blocking: true,
        headers: ["Mobile", "Telephone"],
      }),
    );
    expect(issues.filter((issue) => issue.code === "duplicate-target")).toHaveLength(1);
  });

  test("warns when full and component name mappings compete", () => {
    expect(
      validateContactImportMapping({
        Phone: "phone",
        Name: "name",
        First: "firstname",
      }),
    ).toContainEqual(expect.objectContaining({ code: "ambiguous-name", blocking: true }));
  });

  test.each([
    ["Ada Lovelace", { firstname: "Ada", surname: "Lovelace" }],
    ["Mary Jane Watson", { firstname: "Mary", surname: "Jane Watson" }],
    ["Lovelace, Ada", { firstname: "Ada", surname: "Lovelace" }],
    ["Prince", { firstname: "Prince", surname: "" }],
    ["", { firstname: "", surname: "" }],
  ])("splits full name %j consistently", (name, expected) => {
    expect(splitContactFullName(name)).toEqual(expected);
  });
});

describe("headerless CSV detection (#1481, #1511)", async () => {
  const { csvFirstRowIsHeader, generatedContactImportHeaders, isLikelyContactDataRow } = await import(
    "../shared/contact-import-headers"
  );

  test("a known column name always makes the row a header", () => {
    expect(csvFirstRowIsHeader(["First Name", "Phone"])).toBe(true);
    expect(csvFirstRowIsHeader(["Phone Number", "6135551234"])).toBe(true);
  });

  test("a phone with an extension is data", () => {
    expect(isLikelyContactDataRow(["Jane Doe", "6135551234 ext 202"])).toBe(true);
    expect(isLikelyContactDataRow(["Jane Doe", "(613) 555-1234 x12"])).toBe(true);
    expect(csvFirstRowIsHeader(["Jane Doe", "6135551234 ext 202"])).toBe(false);
  });

  test("a name plus street address, or a postal code, is data", () => {
    expect(isLikelyContactDataRow(["Jane Doe", "123 Main St"])).toBe(true);
    expect(isLikelyContactDataRow(["Jane Doe", "K1A 0B1"])).toBe(true);
    expect(isLikelyContactDataRow(["Jane Doe", "90210"])).toBe(true);
    expect(isLikelyContactDataRow(["Jane Doe", "Ottawa"])).toBe(false);
  });

  test("an email is data; column-name-like words are not", () => {
    expect(isLikelyContactDataRow(["jane@example.com"])).toBe(true);
    expect(csvFirstRowIsHeader(["Nickname", "Notes"])).toBe(true);
  });

  test("generated headers match the wizard's names", () => {
    expect(generatedContactImportHeaders(3)).toEqual(["Column 1", "Column 2", "Column 3"]);
  });
});
