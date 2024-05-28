import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDateToLocale(dateFromSupabase: string) {
  const formattedDateTime = new Date(dateFromSupabase).toLocaleString();
  return formattedDateTime;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function formatTableText(unformatted: string): string {
  const pattern = new RegExp(/[,_/\- ]/g);
  const splitString = unformatted.split(pattern);
  const formatted = splitString.map((str) => capitalize(str)).join(" ");

  return formatted;
}
