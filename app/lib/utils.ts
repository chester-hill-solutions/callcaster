import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

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

export const formatTime = (seconds: number): string => {
  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
};

export const formatTimeShort = (seconds: number): string => {
  const totalSeconds = Math.floor(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
};

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

export const handleNavlinkStyles = (isActive: boolean, isPending: boolean): string => {
  if (isActive) {
    return "rounded-md border-2 border-brand-secondary bg-brand-secondary px-2 py-1 font-Zilla-Slab text-sm font-semibold text-black transition-colors duration-150 ease-in-out dark:text-black";
  }

  if (isPending) {
    return "rounded-md bg-brand-tertiary border-2 border-zinc-400 px-2 py-1 font-Zilla-Slab text-sm font-semibold text-black transition-colors duration-150 ease-in-out dark:text-white";
  }

  return "rounded-md border-2 border-zinc-400 px-2 py-1 font-Zilla-Slab text-sm font-semibold text-black transition-colors duration-150 ease-in-out hover:bg-zinc-100 dark:text-white";
};

export const days = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

// Re-exports for backward compatibility. Implementations live in dedicated
// modules so `utils.ts` is no longer a grab-bag; callers can migrate to the
// canonical modules incrementally.
export { escapeCSV } from "@/lib/csv";
export { processTemplateTags } from "@/lib/message-templates";
export {
  normalizePhoneNumber,
  isPhoneNumber,
  isValidPhoneNumber,
  stripPhoneNumber,
  phoneRegex,
} from "@/lib/phone";
export { parseCSV } from "@/lib/csv-contacts";
export { playTone } from "@/lib/dtmf";
export {
  sortQueue,
  createHouseholdMap,
  updateAttemptWithCall,
} from "@/lib/queue-utils";
export { deepEqual } from "@/lib/deep-equal";
