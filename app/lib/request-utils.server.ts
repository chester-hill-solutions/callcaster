/**
 * Request parsing and error-handling utilities for route actions/loaders.
 *
 * Relocated out of the former `database.server.ts` re-export barrel; these are
 * plain HTTP request helpers with no database coupling.
 */
import { data as routeData } from "react-router";
import { logger } from "./logger.server";

export const parseRequestData = async (request: Request) => {
  const contentType = request.headers.get("Content-Type") ?? "";
  if (!contentType) return;
  if (contentType.includes("application/json")) {
    return await request.json();
  } else if (contentType.startsWith("application/x-www-form-urlencoded")) {
    const formData = await request.formData();
    return Object.fromEntries(formData);
  }
  throw new Error("Unsupported content type");
};

function formDataToObject(formData: FormData): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    // FormData entries are `string | File`. `instanceof` rejects a union with a
    // primitive as its left operand, so narrow on the primitive instead.
    const v = typeof value === "string" ? String(value) : value;
    if (key in result) {
      const existing = result[key];
      if (Array.isArray(existing)) {
        existing.push(v);
      } else {
        result[key] = [existing, v];
      }
    } else {
      result[key] = v;
    }
  }
  return result;
}

/**
 * Parse JSON request body safely. On malformed JSON or empty body, throws a
 * Response with status 400 instead of letting SyntaxError bubble.
 */
export async function safeParseJson<T = Record<string, unknown>>(
  request: Request,
): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch (e) {
    if (e instanceof SyntaxError) {
      throw routeData({ error: "Invalid JSON" }, { status: 400 });
    }
    throw e;
  }
}

/**
 * Parse action request body as either JSON or FormData.
 * Use when the action may receive either Content-Type from fetchers or forms.
 * FormData with duplicate keys (e.g. contact_ids[]) is collected into arrays.
 * Malformed JSON returns 400 via safeParseJson.
 */
export const parseActionRequest = async (
  request: Request,
): Promise<Record<string, unknown>> => {
  const contentType = request.headers.get("Content-Type") ?? "";
  if (contentType.includes("application/json")) {
    return await safeParseJson(request);
  }
  const formData = await request.formData();
  return formDataToObject(formData);
};

export const handleError = (error: Error, message: string, status = 500) => {
  logger.error(`${message}:`, error);
  return routeData({ error: message }, { status });
};
