export const CONTACT_IMPORT_TARGETS = [
  "firstname",
  "surname",
  "name",
  "phone",
  "email",
  "opt_out",
  "address",
  "city",
  "province",
  "postal",
  "country",
  "external_id",
  "carrier",
  "other_data",
] as const;

export type ContactImportTarget = (typeof CONTACT_IMPORT_TARGETS)[number];

export const CONTACT_IMPORT_LABELS: Record<ContactImportTarget, string> = {
  firstname: "First name",
  surname: "Last name",
  name: "Full name",
  phone: "Phone number",
  email: "Email address",
  opt_out: "Opt-out status",
  address: "Street address",
  city: "City",
  province: "Province or state",
  postal: "Postal or ZIP code",
  country: "Country",
  external_id: "External ID",
  carrier: "Phone carrier",
  other_data: "Custom field",
};

const HEADER_ALIASES: Record<Exclude<ContactImportTarget, "other_data">, readonly string[]> = {
  firstname: ["first", "first name", "firstname", "given name", "givenname", "forename"],
  surname: ["last", "last name", "lastname", "surname", "family name", "familyname"],
  name: ["name", "full name", "fullname", "contact name"],
  phone: [
    "phone",
    "phone number",
    "phonenumber",
    "mobile",
    "mobile number",
    "cell",
    "cell phone",
    "telephone",
    "tel",
  ],
  email: [
    "email",
    "email address",
    "emailaddress",
    "e-mail",
    "e-mail address",
    "e mail",
    "e mail address",
  ],
  opt_out: ["opt out", "optout", "unsubscribe", "do not contact", "consent"],
  address: ["address", "street", "street address", "mailing address", "address line 1"],
  city: ["city", "town", "municipality"],
  province: ["province", "state", "region"],
  postal: ["postal", "postal code", "postalcode", "zip", "zip code", "postcode"],
  country: ["country", "nation"],
  external_id: ["external id", "externalid", "record id", "unique identifier", "van id", "vanid"],
  carrier: ["carrier", "phone carrier", "mobile carrier"],
};

const normalizeHeader = (header: string): string =>
  header
    .trim()
    .toLowerCase()
    .replace(/^contact[\s_-]+/, "")
    .replace(/[\s_-]+/g, " ");

export function matchContactImportHeader(header: string): ContactImportTarget | null {
  const normalized = normalizeHeader(header);
  for (const target of CONTACT_IMPORT_TARGETS) {
    if (target === "other_data") continue;
    if (HEADER_ALIASES[target].includes(normalized)) return target;
  }
  return null;
}

/** True when any cell reads as a known contact column name (a header row). */
export function hasContactImportHeader(headers: readonly string[]): boolean {
  return headers.some((header) => matchContactImportHeader(header) !== null);
}

const PHONE_CELL = /^\+?[\d().\s-]{6,}(\s*(?:x|ext\.?|extension)\s*\d{1,6})?$/i;
const EMAIL_CELL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** "123 Main St", "45-A Rue Principale": a civic number followed by a street word. */
const STREET_ADDRESS_CELL = /^\d{1,6}[A-Za-z]?(?:-[A-Za-z0-9]+)?\s+[A-Za-z]/;
/** Canadian postal code or US ZIP / ZIP+4. */
const POSTAL_CELL = /^(?:[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d|\d{5}(?:-\d{4})?)$/;

/**
 * Whether a CSV row holds contact data rather than column names: a phone
 * (extensions included), an email, a street address, or a postal code. Used
 * to keep the first row of a headerless file instead of eating it as headers
 * (#1481, #1511); a row that also names a known column is treated as a header.
 */
export function isLikelyContactDataRow(values: readonly string[]): boolean {
  return values.some((value) => {
    const trimmed = value.trim();
    if (!trimmed) return false;
    return (
      PHONE_CELL.test(trimmed) ||
      EMAIL_CELL.test(trimmed) ||
      STREET_ADDRESS_CELL.test(trimmed) ||
      POSTAL_CELL.test(trimmed)
    );
  });
}

/** Whether the first row of a file is a header row. Known column names win; otherwise data-looking rows are data. */
export function csvFirstRowIsHeader(firstRow: readonly string[]): boolean {
  return hasContactImportHeader(firstRow) || !isLikelyContactDataRow(firstRow);
}

/** Column names the wizard and the server both use for a headerless file. */
export function generatedContactImportHeaders(columnCount: number): string[] {
  return Array.from({ length: columnCount }, (_, index) => `Column ${index + 1}`);
}

export function suggestContactImportMapping(
  headers: readonly string[],
): Record<string, ContactImportTarget> {
  return Object.fromEntries(
    headers.map((header) => [header, matchContactImportHeader(header) ?? "other_data"]),
  );
}

export type ContactImportMappingIssueCode =
  | "missing-phone"
  | "duplicate-target"
  | "ambiguous-name";

export interface ContactImportMappingIssue {
  code: ContactImportMappingIssueCode;
  message: string;
  blocking: boolean;
  headers: string[];
}

export function validateContactImportMapping(
  mapping: Readonly<Record<string, string>>,
): ContactImportMappingIssue[] {
  const issues: ContactImportMappingIssue[] = [];
  const entries = Object.entries(mapping);
  const phoneHeaders = entries.filter(([, target]) => target === "phone").map(([header]) => header);

  if (phoneHeaders.length === 0) {
    issues.push({
      code: "missing-phone",
      message: "Choose the column that contains phone numbers.",
      blocking: true,
      headers: [],
    });
  }

  for (const target of CONTACT_IMPORT_TARGETS) {
    if (target === "other_data") continue;
    const headers = entries
      .filter(([, mappedTarget]) => mappedTarget === target)
      .map(([header]) => header);
    if (headers.length > 1) {
      issues.push({
        code: "duplicate-target",
        message: `${CONTACT_IMPORT_LABELS[target]} is assigned to more than one CSV column.`,
        blocking: true,
        headers,
      });
    }
  }

  const fullNameHeaders = entries
    .filter(([, target]) => target === "name")
    .map(([header]) => header);
  const componentNameHeaders = entries
    .filter(([, target]) => target === "firstname" || target === "surname")
    .map(([header]) => header);
  if (fullNameHeaders.length > 0 && componentNameHeaders.length > 0) {
    issues.push({
      code: "ambiguous-name",
      message: "Choose either Full name or separate First name and Last name columns.",
      blocking: true,
      headers: [...fullNameHeaders, ...componentNameHeaders],
    });
  }

  return issues;
}

export function isContactImportTarget(value: string): value is ContactImportTarget {
  return (CONTACT_IMPORT_TARGETS as readonly string[]).includes(value);
}

export function splitContactFullName(value: string | null | undefined): {
  firstname: string;
  surname: string;
} {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return { firstname: "", surname: "" };

  if (trimmed.includes(",")) {
    const [surname = "", ...firstParts] = trimmed.split(",");
    return {
      firstname: firstParts.join(",").trim(),
      surname: surname.trim(),
    };
  }

  const [firstname = "", ...surnameParts] = trimmed.split(/\s+/);
  return { firstname, surname: surnameParts.join(" ") };
}
