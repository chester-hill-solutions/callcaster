import { forgotPasswordBodySchema } from "@/lib/schemas/api/platform-auth";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { forgotPassword } from "@/lib/platform-auth.server";
import { enforceAuthRateLimit } from "@/lib/platform-auth-rate-limit.server";
import { defineAction } from "@/lib/handler.server";

export const action = defineAction({
  auth: async ({ request }) => {
    if (request.method !== "POST") {
      return jsonError("Method not allowed", 405);
    }
    return (await enforceAuthRateLimit(request, "auth:forgot-password")) ?? undefined;
  },
  input: forgotPasswordBodySchema,
  sideEffects: ["email"],
  handler: async ({ request, input }) => {
    const result = await forgotPassword(request, input);
    if (!result.ok) {
      return jsonError(result.error, result.status);
    }

    return jsonResponse({ success: true }, 200);
  },
});
