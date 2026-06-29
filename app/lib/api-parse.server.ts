import { data as routeData } from "react-router";
import type { ZodError, ZodType } from "zod";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
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

export function validationErrorResponse(
  error: ZodError,
  status = 400,
): ReturnType<typeof routeData> {
  return routeData({ error: formatZodError(error) }, { status });
}

function thrownToJsonResponse(thrown: unknown): Response {
  if (thrown instanceof Response) {
    return thrown;
  }

  if (
    thrown &&
    typeof thrown === "object" &&
    "data" in thrown &&
    ("init" in thrown || "type" in thrown)
  ) {
    const wrapped = thrown as {
      data: unknown;
      init?: number | { status?: number } | null;
    };
    const status =
      typeof wrapped.init === "number"
        ? wrapped.init
        : wrapped.init?.status ?? 400;
    return jsonResponse(wrapped.data, status);
  }

  return jsonError("Invalid JSON body", 400);
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
 * Like parseJsonBody but returns a JSON Response on validation/parse failure
 * instead of throwing route data objects.
 */
export async function parseJsonBodyOrResponse<T>(
  request: Request,
  schema: ZodType<T>,
): Promise<T | Response> {
  try {
    return await parseJsonBody(request, schema);
  } catch (thrown) {
    return thrownToJsonResponse(thrown);
  }
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
