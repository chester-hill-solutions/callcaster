import { parseJsonBodyOrResponse } from "@/lib/api-parse.server";
import { refreshBodySchema } from "@/lib/schemas/api/platform-auth";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { refreshTokens } from "@/lib/platform-auth.server";
import { rateLimitedPostAuth } from "@/lib/platform-auth-rate-limit.server";
import { defineAction } from "@/lib/handler.server";

export const action = defineAction({
  auth: rateLimitedPostAuth("auth:refresh"),
  sideEffects: ["external"],
  handler: async ({ request }) => {
    const parsed = await parseJsonBodyOrResponse(request, refreshBodySchema);
    if (parsed instanceof Response) return parsed;

    const result = await refreshTokens(request, parsed);
    if (!result.ok) {
      return jsonError(result.error, result.status);
    }

    return jsonResponse(result.data, 200);
  },
});
