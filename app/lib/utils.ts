import { type ClassValue, clsx } from "clsx";
import { parse } from "csv-parse/sync";
import { twMerge } from "tailwind-merge";
import { ContentAndApprovalsPage } from "twilio/lib/rest/content/v1/contentAndApprovals";
import { OutreachExportData } from "./database.server";
import type { Json } from "./database.types";
import type { Contact, QueueItem, OutreachAttempt, Call } from "./types";
import { normalizePhoneNumber as normalizeNorthAmericanPhoneNumber } from "./utils/phone";
import { logger } from "@/lib/logger.server";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDateToLocale(dateFromSupabase: string) {
  const formattedDateTime = new Date(dateFromSupabase).toLocaleString();
  return formattedDateTime;
}

/** Tidy, readable timestamp for chat messages and conversation lists. */
export function formatMessageTimestamp(dateInput: string | Date): string {
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const timeStr = date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  if (dateOnly.getTime() === today.getTime()) {
    return timeStr;
  }
  if (dateOnly.getTime() === yesterday.getTime()) {
    return `Yesterday, ${timeStr}`;
  }
  if (date.getFullYear() === now.getFullYear()) {
    const dateStr = date.toLocaleDateString([], {
      month: "short",
      day: "numeric",
    });
    return `${dateStr}, ${timeStr}`;
  }
  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function capitalize(text: string): string {
  return text?.charAt(0).toUpperCase() + text?.slice(1);
}
export const stripPhoneNumber = (phoneNumber: string) =>
  phoneNumber.replace(/\D/g, "");

export function formatTableText(unformatted: string): string {
  const pattern = new RegExp(/[,_/\- ]/g);
  const splitString = unformatted.split(pattern);
  const formatted = splitString.map((str) => capitalize(str)).join(" ");

  return formatted;
}

export const isRecent = (date: string): boolean => {
  const created = new Date(date);
  const now = new Date();
  return (now.getTime() - created.getTime()) / 3600000 < 24;
};

export function deepEqual(
  obj1: unknown,
  obj2: unknown,
  path: string = "root",
  seen = new WeakMap<object, object>(),
): boolean {
  function log(message: string) {
    //console.log(`[${path}] ${message}`);
  }

  if (obj1 === obj2) return true;
  if (obj1 == null || obj2 == null) {
    //log(`One value is null or undefined: ${obj1 === null ? 'null' : 'undefined'} !== ${obj2 === null ? 'null' : 'undefined'}`);
    return false;
  }
  if (typeof obj1 !== "object" && typeof obj2 !== "object") {
    return obj1 === obj2;
  }

  if (obj1 instanceof Date && obj2 instanceof Date) {
    const equal = obj1.getTime() === obj2.getTime();
    if (!equal) log(`Date values differ: ${obj1} !== ${obj2}`);
    return equal;
  }
  if (obj1 instanceof RegExp && obj2 instanceof RegExp) {
    const equal = obj1.toString() === obj2.toString();
    if (!equal) log(`RegExp values differ: ${obj1} !== ${obj2}`);
    return equal;
  }

  const type1 = Object.prototype.toString.call(obj1);
  const type2 = Object.prototype.toString.call(obj2);
  if (type1 !== type2) {
    log(`Types differ: ${type1} !== ${type2}`);
    return false;
  }

  if (Array.isArray(obj1) && Array.isArray(obj2)) {
    if (obj1.length !== obj2.length) {
      log(`Array lengths differ: ${obj1.length} !== ${obj2.length}`);
      return false;
    }
    return obj1.every((item, index) =>
      deepEqual(item, obj2[index], `${path}[${index}]`, seen),
    );
  }

  const object1 = obj1 as Record<string, unknown>;
  const object2 = obj2 as Record<string, unknown>;

  if (seen.get(object1) === object2) return true;
  seen.set(object1, object2);

  const keys1 = Object.keys(object1);
  const keys2 = Object.keys(object2);

  if (keys1.length !== keys2.length) {
    log(`Number of keys differ: ${keys1.length} !== ${keys2.length}`);
    const extraKeys1 = keys1.filter((key) => !keys2.includes(key));
    const extraKeys2 = keys2.filter((key) => !keys1.includes(key));
    if (extraKeys1.length)
      log(`Extra keys in first object: ${extraKeys1.join(", ")}`);
    if (extraKeys2.length)
      log(`Extra keys in second object: ${extraKeys2.join(", ")}`);
    return false;
  }

  return keys1.every((key) => {
    if (!Object.prototype.hasOwnProperty.call(object2, key)) {
      log(`Second object doesn't have key: ${key}`);
      return false;
    }
    return deepEqual(object1[key], object2[key], `${path}.${key}`, seen);
  });
}
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
function parsePhoneNumber(input: string | null) {
  if (input) {
    let cleaned = input.replace(/[^0-9+]/g, "");

    if (cleaned.indexOf("+") > 0) {
      cleaned = cleaned.replace(/\+/g, "");
    }
    if (!cleaned.startsWith("+")) {
      cleaned = "+" + cleaned;
    }

    const validLength = 11;
    const minLength = 11;

    if (cleaned.length < minLength + 1) {
      cleaned = "+1" + cleaned.replace("+", "");
    }

    if (cleaned.length !== validLength + 1) {
      return null;
    }
    return cleaned;
  } else {
    return "";
  }
}

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
    logger.error("Error parsing CSV:", error);
    throw new Error("Failed to parse CSV file");
  }
};

