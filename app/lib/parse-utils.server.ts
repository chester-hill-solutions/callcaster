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

/**
 * Postgres/PostgREST error codes we branch on. Never compare these literals
 * inline at call sites — Drizzle wraps the driver error in a DrizzleQueryError
 * whose Postgres code lives on `error.cause`, so a direct `error.code === ...`
 * check silently misses every ORM-wrapped error. Use the helpers below;
 * `check:pg-errors` enforces this.
 */
export const PG_ERROR_CODES = {
  UNIQUE_VIOLATION: "23505",
  FOREIGN_KEY_VIOLATION: "23503",
  INVALID_TEXT_REPRESENTATION: "22P02",
  POSTGREST_NOT_FOUND: "PGRST116",
} as const;

/**
 * Returns the first string `code` found on the error or anywhere down its
 * `cause` chain (DrizzleQueryError nests the raw Postgres error there).
 */
export function getPostgresErrorCode(error: unknown): string | null {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string") {
      return code;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

export function isUniqueViolation(error: unknown): boolean {
  return getPostgresErrorCode(error) === PG_ERROR_CODES.UNIQUE_VIOLATION;
}

export function isForeignKeyViolation(error: unknown): boolean {
  return getPostgresErrorCode(error) === PG_ERROR_CODES.FOREIGN_KEY_VIOLATION;
}

/** Postgres invalid_text_representation — e.g. comparing uuid columns to non-uuid strings. */
export function isInvalidTextRepresentation(error: unknown): boolean {
  return getPostgresErrorCode(error) === PG_ERROR_CODES.INVALID_TEXT_REPRESENTATION;
}

/** Our internal "row not found" sentinel (PostgREST-era code, still used as a signal). */
export function isNotFoundError(error: unknown): boolean {
  return getPostgresErrorCode(error) === PG_ERROR_CODES.POSTGREST_NOT_FOUND;
}
