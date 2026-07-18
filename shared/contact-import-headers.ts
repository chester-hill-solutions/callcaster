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
