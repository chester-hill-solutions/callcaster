export function parseOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Normalize Date/string timestamps for JSON API / UI string fields. */
export function timestampToIsoString(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value ?? "");
}

export function timestampToIsoStringOrNull(value: unknown): string | null {
  if (value == null || value === "") {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value);
}

export function parseJsonField<T>(value: unknown): T {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      throw new Error("Invalid JSON field");
    }
  }
  return value as T;
}

export function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && code === "23505";
}

/** Postgres invalid_text_representation — e.g. comparing uuid columns to non-uuid strings. */
export function isInvalidTextRepresentation(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && code === "22P02";
}
