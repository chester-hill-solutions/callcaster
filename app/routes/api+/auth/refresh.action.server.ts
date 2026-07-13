import { parseJsonBodyOrResponse } from "@/lib/api-parse.server";
import { refreshBodySchema } from "@/lib/schemas/api/platform-auth";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { refreshTokens } from "@/lib/platform-auth.server";
import { enforceAuthRateLimit } from "@/lib/platform-auth-rate-limit.server";
import { defineAction } from "@/lib/handler.server";
import type { ActionFunctionArgs } from "react-router";

export const action = defineAction({
  auth: ({ request }: ActionFunctionArgs) => {
    if (request.method !== "POST") {
      return jsonError("Method not allowed", 405);
    }
    return enforceAuthRateLimit(request, "auth:refresh") ?? undefined;
  },
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
