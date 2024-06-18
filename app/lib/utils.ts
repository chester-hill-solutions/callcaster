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
  const trimmedHeaders = unparsedHeaders.map((header) =>
    header.toLowerCase().replace(/\W/g, ""),
  );
  console.log(trimmedHeaders);
  let parsedHeaders = {
    name: undefined,
    phone: undefined,
    address: undefined,
    email: undefined,
  };
  const regexChecks = {
    name: /name/,
    phone: /phone/,
    address: /address/,
    email: /email/,
  };
  for (let i = 0; i < trimmedHeaders.length; i++) {
    const header = trimmedHeaders[i];
    if (regexChecks.name.test(header)) {
      if (parsedHeaders["name"] != null) {
        const otherNameIndex = parsedHeaders["name"];
        console.log("first name index: ", otherNameIndex);
        if (/first/.test(header)) {
          parsedHeaders["name"] = [i, otherNameIndex];
        } else {
          // console.log("HERE");
          parsedHeaders["name"] = [otherNameIndex, i];
          console.log(parsedHeaders["name"]);
        }
      } else {
        //   console.log("HERE???");
        parsedHeaders["name"] = i;
      }
    }

    for (const check of Object.keys(regexChecks)) {
      if (check === "name") continue;
      if (regexChecks[check].test(header)) {
        parsedHeaders[check] = i;
      }
    }
  }
  console.log(parsedHeaders);
  return parsedHeaders;
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
