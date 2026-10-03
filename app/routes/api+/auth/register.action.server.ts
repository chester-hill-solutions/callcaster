import { parseJsonBodyOrResponse } from "@/lib/api-parse.server";
import { registerBodySchema } from "@/lib/schemas/api/platform-auth";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { registerUser } from "@/lib/platform-auth.server";
import { rateLimitedPostAuth } from "@/lib/platform-auth-rate-limit.server";
import { defineAction } from "@/lib/handler.server";

export const action = defineAction({
  auth: rateLimitedPostAuth("auth:register"),
  sideEffects: ["db-write", "email"],
  handler: async ({ request }) => {
    const parsed = await parseJsonBodyOrResponse(request, registerBodySchema);
    if (parsed instanceof Response) return parsed;

    // A public email and retry key do not prove ownership of a signup session.
    const result = await registerUser(request, parsed);
    if (!result.ok) return jsonError(result.error, result.status);
    return jsonResponse(result.data, 201);
  },
});
