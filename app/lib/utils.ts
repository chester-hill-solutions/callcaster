import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDateToLocale(dateFromSupabase: string) {
  const formattedDateTime = new Date(dateFromSupabase).toLocaleString();
  return formattedDateTime;
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function formatTableText(unformatted: string): string {
  const pattern = new RegExp(/[,_/\- ]/g);
  const splitString = unformatted.split(pattern);
  const formatted = splitString.map((str) => capitalize(str)).join(" ");

  return formatted;
}

export function deepEqual(obj1: any, obj2: any) {
  if (obj1 === obj2) return true;
  if (typeof obj1 !== "object" || typeof obj2 !== "object") return false;
  if (obj1 === null || obj2 === null) return false;
  if (Object.keys(obj1).length !== Object.keys(obj2).length) return false;

  for (let key of Object.keys(obj1)) {
    if (!deepEqual(obj1[key], obj2[key])) return false;
  }

  return true;
}

export const parseCSVHeaders = (unparsedHeaders) => {
  const parsedHeaders = unparsedHeaders.map((header) =>
    header.toLowerCase().trim(),
  );
  return parsedHeaders;
};
export const parseCSVData = (data, parsedHeaders) => {
  return data.slice(1).map((row) => {
    const contact = {
      firstname: undefined,
      surname: undefined,
      phone: undefined,
      email: undefined,
      address: undefined,
      city: undefined,
      opt_out: undefined,
      created_at: undefined,
      workspace: undefined,
      external_id: undefined,
      postal: undefined,
      other_data: [],
    };
    for (let i = 0; i < row.length; i++) {
      const key = parsedHeaders[i];
      const value = row[i]?.trim();
      if (
        key.match(
          /^(contact[-_\s]?)?(first[-_\s]?name|given[-_\s]?name|forename)$/i,
        )
      ) {
        contact.firstname = value;
      } else if (
        key.match(
          /^(contact[-_\s]?)?(last[-_\s]?name|surname|family[-_\s]?name)$/i,
        )
      ) {
        contact.surname = value;
      } else if (
        key.match(
          /^(contact[-_\s]?)?(phone|phone[-_\s]?number|mobile|mobile[-_\s]?number|cell|cell[-_\s]?phone)$/i,
        )
      ) {
        contact.phone = value;
      } else if (
        key.match(
          /^(contact[-_\s]?)?(email|email[-_\s]?address|e-mail|e-mail[-_\s]?address)$/i,
        )
      ) {
        contact.email = value;
      } else if (
        key.match(
          /^(contact[-_\s]?)?(address|street|street[-_\s]?address|mailing[-_\s]?address|property[-_\s]?address|address[-_\s]?line[-_\s]?1)$/i,
        )
      ) {
        contact.address = value;
      } else if (key.match(/^(contact[-_\s]?)?(city|town)$/i)) {
        contact.city = value;
      } else if (
        key.match(
          /^(contact[-_\s]?)?(opt[-_]?out|unsubscribe|do[-_\s]?not[-_\s]?contact)$/i,
        )
      ) {
        contact.opt_out = value?.toLowerCase() === "true";
      } else if (
        key.match(
          /^(contact[-_\s]?)?(external[-_]?id|vanid|van[-_]?id|id|record[-_\s]?id)$/i,
        )
      ) {
        contact.external_id = value;
      } else if (
        key.match(
          /^(contact[-_\s]?)?(postal|postal[-_]?code|zip|zip[-_]?code)$/i,
        )
      ) {
        contact.postal = value;
      } else if (key.match(/^(contact[-_\s]?)?(name)$/i)) {
        const names = value.split(",").map((name) => name.trim());
        contact.surname = names[0];
        contact.firstname = names[1];
      } else if (key.match(/^(contact[-_\s]?)?(province|state)$/i)) {
        contact.province = value;
      } else if (key.match(/^(contact[-_\s]?)?(country)$/i)) {
        contact.country = value;
      } else {
        contact.other_data.push({ [key]: value });
      }
    }
    return contact;
  });
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
