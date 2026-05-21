import { data as routeData } from "react-router";
import type { ZodError, ZodType } from "zod";
import { parseActionRequest, safeParseJson } from "@/lib/database.server";

export function formatZodError(error: ZodError): string {
  const message = error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "body";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
  return message || "Validation failed";
}

export function validationErrorResponse(error: ZodError, status = 400): Response {
  return routeData({ error: formatZodError(error) }, { status });
}

/**
 * Parse JSON request body with a Zod schema.
 * Malformed JSON still throws via safeParseJson (400 Invalid JSON).
 */
export async function parseJsonBody<T>(
  request: Request,
  schema: ZodType<T>,
): Promise<T> {
  const raw = await safeParseJson(request);
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw validationErrorResponse(result.error);
  }
  return result.data;
}

/**
 * Parse URL search params with a Zod schema (flat string map).
 */
export function parseSearchParams<T>(
  searchParams: URLSearchParams,
  schema: ZodType<T>,
): { ok: true; data: T } | { ok: false; error: string } {
  const raw = Object.fromEntries(searchParams.entries());
  const result = schema.safeParse(raw);
  if (!result.success) {
    return { ok: false, error: formatZodError(result.error) };
  }
  return { ok: true, data: result.data };
}

/**
 * Parse JSON or form body (parseActionRequest) with a Zod schema.
 */
export async function parseActionBody<T>(
  request: Request,
  schema: ZodType<T>,
): Promise<T> {
  const raw = await parseActionRequest(request);
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw validationErrorResponse(result.error);
  }
  return result.data;
}
