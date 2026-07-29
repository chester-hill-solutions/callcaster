import { parseJsonBodyOrResponse } from "@/lib/api-parse.server";
import { verifyEmailBodySchema } from "@/lib/schemas/api/platform-auth";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { verifyEmailOtp } from "@/lib/platform-auth.server";
import { enforceAuthRateLimit } from "@/lib/platform-auth-rate-limit.server";
import { defineAction } from "@/lib/handler.server";

export const action = defineAction({
  auth: async ({ request }) => {
    if (request.method !== "POST") {
      return jsonError("Method not allowed", 405);
    }
    return (await enforceAuthRateLimit(request, "auth:verify-email")) ?? undefined;
  },
  sideEffects: ["db-write"],
  handler: async ({ request }) => {
    const parsed = await parseJsonBodyOrResponse(request, verifyEmailBodySchema);
    if (parsed instanceof Response) return parsed;

    const result = await verifyEmailOtp(request, parsed);
    if (!result.ok) {
      return jsonError(result.error, result.status);
    }

    return jsonResponse(result.data, 200);
  },
});