export function campaignTypeText(campaignType: string): string {
  switch (campaignType) {
    case "message":
      return "Message";
    case "robocall":
      return "Robocall";
    case "simple_ivr":
      return "Simple IVR";
    case "complex_ivr":
      return "Complex IVR";
    case "live_call":
      return "Live Call";
    default:
      return "Invalid";
  }
}
export const sortQueue = (queue: QueueItem[]): QueueItem[] => {
  return [...queue].sort((a, b) => {
    if (a.attempts !== b.attempts) {
      return b.attempts - a.attempts;
    }
    if (a.id !== b.id) {
      return a.id - b.id;
    }
    return (a.queue_order ?? 0) - (b.queue_order ?? 0);
  });
};

export const createHouseholdMap = (
  queue: QueueItem[],
): Record<string, QueueItem[]> => {
  return queue.reduce<Record<string, QueueItem[]>>((acc, curr, index) => {
    if (curr?.contact?.address) {
      const address = curr.contact.address;
      if (!acc[address]) {
        acc[address] = [];
      }
      acc[address]?.push(curr);
    } else {
      acc[`NO_ADDRESS_${index}`] = [curr];
    }
    return acc;
  }, {});
};

export const updateAttemptWithCall = (
  attempt: OutreachAttempt,
  call: Call | null,
): OutreachAttempt => {
  const resultData =
    attempt.result && typeof attempt.result === "object" && !Array.isArray(attempt.result)
      ? attempt.result
      : {};

  return {
    ...attempt,
    result: {
      ...resultData,
      ...(call &&
        call.status &&
        call.direction !== "outbound-api" && { status: call.status }),
    },
  };
};

export const playTone = (tone: string, audioContext: AudioContext) => {
  const dtmfFrequencies: { [key: string]: [number, number] } = {
    "1": [697, 1209],
    "2": [697, 1336],
    "3": [697, 1477],
    "4": [770, 1209],
    "5": [770, 1336],
    "6": [770, 1477],
    "7": [852, 1209],
    "8": [852, 1336],
    "9": [852, 1477],
    "*": [941, 1209],
    "0": [941, 1336],
    "#": [941, 1477],
  };

  if (!audioContext) return;

  const toneFrequencies = dtmfFrequencies[tone];
  if (!toneFrequencies) return;
  const [lowFreq, highFreq] = toneFrequencies;
  const duration = 0.15; // Duration of the tone in seconds

  const oscillator1 = audioContext.createOscillator();
  oscillator1.type = "sine";
  oscillator1.frequency.setValueAtTime(lowFreq, audioContext.currentTime);

  const oscillator2 = audioContext.createOscillator();
  oscillator2.type = "sine";
  oscillator2.frequency.setValueAtTime(highFreq, audioContext.currentTime);

  const gainNode = audioContext.createGain();
  gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);

  oscillator1.connect(gainNode);
  oscillator2.connect(gainNode);
  gainNode.connect(audioContext.destination);

  oscillator1.start();
  oscillator2.start();
  oscillator1.stop(audioContext.currentTime + duration);
  oscillator2.stop(audioContext.currentTime + duration);
};

