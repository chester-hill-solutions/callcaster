import { requireJsonAuth } from "@/lib/api-auth.server";
import { parseJsonBodyOrResponse } from "@/lib/api-parse.server";
import { resetPasswordBodySchema } from "@/lib/schemas/api/platform-auth";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { resetPassword } from "@/lib/platform-auth.server";
import type { ActionFunctionArgs } from "react-router";

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return jsonError("Method not allowed", 405);
  }

  const auth = await requireJsonAuth(request);
  if (auth instanceof Response) return auth;

  const parsed = await parseJsonBodyOrResponse(request, resetPasswordBodySchema);
  if (parsed instanceof Response) return parsed;

  const result = await resetPassword(request, parsed);
  if (!result.ok) {
    return jsonError(result.error, result.status);
  }

  return jsonResponse({ success: true }, 200);
}
