import { parseJsonBodyOrResponse } from "@/lib/api-parse.server";
import { forgotPasswordBodySchema } from "@/lib/schemas/api/platform-auth";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { forgotPassword } from "@/lib/platform-auth.server";
import { enforceAuthRateLimit } from "@/lib/platform-auth-rate-limit.server";
import type { ActionFunctionArgs } from "react-router";

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return jsonError("Method not allowed", 405);
  }

  const rateLimited = enforceAuthRateLimit(request, "auth:forgot-password");
  if (rateLimited) return rateLimited;

  const parsed = await parseJsonBodyOrResponse(request, forgotPasswordBodySchema);
  if (parsed instanceof Response) return parsed;

  const result = await forgotPassword(request, parsed);
  if (!result.ok) {
    return jsonError(result.error, result.status);
  }

  return jsonResponse({ success: true }, 200);
}
