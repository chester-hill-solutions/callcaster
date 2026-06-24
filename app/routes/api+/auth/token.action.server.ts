import { parseJsonBodyOrResponse } from "@/lib/api-parse.server";
import { tokenBodySchema } from "@/lib/schemas/api/platform-auth";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { tokenLogin } from "@/lib/platform-auth.server";
import { enforceAuthRateLimit } from "@/lib/platform-auth-rate-limit.server";
import type { ActionFunctionArgs } from "react-router";

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return jsonError("Method not allowed", 405);
  }

  const rateLimited = enforceAuthRateLimit(request, "auth:token");
  if (rateLimited) return rateLimited;

  const parsed = await parseJsonBodyOrResponse(request, tokenBodySchema);
  if (parsed instanceof Response) return parsed;

  const result = await tokenLogin(request, parsed);
  if (!result.ok) {
    return jsonError(result.error, result.status);
  }

  return jsonResponse(result.data, 200);
}
