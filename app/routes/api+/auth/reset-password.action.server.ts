import { resetPasswordBodySchema } from "@/lib/schemas/api/platform-auth";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { resetPassword } from "@/lib/platform-auth.server";
import { rateLimitedPostAuth } from "@/lib/platform-auth-rate-limit.server";
import { defineAction } from "@/lib/handler.server";

export const action = defineAction({
  // Public by design: the caller cannot sign in, and the reset token in the
  // body is the credential. Mirrors forgot-password.
  auth: rateLimitedPostAuth("auth:reset-password"),
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