export const formatTime = (milliseconds: number): string => {
  const totalSeconds = Math.floor(milliseconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

export function isPhoneNumber(phone: string) {
  const cleanPhone = phone.replace(/\D/g, "");
  if (cleanPhone.length < 10 || cleanPhone.length > 15) {
    return false;
  }
  const phoneRegex = /^(\+?1?)?(\d{10}|\d{3}[-.\s]?\d{3}[-.\s]?\d{4})$/;
  return phoneRegex.test(phone);
}

export function isEmail(email: string) {
  const emailRegex =
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  if (!emailRegex.test(email) || email.length > 254) {
    return false;
  }
  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) {
    return false;
  }
  if (localPart.length > 64 || domain.length > 255) {
    return false;
  }
  if (!domain.includes(".")) {
    return false;
  }
  const domainParts = domain.split(".");
  const topLevelDomain = domainParts[domainParts.length - 1];
  if (!topLevelDomain || topLevelDomain.length < 2) {
    return false;
  }
  return true;
}

export function normalizePhoneNumber(input: string) {
  return normalizeNorthAmericanPhoneNumber(input);
}

export const handleNavlinkStyles = (isActive: boolean, isPending: boolean): string => {
  if (isActive) {
    return "rounded-md border-2 border-brand-secondary bg-brand-secondary px-2 py-1 font-Zilla-Slab text-sm font-semibold text-black transition-colors duration-150 ease-in-out dark:text-black";
  }

  if (isPending) {
    return "rounded-md bg-brand-tertiary border-2 border-zinc-400 px-2 py-1 font-Zilla-Slab text-sm font-semibold text-black transition-colors duration-150 ease-in-out dark:text-white";
  }

  return "rounded-md border-2 border-zinc-400 px-2 py-1 font-Zilla-Slab text-sm font-semibold text-black transition-colors duration-150 ease-in-out hover:bg-zinc-100 dark:text-white";
};

export function extractKeys(data: OutreachExportData[]) {
  const dynamicKeys = new Set<string>();
  const resultKeys = new Set<string>();
  const otherDataKeys = new Set<string>();

  data.forEach(row => {
    getAllKeys(row, "", dynamicKeys);
    getAllKeys(row.contact, "contact_", dynamicKeys);

    if (row.result && typeof row.result === "object") {
      Object.keys(row.result).forEach(key => resultKeys.add(key));
    }

    if (row.contact.other_data && Array.isArray(row.contact.other_data)) {
      row.contact.other_data.forEach((item, index) => {
        if (typeof item === "object" && item !== null) {
          getAllKeys(item, `other_data_${index}_`, otherDataKeys);
        }
      });
    }
  });

  return { dynamicKeys, resultKeys, otherDataKeys };
}

type FlattenedExportRow = Record<string, unknown> & {
  user_id?: string | null;
  created_at?: string;
  callcaster_id?: string | number;
  call_duration?: number;
  contact_other_data?: unknown;
  id?: unknown;
  contact_id?: unknown;
  attempt_id?: unknown;
};

type WorkspaceUserDataLike = { id: string; username: string };

export function flattenRow(row: OutreachExportData, users: WorkspaceUserDataLike[]) {
  const flattenedRow: FlattenedExportRow = {};
  getAllKeys(row, "", flattenedRow);
  getAllKeys(row.contact, "contact_", flattenedRow);

  const user = users.find(user => row.user_id === user.id);
  flattenedRow.user_id = user ? user.username : row.user_id;

  if (row.result && typeof row.result === "object") {
    getAllKeys(row.result, "result_", flattenedRow);
  }

  // Process other_data array
  if (row.contact?.other_data && Array.isArray(row.contact.other_data)) {
    row.contact.other_data.forEach((item: unknown, index: number) => {
      if (typeof item === "object" && item !== null) {
        Object.keys(item).forEach(key => {
          flattenedRow[`other_data_${index}_${key}`] = (item as Record<string, unknown>)[key];
        });
      }
    });
    delete flattenedRow.contact_other_data;
  }

  if ("id" in flattenedRow) {
    flattenedRow.attempt_id = flattenedRow.id;
    delete flattenedRow.id;
  }
  if ("contact_id" in flattenedRow) {
    const contactId = flattenedRow.contact_id;
    if (typeof contactId === "string" || typeof contactId === "number") {
      flattenedRow.callcaster_id = contactId;
    }
    delete flattenedRow.contact_id;
  }

  return flattenedRow;
}

export function generateCSVContent(headers: string[], data: Record<string, unknown>[]) {
  let csvContent = "\ufeff";
  csvContent += headers.map(escapeCSV).join(",") + "\n";

  data.forEach(row => {
    const csvRow = headers
      // Preserve 0/false; only treat null/undefined as empty.
      .map(header => escapeCSV(row[header] ?? ""))
      .join(",");
    csvContent += csvRow + "\n";
  });

  return csvContent;
}

export function getAllKeys(obj: unknown, prefix: string = "", target: Set<string> | Record<string, unknown> = new Set<string>()) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    return target;
  }

  const typedObj = obj as Record<string, unknown>;
  Object.keys(typedObj).forEach(key => {
    const value = typedObj[key];
    const fullKey = `${prefix}${key}`;
    
    if (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value)
    ) {
      // Recursively get keys for nested objects
      getAllKeys(value, `${fullKey}_`, target);
    } else {
      if (target instanceof Set) {
        target.add(fullKey);
      } else if (typeof target === "object") {
        target[fullKey] = value;
      }
    }
  });
  return target;
}

