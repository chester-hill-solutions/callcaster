import { parseJsonBodyOrResponse } from "@/lib/api-parse.server";
import { tokenBodySchema } from "@/lib/schemas/api/platform-auth";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { tokenLogin } from "@/lib/platform-auth.server";
import { enforceAuthRateLimit } from "@/lib/platform-auth-rate-limit.server";
import { defineAction } from "@/lib/handler.server";
import type { ActionFunctionArgs } from "react-router";

export const action = defineAction({
  auth: async ({ request }: ActionFunctionArgs) => {
    if (request.method !== "POST") {
      return jsonError("Method not allowed", 405);
    }
    return (await enforceAuthRateLimit(request, "auth:token")) ?? undefined;
  },
  sideEffects: ["external"],
  handler: async ({ request }) => {
    const parsed = await parseJsonBodyOrResponse(request, tokenBodySchema);
    if (parsed instanceof Response) return parsed;

    const result = await tokenLogin(request, parsed);
    if (!result.ok) {
      return jsonError(result.error, result.status);
    }

    return jsonResponse(result.data, 200);
  },
});
