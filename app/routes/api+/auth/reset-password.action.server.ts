import { requireJsonAuth } from "@/lib/api-auth.server";
import { resetPasswordBodySchema } from "@/lib/schemas/api/platform-auth";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { resetPassword } from "@/lib/platform-auth.server";
import { rateLimitedPostAuth } from "@/lib/platform-auth-rate-limit.server";
import { defineAction } from "@/lib/handler.server";

export const action = defineAction({
  auth: async (args) =>
    (await rateLimitedPostAuth("auth:reset-password")(args)) ??
    requireJsonAuth(args.request),
  input: resetPasswordBodySchema,
  sideEffects: ["db-write"],
  handler: async ({ request, input }) => {
    const result = await resetPassword(request, input);
    if (!result.ok) {
      return jsonError(result.error, result.status);
    }

    return jsonResponse({ success: true }, 200);
  },
});