export function escapeCSV(field: unknown) {
  if (field == null) return "";
  const stringField = String(field);
  if (/[",\n]/.test(stringField)) {
    return `"${stringField.replace(/"/g, '""')}"`;
  }
  return stringField;
}

export const days = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

/**
 * Process template tags in message text by replacing them with contact data, supporting:
 * - {field} and {field|fallback}
 * - function calls like btoa(...), e.g. btoa({phone}:{external_id})
 * - arbitrary text and multiple tags inside function calls
 *
 * @param text - The message text containing template tags
 * @param contact - The contact object with field data
 * @returns The processed text with template tags replaced
 */
export function processTemplateTags(text: string, contact: Contact): string {
  if (!text || !contact) return text;

  // Helper to process {field} and {field|fallback} inside a string
  const processBraces = (input: string): string => {
    return input.replace(/\{\s*([a-zA-Z0-9_]+)(?:\|([^}]+))?\s*\}/g, (match, field, fallback) => {
      let value = '';
      switch (field) {
        case 'firstname':
          value = contact.firstname || '';
          break;
        case 'surname':
          value = contact.surname || '';
          break;
        case 'fullname':
          value = contact.fullname || `${contact.firstname || ''} ${contact.surname || ''}`.trim();
          break;
        case 'phone':
          value = contact.phone || '';
          break;
        case 'email':
          value = contact.email || '';
          break;
        case 'address':
          value = contact.address || '';
          break;
        case 'city':
          value = contact.city || '';
          break;
        case 'province':
          value = contact.province || '';
          break;
        case 'postal':
          value = contact.postal || '';
          break;
        case 'country':
          value = contact.country || '';
          break;
        case 'external_id':
          value = contact.external_id || '';
          break;
        default:
          value = '';
      }
      if (!value && typeof fallback === 'string') {
        return fallback.trim();
      }
      return value || '';
    });
  };

  // Process function calls like btoa(...)
  const processFunctions = (input: string): string => {
    // Support btoa(...) with nested {field} tags and text
    return input.replace(/btoa\(([^)]*)\)/g, (match, inner) => {
      const processed = processBraces(inner);
      try {
        return typeof window !== 'undefined' && window.btoa ? window.btoa(processed) : Buffer.from(processed, 'utf-8').toString('base64');
      } catch (e) {
        return '';
      }
    });
  };

  // First, process all function calls (which will process their inner {field} tags)
  let result = processFunctions(text);
  // Then, process any remaining {field} tags outside of function calls
  result = processBraces(result);
  return result;
}
