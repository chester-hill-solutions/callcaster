import { z } from "zod";

export const NUMBER_SEARCH_MODES = [
  "areaCode",
  "province",
  "city",
  "postalCode",
  "contains",
] as const;

export type NumberSearchMode = (typeof NUMBER_SEARCH_MODES)[number];

const CA_PROVINCES = new Set([
  "AB",
  "BC",
  "MB",
  "NB",
  "NL",
  "NS",
  "NT",
  "NU",
  "ON",
  "PE",
  "QC",
  "SK",
  "YT",
]);

export const NUMBER_SEARCH_LIMIT = 20;

const baseQuerySchema = z.object({
  searchMode: z.enum(NUMBER_SEARCH_MODES).default("areaCode"),
  query: z.string().optional(),
  areaCode: z.string().optional(),
  voice: z.enum(["true", "false"]).optional(),
  sms: z.enum(["true", "false"]).optional(),
});

export type NumberSearchQuery = z.infer<typeof baseQuerySchema>;

export function buildNumberSearchListParams(
  input: NumberSearchQuery,
): { ok: true; listParams: Record<string, unknown> } | { ok: false; error: string } {
  const searchMode = input.searchMode;
  const query = (input.query ?? input.areaCode ?? "").trim();

  if (!query) {
    return { ok: false, error: "Enter a search value." };
  }

  const listParams: Record<string, unknown> = { limit: NUMBER_SEARCH_LIMIT };

  if (input.voice === "true") listParams.voiceEnabled = true;
  if (input.sms === "true") listParams.smsEnabled = true;

  switch (searchMode) {
    case "areaCode": {
      if (!/^\d{3}$/.test(query)) {
        return { ok: false, error: "Area code must be exactly 3 digits." };
      }
      listParams.areaCode = Number(query);
      break;
    }
    case "province": {
      const province = query.toUpperCase();
      if (!/^[A-Z]{2}$/.test(province) || !CA_PROVINCES.has(province)) {
        return {
          ok: false,
          error: "Province must be a valid 2-letter Canadian code (e.g. ON, BC).",
        };
      }
      listParams.inRegion = province;
      break;
    }
    case "city": {
      if (query.length < 2) {
        return { ok: false, error: "City name must be at least 2 characters." };
      }
      listParams.inLocality = query;
      break;
    }
    case "postalCode": {
      const normalized = query.replace(/\s+/g, " ").toUpperCase();
      if (!/^[A-Z]\d[A-Z](?:\s?\d[A-Z]\d)?$/.test(normalized)) {
        return {
          ok: false,
          error: "Postal code must be a valid Canadian format (e.g. M5H or M5H 2N2).",
        };
      }
      listParams.inPostalCode = normalized;
      break;
    }
    case "contains": {
      if (query.length < 2 || query.length > 16) {
        return {
          ok: false,
          error: "Number pattern must be between 2 and 16 characters.",
        };
      }
      listParams.contains = query;
      break;
    }
    default: {
      const _exhaustive: never = searchMode;
      return _exhaustive;
    }
  }

  return { ok: true, listParams };
}

export function parseNumberSearchRequest(
  params: URLSearchParams,
): { ok: true; listParams: Record<string, unknown> } | { ok: false; error: string } {
  const raw = Object.fromEntries(params.entries());
  const parsed = baseQuerySchema.safeParse(raw);
  if (!parsed.success) {
    const invalidMode = parsed.error.issues.some(
      (i) => i.path[0] === "searchMode",
    );
    return {
      ok: false,
      error: invalidMode ? "Invalid search mode." : "Invalid search parameters.",
    };
  }
  return buildNumberSearchListParams(parsed.data);
}
