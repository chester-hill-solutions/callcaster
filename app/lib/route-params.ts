/**
 * Route params for integer-keyed rows (campaigns, scripts, audiences) arrive
 * as strings. Passing a malformed one straight into a query fails inside
 * the database driver and surfaces as "Unexpected Server Error" (#1682).
 * A malformed id is a 404: the row cannot exist.
 */
export function parsePositiveIntegerParam(value: string | undefined | null): number | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

/**
 * Returns the parsed id, or throws a real 404 Response. Throwing a Response
 * (not `data()`, not `AppError`) is what reaches the route's ErrorBoundary:
 * `withGuards` in handler.server.ts re-throws Responses and converts every
 * other throw into returned data. Pass the auth headers so a refreshed
 * session cookie is not dropped on the way out.
 */
export function requirePositiveIntegerParam(
  value: string | undefined | null,
  headers?: HeadersInit,
): number {
  const parsed = parsePositiveIntegerParam(value);
  if (parsed === null) {
    throw new Response(null, { status: 404, statusText: "Not Found", headers });
  }
  return parsed;
}
