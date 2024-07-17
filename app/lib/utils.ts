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

export const isRecent = (date: string): boolean => {
  const created = new Date(date);
  const now = new Date();
  return (now.getTime() - created.getTime()) / 3600000 < 24;
};


export function deepEqual(obj1: any, obj2: any, path: string = 'root', seen = new WeakMap()): boolean {
  function log(message: string) {
   // console.log(`[${path}] ${message}`);
  }

  if (obj1 === obj2) return true;
  if (obj1 == null || obj2 == null) {
    log(`One value is null or undefined: ${obj1} !== ${obj2}`);
    return false;
  }
  if (typeof obj1 !== 'object' && typeof obj2 !== 'object') {
    if (obj1 !== obj2) {
      log(`Primitive values differ at ${path}: ${obj1} !== ${obj2}`);
    }
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
    return obj1.every((item, index) => deepEqual(item, obj2[index], `${path}[${index}]`, seen));
  }

  if (seen.get(obj1) === obj2) return true;
  seen.set(obj1, obj2);

  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);

  if (keys1.length !== keys2.length) {
    log(`Number of keys differ: ${keys1.length} !== ${keys2.length}`);
    const extraKeys1 = keys1.filter(key => !keys2.includes(key));
    const extraKeys2 = keys2.filter(key => !keys1.includes(key));
    if (extraKeys1.length) log(`Extra keys in first object: ${extraKeys1.join(', ')}`);
    if (extraKeys2.length) log(`Extra keys in second object: ${extraKeys2.join(', ')}`);
    return false;
  }

  return keys1.every(key => {
    if (!Object.prototype.hasOwnProperty.call(obj2, key)) {
      log(`Second object doesn't have key: ${key}`);
      return false;
    }
    return deepEqual(obj1[key], obj2[key], `${path}.${key}`, seen);
  });
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
export const sortQueue = (queue: QueueItem[]): QueueItem[] => {
  return [...queue].sort((a, b) => {
    if (a.attempts !== b.attempts) {
      return b.attempts - a.attempts;
    }
    if (a.id !== b.id) {
      return a.id - b.id;
    }
    return a.queue_order - b.queue_order;
  });
};

export const createHouseholdMap = (queue: QueueItem[]): Record<string, QueueItem[]> => {
  return queue.reduce<Record<string, QueueItem[]>>((acc, curr, index) => {
    if (curr?.contact?.address) {
      if (!acc[curr.contact.address]) {
        acc[curr.contact.address] = [];
      }
      acc[curr.contact.address].push(curr);
    } else {
      acc[`NO_ADDRESS_${index}`] = [curr];
    }
    return acc;
  }, {});
};

export const updateAttemptWithCall = (attempt: Attempt, call: Call): Attempt => {
  return {
    ...attempt,
    result: {
      ...attempt.result,
      ...(call && call.status && call.direction !== "outbound-api" && { status: call.status }),
    },
  };
};