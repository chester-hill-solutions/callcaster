import { parseJsonBodyOrResponse } from "@/lib/api-parse.server";
import { registerBodySchema } from "@/lib/schemas/api/platform-auth";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { registerUser } from "@/lib/platform-auth.server";
import { enforceAuthRateLimit } from "@/lib/platform-auth-rate-limit.server";
import { withIdempotency } from "@/lib/platform-idempotency.server";
import type { ActionFunctionArgs } from "react-router";

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return jsonError("Method not allowed", 405);
  }

  const rateLimited = enforceAuthRateLimit(request, "auth:register");
  if (rateLimited) return rateLimited;

  const parsed = await parseJsonBodyOrResponse(request, registerBodySchema);
  if (parsed instanceof Response) return parsed;

  return withIdempotency(request, "auth:register", async () => {
    const result = await registerUser(request, parsed);
    if (!result.ok) {
      return {
        response: jsonError(result.error, result.status),
        body: { error: result.error },
      };
    }
    const response = jsonResponse(result.data, 201);
    return { response, body: result.data };
  });
}
