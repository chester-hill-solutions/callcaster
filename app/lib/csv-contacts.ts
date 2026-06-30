import { parse } from "csv-parse/sync";
import type { Json } from "@/lib/db-types";
import type { Contact } from "./types";
import { parsePhoneNumber } from "./phone";

const headerMappings = {
  firstname: [
    /^(contact[-_\s]?)?(first[-_\s]?name|given[-_\s]?name|forename)$/i,
  ],
  surname: [/^(contact[-_\s]?)?(last[-_\s]?name|surname|family[-_\s]?name)$/i],
  phone: [
    /^(contact[-_\s]?)?(phone|phone[-_\s]?number|mobile|mobile[-_\s]?number|cell|cell[-_\s]?phone|telephone|tel)$/i,
  ],
  email: [
    /^(contact[-_\s]?)?(email|email[-_\s]?address|e-mail|e-mail[-_\s]?address)$/i,
  ],
  address: [
    /^(contact[-_\s]?)?(address|street|street[-_\s]?address|mailing[-_\s]?address|property[-_\s]?address|address[-_\s]?line[-_\s]?1)$/i,
  ],
  city: [/^(contact[-_\s]?)?(city|town|municipality)$/i],
  opt_out: [
    /^(contact[-_\s]?)?(opt[-_]?out|unsubscribe|do[-_\s]?not[-_\s]?contact|consent|permission)$/i,
  ],
  external_id: [
    /^(contact[-_\s]?)?(external[-_\s]?id|vanid|van[-_\s]?id|id|record[-_\s]?id|unique[-_\s]?identifier)$/i,
  ],
  postal: [
    /^(contact[-_\s]?)?(postal|postal[-_]?code|zip|zip[-_]?code|postcode)$/i,
  ],
  name: [/^(contact[-_\s]?)?(full[-_\s]?name|name)$/i],
  province: [/^(contact[-_\s]?)?(province|state|region)$/i],
  country: [/^(contact[-_\s]?)?(country|nation)$/i],
};

const parseCSVHeaders = (unparsedHeaders: string[]) => {
  return unparsedHeaders.map((header) => header.toLowerCase().trim());
};

type CsvHeaderKey = keyof typeof headerMappings;

const matchHeader = (header: string) => {
  for (const [key, patterns] of Object.entries(headerMappings)) {
    if (patterns.some((pattern) => pattern.test(header))) {
      return key as CsvHeaderKey;
    }
  }
  return null;
};

const parseEmail = (email: string | null) => {
  if (!email) return null;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) ? email.toLowerCase() : null;
};

const parseName = (name: string | null) => {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return { firstname: "", surname: "" };

  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return { firstname: parts[0] ?? "", surname: null };
  }
  if (parts.length === 2) {
    return { firstname: parts[0] ?? "", surname: parts[1] ?? null };
  }
  return { firstname: parts[0] ?? "", surname: parts.slice(1).join(" ") || null };
};

const parseOptOut = (value: string | null) => {
  if (typeof value === "string") {
    value = value.toLowerCase().trim();
    return ["yes", "true", "1", "opt-out", "unsubscribe"].includes(value);
  }
  return Boolean(value);
};

type ParsedCsvContact = Pick<
  Contact,
  | "firstname"
  | "surname"
  | "phone"
  | "email"
  | "address"
  | "city"
  | "opt_out"
  | "created_at"
  | "workspace"
  | "external_id"
  | "postal"
  | "province"
  | "country"
  | "other_data"
>;

const parseCSVData = (data: string[][], parsedHeaders: string[]) => {
  return data.slice(1).map((row) => {
    const contact: ParsedCsvContact = {
      firstname: null,
      surname: null,
      phone: null,
      email: null,
      address: null,
      city: null,
      opt_out: false,
      created_at: new Date().toISOString(),
      workspace: null,
      external_id: null,
      postal: null,
      province: null,
      country: null,
      other_data: [],
    };

    parsedHeaders.forEach((header, index) => {
      const value = row[index]?.trim() || null;
      const key = matchHeader(header);

      if (key) {
        switch (key) {
          case "name": {
            const { firstname, surname } = parseName(value);
            contact.firstname = firstname;
            contact.surname = surname;
            break;
          }
          case "firstname":
          case "surname":
            contact[key] = value;
            break;
          case "phone":
            contact.phone = parsePhoneNumber(value);
            break;
          case "email":
            contact.email = parseEmail(value);
            break;
          case "opt_out":
            contact.opt_out = parseOptOut(value);
            break;
          case "address":
          case "city":
          case "external_id":
          case "postal":
          case "province":
          case "country":
            contact[key] = value;
            break;
          default:
            break;
        }
      } else if (value !== null) {
        contact.other_data.push({ [header]: value } as Json);
      }
    });

    return contact;
  });
};

export const parseCSV = (csvString: string) => {
  try {
    const records = parse(csvString);
    const headers = parseCSVHeaders(records[0]);
    const contacts = parseCSVData(records, headers);

    return { headers, contacts };
  } catch (error) {
    console.error("Error parsing CSV:", error);
    throw new Error("Failed to parse CSV file");
  }
};
