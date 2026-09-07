import type { Contact } from "@/lib/types";

/**
 * Stand-in contact for previews and test sends when the recipient is not a
 * workspace contact. Neutral, obviously fictional values.
 */
export const SAMPLE_TEMPLATE_CONTACT = {
  id: 1042,
  firstname: "Jordan",
  surname: "Lee",
  phone: "+16135550142",
  email: "jordan.lee@example.com",
  address: "100 Main St",
  city: "Ottawa",
  province: "ON",
  postal: "K1A 0B1",
  country: "Canada",
  external_id: "C-1042",
} as unknown as Contact;

const TEMPLATE_SYNTAX = /\{|btoa\(/;

/** True when the text contains anything processTemplateTags would rewrite. */
export function hasTemplateSyntax(text: string): boolean {
  return TEMPLATE_SYNTAX.test(text);
}

const TAG_PATTERN = /\{\{?\s*([a-zA-Z0-9_]+)(?:\|([^}]+))?\s*\}\}?/g;

const FIELD_READERS: Record<string, (contact: Contact) => string | number | null | undefined> = {
  firstname: (c) => c.firstname,
  surname: (c) => c.surname,
  fullname: (c) => `${c.firstname || ""} ${c.surname || ""}`.trim(),
  phone: (c) => c.phone,
  email: (c) => c.email,
  address: (c) => c.address,
  city: (c) => c.city,
  province: (c) => c.province,
  postal: (c) => c.postal,
  country: (c) => c.country,
  external_id: (c) => c.external_id,
  contact_id: (c) => c.id,
};

function contactField(contact: Contact, field: string): string {
  const read = Object.hasOwn(FIELD_READERS, field) ? FIELD_READERS[field] : undefined;
  const value = read?.(contact);
  return value == null ? "" : String(value);
}

function unquote(fallback: string): string {
  const trimmed = fallback.trim();
  const quoted = /^(["'])(.*)\1$/.exec(trimmed);
  return quoted?.[2] ?? trimmed;
}

/**
 * Process template tags in message text by replacing them with contact data.
 *
 * The editor inserts `{{field}}` and `{{field|"fallback"}}`; single-brace
 * forms are still accepted for bodies saved before the editor existed.
 */
export function processTemplateTags(text: string, contact: Contact): string {
  if (!text || !contact) return text;

  const processBraces = (input: string): string =>
    input.replace(TAG_PATTERN, (_match, field, fallback) => {
      const value = contactField(contact, field);
      if (!value && typeof fallback === "string") {
        return unquote(fallback);
      }
      return value;
    });

  const processFunctions = (input: string): string => {
    return input.replace(/btoa\(([^)]*)\)/g, (_match, inner) => {
      const processed = processBraces(inner);
      try {
        return typeof window !== "undefined" && window.btoa
          ? window.btoa(processed)
          : Buffer.from(processed, "utf-8").toString("base64");
      } catch {
        return "";
      }
    });
  };

  return processBraces(processFunctions(text));
}
